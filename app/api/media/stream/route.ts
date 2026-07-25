import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { basename, extname } from "node:path";
import { Readable } from "node:stream";

import { NextRequest, NextResponse } from "next/server";

import { apiError, backendUnavailable } from "@/lib/api/responses";
import { isBackendUnavailableError } from "@/lib/api/backend";
import { requireAuth } from "@/lib/auth";
import { resolveTrustedSurfaceRole } from "@/lib/auth/host-surface";
import {
  resolveExistingMediaPath,
  SafeMediaPathError,
  sanitizeMediaFilename,
} from "@/lib/storage/safe-media-path";

/**
 * Staff-only raw NAS media streaming.
 * Public token-based review delivery is handled by separate review routes.
 */

const MIME_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  ".webm": "video/webm",
  ".m4v": "video/x-m4v",
  ".mxf": "video/mxf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".tiff": "image/tiff",
  ".bmp": "image/bmp",
  ".pdf": "application/pdf",
  ".srt": "text/plain",
  ".vtt": "text/vtt",
  ".m3u8": "application/vnd.apple.mpegurl",
  ".ts": "video/mp2t",
  ".m4s": "video/iso.segment",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
};

interface ByteRange {
  start: number;
  end: number;
}

function getMimeType(filePath: string): string {
  return MIME_TYPES[extname(filePath).toLowerCase()] || "application/octet-stream";
}

function parseByteRange(header: string, fileSize: number): ByteRange | null {
  if (fileSize <= 0 || header.includes(",")) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
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

function mediaPathErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof SafeMediaPathError)) return null;

  switch (error.code) {
    case "MEDIA_ROOT_UNCONFIGURED":
    case "MEDIA_ROOT_UNAVAILABLE":
      return apiError(
        "Media storage is not configured or unavailable.",
        "MEDIA_STORAGE_UNAVAILABLE",
        503,
      );
    case "MEDIA_PATH_NOT_FOUND":
      return apiError("File not found", "MEDIA_FILE_NOT_FOUND", 404);
    case "MEDIA_PATH_NOT_FILE":
      return apiError("Not a file", "MEDIA_PATH_NOT_FILE", 400);
    default:
      return apiError("Invalid path", "MEDIA_PATH_INVALID", 403);
  }
}

export async function GET(req: NextRequest) {
  let user: Awaited<ReturnType<typeof requireAuth>>;
  try {
    user = await requireAuth();
  } catch (error) {
    return isBackendUnavailableError(error)
      ? backendUnavailable()
      : apiError("Authentication service is unavailable", "AUTH_UNAVAILABLE", 503);
  }
  if (!user) {
    return apiError("Authentication required", "AUTH_REQUIRED", 401);
  }
  if (resolveTrustedSurfaceRole(user) !== "staff") {
    return apiError("Forbidden", "FORBIDDEN", 403);
  }

  const requestedPath = req.nextUrl.searchParams.get("path");
  if (!requestedPath) {
    return apiError("Missing path parameter", "INVALID_REQUEST", 400);
  }

  let fileHandle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    const mediaPath = await resolveExistingMediaPath(requestedPath, "file");
    const noFollow = "O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0;
    fileHandle = await open(mediaPath.absolutePath, constants.O_RDONLY | noFollow);
    const status = await fileHandle.stat();
    if (!status.isFile()) {
      await fileHandle.close();
      fileHandle = null;
      return apiError("Not a file", "MEDIA_PATH_NOT_FILE", 400);
    }

    const fileSize = status.size;
    const baseHeaders: Record<string, string> = {
      "Content-Type": getMimeType(mediaPath.relativePath),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      Vary: "Cookie, Authorization",
    };

    if (req.nextUrl.searchParams.get("download") === "1") {
      const fileName = sanitizeMediaFilename(basename(mediaPath.relativePath));
      baseHeaders["Content-Disposition"] = `attachment; filename="${fileName}"`;
    }

    const rangeHeader = req.headers.get("range");
    let responseStatus = 200;
    let streamOptions: { start?: number; end?: number } = {};

    if (rangeHeader) {
      const range = parseByteRange(rangeHeader, fileSize);
      if (!range) {
        await fileHandle.close();
        fileHandle = null;
        return new NextResponse(null, {
          status: 416,
          headers: {
            ...baseHeaders,
            "Content-Range": `bytes */${fileSize}`,
          },
        });
      }

      responseStatus = 206;
      streamOptions = range;
      baseHeaders["Content-Range"] = `bytes ${range.start}-${range.end}/${fileSize}`;
      baseHeaders["Content-Length"] = String(range.end - range.start + 1);
    } else {
      baseHeaders["Content-Length"] = String(fileSize);
    }

    const stream = fileHandle.createReadStream(streamOptions);
    fileHandle = null;
    const webStream = Readable.toWeb(stream) as ReadableStream;
    return new Response(webStream, {
      status: responseStatus,
      headers: baseHeaders,
    });
  } catch (error) {
    if (fileHandle) {
      await fileHandle.close().catch(() => undefined);
    }
    const storageResponse = mediaPathErrorResponse(error);
    if (storageResponse) return storageResponse;

    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return apiError("File not found", "MEDIA_FILE_NOT_FOUND", 404);
    }
    if (code === "ELOOP") {
      return apiError("Invalid path", "MEDIA_PATH_INVALID", 403);
    }
    return apiError("Media storage is unavailable", "MEDIA_STORAGE_UNAVAILABLE", 503);
  }
}
