import {
  AUTH_PASSWORD_MIN_LENGTH,
  normalizeCredentialEmail,
} from "../../lib/auth/credentials.ts";

export { AUTH_PASSWORD_MIN_LENGTH };

export interface SignupCredentials {
  email: string;
  password: string;
  confirmation: string;
}

export interface SignupValidationResult {
  email: string;
  error: string | null;
  field: SignupValidationField | null;
}

export type SignupValidationField = "email" | "password" | "confirmation";
export type AuthPagePath = "/login" | "/signup" | "/forgot-password";
export type AuthPortalSurface = "admin" | "client";

export interface SurfaceMismatchNotice {
  portalHref: string;
  portalLabel: string;
  requiredSurface: AuthPortalSurface;
}

const AUTH_PORTALS: Record<
  AuthPortalSurface,
  { label: string; origin: string }
> = {
  admin: {
    label: "Admin Portal",
    origin: "https://admin.contentco-op.com",
  },
  client: {
    label: "Client Portal",
    origin: "https://client.contentco-op.com",
  },
};

function decodedReturnPathname(pathname: string): string | null {
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

export function normalizeAuthEmail(value: string): string {
  return normalizeCredentialEmail(value);
}

export function validateSignupCredentials(
  credentials: SignupCredentials,
): SignupValidationResult {
  const email = normalizeAuthEmail(credentials.email);

  if (!email || !email.includes("@")) {
    return { email, error: "Enter a valid email address.", field: "email" };
  }

  if (credentials.password.length < AUTH_PASSWORD_MIN_LENGTH) {
    return {
      email,
      error: `Password must be at least ${AUTH_PASSWORD_MIN_LENGTH} characters.`,
      field: "password",
    };
  }

  if (credentials.password !== credentials.confirmation) {
    return { email, error: "Passwords do not match.", field: "confirmation" };
  }

  return { email, error: null, field: null };
}

export function resolveSafeReturnPath(
  requestedPath: string | null | undefined,
  fallback = "/projects",
): string {
  if (!requestedPath || !requestedPath.startsWith("/") || requestedPath.startsWith("//")) {
    return fallback;
  }

  if (/\\|[\u0000-\u001f\u007f]/.test(requestedPath)) {
    return fallback;
  }

  try {
    const base = new URL("https://co-deliver.local");
    const candidate = new URL(requestedPath, base);
    const decodedPathname = decodedReturnPathname(candidate.pathname);

    if (
      candidate.origin !== base.origin ||
      !decodedPathname ||
      decodedPathname.startsWith("//") ||
      /\\|[\u0000-\u001f\u007f]/.test(decodedPathname) ||
      /^\/(?:login|signup|forgot-password|reset-password|onboarding|auth|api\/auth)(?:\/|$)/i.test(decodedPathname)
    ) {
      return fallback;
    }

    return `${candidate.pathname}${candidate.search}${candidate.hash}`;
  } catch {
    return fallback;
  }
}

export function resolveSurfaceMismatchNotice(
  search: string,
): SurfaceMismatchNotice | null {
  const params = new URLSearchParams(search);
  const accessValues = params.getAll("access");
  const surfaceValues = params.getAll("required_surface");
  const requiredSurface = surfaceValues[0];

  if (
    accessValues.length !== 1 ||
    accessValues[0] !== "surface_mismatch" ||
    surfaceValues.length !== 1 ||
    (requiredSurface !== "admin" && requiredSurface !== "client")
  ) {
    return null;
  }

  const portal = AUTH_PORTALS[requiredSurface];
  const portalUrl = new URL("/login", portal.origin);
  portalUrl.searchParams.set(
    "next",
    resolveSafeReturnPath(params.get("next"), "/projects"),
  );

  return {
    portalHref: portalUrl.toString(),
    portalLabel: portal.label,
    requiredSurface,
  };
}

export function withDemoMode(path: string, enabled: boolean): string {
  if (!enabled) return path;

  const url = new URL(resolveSafeReturnPath(path), "https://co-deliver.local");
  url.searchParams.set("demo", "1");
  return `${url.pathname}${url.search}${url.hash}`;
}

export function buildAuthPageHref(
  page: AuthPagePath,
  requestedPath: string | null | undefined,
  demoMode: boolean,
): string {
  const params = new URLSearchParams();
  if (demoMode) params.set("demo", "1");
  if (requestedPath) {
    params.set("next", resolveSafeReturnPath(requestedPath));
  }
  const query = params.toString();
  return query ? `${page}?${query}` : page;
}

export function resolveDemoReturnPath(
  pathname: string,
  search: string,
  hash = "",
): string {
  const params = new URLSearchParams(search);
  params.delete("demo");
  const query = params.toString();
  return resolveSafeReturnPath(
    `${pathname}${query ? `?${query}` : ""}${hash}`,
  );
}

export function authFailureMessage(status: number): string {
  if (status === 429) return "Too many attempts. Wait a moment and try again.";
  if (status >= 500) return "Authentication is temporarily unavailable.";
  return "Email or password was not accepted.";
}
