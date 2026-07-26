import { createSupabaseAuth } from "./supabase-auth";
import type { User } from "@supabase/supabase-js";
import { BackendUnavailableError } from "./api/backend";

/**
 * Authenticate the user and return both the user object and a Supabase client
 * that carries the user's JWT — this client passes Row-Level Security (RLS)
 * policies, unlike the server-side service client.
 */
export async function requireAuthWithClient() {
  try {
    const supabase = await createSupabaseAuth();
    const { data, error } = await supabase.auth.getUser();
    if (error) throw new Error("Authentication provider rejected the request");
    return { user: (data.user ?? null) as User | null, supabase };
  } catch {
    throw new BackendUnavailableError("Authentication backend");
  }
}
