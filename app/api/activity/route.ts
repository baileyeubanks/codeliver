import { requireAuthWithClient } from "@/lib/auth-client";
import { apiError, apiJson, backendUnavailable } from "@/lib/api/responses";
import { isBackendUnavailableError } from "@/lib/api/backend";

export async function GET() {
  let user: Awaited<ReturnType<typeof requireAuthWithClient>>["user"];
  let supabase: Awaited<ReturnType<typeof requireAuthWithClient>>["supabase"];
  try {
    ({ user, supabase } = await requireAuthWithClient());
  } catch (error) {
    return isBackendUnavailableError(error)
      ? backendUnavailable()
      : apiError("Authentication service is unavailable", "AUTH_UNAVAILABLE", 503);
  }
  if (!user) return apiError("Unauthorized", "UNAUTHORIZED", 401);

  try {
    const { data, error } = await supabase
      .from("activity_log")
      .select("*, projects!inner(owner_id)")
      .eq("projects.owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return backendUnavailable();
    }
    return apiJson({ items: data ?? [] });
  } catch {
    return backendUnavailable();
  }
}
