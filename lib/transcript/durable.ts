import { createHash } from "node:crypto";
import {
  validateAudioAnalysisRunAgainstTranscript,
  type AudioAnalysisRun,
} from "../audio-analysis/core.ts";
import {
  buildTranscriptSourceBinding,
  canonicalJson,
  deterministicUuid,
  isSameTranscriptSource,
  validateTranscriptDocument,
  type TranscriptDocument,
  type TranscriptSourceBinding,
} from "./core.ts";

export const MEDIA_INTELLIGENCE_RECORD_SCHEMA = "cco.media-intelligence-record.v1" as const;
export const MEDIA_INTELLIGENCE_AUDIT_SCHEMA = "cco.media-intelligence-audit.v1" as const;
export const MEDIA_INTELLIGENCE_LIFECYCLE_SCHEMA = "cco.media-intelligence-lifecycle.v1" as const;

const GENESIS_HASH = "0".repeat(64);
const MAX_TRANSACTION_ARTIFACTS = 101;
const MAX_RETENTION_DAYS = 3_650;

export type MediaIntelligenceArtifactKind = "transcript" | "analysis";
export type LifecycleEventType =
  | "legal_hold_applied"
  | "legal_hold_released"
  | "deletion_requested"
  | "deletion_attested";

export class MediaIntelligencePolicyError extends Error {
  readonly code:
    | "invalid_input"
    | "source_checksum_required"
    | "source_checksum_mismatch"
    | "artifact_invalid"
    | "artifact_conflict"
    | "idempotency_conflict"
    | "transaction_failed"
    | "audit_invalid"
    | "lifecycle_conflict"
    | "legal_hold_active"
    | "retention_not_expired"
    | "deletion_not_requested";

  constructor(code: MediaIntelligencePolicyError["code"], message: string) {
    super(message);
    this.name = "MediaIntelligencePolicyError";
    this.code = code;
  }
}

export interface MediaIntelligenceScope {
  readonly organizationId: string;
  readonly projectId: string;
  readonly assetId: string;
  readonly versionId: string;
}

export interface VerifiedSourceChecksumReceipt {
  readonly receiptId: string;
  readonly assetId: string;
  readonly versionId: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly verifiedAt: string;
  readonly verifier: "ingest-receipt" | "storage-inspection";
}

export interface SourceChecksumAuthority {
  verify(input: {
    readonly scope: MediaIntelligenceScope;
    readonly source: TranscriptSourceBinding;
  }): Promise<VerifiedSourceChecksumReceipt | null>;
}

export interface VerifiedContentDeletionReceipt {
  readonly receiptId: string;
  readonly recordId: string;
  readonly payloadSha256: string;
  readonly deletedAt: string;
  readonly receiptSha256: string;
}

export interface ContentDeletionAuthority {
  verify(input: {
    readonly record: MediaIntelligenceArtifactRecord;
    readonly presentedReceiptSha256: string;
  }): Promise<VerifiedContentDeletionReceipt | null>;
}

export interface MediaIntelligenceRetentionPolicy {
  readonly policyId: string;
  readonly retainUntil: string;
  readonly disposition: "delete_content";
  readonly region: string | null;
}

export type MediaIntelligenceArtifactInput =
  | { readonly kind: "transcript"; readonly artifact: TranscriptDocument }
  | { readonly kind: "analysis"; readonly artifact: AudioAnalysisRun };

export interface MediaIntelligenceArtifactRecord {
  readonly schemaVersion: typeof MEDIA_INTELLIGENCE_RECORD_SCHEMA;
  readonly recordId: string;
  readonly artifactKind: MediaIntelligenceArtifactKind;
  readonly artifactId: string;
  readonly parentTranscriptId: string | null;
  readonly scope: MediaIntelligenceScope;
  readonly source: TranscriptSourceBinding;
  readonly sourceChecksumReceiptId: string;
  readonly payloadSha256: string;
  readonly replayDigest: string;
  readonly retention: MediaIntelligenceRetentionPolicy;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly transactionId: string;
  readonly integritySha256: string;
}

export interface MediaIntelligenceAuditEvent {
  readonly schemaVersion: typeof MEDIA_INTELLIGENCE_AUDIT_SCHEMA;
  readonly organizationId: string;
  readonly sequence: number;
  readonly eventId: string;
  readonly transactionId: string;
  readonly action:
    | "artifacts_appended"
    | "legal_hold_applied"
    | "legal_hold_released"
    | "deletion_requested"
    | "deletion_attested";
  readonly actorId: string;
  readonly occurredAt: string;
  readonly subjectRecordIds: readonly string[];
  readonly detailsSha256: string;
  readonly previousEventSha256: string;
  readonly eventSha256: string;
}

export interface ArtifactCommitReceipt {
  readonly transactionId: string;
  readonly commandSha256: string;
  readonly recordIds: readonly string[];
  readonly auditEventSha256: string;
  readonly commitSha256: string;
  readonly idempotentReplay: boolean;
}

export interface MediaIntelligenceLifecycleEvent {
  readonly schemaVersion: typeof MEDIA_INTELLIGENCE_LIFECYCLE_SCHEMA;
  readonly recordId: string;
  readonly sequence: number;
  readonly eventId: string;
  readonly type: LifecycleEventType;
  readonly actorId: string;
  readonly occurredAt: string;
  readonly holdId: string | null;
  readonly reason: string;
  readonly deletionReceiptSha256: string | null;
  readonly previousEventSha256: string;
  readonly eventSha256: string;
}

export interface LifecycleCommitReceipt {
  readonly transactionId: string;
  readonly commandSha256: string;
  readonly lifecycleEventSha256: string;
  readonly auditEventSha256: string;
  readonly commitSha256: string;
  readonly idempotentReplay: boolean;
}

export interface RetentionDisposition {
  readonly state:
    | "retained_by_policy"
    | "retained_by_legal_hold"
    | "eligible_for_deletion"
    | "deletion_pending"
    | "deleted";
  readonly activeHoldIds: readonly string[];
  readonly retainUntil: string;
  readonly deletionAllowed: boolean;
}

export interface ArtifactRecordDraft {
  readonly artifactKind: MediaIntelligenceArtifactKind;
  readonly artifactId: string;
  readonly parentTranscriptId: string | null;
  readonly source: TranscriptSourceBinding;
  readonly sourceChecksumReceiptId: string;
  readonly payloadSha256: string;
  readonly replayDigest: string;
  readonly payload: TranscriptDocument | AudioAnalysisRun;
}

export interface ArtifactCommitCommand {
  readonly scope: MediaIntelligenceScope;
  readonly actorId: string;
  readonly occurredAt: string;
  readonly retention: MediaIntelligenceRetentionPolicy;
  readonly idempotencyKeySha256: string;
  readonly commandSha256: string;
  readonly drafts: readonly ArtifactRecordDraft[];
}

export interface LifecycleCommitCommand {
  readonly scope: MediaIntelligenceScope;
  readonly recordId: string;
  readonly type: LifecycleEventType;
  readonly actorId: string;
  readonly occurredAt: string;
  readonly holdId: string | null;
  readonly reason: string;
  readonly deletionReceiptSha256: string | null;
  readonly idempotencyKeySha256: string;
  readonly commandSha256: string;
}

export interface AppendOnlyMediaIntelligenceStore {
  commitArtifacts(command: ArtifactCommitCommand): Promise<ArtifactCommitReceipt>;
  commitLifecycle(command: LifecycleCommitCommand): Promise<LifecycleCommitReceipt>;
  getRecord(recordId: string): MediaIntelligenceArtifactRecord | null;
  findRecord(
    scope: MediaIntelligenceScope,
    artifactKind: MediaIntelligenceArtifactKind,
    artifactId: string,
  ): MediaIntelligenceArtifactRecord | null;
  getPayload(recordId: string): TranscriptDocument | AudioAnalysisRun | null;
  listAuditEvents(organizationId: string): readonly MediaIntelligenceAuditEvent[];
  listLifecycleEvents(recordId: string): readonly MediaIntelligenceLifecycleEvent[];
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function sha256Canonical(value: unknown): string {
  return sha256Text(canonicalJson(value));
}

function assertSha256(value: string, field: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new MediaIntelligencePolicyError("invalid_input", `${field} must be a lowercase SHA-256 digest`);
  }
}

function assertIdentifier(value: string, field: string): void {
  if (!value.trim() || value.length > 200 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new MediaIntelligencePolicyError("invalid_input", `${field} is invalid`);
  }
}

function normalizeTimestamp(value: string, field: string): string {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new MediaIntelligencePolicyError("invalid_input", `${field} must be an ISO timestamp`);
  }
  return new Date(milliseconds).toISOString();
}

function cloneFrozen<T>(value: T): T {
  const clone = structuredClone(value);
  const freeze = (candidate: unknown): void => {
    if (!candidate || typeof candidate !== "object" || Object.isFrozen(candidate)) return;
    Object.freeze(candidate);
    for (const child of Object.values(candidate as Record<string, unknown>)) freeze(child);
  };
  freeze(clone);
  return clone;
}

function scopeKey(scope: MediaIntelligenceScope): string {
  return `${scope.organizationId}\u0000${scope.projectId}\u0000${scope.assetId}\u0000${scope.versionId}`;
}

function artifactKey(
  scope: MediaIntelligenceScope,
  kind: MediaIntelligenceArtifactKind,
  artifactId: string,
): string {
  return `${scopeKey(scope)}\u0000${kind}\u0000${artifactId}`;
}

function assertScope(scope: MediaIntelligenceScope): void {
  assertIdentifier(scope.organizationId, "organizationId");
  assertIdentifier(scope.projectId, "projectId");
  assertIdentifier(scope.assetId, "assetId");
  assertIdentifier(scope.versionId, "versionId");
}

function assertScopeSource(scope: MediaIntelligenceScope, source: TranscriptSourceBinding): void {
  if (scope.assetId !== source.assetId || scope.versionId !== source.versionId) {
    throw new MediaIntelligencePolicyError(
      "artifact_invalid",
      "Artifact source does not match the transaction asset/version scope",
    );
  }
}

function normalizedRetention(
  policy: MediaIntelligenceRetentionPolicy,
  occurredAt: string,
): MediaIntelligenceRetentionPolicy {
  assertIdentifier(policy.policyId, "retention.policyId");
  const retainUntil = normalizeTimestamp(policy.retainUntil, "retention.retainUntil");
  if (Date.parse(retainUntil) < Date.parse(occurredAt)) {
    throw new MediaIntelligencePolicyError(
      "invalid_input",
      "Retention cannot expire before the append transaction",
    );
  }
  if (Date.parse(retainUntil) - Date.parse(occurredAt) > MAX_RETENTION_DAYS * 86_400_000) {
    throw new MediaIntelligencePolicyError("invalid_input", "Retention exceeds the supported policy horizon");
  }
  if (policy.disposition !== "delete_content") {
    throw new MediaIntelligencePolicyError("invalid_input", "Unsupported retention disposition");
  }
  if (policy.region !== null) assertIdentifier(policy.region, "retention.region");
  return Object.freeze({ ...policy, retainUntil });
}

export function bindVerifiedSourceChecksum(
  source: TranscriptSourceBinding,
  receipt: VerifiedSourceChecksumReceipt,
): TranscriptSourceBinding {
  assertIdentifier(receipt.receiptId, "checksum receipt id");
  assertSha256(receipt.sha256, "checksum receipt sha256");
  normalizeTimestamp(receipt.verifiedAt, "checksum receipt verifiedAt");
  if (!Number.isInteger(receipt.sizeBytes) || receipt.sizeBytes < 0) {
    throw new MediaIntelligencePolicyError("invalid_input", "Checksum receipt size is invalid");
  }
  if (receipt.assetId !== source.assetId || receipt.versionId !== source.versionId) {
    throw new MediaIntelligencePolicyError(
      "source_checksum_mismatch",
      "Checksum receipt belongs to another asset or version",
    );
  }
  if (source.fileSizeBytes !== null && source.fileSizeBytes !== receipt.sizeBytes) {
    throw new MediaIntelligencePolicyError(
      "source_checksum_mismatch",
      "Checksum receipt size does not match the source binding",
    );
  }
  if (source.mediaSha256 !== null && source.mediaSha256 !== receipt.sha256) {
    throw new MediaIntelligencePolicyError(
      "source_checksum_mismatch",
      "Checksum receipt digest does not match the source binding",
    );
  }
  return buildTranscriptSourceBinding({
    assetId: source.assetId,
    versionId: source.versionId,
    versionNumber: source.versionNumber,
    versionCreatedAt: source.versionCreatedAt,
    durationMs: source.durationMs,
    fileSizeBytes: receipt.sizeBytes,
    mediaSha256: receipt.sha256,
  });
}

async function requireVerifiedChecksum(
  authority: SourceChecksumAuthority,
  scope: MediaIntelligenceScope,
  source: TranscriptSourceBinding,
): Promise<VerifiedSourceChecksumReceipt> {
  if (source.mediaSha256 === null) {
    throw new MediaIntelligencePolicyError(
      "source_checksum_required",
      "Durable media intelligence requires a checksum-bound source",
    );
  }
  const receipt = await authority.verify({ scope, source });
  if (!receipt) {
    throw new MediaIntelligencePolicyError(
      "source_checksum_required",
      "No trusted source checksum receipt is available",
    );
  }
  const bound = bindVerifiedSourceChecksum(source, receipt);
  if (!isSameTranscriptSource(bound, source)) {
    throw new MediaIntelligencePolicyError(
      "source_checksum_mismatch",
      "Trusted checksum receipt does not reproduce the artifact source binding",
    );
  }
  return receipt;
}

function recordIntegrityBasis(record: unknown): unknown {
  return record;
}

function auditIntegrityBasis(event: unknown): unknown {
  return event;
}

function lifecycleIntegrityBasis(event: unknown): unknown {
  return event;
}

export function verifyArtifactRecord(
  record: MediaIntelligenceArtifactRecord,
  payload: TranscriptDocument | AudioAnalysisRun,
): readonly string[] {
  const errors: string[] = [];
  if (record.schemaVersion !== MEDIA_INTELLIGENCE_RECORD_SCHEMA) errors.push("Unsupported record schema");
  if (record.payloadSha256 !== sha256Canonical(payload)) errors.push("Artifact payload checksum mismatch");
  const basis = Object.fromEntries(
    Object.entries(record).filter(([key]) => key !== "integritySha256"),
  );
  if (record.integritySha256 !== sha256Canonical(recordIntegrityBasis(basis))) {
    errors.push("Artifact record integrity checksum mismatch");
  }
  if (record.source.mediaSha256 === null) errors.push("Artifact source checksum is missing");
  if (record.scope.assetId !== record.source.assetId || record.scope.versionId !== record.source.versionId) {
    errors.push("Artifact record scope/source mismatch");
  }
  return Object.freeze(errors);
}

export function verifyAuditChain(events: readonly MediaIntelligenceAuditEvent[]): readonly string[] {
  const errors: string[] = [];
  let previous = GENESIS_HASH;
  let previousTimestamp = -Infinity;
  events.forEach((event, index) => {
    if (event.sequence !== index + 1) errors.push(`Audit event ${event.eventId} sequence mismatch`);
    if (event.previousEventSha256 !== previous) errors.push(`Audit event ${event.eventId} chain mismatch`);
    const basis = Object.fromEntries(
      Object.entries(event).filter(([key]) => key !== "eventSha256"),
    );
    if (event.eventSha256 !== sha256Canonical(auditIntegrityBasis(basis))) {
      errors.push(`Audit event ${event.eventId} checksum mismatch`);
    }
    const timestamp = Date.parse(event.occurredAt);
    if (!Number.isFinite(timestamp) || timestamp < previousTimestamp) {
      errors.push(`Audit event ${event.eventId} timestamp regression`);
    }
    previousTimestamp = timestamp;
    previous = event.eventSha256;
  });
  return Object.freeze(errors);
}

export function verifyLifecycleChain(
  record: MediaIntelligenceArtifactRecord,
  events: readonly MediaIntelligenceLifecycleEvent[],
): readonly string[] {
  const errors: string[] = [];
  let previous = GENESIS_HASH;
  let previousTimestamp = -Infinity;
  events.forEach((event, index) => {
    if (event.recordId !== record.recordId) errors.push(`Lifecycle event ${event.eventId} record mismatch`);
    if (event.sequence !== index + 1) errors.push(`Lifecycle event ${event.eventId} sequence mismatch`);
    if (event.previousEventSha256 !== previous) errors.push(`Lifecycle event ${event.eventId} chain mismatch`);
    const basis = Object.fromEntries(
      Object.entries(event).filter(([key]) => key !== "eventSha256"),
    );
    if (event.eventSha256 !== sha256Canonical(lifecycleIntegrityBasis(basis))) {
      errors.push(`Lifecycle event ${event.eventId} checksum mismatch`);
    }
    const timestamp = Date.parse(event.occurredAt);
    if (!Number.isFinite(timestamp) || timestamp < previousTimestamp) {
      errors.push(`Lifecycle event ${event.eventId} timestamp regression`);
    }
    previousTimestamp = timestamp;
    previous = event.eventSha256;
  });
  return Object.freeze(errors);
}

export function evaluateRetentionDisposition(
  record: MediaIntelligenceArtifactRecord,
  events: readonly MediaIntelligenceLifecycleEvent[],
  now: string,
): RetentionDisposition {
  const chainErrors = verifyLifecycleChain(record, events);
  if (chainErrors.length > 0) {
    throw new MediaIntelligencePolicyError(
      "audit_invalid",
      `Lifecycle history is invalid: ${chainErrors.join("; ")}`,
    );
  }
  const activeHolds = new Set<string>();
  let deletionRequested = false;
  let deleted = false;
  for (const event of events) {
    if (event.type === "legal_hold_applied" && event.holdId) activeHolds.add(event.holdId);
    if (event.type === "legal_hold_released" && event.holdId) activeHolds.delete(event.holdId);
    if (event.type === "deletion_requested") deletionRequested = true;
    if (event.type === "deletion_attested") deleted = true;
  }
  const activeHoldIds = Object.freeze([...activeHolds].sort());
  if (deleted) {
    return Object.freeze({
      state: "deleted",
      activeHoldIds,
      retainUntil: record.retention.retainUntil,
      deletionAllowed: false,
    });
  }
  if (activeHoldIds.length > 0) {
    return Object.freeze({
      state: "retained_by_legal_hold",
      activeHoldIds,
      retainUntil: record.retention.retainUntil,
      deletionAllowed: false,
    });
  }
  const normalizedNow = normalizeTimestamp(now, "retention evaluation time");
  if (Date.parse(normalizedNow) < Date.parse(record.retention.retainUntil)) {
    return Object.freeze({
      state: "retained_by_policy",
      activeHoldIds,
      retainUntil: record.retention.retainUntil,
      deletionAllowed: false,
    });
  }
  if (deletionRequested) {
    return Object.freeze({
      state: "deletion_pending",
      activeHoldIds,
      retainUntil: record.retention.retainUntil,
      deletionAllowed: false,
    });
  }
  return Object.freeze({
    state: "eligible_for_deletion",
    activeHoldIds,
    retainUntil: record.retention.retainUntil,
    deletionAllowed: true,
  });
}

interface StoredIdempotency<T> {
  readonly commandSha256: string;
  readonly receipt: T;
}

export type InMemoryStoreFaultPoint = "before_artifact_commit" | "before_lifecycle_commit";

export class InMemoryAppendOnlyMediaIntelligenceStore implements AppendOnlyMediaIntelligenceStore {
  private records = new Map<string, MediaIntelligenceArtifactRecord>();
  private payloads = new Map<string, TranscriptDocument | AudioAnalysisRun>();
  private artifactIndex = new Map<string, string>();
  private auditEvents = new Map<string, readonly MediaIntelligenceAuditEvent[]>();
  private lifecycleEvents = new Map<string, readonly MediaIntelligenceLifecycleEvent[]>();
  private idempotency = new Map<string, StoredIdempotency<ArtifactCommitReceipt | LifecycleCommitReceipt>>();
  private transactionTail: Promise<void> = Promise.resolve();
  private readonly faultInjector: ((point: InMemoryStoreFaultPoint) => void | Promise<void>) | undefined;

  constructor(faultInjector?: (point: InMemoryStoreFaultPoint) => void | Promise<void>) {
    this.faultInjector = faultInjector;
  }

  getRecord(recordId: string): MediaIntelligenceArtifactRecord | null {
    const record = this.records.get(recordId);
    return record ? cloneFrozen(record) : null;
  }

  findRecord(
    scope: MediaIntelligenceScope,
    artifactKind: MediaIntelligenceArtifactKind,
    artifactId: string,
  ): MediaIntelligenceArtifactRecord | null {
    const recordId = this.artifactIndex.get(artifactKey(scope, artifactKind, artifactId));
    return recordId ? this.getRecord(recordId) : null;
  }

  getPayload(recordId: string): TranscriptDocument | AudioAnalysisRun | null {
    const payload = this.payloads.get(recordId);
    return payload ? cloneFrozen(payload) : null;
  }

  listAuditEvents(organizationId: string): readonly MediaIntelligenceAuditEvent[] {
    return cloneFrozen([...(this.auditEvents.get(organizationId) ?? [])]);
  }

  listLifecycleEvents(recordId: string): readonly MediaIntelligenceLifecycleEvent[] {
    return cloneFrozen([...(this.lifecycleEvents.get(recordId) ?? [])]);
  }

  async commitArtifacts(command: ArtifactCommitCommand): Promise<ArtifactCommitReceipt> {
    return this.serialized(() => this.commitArtifactsUnlocked(command));
  }

  private async commitArtifactsUnlocked(command: ArtifactCommitCommand): Promise<ArtifactCommitReceipt> {
    const replayKey = `artifact\u0000${scopeKey(command.scope)}\u0000${command.idempotencyKeySha256}`;
    const replay = this.idempotency.get(replayKey);
    if (replay) {
      if (replay.commandSha256 !== command.commandSha256) {
        throw new MediaIntelligencePolicyError(
          "idempotency_conflict",
          "Idempotency key was already used for a different artifact transaction",
        );
      }
      return Object.freeze({ ...(replay.receipt as ArtifactCommitReceipt), idempotentReplay: true });
    }

    const transactionId = deterministicUuid({
      kind: "media-intelligence-artifact-transaction",
      scope: command.scope,
      commandSha256: command.commandSha256,
    });
    const nextRecords = new Map(this.records);
    const nextPayloads = new Map(this.payloads);
    const nextArtifactIndex = new Map(this.artifactIndex);
    const nextAuditEvents = new Map(this.auditEvents);
    const nextIdempotency = new Map(this.idempotency);
    const recordIds: string[] = [];
    const availableTranscriptIds = new Set<string>();

    for (const [key, recordId] of nextArtifactIndex) {
      if (!key.startsWith(`${scopeKey(command.scope)}\u0000transcript\u0000`)) continue;
      const record = nextRecords.get(recordId);
      if (record) availableTranscriptIds.add(record.artifactId);
    }
    for (const draft of command.drafts) {
      if (draft.artifactKind === "transcript") availableTranscriptIds.add(draft.artifactId);
    }

    for (const draft of command.drafts) {
      const indexKey = artifactKey(command.scope, draft.artifactKind, draft.artifactId);
      if (nextArtifactIndex.has(indexKey)) {
        throw new MediaIntelligencePolicyError(
          "artifact_conflict",
          `${draft.artifactKind} artifact ${draft.artifactId} is already append-only persisted`,
        );
      }
      if (
        draft.artifactKind === "analysis" &&
        (!draft.parentTranscriptId || !availableTranscriptIds.has(draft.parentTranscriptId))
      ) {
        throw new MediaIntelligencePolicyError(
          "artifact_invalid",
          "Analysis persistence requires its immutable parent transcript in the same scope",
        );
      }
      const recordId = deterministicUuid({
        kind: "media-intelligence-record",
        scope: command.scope,
        artifactKind: draft.artifactKind,
        artifactId: draft.artifactId,
        payloadSha256: draft.payloadSha256,
      });
      const basis: Omit<MediaIntelligenceArtifactRecord, "integritySha256"> = {
        schemaVersion: MEDIA_INTELLIGENCE_RECORD_SCHEMA,
        recordId,
        artifactKind: draft.artifactKind,
        artifactId: draft.artifactId,
        parentTranscriptId: draft.parentTranscriptId,
        scope: command.scope,
        source: draft.source,
        sourceChecksumReceiptId: draft.sourceChecksumReceiptId,
        payloadSha256: draft.payloadSha256,
        replayDigest: draft.replayDigest,
        retention: command.retention,
        createdAt: command.occurredAt,
        createdBy: command.actorId,
        transactionId,
      };
      const record = cloneFrozen({
        ...basis,
        integritySha256: sha256Canonical(recordIntegrityBasis(basis)),
      });
      nextRecords.set(recordId, record);
      nextPayloads.set(recordId, cloneFrozen(draft.payload));
      nextArtifactIndex.set(indexKey, recordId);
      recordIds.push(recordId);
    }

    const priorAudit = [...(nextAuditEvents.get(command.scope.organizationId) ?? [])];
    if (Date.parse(command.occurredAt) < Date.parse(priorAudit.at(-1)?.occurredAt ?? command.occurredAt)) {
      throw new MediaIntelligencePolicyError("audit_invalid", "Audit timestamps cannot move backward");
    }
    const previousEventSha256 = priorAudit.at(-1)?.eventSha256 ?? GENESIS_HASH;
    const auditBasis: Omit<MediaIntelligenceAuditEvent, "eventSha256"> = {
      schemaVersion: MEDIA_INTELLIGENCE_AUDIT_SCHEMA,
      organizationId: command.scope.organizationId,
      sequence: priorAudit.length + 1,
      eventId: deterministicUuid({ transactionId, action: "artifacts_appended" }),
      transactionId,
      action: "artifacts_appended",
      actorId: command.actorId,
      occurredAt: command.occurredAt,
      subjectRecordIds: Object.freeze([...recordIds]),
      detailsSha256: sha256Canonical({
        scope: command.scope,
        artifacts: command.drafts.map((draft) => ({
          kind: draft.artifactKind,
          id: draft.artifactId,
          payloadSha256: draft.payloadSha256,
        })),
      }),
      previousEventSha256,
    };
    const audit = cloneFrozen({
      ...auditBasis,
      eventSha256: sha256Canonical(auditIntegrityBasis(auditBasis)),
    });
    priorAudit.push(audit);
    nextAuditEvents.set(command.scope.organizationId, Object.freeze(priorAudit));

    const receiptBasis = {
      transactionId,
      commandSha256: command.commandSha256,
      recordIds: Object.freeze([...recordIds]),
      auditEventSha256: audit.eventSha256,
    };
    const receipt: ArtifactCommitReceipt = Object.freeze({
      ...receiptBasis,
      commitSha256: sha256Canonical(receiptBasis),
      idempotentReplay: false,
    });
    nextIdempotency.set(replayKey, { commandSha256: command.commandSha256, receipt });

    await this.faultInjector?.("before_artifact_commit");
    this.records = nextRecords;
    this.payloads = nextPayloads;
    this.artifactIndex = nextArtifactIndex;
    this.auditEvents = nextAuditEvents;
    this.idempotency = nextIdempotency;
    return receipt;
  }

  async commitLifecycle(command: LifecycleCommitCommand): Promise<LifecycleCommitReceipt> {
    return this.serialized(() => this.commitLifecycleUnlocked(command));
  }

  private async commitLifecycleUnlocked(command: LifecycleCommitCommand): Promise<LifecycleCommitReceipt> {
    const replayKey = `lifecycle\u0000${scopeKey(command.scope)}\u0000${command.idempotencyKeySha256}`;
    const replay = this.idempotency.get(replayKey);
    if (replay) {
      if (replay.commandSha256 !== command.commandSha256) {
        throw new MediaIntelligencePolicyError(
          "idempotency_conflict",
          "Idempotency key was already used for a different lifecycle transaction",
        );
      }
      return Object.freeze({ ...(replay.receipt as LifecycleCommitReceipt), idempotentReplay: true });
    }

    const record = this.records.get(command.recordId);
    if (!record || scopeKey(record.scope) !== scopeKey(command.scope)) {
      throw new MediaIntelligencePolicyError("artifact_invalid", "Lifecycle record was not found in scope");
    }
    const priorLifecycle = [...(this.lifecycleEvents.get(record.recordId) ?? [])];
    if (Date.parse(command.occurredAt) < Date.parse(priorLifecycle.at(-1)?.occurredAt ?? command.occurredAt)) {
      throw new MediaIntelligencePolicyError("audit_invalid", "Lifecycle timestamps cannot move backward");
    }
    const disposition = evaluateRetentionDisposition(record, priorLifecycle, command.occurredAt);
    const activeHolds = new Set(disposition.activeHoldIds);
    if (disposition.state === "deleted") {
      throw new MediaIntelligencePolicyError("lifecycle_conflict", "Deleted content has a terminal lifecycle");
    }
    if (command.type === "legal_hold_applied") {
      if (!command.holdId) throw new MediaIntelligencePolicyError("invalid_input", "Legal hold id is required");
      if (activeHolds.has(command.holdId)) {
        throw new MediaIntelligencePolicyError("lifecycle_conflict", "Legal hold is already active");
      }
    }
    if (command.type === "legal_hold_released") {
      if (!command.holdId || !activeHolds.has(command.holdId)) {
        throw new MediaIntelligencePolicyError("lifecycle_conflict", "Legal hold is not active");
      }
    }
    if (command.type === "deletion_requested") {
      if (disposition.state === "retained_by_legal_hold") {
        throw new MediaIntelligencePolicyError("legal_hold_active", "Legal hold blocks retention deletion");
      }
      if (disposition.state === "retained_by_policy") {
        throw new MediaIntelligencePolicyError("retention_not_expired", "Retention period has not expired");
      }
      if (disposition.state !== "eligible_for_deletion") {
        throw new MediaIntelligencePolicyError("lifecycle_conflict", "Deletion is already pending");
      }
    }
    if (command.type === "deletion_attested") {
      if (disposition.state !== "deletion_pending") {
        throw new MediaIntelligencePolicyError(
          "deletion_not_requested",
          "Deletion must be requested before an attestation can be appended",
        );
      }
      if (!command.deletionReceiptSha256) {
        throw new MediaIntelligencePolicyError("invalid_input", "Deletion receipt checksum is required");
      }
      assertSha256(command.deletionReceiptSha256, "deletion receipt checksum");
    }

    const transactionId = deterministicUuid({
      kind: "media-intelligence-lifecycle-transaction",
      recordId: record.recordId,
      commandSha256: command.commandSha256,
    });
    const previousEventSha256 = priorLifecycle.at(-1)?.eventSha256 ?? GENESIS_HASH;
    const lifecycleBasis: Omit<MediaIntelligenceLifecycleEvent, "eventSha256"> = {
      schemaVersion: MEDIA_INTELLIGENCE_LIFECYCLE_SCHEMA,
      recordId: record.recordId,
      sequence: priorLifecycle.length + 1,
      eventId: deterministicUuid({ transactionId, type: command.type }),
      type: command.type,
      actorId: command.actorId,
      occurredAt: command.occurredAt,
      holdId: command.holdId,
      reason: command.reason,
      deletionReceiptSha256: command.deletionReceiptSha256,
      previousEventSha256,
    };
    const lifecycleEvent = cloneFrozen({
      ...lifecycleBasis,
      eventSha256: sha256Canonical(lifecycleIntegrityBasis(lifecycleBasis)),
    });

    const nextLifecycleEvents = new Map(this.lifecycleEvents);
    priorLifecycle.push(lifecycleEvent);
    nextLifecycleEvents.set(record.recordId, Object.freeze(priorLifecycle));
    const nextAuditEvents = new Map(this.auditEvents);
    const priorAudit = [...(nextAuditEvents.get(command.scope.organizationId) ?? [])];
    if (Date.parse(command.occurredAt) < Date.parse(priorAudit.at(-1)?.occurredAt ?? command.occurredAt)) {
      throw new MediaIntelligencePolicyError("audit_invalid", "Audit timestamps cannot move backward");
    }
    const priorAuditHash = priorAudit.at(-1)?.eventSha256 ?? GENESIS_HASH;
    const auditBasis: Omit<MediaIntelligenceAuditEvent, "eventSha256"> = {
      schemaVersion: MEDIA_INTELLIGENCE_AUDIT_SCHEMA,
      organizationId: command.scope.organizationId,
      sequence: priorAudit.length + 1,
      eventId: deterministicUuid({ transactionId, action: command.type }),
      transactionId,
      action: command.type,
      actorId: command.actorId,
      occurredAt: command.occurredAt,
      subjectRecordIds: Object.freeze([record.recordId]),
      detailsSha256: sha256Canonical({
        recordId: record.recordId,
        lifecycleEventSha256: lifecycleEvent.eventSha256,
        holdId: command.holdId,
        deletionReceiptSha256: command.deletionReceiptSha256,
      }),
      previousEventSha256: priorAuditHash,
    };
    const audit = cloneFrozen({
      ...auditBasis,
      eventSha256: sha256Canonical(auditIntegrityBasis(auditBasis)),
    });
    priorAudit.push(audit);
    nextAuditEvents.set(command.scope.organizationId, Object.freeze(priorAudit));

    const receiptBasis = {
      transactionId,
      commandSha256: command.commandSha256,
      lifecycleEventSha256: lifecycleEvent.eventSha256,
      auditEventSha256: audit.eventSha256,
    };
    const receipt: LifecycleCommitReceipt = Object.freeze({
      ...receiptBasis,
      commitSha256: sha256Canonical(receiptBasis),
      idempotentReplay: false,
    });
    const nextIdempotency = new Map(this.idempotency);
    nextIdempotency.set(replayKey, { commandSha256: command.commandSha256, receipt });

    await this.faultInjector?.("before_lifecycle_commit");
    this.lifecycleEvents = nextLifecycleEvents;
    this.auditEvents = nextAuditEvents;
    this.idempotency = nextIdempotency;
    return receipt;
  }

  private async serialized<T>(operation: () => Promise<T>): Promise<T> {
    const prior = this.transactionTail;
    let release = (): void => undefined;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prior;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

export class MediaIntelligencePersistenceBoundary {
  private readonly store: AppendOnlyMediaIntelligenceStore;
  private readonly checksumAuthority: SourceChecksumAuthority;
  private readonly deletionAuthority: ContentDeletionAuthority | undefined;

  constructor(
    store: AppendOnlyMediaIntelligenceStore,
    checksumAuthority: SourceChecksumAuthority,
    deletionAuthority?: ContentDeletionAuthority,
  ) {
    this.store = store;
    this.checksumAuthority = checksumAuthority;
    this.deletionAuthority = deletionAuthority;
  }

  async appendArtifacts(input: {
    readonly scope: MediaIntelligenceScope;
    readonly actorId: string;
    readonly occurredAt: string;
    readonly idempotencyKey: string;
    readonly retention: MediaIntelligenceRetentionPolicy;
    readonly artifacts: readonly MediaIntelligenceArtifactInput[];
  }): Promise<ArtifactCommitReceipt> {
    assertScope(input.scope);
    assertIdentifier(input.actorId, "actorId");
    assertIdentifier(input.idempotencyKey, "idempotencyKey");
    const occurredAt = normalizeTimestamp(input.occurredAt, "occurredAt");
    const retention = normalizedRetention(input.retention, occurredAt);
    if (input.artifacts.length === 0 || input.artifacts.length > MAX_TRANSACTION_ARTIFACTS) {
      throw new MediaIntelligencePolicyError(
        "invalid_input",
        `Artifact transaction must contain between 1 and ${MAX_TRANSACTION_ARTIFACTS} artifacts`,
      );
    }

    const firstSource = input.artifacts[0].artifact.source;
    assertScopeSource(input.scope, firstSource);
    const checksumReceipt = await requireVerifiedChecksum(
      this.checksumAuthority,
      input.scope,
      firstSource,
    );
    if (Date.parse(checksumReceipt.verifiedAt) > Date.parse(occurredAt)) {
      throw new MediaIntelligencePolicyError(
        "source_checksum_mismatch",
        "Source checksum receipt cannot postdate the append transaction",
      );
    }
    const drafts: ArtifactRecordDraft[] = [];
    const transactionTranscripts = new Map(
      input.artifacts
        .filter((item): item is Extract<MediaIntelligenceArtifactInput, { kind: "transcript" }> =>
          item.kind === "transcript"
        )
        .map((item) => [item.artifact.documentId, item.artifact]),
    );
    for (const item of input.artifacts) {
      const source = item.artifact.source;
      assertScopeSource(input.scope, source);
      if (!isSameTranscriptSource(firstSource, source)) {
        throw new MediaIntelligencePolicyError(
          "artifact_invalid",
          "One append transaction cannot mix source identities",
        );
      }
      const verified = bindVerifiedSourceChecksum(source, checksumReceipt);
      if (!isSameTranscriptSource(verified, source)) {
        throw new MediaIntelligencePolicyError(
          "source_checksum_mismatch",
          "Artifact source changed after checksum verification",
        );
      }

      if (item.kind === "transcript") {
        const validation = validateTranscriptDocument(item.artifact);
        if (!validation.ok) {
          throw new MediaIntelligencePolicyError(
            "artifact_invalid",
            `Transcript is invalid: ${validation.errors.join("; ")}`,
          );
        }
        drafts.push(Object.freeze({
          artifactKind: "transcript",
          artifactId: item.artifact.documentId,
          parentTranscriptId: null,
          source,
          sourceChecksumReceiptId: checksumReceipt.receiptId,
          payloadSha256: sha256Canonical(item.artifact),
          replayDigest: item.artifact.provenance.replay.outputDigest,
          payload: item.artifact,
        }));
      } else {
        let parentTranscript = transactionTranscripts.get(item.artifact.transcriptId);
        if (!parentTranscript) {
          const parentRecord = this.store.findRecord(
            input.scope,
            "transcript",
            item.artifact.transcriptId,
          );
          const parentPayload = parentRecord ? this.store.getPayload(parentRecord.recordId) : null;
          if (parentPayload && "tokens" in parentPayload) parentTranscript = parentPayload;
        }
        if (!parentTranscript) {
          throw new MediaIntelligencePolicyError(
            "artifact_invalid",
            "Analysis persistence requires its immutable parent transcript in the same scope",
          );
        }
        const errors = validateAudioAnalysisRunAgainstTranscript(item.artifact, parentTranscript);
        if (errors.length > 0) {
          throw new MediaIntelligencePolicyError(
            "artifact_invalid",
            `Analysis is invalid: ${errors.join("; ")}`,
          );
        }
        drafts.push(Object.freeze({
          artifactKind: "analysis",
          artifactId: item.artifact.runId,
          parentTranscriptId: item.artifact.transcriptId,
          source,
          sourceChecksumReceiptId: checksumReceipt.receiptId,
          payloadSha256: sha256Canonical(item.artifact),
          replayDigest: item.artifact.replay.outputDigest,
          payload: item.artifact,
        }));
      }
    }

    const commandBasis = {
      scope: input.scope,
      actorId: input.actorId,
      occurredAt,
      retention,
      artifacts: drafts.map((draft) => ({
        kind: draft.artifactKind,
        artifactId: draft.artifactId,
        parentTranscriptId: draft.parentTranscriptId,
        sourceIdentityDigest: draft.source.identityDigest,
        sourceSha256: draft.source.mediaSha256,
        payloadSha256: draft.payloadSha256,
        replayDigest: draft.replayDigest,
      })),
    };
    return this.store.commitArtifacts(Object.freeze({
      scope: input.scope,
      actorId: input.actorId,
      occurredAt,
      retention,
      idempotencyKeySha256: sha256Text(`${scopeKey(input.scope)}\u0000${input.idempotencyKey}`),
      commandSha256: sha256Canonical(commandBasis),
      drafts: Object.freeze(drafts),
    }));
  }

  async appendLifecycle(input: {
    readonly scope: MediaIntelligenceScope;
    readonly recordId: string;
    readonly type: LifecycleEventType;
    readonly actorId: string;
    readonly occurredAt: string;
    readonly idempotencyKey: string;
    readonly holdId?: string | null;
    readonly reason: string;
    readonly deletionReceiptSha256?: string | null;
  }): Promise<LifecycleCommitReceipt> {
    assertScope(input.scope);
    assertIdentifier(input.recordId, "recordId");
    assertIdentifier(input.actorId, "actorId");
    assertIdentifier(input.idempotencyKey, "idempotencyKey");
    if (!input.reason.trim() || input.reason.length > 1_000) {
      throw new MediaIntelligencePolicyError("invalid_input", "Lifecycle reason is required");
    }
    const occurredAt = normalizeTimestamp(input.occurredAt, "occurredAt");
    const holdId = input.holdId?.trim() || null;
    if (holdId) assertIdentifier(holdId, "holdId");
    let deletionReceiptSha256 = input.deletionReceiptSha256?.trim() || null;
    if (deletionReceiptSha256) assertSha256(deletionReceiptSha256, "deletion receipt checksum");
    if (input.type === "deletion_attested") {
      if (!deletionReceiptSha256 || !this.deletionAuthority) {
        throw new MediaIntelligencePolicyError(
          "deletion_not_requested",
          "Deletion attestation requires a configured receipt authority",
        );
      }
      const record = this.store.getRecord(input.recordId);
      if (!record || scopeKey(record.scope) !== scopeKey(input.scope)) {
        throw new MediaIntelligencePolicyError("artifact_invalid", "Deletion record was not found in scope");
      }
      const verified = await this.deletionAuthority.verify({
        record,
        presentedReceiptSha256: deletionReceiptSha256,
      });
      if (!verified) {
        throw new MediaIntelligencePolicyError("deletion_not_requested", "Deletion receipt was not verified");
      }
      const deletedAt = normalizeTimestamp(verified.deletedAt, "deletion receipt deletedAt");
      assertIdentifier(verified.receiptId, "deletion receipt id");
      assertSha256(verified.payloadSha256, "deletion receipt payload checksum");
      assertSha256(verified.receiptSha256, "deletion receipt checksum");
      const expectedReceiptSha256 = sha256Canonical({
        receiptId: verified.receiptId,
        recordId: verified.recordId,
        payloadSha256: verified.payloadSha256,
        deletedAt,
      });
      if (
        verified.recordId !== record.recordId ||
        verified.payloadSha256 !== record.payloadSha256 ||
        verified.receiptSha256 !== deletionReceiptSha256 ||
        verified.receiptSha256 !== expectedReceiptSha256 ||
        Date.parse(deletedAt) > Date.parse(occurredAt)
      ) {
        throw new MediaIntelligencePolicyError(
          "deletion_not_requested",
          "Deletion receipt does not bind the exact artifact payload and transaction time",
        );
      }
      deletionReceiptSha256 = verified.receiptSha256;
    }
    const commandBasis = {
      scope: input.scope,
      recordId: input.recordId,
      type: input.type,
      actorId: input.actorId,
      occurredAt,
      holdId,
      reason: input.reason.trim(),
      deletionReceiptSha256,
    };
    return this.store.commitLifecycle(Object.freeze({
      ...commandBasis,
      idempotencyKeySha256: sha256Text(`${scopeKey(input.scope)}\u0000${input.idempotencyKey}`),
      commandSha256: sha256Canonical(commandBasis),
    }));
  }
}
