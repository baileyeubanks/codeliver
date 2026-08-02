/** Host surface law — see contentco-op/CCO_PRODUCT_CANON.md
 *
 * - admin.contentco-op.com → CCO OS commercial (NOT this app)
 * - co-videopro.com → Co-VideoPro staff/unified product surface
 * - client.contentco-op.com → Co-VideoPro client role
 *
 * Internal HostSurface "admin" means staff surface on co-videopro.com —
 * it is NOT the admin.contentco-op.com DNS host.
 */

/** CCO OS commercial host — never treated as a Co-VideoPro surface. */
export const CCO_OS_ADMIN_HOST = "admin.contentco-op.com";
/** @deprecated Use CCO_OS_ADMIN_HOST. Not a Co-VideoPro staff host. */
export const ADMIN_SURFACE_HOST = CCO_OS_ADMIN_HOST;

export const CLIENT_SURFACE_HOST = "client.contentco-op.com";
/** Canonical unified product host for Co-VideoPro (staff + studio). */
export const APP_SURFACE_HOST = "co-videopro.com";
export const LOGIN_PATH = "/login";

const AUTH_RETURN_BASE_URL = "https://co-videopro.com";
const DEFAULT_RETURN_PATH = "/projects";
const APP_SURFACE_HOSTS = new Set<string>([APP_SURFACE_HOST, `www.${APP_SURFACE_HOST}`]);

/** "admin" = staff surface (co-videopro.com). "client" = client.contentco-op.com. */
export type HostSurface = "admin" | "client";
export type TrustedSurfaceRole = "staff" | "client";

export interface ServerIdentity {
  app_metadata?: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizedHostname(hostHeader: string | null | undefined): string | null {
  const value = hostHeader?.trim();
  if (!value) return null;

  try {
    const parsed = new URL(`https://${value}`);
    if (
      parsed.username ||
      parsed.password ||
      parsed.port ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }

    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Co-VideoPro role surfaces only.
 * admin.contentco-op.com returns null — that host is CCO OS.
 */
export function resolveHostSurface(
  hostHeader: string | null | undefined,
): HostSurface | null {
  const hostname = normalizedHostname(hostHeader);
  if (!hostname) return null;
  if (hostname === CCO_OS_ADMIN_HOST) return null;
  if (hostname === CLIENT_SURFACE_HOST) return "client";
  if (APP_SURFACE_HOSTS.has(hostname)) return "admin";
  return null;
}

/** True for the unified Co-VideoPro product host (and www). */
export function isAppProductHost(hostHeader: string | null | undefined): boolean {
  const hostname = normalizedHostname(hostHeader);
  return hostname !== null && APP_SURFACE_HOSTS.has(hostname);
}

/** True when host belongs to CCO OS commercial (not Co-VideoPro). */
export function isCcoOsAdminHost(hostHeader: string | null | undefined): boolean {
  return normalizedHostname(hostHeader) === CCO_OS_ADMIN_HOST;
}

/** Approved Co-VideoPro production hosts only (excludes admin.contentco-op.com). */
export function isApprovedProductionHost(
  hostHeader: string | null | undefined,
): boolean {
  return resolveHostSurface(hostHeader) !== null;
}

export function resolveTrustedSurfaceRole(
  identity: ServerIdentity | null | undefined,
): TrustedSurfaceRole | null {
  const metadata = asRecord(identity?.app_metadata);
  if (!metadata) return null;

  const role = metadata.content_coop_role;
  return role === "staff" || role === "client" ? role : null;
}

export function surfaceForRole(role: TrustedSurfaceRole): HostSurface {
  return role === "staff" ? "admin" : "client";
}

export function hostForSurface(surface: HostSurface): string {
  return surface === "admin" ? APP_SURFACE_HOST : CLIENT_SURFACE_HOST;
}

export function roleCanAccessSurface(
  role: TrustedSurfaceRole | null,
  surface: HostSurface,
): boolean {
  return role !== null && surfaceForRole(role) === surface;
}

function decodedPathname(pathname: string): string | null {
  let decoded = pathname;

  try {
    for (let pass = 0; pass < 3; pass += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
  } catch {
    return null;
  }

  return decoded;
}

export function buildProtectedReturnPath(pathname: string, search = ""): string {
  const serverVisibleSearch = search.split("#", 1)[0];
  const requestedPath = `${pathname}${serverVisibleSearch}`;

  if (
    !requestedPath.startsWith("/") ||
    requestedPath.startsWith("//") ||
    /\\|[\u0000-\u001f\u007f]/.test(requestedPath)
  ) {
    return DEFAULT_RETURN_PATH;
  }

  try {
    const base = new URL(AUTH_RETURN_BASE_URL);
    const candidate = new URL(requestedPath, base);
    const decoded = decodedPathname(candidate.pathname);

    if (
      candidate.origin !== base.origin ||
      !decoded ||
      decoded.startsWith("//") ||
      /\\|[\u0000-\u001f\u007f]/.test(decoded) ||
      /^\/(?:login|signup|auth|api\/auth)(?:\/|$)/i.test(decoded)
    ) {
      return DEFAULT_RETURN_PATH;
    }

    candidate.hash = "";
    const demoValues = candidate.searchParams.getAll("demo");
    if (demoValues.length > 1) {
      candidate.searchParams.set("demo", demoValues[0]);
    }

    return `${candidate.pathname}${candidate.search}`;
  } catch {
    return DEFAULT_RETURN_PATH;
  }
}

export function buildSurfaceUrl(
  surface: HostSurface,
  returnPath: string,
): URL {
  const safeReturnPath = buildProtectedReturnPath(returnPath);
  return new URL(safeReturnPath, `https://${hostForSurface(surface)}`);
}

/** Send browsers that hit Co-VideoPro code on the CCO OS admin host to CCO OS. */
export function ccoOsAdminRedirectUrl(pathname = "/os"): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const dest = path === "/" || path.startsWith("/os") ? (path === "/" ? "/os" : path) : "/os";
  return `https://${CCO_OS_ADMIN_HOST}${dest}`;
}
