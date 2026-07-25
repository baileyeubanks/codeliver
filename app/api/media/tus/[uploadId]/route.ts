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
import { apiJson } from "@/lib/api/responses";
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

function tusJson(error: string, code: string, status: number) {
  return apiJson({ error, code }, { status, headers: tusHeaders() });
}

type RouteParams = { params: Promise<{ uploadId: string }> };

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: tusHeaders() });
}

/**
 * HEAD — Return current upload offset so client knows where to resume.
 */
async function readLegacyUpload(
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
async function appendLegacyUpload(
  req: NextRequest,
  { params }: RouteParams
) {
  const { uploadId } = await params;
  const user = await requireAuth();
  if (!user) {
    return tusJson("Unauthorized", "UNAUTHORIZED", 401);
  }

  const tusVersion = req.headers.get("tus-resumable");
  if (tusVersion !== TUS_VERSION) {
    return tusJson(
      "Unsupported tus version",
      "TUS_VERSION_UNSUPPORTED",
      412,
    );
  }

  const contentType = req.headers.get("content-type");
  if (contentType !== "application/offset+octet-stream") {
    return tusJson(
      "Content-Type must be application/offset+octet-stream",
      "INVALID_CONTENT_TYPE",
      415,
    );
  }

  const upload = getUpload(uploadId);
  if (!upload) {
    return tusJson("Upload not found", "UPLOAD_NOT_FOUND", 404);
  }

  if (upload.userId !== user.id) {
    return tusJson("Forbidden", "UPLOAD_FORBIDDEN", 403);
  }

  if (upload.completed) {
    return tusJson("Upload already completed", "UPLOAD_STATE", 409);
  }

  const clientOffset = parseInt(
    req.headers.get("upload-offset") ?? "-1",
    10
  );
  if (clientOffset < 0) {
    return tusJson(
      "Upload-Offset header required",
      "INVALID_UPLOAD_OFFSET",
      400,
    );
  }

  if (clientOffset !== upload.offset) {
    return tusJson(
      "Upload offset does not match server state",
      "UPLOAD_OFFSET",
      409,
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
  } catch {
    return tusJson(
      "Upload storage is unavailable",
      "STORAGE_UNAVAILABLE",
      503,
    );
  }
}

/**
 * DELETE — Cancel and clean up an in-progress upload.
 * Implements tus termination extension.
 */
async function removeLegacyUpload(
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

export async function HEAD(
  request: NextRequest,
  context: RouteParams,
) {
  try {
    return await readLegacyUpload(request, context);
  } catch {
    // HEAD responses are bodyless by protocol; the status still fails closed.
    return new NextResponse(null, { status: 503, headers: tusHeaders() });
  }
}

export async function PATCH(
  request: NextRequest,
  context: RouteParams,
) {
  try {
    return await appendLegacyUpload(request, context);
  } catch {
    return tusJson(
      "Upload service is unavailable",
      "BACKEND_UNAVAILABLE",
      503,
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteParams,
) {
  try {
    return await removeLegacyUpload(request, context);
  } catch {
    // TUS termination responses remain bodyless while still avoiding a 500.
    return new NextResponse(null, { status: 503, headers: tusHeaders() });
  }
}
