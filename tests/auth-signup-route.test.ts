import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const authStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function createSupabaseAuth() {
    if (globalThis.__ccoSignupAuthThrow) {
      throw new Error("Auth backend unavailable");
    }
    return {
      auth: {
        signUp: async () => ({
          data: { session: globalThis.__ccoSignupSession ?? null },
          error: globalThis.__ccoSignupAuthError ?? null,
        }),
      },
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

type SignupRoute = typeof import("../app/api/auth/signup/route.ts");
let route: SignupRoute | null = null;

async function signupRoute(): Promise<SignupRoute> {
  if (!route) route = await import("../app/api/auth/signup/route.ts");
  return route;
}

function jsonRequest(body: Record<string, unknown>) {
  return new Request("https://admin.contentco-op.com/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test.beforeEach(() => {
  globalThis.__ccoSignupAuthThrow = false;
  globalThis.__ccoSignupAuthError = null;
  globalThis.__ccoSignupSession = null;
});

test("signup backend failure reports 503, not a misleading user error", async () => {
  globalThis.__ccoSignupAuthThrow = true;
  const { POST } = await signupRoute();
  const response = await POST(jsonRequest({ email: "bailey@example.com", password: "secret123", display_name: "Bailey" }) as never);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    error: "Account service is unavailable.",
    code: "AUTH_UNAVAILABLE",
  });
});

test("signup auth rejection stays a generic 400 (no account enumeration)", async () => {
  globalThis.__ccoSignupAuthError = { message: "User already registered" };
  const { POST } = await signupRoute();
  const response = await POST(jsonRequest({ email: "bailey@example.com", password: "secret123", display_name: "Bailey" }) as never);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Account creation could not be completed.",
    code: "AUTH_SIGNUP_REJECTED",
  });
});

test("signup success returns pending access", async () => {
  const { POST } = await signupRoute();
  const response = await POST(jsonRequest({ email: "bailey@example.com", password: "secret123", display_name: "Bailey" }) as never);
  assert.equal(response.status, 202);
  const payload = await response.json();
  assert.equal(payload.access.state, "pending");
});

test("signup validates input before touching the backend", async () => {
  globalThis.__ccoSignupAuthThrow = true;
  const { POST } = await signupRoute();
  const weak = await POST(jsonRequest({ email: "bailey@example.com", password: "123", display_name: "Bailey" }) as never);
  assert.equal(weak.status, 400, "short password rejected without backend");
  const missing = await POST(jsonRequest({ email: "" }) as never);
  assert.equal(missing.status, 400);
});
