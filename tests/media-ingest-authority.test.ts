import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertMediaIngestLease,
  assertMediaIngestPublication,
  assertMediaIngestTransition,
  claimMediaIngestWork,
  createMediaIngestIntent,
  createMediaIngestSession,
  mediaIngestCanPublish,
  MEDIA_INGEST_SCHEMA_VERSION,
  MediaIngestAuthorityError,
  parseMediaIngestRecord,
  parseMediaIngestTenantKey,
  recordMediaIngestProgress,
  renewMediaIngestLease,
  settleMediaIngestWork,
  type MediaIngestRpcClient,
} from "../lib/media-pipeline/ingest-authority.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = resolve(
  repositoryRoot,
  "supabase/migrations/20260715220000_media_ingest_authority.sql",
);
const proofPath = resolve(
  repositoryRoot,
  "scripts/certification/media-ingest-authority-proof.sql",
);
const proofScriptPath = resolve(
  repositoryRoot,
  "scripts/certification/prove-media-ingest-authority.sh",
);
const migration = readFileSync(migrationPath, "utf8");
const proof = readFileSync(proofPath, "utf8");
const proofScript = readFileSync(proofScriptPath, "utf8");

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_TENANT_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const SESSION_ID = "44444444-4444-4444-8444-444444444444";
const REQUEST_ID = "55555555-5555-4555-8555-555555555555";
const WORKER_ID = "66666666-6666-4666-8666-666666666666";
const SHA256 = "a".repeat(64);
const RECEIPT_HASH = "b".repeat(64);
const OUTPUT_HASH = "c".repeat(64);
const NOW = "2026-07-15T22:00:00.000Z";
const LATER = "2026-07-15T22:02:00.000Z";

function executableSql(sql: string) {
  return sql.replace(/--.*$/gm, " ").replace(/\s+/g, " ").trim();
}

function draft(overrides: Record<string, unknown> = {}) {
  return {
    tenantKey: "team:" + TENANT_ID,
    projectId: PROJECT_ID,
    idempotencyKey: "media-upload-request-0001",
    filename: "master.mov",
    size: 42,
    mimeType: "video/quicktime",
    expectedSha256: SHA256,
    quotaReservationRef: "quota:reservation-0001",
    maxWorkAttempts: 12,
    ...overrides,
  };
}

function rpcRecord(overrides: Record<string, unknown> = {}) {
  const intent = createMediaIngestIntent(draft());
  return {
    schema_version: MEDIA_INGEST_SCHEMA_VERSION,
    session_id: SESSION_ID,
    created_by: TENANT_ID,
    tenant_kind: "team",
    tenant_id: TENANT_ID,
    project_id: PROJECT_ID,
    folder_id: null,
    idempotency_key: intent.idempotencyKey,
    intent_fingerprint: intent.intentFingerprint,
    quota_reservation_ref: intent.quotaReservationRef,
    quota_reserved_bytes: intent.size,
    quota_consumed_at: NOW,
    source_filename: intent.filename,
    source_size: intent.size,
    source_mime_type: intent.mimeType,
    source_expected_sha256: intent.expectedSha256,
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
}

function completedUpload(overrides: Record<string, unknown> = {}) {
  return rpcRecord({
    upload_offset: 42,
    upload_completed_at: NOW,
    state: "verification_pending",
    ...overrides,
  });
}

function leasedVerificationRecord(overrides: Record<string, unknown> = {}) {
  return completedUpload({
    state: "verifying",
    work_stage: "verify",
    work_attempt_count: 1,
    verify_attempt_count: 1,
    lease_worker_id: WORKER_ID,
    lease_owner: "worker:" + WORKER_ID,
    leased_at: NOW,
    lease_expires_at: LATER,
    lease_fence: 1,
    ...overrides,
  });
}

function verifiedRecord(overrides: Record<string, unknown> = {}) {
  return completedUpload({
    state: "scan_pending",
    source_observed_size: 42,
    source_observed_sha256: SHA256,
    source_verified_at: NOW,
    scan_state: "pending",
    work_attempt_count: 1,
    verify_attempt_count: 1,
    lease_fence: 1,
    ...overrides,
  });
}

function readyRecord(overrides: Record<string, unknown> = {}) {
  return completedUpload({
    state: "ready",
    source_observed_size: 42,
    source_observed_sha256: SHA256,
    source_verified_at: NOW,
    scan_state: "clean",
    scan_engine: "proof-scanner/1.0",
    scan_receipt_hash: RECEIPT_HASH,
    scan_subject_sha256: SHA256,
    scanned_at: NOW,
    transcode_state: "ready",
    transcode_receipt_hash: OUTPUT_HASH,
    transcode_ready_at: NOW,
    publication_state: "eligible",
    work_attempt_count: 3,
    verify_attempt_count: 1,
    scan_attempt_count: 1,
    transcode_attempt_count: 1,
    lease_fence: 3,
    ...overrides,
  });
}

function assertInvalidResponse(value: unknown) {
  assert.throws(
    () => parseMediaIngestRecord(value),
    (error: unknown) =>
      error instanceof MediaIngestAuthorityError &&
      error.code === "invalid_response",
  );
}

test("upload intent is canonical, tenant-bound, and immutable by fingerprint", () => {
  const first = createMediaIngestIntent(draft());
  const sameIntentNewRequest = createMediaIngestIntent(
    draft({
      idempotencyKey: "media-upload-request-9999",
      mimeType: "VIDEO/QUICKTIME",
      expectedSha256: "sha256:" + SHA256,
    }),
  );
  const otherTenant = createMediaIngestIntent(
    draft({ tenantKey: "team:" + OTHER_TENANT_ID }),
  );
  const otherQuota = createMediaIngestIntent(
    draft({ quotaReservationRef: "quota:reservation-0002" }),
  );

  assert.equal(first.intentFingerprint, sameIntentNewRequest.intentFingerprint);
  assert.notEqual(first.intentFingerprint, otherTenant.intentFingerprint);
  assert.notEqual(first.intentFingerprint, otherQuota.intentFingerprint);
  assert.match(first.intentFingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.equal(first.mimeType, "video/quicktime");
  assert.equal(first.expectedSha256, SHA256);
  assert.deepEqual(parseMediaIngestTenantKey("personal:" + TENANT_ID), {
    tenantKind: "personal",
    tenantId: TENANT_ID,
    tenantKey: "personal:" + TENANT_ID,
  });
  assert.throws(
    () => createMediaIngestIntent(draft({ expectedSha256: "unknown" })),
    (error: unknown) =>
      error instanceof MediaIngestAuthorityError &&
      error.code === "invalid_input",
  );
  assert.throws(
    () => createMediaIngestIntent(draft({ filename: "../master.mov" })),
    (error: unknown) =>
      error instanceof MediaIngestAuthorityError &&
      error.code === "invalid_input",
  );
});

test("RPC records strictly parse schema, hashes, timestamps, and booleans", () => {
  const parsed = parseMediaIngestRecord(rpcRecord());
  assert.equal(parsed.schemaVersion, MEDIA_INGEST_SCHEMA_VERSION);
  assert.equal(parsed.publicationEnabled, false);
  assert.equal(parsed.quotaReservedBytes, 42);
  assert.equal(parsed.quotaConsumedAt, NOW);
  assert.equal(parsed.replayed, false);

  const missingSchema = rpcRecord();
  delete (missingSchema as Record<string, unknown>).schema_version;
  assertInvalidResponse(missingSchema);
  assertInvalidResponse(rpcRecord({ schema_version: "cco.media-ingest.v0" }));
  assertInvalidResponse(rpcRecord({ publication_enabled: "false" }));
  assertInvalidResponse(
    rpcRecord({ source_expected_sha256: "sha256:" + SHA256 }),
  );
  assertInvalidResponse(rpcRecord({ intent_fingerprint: SHA256 }));
  assertInvalidResponse(rpcRecord({ quota_consumed_at: "not-a-timestamp" }));
  assertInvalidResponse(rpcRecord({ replayed: null }));
});

test("state-specific evidence and lease invariants fail closed", () => {
  assert.doesNotThrow(() => parseMediaIngestRecord(leasedVerificationRecord()));
  assertInvalidResponse(
    leasedVerificationRecord({ lease_worker_id: OTHER_TENANT_ID }),
  );
  assertInvalidResponse(leasedVerificationRecord({ leased_at: null }));
  assertInvalidResponse(
    completedUpload({
      state: "scan_pending",
      scan_state: "pending",
    }),
  );
  assertInvalidResponse(readyRecord({ scan_engine: null }));
  assertInvalidResponse(readyRecord({ scanned_at: null }));
  assertInvalidResponse(readyRecord({ transcode_receipt_hash: null }));
  assertInvalidResponse(readyRecord({ work_attempt_count: 2 }));
  assertInvalidResponse(
    verifiedRecord({ source_observed_sha256: RECEIPT_HASH }),
  );
});

test("publication requires explicit authority plus every evidence invariant", () => {
  const blocked = parseMediaIngestRecord(rpcRecord());
  const evidenceReadyButDisabled = parseMediaIngestRecord(readyRecord());
  const explicitlyEnabled = parseMediaIngestRecord(
    readyRecord({ publication_enabled: true }),
  );

  assert.equal(mediaIngestCanPublish(blocked), false);
  assert.equal(mediaIngestCanPublish(evidenceReadyButDisabled), false);
  assert.equal(mediaIngestCanPublish(explicitlyEnabled), true);
  assert.equal(
    mediaIngestCanPublish({
      ...explicitlyEnabled,
      scanEngine: null,
    }),
    false,
  );
  assert.throws(
    () => assertMediaIngestPublication(evidenceReadyButDisabled),
    (error: unknown) =>
      error instanceof MediaIngestAuthorityError &&
      error.code === "publication_blocked",
  );
  assert.doesNotThrow(() => assertMediaIngestPublication(explicitlyEnabled));
  assert.doesNotThrow(() =>
    assertMediaIngestTransition("transcoding", "ready"),
  );
  assert.throws(
    () => assertMediaIngestTransition("failed", "receiving"),
    (error: unknown) =>
      error instanceof MediaIngestAuthorityError &&
      error.code === "invalid_transition",
  );
});

test("create and progress RPCs carry normalized authority and reject scope escape", async () => {
  const calls: Array<{ name: string; parameters: Record<string, unknown> }> =
    [];
  const client: MediaIngestRpcClient = {
    async rpc(name, parameters) {
      calls.push({ name, parameters });
      if (name === "record_media_ingest_progress") {
        return {
          data: rpcRecord({
            upload_offset: 10,
          }),
          error: null,
        };
      }
      return { data: rpcRecord(), error: null };
    },
  };

  const created = await createMediaIngestSession(client, draft());
  assert.equal(created.tenantKey, "team:" + TENANT_ID);
  assert.equal(calls[0].name, "create_media_ingest_session");
  assert.equal(calls[0].parameters.p_source_expected_sha256, SHA256);
  assert.equal(
    calls[0].parameters.p_quota_reservation_ref,
    "quota:reservation-0001",
  );

  await recordMediaIngestProgress(client, {
    tenantKey: "team:" + TENANT_ID,
    sessionId: SESSION_ID,
    requestId: REQUEST_ID,
    expectedOffset: 0,
    nextOffset: 10,
    chunkSha256: "sha256:" + RECEIPT_HASH,
  });
  assert.deepEqual(calls[1], {
    name: "record_media_ingest_progress",
    parameters: {
      p_tenant_kind: "team",
      p_tenant_id: TENANT_ID,
      p_session_id: SESSION_ID,
      p_request_id: REQUEST_ID,
      p_expected_offset: 0,
      p_next_offset: 10,
      p_chunk_sha256: RECEIPT_HASH,
    },
  });

  const otherIntent = createMediaIngestIntent(
    draft({ tenantKey: "team:" + OTHER_TENANT_ID }),
  );
  const escapingClient: MediaIngestRpcClient = {
    async rpc() {
      return {
        data: rpcRecord({
          tenant_id: OTHER_TENANT_ID,
          intent_fingerprint: otherIntent.intentFingerprint,
        }),
        error: null,
      };
    },
  };
  await assert.rejects(
    () => createMediaIngestSession(escapingClient, draft()),
    (error: unknown) =>
      error instanceof MediaIngestAuthorityError &&
      error.code === "invalid_response",
  );
});

test("worker RPCs derive identity, require a stage, and preserve fencing", async () => {
  const calls: Array<{ name: string; parameters: Record<string, unknown> }> =
    [];
  const leased = leasedVerificationRecord();
  const client: MediaIngestRpcClient = {
    async rpc(name, parameters) {
      calls.push({ name, parameters });
      if (name === "claim_media_ingest_work") {
        return { data: [leased], error: null };
      }
      if (name === "settle_media_ingest_work") {
        return { data: verifiedRecord(), error: null };
      }
      return { data: leased, error: null };
    },
  };

  const claimed = await claimMediaIngestWork(client, {
    tenantKey: "team:" + TENANT_ID,
    stage: "verify",
  });
  assert.equal(claimed.length, 1);
  assert.deepEqual(calls[0].parameters, {
    p_tenant_kind: "team",
    p_tenant_id: TENANT_ID,
    p_stage: "verify",
    p_limit: 10,
    p_lease_seconds: 90,
  });
  assert.doesNotThrow(() =>
    assertMediaIngestLease({
      record: claimed[0],
      stage: "verify",
      workerId: WORKER_ID,
      leaseFence: 1,
      now: NOW,
    }),
  );
  assert.throws(
    () =>
      assertMediaIngestLease({
        record: claimed[0],
        stage: "verify",
        workerId: OTHER_TENANT_ID,
        leaseFence: 1,
        now: NOW,
      }),
    (error: unknown) =>
      error instanceof MediaIngestAuthorityError &&
      error.code === "stale_fence",
  );

  await renewMediaIngestLease(client, {
    tenantKey: "team:" + TENANT_ID,
    sessionId: SESSION_ID,
    leaseFence: 1,
  });
  assert.equal("p_lease_owner" in calls[1].parameters, false);

  await settleMediaIngestWork(client, {
    tenantKey: "team:" + TENANT_ID,
    sessionId: SESSION_ID,
    requestId: REQUEST_ID,
    leaseFence: 1,
    stage: "verify",
    outcome: "verified",
    observedSize: 42,
    observedSha256: SHA256,
  });
  assert.equal(calls[2].name, "settle_media_ingest_work");
  assert.equal(calls[2].parameters.p_lease_fence, 1);
  assert.equal(calls[2].parameters.p_observed_sha256, SHA256);
  assert.equal("p_lease_owner" in calls[2].parameters, false);

  await assert.rejects(
    () =>
      settleMediaIngestWork(client, {
        tenantKey: "team:" + TENANT_ID,
        sessionId: SESSION_ID,
        requestId: REQUEST_ID,
        leaseFence: 1,
        stage: "verify",
        outcome: "retry",
      }),
    (error: unknown) =>
      error instanceof MediaIngestAuthorityError &&
      error.code === "invalid_input",
  );
});

test("migration binds quota atomically and uses independent stage budgets", () => {
  const sql = executableSql(migration);
  assert.match(sql, /^BEGIN;/);
  assert.match(sql, /COMMIT;$/);
  assert.match(
    migration,
    /CREATE TABLE co_production\.media_ingest_quota_reservations/,
  );
  assert.match(migration, /FOR UPDATE;/);
  assert.match(migration, /consumed_by_session_id = v_session\.id/);
  assert.match(migration, /media_ingest_quota_reservation_unavailable/);
  assert.match(
    migration,
    /verify_attempt_count <= max_work_attempts[\s\S]*scan_attempt_count <= max_work_attempts[\s\S]*transcode_attempt_count <= max_work_attempts/,
  );
  assert.match(
    migration,
    /WHEN 'verify' THEN session\.verify_attempt_count[\s\S]*WHEN 'scan' THEN session\.scan_attempt_count[\s\S]*WHEN 'transcode' THEN session\.transcode_attempt_count/,
  );
  assert.match(proof, /verify_attempt_count = 3/);
  assert.match(proof, /scan_attempt_count = 1/);
  assert.match(proof, /transcode_attempt_count = 1/);
});

test("settlement replay is bound to the complete canonical fingerprint", () => {
  const fingerprintDefinition = migration.match(
    /CREATE OR REPLACE FUNCTION co_production_private\.media_ingest_settlement_fingerprint\([\s\S]*?\n\$\$;/,
  )?.[0];
  assert.ok(fingerprintDefinition, "missing settlement fingerprint function");
  for (const field of [
    "'worker_id'",
    "'worker_subject'",
    "'stage'",
    "'outcome'",
    "'lease_fence'",
    "'observed_size'",
    "'observed_sha256'",
    "'scan_engine'",
    "'scan_receipt_hash'",
    "'scan_subject_sha256'",
    "'transcode_receipt_hash'",
    "'error_code'",
    "'retry_at'",
  ]) {
    assert.ok(
      fingerprintDefinition.includes(field),
      "settlement fingerprint omitted " + field,
    );
  }
  assert.match(
    migration,
    /detail ->> 'settlement_fingerprint'[\s\S]*IS DISTINCT FROM v_settlement_fingerprint/,
  );
  assert.match(proof, /expect_changed_settlement_conflict/);
});

test("worker authorization and publication remain explicit and disabled", () => {
  const sql = executableSql(migration);
  assert.match(
    migration,
    /CREATE TABLE co_production\.media_ingest_worker_authorizations/,
  );
  assert.match(migration, /enabled boolean NOT NULL DEFAULT false/);
  assert.match(
    migration,
    /assert_media_ingest_worker_authorized\([\s\S]*worker_id = v_worker_id[\s\S]*jwt_subject = v_worker_subject[\s\S]*tenant_kind = p_tenant_kind[\s\S]*stage = p_stage/,
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION co_production\.claim_media_ingest_work\( text, uuid, text, integer, integer \) TO service_role/,
  );
  assert.doesNotMatch(
    sql,
    /GRANT EXECUTE ON FUNCTION co_production\.claim_media_ingest_work\([^;]+\) TO authenticated/,
  );

  assert.match(
    migration,
    /CREATE TABLE co_production\.media_ingest_publication_outbox/,
  );
  assert.match(migration, /UNIQUE \(session_id, output_digest\)/);
  assert.match(migration, /dispatch_enabled boolean NOT NULL DEFAULT false/);
  assert.match(migration, /publication_enabled boolean NOT NULL DEFAULT false/);
  assert.doesNotMatch(
    sql,
    /GRANT EXECUTE ON FUNCTION co_production\.claim_media_ingest_publication/,
  );
});

test("event fingerprints cover accepted evidence and lease facts", () => {
  const appendDefinition = migration.match(
    /CREATE OR REPLACE FUNCTION co_production_private\.append_media_ingest_event\([\s\S]*?\n\$\$;/,
  )?.[0];
  assert.ok(appendDefinition, "missing append-only event function");
  for (const field of [
    "'source_observed_size'",
    "'source_observed_sha256'",
    "'source_verified_at'",
    "'scan_engine'",
    "'scan_receipt_hash'",
    "'scan_subject_sha256'",
    "'scanned_at'",
    "'transcode_receipt_hash'",
    "'transcode_ready_at'",
    "'lease_worker_id'",
    "'lease_owner'",
    "'leased_at'",
    "'lease_expires_at'",
    "'lease_fence'",
  ]) {
    assert.ok(
      appendDefinition.includes(field),
      "event fingerprint omitted " + field,
    );
  }
  assert.match(migration, /CREATE TRIGGER media_ingest_events_immutable/);
  assert.match(migration, /CREATE TRIGGER media_ingest_events_no_truncate/);
  assert.match(proof, /accepted evidence and lease facts/);
});

test("immutable evidence uses RESTRICT and exposes uniform lookup failures", () => {
  const sessionDefinition = migration.match(
    /CREATE TABLE co_production\.media_ingest_sessions \([\s\S]*?\n\);/,
  )?.[0];
  assert.ok(sessionDefinition, "missing media ingest session table");
  assert.match(
    sessionDefinition,
    /project_id uuid NOT NULL[\s\S]*ON DELETE RESTRICT/,
  );
  assert.match(
    sessionDefinition,
    /FOREIGN KEY \(folder_id, project_id\)[\s\S]*ON DELETE RESTRICT/,
  );
  assert.doesNotMatch(sessionDefinition, /ON DELETE (?:CASCADE|SET NULL)/);
  assert.match(migration, /MESSAGE = 'media_ingest_not_found'/);
  assert.doesNotMatch(
    migration,
    /media_ingest_(?:project|folder)_forbidden/,
  );
  assert.match(proof, /violates foreign key constraint/);
});

test("PostgreSQL 15 proof is self-contained and production-independent", () => {
  assert.match(proofScript, /postgres:15/);
  assert.match(proofScript, /media-ingest-authority-fixture\.sql/);
  assert.match(proofScript, /media-ingest-authority-proof\.sql/);
  assert.ok(
    (statSync(proofScriptPath).mode & 0o111) !== 0,
    "proof script must be executable",
  );
  assert.doesNotMatch(
    executableSql(migration),
    /(?:ALTER|DROP|TRUNCATE|UPDATE|DELETE)\s+(?:TABLE\s+)?co_production\.(?:assets|versions|transcode_jobs)\b/i,
  );
  assert.doesNotMatch(
    executableSql(migration),
    /\b(?:fetch|http|net\.http|storage\.objects)\b/i,
  );
});
