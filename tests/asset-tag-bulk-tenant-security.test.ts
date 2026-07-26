import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { NextRequest } from "next/server.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const authStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function requireAuth() {
    return globalThis.__ccoTenantRouteUser ?? null;
  }
`)}`;

const accessStubUrl = `data:text/javascript,${encodeURIComponent(`
  export const PROJECT_ROLE_RANK = {
    viewer: 10,
    commenter: 20,
    reviewer: 30,
    editor: 40,
    producer: 50,
    admin: 60,
    owner: 70,
  };

  export async function getProjectAccess(projectId, userId, minimumRole, client) {
    globalThis.__ccoTenantProjectAccessCalls.push({ projectId, userId, minimumRole, client });
    return globalThis.__ccoTenantProjectAccess({ projectId, userId, minimumRole, client });
  }

  export async function getAssetAccess(assetId, userId, minimumRole, client) {
    globalThis.__ccoTenantAssetAccessCalls.push({ assetId, userId, minimumRole, client });
    return globalThis.__ccoTenantAssetAccess({ assetId, userId, minimumRole, client });
  }
`)}`;

const supabaseStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function getSupabase() {
    if (!globalThis.__ccoTenantSupabase) {
      throw new Error("Tenant route test client was not installed");
    }
    return globalThis.__ccoTenantSupabase;
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
    if (specifier === "@/lib/api/responses") {
      return nextResolve(
        pathToFileURL(resolve(repositoryRoot, "lib/api/responses.ts")).href,
        context,
      );
    }
    if (specifier.endsWith("asset-route-boundary")) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

type Row = Record<string, unknown>;
type Filter =
  | { operator: "eq"; column: string; value: unknown }
  | { operator: "in"; column: string; value: unknown[] };
type Operation = "select" | "insert" | "upsert" | "update" | "delete";

interface RecordedRead {
  table: string;
  columns: string;
  filters: Filter[];
}

interface RecordedWrite {
  table: string;
  operation: Exclude<Operation, "select">;
  payload: unknown;
  filters: Filter[];
  options?: unknown;
}

class FakeQuery {
  private columns = "*";
  private selectRequested = false;
  private readonly database: FakeSupabase;
  private readonly filters: Filter[] = [];
  private operation: Operation = "select";
  private options: unknown;
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

  insert(payload: unknown) {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }

  upsert(payload: unknown, options?: unknown) {
    this.operation = "upsert";
    this.payload = payload;
    this.options = options;
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
        if (filter.operator === "eq") {
          return row[filter.column] === filter.value;
        }
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
      this.database.reads.push({
        table: this.table,
        columns: this.columns,
        filters: structuredClone(this.filters),
      });
      const rows = this.matchingRows().map((row) => ({ ...row }));
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    }

    this.database.writes.push({
      table: this.table,
      operation: this.operation,
      payload: structuredClone(this.payload),
      filters: structuredClone(this.filters),
      options: structuredClone(this.options),
    });

    if (this.operation === "insert" || this.operation === "upsert") {
      const rows = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
      this.database.tables[this.table] ??= [];
      for (const row of rows) {
        const existing = this.database.tables[this.table].find(
          (candidate) =>
            candidate.id !== undefined &&
            row.id !== undefined &&
            candidate.id === row.id,
        );
        if (existing) Object.assign(existing, row);
        else this.database.tables[this.table].push({ ...row });
      }
      const data = rows.map((row, index) => ({
        id: row.id ?? `${this.table}-${index + 1}`,
        created_at: row.created_at ?? "2026-07-15T12:00:00.000Z",
        ...row,
      }));
      return { data: single ? (data[0] ?? null) : data, error: null };
    }

    const matches = new Set(this.matchingRows());
    if (this.operation === "update") {
      for (const row of matches) Object.assign(row, this.payload);
      // PostgREST returns the updated rows when .select() is chained after
      // .update(); the harness mirrors that so handlers can verify counts.
      const rows = [...matches].map((row) => ({ ...row }));
      return { data: this.selectRequested ? rows : null, error: null };
    }
    this.database.tables[this.table] = (
      this.database.tables[this.table] ?? []
    ).filter((row) => !matches.has(row));
    return { data: null, error: null };
  }
}

class FakeSupabase {
  readonly errors: Record<string, string>;
  readonly reads: RecordedRead[] = [];
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
  assetId?: string;
  client: FakeSupabase;
  minimumRole: string;
  projectId?: string;
  userId: string;
}

type TenantTestGlobal = typeof globalThis & {
  __ccoTenantAssetAccess: (call: AccessCall) => AccessResult;
  __ccoTenantAssetAccessCalls: AccessCall[];
  __ccoTenantProjectAccess: (call: AccessCall) => AccessResult;
  __ccoTenantProjectAccessCalls: AccessCall[];
  __ccoTenantRouteUser: { id: string; email: string } | null;
  __ccoTenantSupabase: FakeSupabase;
};

const state = globalThis as TenantTestGlobal;

function configure(tables: Record<string, Row[]> = {}) {
  const supabase = new FakeSupabase(tables);
  state.__ccoTenantRouteUser = {
    id: "user-a",
    email: "user-a@example.test",
  };
  state.__ccoTenantSupabase = supabase;
  state.__ccoTenantProjectAccessCalls = [];
  state.__ccoTenantAssetAccessCalls = [];
  state.__ccoTenantProjectAccess = ({ projectId }) => ({
    ok: true,
    data: {
      id: projectId,
      project_id: projectId,
      access_role: "editor",
      access_rank: 60,
    },
  });
  state.__ccoTenantAssetAccess = ({ assetId }) => {
    const asset = supabase.tables.assets?.find((row) => row.id === assetId);
    return asset
      ? {
          ok: true,
          data: {
            ...asset,
            access_role: "editor",
            access_rank: 60,
          },
        }
      : { ok: false, status: 404, error: "Asset not found" };
  };
  return supabase;
}

async function tagsRoute() {
  return import(
    pathToFileURL(resolve(repositoryRoot, "app/api/assets/tags/route.ts")).href
  );
}

async function bulkRoute() {
  return import(
    pathToFileURL(resolve(repositoryRoot, "app/api/assets/bulk/route.ts")).href
  );
}

async function assetDetailRoute() {
  return import(
    pathToFileURL(resolve(repositoryRoot, "app/api/assets/[id]/route.ts")).href
  );
}

function jsonRequest(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body: unknown,
) {
  return new NextRequest(`https://admin.contentco-op.com${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const projectA = "project-a";
const projectB = "project-b";
const assetA = "asset-a";
const assetB = "asset-b";
const tagA = "tag-a";
const tagB = "tag-b";

test("single-asset move rejects a destination folder from another project", async () => {
  const supabase = configure({
    assets: [{ id: assetA, project_id: projectA, folder_id: null }],
    folders: [{ id: "folder-b", project_id: projectB }],
  });
  const { PATCH } = await assetDetailRoute();

  const response = await PATCH(
    jsonRequest(`/api/assets/${assetA}`, "PATCH", {
      folder_id: "folder-b",
    }),
    { params: Promise.resolve({ id: assetA }) },
  );

  assert.equal(response.status, 404);
  assert.deepEqual(supabase.reads[0]?.filters, [
    { operator: "eq", column: "id", value: "folder-b" },
    { operator: "eq", column: "project_id", value: projectA },
  ]);
  assert.equal(supabase.writes.length, 0);
});

test("tag reads require project viewer access before querying", async () => {
  const supabase = configure({
    tags: [{ id: tagA, project_id: projectA, name: "Launch", created_at: "1" }],
  });
  const { GET } = await tagsRoute();

  const response = await GET(
    new NextRequest(
      `https://admin.contentco-op.com/api/assets/tags?project_id=${projectA}`,
    ),
  );

  assert.equal(response.status, 200);
  assert.equal(state.__ccoTenantProjectAccessCalls[0]?.minimumRole, "viewer");
  assert.equal(state.__ccoTenantProjectAccessCalls[0]?.projectId, projectA);
  assert.deepEqual(supabase.reads[0], {
    table: "tags",
    columns: "id, project_id, name, color, created_at",
    filters: [{ operator: "eq", column: "project_id", value: projectA }],
  });
});

test("tag reads hide inaccessible projects and perform no tag query", async () => {
  const supabase = configure();
  state.__ccoTenantProjectAccess = () => ({
    ok: false,
    status: 404,
    error: "private project detail",
  });
  const { GET } = await tagsRoute();

  const response = await GET(
    new NextRequest(
      `https://admin.contentco-op.com/api/assets/tags?project_id=${projectB}`,
    ),
  );

  assert.equal(response.status, 404, JSON.stringify(await response.clone().json()));
  assert.deepEqual(await response.json(), {
    error: "Resource not found",
    code: "NOT_FOUND",
  });
  assert.equal(supabase.reads.length, 0);
  assert.equal(supabase.writes.length, 0);
});

test("tag creation requires editor and inserts only allowlisted fields", async () => {
  const supabase = configure();
  const { POST } = await tagsRoute();

  const response = await POST(
    jsonRequest("/api/assets/tags", "POST", {
      project_id: projectA,
      name: "  Launch  ",
      color: "#AABBCC",
      id: "caller-selected-id",
      created_at: "1900-01-01T00:00:00.000Z",
      owner_id: "user-b",
    }),
  );

  assert.equal(response.status, 201);
  assert.equal(state.__ccoTenantProjectAccessCalls[0]?.minimumRole, "editor");
  assert.deepEqual(supabase.writes[0], {
    table: "tags",
    operation: "insert",
    payload: { project_id: projectA, name: "Launch", color: "#AABBCC" },
    filters: [],
    options: undefined,
  });
});

test("tag creation denial produces no mutation", async () => {
  const supabase = configure();
  state.__ccoTenantProjectAccess = () => ({
    ok: false,
    status: 404,
    error: "Project not found",
  });
  const { POST } = await tagsRoute();

  const response = await POST(
    jsonRequest("/api/assets/tags", "POST", {
      project_id: projectA,
      name: "Launch",
    }),
  );

  assert.equal(response.status, 404);
  assert.equal(state.__ccoTenantProjectAccessCalls[0]?.minimumRole, "editor");
  assert.equal(supabase.writes.length, 0);
});

test("tag assignment rejects a tag from another asset project", async () => {
  const supabase = configure({
    assets: [{ id: assetA, project_id: projectA }],
    tags: [{ id: tagB, project_id: projectB }],
  });
  const { POST } = await tagsRoute();

  const response = await POST(
    jsonRequest("/api/assets/tags", "POST", {
      asset_id: assetA,
      tag_id: tagB,
    }),
  );

  assert.equal(response.status, 404);
  assert.equal(state.__ccoTenantAssetAccessCalls[0]?.minimumRole, "editor");
  assert.deepEqual(supabase.reads[0]?.filters, [
    { operator: "eq", column: "id", value: tagB },
    { operator: "eq", column: "project_id", value: projectA },
  ]);
  assert.equal(supabase.writes.length, 0);
});

test("tag assignment and unassignment use exact validated asset-tag pairs", async () => {
  const supabase = configure({
    assets: [{ id: assetA, project_id: projectA }],
    tags: [{ id: tagA, project_id: projectA }],
  });
  const { DELETE, POST } = await tagsRoute();

  const assign = await POST(
    jsonRequest("/api/assets/tags", "POST", {
      asset_id: assetA,
      tag_id: tagA,
      project_id: projectB,
      role: "owner",
    }),
  );
  const unassign = await DELETE(
    jsonRequest("/api/assets/tags", "DELETE", {
      asset_id: assetA,
      tag_id: tagA,
    }),
  );

  assert.equal(assign.status, 200);
  assert.equal(unassign.status, 200);
  assert.deepEqual(
    state.__ccoTenantAssetAccessCalls.map((call) => call.minimumRole),
    ["editor", "editor"],
  );
  assert.deepEqual(supabase.writes, [
    {
      table: "asset_tags",
      operation: "upsert",
      payload: { asset_id: assetA, tag_id: tagA },
      filters: [],
      options: { onConflict: "asset_id,tag_id" },
    },
    {
      table: "asset_tags",
      operation: "delete",
      payload: undefined,
      filters: [
        { operator: "eq", column: "asset_id", value: assetA },
        { operator: "eq", column: "tag_id", value: tagA },
      ],
      options: undefined,
    },
  ]);
});

test("tag deletion requires editor and scopes the delete to its project", async () => {
  const supabase = configure({
    tags: [{ id: tagA, project_id: projectA }],
  });
  const { DELETE } = await tagsRoute();

  const response = await DELETE(
    jsonRequest("/api/assets/tags", "DELETE", { id: tagA }),
  );

  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  assert.equal(state.__ccoTenantProjectAccessCalls[0]?.minimumRole, "editor");
  assert.deepEqual(supabase.writes[0]?.filters, [
    { operator: "eq", column: "id", value: tagA },
    { operator: "eq", column: "project_id", value: projectA },
  ]);
});

test("bulk operations reject mixed projects before authorization or mutation", async () => {
  const supabase = configure({
    assets: [
      { id: assetA, project_id: projectA },
      { id: assetB, project_id: projectB },
    ],
  });
  const { POST } = await bulkRoute();

  const response = await POST(
    jsonRequest("/api/assets/bulk", "POST", {
      action: "delete",
      asset_ids: [assetA, assetB],
    }),
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: "Assets not found",
    code: "NOT_FOUND",
  });
  assert.equal(state.__ccoTenantProjectAccessCalls.length, 0);
  assert.equal(supabase.writes.length, 0);
});

test("bulk operations require editor access to the one asset project", async () => {
  const supabase = configure({
    assets: [{ id: assetA, project_id: projectA }],
  });
  state.__ccoTenantProjectAccess = () => ({
    ok: false,
    status: 404,
    error: "Project not found",
  });
  const { POST } = await bulkRoute();

  const response = await POST(
    jsonRequest("/api/assets/bulk", "POST", {
      action: "restore",
      asset_ids: [assetA],
    }),
  );

  assert.equal(response.status, 404);
  assert.equal(state.__ccoTenantProjectAccessCalls[0]?.projectId, projectA);
  assert.equal(state.__ccoTenantProjectAccessCalls[0]?.minimumRole, "editor");
  assert.equal(supabase.writes.length, 0);
});

test("bulk move rejects a destination folder from another project", async () => {
  const supabase = configure({
    assets: [{ id: assetA, project_id: projectA }],
    folders: [{ id: "folder-b", project_id: projectB }],
  });
  const { POST } = await bulkRoute();

  const response = await POST(
    jsonRequest("/api/assets/bulk", "POST", {
      action: "move",
      asset_ids: [assetA],
      folder_id: "folder-b",
    }),
  );

  assert.equal(response.status, 404);
  assert.deepEqual(supabase.reads[1]?.filters, [
    { operator: "eq", column: "id", value: "folder-b" },
    { operator: "eq", column: "project_id", value: projectA },
  ]);
  assert.equal(supabase.writes.length, 0);
});

test("bulk move deduplicates assets and keeps the update project-bounded", async () => {
  const supabase = configure({
    assets: [
      { id: assetA, project_id: projectA, folder_id: null },
      { id: assetB, project_id: projectA, folder_id: null },
    ],
    folders: [{ id: "folder-a", project_id: projectA }],
  });
  const { POST } = await bulkRoute();

  const response = await POST(
    jsonRequest("/api/assets/bulk", "POST", {
      action: "move",
      asset_ids: [assetA, assetA, assetB],
      folder_id: "folder-a",
      project_id: projectB,
      deleted_at: "1900-01-01T00:00:00.000Z",
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    message: "Moved 2 asset(s)",
  });
  assert.deepEqual(supabase.writes[0], {
    table: "assets",
    operation: "update",
    payload: { folder_id: "folder-a" },
    filters: [
      { operator: "in", column: "id", value: [assetA, assetB] },
      { operator: "eq", column: "project_id", value: projectA },
    ],
    options: undefined,
  });
});

test("bulk tag rejects cross-project tags and writes exact rows for valid tags", async () => {
  const supabase = configure({
    assets: [
      { id: assetA, project_id: projectA },
      { id: assetB, project_id: projectA },
    ],
    tags: [
      { id: tagA, project_id: projectA },
      { id: tagB, project_id: projectB },
    ],
  });
  const { POST } = await bulkRoute();

  const denied = await POST(
    jsonRequest("/api/assets/bulk", "POST", {
      action: "tag",
      asset_ids: [assetA, assetB],
      tag_id: tagB,
    }),
  );
  assert.equal(denied.status, 404);
  assert.equal(supabase.writes.length, 0);

  const allowed = await POST(
    jsonRequest("/api/assets/bulk", "POST", {
      action: "tag",
      asset_ids: [assetA, assetB],
      tag_id: tagA,
    }),
  );

  assert.equal(allowed.status, 200, JSON.stringify(await allowed.clone().json()));
  assert.deepEqual(supabase.writes[0], {
    table: "asset_tags",
    operation: "upsert",
    payload: [
      { asset_id: assetA, tag_id: tagA },
      { asset_id: assetB, tag_id: tagA },
    ],
    filters: [],
    options: { onConflict: "asset_id,tag_id" },
  });
});

test("bulk delete exposes no backend detail and keeps successful fields allowlisted", async () => {
  const supabase = configure({
    assets: [{ id: assetA, project_id: projectA, deleted_at: null }],
  });
  supabase.errors["assets:update"] = "private provider failure";
  const { POST } = await bulkRoute();

  const failed = await POST(
    jsonRequest("/api/assets/bulk", "POST", {
      action: "delete",
      asset_ids: [assetA],
      folder_id: "folder-b",
      tag_id: tagB,
      project_id: projectB,
    }),
  );

  assert.equal(failed.status, 500);
  const failedBody = JSON.stringify(await failed.json());
  assert.doesNotMatch(failedBody, /private|provider|failure/i);
  assert.equal(supabase.writes.length, 0);

  delete supabase.errors["assets:update"];
  const allowed = await POST(
    jsonRequest("/api/assets/bulk", "POST", {
      action: "delete",
      asset_ids: [assetA],
      folder_id: "folder-b",
      tag_id: tagB,
      project_id: projectB,
    }),
  );

  assert.equal(allowed.status, 200);
  assert.deepEqual(Object.keys(supabase.writes[0]?.payload as Row), ["deleted_at"]);
  assert.deepEqual(supabase.writes[0]?.filters, [
    { operator: "in", column: "id", value: [assetA] },
    { operator: "eq", column: "project_id", value: projectA },
  ]);
});
