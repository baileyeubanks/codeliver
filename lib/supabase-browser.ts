"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseBrowserDataSchema } from "@/lib/data-authority";
import { getSupabaseAnonKey, getSupabasePublicUrl } from "@/lib/public-env";

export function createSupabaseBrowser() {
  return createBrowserClient(getSupabasePublicUrl(), getSupabaseAnonKey(), {
    db: { schema: getSupabaseBrowserDataSchema() },
  });
}
