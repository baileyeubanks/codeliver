import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseDataSchema } from "@/lib/data-authority";
import {
  getSupabaseServiceKey,
  getSupabaseServiceUrl,
} from "@/lib/server-env";

export type DataSupabaseClient = SupabaseClient<any, any, any>;

let _client: DataSupabaseClient | null = null;

export function getSupabase(): DataSupabaseClient {
  if (!_client) {
    _client = createClient(
      getSupabaseServiceUrl(),
      getSupabaseServiceKey(),
      {
        db: { schema: getSupabaseDataSchema() },
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      },
    );
  }
  return _client;
}

export const supabase = new Proxy({} as DataSupabaseClient, {
  get(_target, prop) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (getSupabase() as any)[prop];
  },
});
