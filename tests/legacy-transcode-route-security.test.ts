import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { NextRequest } from "next/server.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const authStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function requireAuth() {
    const state = globalThis.__legacyTranscodeRouteState;
    state.authCalls += 1;
    if (state.authError) throw state.authError;
    return state.user;
  }
`)}`;
const accessStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function getAssetAccess(assetId, userId, role) {
    const state = globalThis.__legacyTranscodeRouteState;
    state.accessCalls.push({ assetId, userId, role });
    return state.resolveAccess(assetId, userId, role);
  }
`)}`;
const queueStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function enqueueTranscode(params) {
    const state = globalThis.__legacyTranscodeRouteState;
    state.enqueueCalls.push(params);
    if (state.enqueueError) throw state.enqueueError;
    return state.enqueueResult;
  }
  export async function claimNextJob() {
    const state = globalThis.__legacyTranscodeRouteState;
    state.claimCalls += 1;
    if (state.claimError) throw state.claimError;
    return state.claimedJob;
  }
`)}`;
const workerStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function processJob(job) {
    const state = globalThis.__legacyTranscodeRouteState;
    state.processCalls.push(job);
  }
`)}`;
const supabaseStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function getSupabase() {
    return {
      from(table) {
        const query = { table, selection: null, filters: {}, order: null, limit: null };
        const builder = {
          select(selection) {
            query.selection = selection;
            return builder;
          },
          eq(field, value) {
            query.filters[field] = value;
            return builder;
          },
          order(field, options) {
            query.order = { field, options };
            return builder;
          },
          limit(value) {
            query.limit = value;
            return builder;
          },
          async maybeSingle() {
            const state = globalThis.__legacyTranscodeRouteState;
            state.dbCalls.push(query);
            return state.resolveDb(query);
          },
        };
        return builder;
      },
    };
  }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/auth") return nextResolve(authStubUrl, context);
    if (specifier === "@/lib/access-control") {
      return nextResolve(accessStubUrl, context);
    }
    if (specifier === "@/lib/workers/queue") {
      return nextResolve(queueStubUrl, context);
    }
    if (specifier === "@/lib/workers/transcode") {
      return nextResolve(workerStubUrl, context);
    }
    if (specifier === "@/lib/supabase") {
      return nextResolve(supabaseStubUrl, context);
    }
    if (specifier.startsWith("@/")) {
      const candidate = resolve(repositoryRoot, specifier.slice(2));
      for (const path of [
        `${candidate}.ts`,
        `${candidate}.tsx`,
        join(candidate, "index.ts"),
      ]) {
        if (existsSync(path)) return nextResolve(pathToFileURL(path).href, context);
      }
    }
    return nextResolve(specifier, context);
  },
});

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROJECT_A = "10000000-0000-4000-8000-000000000001";
const ASSET_A = "20000000-0000-4000-8000-000000000001";
const ASSET_B = "20000000-0000-4000-8000-000000000002";
const VERSION_A = "30000000-0000-4000-8000-000000000001";
const JOB_A = "40000000-0000-4000-8000-000000000001";

type DbQuery = {
  table: string;
  selection: string | null;
  filters: Record<string, unknown>;
  order: { field: string; options: unknown } | null;
  limit: number | null;
};

type AccessResult =
  | {
      ok: true;
      data: { id: string; project_id: string };
    }
  | { ok: false; status: number; error: string };

type RouteTestState = {
  user: { id: string } | null;
  authCalls: number;
  authError: Error | null;
  accessCalls: Array<{ assetId: string; userId: string; role: string }>;
  resolveAccess: (
    assetId: string,
    userId: string,
    role: string
  ) => AccessResult | Promise<AccessResult>;
  dbCalls: DbQuery[];
  resolveDb: (query: DbQuery) => unknown | Promise<unknown>;
  enqueueCalls: Array<Record<string, unknown>>;
  enqueueResult: Record<string, unknown> | null;
  enqueueError: Error | null;
  claimCalls: number;
  claimError: Error | null;
  claimedJob: Record<string, unknown> | null;
  processCalls: Array<Record<string, unknown>>;
};

declare global {
  var __legacyTranscodeRouteState: RouteTestState;
}

const originalWorkerToken = process.env.CODELIVER_MEDIA_PIPELINE_WORKER_TOKEN;
let state: RouteTestState;

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: JOB_A,
    asset_id: ASSET_A,
    version_id: VERSION_A,
    status: "processing",
    input_path: "tenant-a/private/source.mov",
    output_hls_path: "tenant-a/private/proxy.m3u8",
    output_thumbnail_path: "tenant-a/private/poster.jpg",
    output_waveform_path: null,
    duration_seconds: 42,
    resolution: "1920x1080",
    codec: "h264",
    fps: 24,
    error_message: "/private/storage/internal failure",
    started_at: "2026-07-15T12:00:00.000Z",
    completed_at: null,
    created_at: "2026-07-15T11:59:00.000Z",
    ...overrides,
  };
}

function resetState() {
  delete process.env.CODELIVER_MEDIA_PIPELINE_WORKER_TOKEN;
  state = {
    user: { id: USER_ID },
    authCalls: 0,
    authError: null,
    accessCalls: [],
    resolveAccess: async (assetId) => ({
      ok: true,
      data: { id: assetId, project_id: PROJECT_A },
    }),
    dbCalls: [],
    resolveDb: async () => ({ data: null, error: null }),
    enqueueCalls: [],
    enqueueResult: makeJob(),
    enqueueError: null,
    claimCalls: 0,
    claimError: null,
    claimedJob: makeJob(),
    processCalls: [],
  };
  globalThis.__legacyTranscodeRouteState = state;
}

function moduleUrl(path: string): string {
  return pathToFileURL(resolve(repositoryRoot, path)).href;
}

async function routePost(request: NextRequest): Promise<Response> {
  const { POST } = await import(moduleUrl("app/api/media/transcode/route.ts"));
  return POST(request);
}

async function routeGet(request: NextRequest): Promise<Response> {
  const { GET } = await import(moduleUrl("app/api/media/transcode/route.ts"));
  return GET(request);
}

function postRequest(body: unknown): NextRequest {
  return new NextRequest("https://admin.contentco-op.com/api/media/transcode", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function assertSafeJobPayload(payload: unknown) {
  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, /input_path|output_hls_path|output_thumbnail_path/);
  assert.doesNotMatch(serialized, /error_message|private\/storage|private\/source/);
}

after(() => {
  if (originalWorkerToken === undefined) {
    delete process.env.CODELIVER_MEDIA_PIPELINE_WORKER_TOKEN;
  } else {
    process.env.CODELIVER_MEDIA_PIPELINE_WORKER_TOKEN = originalWorkerToken;
  }
});

test("worker claiming and processing fail closed behind the service token", async () => {
  resetState();
  const workerUrl =
    "https://admin.contentco-op.com/api/media/transcode?action=process";

  let response = await routePost(new NextRequest(workerUrl, { method: "POST" }));
  assert.equal(response.status, 401);
  assert.equal(state.claimCalls, 0);
  assert.equal(state.processCalls.length, 0);

  process.env.CODELIVER_MEDIA_PIPELINE_WORKER_TOKEN = "expected-worker-token";
  response = await routePost(
    new NextRequest(workerUrl, {
      method: "POST",
      headers: { "x-codeliver-media-worker-token": "wrong-worker-token" },
    })
  );
  assert.equal(response.status, 401);
  assert.equal(state.claimCalls, 0);

  response = await routePost(
    new NextRequest(workerUrl, {
      method: "POST",
      headers: {
        "x-codeliver-media-worker-token": "expected-worker-token",
      },
    })
  );
  assert.equal(response.status, 200);
  assert.equal(state.authCalls, 0, "worker authority must not fall back to user auth");
  assert.equal(state.claimCalls, 1);
  assert.equal(state.processCalls.length, 1);
  assertSafeJobPayload(await response.json());
});

test("user enqueue requires editor access and derives the selected version path", async () => {
  resetState();
  state.resolveDb = async (query) => {
    if (query.table === "assets") {
      return {
        data: {
          id: ASSET_A,
          project_id: PROJECT_A,
          nas_path: "tenant-a/current.mov",
          file_url: "/api/media/stream?path=tenant-a%2Fcurrent.mov",
        },
        error: null,
      };
    }
    if (query.table === "versions") {
      return {
        data: {
          id: VERSION_A,
          asset_id: ASSET_A,
          file_url: "/api/media/stream?path=tenant-a%2Fversions%2Fv2.mov",
        },
        error: null,
      };
    }
    throw new Error(`Unexpected table ${query.table}`);
  };

  const response = await routePost(
    postRequest({
      assetId: ASSET_A,
      versionId: VERSION_A,
      inputPath: "../../tenant-b/private.mov",
    })
  );
  assert.equal(response.status, 202);
  assert.deepEqual(state.accessCalls, [
    { assetId: ASSET_A, userId: USER_ID, role: "editor" },
  ]);
  assert.deepEqual(state.enqueueCalls, [
    {
      assetId: ASSET_A,
      versionId: VERSION_A,
      inputPath: "tenant-a/versions/v2.mov",
    },
  ]);
  assert.equal(state.processCalls.length, 0, "user enqueue must not process jobs");

  const assetQuery = state.dbCalls.find((query) => query.table === "assets");
  assert.deepEqual(assetQuery?.filters, {
    id: ASSET_A,
    project_id: PROJECT_A,
  });
  const versionQuery = state.dbCalls.find((query) => query.table === "versions");
  assert.deepEqual(versionQuery?.filters, {
    id: VERSION_A,
    asset_id: ASSET_A,
  });
  assertSafeJobPayload(await response.json());
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("denied editor access and mismatched versions cannot enqueue tenant work", async () => {
  resetState();
  state.resolveAccess = async () => ({
    ok: false,
    status: 404,
    error: "sensitive authorization detail",
  });

  let response = await routePost(postRequest({ assetId: ASSET_B }));
  assert.equal(response.status, 404);
  assert.equal(state.dbCalls.length, 0);
  assert.equal(state.enqueueCalls.length, 0);
  assert.doesNotMatch(await response.text(), /sensitive authorization detail/);

  resetState();
  state.resolveDb = async (query) => {
    if (query.table === "assets") {
      return {
        data: {
          id: ASSET_A,
          project_id: PROJECT_A,
          nas_path: "tenant-a/current.mov",
          file_url: "/api/media/stream?path=tenant-a%2Fcurrent.mov",
        },
        error: null,
      };
    }
    return {
      data: {
        id: VERSION_A,
        asset_id: ASSET_B,
        file_url: "/api/media/stream?path=tenant-b%2Fprivate.mov",
      },
      error: null,
    };
  };

  response = await routePost(
    postRequest({ assetId: ASSET_A, versionId: VERSION_A })
  );
  assert.equal(response.status, 404);
  assert.equal(state.enqueueCalls.length, 0);
});

test("enqueue JSON is bounded even when content-length is forged", async () => {
  resetState();
  const oversizedBody = JSON.stringify({
    assetId: ASSET_A,
    padding: "x".repeat(9_000),
  });
  const response = await routePost(
    new NextRequest("https://admin.contentco-op.com/api/media/transcode", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": "1",
      },
      body: oversizedBody,
    })
  );

  assert.equal(response.status, 413);
  assert.equal(state.accessCalls.length, 0);
  assert.equal(state.enqueueCalls.length, 0);
});

test("job reads authorize through the job asset and expose no global list", async () => {
  resetState();
  let response = await routeGet(
    new NextRequest("https://admin.contentco-op.com/api/media/transcode")
  );
  assert.equal(response.status, 400);
  assert.equal(state.dbCalls.length, 0, "missing filters must not list the queue");

  state.resolveDb = async (query) => {
    assert.equal(query.table, "transcode_jobs");
    return { data: makeJob({ asset_id: ASSET_B }), error: null };
  };
  state.resolveAccess = async () => ({
    ok: false,
    status: 404,
    error: "another tenant owns this asset",
  });
  response = await routeGet(
    new NextRequest(
      `https://admin.contentco-op.com/api/media/transcode?jobId=${JOB_A}`
    )
  );
  assert.equal(response.status, 404);
  assert.deepEqual(state.accessCalls.at(-1), {
    assetId: ASSET_B,
    userId: USER_ID,
    role: "viewer",
  });
  assert.doesNotMatch(await response.text(), /another tenant/);

  state.resolveAccess = async (assetId) => ({
    ok: true,
    data: { id: assetId, project_id: PROJECT_A },
  });
  response = await routeGet(
    new NextRequest(
      `https://admin.contentco-op.com/api/media/transcode?jobId=${JOB_A}`
    )
  );
  assert.equal(response.status, 200);
  assertSafeJobPayload(await response.json());
  const jobQuery = state.dbCalls.at(-1);
  assert.doesNotMatch(jobQuery?.selection ?? "", /input_path|output_|error_message/);
});
