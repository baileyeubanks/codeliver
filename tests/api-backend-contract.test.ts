import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const nextServerStubUrl = `data:text/javascript,${encodeURIComponent(`
  export const NextResponse = {
    json(body, init = {}) {
      const headers = new Headers(init.headers);
      headers.set("content-type", "application/json");
      return new Response(JSON.stringify(body), { ...init, headers });
    },
  };
`)}`;
const authStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function requireAuth() {
    return globalThis.__ccoApiBackendState.requireAuth();
  }
`)}`;
const authClientStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function requireAuthWithClient() {
    return globalThis.__ccoApiBackendState.requireAuthWithClient();
  }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve(nextServerStubUrl, context);
    if (specifier === "@/lib/auth") return nextResolve(authStubUrl, context);
    if (specifier === "@/lib/auth-client") {
      return nextResolve(authClientStubUrl, context);
    }
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

type ApiBackendState = {
  requireAuth: () => Promise<
    { id: string; email: string; app_metadata?: Record<string, unknown> } | null
  >;
  requireAuthWithClient: () => Promise<{
    user: { id: string } | null;
    supabase: unknown;
  }>;
};

const state = globalThis as typeof globalThis & {
  __ccoApiBackendState: ApiBackendState;
};

function installState(
  t: { after(callback: () => void): void },
  overrides: Partial<ApiBackendState> = {},
) {
  state.__ccoApiBackendState = {
    requireAuth: async () => null,
    requireAuthWithClient: async () => ({
      user: null,
      supabase: {},
    }),
    ...overrides,
  };
  t.after(() => {
    delete (state as Partial<typeof state>).__ccoApiBackendState;
  });
}

const sessionRoutePromise = import(
  pathToFileURL(resolve(repositoryRoot, "app/api/auth/session/route.ts")).href
);
const projectsRoutePromise = import(
  pathToFileURL(resolve(repositoryRoot, "app/api/projects/route.ts")).href
);
const assetsRoutePromise = import(
  pathToFileURL(resolve(repositoryRoot, "app/api/assets/route.ts")).href
);

test("session returns a stable no-store 401 when logged out", async (t) => {
  installState(t);
  const route = await sessionRoutePromise;
  const response = await route.GET();

  assert.equal(response.status, 401);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { authenticated: false });
});

test("session returns the authenticated identity with no-store", async (t) => {
  installState(t, {
    requireAuth: async () => ({
      id: "user-1",
      email: "operator@example.test",
    }),
  });
  const route = await sessionRoutePromise;
  const response = await route.GET();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    authenticated: true,
    email: "operator@example.test",
    id: "user-1",
    display_name: null,
    workspace_role: "viewer",
  });
});

test("session maps provisioned metadata to workspace identity fields", async (t) => {
  installState(t, {
    requireAuth: async () => ({
      id: "user-2",
      email: "producer@contentco-op.com",
      user_metadata: { display_name: "Studio Producer" },
      app_metadata: { content_coop_role: "staff" },
    }),
  });
  const route = await sessionRoutePromise;
  const response = await route.GET();
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.display_name, "Studio Producer");
  assert.equal(payload.workspace_role, "owner");
});

test("session converts authentication infrastructure failure to structured 503", async (t) => {
  installState(t, {
    requireAuth: async () => {
      throw new Error("private provider endpoint and credentials");
    },
  });
  const route = await sessionRoutePromise;
  const response = await route.GET();

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    error: "Backend service is unavailable",
    code: "BACKEND_UNAVAILABLE",
  });
});

test("projects and assets convert auth-backend failure before querying data", async (t) => {
  installState(t, {
    requireAuthWithClient: async () => {
      throw new Error("missing or unreachable backend");
    },
  });
  const [projects, assets] = await Promise.all([
    projectsRoutePromise,
    assetsRoutePromise,
  ]);

  for (const [label, response] of [
    ["projects", await projects.GET()],
    ["assets", await assets.GET()],
  ] as const) {
    assert.equal(response.status, 503, label);
    assert.equal(response.headers.get("cache-control"), "no-store", label);
    assert.deepEqual(
      await response.json(),
      {
        error: "Backend service is unavailable",
        code: "BACKEND_UNAVAILABLE",
      },
      label,
    );
  }
});

test("global API contract uses one backend code and no-store header rule", async () => {
  const proxySource = readFileSync(resolve(repositoryRoot, "proxy.ts"), "utf8");
  assert.match(proxySource, /code:\s*"BACKEND_UNAVAILABLE"/);
  assert.doesNotMatch(proxySource, /AUTH_NOT_CONFIGURED/);

  const { default: nextConfig } = await import(
    pathToFileURL(resolve(repositoryRoot, "next.config.ts")).href
  );
  const headerRules = await nextConfig.headers?.();
  const apiRule = headerRules?.find((rule) => rule.source === "/api/:path*");
  const cacheHeader = apiRule?.headers.find(
    (header) => header.key.toLowerCase() === "cache-control",
  );
  assert.equal(cacheHeader?.value, "no-store");
});
