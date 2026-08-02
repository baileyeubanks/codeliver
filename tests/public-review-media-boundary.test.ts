import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reviewInviteStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function getAuthorizedReviewInvite(request, token) {
    const state = globalThis.__publicReviewMediaBoundaryState;
    state.authorizationCalls.push({ request, token });
    return state.inviteLookup;
  }
  export function reviewInviteErrorPayload(result) {
    return result.passwordRequired
      ? { error: result.error, password_required: true }
      : { error: result.error };
  }
`)}`;
const reviewViewGrantStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function hasValidReviewViewGrant(request, input) {
    const state = globalThis.__publicReviewMediaBoundaryState;
    state.viewGrantCalls.push({ request, input });
    if (state.viewGrantError) throw new Error("view grant unavailable");
    return state.viewGrantValid;
  }
`)}`;
const shareClaimsStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function usesAtomicShareLinkViewClaims() {
    return globalThis.__publicReviewMediaBoundaryState.atomicClaims;
  }
`)}`;
const webhookStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function assertSafeWebhookUrl(reference) {
    const state = globalThis.__publicReviewMediaBoundaryState;
    state.safeUrlCalls.push(reference);
    return reference;
  }
`)}`;
const mediaResponseStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function streamTrustedMediaPath(input) {
    const state = globalThis.__publicReviewMediaBoundaryState;
    state.streamCalls.push(input);
    return new Response("trusted-range-stream", {
      status: 206,
      headers: {
        "Content-Range": "bytes 0-99/1000",
        "Accept-Ranges": "bytes",
      },
    });
  }
`)}`;
const safePathStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function sanitizeMediaFilename(value) {
    return String(value).replace(/[^a-zA-Z0-9._-]/g, "-");
  }
`)}`;
const versionStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function resolveAssetVersion(input) {
    const state = globalThis.__publicReviewMediaBoundaryState;
    state.versionCalls.push(input);
    return state.versionLookup;
  }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/review-invites") {
      return nextResolve(reviewInviteStubUrl, context);
    }
    if (specifier === "@/lib/security/review-view-grant") {
      return nextResolve(reviewViewGrantStubUrl, context);
    }
    if (specifier === "@/lib/sharing/share-claims") {
      return nextResolve(shareClaimsStubUrl, context);
    }
    if (specifier === "@/lib/security/webhook-delivery") {
      return nextResolve(webhookStubUrl, context);
    }
    if (specifier === "@/lib/storage/media-response") {
      return nextResolve(mediaResponseStubUrl, context);
    }
    if (specifier === "@/lib/storage/safe-media-path") {
      return nextResolve(safePathStubUrl, context);
    }
    if (specifier === "@/lib/versions") return nextResolve(versionStubUrl, context);
    if (specifier.startsWith("@/")) {
      const candidate = resolve(repositoryRoot, specifier.slice(2));
      const path = extname(candidate)
        ? candidate
        : existsSync(`${candidate}.ts`)
          ? `${candidate}.ts`
          : `${candidate}.tsx`;
      return nextResolve(pathToFileURL(path).href, context);
    }
    return nextResolve(specifier, context);
  },
});

interface MediaBoundaryState {
  atomicClaims: boolean;
  authorizationCalls: Array<{ request: Request; token: string }>;
  inviteLookup: {
    ok: true;
    invite: {
      id: string;
      asset_id: string;
      version_id: string;
      download_enabled: boolean;
      max_views: number | null;
      watermark_enabled: boolean;
      assets: { title: string };
    };
  };
  safeUrlCalls: string[];
  streamCalls: Array<{
    request: Request;
    requestedPath: string;
    download: boolean;
    downloadName: string;
  }>;
  viewGrantCalls: Array<{
    request: Request;
    input: { token: string; inviteId: string };
  }>;
  viewGrantError: boolean;
  viewGrantValid: boolean;
  versionCalls: Array<{ assetId: string; versionId: string }>;
  versionLookup: {
    ok: true;
    version: { id: string; file_url: string };
  };
}

const runtime = globalThis as typeof globalThis & {
  __publicReviewMediaBoundaryState: MediaBoundaryState;
};
const TOKEN = "opaque-client-review-token";
const VERSION_ID = "00000000-0000-4000-8000-000000000222";
const ORIGINAL_REFERENCE =
  "/api/media/stream?path=client-project%2Fprivate-original.mp4";

function resetState() {
  const state: MediaBoundaryState = {
    atomicClaims: false,
    authorizationCalls: [],
    inviteLookup: {
      ok: true,
      invite: {
        id: "invite-1",
        asset_id: "asset-1",
        version_id: VERSION_ID,
        download_enabled: false,
        max_views: null,
        watermark_enabled: false,
        assets: { title: "Client cut" },
      },
    },
    safeUrlCalls: [],
    streamCalls: [],
    viewGrantCalls: [],
    viewGrantError: false,
    viewGrantValid: false,
    versionCalls: [],
    versionLookup: {
      ok: true,
      version: { id: VERSION_ID, file_url: ORIGINAL_REFERENCE },
    },
  };
  runtime.__publicReviewMediaBoundaryState = state;
  return state;
}

async function mediaGet(request: Request) {
  const routeModule = await import(
    pathToFileURL(
      resolve(repositoryRoot, "app/api/review/[token]/media/route.ts"),
    ).href
  );
  return routeModule.GET(request, { params: Promise.resolve({ token: TOKEN }) });
}

test("public media rejects downloads unless the invite explicitly enables them", async () => {
  const state = resetState();
  const response = await mediaGet(
    new Request(
      `https://co-videopro.com/api/review/${TOKEN}/media?download=1`,
    ),
  );

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: "Downloads are not enabled for this review link",
  });
  assert.equal(state.authorizationCalls.length, 1);
  assert.equal(state.versionCalls.length, 0);
  assert.equal(state.streamCalls.length, 0);
  assert.equal(state.safeUrlCalls.length, 0);
});

test("public media fails closed before storage access when watermarking is required", async () => {
  const state = resetState();
  state.inviteLookup.invite.watermark_enabled = true;

  const response = await mediaGet(
    new Request(`https://co-videopro.com/api/review/${TOKEN}/media`),
  );

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "Watermarked review media is not ready",
    watermark_required: true,
    delivery_ready: false,
  });
  assert.equal(state.versionCalls.length, 0);
  assert.equal(state.streamCalls.length, 0);
  assert.equal(state.safeUrlCalls.length, 0);
});

test("public media binds the exact invite version and delegates byte ranges to trusted storage", async () => {
  const state = resetState();
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error("external fetch must not run for trusted local media");
  }) as typeof fetch;

  try {
    const request = new Request(
      `https://co-videopro.com/api/review/${TOKEN}/media`,
      { headers: { Range: "bytes=0-99" } },
    );
    const response = await mediaGet(request);

    assert.equal(response.status, 206);
    assert.equal(response.headers.get("content-range"), "bytes 0-99/1000");
    assert.equal(await response.text(), "trusted-range-stream");
    assert.deepEqual(state.versionCalls, [
      { assetId: "asset-1", versionId: VERSION_ID },
    ]);
    assert.equal(state.streamCalls.length, 1);
    assert.equal(state.streamCalls[0].request.headers.get("range"), "bytes=0-99");
    assert.equal(
      state.streamCalls[0].requestedPath,
      "client-project/private-original.mp4",
    );
    assert.equal(state.streamCalls[0].download, false);
    assert.equal(response.headers.get("location"), null);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the final allowed isolated view streams with its signed claim grant", async () => {
  const state = resetState();
  state.atomicClaims = true;
  state.inviteLookup.invite.max_views = 1;
  state.viewGrantValid = true;

  const request = new Request(
    `https://co-videopro.com/api/review/${TOKEN}/media`,
    { headers: { cookie: "signed-final-view-claim=present" } },
  );
  const response = await mediaGet(request);

  assert.equal(response.status, 206);
  assert.equal(await response.text(), "trusted-range-stream");
  assert.deepEqual(state.viewGrantCalls.map((call) => call.input), [
    { token: TOKEN, inviteId: "invite-1" },
  ]);
  assert.equal(state.streamCalls.length, 1);
});

test("limited isolated media rejects a missing or invalid view-claim grant", async () => {
  const state = resetState();
  state.atomicClaims = true;
  state.inviteLookup.invite.max_views = 1;

  const response = await mediaGet(
    new Request(`https://co-videopro.com/api/review/${TOKEN}/media`),
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: "Open the review link before using this resource",
  });
  assert.equal(state.viewGrantCalls.length, 1);
  assert.equal(state.versionCalls.length, 0);
  assert.equal(state.streamCalls.length, 0);
});

test("legacy limited media keeps the established session authority", async () => {
  const state = resetState();
  state.inviteLookup.invite.max_views = 1;

  const response = await mediaGet(
    new Request(`https://co-videopro.com/api/review/${TOKEN}/media`),
  );

  assert.equal(response.status, 206);
  assert.equal(state.viewGrantCalls.length, 0);
  assert.equal(state.streamCalls.length, 1);
});

test("public media source never redirects or serializes the stored original URL", () => {
  const routeSource = readFileSync(
    resolve(repositoryRoot, "app/api/review/[token]/media/route.ts"),
    "utf8",
  );
  const trustedHelperSource = readFileSync(
    resolve(repositoryRoot, "lib/storage/media-response.ts"),
    "utf8",
  );
  const downloadGate = routeSource.indexOf(
    "if (download && invite.download_enabled !== true)",
  );
  const watermarkGate = routeSource.indexOf(
    "if (invite.watermark_enabled === true)",
  );
  const versionLookup = routeSource.indexOf("const versionLookup = await resolveAssetVersion");

  assert.ok(downloadGate >= 0 && downloadGate < versionLookup);
  assert.ok(watermarkGate >= 0 && watermarkGate < versionLookup);
  assert.match(
    routeSource,
    /resolveAssetVersion\(\{[\s\S]*?assetId:\s*invite\.asset_id,[\s\S]*?versionId:\s*invite\.version_id,[\s\S]*?\}\)/,
  );
  assert.match(
    routeSource,
    /return streamTrustedMediaPath\(\{[\s\S]*?request,[\s\S]*?requestedPath,[\s\S]*?download,[\s\S]*?downloadName:\s*filename,[\s\S]*?\}\);/,
  );
  assert.match(routeSource, /safeUrl = await assertSafeWebhookUrl\(reference\)/);
  assert.match(routeSource, /fetch\(safeUrl,/);
  assert.doesNotMatch(routeSource, /fetch\(reference,/);
  assert.doesNotMatch(routeSource, /(?:NextResponse|Response)\.redirect\s*\(/);
  assert.doesNotMatch(routeSource, /["']Location["']\s*[:,]/i);
  assert.doesNotMatch(
    routeSource,
    /(?:url|file_url)\s*:\s*(?:reference|versionLookup\.version\.file_url)/,
  );

  assert.match(trustedHelperSource, /request\.headers\.get\("range"\)/);
  assert.match(trustedHelperSource, /responseStatus = 206/);
  assert.match(trustedHelperSource, /headers\["Content-Range"\]/);
  assert.match(trustedHelperSource, /fileHandle\.createReadStream\(streamOptions\)/);
});
