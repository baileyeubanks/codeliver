import { apiError, apiJson } from "@/lib/api/responses";
import { requireAuth } from "@/lib/auth";
import { resolveTrustedSurfaceRole } from "@/lib/auth/host-surface";
import { getAssetAccess } from "@/lib/access-control";
import {
  selectPublishedHlsPublication,
  selectPublishedProbeFrameRate,
} from "@/lib/media-pipeline/hls-delivery";
import { projectPlaybackFileUrl } from "@/lib/media-pipeline/hls-playback-url";
import { getSupabase } from "@/lib/supabase";
import { versionUploadRetiredResponse } from "@/lib/versions/retirement";
import { withAssetRouteBoundary } from "../../asset-route-boundary";

const NextResponse = { json: (body: Record<string, unknown>, init: ResponseInit = {}) =>
  "error" in body && !body.code ? apiError(String(body.error), init.status === 401 ? "UNAUTHORIZED" : init.status === 404 ? "NOT_FOUND" : init.status && init.status >= 500 ? "BACKEND_UNAVAILABLE" : "INVALID_REQUEST", init.status ?? 400, init.headers) : apiJson(body, init) };

async function GETHandler(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabase();
  const assetAccess = await getAssetAccess(id, user.id, "viewer", supabase);
  if (!assetAccess.ok) {
    return NextResponse.json({ error: assetAccess.error }, { status: assetAccess.status });
  }

  const assetResult = await supabase
    .from("assets")
    .select("id, metadata")
    .eq("id", id)
    .maybeSingle();
  if (assetResult.error) {
    return apiError("Asset versions are unavailable", "BACKEND_UNAVAILABLE", 503);
  }

  const { data, error } = await supabase
    .from("versions")
    .select(
      "id, asset_id, version_number, file_url, file_size, notes, uploaded_by, is_current, thumbnail_url, duration_seconds, resolution, created_at, updated_at",
    )
    .eq("asset_id", id)
    .order("version_number", { ascending: false });

  if (error) return apiError("Asset versions are unavailable", "BACKEND_UNAVAILABLE", 503);
  const audience = resolveTrustedSurfaceRole(user) === "staff" ? "staff" : "client";
  const items = (data ?? []).map((version) => {
    const pipelineInput = assetResult.data
      ? {
          assetId: id,
          assetMetadata: assetResult.data.metadata,
          versionId: version.id,
          versionAssetId: version.asset_id,
        }
      : null;
    const publication = pipelineInput ? selectPublishedHlsPublication(pipelineInput) : null;
    const frameRate = pipelineInput ? selectPublishedProbeFrameRate(pipelineInput) : null;
    const storedFileUrl = typeof version.file_url === "string" ? version.file_url : null;
    const fileUrl = projectPlaybackFileUrl({
      audience,
      published: Boolean(publication),
      assetId: id,
      versionId: version.id,
      storedFileUrl,
    });
    return {
      ...version,
      ...(fileUrl ? { file_url: fileUrl } : {}),
      frame_rate: publication ? frameRate : null,
    };
  });
  return NextResponse.json({ items });
}

async function POSTHandler() {
  return versionUploadRetiredResponse();
}

export const GET = withAssetRouteBoundary(GETHandler);
export const POST = withAssetRouteBoundary(POSTHandler);
