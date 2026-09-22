import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { NextRequest } from "next/server.js";

import type { UploadSession } from "../lib/tus/session.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const authStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function requireAuth() {
    return globalThis.__ccoLockGuardUser ?? null;
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
    return globalThis.__ccoLockGuardProjectAccess({ projectId, userId, minimumRole, client });
  }

  export async function getAssetAccess(assetId, userId, minimumRole, client) {
    return globalThis.__ccoLockGuardAssetAccess({ assetId, userId, minimumRole, client });
  }
`)}`;

const supabaseStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function getSupabase() {
    if (!globalThis.__ccoLockGuardSupabase) {
      throw new Error("Lock guard test client was not installed");
    }
    return globalThis.__ccoLockGuardSupabase;
  }
`)}`;

const dataAuthorityStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function getSupabaseDataSchema() {
    return "co_production";
  }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/auth") return nextResolve(authStubUrl, context);
    if (specifier === "@/lib/access-control") return nextResolve(accessStubUrl, context);
    if (specifier === "@/lib/supabase") return nextResolve(supabaseStubUrl, context);
    if (specifier === "@/lib/data-authority") return nextResolve(dataAuthorityStubUrl, context);
    if (specifier.endsWith("asset-route-boundary")) {
      return nextResolve(`${specifier}.ts`, context);
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
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (
        (specifier.startsWith("./") || specifier.startsWith("../")) &&
        !extname(specifier)
      ) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
});

type Row = Record<string, unknown>;
type Filter =
  | { operator: "eq"; column: string; value: unknown }
  | { operator: "in"; column: string; value: unknown[] }
  | { operator: "not"; column: string; value: unknown };

class FakeQuery {
  private selectRequested = false;
  private readonly database: FakeSupabase;
  private readonly filters: Filter[] = [];
  private operation: "select" | "update" | "insert" | "delete" = "select";
  private payload: unknown;
  private readonly table: string;

  constructor(database: FakeSupabase, table: string) {
    this.database = database;
    this.table = table;
  }

  select(_columns = "*") {
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

  not(column: string, _operator: string, value: unknown) {
    this.filters.push({ operator: "not", column, value });
    return this;
  }

  insert(payload: unknown) {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }

  upsert(payload: unknown) {
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

  async limit(count: number) {
    const result = await this.execute(false);
    if (Array.isArray(result.data)) result.data = result.data.slice(0, count);
    return result;
  }

  async maybeSingle() {
    return this.execute(true);
  }

  async single() {
    return this.execute(true);
  }

  async order() {
    return this.execute(false);
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute(false).then(onfulfilled, onrejected);
  }

  /** Resolves a dotted join column like "deliverables.locked_at" against the
   * parent row the fake already holds. */
  private joinedValue(column: string, row: Row): unknown {
    const [relation, field] = column.split(".");
    if (relation === "deliverables") {
      const parent = (this.database.tables.deliverables ?? []).find(
        (candidate) => candidate.id === row.deliverable_id,
      );
      return parent?.[field];
    }
    return undefined;
  }

  private matchingRows() {
    return (this.database.tables[this.table] ?? []).filter((row) =>
      this.filters.every((filter) => {
        if (filter.operator === "eq") return row[filter.column] === filter.value;
        if (filter.operator === "in") return filter.value.includes(row[filter.column]);
        const actual = filter.column.includes(".")
          ? this.joinedValue(filter.column, row)
          : row[filter.column];
        return filter.value === null ? actual != null : actual !== filter.value;
      }),
    );
  }

  private async execute(single: boolean) {
    const errorMessage = this.database.errors[`${this.table}:${this.operation}`];
    if (errorMessage) return { data: null, error: { message: errorMessage } };

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
      const data = rows.map((row) => ({ ...row }));
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

interface RpcCall {
  name: string;
  args: Record<string, unknown>;
}

class FakeSupabase {
  readonly errors: Record<string, string>;
  readonly rpcCalls: RpcCall[] = [];
  rpcResult: { data: unknown; error: { code?: string; message: string } | null } = {
    data: null,
    error: null,
  };
  readonly tables: Record<string, Row[]>;
  readonly writes: Array<Record<string, unknown>> = [];

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

  async rpc(name: string, args: Record<string, unknown>) {
    this.rpcCalls.push({ name, args });
    return this.rpcResult;
  }
}

type AccessResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; status: number; error: string };

type LockGuardTestGlobal = typeof globalThis & {
  __ccoLockGuardAssetAccess: (call: Record<string, unknown>) => AccessResult;
  __ccoLockGuardProjectAccess: (call: Record<string, unknown>) => AccessResult;
  __ccoLockGuardSupabase: FakeSupabase;
  __ccoLockGuardUser: { id: string; email: string } | null;
};

const state = globalThis as LockGuardTestGlobal;

const projectA = "project-a";
const assetA = "asset-a";
const versionA = "version-a";
const deliverableId = "deliverable-a";

function configure(tables: Record<string, Row[]> = {}) {
  const supabase = new FakeSupabase(tables);
  state.__ccoLockGuardUser = { id: "user-a", email: "user-a@example.test" };
  state.__ccoLockGuardSupabase = supabase;
  state.__ccoLockGuardProjectAccess = ({ projectId }) => ({
    ok: true,
    data: { id: projectId, access_role: "editor", access_rank: 60 },
  });
  state.__ccoLockGuardAssetAccess = ({ assetId }) => {
    const asset = supabase.tables.assets?.find((row) => row.id === assetId);
    return asset
      ? { ok: true, data: { ...asset, access_role: "admin", access_rank: 80 } }
      : { ok: false, status: 404, error: "Asset not found" };
  };
  return supabase;
}

function lockedDeliveryTables() {
  return {
    assets: [{ id: assetA, project_id: projectA, title: "Master", status: "approved" }],
    deliverables: [
      {
        id: deliverableId,
        project_id: projectA,
        status: "delivered",
        locked_at: "2026-08-11T12:00:00.000Z",
      },
    ],
    deliverable_items: [
      { id: "item-1", deliverable_id: deliverableId, asset_id: assetA, version_id: versionA },
    ],
  };
}

function unlockedDeliveryTables() {
  return {
    assets: [{ id: assetA, project_id: projectA, title: "Master", status: "in_review" }],
    deliverables: [
      { id: deliverableId, project_id: projectA, status: "ready", locked_at: null },
    ],
    deliverable_items: [
      { id: "item-1", deliverable_id: deliverableId, asset_id: assetA, version_id: versionA },
    ],
  };
}

async function lockModule() {
  return import(pathToFileURL(resolve(repositoryRoot, "lib/delivery/lock.ts")).href);
}

async function sharedUploadModule() {
  return import(
    pathToFileURL(resolve(repositoryRoot, "app/api/upload/_shared.ts")).href
  );
}

async function assetDetailRoute() {
  return import(
    pathToFileURL(resolve(repositoryRoot, "app/api/assets/[id]/route.ts")).href
  );
}

function jsonRequest(path: string, method: "PATCH" | "DELETE", body?: unknown) {
  return new NextRequest(`https://admin.contentco-op.com${path}`, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

/* ── assertAssetNotLocked ──────────────────────────────────────────────── */

test("assertAssetNotLocked resolves when the asset has no locked delivery", async () => {
  const supabase = configure(unlockedDeliveryTables());
  const { assertAssetNotLocked } = await lockModule();

  await assertAssetNotLocked(assetA, supabase as never);
});

test("assertAssetNotLocked rejects an asset bound into a locked delivery", async () => {
  const supabase = configure(lockedDeliveryTables());
  const { assertAssetNotLocked, isAssetDeliveryLockedError } = await lockModule();

  await assert.rejects(
    () => assertAssetNotLocked(assetA, supabase as never),
    (error) => {
      assert.ok(isAssetDeliveryLockedError(error));
      assert.equal((error as { code: string }).code, "ASSET_LOCKED");
      return true;
    },
  );
});

/* ── upload chokepoint guard ───────────────────────────────────────────── */

function committedSession(assetId: string | null): UploadSession {
  const sha256 = "a".repeat(64);
  const objectKey = "tenants/tenant-a/projects/project-a/objects/upload-a/v1/master.mov";
  return {
    schemaVersion: 1,
    id: "11111111-1111-4111-8111-111111111111",
    tenantKey: "a".repeat(32),
    projectId: projectA,
    folderId: null,
    idempotencyKeyHash: "b".repeat(64),
    filename: "master.mov",
    mimeType: "video/quicktime",
    size: 7,
    offset: 7,
    version: 1,
    provider: "local",
    providerHandle: { provider: "local", uploadId: "up", opaqueId: "up.part" },
    state: "committed",
    expectedSha256: null,
    computedSha256: sha256,
    objectKey,
    receipt: {
      provider: "local",
      objectKey,
      size: 7,
      sha256,
      providerVersionId: "fs-v1:" + "c".repeat(64),
      committedAt: "2026-08-12T06:00:00.000Z",
    },
    scan: {
      verdict: "clean",
      engine: "test-scanner",
      signature: null,
      detail: "clean",
      scannedAt: "2026-08-12T06:00:00.000Z",
    },
    partCount: 1,
    lastPartSha256: sha256,
    assetId,
    versionId: null,
    catalog: { state: "pending", attempts: 0, lastError: null, updatedAt: "2026-08-12T06:00:00.000Z" },
    derivatives: { state: "blocked", attempts: 0, lastError: "No derivative worker", updatedAt: "2026-08-12T06:00:00.000Z" },
    recovery: { attempts: 0, lastAction: "none", lastRecoveredAt: null },
    legalHold: false,
    revision: 1,
    createdAt: "2026-08-12T06:00:00.000Z",
    updatedAt: "2026-08-12T06:00:00.000Z",
    expiresAt: "2026-08-13T06:00:00.000Z",
    lastError: null,
  };
}

function passthroughOrchestrator(session: UploadSession) {
  return {
    async reconcileCatalog(
      _uploadId: string,
      _tenantId: string,
      reconcile: (current: UploadSession) => Promise<Record<string, unknown>>,
    ) {
      return reconcile(session);
    },
  };
}

test("a committed upload cannot attach a new version to a locked asset", async () => {
  const supabase = configure(lockedDeliveryTables());
  const session = committedSession(assetA);
  const { ensureCatalogAsset, mapUploadError } = await sharedUploadModule();

  await assert.rejects(
    () => ensureCatalogAsset(passthroughOrchestrator(session) as never, session, "user-a"),
    (error) => {
      const mapped = mapUploadError(error);
      assert.equal(mapped.status, 409);
      assert.equal(mapped.code, "UPLOAD_CONFLICT");
      return true;
    },
  );
  assert.equal(supabase.rpcCalls.length, 0);
});

test("a committed upload still attaches when the asset is not locked", async () => {
  const supabase = configure(unlockedDeliveryTables());
  const versionId = "55555555-5555-4555-8555-555555555555";
  supabase.rpcResult = {
    data: [{
      id: assetA,
      version_id: versionId,
      version_number: 1,
      file_url: `/api/media/versions/${versionId}`,
    }],
    error: null,
  };
  const session = committedSession(assetA);
  const { ensureCatalogAsset } = await sharedUploadModule();

  const record = await ensureCatalogAsset(
    passthroughOrchestrator(session) as never,
    session,
    "user-a",
  );

  assert.equal(record?.version_id, versionId);
  assert.equal(supabase.rpcCalls[0]?.name, "attach_committed_upload_v1");
});

/* ── asset PATCH/DELETE guards ─────────────────────────────────────────── */

test("PATCH on an asset in a locked delivery is rejected with 409 and no writes", async () => {
  const supabase = configure(lockedDeliveryTables());
  const { PATCH } = await assetDetailRoute();

  const response = await PATCH(
    jsonRequest(`/api/assets/${assetA}`, "PATCH", { title: "Retitled" }),
    { params: Promise.resolve({ id: assetA }) },
  );

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: "Asset is part of a locked delivery",
    code: "ASSET_LOCKED",
  });
  assert.equal(supabase.writes.length, 0);
  assert.equal(supabase.tables.assets[0]?.title, "Master");
});

test("PATCH on an unlocked asset still applies", async () => {
  const supabase = configure(unlockedDeliveryTables());
  const { PATCH } = await assetDetailRoute();

  const response = await PATCH(
    jsonRequest(`/api/assets/${assetA}`, "PATCH", { title: "Retitled" }),
    { params: Promise.resolve({ id: assetA }) },
  );

  assert.equal(response.status, 200);
  assert.equal(supabase.tables.assets[0]?.title, "Retitled");
});

test("DELETE on an asset in a locked delivery is rejected with 409 and no writes", async () => {
  const supabase = configure(lockedDeliveryTables());
  const { DELETE } = await assetDetailRoute();

  const response = await DELETE(
    jsonRequest(`/api/assets/${assetA}`, "DELETE"),
    { params: Promise.resolve({ id: assetA }) },
  );

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: "Asset is part of a locked delivery",
    code: "ASSET_LOCKED",
  });
  assert.equal(supabase.writes.length, 0);
});

test("DELETE on an unlocked asset still applies", async () => {
  const supabase = configure(unlockedDeliveryTables());
  const { DELETE } = await assetDetailRoute();

  const response = await DELETE(
    jsonRequest(`/api/assets/${assetA}`, "DELETE"),
    { params: Promise.resolve({ id: assetA }) },
  );

  assert.equal(response.status, 200);
});

/* ── bulk asset route guards (F1) ──────────────────────────────────────── */

const assetB = "asset-b";

async function bulkRoute() {
  return import(
    pathToFileURL(resolve(repositoryRoot, "app/api/assets/bulk/route.ts")).href
  );
}

function bulkRequest(body: unknown) {
  return new NextRequest("https://admin.contentco-op.com/api/assets/bulk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function bulkTables() {
  return {
    assets: [
      { id: assetA, project_id: projectA, title: "Locked master", status: "approved" },
      { id: assetB, project_id: projectA, title: "Working cut", status: "in_review" },
    ],
    folders: [{ id: "folder-a", project_id: projectA }],
    tags: [{ id: "tag-a", project_id: projectA, name: "Launch" }],
    deliverables: [
      {
        id: deliverableId,
        project_id: projectA,
        status: "delivered",
        locked_at: "2026-08-11T12:00:00.000Z",
      },
    ],
    deliverable_items: [
      { id: "item-1", deliverable_id: deliverableId, asset_id: assetA, version_id: versionA },
    ],
  };
}

for (const action of ["move", "delete", "restore"] as const) {
  test(`bulk ${action} rejects locked assets with 409 ASSET_LOCKED and performs no writes`, async () => {
    const supabase = configure(bulkTables());
    const { POST } = await bulkRoute();

    const response = await POST(
      bulkRequest({
        action,
        asset_ids: [assetA, assetB],
        ...(action === "move" ? { folder_id: "folder-a" } : {}),
      }),
    );

    assert.equal(response.status, 409, action);
    const body = await response.json();
    assert.equal(body.code, "ASSET_LOCKED");
    assert.deepEqual(body.asset_ids, [assetA]);
    assert.equal(supabase.writes.length, 0, `${action} must not write`);
    assert.equal(supabase.tables.assets[0]?.deleted_at, undefined);
    assert.equal(supabase.tables.assets[1]?.deleted_at, undefined);
  });
}

test("bulk move still applies when no selected asset is locked", async () => {
  const supabase = configure(bulkTables());
  const { POST } = await bulkRoute();

  const response = await POST(
    bulkRequest({ action: "move", asset_ids: [assetB], folder_id: "folder-a" }),
  );

  assert.equal(response.status, 200);
  assert.equal(supabase.tables.assets[1]?.folder_id, "folder-a");
});

test("bulk tag does not mutate the asset record and stays allowed on locked assets", async () => {
  const supabase = configure(bulkTables());
  const { POST } = await bulkRoute();

  const response = await POST(
    bulkRequest({ action: "tag", asset_ids: [assetA], tag_id: "tag-a" }),
  );

  assert.equal(response.status, 200);
  assert.equal(supabase.writes.length, 1);
  assert.equal(supabase.writes[0]?.table, "asset_tags");
});

/* ── transcode enqueue guard (F2) ──────────────────────────────────────── */

const transcodeAsset = "33333333-3333-4333-8333-333333333333";

async function transcodeRoute() {
  return import(
    pathToFileURL(resolve(repositoryRoot, "app/api/media/transcode/route.ts")).href
  );
}

function transcodeTables(locked: boolean) {
  return {
    assets: [
      {
        id: transcodeAsset,
        project_id: projectA,
        title: "Master",
        status: "approved",
        nas_path: "tenants/a/master.mov",
        file_url: null,
      },
    ],
    deliverables: [
      {
        id: deliverableId,
        project_id: projectA,
        status: locked ? "delivered" : "ready",
        locked_at: locked ? "2026-08-11T12:00:00.000Z" : null,
      },
    ],
    deliverable_items: [
      { id: "item-1", deliverable_id: deliverableId, asset_id: transcodeAsset, version_id: versionA },
    ],
  };
}

function transcodeRequest() {
  return new NextRequest("https://admin.contentco-op.com/api/media/transcode", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ assetId: transcodeAsset }),
  });
}

test("transcode enqueue rejects an asset in a locked delivery with 409 and no writes", async () => {
  const supabase = configure(transcodeTables(true));
  const { POST } = await transcodeRoute();

  const response = await POST(transcodeRequest());

  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.code, "ASSET_LOCKED");
  assert.equal(supabase.writes.length, 0, "no job insert and no status flip");
});

test("transcode enqueue still applies when the asset is not locked", async () => {
  const supabase = configure(transcodeTables(false));
  const { POST } = await transcodeRoute();

  const response = await POST(transcodeRequest());

  assert.equal(response.status, 202);
  assert.ok(
    supabase.writes.some((write) => write.table === "transcode_jobs"),
    "job enqueued",
  );
  assert.equal(supabase.tables.assets[0]?.status, "processing");
});
