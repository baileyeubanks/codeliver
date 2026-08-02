import { randomUUID, timingSafeEqual } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

import { NextRequest, NextResponse } from "next/server";

import { getProjectAccess } from "@/lib/access-control";
import { requireAuth } from "@/lib/auth";
import { resolveTrustedSurfaceRole } from "@/lib/auth/host-surface";
import {
  ensureMediaDirectory,
  requireCanonicalMediaRoot,
  SafeMediaPathError,
  sanitizeMediaFilename,
} from "@/lib/storage/safe-media-path";
import { getSupabase } from "@/lib/supabase";

/**
 * NAS Media Upload API - Legacy / Small-File Fallback
 *
 * POST /api/media/upload - multipart/form-data
 *   - file: the media file
 *   - folder/folderId: project folder ID, or a service-only projectless path
 *   - projectId: project receiving the asset record
 */

const LEGACY_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
const LEGACY_UPLOAD_MAX_REQUEST_BYTES = LEGACY_UPLOAD_MAX_BYTES + 1024 * 1024;
const RESUMABLE_UPLOAD_URL = "/api/media/tus";
const MAX_CREATE_ATTEMPTS = 20;
const MAX_UPLOAD_FILENAME_LENGTH = 180;
const MEDIA_WORKER_TOKEN_HEADER = "x-codeliver-media-worker-token";
const LEGACY_ASSET_RETURN_COLUMNS =
  "id, project_id, folder_id, title, file_type, file_url, status, nas_path, file_size, uploaded_by, created_at";

class LegacyUploadRequestTooLargeError extends Error {}

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

function optionalFormText(entry: FormDataEntryValue | null): string | null {
  if (typeof entry !== "string") return null;
  const value = entry.trim();
  return value || null;
}

function allowlistedAssetRow(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  return {
    id: row.id,
    project_id: row.project_id,
    folder_id: row.folder_id,
    title: row.title,
    file_type: row.file_type,
    file_url: row.file_url,
    status: row.status,
    nas_path: row.nas_path,
    file_size: row.file_size,
    uploaded_by: row.uploaded_by,
    created_at: row.created_at,
  };
}

function resumableUploadResponse(status: 411 | 413, code: string) {
  return NextResponse.json(
    {
      error: `Legacy upload is limited to ${LEGACY_UPLOAD_MAX_BYTES / (1024 * 1024)} MiB. Use the resumable upload endpoint.`,
      code,
      maxBytes: LEGACY_UPLOAD_MAX_BYTES,
      resumableUploadUrl: RESUMABLE_UPLOAD_URL,
    },
    { status }
  );
}

function parseContentLength(req: NextRequest): number | null {
  const raw = req.headers.get("content-length");
  if (!raw || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

async function readBoundedUploadBody(
  req: NextRequest
): Promise<Uint8Array<ArrayBuffer>> {
  if (!req.body) return new Uint8Array(0);

  const reader = req.body.getReader();
  const buffer: Uint8Array<ArrayBuffer> = new Uint8Array(
    LEGACY_UPLOAD_MAX_REQUEST_BYTES
  );
  let offset = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (offset + value.byteLength > LEGACY_UPLOAD_MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new LegacyUploadRequestTooLargeError();
      }
      buffer.set(value, offset);
      offset += value.byteLength;
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }

  return buffer.subarray(0, offset);
}

function collisionFilename(fileName: string): string {
  const extension = extname(fileName);
  const suffix = `-${randomUUID()}`;
  const stem = extension
    ? fileName.slice(0, -extension.length)
    : fileName;
  const boundedStem =
    stem.slice(
      0,
      Math.max(1, MAX_UPLOAD_FILENAME_LENGTH - extension.length - suffix.length)
    ) || "upload";
  return `${boundedStem}${suffix}${extension}`;
}

async function createFileWithoutOverwrite(
  directory: string,
  preferredName: string,
  contents: Buffer
): Promise<{ absolutePath: string; fileName: string }> {
  for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt += 1) {
    const fileName =
      attempt === 0 ? preferredName : collisionFilename(preferredName);
    const absolutePath = join(directory, fileName);

    try {
      await writeFile(absolutePath, contents, { flag: "wx", mode: 0o600 });
      return { absolutePath, fileName };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }

  throw new Error("Unable to allocate an upload filename");
}

function mediaStorageError(error: unknown) {
  if (!(error instanceof SafeMediaPathError)) return null;
  if (
    error.code === "MEDIA_ROOT_UNCONFIGURED" ||
    error.code === "MEDIA_ROOT_UNAVAILABLE"
  ) {
    return NextResponse.json(
      {
        error: "Media storage is not configured or unavailable.",
        code: "MEDIA_STORAGE_UNAVAILABLE",
      },
      { status: 503 }
    );
  }
  return NextResponse.json(
    { error: "Invalid media folder.", code: "MEDIA_PATH_INVALID" },
    { status: 403 }
  );
}

export async function POST(req: NextRequest) {
  const user = await requireAuth();
  const serviceAuthorized = authorizedUploadService(req);
  if (!user && !serviceAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (
    user &&
    !serviceAuthorized &&
    resolveTrustedSurfaceRole(user) !== "staff"
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const contentLength = parseContentLength(req);
  if (contentLength === null) {
    return resumableUploadResponse(411, "LEGACY_UPLOAD_LENGTH_REQUIRED");
  }
  if (contentLength > LEGACY_UPLOAD_MAX_REQUEST_BYTES) {
    return resumableUploadResponse(413, "LEGACY_UPLOAD_TOO_LARGE");
  }

  let mediaRoot: string;
  try {
    mediaRoot = await requireCanonicalMediaRoot();
  } catch (error) {
    return (
      mediaStorageError(error) ??
      NextResponse.json({ error: "Media storage is unavailable." }, { status: 503 })
    );
  }

  let formData: FormData;
  try {
    const body = await readBoundedUploadBody(req);
    const headers = new Headers(req.headers);
    headers.delete("content-length");
    formData = await new Request(req.url, {
      method: "POST",
      headers,
      body,
    }).formData();
  } catch (error) {
    if (error instanceof LegacyUploadRequestTooLargeError) {
      return resumableUploadResponse(413, "LEGACY_UPLOAD_TOO_LARGE");
    }
    return NextResponse.json(
      { error: "Invalid multipart upload." },
      { status: 400 }
    );
  }

  const fileEntry = formData.get("file");
  if (!(fileEntry instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (fileEntry.size > LEGACY_UPLOAD_MAX_BYTES) {
    return resumableUploadResponse(413, "LEGACY_UPLOAD_TOO_LARGE");
  }

  const folder = optionalFormText(formData.get("folder"));
  const explicitFolderId = optionalFormText(formData.get("folderId"));
  const projectId = optionalFormText(formData.get("projectId"));

  if (folder && explicitFolderId && folder !== explicitFolderId) {
    return NextResponse.json(
      { error: "Conflicting folder metadata" },
      { status: 400 }
    );
  }

  let authorizedProjectId: string | null = null;
  let authorizedFolderId: string | null = null;
  let supabase: ReturnType<typeof getSupabase> | null = null;

  if (projectId) {
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (resolveTrustedSurfaceRole(user) !== "staff") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    supabase = getSupabase();
    const projectAccess = await getProjectAccess(
      projectId,
      user.id,
      "editor",
      supabase
    );
    if (!projectAccess.ok) {
      return NextResponse.json(
        { error: "Project is unavailable for upload" },
        { status: projectAccess.status >= 500 ? 503 : 403 }
      );
    }
    authorizedProjectId = projectAccess.data.id;

    const requestedFolderId = explicitFolderId ?? folder;
    if (requestedFolderId) {
      const folderLookup = await supabase
        .from("folders")
        .select("id, project_id")
        .eq("id", requestedFolderId)
        .eq("project_id", authorizedProjectId)
        .maybeSingle();
      if (folderLookup.error) {
        return NextResponse.json(
          { error: "Upload folder authority is unavailable" },
          { status: 503 }
        );
      }
      if (!folderLookup.data) {
        return NextResponse.json(
          { error: "Folder is unavailable for upload" },
          { status: 403 }
        );
      }
      authorizedFolderId = folderLookup.data.id;
    }
  } else {
    if (!serviceAuthorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (explicitFolderId) {
      return NextResponse.json(
        { error: "folderId requires a projectId" },
        { status: 400 }
      );
    }
  }

  try {
    const destinationFolder = authorizedProjectId
      ? authorizedFolderId
        ? `${authorizedProjectId}/${authorizedFolderId}`
        : authorizedProjectId
      : folder ?? "";
    const destination = await ensureMediaDirectory(destinationFolder, mediaRoot);
    const safeOriginalName = sanitizeMediaFilename(fileEntry.name);
    const buffer = Buffer.from(await fileEntry.arrayBuffer());
    const created = await createFileWithoutOverwrite(
      destination.absolutePath,
      safeOriginalName,
      buffer
    );
    const relativePath = destination.relativePath
      ? `${destination.relativePath}/${created.fileName}`
      : created.fileName;
    const streamUrl = `/api/media/stream?path=${encodeURIComponent(relativePath)}`;

    let assetRecord = null;
    if (authorizedProjectId && user && supabase) {
      const extension = extname(created.fileName).toLowerCase();
      const fileType = [".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v", ".mxf"].includes(extension)
        ? "video"
        : [".png", ".jpg", ".jpeg", ".gif", ".webp", ".tiff", ".bmp"].includes(extension)
          ? "image"
          : [".mp3", ".wav", ".aac", ".flac"].includes(extension)
            ? "audio"
            : "document";

      const { data, error } = await supabase
        .from("assets")
        .insert({
          title: created.fileName.replace(/\.[^.]+$/, ""),
          file_type: fileType,
          file_url: streamUrl,
          project_id: authorizedProjectId,
          folder_id: authorizedFolderId,
          status: "in_review",
          nas_path: relativePath,
          file_size: buffer.length,
          uploaded_by: user.id,
        })
        .select(LEGACY_ASSET_RETURN_COLUMNS)
        .single();

      if (error) {
        console.error("Failed to create asset record for legacy media upload");
      } else {
        assetRecord = allowlistedAssetRow(data);
      }
    }

    return NextResponse.json({
      success: true,
      fileName: created.fileName,
      relativePath,
      streamUrl,
      size: buffer.length,
      asset: assetRecord,
    });
  } catch (error) {
    const storageResponse = mediaStorageError(error);
    if (storageResponse) return storageResponse;
    console.error("Legacy media upload failed");
    return NextResponse.json({ error: "Failed to write file" }, { status: 500 });
  }
}
