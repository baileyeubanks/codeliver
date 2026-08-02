/**
 * Tus Upload — Per-Upload Endpoints
 *
 * HEAD   /api/media/tus/:uploadId — Get upload offset (resume point)
 * PATCH  /api/media/tus/:uploadId — Append chunk data
 * DELETE /api/media/tus/:uploadId — Cancel / terminate upload
 *
 * Implements tus v1.0.0 core + termination extension.
 */

import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { getProjectAccess } from "@/lib/access-control";
import { requireAuth } from "@/lib/auth";
import {
  CO_PRODUCTION_DATA_SCHEMA,
  getSupabaseDataSchema,
} from "@/lib/data-authority";
import { getSupabase } from "@/lib/supabase";
import {
  getUpload,
  appendChunk,
  finalizeUpload,
  deleteUpload,
  type TusUploadMeta,
} from "@/lib/tus/store";

const TUS_VERSION = "1.0.0";
const MEDIA_WORKER_TOKEN_HEADER = "x-codeliver-media-worker-token";

class LegacyTusAuthorityError extends Error {
  readonly status: 403 | 503;

  constructor(message: string, status: 403 | 503) {
    super(message);
    this.status = status;
  }
}

function authorizedUploadService(req: NextRequest): boolean {
  const expected = process.env.CODELIVER_MEDIA_PIPELINE_WORKER_TOKEN;
  const supplied = req.headers.get(MEDIA_WORKER_TOKEN_HEADER);
  if (!expected || !supplied) return false;

  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return (
    expectedBytes.length === suppliedBytes.length &&
    timingSafeEqual(expectedBytes, suppliedBytes)
  );
}

async function requireUploadAuthority(
  req: NextRequest,
  user: Awaited<ReturnType<typeof requireAuth>>,
  upload: TusUploadMeta
): Promise<void> {
  if (!upload.projectId) {
    if (!authorizedUploadService(req)) {
      throw new LegacyTusAuthorityError(
        "Projectless upload requires service authorization",
        403
      );
    }
    return;
  }

  if (!user || upload.userId !== user.id) {
    throw new LegacyTusAuthorityError("Forbidden", 403);
  }

  const supabase = getSupabase();
  const projectAccess = await getProjectAccess(
    upload.projectId,
    user.id,
    "editor",
    supabase
  );
  if (!projectAccess.ok || projectAccess.data.id !== upload.projectId) {
    throw new LegacyTusAuthorityError(
      "Project is unavailable for upload",
      !projectAccess.ok && projectAccess.status >= 500 ? 503 : 403
    );
  }

  if (!upload.folderId) return;
  const folder = await supabase
    .from("folders")
    .select("id, project_id")
    .eq("id", upload.folderId)
    .eq("project_id", upload.projectId)
    .maybeSingle();
  if (folder.error) {
    throw new LegacyTusAuthorityError(
      "Upload folder authority is unavailable",
      503
    );
  }
  if (!folder.data) {
    throw new LegacyTusAuthorityError(
      "Folder is unavailable for upload",
      403
    );
  }
}

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

function legacyTusClosed(): boolean {
  return getSupabaseDataSchema() === CO_PRODUCTION_DATA_SCHEMA;
}

function legacyTusClosedResponse() {
  return NextResponse.json(
    { error: "Upload endpoint is unavailable" },
    { status: 404, headers: tusHeaders() }
  );
}

type RouteParams = { params: Promise<{ uploadId: string }> };

export async function OPTIONS() {
  if (legacyTusClosed()) return legacyTusClosedResponse();
  return new NextResponse(null, { status: 204, headers: tusHeaders() });
}

/**
 * HEAD — Return current upload offset so client knows where to resume.
 */
export async function HEAD(
  req: NextRequest,
  { params }: RouteParams
) {
  if (legacyTusClosed()) {
    return new NextResponse(null, { status: 404, headers: tusHeaders() });
  }
  const { uploadId } = await params;
  const user = await requireAuth();
  if (!user && !authorizedUploadService(req)) {
    return new NextResponse(null, { status: 401, headers: tusHeaders() });
  }

  const upload = getUpload(uploadId);
  if (!upload) {
    return new NextResponse(null, { status: 404, headers: tusHeaders() });
  }

  try {
    await requireUploadAuthority(req, user, upload);
  } catch (error) {
    if (error instanceof LegacyTusAuthorityError) {
      return new NextResponse(null, {
        status: error.status,
        headers: tusHeaders(),
      });
    }
    throw error;
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
  if (legacyTusClosed()) return legacyTusClosedResponse();
  const { uploadId } = await params;
  const user = await requireAuth();
  if (!user && !authorizedUploadService(req)) {
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

  try {
    await requireUploadAuthority(req, user, upload);
  } catch (error) {
    if (error instanceof LegacyTusAuthorityError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status, headers: tusHeaders() }
      );
    }
    throw error;
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
    await requireUploadAuthority(req, user, getUpload(uploadId) ?? upload);
    const { offset, complete } = appendChunk(
      uploadId,
      Buffer.from(body),
      clientOffset
    );

    // If upload is now complete, finalize (move to NAS, create asset record)
    let asset = null;
    if (complete) {
      try {
        await requireUploadAuthority(req, user, getUpload(uploadId) ?? upload);
        const result = await finalizeUpload(uploadId);
        asset = result.asset;
      } catch (err) {
        if (err instanceof LegacyTusAuthorityError) throw err;
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
    if (err instanceof LegacyTusAuthorityError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.status, headers: tusHeaders() }
      );
    }
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
  req: NextRequest,
  { params }: RouteParams
) {
  if (legacyTusClosed()) {
    return new NextResponse(null, { status: 404, headers: tusHeaders() });
  }
  const { uploadId } = await params;
  const user = await requireAuth();
  if (!user && !authorizedUploadService(req)) {
    return new NextResponse(null, { status: 401, headers: tusHeaders() });
  }

  const upload = getUpload(uploadId);
  if (!upload) {
    return new NextResponse(null, { status: 404, headers: tusHeaders() });
  }

  try {
    await requireUploadAuthority(req, user, upload);
  } catch (error) {
    if (error instanceof LegacyTusAuthorityError) {
      return new NextResponse(null, {
        status: error.status,
        headers: tusHeaders(),
      });
    }
    throw error;
  }

  deleteUpload(uploadId);
  return new NextResponse(null, { status: 204, headers: tusHeaders() });
}
