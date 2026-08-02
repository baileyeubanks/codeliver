import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT_A = "11111111-1111-4111-8111-111111111111";
const PROJECT_B = "22222222-2222-4222-8222-222222222222";

const authStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function requireAuthWithClient() {
    const state = globalThis.__analyticsRlsClientBoundaryState;
    state.authCalls++;
    return { user: state.user, supabase: state.client };
  }
`)}`;

const accessStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function getProjectAccess(projectId, userId, minimumRole, client) {
    const state = globalThis.__analyticsRlsClientBoundaryState;
    state.accessCalls.push({ projectId, userId, minimumRole, client });
    if (state.accessResult) return state.accessResult;
    const project = state.rows.projects.find((row) => row.id === projectId);
    return project
      ? {
          ok: true,
          data: {
            id: project.id,
            name: project.name,
            owner_id: userId,
            team_id: null,
            access_role: "owner",
            access_rank: 100,
          },
        }
      : { ok: false, status: 404, error: "Project not found" };
  }
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
    return nextResolve(specifier, context);
  },
});

type Row = Record<string, unknown>;
type Filter =
  | { kind: "eq"; column: string; value: unknown }
  | { kind: "in"; column: string; values: unknown[] }
  | { kind: "gte"; column: string; value: unknown }
  | { kind: "neq"; column: string; value: unknown };

type QueryRecord = {
  client: FakeSupabase;
  table: string;
  select: string | null;
  filters: Filter[];
  limit: number | null;
};

type QueryResult = {
  data: Row[] | null;
  error: { message: string } | null;
};

type AccessResult =
  | { ok: true; data: Row }
  | { ok: false; status: number; error: string };

type AccessCall = {
  projectId: string;
  userId: string;
  minimumRole: string;
  client: unknown;
};

interface BoundaryState {
  user: { id: string; email: string } | null;
  authCalls: number;
  accessCalls: AccessCall[];
  accessResult: AccessResult | null;
  rows: Record<string, Row[]>;
  failures: Record<string, string>;
  queries: QueryRecord[];
  client: FakeSupabase;
}

class FakeQuery implements PromiseLike<QueryResult> {
  private readonly client: FakeSupabase;
  private readonly state: BoundaryState;
  private readonly table: string;
  private readonly filters: Filter[] = [];
  private selectedColumns: string | null = null;
  private rowLimit: number | null = null;
  private sort: { column: string; ascending: boolean; nullsFirst: boolean } | null =
    null;

  constructor(client: FakeSupabase, state: BoundaryState, table: string) {
    this.client = client;
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

  gte(column: string, value: unknown) {
    this.filters.push({ kind: "gte", column, value });
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push({ kind: "neq", column, value });
    return this;
  }

  order(
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean },
  ) {
    this.sort = {
      column,
      ascending: options?.ascending !== false,
      nullsFirst: options?.nullsFirst === true,
    };
    return this;
  }

  limit(value: number) {
    this.rowLimit = value;
    return this;
  }

  async maybeSingle() {
    const result = await this.execute();
    return { data: result.data?.[0] ?? null, error: result.error };
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
    return this.filters.every((filter) => {
      const value = row[filter.column];
      if (filter.kind === "eq") return value === filter.value;
      if (filter.kind === "in") return filter.values.includes(value);
      if (filter.kind === "neq") return value !== filter.value;
      return String(value ?? "") >= String(filter.value ?? "");
    });
  }

  private async execute(): Promise<QueryResult> {
    this.state.queries.push({
      client: this.client,
      table: this.table,
      select: this.selectedColumns,
      filters: this.filters.map(cloneFilter),
      limit: this.rowLimit,
    });

    const failure = this.state.failures[this.table];
    if (failure) return { data: null, error: { message: failure } };

    let rows = (this.state.rows[this.table] ?? [])
      .filter((row) => this.matches(row))
      .map((row) => ({ ...row }));
    if (this.sort) {
      const { column, ascending, nullsFirst } = this.sort;
      rows.sort((left, right) => {
        const leftValue = left[column];
        const rightValue = right[column];
        if (leftValue == null || rightValue == null) {
          if (leftValue == null && rightValue == null) return 0;
          const nullComparison = leftValue == null ? -1 : 1;
          return nullsFirst ? nullComparison : -nullComparison;
        }
        const comparison = String(leftValue).localeCompare(String(rightValue));
        return ascending ? comparison : -comparison;
      });
    }
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
}

function cloneFilter(filter: Filter): Filter {
  return filter.kind === "in"
    ? { ...filter, values: [...filter.values] }
    : { ...filter };
}

const state: BoundaryState = {
  user: null,
  authCalls: 0,
  accessCalls: [],
  accessResult: null,
  rows: {},
  failures: {},
  queries: [],
  client: undefined as unknown as FakeSupabase,
};

(globalThis as typeof globalThis & {
  __analyticsRlsClientBoundaryState: BoundaryState;
}).__analyticsRlsClientBoundaryState = state;

function resetState() {
  const now = new Date().toISOString();
  state.user = { id: "user-a", email: "user-a@example.test" };
  state.authCalls = 0;
  state.accessCalls = [];
  state.accessResult = null;
  state.failures = {};
  state.queries = [];
  state.rows = {
    projects: [
      { id: PROJECT_A, name: "Tenant A", description: "Tenant A report" },
      {
        id: PROJECT_B,
        name: "Other tenant secret",
        description: "Other tenant private description",
      },
    ],
    assets: [
      {
        id: "asset-a",
        project_id: PROJECT_A,
        title: "Tenant A <script>alert(1)</script>",
        status: "in_review",
        file_type: "video/mp4",
        created_at: now,
        duration_seconds: 30,
      },
      {
        id: "asset-b",
        project_id: PROJECT_B,
        title: "OTHER TENANT ASSET SECRET",
        status: "in_review",
        file_type: "video/mp4",
        created_at: now,
        duration_seconds: 45,
      },
    ],
    comments: [
      {
        id: "comment-a",
        asset_id: "asset-a",
        author_name: "Reviewer A",
        author_email: "reviewer-a@example.test",
        body: "Tenant A <b>comment</b>",
        status: "open",
        timecode_seconds: 4,
        pin_x: null,
        pin_y: null,
        created_at: now,
      },
      {
        id: "comment-b",
        asset_id: "asset-b",
        author_name: "Other Reviewer",
        author_email: "other@example.test",
        body: "OTHER TENANT COMMENT SECRET",
        status: "open",
        timecode_seconds: 8,
        pin_x: null,
        pin_y: null,
        created_at: now,
      },
    ],
    approvals: [
      {
        id: "approval-a",
        asset_id: "asset-a",
        assignee_email: "reviewer-a@example.test",
        role_label: "Client",
        status: "approved",
        decided_at: now,
        created_at: now,
      },
      {
        id: "approval-b",
        asset_id: "asset-b",
        assignee_email: "other@example.test",
        role_label: "Other tenant",
        status: "approved",
        decided_at: now,
        created_at: now,
      },
    ],
  };
  state.client = new FakeSupabase(state);
}

function source(path: string) {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

async function loadRoutes() {
  const project = await import(
    pathToFileURL(resolve(repositoryRoot, "app/api/analytics/project/route.ts"))
      .href
  );
  const dataExport = await import(
    pathToFileURL(resolve(repositoryRoot, "app/api/analytics/export/route.ts"))
      .href
  );
  const pdf = await import(
    pathToFileURL(
      resolve(repositoryRoot, "app/api/analytics/export/pdf/route.ts"),
    ).href
  );
  return { project, dataExport, pdf };
}

function request(path: string) {
  return new Request(new URL(path, "https://deliver.contentco-op.com"));
}

function hasEq(query: QueryRecord, column: string, value: unknown) {
  return query.filters.some(
    (filter) =>
      filter.kind === "eq" &&
      filter.column === column &&
      filter.value === value,
  );
}

function inValues(query: QueryRecord, column: string) {
  return query.filters.find(
    (filter): filter is Extract<Filter, { kind: "in" }> =>
      filter.kind === "in" && filter.column === column,
  )?.values;
}

function assertOwnerAccess() {
  assert.equal(state.accessCalls.length, 1);
  assert.deepEqual(
    {
      projectId: state.accessCalls[0].projectId,
      userId: state.accessCalls[0].userId,
      minimumRole: state.accessCalls[0].minimumRole,
    },
    { projectId: PROJECT_A, userId: "user-a", minimumRole: "owner" },
  );
  assert.equal(state.accessCalls[0].client, state.client);
}

function assertBoundedQueries() {
  for (const query of state.queries) {
    assert.equal(query.client, state.client);
    if (query.table !== "projects") {
      assert.ok(
        query.limit !== null && Number.isSafeInteger(query.limit),
        `${query.table} query must have a finite row limit`,
      );
    }
  }
}

test.beforeEach(resetState);

test("analytics routes have no service-client fallback", () => {
  const routes = [
    source("app/api/analytics/project/route.ts"),
    source("app/api/analytics/export/route.ts"),
    source("app/api/analytics/export/pdf/route.ts"),
  ];

  for (const route of routes) {
    assert.match(route, /requireAuthWithClient/);
    assert.doesNotMatch(route, /from ["']@\/lib\/supabase["']/);
    assert.doesNotMatch(route, /getSupabase\s*\(/);
    assert.doesNotMatch(route, /requireAuth\s*\(/);
  }
});

test("project analytics use the authenticated client and project asset set", async () => {
  const { project } = await loadRoutes();
  const response = await project.GET(
    request(`/api/analytics/project?project_id=${PROJECT_A}`),
  );

  assert.equal(response.status, 200);
  assertOwnerAccess();
  assert.deepEqual(
    { ...(await response.json()), comments_per_day: undefined },
    {
      total_assets: 1,
      active_reviews: 1,
      comments_this_week: 1,
      avg_approval_hours: 0,
      comments_per_day: undefined,
      decisions: { approved: 1 },
    },
  );

  const assetQuery = state.queries.find((query) => query.table === "assets");
  const commentQuery = state.queries.find((query) => query.table === "comments");
  const approvalQuery = state.queries.find(
    (query) => query.table === "approvals",
  );
  assert.ok(assetQuery && commentQuery && approvalQuery);
  assert.equal(hasEq(assetQuery, "project_id", PROJECT_A), true);
  assert.deepEqual(inValues(commentQuery, "asset_id"), ["asset-a"]);
  assert.deepEqual(inValues(approvalQuery, "asset_id"), ["asset-a"]);
  assertBoundedQueries();
});

test("JSON export excludes every other-tenant row", async () => {
  const { dataExport } = await loadRoutes();
  const response = await dataExport.GET(
    request(`/api/analytics/export?project_id=${PROJECT_A}&format=json`),
  );

  assert.equal(response.status, 200);
  assertOwnerAccess();
  const body = await response.text();
  assert.match(body, /asset-a/);
  assert.match(body, /comment-a/);
  assert.match(body, /approval-a/);
  assert.doesNotMatch(body, /asset-b|comment-b|approval-b|OTHER TENANT/);

  const assetQuery = state.queries.find((query) => query.table === "assets");
  const commentQuery = state.queries.find((query) => query.table === "comments");
  const approvalQuery = state.queries.find(
    (query) => query.table === "approvals",
  );
  assert.ok(assetQuery && commentQuery && approvalQuery);
  assert.equal(hasEq(assetQuery, "project_id", PROJECT_A), true);
  assert.deepEqual(inValues(commentQuery, "asset_id"), ["asset-a"]);
  assert.deepEqual(inValues(approvalQuery, "asset_id"), ["asset-a"]);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assertBoundedQueries();
});

test("PDF export stays project-scoped and escapes tenant content", async () => {
  const { pdf } = await loadRoutes();
  const response = await pdf.GET(
    request(`/api/analytics/export/pdf?project_id=${PROJECT_A}`),
  );

  assert.equal(response.status, 200);
  assertOwnerAccess();
  const body = await response.text();
  assert.match(body, /Tenant A &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(body, /Tenant A &lt;b&gt;comment&lt;\/b&gt;/);
  assert.match(body, /\/fonts\/inter-latin\.woff2/);
  assert.doesNotMatch(body, /fonts\.googleapis\.com/);
  assert.equal(response.headers.get("content-security-policy"),
    "default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; script-src 'unsafe-inline'",
  );
  assert.doesNotMatch(body, /OTHER TENANT|Other tenant private description/);
  assert.doesNotMatch(body, /<script>alert\(1\)<\/script>/);

  const projectQuery = state.queries.find(
    (query) => query.table === "projects",
  );
  const assetQuery = state.queries.find((query) => query.table === "assets");
  const commentQuery = state.queries.find((query) => query.table === "comments");
  assert.ok(projectQuery && assetQuery && commentQuery);
  assert.equal(hasEq(projectQuery, "id", PROJECT_A), true);
  assert.equal(hasEq(assetQuery, "project_id", PROJECT_A), true);
  assert.deepEqual(inValues(commentQuery, "asset_id"), ["asset-a"]);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assertBoundedQueries();
});

test("invalid IDs and ambiguous request parameters fail before access", async () => {
  const routes = await loadRoutes();
  const cases = [
    () => routes.project.GET(request("/api/analytics/project?project_id=nope")),
    () =>
      routes.project.GET(
        request(
          `/api/analytics/project?project_id=${PROJECT_A}&type=reviewers&type=aggregate`,
        ),
      ),
    () =>
      routes.dataExport.GET(
        request(`/api/analytics/export?project_id=${PROJECT_A}&format=xml`),
      ),
    () =>
      routes.dataExport.GET(
        request(
          `/api/analytics/export?project_id=${PROJECT_A}&format=csv&extra=1`,
        ),
      ),
    () =>
      routes.pdf.GET(
        request(
          `/api/analytics/export/pdf?project_id=${PROJECT_A}&project_id=${PROJECT_B}`,
        ),
      ),
    () =>
      routes.pdf.GET(
        request(
          `/api/analytics/export/pdf?project_id=${PROJECT_A}&padding=${"x".repeat(2_100)}`,
        ),
      ),
  ];

  for (const invoke of cases) {
    resetState();
    const response = await invoke();
    assert.equal(response.status, 400);
    assert.deepEqual(state.accessCalls, []);
    assert.deepEqual(state.queries, []);
  }
});

test("access and query failures never expose backend details", async () => {
  const routes = await loadRoutes();
  const routeCases = [
    {
      invoke: () =>
        routes.project.GET(
          request(`/api/analytics/project?project_id=${PROJECT_A}`),
        ),
      failingTable: "assets",
    },
    {
      invoke: () =>
        routes.dataExport.GET(
          request(`/api/analytics/export?project_id=${PROJECT_A}&format=json`),
        ),
      failingTable: "assets",
    },
    {
      invoke: () =>
        routes.pdf.GET(
          request(`/api/analytics/export/pdf?project_id=${PROJECT_A}`),
        ),
      failingTable: "projects",
    },
  ];

  for (const routeCase of routeCases) {
    resetState();
    state.accessResult = {
      ok: false,
      status: 500,
      error: "secret database relation analytics_private failed",
    };
    const accessFailure = await routeCase.invoke();
    assert.equal(accessFailure.status, 503);
    assert.doesNotMatch(await accessFailure.text(), /secret|relation|private/i);
    assert.deepEqual(state.queries, []);

    resetState();
    state.failures[routeCase.failingTable] =
      "secret database relation analytics_private failed";
    const queryFailure = await routeCase.invoke();
    assert.equal(queryFailure.status, 503);
    assert.doesNotMatch(await queryFailure.text(), /secret|relation|private/i);
  }
});

test("unauthenticated requests stop before authorization or data access", async () => {
  const routes = await loadRoutes();
  const cases = [
    () =>
      routes.project.GET(
        request(`/api/analytics/project?project_id=${PROJECT_A}`),
      ),
    () =>
      routes.dataExport.GET(
        request(`/api/analytics/export?project_id=${PROJECT_A}`),
      ),
    () =>
      routes.pdf.GET(
        request(`/api/analytics/export/pdf?project_id=${PROJECT_A}`),
      ),
  ];

  for (const invoke of cases) {
    resetState();
    state.user = null;
    const response = await invoke();
    assert.equal(response.status, 401);
    assert.deepEqual(state.accessCalls, []);
    assert.deepEqual(state.queries, []);
  }
});
