import { getSupabase, type DataSupabaseClient } from "@/lib/supabase";
import type { Version } from "@/lib/types/codeliver";

type VersionResult =
  | { ok: true; version: Version }
  | { ok: false; status: number; error: string };

export async function resolveAssetVersion({
  assetId,
  versionId,
  client,
}: {
  assetId: string;
  versionId?: string | null;
  client?: DataSupabaseClient;
}): Promise<VersionResult> {
  const supabase = client ?? getSupabase();
  const selection =
    "id, asset_id, version_number, file_url, file_size, thumbnail_url, duration_seconds, resolution, is_current, notes, uploaded_by, created_at";

  if (versionId) {
    const { data, error } = await supabase
      .from("versions")
      .select(selection)
      .eq("id", versionId)
      .eq("asset_id", assetId)
      .maybeSingle();

    if (error) return { ok: false, status: 500, error: error.message };
    if (!data) return { ok: false, status: 404, error: "Media version not found" };
    return { ok: true, version: data as Version };
  }

  const current = await supabase
    .from("versions")
    .select(selection)
    .eq("asset_id", assetId)
    .eq("is_current", true)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (current.error) return { ok: false, status: 500, error: current.error.message };
  if (current.data) return { ok: true, version: current.data as Version };

  const latest = await supabase
    .from("versions")
    .select(selection)
    .eq("asset_id", assetId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest.error) return { ok: false, status: 500, error: latest.error.message };
  if (!latest.data) {
    return {
      ok: false,
      status: 409,
      error: "This asset has no media version. Upload a version before adding edit decisions.",
    };
  }

  return { ok: true, version: latest.data as Version };
}
