import { apiJson } from "@/lib/api/responses";
import { getAssetAccess } from "@/lib/access-control";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { resolveAssetVersion } from "@/lib/versions";

function noStore(body: unknown, init?: ResponseInit) {
  return apiJson(body as Record<string, unknown>, init);
}

export async function GET(request: Request) {
  let user;
  try { user = await requireAuth(); } catch { return noStore({ error: "Transcription service is unavailable", code: "BACKEND_UNAVAILABLE" }, { status: 503 }); }
  if (!user) return noStore({ error: "Unauthorized" }, { status: 401 });

  const search = new URL(request.url).searchParams;
  const assetId = search.get("asset_id");
  const versionId = search.get("version_id");
  if (!assetId || !versionId) {
    return noStore(
      { error: "asset_id and version_id are required" },
      { status: 400 },
    );
  }

  let access;
  try { access = await getAssetAccess(assetId, user.id, "viewer"); } catch { return noStore({ error: "Transcription service is unavailable", code: "BACKEND_UNAVAILABLE" }, { status: 503 }); }
  if (!access.ok) {
    return noStore({ error: access.error }, { status: access.status });
  }
  const version = await resolveAssetVersion({ assetId, versionId });
  if (!version.ok) {
    return noStore({ error: version.error }, { status: version.status });
  }

  let result;
  try { result = await getSupabase()
    .from("transcriptions")
    .select("id, asset_id, version_id, language, status, segments, created_at")
    .eq("asset_id", assetId)
    .eq("version_id", versionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle(); } catch { return noStore({ error: "Transcription data is temporarily unavailable", code: "BACKEND_UNAVAILABLE" }, { status: 503 }); }
  const { data, error } = result;

  if (error) {
    return noStore(
      { error: "Transcription data is temporarily unavailable" },
      { status: 503 },
    );
  }
  return noStore({ transcription: data ?? null, version: version.version });
}

export async function POST(request: Request) {
  let user;
  try { user = await requireAuth(); } catch { return noStore({ error: "Transcription service is unavailable", code: "BACKEND_UNAVAILABLE" }, { status: 503 }); }
  if (!user) return noStore({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const assetId =
    body && typeof body === "object" && !Array.isArray(body) &&
    typeof body.asset_id === "string"
      ? body.asset_id
      : null;
  if (!assetId) {
    return noStore({ error: "asset_id is required" }, { status: 400 });
  }
  let access;
  try { access = await getAssetAccess(assetId, user.id, "editor"); } catch { return noStore({ error: "Transcription service is unavailable", code: "BACKEND_UNAVAILABLE" }, { status: 503 }); }
  if (!access.ok) {
    return noStore({ error: access.error }, { status: access.status });
  }

  return noStore(
    {
      error: "The legacy transcription starter is disabled because it has no durable worker",
      next_endpoint: `/api/assets/${encodeURIComponent(assetId)}/transcript`,
      persistence: "not_written",
    },
    { status: 503 },
  );
}
