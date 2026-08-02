import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const authStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function requireAuthWithClient() {
    const state = globalThis.__approvalRlsClientBoundaryState;
    state.authCalls++;
    return { user: state.user, supabase: state.authenticatedClient };
  }
`)}`;

const accessStubUrl = `data:text/javascript,${encodeURIComponent(`
  export const PROJECT_ROLE_RANK = {
    viewer: 10,
    reviewer: 30,
    member: 50,
    editor: 60,
    producer: 70,
    admin: 80,
    owner: 100,
  };
  export async function getAssetAccess(assetId, userId, minimumRole, client) {
    const state = globalThis.__approvalRlsClientBoundaryState;
    state.accessCalls.push({ assetId, userId, minimumRole, client });
    return state.accessResult;
  }
  export function projectTenantAuthority(project) {
    const kind = project.team_id ? "team" : "personal";
    const id = project.team_id || project.owner_id;
    return { kind, id, key: kind + ":" + id };
  }
`)}`;

const decisionStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function recordApprovalDecision(input, client) {
    const state = globalThis.__approvalRlsClientBoundaryState;
    state.decisionCalls.push({ input, client });
    return state.decisionResult;
  }
`)}`;

const inviteStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function normalizeReviewerEmail(value) {
    const normalized = value?.trim().toLowerCase();
    return normalized || null;
  }
  export async function resolvePrivilegedApprovalAssigneeEmailAfterAuthorization(input) {
    const state = globalThis.__approvalRlsClientBoundaryState;
    state.assigneeCalls.push(input);
    return state.assigneeResult;
  }
  export async function createPrivilegedApprovalInviteAfterAuthorization(input) {
    const state = globalThis.__approvalRlsClientBoundaryState;
    state.inviteCalls.push(input);
    return { token: "opaque-approval-token" };
  }
`)}`;

const supabaseStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function getSupabase() {
    return globalThis.__approvalRlsClientBoundaryState.privilegedClient;
  }
`)}`;

const versionsStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function resolveAssetVersion({ assetId, versionId }) {
    return {
      ok: true,
      version: {
        id: versionId || "version-current",
        asset_id: assetId,
        is_current: true,
      },
    };
  }
`)}`;

const emailStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function sendEmail() {}
  export const emailTemplates = {
    approvalRequest() {
      return { subject: "Approval requested", html: "Review" };
    },
  };
  export function getBaseUrl() {
    return "https://deliver.contentco-op.com";
  }
`)}`;

const notificationStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function dispatchTransactionalNotification() {
    return {
      ok: true,
      mode: "send",
      deduplicated: false,
      receipts: [
        {
          channel: "email",
          status: "sent",
          provider: "test",
          providerMessageId: "message-a",
          attemptedProviders: ["test"],
          errorCode: null,
        },
      ],
      audit: { status: "recorded", receipt_id: "receipt-a" },
    };
  }
  export function notificationChannelStatus() { return "sent"; }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/auth-client") {
      return nextResolve(authStubUrl, context);
    }
    if (specifier === "@/lib/access-control") {
      return nextResolve(accessStubUrl, context);
    }
    if (specifier === "@/lib/approval-decisions") {
      return nextResolve(decisionStubUrl, context);
    }
    if (specifier === "@/lib/review-invites") {
      return nextResolve(inviteStubUrl, context);
    }
    if (specifier === "@/lib/supabase") {
      return nextResolve(supabaseStubUrl, context);
    }
    if (specifier === "@/lib/versions") {
      return nextResolve(versionsStubUrl, context);
    }
    if (specifier === "@/lib/email") return nextResolve(emailStubUrl, context);
    if (specifier === "@/lib/notifications/transactional") {
      return nextResolve(notificationStubUrl, context);
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

type ClientKind = "authenticated" | "privileged";
type Row = Record<string, unknown>;
type QueryResult = { data: unknown; error: { message: string } | null };

interface QueryLog {
  client: FakeSupabase;
  table: string;
  operation: "select" | "insert" | "update";
  selection: string;
  filters: Array<{ column: string; value: unknown }>;
}

interface BoundaryState {
  phase: "route" | "decision";
  user: { id: string; email: string } | null;
  authCalls: number;
  accessCalls: Array<{
    assetId: string;
    userId: string;
    minimumRole: string;
    client: unknown;
  }>;
  accessResult:
    | { ok: true; data: Row }
    | { ok: false; status: number; error: string };
  decisionCalls: Array<{ input: Row; client: unknown }>;
  decisionResult: {
    ok: true;
    data: Row;
    assetStatus: string;
  };
  assigneeCalls: Row[];
  assigneeResult:
    | { ok: true; email: string }
    | { ok: false; error: string };
  inviteCalls: Row[];
  queries: QueryLog[];
  adminLookups: string[];
  adminUsers: Record<string, string>;
  authenticatedClient: FakeSupabase;
  privilegedClient: FakeSupabase;
}

class FakeQuery implements PromiseLike<QueryResult> {
  private operation: QueryLog["operation"] = "select";
  private selection = "*";
  private readonly filters: Array<{ column: string; value: unknown }> = [];
  private values: Row | null = null;
  private readonly client: FakeSupabase;
  private readonly table: string;

  constructor(client: FakeSupabase, table: string) {
    this.client = client;
    this.table = table;
  }

  select(selection = "*") {
    this.selection = selection;
    return this;
  }

  insert(values: Row) {
    this.operation = "insert";
    this.values = values;
    return this;
  }

  update(values: Row) {
    this.operation = "update";
    this.values = values;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value });
    return this;
  }

  order() {
    return this;
  }

  limit() {
    return this;
  }

  single() {
    return Promise.resolve(this.execute());
  }

  maybeSingle() {
    return Promise.resolve(this.execute());
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private execute(): QueryResult {
    state.queries.push({
      client: this.client,
      table: this.table,
      operation: this.operation,
      selection: this.selection,
      filters: [...this.filters],
    });

    if (state.phase === "route") return this.routeResult();
    return this.decisionResult();
  }

  private routeResult(): QueryResult {
    if (this.table === "approval_workflows") {
      if (this.operation === "insert") {
        return { data: { id: "workflow-new" }, error: null };
      }
      return { data: null, error: null };
    }
    if (this.table === "approvals" && this.operation === "insert") {
      return {
        data: { id: "approval-new", status: "pending", ...this.values },
        error: null,
      };
    }
    if (this.table === "approvals") {
      return {
        data: {
          id: "approval-a",
          assignee_id: "reviewer-a",
          assignee_email: "reviewer@example.test",
        },
        error: null,
      };
    }
    if (this.table === "projects") {
      return {
        data: { name: "Tenant A", owner_id: "owner-a", team_id: "team-a" },
        error: null,
      };
    }
    return { data: null, error: null };
  }

  private decisionResult(): QueryResult {
    if (this.table === "approvals" && this.operation === "update") {
      return {
        data: {
          id: "approval-a",
          asset_id: "asset-a",
          version_id: "version-current",
          workflow_id: "workflow-a",
          role_label: "Client",
          status: "approved",
          ...this.values,
        },
        error: null,
      };
    }
    if (this.table === "approvals" && this.selection === "status") {
      return {
        data: [{ status: "approved" }, { status: "pending" }],
        error: null,
      };
    }
    if (this.table === "approvals") {
      return {
        data: {
          id: "approval-a",
          asset_id: "asset-a",
          version_id: "version-current",
          workflow_id: "workflow-a",
          role_label: "Client",
          status: "pending",
        },
        error: null,
      };
    }
    if (this.table === "approval_workflows") {
      return {
        data: {
          id: "workflow-a",
          asset_id: "asset-a",
          version_id: "version-current",
          mode: "parallel",
          status: "active",
        },
        error: null,
      };
    }
    if (this.table === "assets" && this.selection.includes("projects(")) {
      return {
        data: {
          project_id: "project-a",
          projects: { team_id: "team-a", owner_id: "owner-a" },
        },
        error: null,
      };
    }
    if (this.table === "assets") {
      return {
        data: {
          project_id: "project-a",
          title: "Tenant A asset",
          status: "in_review",
        },
        error: null,
      };
    }
    if (this.table === "webhooks") return { data: [], error: null };
    return { data: null, error: null };
  }
}

class FakeSupabase {
  readonly kind: ClientKind;
  readonly auth = {
    admin: {
      getUserById: async (id: string) => {
        state.adminLookups.push(id);
        const email = state.adminUsers[id];
        return email
          ? { data: { user: { id, email } }, error: null }
          : {
              data: { user: null },
              error: { message: "Internal auth lookup detail" },
            };
      },
    },
  };

  constructor(kind: ClientKind) {
    this.kind = kind;
  }

  from(table: string) {
    return new FakeQuery(this, table);
  }
}

const state = {
  phase: "route",
  user: null,
  authCalls: 0,
  accessCalls: [],
  accessResult: { ok: true, data: {} },
  decisionCalls: [],
  decisionResult: {
    ok: true,
    data: { id: "approval-a", status: "approved" },
    assetStatus: "approved",
  },
  assigneeCalls: [],
  assigneeResult: { ok: true, email: "reviewer@example.test" },
  inviteCalls: [],
  queries: [],
  adminLookups: [],
  adminUsers: {},
  authenticatedClient: undefined as unknown as FakeSupabase,
  privilegedClient: undefined as unknown as FakeSupabase,
} satisfies BoundaryState;

(globalThis as typeof globalThis & {
  __approvalRlsClientBoundaryState: BoundaryState;
}).__approvalRlsClientBoundaryState = state;

function resetState() {
  state.phase = "route";
  state.user = { id: "reviewer-a", email: "reviewer@example.test" };
  state.authCalls = 0;
  state.accessCalls = [];
  state.accessResult = {
    ok: true,
    data: {
      id: "asset-a",
      project_id: "project-a",
      title: "Tenant A asset",
      access_rank: 100,
    },
  };
  state.decisionCalls = [];
  state.assigneeCalls = [];
  state.assigneeResult = { ok: true, email: "reviewer@example.test" };
  state.inviteCalls = [];
  state.queries = [];
  state.adminLookups = [];
  state.adminUsers = {};
  state.authenticatedClient = new FakeSupabase("authenticated");
  state.privilegedClient = new FakeSupabase("privileged");
}

function source(path: string) {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

async function loadApprovalRoute() {
  return import(
    pathToFileURL(
      resolve(repositoryRoot, "app/api/assets/[id]/approvals/route.ts"),
    ).href
  );
}

function approvalRequest(method: "POST" | "PATCH", body: Row) {
  return new Request(
    "https://deliver.contentco-op.com/api/assets/asset-a/approvals",
    {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

test.beforeEach(resetState);

test("authenticated approval route has no direct service or admin capability", () => {
  const route = source("app/api/assets/[id]/approvals/route.ts");

  assert.match(route, /requireAuthWithClient/);
  assert.doesNotMatch(route, /from ["']@\/lib\/supabase["']/);
  assert.doesNotMatch(route, /getSupabase\s*\(/);
  assert.doesNotMatch(route, /\.auth\.admin/);
  assert.doesNotMatch(route, /requireAuth\s*\(/);
  assert.match(route, /getAssetAccess\(id, user\.id, "viewer", supabase\)/);
  assert.match(route, /getAssetAccess\(id, user\.id, "producer", supabase\)/);
  assert.match(
    route,
    /getAssetAccess\(assetId, user\.id, "reviewer", supabase\)/,
  );
  assert.match(
    route,
    /recordApprovalDecision\(\{[\s\S]*?\},\s*supabase\)/,
  );

  const producerAccess = route.indexOf(
    'getAssetAccess(id, user.id, "producer", supabase)',
  );
  const assigneeLookup = route.indexOf(
    "await resolvePrivilegedApprovalAssigneeEmailAfterAuthorization",
  );
  const inviteCreation = route.indexOf(
    "await createPrivilegedApprovalInviteAfterAuthorization",
  );
  assert.ok(producerAccess >= 0);
  assert.ok(assigneeLookup > producerAccess);
  assert.ok(inviteCreation > producerAccess);
});

test("route carries the authenticated client through assignment and decision", async () => {
  const route = await loadApprovalRoute();
  const response = await route.PATCH(
    approvalRequest("PATCH", {
      id: "approval-a",
      status: "approved",
      version_id: "version-current",
    }),
    { params: Promise.resolve({ id: "asset-a" }) },
  );

  assert.equal(response.status, 200);
  assert.equal(state.authCalls, 1);
  assert.equal(state.accessCalls.length, 1);
  assert.equal(state.accessCalls[0].minimumRole, "reviewer");
  assert.equal(state.accessCalls[0].client, state.authenticatedClient);
  assert.equal(state.decisionCalls.length, 1);
  assert.equal(state.decisionCalls[0].client, state.authenticatedClient);
  assert.deepEqual(
    state.queries.map((query) => [query.client.kind, query.table]),
    [["authenticated", "approvals"]],
  );
});

test("producer denial prevents every privileged approval helper", async () => {
  state.accessResult = { ok: false, status: 404, error: "Asset not found" };
  const route = await loadApprovalRoute();
  const response = await route.POST(
    approvalRequest("POST", {
      role_label: "Client",
      assignee_id: "11111111-1111-4111-8111-111111111111",
    }),
    { params: Promise.resolve({ id: "asset-a" }) },
  );

  assert.equal(response.status, 404);
  assert.deepEqual(state.assigneeCalls, []);
  assert.deepEqual(state.inviteCalls, []);
  assert.deepEqual(state.queries, []);
});

test("authorized producer uses RLS data access before opaque invite creation", async () => {
  const route = await loadApprovalRoute();
  const response = await route.POST(
    approvalRequest("POST", {
      role_label: "Client",
      assignee_id: "11111111-1111-4111-8111-111111111111",
      assignee_email: " REVIEWER@EXAMPLE.TEST ",
    }),
    { params: Promise.resolve({ id: "asset-a" }) },
  );

  assert.equal(response.status, 201);
  assert.equal(state.assigneeCalls.length, 1);
  assert.deepEqual(state.assigneeCalls[0], {
    assigneeId: "11111111-1111-4111-8111-111111111111",
    expectedEmail: "reviewer@example.test",
  });
  assert.equal(state.inviteCalls.length, 1);
  assert.equal(
    state.inviteCalls[0].authorizedClient,
    state.authenticatedClient,
  );
  assert.deepEqual(
    state.queries.map((query) => [query.client.kind, query.table]),
    [
      ["authenticated", "approval_workflows"],
      ["authenticated", "approval_workflows"],
      ["authenticated", "approvals"],
      ["authenticated", "projects"],
    ],
  );
});

test("decision domain operations stay on the passed RLS client", async (t) => {
  const originalServerSchema = process.env.SUPABASE_DATA_SCHEMA;
  const originalBrowserSchema = process.env.NEXT_PUBLIC_SUPABASE_DATA_SCHEMA;
  process.env.SUPABASE_DATA_SCHEMA = "co_production";
  process.env.NEXT_PUBLIC_SUPABASE_DATA_SCHEMA = "co_production";
  t.after(() => {
    if (originalServerSchema === undefined) delete process.env.SUPABASE_DATA_SCHEMA;
    else process.env.SUPABASE_DATA_SCHEMA = originalServerSchema;
    if (originalBrowserSchema === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_DATA_SCHEMA;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_DATA_SCHEMA = originalBrowserSchema;
    }
  });
  state.phase = "decision";
  const { recordApprovalDecision } = await import(
    pathToFileURL(resolve(repositoryRoot, "lib/approval-decisions.ts")).href
  );
  const result = await recordApprovalDecision(
    {
      assetId: "asset-a",
      versionId: "version-current",
      approvalId: "approval-a",
      status: "approved",
      actor: { id: "reviewer-a", name: "reviewer@example.test" },
    },
    state.authenticatedClient as never,
  );
  await new Promise<void>((resolveImmediate) => setImmediate(resolveImmediate));
  await new Promise<void>((resolveImmediate) => setImmediate(resolveImmediate));

  assert.equal(result.ok, true);
  const ordinaryTables = new Set([
    "approvals",
    "approval_workflows",
    "approval_history",
    "assets",
    "activity_log",
  ]);
  for (const query of state.queries.filter((item) => ordinaryTables.has(item.table))) {
    assert.equal(query.client, state.authenticatedClient, query.table);
  }

  const privilegedQueries = state.queries.filter(
    (query) => query.client === state.privilegedClient,
  );
  assert.deepEqual(
    privilegedQueries.map((query) => query.table),
    ["webhooks"],
  );
  assert.deepEqual(privilegedQueries[0].filters, [
    { column: "team_id", value: "team-a" },
    { column: "active", value: true },
  ]);
});

test("bounded assignee lookup returns only normalized email or one generic error", async () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  state.adminUsers[userId] = " REVIEWER@EXAMPLE.TEST ";
  const invites = await import(
    pathToFileURL(resolve(repositoryRoot, "lib/review-invites.ts")).href
  );

  const verified =
    await invites.resolvePrivilegedApprovalAssigneeEmailAfterAuthorization({
      assigneeId: userId,
      expectedEmail: "reviewer@example.test",
    });
  assert.deepEqual(verified, {
    ok: true,
    email: "reviewer@example.test",
  });
  assert.deepEqual(Object.keys(verified).sort(), ["email", "ok"]);

  const mismatch =
    await invites.resolvePrivilegedApprovalAssigneeEmailAfterAuthorization({
      assigneeId: userId,
      expectedEmail: "other@example.test",
    });
  const missing =
    await invites.resolvePrivilegedApprovalAssigneeEmailAfterAuthorization({
      assigneeId: "22222222-2222-4222-8222-222222222222",
    });
  assert.deepEqual(mismatch, missing);
  assert.deepEqual(missing, {
    ok: false,
    error: "Assignee could not be verified",
  });

  const lookupCount = state.adminLookups.length;
  const malformed =
    await invites.resolvePrivilegedApprovalAssigneeEmailAfterAuthorization({
      assigneeId: "not-a-user-id",
    });
  assert.deepEqual(malformed, missing);
  assert.equal(state.adminLookups.length, lookupCount);
});

test("invite and webhook privilege remain explicit capability boundaries", () => {
  const invites = source("lib/review-invites.ts");
  const decisions = source("lib/approval-decisions.ts");

  assert.match(
    invites,
    /createPrivilegedApprovalInviteAfterAuthorization/,
  );
  assert.match(
    invites,
    /resolveAssetVersion\(\{[\s\S]*?client: versionClient/,
  );
  assert.match(
    decisions,
    /emitPrivilegedApprovalWebhookAfterAuthorization\(\s*supabase/,
  );
  assert.match(
    decisions,
    /deliverPrivilegedApprovalWebhookAfterAuthorization[\s\S]*?const privilegedClient = getSupabase\(\)/,
  );
});
