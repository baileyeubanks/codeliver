import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const authStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function createSupabaseAuth() {
    if (globalThis.__ccoLifecycleThrow) throw new Error("provider unavailable");
    return {
      auth: {
        async resetPasswordForEmail(email, options) {
          globalThis.__ccoLifecycleResetRequest = { email, options };
          return { error: globalThis.__ccoLifecycleProviderError ?? null };
        },
        async resend(input) {
          globalThis.__ccoLifecycleResendRequest = input;
          return { error: globalThis.__ccoLifecycleProviderError ?? null };
        },
        async getUser() {
          return globalThis.__ccoLifecycleIdentity;
        },
        async updateUser(input) {
          globalThis.__ccoLifecycleUpdateRequest = input;
          return { error: globalThis.__ccoLifecycleProviderError ?? null };
        },
        async verifyOtp(input) {
          globalThis.__ccoLifecycleVerifyRequest = input;
          return { error: globalThis.__ccoLifecycleProviderError ?? null };
        },
        async signOut(options) {
          globalThis.__ccoLifecycleSignOutCalls.push(options);
          return { error: null };
        }
      }
    };
  }
`)}`;
const requireAuthStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function requireAuth() {
    const identity = globalThis.__ccoLifecycleIdentity;
    if (identity?.error) throw new Error("provider unavailable");
    return identity?.data?.user ?? null;
  }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/supabase-auth") return nextResolve(authStubUrl, context);
    if (specifier === "@/lib/auth") return nextResolve(requireAuthStubUrl, context);
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

type LifecycleState = typeof globalThis & {
  __ccoLifecycleThrow?: boolean;
  __ccoLifecycleProviderError?: null | { message: string; status?: number };
  __ccoLifecycleIdentity?: {
    data: { user: null | {
      id: string;
      email?: string;
      email_confirmed_at?: string | null;
      app_metadata: Record<string, unknown>;
      user_metadata?: Record<string, unknown>;
    } };
    error: null | { message: string };
  };
  __ccoLifecycleResetRequest?: Record<string, unknown>;
  __ccoLifecycleResendRequest?: Record<string, unknown>;
  __ccoLifecycleUpdateRequest?: Record<string, unknown>;
  __ccoLifecycleVerifyRequest?: Record<string, unknown>;
  __ccoLifecycleSignOutCalls: Array<{ scope: "local" }>;
};

const state = globalThis as LifecycleState;

test.beforeEach(() => {
  state.__ccoLifecycleThrow = false;
  state.__ccoLifecycleProviderError = null;
  state.__ccoLifecycleIdentity = {
    data: {
      user: {
        id: "pending-user",
        email: "person@example.com",
        email_confirmed_at: "2026-07-26T12:00:00.000Z",
        app_metadata: {},
        user_metadata: { display_name: "Person" },
      },
    },
    error: null,
  };
  state.__ccoLifecycleResetRequest = undefined;
  state.__ccoLifecycleResendRequest = undefined;
  state.__ccoLifecycleUpdateRequest = undefined;
  state.__ccoLifecycleVerifyRequest = undefined;
  state.__ccoLifecycleSignOutCalls = [];
});

async function route(path: string) {
  return import(pathToFileURL(resolve(repositoryRoot, path)).href);
}

test("password recovery normalizes email, binds the managed host, and never enumerates accounts", async () => {
  const { POST } = await route("app/api/auth/password/forgot/route.ts");
  const request = () => new Request("https://co-videopro.com/api/auth/password/forgot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: " Person@Example.com " }),
  });

  const accepted = await POST(request());
  assert.equal(accepted.status, 202);
  assert.deepEqual(state.__ccoLifecycleResetRequest, {
    email: "person@example.com",
    options: { redirectTo: "https://co-videopro.com/auth/callback?flow=recovery" },
  });

  state.__ccoLifecycleProviderError = { message: "user not found", status: 400 };
  const hiddenRejection = await POST(request());
  assert.equal(hiddenRejection.status, 202);
  assert.match((await hiddenRejection.json()).message, /if an account exists/i);

  state.__ccoLifecycleProviderError = { message: "provider down", status: 503 };
  const unavailable = await POST(request());
  assert.equal(unavailable.status, 503);
});

test("password reset requires a verified session, validates strength, updates, and signs out", async () => {
  const { POST } = await route("app/api/auth/password/reset/route.ts");
  const request = (password: string) => new Request("https://co-videopro.com/api/auth/password/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });

  const weak = await POST(request("short"));
  assert.equal(weak.status, 400);
  assert.equal(state.__ccoLifecycleUpdateRequest, undefined);

  state.__ccoLifecycleIdentity = { data: { user: null }, error: null };
  const missingSession = await POST(request("strong-password"));
  assert.equal(missingSession.status, 401);

  state.__ccoLifecycleIdentity = {
    data: { user: { id: "user", app_metadata: {} } },
    error: null,
  };
  const updated = await POST(request("strong-password"));
  assert.equal(updated.status, 200);
  assert.deepEqual(state.__ccoLifecycleUpdateRequest, { password: "strong-password" });
  assert.deepEqual(state.__ccoLifecycleSignOutCalls, [{ scope: "local" }]);
});

test("confirmation resend stays generic and preserves only a safe return path", async () => {
  const { POST } = await route("app/api/auth/resend/route.ts");
  const response = await POST(new Request("https://client.contentco-op.com/api/auth/resend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "Person@Example.com",
      next: "https://attacker.example/session",
    }),
  }));

  assert.equal(response.status, 202);
  assert.deepEqual(state.__ccoLifecycleResendRequest, {
    type: "signup",
    email: "person@example.com",
    options: {
      emailRedirectTo: "https://client.contentco-op.com/auth/callback?flow=signup&next=%2Fprojects",
    },
  });
});

test("token-hash confirmations create a verified session and route each lifecycle state", async () => {
  const { GET } = await route("app/auth/confirm/route.ts");

  const pending = await GET(new Request(
    "https://co-videopro.com/auth/confirm?token_hash=hash&type=signup&next=/projects/film",
  ));
  assert.equal(pending.status, 303);
  assert.equal(
    pending.headers.get("location"),
    "https://co-videopro.com/onboarding?next=%2Fprojects%2Ffilm",
  );
  assert.deepEqual(state.__ccoLifecycleVerifyRequest, {
    token_hash: "hash",
    type: "signup",
  });

  const recovery = await GET(new Request(
    "https://co-videopro.com/auth/confirm?token_hash=recovery-hash&type=recovery",
  ));
  assert.equal(recovery.headers.get("location"), "https://co-videopro.com/reset-password");

  state.__ccoLifecycleIdentity = {
    data: {
      user: {
        id: "staff-user",
        app_metadata: { content_coop_role: "staff" },
      },
    },
    error: null,
  };
  const staff = await GET(new Request(
    "https://co-videopro.com/auth/confirm?token_hash=staff-hash&type=email&next=/projects/film",
  ));
  assert.equal(staff.headers.get("location"), "https://co-videopro.com/projects/film");
});

test("session status exposes onboarding state without granting a role", async () => {
  const { GET } = await route("app/api/auth/session/route.ts");
  const response = await GET();
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.authenticated, true);
  assert.deepEqual(payload.access, {
    state: "pending",
    email_confirmed: true,
    required_surface: null,
  });
  assert.equal(payload.workspace_role, "viewer");
});

test("the branded front door exposes every standard credential lifecycle entry point", () => {
  const login = readFileSync(resolve(repositoryRoot, "app/login/page.tsx"), "utf8");
  const signup = readFileSync(resolve(repositoryRoot, "app/signup/page.tsx"), "utf8");
  const proxy = readFileSync(resolve(repositoryRoot, "proxy.ts"), "utf8");

  assert.match(login, /Forgot password\?/);
  assert.match(login, /Create an account/);
  assert.match(signup, /Resend confirmation email/);
  for (const routePath of [
    "/forgot-password",
    "/reset-password",
    "/onboarding",
    "/auth/confirm",
  ]) {
    assert.equal(proxy.includes(`"${routePath}"`), true, routePath);
  }
});
