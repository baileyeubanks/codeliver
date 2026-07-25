import { NextRequest, NextResponse } from "next/server";
import { apiJson } from "@/lib/api/responses";

import { requireAuth } from "@/lib/auth";
import { readStorageConfig } from "@/lib/storage/config";
import { createDefaultUploadOrchestrator } from "@/lib/tus/orchestrator";
import type { UploadSessionReleaseReadiness } from "@/lib/tus/orchestrator";
import type { UploadSession } from "@/lib/tus/session";
import {
  parseUploadChecksum,
  TUS_VERSION,
  tusHeaders,
} from "@/lib/tus/protocol";
import {
  assertUploadStorageConfigured,
  ensureCatalogAsset,
  jsonUploadError,
  mapUploadError,
  requestBodyChunks,
} from "@/app/api/upload/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ uploadId: string }> };

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return tusHeaders(readStorageConfig().maxUploadBytes, { "Cache-Control": "no-store", ...extra });
}

function tusError(error: string, code: string, status: number, responseHeaders: Record<string, string>) {
  return apiJson({ error, code }, { status, headers: responseHeaders });
}

function sessionHeaders(
  session: UploadSession,
  release: UploadSessionReleaseReadiness
): Record<string, string> {
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
  userId: string
): Promise<UploadSession> {
  if (session.state !== "committed") return session;
  try {
    await ensureCatalogAsset(orchestrator, session, userId);
    return (await orchestrator.getSession(session.id, userId)) ?? session;
  } catch (error) {
    console.error("[upload] Asset catalog attachment pending:", error);
    return session;
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: headers() });
}

export async function HEAD(_request: NextRequest, { params }: RouteParams) {
  const responseHeaders = headers();
  try {
    const user = await requireAuth();
    if (!user) return new NextResponse(null, { status: 401, headers: responseHeaders });
    assertUploadStorageConfigured(readStorageConfig());
    const { uploadId } = await params;
    const orchestrator = createDefaultUploadOrchestrator();
    let session = await orchestrator.recoverSession(uploadId, user.id);
    if (!session) return new NextResponse(null, { status: 404, headers: responseHeaders });
    session = await attachCatalogIfCommitted(orchestrator, session, user.id);
    return new NextResponse(null, {
      status: 200,
      headers: sessionHeaders(session, orchestrator.releaseReadiness(session)),
    });
  } catch (error) {
    const mapped = mapUploadError(error);
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
  try {
    const user = await requireAuth();
    if (!user) {
      return tusError("Unauthorized", "UNAUTHORIZED", 401, responseHeaders);
    }
    if (request.headers.get("tus-resumable") !== TUS_VERSION) {
      return tusError("Unsupported tus version", "TUS_VERSION_UNSUPPORTED", 412, responseHeaders);
    }
    assertUploadStorageConfigured(readStorageConfig());
    if (request.headers.get("content-type") !== "application/offset+octet-stream") {
      return tusError("Content-Type must be application/offset+octet-stream", "INVALID_CONTENT_TYPE", 415, responseHeaders);
    }

    const rawOffset = request.headers.get("upload-offset");
    if (!rawOffset || !/^(0|[1-9][0-9]*)$/.test(rawOffset)) {
      return tusError("Upload-Offset must be a non-negative integer", "INVALID_UPLOAD_OFFSET", 400, responseHeaders);
    }
    const offset = Number(rawOffset);
    if (!Number.isSafeInteger(offset)) {
      return tusError("Upload-Offset exceeds the safe integer range", "INVALID_UPLOAD_OFFSET", 400, responseHeaders);
    }

    const config = readStorageConfig();
    const contentLength = request.headers.get("content-length");
    if (
      contentLength &&
      /^\d+$/.test(contentLength) &&
      BigInt(contentLength) > config.maxChunkBytes
    ) {
      return tusError("Upload part exceeds the chunk limit", "UPLOAD_PART_TOO_LARGE", 413, responseHeaders);
    }

    const { uploadId } = await params;
    const orchestrator = createDefaultUploadOrchestrator();
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
    return jsonUploadError(error, responseHeaders);
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const responseHeaders = headers();
  try {
    const user = await requireAuth();
    if (!user) return new NextResponse(null, { status: 401, headers: responseHeaders });
    assertUploadStorageConfigured(readStorageConfig());
    const { uploadId } = await params;
    await createDefaultUploadOrchestrator().abort(uploadId, user.id);
    return new NextResponse(null, { status: 204, headers: responseHeaders });
  } catch (error) {
    return jsonUploadError(error, responseHeaders);
  }
}
