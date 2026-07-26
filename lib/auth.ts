import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { createSupabaseAuth } from "./supabase-auth";
import { BackendUnavailableError } from "./api/backend";

export async function requireAuth() {
  try {
    const supabase = await createSupabaseAuth();
    const { data, error } = await supabase.auth.getUser();
    if (isAuthSessionMissingError(error)) return null;
    if (error) throw new Error("Authentication provider rejected the request");
    return data.user ?? null;
  } catch {
    throw new BackendUnavailableError("Authentication backend");
  }
}
