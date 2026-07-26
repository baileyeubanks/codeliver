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
    if (metadata.version !== undefined && metadata.version !== "1") {
      return tusError(
        "Initial uploads must create V1",
        "INVALID_UPLOAD_METADATA",
        400,
        responseHeaders,
      );
    }
    await requireOwnedUploadTarget(user.id, projectId, metadata.folderId);

    const orchestrator = createDefaultUploadOrchestrator();
    const result = await orchestrator.createSession({
      tenantId: user.id,
      projectId,
      folderId: metadata.folderId,
      idempotencyKey,
      filename: metadata.filename || "upload.bin",
      mimeType: metadata.filetype || "application/octet-stream",
      size: uploadLength,
      version: 1,
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
