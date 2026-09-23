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
  | { ok: false; response: Response; code: string };

/**
 * Only staff sessions may be given the staff playlist URL. Client and
 * legacy null-role sessions keep a client-authorized playback URL.
 */
export function staffHlsProjectionAllowed(
  identity: ServerIdentity | null | undefined,
): boolean {
  return resolveTrustedSurfaceRole(identity) === "staff";
}

async function authorizePublishedAssetHls(
  user: { id: string },
  assetId: string,
  versionId: string,
): Promise<StaffHlsAuthorityResult> {
  try {
    if (!UUID_PATTERN.test(assetId) || !UUID_PATTERN.test(versionId)) {
      return {
        ok: false,
        response: apiError("Media not found", "HLS_MEDIA_NOT_FOUND", 404),
        code: "HLS_MEDIA_NOT_FOUND",
      };
    }

    const supabase = getSupabase();
    const assetResult = await supabase
      .from("assets")
      .select("id, metadata")
      .eq("id", assetId)
      .is("deleted_at", null)
      .maybeSingle();
    if (assetResult.error) {
      return { ok: false, response: backendUnavailable(), code: "BACKEND_UNAVAILABLE" };
    }
    if (!assetResult.data) {
      return {
        ok: false,
        response: apiError("Media not found", "HLS_MEDIA_NOT_FOUND", 404),
        code: "HLS_MEDIA_NOT_FOUND",
      };
    }

    const versionResult = await supabase
      .from("versions")
      .select("id, asset_id")
      .eq("id", versionId)
      .eq("asset_id", assetId)
      .maybeSingle();
    if (versionResult.error) {
      return { ok: false, response: backendUnavailable(), code: "BACKEND_UNAVAILABLE" };
    }
    if (!versionResult.data) {
      return {
        ok: false,
        response: apiError("Media not found", "HLS_MEDIA_NOT_FOUND", 404),
        code: "HLS_MEDIA_NOT_FOUND",
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
        code: access.status >= 500 ? "BACKEND_UNAVAILABLE" : "HLS_MEDIA_NOT_FOUND",
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
        code: "HLS_MEDIA_NOT_FOUND",
      };
    }
    return { ok: true, publication };
  } catch {
    return { ok: false, response: backendUnavailable(), code: "BACKEND_UNAVAILABLE" };
  }
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
        code: "AUTH_REQUIRED",
      };
    }
    if (!staffHlsProjectionAllowed(user)) {
      return {
        ok: false,
        response: apiError("Staff access required", "STAFF_REQUIRED", 403),
        code: "STAFF_REQUIRED",
      };
    }
    return authorizePublishedAssetHls(user, assetId, versionId);
  } catch {
    return { ok: false, response: backendUnavailable(), code: "BACKEND_UNAVAILABLE" };
  }
}

/**
 * Asset-id parallel of authorizeStaffHlsPublication for a signed-in viewer.
 * Guest review keeps authorizeReviewerHlsPublication on the admission route.
 * This path has no staff role check; asset viewer access is the gate.
 */
export async function authorizeReviewerAssetHlsPublication(
  assetId: string,
  versionId: string,
): Promise<StaffHlsAuthorityResult> {
  try {
    const user = await requireAuth();
    if (!user) {
      return {
        ok: false,
        response: apiError("Authentication required", "AUTH_REQUIRED", 401),
        code: "AUTH_REQUIRED",
      };
    }
    return authorizePublishedAssetHls(user, assetId, versionId);
  } catch {
    return { ok: false, response: backendUnavailable(), code: "BACKEND_UNAVAILABLE" };
  }
}

/** Staff playback, or the reviewer/viewer parallel when the only miss is role. */
export async function authorizeAssetHlsRead(
  assetId: string,
  versionId: string,
): Promise<StaffHlsAuthorityResult> {
  const staff = await authorizeStaffHlsPublication(assetId, versionId);
  if (staff.ok || staff.code !== "STAFF_REQUIRED") return staff;
  return authorizeReviewerAssetHlsPublication(assetId, versionId);
}
