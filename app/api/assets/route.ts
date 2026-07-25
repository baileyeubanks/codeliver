import { apiError, apiJson, backendUnavailable } from "@/lib/api/responses";
import { requireAuthWithClient } from "@/lib/auth-client";

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
    const { data, error } = await supabase
      .from("assets")
      .select("*, projects!inner(owner_id)")
      .eq("projects.owner_id", user.id)
      .order("updated_at", { ascending: false });

    if (error) {
      return backendUnavailable();
    }
    return apiJson({ items: data ?? [] });
  } catch {
    return backendUnavailable();
  }
}
