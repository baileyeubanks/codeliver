function requireValue(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function normalizeUrl(value: string, name: string): string {
  const trimmed = value.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    return new URL(withProtocol).toString().replace(/\/$/, "");
  } catch {
    throw new Error(`Invalid URL in ${name}: ${value}`);
  }
}

export function getSupabaseServiceUrl(): string {
  const value = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  return requireValue(value, "SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
}

export function getSupabaseServiceKey(): string {
  return requireValue(process.env.SUPABASE_SERVICE_KEY, "SUPABASE_SERVICE_KEY");
}

export function getSiteUrl(): string {
  const candidates: Array<[string, string | undefined]> = [
    ["SITE_URL", process.env.SITE_URL],
    ["NEXT_PUBLIC_SITE_URL", process.env.NEXT_PUBLIC_SITE_URL],
    ["DEPLOY_PRIME_URL", process.env.DEPLOY_PRIME_URL],
    ["URL", process.env.URL],
    ["VERCEL_URL", process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined],
  ];

  for (const [name, value] of candidates) {
    if (value) {
      return normalizeUrl(value, name);
    }
  }

  return `http://localhost:${process.env.PORT ?? "4103"}`;
}
