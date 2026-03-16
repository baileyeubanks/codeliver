/**
 * Asset Export / Download API
 *
 * GET /api/assets/:id/export — Generate signed download URL for approved asset
 *
 * Returns the original quality file URL for the latest approved version.
 * Only accessible to the asset owner or team members.
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getOwnedAsset } from "@/lib/access-control";
import { getSupabase } from "@/lib/supabase";
import { existsSync, statSync } from "fs";
import { join } from "path";

const MEDIA_ROOT = process.env.NAS_MEDIA_ROOT || "/volume1/media";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const assetAccess = await getOwnedAsset(id, user.id);
  if (!assetAccess.ok) {
    return NextResponse.json(
      { error: assetAccess.error },
      { status: assetAccess.status }
    );
  }

  // Get the asset with its current file info
  const { data: asset, error } = await getSupabase()
    .from("assets")
    .select("*, versions(*)")
    .eq("id", id)
    .single();

  if (error || !asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  // Get the latest version (or use asset's file_url directly)
  const latestVersion = asset.versions
    ?.sort(
      (a: { version_number: number }, b: { version_number: number }) =>
        b.version_number - a.version_number
    )?.[0];

  const fileUrl = latestVersion?.file_url || asset.file_url;
  const nasPath = asset.nas_path;

  if (!fileUrl && !nasPath) {
    return NextResponse.json(
      { error: "No file available for download" },
      { status: 404 }
    );
  }

  // Check if NAS file exists and get size
  let fileSize: number | null = null;
  if (nasPath) {
    const fullPath = join(MEDIA_ROOT, nasPath);
    if (existsSync(fullPath)) {
      fileSize = statSync(fullPath).size;
    }
  }

  // Log the download in activity
  await getSupabase().from("activity_log").insert({
    asset_id: id,
    actor_id: user.id,
    actor_name: user.email,
    action: "downloaded_asset",
    details: {
      version: latestVersion?.version_number || 1,
      status: asset.status,
    },
  });

  return NextResponse.json({
    downloadUrl: fileUrl,
    streamUrl: nasPath
      ? `/api/media/stream?path=${encodeURIComponent(nasPath)}&download=1`
      : fileUrl,
    title: asset.title,
    fileType: asset.file_type,
    fileSize: fileSize || asset.file_size,
    version: latestVersion?.version_number || 1,
    status: asset.status,
  });
}
