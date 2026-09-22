import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { NextRequest } from "next/server.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const routePath = resolve(repositoryRoot, "app/api/transcode/route.ts");

type Row = Record<string, unknown>;
type EnqueueInput = {
  assetId: string;
  versionId: string;
  projectId: string;
  source: Record<string, unknown>;
};
type QueryCall = {
  table: string;
  selection: string;
  filters: Record<string, unknown>;
};
type TranscodeRouteState = typeof globalThis & {
  __ccoTranscodeReceiptAccessCalls: Array<{
    assetId: string;
    userId: string;
    minimumRole: string;
  }>;
  __ccoTranscodeReceiptAccessResult: {
    ok: boolean;
    status?: number;
    data?: Row;
  };
  __ccoTranscodeReceiptEnqueueCalls: EnqueueInput[];
  __ccoTranscodeReceiptSupabase: FakeSupabase;
  __ccoTranscodeReceiptUser: { id: string } | null;
  __ccoTranscodeReceiptVersionCalls: Array<{
    assetId: string;
    versionId?: string;
  }>;
  __ccoTranscodeReceiptVersionResult:
    | { ok: true; version: Row }
    | { ok: false; status: number; error: string };
};

const state = globalThis as TranscodeRouteState;
const authStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function requireAuth() {
    return globalThis.__ccoTranscodeReceiptUser;
  }
`)}`;
const accessStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function getAssetAccess(assetId, userId, minimumRole) {
    globalThis.__ccoTranscodeReceiptAccessCalls.push({ assetId, userId, minimumRole });
    return globalThis.__ccoTranscodeReceiptAccessResult;
  }
`)}`;
const versionsStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function resolveAssetVersion(input) {
    globalThis.__ccoTranscodeReceiptVersionCalls.push(input);
    return globalThis.__ccoTranscodeReceiptVersionResult;
  }
`)}`;
const supabaseStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function getSupabase() {
    return globalThis.__ccoTranscodeReceiptSupabase;
  }
`)}`;
const pipelineStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function createMediaPipelineService() {
    return {
      async enqueue(input) {
        globalThis.__ccoTranscodeReceiptEnqueueCalls.push(input);
        if (!input.source.receipt) {
          throw { code: "PIPELINE_SOURCE_RECEIPT_REQUIRED" };
        }
        return { id: "job-1", source: input.source };
      }
    };
  }
`)}`;
const pipelineErrorsStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function isMediaPipelineError(error) {
    return Boolean(error && typeof error.code === "string" && error.code.startsWith("PIPELINE_"));
  }
`)}`;
const pipelineTypesStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function toPublicMediaPipelineJob(job) {
    return job;
  }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/auth") return nextResolve(authStubUrl, context);
    if (specifier === "@/lib/access-control") {
      return nextResolve(accessStubUrl, context);
    }
    if (specifier === "@/lib/versions") {
      return nextResolve(versionsStubUrl, context);
    }
    if (specifier === "@/lib/supabase") {
      return nextResolve(supabaseStubUrl, context);
    }
    if (specifier === "@/lib/media-pipeline/service") {
      return nextResolve(pipelineStubUrl, context);
    }
    if (specifier === "@/lib/media-pipeline/errors") {
      return nextResolve(pipelineErrorsStubUrl, context);
    }
    if (specifier === "@/lib/media-pipeline/types") {
      return nextResolve(pipelineTypesStubUrl, context);
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
  private readonly filters: Record<string, unknown> = {};
  private selection = "";

  constructor(database: FakeSupabase, table: string) {
    this.database = database;
    this.table = table;
  }

  select(selection: string) {
    this.selection = selection;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters[column] = value;
    return this;
  }

  async maybeSingle() {
    this.database.calls.push({
      table: this.table,
      selection: this.selection,
      filters: { ...this.filters },
    });
    if (this.database.errors[this.table]) {
      return {
        data: null,
        error: { message: this.database.errors[this.table] },
      };
    }
    const row = this.table === "assets"
      ? this.database.asset
      : this.table === "versions"
        ? this.database.versionReceipt
        : null;
    const matches = row && Object.entries(this.filters).every(
      ([column, value]) => row[column] === value,
    );
    return { data: matches ? row : null, error: null };
  }
}

class FakeSupabase {
  readonly calls: QueryCall[] = [];
  readonly errors: Record<string, string | undefined>;
  readonly asset: Row | null;
  readonly versionReceipt: Row | null;

  constructor({
    asset,
    versionReceipt,
    errors = {},
  }: {
    asset: Row | null;
    versionReceipt: Row | null;
    errors?: Record<string, string | undefined>;
  }) {
    this.asset = asset;
    this.versionReceipt = versionReceipt;
    this.errors = errors;
  }

  from(table: string) {
    assert.ok(table === "assets" || table === "versions");
    return new FakeQuery(this, table);
  }
}

const userId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const assetId = "33333333-3333-4333-8333-333333333333";
const versionId = "44444444-4444-4444-8444-444444444444";
const objectKey =
  "tenants/t-aaa/projects/p-bbb/objects/o-ccc/v00000001/master.mov";
const fileUrl = `/api/media/versions/${versionId}`;
const sha256 = "a".repeat(64);
const providerVersionId = `fs-v1:${"b".repeat(64)}`;
const committedAt = "2026-09-22T04:30:00.000Z";
const fileSize = 734_003_200;

function assetRow(overrides: Row = {}): Row {
  return {
    id: assetId,
    project_id: projectId,
    nas_path: objectKey,
    file_url: fileUrl,
    file_size: fileSize,
    title: "Schneider master",
    ...overrides,
  };
}

function selectedVersion(overrides: Row = {}): Row {
  return {
    id: versionId,
    asset_id: assetId,
    version_number: 1,
    file_url: fileUrl,
    file_size: fileSize,
    ...overrides,
  };
}

function receiptRow(overrides: Row = {}): Row {
  return {
    id: versionId,
    asset_id: assetId,
    version_number: 1,
    file_size: fileSize,
    storage_provider: "ccnas",
    storage_object_key: objectKey,
    storage_sha256: sha256,
    storage_provider_version_id: providerVersionId,
    storage_committed_at: committedAt,
    original_filename: "Schneider master.mov",
    ...overrides,
  };
}

function configure({
  user = { id: userId },
  accessResult = { ok: true, data: { id: assetId } },
  asset = assetRow(),
  version = selectedVersion(),
  receipt = receiptRow(),
}: {
  user?: { id: string } | null;
  accessResult?: TranscodeRouteState["__ccoTranscodeReceiptAccessResult"];
  asset?: Row | null;
  version?: Row;
  receipt?: Row | null;
} = {}) {
  state.__ccoTranscodeReceiptUser = user;
  state.__ccoTranscodeReceiptAccessCalls = [];
  state.__ccoTranscodeReceiptAccessResult = accessResult;
  state.__ccoTranscodeReceiptVersionCalls = [];
  state.__ccoTranscodeReceiptVersionResult = { ok: true, version };
  state.__ccoTranscodeReceiptEnqueueCalls = [];
  state.__ccoTranscodeReceiptSupabase = new FakeSupabase({
    asset,
    versionReceipt: receipt,
  });
}

function request() {
  return new NextRequest("https://admin.contentco-op.com/api/transcode", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ asset_id: assetId, version_id: versionId }),
  });
}

test("strict receipt mode enqueues the exact managed-version receipt and SHA", async () => {
  configure();
  const { POST } = await import(pathToFileURL(routePath).href);

  const response = await POST(request());

  assert.equal(response.status, 202);
  assert.deepEqual(state.__ccoTranscodeReceiptEnqueueCalls, [{
    assetId,
    versionId,
    projectId,
    source: {
      objectKey,
      filename: "Schneider master.mov",
      versionNumber: 1,
      expectedSize: fileSize,
      expectedSha256: sha256,
      receipt: {
        provider: "ccnas",
        objectKey,
        size: fileSize,
        sha256,
        providerVersionId,
        committedAt,
      },
    },
  }]);
  assert.deepEqual(
    state.__ccoTranscodeReceiptSupabase.calls.find(
      (call) => call.table === "versions",
    )?.filters,
    { id: versionId, asset_id: assetId },
  );
});

test("missing managed receipt fails closed before pipeline enqueue", async () => {
  configure({
    receipt: receiptRow({
      storage_provider: null,
      storage_object_key: null,
      storage_sha256: null,
      storage_provider_version_id: null,
      storage_committed_at: null,
    }),
  });
  const { POST } = await import(pathToFileURL(routePath).href);

  const response = await POST(request());

  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "VERSION_SOURCE_NOT_READY");
  assert.deepEqual(state.__ccoTranscodeReceiptEnqueueCalls, []);
});

test("managed receipt drift from the current asset fails closed", async () => {
  configure({
    receipt: receiptRow({
      storage_object_key:
        "tenants/t-aaa/projects/p-bbb/objects/o-other/v00000001/master.mov",
    }),
  });
  const { POST } = await import(pathToFileURL(routePath).href);

  const response = await POST(request());

  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "VERSION_SOURCE_MISMATCH");
  assert.deepEqual(state.__ccoTranscodeReceiptEnqueueCalls, []);
});

test("receipt fields are never normalized into new storage authority", async () => {
  configure({
    receipt: receiptRow({ storage_sha256: ` ${sha256} ` }),
  });
  const { POST } = await import(pathToFileURL(routePath).href);

  const response = await POST(request());

  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "VERSION_SOURCE_NOT_READY");
  assert.deepEqual(state.__ccoTranscodeReceiptEnqueueCalls, []);
});

test("unauthorized requests cannot inspect receipt authority or enqueue", async () => {
  configure({ user: null });
  const { POST } = await import(pathToFileURL(routePath).href);

  const response = await POST(request());

  assert.equal(response.status, 401);
  assert.deepEqual(state.__ccoTranscodeReceiptAccessCalls, []);
  assert.deepEqual(state.__ccoTranscodeReceiptVersionCalls, []);
  assert.deepEqual(state.__ccoTranscodeReceiptSupabase.calls, []);
  assert.deepEqual(state.__ccoTranscodeReceiptEnqueueCalls, []);
});
