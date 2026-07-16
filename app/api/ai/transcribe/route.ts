import { NextResponse } from "next/server";
import { getAssetAccess } from "@/lib/access-control";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { resolveAssetVersion } from "@/lib/versions";

function noStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET(request: Request) {
  const user = await requireAuth();
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

  const access = await getAssetAccess(assetId, user.id, "viewer");
  if (!access.ok) {
    return noStore({ error: access.error }, { status: access.status });
  }
  const version = await resolveAssetVersion({ assetId, versionId });
  if (!version.ok) {
    return noStore({ error: version.error }, { status: version.status });
  }

  const { data, error } = await getSupabase()
    .from("transcriptions")
    .select("id, asset_id, version_id, language, status, segments, created_at")
    .eq("asset_id", assetId)
    .eq("version_id", versionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return noStore(
      { error: "Transcription data is temporarily unavailable" },
      { status: 503 },
    );
  }
  return noStore({ transcription: data ?? null, version: version.version });
}

export async function POST(request: Request) {
  const user = await requireAuth();
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
  const access = await getAssetAccess(assetId, user.id, "editor");
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
