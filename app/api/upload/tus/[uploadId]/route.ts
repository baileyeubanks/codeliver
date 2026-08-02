import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth";
import { createSupabaseAuth } from "@/lib/supabase-auth";
import {
  assertBoundMediaIngestSession,
  cancelMediaIngestBeforeCleanup,
  isCoProductionMediaIngestAuthority,
  mapMediaIngestRouteError,
  mediaIngestClientState,
  mediaIngestPublicationReady,
  readBoundMediaIngestAuthority,
  reconcileBoundMediaIngestProgress,
  recordObservedMediaIngestProgress,
  runMediaIngestPublicationGate,
  type MediaIngestRouteClient,
} from "@/lib/media-pipeline/ingest-route-integration";
import type { MediaIngestRecord } from "@/lib/media-pipeline/ingest-authority";
import { readStorageConfig } from "@/lib/storage/config";
import { createDefaultUploadOrchestrator } from "@/lib/tus/orchestrator";
import type { UploadSessionReleaseReadiness } from "@/lib/tus/orchestrator";
import { UploadOrchestrationError } from "@/lib/tus/errors";
import type { UploadSession } from "@/lib/tus/session";
import {
  parseUploadChecksum,
  TUS_VERSION,
  tusHeaders,
} from "@/lib/tus/protocol";
import {
  ensureCatalogAsset,
  jsonMediaIngestUploadError,
  jsonUploadError,
  mapUploadError,
  requireOwnedUploadTarget,
  requestBodyChunks,
} from "@/app/api/upload/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ uploadId: string }> };

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return tusHeaders(readStorageConfig().maxUploadBytes, extra);
}

function sessionHeaders(
  session: UploadSession,
  release: UploadSessionReleaseReadiness,
  authority?: MediaIngestRecord
): Record<string, string> {
  if (authority) {
    const authorityReady = mediaIngestPublicationReady(authority);
    const publicationReady = authorityReady && session.state === "committed";
    const authorityState = mediaIngestClientState(authority);
    const derivativeState =
      authority.transcodeState === "ready"
        ? "ready"
        : authority.transcodeState === "failed"
          ? "error"
          : authority.transcodeState === "blocked"
            ? "blocked"
            : "pending";
    return headers({
      "Upload-Offset": String(authority.uploadOffset),
      "Upload-Length": String(authority.size),
      "Upload-State":
        authorityState === "committed" && !publicationReady
          ? "processing"
          : authorityState,
      "Upload-Derivative-State": derivativeState,
      "Upload-Original-Ready": String(publicationReady),
      "Upload-Signed-Delivery-Ready": "false",
      ...(publicationReady && session.assetId
        ? { "Upload-Asset": JSON.stringify({ id: session.assetId }) }
        : {}),
    });
  }
  return headers({
    "Upload-Offset": String(session.offset),
    "Upload-Length": String(session.size),
    "Upload-State": session.state,
    "Upload-Derivative-State": release.derivativeState,
    "Upload-Original-Ready": String(release.originalReady),
    "Upload-Signed-Delivery-Ready": String(release.signedDeliveryReady),
    ...(session.computedSha256 ? { "Upload-SHA256": session.computedSha256 } : {}),
    ...(session.assetId
      ? { "Upload-Asset": JSON.stringify({ id: session.assetId }) }
      : {}),
  });
}

async function attachCatalogIfCommitted(
  orchestrator: ReturnType<typeof createDefaultUploadOrchestrator>,
  session: UploadSession,
  userId: string,
  sessionTenantId: string = userId
): Promise<UploadSession> {
  if (session.state !== "committed") return session;
  try {
    await ensureCatalogAsset(orchestrator, session, userId);
    return (await orchestrator.getSession(session.id, sessionTenantId)) ?? session;
  } catch (error) {
    console.error("[upload] Asset catalog attachment pending:", error);
    return session;
  }
}

async function attachCatalogIfPublicationEligible(
  orchestrator: ReturnType<typeof createDefaultUploadOrchestrator>,
  session: UploadSession,
  authority: MediaIngestRecord,
  userId: string,
  tenantKey: string
): Promise<UploadSession> {
  if (session.state !== "committed" || !mediaIngestPublicationReady(authority)) {
    return session;
  }
  return runMediaIngestPublicationGate(authority, () =>
    attachCatalogIfCommitted(orchestrator, session, userId, tenantKey)
  );
}

async function requireBoundAuthority(
  orchestrator: ReturnType<typeof createDefaultUploadOrchestrator>,
  uploadId: string,
  userId: string,
  recover: boolean
): Promise<{
  session: UploadSession;
  authority: MediaIngestRecord;
  authorityClient: MediaIngestRouteClient;
  tenantKey: string;
}> {
  const context = await orchestrator.getAuthorityContext(uploadId);
  if (!context?.authoritySessionId) {
    throw new UploadOrchestrationError("UPLOAD_NOT_FOUND", "Upload not found");
  }
  const target = await requireOwnedUploadTarget(
    userId,
    context.projectId,
    context.folderId ?? undefined
  );
  const tenantKey = target.tenantAuthority.key;
  const session = recover
    ? await orchestrator.recoverSession(uploadId, tenantKey)
    : await orchestrator.getSession(uploadId, tenantKey);
  if (!session) {
    throw new UploadOrchestrationError("UPLOAD_NOT_FOUND", "Upload not found");
  }
  const authorityClient =
    (await createSupabaseAuth()) as unknown as MediaIngestRouteClient;
  const currentAuthority = await readBoundMediaIngestAuthority(authorityClient, {
    tenantKey,
    projectId: target.projectId,
    authoritySessionId: context.authoritySessionId,
  });
  assertBoundMediaIngestSession(session, currentAuthority);
  const authority = await reconcileBoundMediaIngestProgress(authorityClient, {
    tenantKey,
    session,
    authority: currentAuthority,
  });
  return { session, authority, authorityClient, tenantKey };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: headers() });
}

export async function HEAD(_request: NextRequest, { params }: RouteParams) {
  const responseHeaders = headers();
  let authorityRequired = false;
  try {
    authorityRequired = isCoProductionMediaIngestAuthority();
    const user = await requireAuth();
    if (!user) return new NextResponse(null, { status: 401, headers: responseHeaders });
    const { uploadId } = await params;
    const orchestrator = createDefaultUploadOrchestrator();
    if (authorityRequired) {
      const bound = await requireBoundAuthority(
        orchestrator,
        uploadId,
        user.id,
        true
      );
      const session = await attachCatalogIfPublicationEligible(
        orchestrator,
        bound.session,
        bound.authority,
        user.id,
        bound.tenantKey
      );
      return new NextResponse(null, {
        status: 200,
        headers: sessionHeaders(
          session,
          orchestrator.releaseReadiness(session),
          bound.authority
        ),
      });
    }
    let session = await orchestrator.recoverSession(uploadId, user.id);
    if (!session) return new NextResponse(null, { status: 404, headers: responseHeaders });
    session = await attachCatalogIfCommitted(orchestrator, session, user.id);
    return new NextResponse(null, {
      status: 200,
      headers: sessionHeaders(session, orchestrator.releaseReadiness(session)),
    });
  } catch (error) {
    const mapped = authorityRequired
      ? mapMediaIngestRouteError(error)
      : mapUploadError(error);
    return new NextResponse(null, {
      status: mapped.status,
      headers: {
        ...responseHeaders,
        ...(mapped.retryAfter ? { "Retry-After": mapped.retryAfter } : {}),
      },
    });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const responseHeaders = headers();
  let authorityRequired = false;
  try {
    authorityRequired = isCoProductionMediaIngestAuthority();
    const user = await requireAuth();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: responseHeaders }
      );
    }
    if (request.headers.get("tus-resumable") !== TUS_VERSION) {
      return NextResponse.json(
        { error: "Unsupported tus version" },
        { status: 412, headers: responseHeaders }
      );
    }
    if (request.headers.get("content-type") !== "application/offset+octet-stream") {
      return NextResponse.json(
        { error: "Content-Type must be application/offset+octet-stream" },
        { status: 415, headers: responseHeaders }
      );
    }

    const rawOffset = request.headers.get("upload-offset");
    if (!rawOffset || !/^(0|[1-9][0-9]*)$/.test(rawOffset)) {
      return NextResponse.json(
        { error: "Upload-Offset must be a non-negative integer" },
        { status: 400, headers: responseHeaders }
      );
    }
    const offset = Number(rawOffset);
    if (!Number.isSafeInteger(offset)) {
      return NextResponse.json(
        { error: "Upload-Offset exceeds the safe integer range" },
        { status: 400, headers: responseHeaders }
      );
    }

    const config = readStorageConfig();
    const contentLength = request.headers.get("content-length");
    if (
      contentLength &&
      /^\d+$/.test(contentLength) &&
      BigInt(contentLength) > config.maxChunkBytes
    ) {
      return NextResponse.json(
        { error: "Upload part exceeds the chunk limit" },
        { status: 413, headers: responseHeaders }
      );
    }

    const { uploadId } = await params;
    const orchestrator = createDefaultUploadOrchestrator();
    if (authorityRequired) {
      const bound = await requireBoundAuthority(
        orchestrator,
        uploadId,
        user.id,
        false
      );
      if (bound.session.offset !== offset) {
        throw new UploadOrchestrationError(
          "UPLOAD_OFFSET",
          "Upload offset does not match"
        );
      }
      const result = await orchestrator.appendPart({
        uploadId,
        tenantId: bound.tenantKey,
        offset,
        chunks: requestBodyChunks(request),
        expectedPartSha256: parseUploadChecksum(
          request.headers.get("upload-checksum")
        ),
      });
      const observedChunkSha256 = result.session.lastPartSha256;
      if (
        !observedChunkSha256 ||
        result.session.lastPartOffset !== offset ||
        result.session.offset <= offset
      ) {
        throw new UploadOrchestrationError(
          "UPLOAD_STATE",
          "Upload progress evidence is unavailable"
        );
      }
      const authority = await recordObservedMediaIngestProgress(
        bound.authorityClient,
        {
          tenantKey: bound.tenantKey,
          authoritySessionId: bound.authority.id,
          expectedOffset: offset,
          nextOffset: result.session.offset,
          chunkSha256: observedChunkSha256,
        }
      );
      const session = await attachCatalogIfPublicationEligible(
        orchestrator,
        result.session,
        authority,
        user.id,
        bound.tenantKey
      );
      return new NextResponse(null, {
        status: 204,
        headers: sessionHeaders(
          session,
          orchestrator.releaseReadiness(session),
          authority
        ),
      });
    }
    const result = await orchestrator.appendPart({
      uploadId,
      tenantId: user.id,
      offset,
      chunks: requestBodyChunks(request),
      expectedPartSha256: parseUploadChecksum(
        request.headers.get("upload-checksum")
      ),
    });
    const session = await attachCatalogIfCommitted(
      orchestrator,
      result.session,
      user.id
    );
    return new NextResponse(null, {
      status: 204,
      headers: sessionHeaders(session, orchestrator.releaseReadiness(session)),
    });
  } catch (error) {
    return authorityRequired
      ? jsonMediaIngestUploadError(error, responseHeaders)
      : jsonUploadError(error, responseHeaders);
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const responseHeaders = headers();
  let authorityRequired = false;
  try {
    authorityRequired = isCoProductionMediaIngestAuthority();
    const user = await requireAuth();
    if (!user) return new NextResponse(null, { status: 401, headers: responseHeaders });
    const { uploadId } = await params;
    if (authorityRequired) {
      const orchestrator = createDefaultUploadOrchestrator();
      const bound = await requireBoundAuthority(
        orchestrator,
        uploadId,
        user.id,
        false
      );
      await cancelMediaIngestBeforeCleanup(
        bound.authorityClient,
        {
          tenantKey: bound.tenantKey,
          authoritySessionId: bound.authority.id,
        },
        () => orchestrator.abort(uploadId, bound.tenantKey)
      );
      return new NextResponse(null, { status: 204, headers: responseHeaders });
    }
    await createDefaultUploadOrchestrator().abort(uploadId, user.id);
    return new NextResponse(null, { status: 204, headers: responseHeaders });
  } catch (error) {
    return authorityRequired
      ? jsonMediaIngestUploadError(error, responseHeaders)
      : jsonUploadError(error, responseHeaders);
  }
}
