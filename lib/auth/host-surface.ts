export const ADMIN_SURFACE_HOST = "admin.contentco-op.com";
export const CLIENT_SURFACE_HOST = "client.contentco-op.com";
export const CANONICAL_PRODUCT_HOST = "co-videopro.com";
export const CANONICAL_PRODUCT_WWW_HOST = "www.co-videopro.com";
export const LOGIN_PATH = "/login";
export const CLIENT_WORKSPACE_LANDING_PATH = "/reviews";

const AUTH_RETURN_BASE_URL = "https://co-deliver.local";
const DEFAULT_RETURN_PATH = "/projects";
const INVITE_RETURN_PATH_PATTERN = /^\/invite\/[A-Za-z0-9_-]{20,160}$/;

export type HostSurface = "canonical" | "admin" | "client";
export type RoleSurface = Exclude<HostSurface, "canonical">;
export type TrustedSurfaceRole = "staff" | "client";
export type ClientWorkspacePathDecision =
  | { action: "allow" }
  | { action: "redirect"; pathname: typeof CLIENT_WORKSPACE_LANDING_PATH }
  | { action: "deny" };

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

export function resolveHostSurface(
  hostHeader: string | null | undefined,
): HostSurface | null {
  const hostname = normalizedHostname(hostHeader);
  if (
    hostname === CANONICAL_PRODUCT_HOST ||
    hostname === CANONICAL_PRODUCT_WWW_HOST
  ) {
    return "canonical";
  }
  if (hostname === ADMIN_SURFACE_HOST) return "admin";
  if (hostname === CLIENT_SURFACE_HOST) return "client";
  return null;
}

export function resolveTrustedSurfaceRole(
  identity: ServerIdentity | null | undefined,
): TrustedSurfaceRole | null {
  const metadata = asRecord(identity?.app_metadata);
  if (!metadata) return null;

  const role = metadata.content_coop_role;
  return role === "staff" || role === "client" ? role : null;
}

export function surfaceForRole(role: TrustedSurfaceRole): RoleSurface {
  return role === "staff" ? "admin" : "client";
}

export function hostForSurface(surface: HostSurface): string {
  if (surface === "canonical") return CANONICAL_PRODUCT_HOST;
  return surface === "admin" ? ADMIN_SURFACE_HOST : CLIENT_SURFACE_HOST;
}

export function roleCanAccessSurface(
  role: TrustedSurfaceRole | null,
  surface: HostSurface,
): boolean {
  if (surface === "canonical") return role !== null;
  return role !== null && surfaceForRole(role) === surface;
}

export function clientWorkspacePathDecision(
  pathname: string,
): ClientWorkspacePathDecision {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

  if (normalized === CLIENT_WORKSPACE_LANDING_PATH) {
    return { action: "allow" };
  }

  if (normalized === "/" || normalized === "/projects") {
    return { action: "redirect", pathname: CLIENT_WORKSPACE_LANDING_PATH };
  }

  return { action: "deny" };
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

export function isInviteReturnPath(returnPath: string): boolean {
  const safeReturnPath = buildProtectedReturnPath(returnPath);
  return (
    safeReturnPath === returnPath &&
    INVITE_RETURN_PATH_PATTERN.test(safeReturnPath)
  );
}

export function buildSurfaceUrl(
  surface: HostSurface,
  returnPath: string,
): URL {
  const safeReturnPath = buildProtectedReturnPath(returnPath);
  return new URL(safeReturnPath, `https://${hostForSurface(surface)}`);
}
