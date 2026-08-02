import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const identityStubUrl = `data:text/javascript,${encodeURIComponent(`
  export const HEALTH_SERVICE_ID = "co-deliver";
  export const HEALTH_PRODUCT_NAME = "Co-VideoPro";
  export const HEALTH_BRAND_NAME = "Content Co-op";
  export function currentHealthPort() { return 4103; }
`)}`;

const authStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function requireAuth() {
    if (globalThis.__securityHeadersHealthAuthError) {
      throw globalThis.__securityHeadersHealthAuthError;
    }
    return globalThis.__securityHeadersHealthUser ?? null;
  }
`)}`;

const checksStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function collectDependencySnapshot() {
    globalThis.__securityHeadersHealthSnapshotCalls =
      (globalThis.__securityHeadersHealthSnapshotCalls ?? 0) + 1;
    return globalThis.__securityHeadersHealthSnapshot;
  }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (
      specifier === "./_lib/identity" &&
      context.parentURL?.includes("/app/api/health/route.ts")
    ) {
      return nextResolve(identityStubUrl, context);
    }
    if (
      specifier === "../_lib/checks" &&
      (
        context.parentURL?.includes("/app/api/health/ready/route.ts") ||
        context.parentURL?.includes("/app/api/health/dependencies/route.ts")
      )
    ) {
      return nextResolve(checksStubUrl, context);
    }
    if (specifier === "@/lib/auth") return nextResolve(authStubUrl, context);
    if (specifier === "@/lib/auth/host-surface") {
      return nextResolve(
        pathToFileURL(resolve(repositoryRoot, "lib/auth/host-surface.ts")).href,
        context,
      );
    }
    return nextResolve(specifier, context);
  },
});

type SecurityHealthTestState = typeof globalThis & {
  __securityHeadersHealthAuthError?: Error | undefined;
  __securityHeadersHealthSnapshot?: Record<string, unknown>;
  __securityHeadersHealthSnapshotCalls?: number;
  __securityHeadersHealthUser?: {
    id: string;
    app_metadata?: Record<string, unknown>;
  } | null;
};

const state = globalThis as SecurityHealthTestState;

async function publicHealthGet() {
  const { GET } = await import(
    pathToFileURL(resolve(repositoryRoot, "app/api/health/route.ts")).href,
  );
  return GET();
}

async function publicLiveGet() {
  const { GET } = await import(
    pathToFileURL(resolve(repositoryRoot, "app/api/health/live/route.ts")).href,
  );
  return GET();
}

async function readinessGet() {
  const { GET } = await import(
    pathToFileURL(resolve(repositoryRoot, "app/api/health/ready/route.ts")).href,
  );
  return GET();
}

async function dependenciesGet() {
  const { GET } = await import(
    pathToFileURL(resolve(repositoryRoot, "app/api/health/dependencies/route.ts")).href,
  );
  return GET();
}

test("global headers remove framework metadata and preserve review media capabilities", async () => {
  const { default: nextConfig } = await import(
    pathToFileURL(resolve(repositoryRoot, "next.config.ts")).href,
  );
  const headerRules = await nextConfig.headers?.();
  const globalRule = headerRules?.find((rule) => rule.source === "/:path*");
  const headers = new Map(globalRule?.headers.map((header) => [header.key, header.value]));

  assert.equal(nextConfig.poweredByHeader, false);
  assert.equal(nextConfig.productionBrowserSourceMaps, false);
  assert.equal(headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(headers.get("X-Frame-Options"), "DENY");
  assert.equal(headers.get("Referrer-Policy"), "strict-origin-when-cross-origin");
  assert.equal(headers.has("Strict-Transport-Security"), false);
  assert.equal(headers.get("Permissions-Policy"), "camera=(), geolocation=(), microphone=()");

  const contentSecurityPolicy = headers.get("Content-Security-Policy") ?? "";
  assert.match(contentSecurityPolicy, /media-src 'self' blob: data: https:/);
  assert.match(contentSecurityPolicy, /worker-src 'self' blob:/);
  assert.match(contentSecurityPolicy, /frame-src 'self' blob: data: https:/);
  assert.match(contentSecurityPolicy, /frame-ancestors 'none'/);
  assert.match(contentSecurityPolicy, /https:\/\/fonts\.googleapis\.com/);
  assert.match(contentSecurityPolicy, /https:\/\/fonts\.gstatic\.com/);
});

test("public liveness endpoints omit service topology", async () => {
  for (const response of [await publicHealthGet(), await publicLiveGet()]) {
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await response.json(), { status: "ok" });
  }
});

test("anonymous readiness requests are rejected before dependency probing", async () => {
  state.__securityHeadersHealthAuthError = undefined;
  state.__securityHeadersHealthUser = null;
  state.__securityHeadersHealthSnapshotCalls = 0;

  const response = await readinessGet();

  assert.equal(response.status, 401);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), {
    error: "Authentication required",
    code: "AUTH_REQUIRED",
  });
  assert.equal(state.__securityHeadersHealthSnapshotCalls, 0);
});

test("readiness fails closed when the authentication provider is unavailable", async () => {
  state.__securityHeadersHealthAuthError = new Error("provider configuration details");
  state.__securityHeadersHealthSnapshotCalls = 0;

  const response = await readinessGet();

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "Health detail is unavailable",
    code: "HEALTH_AUTH_UNAVAILABLE",
  });
  assert.equal(state.__securityHeadersHealthSnapshotCalls, 0);

  state.__securityHeadersHealthAuthError = undefined;
});

test("non-staff identities cannot inspect readiness detail", async () => {
  state.__securityHeadersHealthAuthError = undefined;
  state.__securityHeadersHealthUser = {
    id: "client-1",
    app_metadata: { content_coop_role: "client" },
  };
  state.__securityHeadersHealthSnapshotCalls = 0;

  const response = await readinessGet();

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: "Staff access required",
    code: "STAFF_REQUIRED",
  });
  assert.equal(state.__securityHeadersHealthSnapshotCalls, 0);
});

test("authenticated staff retain dependency detail on internal endpoints", async () => {
  state.__securityHeadersHealthAuthError = undefined;
  state.__securityHeadersHealthUser = {
    id: "operator-1",
    app_metadata: { content_coop_role: "staff" },
  };
  state.__securityHeadersHealthSnapshotCalls = 0;
  state.__securityHeadersHealthSnapshot = {
    status: "unhealthy",
    ready: false,
    service: "co-deliver",
    product: "Co-VideoPro",
    brand: "Content Co-op",
    observedAt: "2026-07-25T12:00:00.000Z",
    durationMs: 14,
    checks: [
      { id: "database", status: "fail" },
      { id: "storage", status: "pass" },
    ],
  };

  const expectedReady = {
    status: "unhealthy",
    ready: false,
    service: "co-deliver",
    product: "Co-VideoPro",
    brand: "Content Co-op",
    probe: "readiness",
    observedAt: "2026-07-25T12:00:00.000Z",
    durationMs: 14,
    failedDependencies: ["database"],
  };

  const readinessResponse = await readinessGet();
  assert.equal(readinessResponse.status, 503);
  assert.equal(readinessResponse.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await readinessResponse.json(), expectedReady);

  const dependenciesResponse = await dependenciesGet();
  assert.equal(dependenciesResponse.status, 503);
  assert.equal(dependenciesResponse.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await dependenciesResponse.json(), {
    ...state.__securityHeadersHealthSnapshot,
    probe: "dependencies",
  });
  assert.equal(state.__securityHeadersHealthSnapshotCalls, 2);
});
