import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeTranscript,
  type AudioAnalysisRun,
} from "../lib/audio-analysis/core.ts";
import {
  InMemoryAppendOnlyMediaIntelligenceStore,
  MediaIntelligencePersistenceBoundary,
  evaluateRetentionDisposition,
  sha256Canonical,
  verifyArtifactRecord,
  verifyAuditChain,
  type ContentDeletionAuthority,
  type MediaIntelligenceArtifactRecord,
  type MediaIntelligenceScope,
  type SourceChecksumAuthority,
  type VerifiedSourceChecksumReceipt,
} from "../lib/transcript/durable.ts";
import {
  buildTranscriptSourceBinding,
  createSafeDemoTranscript,
  DEFAULT_TRANSCRIPT_PRIVACY,
  deterministicDigest,
  type TranscriptRequest,
} from "../lib/transcript/core.ts";

const SOURCE_SHA256 = "a".repeat(64);
const NOW = "2026-07-15T00:00:00.000Z";
const RETAIN_UNTIL = "2026-07-16T00:00:00.000Z";

const scope: MediaIntelligenceScope = Object.freeze({
  organizationId: "org-1",
  projectId: "project-1",
  assetId: "00000000-0000-4000-8000-000000000301",
  versionId: "00000000-0000-4000-8000-000000000302",
});

function source(mediaSha256: string | null = SOURCE_SHA256) {
  return buildTranscriptSourceBinding({
    assetId: scope.assetId,
    versionId: scope.versionId,
    versionNumber: 1,
    versionCreatedAt: "2026-07-14T20:00:00.000Z",
    durationMs: 22_000,
    fileSizeBytes: 48_000_000,
    mediaSha256,
  });
}

function transcript(mediaSha256: string | null = SOURCE_SHA256) {
  const request: TranscriptRequest = {
    jobId: "00000000-0000-5000-8000-000000000303",
    source: source(mediaSha256),
    languageTag: "en-US",
    diarization: true,
    verbatim: true,
    privacy: DEFAULT_TRANSCRIPT_PRIVACY,
    budget: { maxCostMicrounits: 0, maxLatencyMs: 5_000 },
    replaySeed: "durable-test",
  };
  return createSafeDemoTranscript(request);
}

function receipt(sha256 = SOURCE_SHA256): VerifiedSourceChecksumReceipt {
  return Object.freeze({
    receiptId: "ingest-receipt-1",
    assetId: scope.assetId,
    versionId: scope.versionId,
    sha256,
    sizeBytes: 48_000_000,
    verifiedAt: "2026-07-14T20:01:00.000Z",
    verifier: "ingest-receipt",
  });
}

function authority(value: VerifiedSourceChecksumReceipt | null = receipt()): SourceChecksumAuthority {
  return { async verify() { return value; } };
}

function deletionAuthority(deletedAt: string): ContentDeletionAuthority {
  return {
    async verify({ record, presentedReceiptSha256 }) {
      const value = {
        receiptId: `deletion:${record.recordId}`,
        recordId: record.recordId,
        payloadSha256: record.payloadSha256,
        deletedAt,
      };
      const receiptSha256 = sha256Canonical(value);
      return receiptSha256 === presentedReceiptSha256
        ? Object.freeze({ ...value, receiptSha256 })
        : null;
    },
  };
}

function retention(retainUntil = RETAIN_UNTIL) {
  return Object.freeze({
    policyId: "project-default-30d",
    retainUntil,
    disposition: "delete_content" as const,
    region: "us-central",
  });
}

function appendInput(idempotencyKey = "persist-fixture-1") {
  const document = transcript();
  return Object.freeze({
    scope,
    actorId: "user-1",
    occurredAt: NOW,
    idempotencyKey,
    retention: retention(),
    artifacts: Object.freeze([
      { kind: "transcript" as const, artifact: document },
      { kind: "analysis" as const, artifact: analyzeTranscript({ transcript: document }) },
    ]),
  });
}

test("append-only persistence atomically binds transcript, analysis, and audit to a verified source", async () => {
  const store = new InMemoryAppendOnlyMediaIntelligenceStore();
  const boundary = new MediaIntelligencePersistenceBoundary(store, authority());
  const committed = await boundary.appendArtifacts(appendInput());

  assert.equal(committed.idempotentReplay, false);
  assert.equal(committed.recordIds.length, 2);
  const records = committed.recordIds.map((recordId) => store.getRecord(recordId));
  assert.ok(records.every((record) => record !== null));
  const transcriptRecord = records.find((record) => record?.artifactKind === "transcript");
  const analysisRecord = records.find((record) => record?.artifactKind === "analysis");
  assert.ok(transcriptRecord);
  assert.ok(analysisRecord);
  assert.equal(analysisRecord.parentTranscriptId, transcriptRecord.artifactId);
  assert.equal(transcriptRecord.source.mediaSha256, SOURCE_SHA256);
  for (const record of records as MediaIntelligenceArtifactRecord[]) {
    const payload = store.getPayload(record.recordId);
    assert.ok(payload);
    assert.deepEqual(verifyArtifactRecord(record, payload), []);
  }
  const audit = store.listAuditEvents(scope.organizationId);
  assert.equal(audit.length, 1);
  assert.deepEqual(verifyAuditChain(audit), []);
  assert.equal(audit[0].eventSha256, committed.auditEventSha256);
});

test("idempotent replays return one commit while conflicting reuse fails closed", async () => {
  const store = new InMemoryAppendOnlyMediaIntelligenceStore();
  const boundary = new MediaIntelligencePersistenceBoundary(store, authority());
  const input = appendInput("same-key");
  const [first, second] = await Promise.all([
    boundary.appendArtifacts(input),
    boundary.appendArtifacts(input),
  ]);

  assert.equal(first.transactionId, second.transactionId);
  assert.deepEqual([first.idempotentReplay, second.idempotentReplay].sort(), [false, true]);
  assert.equal(store.listAuditEvents(scope.organizationId).length, 1);
  await assert.rejects(
    boundary.appendArtifacts({
      ...input,
      actorId: "different-actor",
    }),
    /Idempotency key was already used/i,
  );
});

test("missing, stale, or self-asserted source checksums never reach persistence", async () => {
  const missingStore = new InMemoryAppendOnlyMediaIntelligenceStore();
  const missingBoundary = new MediaIntelligencePersistenceBoundary(missingStore, authority());
  const unchecked = transcript(null);
  await assert.rejects(
    missingBoundary.appendArtifacts({
      ...appendInput("missing-checksum"),
      artifacts: [{ kind: "transcript", artifact: unchecked }],
    }),
    /checksum-bound source/i,
  );
  assert.equal(missingStore.listAuditEvents(scope.organizationId).length, 0);

  const staleStore = new InMemoryAppendOnlyMediaIntelligenceStore();
  const staleBoundary = new MediaIntelligencePersistenceBoundary(staleStore, authority(receipt("b".repeat(64))));
  await assert.rejects(
    staleBoundary.appendArtifacts(appendInput("stale-checksum")),
    /digest does not match/i,
  );
  assert.equal(staleStore.listAuditEvents(scope.organizationId).length, 0);

  const futureStore = new InMemoryAppendOnlyMediaIntelligenceStore();
  const futureBoundary = new MediaIntelligencePersistenceBoundary(
    futureStore,
    authority({ ...receipt(), verifiedAt: "2026-07-15T00:00:01.000Z" }),
  );
  await assert.rejects(
    futureBoundary.appendArtifacts(appendInput("future-checksum")),
    /cannot postdate/i,
  );
  assert.equal(futureStore.listAuditEvents(scope.organizationId).length, 0);
});

test("faults before commit leave no artifact, audit, or replay claim behind", async () => {
  let shouldFail = true;
  const store = new InMemoryAppendOnlyMediaIntelligenceStore((point) => {
    if (point === "before_artifact_commit" && shouldFail) {
      shouldFail = false;
      throw new Error("injected transaction failure");
    }
  });
  const boundary = new MediaIntelligencePersistenceBoundary(store, authority());
  const input = appendInput("fault-retry");

  await assert.rejects(boundary.appendArtifacts(input), /injected transaction failure/i);
  assert.equal(store.listAuditEvents(scope.organizationId).length, 0);
  const retry = await boundary.appendArtifacts(input);
  assert.equal(retry.idempotentReplay, false);
  assert.equal(retry.recordIds.length, 2);
  assert.equal(store.listAuditEvents(scope.organizationId).length, 1);
});

test("analysis cannot be persisted without its immutable parent transcript", async () => {
  const document = transcript();
  const store = new InMemoryAppendOnlyMediaIntelligenceStore();
  const boundary = new MediaIntelligencePersistenceBoundary(store, authority());

  await assert.rejects(
    boundary.appendArtifacts({
      ...appendInput("orphan-analysis"),
      artifacts: [{ kind: "analysis", artifact: analyzeTranscript({ transcript: document }) }],
    }),
    /requires its immutable parent transcript/i,
  );
  assert.equal(store.listAuditEvents(scope.organizationId).length, 0);
});

test("analysis replay input is recomputed from the exact persisted transcript", async () => {
  const document = transcript();
  const run = analyzeTranscript({ transcript: document });
  const forgedWithoutOutput = {
    ...run,
    replay: {
      algorithm: run.replay.algorithm,
      inputDigest: "fnv1a64:0000000000000000",
      configurationDigest: run.replay.configurationDigest,
    },
  };
  const forged = {
    ...forgedWithoutOutput,
    replay: {
      ...forgedWithoutOutput.replay,
      outputDigest: deterministicDigest({
        ...forgedWithoutOutput,
        replay: { ...forgedWithoutOutput.replay, outputDigest: "" },
      }),
    },
  } as AudioAnalysisRun;
  const store = new InMemoryAppendOnlyMediaIntelligenceStore();
  const boundary = new MediaIntelligencePersistenceBoundary(store, authority());

  await assert.rejects(
    boundary.appendArtifacts({
      ...appendInput("forged-analysis-input"),
      artifacts: [
        { kind: "transcript", artifact: document },
        { kind: "analysis", artifact: forged },
      ],
    }),
    /input replay digest does not match/i,
  );
  assert.equal(store.listAuditEvents(scope.organizationId).length, 0);
});

test("append-only artifact identity cannot be overwritten under a new request key", async () => {
  const store = new InMemoryAppendOnlyMediaIntelligenceStore();
  const boundary = new MediaIntelligencePersistenceBoundary(store, authority());
  const input = appendInput("first-key");
  await boundary.appendArtifacts(input);

  await assert.rejects(
    boundary.appendArtifacts({ ...input, idempotencyKey: "second-key" }),
    /already append-only persisted/i,
  );
  assert.equal(store.listAuditEvents(scope.organizationId).length, 1);
});

test("payload tampering is independently detected by the SHA-256 record manifest", async () => {
  const store = new InMemoryAppendOnlyMediaIntelligenceStore();
  const boundary = new MediaIntelligencePersistenceBoundary(store, authority());
  const committed = await boundary.appendArtifacts({
    ...appendInput("tamper-check"),
    artifacts: [{ kind: "transcript", artifact: transcript() }],
  });
  const record = store.getRecord(committed.recordIds[0]);
  const payload = store.getPayload(committed.recordIds[0]);
  assert.ok(record);
  assert.ok(payload && "tokens" in payload);
  const tampered = {
    ...payload,
    tokens: payload.tokens.map((token, index) => index === 0 ? { ...token, text: "tampered" } : token),
  };

  assert.ok(verifyArtifactRecord(record, tampered).includes("Artifact payload checksum mismatch"));
});

test("legal holds override expiry and deletion requires request plus attestation", async () => {
  const store = new InMemoryAppendOnlyMediaIntelligenceStore();
  const deletedAt = "2026-07-16T01:01:30.000Z";
  const boundary = new MediaIntelligencePersistenceBoundary(
    store,
    authority(),
    deletionAuthority(deletedAt),
  );
  const committed = await boundary.appendArtifacts({
    ...appendInput("lifecycle-artifact"),
    retention: retention("2026-07-15T01:00:00.000Z"),
    artifacts: [{ kind: "transcript", artifact: transcript() }],
  });
  const recordId = committed.recordIds[0];
  const record = store.getRecord(recordId);
  assert.ok(record);

  await boundary.appendLifecycle({
    scope,
    recordId,
    type: "legal_hold_applied",
    actorId: "legal-1",
    occurredAt: "2026-07-15T00:30:00.000Z",
    idempotencyKey: "hold-apply",
    holdId: "matter-42",
    reason: "Preserve for active matter",
  });
  assert.equal(
    evaluateRetentionDisposition(record, store.listLifecycleEvents(recordId), "2026-07-16T00:00:00.000Z").state,
    "retained_by_legal_hold",
  );
  await assert.rejects(
    boundary.appendLifecycle({
      scope,
      recordId,
      type: "deletion_requested",
      actorId: "retention-worker",
      occurredAt: "2026-07-16T00:00:00.000Z",
      idempotencyKey: "delete-blocked",
      reason: "Retention expired",
    }),
    /Legal hold blocks/i,
  );

  await boundary.appendLifecycle({
    scope,
    recordId,
    type: "legal_hold_released",
    actorId: "legal-1",
    occurredAt: "2026-07-16T01:00:00.000Z",
    idempotencyKey: "hold-release",
    holdId: "matter-42",
    reason: "Matter closed",
  });
  assert.equal(
    evaluateRetentionDisposition(record, store.listLifecycleEvents(recordId), "2026-07-16T01:00:00.000Z").state,
    "eligible_for_deletion",
  );
  await boundary.appendLifecycle({
    scope,
    recordId,
    type: "deletion_requested",
    actorId: "retention-worker",
    occurredAt: "2026-07-16T01:01:00.000Z",
    idempotencyKey: "delete-request",
    reason: "Retention expired and no holds remain",
  });
  assert.equal(
    evaluateRetentionDisposition(record, store.listLifecycleEvents(recordId), "2026-07-16T01:01:00.000Z").state,
    "deletion_pending",
  );
  await assert.rejects(
    boundary.appendLifecycle({
      scope,
      recordId,
      type: "deletion_attested",
      actorId: "retention-worker",
      occurredAt: "2026-07-16T01:02:00.000Z",
      idempotencyKey: "forged-delete-attest",
      reason: "Forged erasure receipt",
      deletionReceiptSha256: "d".repeat(64),
    }),
    /receipt was not verified/i,
  );
  const deletionReceiptSha256 = sha256Canonical({
    receiptId: `deletion:${record.recordId}`,
    recordId: record.recordId,
    payloadSha256: record.payloadSha256,
    deletedAt,
  });
  await boundary.appendLifecycle({
    scope,
    recordId,
    type: "deletion_attested",
    actorId: "retention-worker",
    occurredAt: "2026-07-16T01:02:00.000Z",
    idempotencyKey: "delete-attest",
    reason: "Content erasure receipt verified",
    deletionReceiptSha256,
  });
  assert.equal(
    evaluateRetentionDisposition(record, store.listLifecycleEvents(recordId), "2026-07-16T01:02:00.000Z").state,
    "deleted",
  );
  assert.deepEqual(verifyAuditChain(store.listAuditEvents(scope.organizationId)), []);
  assert.equal(store.listAuditEvents(scope.organizationId).length, 5);
});

test("lifecycle and audit append roll back together on transaction failure", async () => {
  let failLifecycle = true;
  const store = new InMemoryAppendOnlyMediaIntelligenceStore((point) => {
    if (point === "before_lifecycle_commit" && failLifecycle) {
      failLifecycle = false;
      throw new Error("injected lifecycle transaction failure");
    }
  });
  const boundary = new MediaIntelligencePersistenceBoundary(store, authority());
  const committed = await boundary.appendArtifacts({
    ...appendInput("lifecycle-fault-artifact"),
    artifacts: [{ kind: "transcript", artifact: transcript() }],
  });
  const lifecycleInput = {
    scope,
    recordId: committed.recordIds[0],
    type: "legal_hold_applied" as const,
    actorId: "legal-1",
    occurredAt: "2026-07-15T00:30:00.000Z",
    idempotencyKey: "lifecycle-fault-retry",
    holdId: "matter-fault",
    reason: "Preserve during transaction test",
  };

  await assert.rejects(boundary.appendLifecycle(lifecycleInput), /injected lifecycle transaction failure/i);
  assert.equal(store.listLifecycleEvents(committed.recordIds[0]).length, 0);
  assert.equal(store.listAuditEvents(scope.organizationId).length, 1);
  const retry = await boundary.appendLifecycle(lifecycleInput);
  assert.equal(retry.idempotentReplay, false);
  assert.equal(store.listLifecycleEvents(committed.recordIds[0]).length, 1);
  assert.equal(store.listAuditEvents(scope.organizationId).length, 2);
});

test("retention and lifecycle history tampering fail closed", async () => {
  const store = new InMemoryAppendOnlyMediaIntelligenceStore();
  const boundary = new MediaIntelligencePersistenceBoundary(store, authority());
  const committed = await boundary.appendArtifacts({
    ...appendInput("retention-guard"),
    artifacts: [{ kind: "transcript", artifact: transcript() }],
  });
  const record = store.getRecord(committed.recordIds[0]);
  assert.ok(record);
  await assert.rejects(
    boundary.appendLifecycle({
      scope,
      recordId: record.recordId,
      type: "deletion_requested",
      actorId: "retention-worker",
      occurredAt: "2026-07-15T12:00:00.000Z",
      idempotencyKey: "early-delete",
      reason: "Attempted early deletion",
    }),
    /Retention period has not expired/i,
  );

  await boundary.appendLifecycle({
    scope,
    recordId: record.recordId,
    type: "legal_hold_applied",
    actorId: "legal-1",
    occurredAt: "2026-07-15T12:01:00.000Z",
    idempotencyKey: "tamper-hold",
    holdId: "matter-99",
    reason: "Preserve",
  });
  const events = store.listLifecycleEvents(record.recordId);
  const forged = [{ ...events[0], reason: "forged release context" }];
  assert.throws(
    () => evaluateRetentionDisposition(record, forged, "2026-07-17T00:00:00.000Z"),
    /Lifecycle history is invalid/i,
  );
});
