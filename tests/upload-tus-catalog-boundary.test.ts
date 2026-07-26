import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { NextRequest } from "next/server.js";

import type { UploadSession } from "../lib/tus/session.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

type BoundaryState = typeof globalThis & {
  __ccoUploadBoundaryCatalogError: Error | null;
  __ccoUploadBoundaryCreateCalls: number;
  __ccoUploadBoundarySession: UploadSession;
};

const state = globalThis as BoundaryState;

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
      async createSession() {
        globalThis.__ccoUploadBoundaryCreateCalls += 1;
        return {
          session: globalThis.__ccoUploadBoundarySession,
          resumed: false
        };
      },
      async appendPart() {
        return { session: globalThis.__ccoUploadBoundarySession, complete: true };
      },
      async getSession() {
        return globalThis.__ccoUploadBoundarySession;
      },
      async recoverSession() {
        return globalThis.__ccoUploadBoundarySession;
      },
      releaseReadiness() {
        return {
          derivativeState: "blocked",
          originalReady: true,
          signedDeliveryReady: false,
          failClosed: true
        };
      }
    };
  }
`)}`;
const sharedStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function assertUploadStorageConfigured() {}
  export async function requireOwnedUploadTarget() {}

  export async function ensureCatalogAsset() {
    if (globalThis.__ccoUploadBoundaryCatalogError) {
      throw globalThis.__ccoUploadBoundaryCatalogError;
    }
    return {
      id: globalThis.__ccoUploadBoundarySession.assetId,
      version_id: globalThis.__ccoUploadBoundarySession.versionId
    };
  }

  export function mapUploadError(error) {
    if (error && error.code === "BACKEND_UNAVAILABLE") {
      return {
        status: 503,
        code: "BACKEND_UNAVAILABLE",
        message: "Backend service is unavailable",
        retryAfter: "15"
      };
    }
    return {
      status: 500,
      code: "UPLOAD_FAILED",
      message: "Upload orchestration failed"
    };
  }

  export function jsonUploadError(error, headers) {
    const mapped = mapUploadError(error);
    return new Response(
      JSON.stringify({ error: mapped.message, code: mapped.code }),
      {
        status: mapped.status,
        headers: {
          ...headers,
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          ...(mapped.retryAfter ? { "Retry-After": mapped.retryAfter } : {})
        }
      }
    );
  }

  export async function* requestBodyChunks() {}
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/auth") return nextResolve(authStubUrl, context);
    if (specifier === "@/lib/storage/config") {
      return nextResolve(configStubUrl, context);
    }
    if (specifier === "@/lib/tus/orchestrator") {
      return nextResolve(orchestratorStubUrl, context);
    }
    if (specifier === "@/app/api/upload/_shared") {
      return nextResolve(sharedStubUrl, context);
    }
    if (specifier === "@/lib/api/responses") {
      return nextResolve(
        pathToFileURL(resolve(repositoryRoot, "lib/api/responses.ts")).href,
        context,
      );
    }
    if (specifier === "@/lib/tus/protocol") {
      return nextResolve(
        pathToFileURL(resolve(repositoryRoot, "lib/tus/protocol.ts")).href,
        context,
      );
    }
    return nextResolve(specifier, context);
  },
});

const uploadId = "11111111-1111-4111-8111-111111111111";
const now = "2026-07-26T06:00:00.000Z";

function committedSession(): UploadSession {
  return {
    schemaVersion: 1,
    id: uploadId,
    tenantKey: "a".repeat(32),
    projectId: "22222222-2222-4222-8222-222222222222",
    folderId: null,
    idempotencyKeyHash: "b".repeat(64),
    filename: "master.mov",
    mimeType: "video/quicktime",
    size: 7,
    offset: 7,
    version: 1,
    provider: "local",
    providerHandle: {
      provider: "local",
      uploadId,
      opaqueId: `${uploadId}.part`,
    },
    state: "committed",
    expectedSha256: null,
    computedSha256: "c".repeat(64),
    objectKey: "tenants/tenant/project/object/v1/master.mov",
    receipt: {
      provider: "local",
      objectKey: "tenants/tenant/project/object/v1/master.mov",
      size: 7,
      sha256: "c".repeat(64),
      providerVersionId: "fs-v1:" + "d".repeat(64),
      committedAt: now,
    },
    scan: {
      verdict: "clean",
      engine: "test",
      signature: null,
      detail: "clean",
      scannedAt: now,
    },
    partCount: 1,
    lastPartSha256: "c".repeat(64),
    assetId: null,
    versionId: null,
    catalog: {
      state: "error",
      attempts: 1,
      lastError: "catalog unavailable",
      updatedAt: now,
    },
    derivatives: {
      state: "blocked",
      attempts: 0,
      lastError: "No derivative worker",
      updatedAt: now,
    },
    recovery: {
      attempts: 0,
      lastAction: "none",
      lastRecoveredAt: null,
    },
    legalHold: false,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    expiresAt: "2026-07-27T06:00:00.000Z",
    lastError: null,
  };
}

test("final PATCH is retriable 503 when committed bytes cannot attach asset plus V1", async () => {
  state.__ccoUploadBoundarySession = committedSession();
  state.__ccoUploadBoundaryCatalogError = Object.assign(
    new Error("private database details"),
    { code: "BACKEND_UNAVAILABLE" },
  );
  const { PATCH } = await import(
    pathToFileURL(
      resolve(repositoryRoot, "app/api/upload/tus/[uploadId]/route.ts"),
    ).href
  );
  const response = await PATCH(
    new NextRequest(`https://admin.contentco-op.com/api/upload/tus/${uploadId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/offset+octet-stream",
        "Tus-Resumable": "1.0.0",
        "Upload-Offset": "0",
      },
      body: new Uint8Array([1]),
      duplex: "half",
    }),
    { params: Promise.resolve({ uploadId }) },
  );

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("retry-after"), "15");
  assert.deepEqual(await response.json(), {
    error: "Backend service is unavailable",
    code: "BACKEND_UNAVAILABLE",
  });
});

test("recovery HEAD is retriable 503 while asset plus V1 attachment is unavailable", async () => {
  state.__ccoUploadBoundarySession = committedSession();
  state.__ccoUploadBoundaryCatalogError = Object.assign(
    new Error("private database details"),
    { code: "BACKEND_UNAVAILABLE" },
  );
  const { HEAD } = await import(
    pathToFileURL(
      resolve(repositoryRoot, "app/api/upload/tus/[uploadId]/route.ts"),
    ).href
  );
  const response = await HEAD(
    new NextRequest(`https://admin.contentco-op.com/api/upload/tus/${uploadId}`, {
      method: "HEAD",
    }),
    { params: Promise.resolve({ uploadId }) },
  );

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("retry-after"), "15");
  assert.equal(await response.text(), "");
});

test("initial upload rejects non-V1 metadata before storage allocation", async () => {
  state.__ccoUploadBoundarySession = {
    ...committedSession(),
    state: "receiving",
    offset: 0,
    objectKey: null,
    receipt: null,
    computedSha256: null,
  };
  state.__ccoUploadBoundaryCreateCalls = 0;
  const { POST } = await import(
    pathToFileURL(resolve(repositoryRoot, "app/api/upload/tus/route.ts")).href
  );
  const metadata = {
    filename: "master.mov",
    projectId: "22222222-2222-4222-8222-222222222222",
    idempotencyKey: "browser-attempt-1",
    version: "2",
  };
  const encodedMetadata = Object.entries(metadata)
    .map(([key, value]) => `${key} ${Buffer.from(value).toString("base64")}`)
    .join(",");
  const response = await POST(
    new NextRequest("https://admin.contentco-op.com/api/upload/tus", {
      method: "POST",
      headers: {
        "Tus-Resumable": "1.0.0",
        "Upload-Length": "7",
        "Upload-Metadata": encodedMetadata,
      },
    }),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Initial uploads must create V1",
    code: "INVALID_UPLOAD_METADATA",
  });
  assert.equal(state.__ccoUploadBoundaryCreateCalls, 0);
});

test("successful recovery advertises both durable asset and exact version identities", async () => {
  state.__ccoUploadBoundarySession = {
    ...committedSession(),
    assetId: "44444444-4444-4444-8444-444444444444",
    versionId: "55555555-5555-4555-8555-555555555555",
    catalog: {
      state: "attached",
      attempts: 1,
      lastError: null,
      updatedAt: now,
    },
  };
  state.__ccoUploadBoundaryCatalogError = null;
  const { HEAD } = await import(
    pathToFileURL(
      resolve(repositoryRoot, "app/api/upload/tus/[uploadId]/route.ts"),
    ).href
  );
  const response = await HEAD(
    new NextRequest(`https://admin.contentco-op.com/api/upload/tus/${uploadId}`, {
      method: "HEAD",
    }),
    { params: Promise.resolve({ uploadId }) },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.headers.get("upload-asset") ?? "null"), {
    id: "44444444-4444-4444-8444-444444444444",
  });
  assert.deepEqual(JSON.parse(response.headers.get("upload-version") ?? "null"), {
    id: "55555555-5555-4555-8555-555555555555",
    number: 1,
  });
  assert.match(
    response.headers.get("access-control-expose-headers") ?? "",
    /Upload-Version/,
  );
});
