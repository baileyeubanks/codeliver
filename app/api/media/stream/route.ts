import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createReadStream, existsSync, statSync } from "fs";
import { join, normalize, resolve } from "path";
import { Readable } from "stream";

/**
 * NAS Media Streaming API
 * 
 * Serves media files from the NAS filesystem at /volume1/media.
 * When deployed on the NAS via Coolify, Co-Deliver has direct
 * filesystem access to the media volume.
 * 
 * Usage: GET /api/media/stream?path=BP/video.mp4
 * 
 * Supports:
 * - Range requests for video seeking
 * - MIME type detection
 * - Path traversal protection
 */

const MEDIA_ROOT = process.env.NAS_MEDIA_ROOT || "/volume1/media";

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
};

function getMimeType(filePath: string): string {
  const ext = filePath.substring(filePath.lastIndexOf(".")).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

export async function GET(req: NextRequest) {
  // Auth check
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const relativePath = req.nextUrl.searchParams.get("path");
  if (!relativePath) {
    return NextResponse.json({ error: "Missing path parameter" }, { status: 400 });
  }

  // Prevent path traversal
  const normalizedPath = normalize(relativePath).replace(/^(\.\.[/\\])+/, "");
  const absolutePath = resolve(join(MEDIA_ROOT, normalizedPath));
  if (!absolutePath.startsWith(resolve(MEDIA_ROOT))) {
    return NextResponse.json({ error: "Invalid path" }, { status: 403 });
  }

  // Check file exists
  if (!existsSync(absolutePath)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const stat = statSync(absolutePath);
  if (!stat.isFile()) {
    return NextResponse.json({ error: "Not a file" }, { status: 400 });
  }

  const mimeType = getMimeType(absolutePath);
  const fileSize = stat.size;

  // Handle range requests (for video seeking)
  const rangeHeader = req.headers.get("range");

  if (rangeHeader) {
    const parts = rangeHeader.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    const stream = createReadStream(absolutePath, { start, end });
    const webStream = Readable.toWeb(stream) as ReadableStream;

    return new Response(webStream, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunkSize),
        "Content-Type": mimeType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  // Full file response
  const stream = createReadStream(absolutePath);
  const webStream = Readable.toWeb(stream) as ReadableStream;

  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Length": String(fileSize),
      "Content-Type": mimeType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
