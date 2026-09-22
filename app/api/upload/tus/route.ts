import { NextRequest, NextResponse } from "next/server";
import { apiJson } from "@/lib/api/responses";

import { requireAuth } from "@/lib/auth";
import { readStorageConfig } from "@/lib/storage/config";
import { createDefaultUploadOrchestrator } from "@/lib/tus/orchestrator";
import {
  parseUploadMetadata,
  TUS_VERSION,
  tusHeaders,
} from "@/lib/tus/protocol";
import {
  assertUploadStorageConfigured,
  jsonUploadError,
  requireOwnedUploadTarget,
  requireOwnedRevisionUploadTarget,
} from "@/app/api/upload/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return tusHeaders(readStorageConfig().maxUploadBytes, { "Cache-Control": "no-store", ...extra });
}

function tusError(error: string, code: string, status: number, responseHeaders: Record<string, string>) {
  return apiJson({ error, code }, { status, headers: responseHeaders });
}

function parseUploadLength(value: string | null): number {
  if (!value || !/^[1-9][0-9]*$/.test(value)) {
    throw new Error("Upload-Length must be a positive integer");
  }
  const parsed = BigInt(value);
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Upload-Length exceeds the safe integer range");
  }
  return Number(parsed);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: headers() });
}

export async function POST(request: NextRequest) {
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

    const uploadLength = parseUploadLength(request.headers.get("upload-length"));
    const metadata = parseUploadMetadata(request.headers.get("upload-metadata"));
    const projectId = metadata.projectId;
    const idempotencyKey = metadata.idempotencyKey;
    if (!projectId || !idempotencyKey) {
      return tusError("projectId and idempotencyKey metadata are required", "INVALID_UPLOAD_METADATA", 400, responseHeaders);
    }
    const assetId = metadata.assetId;
    const expectedCurrentVersionId = metadata.expectedCurrentVersionId;
    const filename = metadata.filename || "upload.bin";
    const mimeType = metadata.filetype || "application/octet-stream";
    if (Boolean(assetId) !== Boolean(expectedCurrentVersionId)) {
      return tusError(
        "assetId and expectedCurrentVersionId metadata are required together",
        "INVALID_UPLOAD_METADATA",
        400,
        responseHeaders,
      );
    }
    const orchestrator = createDefaultUploadOrchestrator();
    const recoveredRevision = assetId && expectedCurrentVersionId
      ? await orchestrator.recoverAttachedRevisionSession({
          tenantId: user.id,
          projectId,
          idempotencyKey,
          filename,
          mimeType,
          size: uploadLength,
          assetId,
          expectedCurrentVersionId,
          expectedSha256: metadata.sha256,
        })
      : null;
    if (recoveredRevision) {
      return new NextResponse(null, {
        status: 201,
        headers: headers({
          Location: `/api/upload/tus/${recoveredRevision.id}`,
          "Upload-Offset": String(recoveredRevision.offset),
          "Upload-State": recoveredRevision.state,
          "X-Upload-Resumed": "true",
        }),
      });
    }

    const revisionTarget = assetId && expectedCurrentVersionId
      ? await requireOwnedRevisionUploadTarget(
          user.id,
          projectId,
          assetId,
          expectedCurrentVersionId,
          filename,
        )
      : null;
    if (!revisionTarget && metadata.version !== undefined && metadata.version !== "1") {
      return tusError(
        "Initial uploads must create V1",
        "INVALID_UPLOAD_METADATA",
        400,
        responseHeaders,
      );
    }
    if (!revisionTarget) {
      await requireOwnedUploadTarget(user.id, projectId, metadata.folderId);
    }

    const result = await orchestrator.createSession({
      tenantId: user.id,
      projectId,
      folderId: revisionTarget ? undefined : metadata.folderId,
      idempotencyKey,
      filename,
      mimeType,
      size: uploadLength,
      version: revisionTarget?.version ?? 1,
      assetId,
      expectedCurrentVersionId,
      expectedSha256: metadata.sha256,
    });

    return new NextResponse(null, {
      status: 201,
      headers: headers({
        Location: `/api/upload/tus/${result.session.id}`,
        "Upload-Offset": String(result.session.offset),
        "Upload-State": result.session.state,
        "X-Upload-Resumed": String(result.resumed),
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Upload-Length")) {
      return tusError("Upload-Length is invalid", "INVALID_UPLOAD_LENGTH", 400, responseHeaders);
    }
    return jsonUploadError(error, responseHeaders);
  }
}
