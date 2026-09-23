import { getAssetAccess } from "@/lib/access-control";
import { apiError, backendUnavailable } from "@/lib/api/responses";
import { requireAuth } from "@/lib/auth";
import {
  selectPublishedHlsPublication,
  type PublishedHlsPublication,
} from "@/lib/media-pipeline/hls-delivery";
import { getSupabase } from "@/lib/supabase";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ViewerHlsAuthorityResult =
  | { ok: true; publication: PublishedHlsPublication }
  | { ok: false; response: Response };

/**
 * Signed-in asset viewers may play a published HLS ladder. This is not the
 * staff route: callers are not required to be staff.
 */
export async function authorizeViewerHlsPublication(
  versionId: string,
): Promise<ViewerHlsAuthorityResult> {
  try {
    const user = await requireAuth();
    if (!user) {
      return {
        ok: false,
        response: apiError("Authentication required", "AUTH_REQUIRED", 401),
      };
    }
    if (!UUID_PATTERN.test(versionId)) {
      return {
        ok: false,
        response: apiError("Media not found", "HLS_MEDIA_NOT_FOUND", 404),
      };
    }

    const supabase = getSupabase();
    const versionResult = await supabase
      .from("versions")
      .select("id, asset_id")
      .eq("id", versionId)
      .maybeSingle();
    if (versionResult.error) return { ok: false, response: backendUnavailable() };
    if (!versionResult.data || versionResult.data.id !== versionId) {
      return {
        ok: false,
        response: apiError("Media not found", "HLS_MEDIA_NOT_FOUND", 404),
      };
    }

    const assetId = versionResult.data.asset_id;
    if (typeof assetId !== "string" || !UUID_PATTERN.test(assetId)) {
      return {
        ok: false,
        response: apiError("Media not found", "HLS_MEDIA_NOT_FOUND", 404),
      };
    }

    const assetResult = await supabase
      .from("assets")
      .select("id, metadata")
      .eq("id", assetId)
      .is("deleted_at", null)
      .maybeSingle();
    if (assetResult.error) return { ok: false, response: backendUnavailable() };
    if (!assetResult.data) {
      return {
        ok: false,
        response: apiError("Media not found", "HLS_MEDIA_NOT_FOUND", 404),
      };
    }

    const access = await getAssetAccess(assetId, user.id, "viewer", supabase);
    if (!access.ok) {
      return {
        ok: false,
        response:
          access.status >= 500
            ? backendUnavailable()
            : apiError("Media not found", "HLS_MEDIA_NOT_FOUND", 404),
      };
    }

    const publication = selectPublishedHlsPublication({
      assetId,
      assetMetadata: assetResult.data.metadata,
      versionId,
      versionAssetId: assetId,
    });
    if (!publication) {
      return {
        ok: false,
        response: apiError("Media not found", "HLS_MEDIA_NOT_FOUND", 404),
      };
    }
    return { ok: true, publication };
  } catch {
    return { ok: false, response: backendUnavailable() };
  }
}
