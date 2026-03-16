import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseAnonKey, getSupabasePublicUrl } from "@/lib/public-env";

export async function createSupabaseAuth() {
  const cookieStore = await cookies();
  return createServerClient(
    getSupabasePublicUrl(),
    getSupabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // setAll can fail in Server Components — safe to ignore
          }
        },
      },
    },
  );
}
