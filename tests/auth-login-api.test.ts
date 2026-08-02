import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const authStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function createSupabaseAuth() {
    return {
      auth: {
        async signInWithPassword(input) {
          globalThis.__ccoLoginInput = input;
          if (globalThis.__ccoLoginThrown) throw globalThis.__ccoLoginThrown;
          return globalThis.__ccoLoginResult;
        },
        async signOut(options) {
          globalThis.__ccoLoginSignOutCalls = [
            ...(globalThis.__ccoLoginSignOutCalls ?? []),
            options,
          ];
          return { error: globalThis.__ccoLoginSignOutError ?? null };
        }
      }
    };
  }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/supabase-auth") return nextResolve(authStubUrl, context);
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

type LoginState = typeof globalThis & {
  __ccoLoginInput?: { email: string; password: string };
  __ccoLoginResult?: {
    data?: {
      user?: { app_metadata: Record<string, unknown> } | null;
      session?: { user: { app_metadata: Record<string, unknown> } } | null;
    };
    error: null | { message: string };
  };
  __ccoLoginThrown?: Error;
  __ccoLoginSignOutCalls?: Array<{ scope: string }>;
  __ccoLoginSignOutError?: { message: string } | null;
};

const state = globalThis as LoginState;

async function login(
  body: unknown,
  host = "client.contentco-op.com",
): Promise<Response> {
  const { POST } = await import(
    pathToFileURL(resolve(repositoryRoot, "app/api/auth/login/route.ts")).href
  );
  return POST(new Request(`https://${host}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

test("login API returns a stable generic rejection without provider details", async () => {
  state.__ccoLoginThrown = undefined;
  state.__ccoLoginSignOutCalls = [];
  state.__ccoLoginSignOutError = null;
  state.__ccoLoginResult = {
    error: { message: "Supabase says this private account was deleted" },
  };

  const response = await login({
    email: "Bailey@ContentCo-op.com",
    password: "secret-password",
  });

  assert.equal(response.status, 401);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), {
    error: "Email or password was not accepted.",
    code: "AUTH_INVALID_CREDENTIALS",
  });
  assert.deepEqual(state.__ccoLoginInput, {
    email: "bailey@contentco-op.com",
    password: "secret-password",
  });
});

test("login API converts thrown provider failures into a stable unavailable response", async () => {
  state.__ccoLoginResult = undefined;
  state.__ccoLoginThrown = new Error("provider stack and project details");

  const response = await login({
    email: "client@example.com",
    password: "secret-password",
  });

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "Authentication is temporarily unavailable.",
    code: "AUTH_UNAVAILABLE",
  });
  state.__ccoLoginThrown = undefined;
});

test("login API gives malformed credentials a stable validation code", async () => {
  state.__ccoLoginResult = { data: {}, error: null };
  state.__ccoLoginThrown = undefined;

  const response = await login({ email: "client@example.com" });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Email and password are required.",
    code: "AUTH_CREDENTIALS_REQUIRED",
  });
});

test("login API admits only a trusted role on its matching managed surface", async () => {
  state.__ccoLoginThrown = undefined;
  state.__ccoLoginSignOutCalls = [];
  state.__ccoLoginSignOutError = null;
  state.__ccoLoginResult = {
    data: { user: { app_metadata: { content_coop_role: "client" } } },
    error: null,
  };

  const response = await login({
    email: "reviewer@example.com",
    password: "secret-password",
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), { success: true });
  assert.deepEqual(state.__ccoLoginSignOutCalls, []);
});

test("login API clears a valid session that has no provisioned surface role", async () => {
  state.__ccoLoginThrown = undefined;
  state.__ccoLoginSignOutCalls = [];
  state.__ccoLoginSignOutError = null;
  state.__ccoLoginResult = {
    data: { user: { app_metadata: {} } },
    error: null,
  };

  const response = await login({
    email: "pending@example.com",
    password: "secret-password",
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: "Account access is pending approval.",
    code: "AUTH_ACCESS_PENDING",
  });
  assert.deepEqual(state.__ccoLoginSignOutCalls, [{ scope: "local" }]);
});

test("pending users can sign in only to an exact opaque invitation return path", async () => {
  state.__ccoLoginThrown = undefined;
  state.__ccoLoginSignOutCalls = [];
  state.__ccoLoginSignOutError = null;
  state.__ccoLoginResult = {
    data: { user: { app_metadata: {} } },
    error: null,
  };
  const invitePath = "/invite/inviteToken_1234567890-ABCDEFGH";

  const accepted = await login({
    email: "pending@example.com",
    password: "secret-password",
    next: invitePath,
  });

  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), {
    success: true,
    access: { state: "invite_pending", authorityGranted: false },
  });
  assert.deepEqual(state.__ccoLoginSignOutCalls, []);

  const rejected = await login({
    email: "pending@example.com",
    password: "secret-password",
    next: `${invitePath}?admin=1`,
  });
  assert.equal(rejected.status, 403);
  assert.equal((await rejected.json()).code, "AUTH_ACCESS_PENDING");
  assert.deepEqual(state.__ccoLoginSignOutCalls, [{ scope: "local" }]);
});

test("login API clears cross-surface sessions and names the required portal", async () => {
  state.__ccoLoginThrown = undefined;
  state.__ccoLoginSignOutCalls = [];
  state.__ccoLoginSignOutError = null;
  state.__ccoLoginResult = {
    data: { user: { app_metadata: { content_coop_role: "staff" } } },
    error: null,
  };

  const response = await login({
    email: "producer@contentco-op.com",
    password: "secret-password",
  });

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: "This account uses a different Co-VideoPro portal.",
    code: "AUTH_SURFACE_MISMATCH",
    requiredSurface: "admin",
  });
  assert.deepEqual(state.__ccoLoginSignOutCalls, [{ scope: "local" }]);
});

test("login API fails closed when a rejected session cannot be cleared", async () => {
  state.__ccoLoginThrown = undefined;
  state.__ccoLoginSignOutCalls = [];
  state.__ccoLoginSignOutError = { message: "private provider failure" };
  state.__ccoLoginResult = {
    data: { user: { app_metadata: {} } },
    error: null,
  };

  const response = await login({
    email: "pending@example.com",
    password: "secret-password",
  });

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "Authentication is temporarily unavailable.",
    code: "AUTH_UNAVAILABLE",
  });
  state.__ccoLoginSignOutError = null;
});
