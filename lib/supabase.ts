import { createClient, SupabaseClient } from "@supabase/supabase-js";
// @ts-expect-error TS5097: Node's native TypeScript test runner requires explicit extensions.
import { getSupabaseDataSchema } from "./data-authority.ts";
// @ts-expect-error TS5097: Node's native TypeScript test runner requires explicit extensions.
import { getSupabaseServiceKey, getSupabaseServiceUrl } from "./server-env.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DataSupabaseClient = SupabaseClient<any, any, any>;

let _client: DataSupabaseClient | null = null;

export function getSupabase(): DataSupabaseClient {
  if (!_client) {
    const url = getSupabaseServiceUrl();
    const serviceKey = getSupabaseServiceKey();
    _client = createClient(
      url,
      serviceKey,
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
