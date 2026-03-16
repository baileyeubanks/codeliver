import { createSupabaseAuth } from "./supabase-auth";
import type { User } from "@supabase/supabase-js";

/**
 * Authenticate the user and return both the user object and a Supabase client
 * that carries the user's JWT — this client passes Row-Level Security (RLS)
 * policies, unlike the server-side service client.
 */
export async function requireAuthWithClient() {
  const supabase = await createSupabaseAuth();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null as User | null, supabase };
  return { user, supabase };
}
