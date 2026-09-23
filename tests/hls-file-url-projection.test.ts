import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const routePath = resolve(repositoryRoot, "app/api/assets/[id]/versions/route.ts");
const assetRoutePath = resolve(repositoryRoot, "app/api/assets/[id]/route.ts");
const assetId = "11111111-1111-4111-8111-111111111111";
const publishedVersionId = "22222222-2222-4222-8222-222222222222";
const sourceVersionId = "33333333-3333-4333-8333-333333333333";
const userId = "44444444-4444-4444-8444-444444444444";
const providerVersionId = `fs-v1:${"c".repeat(64)}`;
const playlist = [
  "#EXTM3U",
  "#EXT-X-TARGETDURATION:4",
  "#EXT-X-PLAYLIST-TYPE:VOD",
  "#EXTINF:4.0,",
  "segment000.ts",
  "#EXT-X-ENDLIST",
  "",
].join("\n");

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
function artifact(
  kind: "hls_playlist" | "hls_segment" | "hls_manifest",
  filename: string,
  objectKey: string,
  content: string,
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
    size: Buffer.byteLength(content),
    sha256: digest(content),
    provider: "local",
    providerVersionId,
  };
}
function metadata() {
  return {
    media_pipeline: {
      schemaVersion: 1,
      currentVersionId: publishedVersionId,
      versions: {
        [publishedVersionId]: {
          schemaVersion: 1,
          pipelineVersion: "co-deliver-media-pipeline/v1",
          status: "published",
          versionId: publishedVersionId,
          probe: { frameRate: 24000 / 1001 },
          artifacts: {
            hls: {
              playlist: artifact(
                "hls_playlist",
                "playlist.m3u8",
                "private/staff-playlist/playlist.m3u8",
                playlist,
              ),
              segments: [
                artifact(
                  "hls_segment",
                  "segment000.ts",
                  "private/staff-segment/segment000.ts",
                  "segment",
                ),
              ],
              manifest: artifact(
                "hls_manifest",
                "hls-manifest.json",
                "private/staff-manifest/hls-manifest.json",
                "{}",
              ),
            },
          },
        },
      },
    },
  };
}

const state = globalThis as typeof globalThis & {
  __cvpHlsProjectionSupabase: FakeSupabase;
  __cvpHlsProjectionUser: { id: string; app_metadata?: Record<string, unknown> } | null;
  __cvpHlsProjectionAccessCalls: Array<{
    assetId: string;
    userId: string;
    minimumRole: string;
  }>;
};
function dataModule(source: string) {
  return `data:text/javascript,${encodeURIComponent(source)}`;
}
const authStub = dataModule(`
  export async function requireAuth() { return globalThis.__cvpHlsProjectionUser; }
`);
function asStaff() {
  state.__cvpHlsProjectionUser = { id: userId, app_metadata: { content_coop_role: "staff" } };
}
function asClient() {
  state.__cvpHlsProjectionUser = { id: userId, app_metadata: { content_coop_role: "client" } };
}
const accessStub = dataModule(`
  export const PROJECT_ROLE_RANK = { producer: 70 };
  export async function getAssetAccess(assetId, userId, minimumRole) {
    globalThis.__cvpHlsProjectionAccessCalls.push({ assetId, userId, minimumRole });
    return { ok: true, data: { id: assetId } };
  }
`);
const supabaseStub = dataModule(`
  export function getSupabase() { return globalThis.__cvpHlsProjectionSupabase; }
`);
const responsesStub = dataModule(`
  export function apiJson(body, init = {}) {
    return new Response(JSON.stringify(body), {
      ...init,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...(init.headers ?? {}) }
    });
  }
  export function apiError(error, code, status) {
    return apiJson({ error, code }, { status });
  }
  export function backendUnavailable() {
    return apiError("Backend service is unavailable", "BACKEND_UNAVAILABLE", 503);
  }
`);
const lockStub = dataModule(`
  export async function assertAssetNotLocked() {}
  export function isAssetDeliveryLockedError() { return false; }
`);
const boundaryStub = dataModule(`
  export function withAssetRouteBoundary(handler) { return handler; }
`);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/auth") return nextResolve(authStub, context);
    if (specifier === "@/lib/access-control") return nextResolve(accessStub, context);
    if (specifier === "@/lib/supabase") return nextResolve(supabaseStub, context);
    if (specifier === "@/lib/api/responses") return nextResolve(responsesStub, context);
    if (specifier === "@/lib/delivery/lock") return nextResolve(lockStub, context);
    if (specifier.endsWith("asset-route-boundary")) {
      return nextResolve(boundaryStub, context);
    }
    if (specifier.startsWith("@/")) {
      return nextResolve(
        pathToFileURL(resolve(repositoryRoot, `${specifier.slice(2)}.ts`)).href,
        context,
      );
    }
    return nextResolve(specifier, context);
  },
});

type Row = Record<string, unknown>;
class FakeQuery {
  private readonly database: FakeSupabase;
  private readonly table: string;
  private readonly equality = new Map<string, unknown>();
  private columns = "*";
  constructor(database: FakeSupabase, table: string) {
    this.database = database;
    this.table = table;
  }
  select(columns = "*") {
    this.columns = columns;
    return this;
  }
  eq(column: string, value: unknown) {
    this.equality.set(column, value);
    return this;
  }
  order() { return this; }
  async single() {
    if (this.table !== "assets" || this.database.asset.id !== this.equality.get("id")) {
      return { data: null, error: { message: "missing" } };
    }
    return { data: this.database.assetDetail, error: null };
  }
  async maybeSingle() {
    if (this.table !== "assets") return { data: null, error: null };
    const row = this.database.asset;
    return row.id === this.equality.get("id")
      ? { data: this.columns.includes("metadata") ? row : this.database.assetDetail, error: null }
      : { data: null, error: null };
  }
  then(resolve: (value: { data: Row[]; error: null }) => unknown) {
    const rows = this.table === "versions" ? this.database.versions : [];
    return Promise.resolve({ data: rows, error: null }).then(resolve);
  }
}
class FakeSupabase {
  asset: Row = { id: assetId, metadata: metadata() };
  assetDetail: Row = {
    id: assetId,
    title: "Published film",
    file_type: "video",
    file_url: "/api/media/versions/private-source-a",
    status: "ready",
  };
  versions: Row[] = [
    {
      id: publishedVersionId,
      asset_id: assetId,
      version_number: 2,
      file_url: "/api/media/versions/private-source-a",
      is_current: true,
    },
    {
      id: sourceVersionId,
      asset_id: assetId,
      version_number: 1,
      file_url: "/api/media/versions/private-source-b",
      is_current: false,
    },
  ];
  from(table: string) {
    assert.ok(table === "assets" || table === "versions");
    return new FakeQuery(this, table);
  }
}

test("staff version payload projects published HLS while preserving source fallback", async () => {
  state.__cvpHlsProjectionSupabase = new FakeSupabase();
  state.__cvpHlsProjectionAccessCalls = [];
  asStaff();
  const { GET } = await import(pathToFileURL(routePath).href);
  const response = await GET(new Request("https://admin.contentco-op.com/ignored"), {
    params: Promise.resolve({ id: assetId }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(
    payload.items[0].file_url,
    `/api/assets/${assetId}/versions/${publishedVersionId}/hls/playlist.m3u8`,
  );
  assert.equal(payload.items[0].frame_rate, 24000 / 1001);
  assert.equal(payload.items[1].file_url, "/api/media/versions/private-source-b");
  assert.equal(payload.items[1].frame_rate, null);
  assert.deepEqual(state.__cvpHlsProjectionAccessCalls, [
    { assetId, userId, minimumRole: "viewer" },
  ]);
  assert.equal(JSON.stringify(payload).includes("media_pipeline"), false);
  assert.equal(JSON.stringify(payload).includes("private/staff-playlist"), false);
});

test("staff asset payload projects HLS for the asset and current version without leaking metadata", async () => {
  state.__cvpHlsProjectionSupabase = new FakeSupabase();
  state.__cvpHlsProjectionAccessCalls = [];
  asStaff();
  const { GET } = await import(pathToFileURL(assetRoutePath).href);
  const response = await GET(new Request("https://admin.contentco-op.com/ignored"), {
    params: Promise.resolve({ id: assetId }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  const hlsUrl =
    `/api/assets/${assetId}/versions/${publishedVersionId}/hls/playlist.m3u8`;
  assert.equal(payload.file_url, hlsUrl);
  assert.equal(payload.current_version.file_url, hlsUrl);
  assert.equal(payload.version_count, 2);
  assert.equal(JSON.stringify(payload).includes("media_pipeline"), false);
  assert.equal(JSON.stringify(payload).includes("private/staff-playlist"), false);
});

// Latch-proved live failure (a0580c0e): a client-role session that received a
// staff-only playlist URL got 403 STAFF_REQUIRED and a readyState-0 black
// stage. Client sessions must never see the staff projection at all.
test("client-role sessions never receive staff-only playlist URLs", async () => {
  state.__cvpHlsProjectionSupabase = new FakeSupabase();
  state.__cvpHlsProjectionAccessCalls = [];
  asClient();

  const { GET: getVersions } = await import(pathToFileURL(routePath).href);
  const versionsResponse = await getVersions(new Request("https://client.contentco-op.com/ignored"), {
    params: Promise.resolve({ id: assetId }),
  });
  assert.equal(versionsResponse.status, 200);
  const versionsPayload = await versionsResponse.json();
  assert.equal(
    JSON.stringify(versionsPayload).includes("/hls/playlist.m3u8"),
    false,
    "client sessions keep the plain managed version URL — never the staff playlist",
  );
  assert.equal(versionsPayload.items[0].file_url, "/api/media/versions/private-source-a");

  const { GET: getAsset } = await import(pathToFileURL(assetRoutePath).href);
  const assetResponse = await getAsset(new Request("https://client.contentco-op.com/ignored"), {
    params: Promise.resolve({ id: assetId }),
  });
  assert.equal(assetResponse.status, 200);
  const assetPayload = await assetResponse.json();
  assert.equal(JSON.stringify(assetPayload).includes("/hls/playlist.m3u8"), false);
  assert.equal(assetPayload.file_url, "/api/media/versions/private-source-a");
});
