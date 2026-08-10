import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { NextRequest } from "next/server.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const authStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function requireAuth() {
    return globalThis.__ccoDeliveryRouteUser ?? null;
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

  export async function getProjectAccess(projectId, userId, minimumRole, client) {
    globalThis.__ccoDeliveryProjectAccessCalls.push({ projectId, userId, minimumRole, client });
    return globalThis.__ccoDeliveryProjectAccess({ projectId, userId, minimumRole, client });
  }
`)}`;

const supabaseStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function getSupabase() {
    if (!globalThis.__ccoDeliverySupabase) {
      throw new Error("Delivery route test client was not installed");
    }
    return globalThis.__ccoDeliverySupabase;
  }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/auth") return nextResolve(authStubUrl, context);
    if (specifier === "@/lib/access-control") return nextResolve(accessStubUrl, context);
    if (specifier === "@/lib/supabase") return nextResolve(supabaseStubUrl, context);
    if (specifier === "@/lib/api/responses") {
      return nextResolve(
        pathToFileURL(resolve(repositoryRoot, "lib/api/responses.ts")).href,
        context,
      );
    }
    return nextResolve(specifier, context);
  },
});

type Row = Record<string, unknown>;
type Filter =
  | { operator: "eq"; column: string; value: unknown }
  | { operator: "in"; column: string; value: unknown[] }
  | { operator: "is"; column: string; value: unknown };
type Operation = "select" | "insert" | "update" | "delete";

interface RecordedWrite {
  table: string;
  operation: Exclude<Operation, "select">;
  payload: unknown;
  filters: Filter[];
}

class FakeQuery {
  private columns = "*";
  private selectRequested = false;
  private readonly database: FakeSupabase;
  private readonly filters: Filter[] = [];
  private operation: Operation = "select";
  private payload: unknown;
  private readonly table: string;

  constructor(database: FakeSupabase, table: string) {
    this.database = database;
    this.table = table;
  }

  select(columns = "*") {
    this.columns = columns;
    this.selectRequested = true;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ operator: "eq", column, value });
    return this;
  }

  in(column: string, value: unknown[]) {
    this.filters.push({ operator: "in", column, value: [...value] });
    return this;
  }

  is(column: string, value: unknown) {
    this.filters.push({ operator: "is", column, value });
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

  async order(column: string, options?: { ascending?: boolean }) {
    const result = await this.execute(false);
    if (!result.error && Array.isArray(result.data)) {
      result.data.sort((left, right) => {
        const comparison = String(left[column] ?? "").localeCompare(
          String(right[column] ?? ""),
        );
        return options?.ascending === false ? -comparison : comparison;
      });
    }
    return result;
  }

  async maybeSingle() {
    return this.execute(true);
  }

  async single() {
    return this.execute(true);
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute(false).then(onfulfilled, onrejected);
  }

  private matchingRows() {
    return (this.database.tables[this.table] ?? []).filter((row) =>
      this.filters.every((filter) => {
        if (filter.operator === "eq") return row[filter.column] === filter.value;
        if (filter.operator === "is") return (row[filter.column] ?? null) === filter.value;
        return filter.value.includes(row[filter.column]);
      }),
    );
  }

  private async execute(single: boolean) {
    const errorMessage = this.database.errors[`${this.table}:${this.operation}`];
    if (errorMessage) {
      return { data: null, error: { message: errorMessage } };
    }

    if (this.operation === "select") {
      const rows = this.matchingRows().map((row) => ({ ...row }));
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    }

    this.database.writes.push({
      table: this.table,
      operation: this.operation,
      payload: structuredClone(this.payload),
      filters: structuredClone(this.filters),
    });

    if (this.operation === "insert") {
      const rows = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
      this.database.tables[this.table] ??= [];
      for (const row of rows) this.database.tables[this.table].push({ ...row });
      const data = rows.map((row, index) => ({
        id: row.id ?? `${this.table}-${index + 1}`,
        created_at: row.created_at ?? "2026-08-12T12:00:00.000Z",
        ...row,
      }));
      return { data: single ? (data[0] ?? null) : data, error: null };
    }

    const matches = new Set(this.matchingRows());
    if (this.operation === "update") {
      for (const row of matches) Object.assign(row, this.payload);
      const rows = [...matches].map((row) => ({ ...row }));
      return {
        data: this.selectRequested ? (single ? (rows[0] ?? null) : rows) : null,
        error: null,
      };
    }
    this.database.tables[this.table] = (this.database.tables[this.table] ?? []).filter(
      (row) => !matches.has(row),
    );
    return { data: null, error: null };
  }
}

class FakeSupabase {
  readonly errors: Record<string, string>;
  readonly tables: Record<string, Row[]>;
  readonly writes: RecordedWrite[] = [];

  constructor(
    tables: Record<string, Row[]> = {},
    errors: Record<string, string> = {},
  ) {
    this.tables = structuredClone(tables);
    this.errors = { ...errors };
  }

  from(table: string) {
    return new FakeQuery(this, table);
  }
}

type AccessResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; status: number; error: string };

interface AccessCall {
  client: FakeSupabase;
  minimumRole: string;
  projectId?: string;
  userId: string;
}

type DeliveryTestGlobal = typeof globalThis & {
  __ccoDeliveryProjectAccess: (call: AccessCall) => AccessResult;
  __ccoDeliveryProjectAccessCalls: AccessCall[];
  __ccoDeliveryRouteUser: { id: string; email: string } | null;
  __ccoDeliverySupabase: FakeSupabase;
};

const state = globalThis as DeliveryTestGlobal;

function configure(tables: Record<string, Row[]> = {}) {
  const supabase = new FakeSupabase(tables);
  state.__ccoDeliveryRouteUser = { id: "user-a", email: "user-a@example.test" };
  state.__ccoDeliverySupabase = supabase;
  state.__ccoDeliveryProjectAccessCalls = [];
  state.__ccoDeliveryProjectAccess = ({ projectId }) => ({
    ok: true,
    data: {
      id: projectId,
      project_id: projectId,
      access_role: "producer",
      access_rank: 70,
    },
  });
  return supabase;
}

async function listRoute() {
  return import(
    pathToFileURL(
      resolve(repositoryRoot, "app/api/projects/[id]/deliverables/route.ts"),
    ).href
  );
}

async function detailRoute() {
  return import(
    pathToFileURL(
      resolve(
        repositoryRoot,
        "app/api/projects/[id]/deliverables/[deliverableId]/route.ts",
      ),
    ).href
  );
}

function jsonRequest(path: string, method: "POST" | "PATCH", body: unknown) {
  return new NextRequest(`https://admin.contentco-op.com${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const projectId = "project-a";
const deliverableId = "deliverable-a";
const assetA = "asset-a";
const assetB = "asset-b";
const versionA = "version-a";
const versionB = "version-b";
const approvalA = "approval-a";

function speccedDeliverable(overrides: Row = {}): Row {
  return {
    id: deliverableId,
    project_id: projectId,
    name: "ICA_ROADSHOW_MASTER",
    spec: { resolution: "3840x2160", codec: "ProRes 422 HQ", aspect: "16:9" },
    source_version_id: null,
    status: "ready",
    delivered_at: null,
    locked_at: null,
    locked_by: null,
    approval_id: null,
    ...overrides,
  };
}

function approvedApprovals(): Row[] {
  return [
    {
      id: approvalA,
      asset_id: assetA,
      status: "approved",
      decided_at: "2026-08-11T10:00:00.000Z",
    },
    {
      id: "approval-b",
      asset_id: assetB,
      status: "approved_with_changes",
      decided_at: "2026-08-11T11:00:00.000Z",
    },
  ];
}

/* ── GET list ──────────────────────────────────────────────────────────── */

test("deliverable list requires project viewer access before querying", async () => {
  const supabase = configure();
  state.__ccoDeliveryProjectAccess = () => ({
    ok: false,
    status: 404,
    error: "private project detail",
  });
  const { GET } = await listRoute();

  const response = await GET(
    new NextRequest(`https://admin.contentco-op.com/api/projects/${projectId}/deliverables`),
    { params: Promise.resolve({ id: projectId }) },
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: "private project detail",
    code: "PROJECT_NOT_FOUND",
  });
  assert.equal(state.__ccoDeliveryProjectAccessCalls[0]?.minimumRole, "viewer");
  assert.equal(supabase.writes.length, 0);
});

test("deliverable list returns rows with their locked items", async () => {
  configure({
    deliverables: [
      speccedDeliverable({ status: "delivered", locked_at: "2026-08-11T12:00:00.000Z", locked_by: "user-a", delivered_at: "2026-08-11T12:00:00.000Z" }),
    ],
    deliverable_items: [
      { id: "item-1", deliverable_id: deliverableId, asset_id: assetA, version_id: versionA, sha256: "abc" },
    ],
  });
  const { GET } = await listRoute();

  const response = await GET(
    new NextRequest(`https://admin.contentco-op.com/api/projects/${projectId}/deliverables`),
    { params: Promise.resolve({ id: projectId }) },
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.deliverables.length, 1);
  assert.equal(body.deliverables[0].status, "delivered");
  assert.equal(body.deliverables[0].locked_at, "2026-08-11T12:00:00.000Z");
  assert.deepEqual(body.deliverables[0].items, [
    { id: "item-1", deliverable_id: deliverableId, asset_id: assetA, version_id: versionA, sha256: "abc" },
  ]);
});

/* ── POST create/spec ──────────────────────────────────────────────────── */

test("deliverable create validates its name and performs no partial writes", async () => {
  const supabase = configure();
  const { POST } = await listRoute();

  const response = await POST(
    jsonRequest(`/api/projects/${projectId}/deliverables`, "POST", { name: "" }),
    { params: Promise.resolve({ id: projectId }) },
  );

  assert.equal(response.status, 400);
  assert.equal(supabase.writes.length, 0);
});

test("deliverable create rejects items whose assets live outside the project", async () => {
  const supabase = configure({
    assets: [{ id: assetA, project_id: projectId }],
    versions: [
      { id: versionA, asset_id: assetA },
      { id: versionB, asset_id: assetB },
    ],
  });
  const { POST } = await listRoute();

  const response = await POST(
    jsonRequest(`/api/projects/${projectId}/deliverables`, "POST", {
      name: "Cross-project master",
      items: [{ asset_id: assetB, version_id: versionB }],
    }),
    { params: Promise.resolve({ id: projectId }) },
  );

  assert.equal(response.status, 400);
  assert.equal(supabase.writes.length, 0);
});

test("deliverable create persists the spec row and its version-bound items", async () => {
  const supabase = configure({
    assets: [{ id: assetA, project_id: projectId }],
    versions: [{ id: versionA, asset_id: assetA }],
  });
  const { POST } = await listRoute();

  const response = await POST(
    jsonRequest(`/api/projects/${projectId}/deliverables`, "POST", {
      name: "ICA_ROADSHOW_MASTER",
      spec: { resolution: "3840x2160", codec: "ProRes 422 HQ", aspect: "16:9" },
      items: [{ asset_id: assetA, version_id: versionA, sha256: "abc" }],
    }),
    { params: Promise.resolve({ id: projectId }) },
  );

  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.status, "specced");
  // Postgres returns locked_at as null by default; the fake omits unset columns.
  assert.equal(body.locked_at ?? null, null);
  const deliverableWrite = supabase.writes.find((write) => write.table === "deliverables");
  assert.equal(deliverableWrite?.operation, "insert");
  const itemWrite = supabase.writes.find((write) => write.table === "deliverable_items");
  assert.equal(itemWrite?.operation, "insert");
  assert.equal(state.__ccoDeliveryProjectAccessCalls[0]?.minimumRole, "editor");
});

/* ── PATCH lock command ────────────────────────────────────────────────── */

test("the lock command is member-gated and performs no writes without access", async () => {
  const supabase = configure({ deliverables: [speccedDeliverable()] });
  state.__ccoDeliveryProjectAccess = () => ({
    ok: false,
    status: 404,
    error: "private project detail",
  });
  const { PATCH } = await detailRoute();

  const response = await PATCH(
    jsonRequest(`/api/projects/${projectId}/deliverables/${deliverableId}`, "PATCH", {
      status: "delivered",
    }),
    { params: Promise.resolve({ id: projectId, deliverableId }) },
  );

  assert.equal(response.status, 404);
  assert.equal(state.__ccoDeliveryProjectAccessCalls[0]?.minimumRole, "producer");
  assert.equal(supabase.writes.length, 0);
});

test("the lock command rejects statuses other than delivered", async () => {
  const supabase = configure({ deliverables: [speccedDeliverable()] });
  const { PATCH } = await detailRoute();

  const response = await PATCH(
    jsonRequest(`/api/projects/${projectId}/deliverables/${deliverableId}`, "PATCH", {
      status: "expired",
    }),
    { params: Promise.resolve({ id: projectId, deliverableId }) },
  );

  assert.equal(response.status, 400);
  assert.equal(supabase.writes.length, 0);
});

test("the lock command requires a positive approval on every bound asset", async () => {
  const supabase = configure({
    deliverables: [speccedDeliverable()],
    deliverable_items: [
      { id: "item-1", deliverable_id: deliverableId, asset_id: assetA, version_id: versionA },
      { id: "item-2", deliverable_id: deliverableId, asset_id: assetB, version_id: versionB },
    ],
    approvals: [
      {
        id: approvalA,
        asset_id: assetA,
        status: "approved",
        decided_at: "2026-08-11T10:00:00.000Z",
      },
      {
        id: "approval-b",
        asset_id: assetB,
        status: "changes_requested",
        decided_at: "2026-08-11T11:00:00.000Z",
      },
    ],
  });
  const { PATCH } = await detailRoute();

  const response = await PATCH(
    jsonRequest(`/api/projects/${projectId}/deliverables/${deliverableId}`, "PATCH", {
      status: "delivered",
    }),
    { params: Promise.resolve({ id: projectId, deliverableId }) },
  );

  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.code, "DELIVERY_APPROVAL_REQUIRED");
  assert.equal(supabase.writes.length, 0);
  assert.equal(supabase.tables.deliverables[0]?.locked_at, null);
});

test("an already-locked delivery cannot be re-locked", async () => {
  const supabase = configure({
    deliverables: [
      speccedDeliverable({
        status: "delivered",
        locked_at: "2026-08-11T12:00:00.000Z",
        locked_by: "user-a",
      }),
    ],
    deliverable_items: [
      { id: "item-1", deliverable_id: deliverableId, asset_id: assetA, version_id: versionA },
    ],
    approvals: approvedApprovals(),
  });
  const { PATCH } = await detailRoute();

  const response = await PATCH(
    jsonRequest(`/api/projects/${projectId}/deliverables/${deliverableId}`, "PATCH", {
      status: "delivered",
    }),
    { params: Promise.resolve({ id: projectId, deliverableId }) },
  );

  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.code, "DELIVERY_LOCKED");
  assert.equal(supabase.writes.length, 0);
});

test("the lock command stamps the lock atomically and appends the audit event", async () => {
  const supabase = configure({
    deliverables: [speccedDeliverable()],
    deliverable_items: [
      { id: "item-1", deliverable_id: deliverableId, asset_id: assetA, version_id: versionA },
    ],
    approvals: approvedApprovals(),
  });
  const { PATCH } = await detailRoute();

  const response = await PATCH(
    jsonRequest(`/api/projects/${projectId}/deliverables/${deliverableId}`, "PATCH", {
      status: "delivered",
    }),
    { params: Promise.resolve({ id: projectId, deliverableId }) },
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "delivered");
  assert.equal(body.locked_by, "user-a");
  assert.equal(body.approval_id, approvalA);
  assert.equal(typeof body.locked_at, "string");
  assert.equal(body.delivered_at, body.locked_at);

  const lockWrite = supabase.writes.find((write) => write.table === "deliverables");
  assert.equal(lockWrite?.operation, "update");
  assert.deepEqual(
    (lockWrite?.payload as Row).status,
    "delivered",
  );
  // The lock write is guarded against a concurrent lock on the same row.
  assert.ok(
    (lockWrite?.filters ?? []).some(
      (filter) => filter.operator === "is" && filter.column === "locked_at" && filter.value === null,
    ),
  );

  const auditWrite = supabase.writes.find((write) => write.table === "activity_log");
  assert.ok(auditWrite, "lock command must append an activity_log event");
  const auditPayload = auditWrite?.payload as Row;
  assert.equal(auditPayload.action, "delivery_locked");
  assert.equal(auditPayload.project_id, projectId);
  assert.equal(auditPayload.actor_id, "user-a");
  const auditDetails = auditPayload.details as Row;
  assert.equal(auditDetails.deliverable_id, deliverableId);
  assert.equal(auditDetails.approval_id, approvalA);
});
