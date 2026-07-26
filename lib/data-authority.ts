export const LEGACY_DATA_SCHEMA = "public" as const;
export const CO_PRODUCTION_DATA_SCHEMA = "co_production" as const;

export type SupabaseDataSchema =
  | typeof LEGACY_DATA_SCHEMA
  | typeof CO_PRODUCTION_DATA_SCHEMA;

type DataAudience = "server" | "browser";

export interface DataSchemaInput {
  audience: DataAudience;
  environment?: string;
  serverSchema?: string;
  browserSchema?: string;
}

function normalizeSchema(
  value: string | undefined,
  variable: string,
): SupabaseDataSchema | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;

  if (
    normalized !== LEGACY_DATA_SCHEMA &&
    normalized !== CO_PRODUCTION_DATA_SCHEMA
  ) {
    throw new Error(
      `${variable} must be ${CO_PRODUCTION_DATA_SCHEMA} or ${LEGACY_DATA_SCHEMA}`,
    );
  }

  return normalized;
}

/**
 * Production must use the isolated Co-Production schema on both server and
 * browser clients. Development defaults to the legacy schema so the current
 * demo can run while the isolated authority is proven in staging.
 */
export function resolveSupabaseDataSchema({
  audience,
  environment = "development",
  serverSchema,
  browserSchema,
}: DataSchemaInput): SupabaseDataSchema {
  const server = normalizeSchema(serverSchema, "SUPABASE_DATA_SCHEMA");
  const browser = normalizeSchema(
    browserSchema,
    "NEXT_PUBLIC_SUPABASE_DATA_SCHEMA",
  );

  if (server && browser && server !== browser) {
    throw new Error(
      "SUPABASE_DATA_SCHEMA and NEXT_PUBLIC_SUPABASE_DATA_SCHEMA must match",
    );
  }

  if (environment === "production") {
    if (audience === "server" && server !== CO_PRODUCTION_DATA_SCHEMA) {
      throw new Error(
        `Production requires SUPABASE_DATA_SCHEMA=${CO_PRODUCTION_DATA_SCHEMA}`,
      );
    }
    if (browser !== CO_PRODUCTION_DATA_SCHEMA) {
      throw new Error(
        `Production requires NEXT_PUBLIC_SUPABASE_DATA_SCHEMA=${CO_PRODUCTION_DATA_SCHEMA}`,
      );
    }
    return CO_PRODUCTION_DATA_SCHEMA;
  }

  if (audience === "browser") {
    return browser ?? server ?? LEGACY_DATA_SCHEMA;
  }

  return server ?? browser ?? LEGACY_DATA_SCHEMA;
}

export function getSupabaseDataSchema(): SupabaseDataSchema {
  return resolveSupabaseDataSchema({
    audience: "server",
    environment: process.env.NODE_ENV,
    serverSchema: process.env.SUPABASE_DATA_SCHEMA,
    browserSchema: process.env.NEXT_PUBLIC_SUPABASE_DATA_SCHEMA,
  });
}

export function getSupabaseBrowserDataSchema(): SupabaseDataSchema {
  return resolveSupabaseDataSchema({
    audience: "browser",
    environment: process.env.NODE_ENV,
    browserSchema: process.env.NEXT_PUBLIC_SUPABASE_DATA_SCHEMA,
  });
}
