import { createSupabaseAuth } from "@/lib/supabase-auth";
import { apiError, apiJson } from "@/lib/api/responses";

export async function POST() {
  try {
    const supabase = await createSupabaseAuth();
    const { error } = await supabase.auth.signOut();
    if (error) return apiError("Authentication is temporarily unavailable.", "AUTH_UNAVAILABLE", 503);
    return apiJson({ success: true });
  } catch {
    return apiError("Authentication is temporarily unavailable.", "AUTH_UNAVAILABLE", 503);
  }
}
