import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { existsSync, readdirSync, statSync, mkdirSync } from "fs";
import { join, resolve, normalize, extname, basename } from "path";

/**
 * NAS Media Browse / List API
 *
 * Lists directories and files from the NAS media volume.
 * Used by the Projects page to browse the media library.
 *
 * GET /api/media/browse?path=BP
 */

const MEDIA_ROOT = process.env.NAS_MEDIA_ROOT || "/volume1/media";

const VIDEO_EXTS = new Set([".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v", ".mxf", ".prores"]);
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".tiff", ".bmp", ".psd", ".ai"]);
const AUDIO_EXTS = new Set([".mp3", ".wav", ".aac", ".flac", ".m4a", ".ogg"]);
const DOC_EXTS = new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".srt", ".vtt"]);

function getFileType(ext: string): string {
  ext = ext.toLowerCase();
  if (VIDEO_EXTS.has(ext)) return "video";
  if (IMAGE_EXTS.has(ext)) return "image";
  if (AUDIO_EXTS.has(ext)) return "audio";
  if (DOC_EXTS.has(ext)) return "document";
  return "other";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

export async function GET(req: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const relativePath = req.nextUrl.searchParams.get("path") || "";
  const normalizedPath = normalize(relativePath).replace(/^(\.\.[/\\])+/, "");
  const absolutePath = resolve(join(MEDIA_ROOT, normalizedPath));

  if (!absolutePath.startsWith(resolve(MEDIA_ROOT))) {
    return NextResponse.json({ error: "Invalid path" }, { status: 403 });
  }

  if (!existsSync(absolutePath)) {
    return NextResponse.json({ error: "Path not found" }, { status: 404 });
  }

  const stat = statSync(absolutePath);
  if (!stat.isDirectory()) {
    return NextResponse.json({ error: "Not a directory" }, { status: 400 });
  }

  try {
    const entries = readdirSync(absolutePath);
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
      // Skip hidden files and system files
      if (entry.startsWith(".") || entry === "Thumbs.db" || entry === ".DS_Store") continue;

      const entryPath = join(absolutePath, entry);
      const relPath = join(normalizedPath, entry);

      try {
        const entryStat = statSync(entryPath);

        if (entryStat.isDirectory()) {
          // Count items in subdirectory
          let itemCount = 0;
          try {
            itemCount = readdirSync(entryPath).filter((e) => !e.startsWith(".")).length;
          } catch {
            // permission denied etc
          }
          folders.push({
            name: entry,
            path: relPath,
            itemCount,
          });
        } else if (entryStat.isFile()) {
          const ext = extname(entry);
          const fileType = getFileType(ext);
          // Only show media-relevant files
          if (fileType === "other") continue;

          files.push({
            name: basename(entry, ext),
            path: relPath,
            size: formatFileSize(entryStat.size),
            sizeBytes: entryStat.size,
            type: fileType,
            ext: ext.toLowerCase().replace(".", ""),
            modified: entryStat.mtime.toISOString(),
            streamUrl: `/api/media/stream?path=${encodeURIComponent(relPath)}`,
          });
        }
      } catch {
        // Skip files we can't stat
        continue;
      }
    }

    // Sort folders alphabetically, then files by modified date (newest first)
    folders.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());

    return NextResponse.json({
      path: normalizedPath,
      folders,
      files,
      totalFolders: folders.length,
      totalFiles: files.length,
    });
  } catch (err) {
    return NextResponse.json({ error: "Failed to read directory" }, { status: 500 });
  }
}

/**
 * POST /api/media/browse — Create a new folder
 */
export async function POST(req: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { parentPath, folderName } = body;

  if (!folderName || typeof folderName !== "string") {
    return NextResponse.json({ error: "Missing folderName" }, { status: 400 });
  }

  const safeName = folderName.replace(/[^a-zA-Z0-9_\-\s.]/g, "").trim();
  if (!safeName) {
    return NextResponse.json({ error: "Invalid folder name" }, { status: 400 });
  }

  const parent = normalize(parentPath || "").replace(/^(\.\.[/\\])+/, "");
  const newFolderPath = resolve(join(MEDIA_ROOT, parent, safeName));

  if (!newFolderPath.startsWith(resolve(MEDIA_ROOT))) {
    return NextResponse.json({ error: "Invalid path" }, { status: 403 });
  }

  if (existsSync(newFolderPath)) {
    return NextResponse.json({ error: "Folder already exists" }, { status: 409 });
  }

  try {
    mkdirSync(newFolderPath, { recursive: true });
    return NextResponse.json({ success: true, path: join(parent, safeName) });
  } catch {
    return NextResponse.json({ error: "Failed to create folder" }, { status: 500 });
  }
}
