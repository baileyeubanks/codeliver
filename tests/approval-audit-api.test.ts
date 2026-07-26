import assert from "node:assert/strict";
import { existsSync } from "node:fs";
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
    return globalThis.__ccoApprovalAuditState.requireAuth();
  }
`)}`;
const accessControlStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function getAssetAccess(...args) {
    return globalThis.__ccoApprovalAuditState.getAssetAccess(...args);
  }
`)}`;
const supabaseStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function getSupabase() {
    return globalThis.__ccoApprovalAuditState.getSupabase();
  }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve(nextServerStubUrl, context);
    if (specifier === "@/lib/auth") return nextResolve(authStubUrl, context);
    if (specifier === "@/lib/access-control") return nextResolve(accessControlStubUrl, context);
    if (specifier === "@/lib/supabase") return nextResolve(supabaseStubUrl, context);
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

interface AuditState {
  requireAuth: () => Promise<{ id: string } | null>;
  getAssetAccess: () => Promise<{ ok: true } | { ok: false; status: number; error: string }>;
  getSupabase: () => unknown;
}

const state = globalThis as typeof globalThis & {
  __ccoApprovalAuditState: AuditState;
};

const HISTORY_ROWS = [
  {
    id: "history-2",
    approval_id: "approval-2",
    new_status: "changes_requested",
    changed_by: "user-9",
    note: "Trim the open.",
    created_at: "2026-07-25T09:00:00.000Z",
    approvals: { id: "approval-2", step_order: 2, role_label: "Client Lead" },
  },
  {
    id: "history-1",
    approval_id: "approval-1",
    new_status: "approved",
    changed_by: null,
    note: null,
    created_at: "2026-07-24T09:00:00.000Z",
    approvals: { id: "approval-1", step_order: 1, role_label: "Producer" },
  },
];

function fakeSupabase(result: { data?: unknown; error?: { message: string } }) {
  const captured: { table?: string; eq?: [string, unknown] } = {};
  return {
    captured,
    from(table: string) {
      captured.table = table;
      return {
        select() {
          return this;
        },
        eq(column: string, value: unknown) {
          captured.eq = [column, value];
          return this;
        },
        async order(column: string, { ascending = true } = {}) {
          const rows = [...((result.data ?? []) as Record<string, unknown>[])].sort(
            (left, right) => {
              const a = String(left[column] ?? "");
              const b = String(right[column] ?? "");
              return ascending ? a.localeCompare(b) : b.localeCompare(a);
            },
          );
          return { data: rows, error: result.error ?? null };
        },
      };
    },
  };
}

function installState(
  t: { after(callback: () => void): void },
  overrides: Partial<AuditState> = {},
) {
  state.__ccoApprovalAuditState = {
    requireAuth: async () => ({ id: "user-1" }),
    getAssetAccess: async () => ({ ok: true }),
    getSupabase: () => fakeSupabase({ data: HISTORY_ROWS }),
    ...overrides,
  };
  t.after(() => {
    delete (state as Partial<typeof state>).__ccoApprovalAuditState;
  });
}

const auditRoutePromise = import(
  pathToFileURL(resolve(repositoryRoot, "app/api/approvals/audit/route.ts")).href
);

test("audit trail requires authentication", async (t) => {
  installState(t, { requireAuth: async () => null });
  const route = await auditRoutePromise;
  const response = await route.GET(new Request("http://test/api/approvals/audit?asset_id=a1"));

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized", code: "UNAUTHORIZED" });
});

test("audit trail fails closed when the auth backend is unavailable", async (t) => {
  const { BackendUnavailableError } = await import(
    pathToFileURL(resolve(repositoryRoot, "lib/api/backend.ts")).href
  );
  installState(t, {
    requireAuth: async () => {
      throw new BackendUnavailableError("Authentication backend");
    },
  });
  const route = await auditRoutePromise;
  const response = await route.GET(new Request("http://test/api/approvals/audit?asset_id=a1"));

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "Backend service is unavailable",
    code: "BACKEND_UNAVAILABLE",
  });
});

test("audit trail validates asset_id", async (t) => {
  installState(t);
  const route = await auditRoutePromise;
  const response = await route.GET(new Request("http://test/api/approvals/audit"));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "asset_id is required",
    code: "INVALID_REQUEST",
  });
});

test("audit trail is hidden from users without asset access", async (t) => {
  installState(t, {
    getAssetAccess: async () => ({ ok: false, status: 404, error: "not found" }),
  });
  const route = await auditRoutePromise;
  const response = await route.GET(new Request("http://test/api/approvals/audit?asset_id=a1"));

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: "Approval resource is unavailable",
    code: "APPROVAL_NOT_FOUND",
  });
});

test("audit trail returns Documenso-style entries in chronological order", async (t) => {
  installState(t);
  const route = await auditRoutePromise;
  const response = await route.GET(new Request("http://test/api/approvals/audit?asset_id=a1"));

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.asset_id, "a1");
  assert.deepEqual(
    payload.entries.map((entry: { step_id: string }) => entry.step_id),
    ["approval-1", "approval-2"],
    "sorted by decided_at ascending",
  );
  const [first, second] = payload.entries;
  assert.deepEqual(first, {
    step_id: "approval-1",
    step_order: 1,
    role_label: "Producer",
    actor: { id: null, name: null, email: null },
    action: "approved",
    note: null,
    decided_at: "2026-07-24T09:00:00.000Z",
  });
  assert.equal(second.action, "changes_requested");
  assert.equal(second.note, "Trim the open.");
  assert.equal(second.actor.id, "user-9");
  assert.equal(second.actor.name, null, "the history record carries no name — never fabricated");
  assert.equal("user_agent" in second, false, "no userAgent is ever fabricated");
});

test("audit trail fails closed when the query errors", async (t) => {
  installState(t, {
    getSupabase: () => fakeSupabase({ error: { message: "boom" } }),
  });
  const route = await auditRoutePromise;
  const response = await route.GET(new Request("http://test/api/approvals/audit?asset_id=a1"));

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "Backend service is unavailable",
    code: "BACKEND_UNAVAILABLE",
  });
});
