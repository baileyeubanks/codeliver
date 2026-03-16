import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join, resolve, normalize, extname } from "path";
import { getSupabase } from "@/lib/supabase";

/**
 * NAS Media Upload API
 *
 * Uploads files to the NAS filesystem at /volume1/media and
 * optionally creates an asset record in Supabase.
 *
 * POST /api/media/upload — multipart/form-data
 *   - file: the media file
 *   - folder: destination folder path (e.g., "BP")
 *   - projectId: optional Supabase project ID to create asset record
 */

const MEDIA_ROOT = process.env.NAS_MEDIA_ROOT || "/volume1/media";

export async function POST(req: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const folder = (formData.get("folder") as string) || "";
  const projectId = formData.get("projectId") as string | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // Sanitize folder path
  const safeFolder = normalize(folder).replace(/^(\.\.[/\\])+/, "");
  const destDir = resolve(join(MEDIA_ROOT, safeFolder));
  if (!destDir.startsWith(resolve(MEDIA_ROOT))) {
    return NextResponse.json({ error: "Invalid folder" }, { status: 403 });
  }

  // Ensure destination directory exists
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }

  // Generate unique filename (preserve original name, add timestamp if exists)
  let fileName = file.name;
  const destPath = join(destDir, fileName);
  if (existsSync(destPath)) {
    const ext = extname(fileName);
    const base = fileName.slice(0, -ext.length);
    const ts = Date.now();
    fileName = `${base}_${ts}${ext}`;
  }

  const finalPath = join(destDir, fileName);
  const relativePath = join(safeFolder, fileName);

  try {
    // Write file to NAS
    const buffer = Buffer.from(await file.arrayBuffer());
    writeFileSync(finalPath, buffer);

    const streamUrl = `/api/media/stream?path=${encodeURIComponent(relativePath)}`;

    // If projectId provided, create asset record in Supabase
    let assetRecord = null;
    if (projectId) {
      const ext = extname(fileName).toLowerCase();
      const fileType = [".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v", ".mxf"].includes(ext)
        ? "video"
        : [".png", ".jpg", ".jpeg", ".gif", ".webp", ".tiff", ".bmp"].includes(ext)
          ? "image"
          : [".mp3", ".wav", ".aac", ".flac"].includes(ext)
            ? "audio"
            : "document";

      const { data, error } = await getSupabase()
        .from("assets")
        .insert({
          title: file.name.replace(/\.[^.]+$/, ""),
          file_type: fileType,
          file_url: streamUrl,
          project_id: projectId,
          status: "in_review",
          nas_path: relativePath,
        })
        .select()
        .single();

      if (error) {
        // File uploaded but DB record failed — still return success
        console.error("Failed to create asset record:", error);
      } else {
        assetRecord = data;
      }
    }

    return NextResponse.json({
      success: true,
      fileName,
      relativePath,
      streamUrl,
      size: buffer.length,
      asset: assetRecord,
    });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: "Failed to write file" }, { status: 500 });
  }
}
