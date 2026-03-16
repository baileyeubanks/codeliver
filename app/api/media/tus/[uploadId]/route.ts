/**
 * Tus Upload — Per-Upload Endpoints
 *
 * HEAD   /api/media/tus/:uploadId — Get upload offset (resume point)
 * PATCH  /api/media/tus/:uploadId — Append chunk data
 * DELETE /api/media/tus/:uploadId — Cancel / terminate upload
 *
 * Implements tus v1.0.0 core + termination extension.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  getUpload,
  appendChunk,
  finalizeUpload,
  deleteUpload,
} from "@/lib/tus/store";

const TUS_VERSION = "1.0.0";

function tusHeaders(extra: Record<string, string> = {}) {
  return {
    "Tus-Resumable": TUS_VERSION,
    "Cache-Control": "no-store",
    "Access-Control-Expose-Headers":
      "Upload-Offset, Upload-Length, Tus-Resumable",
    "Access-Control-Allow-Headers":
      "Content-Type, Upload-Offset, Upload-Length, Upload-Metadata, Tus-Resumable, X-Requested-With",
    "Access-Control-Allow-Methods": "HEAD, PATCH, DELETE, OPTIONS",
    ...extra,
  };
}

type RouteParams = { params: Promise<{ uploadId: string }> };

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: tusHeaders() });
}

/**
 * HEAD — Return current upload offset so client knows where to resume.
 */
export async function HEAD(
  _req: NextRequest,
  { params }: RouteParams
) {
  const { uploadId } = await params;
  const user = await requireAuth();
  if (!user) {
    return new NextResponse(null, { status: 401, headers: tusHeaders() });
  }

  const upload = getUpload(uploadId);
  if (!upload) {
    return new NextResponse(null, { status: 404, headers: tusHeaders() });
  }

  // Only the upload creator can resume
  if (upload.userId !== user.id) {
    return new NextResponse(null, { status: 403, headers: tusHeaders() });
  }

  return new NextResponse(null, {
    status: 200,
    headers: tusHeaders({
      "Upload-Offset": String(upload.offset),
      "Upload-Length": String(upload.size),
    }),
  });
}

/**
 * PATCH — Append bytes at the given offset.
 * Content-Type must be application/offset+octet-stream.
 */
export async function PATCH(
  req: NextRequest,
  { params }: RouteParams
) {
  const { uploadId } = await params;
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

  const contentType = req.headers.get("content-type");
  if (contentType !== "application/offset+octet-stream") {
    return NextResponse.json(
      { error: "Content-Type must be application/offset+octet-stream" },
      { status: 415, headers: tusHeaders() }
    );
  }

  const upload = getUpload(uploadId);
  if (!upload) {
    return NextResponse.json(
      { error: "Upload not found" },
      { status: 404, headers: tusHeaders() }
    );
  }

  if (upload.userId !== user.id) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: tusHeaders() }
    );
  }

  if (upload.completed) {
    return NextResponse.json(
      { error: "Upload already completed" },
      { status: 409, headers: tusHeaders() }
    );
  }

  const clientOffset = parseInt(
    req.headers.get("upload-offset") ?? "-1",
    10
  );
  if (clientOffset < 0) {
    return NextResponse.json(
      { error: "Upload-Offset header required" },
      { status: 400, headers: tusHeaders() }
    );
  }

  if (clientOffset !== upload.offset) {
    return NextResponse.json(
      { error: `Offset conflict: server at ${upload.offset}` },
      { status: 409, headers: tusHeaders() }
    );
  }

  try {
    const body = await req.arrayBuffer();
    const { offset, complete } = appendChunk(
      uploadId,
      Buffer.from(body),
      clientOffset
    );

    // If upload is now complete, finalize (move to NAS, create asset record)
    let asset = null;
    if (complete) {
      try {
        const result = await finalizeUpload(uploadId);
        asset = result.asset;
      } catch (err) {
        console.error("[tus] Finalize error:", err);
        // Upload is saved — finalization can be retried
      }
    }

    const extraHeaders: Record<string, string> = {
      "Upload-Offset": String(offset),
    };

    if (complete && asset) {
      extraHeaders["Upload-Asset"] = JSON.stringify(asset);
    }

    return new NextResponse(null, {
      status: 204,
      headers: tusHeaders(extraHeaders),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Chunk write failed";
    const status = msg.includes("mismatch") ? 409 : 500;
    return NextResponse.json(
      { error: msg },
      { status, headers: tusHeaders() }
    );
  }
}

/**
 * DELETE — Cancel and clean up an in-progress upload.
 * Implements tus termination extension.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: RouteParams
) {
  const { uploadId } = await params;
  const user = await requireAuth();
  if (!user) {
    return new NextResponse(null, { status: 401, headers: tusHeaders() });
  }

  const upload = getUpload(uploadId);
  if (!upload) {
    return new NextResponse(null, { status: 404, headers: tusHeaders() });
  }

  if (upload.userId !== user.id) {
    return new NextResponse(null, { status: 403, headers: tusHeaders() });
  }

  deleteUpload(uploadId);
  return new NextResponse(null, { status: 204, headers: tusHeaders() });
}
