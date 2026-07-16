import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { NextRequest } from "next/server.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const supabaseStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function createServerClient() {
    return {
      auth: {
        async getUser() {
          globalThis.__ccoLaunchGateGetUserCalls =
            (globalThis.__ccoLaunchGateGetUserCalls ?? 0) + 1;
          return { data: { user: globalThis.__ccoLaunchGateUser ?? null } };
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
  app_metadata: { content_coop_role: "staff" | "client" };
} | null;

const runtimeState = globalThis as typeof globalThis & {
  __ccoLaunchGateGetUserCalls?: number;
  __ccoLaunchGateUser?: StubIdentity;
};

const ADMIN_HOST = "admin.contentco-op.com";
const CLIENT_HOST = "client.contentco-op.com";
const RESOURCE_ID = "11111111-2222-4333-8444-555555555555";
const LAUNCH_GATE_BODY = {
  error: "This API route is not enabled for this production surface",
  code: "API_LAUNCH_GATED",
};
const SURFACE_GATE_BODY = {
  error: "This account is not authorized for this surface",
  code: "SURFACE_FORBIDDEN",
};

function request(
  host: string,
  pathname: string,
  init: { method?: string; headers?: HeadersInit } = {},
) {
  const headers = new Headers(init.headers);
  headers.set("host", host);
  return new NextRequest(`https://${ADMIN_HOST}${pathname}`, {
    method: init.method,
    headers,
  });
}

async function assertLaunchGated(response: Response, label: string) {
  assert.equal(response.status, 403, label);
  assert.equal(response.headers.get("x-middleware-next"), null, label);
  assert.equal(response.headers.get("cache-control"), "no-store", label);
  assert.deepEqual(await response.json(), LAUNCH_GATE_BODY, label);
}

async function assertSurfaceGated(response: Response, label: string) {
  assert.equal(response.status, 403, label);
  assert.equal(response.headers.get("x-middleware-next"), null, label);
  assert.deepEqual(await response.json(), SURFACE_GATE_BODY, label);
}

test("production API launch gate fails closed before public, auth, and demo bypasses", async (t) => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://auth.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

  try {
    const { proxy } = await import(pathToFileURL(resolve(repositoryRoot, "proxy.ts")).href);

    await t.test("legacy and deceptive hosts cannot reach any bypass or service route", async () => {
      runtimeState.__ccoLaunchGateGetUserCalls = 0;
      runtimeState.__ccoLaunchGateUser = {
        app_metadata: { content_coop_role: "staff" },
      };

      const hosts = [
        "deliver.contentco-op.com",
        "co-deliver.contentco-op.com",
        "codeliver.contentco-op.com",
        `attacker.${ADMIN_HOST}`,
        `${ADMIN_HOST}.attacker.example`,
        "clients.contentco-op.com",
      ];
      const routes = [
        { pathname: "/api/auth/session?demo=1", method: "GET", headers: {} },
        { pathname: "/api/upload/tus", method: "POST", headers: {} },
        {
          pathname: "/api/notifications/provider-events",
          method: "POST",
          headers: { "x-cco-notification-signature": "sha256=candidate" },
        },
      ];

      for (const host of hosts) {
        for (const route of routes) {
          const response = await proxy(request(host, route.pathname, route));
          assert.equal(response.status, 403, `${host}${route.pathname}`);
          assert.deepEqual(await response.json(), {
            error: "This hostname is not an approved Content Co-op surface",
            code: "HOST_FORBIDDEN",
          });
        }
      }

      assert.equal(runtimeState.__ccoLaunchGateGetUserCalls, 0);
    });

    await t.test("named legacy APIs and route-shape attacks are denied before identity lookup", async () => {
      const unsafePaths = [
        "/api/media",
        "/api/media/browse",
        "/api/media/transcode",
        "/api/media/tus",
        `/api/media/tus/${RESOURCE_ID}`,
        "/api/media/upload",
        "/api/usage/summary",
        "/api/usage/reservations",
        "/api/vault/records",
        "/api/vault/agent-runs",
        "/api/ai/transcribe",
        "/api/ai/brand-check",
        "/api/assets/tags",
        "/api/versions/compare",
        "/api/comments/attachments",
        "/api/comments/reactions",
        "/api/sharing/watermark",
        "/api/transcode/worker",
      ];
      const routeShapeAttacks = [
        "/api",
        "/api/future-unreviewed",
        "/api/auth/admin",
        "/api/health/debug",
        "/api/review/token/admin-data",
        "/api/upload/tus/not-a-uuid",
        "/api/upload/tus-legacy",
        "/api/mediaevil/browse",
        "/api/%6dedia/browse",
        "/API/media/browse",
      ];
      const deniedPaths = [...unsafePaths, ...routeShapeAttacks];

      for (const [host, role] of [
        [ADMIN_HOST, "staff"],
        [CLIENT_HOST, "client"],
      ] as const) {
        runtimeState.__ccoLaunchGateUser = {
          app_metadata: { content_coop_role: role },
        };

        for (const pathname of deniedPaths) {
          const callsBefore = runtimeState.__ccoLaunchGateGetUserCalls ?? 0;
          const response = await proxy(request(host, `${pathname}?demo=1`, { method: "POST" }));
          if (host === CLIENT_HOST && routeShapeAttacks.includes(pathname)) {
            await assertSurfaceGated(response, `${host}${pathname}`);
          } else {
            await assertLaunchGated(response, `${host}${pathname}`);
          }
          assert.equal(
            runtimeState.__ccoLaunchGateGetUserCalls,
            callsBefore,
            `${host}${pathname} reached interactive auth`,
          );
        }
      }
    });

    await t.test("canonical TUS is admin-reachable while client and legacy aliases stay closed", async () => {
      runtimeState.__ccoLaunchGateUser = {
        app_metadata: { content_coop_role: "staff" },
      };
      const callsBefore = runtimeState.__ccoLaunchGateGetUserCalls ?? 0;

      for (const [pathname, method] of [
        ["/api/upload/tus", "POST"],
        [`/api/upload/tus/${RESOURCE_ID}`, "PATCH"],
      ] as const) {
        const response = await proxy(request(ADMIN_HOST, pathname, { method }));
        assert.equal(response.status, 200, pathname);
        assert.equal(response.headers.get("x-middleware-next"), "1", pathname);
      }
      assert.equal(runtimeState.__ccoLaunchGateGetUserCalls, callsBefore + 2);

      runtimeState.__ccoLaunchGateUser = {
        app_metadata: { content_coop_role: "client" },
      };
      await assertSurfaceGated(
        await proxy(request(CLIENT_HOST, "/api/upload/tus", { method: "POST" })),
        "client canonical TUS",
      );
      await assertLaunchGated(
        await proxy(request(ADMIN_HOST, "/api/media/tus", { method: "POST" })),
        "legacy media TUS",
      );
    });

    await t.test("canonical media playback is staff-only on the admin surface", async () => {
      runtimeState.__ccoLaunchGateGetUserCalls = 0;
      runtimeState.__ccoLaunchGateUser = {
        app_metadata: { content_coop_role: "staff" },
      };

      const adminStream = await proxy(
        request(ADMIN_HOST, "/api/media/stream?path=projects%2Fclip.mp4"),
      );
      assert.equal(adminStream.status, 200);
      assert.equal(adminStream.headers.get("x-middleware-next"), "1");
      assert.equal(runtimeState.__ccoLaunchGateGetUserCalls, 1);

      runtimeState.__ccoLaunchGateUser = {
        app_metadata: { content_coop_role: "client" },
      };
      await assertLaunchGated(
        await proxy(
          request(CLIENT_HOST, "/api/media/stream?path=projects%2Fclip.mp4"),
        ),
        "client raw media stream",
      );
      assert.equal(runtimeState.__ccoLaunchGateGetUserCalls, 1);

      await assertLaunchGated(
        await proxy(
          request(ADMIN_HOST, "/api/media/stream/legacy?path=projects%2Fclip.mp4"),
        ),
        "non-canonical media stream alias",
      );
      assert.equal(runtimeState.__ccoLaunchGateGetUserCalls, 1);
    });

    await t.test("client API access is limited to auth, health, and token review", async () => {
      runtimeState.__ccoLaunchGateGetUserCalls = 0;
      runtimeState.__ccoLaunchGateUser = {
        app_metadata: { content_coop_role: "client" },
      };

      const clientApis = [
        "/api/auth/login",
        "/api/auth/logout",
        "/api/auth/session",
        "/api/auth/signup",
        "/api/health",
        "/api/health/live",
        "/api/health/ready",
        "/api/health/dependencies",
        "/api/review/public-token",
        "/api/review/public-token/comments",
        "/api/review/public-token/approvals",
        "/api/review/public-token/edit-decisions",
      ];
      for (const pathname of clientApis) {
        const response = await proxy(request(CLIENT_HOST, pathname));
        assert.equal(response.status, 200, pathname);
        assert.equal(response.headers.get("x-middleware-next"), "1", pathname);
      }
      assert.equal(runtimeState.__ccoLaunchGateGetUserCalls, 0);

      for (const pathname of [
        "/api/projects",
        "/api/assets",
        `/api/assets/${RESOURCE_ID}`,
        "/api/folders",
        "/api/notifications",
        "/api/teams",
        "/api/transcode",
        "/api/webhooks",
      ]) {
        await assertSurfaceGated(
          await proxy(request(CLIENT_HOST, pathname, { method: "POST" })),
          `client admin API ${pathname}`,
        );
      }
      assert.equal(runtimeState.__ccoLaunchGateGetUserCalls, 0);

      for (const pathname of [
        "/login",
        "/signup",
        "/review/public-token",
        "/download/public-token",
        "/_next/static/chunks/app.js",
        "/demo/cco-lockup.png",
        "/brand/co-production-pro-horizontal.png",
      ]) {
        const response = await proxy(request(CLIENT_HOST, pathname));
        assert.equal(response.status, 200, pathname);
        assert.equal(response.headers.get("x-middleware-next"), "1", pathname);
      }
    });

    await t.test("service endpoints require credential-bearing requests on the admin host", async () => {
      runtimeState.__ccoLaunchGateGetUserCalls = 0;
      runtimeState.__ccoLaunchGateUser = null;

      await assertLaunchGated(
        await proxy(
          request(ADMIN_HOST, "/api/notifications/provider-events", { method: "POST" }),
        ),
        "unsigned provider event",
      );
      const signedProviderEvent = await proxy(
        request(ADMIN_HOST, "/api/notifications/provider-events", {
          method: "POST",
          headers: { "x-cco-notification-signature": "sha256=candidate" },
        }),
      );
      assert.equal(signedProviderEvent.status, 200);
      assert.equal(signedProviderEvent.headers.get("x-middleware-next"), "1");

      await assertLaunchGated(
        await proxy(request(ADMIN_HOST, "/api/transcode/worker", { method: "POST" })),
        "browser worker request",
      );
      const worker = await proxy(
        request(ADMIN_HOST, "/api/transcode/worker", {
          method: "POST",
          headers: { "x-codeliver-media-worker-token": "candidate" },
        }),
      );
      assert.equal(worker.status, 200);
      assert.equal(worker.headers.get("x-middleware-next"), "1");
      const restoreAttestation = await proxy(
        request(
          ADMIN_HOST,
          "/api/transcode/worker?restore_attestation_version_id=177139fe-bffd-4f2b-8ff3-8c4be1e70861",
          {
            method: "GET",
            headers: { "x-codeliver-media-worker-token": "candidate" },
          },
        ),
      );
      assert.equal(restoreAttestation.status, 200);
      assert.equal(restoreAttestation.headers.get("x-middleware-next"), "1");

      await assertLaunchGated(
        await proxy(
          request(CLIENT_HOST, "/api/transcode/worker", {
            method: "POST",
            headers: { "x-codeliver-media-worker-token": "candidate" },
          }),
        ),
        "client worker request",
      );
      await assertLaunchGated(
        await proxy(
          request(
            CLIENT_HOST,
            "/api/transcode/worker?restore_attestation_version_id=177139fe-bffd-4f2b-8ff3-8c4be1e70861",
            {
              method: "GET",
              headers: { "x-codeliver-media-worker-token": "candidate" },
            },
          ),
        ),
        "client restore attestation request",
      );
      await assertLaunchGated(
        await proxy(
          request(CLIENT_HOST, "/api/notifications/provider-events", {
            method: "POST",
            headers: { "x-cco-notification-signature": "sha256=candidate" },
          }),
        ),
        "client provider event",
      );
      assert.equal(runtimeState.__ccoLaunchGateGetUserCalls, 0);
    });

    await t.test("localhost demo requests retain the UI development path", async () => {
      runtimeState.__ccoLaunchGateGetUserCalls = 0;
      runtimeState.__ccoLaunchGateUser = null;

      for (const pathname of [
        "/api/media/browse?demo=1",
        "/api/usage/summary?demo=1",
        "/api/transcode/worker?demo=1",
      ]) {
        const response = await proxy(request("localhost:4103", pathname, { method: "POST" }));
        assert.equal(response.status, 200, pathname);
        assert.equal(response.headers.get("x-middleware-next"), "1", pathname);
      }
      assert.equal(runtimeState.__ccoLaunchGateGetUserCalls, 0);
    });
  } finally {
    runtimeState.__ccoLaunchGateGetUserCalls = undefined;
    runtimeState.__ccoLaunchGateUser = undefined;
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousKey;
  }
});
