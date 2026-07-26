import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEAM_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

const authStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function requireAuth() {
    return globalThis.__ccoWebhookBoundaryState.authenticate();
  }
`)}`;
const supabaseStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function getSupabase() {
    return globalThis.__ccoWebhookBoundaryState.supabase;
  }
`)}`;
const dataAuthorityStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function getSupabaseDataSchema() { return "co_production"; }
`)}`;
const roleStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function requireTeamRole(teamId, userId, role) {
    return globalThis.__ccoWebhookBoundaryState.authorize(teamId, userId, role);
  }
`)}`;
const nextServerStubUrl = `data:text/javascript,${encodeURIComponent(`
  export const NextResponse = {
    json(body, init = {}) {
      const headers = new Headers(init.headers);
      headers.set("content-type", "application/json");
      return new Response(JSON.stringify(body), { ...init, headers });
    },
  };
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve(nextServerStubUrl, context);
    if (specifier === "@/lib/auth") return nextResolve(authStubUrl, context);
    if (specifier === "@/lib/supabase") return nextResolve(supabaseStubUrl, context);
    if (specifier === "@/lib/data-authority") return nextResolve(dataAuthorityStubUrl, context);
    if (specifier === "@/lib/middleware/rbac") return nextResolve(roleStubUrl, context);
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

interface BoundaryState {
  authenticate: () => Promise<{ id: string; email: string } | null>;
  authorize: (
    teamId: string,
    userId: string,
    role: string,
  ) => Promise<{ allowed: boolean; role: string | null }>;
  supabase: {
    rpc: (
      name: string,
      input: Record<string, unknown>,
    ) => Promise<{
      data: { allowed: boolean; retry_after_seconds: number }[];
      error: null;
    }>;
    from: (table: string) => unknown;
  };
}

const globalState = globalThis as typeof globalThis & {
  __ccoWebhookBoundaryState: BoundaryState;
};

const webhookRouteUrl = pathToFileURL(
  resolve(repositoryRoot, "app/api/webhooks/route.ts"),
).href;
const webhookRoutePromise = import(webhookRouteUrl);
const webhookRouteSource = readFileSync(
  resolve(repositoryRoot, "app/api/webhooks/route.ts"),
  "utf8",
);

function managementUrl(teamId = TEAM_ID) {
  return `http://localhost/api/webhooks?team_id=${encodeURIComponent(teamId)}`;
}

function installBoundaryState(
  t: { after(callback: () => void): void },
  overrides: Partial<BoundaryState> = {},
) {
  const calls = {
    auth: 0,
    role: 0,
    rate: 0,
    from: 0,
  };
  const defaults: BoundaryState = {
    authenticate: async () => {
      calls.auth += 1;
      return { id: USER_ID, email: "admin@example.test" };
    },
    authorize: async (teamId, userId, role) => {
      calls.role += 1;
      assert.deepEqual([teamId, userId, role], [TEAM_ID, USER_ID, "admin"]);
      return { allowed: true, role: "admin" };
    },
    supabase: {
      rpc: async (name, input) => {
        calls.rate += 1;
        assert.equal(name, "reserve_webhook_management_rate_limit");
        assert.equal(input.p_team_id, TEAM_ID);
        assert.equal(input.p_actor_id, USER_ID);
        return {
          data: [{ allowed: true, retry_after_seconds: 60 }],
          error: null,
        };
      },
      from: (table) => {
        calls.from += 1;
        throw new Error(`Unexpected database table access: ${table}`);
      },
    },
  };

  globalState.__ccoWebhookBoundaryState = {
    ...defaults,
    ...overrides,
    supabase: {
      ...defaults.supabase,
      ...overrides.supabase,
    },
  };
  t.after(() => {
    delete (
      globalState as Partial<typeof globalState>
    ).__ccoWebhookBoundaryState;
  });
  return calls;
}

test("unsupported webhook methods return explicit JSON 405 responses", async () => {
  const route = (await webhookRoutePromise) as unknown as Record<string, unknown>;

  for (const method of ["HEAD", "OPTIONS", "PUT"]) {
    const handler = route[method];
    assert.equal(typeof handler, "function", `${method} must be explicitly handled`);
    const response = await (handler as () => Promise<Response>)();
    assert.equal(response.status, 405, method);
    assert.deepEqual(await response.json(), {
      error: "Method not allowed",
      code: "METHOD_NOT_ALLOWED",
    });
    assert.equal(response.headers.get("allow"), "GET, POST, PATCH, DELETE");
  }
});

test("authentication runs before team lookup, rate authority, or body parsing", async (t) => {
  const calls = installBoundaryState(t, {
    authenticate: async () => {
      calls.auth += 1;
      return null;
    },
  });
  const route = await webhookRoutePromise;
  const response = await route.POST(
    new Request(managementUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    }),
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: "Authentication required",
    code: "AUTH_REQUIRED",
  });
  assert.deepEqual(calls, { auth: 1, role: 0, rate: 0, from: 0 });
});

test("authentication-provider failure is a stable no-store 503", async (t) => {
  installBoundaryState(t, {
    authenticate: async () => {
      throw new Error("private provider endpoint");
    },
  });
  const route = await webhookRoutePromise;
  const response = await route.POST(
    new Request(managementUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    }),
  );

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    error: "Authentication service is unavailable",
    code: "AUTH_UNAVAILABLE",
  });
});

test("team admin authorization runs before the rate gate or body parsing", async (t) => {
  const calls = installBoundaryState(t, {
    authorize: async () => {
      calls.role += 1;
      return { allowed: false, role: null };
    },
  });
  const route = await webhookRoutePromise;
  const response = await route.PATCH(
    new Request(managementUrl(), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: "{",
    }),
  );

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: "Team administrator access required",
    code: "TEAM_ADMIN_REQUIRED",
  });
  assert.deepEqual(calls, { auth: 1, role: 1, rate: 0, from: 0 });
});

test("per-team rate limiting runs before body parsing or webhook queries", async (t) => {
  const calls = installBoundaryState(t, {
    supabase: {
      rpc: async () => {
        calls.rate += 1;
        return {
          data: [{ allowed: false, retry_after_seconds: 37 }],
          error: null,
        };
      },
      from: () => {
        calls.from += 1;
        throw new Error("webhook query must not run");
      },
    },
  });
  const route = await webhookRoutePromise;
  const response = await route.DELETE(
    new Request(managementUrl(), {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: "{",
    }),
  );

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "37");
  assert.deepEqual(await response.json(), {
    error: "Webhook management rate exceeded",
    code: "WEBHOOK_RATE_LIMITED",
  });
  assert.deepEqual(calls, { auth: 1, role: 1, rate: 1, from: 0 });
});

test("authorized malformed control-plane JSON returns a deterministic 400", async (t) => {
  const calls = installBoundaryState(t);
  const route = await webhookRoutePromise;
  const response = await route.POST(
    new Request(managementUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    }),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Request body must be valid JSON",
    code: "INVALID_JSON",
  });
  assert.deepEqual(calls, { auth: 1, role: 1, rate: 1, from: 0 });
});

test("provider-event headers cannot bypass the management preflight", async (t) => {
  const calls = installBoundaryState(t);
  const route = await webhookRoutePromise;
  const response = await route.POST(
    new Request(managementUrl(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-cco-notification-signature": "sha256=untrusted",
      },
      body: "{",
    }),
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: "Provider events are not accepted at this endpoint",
    code: "WRONG_WEBHOOK_ENDPOINT",
  });
  assert.deepEqual(calls, { auth: 1, role: 1, rate: 1, from: 0 });
});

test("listed webhook rows never serialize persisted secret columns", async (t) => {
  const secretRow = {
    id: "hook-1",
    team_id: TEAM_ID,
    url: "https://hooks.example.test/events",
    events: ["asset.approved"],
    secret: "whsec_plaintext_must_not_escape",
    secret_ciphertext: "v1.ciphertext.must_not_escape",
    active: true,
    created_at: "2026-07-25T00:00:00.000Z",
  };
  const calls = installBoundaryState(t, {
    supabase: {
      rpc: async () => {
        calls.rate += 1;
        return {
          data: [{ allowed: true, retry_after_seconds: 60 }],
          error: null,
        };
      },
      from: (table) => {
        calls.from += 1;
        assert.equal(table, "webhooks");
        const chain = {
          select() {
            return chain;
          },
          eq(column: string, value: string) {
            assert.deepEqual([column, value], ["team_id", TEAM_ID]);
            return chain;
          },
          async order() {
            return { data: [secretRow], error: null };
          },
        };
        return chain;
      },
    },
  });
  const route = await webhookRoutePromise;
  const response = await route.GET(new Request(managementUrl()));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(JSON.stringify(payload).includes(secretRow.secret), false);
  assert.equal(JSON.stringify(payload).includes(secretRow.secret_ciphertext), false);
  assert.deepEqual(payload.items[0], {
    id: secretRow.id,
    team_id: TEAM_ID,
    url: secretRow.url,
    events: secretRow.events,
    active: true,
    created_at: secretRow.created_at,
    signing_secret_configured: true,
  });
  assert.deepEqual(calls, { auth: 1, role: 1, rate: 1, from: 1 });
});

test("webhook route source keeps bounded JSON, team scoping, and secret sanitization", () => {
  assert.match(webhookRouteSource, /withoutPersistedWebhookSecrets/);
  assert.match(webhookRouteSource, /reserve_webhook_management_rate_limit/);
  assert.match(webhookRouteSource, /\.eq\("team_id", context\.teamId\)/);
  assert.doesNotMatch(webhookRouteSource, /error:\s*error\.message/);
});
