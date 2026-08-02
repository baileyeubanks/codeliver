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
        async signUp(input) {
          globalThis.__ccoSignupInput = input;
          return globalThis.__ccoSignupResult;
        },
        async exchangeCodeForSession(code) {
          globalThis.__ccoExchangeCodes.push(code);
          return globalThis.__ccoExchangeResult;
        },
        async signOut(options) {
          globalThis.__ccoSignOutCalls.push(options);
          return { error: globalThis.__ccoSignOutError ?? null };
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

type AuthState = typeof globalThis & {
  __ccoSignupInput?: Record<string, unknown>;
  __ccoSignupResult?: { data: unknown; error: null | { message: string } };
  __ccoExchangeCodes: string[];
  __ccoSignOutCalls: Array<{ scope: "local" }>;
  __ccoSignOutError?: { message: string } | null;
  __ccoExchangeResult?: {
    data: { user: Record<string, unknown> | null; session: { user: Record<string, unknown> } | null };
    error: null | { message: string };
  };
};

const state = globalThis as AuthState;
state.__ccoExchangeCodes = [];
state.__ccoSignOutCalls = [];

test("public signup returns pending access and cannot self-grant authority", async () => {
  state.__ccoSignupResult = { data: { user: { id: "new-user" } }, error: null };
  const { POST } = await import(pathToFileURL(resolve(repositoryRoot, "app/api/auth/signup/route.ts")).href);
  const response = await POST(new Request("https://client.contentco-op.com/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: " Staff@ContentCo-op.com ",
      password: "secret-password",
      display_name: " Content Producer ",
      role: "admin",
      content_coop_role: "staff",
    }),
  }));

  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), {
    success: true,
    access: { state: "pending", authorityGranted: false },
    message: "Account created. Access is pending approval.",
  });
  assert.deepEqual(state.__ccoSignupInput, {
    email: "staff@contentco-op.com",
    password: "secret-password",
    options: {
      data: { display_name: "Content Producer" },
      emailRedirectTo: "https://client.contentco-op.com/auth/callback",
    },
  });
});

test("signup preserves only an exact invitation return path through confirmation", async () => {
  state.__ccoSignupResult = { data: { user: { id: "invited-user" } }, error: null };
  const { POST } = await import(pathToFileURL(resolve(repositoryRoot, "app/api/auth/signup/route.ts")).href);
  const invitePath = "/invite/inviteToken_1234567890-ABCDEFGH";
  const response = await POST(new Request("https://client.contentco-op.com/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "invited@example.com",
      password: "secret-password",
      display_name: "Invited Reviewer",
      next: invitePath,
    }),
  }));

  assert.equal(response.status, 202);
  assert.equal(
    (state.__ccoSignupInput?.options as { emailRedirectTo?: string }).emailRedirectTo,
    `https://client.contentco-op.com/auth/callback?next=${encodeURIComponent(invitePath)}`,
  );

  await POST(new Request("https://client.contentco-op.com/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "invited@example.com",
      password: "secret-password",
      next: `${invitePath}?elevate=1`,
    }),
  }));
  assert.equal(
    (state.__ccoSignupInput?.options as { emailRedirectTo?: string }).emailRedirectTo,
    "https://client.contentco-op.com/auth/callback",
  );
});

test("callback rejects missing and failed exchanges without leaking provider details", async () => {
  const { GET } = await import(pathToFileURL(resolve(repositoryRoot, "app/auth/callback/route.ts")).href);
  state.__ccoExchangeCodes = [];

  const missing = await GET(new Request("https://admin.contentco-op.com/auth/callback?next=/settings"));
  const missingLocation = new URL(missing.headers.get("location") ?? "");
  assert.equal(missing.status, 303);
  assert.equal(missingLocation.origin, "https://admin.contentco-op.com");
  assert.equal(missingLocation.pathname, "/login");
  assert.equal(missingLocation.searchParams.get("auth_error"), "missing_code");
  assert.equal(missingLocation.searchParams.get("next"), "/settings");
  assert.deepEqual(state.__ccoExchangeCodes, []);

  state.__ccoExchangeResult = {
    data: { user: null, session: null },
    error: { message: "provider detail that must remain private" },
  };
  const failed = await GET(new Request("https://client.contentco-op.com/auth/callback?code=bad&next=/projects/ica"));
  const failedLocation = new URL(failed.headers.get("location") ?? "");
  assert.equal(failedLocation.origin, "https://client.contentco-op.com");
  assert.equal(failedLocation.searchParams.get("auth_error"), "exchange_failed");
  assert.equal(failedLocation.toString().includes("provider"), false);
});

test("unclassified callbacks stay on the current host with an explicit pending state", async () => {
  const { GET } = await import(pathToFileURL(resolve(repositoryRoot, "app/auth/callback/route.ts")).href);
  state.__ccoSignOutCalls = [];
  state.__ccoSignOutError = null;
  state.__ccoExchangeResult = {
    data: {
      user: { id: "pending-user", app_metadata: { role: "admin" } },
      session: null,
    },
    error: null,
  };

  const response = await GET(new Request(
    "https://admin.contentco-op.com/auth/callback?code=verified&next=/projects/ica?view=review",
  ));
  const location = new URL(response.headers.get("location") ?? "");
  assert.equal(location.origin, "https://admin.contentco-op.com");
  assert.equal(location.pathname, "/login");
  assert.equal(location.searchParams.get("access"), "pending");
  assert.equal(location.searchParams.get("next"), "/projects/ica?view=review");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(state.__ccoSignOutCalls, [{ scope: "local" }]);
});

test("unclassified callbacks retain a session only for an exact invitation path", async () => {
  const { GET } = await import(pathToFileURL(resolve(repositoryRoot, "app/auth/callback/route.ts")).href);
  state.__ccoSignOutCalls = [];
  state.__ccoSignOutError = null;
  state.__ccoExchangeResult = {
    data: {
      user: { id: "pending-invited-user", app_metadata: {} },
      session: null,
    },
    error: null,
  };
  const invitePath = "/invite/inviteToken_1234567890-ABCDEFGH";

  const accepted = await GET(new Request(
    `https://client.contentco-op.com/auth/callback?code=verified&next=${encodeURIComponent(invitePath)}`,
  ));
  assert.equal(accepted.headers.get("location"), `https://client.contentco-op.com${invitePath}`);
  assert.deepEqual(state.__ccoSignOutCalls, []);

  const unsafeInvitePath = `${invitePath}?elevate=1`;
  const rejected = await GET(new Request(
    `https://client.contentco-op.com/auth/callback?code=verified&next=${encodeURIComponent(unsafeInvitePath)}`,
  ));
  const rejectedLocation = new URL(rejected.headers.get("location") ?? "");
  assert.equal(rejectedLocation.pathname, "/login");
  assert.equal(rejectedLocation.searchParams.get("access"), "pending");
  assert.deepEqual(state.__ccoSignOutCalls, [{ scope: "local" }]);
});

test("authorized callbacks require the exact role for the current host and sanitize targets", async () => {
  const { GET } = await import(pathToFileURL(resolve(repositoryRoot, "app/auth/callback/route.ts")).href);
  state.__ccoSignOutCalls = [];
  state.__ccoSignOutError = null;
  state.__ccoExchangeResult = {
    data: {
      user: { id: "staff-user", app_metadata: { content_coop_role: "staff" } },
      session: null,
    },
    error: null,
  };

  const safe = await GET(new Request(
    "https://admin.contentco-op.com/auth/callback?code=ok&next=/projects/ica?view=review",
  ));
  assert.equal(
    safe.headers.get("location"),
    "https://admin.contentco-op.com/projects/ica?view=review",
  );

  state.__ccoExchangeResult = {
    data: {
      user: { id: "client-user", app_metadata: { content_coop_role: "client" } },
      session: null,
    },
    error: null,
  };
  const hostile = await GET(new Request(
    "https://client.contentco-op.com/auth/callback?code=ok&redirect=https://attacker.example/session",
  ));
  assert.equal(hostile.headers.get("location"), "https://client.contentco-op.com/projects");
  assert.deepEqual(state.__ccoSignOutCalls, []);
});

test("wrong-surface callbacks clear the local session and return to same-origin login", async () => {
  const { GET } = await import(pathToFileURL(resolve(repositoryRoot, "app/auth/callback/route.ts")).href);
  state.__ccoSignOutCalls = [];
  state.__ccoSignOutError = null;
  state.__ccoExchangeResult = {
    data: {
      user: { id: "client-user", app_metadata: { content_coop_role: "client" } },
      session: null,
    },
    error: null,
  };

  const clientOnAdmin = await GET(new Request(
    "https://admin.contentco-op.com/auth/callback?code=ok&next=/projects/ica?view=review",
  ));
  const adminLocation = new URL(clientOnAdmin.headers.get("location") ?? "");
  assert.equal(clientOnAdmin.status, 303);
  assert.equal(adminLocation.origin, "https://admin.contentco-op.com");
  assert.equal(adminLocation.pathname, "/login");
  assert.equal(adminLocation.searchParams.get("access"), "surface_mismatch");
  assert.equal(adminLocation.searchParams.get("required_surface"), "client");
  assert.equal(adminLocation.searchParams.get("next"), "/projects/ica?view=review");
  assert.equal(adminLocation.toString().includes("client.contentco-op.com"), false);
  assert.deepEqual(state.__ccoSignOutCalls, [{ scope: "local" }]);

  state.__ccoExchangeResult = {
    data: {
      user: { id: "staff-user", app_metadata: { content_coop_role: "staff" } },
      session: null,
    },
    error: null,
  };
  const staffOnClient = await GET(new Request(
    "https://client.contentco-op.com/auth/callback?code=ok&redirect=https://attacker.example/session",
  ));
  const clientLocation = new URL(staffOnClient.headers.get("location") ?? "");
  assert.equal(clientLocation.origin, "https://client.contentco-op.com");
  assert.equal(clientLocation.pathname, "/login");
  assert.equal(clientLocation.searchParams.get("access"), "surface_mismatch");
  assert.equal(clientLocation.searchParams.get("required_surface"), "admin");
  assert.equal(clientLocation.searchParams.get("next"), "/projects");
  assert.equal(clientLocation.toString().includes("attacker.example"), false);
  assert.deepEqual(state.__ccoSignOutCalls, [{ scope: "local" }, { scope: "local" }]);

  const staffOnUnmanagedPort = await GET(new Request(
    "https://admin.contentco-op.com:8443/auth/callback?code=ok&next=/settings",
  ));
  const unmanagedPortLocation = new URL(staffOnUnmanagedPort.headers.get("location") ?? "");
  assert.equal(unmanagedPortLocation.origin, "https://admin.contentco-op.com:8443");
  assert.equal(unmanagedPortLocation.pathname, "/login");
  assert.equal(unmanagedPortLocation.searchParams.get("access"), "surface_mismatch");
  assert.equal(unmanagedPortLocation.searchParams.get("required_surface"), "admin");
  assert.deepEqual(state.__ccoSignOutCalls, [
    { scope: "local" },
    { scope: "local" },
    { scope: "local" },
  ]);
});

test("callback never claims cleanup succeeded when local sign-out fails", async () => {
  const { GET } = await import(pathToFileURL(resolve(repositoryRoot, "app/auth/callback/route.ts")).href);
  state.__ccoSignOutCalls = [];
  state.__ccoSignOutError = { message: "private provider failure" };
  state.__ccoExchangeResult = {
    data: {
      user: { id: "client-user", app_metadata: { content_coop_role: "client" } },
      session: null,
    },
    error: null,
  };

  const response = await GET(new Request(
    "https://admin.contentco-op.com/auth/callback?code=ok&next=/projects/ica",
  ));
  const location = new URL(response.headers.get("location") ?? "");
  assert.equal(location.origin, "https://admin.contentco-op.com");
  assert.equal(location.pathname, "/login");
  assert.equal(location.searchParams.get("auth_error"), "session_clear_failed");
  assert.equal(location.searchParams.get("access"), null);
  assert.equal(location.toString().includes("provider"), false);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(state.__ccoSignOutCalls, [{ scope: "local" }]);
  state.__ccoSignOutError = null;
});
