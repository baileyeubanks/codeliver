import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const authClientStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function requireAuthWithClient() {
    const state = globalThis.__notificationRlsClientBoundaryState;
    state.authCalls += 1;
    return { user: state.user, supabase: state.client };
  }
`)}`;

const adapterStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function createInAppNotificationAdapter(input) {
    const state = globalThis.__notificationRlsClientBoundaryState;
    state.adapterCalls.push(input);
    return {
      channel: "in_app",
      provider: "supabase-notifications",
      configured: true,
      async send() {
        throw new Error("The route test delegates delivery to the audited dispatcher");
      },
    };
  }

  export function getExternalNotificationAdapters() {
    return [
      { channel: "email", provider: "resend", configured: true },
      { channel: "sms", provider: "sms-not-configured", configured: false },
      { channel: "imessage", provider: "imessage-not-configured", configured: false },
    ];
  }
`)}`;

const deliveryStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function dispatchAuditedNotification(input) {
    const state = globalThis.__notificationRlsClientBoundaryState;
    state.dispatchCalls.push(input);
    if (input.request.action === "preview") {
      return {
        ok: true,
        mode: "preview",
        preview: { tenant_id: input.request.tenantId },
        receipts: [],
        audit: { status: "not_written", receipt_id: null },
      };
    }
    return {
      ok: true,
      mode: "send",
      deduplicated: false,
      receipts: [],
      audit: { status: "recorded", receipt_id: "receipt-a" },
    };
  }
`)}`;

const emailStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function getBaseUrl() {
    return "https://deliver.contentco-op.com";
  }
`)}`;

const tenantAuthorityStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function tenantAuthorityKey(kind, id) {
    return kind + ":" + id;
  }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/auth-client") {
      return nextResolve(authClientStubUrl, context);
    }
    if (specifier === "@/lib/auth" || specifier === "@/lib/supabase") {
      throw new Error(`Notification routes must not import ${specifier}`);
    }
    if (specifier === "@/lib/notifications/adapters") {
      return nextResolve(adapterStubUrl, context);
    }
    if (specifier === "@/lib/notifications/server-delivery") {
      return nextResolve(deliveryStubUrl, context);
    }
    if (specifier === "@/lib/email") return nextResolve(emailStubUrl, context);
    if (specifier === "@/lib/tenant-authority") {
      return nextResolve(tenantAuthorityStubUrl, context);
    }
    if (specifier.startsWith("@/")) {
      return nextResolve(
        pathToFileURL(resolve(repositoryRoot, `${specifier.slice(2)}.ts`)).href,
        context,
      );
    }
    return nextResolve(specifier, context);
  },
});

type Row = Record<string, unknown>;
type Filter = { column: string; value: unknown };
type Operation = "select" | "update" | "upsert";
type QueryError = { message: string };
type QueryResult = { data: Row[] | Row | null; error: QueryError | null };

type QueryRecord = {
  client: FakeSupabase;
  table: string;
  operation: Operation;
  filters: Filter[];
  payload: Row | Row[] | null;
  onConflict: string | null;
};

type RpcRecord = {
  client: FakeSupabase;
  functionName: string;
  args: Record<string, unknown>;
};

type AdapterCall = {
  client: unknown;
  authenticatedUserId: string;
};

type DispatchCall = {
  request: {
    action: "preview" | "send";
    tenantId: string;
    eventType: string;
    idempotencyKey: string | null;
    recipient: {
      userId: string | null;
      email: string | null;
      phone: string | null;
      imessageHandle: string | null;
    };
  };
  client: unknown;
  actorId: string;
  actorName: string;
  preferenceEnabled: Record<string, boolean>;
};

interface BoundaryState {
  user: { id: string; email: string | null } | null;
  authCalls: number;
  rows: Record<string, Row[]>;
  failures: Record<string, string>;
  queries: QueryRecord[];
  rpcCalls: RpcRecord[];
  rpcReturnOverride: Row[] | null;
  adapterCalls: AdapterCall[];
  dispatchCalls: DispatchCall[];
  client: FakeSupabase;
}

class FakeQuery implements PromiseLike<QueryResult> {
  private readonly client: FakeSupabase;
  private readonly state: BoundaryState;
  private readonly table: string;
  private readonly filters: Filter[] = [];
  private operation: Operation = "select";
  private payload: Row | Row[] | null = null;
  private conflictTarget: string | null = null;
  private rowLimit: number | null = null;

  constructor(client: FakeSupabase, state: BoundaryState, table: string) {
    this.client = client;
    this.state = state;
    this.table = table;
  }

  select() {
    return this;
  }

  update(payload: Row) {
    this.operation = "update";
    this.payload = { ...payload };
    return this;
  }

  upsert(payload: Row | Row[], options?: { onConflict?: string }) {
    this.operation = "upsert";
    this.payload = Array.isArray(payload)
      ? payload.map((row) => ({ ...row }))
      : { ...payload };
    this.conflictTarget = options?.onConflict ?? null;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value });
    return this;
  }

  order() {
    return this;
  }

  limit(value: number) {
    this.rowLimit = value;
    return this;
  }

  async maybeSingle() {
    const result = await this.execute();
    return {
      data: Array.isArray(result.data) ? result.data[0] ?? null : result.data,
      error: result.error,
    };
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private matches(row: Row) {
    return this.filters.every(({ column, value }) => row[column] === value);
  }

  private async execute(): Promise<QueryResult> {
    this.state.queries.push({
      client: this.client,
      table: this.table,
      operation: this.operation,
      filters: this.filters.map((filter) => ({ ...filter })),
      payload: Array.isArray(this.payload)
        ? this.payload.map((row) => ({ ...row }))
        : this.payload
          ? { ...this.payload }
          : null,
      onConflict: this.conflictTarget,
    });

    const failure = this.state.failures[`${this.table}:${this.operation}`];
    if (failure) return { data: null, error: { message: failure } };

    if (this.operation === "update") {
      for (const row of this.state.rows[this.table] ?? []) {
        if (this.matches(row)) Object.assign(row, this.payload);
      }
      return { data: null, error: null };
    }

    if (this.operation === "upsert") {
      const incoming = Array.isArray(this.payload)
        ? this.payload
        : this.payload
          ? [this.payload]
          : [];
      const conflictColumns = (this.conflictTarget ?? "")
        .split(",")
        .map((column) => column.trim())
        .filter(Boolean);
      const stored = this.state.rows[this.table] ?? [];
      for (const row of incoming) {
        const existing = stored.find((candidate) =>
          conflictColumns.every((column) => candidate[column] === row[column]),
        );
        if (existing) Object.assign(existing, row);
        else stored.push({ ...row });
      }
      this.state.rows[this.table] = stored;
      return { data: null, error: null };
    }

    let rows = (this.state.rows[this.table] ?? [])
      .filter((row) => this.matches(row))
      .map((row) => ({ ...row }));
    if (this.rowLimit !== null) rows = rows.slice(0, this.rowLimit);
    return { data: rows, error: null };
  }
}

class FakeSupabase {
  private readonly state: BoundaryState;

  constructor(state: BoundaryState) {
    this.state = state;
  }

  from(table: string) {
    return new FakeQuery(this, this.state, table);
  }

  async rpc(functionName: string, args: Record<string, unknown>) {
    this.state.rpcCalls.push({ client: this, functionName, args: { ...args } });
    const failure = this.state.failures[`rpc:${functionName}`];
    if (failure) return { data: null, error: { message: failure } };
    if (functionName !== "update_notification_preferences") {
      return { data: null, error: { message: "unexpected rpc" } };
    }

    const actorId = this.state.user?.id;
    const preferences = args.p_preferences as Record<string, Row>;
    const expectedVersions = args.p_expected_versions as Record<string, number>;
    const stored = this.state.rows.notification_preferences ?? [];
    const updated: Row[] = [];

    for (const [eventType, preference] of Object.entries(preferences)) {
      const existing = stored.find(
        (row) => row.user_id === actorId && row.event_type === eventType,
      );
      const currentVersion = Number(existing?.authority_version ?? 0);
      if (currentVersion !== expectedVersions[eventType]) {
        return {
          data: null,
          error: { message: "notification_preferences_version_conflict" },
        };
      }
      const next = {
        ...(existing ?? {}),
        user_id: actorId,
        event_type: eventType,
        email_enabled: preference.email_enabled,
        email_frequency: preference.email_enabled ? preference.email_frequency : "off",
        in_app_enabled: preference.in_app_enabled,
        authority_version: currentVersion + 1,
      };
      if (existing) Object.assign(existing, next);
      else stored.push(next);
      updated.push({ ...next });
    }

    this.state.rows.notification_preferences = stored;
    return {
      data: this.state.rpcReturnOverride ?? updated,
      error: null,
    };
  }
}

const state = {
  user: null,
  authCalls: 0,
  rows: {},
  failures: {},
  queries: [],
  rpcCalls: [],
  rpcReturnOverride: null,
  adapterCalls: [],
  dispatchCalls: [],
  client: undefined as unknown as FakeSupabase,
} satisfies BoundaryState;

(globalThis as typeof globalThis & {
  __notificationRlsClientBoundaryState: BoundaryState;
}).__notificationRlsClientBoundaryState = state;

function resetState() {
  state.user = { id: "user-a", email: "user-a@example.test" };
  state.authCalls = 0;
  state.rows = {
    notifications: [
      { id: "note-a", user_id: "user-a", read: false, created_at: "2026-07-15T12:00:00Z" },
      { id: "note-b", user_id: "user-b", read: false, created_at: "2026-07-15T13:00:00Z" },
    ],
    notification_preferences: [
      {
        user_id: "user-a",
        event_type: "comment_added",
        email_enabled: true,
        email_frequency: "instant",
        in_app_enabled: false,
        authority_version: 1,
      },
      {
        user_id: "user-b",
        event_type: "comment_added",
        email_enabled: false,
        email_frequency: "off",
        in_app_enabled: true,
      },
    ],
  };
  state.failures = {};
  state.queries = [];
  state.rpcCalls = [];
  state.rpcReturnOverride = null;
  state.adapterCalls = [];
  state.dispatchCalls = [];
  state.client = new FakeSupabase(state);
}

function source(path: string) {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

async function loadRoutes() {
  const notifications = await import(
    pathToFileURL(resolve(repositoryRoot, "app/api/notifications/route.ts")).href
  );
  const preferences = await import(
    pathToFileURL(resolve(repositoryRoot, "app/api/notifications/preferences/route.ts")).href
  );
  const send = await import(
    pathToFileURL(resolve(repositoryRoot, "app/api/notifications/send/route.ts")).href
  );
  return { notifications, preferences, send };
}

function apiRequest(
  path: string,
  method: "GET" | "PATCH" | "PUT" | "POST" = "GET",
  body?: unknown,
) {
  return new Request(new URL(path, "https://deliver.contentco-op.com"), {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function hasFilter(query: QueryRecord, column: string, value: unknown) {
  return query.filters.some(
    (filter) => filter.column === column && filter.value === value,
  );
}

function notificationInput(action: "preview" | "send") {
  return {
    action,
    tenant_id: "untrusted-tenant",
    event_type: "comment_added",
    channels: ["in_app", "email"],
    recipient: {
      user_id: "user-a",
      email: "USER-A@example.test",
      phone: "+13125550100",
      imessage_handle: "+13125550100",
    },
    message: {
      title: "A comment was added",
      body: "Open the project to review it.",
      action_url: "/projects/project-a",
    },
    ...(action === "send"
      ? {
          confirm_live_send: true,
          idempotency_key: "notification-route-0001",
        }
      : {}),
  };
}

test.beforeEach(resetState);

test("notification routes have no service-client or admin-auth fallback", () => {
  for (const route of [
    source("app/api/notifications/route.ts"),
    source("app/api/notifications/preferences/route.ts"),
    source("app/api/notifications/send/route.ts"),
  ]) {
    assert.match(route, /requireAuthWithClient/);
    assert.doesNotMatch(route, /from ["']@\/lib\/auth["']/);
    assert.doesNotMatch(route, /from ["']@\/lib\/supabase["']/);
    assert.doesNotMatch(route, /getSupabase\s*\(/);
    assert.doesNotMatch(route, /auth\.admin/);
  }
});

test("notification reads and updates remain explicitly user-bound", async () => {
  const { notifications } = await loadRoutes();

  const listResponse = await notifications.GET(
    apiRequest("/api/notifications?limit=25"),
  );
  assert.equal(listResponse.status, 200);
  assert.deepEqual(
    (await listResponse.json()).items.map((row: Row) => row.id),
    ["note-a"],
  );

  const crossUserUpdate = await notifications.PATCH(
    apiRequest("/api/notifications", "PATCH", { id: "note-b", read: true }),
  );
  assert.equal(crossUserUpdate.status, 200);
  assert.equal(state.rows.notifications[1].read, false);

  const ownUpdate = await notifications.PATCH(
    apiRequest("/api/notifications", "PATCH", { all: true }),
  );
  assert.equal(ownUpdate.status, 200);
  assert.equal(state.rows.notifications[0].read, true);
  assert.equal(state.rows.notifications[1].read, false);

  assert.equal(state.queries.length, 3);
  for (const query of state.queries) {
    assert.equal(query.client, state.client);
    assert.equal(query.table, "notifications");
    assert.equal(hasFilter(query, "user_id", "user-a"), true);
  }
});

test("preference reads and versioned RPC writes use only authenticated ownership", async () => {
  const { preferences } = await loadRoutes();

  const getResponse = await preferences.GET();
  assert.equal(getResponse.status, 200);
  const getBody = await getResponse.json();
  assert.deepEqual(getBody.preferences.comment_added, {
    email_enabled: true,
    email_frequency: "instant",
    in_app_enabled: false,
    version: 1,
  });
  assert.deepEqual(getBody.channels.sms, {
    configured: false,
    preview_only: true,
    consent_required: true,
  });
  assert.deepEqual(getBody.channels.imessage, {
    configured: false,
    preview_only: true,
    consent_required: true,
  });

  const putResponse = await preferences.PUT(
    apiRequest("/api/notifications/preferences", "PUT", {
      preferences: {
        approval_requested: {
          email_enabled: true,
          email_frequency: "weekly",
          in_app_enabled: true,
        },
      },
      expected_versions: { approval_requested: 0 },
    }),
  );
  assert.equal(putResponse.status, 200);

  const [readQuery] = state.queries;
  assert.equal(readQuery.client, state.client);
  assert.equal(hasFilter(readQuery, "user_id", "user-a"), true);
  assert.equal(state.rpcCalls.length, 1);
  assert.equal(state.rpcCalls[0].client, state.client);
  assert.equal(state.rpcCalls[0].functionName, "update_notification_preferences");
  assert.deepEqual(state.rpcCalls[0].args.p_expected_versions, {
    approval_requested: 0,
  });
  assert.deepEqual(state.rpcCalls[0].args.p_preferences, {
    approval_requested: {
      email_enabled: true,
      email_frequency: "weekly",
      in_app_enabled: true,
    },
  });
  assert.deepEqual((await putResponse.json()).preferences.approval_requested, {
    email_enabled: true,
    email_frequency: "weekly",
    in_app_enabled: true,
    version: 1,
  });
});

test("preference writes reject stale versions and unconfirmed RPC results", async () => {
  const { preferences } = await loadRoutes();

  const stale = await preferences.PUT(
    apiRequest("/api/notifications/preferences", "PUT", {
      preferences: {
        comment_added: {
          email_enabled: true,
          email_frequency: "weekly",
          in_app_enabled: true,
        },
      },
      expected_versions: { comment_added: 0 },
    }),
  );

  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).code, "NOTIFICATION_VERSION_CONFLICT");

  state.rpcReturnOverride = [];
  const unconfirmed = await preferences.PUT(
    apiRequest("/api/notifications/preferences", "PUT", {
      preferences: {
        approval_requested: {
          email_enabled: true,
          email_frequency: "weekly",
          in_app_enabled: true,
        },
      },
      expected_versions: { approval_requested: 0 },
    }),
  );

  assert.equal(unconfirmed.status, 409);
  assert.equal((await unconfirmed.json()).code, "NOTIFICATION_CONFIRMATION_MISMATCH");
});

test("send uses verified auth identity and the RLS client for audited delivery", async () => {
  const { send } = await loadRoutes();

  const previewResponse = await send.POST(
    apiRequest("/api/notifications/send", "POST", notificationInput("preview")),
  );
  assert.equal(previewResponse.status, 200);
  assert.equal((await previewResponse.json()).mode, "preview");

  const sendResponse = await send.POST(
    apiRequest("/api/notifications/send", "POST", notificationInput("send")),
  );
  assert.equal(sendResponse.status, 200);
  assert.equal((await sendResponse.json()).mode, "send");

  assert.equal(state.dispatchCalls.length, 2);
  for (const call of state.dispatchCalls) {
    assert.equal(call.client, state.client);
    assert.equal(call.actorId, "user-a");
    assert.equal(call.actorName, "user-a@example.test");
    assert.equal(call.request.tenantId, "personal:user-a");
    assert.equal(call.request.recipient.userId, "user-a");
    assert.equal(call.request.recipient.email, "user-a@example.test");
    assert.equal(call.request.recipient.phone, null);
    assert.equal(call.request.recipient.imessageHandle, null);
    assert.deepEqual(call.preferenceEnabled, { in_app: false, email: true });
  }
  assert.equal(state.dispatchCalls[0].request.idempotencyKey, null);
  assert.equal(
    state.dispatchCalls[1].request.idempotencyKey,
    "notification-route-0001",
  );
  assert.equal(
    state.adapterCalls.every(
      (call) => call.client === state.client && call.authenticatedUserId === "user-a",
    ),
    true,
  );
  assert.equal(
    state.queries.every(
      (query) =>
        query.client === state.client &&
        query.table === "notification_preferences" &&
        hasFilter(query, "user_id", "user-a") &&
        hasFilter(query, "event_type", "comment_added"),
    ),
    true,
  );
});

test("cross-user recipients and SMS or iMessage fail before data access", async () => {
  const { send } = await loadRoutes();
  const cases = [
    {
      expectedStatus: 403,
      body: {
        ...notificationInput("send"),
        recipient: { user_id: "user-b" },
      },
    },
    {
      expectedStatus: 403,
      body: {
        ...notificationInput("send"),
        recipient: { user_id: "user-a", email: "user-b@example.test" },
      },
    },
    {
      expectedStatus: 400,
      body: { ...notificationInput("send"), channels: ["sms"] },
    },
    {
      expectedStatus: 400,
      body: { ...notificationInput("send"), channels: ["imessage"] },
    },
  ];

  for (const testCase of cases) {
    resetState();
    const response = await send.POST(
      apiRequest("/api/notifications/send", "POST", testCase.body),
    );
    assert.equal(response.status, testCase.expectedStatus);
    assert.deepEqual(state.queries, []);
    assert.deepEqual(state.dispatchCalls, []);
    assert.deepEqual(state.adapterCalls, []);
  }
});

test("dependency failures return generic errors without backend details", async () => {
  const routes = await loadRoutes();
  const secret = "secret relation notification_private violated policy";
  const cases = [
    {
      failure: "notifications:select",
      invoke: () => routes.notifications.GET(apiRequest("/api/notifications")),
    },
    {
      failure: "notifications:update",
      invoke: () =>
        routes.notifications.PATCH(
          apiRequest("/api/notifications", "PATCH", { id: "note-a" }),
        ),
    },
    {
      failure: "notification_preferences:select",
      invoke: () => routes.preferences.GET(),
    },
    {
      failure: "rpc:update_notification_preferences",
      invoke: () =>
        routes.preferences.PUT(
          apiRequest("/api/notifications/preferences", "PUT", {
            preferences: {
              comment_added: {
                email_enabled: false,
                email_frequency: "off",
                in_app_enabled: true,
              },
            },
            expected_versions: { comment_added: 1 },
          }),
        ),
    },
    {
      failure: "notification_preferences:select",
      invoke: () =>
        routes.send.POST(
          apiRequest("/api/notifications/send", "POST", notificationInput("send")),
        ),
    },
  ];

  for (const testCase of cases) {
    resetState();
    state.failures[testCase.failure] = secret;
    const response = await testCase.invoke();
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /secret|relation|policy/i);
  }
});

test("unauthenticated requests stop before queries, adapters, or delivery", async () => {
  const routes = await loadRoutes();
  state.user = null;

  const responses = await Promise.all([
    routes.notifications.GET(apiRequest("/api/notifications")),
    routes.notifications.PATCH(
      apiRequest("/api/notifications", "PATCH", { id: "note-a" }),
    ),
    routes.preferences.GET(),
    routes.preferences.PUT(
      apiRequest("/api/notifications/preferences", "PUT", { preferences: {} }),
    ),
    routes.send.GET(),
    routes.send.POST(
      apiRequest("/api/notifications/send", "POST", notificationInput("send")),
    ),
  ]);

  assert.deepEqual(
    responses.map((response) => response.status),
    [401, 401, 401, 401, 401, 401],
  );
  assert.deepEqual(state.queries, []);
  assert.deepEqual(state.adapterCalls, []);
  assert.deepEqual(state.dispatchCalls, []);
});
