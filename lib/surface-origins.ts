export type SiteSurface = "admin" | "client";

export interface SurfaceOriginCandidate {
  name: string;
  value: string | undefined;
}

export interface ResolveSurfaceOriginOptions {
  surface: SiteSurface;
  candidates?: SurfaceOriginCandidate[];
  environment?: string;
  runtimeOrigin?: string;
  localPort?: string | number;
}

export const CANONICAL_PRODUCTION_ORIGIN = "https://co-videopro.com";
export const ADMIN_PRODUCTION_ORIGIN = CANONICAL_PRODUCTION_ORIGIN;
export const CLIENT_PRODUCTION_ORIGIN = CANONICAL_PRODUCTION_ORIGIN;
export const DEFAULT_LOCAL_ORIGIN = "http://localhost:4103";

const CONTROL_OR_BACKSLASH = /[\\\u0000-\u001f\u007f]/;

function productionOrigin(surface: SiteSurface): string {
  return surface === "admin" ? ADMIN_PRODUCTION_ORIGIN : CLIENT_PRODUCTION_ORIGIN;
}

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "[::1]" ||
    /^127(?:\.\d{1,3}){3}$/.test(normalized)
  );
}

function isLocalOrigin(origin: string): boolean {
  return isLocalHostname(new URL(origin).hostname);
}

function localOrigin(port: string | number | undefined): string {
  if (port === undefined || port === "") return DEFAULT_LOCAL_ORIGIN;

  const normalizedPort = String(port).trim();
  if (!/^\d+$/.test(normalizedPort)) {
    throw new Error(`Invalid local site port: ${String(port)}`);
  }

  const numericPort = Number.parseInt(normalizedPort, 10);
  if (numericPort < 1 || numericPort > 65_535) {
    throw new Error(`Invalid local site port: ${String(port)}`);
  }

  return `http://localhost:${numericPort}`;
}

export function normalizeSurfaceOrigin(value: string, name: string): string {
  const trimmed = value.trim();
  if (!trimmed || CONTROL_OR_BACKSLASH.test(trimmed)) {
    throw new Error(`Invalid URL in ${name}: ${value}`);
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Invalid URL in ${name}: ${value}`);
  }

  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.hostname.endsWith(".")
  ) {
    throw new Error(`${name} must be an HTTP(S) origin without credentials, path, query, or hash`);
  }

  if (parsed.protocol === "http:" && !isLocalHostname(parsed.hostname)) {
    throw new Error(`${name} must use HTTPS unless it is a loopback origin`);
  }

  return parsed.origin;
}

function assertOriginMatchesSurface({
  origin,
  surface,
  environment,
  name,
}: {
  origin: string;
  surface: SiteSurface;
  environment: string | undefined;
  name: string;
}) {
  const canonicalOrigin = productionOrigin(surface);
  if (environment === "production") {
    if (origin !== canonicalOrigin) {
      throw new Error(`${name} must be ${canonicalOrigin} in production`);
    }
    return;
  }

  if (origin !== canonicalOrigin && !isLocalOrigin(origin)) {
    throw new Error(`${name} must use ${canonicalOrigin} or a loopback origin`);
  }
}

export function resolveSurfaceOrigin({
  surface,
  candidates = [],
  environment,
  runtimeOrigin,
  localPort,
}: ResolveSurfaceOriginOptions): string {
  const configured = candidates.flatMap(({ name, value }) => {
    if (value === undefined || value === "") return [];

    const origin = normalizeSurfaceOrigin(value, name);
    assertOriginMatchesSurface({ origin, surface, environment, name });
    return [{ name, origin }];
  });

  if (configured.length > 1) {
    const expected = configured[0].origin;
    const mismatch = configured.find(({ origin }) => origin !== expected);
    if (mismatch) {
      throw new Error(
        `${configured[0].name} and ${mismatch.name} must resolve to the same origin`,
      );
    }
  }

  if (configured[0]) return configured[0].origin;
  if (environment === "production") return productionOrigin(surface);

  if (runtimeOrigin) {
    const origin = normalizeSurfaceOrigin(runtimeOrigin, "window.location.origin");
    assertOriginMatchesSurface({
      origin,
      surface,
      environment,
      name: "window.location.origin",
    });
    return origin;
  }

  return localOrigin(localPort);
}

export function getBrowserAdminSiteUrl(runtimeOrigin?: string): string {
  return resolveSurfaceOrigin({
    surface: "admin",
    candidates: [
      {
        name: "NEXT_PUBLIC_ADMIN_SITE_URL",
        value: process.env.NEXT_PUBLIC_ADMIN_SITE_URL,
      },
    ],
    environment: process.env.NODE_ENV,
    runtimeOrigin,
  });
}

export function getBrowserClientSiteUrl(runtimeOrigin?: string): string {
  return resolveSurfaceOrigin({
    surface: "client",
    candidates: [
      {
        name: "NEXT_PUBLIC_CLIENT_SITE_URL",
        value: process.env.NEXT_PUBLIC_CLIENT_SITE_URL,
      },
    ],
    environment: process.env.NODE_ENV,
    runtimeOrigin,
  });
}

function decodedPathname(pathname: string): string {
  let decoded = pathname;

  try {
    for (let pass = 0; pass < 3; pass += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
  } catch {
    throw new Error(`Invalid surface URL path: ${pathname}`);
  }

  return decoded;
}

export function buildSurfaceUrl(origin: string, destination: string): string {
  const normalizedOrigin = normalizeSurfaceOrigin(origin, "surface origin");
  const trimmed = destination.trim();
  if (!trimmed || CONTROL_OR_BACKSLASH.test(trimmed)) {
    throw new Error(`Invalid surface URL destination: ${destination}`);
  }

  let parsed: URL;
  try {
    if (trimmed.startsWith("/")) {
      if (trimmed.startsWith("//")) {
        throw new Error("Protocol-relative destinations are not allowed");
      }
      parsed = new URL(trimmed, `${normalizedOrigin}/`);
    } else {
      parsed = new URL(trimmed);
      if (
        (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
        parsed.username ||
        parsed.password ||
        (parsed.protocol === "http:" && !isLocalHostname(parsed.hostname))
      ) {
        throw new Error("Unsafe absolute destination");
      }
    }
  } catch {
    throw new Error(`Invalid surface URL destination: ${destination}`);
  }

  const decodedPath = decodedPathname(parsed.pathname);
  if (
    decodedPath.startsWith("//") ||
    CONTROL_OR_BACKSLASH.test(decodedPath)
  ) {
    throw new Error(`Invalid surface URL destination: ${destination}`);
  }

  const rebased = new URL(
    `${parsed.pathname}${parsed.search}${parsed.hash}`,
    `${normalizedOrigin}/`,
  );
  if (rebased.origin !== normalizedOrigin) {
    throw new Error(`Invalid surface URL destination: ${destination}`);
  }

  return rebased.toString();
}

export function toAdminSiteUrl(destination: string, runtimeOrigin?: string): string {
  return buildSurfaceUrl(getBrowserAdminSiteUrl(runtimeOrigin), destination);
}

export function toClientSiteUrl(destination: string, runtimeOrigin?: string): string {
  return buildSurfaceUrl(getBrowserClientSiteUrl(runtimeOrigin), destination);
}

export function getDemoSiteUrl(runtimeOrigin: string): string {
  const normalizedRuntimeOrigin = normalizeSurfaceOrigin(
    runtimeOrigin,
    "window.location.origin",
  );
  return isLocalOrigin(normalizedRuntimeOrigin)
    ? normalizedRuntimeOrigin
    : getBrowserClientSiteUrl(runtimeOrigin);
}

export function toDemoSiteUrl(destination: string, runtimeOrigin: string): string {
  return buildSurfaceUrl(getDemoSiteUrl(runtimeOrigin), destination);
}
