import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isAuthSessionMissingError } from "@supabase/supabase-js";
import {
  buildProtectedReturnPath,
  LOGIN_PATH,
  resolveApprovedSurfaceHost,
  resolveHostSurface,
  resolveTrustedSurfaceRole,
  roleCanAccessSurface,
} from "@/lib/auth/host-surface";
import {
  DEMO_SHORT_SHARE_QUERY_FLAG,
  isKnownDemoShareRoute,
  seededDemoShareRoute,
} from "@/lib/dynamic-route-authority";
import {
  getSupabaseAnonKey,
  getSupabasePublicUrl,
  hasSupabasePublicConfig,
} from "@/lib/public-env";
import { buildPendingAccessPath } from "@/lib/auth/flow";

const PUBLIC_EXACT_ROUTES = [
  LOGIN_PATH,
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/onboarding",
  "/welcome",
  "/auth/callback",
  "/auth/confirm",
  "/api/notifications/provider-events",
];
const PUBLIC_ROUTE_PREFIXES = [
  "/api/auth",
  "/api/health",
  "/api/render", // local demo sequence render; production is gated by the API launch gate + the route's demo-root guard
  "/api/review", // public review API
  "/review", // public review portal
  "/download", // public download links
];
const LOCAL_DEVELOPMENT_HOST_PATTERN =
  /^(?:localhost|127\.0\.0\.1|\[::1\])(?::([0-9]{1,5}))?$/i;
const UUID_PATH_SEGMENT =
  "[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}";

const CLIENT_API_ROUTE_PATTERNS = [
  /^\/api\/auth\/(?:login|logout|session|signup|resend|password\/(?:forgot|reset))$/,
  /^\/api\/health(?:\/(?:dependencies|live|ready))?$/,
  /^\/api\/review\/[^/]+(?:\/(?:admission|approvals|comments|edit-decisions))?$/,
  new RegExp(`^/api/review/media/${UUID_PATH_SEGMENT}$`),
];

const ADMIN_API_ROUTE_PATTERNS = [
  ...CLIENT_API_ROUTE_PATTERNS,
  /^\/api\/activity$/,
  /^\/api\/ai\/summarize$/,
  /^\/api\/analytics\/(?:project|export(?:\/pdf)?)$/,
  /^\/api\/approvals\/(?:notify|workflow)$/,
  /^\/api\/assets$/,
  /^\/api\/assets\/(?:batch-share|bulk)$/,
  /^\/api\/billing\/checkout$/,
  new RegExp(`^/api/assets/${UUID_PATH_SEGMENT}$`),
  new RegExp(
    `^/api/assets/${UUID_PATH_SEGMENT}/(?:approvals|comments|edit-decisions|export|share|versions)$`,
  ),
  new RegExp(
    `^/api/assets/${UUID_PATH_SEGMENT}/analysis(?:/(?:batch|composition|decisions))?$`,
  ),
  new RegExp(`^/api/assets/${UUID_PATH_SEGMENT}/transcript(?:/batch)?$`),
  /^\/api\/contacts$/,
  new RegExp(`^/api/contacts/${UUID_PATH_SEGMENT}$`),
  /^\/api\/folders$/,
  /^\/api\/inquiries$/,
  new RegExp(`^/api/inquiries/${UUID_PATH_SEGMENT}(?:/convert)?$`),
  /^\/api\/notifications(?:\/(?:preferences|send))?$/,
  /^\/api\/organizations$/,
  new RegExp(`^/api/organizations/${UUID_PATH_SEGMENT}$`),
  /^\/api\/projects$/,
  new RegExp(`^/api/projects/${UUID_PATH_SEGMENT}(?:/assets)?$`),
  /^\/api\/sharing\/analytics$/,
  /^\/api\/storage\/readiness$/,
  /^\/api\/teams(?:\/(?:audit|invites))?$/,
  /^\/api\/transcode$/,
  new RegExp(`^/api/transcode/jobs/${UUID_PATH_SEGMENT}$`),
  /^\/api\/upload\/tus$/,
  new RegExp(`^/api/upload/tus/${UUID_PATH_SEGMENT}$`),
  /^\/api\/webhooks$/,
];

const UNSAFE_LEGACY_API_ROUTE_PATTERNS = [
  /^\/api\/media(?:\/|$)/,
  /^\/api\/usage(?:\/|$)/,
  /^\/api\/vault(?:\/|$)/,
  /^\/api\/ai\/(?:transcribe|brand-check)$/,
  /^\/api\/assets\/tags$/,
  /^\/api\/versions\/compare$/,
  /^\/api\/comments(?:\/|$)/,
  /^\/api\/sharing\/watermark$/,
];

const SERVICE_API_ROUTES = [
  {
    pathname: "/api/notifications/provider-events",
    methods: ["POST"],
    credentialHeader: "x-cco-notification-signature",
  },
  {
    pathname: "/api/transcode/worker",
    methods: ["GET", "POST"],
    credentialHeader: "x-codeliver-media-worker-token",
  },
] as const;

export { buildProtectedReturnPath };

function isPathAtOrBelow(pathname: string, route: string): boolean {
  const base = route.endsWith("/") ? route.slice(0, -1) : route;
  return pathname === base || pathname.startsWith(`${base}/`);
}

function isPublicRoute(pathname: string): boolean {
  return (
    PUBLIC_EXACT_ROUTES.includes(pathname) ||
    PUBLIC_ROUTE_PREFIXES.some((route) => isPathAtOrBelow(pathname, route))
  );
}

function apiLaunchGateDenied() {
  return NextResponse.json(
    {
      error: "This API route is not enabled for this production surface",
      code: "API_LAUNCH_GATED",
    },
    {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

function backendUnavailableResponse() {
  return NextResponse.json(
    {
      error: "Backend service is unavailable",
      code: "BACKEND_UNAVAILABLE",
    },
    {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

function isApiLikePath(pathname: string): boolean {
  let decoded = pathname;

  try {
    for (let pass = 0; pass < 3; pass += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
  } catch {
    return /^\/api(?:\/|$)/i.test(pathname);
  }

  return /^\/api(?:\/|$)/i.test(decoded);
}

function productionApiLaunchGate(
  req: NextRequest,
  hostSurface: NonNullable<ReturnType<typeof resolveHostSurface>>,
) {
  const { pathname } = req.nextUrl;
  if (!isApiLikePath(pathname)) return null;

  // Canonical TUS uploads persist this exact staff-only stream URL. The route
  // handler performs its own staff check and safe NAS path validation.
  if (hostSurface === "admin" && pathname === "/api/media/stream") {
    return null;
  }

  const serviceRoute = SERVICE_API_ROUTES.find((route) => route.pathname === pathname);
  if (serviceRoute) {
    const credential = req.headers.get(serviceRoute.credentialHeader)?.trim();
    if (
      hostSurface !== "admin" ||
      !serviceRoute.methods.some((method) => method === req.method) ||
      !credential
    ) {
      return apiLaunchGateDenied();
    }

    // The route handler remains responsible for validating the HMAC or token value.
    return nextResponse(req);
  }

  if (UNSAFE_LEGACY_API_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname))) {
    return apiLaunchGateDenied();
  }

  const allowedPatterns =
    hostSurface === "admin" ? ADMIN_API_ROUTE_PATTERNS : CLIENT_API_ROUTE_PATTERNS;
  if (allowedPatterns.some((pattern) => pattern.test(pathname))) return null;

  return hostSurface === "client"
    ? surfaceAccessDenied(pathname)
    : apiLaunchGateDenied();
}

function isLocalDevelopmentHost(hostHeader: string | null | undefined): boolean {
  const value = hostHeader?.trim();
  if (!value) return false;

  const match = LOCAL_DEVELOPMENT_HOST_PATTERN.exec(value);
  if (!match) return false;

  const port = match[1];
  return port === undefined || Number(port) <= 65_535;
}

function isLocalDemoPreviewEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.CODELIVER_DEMO_MODE === "1"
  );
}

const DEMO_CAPABILITY_HEADER = "x-codeliver-demo-preview";

// Canonical demo share URLs are /review/<token>. The public review client
// resolves demo shares from query params, so a local-demo short URL is
// rewritten to the long form (the page redirects bare long-form visits back
// to the short URL; DEMO_SHORT_SHARE_QUERY_FLAG breaks that loop).
function demoShortShareRewrite(req: NextRequest): NextResponse | null {
  const match = /^\/review\/([^/]+)$/.exec(req.nextUrl.pathname);
  if (!match) return null;

  let shareToken: string;
  try {
    shareToken = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  if (shareToken === "demo" || !isKnownDemoShareRoute(shareToken)) return null;

  const rewriteUrl = req.nextUrl.clone();
  rewriteUrl.pathname = "/review/demo";
  rewriteUrl.searchParams.set("share", shareToken);
  rewriteUrl.searchParams.set(DEMO_SHORT_SHARE_QUERY_FLAG, "1");
  const seeded = seededDemoShareRoute(shareToken);
  if (seeded) {
    rewriteUrl.searchParams.set("asset", seeded.asset);
    rewriteUrl.searchParams.set("intent", seeded.intent);
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.delete(DEMO_CAPABILITY_HEADER);
  requestHeaders.set(DEMO_CAPABILITY_HEADER, "1");
  return NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } });
}

function nextResponse(req: NextRequest, demoCapability = false): NextResponse {
  const requestHeaders = new Headers(req.headers);
  // Remove a client-forged value, then add this internal capability only after
  // the local server preview gate has passed.
  requestHeaders.delete(DEMO_CAPABILITY_HEADER);
  if (demoCapability) requestHeaders.set(DEMO_CAPABILITY_HEADER, "1");
  return NextResponse.next({ request: { headers: requestHeaders } });
}

function buildLoginUrl(
  req: NextRequest,
): URL {
  const approvedHost = resolveApprovedSurfaceHost(req.headers.get("host"));
  const baseUrl = approvedHost ? `https://${approvedHost}` : req.nextUrl.origin;
  return new URL(LOGIN_PATH, baseUrl);
}

function pendingAccessResponse(req: NextRequest, next: string) {
  if (isApiLikePath(req.nextUrl.pathname)) {
    return NextResponse.json(
      {
        error: "Workspace access is pending approval",
        code: "AUTHORIZATION_PENDING",
      },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const approvedHost = resolveApprovedSurfaceHost(req.headers.get("host"));
  const baseUrl = approvedHost ? `https://${approvedHost}` : req.nextUrl.origin;
  return NextResponse.redirect(new URL(buildPendingAccessPath(next), baseUrl));
}

function surfaceMismatchResponse(
  req: NextRequest,
  requiredSurface: "admin" | "client",
  next: string,
) {
  if (isApiLikePath(req.nextUrl.pathname)) return surfaceAccessDenied(req.nextUrl.pathname);

  const loginUrl = buildLoginUrl(req);
  loginUrl.searchParams.set("access", "surface_mismatch");
  loginUrl.searchParams.set("required_surface", requiredSurface);
  loginUrl.searchParams.set("next", next);
  return NextResponse.redirect(loginUrl);
}

function surfaceAccessDenied(pathname: string) {
  if (isApiLikePath(pathname)) {
    return NextResponse.json(
      { error: "This account is not authorized for this surface", code: "SURFACE_FORBIDDEN" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  return new NextResponse(
    "This signed-in account is not authorized for this Content Co-op surface. Sign out and use the correct account.",
    {
      status: 403,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
      },
    },
  );
}

function hostAccessDenied(pathname: string) {
  if (isApiLikePath(pathname)) {
    return NextResponse.json(
      {
        error: "This hostname is not an approved Content Co-op surface",
        code: "HOST_FORBIDDEN",
      },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  return new NextResponse("This hostname is not an approved Content Co-op surface.", {
    status: 403,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = req.headers.get("host");
  const hostSurface = resolveHostSurface(host);
  const localDevelopment = isLocalDevelopmentHost(host);
  const localDemo =
    localDevelopment &&
    isLocalDemoPreviewEnabled() &&
    req.nextUrl.searchParams.get("demo") === "1";

  if (!hostSurface && !localDevelopment) {
    return hostAccessDenied(pathname);
  }

  if (hostSurface) {
    const launchGateResponse = productionApiLaunchGate(req, hostSurface);
    if (launchGateResponse) return launchGateResponse;
  }

  if (
    isPathAtOrBelow(pathname, "/_next") ||
    pathname === "/favicon.ico" ||
    isPathAtOrBelow(pathname, "/demo") ||
    isPathAtOrBelow(pathname, "/brand")
  ) {
    return nextResponse(req);
  }

  if (localDemo) {
    const shareRewrite = demoShortShareRewrite(req);
    if (shareRewrite) return shareRewrite;
  }

  if (isPublicRoute(pathname)) {
    return nextResponse(req, localDemo);
  }

  if (localDemo) {
    return nextResponse(req, true);
  }

  const pathnameWithSanitizedQuery = buildProtectedReturnPath(pathname, req.nextUrl.search);

  if (!hasSupabasePublicConfig()) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          error: "Backend service is unavailable",
          code: "BACKEND_UNAVAILABLE",
        },
        {
          status: 503,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    const loginUrl = buildLoginUrl(req);
    loginUrl.searchParams.set("next", pathnameWithSanitizedQuery);
    return NextResponse.redirect(loginUrl);
  }

  const res = nextResponse(req);
  let user: Awaited<
    ReturnType<ReturnType<typeof createServerClient>["auth"]["getUser"]>
  >["data"]["user"];
  try {
    const supabase = createServerClient(
      getSupabasePublicUrl(),
      getSupabaseAnonKey(),
      {
        cookies: {
          getAll() {
            return req.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              res.cookies.set(name, value, options);
            });
          },
        },
      },
    );
    const identity = await supabase.auth.getUser();
    if (isAuthSessionMissingError(identity.error)) {
      user = null;
    } else if (identity.error) {
      return backendUnavailableResponse();
    } else {
      user = identity.data.user;
    }
  } catch {
    return backendUnavailableResponse();
  }

  if (!user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Authentication required", code: "AUTH_REQUIRED" },
        {
          status: 401,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    const loginUrl = buildLoginUrl(req);
    loginUrl.searchParams.set("next", pathnameWithSanitizedQuery);
    return NextResponse.redirect(loginUrl);
  }

  if (hostSurface) {
    const role = resolveTrustedSurfaceRole(user);
    if (!role) return pendingAccessResponse(req, pathnameWithSanitizedQuery);

    if (!roleCanAccessSurface(role, hostSurface)) {
      return surfaceMismatchResponse(
        req,
        role === "staff" ? "admin" : "client",
        pathnameWithSanitizedQuery,
      );
    }
  }

  return res;
}

export const config = {
  matcher: [
    "/((?!robots\\.txt|sitemap\\.xml|manifest\\.webmanifest|favicon\\.ico|icon\\.svg).*)",
  ],
};
