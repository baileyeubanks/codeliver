/**
 * Tus Upload Store — manages resumable uploads on NAS filesystem.
 *
 * Each upload gets a temp file in UPLOAD_DIR. Metadata (size, offset, filename,
 * mime type, project/folder) is stored in a companion .json file.
 * On completion (offset === size), the file is moved to its final NAS path
 * and an asset record is created in Supabase.
 */

import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  unlinkSync,
  renameSync,
  statSync,
  appendFileSync,
} from "fs";
import { join, resolve, extname } from "path";
import { randomUUID } from "crypto";
import { getSupabase } from "@/lib/supabase";
import { detectFileType } from "@/lib/utils/media";

const MEDIA_ROOT = process.env.NAS_MEDIA_ROOT || "/volume1/media";
const UPLOAD_DIR = join(MEDIA_ROOT, ".tus-uploads");

// Ensure upload staging directory exists
if (!existsSync(UPLOAD_DIR)) {
  mkdirSync(UPLOAD_DIR, { recursive: true });
}

export interface TusUploadMeta {
  id: string;
  filename: string;
  filetype: string;
  size: number;
  offset: number;
  projectId?: string;
  folderId?: string;
  userId: string;
  createdAt: string;
  completed: boolean;
  finalPath?: string;
  assetId?: string;
}

function metaPath(uploadId: string): string {
  return join(UPLOAD_DIR, `${uploadId}.json`);
}

function chunkPath(uploadId: string): string {
  return join(UPLOAD_DIR, `${uploadId}.bin`);
}

export function createUpload(params: {
  filename: string;
  filetype: string;
  size: number;
  projectId?: string;
  folderId?: string;
  userId: string;
}): TusUploadMeta {
  const id = randomUUID();
  const meta: TusUploadMeta = {
    id,
    filename: params.filename,
    filetype: params.filetype,
    size: params.size,
    offset: 0,
    projectId: params.projectId,
    folderId: params.folderId,
    userId: params.userId,
    createdAt: new Date().toISOString(),
    completed: false,
  };
  writeFileSync(metaPath(id), JSON.stringify(meta, null, 2));
  // Create empty chunk file
  writeFileSync(chunkPath(id), Buffer.alloc(0));
  return meta;
}

export function getUpload(uploadId: string): TusUploadMeta | null {
  const path = metaPath(uploadId);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

export function appendChunk(
  uploadId: string,
  data: Buffer,
  clientOffset: number
): { offset: number; complete: boolean } {
  const meta = getUpload(uploadId);
  if (!meta) throw new Error("Upload not found");
  if (meta.completed) throw new Error("Upload already completed");

  // tus protocol: client offset must match server offset
  if (clientOffset !== meta.offset) {
    throw new Error(
      `Offset mismatch: expected ${meta.offset}, got ${clientOffset}`
    );
  }

  // Don't exceed declared size
  if (meta.offset + data.length > meta.size) {
    throw new Error("Upload would exceed declared size");
  }

  // Append data to chunk file
  appendFileSync(chunkPath(uploadId), data);

  // Update offset
  meta.offset += data.length;
  const complete = meta.offset >= meta.size;
  if (complete) {
    meta.completed = true;
  }
  writeFileSync(metaPath(uploadId), JSON.stringify(meta, null, 2));

  return { offset: meta.offset, complete };
}

export async function finalizeUpload(
  uploadId: string
): Promise<{ relativePath: string; streamUrl: string; asset: unknown }> {
  const meta = getUpload(uploadId);
  if (!meta) throw new Error("Upload not found");
  if (!meta.completed) throw new Error("Upload not yet complete");

  // Determine destination folder
  const folder = meta.projectId || "uploads";
  const destDir = resolve(join(MEDIA_ROOT, folder));
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }

  // Generate unique filename
  let fileName = meta.filename;
  const destPath = join(destDir, fileName);
  if (existsSync(destPath)) {
    const ext = extname(fileName);
    const base = fileName.slice(0, -ext.length || undefined);
    fileName = `${base}_${Date.now()}${ext}`;
  }

  const finalPath = join(destDir, fileName);
  const relativePath = join(folder, fileName);

  // Move chunk file to final location
  renameSync(chunkPath(uploadId), finalPath);

  const streamUrl = `/api/media/stream?path=${encodeURIComponent(relativePath)}`;

  // Create asset record in Supabase if projectId given
  let assetRecord = null;
  if (meta.projectId) {
    const fileType = detectFileType(meta.filename);
    try {
      const { data, error } = await getSupabase()
        .from("assets")
        .insert({
          title: meta.filename.replace(/\.[^.]+$/, ""),
          file_type: fileType,
          file_url: streamUrl,
          project_id: meta.projectId,
          folder_id: meta.folderId || null,
          status: "processing",
          nas_path: relativePath,
          file_size: meta.size,
          uploaded_by: meta.userId,
        })
        .select()
        .single();

      if (!error) {
        assetRecord = data;
        meta.assetId = data.id;
        meta.finalPath = relativePath;
        writeFileSync(metaPath(uploadId), JSON.stringify(meta, null, 2));

        // Auto-enqueue transcode job for video/audio files
        const needsTranscode = ["video", "audio"].includes(fileType);
        if (needsTranscode) {
          try {
            const { enqueueTranscode } = await import("@/lib/workers/queue");
            const { processJob } = await import("@/lib/workers/transcode");
            const job = await enqueueTranscode({
              assetId: data.id,
              inputPath: relativePath,
            });
            if (job) {
              // Fire-and-forget async processing
              processJob(job).catch((e) =>
                console.error("[tus] Transcode failed:", e)
              );
            }
          } catch (e) {
            console.error("[tus] Failed to enqueue transcode:", e);
          }
        } else {
          // Non-media files go straight to ready
          await getSupabase()
            .from("assets")
            .update({ status: "ready" })
            .eq("id", data.id);
        }
      } else {
        console.error("[tus] Failed to create asset record:", error);
      }
    } catch (err) {
      console.error("[tus] Supabase insert error:", err);
    }
  }

  return { relativePath, streamUrl, asset: assetRecord };
}

export function deleteUpload(uploadId: string): boolean {
  const meta = getUpload(uploadId);
  if (!meta) return false;

  try {
    if (existsSync(chunkPath(uploadId))) unlinkSync(chunkPath(uploadId));
    if (existsSync(metaPath(uploadId))) unlinkSync(metaPath(uploadId));
    return true;
  } catch {
    return false;
  }
}

/**
 * Clean up stale incomplete uploads older than maxAge (ms).
 * Called by cleanup cron or on-demand.
 */
export function cleanStaleUploads(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
  if (!existsSync(UPLOAD_DIR)) return 0;
  const { readdirSync } = require("fs");
  const files = readdirSync(UPLOAD_DIR) as string[];
  let cleaned = 0;
  const now = Date.now();

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const uploadId = file.replace(".json", "");
    const meta = getUpload(uploadId);
    if (!meta) continue;
    const age = now - new Date(meta.createdAt).getTime();
    if (!meta.completed && age > maxAgeMs) {
      deleteUpload(uploadId);
      cleaned++;
    }
  }
  return cleaned;
}
