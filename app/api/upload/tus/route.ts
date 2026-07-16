import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth";
import { readStorageConfig } from "@/lib/storage/config";
import { createDefaultUploadOrchestrator } from "@/lib/tus/orchestrator";
import {
  parseUploadMetadata,
  TUS_VERSION,
  tusHeaders,
} from "@/lib/tus/protocol";
import {
  jsonUploadError,
  requireOwnedUploadTarget,
} from "@/app/api/upload/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return tusHeaders(readStorageConfig().maxUploadBytes, extra);
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

    const uploadLength = parseUploadLength(request.headers.get("upload-length"));
    const metadata = parseUploadMetadata(request.headers.get("upload-metadata"));
    const projectId = metadata.projectId;
    const idempotencyKey = metadata.idempotencyKey;
    if (!projectId || !idempotencyKey) {
      return NextResponse.json(
        { error: "projectId and idempotencyKey metadata are required" },
        { status: 400, headers: responseHeaders }
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
      version: metadata.version ? Number(metadata.version) : 1,
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
      return NextResponse.json(
        { error: error.message },
        { status: 400, headers: responseHeaders }
      );
    }
    return jsonUploadError(error, responseHeaders);
  }
}
