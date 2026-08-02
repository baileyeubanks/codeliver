import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const authClientStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function requireAuthWithClient() {
    return {
      user: globalThis.__ccoVersionCompareUser ?? null,
      supabase: globalThis.__ccoVersionCompareSupabase,
    };
  }
`)}`;

const accessStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function getAssetAccess(assetId, userId, minimumRole, client) {
    globalThis.__ccoVersionCompareAccessCalls.push({
      assetId,
      userId,
      minimumRole,
      usedAuthenticatedClient: client === globalThis.__ccoVersionCompareSupabase,
    });
    return globalThis.__ccoVersionCompareAccessByAsset[assetId] ?? {
      ok: true,
      data: { id: assetId },
    };
  }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/auth-client") {
      return nextResolve(authClientStubUrl, context);
    }
    if (specifier === "@/lib/access-control") return nextResolve(accessStubUrl, context);
    return nextResolve(specifier, context);
  },
});

type Row = Record<string, unknown>;
type Filter = { column: string; value: unknown };
type QueryError = { message: string };
type ManyResult = { data: Row[]; error: QueryError | null };

const TABLE_COLUMNS: Record<string, ReadonlySet<string>> = {
  versions: new Set([
    "id",
    "asset_id",
    "version_number",
    "file_url",
    "file_size",
    "notes",
    "uploaded_by",
    "is_current",
    "thumbnail_url",
    "duration_seconds",
    "resolution",
    "created_at",
    "updated_at",
  ]),
  annotations: new Set([
    "id",
    "comment_id",
    "asset_id",
    "version_id",
    "type",
    "data",
    "frame_number",
    "created_by",
    "created_at",
  ]),
};

class FakeQuery {
  private readonly database: FakeSupabase;
  private readonly table: string;
  private readonly filters: Filter[] = [];
  private columns: string[] = [];

  constructor(database: FakeSupabase, table: string) {
    this.database = database;
    this.table = table;
  }

  select(columns: string) {
    this.columns = columns.split(",").map((column) => column.trim());
    this.database.selections.push({ table: this.table, columns: [...this.columns] });
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value });
    return this;
  }

  async maybeSingle() {
    const result = this.execute();
    return {
      data: result.data[0] ?? null,
      error: result.error,
    };
  }

  then<TResult1 = ManyResult, TResult2 = never>(
    onfulfilled?: ((value: ManyResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private execute(): ManyResult {
    this.database.executions.push({
      table: this.table,
      columns: [...this.columns],
      filters: [...this.filters],
    });

    const knownColumns = TABLE_COLUMNS[this.table];
    const unknownColumn = this.columns.find((column) => !knownColumns?.has(column));
    if (unknownColumn) {
      return {
        data: [],
        error: { message: `column ${this.table}.${unknownColumn} does not exist` },
      };
    }

    const rows = (this.database.tables[this.table] ?? []).filter((row) =>
      this.filters.every(({ column, value }) => row[column] === value),
    );
    return {
      data: rows.map((row) =>
        Object.fromEntries(this.columns.map((column) => [column, row[column]])),
      ),
      error: null,
    };
  }
}

class FakeSupabase {
  readonly selections: Array<{ table: string; columns: string[] }> = [];
  readonly executions: Array<{
    table: string;
    columns: string[];
    filters: Filter[];
  }> = [];
  readonly tables: Record<string, Row[]>;

  constructor(tables: Record<string, Row[]>) {
    this.tables = tables;
  }

  from(table: string) {
    return new FakeQuery(this, table);
  }
}

type VersionCompareTestState = typeof globalThis & {
  __ccoVersionCompareUser?: { id: string } | null;
  __ccoVersionCompareSupabase?: FakeSupabase;
  __ccoVersionCompareAccessByAsset: Record<
    string,
    { ok: true; data: { id: string } } | { ok: false; status: number; error: string }
  >;
  __ccoVersionCompareAccessCalls: Array<{
    assetId: string;
    userId: string;
    minimumRole: string;
    usedAuthenticatedClient: boolean;
  }>;
};

const state = globalThis as VersionCompareTestState;

function version(id: string, assetId: string, versionNumber: number): Row {
  return {
    id,
    asset_id: assetId,
    version_number: versionNumber,
    file_url: `https://media.example.test/${id}.mp4`,
    file_size: 1024,
    notes: null,
    uploaded_by: "uploader-a",
    is_current: versionNumber === 2,
    thumbnail_url: null,
    duration_seconds: 30,
    resolution: "1920x1080",
    created_at: "2026-07-15T10:00:00.000Z",
    updated_at: "2026-07-15T10:00:00.000Z",
  };
}

function annotation(id: string, assetId: string, versionId: string, data: Row): Row {
  return {
    id,
    comment_id: `comment-${id}`,
    asset_id: assetId,
    version_id: versionId,
    type: data.kind,
    data,
    frame_number: 42,
    created_by: "reviewer-a",
    created_at: "2026-07-15T10:01:00.000Z",
  };
}

function configure({
  versions = [version("version-a", "asset-a", 1), version("version-b", "asset-a", 2)],
  annotations = [],
}: {
  versions?: Row[];
  annotations?: Row[];
} = {}) {
  state.__ccoVersionCompareUser = { id: "user-a" };
  state.__ccoVersionCompareAccessByAsset = {};
  state.__ccoVersionCompareAccessCalls = [];
  state.__ccoVersionCompareSupabase = new FakeSupabase({ versions, annotations });
}

async function routeModule() {
  return import(
    pathToFileURL(resolve(repositoryRoot, "app/api/versions/compare/route.ts")).href
  );
}

function request(versionAId = "version-a", versionBId = "version-b") {
  const url = new URL("https://admin.contentco-op.com/api/versions/compare");
  url.searchParams.set("a", versionAId);
  url.searchParams.set("b", versionBId);
  return new Request(url);
}

test.beforeEach(() => configure());

test("comparison reads and returns only canonical annotation columns", async () => {
  const data = {
    kind: "pin",
    x: 0.25,
    y: 0.75,
    color: "#2563eb",
    start_time: 1.5,
    end_time: 2.5,
  };
  configure({
    annotations: [
      annotation("annotation-a", "asset-a", "version-a", data),
      annotation("annotation-b", "asset-a", "version-b", {
        kind: "rectangle",
        x: 1,
        y: 2,
        width: 3,
        height: 4,
      }),
    ],
  });
  const { GET } = await routeModule();

  const response = await GET(request());

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.versionA.annotations[0], {
    id: "annotation-a",
    comment_id: "comment-annotation-a",
    asset_id: "asset-a",
    version_id: "version-a",
    type: "pin",
    data,
    frame_number: 42,
    created_by: "reviewer-a",
    created_at: "2026-07-15T10:01:00.000Z",
  });

  const database = state.__ccoVersionCompareSupabase;
  const annotationSelections = database?.selections.filter(
    (selection) => selection.table === "annotations",
  );
  assert.equal(annotationSelections?.length, 2);
  for (const selection of annotationSelections ?? []) {
    assert.deepEqual(selection.columns, [
      "id",
      "comment_id",
      "asset_id",
      "version_id",
      "type",
      "data",
      "frame_number",
      "created_by",
      "created_at",
    ]);
  }

  const annotationExecutions = database?.executions.filter(
    (execution) => execution.table === "annotations",
  );
  assert.deepEqual(
    annotationExecutions?.map((execution) => execution.filters),
    [
      [
        { column: "version_id", value: "version-a" },
        { column: "asset_id", value: "asset-a" },
      ],
      [
        { column: "version_id", value: "version-b" },
        { column: "asset_id", value: "asset-a" },
      ],
    ],
  );
  assert.deepEqual(state.__ccoVersionCompareAccessCalls, [
    {
      assetId: "asset-a",
      userId: "user-a",
      minimumRole: "viewer",
      usedAuthenticatedClient: true,
    },
    {
      assetId: "asset-a",
      userId: "user-a",
      minimumRole: "viewer",
      usedAuthenticatedClient: true,
    },
  ]);
});

test("cross-asset comparison is rejected before annotations are exposed", async () => {
  configure({
    versions: [
      version("version-a", "asset-a", 1),
      version("version-b", "asset-b", 1),
    ],
    annotations: [
      annotation("annotation-a", "asset-a", "version-a", {
        kind: "pin",
        x: 1,
        y: 1,
      }),
      annotation("annotation-b", "asset-b", "version-b", {
        kind: "pin",
        x: 2,
        y: 2,
      }),
    ],
  });
  const { GET } = await routeModule();

  const response = await GET(request());

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Version not found" });
  assert.equal(
    state.__ccoVersionCompareSupabase?.executions.some(
      (execution) => execution.table === "annotations",
    ),
    false,
  );
});

test("asset access failures keep the same generic not-found response", async () => {
  const { GET } = await routeModule();
  state.__ccoVersionCompareAccessByAsset["asset-a"] = {
    ok: false,
    status: 403,
    error: "private access detail",
  };

  const response = await GET(request());

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Version not found" });
  assert.equal(
    state.__ccoVersionCompareSupabase?.executions.some(
      (execution) => execution.table === "annotations",
    ),
    false,
  );
});
