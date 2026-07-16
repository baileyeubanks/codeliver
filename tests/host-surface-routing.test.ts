import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { unstable_doesMiddlewareMatch } from "next/dist/experimental/testing/server/middleware-testing-utils.js";
import { NextRequest } from "next/server.js";

import {
  ADMIN_SURFACE_HOST,
  buildProtectedReturnPath,
  buildSurfaceUrl,
  CLIENT_SURFACE_HOST,
  LOGIN_PATH,
  resolveHostSurface,
  resolveTrustedSurfaceRole,
  roleCanAccessSurface,
  surfaceForRole,
} from "../lib/auth/host-surface.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const supabaseStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function createServerClient() {
    return {
      auth: {
        async getUser() {
          globalThis.__ccoHostSurfaceGetUserCalls =
            (globalThis.__ccoHostSurfaceGetUserCalls ?? 0) + 1;
          return { data: { user: globalThis.__ccoHostSurfaceUser ?? null } };
        }
      }
    };
  }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@supabase/ssr") return nextResolve(supabaseStubUrl, context);
    if (specifier.startsWith("@/")) {
      const base = resolve(repositoryRoot, specifier.slice(2));
      const path = extname(base)
        ? base
        : existsSync(`${base}.ts`)
          ? `${base}.ts`
          : `${base}.tsx`;
      return nextResolve(pathToFileURL(path).href, context);
    }

    return nextResolve(specifier, context);
  },
});

type StubIdentity = {
  app_metadata: Record<string, unknown>;
  email?: string;
} | null;

const runtimeState = globalThis as typeof globalThis & {
  __ccoHostSurfaceGetUserCalls?: number;
  __ccoHostSurfaceUser?: StubIdentity;
};

test("managed hosts are recognized exactly without suffix or credential confusion", () => {
  assert.equal(resolveHostSurface(ADMIN_SURFACE_HOST), "admin");
  assert.equal(resolveHostSurface(`${ADMIN_SURFACE_HOST}:443`), "admin");
  assert.equal(resolveHostSurface(CLIENT_SURFACE_HOST.toUpperCase()), "client");

  for (const host of [
    `attacker.${ADMIN_SURFACE_HOST}`,
    `${ADMIN_SURFACE_HOST}.attacker.example`,
    `${ADMIN_SURFACE_HOST}@attacker.example`,
    `${ADMIN_SURFACE_HOST}.`,
    `${ADMIN_SURFACE_HOST}:8443`,
    "deliver.contentco-op.com",
    "",
  ]) {
    assert.equal(resolveHostSurface(host), null, host);
  }
});

test("surface authority comes only from the exact namespaced app metadata claim", () => {
  assert.equal(
    resolveTrustedSurfaceRole({ app_metadata: { content_coop_role: "staff" } }),
    "staff",
  );
  assert.equal(
    resolveTrustedSurfaceRole({ app_metadata: { content_coop_role: "client" } }),
    "client",
  );

  const browserEditableIdentity = {
    app_metadata: {},
    email: "typed-by-client@contentco-op.com",
    user_metadata: { role: "admin", is_staff: true },
  };
  assert.equal(resolveTrustedSurfaceRole(browserEditableIdentity), null);

  for (const app_metadata of [
    { role: "staff" },
    { role: "client" },
    { is_staff: true },
    { content_coop_staff: true },
    { content_coop: { role: "staff" } },
    { content_coop_role: "admin" },
    { content_coop_role: "Staff" },
    { content_coop_role: " staff " },
    { content_coop_role: ["staff"] },
    { content_coop_role: ["staff", "client"] },
    { content_coop_role: null },
  ]) {
    assert.equal(resolveTrustedSurfaceRole({ app_metadata }), null);
  }
});

test("role routing is explicit and fails closed", () => {
  assert.equal(roleCanAccessSurface("staff", "admin"), true);
  assert.equal(roleCanAccessSurface("staff", "client"), false);
  assert.equal(roleCanAccessSurface("client", "client"), true);
  assert.equal(roleCanAccessSurface("client", "admin"), false);
  assert.equal(roleCanAccessSurface(null, "admin"), false);
  assert.equal(roleCanAccessSurface(null, "client"), false);
  assert.equal(surfaceForRole("staff"), "admin");
  assert.equal(surfaceForRole("client"), "client");
});

test("one login path carries only a safe local return target", () => {
  assert.equal(LOGIN_PATH, "/login");
  assert.equal(
    buildProtectedReturnPath(
      "/projects/ica",
      "?asset=rough-cut&view=review#browser-only-fragment",
    ),
    "/projects/ica?asset=rough-cut&view=review",
  );
  assert.equal(
    buildProtectedReturnPath("/projects/ica", "?demo=1&asset=cut&demo=0"),
    "/projects/ica?demo=1&asset=cut",
  );

  for (const unsafe of [
    "https://attacker.example/projects",
    "//attacker.example/projects",
    "/%2f%2fattacker.example/projects",
    "/%5cattacker.example/projects",
    "/login",
    "/signup",
    "/auth/callback",
    "/api/auth/login",
  ]) {
    assert.equal(buildProtectedReturnPath(unsafe, "?secret=value"), "/projects", unsafe);
  }

  assert.equal(
    buildSurfaceUrl("admin", "/projects/ica?view=review").toString(),
    "https://admin.contentco-op.com/projects/ica?view=review",
  );
  assert.equal(
    buildSurfaceUrl("client", "https://attacker.example/session").toString(),
    "https://client.contentco-op.com/projects",
  );
});

test("proxy routes verified identities and denies untrusted managed-surface access", async () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://auth.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

  try {
    const { config, proxy } = await import(
      pathToFileURL(resolve(repositoryRoot, "proxy.ts")).href
    );

    runtimeState.__ccoHostSurfaceGetUserCalls = 0;
    runtimeState.__ccoHostSurfaceUser = {
      app_metadata: { content_coop_role: "staff" },
    };
    const allowed = await proxy(
      new NextRequest("https://admin.contentco-op.com/projects?view=review", {
        headers: { host: ADMIN_SURFACE_HOST },
      }),
    );
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get("x-middleware-next"), "1");
    assert.equal(runtimeState.__ccoHostSurfaceGetUserCalls, 1);

    runtimeState.__ccoHostSurfaceUser = {
      app_metadata: { content_coop_role: "client" },
    };
    const clientAllowed = await proxy(
      new NextRequest("https://client.contentco-op.com/projects/ica?view=review", {
        headers: { host: CLIENT_SURFACE_HOST },
      }),
    );
    assert.equal(clientAllowed.status, 200);
    assert.equal(clientAllowed.headers.get("x-middleware-next"), "1");

    const mismatch = await proxy(
      new NextRequest("https://admin.contentco-op.com/projects/ica?view=review", {
        headers: { host: ADMIN_SURFACE_HOST },
      }),
    );
    assert.equal(mismatch.status, 403);
    assert.equal(mismatch.headers.get("location"), null);
    assert.match(
      await mismatch.text(),
      /signed-in account is not authorized for this Content Co-op surface/i,
    );

    runtimeState.__ccoHostSurfaceUser = {
      app_metadata: {},
      email: "typed-by-client@contentco-op.com",
    };
    const denied = await proxy(
      new NextRequest("https://admin.contentco-op.com/projects", {
        headers: { host: ADMIN_SURFACE_HOST },
      }),
    );
    assert.equal(denied.status, 403);

    runtimeState.__ccoHostSurfaceUser = {
      app_metadata: { content_coop_role: "staff" },
    };
    const apiDenied = await proxy(
      new NextRequest("https://client.contentco-op.com/api/projects", {
        method: "POST",
        headers: { host: CLIENT_SURFACE_HOST },
      }),
    );
    assert.equal(apiDenied.status, 403);
    assert.deepEqual(await apiDenied.json(), {
      error: "This account is not authorized for this surface",
      code: "SURFACE_FORBIDDEN",
    });

    runtimeState.__ccoHostSurfaceUser = { app_metadata: { role: "staff" } };
    const legacyClaimDenied = await proxy(
      new NextRequest("https://admin.contentco-op.com/projects", {
        headers: { host: ADMIN_SURFACE_HOST },
      }),
    );
    assert.equal(legacyClaimDenied.status, 403);

    const callsBeforeUnknownHost = runtimeState.__ccoHostSurfaceGetUserCalls;
    const unknownHost = await proxy(
      new NextRequest("https://deliver.contentco-op.com/projects", {
        headers: { host: "deliver.contentco-op.com" },
      }),
    );
    assert.equal(unknownHost.status, 403);
    assert.equal(unknownHost.headers.get("location"), null);
    assert.match(await unknownHost.text(), /hostname is not an approved Content Co-op surface/i);
    assert.equal(runtimeState.__ccoHostSurfaceGetUserCalls, callsBeforeUnknownHost);

    const publicAndAssetPaths = [
      "/login",
      "/signup",
      "/auth/callback?code=secret",
      "/api/auth/signup",
      "/api/health/live",
      "/api/review/public-token",
      "/review/public-token",
      "/download/public-token",
      "/_next/static/chunks/app.js",
      "/_next/image?url=%2Fdemo%2Fcco-lockup.png&w=256&q=75",
      "/favicon.ico",
      "/demo/cco-lockup.png",
      "/brand/co-production-pro-horizontal.png",
    ];
    const unsupportedHosts = [
      `studio.${ADMIN_SURFACE_HOST}`,
      "clients.contentco-op.com",
      "portal.contentco-op.com",
      "deliver.contentco-op.com",
      "admin.localhost",
      "127.1",
      "2130706433",
    ];

    for (const path of publicAndAssetPaths) {
      assert.equal(
        unstable_doesMiddlewareMatch({
          config,
          url: `https://unsupported.example${path}`,
        }),
        true,
        `proxy matcher skipped ${path}`,
      );
    }

    for (const unsupportedHost of unsupportedHosts) {
      for (const path of publicAndAssetPaths) {
        const response = await proxy(
          new NextRequest(`https://${unsupportedHost}${path}`, {
            headers: { host: unsupportedHost },
          }),
        );
        assert.equal(response.status, 403, `${unsupportedHost}${path}`);
        assert.equal(response.headers.get("x-middleware-next"), null);

        if (path.startsWith("/api/")) {
          assert.deepEqual(await response.json(), {
            error: "This hostname is not an approved Content Co-op surface",
            code: "HOST_FORBIDDEN",
          });
        } else {
          assert.match(
            await response.text(),
            /hostname is not an approved Content Co-op surface/i,
          );
        }
      }
    }
    assert.equal(runtimeState.__ccoHostSurfaceGetUserCalls, callsBeforeUnknownHost);

    const missingHost = await proxy(
      new NextRequest("https://admin.contentco-op.com/login"),
    );
    assert.equal(missingHost.status, 403);

    for (const surfaceHost of [ADMIN_SURFACE_HOST, CLIENT_SURFACE_HOST]) {
      for (const path of ["/login", "/api/auth/signup", "/demo/cco-lockup.png", "/brand/co-production-pro-horizontal.png"]) {
        const response = await proxy(
          new NextRequest(`https://${surfaceHost}${path}`, {
            headers: { host: surfaceHost },
          }),
        );
        assert.equal(response.status, 200, `${surfaceHost}${path}`);
        assert.equal(response.headers.get("x-middleware-next"), "1");
      }
    }

    runtimeState.__ccoHostSurfaceUser = null;
    const localAuthorities = [
      { host: "localhost:4103", origin: "http://localhost:4103" },
      { host: "127.0.0.1:4103", origin: "http://127.0.0.1:4103" },
      { host: "[::1]:4103", origin: "http://[::1]:4103" },
    ];

    for (const { host, origin } of localAuthorities) {
      for (const path of [
        "/projects/ica?demo=1",
        "/login",
        "/_next/static/chunks/app.js",
        "/demo/cco-lockup.png",
        "/brand/co-production-pro-horizontal.png",
      ]) {
        const response = await proxy(
          new NextRequest(`${origin}${path}`, { headers: { host } }),
        );
        assert.equal(response.status, 200, `${host}${path}`);
        assert.equal(response.headers.get("x-middleware-next"), "1");
      }
    }

    runtimeState.__ccoHostSurfaceUser = null;
    const login = await proxy(
      new NextRequest("https://untrusted.example/projects/ica?view=review", {
        headers: { host: ADMIN_SURFACE_HOST },
      }),
    );
    const loginLocation = new URL(login.headers.get("location") ?? "");
    assert.equal(login.status, 307);
    assert.equal(loginLocation.origin, `https://${ADMIN_SURFACE_HOST}`);
    assert.equal(loginLocation.pathname, LOGIN_PATH);
    assert.equal(loginLocation.searchParams.get("next"), "/projects/ica?view=review");
  } finally {
    runtimeState.__ccoHostSurfaceGetUserCalls = undefined;
    runtimeState.__ccoHostSurfaceUser = undefined;
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousKey;
  }
});
