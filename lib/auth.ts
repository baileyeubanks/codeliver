import { createSupabaseAuth } from "./supabase-auth";

export async function requireAuth() {
  const supabase = await createSupabaseAuth();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return user;
}
