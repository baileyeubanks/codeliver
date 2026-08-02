import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertBoundMediaIngestSession,
  cancelMediaIngestBeforeCleanup,
  canonicalMediaIngestTenant,
  createBoundMediaIngestAuthority,
  durableUploadQuotaReservationRef,
  mediaIngestClientState,
  mediaIngestProgressRequestId,
  normalizeFullSourceSha256,
  readBoundMediaIngestAuthority,
  recordObservedMediaIngestProgress,
  runMediaIngestPublicationGate,
  type MediaIngestRouteClient,
} from "../lib/media-pipeline/ingest-route-integration.ts";
import {
  createMediaIngestIntent,
  MEDIA_INGEST_SCHEMA_VERSION,
  parseMediaIngestRecord,
} from "../lib/media-pipeline/ingest-authority.ts";
import { UploadOrchestrationError } from "../lib/tus/errors.ts";
import { UploadOrchestrator } from "../lib/tus/orchestrator.ts";
import { FileUploadSessionRepository } from "../lib/tus/session-repository.ts";
import type { UploadSession } from "../lib/tus/session.ts";
import { createStorageRuntime } from "../lib/storage/runtime.ts";
import { PendingMalwareScanHook } from "../lib/storage/malware.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const postRoute = readFileSync(
  resolve(repositoryRoot, "app/api/upload/tus/route.ts"),
  "utf8"
);
const uploadRoute = readFileSync(
  resolve(repositoryRoot, "app/api/upload/tus/[uploadId]/route.ts"),
  "utf8"
);
const sharedRoute = readFileSync(
  resolve(repositoryRoot, "app/api/upload/_shared.ts"),
  "utf8"
);
const legacyCreateRoute = readFileSync(
  resolve(repositoryRoot, "app/api/media/tus/route.ts"),
  "utf8"
);
const legacyUploadRoute = readFileSync(
  resolve(repositoryRoot, "app/api/media/tus/[uploadId]/route.ts"),
  "utf8"
);

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_TENANT_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const SESSION_ID = "44444444-4444-4444-8444-444444444444";
const UPLOAD_ID = "55555555-5555-4555-8555-555555555555";
const SHA256 = "a".repeat(64);
const RECEIPT_HASH = "b".repeat(64);
const NOW = "2026-07-15T22:00:00.000Z";

function authorityRow(overrides: Record<string, unknown> = {}) {
  const row = {
    schema_version: MEDIA_INGEST_SCHEMA_VERSION,
    session_id: SESSION_ID,
    created_by: TENANT_ID,
    tenant_kind: "team",
    tenant_id: TENANT_ID,
    project_id: PROJECT_ID,
    folder_id: null,
    idempotency_key: "media-upload-request-0001",
    intent_fingerprint: "",
    quota_reservation_ref: `upload-session:${UPLOAD_ID}`,
    quota_reserved_bytes: 42,
    quota_consumed_at: NOW,
    source_filename: "master.mov",
    source_size: 42,
    source_mime_type: "video/quicktime",
    source_expected_sha256: SHA256,
    upload_offset: 0,
    upload_completed_at: null,
    state: "receiving",
    available_at: NOW,
    source_observed_size: null,
    source_observed_sha256: null,
    source_verified_at: null,
    scan_state: "blocked",
    scan_engine: null,
    scan_receipt_hash: null,
    scan_subject_sha256: null,
    scanned_at: null,
    transcode_state: "blocked",
    transcode_receipt_hash: null,
    transcode_ready_at: null,
    publication_state: "blocked",
    publication_enabled: false,
    work_stage: null,
    work_attempt_count: 0,
    verify_attempt_count: 0,
    scan_attempt_count: 0,
    transcode_attempt_count: 0,
    max_work_attempts: 12,
    lease_worker_id: null,
    lease_owner: null,
    leased_at: null,
    lease_expires_at: null,
    lease_fence: 0,
    failure_code: null,
    failed_at: null,
    cancelled_at: null,
    cancelled_by: null,
    created_at: NOW,
    updated_at: NOW,
    replayed: false,
    ...overrides,
  };
  if (!Object.prototype.hasOwnProperty.call(overrides, "intent_fingerprint")) {
    row.intent_fingerprint = createMediaIngestIntent({
      tenantKey: `${String(row.tenant_kind)}:${String(row.tenant_id)}`,
      projectId: String(row.project_id),
      folderId: row.folder_id === null ? null : String(row.folder_id),
      idempotencyKey: String(row.idempotency_key),
      filename: String(row.source_filename),
      size: Number(row.source_size),
      mimeType: String(row.source_mime_type),
      expectedSha256: String(row.source_expected_sha256),
      quotaReservationRef: String(row.quota_reservation_ref),
      maxWorkAttempts: Number(row.max_work_attempts),
    }).intentFingerprint;
  }
  return row;
}

function authorityRecord(overrides: Record<string, unknown> = {}) {
  return parseMediaIngestRecord(authorityRow(overrides));
}

function unusedReadQuery(): ReturnType<MediaIngestRouteClient["from"]> {
  throw new Error("read query was not expected");
}

function quotaSession(overrides: Partial<UploadSession> = {}): UploadSession {
  return {
    id: UPLOAD_ID,
    state: "receiving",
    expectedSha256: SHA256,
    size: 42,
    offset: 0,
    ...overrides,
  } as UploadSession;
}

test("canonical project authority, not upload metadata, selects the ingest tenant", () => {
  assert.deepEqual(
    canonicalMediaIngestTenant({
      owner_id: OTHER_TENANT_ID,
      team_id: TENANT_ID,
    }),
    { kind: "team", id: TENANT_ID, key: `team:${TENANT_ID}` }
  );
  assert.deepEqual(
    canonicalMediaIngestTenant({ owner_id: TENANT_ID, team_id: null }),
    { kind: "personal", id: TENANT_ID, key: `personal:${TENANT_ID}` }
  );

  assert.match(sharedRoute, /getProjectAccess\([\s\S]*?"editor"/);
  assert.match(sharedRoute, /tenantAuthority:\s*projectAccess\.data\.tenant_authority/);
  assert.match(postRoute, /tenantId:\s*uploadTenantId/);
  assert.match(postRoute, /target\.tenantAuthority\.key/);
  assert.doesNotMatch(postRoute, /metadata\.(?:tenant|tenantId|tenantKey)/);
}
);

test("bound authority reads fail closed across canonical tenants", async () => {
  const tableRow = { ...authorityRow(), id: SESSION_ID };
  delete (tableRow as { session_id?: unknown }).session_id;
  delete (tableRow as { replayed?: unknown }).replayed;

  function clientForRow(): MediaIngestRouteClient {
    return {
      async rpc() {
        throw new Error("RPC was not expected");
      },
      from(table) {
        assert.equal(table, "media_ingest_sessions");
        const filters = new Map<string, unknown>();
        const query = {
          select() {
            return query;
          },
          eq(column: string, value: unknown) {
            filters.set(column, value);
            return query;
          },
          async maybeSingle() {
            const matches =
              filters.get("id") === tableRow.id &&
              filters.get("tenant_kind") === tableRow.tenant_kind &&
              filters.get("tenant_id") === tableRow.tenant_id &&
              filters.get("project_id") === tableRow.project_id;
            return { data: matches ? tableRow : null, error: null };
          },
        };
        return query;
      },
    };
  }

  const allowed = await readBoundMediaIngestAuthority(clientForRow(), {
    tenantKey: `team:${TENANT_ID}`,
    projectId: PROJECT_ID,
    authoritySessionId: SESSION_ID,
  });
  assert.equal(allowed.tenantKey, `team:${TENANT_ID}`);

  await assert.rejects(
    readBoundMediaIngestAuthority(clientForRow(), {
      tenantKey: `team:${OTHER_TENANT_ID}`,
      projectId: PROJECT_ID,
      authoritySessionId: SESSION_ID,
    }),
    (error: unknown) =>
      error instanceof UploadOrchestrationError &&
      error.code === "UPLOAD_NOT_FOUND"
  );
});

test("bound authority cannot drift from immutable durable upload intent", () => {
  const session = quotaSession({
    projectId: PROJECT_ID,
    folderId: null,
    filename: "master.mov",
    mimeType: "video/quicktime",
    mediaIngestAuthoritySessionId: SESSION_ID,
  });
  assert.doesNotThrow(() =>
    assertBoundMediaIngestSession(session, authorityRecord())
  );
  assert.throws(
    () =>
      assertBoundMediaIngestSession(
        session,
        authorityRecord({ source_expected_sha256: "d".repeat(64) })
      ),
    (error: unknown) =>
      error instanceof UploadOrchestrationError &&
      error.code === "UPLOAD_STATE"
  );
  assert.throws(() =>
    assertBoundMediaIngestSession(
      session,
      authorityRecord({ quota_reservation_ref: "upload-session:other" })
    )
  );
  assert.match(uploadRoute, /assertBoundMediaIngestSession\(session, currentAuthority\)/);
});

test("co-production intent requires a full checksum and a real durable quota hold", () => {
  assert.equal(normalizeFullSourceSha256(`SHA256:${SHA256}`), SHA256);
  assert.throws(
    () => normalizeFullSourceSha256(undefined),
    (error: unknown) =>
      error instanceof UploadOrchestrationError &&
      error.code === "UPLOAD_INVALID"
  );
  assert.equal(
    durableUploadQuotaReservationRef(quotaSession()),
    `upload-session:${UPLOAD_ID}`
  );
  assert.throws(
    () => durableUploadQuotaReservationRef(quotaSession({ state: "aborted" })),
    (error: unknown) =>
      error instanceof UploadOrchestrationError &&
      error.code === "UPLOAD_BACKPRESSURE"
  );
  assert.throws(() =>
    durableUploadQuotaReservationRef(quotaSession({ expectedSha256: null }))
  );
  assert.match(postRoute, /durableUploadQuotaReservationRef\(result\.session\)/);
  assert.doesNotMatch(postRoute, /metadata\.quota/i);
});

test("authority creation replays one intent and binds only its opaque id", async () => {
  const intentInput = {
    tenantKey: `team:${TENANT_ID}`,
    projectId: PROJECT_ID,
    idempotencyKey: "media-upload-request-0001",
    filename: "master.mov",
    size: 42,
    mimeType: "video/quicktime",
    expectedSha256: SHA256,
    quotaReservationRef: `upload-session:${UPLOAD_ID}`,
  };
  const intent = createMediaIngestIntent(intentInput);
  let calls = 0;
  const client: MediaIngestRouteClient = {
    async rpc(name, parameters) {
      assert.equal(name, "create_media_ingest_session");
      assert.equal(parameters.p_tenant_id, TENANT_ID);
      assert.equal(parameters.p_quota_reservation_ref, intent.quotaReservationRef);
      calls += 1;
      return {
        data: authorityRow({
          intent_fingerprint: intent.intentFingerprint,
          replayed: calls > 1,
        }),
        error: null,
      };
    },
    from: unusedReadQuery,
  };

  const first = await createBoundMediaIngestAuthority(client, intentInput);
  const replay = await createBoundMediaIngestAuthority(client, intentInput);
  assert.equal(first.id, SESSION_ID);
  assert.equal(replay.id, SESSION_ID);
  assert.equal(replay.replayed, true);
  assert.equal(calls, 2);
  assert.match(postRoute, /bindMediaIngestAuthority\([\s\S]*?authority\.id/);
  const responseBlock = postRoute.slice(
    postRoute.indexOf("status: 201"),
    postRoute.indexOf("} catch (error)")
  );
  assert.doesNotMatch(responseBlock, /authority\.id/);
});

test("opaque authority binding persists and remains canonical-tenant scoped", async () => {
  const root = mkdtempSync(join(tmpdir(), "media-ingest-binding-"));
  const runtime = createStorageRuntime({
    CODELIVER_STORAGE_PROVIDER: "local",
    CODELIVER_LOCAL_STORAGE_ROOT: root,
    CODELIVER_STORAGE_WRITE_ENABLED: "1",
    CODELIVER_STORAGE_RESERVED_BYTES: "0",
    CODELIVER_STORAGE_MAX_UPLOAD_BYTES: "1048576",
    CODELIVER_STORAGE_MAX_CHUNK_BYTES: "1024",
    CODELIVER_STORAGE_TENANT_QUOTA_BYTES: "1048576",
    CODELIVER_STORAGE_MAX_CONCURRENT_UPLOADS: "4",
  });
  const orchestrator = new UploadOrchestrator({
    adapter: runtime.adapter,
    config: runtime.config,
    sessions: new FileUploadSessionRepository(root, 60_000),
    scanner: new PendingMalwareScanHook(),
  });
  const tenantKey = `team:${TENANT_ID}`;
  try {
    const created = await orchestrator.createSession({
      tenantId: tenantKey,
      projectId: PROJECT_ID,
      idempotencyKey: "media-upload-request-0001",
      filename: "master.mov",
      mimeType: "video/quicktime",
      size: 42,
      expectedSha256: SHA256,
    });
    const bound = await orchestrator.bindMediaIngestAuthority(
      created.session.id,
      tenantKey,
      SESSION_ID
    );
    assert.equal(bound.mediaIngestAuthoritySessionId, SESSION_ID);
    assert.equal(
      (await orchestrator.getAuthorityContext(created.session.id))
        ?.authoritySessionId,
      SESSION_ID
    );
    assert.equal(
      (
        await orchestrator.bindMediaIngestAuthority(
          created.session.id,
          tenantKey,
          SESSION_ID
        )
      ).mediaIngestAuthoritySessionId,
      SESSION_ID
    );
    await assert.rejects(
      orchestrator.bindMediaIngestAuthority(
        created.session.id,
        tenantKey,
        OTHER_TENANT_ID
      ),
      /already bound/
    );
    await assert.rejects(
      orchestrator.getSession(created.session.id, `team:${OTHER_TENANT_ID}`),
      /Upload not found/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("PATCH progress uses one deterministic request identity across retries", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const applied = new Set<string>();
  let uploadOffset = 0;
  let advances = 0;
  const client: MediaIngestRouteClient = {
    async rpc(name, parameters) {
      assert.equal(name, "record_media_ingest_progress");
      calls.push(parameters);
      const requestId = String(parameters.p_request_id);
      if (!applied.has(requestId)) {
        assert.equal(parameters.p_expected_offset, uploadOffset);
        uploadOffset = Number(parameters.p_next_offset);
        applied.add(requestId);
        advances += 1;
      }
      return {
        data: authorityRow({
          upload_offset: uploadOffset,
          replayed: calls.length > 1,
        }),
        error: null,
      };
    },
    from: unusedReadQuery,
  };
  const input = {
    tenantKey: `team:${TENANT_ID}`,
    authoritySessionId: SESSION_ID,
    expectedOffset: 0,
    nextOffset: 4,
    chunkSha256: SHA256,
  };

  const expectedRequestId = mediaIngestProgressRequestId(input);
  await recordObservedMediaIngestProgress(client, input);
  await recordObservedMediaIngestProgress(client, input);

  assert.match(expectedRequestId, /^[0-9a-f-]{36}$/);
  assert.equal(calls[0].p_request_id, expectedRequestId);
  assert.equal(calls[1].p_request_id, expectedRequestId);
  assert.equal(uploadOffset, 4);
  assert.equal(advances, 1);
  assert.match(uploadRoute, /lastPartSha256/);
  assert.match(uploadRoute, /recordObservedMediaIngestProgress/);
});

test("DELETE cancels authority before any local cleanup", async () => {
  const order: string[] = [];
  const client: MediaIngestRouteClient = {
    async rpc(name) {
      assert.equal(name, "cancel_media_ingest_session");
      order.push("cancel");
      return {
        data: authorityRow({
          state: "cancelled",
          cancelled_at: NOW,
          cancelled_by: TENANT_ID,
        }),
        error: null,
      };
    },
    from: unusedReadQuery,
  };

  await cancelMediaIngestBeforeCleanup(
    client,
    { tenantKey: `team:${TENANT_ID}`, authoritySessionId: SESSION_ID },
    async () => {
      order.push("cleanup");
      return true;
    }
  );
  assert.deepEqual(order, ["cancel", "cleanup"]);

  let cleaned = false;
  const failingClient: MediaIngestRouteClient = {
    async rpc() {
      return { data: null, error: { code: "database_error", message: "hidden" } };
    },
    from: unusedReadQuery,
  };
  await assert.rejects(
    cancelMediaIngestBeforeCleanup(
      failingClient,
      { tenantKey: `team:${TENANT_ID}`, authoritySessionId: SESSION_ID },
      async () => {
        cleaned = true;
      }
    )
  );
  assert.equal(cleaned, false);
  assert.match(uploadRoute, /cancelMediaIngestBeforeCleanup\([\s\S]*?orchestrator\.abort/);
});

test("catalog publication remains blocked until every authority settlement passes", async () => {
  let published = false;
  await assert.rejects(
    runMediaIngestPublicationGate(authorityRecord(), async () => {
      published = true;
    }),
    /publication remains blocked/i
  );
  assert.equal(published, false);

  const eligible = authorityRecord({
    upload_offset: 42,
    upload_completed_at: NOW,
    state: "ready",
    source_observed_size: 42,
    source_observed_sha256: SHA256,
    source_verified_at: NOW,
    scan_state: "clean",
    scan_engine: "scanner-v1",
    scan_receipt_hash: RECEIPT_HASH,
    scan_subject_sha256: SHA256,
    scanned_at: NOW,
    transcode_state: "ready",
    transcode_receipt_hash: RECEIPT_HASH,
    transcode_ready_at: NOW,
    publication_state: "eligible",
    publication_enabled: true,
    work_attempt_count: 3,
    verify_attempt_count: 1,
    scan_attempt_count: 1,
    transcode_attempt_count: 1,
    lease_fence: 3,
  });
  const value = await runMediaIngestPublicationGate(eligible, async () => {
    published = true;
    return "published";
  });
  assert.equal(value, "published");
  assert.equal(published, true);

  const publicationFunction = uploadRoute.slice(
    uploadRoute.indexOf("async function attachCatalogIfPublicationEligible"),
    uploadRoute.indexOf("async function requireBoundAuthority")
  );
  assert.match(publicationFunction, /runMediaIngestPublicationGate/);
  assert.match(publicationFunction, /attachCatalogIfCommitted/);
  assert.ok(
    publicationFunction.indexOf("runMediaIngestPublicationGate") <
      publicationFunction.lastIndexOf("attachCatalogIfCommitted")
  );
  const authorityHeaderBranch = uploadRoute.slice(
    uploadRoute.indexOf("if (authority)"),
    uploadRoute.indexOf("\n  return headers({", uploadRoute.indexOf("if (authority)"))
  );
  assert.doesNotMatch(authorityHeaderBranch, /Upload-SHA256/);
  assert.equal(
    mediaIngestClientState(
      authorityRecord({
        upload_offset: 42,
        upload_completed_at: NOW,
        state: "verification_pending",
      })
    ),
    "processing"
  );
  assert.equal(
    mediaIngestClientState(
      authorityRecord({
        upload_offset: 42,
        upload_completed_at: NOW,
        state: "quarantined",
        source_observed_size: 42,
        source_observed_sha256: SHA256,
        source_verified_at: NOW,
        scan_state: "infected",
        scan_engine: "scanner-v1",
        scan_receipt_hash: RECEIPT_HASH,
        scan_subject_sha256: SHA256,
        scanned_at: NOW,
        work_attempt_count: 2,
        verify_attempt_count: 1,
        scan_attempt_count: 1,
        lease_fence: 2,
      })
    ),
    "quarantined"
  );
});

test("legacy TUS is closed before work in co-production and demo logic remains", () => {
  const legacyPost = legacyCreateRoute.slice(
    legacyCreateRoute.indexOf("export async function POST")
  );
  assert.ok(legacyPost.indexOf("legacyTusClosed()") < legacyPost.indexOf("requireAuth()"));
  assert.match(legacyCreateRoute, /createUpload\(/);
  assert.match(legacyCreateRoute, /appendChunk\(/);
  assert.match(legacyCreateRoute, /finalizeUpload\(/);

  for (const method of ["HEAD", "PATCH", "DELETE"] as const) {
    const start = legacyUploadRoute.indexOf(`export async function ${method}`);
    const next = legacyUploadRoute.indexOf("export async function ", start + 1);
    const body = legacyUploadRoute.slice(start, next === -1 ? undefined : next);
    assert.ok(body.indexOf("legacyTusClosed()") < body.indexOf("requireAuth()"), method);
  }
  assert.match(legacyUploadRoute, /appendChunk\(/);
  assert.match(legacyUploadRoute, /finalizeUpload\(/);
  assert.match(legacyUploadRoute, /deleteUpload\(/);
});
