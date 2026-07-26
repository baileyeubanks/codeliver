import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const routePath = resolve(
  repositoryRoot,
  "app/api/review/media/[admissionId]/route.ts",
);
const admissionId = "11111111-1111-4111-8111-111111111111";
const inviteId = "22222222-2222-4222-8222-222222222222";
const assetId = "33333333-3333-4333-8333-333333333333";
const versionId = "44444444-4444-4444-8444-444444444444";
const objectKey = "tenants/a/objects/b/v1/master.mov";
const providerVersionId = `fs-v1:${"d".repeat(64)}`;
const bytes = Buffer.from("0123456789");

type MediaRouteState = typeof globalThis & {
  __cvpPublicMediaAuthorityCalls: string[];
  __cvpPublicMediaAuthorityResult: Record<string, unknown>;
  __cvpPublicMediaOpenCalls: Array<{
    objectKey: string;
    range?: { start: number; end: number };
    expectation?: { size: number; providerVersionId: string };
  }>;
  __cvpPublicMediaProvider: string;
  __cvpPublicMediaOpenError: Error | null;
};
const state = globalThis as MediaRouteState;

const authorityStub = `data:text/javascript,${encodeURIComponent(`
  export async function authorizeReviewMedia(request, admissionId) {
    globalThis.__cvpPublicMediaAuthorityCalls.push(admissionId);
    return globalThis.__cvpPublicMediaAuthorityResult;
  }
`)}`;
const storageStub = `data:text/javascript,${encodeURIComponent(`
  import { Readable } from "node:stream";
  export function createStorageRuntime() {
    return {
      adapter: {
        kind: globalThis.__cvpPublicMediaProvider,
        async openStoredObjectReadStream(objectKey, range, expectation) {
          globalThis.__cvpPublicMediaOpenCalls.push({ objectKey, range, expectation });
          if (globalThis.__cvpPublicMediaOpenError) {
            throw globalThis.__cvpPublicMediaOpenError;
          }
          const bytes = Buffer.from("0123456789");
          return Readable.from(
            range ? bytes.subarray(range.start, range.end + 1) : bytes
          );
        }
      }
    };
  }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/review/admission-authority") {
      return nextResolve(authorityStub, context);
    }
    if (specifier === "@/lib/storage/runtime") {
      return nextResolve(storageStub, context);
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

function media(overrides: Record<string, unknown> = {}) {
  return {
    admission_id: admissionId,
    invite_id: inviteId,
    asset_id: assetId,
    version_id: versionId,
    admission_expires_at: "2026-07-26T18:00:00.000Z",
    download_enabled: false,
    file_size: bytes.length,
    source_upload_id: "55555555-5555-4555-8555-555555555555",
    storage_provider: "local",
    storage_object_key: objectKey,
    storage_sha256: "c".repeat(64),
    storage_provider_version_id: providerVersionId,
    storage_committed_at: "2026-07-26T10:00:00.000Z",
    original_filename: "master.mov",
    mime_type: "video/quicktime",
    ...overrides,
  };
}

function reset(overrides: Record<string, unknown> = {}) {
  state.__cvpPublicMediaAuthorityCalls = [];
  state.__cvpPublicMediaAuthorityResult = {
    ok: true,
    media: media(overrides),
    claims: {
      admissionId,
      inviteId,
      assetId,
      versionId,
      issuedAt: 1,
      expiresAt: 2,
      admissionExpiresAt: 3,
    },
    setCookie:
      "__Host-cvp_review_admission_test=refreshed; Path=/; HttpOnly; Secure; SameSite=Strict",
  };
  state.__cvpPublicMediaOpenCalls = [];
  state.__cvpPublicMediaProvider = "local";
  state.__cvpPublicMediaOpenError = null;
}

async function route() {
  return import(pathToFileURL(routePath).href);
}

test("an admitted reviewer range-streams the exact receipt through the token-free route", async () => {
  reset();
  const { GET } = await route();
  const response = await GET(
    new Request(
      `https://client.contentco-op.com/api/review/media/${admissionId}`,
      {
        headers: {
          Range: "bytes=2-5",
          "Sec-Fetch-Site": "same-origin",
        },
      },
    ),
    { params: Promise.resolve({ admissionId }) },
  );

  assert.equal(response.status, 206);
  assert.equal(response.headers.get("content-type"), "video/quicktime");
  assert.equal(response.headers.get("content-range"), "bytes 2-5/10");
  assert.equal(response.headers.get("content-length"), "4");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(
    response.headers.get("cross-origin-resource-policy"),
    "same-origin",
  );
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("vary"), "Cookie, Range");
  assert.match(
    response.headers.get("set-cookie") ?? "",
    /^__Host-cvp_review_admission_test=refreshed/,
  );
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.equal(await response.text(), "2345");
  assert.deepEqual(state.__cvpPublicMediaAuthorityCalls, [admissionId]);
  assert.deepEqual(state.__cvpPublicMediaOpenCalls, [{
    objectKey,
    range: { start: 2, end: 5 },
    expectation: {
      size: bytes.length,
      providerVersionId,
    },
  }]);
});

test("HEAD rechecks live authority and verifies the exact stored receipt", async () => {
  reset();
  const { HEAD } = await route();
  const response = await HEAD(
    new Request(
      `https://client.contentco-op.com/api/review/media/${admissionId}`,
    ),
    { params: Promise.resolve({ admissionId }) },
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-length"), "10");
  assert.equal(await response.text(), "");
  assert.deepEqual(state.__cvpPublicMediaAuthorityCalls, [admissionId]);
  assert.deepEqual(state.__cvpPublicMediaOpenCalls, [{
    objectKey,
    range: undefined,
    expectation: {
      size: bytes.length,
      providerVersionId,
    },
  }]);
});

test("HEAD fails closed when the exact stored receipt cannot be opened", async () => {
  reset();
  state.__cvpPublicMediaOpenError = new Error("receipt missing");
  const { HEAD } = await route();
  const response = await HEAD(
    new Request(
      `https://client.contentco-op.com/api/review/media/${admissionId}`,
    ),
    { params: Promise.resolve({ admissionId }) },
  );

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("retry-after"), "15");
  assert.equal(await response.text(), "");
  assert.deepEqual(state.__cvpPublicMediaAuthorityCalls, [admissionId]);
  assert.equal(state.__cvpPublicMediaOpenCalls.length, 1);
});

test("invalid authority, contradictory origin, bad ranges, and receipt mismatch never leak or open bytes", async () => {
  const { GET } = await route();

  reset();
  state.__cvpPublicMediaAuthorityResult = {
    ok: false,
    status: 404,
    code: "REVIEW_MEDIA_NOT_FOUND",
  };
  let response = await GET(
    new Request(
      `https://client.contentco-op.com/api/review/media/${admissionId}`,
    ),
    { params: Promise.resolve({ admissionId }) },
  );
  assert.equal(response.status, 404);
  assert.deepEqual(state.__cvpPublicMediaOpenCalls, []);

  reset();
  response = await GET(
    new Request(
      `https://client.contentco-op.com/api/review/media/${admissionId}`,
      { headers: { Origin: "https://admin.contentco-op.com" } },
    ),
    { params: Promise.resolve({ admissionId }) },
  );
  assert.equal(response.status, 403);
  assert.deepEqual(state.__cvpPublicMediaAuthorityCalls, []);

  for (const range of ["bytes=0-1,3-4", "bytes=99-100"]) {
    reset();
    response = await GET(
      new Request(
        `https://client.contentco-op.com/api/review/media/${admissionId}`,
        { headers: { Range: range } },
      ),
      { params: Promise.resolve({ admissionId }) },
    );
    assert.equal(response.status, 416);
    assert.equal(response.headers.get("content-range"), "bytes */10");
    assert.deepEqual(state.__cvpPublicMediaOpenCalls, []);
  }

  reset();
  state.__cvpPublicMediaProvider = "ccnas";
  response = await GET(
    new Request(
      `https://client.contentco-op.com/api/review/media/${admissionId}`,
    ),
    { params: Promise.resolve({ admissionId }) },
  );
  const body = await response.text();
  assert.equal(response.status, 503);
  assert.equal(body.includes(objectKey), false);
  assert.equal(body.includes(providerVersionId), false);
  assert.deepEqual(state.__cvpPublicMediaOpenCalls, []);

  reset({ storage_object_key: "../outside-receipt" });
  response = await GET(
    new Request(
      `https://client.contentco-op.com/api/review/media/${admissionId}`,
    ),
    { params: Promise.resolve({ admissionId }) },
  );
  assert.equal(response.status, 503);
  assert.deepEqual(state.__cvpPublicMediaOpenCalls, []);
});

test("download policy rejects an explicit download when disabled and never exposes active content", async () => {
  const { GET } = await route();

  reset();
  let response = await GET(
    new Request(
      `https://client.contentco-op.com/api/review/media/${admissionId}?download=1`,
    ),
    { params: Promise.resolve({ admissionId }) },
  );
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("content-disposition"), null);
  assert.deepEqual(state.__cvpPublicMediaOpenCalls, []);

  reset({ mime_type: "text/html", original_filename: "payload.html" });
  response = await GET(
    new Request(
      `https://client.contentco-op.com/api/review/media/${admissionId}`,
    ),
    { params: Promise.resolve({ admissionId }) },
  );
  assert.equal(response.status, 404);
  assert.deepEqual(state.__cvpPublicMediaOpenCalls, []);

  reset({
    download_enabled: true,
    mime_type: "text/html",
    original_filename: "payload.html",
  });
  response = await GET(
    new Request(
      `https://client.contentco-op.com/api/review/media/${admissionId}?download=1`,
    ),
    { params: Promise.resolve({ admissionId }) },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/octet-stream");
  assert.equal(
    response.headers.get("content-disposition"),
    'attachment; filename="payload.html"',
  );
});
