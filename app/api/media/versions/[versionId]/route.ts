import { NextRequest } from "next/server";

import { getAssetAccess } from "@/lib/access-control";
import { apiError, backendUnavailable } from "@/lib/api/responses";
import { isBackendUnavailableError } from "@/lib/api/backend";
import { requireAuth } from "@/lib/auth";
import {
  normalizeManagedVersionMediaRecord,
  serveManagedVersionMedia,
} from "@/lib/media/managed-version-response";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function serveVersionMedia(
  request: NextRequest,
  { params }: { params: Promise<{ versionId: string }> },
  headOnly: boolean,
) {
  try {
    let user: Awaited<ReturnType<typeof requireAuth>>;
    try {
      user = await requireAuth();
    } catch (error) {
      return isBackendUnavailableError(error)
        ? backendUnavailable()
        : apiError(
            "Authentication service is unavailable",
            "AUTH_UNAVAILABLE",
            503,
          );
    }
    if (!user) {
      return apiError("Authentication required", "AUTH_REQUIRED", 401);
    }

    const { versionId } = await params;
    if (!UUID_PATTERN.test(versionId)) {
      return apiError("Version id is invalid", "INVALID_VERSION_ID", 400);
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("versions")
      .select(
        "id, asset_id, file_size, storage_provider, storage_object_key, storage_sha256, storage_provider_version_id, original_filename, mime_type",
      )
      .eq("id", versionId)
      .maybeSingle();
    if (error) return backendUnavailable();
    if (!data) return apiError("Media not found", "MEDIA_NOT_FOUND", 404);

    const version = normalizeManagedVersionMediaRecord(data);
    if (!version || version.id !== versionId) return backendUnavailable();

    const activeAsset = await supabase
      .from("assets")
      .select("id")
      .eq("id", version.asset_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (activeAsset.error) return backendUnavailable();
    if (!activeAsset.data) {
      return apiError("Media not found", "MEDIA_NOT_FOUND", 404);
    }

    const access = await getAssetAccess(
      version.asset_id,
      user.id,
      "viewer",
      supabase,
    );
    if (!access.ok) {
      return access.status >= 500
        ? backendUnavailable()
        : apiError("Media not found", "MEDIA_NOT_FOUND", 404);
    }

    return serveManagedVersionMedia({
      request,
      media: version,
      headOnly,
      allowDownload: true,
      vary: "Cookie, Authorization",
    });
  } catch {
    return backendUnavailable();
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ versionId: string }> },
) {
  return serveVersionMedia(request, context, false);
}

export async function HEAD(
  request: NextRequest,
  context: { params: Promise<{ versionId: string }> },
) {
  return serveVersionMedia(request, context, true);
}
