import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { UploadSession } from "../lib/tus/session.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

interface RpcCall {
  name: string;
  args: Record<string, unknown>;
}

type CatalogTestState = typeof globalThis & {
  __ccoUploadCatalogDataSchema: "public" | "co_production";
  __ccoUploadCatalogRpcCalls: RpcCall[];
  __ccoUploadCatalogRpcResult: {
    data: unknown;
    error: { code?: string; message: string } | null;
  };
};

const state = globalThis as CatalogTestState;
const dataAuthorityStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function getSupabaseDataSchema() {
    return globalThis.__ccoUploadCatalogDataSchema;
  }
`)}`;
const supabaseStubUrl = `data:text/javascript,${encodeURIComponent(`
  export function getSupabase() {
    return {
      async rpc(name, args) {
        globalThis.__ccoUploadCatalogRpcCalls.push({ name, args });
        return globalThis.__ccoUploadCatalogRpcResult;
      },
      from() {
        throw new Error("upload catalog reconciliation must use one atomic RPC");
      }
    };
  }
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "@/lib/supabase") {
      return nextResolve(supabaseStubUrl, context);
    }
    if (specifier === "@/lib/data-authority") {
      return nextResolve(dataAuthorityStubUrl, context);
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

const uploadId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";
const assetId = "44444444-4444-4444-8444-444444444444";
const versionId = "55555555-5555-4555-8555-555555555555";
const objectKey =
  "tenants/tenant-a/projects/project-a/objects/upload-a/v1/master.mov";
const sha256 = "a".repeat(64);
const providerVersionId = "fs-v1:" + "c".repeat(64);
const committedAt = "2026-07-26T06:00:00.000Z";

function committedSession(): UploadSession {
  return {
    schemaVersion: 1,
    id: uploadId,
    tenantKey: "a".repeat(32),
    projectId,
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
    computedSha256: sha256,
    objectKey,
    receipt: {
      provider: "local",
      objectKey,
      size: 7,
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
    assetId: null,
    versionId: null,
    catalog: {
      state: "pending",
      attempts: 0,
      lastError: null,
      updatedAt: committedAt,
    },
    derivatives: {
      state: "blocked",
      attempts: 0,
      lastError: "No derivative worker",
      updatedAt: committedAt,
    },
    recovery: {
      attempts: 0,
      lastAction: "none",
      lastRecoveredAt: null,
    },
    legalHold: false,
    revision: 1,
    createdAt: committedAt,
    updatedAt: committedAt,
    expiresAt: "2026-07-27T06:00:00.000Z",
    lastError: null,
  };
}

test("a committed upload reconciles its asset and exact V1 through one atomic RPC", async () => {
  state.__ccoUploadCatalogDataSchema = "co_production";
  state.__ccoUploadCatalogRpcCalls = [];
  state.__ccoUploadCatalogRpcResult = {
    data: [{
      id: assetId,
      version_id: versionId,
      version_number: 1,
      file_url: `/api/media/versions/${versionId}`,
    }],
    error: null,
  };

  const session = committedSession();
  const orchestrator = {
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
  const { ensureCatalogAsset } = await import(
    pathToFileURL(resolve(repositoryRoot, "app/api/upload/_shared.ts")).href
  );

  const record = await ensureCatalogAsset(
    orchestrator as never,
    session,
    userId,
  );

  assert.equal(record?.id, assetId);
  assert.equal(record?.version_id, versionId);
  assert.deepEqual(state.__ccoUploadCatalogRpcCalls, [{
    name: "attach_committed_upload_v1",
    args: {
      p_actor_id: userId,
      p_upload_id: uploadId,
      p_expected_asset_id: null,
      p_project_id: projectId,
      p_folder_id: null,
      p_title: "master",
      p_file_type: "video",
      p_original_filename: "master.mov",
      p_mime_type: "video/quicktime",
      p_file_size: 7,
      p_storage_provider: "local",
      p_storage_object_key: objectKey,
      p_storage_sha256: sha256,
      p_storage_provider_version_id: providerVersionId,
      p_storage_committed_at: committedAt,
    },
  }]);
});

test("catalog reconciliation binds a remembered legacy asset id inside the RPC", async () => {
  state.__ccoUploadCatalogDataSchema = "co_production";
  state.__ccoUploadCatalogRpcCalls = [];
  state.__ccoUploadCatalogRpcResult = {
    data: [{
      id: assetId,
      version_id: versionId,
      version_number: 1,
      file_url: `/api/media/versions/${versionId}`,
    }],
    error: null,
  };
  const session = committedSession();
  session.assetId = assetId;
  const orchestrator = {
    async reconcileCatalog(
      _requestedUploadId: string,
      _requestedTenantId: string,
      reconcile: (current: UploadSession) => Promise<Record<string, unknown>>,
    ) {
      return reconcile(session);
    },
  };
  const { ensureCatalogAsset } = await import(
    pathToFileURL(resolve(repositoryRoot, "app/api/upload/_shared.ts")).href
  );

  await ensureCatalogAsset(orchestrator as never, session, userId);

  assert.equal(
    state.__ccoUploadCatalogRpcCalls[0]?.args.p_expected_asset_id,
    assetId,
  );
});

test("legacy public data schema fails closed instead of using sequential catalog writes", async () => {
  state.__ccoUploadCatalogDataSchema = "public";
  state.__ccoUploadCatalogRpcCalls = [];
  state.__ccoUploadCatalogRpcResult = {
    data: [{
      id: assetId,
      version_id: versionId,
      version_number: 1,
      file_url: `/api/media/versions/${versionId}`,
    }],
    error: null,
  };
  const session = committedSession();
  const orchestrator = {
    async reconcileCatalog(
      _requestedUploadId: string,
      _requestedTenantId: string,
      reconcile: (current: UploadSession) => Promise<Record<string, unknown>>,
    ) {
      return reconcile(session);
    },
  };
  const { ensureCatalogAsset, mapUploadError } = await import(
    pathToFileURL(resolve(repositoryRoot, "app/api/upload/_shared.ts")).href
  );

  await assert.rejects(
    () => ensureCatalogAsset(orchestrator as never, session, userId),
    (error) => {
      assert.deepEqual(mapUploadError(error), {
        status: 503,
        code: "BACKEND_UNAVAILABLE",
        message: "Backend service is unavailable",
        retryAfter: "15",
      });
      return true;
    },
  );
  assert.deepEqual(state.__ccoUploadCatalogRpcCalls, []);
});

test("catalog provider errors become opaque retriable backend failures", async () => {
  state.__ccoUploadCatalogDataSchema = "co_production";
  state.__ccoUploadCatalogRpcCalls = [];
  state.__ccoUploadCatalogRpcResult = {
    data: null,
    error: { message: "private database relation and policy details" },
  };
  const session = committedSession();
  const orchestrator = {
    async reconcileCatalog(
      _requestedUploadId: string,
      _requestedTenantId: string,
      reconcile: (current: UploadSession) => Promise<Record<string, unknown>>,
    ) {
      return reconcile(session);
    },
  };
  const { ensureCatalogAsset, mapUploadError } = await import(
    pathToFileURL(resolve(repositoryRoot, "app/api/upload/_shared.ts")).href
  );

  await assert.rejects(
    () => ensureCatalogAsset(orchestrator as never, session, userId),
    (error) => {
      assert.deepEqual(mapUploadError(error), {
        status: 503,
        code: "BACKEND_UNAVAILABLE",
        message: "Backend service is unavailable",
        retryAfter: "15",
      });
      assert.doesNotMatch(String(error), /relation|policy|private database/i);
      return true;
    },
  );
  assert.equal(state.__ccoUploadCatalogRpcCalls.length, 1);
});

test("catalog attachment requires a durable clean scan before the RPC", async () => {
  state.__ccoUploadCatalogDataSchema = "co_production";
  state.__ccoUploadCatalogRpcCalls = [];
  state.__ccoUploadCatalogRpcResult = {
    data: [{
      id: assetId,
      version_id: versionId,
      version_number: 1,
      file_url: `/api/media/versions/${versionId}`,
    }],
    error: null,
  };
  const session = committedSession();
  session.scan = {
    ...session.scan!,
    verdict: "pending",
  };
  const orchestrator = {
    async reconcileCatalog(
      _requestedUploadId: string,
      _requestedTenantId: string,
      reconcile: (current: UploadSession) => Promise<Record<string, unknown>>,
    ) {
      return reconcile(session);
    },
  };
  const { ensureCatalogAsset, mapUploadError } = await import(
    pathToFileURL(resolve(repositoryRoot, "app/api/upload/_shared.ts")).href
  );

  await assert.rejects(
    () => ensureCatalogAsset(orchestrator as never, session, userId),
    (error) => {
      assert.deepEqual(mapUploadError(error), {
        status: 409,
        code: "UPLOAD_STATE",
        message:
          "Committed upload is not clean and receipt-bound for V1 catalog attachment",
      });
      return true;
    },
  );
  assert.deepEqual(state.__ccoUploadCatalogRpcCalls, []);
});

test("catalog SQLSTATEs preserve authority and conflict semantics without leaking details", async () => {
  state.__ccoUploadCatalogDataSchema = "co_production";
  const session = committedSession();
  const orchestrator = {
    async reconcileCatalog(
      _requestedUploadId: string,
      _requestedTenantId: string,
      reconcile: (current: UploadSession) => Promise<Record<string, unknown>>,
    ) {
      return reconcile(session);
    },
  };
  const { ensureCatalogAsset, mapUploadError } = await import(
    pathToFileURL(resolve(repositoryRoot, "app/api/upload/_shared.ts")).href
  );
  const cases = [
    {
      sqlstate: "42501",
      expected: {
        status: 403,
        code: "UPLOAD_FORBIDDEN",
        message: "Upload catalog authority denied",
      },
    },
    {
      sqlstate: "22023",
      expected: {
        status: 409,
        code: "UPLOAD_STATE",
        message: "Committed upload is not valid for V1 catalog attachment",
      },
    },
    {
      sqlstate: "23505",
      expected: {
        status: 409,
        code: "UPLOAD_CONFLICT",
        message: "Committed upload conflicts with existing catalog state",
      },
    },
  ] as const;

  for (const { sqlstate, expected } of cases) {
    state.__ccoUploadCatalogRpcCalls = [];
    state.__ccoUploadCatalogRpcResult = {
      data: null,
      error: {
        code: sqlstate,
        message: "private database details that must stay private",
      },
    };
    await assert.rejects(
      () => ensureCatalogAsset(orchestrator as never, session, userId),
      (error) => {
        assert.deepEqual(mapUploadError(error), expected);
        assert.doesNotMatch(String(error), /private database details/i);
        return true;
      },
    );
    assert.equal(state.__ccoUploadCatalogRpcCalls.length, 1);
  }
});

test("catalog attachment refuses a receipt that is not bound to the committed object", async () => {
  state.__ccoUploadCatalogDataSchema = "co_production";
  state.__ccoUploadCatalogRpcCalls = [];
  const session = committedSession();
  session.receipt = {
    ...session.receipt!,
    sha256: "d".repeat(64),
  };
  const orchestrator = {
    async reconcileCatalog(
      _requestedUploadId: string,
      _requestedTenantId: string,
      reconcile: (current: UploadSession) => Promise<Record<string, unknown>>,
    ) {
      return reconcile(session);
    },
  };
  const { ensureCatalogAsset, mapUploadError } = await import(
    pathToFileURL(resolve(repositoryRoot, "app/api/upload/_shared.ts")).href
  );

  await assert.rejects(
    () => ensureCatalogAsset(orchestrator as never, session, userId),
    (error) => {
      assert.deepEqual(mapUploadError(error), {
        status: 409,
        code: "UPLOAD_STATE",
        message:
          "Committed upload is not clean and receipt-bound for V1 catalog attachment",
      });
      return true;
    },
  );
  assert.deepEqual(state.__ccoUploadCatalogRpcCalls, []);
});

test("every accepted filename produces a bounded nonempty catalog title", async () => {
  state.__ccoUploadCatalogDataSchema = "co_production";
  const { ensureCatalogAsset } = await import(
    pathToFileURL(resolve(repositoryRoot, "app/api/upload/_shared.ts")).href
  );

  for (const [filename, expectedTitle] of [
    [".mov", ".mov"],
    [`${"a".repeat(508)}.mov`, "a".repeat(500)],
  ] as const) {
    state.__ccoUploadCatalogRpcCalls = [];
    state.__ccoUploadCatalogRpcResult = {
      data: [{
        id: assetId,
        version_id: versionId,
        version_number: 1,
        file_url: `/api/media/versions/${versionId}`,
      }],
      error: null,
    };
    const session = committedSession();
    session.filename = filename;
    const orchestrator = {
      async reconcileCatalog(
        _requestedUploadId: string,
        _requestedTenantId: string,
        reconcile: (current: UploadSession) => Promise<Record<string, unknown>>,
      ) {
        return reconcile(session);
      },
    };

    await ensureCatalogAsset(orchestrator as never, session, userId);

    assert.equal(
      state.__ccoUploadCatalogRpcCalls[0]?.args.p_title,
      expectedTitle,
      filename,
    );
  }
});

test("the catalog RPC owns one atomic, idempotent, service-only asset plus V1 transaction", () => {
  const migration = readFileSync(
    resolve(
      repositoryRoot,
      "supabase/migrations/20260726084644_atomic_upload_catalog_v1.sql",
    ),
    "utf8",
  );

  assert.match(migration, /\bBEGIN;/);
  assert.match(migration, /ALTER TABLE co_production\.versions/);
  assert.match(migration, /source_upload_id uuid/);
  assert.match(migration, /storage_provider text/);
  assert.match(migration, /storage_object_key text/);
  assert.match(migration, /storage_sha256 text/);
  assert.match(migration, /original_filename text/);
  assert.match(migration, /mime_type text/);
  for (const parameter of [
    "p_file_size",
    "p_storage_provider",
    "p_storage_object_key",
    "p_storage_sha256",
    "p_storage_provider_version_id",
    "p_title",
    "p_file_type",
    "p_original_filename",
    "p_mime_type",
  ]) {
    assert.match(
      migration,
      new RegExp(`${parameter} IS NULL`),
      `${parameter} must reject SQL NULL explicitly`,
    );
  }
  assert.match(
    migration,
    /source_upload_id IS NOT NULL[\s\S]*file_size IS NOT NULL/,
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX versions_source_upload_unique_idx[\s\S]*source_upload_id/,
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX versions_storage_object_unique_idx[\s\S]*storage_provider[\s\S]*storage_object_key/,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION co_production\.attach_committed_upload_v1/,
  );
  assert.match(migration, /p_expected_asset_id uuid/);
  assert.match(migration, /SECURITY INVOKER/);
  assert.doesNotMatch(migration, /SECURITY DEFINER/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /co_production\.project_members/);
  assert.match(migration, /co_production\.team_members/);
  assert.match(migration, /co_production\.folders/);
  assert.match(migration, /INSERT INTO co_production\.assets/);
  assert.match(migration, /INSERT INTO co_production\.versions/);
  assert.match(migration, /version_number[\s\S]*\b1\b/);
  assert.match(migration, /is_current[\s\S]*true/);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION co_production\.attach_committed_upload_v1[\s\S]*FROM PUBLIC, anon, authenticated/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION co_production\.attach_committed_upload_v1[\s\S]*TO service_role/,
  );
  assert.match(
    migration,
    /REVOKE SELECT, INSERT, DELETE ON TABLE co_production\.versions FROM authenticated/,
  );
  assert.match(
    migration,
    /REVOKE UPDATE ON TABLE co_production\.versions FROM authenticated/,
  );
  assert.match(
    migration,
    /REVOKE UPDATE \([\s\S]*file_url[\s\S]*file_size[\s\S]*is_current[\s\S]*\)[\s\S]*ON co_production\.versions FROM authenticated/,
  );
  assert.match(migration, /DROP POLICY versions_insert ON co_production\.versions/);
  assert.match(migration, /DROP POLICY versions_update ON co_production\.versions/);
  assert.match(migration, /DROP POLICY versions_delete ON co_production\.versions/);
  const authenticatedVersionProjection = migration.match(
    /GRANT SELECT \(([^)]+)\)[\s\S]*?ON co_production\.versions TO authenticated/,
  )?.[1];
  assert.ok(
    authenticatedVersionProjection,
    "authenticated version reads must use an explicit safe projection",
  );
  assert.doesNotMatch(
    authenticatedVersionProjection,
    /source_upload_id|storage_provider|storage_object_key|storage_sha256|storage_provider_version_id|storage_committed_at|original_filename|mime_type/,
  );
  assert.match(
    migration,
    /REVOKE SELECT, INSERT, DELETE ON TABLE co_production\.assets FROM authenticated/,
  );
  assert.match(
    migration,
    /REVOKE UPDATE ON TABLE co_production\.assets FROM authenticated/,
  );
  assert.match(
    migration,
    /REVOKE UPDATE \([\s\S]*file_url[\s\S]*nas_path[\s\S]*file_size[\s\S]*status[\s\S]*deleted_at[\s\S]*\)[\s\S]*ON co_production\.assets FROM authenticated/,
  );
  assert.match(migration, /DROP POLICY assets_insert ON co_production\.assets/);
  assert.match(migration, /DROP POLICY assets_update ON co_production\.assets/);
  assert.match(migration, /DROP POLICY assets_delete ON co_production\.assets/);
  const authenticatedAssetProjection = migration.match(
    /GRANT SELECT \(([^)]+)\)[\s\S]*?ON co_production\.assets TO authenticated/,
  )?.[1];
  assert.ok(
    authenticatedAssetProjection,
    "authenticated asset reads must use an explicit safe projection",
  );
  assert.doesNotMatch(authenticatedAssetProjection, /nas_path|metadata/);
  assert.doesNotMatch(migration, /CREATE UNIQUE INDEX assets_storage_object_unique_idx/);
  assert.match(
    migration,
    /FROM co_production\.assets AS asset[\s\S]*WHERE asset\.nas_path = p_storage_object_key[\s\S]*IF v_partial_asset_count > 1/,
  );
  const existingVersionFastPathIndex = migration.indexOf(
    "  IF v_existing.version_id IS NOT NULL THEN",
  );
  const globalAssetCountIndex = migration.indexOf(
    "  SELECT count(*)::integer\n  INTO v_partial_asset_count",
  );
  const contaminationGuardIndex = migration.indexOf(
    "  IF v_partial_asset_count > 1 THEN",
  );
  assert.ok(existingVersionFastPathIndex > -1);
  assert.doesNotMatch(
    migration,
    /SELECT count\(\*\)::integer[\s\S]*?\bIF FOUND THEN\b/,
    "aggregate queries must not redefine whether the exact-version retry row existed",
  );
  assert.ok(
    globalAssetCountIndex > -1 &&
      globalAssetCountIndex < existingVersionFastPathIndex,
    "global storage-object cardinality must be checked before the exact-version retry fast path",
  );
  assert.ok(
    contaminationGuardIndex > globalAssetCountIndex &&
      contaminationGuardIndex < existingVersionFastPathIndex,
    "duplicate inherited assets must fail closed before an idempotent retry can return",
  );
  assert.match(
    migration,
    /IF v_existing\.version_id IS NOT NULL THEN[\s\S]*v_partial_asset_count IS DISTINCT FROM 1[\s\S]*RETURN QUERY/,
  );
  assert.match(
    migration,
    /IF v_existing\.version_id IS NOT NULL THEN[\s\S]*p_expected_asset_id IS NOT NULL[\s\S]*v_existing\.asset_id IS DISTINCT FROM p_expected_asset_id/,
    "idempotent retries must stay bound to a remembered asset id",
  );
  assert.match(
    migration,
    /v_partial_asset_project_id IS DISTINCT FROM p_project_id/,
  );
  assert.match(
    migration,
    /IF v_partial_asset_count = 1 THEN[\s\S]*p_expected_asset_id IS NOT NULL[\s\S]*v_asset_id IS DISTINCT FROM p_expected_asset_id/,
    "legacy partial adoption must not rebind a remembered asset id",
  );
  assert.match(
    migration,
    /ELSE[\s\S]*IF p_expected_asset_id IS NOT NULL THEN[\s\S]*USING ERRCODE = '23505';[\s\S]*INSERT INTO co_production\.assets/,
    "a missing remembered asset must conflict instead of creating a replacement",
  );
  assert.match(
    migration,
    /asset\.folder_id IS DISTINCT FROM p_folder_id[\s\S]*asset\.title IS DISTINCT FROM btrim\(p_title\)[\s\S]*asset\.file_type IS DISTINCT FROM p_file_type[\s\S]*asset\.deleted_at IS NOT NULL/,
  );
  assert.match(
    migration,
    /asset\.status IS DISTINCT FROM 'ready'[\s\S]*asset\.metadata IS DISTINCT FROM '\{\}'::jsonb[\s\S]*asset\.created_at IS DISTINCT FROM asset\.updated_at/,
    "only the exact untouched legacy partial state may be adopted",
  );
  assert.match(
    migration,
    /p_storage_provider NOT IN \('local', 'ccnas'\)[\s\S]*p_storage_provider = 'local'[\s\S]*asset\.file_url IS NOT NULL[\s\S]*p_storage_provider = 'ccnas'[\s\S]*asset\.file_url IS DISTINCT FROM[\s\S]*pg_catalog\.replace\(p_storage_object_key, '\/', '%2F'\)/,
    "legacy adoption must prove the provider-specific URL written by the retired canonical writer",
  );
  for (const dependentTable of [
    "reviews",
    "approval_workflows",
    "approvals",
    "activity_log",
    "asset_tags",
    "brand_checks",
    "transcode_jobs",
    "selects",
    "sequence_clips",
    "revision_requests",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `FROM co_production\\.${dependentTable} AS [a-z_]+[\\s\\S]*?\\.asset_id = v_asset_id`,
      ),
      `${dependentTable} must block adoption of an evolved legacy asset`,
    );
  }
  const partialAdoptionUpdate = migration.match(
    /UPDATE co_production\.assets\s+SET([\s\S]*?)WHERE assets\.id = v_asset_id;/,
  )?.[1];
  assert.ok(partialAdoptionUpdate, "legacy adoption update must remain inspectable");
  assert.doesNotMatch(
    partialAdoptionUpdate,
    /\bstatus\s*=/,
    "legacy adoption must never reset an evolved asset status",
  );
  assert.match(migration, /\bCOMMIT;/);
  assert.doesNotMatch(migration, /\bpublic\.(?:assets|versions)\b/);
});
