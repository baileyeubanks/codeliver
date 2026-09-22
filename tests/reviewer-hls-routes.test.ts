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
  "app/api/review/media/[admissionId]/hls/playlist.m3u8/route.ts",
);
const segmentRoutePath = resolve(
  repositoryRoot,
  "app/api/review/media/[admissionId]/hls/segments/[index]/route.ts",
);
const admissionId = "11111111-1111-4111-8111-111111111111";
const assetId = "22222222-2222-4222-8222-222222222222";
const versionId = "33333333-3333-4333-8333-333333333333";
const providerVersionId = `fs-v1:${"d".repeat(64)}`;
const playlistObjectKey = "private/review-playlist/playlist.m3u8";
const segmentObjectKeys = [
  "private/review-segment-a/segment000.ts",
  "private/review-segment-b/segment001.ts",
];
const playlist = [
  "#EXTM3U",
  "#EXT-X-VERSION:3",
  "#EXT-X-TARGETDURATION:5",
  "#EXT-X-PLAYLIST-TYPE:VOD",
  "#EXTINF:5.000000,",
  "segment000.ts",
  "#EXTINF:3.000000,",
  "segment001.ts",
  "#EXT-X-ENDLIST",
  "",
].join("\n");
const segmentBytes = [Buffer.from("review-a"), Buffer.from("review-b")];
const refreshedCookie =
  "__Host-cvp_review_admission_test=refreshed; Path=/; HttpOnly; Secure; SameSite=Strict";

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
                "private/review-manifest/hls-manifest.json",
                "{}",
              ),
            },
          },
        },
      },
    },
  };
}

type OpenCall = {
  objectKey: string;
  expectation?: { size: number; providerVersionId: string };
};
type ReviewerHlsState = typeof globalThis & {
  __cvpReviewerHlsBoundaryCalls: string[];
  __cvpReviewerHlsBoundaryResult: { ok: boolean; code?: string; status?: number };
  __cvpReviewerHlsAuthorityCalls: string[];
  __cvpReviewerHlsAuthorityResult: Record<string, unknown>;
  __cvpReviewerHlsSupabase: FakeSupabase;
  __cvpReviewerHlsProvider: string;
  __cvpReviewerHlsRuntimeCalls: number;
  __cvpReviewerHlsOpenCalls: OpenCall[];
  __cvpReviewerHlsOpenError: Error | null;
};
const state = globalThis as ReviewerHlsState;

function dataModule(source: string) {
  return `data:text/javascript,${encodeURIComponent(source)}`;
}
const boundaryStub = dataModule(`
  export function validateReviewReadRequest(request) {
    globalThis.__cvpReviewerHlsBoundaryCalls.push(request.url);
    return globalThis.__cvpReviewerHlsBoundaryResult;
  }
`);
const authorityStub = dataModule(`
  export async function authorizeReviewMedia(_request, admissionId) {
    globalThis.__cvpReviewerHlsAuthorityCalls.push(admissionId);
    return globalThis.__cvpReviewerHlsAuthorityResult;
  }
`);
const supabaseStub = dataModule(`
  export function getSupabase() { return globalThis.__cvpReviewerHlsSupabase; }
`);
const responsesStub = dataModule(`
  function json(error, code, status) {
    return new Response(JSON.stringify({ error, code }), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Referrer-Policy": "no-referrer",
        "Vary": "Cookie"
      }
    });
  }
  export function reviewError(error, code, status) { return json(error, code, status); }
  export function reviewBackendUnavailable() {
    return json("Review service is unavailable", "REVIEW_SERVICE_UNAVAILABLE", 503);
  }
`);
const storageStub = dataModule(`
  import { Readable } from "node:stream";
  export function createStorageRuntime() {
    globalThis.__cvpReviewerHlsRuntimeCalls += 1;
    return {
      adapter: {
        kind: globalThis.__cvpReviewerHlsProvider,
        async openStoredObjectReadStream(objectKey, _range, expectation) {
          globalThis.__cvpReviewerHlsOpenCalls.push({ objectKey, expectation });
          if (globalThis.__cvpReviewerHlsOpenError) throw globalThis.__cvpReviewerHlsOpenError;
          if (objectKey === ${JSON.stringify(playlistObjectKey)}) {
            return Readable.from(Buffer.from(${JSON.stringify(playlist)}));
          }
          const index = ${JSON.stringify(segmentObjectKeys)}.indexOf(objectKey);
          if (index < 0) throw new Error("missing fixture");
          return Readable.from(Buffer.from(index === 0 ? "review-a" : "review-b"));
        }
      }
    };
  }
`);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/review/request-boundary") {
      return nextResolve(boundaryStub, context);
    }
    if (specifier === "@/lib/review/admission-authority") {
      return nextResolve(authorityStub, context);
    }
    if (specifier === "@/lib/supabase") return nextResolve(supabaseStub, context);
    if (specifier === "@/lib/review/responses") return nextResolve(responsesStub, context);
    if (specifier === "@/lib/storage/runtime") return nextResolve(storageStub, context);
    if (specifier === "next/server") return nextResolve("next/server.js", context);
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
  private readonly equality = new Map<string, unknown>();
  private requiresActive = false;

  constructor(database: FakeSupabase) {
    this.database = database;
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
      equality: Object.fromEntries(this.equality),
      requiresActive: this.requiresActive,
    });
    if (this.database.error) return { data: null, error: { message: "backend" } };
    const row = this.database.asset;
    if (!row) return { data: null, error: null };
    for (const [column, value] of this.equality) {
      if (row[column] !== value) return { data: null, error: null };
    }
    if (this.requiresActive && row.deleted_at !== null) return { data: null, error: null };
    return { data: row, error: null };
  }
}

class FakeSupabase {
  asset: Record<string, unknown> | null = {
    id: assetId,
    metadata: publishedMetadata(),
    deleted_at: null,
  };
  error = false;
  lookupCalls: Array<{
    equality: Record<string, unknown>;
    requiresActive: boolean;
  }> = [];

  from(table: string) {
    assert.equal(table, "assets");
    return new FakeQuery(this);
  }
}

function reset() {
  state.__cvpReviewerHlsBoundaryCalls = [];
  state.__cvpReviewerHlsBoundaryResult = { ok: true };
  state.__cvpReviewerHlsAuthorityCalls = [];
  state.__cvpReviewerHlsAuthorityResult = {
    ok: true,
    claims: {
      admissionId,
      inviteId: "44444444-4444-4444-8444-444444444444",
      assetId,
      versionId,
      issuedAt: 1,
      expiresAt: 2,
      admissionExpiresAt: 3,
    },
    media: {
      asset_id: "private-media-identity-must-not-drive-hls",
      version_id: "private-version-identity-must-not-drive-hls",
      storage_object_key: "private/source/master.mov",
    },
    setCookie: refreshedCookie,
  };
  state.__cvpReviewerHlsSupabase = new FakeSupabase();
  state.__cvpReviewerHlsProvider = "local";
  state.__cvpReviewerHlsRuntimeCalls = 0;
  state.__cvpReviewerHlsOpenCalls = [];
  state.__cvpReviewerHlsOpenError = null;
}

async function playlistRoute() {
  return import(pathToFileURL(playlistRoutePath).href);
}

async function segmentRoute() {
  return import(pathToFileURL(segmentRoutePath).href);
}

function request(path: string) {
  return new Request(`https://client.contentco-op.com${path}`, {
    headers: { "Sec-Fetch-Site": "same-origin" },
  });
}

test("reviewer playlist revalidates current admission claims and refreshes the grant", async () => {
  reset();
  const { GET } = await playlistRoute();
  const url = `/api/review/media/${admissionId}/hls/playlist.m3u8`;
  const response = await GET(request(url), {
    params: Promise.resolve({ admissionId }),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/vnd.apple.mpegurl; charset=utf-8");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("vary"), "Cookie");
  assert.equal(response.headers.get("set-cookie"), refreshedCookie);
  const body = await response.text();
  assert.match(body, /#EXTINF:5\.000000,\nsegments\/0\n/);
  assert.equal(body.includes(playlistObjectKey), false);
  assert.equal(body.includes(segmentObjectKeys[0]), false);
  assert.equal(body.includes(providerVersionId), false);
  assert.deepEqual(state.__cvpReviewerHlsBoundaryCalls, [`https://client.contentco-op.com${url}`]);
  assert.deepEqual(state.__cvpReviewerHlsAuthorityCalls, [admissionId]);
  assert.deepEqual(state.__cvpReviewerHlsSupabase.lookupCalls, [
    { equality: { id: assetId }, requiresActive: true },
  ]);
  assert.equal(state.__cvpReviewerHlsRuntimeCalls, 1);
  assert.deepEqual(state.__cvpReviewerHlsOpenCalls, [
    {
      objectKey: playlistObjectKey,
      expectation: { size: Buffer.byteLength(playlist), providerVersionId },
    },
  ]);
});

test("reviewer segment revalidates authority and streams one exact receipt", async () => {
  reset();
  const { GET } = await segmentRoute();
  const url = `/api/review/media/${admissionId}/hls/segments/1`;
  const response = await GET(request(url), {
    params: Promise.resolve({ admissionId, index: "1" }),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "video/mp2t");
  assert.equal(response.headers.get("content-length"), String(segmentBytes[1].length));
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("set-cookie"), refreshedCookie);
  assert.equal(await response.text(), "review-b");
  assert.deepEqual(state.__cvpReviewerHlsAuthorityCalls, [admissionId]);
  assert.equal(state.__cvpReviewerHlsRuntimeCalls, 1);
  assert.deepEqual(state.__cvpReviewerHlsOpenCalls, [
    {
      objectKey: segmentObjectKeys[1],
      expectation: { size: segmentBytes[1].length, providerVersionId },
    },
  ]);
});

test("reviewer routes reject boundary and admission failures before any storage runtime", async () => {
  const { GET } = await playlistRoute();

  reset();
  state.__cvpReviewerHlsBoundaryResult = {
    ok: false,
    code: "REVIEW_ORIGIN_FORBIDDEN",
    status: 403,
  };
  let response = await GET(request("/ignored"), {
    params: Promise.resolve({ admissionId }),
  });
  assert.equal(response.status, 403);
  assert.deepEqual(state.__cvpReviewerHlsAuthorityCalls, []);
  assert.deepEqual(state.__cvpReviewerHlsSupabase.lookupCalls, []);
  assert.equal(state.__cvpReviewerHlsRuntimeCalls, 0);
  assert.deepEqual(state.__cvpReviewerHlsOpenCalls, []);

  reset();
  state.__cvpReviewerHlsAuthorityResult = {
    ok: false,
    code: "REVIEW_MEDIA_NOT_FOUND",
    status: 404,
  };
  response = await GET(request("/ignored"), {
    params: Promise.resolve({ admissionId }),
  });
  assert.equal(response.status, 404);
  assert.deepEqual(state.__cvpReviewerHlsSupabase.lookupCalls, []);
  assert.equal(state.__cvpReviewerHlsRuntimeCalls, 0);
  assert.deepEqual(state.__cvpReviewerHlsOpenCalls, []);
});

test("reviewer routes fail closed when claims do not select the published asset/version", async () => {
  const { GET } = await playlistRoute();

  reset();
  const result = state.__cvpReviewerHlsAuthorityResult as {
    claims: { assetId: string; versionId: string };
  };
  result.claims.versionId = "55555555-5555-4555-8555-555555555555";
  let response = await GET(request("/ignored"), {
    params: Promise.resolve({ admissionId }),
  });
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("set-cookie"), refreshedCookie);
  assert.equal(state.__cvpReviewerHlsRuntimeCalls, 0);
  assert.deepEqual(state.__cvpReviewerHlsOpenCalls, []);

  reset();
  state.__cvpReviewerHlsSupabase.asset = {
    id: assetId,
    metadata: {},
    deleted_at: null,
  };
  response = await GET(request("/ignored"), {
    params: Promise.resolve({ admissionId }),
  });
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("set-cookie"), refreshedCookie);
  assert.equal(state.__cvpReviewerHlsRuntimeCalls, 0);
  assert.deepEqual(state.__cvpReviewerHlsOpenCalls, []);
});

test("reviewer segment indices are strict and authority is checked before storage on every request", async () => {
  const { GET } = await segmentRoute();
  for (const index of ["-1", "01", "2", "1.ts", "9007199254740992"]) {
    reset();
    const response = await GET(request("/ignored"), {
      params: Promise.resolve({ admissionId, index }),
    });
    assert.equal(response.status, 404, index);
    assert.equal(state.__cvpReviewerHlsBoundaryCalls.length, 1, index);
    assert.deepEqual(state.__cvpReviewerHlsAuthorityCalls, [admissionId], index);
    assert.equal(state.__cvpReviewerHlsRuntimeCalls, 0, index);
    assert.deepEqual(state.__cvpReviewerHlsOpenCalls, [], index);
  }
});

test("reviewer storage/provider failures stay opaque and preserve the refreshed grant", async () => {
  const { GET } = await segmentRoute();
  for (const scenario of ["provider", "open"] as const) {
    reset();
    if (scenario === "provider") state.__cvpReviewerHlsProvider = "ccnas";
    else state.__cvpReviewerHlsOpenError = new Error("private receipt drift");
    const response = await GET(request("/ignored"), {
      params: Promise.resolve({ admissionId, index: "0" }),
    });
    const body = await response.text();
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("set-cookie"), refreshedCookie);
    assert.equal(body.includes(segmentObjectKeys[0]), false);
    assert.equal(body.includes(providerVersionId), false);
  }
});
