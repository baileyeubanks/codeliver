import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseDataSchema } from "./data-authority.ts";
import {
  getSupabaseServiceKey,
  getSupabaseServiceUrl,
} from "./server-env.ts";

// Supabase's generated client requires open generics for a runtime-selected schema.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    const client = getSupabase();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
