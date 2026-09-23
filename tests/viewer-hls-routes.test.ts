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
  "app/api/media/versions/[versionId]/hls/playlist.m3u8/route.ts",
);
const segmentRoutePath = resolve(
  repositoryRoot,
  "app/api/media/versions/[versionId]/hls/segments/[index]/route.ts",
);
const assetId = "11111111-1111-4111-8111-111111111111";
const versionId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";
const providerVersionId = `fs-v1:${"e".repeat(64)}`;
const playlistObjectKey = "private/viewer-playlist/playlist.m3u8";
const segmentObjectKey = "private/viewer-segment/segment000.ts";
const playlist = [
  "#EXTM3U",
  "#EXT-X-VERSION:3",
  "#EXT-X-TARGETDURATION:6",
  "#EXT-X-PLAYLIST-TYPE:VOD",
  "#EXTINF:6.000000,",
  "segment000.ts",
  "#EXT-X-ENDLIST",
  "",
].join("\n");

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
              playlist: artifact("hls_playlist", "playlist.m3u8", playlistObjectKey, playlist),
              segments: [
                artifact("hls_segment", "segment000.ts", segmentObjectKey, "segment-a"),
              ],
              manifest: artifact(
                "hls_manifest",
                "hls-manifest.json",
                "private/viewer-manifest/hls-manifest.json",
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
type ViewerState = typeof globalThis & {
  __cvpViewerHlsUser: { id: string; app_metadata?: { content_coop_role: string } } | null;
  __cvpViewerHlsAccessCalls: Array<{ assetId: string; userId: string; minimumRole: string }>;
  __cvpViewerHlsAccessResult: { ok: boolean; status?: number };
  __cvpViewerHlsSupabase: FakeSupabase;
  __cvpViewerHlsOpenCalls: string[];
};
const state = globalThis as ViewerState;

function dataModule(source: string) {
  return `data:text/javascript,${encodeURIComponent(source)}`;
}
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/auth") {
      return nextResolve(dataModule(`
        export async function requireAuth() { return globalThis.__cvpViewerHlsUser; }
      `), context);
    }
    if (specifier === "@/lib/access-control") {
      return nextResolve(dataModule(`
        export async function getAssetAccess(assetId, userId, minimumRole) {
          globalThis.__cvpViewerHlsAccessCalls.push({ assetId, userId, minimumRole });
          return globalThis.__cvpViewerHlsAccessResult;
        }
      `), context);
    }
    if (specifier === "@/lib/supabase") {
      return nextResolve(dataModule(`
        export function getSupabase() { return globalThis.__cvpViewerHlsSupabase; }
      `), context);
    }
    if (specifier === "@/lib/api/responses") {
      return nextResolve(dataModule(`
        export function apiError(error, code, status) {
          return new Response(JSON.stringify({ error, code }), {
            status,
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
          });
        }
        export function backendUnavailable() {
          return apiError("Backend service is unavailable", "BACKEND_UNAVAILABLE", 503);
        }
      `), context);
    }
    if (specifier === "@/lib/storage/runtime") {
      return nextResolve(dataModule(`
        import { Readable } from "node:stream";
        export function createStorageRuntime() {
          return {
            adapter: {
              kind: "local",
              async openStoredObjectReadStream(objectKey) {
                globalThis.__cvpViewerHlsOpenCalls.push(objectKey);
                if (objectKey === ${JSON.stringify(playlistObjectKey)}) {
                  return Readable.from(Buffer.from(${JSON.stringify(playlist)}));
                }
                if (objectKey === ${JSON.stringify(segmentObjectKey)}) {
                  return Readable.from(Buffer.from("segment-a"));
                }
                throw new Error("missing fixture");
              },
            },
          };
        }
      `), context);
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
  private readonly equality = new Map<string, unknown>();
  constructor(database: FakeSupabase, table: string) {
    this.database = database;
    this.table = table;
  }
  select() { return this; }
  eq(column: string, value: unknown) {
    this.equality.set(column, value);
    return this;
  }
  is() { return this; }
  async maybeSingle() {
    const row = this.table === "assets" ? this.database.asset : this.database.version;
    if (!row) return { data: null, error: null };
    for (const [column, value] of this.equality) {
      if (row[column] !== value) return { data: null, error: null };
    }
    return { data: row, error: null };
  }
}
class FakeSupabase {
  asset: Row | null = { id: assetId, metadata: publishedMetadata(), deleted_at: null };
  version: Row | null = { id: versionId, asset_id: assetId };
  from(table: string) {
    return new FakeQuery(this, table);
  }
}

function reset(user: ViewerState["__cvpViewerHlsUser"]) {
  state.__cvpViewerHlsUser = user;
  state.__cvpViewerHlsAccessCalls = [];
  state.__cvpViewerHlsAccessResult = { ok: true };
  state.__cvpViewerHlsSupabase = new FakeSupabase();
  state.__cvpViewerHlsOpenCalls = [];
}

test("a client viewer can play published HLS without the staff route", async () => {
  reset({ id: userId, app_metadata: { content_coop_role: "client" } });
  const { GET } = await import(pathToFileURL(playlistRoutePath).href);
  const response = await GET(new Request("https://client.contentco-op.com/hls"), {
    params: Promise.resolve({ versionId }),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/vnd.apple.mpegurl; charset=utf-8");
  const body = await response.text();
  assert.match(body, /segments\/0/);
  assert.equal(body.includes(playlistObjectKey), false);
  assert.equal(body.includes("STAFF_REQUIRED"), false);
  assert.deepEqual(state.__cvpViewerHlsAccessCalls, [
    { assetId, userId, minimumRole: "viewer" },
  ]);
  assert.deepEqual(state.__cvpViewerHlsOpenCalls, [playlistObjectKey]);
});

test("viewer HLS rejects anonymous callers before storage", async () => {
  reset(null);
  const { GET } = await import(pathToFileURL(segmentRoutePath).href);
  const response = await GET(new Request("https://client.contentco-op.com/hls"), {
    params: Promise.resolve({ versionId, index: "0" }),
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "AUTH_REQUIRED");
  assert.deepEqual(state.__cvpViewerHlsOpenCalls, []);
  assert.deepEqual(state.__cvpViewerHlsAccessCalls, []);
});

test("an admitted client viewer can read an HLS segment", async () => {
  reset({ id: userId, app_metadata: { content_coop_role: "client" } });
  const { GET } = await import(pathToFileURL(segmentRoutePath).href);
  const response = await GET(new Request("https://client.contentco-op.com/hls"), {
    params: Promise.resolve({ versionId, index: "0" }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "video/mp2t");
  assert.equal(await response.text(), "segment-a");
  assert.deepEqual(state.__cvpViewerHlsOpenCalls, [segmentObjectKey]);
});
