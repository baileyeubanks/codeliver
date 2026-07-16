/**
 * Tus Upload — Creation Endpoint
 *
 * POST /api/media/tus — Create a new resumable upload
 * OPTIONS /api/media/tus — CORS preflight + tus discovery
 *
 * Implements tus v1.0.0 creation extension:
 * https://tus.io/protocols/resumable-upload#creation
 */

import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { getProjectAccess } from "@/lib/access-control";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { createUpload } from "@/lib/tus/store";

const TUS_VERSION = "1.0.0";
const TUS_EXTENSIONS = "creation,creation-with-upload,termination";
const MAX_SIZE = 12 * 1024 * 1024 * 1024; // 12 GB
const MEDIA_WORKER_TOKEN_HEADER = "x-codeliver-media-worker-token";
const LEGACY_UPLOAD_SERVICE_PRINCIPAL = "service:media-pipeline";

class LegacyTusAuthorityError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 503
  ) {
    super(message);
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

function optionalMetadataText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

async function requireProjectUploadTarget(
  projectId: string,
  userId: string,
  folderId?: string
): Promise<{ projectId: string; folderId?: string }> {
  const supabase = getSupabase();
  const projectAccess = await getProjectAccess(
    projectId,
    userId,
    "editor",
    supabase
  );
  if (!projectAccess.ok) {
    throw new LegacyTusAuthorityError(
      "Project is unavailable for upload",
      projectAccess.status >= 500 ? 503 : 403
    );
  }

  if (!folderId) return { projectId: projectAccess.data.id };

  const folder = await supabase
    .from("folders")
    .select("id, project_id")
    .eq("id", folderId)
    .eq("project_id", projectAccess.data.id)
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

  return { projectId: projectAccess.data.id, folderId: folder.data.id };
}

function authorityErrorResponse(error: LegacyTusAuthorityError) {
  return NextResponse.json(
    { error: error.message },
    { status: error.status, headers: tusHeaders() }
  );
}

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
  const serviceAuthorized = authorizedUploadService(req);
  if (!user && !serviceAuthorized) {
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

  const requestedProjectId = optionalMetadataText(metadata.projectId);
  const requestedFolderId = optionalMetadataText(metadata.folderId);
  let authorizedProjectId: string | undefined;
  let authorizedFolderId: string | undefined;

  if (requestedProjectId) {
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: tusHeaders() }
      );
    }
    try {
      const target = await requireProjectUploadTarget(
        requestedProjectId,
        user.id,
        requestedFolderId
      );
      authorizedProjectId = target.projectId;
      authorizedFolderId = target.folderId;
    } catch (error) {
      if (error instanceof LegacyTusAuthorityError) {
        return authorityErrorResponse(error);
      }
      throw error;
    }
  } else {
    if (!serviceAuthorized) {
      return NextResponse.json(
        { error: "Projectless upload requires service authorization" },
        { status: 403, headers: tusHeaders() }
      );
    }
    if (requestedFolderId) {
      return NextResponse.json(
        { error: "folderId requires projectId metadata" },
        { status: 400, headers: tusHeaders() }
      );
    }
  }

  const upload = createUpload({
    filename: metadata.filename || `upload-${Date.now()}`,
    filetype: metadata.filetype || "application/octet-stream",
    size: uploadLength,
    projectId: authorizedProjectId,
    folderId: authorizedFolderId,
    userId: user?.id ?? LEGACY_UPLOAD_SERVICE_PRINCIPAL,
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
        if (upload.projectId && user) {
          try {
            await requireProjectUploadTarget(
              upload.projectId,
              user.id,
              upload.folderId
            );
          } catch (error) {
            if (error instanceof LegacyTusAuthorityError) {
              return authorityErrorResponse(error);
            }
            throw error;
          }
        } else if (!upload.projectId && !authorizedUploadService(req)) {
          return NextResponse.json(
            { error: "Projectless upload requires service authorization" },
            { status: 403, headers: tusHeaders() }
          );
        }
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
