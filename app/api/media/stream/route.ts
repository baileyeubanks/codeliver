import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { basename, extname } from "node:path";
import { Readable } from "node:stream";

import { NextRequest, NextResponse } from "next/server";

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
      return NextResponse.json(
        {
          error: "Media storage is not configured or unavailable.",
          code: "MEDIA_STORAGE_UNAVAILABLE",
        },
        { status: 503 }
      );
    case "MEDIA_PATH_NOT_FOUND":
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    case "MEDIA_PATH_NOT_FILE":
      return NextResponse.json({ error: "Not a file" }, { status: 400 });
    default:
      return NextResponse.json({ error: "Invalid path" }, { status: 403 });
  }
}

export async function GET(req: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (resolveTrustedSurfaceRole(user) !== "staff") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const requestedPath = req.nextUrl.searchParams.get("path");
  if (!requestedPath) {
    return NextResponse.json({ error: "Missing path parameter" }, { status: 400 });
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
      return NextResponse.json({ error: "Not a file" }, { status: 400 });
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
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    if (code === "ELOOP") {
      return NextResponse.json({ error: "Invalid path" }, { status: 403 });
    }
    return NextResponse.json({ error: "Failed to read file" }, { status: 500 });
  }
}
