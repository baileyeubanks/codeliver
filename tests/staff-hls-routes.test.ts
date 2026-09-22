import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const playlistRoutePath = resolve(
  repositoryRoot,
  "app/api/assets/[id]/versions/[versionId]/hls/playlist.m3u8/route.ts",
);
const segmentRoutePath = resolve(
  repositoryRoot,
  "app/api/assets/[id]/versions/[versionId]/hls/segments/[index]/route.ts",
);
const assetId = "11111111-1111-4111-8111-111111111111";
const versionId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";
const providerVersionId = `fs-v1:${"e".repeat(64)}`;
const playlistObjectKey = "private/hls-playlist/playlist.m3u8";
const segmentObjectKeys = [
  "private/hls-segment-a/segment000.ts",
  "private/hls-segment-b/segment001.ts",
];
const playlist = [
  "#EXTM3U",
  "#EXT-X-VERSION:3",
  "#EXT-X-TARGETDURATION:6",
  "#EXT-X-PLAYLIST-TYPE:VOD",
  "#EXTINF:6.000000,",
  "segment000.ts",
  "#EXTINF:4.000000,",
  "segment001.ts",
  "#EXT-X-ENDLIST",
  "",
].join("\n");
const segmentBytes = [Buffer.from("segment-a"), Buffer.from("segment-b")];

function digest(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function artifact(
  kind: "hls_playlist" | "hls_segment" | "hls_manifest",
  filename: string,
  objectKey: string,
  bytes: string | Buffer,
) {
  return {
    kind,
    filename,
    objectKey,
    contentType:
      kind === "hls_playlist"
        ? "application/vnd.apple.mpegurl"
        : kind === "hls_segment"
          ? "video/mp2t"
          : "application/json",
    size: Buffer.byteLength(bytes),
    sha256: digest(bytes),
    provider: "local",
    providerVersionId,
  };
}

function publishedMetadata() {
  return {
    media_pipeline: {
      schemaVersion: 1,
      currentVersionId: versionId,
      versions: {
        [versionId]: {
          schemaVersion: 1,
          pipelineVersion: "co-deliver-media-pipeline/v1",
          status: "published",
          versionId,
          artifacts: {
            hls: {
              playlist: artifact(
                "hls_playlist",
                "playlist.m3u8",
                playlistObjectKey,
                playlist,
              ),
              segments: segmentObjectKeys.map((objectKey, index) =>
                artifact(
                  "hls_segment",
                  `segment00${index}.ts`,
                  objectKey,
                  segmentBytes[index],
                ),
              ),
              manifest: artifact(
                "hls_manifest",
                "hls-manifest.json",
                "private/hls-manifest/hls-manifest.json",
                "{}",
              ),
            },
          },
        },
      },
    },
  };
}

type Row = Record<string, unknown>;
type OpenCall = {
  objectKey: string;
  expectation?: { size: number; providerVersionId: string };
};
type StaffHlsState = typeof globalThis & {
  __cvpStaffHlsUser: { id: string; app_metadata?: Record<string, unknown> } | null;
  __cvpStaffHlsRole: "staff" | "client" | null;
  __cvpStaffHlsRoleCalls: unknown[];
  __cvpStaffHlsAccessCalls: Array<{
    assetId: string;
    userId: string;
    minimumRole: string;
  }>;
  __cvpStaffHlsAccessResult: { ok: boolean; status?: number; data?: Row };
  __cvpStaffHlsSupabase: FakeSupabase;
  __cvpStaffHlsProvider: string;
  __cvpStaffHlsRuntimeCalls: number;
  __cvpStaffHlsOpenCalls: OpenCall[];
  __cvpStaffHlsOpenError: Error | null;
};
const state = globalThis as StaffHlsState;

function dataModule(source: string) {
  return `data:text/javascript,${encodeURIComponent(source)}`;
}
const authStub = dataModule(`
  export async function requireAuth() { return globalThis.__cvpStaffHlsUser; }
`);
const roleStub = dataModule(`
  export function resolveTrustedSurfaceRole(user) {
    globalThis.__cvpStaffHlsRoleCalls.push(user);
    return globalThis.__cvpStaffHlsRole;
  }
`);
const accessStub = dataModule(`
  export async function getAssetAccess(assetId, userId, minimumRole) {
    globalThis.__cvpStaffHlsAccessCalls.push({ assetId, userId, minimumRole });
    return globalThis.__cvpStaffHlsAccessResult;
  }
`);
const supabaseStub = dataModule(`
  export function getSupabase() { return globalThis.__cvpStaffHlsSupabase; }
`);
const responsesStub = dataModule(`
  export function apiError(error, code, status) {
    return new Response(JSON.stringify({ error, code }), {
      status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
    });
  }
  export function backendUnavailable() {
    return apiError("Backend service is unavailable", "BACKEND_UNAVAILABLE", 503);
  }
`);
const storageStub = dataModule(`
  import { Readable } from "node:stream";
  export function createStorageRuntime() {
    globalThis.__cvpStaffHlsRuntimeCalls += 1;
    return {
      adapter: {
        kind: globalThis.__cvpStaffHlsProvider,
        async openStoredObjectReadStream(objectKey, _range, expectation) {
          globalThis.__cvpStaffHlsOpenCalls.push({ objectKey, expectation });
          if (globalThis.__cvpStaffHlsOpenError) throw globalThis.__cvpStaffHlsOpenError;
          if (objectKey === ${JSON.stringify(playlistObjectKey)}) {
            return Readable.from(Buffer.from(${JSON.stringify(playlist)}));
          }
          const index = ${JSON.stringify(segmentObjectKeys)}.indexOf(objectKey);
          if (index < 0) throw new Error("missing fixture");
          return Readable.from(Buffer.from(index === 0 ? "segment-a" : "segment-b"));
        }
      }
    };
  }
`);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/auth") return nextResolve(authStub, context);
    if (specifier === "@/lib/auth/host-surface") return nextResolve(roleStub, context);
    if (specifier === "@/lib/access-control") return nextResolve(accessStub, context);
    if (specifier === "@/lib/supabase") return nextResolve(supabaseStub, context);
    if (specifier === "@/lib/api/responses") return nextResolve(responsesStub, context);
    if (specifier === "@/lib/storage/runtime") return nextResolve(storageStub, context);
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
  private readonly equality = new Map<string, unknown>();
  private requiresActive = false;

  constructor(database: FakeSupabase, table: string) {
    this.database = database;
    this.table = table;
  }

  select() { return this; }

  eq(column: string, value: unknown) {
    this.equality.set(column, value);
    return this;
  }

  is(column: string, value: unknown) {
    if (column === "deleted_at" && value === null) this.requiresActive = true;
    return this;
  }

  async maybeSingle() {
    this.database.lookupCalls.push({
      table: this.table,
      equality: Object.fromEntries(this.equality),
      requiresActive: this.requiresActive,
    });
    if (this.database.error) return { data: null, error: { message: "backend" } };
    const row = this.table === "assets" ? this.database.asset : this.database.version;
    if (!row) return { data: null, error: null };
    for (const [column, value] of this.equality) {
      if (row[column] !== value) return { data: null, error: null };
    }
    if (this.requiresActive && row.deleted_at !== null) return { data: null, error: null };
    return { data: row, error: null };
  }
}

class FakeSupabase {
  asset: Row | null;
  version: Row | null;
  error = false;
  lookupCalls: Array<{
    table: string;
    equality: Record<string, unknown>;
    requiresActive: boolean;
  }> = [];

  constructor() {
    this.asset = { id: assetId, metadata: publishedMetadata(), deleted_at: null };
    this.version = { id: versionId, asset_id: assetId };
  }

  from(table: string) {
    assert.ok(table === "assets" || table === "versions");
    return new FakeQuery(this, table);
  }
}

function reset() {
  state.__cvpStaffHlsUser = { id: userId, app_metadata: { content_coop_role: "staff" } };
  state.__cvpStaffHlsRole = "staff";
  state.__cvpStaffHlsRoleCalls = [];
  state.__cvpStaffHlsAccessCalls = [];
  state.__cvpStaffHlsAccessResult = { ok: true, data: { id: assetId } };
  state.__cvpStaffHlsSupabase = new FakeSupabase();
  state.__cvpStaffHlsProvider = "local";
  state.__cvpStaffHlsRuntimeCalls = 0;
  state.__cvpStaffHlsOpenCalls = [];
  state.__cvpStaffHlsOpenError = null;
}

async function playlistRoute() {
  return import(pathToFileURL(playlistRoutePath).href);
}

async function segmentRoute() {
  return import(pathToFileURL(segmentRoutePath).href);
}

function request(path: string) {
  return new Request(`https://admin.contentco-op.com${path}`);
}

test("staff playlist authorizes exact active asset/version membership and hides receipts", async () => {
  reset();
  const { GET } = await playlistRoute();
  const response = await GET(
    request(`/api/assets/${assetId}/versions/${versionId}/hls/playlist.m3u8`),
    { params: Promise.resolve({ id: assetId, versionId }) },
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/vnd.apple.mpegurl; charset=utf-8");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  const body = await response.text();
  assert.match(body, /#EXTINF:6\.000000,\nsegments\/0\n/);
  assert.match(body, /#EXTINF:4\.000000,\nsegments\/1\n/);
  assert.equal(body.includes(playlistObjectKey), false);
  assert.equal(body.includes(segmentObjectKeys[0]), false);
  assert.equal(body.includes(providerVersionId), false);
  assert.deepEqual(state.__cvpStaffHlsAccessCalls, [
    { assetId, userId, minimumRole: "viewer" },
  ]);
  assert.equal(state.__cvpStaffHlsRuntimeCalls, 1);
  assert.deepEqual(state.__cvpStaffHlsOpenCalls, [
    {
      objectKey: playlistObjectKey,
      expectation: { size: Buffer.byteLength(playlist), providerVersionId },
    },
  ]);
});

test("staff segment streams one exact immutable receipt", async () => {
  reset();
  const { GET } = await segmentRoute();
  const response = await GET(
    request(`/api/assets/${assetId}/versions/${versionId}/hls/segments/1`),
    { params: Promise.resolve({ id: assetId, versionId, index: "1" }) },
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "video/mp2t");
  assert.equal(response.headers.get("content-length"), String(segmentBytes[1].length));
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(await response.text(), "segment-b");
  assert.equal(state.__cvpStaffHlsRuntimeCalls, 1);
  assert.deepEqual(state.__cvpStaffHlsOpenCalls, [
    {
      objectKey: segmentObjectKeys[1],
      expectation: { size: segmentBytes[1].length, providerVersionId },
    },
  ]);
});

test("staff routes reject unauthenticated and non-staff callers before metadata or storage", async () => {
  const playlistModule = await playlistRoute();

  reset();
  state.__cvpStaffHlsUser = null;
  let response = await playlistModule.GET(request("/ignored"), {
    params: Promise.resolve({ id: assetId, versionId }),
  });
  assert.equal(response.status, 401);
  assert.deepEqual(state.__cvpStaffHlsSupabase.lookupCalls, []);
  assert.equal(state.__cvpStaffHlsRuntimeCalls, 0);
  assert.deepEqual(state.__cvpStaffHlsOpenCalls, []);

  reset();
  state.__cvpStaffHlsRole = "client";
  response = await playlistModule.GET(request("/ignored"), {
    params: Promise.resolve({ id: assetId, versionId }),
  });
  assert.equal(response.status, 403);
  assert.deepEqual(state.__cvpStaffHlsSupabase.lookupCalls, []);
  assert.equal(state.__cvpStaffHlsRuntimeCalls, 0);
  assert.deepEqual(state.__cvpStaffHlsOpenCalls, []);
});

test("staff routes fail closed for inactive assets, mismatched versions, and denied access", async () => {
  const { GET } = await playlistRoute();

  reset();
  state.__cvpStaffHlsSupabase.asset = {
    id: assetId,
    metadata: publishedMetadata(),
    deleted_at: "2026-08-23T00:00:00.000Z",
  };
  let response = await GET(request("/ignored"), {
    params: Promise.resolve({ id: assetId, versionId }),
  });
  assert.equal(response.status, 404);
  assert.deepEqual(state.__cvpStaffHlsAccessCalls, []);
  assert.equal(state.__cvpStaffHlsRuntimeCalls, 0);
  assert.deepEqual(state.__cvpStaffHlsOpenCalls, []);

  reset();
  state.__cvpStaffHlsSupabase.version = {
    id: versionId,
    asset_id: "44444444-4444-4444-8444-444444444444",
  };
  response = await GET(request("/ignored"), {
    params: Promise.resolve({ id: assetId, versionId }),
  });
  assert.equal(response.status, 404);
  assert.deepEqual(state.__cvpStaffHlsAccessCalls, []);
  assert.equal(state.__cvpStaffHlsRuntimeCalls, 0);
  assert.deepEqual(state.__cvpStaffHlsOpenCalls, []);

  reset();
  state.__cvpStaffHlsAccessResult = { ok: false, status: 404 };
  response = await GET(request("/ignored"), {
    params: Promise.resolve({ id: assetId, versionId }),
  });
  assert.equal(response.status, 404);
  assert.equal(state.__cvpStaffHlsRuntimeCalls, 0);
  assert.deepEqual(state.__cvpStaffHlsOpenCalls, []);
});

test("staff segment route rejects malformed and out-of-range indices before storage", async () => {
  const { GET } = await segmentRoute();
  for (const index of ["-1", "01", "2", "1.ts", "9007199254740992"]) {
    reset();
    const response = await GET(request("/ignored"), {
      params: Promise.resolve({ id: assetId, versionId, index }),
    });
    assert.equal(response.status, 404, index);
    assert.equal(state.__cvpStaffHlsRuntimeCalls, 0, index);
    assert.deepEqual(state.__cvpStaffHlsOpenCalls, [], index);
  }
});

test("staff storage/provider failures are opaque and never disclose immutable identity", async () => {
  const { GET } = await segmentRoute();
  for (const scenario of ["provider", "open"] as const) {
    reset();
    if (scenario === "provider") state.__cvpStaffHlsProvider = "ccnas";
    else state.__cvpStaffHlsOpenError = new Error("private receipt drift");
    const response = await GET(request("/ignored"), {
      params: Promise.resolve({ id: assetId, versionId, index: "0" }),
    });
    const body = await response.text();
    assert.equal(response.status, 503);
    assert.equal(body.includes(segmentObjectKeys[0]), false);
    assert.equal(body.includes(providerVersionId), false);
  }
});
