import { apiError, apiJson, backendUnavailable } from "@/lib/api/responses";
import { getAssetAccess } from "@/lib/access-control";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

export async function GET(req: Request) {
  let user;
  try { user = await requireAuth(); } catch { return backendUnavailable(); }
  if (!user) return apiError("Unauthorized", "UNAUTHORIZED", 401);

  const { searchParams } = new URL(req.url);
  const versionAId = searchParams.get("a");
  const versionBId = searchParams.get("b");

  if (!versionAId || !versionBId) {
    return apiError("Both version IDs (a, b) required", "INVALID_REQUEST", 400);
  }

  let sb;
  try { sb = getSupabase(); } catch { return backendUnavailable(); }

  // Fetch both versions
  let resA; let resB;
  try { [resA, resB] = await Promise.all([
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
  ]); } catch { return backendUnavailable(); }

  if (resA.error || resB.error || !resA.data || !resB.data) {
    return (resA.error || resB.error) ? backendUnavailable() : apiError("Version not found", "VERSION_NOT_FOUND", 404);
  }

  const [accessA, accessB] = await Promise.all([
    getAssetAccess(resA.data.asset_id, user.id, "viewer", sb),
    getAssetAccess(resB.data.asset_id, user.id, "viewer", sb),
  ]);
  if (!accessA.ok || !accessB.ok) {
    return (!accessA.ok && accessA.status >= 500) || (!accessB.ok && accessB.status >= 500) ? backendUnavailable() : apiError("Version not found", "VERSION_NOT_FOUND", 404);
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
    return backendUnavailable();
  }

  return apiJson({
    versionA: { ...resA.data, annotations: annotA.data ?? [] },
    versionB: { ...resB.data, annotations: annotB.data ?? [] },
  });
}
