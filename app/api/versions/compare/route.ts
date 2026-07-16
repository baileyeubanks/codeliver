import { NextResponse } from "next/server";
import { getAssetAccess } from "@/lib/access-control";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

export async function GET(req: Request) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const versionAId = searchParams.get("a");
  const versionBId = searchParams.get("b");

  if (!versionAId || !versionBId) {
    return NextResponse.json({ error: "Both version IDs (a, b) required" }, { status: 400 });
  }

  const sb = getSupabase();

  // Fetch both versions
  const [resA, resB] = await Promise.all([
    sb
      .from("versions")
      .select(
        "id, asset_id, version_number, file_url, file_size, notes, uploaded_by, is_current, thumbnail_url, duration_seconds, resolution, created_at, updated_at",
      )
      .eq("id", versionAId)
      .maybeSingle(),
    sb
      .from("versions")
      .select(
        "id, asset_id, version_number, file_url, file_size, notes, uploaded_by, is_current, thumbnail_url, duration_seconds, resolution, created_at, updated_at",
      )
      .eq("id", versionBId)
      .maybeSingle(),
  ]);

  if (resA.error || resB.error || !resA.data || !resB.data) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  const [accessA, accessB] = await Promise.all([
    getAssetAccess(resA.data.asset_id, user.id, "viewer", sb),
    getAssetAccess(resB.data.asset_id, user.id, "viewer", sb),
  ]);
  if (!accessA.ok || !accessB.ok) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  // Fetch annotations for both versions
  const [annotA, annotB] = await Promise.all([
    sb
      .from("annotations")
      .select(
        "id, asset_id, version_id, comment_id, type, data, color, frame_number, start_time, end_time, author_id, created_at",
      )
      .eq("version_id", versionAId),
    sb
      .from("annotations")
      .select(
        "id, asset_id, version_id, comment_id, type, data, color, frame_number, start_time, end_time, author_id, created_at",
      )
      .eq("version_id", versionBId),
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
