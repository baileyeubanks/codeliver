// @ts-expect-error TS5097: Node's native TypeScript test runner requires explicit extensions.
import { resolveSurfaceOrigin } from "./surface-origins.ts";

function requireValue(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getSupabaseServiceUrl(): string {
  const value = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  return requireValue(value, "SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
}

export function getSupabaseServiceKey(): string {
  return requireValue(process.env.SUPABASE_SERVICE_KEY, "SUPABASE_SERVICE_KEY");
}

export function getAdminSiteUrl(): string {
  return resolveSurfaceOrigin({
    surface: "admin",
    candidates: [
      { name: "ADMIN_SITE_URL", value: process.env.ADMIN_SITE_URL },
      {
        name: "NEXT_PUBLIC_ADMIN_SITE_URL",
        value: process.env.NEXT_PUBLIC_ADMIN_SITE_URL,
      },
    ],
    environment: process.env.NODE_ENV,
    localPort: process.env.PORT,
  });
}

export function getClientSiteUrl(): string {
  return resolveSurfaceOrigin({
    surface: "client",
    candidates: [
      { name: "CLIENT_SITE_URL", value: process.env.CLIENT_SITE_URL },
      {
        name: "NEXT_PUBLIC_CLIENT_SITE_URL",
        value: process.env.NEXT_PUBLIC_CLIENT_SITE_URL,
      },
    ],
    environment: process.env.NODE_ENV,
    localPort: process.env.PORT,
  });
}

// Kept for internal callers while they migrate to the explicit surface name.
export function getSiteUrl(): string {
  return getAdminSiteUrl();
}
