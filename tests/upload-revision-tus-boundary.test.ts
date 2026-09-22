import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { NextRequest } from "next/server.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

type RevisionBoundaryState = typeof globalThis & {
  __ccoRevisionCreateInput: Record<string, unknown> | null;
  __ccoRevisionInitialAuthorityCalls: number;
  __ccoRevisionRecoveredSession: Record<string, unknown> | null;
  __ccoRevisionRecoveryInputs: Array<Record<string, unknown>>;
  __ccoRevisionTargetAuthorityError: Error | null;
  __ccoRevisionTargetAuthorityCalls: Array<Record<string, unknown>>;
};

const state = globalThis as RevisionBoundaryState;
const authStubUrl = `data:text/javascript,${encodeURIComponent(`
  export async function requireAuth() {
    return { id: "33333333-3333-4333-8333-333333333333" };
  }
`)}`;
const configStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function readStorageConfig() {
    return {
      providerWasExplicit: true,
      filesystemRoot: "/configured-test-root",
      writeEnabled: true,
      issues: [],
      maxUploadBytes: 1048576n,
      maxChunkBytes: 1024n
    };
  }
`)}`;
const orchestratorStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function createDefaultUploadOrchestrator() {
    return {
      async recoverAttachedRevisionSession(input) {
        globalThis.__ccoRevisionRecoveryInputs.push(input);
        return globalThis.__ccoRevisionRecoveredSession;
      },
      async createSession(input) {
        globalThis.__ccoRevisionCreateInput = input;
        return {
          session: { id: "11111111-1111-4111-8111-111111111111", offset: 0, state: "receiving" },
          resumed: false
        };
      }
    };
  }
`)}`;
const sharedStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function assertUploadStorageConfigured() {}
  export async function requireOwnedUploadTarget() {
    globalThis.__ccoRevisionInitialAuthorityCalls += 1;
  }
  export async function requireOwnedRevisionUploadTarget(userId, projectId, assetId, expectedCurrentVersionId, filename) {
    globalThis.__ccoRevisionTargetAuthorityCalls.push({ userId, projectId, assetId, expectedCurrentVersionId, filename });
    if (globalThis.__ccoRevisionTargetAuthorityError) throw globalThis.__ccoRevisionTargetAuthorityError;
    return { version: 5 };
  }
  export function jsonUploadError(error, headers) {
    return new Response(JSON.stringify({ error: error.message, code: error.code ?? "UPLOAD_FAILED" }), {
      status: error.code === "UPLOAD_CONFLICT" ? 409 : 500,
      headers: { ...headers, "Content-Type": "application/json" }
    });
  }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/auth") return nextResolve(authStubUrl, context);
    if (specifier === "@/lib/storage/config") return nextResolve(configStubUrl, context);
    if (specifier === "@/lib/tus/orchestrator") return nextResolve(orchestratorStubUrl, context);
    if (specifier === "@/app/api/upload/_shared") return nextResolve(sharedStubUrl, context);
    if (specifier === "@/lib/api/responses") {
      return nextResolve(pathToFileURL(resolve(repositoryRoot, "lib/api/responses.ts")).href, context);
    }
    if (specifier === "@/lib/tus/protocol") {
      return nextResolve(pathToFileURL(resolve(repositoryRoot, "lib/tus/protocol.ts")).href, context);
    }
    return nextResolve(specifier, context);
  },
});

function encodeMetadata(values: Record<string, string>) {
  return Object.entries(values)
    .map(([key, value]) => `${key} ${Buffer.from(value).toString("base64")}`)
    .join(",");
}

function request(metadata: Record<string, string>) {
  return new NextRequest("https://admin.contentco-op.com/api/upload/tus", {
    method: "POST",
    headers: {
      "Tus-Resumable": "1.0.0",
      "Upload-Length": "235000000",
      "Upload-Metadata": encodeMetadata(metadata),
    },
  });
}

function reset() {
  state.__ccoRevisionCreateInput = null;
  state.__ccoRevisionInitialAuthorityCalls = 0;
  state.__ccoRevisionRecoveredSession = null;
  state.__ccoRevisionRecoveryInputs = [];
  state.__ccoRevisionTargetAuthorityError = null;
  state.__ccoRevisionTargetAuthorityCalls = [];
}

test("revision creation pins exact asset and expected-current authority while ignoring client version lineage", async () => {
  reset();
  const { POST } = await import(
    pathToFileURL(resolve(repositoryRoot, "app/api/upload/tus/route.ts")).href
  );
  const projectId = "22222222-2222-4222-8222-222222222222";
  const assetId = "44444444-4444-4444-8444-444444444444";
  const expectedCurrentVersionId = "55555555-5555-4555-8555-555555555555";
  const response = await POST(request({
    projectId,
    idempotencyKey: "schneider-aayush-v5",
    filename: "AAYUSH_PATEL_Interview_v5_1080p.mp4",
    filetype: "video/mp4",
    version: "999",
    assetId,
    expectedCurrentVersionId,
  }));

  assert.equal(response.status, 201);
  assert.equal(state.__ccoRevisionRecoveryInputs.length, 1);
  assert.deepEqual(state.__ccoRevisionTargetAuthorityCalls, [{
    userId: "33333333-3333-4333-8333-333333333333",
    projectId,
    assetId,
    expectedCurrentVersionId,
    filename: "AAYUSH_PATEL_Interview_v5_1080p.mp4",
  }]);
  assert.equal(state.__ccoRevisionInitialAuthorityCalls, 0);
  assert.deepEqual(state.__ccoRevisionCreateInput, {
    tenantId: "33333333-3333-4333-8333-333333333333",
    projectId,
    folderId: undefined,
    idempotencyKey: "schneider-aayush-v5",
    filename: "AAYUSH_PATEL_Interview_v5_1080p.mp4",
    mimeType: "video/mp4",
    size: 235000000,
    version: 5,
    assetId,
    expectedCurrentVersionId,
    expectedSha256: undefined,
  });
});

test("a repeated POST resumes its exact attached revision after current advances", async () => {
  reset();
  const { POST } = await import(
    pathToFileURL(resolve(repositoryRoot, "app/api/upload/tus/route.ts")).href
  );
  const metadata = {
    projectId: "22222222-2222-4222-8222-222222222222",
    idempotencyKey: "schneider-aayush-v5-complete",
    filename: "AAYUSH_PATEL_Interview_v5_1080p.mp4",
    filetype: "video/mp4",
    assetId: "44444444-4444-4444-8444-444444444444",
    expectedCurrentVersionId: "55555555-5555-4555-8555-555555555555",
  };

  const initialResponse = await POST(request(metadata));
  assert.equal(initialResponse.status, 201);
  assert.equal(state.__ccoRevisionTargetAuthorityCalls.length, 1);

  state.__ccoRevisionRecoveredSession = {
    id: "11111111-1111-4111-8111-111111111111",
    offset: 235000000,
    state: "committed",
  };
  state.__ccoRevisionTargetAuthorityError = Object.assign(
    new Error("Asset current version changed before revision upload"),
    { code: "UPLOAD_CONFLICT" },
  );
  state.__ccoRevisionCreateInput = null;
  const response = await POST(request(metadata));

  assert.equal(response.status, 201);
  assert.equal(response.headers.get("Location"), "/api/upload/tus/11111111-1111-4111-8111-111111111111");
  assert.equal(response.headers.get("Upload-Offset"), "235000000");
  assert.equal(response.headers.get("Upload-State"), "committed");
  assert.equal(response.headers.get("X-Upload-Resumed"), "true");
  assert.equal(state.__ccoRevisionRecoveryInputs.length, 2);
  assert.equal(
    state.__ccoRevisionTargetAuthorityCalls.length,
    1,
    "the retry must not rerun the now-stale current-version preflight",
  );
  assert.equal(state.__ccoRevisionCreateInput, null);
});

test("a new stale-current revision attempt remains denied", async () => {
  reset();
  state.__ccoRevisionTargetAuthorityError = Object.assign(
    new Error("Asset current version changed before revision upload"),
    { code: "UPLOAD_CONFLICT" },
  );
  const { POST } = await import(
    pathToFileURL(resolve(repositoryRoot, "app/api/upload/tus/route.ts")).href
  );

  const response = await POST(request({
    projectId: "22222222-2222-4222-8222-222222222222",
    idempotencyKey: "schneider-new-stale-attempt",
    filename: "AAYUSH_PATEL_Interview_v5_1080p.mp4",
    filetype: "video/mp4",
    assetId: "44444444-4444-4444-8444-444444444444",
    expectedCurrentVersionId: "55555555-5555-4555-8555-555555555555",
  }));

  assert.equal(response.status, 409);
  assert.equal(state.__ccoRevisionRecoveryInputs.length, 1);
  assert.equal(state.__ccoRevisionTargetAuthorityCalls.length, 1);
  assert.equal(state.__ccoRevisionCreateInput, null);
});

test("revision metadata must carry asset and expected current together before allocation", async () => {
  reset();
  const { POST } = await import(
    pathToFileURL(resolve(repositoryRoot, "app/api/upload/tus/route.ts")).href
  );
  const response = await POST(request({
    projectId: "22222222-2222-4222-8222-222222222222",
    idempotencyKey: "incomplete-revision",
    filename: "revision.mp4",
    assetId: "44444444-4444-4444-8444-444444444444",
  }));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "assetId and expectedCurrentVersionId metadata are required together",
    code: "INVALID_UPLOAD_METADATA",
  });
  assert.equal(state.__ccoRevisionCreateInput, null);
  assert.deepEqual(state.__ccoRevisionTargetAuthorityCalls, []);
});
