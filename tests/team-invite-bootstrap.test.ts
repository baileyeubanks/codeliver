import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const authClientStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function requireAuthWithClient() {
    return {
      user: globalThis.__ccoInviteUser ?? null,
      supabase: globalThis.__ccoInviteAuthClient,
    };
  }
`)}`;
const authStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function requireAuth() {
    return globalThis.__ccoInviteUser ?? null;
  }
`)}`;
const serviceStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function getSupabase() {
    return globalThis.__ccoInviteServiceClient;
  }
`)}`;
const emailStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function getBaseUrl() { return "https://co-videopro.com"; }
`)}`;
const rbacStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function requireTeamRole() {
    return { allowed: false, role: null };
  }
`)}`;
const notificationsStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function dispatchTransactionalNotification() {
    return { status: "suppressed", channels: [] };
  }
  export function notificationChannelStatus() { return "suppressed"; }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/auth-client") return nextResolve(authClientStubUrl, context);
    if (specifier === "@/lib/auth") return nextResolve(authStubUrl, context);
    if (specifier === "@/lib/supabase") return nextResolve(serviceStubUrl, context);
    if (specifier === "@/lib/email") return nextResolve(emailStubUrl, context);
    if (specifier === "@/lib/middleware/rbac") return nextResolve(rbacStubUrl, context);
    if (specifier === "@/lib/notifications/transactional") {
      return nextResolve(notificationsStubUrl, context);
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

interface QueryOperation {
  table: string;
  operation: "select" | "insert" | "update" | "delete";
  payload?: unknown;
  filters: Array<{ kind: "eq" | "contains"; key: string; value: unknown }>;
  terminal: "single" | "maybeSingle" | "then";
}

interface InviteTestState {
  operations: QueryOperation[];
  authUpdates: Array<{ userId: string; attributes: Record<string, unknown> }>;
  refreshCalls: number;
  signOutCalls: Array<{ scope: string }>;
  handle(operation: QueryOperation): { data: unknown; error: unknown };
  authUpdateError?: { message: string } | null;
  refreshError?: { message: string } | null;
  refreshSession?: Record<string, unknown> | null;
}

class QueryStub implements PromiseLike<{ data: unknown; error: unknown }> {
  private operation: QueryOperation["operation"] = "select";
  private payload: unknown;
  private readonly filters: QueryOperation["filters"] = [];
  private readonly state: InviteTestState;
  private readonly table: string;

  constructor(state: InviteTestState, table: string) {
    this.state = state;
    this.table = table;
  }

  select() {
    return this;
  }

  insert(payload: unknown) {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: unknown) {
    this.operation = "update";
    this.payload = payload;
    return this;
  }

  delete() {
    this.operation = "delete";
    return this;
  }

  eq(key: string, value: unknown) {
    this.filters.push({ kind: "eq", key, value });
    return this;
  }

  contains(key: string, value: unknown) {
    this.filters.push({ kind: "contains", key, value });
    return this;
  }

  single() {
    return Promise.resolve(this.execute("single"));
  }

  maybeSingle() {
    return Promise.resolve(this.execute("maybeSingle"));
  }

  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.execute("then")).then(onfulfilled, onrejected);
  }

  private execute(terminal: QueryOperation["terminal"]) {
    const operation: QueryOperation = {
      table: this.table,
      operation: this.operation,
      payload: this.payload,
      filters: [...this.filters],
      terminal,
    };
    this.state.operations.push(operation);
    return this.state.handle(operation);
  }
}

type InviteGlobalState = typeof globalThis & {
  __ccoInviteUser?: Record<string, unknown> | null;
  __ccoInviteAuthClient?: Record<string, unknown>;
  __ccoInviteServiceClient?: Record<string, unknown>;
};

const globals = globalThis as InviteGlobalState;
const INVITE_TOKEN = "inviteToken_1234567890-ABCDEFGH";
const INVITE_ID = "11111111-2222-4333-8444-555555555555";
const TEAM_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const USER_ID = "99999999-8888-4777-8666-555555555555";

function operationHas(
  operation: QueryOperation,
  table: string,
  action: QueryOperation["operation"],
  status?: string,
) {
  return (
    operation.table === table &&
    operation.operation === action &&
    (status === undefined ||
      (operation.payload as { status?: string } | undefined)?.status === status)
  );
}

function setupState(options: {
  role?: "staff" | "client" | null;
  inviteStatus?: "pending" | "accepted" | "declined";
  userEmail?: string;
  inviteEmail?: string;
  authUpdateError?: { message: string } | null;
  refreshError?: { message: string } | null;
  acceptedAuditExists?: boolean;
} = {}) {
  const state: InviteTestState = {
    operations: [],
    authUpdates: [],
    refreshCalls: 0,
    signOutCalls: [],
    authUpdateError: options.authUpdateError ?? null,
    refreshError: options.refreshError ?? null,
    refreshSession: options.refreshError ? null : { access_token: "fresh" },
    handle(operation) {
      if (operationHas(operation, "team_invites", "select")) {
        return {
          data: {
            id: INVITE_ID,
            team_id: TEAM_ID,
            email: options.inviteEmail ?? "invited@example.com",
            role: "reviewer",
            status: options.inviteStatus ?? "pending",
            expires_at: "2099-01-01T00:00:00.000Z",
            invited_by: "77777777-6666-4555-8444-333333333333",
          },
          error: null,
        };
      }
      if (operationHas(operation, "team_members", "insert")) {
        return { data: { id: "member-1" }, error: null };
      }
      if (operationHas(operation, "team_members", "select")) {
        return { data: { id: "member-1" }, error: null };
      }
      if (operationHas(operation, "team_invites", "update")) {
        return { data: { id: INVITE_ID }, error: null };
      }
      if (operationHas(operation, "activity_log", "select")) {
        return {
          data: options.acceptedAuditExists ? { id: "audit-existing" } : null,
          error: null,
        };
      }
      if (operationHas(operation, "activity_log", "insert")) {
        return { data: { id: "audit-1" }, error: null };
      }
      return { data: null, error: null };
    },
  };

  globals.__ccoInviteUser = {
    id: USER_ID,
    email: options.userEmail ?? "invited@example.com",
    email_confirmed_at: "2026-07-15T00:00:00.000Z",
    app_metadata: {
      source: "team_invite",
      ...(options.role ? { content_coop_role: options.role } : {}),
    },
  };
  globals.__ccoInviteAuthClient = {
    auth: {
      async refreshSession() {
        state.refreshCalls += 1;
        return {
          data: { session: state.refreshSession },
          error: state.refreshError ?? null,
        };
      },
      async signOut(input: { scope: string }) {
        state.signOutCalls.push(input);
        return { error: null };
      },
    },
  };
  globals.__ccoInviteServiceClient = {
    from(table: string) {
      return new QueryStub(state, table);
    },
    auth: {
      admin: {
        async updateUserById(userId: string, attributes: Record<string, unknown>) {
          state.authUpdates.push({ userId, attributes });
          return {
            data: state.authUpdateError ? { user: null } : { user: { id: userId } },
            error: state.authUpdateError ?? null,
          };
        },
      },
    },
  };
  return state;
}

async function acceptInvite() {
  const { PATCH } = await import(
    pathToFileURL(resolve(repositoryRoot, "app/api/teams/invites/route.ts")).href
  );
  return PATCH(new Request("https://co-videopro.com/api/teams/invites", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: INVITE_TOKEN, action: "accept" }),
  }) as never);
}

test("accepting an invite provisions client authority without overwriting metadata", async () => {
  const state = setupState();
  const response = await acceptInvite();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), {
    ok: true,
    status: "accepted",
    already_member: false,
    audit_recorded: true,
    reauthentication_required: false,
  });
  assert.equal(state.authUpdates.length, 1);
  assert.deepEqual(state.authUpdates[0], {
    userId: USER_ID,
    attributes: {
      app_metadata: {
        source: "team_invite",
        content_coop_role: "client",
      },
    },
  });
  assert.equal(state.refreshCalls, 1);
  assert.deepEqual(state.signOutCalls, []);
});

test("an existing staff identity is never downgraded by a client invitation", async () => {
  const state = setupState({ role: "staff" });
  const response = await acceptInvite();

  assert.equal(response.status, 200);
  assert.equal(state.authUpdates.length, 0);
  assert.equal(state.refreshCalls, 0);
});

test("authority provisioning failure compensates membership, invite, and audit writes", async () => {
  const state = setupState({
    authUpdateError: { message: "private provider failure" },
  });
  const response = await acceptInvite();
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.code, "INVITE_AUTHORITY_UNAVAILABLE");
  assert.equal(JSON.stringify(body).includes("private provider"), false);
  assert.equal(
    state.operations.some((operation) => operationHas(operation, "activity_log", "delete")),
    true,
  );
  assert.equal(
    state.operations.some((operation) => operationHas(operation, "team_invites", "update", "pending")),
    true,
  );
  assert.equal(
    state.operations.some((operation) => operationHas(operation, "team_members", "delete")),
    true,
  );
});

test("a refresh failure commits valid access but requires a clean sign-in", async () => {
  const state = setupState({ refreshError: { message: "refresh unavailable" } });
  const response = await acceptInvite();

  assert.equal(response.status, 200);
  assert.equal((await response.json()).reauthentication_required, true);
  assert.deepEqual(state.signOutCalls, [{ scope: "local" }]);
});

test("accepted invitation replay is idempotent and restores missing surface authority", async () => {
  const state = setupState({ inviteStatus: "accepted", acceptedAuditExists: true });
  const response = await acceptInvite();

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    status: "accepted",
    already_member: true,
    idempotent_replay: true,
    audit_recorded: true,
    reauthentication_required: false,
  });
  assert.equal(
    state.operations.some((operation) => operationHas(operation, "team_members", "insert")),
    false,
  );
  assert.equal(state.authUpdates.length, 1);
});

test("invite acceptance rejects an email mismatch before any mutation", async () => {
  const state = setupState({ userEmail: "other@example.com" });
  const response = await acceptInvite();

  assert.equal(response.status, 403);
  assert.equal(
    state.operations.some((operation) => operation.operation !== "select"),
    false,
  );
  assert.equal(state.authUpdates.length, 0);
});
