/**
 * Tus Upload — Creation Endpoint
 *
 * POST /api/media/tus — Create a new resumable upload
 * OPTIONS /api/media/tus — CORS preflight + tus discovery
 *
 * Implements tus v1.0.0 creation extension:
 * https://tus.io/protocols/resumable-upload#creation
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createUpload } from "@/lib/tus/store";

const TUS_VERSION = "1.0.0";
const TUS_EXTENSIONS = "creation,creation-with-upload,termination";
const MAX_SIZE = 12 * 1024 * 1024 * 1024; // 12 GB

function tusHeaders(extra: Record<string, string> = {}) {
  return {
    "Tus-Resumable": TUS_VERSION,
    "Tus-Version": TUS_VERSION,
    "Tus-Extension": TUS_EXTENSIONS,
    "Tus-Max-Size": String(MAX_SIZE),
    "Access-Control-Expose-Headers":
      "Location, Upload-Offset, Upload-Length, Tus-Resumable, Tus-Version, Tus-Extension, Tus-Max-Size",
    "Access-Control-Allow-Headers":
      "Content-Type, Upload-Offset, Upload-Length, Upload-Metadata, Tus-Resumable, X-Requested-With",
    "Access-Control-Allow-Methods": "POST, HEAD, PATCH, DELETE, OPTIONS",
    ...extra,
  };
}

/** Parse tus Upload-Metadata header (key base64val, key base64val, ...) */
function parseUploadMetadata(
  header: string | null
): Record<string, string> {
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const pair of header.split(",")) {
    const [key, b64val] = pair.trim().split(/\s+/);
    if (key) {
      result[key] = b64val
        ? Buffer.from(b64val, "base64").toString("utf-8")
        : "";
    }
  }
  return result;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: tusHeaders() });
}

export async function POST(req: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: tusHeaders() }
    );
  }

  const tusVersion = req.headers.get("tus-resumable");
  if (tusVersion !== TUS_VERSION) {
    return NextResponse.json(
      { error: "Unsupported tus version" },
      { status: 412, headers: tusHeaders() }
    );
  }

  const uploadLength = parseInt(
    req.headers.get("upload-length") ?? "0",
    10
  );
  if (!uploadLength || uploadLength <= 0) {
    return NextResponse.json(
      { error: "Upload-Length required" },
      { status: 400, headers: tusHeaders() }
    );
  }
  if (uploadLength > MAX_SIZE) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_SIZE} bytes)` },
      { status: 413, headers: tusHeaders() }
    );
  }

  const metadata = parseUploadMetadata(
    req.headers.get("upload-metadata")
  );

  const upload = createUpload({
    filename: metadata.filename || `upload-${Date.now()}`,
    filetype: metadata.filetype || "application/octet-stream",
    size: uploadLength,
    projectId: metadata.projectId,
    folderId: metadata.folderId,
    userId: user.id,
  });

  const location = `/api/media/tus/${upload.id}`;

  // Support creation-with-upload: if request has a body, treat as first PATCH
  const contentType = req.headers.get("content-type");
  if (contentType === "application/offset+octet-stream") {
    const body = await req.arrayBuffer();
    if (body.byteLength > 0) {
      const { appendChunk } = await import("@/lib/tus/store");
      const { offset, complete } = appendChunk(
        upload.id,
        Buffer.from(body),
        0
      );
      if (complete) {
        const { finalizeUpload } = await import("@/lib/tus/store");
        await finalizeUpload(upload.id);
      }
      return new NextResponse(null, {
        status: 201,
        headers: tusHeaders({
          Location: location,
          "Upload-Offset": String(offset),
        }),
      });
    }
  }

  return new NextResponse(null, {
    status: 201,
    headers: tusHeaders({
      Location: location,
      "Upload-Offset": "0",
    }),
  });
}
