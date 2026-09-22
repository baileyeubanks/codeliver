import { requireAuthWithClient } from "@/lib/auth-client";
import { getProjectAccess } from "@/lib/access-control";
import { apiError, apiJson, backendUnavailable } from "@/lib/api/responses";
import { selectPublishedHlsPublication } from "@/lib/media-pipeline/hls-delivery";
import { getSupabase } from "@/lib/supabase";
import { legacyUploadRetiredResponse } from "@/lib/tus/legacy-retirement";

async function authenticatedClient() {
  try {
    const context = await requireAuthWithClient();
    if (!context.user) return { response: apiError("Unauthorized", "UNAUTHORIZED", 401) };
    return { ...context };
  } catch {
    return { response: backendUnavailable() };
  }
}

function accessFailure(access: { status: number; error: string }) {
  if (access.status >= 500) return backendUnavailable();
  return apiError(access.error, "PROJECT_NOT_FOUND", access.status);
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authenticatedClient();
  if ("response" in context) return context.response;
  const { user, supabase: authSupabase } = context;
  if (!user) return backendUnavailable();

  try {
    const { id } = await params;
    const projectAccess = await getProjectAccess(
      id,
      user.id,
      "viewer",
      authSupabase,
    );
    if (!projectAccess.ok) return accessFailure(projectAccess);

    const { data, error } = await authSupabase
      .from("assets")
      .select(
        "id, project_id, folder_id, title, file_type, file_url, thumbnail_url, proxy_url, file_size, duration_seconds, status, position, uploaded_by, created_at, updated_at, comments(count), approvals(id, status, step_order, role_label, assignee_email), versions(id)",
      )
      .eq("project_id", id)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });

    if (error) {
      return backendUnavailable();
    }
    // Preserve permitted-ID counting; count(*) requires protected-column grants.
    const assets = (data ?? []).map(asset => ({
      ...asset, versions: [{ count: asset.versions?.length ?? 0 }],
    }));
    if (assets.length === 0) return apiJson({ items: [] });
    const metadataResult = await getSupabase()
      .from("assets")
      .select("id, metadata")
      .eq("project_id", id)
      .in("id", assets.map((asset) => asset.id))
      .is("deleted_at", null);
    if (metadataResult.error) return backendUnavailable();
    const metadataByAssetId = new Map(
      (metadataResult.data ?? []).map((row) => [row.id, row.metadata]),
    );
    const items = assets.map((asset) => {
      const metadata = metadataByAssetId.get(asset.id);
      const pipeline =
        metadata && typeof metadata === "object" && !Array.isArray(metadata)
          ? (metadata as Record<string, unknown>).media_pipeline
          : null;
      const currentVersionId =
        pipeline && typeof pipeline === "object" && !Array.isArray(pipeline)
          ? (pipeline as Record<string, unknown>).currentVersionId
          : null;
      const publication =
        typeof currentVersionId === "string"
          ? selectPublishedHlsPublication({
              assetId: asset.id,
              assetMetadata: metadata,
              versionId: currentVersionId,
              versionAssetId: asset.id,
            })
          : null;
      return publication
        ? {
            ...asset,
            file_url: `/api/assets/${asset.id}/versions/${currentVersionId}/hls/playlist.m3u8`,
          }
        : asset;
    });
    return apiJson({ items });
  } catch {
    return backendUnavailable();
  }
}

export async function POST() {
  return legacyUploadRetiredResponse();
}
