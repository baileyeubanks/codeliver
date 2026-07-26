import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { AuthSessionMissingError } from "@supabase/supabase-js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const authStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function createSupabaseAuth() {
    if (globalThis.__ccoAuthBoundaryCreateError) {
      throw globalThis.__ccoAuthBoundaryCreateError;
    }
    return globalThis.__ccoAuthBoundaryClient;
  }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/supabase-auth" || specifier === "./supabase-auth") {
      return nextResolve(authStubUrl, context);
    }
    if (specifier === "./api/backend") {
      return nextResolve(
        pathToFileURL(resolve(repositoryRoot, "lib/api/backend.ts")).href,
        context,
      );
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

type AuthBoundaryState = typeof globalThis & {
  __ccoAuthBoundaryCreateError?: unknown;
  __ccoAuthBoundaryClient: {
    auth: {
      getUser: () => Promise<{
        data: { user: null | { id: string } };
        error: null | Error;
      }>;
    };
  };
};

const state = globalThis as AuthBoundaryState;

test.beforeEach(() => {
  state.__ccoAuthBoundaryCreateError = undefined;
  state.__ccoAuthBoundaryClient = {
    auth: {
      async getUser() {
        return {
          data: { user: { id: "verified-user" } },
          error: null,
        };
      },
    },
  };
});

test("missing auth cookies are logged out, not a backend outage", async () => {
  state.__ccoAuthBoundaryClient.auth.getUser = async () => ({
    data: { user: null },
    error: new AuthSessionMissingError(),
  });

  const [{ requireAuth }, { requireAuthWithClient }] = await Promise.all([
    import(pathToFileURL(resolve(repositoryRoot, "lib/auth.ts")).href),
    import(pathToFileURL(resolve(repositoryRoot, "lib/auth-client.ts")).href),
  ]);

  assert.equal(await requireAuth(), null);
  const result = await requireAuthWithClient();
  assert.equal(result.user, null);
  assert.equal(result.supabase, state.__ccoAuthBoundaryClient);
});

test("real provider failures remain backend-unavailable errors", async () => {
  state.__ccoAuthBoundaryClient.auth.getUser = async () => ({
    data: { user: null },
    error: new Error("provider failed"),
  });

  const [{ requireAuth }, { requireAuthWithClient }] = await Promise.all([
    import(pathToFileURL(resolve(repositoryRoot, "lib/auth.ts")).href),
    import(pathToFileURL(resolve(repositoryRoot, "lib/auth-client.ts")).href),
  ]);

  await assert.rejects(requireAuth, {
    name: "BackendUnavailableError",
    message: "Authentication backend is unavailable",
  });
  await assert.rejects(requireAuthWithClient, {
    name: "BackendUnavailableError",
    message: "Authentication backend is unavailable",
  });
});
