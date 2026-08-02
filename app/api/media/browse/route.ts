import { lstat, readdir } from "node:fs/promises";
import { basename, extname, join } from "node:path";

import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth";
import { resolveTrustedSurfaceRole } from "@/lib/auth/host-surface";
import {
  createMediaDirectory,
  resolveExistingMediaPath,
  SafeMediaPathError,
} from "@/lib/storage/safe-media-path";

/**
 * NAS Media Browse / List API
 *
 * GET /api/media/browse?path=BP
 * POST /api/media/browse - create a direct child folder
 */

const VIDEO_EXTS = new Set([".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v", ".mxf", ".prores"]);
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".tiff", ".bmp", ".psd", ".ai"]);
const AUDIO_EXTS = new Set([".mp3", ".wav", ".aac", ".flac", ".m4a", ".ogg"]);
const DOC_EXTS = new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".srt", ".vtt"]);
const UNSAFE_ENTRY_NAME = /[\u0000-\u001f\u007f]/;

function getFileType(extension: string): string {
  const normalized = extension.toLowerCase();
  if (VIDEO_EXTS.has(normalized)) return "video";
  if (IMAGE_EXTS.has(normalized)) return "image";
  if (AUDIO_EXTS.has(normalized)) return "audio";
  if (DOC_EXTS.has(normalized)) return "document";
  return "other";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

async function staffAuthorizationFailure(): Promise<NextResponse | null> {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (resolveTrustedSurfaceRole(user) !== "staff") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
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
      return NextResponse.json({ error: "Path not found" }, { status: 404 });
    case "MEDIA_PATH_NOT_DIRECTORY":
      return NextResponse.json({ error: "Not a directory" }, { status: 400 });
    case "MEDIA_PATH_EXISTS":
      return NextResponse.json({ error: "Folder already exists" }, { status: 409 });
    default:
      return NextResponse.json({ error: "Invalid path" }, { status: 403 });
  }
}

function visibleEntry(name: string): boolean {
  return (
    !name.startsWith(".") &&
    name !== "Thumbs.db" &&
    name !== ".DS_Store" &&
    !UNSAFE_ENTRY_NAME.test(name)
  );
}

export async function GET(req: NextRequest) {
  const authorizationFailure = await staffAuthorizationFailure();
  if (authorizationFailure) return authorizationFailure;

  try {
    const requestedPath = req.nextUrl.searchParams.get("path") || "";
    const directory = await resolveExistingMediaPath(requestedPath, "directory");
    const entries = await readdir(directory.absolutePath);
    const folders: { name: string; path: string; itemCount: number }[] = [];
    const files: {
      name: string;
      path: string;
      size: string;
      sizeBytes: number;
      type: string;
      ext: string;
      modified: string;
      streamUrl: string;
    }[] = [];

    for (const entry of entries) {
      if (!visibleEntry(entry)) continue;

      const entryPath = join(directory.absolutePath, entry);
      const relativePath = directory.relativePath
        ? `${directory.relativePath}/${entry}`
        : entry;

      try {
        const entryStatus = await lstat(entryPath);
        if (entryStatus.isSymbolicLink()) continue;

        if (entryStatus.isDirectory()) {
          let itemCount = 0;
          try {
            const checkedDirectory = await resolveExistingMediaPath(
              relativePath,
              "directory",
              directory.root
            );
            const children = await readdir(checkedDirectory.absolutePath, {
              withFileTypes: true,
            });
            itemCount = children.filter(
              (child) => visibleEntry(child.name) && !child.isSymbolicLink()
            ).length;
          } catch {
            // The entry may have changed or become inaccessible after listing.
          }
          folders.push({ name: entry, path: relativePath, itemCount });
          continue;
        }

        if (!entryStatus.isFile()) continue;
        const extension = extname(entry);
        const fileType = getFileType(extension);
        if (fileType === "other") continue;

        files.push({
          name: basename(entry, extension),
          path: relativePath,
          size: formatFileSize(entryStatus.size),
          sizeBytes: entryStatus.size,
          type: fileType,
          ext: extension.toLowerCase().replace(".", ""),
          modified: entryStatus.mtime.toISOString(),
          streamUrl: `/api/media/stream?path=${encodeURIComponent(relativePath)}`,
        });
      } catch {
        // Skip entries that changed or cannot be inspected safely.
      }
    }

    folders.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());

    return NextResponse.json({
      path: directory.relativePath,
      folders,
      files,
      totalFolders: folders.length,
      totalFiles: files.length,
    });
  } catch (error) {
    return (
      mediaPathErrorResponse(error) ??
      NextResponse.json({ error: "Failed to read directory" }, { status: 500 })
    );
  }
}

export async function POST(req: NextRequest) {
  const authorizationFailure = await staffAuthorizationFailure();
  if (authorizationFailure) return authorizationFailure;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { parentPath, folderName } = body as Record<string, unknown>;
  if (!folderName || typeof folderName !== "string") {
    return NextResponse.json({ error: "Missing folderName" }, { status: 400 });
  }
  if (parentPath !== undefined && typeof parentPath !== "string") {
    return NextResponse.json({ error: "Invalid parentPath" }, { status: 400 });
  }

  try {
    const created = await createMediaDirectory(parentPath || "", folderName);
    return NextResponse.json({ success: true, path: created.relativePath });
  } catch (error) {
    return (
      mediaPathErrorResponse(error) ??
      NextResponse.json({ error: "Failed to create folder" }, { status: 500 })
    );
  }
}
