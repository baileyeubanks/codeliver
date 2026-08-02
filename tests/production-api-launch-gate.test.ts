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
const CANONICAL_HOST = "co-videopro.com";
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
              error: "This hostname is not an approved Co-VideoPro surface",
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
        "/api/ai/summarize",
        "/api/assets/tags",
        "/api/versions/compare",
        "/api/comments/attachments",
        "/api/comments/reactions",
        "/api/sharing/watermark",
        "/api/transcode",
        `/api/transcode/jobs/${RESOURCE_ID}`,
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

    await t.test("public intake TUS is exact, method-aware, and canonical-host only", async () => {
      runtimeState.__ccoLaunchGateGetUserCalls = 0;
      runtimeState.__ccoLaunchGateUser = null;

      for (const [pathname, method] of [
        ["/api/intake/uploads/tus", "POST"],
        ["/api/intake/uploads/tus", "OPTIONS"],
        [`/api/intake/uploads/tus/${RESOURCE_ID}`, "HEAD"],
        [`/api/intake/uploads/tus/${RESOURCE_ID}`, "PATCH"],
        [`/api/intake/uploads/tus/${RESOURCE_ID}`, "DELETE"],
        [`/api/intake/uploads/tus/${RESOURCE_ID}`, "OPTIONS"],
      ] as const) {
        const response = await proxy(request(CANONICAL_HOST, pathname, { method }));
        assert.equal(response.status, 200, `${method} ${pathname}`);
        assert.equal(response.headers.get("x-middleware-next"), "1", pathname);
      }
      assert.equal(runtimeState.__ccoLaunchGateGetUserCalls, 0);

      for (const [host, pathname, method] of [
        [CANONICAL_HOST, "/api/intake/uploads/tus", "GET"],
        [CANONICAL_HOST, "/api/intake/uploads/tus/not-a-uuid", "PATCH"],
        [CANONICAL_HOST, `/api/intake/uploads/tus/${RESOURCE_ID}/status`, "HEAD"],
        [ADMIN_HOST, "/api/intake/uploads/tus", "POST"],
        [CLIENT_HOST, "/api/intake/uploads/tus", "POST"],
      ] as const) {
        await assertLaunchGated(
          await proxy(request(host, pathname, { method })),
          `${host} ${method} ${pathname}`,
        );
      }
      assert.equal(runtimeState.__ccoLaunchGateGetUserCalls, 0);
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

    await t.test("client API access is method-aware and limited to review work", async () => {
      runtimeState.__ccoLaunchGateGetUserCalls = 0;
      runtimeState.__ccoLaunchGateUser = {
        app_metadata: { content_coop_role: "client" },
      };

      const sharedClientApis = [
        { pathname: "/api/auth/login", method: "POST" },
        { pathname: "/api/auth/logout", method: "POST" },
        { pathname: "/api/auth/session", method: "GET" },
        { pathname: "/api/auth/signup", method: "POST" },
        { pathname: "/api/teams/invites", method: "GET" },
        { pathname: "/api/teams/invites", method: "PATCH" },
        { pathname: "/api/health", method: "GET" },
        { pathname: "/api/health/live", method: "GET" },
        { pathname: "/api/health/ready", method: "GET" },
        { pathname: "/api/health/dependencies", method: "GET" },
      ];
      const tokenReviewApis = [
        { pathname: "/api/review/public-token", method: "GET" },
        { pathname: "/api/review/public-token/comments", method: "POST" },
        { pathname: "/api/review/public-token/approvals", method: "PATCH" },
        { pathname: "/api/review/public-token/edit-decisions", method: "GET" },
        { pathname: "/api/review/public-token/edit-decisions", method: "POST" },
        { pathname: "/api/review/public-token/media", method: "GET" },
        { pathname: "/api/review/public-token/unlock", method: "POST" },
      ];
      for (const { pathname, method } of [...sharedClientApis, ...tokenReviewApis]) {
        const response = await proxy(request(CLIENT_HOST, pathname, { method }));
        assert.equal(response.status, 200, `${method} ${pathname}`);
        assert.equal(
          response.headers.get("x-middleware-next"),
          "1",
          `${method} ${pathname}`,
        );
      }
      assert.equal(runtimeState.__ccoLaunchGateGetUserCalls, 0);

      const inbox = await proxy(
        request(CLIENT_HOST, "/api/client/reviews", { method: "GET" }),
      );
      assert.equal(inbox.status, 200);
      assert.equal(inbox.headers.get("x-middleware-next"), "1");
      assert.equal(runtimeState.__ccoLaunchGateGetUserCalls, 1);

      for (const { pathname, method } of [
        { pathname: "/api/identity/context", method: "GET" },
        { pathname: "/api/client/reviews", method: "POST" },
        { pathname: "/api/review/public-token", method: "POST" },
        { pathname: "/api/review/public-token/comments", method: "GET" },
        { pathname: "/api/review/public-token/approvals", method: "POST" },
        { pathname: "/api/review/public-token/edit-decisions", method: "PATCH" },
        { pathname: "/api/review/public-token/media", method: "POST" },
        { pathname: "/api/review/public-token/unlock", method: "GET" },
      ]) {
        await assertSurfaceGated(
          await proxy(request(CLIENT_HOST, pathname, { method })),
          `client method gate ${method} ${pathname}`,
        );
      }
      assert.equal(runtimeState.__ccoLaunchGateGetUserCalls, 1);

      for (const pathname of [
        "/api/projects",
        "/api/assets",
        `/api/assets/${RESOURCE_ID}`,
        "/api/folders",
        "/api/notifications",
        "/api/teams",
        "/api/webhooks",
      ]) {
        await assertSurfaceGated(
          await proxy(request(CLIENT_HOST, pathname, { method: "POST" })),
          `client admin API ${pathname}`,
        );
      }
      assert.equal(runtimeState.__ccoLaunchGateGetUserCalls, 1);

      for (const pathname of [
        "/login",
        "/signup",
        "/review/public-token",
        "/download/public-token",
        "/invite/inviteToken_1234567890-ABCDEFGH",
        "/_next/static/chunks/app.js",
        "/demo/cco-lockup.png",
        "/brand/co-production-pro-horizontal.png",
        "/fonts/inter-latin.woff2",
      ]) {
        const response = await proxy(request(CLIENT_HOST, pathname));
        assert.equal(response.status, 200, pathname);
        assert.equal(response.headers.get("x-middleware-next"), "1", pathname);
      }
    });

    await t.test("canonical API access follows the authenticated role", async () => {
      runtimeState.__ccoLaunchGateGetUserCalls = 0;
      runtimeState.__ccoLaunchGateUser = {
        app_metadata: { content_coop_role: "client" },
      };

      await assertSurfaceGated(
        await proxy(request(CANONICAL_HOST, "/api/teams", { method: "POST" })),
        "canonical client team mutation",
      );
      assert.equal(runtimeState.__ccoLaunchGateGetUserCalls, 1);

      const clientSession = await proxy(request(CANONICAL_HOST, "/api/auth/session"));
      assert.equal(clientSession.status, 200);
      assert.equal(clientSession.headers.get("x-middleware-next"), "1");
      assert.equal(runtimeState.__ccoLaunchGateGetUserCalls, 1);

      runtimeState.__ccoLaunchGateUser = {
        app_metadata: { content_coop_role: "staff" },
      };
      const staffTeams = await proxy(
        request(CANONICAL_HOST, "/api/teams", { method: "POST" }),
      );
      assert.equal(staffTeams.status, 200);
      assert.equal(staffTeams.headers.get("x-middleware-next"), "1");
      assert.equal(runtimeState.__ccoLaunchGateGetUserCalls, 2);

      const callsBeforeUnknownRoute = runtimeState.__ccoLaunchGateGetUserCalls;
      await assertLaunchGated(
        await proxy(request(CANONICAL_HOST, "/api/future-unreviewed", { method: "POST" })),
        "canonical unknown API",
      );
      assert.equal(runtimeState.__ccoLaunchGateGetUserCalls, callsBeforeUnknownRoute);
    });

    await t.test("signed integration ingress is exact, admin-hosted, and body-attested", async () => {
      runtimeState.__ccoLaunchGateGetUserCalls = 0;
      runtimeState.__ccoLaunchGateUser = null;

      for (const pathname of [
        "/api/integrations/proposal-handoffs",
        "/api/integrations/hermes/notification-proposals",
      ]) {
        const accepted = await proxy(
          request(ADMIN_HOST, pathname, {
            method: "POST",
          }),
        );
        assert.equal(accepted.status, 200, pathname);
        assert.equal(accepted.headers.get("x-middleware-next"), "1", pathname);

        await assertLaunchGated(
          await proxy(
            request(ADMIN_HOST, pathname, {
              method: "GET",
            }),
          ),
          `${pathname} wrong method`,
        );
        await assertLaunchGated(
          await proxy(
            request(CLIENT_HOST, pathname, {
              method: "POST",
            }),
          ),
          `${pathname} client host`,
        );
        await assertLaunchGated(
          await proxy(
            request(CANONICAL_HOST, pathname, {
              method: "POST",
            }),
          ),
          `${pathname} canonical host`,
        );
        await assertLaunchGated(
          await proxy(
            request(ADMIN_HOST, `${pathname}/legacy`, {
              method: "POST",
            }),
          ),
          `${pathname} alias`,
        );
      }
      assert.equal(runtimeState.__ccoLaunchGateGetUserCalls, 0);
    });

    await t.test("Hermes human decisions are exact, authenticated, and staff-only", async () => {
      runtimeState.__ccoLaunchGateGetUserCalls = 0;
      runtimeState.__ccoLaunchGateUser = {
        app_metadata: { content_coop_role: "staff" },
      };
      const pathname = `/api/integrations/hermes/proposals/${RESOURCE_ID}/decision`;

      const accepted = await proxy(
        request(ADMIN_HOST, pathname, { method: "POST" }),
      );
      assert.equal(accepted.status, 200);
      assert.equal(accepted.headers.get("x-middleware-next"), "1");
      assert.equal(runtimeState.__ccoLaunchGateGetUserCalls, 1);

      await assertLaunchGated(
        await proxy(request(ADMIN_HOST, pathname, { method: "GET" })),
        "Hermes decision wrong method",
      );
      await assertLaunchGated(
        await proxy(
          request(
            ADMIN_HOST,
            "/api/integrations/hermes/proposals/not-a-uuid/decision",
            { method: "POST" },
          ),
        ),
        "Hermes decision malformed id",
      );
      assert.equal(runtimeState.__ccoLaunchGateGetUserCalls, 1);

      runtimeState.__ccoLaunchGateUser = {
        app_metadata: { content_coop_role: "client" },
      };
      await assertSurfaceGated(
        await proxy(request(CLIENT_HOST, pathname, { method: "POST" })),
        "client Hermes decision",
      );
      assert.equal(runtimeState.__ccoLaunchGateGetUserCalls, 1);
    });

    await t.test("project operating records are exact, read-only, and staff-only", async () => {
      runtimeState.__ccoLaunchGateGetUserCalls = 0;
      runtimeState.__ccoLaunchGateUser = {
        app_metadata: { content_coop_role: "staff" },
      };
      const pathname = `/api/projects/${RESOURCE_ID}/operating-record`;

      const adminRecord = await proxy(request(ADMIN_HOST, pathname));
      assert.equal(adminRecord.status, 200);
      assert.equal(adminRecord.headers.get("x-middleware-next"), "1");
      assert.equal(runtimeState.__ccoLaunchGateGetUserCalls, 1);

      const canonicalRecord = await proxy(request(CANONICAL_HOST, pathname));
      assert.equal(canonicalRecord.status, 200);
      assert.equal(canonicalRecord.headers.get("x-middleware-next"), "1");
      assert.equal(runtimeState.__ccoLaunchGateGetUserCalls, 2);

      await assertLaunchGated(
        await proxy(request(ADMIN_HOST, pathname, { method: "POST" })),
        "operating record mutation",
      );
      await assertLaunchGated(
        await proxy(
          request(
            ADMIN_HOST,
            "/api/projects/not-a-uuid/operating-record",
          ),
        ),
        "operating record malformed project id",
      );
      assert.equal(runtimeState.__ccoLaunchGateGetUserCalls, 2);

      runtimeState.__ccoLaunchGateUser = {
        app_metadata: { content_coop_role: "client" },
      };
      await assertSurfaceGated(
        await proxy(request(CLIENT_HOST, pathname)),
        "client operating record",
      );
      assert.equal(runtimeState.__ccoLaunchGateGetUserCalls, 2);
    });

    await t.test("approved-script production handoff APIs are exact, method-aware, and staff-only", async () => {
      runtimeState.__ccoLaunchGateGetUserCalls = 0;
      runtimeState.__ccoLaunchGateUser = {
        app_metadata: { content_coop_role: "staff" },
      };
      const taskId = "77777777-7777-4777-8777-777777777777";
      const allowed = [
        { pathname: `/api/projects/${RESOURCE_ID}/production-plan`, method: "GET" },
        { pathname: `/api/projects/${RESOURCE_ID}/production-plan`, method: "POST" },
        {
          pathname: `/api/projects/${RESOURCE_ID}/production-tasks/${taskId}`,
          method: "PATCH",
        },
        { pathname: `/api/projects/${RESOURCE_ID}/script/plan`, method: "GET" },
        { pathname: `/api/projects/${RESOURCE_ID}/script/plan/draft`, method: "POST" },
        { pathname: `/api/projects/${RESOURCE_ID}/script/plan/approve`, method: "POST" },
      ];

      for (const host of [ADMIN_HOST, CANONICAL_HOST]) {
        for (const route of allowed) {
          const response = await proxy(request(host, route.pathname, route));
          assert.equal(response.status, 200, `${host} ${route.method} ${route.pathname}`);
          assert.equal(
            response.headers.get("x-middleware-next"),
            "1",
            `${host} ${route.method} ${route.pathname}`,
          );
        }
      }
      assert.equal(runtimeState.__ccoLaunchGateGetUserCalls, allowed.length * 2);

      const callsBeforeDenied = runtimeState.__ccoLaunchGateGetUserCalls;
      for (const route of [
        { pathname: `/api/projects/${RESOURCE_ID}/production-plan`, method: "PATCH" },
        {
          pathname: `/api/projects/${RESOURCE_ID}/production-tasks/${taskId}`,
          method: "POST",
        },
        { pathname: `/api/projects/${RESOURCE_ID}/script/plan`, method: "POST" },
        { pathname: `/api/projects/${RESOURCE_ID}/script/plan/draft`, method: "GET" },
        { pathname: `/api/projects/${RESOURCE_ID}/script/plan/approve`, method: "PATCH" },
        { pathname: "/api/projects/not-a-uuid/script/plan", method: "GET" },
        { pathname: `/api/projects/${RESOURCE_ID}/script/plan/drafts`, method: "POST" },
      ]) {
        await assertLaunchGated(
          await proxy(request(ADMIN_HOST, route.pathname, route)),
          `handoff gate ${route.method} ${route.pathname}`,
        );
      }
      assert.equal(runtimeState.__ccoLaunchGateGetUserCalls, callsBeforeDenied);

      runtimeState.__ccoLaunchGateUser = {
        app_metadata: { content_coop_role: "client" },
      };
      for (const route of allowed) {
        await assertSurfaceGated(
          await proxy(request(CLIENT_HOST, route.pathname, route)),
          `client handoff ${route.method} ${route.pathname}`,
        );
      }
      assert.equal(runtimeState.__ccoLaunchGateGetUserCalls, callsBeforeDenied);
    });

    await t.test("governed shot-plan APIs are exact, method-aware, and staff-only", async () => {
      runtimeState.__ccoLaunchGateGetUserCalls = 0;
      runtimeState.__ccoLaunchGateUser = {
        app_metadata: { content_coop_role: "staff" },
      };
      const allowed = [
        { pathname: `/api/projects/${RESOURCE_ID}/shot-plan`, method: "GET" },
        { pathname: `/api/projects/${RESOURCE_ID}/shot-plan`, method: "POST" },
        { pathname: `/api/projects/${RESOURCE_ID}/shot-plan/generate`, method: "POST" },
        { pathname: `/api/projects/${RESOURCE_ID}/shot-plan/submit`, method: "POST" },
        { pathname: `/api/projects/${RESOURCE_ID}/shot-plan/decision`, method: "POST" },
      ];

      for (const host of [ADMIN_HOST, CANONICAL_HOST]) {
        for (const route of allowed) {
          const response = await proxy(request(host, route.pathname, route));
          assert.equal(response.status, 200, `${host} ${route.method} ${route.pathname}`);
          assert.equal(
            response.headers.get("x-middleware-next"),
            "1",
            `${host} ${route.method} ${route.pathname}`,
          );
        }
      }
      assert.equal(runtimeState.__ccoLaunchGateGetUserCalls, allowed.length * 2);

      const callsBeforeDenied = runtimeState.__ccoLaunchGateGetUserCalls;
      for (const route of [
        { pathname: `/api/projects/${RESOURCE_ID}/shot-plan`, method: "PATCH" },
        { pathname: `/api/projects/${RESOURCE_ID}/shot-plan/generate`, method: "GET" },
        { pathname: `/api/projects/${RESOURCE_ID}/shot-plan/submit`, method: "PATCH" },
        { pathname: `/api/projects/${RESOURCE_ID}/shot-plan/decision`, method: "GET" },
        { pathname: "/api/projects/not-a-uuid/shot-plan", method: "GET" },
        { pathname: `/api/projects/${RESOURCE_ID}/shot-plan/revisions`, method: "POST" },
      ]) {
        await assertLaunchGated(
          await proxy(request(ADMIN_HOST, route.pathname, route)),
          `shot-plan gate ${route.method} ${route.pathname}`,
        );
      }
      assert.equal(runtimeState.__ccoLaunchGateGetUserCalls, callsBeforeDenied);

      runtimeState.__ccoLaunchGateUser = {
        app_metadata: { content_coop_role: "client" },
      };
      for (const route of allowed) {
        await assertSurfaceGated(
          await proxy(request(CLIENT_HOST, route.pathname, route)),
          `client shot plan ${route.method} ${route.pathname}`,
        );
      }
      assert.equal(runtimeState.__ccoLaunchGateGetUserCalls, callsBeforeDenied);
    });

    await t.test("governed production-schedule APIs are exact, method-aware, and staff-only", async () => {
      runtimeState.__ccoLaunchGateGetUserCalls = 0;
      runtimeState.__ccoLaunchGateUser = {
        app_metadata: { content_coop_role: "staff" },
      };
      const allowed = [
        { pathname: `/api/projects/${RESOURCE_ID}/production-schedule`, method: "GET" },
        { pathname: `/api/projects/${RESOURCE_ID}/production-schedule`, method: "POST" },
        { pathname: `/api/projects/${RESOURCE_ID}/production-schedule/generate`, method: "POST" },
        { pathname: `/api/projects/${RESOURCE_ID}/production-schedule/submit`, method: "POST" },
        { pathname: `/api/projects/${RESOURCE_ID}/production-schedule/decision`, method: "POST" },
      ];

      for (const host of [ADMIN_HOST, CANONICAL_HOST]) {
        for (const route of allowed) {
          const response = await proxy(request(host, route.pathname, route));
          assert.equal(response.status, 200, `${host} ${route.method} ${route.pathname}`);
          assert.equal(response.headers.get("x-middleware-next"), "1");
        }
      }
      assert.equal(runtimeState.__ccoLaunchGateGetUserCalls, allowed.length * 2);

      const callsBeforeDenied = runtimeState.__ccoLaunchGateGetUserCalls;
      for (const route of [
        { pathname: `/api/projects/${RESOURCE_ID}/production-schedule`, method: "PATCH" },
        { pathname: `/api/projects/${RESOURCE_ID}/production-schedule/generate`, method: "GET" },
        { pathname: `/api/projects/${RESOURCE_ID}/production-schedule/submit`, method: "PATCH" },
        { pathname: `/api/projects/${RESOURCE_ID}/production-schedule/decision`, method: "GET" },
        { pathname: "/api/projects/not-a-uuid/production-schedule", method: "GET" },
        { pathname: `/api/projects/${RESOURCE_ID}/production-schedule/revisions`, method: "POST" },
      ]) {
        await assertLaunchGated(
          await proxy(request(ADMIN_HOST, route.pathname, route)),
          `production-schedule gate ${route.method} ${route.pathname}`,
        );
      }
      assert.equal(runtimeState.__ccoLaunchGateGetUserCalls, callsBeforeDenied);

      runtimeState.__ccoLaunchGateUser = {
        app_metadata: { content_coop_role: "client" },
      };
      for (const route of allowed) {
        await assertSurfaceGated(
          await proxy(request(CLIENT_HOST, route.pathname, route)),
          `client production schedule ${route.method} ${route.pathname}`,
        );
      }
      assert.equal(runtimeState.__ccoLaunchGateGetUserCalls, callsBeforeDenied);
    });

    await t.test("governed call-sheet APIs are exact, method-aware, and staff-only", async () => {
      runtimeState.__ccoLaunchGateGetUserCalls = 0;
      runtimeState.__ccoLaunchGateUser = {
        app_metadata: { content_coop_role: "staff" },
      };
      const allowed = [
        { pathname: `/api/projects/${RESOURCE_ID}/call-sheet`, method: "GET" },
        { pathname: `/api/projects/${RESOURCE_ID}/call-sheet`, method: "POST" },
        { pathname: `/api/projects/${RESOURCE_ID}/call-sheet/generate`, method: "POST" },
        { pathname: `/api/projects/${RESOURCE_ID}/call-sheet/submit`, method: "POST" },
        { pathname: `/api/projects/${RESOURCE_ID}/call-sheet/decision`, method: "POST" },
      ];

      for (const host of [ADMIN_HOST, CANONICAL_HOST]) {
        for (const route of allowed) {
          const response = await proxy(request(host, route.pathname, route));
          assert.equal(response.status, 200, `${host} ${route.method} ${route.pathname}`);
          assert.equal(response.headers.get("x-middleware-next"), "1");
        }
      }
      assert.equal(runtimeState.__ccoLaunchGateGetUserCalls, allowed.length * 2);

      const callsBeforeDenied = runtimeState.__ccoLaunchGateGetUserCalls;
      for (const route of [
        { pathname: `/api/projects/${RESOURCE_ID}/call-sheet`, method: "PATCH" },
        { pathname: `/api/projects/${RESOURCE_ID}/call-sheet/generate`, method: "GET" },
        { pathname: `/api/projects/${RESOURCE_ID}/call-sheet/submit`, method: "PATCH" },
        { pathname: `/api/projects/${RESOURCE_ID}/call-sheet/decision`, method: "GET" },
        { pathname: "/api/projects/not-a-uuid/call-sheet", method: "GET" },
        { pathname: `/api/projects/${RESOURCE_ID}/call-sheet/revisions`, method: "POST" },
      ]) {
        await assertLaunchGated(
          await proxy(request(ADMIN_HOST, route.pathname, route)),
          `call-sheet gate ${route.method} ${route.pathname}`,
        );
      }
      assert.equal(runtimeState.__ccoLaunchGateGetUserCalls, callsBeforeDenied);

      runtimeState.__ccoLaunchGateUser = {
        app_metadata: { content_coop_role: "client" },
      };
      for (const route of allowed) {
        await assertSurfaceGated(
          await proxy(request(CLIENT_HOST, route.pathname, route)),
          `client call sheet ${route.method} ${route.pathname}`,
        );
      }
      assert.equal(runtimeState.__ccoLaunchGateGetUserCalls, callsBeforeDenied);
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
      await assertLaunchGated(
        await proxy(
          request(ADMIN_HOST, "/api/transcode/worker", {
            method: "POST",
            headers: { "x-codeliver-media-worker-token": "candidate" },
          }),
        ),
        "metering-unbound worker execution",
      );
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

    await t.test("localhost demo APIs remain authentication-gated", async () => {
      runtimeState.__ccoLaunchGateGetUserCalls = 0;
      runtimeState.__ccoLaunchGateUser = null;

      for (const pathname of [
        "/api/media/browse?demo=1",
        "/api/usage/summary?demo=1",
        "/api/transcode/worker?demo=1",
      ]) {
        const response = await proxy(request("localhost:4103", pathname, { method: "POST" }));
        assert.equal(response.status, 401, pathname);
        assert.equal(response.headers.get("x-middleware-next"), null, pathname);
        assert.deepEqual(
          await response.json(),
          { error: "Authentication required", code: "AUTH_REQUIRED" },
          pathname,
        );
      }
      assert.equal(runtimeState.__ccoLaunchGateGetUserCalls, 3);
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
