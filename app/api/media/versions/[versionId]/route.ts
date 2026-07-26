import { Readable } from "node:stream";

import { NextRequest } from "next/server";

import { getAssetAccess } from "@/lib/access-control";
import { apiError, backendUnavailable } from "@/lib/api/responses";
import { isBackendUnavailableError } from "@/lib/api/backend";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { createStorageRuntime } from "@/lib/storage/runtime";
import { sanitizeMediaFilename } from "@/lib/storage/safe-media-path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const STORAGE_PROVIDERS = new Set([
  "local",
  "ccnas",
  "google-drive",
  "object-store",
]);
const INLINE_MEDIA_MIME_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/wav",
  "audio/ogg",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
]);
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

interface VersionMediaRecord {
  id: string;
  asset_id: string;
  file_size: number;
  storage_provider: string;
  storage_object_key: string;
  storage_sha256: string;
  storage_provider_version_id: string;
  original_filename: string;
  mime_type: string;
}

interface ByteRange {
  start: number;
  end: number;
}

function versionMediaRecord(value: unknown): VersionMediaRecord | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<VersionMediaRecord>;
  if (
    typeof row.id !== "string" ||
    !UUID_PATTERN.test(row.id) ||
    typeof row.asset_id !== "string" ||
    !UUID_PATTERN.test(row.asset_id) ||
    !Number.isSafeInteger(row.file_size) ||
    row.file_size! <= 0 ||
    typeof row.storage_provider !== "string" ||
    !STORAGE_PROVIDERS.has(row.storage_provider) ||
    typeof row.storage_object_key !== "string" ||
    !row.storage_object_key ||
    row.storage_object_key.length > 2_048 ||
    CONTROL_CHARACTERS.test(row.storage_object_key) ||
    typeof row.storage_sha256 !== "string" ||
    !SHA256_PATTERN.test(row.storage_sha256) ||
    typeof row.storage_provider_version_id !== "string" ||
    !row.storage_provider_version_id ||
    row.storage_provider_version_id.length > 1_024 ||
    CONTROL_CHARACTERS.test(row.storage_provider_version_id) ||
    typeof row.original_filename !== "string" ||
    !row.original_filename ||
    row.original_filename.length > 512 ||
    CONTROL_CHARACTERS.test(row.original_filename) ||
    typeof row.mime_type !== "string" ||
    !row.mime_type ||
    row.mime_type.length > 256 ||
    CONTROL_CHARACTERS.test(row.mime_type)
  ) {
    return null;
  }
  return row as VersionMediaRecord;
}

function parseByteRange(value: string, fileSize: number): ByteRange | null {
  if (value.includes(",")) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return null;

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    return {
      start: Math.max(0, fileSize - suffixLength),
      end: fileSize - 1,
    };
  }

  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : fileSize - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    start >= fileSize ||
    requestedEnd < start
  ) {
    return null;
  }
  return { start, end: Math.min(requestedEnd, fileSize - 1) };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ versionId: string }> },
) {
  try {
    let user: Awaited<ReturnType<typeof requireAuth>>;
    try {
      user = await requireAuth();
    } catch (error) {
      return isBackendUnavailableError(error)
        ? backendUnavailable()
        : apiError(
            "Authentication service is unavailable",
            "AUTH_UNAVAILABLE",
            503,
          );
    }
    if (!user) {
      return apiError("Authentication required", "AUTH_REQUIRED", 401);
    }

    const { versionId } = await params;
    if (!UUID_PATTERN.test(versionId)) {
      return apiError("Version id is invalid", "INVALID_VERSION_ID", 400);
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("versions")
      .select(
        "id, asset_id, file_size, storage_provider, storage_object_key, storage_sha256, storage_provider_version_id, original_filename, mime_type",
      )
      .eq("id", versionId)
      .maybeSingle();
    if (error) return backendUnavailable();
    if (!data) return apiError("Media not found", "MEDIA_NOT_FOUND", 404);

    const version = versionMediaRecord(data);
    if (!version || version.id !== versionId) return backendUnavailable();

    const activeAsset = await supabase
      .from("assets")
      .select("id")
      .eq("id", version.asset_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (activeAsset.error) return backendUnavailable();
    if (!activeAsset.data) {
      return apiError("Media not found", "MEDIA_NOT_FOUND", 404);
    }

    const access = await getAssetAccess(
      version.asset_id,
      user.id,
      "viewer",
      supabase,
    );
    if (!access.ok) {
      return access.status >= 500
        ? backendUnavailable()
        : apiError("Media not found", "MEDIA_NOT_FOUND", 404);
    }

    const storage = createStorageRuntime();
    if (storage.adapter.kind !== version.storage_provider) {
      return apiError(
        "Version media is temporarily unavailable",
        "MEDIA_STORAGE_UNAVAILABLE",
        503,
        { "Retry-After": "15" },
      );
    }
    const rangeHeader = request.headers.get("range");
    const range = rangeHeader
      ? parseByteRange(rangeHeader, version.file_size)
      : null;
    const inlineMedia = INLINE_MEDIA_MIME_TYPES.has(
      version.mime_type.toLowerCase(),
    );
    const baseHeaders: Record<string, string> = {
      "Content-Type": inlineMedia
        ? version.mime_type
        : "application/octet-stream",
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      Vary: "Cookie, Authorization",
    };
    if (
      request.nextUrl.searchParams.get("download") === "1" ||
      !inlineMedia
    ) {
      const filename = sanitizeMediaFilename(version.original_filename);
      baseHeaders["Content-Disposition"] =
        `attachment; filename="${filename}"`;
    }

    if (rangeHeader && !range) {
      return new Response(null, {
        status: 416,
        headers: {
          ...baseHeaders,
          "Content-Range": `bytes */${version.file_size}`,
        },
      });
    }

    if (range) {
      baseHeaders["Content-Range"] =
        `bytes ${range.start}-${range.end}/${version.file_size}`;
      baseHeaders["Content-Length"] = String(range.end - range.start + 1);
    } else {
      baseHeaders["Content-Length"] = String(version.file_size);
    }
    let stream: Readable;
    try {
      stream = await storage.adapter.openStoredObjectReadStream(
        version.storage_object_key,
        range ?? undefined,
        {
          size: version.file_size,
          providerVersionId: version.storage_provider_version_id,
        },
      );
    } catch {
      return apiError(
        "Version media is temporarily unavailable",
        "MEDIA_INTEGRITY_UNAVAILABLE",
        503,
        { "Retry-After": "15" },
      );
    }
    return new Response(
      Readable.toWeb(stream) as ReadableStream<Uint8Array>,
      {
        status: range ? 206 : 200,
        headers: baseHeaders,
      },
    );
  } catch {
    return backendUnavailable();
  }
}
