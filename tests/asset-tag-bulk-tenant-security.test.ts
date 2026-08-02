import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const authStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function requireAuth() {
    return globalThis.__assetTagBulkTenantState.user;
  }
`)}`;

const accessStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function getProjectAccess(projectId, userId, minimumRole, client) {
    const state = globalThis.__assetTagBulkTenantState;
    state.projectAccessCalls.push({ projectId, userId, minimumRole, client });
    return state.projectAccessResults[projectId] ?? {
      ok: true,
      data: { id: projectId, access_role: "editor", access_rank: 60 },
    };
  }

  export async function getAssetAccess(assetId, userId, minimumRole, client) {
    const state = globalThis.__assetTagBulkTenantState;
    state.assetAccessCalls.push({ assetId, userId, minimumRole, client });
    if (state.assetAccessResults[assetId]) {
      return state.assetAccessResults[assetId];
    }
    const asset = state.rows.assets.find((row) => row.id === assetId);
    return asset
      ? {
          ok: true,
          data: {
            id: asset.id,
            project_id: asset.project_id,
            access_role: "editor",
            access_rank: 60,
          },
        }
      : { ok: false, status: 404, error: "Asset not found" };
  }
`)}`;

const supabaseStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function getSupabase() {
    return globalThis.__assetTagBulkTenantState.supabase;
  }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/auth") return nextResolve(authStubUrl, context);
    if (specifier === "@/lib/access-control") {
      return nextResolve(accessStubUrl, context);
    }
    if (specifier === "@/lib/supabase") {
      return nextResolve(supabaseStubUrl, context);
    }
    return nextResolve(specifier, context);
  },
});

type Row = Record<string, unknown>;
type Operation = "select" | "insert" | "update" | "upsert" | "delete";
type Filter =
  | { kind: "eq"; column: string; value: unknown }
  | { kind: "in"; column: string; values: unknown[] };

type QueryRecord = {
  table: string;
  operation: Operation;
  select: string | null;
  filters: Filter[];
};

type MutationRecord = QueryRecord & {
  payload: Row | Row[] | null;
  options?: { onConflict?: string };
};

type AccessResult =
  | { ok: true; data: Row }
  | { ok: false; status: number; error: string };

type AccessCall = {
  userId: string;
  minimumRole: string;
  client: unknown;
};

type ProjectAccessCall = AccessCall & { projectId: string };
type AssetAccessCall = AccessCall & { assetId: string };

type QueryResult = {
  data: Row[] | null;
  error: { message: string } | null;
};

interface TenantTestState {
  user: { id: string; email: string } | null;
  rows: Record<string, Row[]>;
  queries: QueryRecord[];
  mutations: MutationRecord[];
  failures: Record<string, string>;
  projectAccessCalls: ProjectAccessCall[];
  assetAccessCalls: AssetAccessCall[];
  projectAccessResults: Record<string, AccessResult>;
  assetAccessResults: Record<string, AccessResult>;
  supabase: FakeSupabase;
}

class FakeQuery implements PromiseLike<QueryResult> {
  private readonly filters: Filter[] = [];
  private operation: Operation = "select";
  private options: { onConflict?: string } | undefined;
  private payload: Row | Row[] | null = null;
  private selectedColumns: string | null = null;
  private sort: { column: string; ascending: boolean } | null = null;
  private readonly state: TenantTestState;
  private readonly table: string;

  constructor(state: TenantTestState, table: string) {
    this.state = state;
    this.table = table;
  }

  select(columns: string) {
    this.selectedColumns = columns;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ kind: "eq", column, value });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push({ kind: "in", column, values: [...values] });
    return this;
  }

  insert(payload: Row | Row[]) {
    this.operation = "insert";
    this.payload = clonePayload(payload);
    return this;
  }

  update(payload: Row) {
    this.operation = "update";
    this.payload = { ...payload };
    return this;
  }

  upsert(payload: Row | Row[], options?: { onConflict?: string }) {
    this.operation = "upsert";
    this.payload = clonePayload(payload);
    this.options = options ? { ...options } : undefined;
    return this;
  }

  delete() {
    this.operation = "delete";
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.sort = { column, ascending: options?.ascending !== false };
    return this.execute();
  }

  async maybeSingle() {
    const result = await this.execute();
    return {
      data: result.data?.[0] ?? null,
      error: result.error,
    };
  }

  async single() {
    const result = await this.execute();
    return {
      data: result.data?.[0] ?? null,
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

  private matchingRows() {
    return (this.state.rows[this.table] ?? []).filter((row) =>
      this.filters.every((filter) => {
        if (filter.kind === "eq") {
          return row[filter.column] === filter.value;
        }
        return filter.values.includes(row[filter.column]);
      }),
    );
  }

  private async execute(): Promise<QueryResult> {
    const query: QueryRecord = {
      table: this.table,
      operation: this.operation,
      select: this.selectedColumns,
      filters: this.filters.map(cloneFilter),
    };
    this.state.queries.push(query);

    const failure = this.state.failures[`${this.table}:${this.operation}`];
    if (failure) {
      return { data: null, error: { message: failure } };
    }

    if (this.operation === "select") {
      const rows = this.matchingRows().map((row) => ({ ...row }));
      if (this.sort) {
        const { column, ascending } = this.sort;
        rows.sort((left, right) => {
          const comparison = String(left[column] ?? "").localeCompare(
            String(right[column] ?? ""),
          );
          return ascending ? comparison : -comparison;
        });
      }
      return { data: rows, error: null };
    }

    const mutation: MutationRecord = {
      ...query,
      payload: this.payload === null ? null : clonePayload(this.payload),
      options: this.options ? { ...this.options } : undefined,
    };
    this.state.mutations.push(mutation);

    if (this.operation === "insert" || this.operation === "upsert") {
      const values = Array.isArray(this.payload)
        ? this.payload
        : this.payload
          ? [this.payload]
          : [];
      this.state.rows[this.table] ??= [];
      const inserted = values.map((value, index) => ({
        id:
          value.id ??
          `${this.table}-${this.state.rows[this.table].length + index + 1}`,
        created_at: value.created_at ?? "2026-07-15T12:00:00.000Z",
        ...value,
      }));
      this.state.rows[this.table].push(...inserted);
      return {
        data: this.selectedColumns ? inserted.map((row) => ({ ...row })) : null,
        error: null,
      };
    }

    const matched = this.matchingRows();
    if (this.operation === "update") {
      for (const row of matched) Object.assign(row, this.payload);
    } else if (this.operation === "delete") {
      this.state.rows[this.table] = (this.state.rows[this.table] ?? []).filter(
        (row) => !matched.includes(row),
      );
    }

    return {
      data: this.selectedColumns ? matched.map((row) => ({ ...row })) : null,
      error: null,
    };
  }
}

class FakeSupabase {
  private readonly state: TenantTestState;

  constructor(state: TenantTestState) {
    this.state = state;
  }

  from(table: string) {
    return new FakeQuery(this.state, table);
  }
}

function clonePayload(payload: Row | Row[]) {
  return Array.isArray(payload)
    ? payload.map((row) => ({ ...row }))
    : { ...payload };
}

function cloneFilter(filter: Filter): Filter {
  return filter.kind === "eq"
    ? { ...filter }
    : { ...filter, values: [...filter.values] };
}

const state = {
  user: null,
  rows: {},
  queries: [],
  mutations: [],
  failures: {},
  projectAccessCalls: [],
  assetAccessCalls: [],
  projectAccessResults: {},
  assetAccessResults: {},
  supabase: undefined as unknown as FakeSupabase,
} satisfies TenantTestState;
state.supabase = new FakeSupabase(state);

(globalThis as typeof globalThis & {
  __assetTagBulkTenantState: TenantTestState;
}).__assetTagBulkTenantState = state;

function resetState() {
  state.user = { id: "user-a", email: "user-a@example.test" };
  state.rows = {
    assets: [
      { id: "asset-a", project_id: "project-a" },
      { id: "asset-b", project_id: "project-a" },
    ],
    tags: [
      {
        id: "tag-a",
        project_id: "project-a",
        name: "Approved",
        color: "#22c55e",
        created_at: "2026-07-15T10:00:00.000Z",
      },
      {
        id: "tag-b",
        project_id: "project-b",
        name: "Other tenant",
        color: "#ef4444",
        created_at: "2026-07-15T11:00:00.000Z",
      },
    ],
    folders: [
      { id: "folder-a", project_id: "project-a" },
      { id: "folder-b", project_id: "project-b" },
    ],
    asset_tags: [],
  };
  state.queries = [];
  state.mutations = [];
  state.failures = {};
  state.projectAccessCalls = [];
  state.assetAccessCalls = [];
  state.projectAccessResults = {};
  state.assetAccessResults = {};
  state.supabase = new FakeSupabase(state);
}

async function tagRoutes() {
  return import(
    pathToFileURL(resolve(repositoryRoot, "app/api/assets/tags/route.ts")).href
  );
}

async function bulkRoutes() {
  return import(
    pathToFileURL(resolve(repositoryRoot, "app/api/assets/bulk/route.ts")).href
  );
}

function apiRequest(
  path: string,
  method: "GET" | "POST" | "DELETE",
  body?: unknown,
) {
  const url = new URL(path, "https://deliver.contentco-op.com");
  const request = new Request(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  Object.defineProperty(request, "nextUrl", { value: url });
  return request;
}

function mutation(table: string, operation: Operation) {
  return state.mutations.find(
    (entry) => entry.table === table && entry.operation === operation,
  );
}

function hasEqFilter(record: QueryRecord, column: string, value: unknown) {
  return record.filters.some(
    (filter) =>
      filter.kind === "eq" &&
      filter.column === column &&
      filter.value === value,
  );
}

function inFilter(record: QueryRecord, column: string) {
  return record.filters.find(
    (filter): filter is Extract<Filter, { kind: "in" }> =>
      filter.kind === "in" && filter.column === column,
  );
}

function projectAccessSummary(call: ProjectAccessCall) {
  return {
    projectId: call.projectId,
    userId: call.userId,
    minimumRole: call.minimumRole,
  };
}

function assetAccessSummary(call: AssetAccessCall) {
  return {
    assetId: call.assetId,
    userId: call.userId,
    minimumRole: call.minimumRole,
  };
}

test.beforeEach(resetState);

test("tag reads require project viewer access and expose only allowed fields", async () => {
  const { GET } = await tagRoutes();

  const response = await GET(
    apiRequest("/api/assets/tags?project_id=project-a", "GET") as never,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(state.projectAccessCalls.map(projectAccessSummary), [
    { projectId: "project-a", userId: "user-a", minimumRole: "viewer" },
  ]);
  assert.equal(state.projectAccessCalls[0]?.client, state.supabase);

  const read = state.queries.find(
    (query) => query.table === "tags" && query.operation === "select",
  );
  assert.ok(read);
  assert.equal(read.select, "id, project_id, name, color, created_at");
  assert.equal(hasEqFilter(read, "project_id", "project-a"), true);
  assert.equal(read.select?.includes("*"), false);
});

test("tag reads fail closed before tenant data access", async () => {
  state.projectAccessResults["project-a"] = {
    ok: false,
    status: 404,
    error: "Project Alpha belongs to another tenant",
  };
  const { GET } = await tagRoutes();

  const response = await GET(
    apiRequest("/api/assets/tags?project_id=project-a", "GET") as never,
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Resource not found" });
  assert.equal(state.queries.some((query) => query.table === "tags"), false);
});

test("tag creation requires project editor access and allowlists the insert", async () => {
  const { POST } = await tagRoutes();

  const response = await POST(
    apiRequest("/api/assets/tags", "POST", {
      project_id: "project-a",
      name: "  Client Select  ",
      color: "#abcdef",
      id: "attacker-selected-id",
      owner_id: "user-b",
    }) as never,
  );

  assert.equal(response.status, 201);
  assert.deepEqual(state.projectAccessCalls.map(projectAccessSummary), [
    { projectId: "project-a", userId: "user-a", minimumRole: "editor" },
  ]);
  assert.equal(state.projectAccessCalls[0]?.client, state.supabase);
  const write = mutation("tags", "insert");
  assert.deepEqual(write?.payload, {
    project_id: "project-a",
    name: "Client Select",
    color: "#abcdef",
  });
  assert.equal(write?.select, "id, project_id, name, color, created_at");
});

test("tag assignment and removal require asset editor access and a same-project tag", async () => {
  const routes = await tagRoutes();

  for (const method of ["POST", "DELETE"] as const) {
    resetState();
    const response = await routes[method](
      apiRequest("/api/assets/tags", method, {
        asset_id: "asset-a",
        tag_id: "tag-b",
      }) as never,
    );

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "Resource not found" });
    assert.deepEqual(state.assetAccessCalls.map(assetAccessSummary), [
      { assetId: "asset-a", userId: "user-a", minimumRole: "editor" },
    ]);
    assert.equal(state.assetAccessCalls[0]?.client, state.supabase);
    assert.equal(state.mutations.some((entry) => entry.table === "asset_tags"), false);

    const tagLookup = state.queries.find((query) => query.table === "tags");
    assert.ok(tagLookup);
    assert.equal(hasEqFilter(tagLookup, "id", "tag-b"), true);
    assert.equal(hasEqFilter(tagLookup, "project_id", "project-a"), true);
  }
});

test("same-project assignment writes only the authorized asset and tag pair", async () => {
  const routes = await tagRoutes();

  resetState();
  const assignResponse = await routes.POST(
    apiRequest("/api/assets/tags", "POST", {
      asset_id: "asset-a",
      tag_id: "tag-a",
      project_id: "project-b",
      created_by: "user-b",
    }) as never,
  );
  assert.equal(assignResponse.status, 200);
  const upsert = mutation("asset_tags", "upsert");
  assert.deepEqual(upsert?.payload, { asset_id: "asset-a", tag_id: "tag-a" });
  assert.deepEqual(upsert?.options, { onConflict: "asset_id,tag_id" });

  resetState();
  const removeResponse = await routes.DELETE(
    apiRequest("/api/assets/tags", "DELETE", {
      asset_id: "asset-a",
      tag_id: "tag-a",
      project_id: "project-b",
    }) as never,
  );
  assert.equal(removeResponse.status, 200);
  const removal = mutation("asset_tags", "delete");
  assert.ok(removal);
  assert.equal(hasEqFilter(removal, "asset_id", "asset-a"), true);
  assert.equal(hasEqFilter(removal, "tag_id", "tag-a"), true);
});

test("tag deletion requires project editor access and remains project-bound", async () => {
  const { DELETE } = await tagRoutes();

  const response = await DELETE(
    apiRequest("/api/assets/tags", "DELETE", {
      id: "tag-a",
      project_id: "project-b",
    }) as never,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(state.projectAccessCalls.map(projectAccessSummary), [
    { projectId: "project-a", userId: "user-a", minimumRole: "editor" },
  ]);
  const deletion = mutation("tags", "delete");
  assert.ok(deletion);
  assert.equal(hasEqFilter(deletion, "id", "tag-a"), true);
  assert.equal(hasEqFilter(deletion, "project_id", "project-a"), true);
  assert.equal(state.mutations.some((entry) => entry.table === "asset_tags"), false);
});

test("bulk operations reject mixed-project assets before authorization or mutation", async () => {
  state.rows.assets[1].project_id = "project-b";
  const { POST } = await bulkRoutes();

  const response = await POST(
    apiRequest("/api/assets/bulk", "POST", {
      action: "delete",
      asset_ids: ["asset-a", "asset-b"],
    }) as never,
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Resource not found" });
  assert.deepEqual(state.projectAccessCalls, []);
  assert.deepEqual(state.mutations, []);
});

test("bulk operations require editor access to their single project", async () => {
  state.projectAccessResults["project-a"] = {
    ok: false,
    status: 404,
    error: "Project belongs to another tenant",
  };
  const { POST } = await bulkRoutes();

  const response = await POST(
    apiRequest("/api/assets/bulk", "POST", {
      action: "restore",
      asset_ids: ["asset-a", "asset-b"],
    }) as never,
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Resource not found" });
  assert.deepEqual(state.projectAccessCalls.map(projectAccessSummary), [
    { projectId: "project-a", userId: "user-a", minimumRole: "editor" },
  ]);
  assert.equal(state.projectAccessCalls[0]?.client, state.supabase);
  assert.deepEqual(state.mutations, []);
});

test("bulk move validates the folder project and bounds deduplicated updates", async () => {
  const { POST } = await bulkRoutes();

  const crossProject = await POST(
    apiRequest("/api/assets/bulk", "POST", {
      action: "move",
      asset_ids: ["asset-a", "asset-b"],
      folder_id: "folder-b",
    }) as never,
  );
  assert.equal(crossProject.status, 404);
  assert.equal(mutation("assets", "update"), undefined);
  const deniedFolderLookup = state.queries.find(
    (query) => query.table === "folders",
  );
  assert.ok(deniedFolderLookup);
  assert.equal(hasEqFilter(deniedFolderLookup, "id", "folder-b"), true);
  assert.equal(hasEqFilter(deniedFolderLookup, "project_id", "project-a"), true);

  resetState();
  const allowed = await POST(
    apiRequest("/api/assets/bulk", "POST", {
      action: "move",
      asset_ids: ["asset-a", "asset-a", "asset-b"],
      folder_id: "folder-a",
      project_id: "project-b",
      deleted_at: "2000-01-01T00:00:00.000Z",
    }) as never,
  );
  assert.equal(allowed.status, 200);
  assert.deepEqual(await allowed.json(), {
    ok: true,
    message: "Moved 2 asset(s)",
  });
  const update = mutation("assets", "update");
  assert.ok(update);
  assert.deepEqual(update.payload, { folder_id: "folder-a" });
  assert.equal(hasEqFilter(update, "project_id", "project-a"), true);
  assert.deepEqual(inFilter(update, "id")?.values, ["asset-a", "asset-b"]);
});

test("bulk tag validates the tag project and writes only deduplicated pairs", async () => {
  const { POST } = await bulkRoutes();

  const crossProject = await POST(
    apiRequest("/api/assets/bulk", "POST", {
      action: "tag",
      asset_ids: ["asset-a", "asset-b"],
      tag_id: "tag-b",
    }) as never,
  );
  assert.equal(crossProject.status, 404);
  assert.equal(mutation("asset_tags", "upsert"), undefined);

  resetState();
  const allowed = await POST(
    apiRequest("/api/assets/bulk", "POST", {
      action: "tag",
      asset_ids: ["asset-a", "asset-a", "asset-b"],
      tag_id: "tag-a",
      project_id: "project-b",
    }) as never,
  );
  assert.equal(allowed.status, 200);
  const upsert = mutation("asset_tags", "upsert");
  assert.deepEqual(upsert?.payload, [
    { asset_id: "asset-a", tag_id: "tag-a" },
    { asset_id: "asset-b", tag_id: "tag-a" },
  ]);
  assert.deepEqual(upsert?.options, { onConflict: "asset_id,tag_id" });
});

test("bulk delete and restore keep every update project- and asset-bound", async () => {
  const { POST } = await bulkRoutes();

  for (const action of ["delete", "restore"] as const) {
    resetState();
    const response = await POST(
      apiRequest("/api/assets/bulk", "POST", {
        action,
        asset_ids: ["asset-a", "asset-b"],
        project_id: "project-b",
        folder_id: "folder-b",
        tag_id: "tag-b",
      }) as never,
    );

    assert.equal(response.status, 200);
    const update = mutation("assets", "update");
    assert.ok(update);
    assert.equal(hasEqFilter(update, "project_id", "project-a"), true);
    assert.deepEqual(inFilter(update, "id")?.values, ["asset-a", "asset-b"]);
    assert.deepEqual(Object.keys(update.payload as Row), ["deleted_at"]);
    if (action === "delete") {
      assert.equal(typeof (update.payload as Row).deleted_at, "string");
    } else {
      assert.equal((update.payload as Row).deleted_at, null);
    }
  }
});

test("database failures return generic errors without leaking provider details", async () => {
  state.failures["assets:update"] =
    "relation co_production.assets exposed tenant alpha";
  const { POST } = await bulkRoutes();

  const response = await POST(
    apiRequest("/api/assets/bulk", "POST", {
      action: "delete",
      asset_ids: ["asset-a"],
    }) as never,
  );

  assert.equal(response.status, 500);
  const payload = await response.json();
  assert.deepEqual(payload, { error: "Unable to update assets" });
  assert.equal(JSON.stringify(payload).includes("tenant alpha"), false);
});
