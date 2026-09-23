import { getAssetAccess } from "@/lib/access-control";
import { apiError, backendUnavailable } from "@/lib/api/responses";
import { requireAuth } from "@/lib/auth";
import {
  resolveTrustedSurfaceRole,
  type ServerIdentity,
} from "@/lib/auth/host-surface";
import {
  selectPublishedHlsPublication,
  type PublishedHlsPublication,
} from "@/lib/media-pipeline/hls-delivery";
import { getSupabase } from "@/lib/supabase";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type StaffHlsAuthorityResult =
  | { ok: true; publication: PublishedHlsPublication }
  | { ok: false; response: Response };

/**
 * The staff HLS playlist route answers 403 STAFF_REQUIRED for anyone whose
 * trusted surface role is not staff, so a payload must never project that
 * URL into a non-staff session — a client (or legacy null-role) session
 * would hold a dead readyState-0 frame. Non-staff callers keep the version's
 * plain managed file_url; client paint flows through the admission-bound
 * review media path (`/api/review/media/[admissionId]/hls/...`).
 */
export function staffHlsProjectionAllowed(
  identity: ServerIdentity | null | undefined,
): boolean {
  return resolveTrustedSurfaceRole(identity) === "staff";
}

export async function authorizeStaffHlsPublication(
  assetId: string,
  versionId: string,
): Promise<StaffHlsAuthorityResult> {
  try {
    const user = await requireAuth();
    if (!user) {
      return {
        ok: false,
        response: apiError("Authentication required", "AUTH_REQUIRED", 401),
      };
    }
    if (resolveTrustedSurfaceRole(user) !== "staff") {
      return {
        ok: false,
        response: apiError("Staff access required", "STAFF_REQUIRED", 403),
      };
    }
    if (!UUID_PATTERN.test(assetId) || !UUID_PATTERN.test(versionId)) {
      return {
        ok: false,
        response: apiError("Media not found", "HLS_MEDIA_NOT_FOUND", 404),
      };
    }

    const supabase = getSupabase();
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

    const versionResult = await supabase
      .from("versions")
      .select("id, asset_id")
      .eq("id", versionId)
      .eq("asset_id", assetId)
      .maybeSingle();
    if (versionResult.error) return { ok: false, response: backendUnavailable() };
    if (!versionResult.data) {
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
      versionAssetId: versionResult.data.asset_id,
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
