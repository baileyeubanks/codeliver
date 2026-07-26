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
        async getUser() {
          return globalThis.__ccoLoginIdentity;
        },
        async signOut(options) {
          globalThis.__ccoLoginSignOut = options;
          return { error: null };
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
  __ccoLoginResult?: { error: null | { message: string } };
  __ccoLoginThrown?: Error;
  __ccoLoginIdentity?: {
    data: { user: { app_metadata: Record<string, unknown> } | null };
    error: null | { message: string };
  };
  __ccoLoginSignOut?: { scope: "local" };
};

const state = globalThis as LoginState;

test.beforeEach(() => {
  state.__ccoLoginThrown = undefined;
  state.__ccoLoginResult = { error: null };
  state.__ccoLoginIdentity = {
    data: { user: { app_metadata: { content_coop_role: "client" } } },
    error: null,
  };
  state.__ccoLoginSignOut = undefined;
});

async function login(body: unknown): Promise<Response> {
  const { POST } = await import(
    pathToFileURL(resolve(repositoryRoot, "app/api/auth/login/route.ts")).href
  );
  return POST(new Request("https://client.contentco-op.com/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

test("login API returns a stable generic rejection without provider details", async () => {
  state.__ccoLoginThrown = undefined;
  state.__ccoLoginResult = {
    error: { message: "Supabase says this private account was deleted" },
  };

  const response = await login({
    email: "Owner@Example.com",
    password: "secret-password",
  });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: "Email or password was not accepted.",
    code: "AUTH_INVALID_CREDENTIALS",
  });
  assert.deepEqual(state.__ccoLoginInput, {
    email: "owner@example.com",
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
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    error: "Authentication is temporarily unavailable.",
    code: "AUTH_UNAVAILABLE",
  });
  state.__ccoLoginThrown = undefined;
});

test("login API gives malformed credentials a stable validation code", async () => {
  state.__ccoLoginResult = { error: null };
  state.__ccoLoginThrown = undefined;

  const response = await login({ email: "client@example.com" });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Email and password are required.",
    code: "AUTH_CREDENTIALS_REQUIRED",
  });
});

test("login routes a verified but unprovisioned identity into onboarding", async () => {
  state.__ccoLoginIdentity = {
    data: { user: { app_metadata: {} } },
    error: null,
  };

  const response = await login({
    email: "new@example.com",
    password: "secret-password",
    next: "/projects/ica?view=review",
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    access: { state: "pending" },
    destination: "/onboarding?next=%2Fprojects%2Fica%3Fview%3Dreview",
  });
});
