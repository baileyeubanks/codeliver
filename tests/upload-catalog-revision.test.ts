import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { UploadSession } from "../lib/tus/session.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

type RevisionCatalogState = typeof globalThis & {
  __ccoRevisionCatalogRpcCalls: Array<{ name: string; args: Record<string, unknown> }>;
  __ccoRevisionCatalogRpcResult: {
    data: unknown;
    error: { code?: string; message: string } | null;
  };
};

const state = globalThis as RevisionCatalogState;
const dataAuthorityStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function getSupabaseDataSchema() { return "co_production"; }
`)}`;
const supabaseStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function getSupabase() {
    return {
      async rpc(name, args) {
        globalThis.__ccoRevisionCatalogRpcCalls.push({ name, args });
        return globalThis.__ccoRevisionCatalogRpcResult;
      },
      from(table) {
        if (table === "deliverable_items" || table === "deliverables") {
          const chain = {
            select: () => chain,
            eq: () => chain,
            in: () => chain,
            then: (resolve) => resolve({ data: [], error: null }),
          };
          return chain;
        }
        throw new Error("revision catalog attachment must use one atomic RPC");
      }
    };
  }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/supabase") return nextResolve(supabaseStubUrl, context);
    if (specifier === "@/lib/data-authority") return nextResolve(dataAuthorityStubUrl, context);
    if (specifier.startsWith("@/")) {
      const base = resolve(repositoryRoot, specifier.slice(2));
      const path = extname(base) ? base : existsSync(`${base}.ts`) ? `${base}.ts` : `${base}.tsx`;
      return nextResolve(pathToFileURL(path).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const uploadId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";
const assetId = "44444444-4444-4444-8444-444444444444";
const expectedCurrentVersionId = "55555555-5555-4555-8555-555555555555";
const revisionVersionId = "66666666-6666-4666-8666-666666666666";
const objectKey = "tenants/tenant-a/projects/project-a/objects/upload-a/v5/revision.mp4";
const sha256 = "a".repeat(64);
const providerVersionId = `fs-v1:${"c".repeat(64)}`;
const committedAt = "2026-09-22T08:00:00.000Z";

function committedRevision(): UploadSession {
  return {
    schemaVersion: 1,
    id: uploadId,
    tenantKey: "a".repeat(32),
    projectId,
    folderId: null,
    idempotencyKeyHash: "b".repeat(64),
    filename: "revision.mp4",
    mimeType: "video/mp4",
    size: 235000000,
    offset: 235000000,
    version: 5,
    provider: "local",
    providerHandle: { provider: "local", uploadId, opaqueId: `${uploadId}.part` },
    state: "committed",
    expectedSha256: null,
    computedSha256: sha256,
    objectKey,
    receipt: {
      provider: "local",
      objectKey,
      size: 235000000,
      sha256,
      providerVersionId,
      committedAt,
    },
    scan: {
      verdict: "clean",
      engine: "test-scanner",
      signature: null,
      detail: "clean",
      scannedAt: committedAt,
    },
    partCount: 1,
    lastPartSha256: sha256,
    assetId,
    expectedCurrentVersionId,
    versionId: null,
    catalog: { state: "pending", attempts: 0, lastError: null, updatedAt: committedAt },
    derivatives: { state: "blocked", attempts: 0, lastError: "No derivative worker", updatedAt: committedAt },
    recovery: { attempts: 0, lastAction: "none", lastRecoveredAt: null },
    legalHold: false,
    revision: 1,
    createdAt: committedAt,
    updatedAt: committedAt,
    expiresAt: "2026-09-23T08:00:00.000Z",
    lastError: null,
  };
}

function orchestratorFor(session: UploadSession) {
  return {
    async reconcileCatalog(
      requestedUploadId: string,
      requestedTenantId: string,
      reconcile: (current: UploadSession) => Promise<Record<string, unknown>>,
    ) {
      assert.equal(requestedUploadId, uploadId);
      assert.equal(requestedTenantId, userId);
      return reconcile(session);
    },
  };
}

test("a clean committed revision attaches through one receipt-bound expected-current RPC", async () => {
  state.__ccoRevisionCatalogRpcCalls = [];
  state.__ccoRevisionCatalogRpcResult = {
    data: [{
      id: assetId,
      version_id: revisionVersionId,
      version_number: 5,
      file_url: `/api/media/versions/${revisionVersionId}`,
    }],
    error: null,
  };
  const session = committedRevision();
  const { ensureCatalogAsset } = await import(
    pathToFileURL(resolve(repositoryRoot, "app/api/upload/_shared.ts")).href
  );

  const record = await ensureCatalogAsset(orchestratorFor(session) as never, session, userId);

  assert.equal(record?.id, assetId);
  assert.equal(record?.version_id, revisionVersionId);
  assert.deepEqual(state.__ccoRevisionCatalogRpcCalls, [{
    name: "attach_committed_upload_revision",
    args: {
      p_actor_id: userId,
      p_upload_id: uploadId,
      p_asset_id: assetId,
      p_project_id: projectId,
      p_expected_current_version_id: expectedCurrentVersionId,
      p_expected_version_number: 5,
      p_original_filename: "revision.mp4",
      p_mime_type: "video/mp4",
      p_file_size: 235000000,
      p_storage_provider: "local",
      p_storage_object_key: objectKey,
      p_storage_sha256: sha256,
      p_storage_provider_version_id: providerVersionId,
      p_storage_committed_at: committedAt,
    },
  }]);
});

test("revision attachment fails closed before RPC without its expected-current identity", async () => {
  state.__ccoRevisionCatalogRpcCalls = [];
  const session = committedRevision();
  session.expectedCurrentVersionId = null;
  const { ensureCatalogAsset, mapUploadError } = await import(
    pathToFileURL(resolve(repositoryRoot, "app/api/upload/_shared.ts")).href
  );

  await assert.rejects(
    () => ensureCatalogAsset(orchestratorFor(session) as never, session, userId),
    (error) => {
      assert.deepEqual(mapUploadError(error), {
        status: 409,
        code: "UPLOAD_STATE",
        message: "Committed upload is not clean and receipt-bound for revision catalog attachment",
      });
      return true;
    },
  );
  assert.deepEqual(state.__ccoRevisionCatalogRpcCalls, []);
});

test("stale expected-current SQLSTATE is an opaque retryable conflict", async () => {
  state.__ccoRevisionCatalogRpcCalls = [];
  state.__ccoRevisionCatalogRpcResult = {
    data: null,
    error: { code: "40001", message: "private current version details" },
  };
  const session = committedRevision();
  const { ensureCatalogAsset, mapUploadError } = await import(
    pathToFileURL(resolve(repositoryRoot, "app/api/upload/_shared.ts")).href
  );

  await assert.rejects(
    () => ensureCatalogAsset(orchestratorFor(session) as never, session, userId),
    (error) => {
      assert.deepEqual(mapUploadError(error), {
        status: 409,
        code: "UPLOAD_CONFLICT",
        message: "Asset current version changed before revision attachment",
      });
      assert.doesNotMatch(String(error), /private current version/i);
      return true;
    },
  );
});

test("revision migration atomically CASes one immutable current version without rewriting review history", () => {
  const migrationDirectory = resolve(repositoryRoot, "supabase/migrations");
  const matches = readdirSync(migrationDirectory)
    .filter((name) => name.endsWith("_attach_committed_upload_revision.sql"));
  assert.equal(matches.length, 1, "one CLI-created revision attachment migration is required");
  const migration = readFileSync(resolve(migrationDirectory, matches[0]), "utf8");

  assert.match(migration, /CREATE OR REPLACE FUNCTION co_production\.attach_committed_upload_revision/);
  assert.match(migration, /p_expected_current_version_id uuid/);
  assert.match(migration, /p_expected_version_number integer/);
  assert.match(migration, /ADD COLUMN previous_version_id uuid/);
  assert.match(migration, /v_existing\.previous_version_id IS DISTINCT FROM p_expected_current_version_id/);
  assert.match(migration, /SECURITY INVOKER/);
  assert.doesNotMatch(migration, /SECURITY DEFINER/);
  assert.match(migration, /co_production\.upload:/);
  assert.match(migration, /co_production\.object:/);
  assert.match(migration, /co_production\.asset:/);
  assert.match(migration, /co_production\.project_members[\s\S]*role_rank\(member\.role\) >= 60/);
  assert.match(migration, /co_production\.team_members[\s\S]*role_rank\(member\.role\) >= 60/);
  assert.match(migration, /FROM co_production\.assets AS asset[\s\S]*FOR UPDATE/);
  assert.match(migration, /WHERE version\.asset_id = p_asset_id[\s\S]*version\.is_current[\s\S]*FOR UPDATE/);
  assert.match(migration, /v_current_version_id IS DISTINCT FROM p_expected_current_version_id/);
  assert.match(migration, /v_next_version_number IS DISTINCT FROM p_expected_version_number/);
  assert.match(migration, /UPDATE co_production\.versions[\s\S]*SET is_current = false[\s\S]*id = p_expected_current_version_id/);
  assert.match(migration, /INSERT INTO co_production\.versions/);
  assert.match(migration, /UPDATE co_production\.assets[\s\S]*file_url = v_file_url[\s\S]*file_size = p_file_size/);
  assert.match(migration, /version\.source_upload_id = p_upload_id/);
  assert.match(migration, /version\.storage_object_key = p_storage_object_key/);
  assert.match(migration, /v_existing\.storage_sha256 IS DISTINCT FROM p_storage_sha256/);
  assert.match(migration, /REVOKE ALL ON FUNCTION co_production\.attach_committed_upload_revision[\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION co_production\.attach_committed_upload_revision[\s\S]*TO service_role/);
  assert.doesNotMatch(migration, /(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+)?co_production\.(?:review_invites|comments|approval_workflows|approvals|approval_history)/i);
});
