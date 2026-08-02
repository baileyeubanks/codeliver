import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  buildProtectedReturnPath,
  clientWorkspacePathDecision,
  hostForSurface,
  LOGIN_PATH,
  resolveHostSurface,
  resolveTrustedSurfaceRole,
  roleCanAccessSurface,
  type TrustedSurfaceRole,
} from "@/lib/auth/host-surface";
import {
  getSupabaseAnonKey,
  getSupabasePublicUrl,
  hasSupabasePublicConfig,
} from "@/lib/public-env";

const PUBLIC_EXACT_ROUTES = [
  LOGIN_PATH,
  "/signup",
  "/auth/callback",
  "/api/intake/inquiries",
  "/api/teams/invites",
  "/api/notifications/provider-events",
];
const PUBLIC_ROUTE_PREFIXES = [
  "/api/auth",
  "/api/health",
  "/api/intake/forms",
  "/api/intake/uploads",
  "/api/review", // public review API
  "/inquire", // public production inquiry
  "/review", // public review portal
  "/download", // public download links
  "/invite", // handler-authenticated team invitation bootstrap
];
const LOCAL_DEVELOPMENT_HOST_PATTERN =
  /^(?:localhost|127\.0\.0\.1|\[::1\])(?::([0-9]{1,5}))?$/i;
const UUID_PATH_SEGMENT =
  "[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}";
const FORM_KEY_PATH_SEGMENT = "ifm_[0-9A-Fa-f]{64}";

interface ApiRouteRule {
  pattern: RegExp;
  methods: readonly string[];
}

const CLIENT_API_ROUTE_RULES: ApiRouteRule[] = [
  { pattern: /^\/api\/auth\/login$/, methods: ["POST"] },
  { pattern: /^\/api\/auth\/logout$/, methods: ["POST"] },
  { pattern: /^\/api\/auth\/session$/, methods: ["GET"] },
  { pattern: /^\/api\/auth\/signup$/, methods: ["POST"] },
  { pattern: /^\/api\/teams\/invites$/, methods: ["GET", "PATCH"] },
  {
    pattern: /^\/api\/health(?:\/(?:dependencies|live|ready))?$/,
    methods: ["GET"],
  },
  { pattern: /^\/api\/client\/reviews$/, methods: ["GET"] },
  { pattern: /^\/api\/review\/[^/]+$/, methods: ["GET"] },
  { pattern: /^\/api\/review\/[^/]+\/comments$/, methods: ["POST"] },
  { pattern: /^\/api\/review\/[^/]+\/approvals$/, methods: ["PATCH"] },
  {
    pattern: /^\/api\/review\/[^/]+\/edit-decisions$/,
    methods: ["GET", "POST"],
  },
  { pattern: /^\/api\/review\/[^/]+\/media$/, methods: ["GET", "HEAD"] },
  { pattern: /^\/api\/review\/[^/]+\/unlock$/, methods: ["POST"] },
];

const ADMIN_API_ROUTE_PATTERNS = [
  /^\/api\/auth\/(?:login|logout|session|signup)$/,
  /^\/api\/health(?:\/(?:dependencies|live|ready))?$/,
  /^\/api\/identity\/context$/,
  /^\/api\/teams\/invites$/,
  /^\/api\/review\/[^/]+(?:\/(?:approvals|comments|edit-decisions|media|unlock))?$/,
  /^\/api\/activity$/,
  /^\/api\/analytics\/(?:project|export(?:\/pdf)?)$/,
  /^\/api\/approvals\/(?:notify|workflow)$/,
  /^\/api\/assets$/,
  /^\/api\/assets\/(?:batch-share|bulk)$/,
  new RegExp(`^/api/assets/${UUID_PATH_SEGMENT}$`),
  new RegExp(
    `^/api/assets/${UUID_PATH_SEGMENT}/(?:approvals|comments|edit-decisions|export|share|versions)$`,
  ),
  new RegExp(
    `^/api/assets/${UUID_PATH_SEGMENT}/analysis(?:/(?:batch|composition|decisions))?$`,
  ),
  new RegExp(`^/api/assets/${UUID_PATH_SEGMENT}/transcript(?:/batch)?$`),
  /^\/api\/folders$/,
  /^\/api\/notifications(?:\/(?:preferences|send))?$/,
  /^\/api\/projects$/,
  new RegExp(`^/api/projects/${UUID_PATH_SEGMENT}(?:/assets)?$`),
  /^\/api\/sharing\/analytics$/,
  /^\/api\/storage\/readiness$/,
  /^\/api\/teams(?:\/(?:audit|invites))?$/,
  /^\/api\/upload\/tus$/,
  new RegExp(`^/api/upload/tus/${UUID_PATH_SEGMENT}$`),
  /^\/api\/webhooks$/,
];

const ADMIN_API_ROUTE_RULES: ApiRouteRule[] = [
  {
    pattern: new RegExp(
      `^/api/projects/${UUID_PATH_SEGMENT}/production-plan$`,
    ),
    methods: ["GET", "POST"],
  },
  {
    pattern: new RegExp(
      `^/api/projects/${UUID_PATH_SEGMENT}/production-tasks/${UUID_PATH_SEGMENT}$`,
    ),
    methods: ["PATCH"],
  },
  {
    pattern: new RegExp(
      `^/api/projects/${UUID_PATH_SEGMENT}/operating-record$`,
    ),
    methods: ["GET"],
  },
  {
    pattern: new RegExp(`^/api/projects/${UUID_PATH_SEGMENT}/script$`),
    methods: ["GET", "POST"],
  },
  {
    pattern: new RegExp(
      `^/api/projects/${UUID_PATH_SEGMENT}/script/submit$`,
    ),
    methods: ["POST"],
  },
  {
    pattern: new RegExp(
      `^/api/projects/${UUID_PATH_SEGMENT}/script/decision$`,
    ),
    methods: ["POST"],
  },
  {
    pattern: new RegExp(
      `^/api/projects/${UUID_PATH_SEGMENT}/script/plan$`,
    ),
    methods: ["GET"],
  },
  {
    pattern: new RegExp(
      `^/api/projects/${UUID_PATH_SEGMENT}/script/plan/(?:draft|approve)$`,
    ),
    methods: ["POST"],
  },
  {
    pattern: new RegExp(
      `^/api/projects/${UUID_PATH_SEGMENT}/shot-plan$`,
    ),
    methods: ["GET", "POST"],
  },
  {
    pattern: new RegExp(
      `^/api/projects/${UUID_PATH_SEGMENT}/shot-plan/(?:generate|submit|decision)$`,
    ),
    methods: ["POST"],
  },
  {
    pattern: new RegExp(
      `^/api/projects/${UUID_PATH_SEGMENT}/production-schedule$`,
    ),
    methods: ["GET", "POST"],
  },
  {
    pattern: new RegExp(
      `^/api/projects/${UUID_PATH_SEGMENT}/production-schedule/(?:generate|submit|decision)$`,
    ),
    methods: ["POST"],
  },
  {
    pattern: new RegExp(
      `^/api/projects/${UUID_PATH_SEGMENT}/call-sheet$`,
    ),
    methods: ["GET", "POST"],
  },
  {
    pattern: new RegExp(
      `^/api/projects/${UUID_PATH_SEGMENT}/call-sheet/(?:generate|submit|decision)$`,
    ),
    methods: ["POST"],
  },
  { pattern: /^\/api\/crm\/intake-forms$/, methods: ["GET", "POST"] },
  { pattern: /^\/api\/crm\/pipeline$/, methods: ["GET"] },
  {
    pattern: new RegExp(`^/api/crm/inquiries/${UUID_PATH_SEGMENT}$`),
    methods: ["GET"],
  },
  {
    pattern: new RegExp(
      `^/api/crm/inquiries/${UUID_PATH_SEGMENT}/qualify$`,
    ),
    methods: ["POST"],
  },
  {
    pattern: new RegExp(
      `^/api/crm/opportunities/${UUID_PATH_SEGMENT}/proposal-context$`,
    ),
    methods: ["GET", "POST"],
  },
  {
    pattern: new RegExp(
      `^/api/integrations/hermes/proposals/${UUID_PATH_SEGMENT}/decision$`,
    ),
    methods: ["POST"],
  },
];

const CANONICAL_PUBLIC_API_ROUTE_RULES: ApiRouteRule[] = [
  { pattern: /^\/api\/intake\/inquiries$/, methods: ["POST"] },
  {
    pattern: new RegExp(`^/api/intake/forms/${FORM_KEY_PATH_SEGMENT}$`),
    methods: ["GET"],
  },
  {
    pattern: /^\/api\/intake\/uploads\/tus$/,
    methods: ["POST", "OPTIONS"],
  },
  {
    pattern: new RegExp(
      `^/api/intake/uploads/tus/${UUID_PATH_SEGMENT}$`,
    ),
    methods: ["HEAD", "PATCH", "DELETE", "OPTIONS"],
  },
];

const UNSAFE_LEGACY_API_ROUTE_PATTERNS = [
  /^\/api\/media(?:\/|$)/,
  /^\/api\/usage(?:\/|$)/,
  /^\/api\/vault(?:\/|$)/,
  /^\/api\/ai\/(?:transcribe|brand-check|summarize)$/,
  /^\/api\/assets\/tags$/,
  /^\/api\/versions\/compare$/,
  /^\/api\/comments(?:\/|$)/,
  /^\/api\/sharing\/watermark$/,
  // Paid compute stays production-closed until the route reserves and settles
  // through the durable Co-Credit authority in the same logical execution.
  /^\/api\/transcode$/,
  new RegExp(`^/api/transcode/jobs/${UUID_PATH_SEGMENT}$`),
];

const SERVICE_API_ROUTES = [
  {
    pathname: "/api/notifications/provider-events",
    methods: ["POST"],
    credentialHeader: "x-cco-notification-signature",
  },
  {
    pathname: "/api/transcode/worker",
    // Read-only diagnostics and restore attestation are safe to expose to the
    // authenticated worker. POST can execute paid compute and remains gated.
    methods: ["GET"],
    credentialHeader: "x-codeliver-media-worker-token",
  },
] as const;

const BODY_ATTESTED_SERVICE_API_ROUTES = [
  {
    pathname: "/api/integrations/proposal-handoffs",
    methods: ["POST"],
  },
  {
    pathname: "/api/integrations/hermes/notification-proposals",
    methods: ["POST"],
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

function isAllowedAdminApi(pathname: string, method: string) {
  return (
    ADMIN_API_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname)) ||
    ADMIN_API_ROUTE_RULES.some(
      (rule) => rule.pattern.test(pathname) && rule.methods.includes(method),
    )
  );
}

function productionApiLaunchGate(
  req: NextRequest,
  hostSurface: NonNullable<ReturnType<typeof resolveHostSurface>>,
  trustedRole?: TrustedSurfaceRole | null,
) {
  const { pathname } = req.nextUrl;
  if (!isApiLikePath(pathname)) return null;

  const publicRule = CANONICAL_PUBLIC_API_ROUTE_RULES.find((rule) =>
    rule.pattern.test(pathname),
  );
  if (publicRule) {
    if (hostSurface !== "canonical" || !publicRule.methods.includes(req.method)) {
      return apiLaunchGateDenied();
    }
    return null;
  }

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
    return NextResponse.next();
  }

  const bodyAttestedServiceRoute = BODY_ATTESTED_SERVICE_API_ROUTES.find(
    (route) => route.pathname === pathname,
  );
  if (bodyAttestedServiceRoute) {
    if (
      hostSurface !== "admin" ||
      !bodyAttestedServiceRoute.methods.some((method) => method === req.method)
    ) {
      return apiLaunchGateDenied();
    }

    // The handler verifies the signed body, source binding, freshness, and
    // receiver proof before validate or activation can proceed.
    return NextResponse.next();
  }

  if (UNSAFE_LEGACY_API_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname))) {
    return apiLaunchGateDenied();
  }

  if (hostSurface === "canonical" && trustedRole === undefined) {
    const potentiallyAllowed =
      isAllowedAdminApi(pathname, req.method) ||
      CLIENT_API_ROUTE_RULES.some(
        (rule) => rule.pattern.test(pathname) && rule.methods.includes(req.method),
      );
    return potentiallyAllowed
      ? null
      : apiLaunchGateDenied();
  }

  const clientRestricted =
    hostSurface === "client" ||
    (hostSurface === "canonical" && trustedRole === "client");
  if (clientRestricted) {
    const allowed = CLIENT_API_ROUTE_RULES.some(
      (rule) => rule.pattern.test(pathname) && rule.methods.includes(req.method),
    );
    if (allowed) return null;
  } else if (isAllowedAdminApi(pathname, req.method)) {
    return null;
  }

  return clientRestricted
    ? surfaceAccessDenied(pathname)
    : apiLaunchGateDenied();
}

function isLocalDevelopmentHost(hostHeader: string | null | undefined): boolean {
  const value = hostHeader?.trim();
  if (!value) return false;

  const match = LOCAL_DEVELOPMENT_HOST_PATTERN.exec(value);
  if (!match) return false;

  const port = match[1];
  return port === undefined || (Number(port) >= 1 && Number(port) <= 65_535);
}

function buildLoginUrl(
  req: NextRequest,
  hostSurface: ReturnType<typeof resolveHostSurface>,
): URL {
  const baseUrl = hostSurface
    ? `https://${hostForSurface(hostSurface)}`
    : req.nextUrl.origin;
  return new URL(LOGIN_PATH, baseUrl);
}

function surfaceAccessDenied(pathname: string) {
  if (isApiLikePath(pathname)) {
    return NextResponse.json(
      { error: "This account is not authorized for this surface", code: "SURFACE_FORBIDDEN" },
      { status: 403 },
    );
  }

  return new NextResponse(
    "This signed-in account is not authorized for this Co-VideoPro surface. Sign out and use the correct account.",
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
        error: "This hostname is not an approved Co-VideoPro surface",
        code: "HOST_FORBIDDEN",
      },
      { status: 403 },
    );
  }

  return new NextResponse("This hostname is not an approved Co-VideoPro surface.", {
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
  const localDevelopment =
    process.env.NODE_ENV !== "production" && isLocalDevelopmentHost(host);
  const launchDemo =
    req.nextUrl.searchParams.get("demo") === "1" &&
    !isApiLikePath(pathname) &&
    (localDevelopment || hostSurface === "canonical");

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
    isPathAtOrBelow(pathname, "/brand") ||
    isPathAtOrBelow(pathname, "/fonts")
  ) {
    return NextResponse.next();
  }

  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  if (launchDemo) {
    return NextResponse.next();
  }

  const pathnameWithSanitizedQuery = buildProtectedReturnPath(pathname, req.nextUrl.search);

  if (!hasSupabasePublicConfig()) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          error: "Authentication is not configured for this environment",
          code: "AUTH_NOT_CONFIGURED",
        },
        { status: 503 },
      );
    }

    const loginUrl = buildLoginUrl(req, hostSurface);
    loginUrl.searchParams.set("next", pathnameWithSanitizedQuery);
    if (localDevelopment) {
      loginUrl.searchParams.set("demo", "1");
    }
    return NextResponse.redirect(loginUrl);
  }

  const res = NextResponse.next();

  const supabase = createServerClient(getSupabasePublicUrl(), getSupabaseAnonKey(), {
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
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Authentication required", code: "AUTH_REQUIRED" },
        { status: 401 },
      );
    }

    const loginUrl = buildLoginUrl(req, hostSurface);
    loginUrl.searchParams.set("next", pathnameWithSanitizedQuery);
    return NextResponse.redirect(loginUrl);
  }

  if (hostSurface) {
    const role = resolveTrustedSurfaceRole(user);
    if (!role) return surfaceAccessDenied(pathname);

    if (!roleCanAccessSurface(role, hostSurface)) {
      return surfaceAccessDenied(pathname);
    }

    if (hostSurface === "canonical") {
      const roleLaunchGateResponse = productionApiLaunchGate(req, hostSurface, role);
      if (roleLaunchGateResponse) return roleLaunchGateResponse;
    }

    if (role === "client" && !isApiLikePath(pathname)) {
      const pageDecision = clientWorkspacePathDecision(pathname);
      if (pageDecision.action === "redirect") {
        return NextResponse.redirect(new URL(pageDecision.pathname, req.nextUrl));
      }
      if (pageDecision.action === "deny") {
        return surfaceAccessDenied(pathname);
      }
    }
  }

  return res;
}

export const config = {
  matcher: ["/:path*"],
};
