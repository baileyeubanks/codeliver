import { NextResponse } from "next/server";
import { getAssetAccess } from "@/lib/access-control";
import { requireAuthWithClient } from "@/lib/auth-client";

const VERSION_COLUMNS =
  "id, asset_id, version_number, file_url, file_size, notes, uploaded_by, is_current, thumbnail_url, duration_seconds, resolution, created_at, updated_at";
const ANNOTATION_COLUMNS =
  "id, comment_id, asset_id, version_id, type, data, frame_number, created_by, created_at";

function versionNotFound() {
  return NextResponse.json({ error: "Version not found" }, { status: 404 });
}

export async function GET(req: Request) {
  const { user, supabase: sb } = await requireAuthWithClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const versionAId = searchParams.get("a");
  const versionBId = searchParams.get("b");

  if (!versionAId || !versionBId) {
    return NextResponse.json({ error: "Both version IDs (a, b) required" }, { status: 400 });
  }

  // Fetch both versions
  const [resA, resB] = await Promise.all([
    sb
      .from("versions")
      .select(VERSION_COLUMNS)
      .eq("id", versionAId)
      .maybeSingle(),
    sb
      .from("versions")
      .select(VERSION_COLUMNS)
      .eq("id", versionBId)
      .maybeSingle(),
  ]);

  if (resA.error || resB.error || !resA.data || !resB.data) {
    return versionNotFound();
  }

  if (resA.data.asset_id !== resB.data.asset_id) {
    return versionNotFound();
  }

  const [accessA, accessB] = await Promise.all([
    getAssetAccess(resA.data.asset_id, user.id, "viewer", sb),
    getAssetAccess(resB.data.asset_id, user.id, "viewer", sb),
  ]);
  if (!accessA.ok || !accessB.ok) {
    return versionNotFound();
  }

  // Fetch annotations for both versions
  const [annotA, annotB] = await Promise.all([
    sb
      .from("annotations")
      .select(ANNOTATION_COLUMNS)
      .eq("version_id", versionAId)
      .eq("asset_id", resA.data.asset_id),
    sb
      .from("annotations")
      .select(ANNOTATION_COLUMNS)
      .eq("version_id", versionBId)
      .eq("asset_id", resB.data.asset_id),
  ]);

  if (annotA.error || annotB.error) {
    return NextResponse.json(
      { error: "Version annotations are temporarily unavailable" },
      { status: 503 },
    );
  }

  return NextResponse.json({
    versionA: { ...resA.data, annotations: annotA.data ?? [] },
    versionB: { ...resB.data, annotations: annotB.data ?? [] },
  });
}
