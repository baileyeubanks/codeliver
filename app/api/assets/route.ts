import { apiError, apiJson, backendUnavailable } from "@/lib/api/responses";
import { requireAuthWithClient } from "@/lib/auth-client";
import { getSupabaseDataSchema } from "@/lib/data-authority";

const SAFE_ASSET_COLUMNS =
  "id, project_id, folder_id, title, file_type, file_url, thumbnail_url, proxy_url, file_size, duration_seconds, status, position, deleted_at, uploaded_by, created_at, updated_at";

export async function GET() {
  let auth: Awaited<ReturnType<typeof requireAuthWithClient>>;
  try {
    auth = await requireAuthWithClient();
  } catch {
    return backendUnavailable();
  }
  const { user, supabase } = auth;
  if (!user) {
    return apiError("Authentication required", "AUTH_REQUIRED", 401);
  }

  try {
    const isolated = getSupabaseDataSchema() === "co_production";
    let query = supabase
      .from("assets")
      .select(
        isolated
          ? SAFE_ASSET_COLUMNS
          : `${SAFE_ASSET_COLUMNS}, projects!inner(owner_id)`,
      );
    if (!isolated) {
      query = query.eq("projects.owner_id", user.id);
    }
    const { data, error } = await query
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });

    if (error) {
      return backendUnavailable();
    }
    return apiJson({ items: data ?? [] });
  } catch {
    return backendUnavailable();
  }
}
