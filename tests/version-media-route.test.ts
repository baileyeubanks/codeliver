import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { NextRequest } from "next/server.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const routePath = resolve(
  repositoryRoot,
  "app/api/media/versions/[versionId]/route.ts",
);

type Row = Record<string, unknown>;
type MediaRouteState = typeof globalThis & {
  __ccoVersionMediaAccessCalls: Array<{
    assetId: string;
    userId: string;
    minimumRole: string;
  }>;
  __ccoVersionMediaAccessResult: {
    ok: boolean;
    status?: number;
    error?: string;
    data?: Row;
  };
  __ccoVersionMediaRuntime: {
    adapter: {
      kind: string;
      openStoredObjectReadStream(
        objectKey: string,
        range?: { start: number; end: number },
        expectation?: { size: number; providerVersionId: string },
      ): Promise<Readable>;
    };
  };
  __ccoVersionMediaSupabase: FakeSupabase;
  __ccoVersionMediaUser: { id: string } | null;
};

const state = globalThis as MediaRouteState;
const authStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function requireAuth() {
    return globalThis.__ccoVersionMediaUser;
  }
`)}`;
const accessStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function getAssetAccess(assetId, userId, minimumRole) {
    globalThis.__ccoVersionMediaAccessCalls.push({ assetId, userId, minimumRole });
    return globalThis.__ccoVersionMediaAccessResult;
  }
`)}`;
const supabaseStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function getSupabase() {
    return globalThis.__ccoVersionMediaSupabase;
  }
`)}`;
const storageStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function createStorageRuntime() {
    return globalThis.__ccoVersionMediaRuntime;
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
    if (specifier === "@/lib/storage/runtime") {
      return nextResolve(storageStubUrl, context);
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

class FakeQuery {
  private readonly database: FakeSupabase;
  private readonly table: string;
  private id: unknown;
  private requiresNotDeleted = false;

  constructor(database: FakeSupabase, table: string) {
    this.database = database;
    this.table = table;
  }

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    if (column === "id") this.id = value;
    return this;
  }

  is(column: string, value: unknown) {
    if (column === "deleted_at" && value === null) {
      this.requiresNotDeleted = true;
    }
    return this;
  }

  async maybeSingle() {
    if (this.database.error) {
      return { data: null, error: { message: this.database.error } };
    }
    if (this.table === "assets") {
      const asset = this.database.assetRow;
      return {
        data:
          asset?.id === this.id &&
          (!this.requiresNotDeleted || asset.deleted_at === null)
            ? asset
            : null,
        error: null,
      };
    }
    return {
      data: this.database.row?.id === this.id ? this.database.row : null,
      error: null,
    };
  }
}

class FakeSupabase {
  readonly error: string | null;
  readonly row: Row | null;
  readonly assetRow: Row | null;

  constructor(
    row: Row | null,
    error: string | null = null,
    assetRow: Row | null = { id: assetId, deleted_at: null },
  ) {
    this.row = row;
    this.error = error;
    this.assetRow = assetRow;
  }

  from(table: string) {
    assert.ok(table === "versions" || table === "assets");
    return new FakeQuery(this, table);
  }
}

const versionId = "55555555-5555-4555-8555-555555555555";
const assetId = "44444444-4444-4444-8444-444444444444";
const userId = "33333333-3333-4333-8333-333333333333";
const objectKey = "tenants/a/projects/b/objects/c/v1/master.mov";
const sha256 = "a".repeat(64);
const providerVersionId = "fs-v1:" + "c".repeat(64);
const bytes = Buffer.from("0123456789");

function mediaRow(overrides: Row = {}): Row {
  return {
    id: versionId,
    asset_id: assetId,
    file_size: bytes.length,
    storage_provider: "local",
    storage_object_key: objectKey,
    storage_sha256: sha256,
    storage_provider_version_id: providerVersionId,
    original_filename: "master.mov",
    mime_type: "video/quicktime",
    ...overrides,
  };
}

test("the canonical V1 media URL resolves to a real route", () => {
  assert.equal(existsSync(routePath), true);
  const route = readFileSync(routePath, "utf8");
  assert.doesNotMatch(route, /inspectStoredObject\(/);
});

test("an authorized viewer can range-stream bytes bound to the exact version receipt", async () => {
  const openCalls: Array<{
    objectKey: string;
    range?: { start: number; end: number };
    expectation?: { size: number; providerVersionId: string };
  }> = [];
  state.__ccoVersionMediaUser = {
    id: userId,
  };
  state.__ccoVersionMediaAccessCalls = [];
  state.__ccoVersionMediaAccessResult = {
    ok: true,
    data: { id: assetId },
  };
  state.__ccoVersionMediaSupabase = new FakeSupabase(mediaRow());
  state.__ccoVersionMediaRuntime = {
    adapter: {
      kind: "local",
      async openStoredObjectReadStream(requestedObjectKey, range, expectation) {
        openCalls.push({ objectKey: requestedObjectKey, range, expectation });
        const selected = range
          ? bytes.subarray(range.start, range.end + 1)
          : bytes;
        return Readable.from(selected);
      },
    },
  };
  const { GET } = await import(pathToFileURL(routePath).href);
  const response = await GET(
    new NextRequest(
      `https://admin.contentco-op.com/api/media/versions/${versionId}`,
      { headers: { Range: "bytes=2-5" } },
    ),
    { params: Promise.resolve({ versionId }) },
  );

  assert.equal(response.status, 206);
  assert.equal(response.headers.get("content-type"), "video/quicktime");
  assert.equal(response.headers.get("content-range"), "bytes 2-5/10");
  assert.equal(response.headers.get("content-length"), "4");
  assert.equal(response.headers.get("accept-ranges"), "bytes");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(await response.text(), "2345");
  assert.deepEqual(state.__ccoVersionMediaAccessCalls, [{
    assetId,
    userId,
    minimumRole: "viewer",
  }]);
  assert.deepEqual(openCalls, [{
    objectKey,
    range: { start: 2, end: 5 },
    expectation: {
      size: bytes.length,
      providerVersionId,
    },
  }]);
});

test("unauthenticated and cross-tenant callers cannot reach storage identity", async () => {
  let openCalls = 0;
  state.__ccoVersionMediaRuntime = {
    adapter: {
      kind: "local",
      async openStoredObjectReadStream() {
        openCalls += 1;
        return Readable.from(bytes);
      },
    },
  };
  const { GET } = await import(pathToFileURL(routePath).href);

  state.__ccoVersionMediaUser = null;
  state.__ccoVersionMediaAccessCalls = [];
  state.__ccoVersionMediaSupabase = new FakeSupabase(mediaRow());
  let response = await GET(
    new NextRequest(
      `https://admin.contentco-op.com/api/media/versions/${versionId}`,
    ),
    { params: Promise.resolve({ versionId }) },
  );
  assert.equal(response.status, 401);
  assert.doesNotMatch(await response.text(), new RegExp(objectKey));
  assert.deepEqual(state.__ccoVersionMediaAccessCalls, []);
  assert.equal(openCalls, 0);

  state.__ccoVersionMediaUser = { id: userId };
  state.__ccoVersionMediaAccessResult = {
    ok: false,
    status: 404,
    error: "Asset not found",
  };
  response = await GET(
    new NextRequest(
      `https://admin.contentco-op.com/api/media/versions/${versionId}`,
    ),
    { params: Promise.resolve({ versionId }) },
  );
  assert.equal(response.status, 404);
  assert.doesNotMatch(await response.text(), new RegExp(objectKey));
  assert.deepEqual(state.__ccoVersionMediaAccessCalls, [{
    assetId,
    userId,
    minimumRole: "viewer",
  }]);
  assert.equal(openCalls, 0);
});

test("soft-deleted assets cannot reach storage inspection or byte reads", async () => {
  let openCalls = 0;
  state.__ccoVersionMediaUser = { id: userId };
  state.__ccoVersionMediaAccessCalls = [];
  state.__ccoVersionMediaAccessResult = {
    ok: true,
    data: { id: assetId },
  };
  state.__ccoVersionMediaSupabase = new FakeSupabase(
    mediaRow(),
    null,
    { id: assetId, deleted_at: "2026-07-26T12:00:00.000Z" },
  );
  state.__ccoVersionMediaRuntime = {
    adapter: {
      kind: "local",
      async openStoredObjectReadStream() {
        openCalls += 1;
        return Readable.from(bytes);
      },
    },
  };
  const { GET } = await import(pathToFileURL(routePath).href);
  const response = await GET(
    new NextRequest(
      `https://admin.contentco-op.com/api/media/versions/${versionId}`,
    ),
    { params: Promise.resolve({ versionId }) },
  );

  assert.equal(response.status, 404);
  assert.equal(openCalls, 0);
  assert.deepEqual(state.__ccoVersionMediaAccessCalls, []);
});

test("provider and stored identity mismatches fail opaquely", async () => {
  const { GET } = await import(pathToFileURL(routePath).href);
  state.__ccoVersionMediaUser = { id: userId };
  state.__ccoVersionMediaAccessResult = {
    ok: true,
    data: { id: assetId },
  };

  for (const scenario of ["provider", "integrity"] as const) {
    let openCalls = 0;
    state.__ccoVersionMediaAccessCalls = [];
    state.__ccoVersionMediaSupabase = new FakeSupabase(mediaRow());
    state.__ccoVersionMediaRuntime = {
      adapter: {
        kind: scenario === "provider" ? "ccnas" : "local",
        async openStoredObjectReadStream() {
          openCalls += 1;
          if (scenario === "integrity") {
            throw new Error("private object identity mismatch");
          }
          return Readable.from(bytes);
        },
      },
    };
    const response = await GET(
      new NextRequest(
        `https://admin.contentco-op.com/api/media/versions/${versionId}`,
      ),
      { params: Promise.resolve({ versionId }) },
    );
    const body = await response.text();
    assert.equal(response.status, 503);
    assert.doesNotMatch(body, new RegExp(objectKey));
    assert.doesNotMatch(body, new RegExp(sha256));
    assert.equal(openCalls, scenario === "integrity" ? 1 : 0);
  }
});

test("multipart and unsatisfiable ranges return 416 without opening bytes", async () => {
  let openCalls = 0;
  state.__ccoVersionMediaUser = { id: userId };
  state.__ccoVersionMediaAccessCalls = [];
  state.__ccoVersionMediaAccessResult = {
    ok: true,
    data: { id: assetId },
  };
  state.__ccoVersionMediaSupabase = new FakeSupabase(mediaRow());
  state.__ccoVersionMediaRuntime = {
    adapter: {
      kind: "local",
      async openStoredObjectReadStream() {
        openCalls += 1;
        return Readable.from(bytes);
      },
    },
  };
  const { GET } = await import(pathToFileURL(routePath).href);

  for (const range of ["bytes=0-1,3-4", "bytes=99-100"]) {
    const response = await GET(
      new NextRequest(
        `https://admin.contentco-op.com/api/media/versions/${versionId}`,
        { headers: { Range: range } },
      ),
      { params: Promise.resolve({ versionId }) },
    );
    assert.equal(response.status, 416);
    assert.equal(response.headers.get("content-range"), "bytes */10");
    assert.equal(await response.text(), "");
  }
  assert.equal(openCalls, 0);
});

test("client-supplied active content is forced to a safe download", async () => {
  state.__ccoVersionMediaUser = { id: userId };
  state.__ccoVersionMediaAccessCalls = [];
  state.__ccoVersionMediaAccessResult = {
    ok: true,
    data: { id: assetId },
  };
  state.__ccoVersionMediaSupabase = new FakeSupabase(mediaRow({
    original_filename: "payload.html",
    mime_type: "text/html",
  }));
  state.__ccoVersionMediaRuntime = {
    adapter: {
      kind: "local",
      async openStoredObjectReadStream() {
        return Readable.from(bytes);
      },
    },
  };
  const { GET } = await import(pathToFileURL(routePath).href);
  const response = await GET(
    new NextRequest(
      `https://admin.contentco-op.com/api/media/versions/${versionId}`,
    ),
    { params: Promise.resolve({ versionId }) },
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/octet-stream");
  assert.equal(
    response.headers.get("content-disposition"),
    'attachment; filename="payload.html"',
  );
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
});
