import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Shared tenant-security harness for API route tests.
 *
 * Extracted from tests/asset-tag-bulk-tenant-security.test.ts: module hooks
 * stub `@/lib/auth` (per-test user), `@/lib/access-control` (recorded access
 * calls), and `@/lib/supabase` (in-memory FakeSupabase recording every read
 * and write, including filters). Other `@/` imports resolve to the real
 * files so routes can exercise pure validators like lib/covideopro/transitions.
 *
 * Hooks must be registered before any route module is imported; importing
 * this helper at the top of a test file does that.
 */

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const authStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function requireAuth() {
    return globalThis.__ccoTenantRouteUser ?? null;
  }
`)}`;

const accessStubUrl = `data:text/javascript,${encodeURIComponent(`
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

export type Row = Record<string, unknown>;
export type Filter =
  | { operator: "eq"; column: string; value: unknown }
  | { operator: "in"; column: string; value: unknown[] };
export type Operation = "select" | "insert" | "upsert" | "update" | "delete";

export interface RecordedRead {
  table: string;
  columns: string;
  filters: Filter[];
}

export interface RecordedWrite {
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

export class FakeSupabase {
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

export type AccessResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; status: number; error: string };

export interface AccessCall {
  assetId?: string;
  client: FakeSupabase;
  minimumRole: string;
  projectId?: string;
  userId: string;
}

export type TenantTestGlobal = typeof globalThis & {
  __ccoTenantAssetAccess: (call: AccessCall) => AccessResult;
  __ccoTenantAssetAccessCalls: AccessCall[];
  __ccoTenantProjectAccess: (call: AccessCall) => AccessResult;
  __ccoTenantProjectAccessCalls: AccessCall[];
  __ccoTenantRouteUser: { id: string; email: string } | null;
  __ccoTenantSupabase: FakeSupabase;
};

export const tenantState = globalThis as TenantTestGlobal;

/**
 * Installs a fresh FakeSupabase and signs in user-a. Tests switch identity by
 * reassigning `tenantState.__ccoTenantRouteUser`.
 */
export function configureTenantHarness(tables: Record<string, Row[]> = {}) {
  const supabase = new FakeSupabase(tables);
  tenantState.__ccoTenantRouteUser = {
    id: "user-a",
    email: "user-a@example.test",
  };
  tenantState.__ccoTenantSupabase = supabase;
  tenantState.__ccoTenantProjectAccessCalls = [];
  tenantState.__ccoTenantAssetAccessCalls = [];
  tenantState.__ccoTenantProjectAccess = ({ projectId }) => ({
    ok: true,
    data: {
      id: projectId,
      project_id: projectId,
      access_role: "editor",
      access_rank: 60,
    },
  });
  tenantState.__ccoTenantAssetAccess = ({ assetId }) => {
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

/** Dynamically imports an API route module after the hooks are in place. */
export function importApiRoute(pathFromRepositoryRoot: string) {
  return import(
    pathToFileURL(resolve(repositoryRoot, pathFromRepositoryRoot)).href
  );
}
