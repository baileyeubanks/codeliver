"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabasePublicUrl } from "@/lib/public-env";

export function createSupabaseBrowser() {
  return createBrowserClient(getSupabasePublicUrl(), getSupabaseAnonKey());
}
