import { Readable } from "node:stream";

import { createStorageRuntime } from "@/lib/storage/runtime";
import {
  normalizeMediaRelativePath,
  sanitizeMediaFilename,
} from "@/lib/storage/safe-media-path";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
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

export interface ManagedVersionMediaRecord {
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

export function normalizeManagedVersionMediaRecord(
  value: unknown,
): ManagedVersionMediaRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Partial<ManagedVersionMediaRecord>;
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
  try {
    normalizeMediaRelativePath(row.storage_object_key);
  } catch {
    return null;
  }
  return row as ManagedVersionMediaRecord;
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

function errorResponse(
  status: number,
  code: string,
  headers: Record<string, string>,
) {
  return new Response(
    JSON.stringify({
      error: status === 404 ? "Media not found" : "Media is unavailable",
      code,
    }),
    {
      status,
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
    },
  );
}

export async function serveManagedVersionMedia({
  request,
  media,
  headOnly = false,
  allowDownload = true,
  denyNonInlineWithoutDownload = false,
  vary = "Cookie, Authorization",
}: {
  request: Request;
  media: ManagedVersionMediaRecord;
  headOnly?: boolean;
  allowDownload?: boolean;
  denyNonInlineWithoutDownload?: boolean;
  vary?: string;
}) {
  const inlineMedia = INLINE_MEDIA_MIME_TYPES.has(
    media.mime_type.toLowerCase(),
  );
  const downloadRequested =
    new URL(request.url).searchParams.get("download") === "1";
  const baseHeaders: Record<string, string> = {
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    Vary: vary,
    "X-Content-Type-Options": "nosniff",
  };

  if (
    denyNonInlineWithoutDownload &&
    !inlineMedia &&
    !allowDownload
  ) {
    return errorResponse(404, "MEDIA_NOT_FOUND", baseHeaders);
  }
  if (downloadRequested && !allowDownload) {
    return errorResponse(
      403,
      "MEDIA_DOWNLOAD_FORBIDDEN",
      baseHeaders,
    );
  }

  const storage = createStorageRuntime();
  if (storage.adapter.kind !== media.storage_provider) {
    return errorResponse(503, "MEDIA_STORAGE_UNAVAILABLE", {
      ...baseHeaders,
      "Retry-After": "15",
    });
  }

  const rangeHeader = request.headers.get("range");
  const range = rangeHeader
    ? parseByteRange(rangeHeader, media.file_size)
    : null;
  const mediaHeaders: Record<string, string> = {
    ...baseHeaders,
    "Content-Type": inlineMedia
      ? media.mime_type
      : "application/octet-stream",
  };
  if (
    !inlineMedia ||
    (downloadRequested && allowDownload)
  ) {
    const filename = sanitizeMediaFilename(media.original_filename);
    mediaHeaders["Content-Disposition"] =
      `attachment; filename="${filename}"`;
  }

  if (rangeHeader && !range) {
    return new Response(null, {
      status: 416,
      headers: {
        ...mediaHeaders,
        "Content-Range": `bytes */${media.file_size}`,
      },
    });
  }
  if (range) {
    mediaHeaders["Content-Range"] =
      `bytes ${range.start}-${range.end}/${media.file_size}`;
    mediaHeaders["Content-Length"] = String(range.end - range.start + 1);
  } else {
    mediaHeaders["Content-Length"] = String(media.file_size);
  }

  let stream: Readable;
  try {
    stream = await storage.adapter.openStoredObjectReadStream(
      media.storage_object_key,
      range ?? undefined,
      {
        size: media.file_size,
        providerVersionId: media.storage_provider_version_id,
      },
    );
  } catch {
    if (headOnly) {
      return new Response(null, {
        status: 503,
        headers: {
          ...baseHeaders,
          "Retry-After": "15",
        },
      });
    }
    return errorResponse(503, "MEDIA_INTEGRITY_UNAVAILABLE", {
      ...baseHeaders,
      "Retry-After": "15",
    });
  }
  if (headOnly) {
    stream.destroy();
    return new Response(null, {
      status: range ? 206 : 200,
      headers: mediaHeaders,
    });
  }
  return new Response(
    Readable.toWeb(stream) as ReadableStream<Uint8Array>,
    {
      status: range ? 206 : 200,
      headers: mediaHeaders,
    },
  );
}
