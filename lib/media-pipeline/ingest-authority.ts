import { createHash } from "node:crypto";

export const MEDIA_INGEST_SCHEMA_VERSION =
  "cco.media-ingest-authority.v1" as const;
export const MEDIA_INGEST_TENANT_KINDS = ["personal", "team"] as const;
export const MEDIA_INGEST_STATES = [
  "receiving",
  "verification_pending",
  "verifying",
  "scan_pending",
  "scanning",
  "quarantined",
  "transcode_pending",
  "transcoding",
  "ready",
  "failed",
  "cancelled",
] as const;
export const MEDIA_INGEST_SCAN_STATES = [
  "blocked",
  "pending",
  "scanning",
  "clean",
  "infected",
  "error",
] as const;
export const MEDIA_INGEST_TRANSCODE_STATES = [
  "blocked",
  "pending",
  "processing",
  "ready",
  "failed",
] as const;
export const MEDIA_INGEST_PUBLICATION_STATES = ["blocked", "eligible"] as const;
export const MEDIA_INGEST_WORK_STAGES = [
  "verify",
  "scan",
  "transcode",
] as const;
export const MEDIA_INGEST_WORKER_OUTCOMES = [
  "verified",
  "clean",
  "infected",
  "scan_error",
  "ready",
  "retry",
  "failed",
] as const;
export const MEDIA_INGEST_DEFAULT_MAX_STAGE_ATTEMPTS = 12;
export const MEDIA_INGEST_DEFAULT_MAX_WORK_ATTEMPTS =
  MEDIA_INGEST_DEFAULT_MAX_STAGE_ATTEMPTS;
export const MEDIA_INGEST_PUBLICATION_DEFAULT = "blocked" as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^(?:sha256:)?[0-9a-f]{64}$/i;
const IDEMPOTENCY_PATTERN = /^[a-z0-9][a-z0-9._:-]{15,199}$/;
const QUOTA_REFERENCE_PATTERN = /^[a-z0-9][a-z0-9._:/-]{15,199}$/;
const MIME_PATTERN = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/;
const SAFE_CODE_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,119}$/;
const MAX_SOURCE_BYTES = Number.MAX_SAFE_INTEGER;

export type MediaIngestTenantKind = (typeof MEDIA_INGEST_TENANT_KINDS)[number];
export type MediaIngestState = (typeof MEDIA_INGEST_STATES)[number];
export type MediaIngestScanState = (typeof MEDIA_INGEST_SCAN_STATES)[number];
export type MediaIngestTranscodeState =
  (typeof MEDIA_INGEST_TRANSCODE_STATES)[number];
export type MediaIngestPublicationState =
  (typeof MEDIA_INGEST_PUBLICATION_STATES)[number];
export type MediaIngestWorkStage = (typeof MEDIA_INGEST_WORK_STAGES)[number];
export type MediaIngestWorkerOutcome =
  (typeof MEDIA_INGEST_WORKER_OUTCOMES)[number];

export class MediaIngestAuthorityError extends Error {
  readonly code:
    | "invalid_input"
    | "invalid_transition"
    | "stale_fence"
    | "lease_expired"
    | "publication_blocked"
    | "rpc_failed"
    | "invalid_response";

  constructor(code: MediaIngestAuthorityError["code"], message: string) {
    super(message);
    this.name = "MediaIngestAuthorityError";
    this.code = code;
  }
}

export interface MediaIngestIntentDraft {
  readonly tenantKey: string;
  readonly projectId: string;
  readonly folderId?: string | null;
  readonly idempotencyKey: string;
  readonly filename: string;
  readonly size: number;
  readonly mimeType: string;
  readonly expectedSha256: string;
  readonly quotaReservationRef: string;
  readonly maxWorkAttempts?: number;
}

export interface MediaIngestIntentEnvelope {
  readonly schemaVersion: typeof MEDIA_INGEST_SCHEMA_VERSION;
  readonly tenantKind: MediaIngestTenantKind;
  readonly tenantId: string;
  readonly tenantKey: string;
  readonly projectId: string;
  readonly folderId: string | null;
  readonly idempotencyKey: string;
  readonly filename: string;
  readonly size: number;
  readonly mimeType: string;
  readonly expectedSha256: string;
  readonly quotaReservationRef: string;
  readonly maxWorkAttempts: number;
  readonly intentFingerprint: string;
}

export interface MediaIngestRecord extends MediaIngestIntentEnvelope {
  readonly id: string;
  readonly createdBy: string;
  readonly quotaReservedBytes: number;
  readonly quotaConsumedAt: string;
  readonly state: MediaIngestState;
  readonly uploadOffset: number;
  readonly uploadCompletedAt: string | null;
  readonly sourceObservedSize: number | null;
  readonly sourceObservedSha256: string | null;
  readonly sourceVerifiedAt: string | null;
  readonly scanState: MediaIngestScanState;
  readonly scanEngine: string | null;
  readonly scanReceiptHash: string | null;
  readonly scanSubjectSha256: string | null;
  readonly scannedAt: string | null;
  readonly transcodeState: MediaIngestTranscodeState;
  readonly transcodeReceiptHash: string | null;
  readonly transcodeReadyAt: string | null;
  readonly publicationState: MediaIngestPublicationState;
  readonly publicationEnabled: boolean;
  readonly workStage: MediaIngestWorkStage | null;
  readonly workAttemptCount: number;
  readonly verifyAttemptCount: number;
  readonly scanAttemptCount: number;
  readonly transcodeAttemptCount: number;
  readonly availableAt: string;
  readonly leaseWorkerId: string | null;
  readonly leaseOwner: string | null;
  readonly leasedAt: string | null;
  readonly leaseExpiresAt: string | null;
  readonly leaseFence: number;
  readonly failureCode: string | null;
  readonly failedAt: string | null;
  readonly cancelledAt: string | null;
  readonly cancelledBy: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly replayed: boolean;
}

export interface MediaIngestRpcError {
  readonly message: string;
  readonly code?: string;
}

export interface MediaIngestRpcClient {
  rpc(
    functionName: string,
    parameters: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: MediaIngestRpcError | null }>;
}

function invalid(message: string): never {
  throw new MediaIngestAuthorityError("invalid_input", message);
}

function normalizeUuid(value: string, field: string): string {
  const normalized = value.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) invalid(`${field} must be a UUID`);
  return normalized;
}

function normalizeSha256(value: string, field: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/^sha256:/, "");
  if (!SHA256_PATTERN.test(normalized)) {
    invalid(`${field} must be a SHA-256 digest`);
  }
  return normalized;
}

function normalizeTimestamp(value: string, field: string): string {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds))
    invalid(`${field} must be an ISO timestamp`);
  return new Date(milliseconds).toISOString();
}

function normalizeSafeText(
  value: string,
  field: string,
  maxLength: number,
): string {
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > maxLength ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    invalid(`${field} is invalid`);
  }
  return normalized;
}

function normalizeSafeInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_SOURCE_BYTES) {
    invalid(`${field} must be a non-negative safe integer`);
  }
  return value;
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

export function parseMediaIngestTenantKey(value: string): {
  tenantKind: MediaIngestTenantKind;
  tenantId: string;
  tenantKey: string;
} {
  const normalized = value.trim().toLowerCase();
  const separator = normalized.indexOf(":");
  const tenantKind = normalized.slice(0, separator) as MediaIngestTenantKind;
  if (separator < 1 || !MEDIA_INGEST_TENANT_KINDS.includes(tenantKind)) {
    invalid("tenantKey must use personal:<uuid> or team:<uuid>");
  }
  const tenantId = normalizeUuid(normalized.slice(separator + 1), "tenantKey");
  return {
    tenantKind,
    tenantId,
    tenantKey: `${tenantKind}:${tenantId}`,
  };
}

export function mediaIngestIntentFingerprint(
  input: Omit<MediaIngestIntentEnvelope, "intentFingerprint">,
): string {
  return sha256(
    [
      input.schemaVersion,
      input.tenantKind,
      input.tenantId,
      input.projectId,
      input.folderId ?? "",
      input.filename,
      String(input.size),
      input.mimeType,
      input.expectedSha256,
      input.quotaReservationRef,
      String(input.maxWorkAttempts),
    ].join("\u001f"),
  );
}

export function createMediaIngestIntent(
  draft: MediaIngestIntentDraft,
): MediaIngestIntentEnvelope {
  const tenant = parseMediaIngestTenantKey(draft.tenantKey);
  const projectId = normalizeUuid(draft.projectId, "projectId");
  const folderId = draft.folderId
    ? normalizeUuid(draft.folderId, "folderId")
    : null;
  const idempotencyKey = draft.idempotencyKey.trim().toLowerCase();
  if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
    invalid("idempotencyKey must be 16-200 lowercase safe characters");
  }
  const filename = normalizeSafeText(draft.filename, "filename", 512);
  if (/[\\/]/.test(filename)) invalid("filename must not contain a path");
  const size = normalizeSafeInteger(draft.size, "size");
  if (size < 1) invalid("size must be positive");
  const mimeType = draft.mimeType.trim().toLowerCase();
  if (mimeType.length > 255 || !MIME_PATTERN.test(mimeType)) {
    invalid("mimeType is invalid");
  }
  const quotaReservationRef = draft.quotaReservationRef.trim().toLowerCase();
  if (!QUOTA_REFERENCE_PATTERN.test(quotaReservationRef)) {
    invalid("quotaReservationRef is invalid");
  }
  const maxWorkAttempts =
    draft.maxWorkAttempts ?? MEDIA_INGEST_DEFAULT_MAX_WORK_ATTEMPTS;
  if (
    !Number.isInteger(maxWorkAttempts) ||
    maxWorkAttempts < 3 ||
    maxWorkAttempts > 24
  ) {
    invalid("maxWorkAttempts must be between 3 and 24");
  }
  const envelope = {
    schemaVersion: MEDIA_INGEST_SCHEMA_VERSION,
    tenantKind: tenant.tenantKind,
    tenantId: tenant.tenantId,
    tenantKey: tenant.tenantKey,
    projectId,
    folderId,
    idempotencyKey,
    filename,
    size,
    mimeType,
    expectedSha256: normalizeSha256(draft.expectedSha256, "expectedSha256"),
    quotaReservationRef,
    maxWorkAttempts,
  };
  return {
    ...envelope,
    intentFingerprint: mediaIngestIntentFingerprint(envelope),
  };
}

const ALLOWED_TRANSITIONS: Record<
  MediaIngestState,
  readonly MediaIngestState[]
> = {
  receiving: ["receiving", "verification_pending", "cancelled"],
  verification_pending: ["verifying", "cancelled"],
  verifying: ["verifying", "verification_pending", "scan_pending", "failed"],
  scan_pending: ["scanning", "cancelled"],
  scanning: [
    "scanning",
    "scan_pending",
    "quarantined",
    "transcode_pending",
    "failed",
  ],
  quarantined: ["scan_pending", "cancelled"],
  transcode_pending: ["transcoding", "cancelled"],
  transcoding: ["transcoding", "transcode_pending", "ready", "failed"],
  ready: [],
  failed: [],
  cancelled: [],
};

export function assertMediaIngestTransition(
  from: MediaIngestState,
  to: MediaIngestState,
): void {
  if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
    throw new MediaIngestAuthorityError(
      "invalid_transition",
      `Media ingest cannot transition from ${from} to ${to}`,
    );
  }
}

export function mediaIngestCanPublish(record: MediaIngestRecord): boolean {
  try {
    assertMediaIngestRecordInvariants(record);
    return (
      record.publicationEnabled === true &&
      record.state === "ready" &&
      record.publicationState === "eligible" &&
      record.uploadOffset === record.size &&
      record.uploadCompletedAt !== null &&
      record.sourceVerifiedAt !== null &&
      record.sourceObservedSize === record.size &&
      record.sourceObservedSha256 === record.expectedSha256 &&
      record.scanState === "clean" &&
      record.scanEngine !== null &&
      record.scanSubjectSha256 === record.expectedSha256 &&
      record.scanReceiptHash !== null &&
      record.scannedAt !== null &&
      record.transcodeState === "ready" &&
      record.transcodeReceiptHash !== null &&
      record.transcodeReadyAt !== null
    );
  } catch {
    return false;
  }
}

export function assertMediaIngestPublication(record: MediaIngestRecord): void {
  if (!mediaIngestCanPublish(record)) {
    throw new MediaIngestAuthorityError(
      "publication_blocked",
      "Media publication remains blocked until source, scan, and transcode evidence is verified",
    );
  }
}

export function assertMediaIngestLease(input: {
  readonly record: MediaIngestRecord;
  readonly workerId: string;
  readonly leaseFence: number;
  readonly stage: MediaIngestWorkStage;
  readonly now: string;
}): void {
  const activeState: Record<MediaIngestWorkStage, MediaIngestState> = {
    verify: "verifying",
    scan: "scanning",
    transcode: "transcoding",
  };
  const workerId = normalizeUuid(input.workerId, "workerId");
  if (
    input.record.state !== activeState[input.stage] ||
    input.record.workStage !== input.stage ||
    input.record.leaseWorkerId !== workerId ||
    input.record.leaseOwner !== `worker:${workerId}` ||
    input.record.leaseFence !== input.leaseFence
  ) {
    throw new MediaIngestAuthorityError(
      "stale_fence",
      "Media ingest worker lease fencing token is stale",
    );
  }
  const now = normalizeTimestamp(input.now, "now");
  const expiresAt = input.record.leaseExpiresAt
    ? normalizeTimestamp(input.record.leaseExpiresAt, "leaseExpiresAt")
    : null;
  if (!expiresAt || Date.parse(expiresAt) <= Date.parse(now)) {
    throw new MediaIngestAuthorityError(
      "lease_expired",
      "Media ingest worker lease has expired",
    );
  }
}

function invalidResponse(message: string): never {
  throw new MediaIngestAuthorityError("invalid_response", message);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalidResponse("Media ingest RPC returned an invalid record");
  }
  return value as Record<string, unknown>;
}

function hasField(row: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(row, key);
}

function requiredString(row: Record<string, unknown>, key: string): string {
  if (!hasField(row, key) || typeof row[key] !== "string" || row[key] === "") {
    invalidResponse(`Media ingest RPC returned invalid ${key}`);
  }
  return row[key] as string;
}

function nullableString(
  row: Record<string, unknown>,
  key: string,
): string | null {
  if (!hasField(row, key)) {
    invalidResponse(`Media ingest RPC omitted ${key}`);
  }
  if (row[key] === null) return null;
  return requiredString(row, key);
}

function requiredBoolean(row: Record<string, unknown>, key: string): boolean {
  if (!hasField(row, key) || typeof row[key] !== "boolean") {
    invalidResponse(`Media ingest RPC returned invalid ${key}`);
  }
  return row[key] as boolean;
}

function requiredSafeInteger(
  row: Record<string, unknown>,
  key: string,
): number {
  const raw = row[key];
  const parsed =
    typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : raw;
  if (
    !hasField(row, key) ||
    typeof parsed !== "number" ||
    !Number.isSafeInteger(parsed) ||
    parsed < 0 ||
    parsed > MAX_SOURCE_BYTES
  ) {
    invalidResponse(`Media ingest RPC returned invalid ${key}`);
  }
  return parsed;
}

function nullableSafeInteger(
  row: Record<string, unknown>,
  key: string,
): number | null {
  if (!hasField(row, key)) {
    invalidResponse(`Media ingest RPC omitted ${key}`);
  }
  if (row[key] === null) return null;
  return requiredSafeInteger(row, key);
}

function responseUuid(value: string, field: string): string {
  const normalized = value.toLowerCase();
  if (value !== normalized || !UUID_PATTERN.test(value)) {
    invalidResponse(`Media ingest RPC returned invalid ${field}`);
  }
  return normalized;
}

function responseSha256(
  value: string,
  field: string,
  prefixed = false,
): string {
  const pattern = prefixed
    ? /^sha256:[0-9a-f]{64}$/
    : /^[0-9a-f]{64}$/;
  if (!pattern.test(value)) {
    invalidResponse(`Media ingest RPC returned invalid ${field}`);
  }
  return value;
}

function nullableResponseSha256(
  row: Record<string, unknown>,
  key: string,
): string | null {
  const value = nullableString(row, key);
  return value === null ? null : responseSha256(value, key);
}

function responseTimestamp(value: string, field: string): string {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    invalidResponse(`Media ingest RPC returned invalid ${field}`);
  }
  return new Date(milliseconds).toISOString();
}

function nullableResponseTimestamp(
  row: Record<string, unknown>,
  key: string,
): string | null {
  const value = nullableString(row, key);
  return value === null ? null : responseTimestamp(value, key);
}

function assertRecordInvariant(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) invalidResponse(`Media ingest RPC invariant failed: ${message}`);
}

function assertTimestampOrder(
  earlier: string | null,
  later: string | null,
  label: string,
): void {
  if (
    earlier !== null &&
    later !== null &&
    Date.parse(earlier) > Date.parse(later)
  ) {
    invalidResponse(`Media ingest RPC invariant failed: ${label}`);
  }
}

function assertMediaIngestRecordInvariants(record: MediaIngestRecord): void {
  assertRecordInvariant(record.size > 0, "source size must be positive");
  assertRecordInvariant(
    record.quotaReservedBytes >= record.size,
    "quota reservation must cover source size",
  );
  assertRecordInvariant(
    record.maxWorkAttempts >= 3 && record.maxWorkAttempts <= 24,
    "per-stage attempt bound is invalid",
  );
  assertRecordInvariant(
    record.verifyAttemptCount <= record.maxWorkAttempts &&
      record.scanAttemptCount <= record.maxWorkAttempts &&
      record.transcodeAttemptCount <= record.maxWorkAttempts,
    "a stage exceeded its attempt bound",
  );
  assertRecordInvariant(
    record.workAttemptCount ===
      record.verifyAttemptCount +
        record.scanAttemptCount +
        record.transcodeAttemptCount,
    "aggregate attempt count is inconsistent",
  );
  assertRecordInvariant(
    record.leaseFence === record.workAttemptCount,
    "lease fence is not monotonic with claims",
  );
  assertRecordInvariant(
    record.intentFingerprint ===
      mediaIngestIntentFingerprint({
        schemaVersion: record.schemaVersion,
        tenantKind: record.tenantKind,
        tenantId: record.tenantId,
        tenantKey: record.tenantKey,
        projectId: record.projectId,
        folderId: record.folderId,
        idempotencyKey: record.idempotencyKey,
        filename: record.filename,
        size: record.size,
        mimeType: record.mimeType,
        expectedSha256: record.expectedSha256,
        quotaReservationRef: record.quotaReservationRef,
        maxWorkAttempts: record.maxWorkAttempts,
      }),
    "intent fingerprint does not match the record",
  );

  const uploadComplete = record.uploadOffset === record.size;
  assertRecordInvariant(
    uploadComplete === (record.uploadCompletedAt !== null),
    "upload completion evidence is inconsistent",
  );
  assertRecordInvariant(
    record.uploadOffset <= record.size,
    "upload offset exceeds source size",
  );

  const hasObservedSize = record.sourceObservedSize !== null;
  const hasObservedHash = record.sourceObservedSha256 !== null;
  assertRecordInvariant(
    hasObservedSize === hasObservedHash,
    "source evidence must be complete",
  );
  if (record.sourceVerifiedAt !== null) {
    assertRecordInvariant(
      uploadComplete &&
        record.sourceObservedSize === record.size &&
        record.sourceObservedSha256 === record.expectedSha256,
      "verified source evidence does not match intent",
    );
  } else if (hasObservedSize) {
    assertRecordInvariant(
      record.state === "failed" &&
        (record.sourceObservedSize !== record.size ||
          record.sourceObservedSha256 !== record.expectedSha256),
      "unverified observed source evidence must be terminal",
    );
  }

  const scanHasEvidence =
    record.scanEngine !== null &&
    record.scanReceiptHash !== null &&
    record.scanSubjectSha256 !== null &&
    record.scannedAt !== null;
  const scanHasNoEvidence =
    record.scanEngine === null &&
    record.scanReceiptHash === null &&
    record.scanSubjectSha256 === null &&
    record.scannedAt === null;
  if (["clean", "infected", "error"].includes(record.scanState)) {
    assertRecordInvariant(
      scanHasEvidence && record.sourceVerifiedAt !== null,
      "terminal scan evidence is incomplete",
    );
  } else {
    assertRecordInvariant(
      scanHasNoEvidence,
      "non-terminal scan state contains evidence",
    );
  }
  if (record.scanState === "clean") {
    assertRecordInvariant(
      record.scanSubjectSha256 === record.expectedSha256,
      "clean scan subject does not match source",
    );
  }

  if (record.transcodeState === "ready") {
    assertRecordInvariant(
      record.transcodeReceiptHash !== null &&
        record.transcodeReadyAt !== null &&
        record.scanState === "clean" &&
        record.sourceVerifiedAt !== null,
      "ready transcode evidence is incomplete",
    );
  } else {
    assertRecordInvariant(
      record.transcodeReceiptHash === null &&
        record.transcodeReadyAt === null,
      "non-ready transcode state contains ready evidence",
    );
  }

  const activeStageByState: Partial<
    Record<MediaIngestState, MediaIngestWorkStage>
  > = {
    verifying: "verify",
    scanning: "scan",
    transcoding: "transcode",
  };
  const activeStage = activeStageByState[record.state] ?? null;
  if (activeStage !== null) {
    assertRecordInvariant(
      record.workStage === activeStage &&
        record.leaseWorkerId !== null &&
        record.leaseOwner === `worker:${record.leaseWorkerId}` &&
        record.leasedAt !== null &&
        record.leaseExpiresAt !== null &&
        Date.parse(record.leaseExpiresAt) > Date.parse(record.leasedAt),
      "active worker lease is incomplete",
    );
    const stageAttempts = {
      verify: record.verifyAttemptCount,
      scan: record.scanAttemptCount,
      transcode: record.transcodeAttemptCount,
    }[activeStage];
    assertRecordInvariant(
      stageAttempts > 0,
      "active stage has no recorded attempt",
    );
  } else {
    assertRecordInvariant(
      record.workStage === null &&
        record.leaseWorkerId === null &&
        record.leaseOwner === null &&
        record.leasedAt === null &&
        record.leaseExpiresAt === null,
      "inactive state retains worker lease facts",
    );
  }

  switch (record.state) {
    case "receiving":
      assertRecordInvariant(
        !uploadComplete &&
          !hasObservedSize &&
          record.scanState === "blocked" &&
          record.transcodeState === "blocked",
        "receiving state contains downstream evidence",
      );
      break;
    case "verification_pending":
    case "verifying":
      assertRecordInvariant(
        uploadComplete &&
          !hasObservedSize &&
          record.scanState === "blocked" &&
          record.transcodeState === "blocked",
        "verification state is inconsistent",
      );
      break;
    case "scan_pending":
      assertRecordInvariant(
        record.sourceVerifiedAt !== null &&
          record.scanState === "pending" &&
          record.transcodeState === "blocked",
        "scan-pending state is inconsistent",
      );
      break;
    case "scanning":
      assertRecordInvariant(
        record.sourceVerifiedAt !== null &&
          record.scanState === "scanning" &&
          record.transcodeState === "blocked",
        "scanning state is inconsistent",
      );
      break;
    case "quarantined":
      assertRecordInvariant(
        record.sourceVerifiedAt !== null &&
          ["infected", "error"].includes(record.scanState) &&
          record.scanSubjectSha256 === record.expectedSha256 &&
          record.transcodeState === "blocked",
        "quarantine state is inconsistent",
      );
      break;
    case "transcode_pending":
      assertRecordInvariant(
        record.scanState === "clean" &&
          record.transcodeState === "pending",
        "transcode-pending state is inconsistent",
      );
      break;
    case "transcoding":
      assertRecordInvariant(
        record.scanState === "clean" &&
          record.transcodeState === "processing",
        "transcoding state is inconsistent",
      );
      break;
    case "ready":
      assertRecordInvariant(
        record.publicationState === "eligible" &&
          record.transcodeState === "ready",
        "ready state is not publication-eligible",
      );
      break;
    case "failed":
    case "cancelled":
      break;
  }

  if (record.state !== "ready") {
    assertRecordInvariant(
      record.publicationState === "blocked" &&
        record.publicationEnabled === false,
      "non-ready state exposes publication authority",
    );
  }
  if (record.publicationEnabled) {
    assertRecordInvariant(
      record.state === "ready" &&
        record.publicationState === "eligible" &&
        record.transcodeReceiptHash !== null,
      "publication authority lacks exact ready output",
    );
  }

  if (record.state === "failed") {
    assertRecordInvariant(
      record.failureCode !== null &&
        record.failedAt !== null &&
        record.cancelledAt === null &&
        record.cancelledBy === null,
      "failed terminal evidence is incomplete",
    );
  } else if (record.state === "cancelled") {
    assertRecordInvariant(
      record.failureCode === null &&
        record.failedAt === null &&
        record.cancelledAt !== null &&
        record.cancelledBy !== null,
      "cancelled terminal evidence is incomplete",
    );
  } else {
    assertRecordInvariant(
      record.failureCode === null &&
        record.failedAt === null &&
        record.cancelledAt === null &&
        record.cancelledBy === null,
      "non-terminal state contains terminal evidence",
    );
  }

  assertTimestampOrder(record.createdAt, record.updatedAt, "updated before created");
  assertTimestampOrder(
    record.createdAt,
    record.uploadCompletedAt,
    "upload completed before session creation",
  );
  assertTimestampOrder(
    record.uploadCompletedAt,
    record.sourceVerifiedAt,
    "source verified before upload completion",
  );
  assertTimestampOrder(
    record.sourceVerifiedAt,
    record.scannedAt,
    "scan completed before source verification",
  );
  assertTimestampOrder(
    record.scannedAt,
    record.transcodeReadyAt,
    "transcode completed before scan",
  );
  assertTimestampOrder(
    record.createdAt,
    record.failedAt,
    "failure predates session",
  );
  assertTimestampOrder(
    record.createdAt,
    record.cancelledAt,
    "cancellation predates session",
  );
}

export function parseMediaIngestRecord(value: unknown): MediaIngestRecord {
  const row = asRecord(value);
  const schemaVersion = requiredString(row, "schema_version");
  if (schemaVersion !== MEDIA_INGEST_SCHEMA_VERSION) {
    invalidResponse("Media ingest RPC returned an unsupported schema version");
  }

  const tenantKind = requiredString(
    row,
    "tenant_kind",
  ) as MediaIngestTenantKind;
  const state = requiredString(row, "state") as MediaIngestState;
  const scanState = requiredString(row, "scan_state") as MediaIngestScanState;
  const transcodeState = requiredString(
    row,
    "transcode_state",
  ) as MediaIngestTranscodeState;
  const publicationState = requiredString(
    row,
    "publication_state",
  ) as MediaIngestPublicationState;
  const workStage = nullableString(
    row,
    "work_stage",
  ) as MediaIngestWorkStage | null;
  if (!MEDIA_INGEST_TENANT_KINDS.includes(tenantKind)) {
    invalidResponse("Media ingest RPC returned invalid tenant_kind");
  }
  if (!MEDIA_INGEST_STATES.includes(state)) {
    invalidResponse("Media ingest RPC returned invalid state");
  }
  if (!MEDIA_INGEST_SCAN_STATES.includes(scanState)) {
    invalidResponse("Media ingest RPC returned invalid scan_state");
  }
  if (!MEDIA_INGEST_TRANSCODE_STATES.includes(transcodeState)) {
    invalidResponse("Media ingest RPC returned invalid transcode_state");
  }
  if (!MEDIA_INGEST_PUBLICATION_STATES.includes(publicationState)) {
    invalidResponse("Media ingest RPC returned invalid publication_state");
  }
  if (workStage !== null && !MEDIA_INGEST_WORK_STAGES.includes(workStage)) {
    invalidResponse("Media ingest RPC returned invalid work_stage");
  }

  const tenantId = responseUuid(requiredString(row, "tenant_id"), "tenant_id");
  const folderIdValue = nullableString(row, "folder_id");
  const leaseWorkerIdValue = nullableString(row, "lease_worker_id");
  const cancelledByValue = nullableString(row, "cancelled_by");
  const idempotencyKey = requiredString(row, "idempotency_key");
  const quotaReservationRef = requiredString(row, "quota_reservation_ref");
  const filename = requiredString(row, "source_filename");
  const mimeType = requiredString(row, "source_mime_type");
  const scanEngine = nullableString(row, "scan_engine");
  const leaseOwner = nullableString(row, "lease_owner");
  const failureCode = nullableString(row, "failure_code");
  if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
    invalidResponse("Media ingest RPC returned invalid idempotency_key");
  }
  if (!QUOTA_REFERENCE_PATTERN.test(quotaReservationRef)) {
    invalidResponse("Media ingest RPC returned invalid quota_reservation_ref");
  }
  if (
    filename !== filename.trim() ||
    filename.length > 512 ||
    /[\\/\u0000-\u001f\u007f]/.test(filename)
  ) {
    invalidResponse("Media ingest RPC returned invalid source_filename");
  }
  if (mimeType.length > 255 || !MIME_PATTERN.test(mimeType)) {
    invalidResponse("Media ingest RPC returned invalid source_mime_type");
  }
  if (
    scanEngine !== null &&
    (scanEngine !== scanEngine.trim() ||
      scanEngine.length > 160 ||
      /[\u0000-\u001f\u007f]/.test(scanEngine))
  ) {
    invalidResponse("Media ingest RPC returned invalid scan_engine");
  }
  if (failureCode !== null && !SAFE_CODE_PATTERN.test(failureCode)) {
    invalidResponse("Media ingest RPC returned invalid failure_code");
  }

  const record: MediaIngestRecord = {
    schemaVersion,
    id: responseUuid(requiredString(row, "session_id"), "session_id"),
    createdBy: responseUuid(requiredString(row, "created_by"), "created_by"),
    tenantKind,
    tenantId,
    tenantKey: `${tenantKind}:${tenantId}`,
    projectId: responseUuid(requiredString(row, "project_id"), "project_id"),
    folderId:
      folderIdValue === null ? null : responseUuid(folderIdValue, "folder_id"),
    idempotencyKey,
    intentFingerprint: responseSha256(
      requiredString(row, "intent_fingerprint"),
      "intent_fingerprint",
      true,
    ),
    filename,
    size: requiredSafeInteger(row, "source_size"),
    mimeType,
    expectedSha256: responseSha256(
      requiredString(row, "source_expected_sha256"),
      "source_expected_sha256",
    ),
    quotaReservationRef,
    quotaReservedBytes: requiredSafeInteger(row, "quota_reserved_bytes"),
    quotaConsumedAt: responseTimestamp(
      requiredString(row, "quota_consumed_at"),
      "quota_consumed_at",
    ),
    maxWorkAttempts: requiredSafeInteger(row, "max_work_attempts"),
    state,
    uploadOffset: requiredSafeInteger(row, "upload_offset"),
    uploadCompletedAt: nullableResponseTimestamp(row, "upload_completed_at"),
    sourceObservedSize: nullableSafeInteger(row, "source_observed_size"),
    sourceObservedSha256: nullableResponseSha256(
      row,
      "source_observed_sha256",
    ),
    sourceVerifiedAt: nullableResponseTimestamp(row, "source_verified_at"),
    scanState,
    scanEngine,
    scanReceiptHash: nullableResponseSha256(row, "scan_receipt_hash"),
    scanSubjectSha256: nullableResponseSha256(row, "scan_subject_sha256"),
    scannedAt: nullableResponseTimestamp(row, "scanned_at"),
    transcodeState,
    transcodeReceiptHash: nullableResponseSha256(
      row,
      "transcode_receipt_hash",
    ),
    transcodeReadyAt: nullableResponseTimestamp(row, "transcode_ready_at"),
    publicationState,
    publicationEnabled: requiredBoolean(row, "publication_enabled"),
    workStage,
    workAttemptCount: requiredSafeInteger(row, "work_attempt_count"),
    verifyAttemptCount: requiredSafeInteger(row, "verify_attempt_count"),
    scanAttemptCount: requiredSafeInteger(row, "scan_attempt_count"),
    transcodeAttemptCount: requiredSafeInteger(
      row,
      "transcode_attempt_count",
    ),
    availableAt: responseTimestamp(
      requiredString(row, "available_at"),
      "available_at",
    ),
    leaseWorkerId:
      leaseWorkerIdValue === null
        ? null
        : responseUuid(leaseWorkerIdValue, "lease_worker_id"),
    leaseOwner,
    leasedAt: nullableResponseTimestamp(row, "leased_at"),
    leaseExpiresAt: nullableResponseTimestamp(row, "lease_expires_at"),
    leaseFence: requiredSafeInteger(row, "lease_fence"),
    failureCode,
    failedAt: nullableResponseTimestamp(row, "failed_at"),
    cancelledAt: nullableResponseTimestamp(row, "cancelled_at"),
    cancelledBy:
      cancelledByValue === null
        ? null
        : responseUuid(cancelledByValue, "cancelled_by"),
    createdAt: responseTimestamp(
      requiredString(row, "created_at"),
      "created_at",
    ),
    updatedAt: responseTimestamp(
      requiredString(row, "updated_at"),
      "updated_at",
    ),
    replayed: requiredBoolean(row, "replayed"),
  };
  assertMediaIngestRecordInvariants(record);
  return record;
}

function assertRecordAuthority(
  record: MediaIngestRecord,
  expected: {
    tenantKey: string;
    sessionId?: string;
    intentFingerprint?: string;
  },
): MediaIngestRecord {
  if (
    record.tenantKey !== expected.tenantKey ||
    (expected.sessionId !== undefined && record.id !== expected.sessionId) ||
    (expected.intentFingerprint !== undefined &&
      record.intentFingerprint !== expected.intentFingerprint)
  ) {
    throw new MediaIngestAuthorityError(
      "invalid_response",
      "Media ingest RPC returned a record outside the requested authority",
    );
  }
  return record;
}

async function callRpc(
  client: MediaIngestRpcClient,
  functionName: string,
  parameters: Record<string, unknown>,
): Promise<unknown> {
  const result = await client.rpc(functionName, parameters);
  if (result.error) {
    throw new MediaIngestAuthorityError(
      "rpc_failed",
      `${functionName} failed: ${result.error.code ?? "database_error"}`,
    );
  }
  return result.data;
}

export async function createMediaIngestSession(
  client: MediaIngestRpcClient,
  draft: MediaIngestIntentDraft,
): Promise<MediaIngestRecord> {
  const intent = createMediaIngestIntent(draft);
  const data = await callRpc(client, "create_media_ingest_session", {
    p_tenant_kind: intent.tenantKind,
    p_tenant_id: intent.tenantId,
    p_project_id: intent.projectId,
    p_idempotency_key: intent.idempotencyKey,
    p_source_filename: intent.filename,
    p_source_size: intent.size,
    p_source_mime_type: intent.mimeType,
    p_source_expected_sha256: intent.expectedSha256,
    p_quota_reservation_ref: intent.quotaReservationRef,
    p_max_work_attempts: intent.maxWorkAttempts,
    p_folder_id: intent.folderId,
  });
  return assertRecordAuthority(parseMediaIngestRecord(data), {
    tenantKey: intent.tenantKey,
    intentFingerprint: intent.intentFingerprint,
  });
}

export async function recordMediaIngestProgress(
  client: MediaIngestRpcClient,
  input: {
    readonly tenantKey: string;
    readonly sessionId: string;
    readonly requestId: string;
    readonly expectedOffset: number;
    readonly nextOffset: number;
    readonly chunkSha256: string;
  },
): Promise<MediaIngestRecord> {
  const tenant = parseMediaIngestTenantKey(input.tenantKey);
  const sessionId = normalizeUuid(input.sessionId, "sessionId");
  const expectedOffset = normalizeSafeInteger(
    input.expectedOffset,
    "expectedOffset",
  );
  const nextOffset = normalizeSafeInteger(input.nextOffset, "nextOffset");
  if (nextOffset <= expectedOffset)
    invalid("nextOffset must advance the upload");
  const data = await callRpc(client, "record_media_ingest_progress", {
    p_tenant_kind: tenant.tenantKind,
    p_tenant_id: tenant.tenantId,
    p_session_id: sessionId,
    p_request_id: normalizeUuid(input.requestId, "requestId"),
    p_expected_offset: expectedOffset,
    p_next_offset: nextOffset,
    p_chunk_sha256: normalizeSha256(input.chunkSha256, "chunkSha256"),
  });
  return assertRecordAuthority(parseMediaIngestRecord(data), {
    tenantKey: tenant.tenantKey,
    sessionId,
  });
}

export async function cancelMediaIngestSession(
  client: MediaIngestRpcClient,
  input: {
    readonly tenantKey: string;
    readonly sessionId: string;
    readonly requestId: string;
  },
): Promise<MediaIngestRecord> {
  const tenant = parseMediaIngestTenantKey(input.tenantKey);
  const sessionId = normalizeUuid(input.sessionId, "sessionId");
  const data = await callRpc(client, "cancel_media_ingest_session", {
    p_tenant_kind: tenant.tenantKind,
    p_tenant_id: tenant.tenantId,
    p_session_id: sessionId,
    p_request_id: normalizeUuid(input.requestId, "requestId"),
  });
  return assertRecordAuthority(parseMediaIngestRecord(data), {
    tenantKey: tenant.tenantKey,
    sessionId,
  });
}

export async function claimMediaIngestWork(
  client: MediaIngestRpcClient,
  input: {
    readonly tenantKey: string;
    readonly stage: MediaIngestWorkStage;
    readonly limit?: number;
    readonly leaseSeconds?: number;
  },
): Promise<MediaIngestRecord[]> {
  const tenant = parseMediaIngestTenantKey(input.tenantKey);
  if (!MEDIA_INGEST_WORK_STAGES.includes(input.stage)) invalid("stage is invalid");
  const limit = input.limit ?? 10;
  const leaseSeconds = input.leaseSeconds ?? 90;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    invalid("limit must be between 1 and 100");
  }
  if (
    !Number.isInteger(leaseSeconds) ||
    leaseSeconds < 15 ||
    leaseSeconds > 900
  ) {
    invalid("leaseSeconds must be between 15 and 900");
  }
  const data = await callRpc(client, "claim_media_ingest_work", {
    p_tenant_kind: tenant.tenantKind,
    p_tenant_id: tenant.tenantId,
    p_stage: input.stage,
    p_limit: limit,
    p_lease_seconds: leaseSeconds,
  });
  if (!Array.isArray(data)) {
    throw new MediaIngestAuthorityError(
      "invalid_response",
      "claim_media_ingest_work did not return a record list",
    );
  }
  return data.map((value) =>
    assertRecordAuthority(parseMediaIngestRecord(value), {
      tenantKey: tenant.tenantKey,
    }),
  );
}

export async function renewMediaIngestLease(
  client: MediaIngestRpcClient,
  input: {
    readonly tenantKey: string;
    readonly sessionId: string;
    readonly leaseFence: number;
    readonly leaseSeconds?: number;
  },
): Promise<MediaIngestRecord> {
  const tenant = parseMediaIngestTenantKey(input.tenantKey);
  const sessionId = normalizeUuid(input.sessionId, "sessionId");
  const leaseSeconds = input.leaseSeconds ?? 90;
  if (!Number.isInteger(input.leaseFence) || input.leaseFence < 1) {
    invalid("leaseFence must be positive");
  }
  if (
    !Number.isInteger(leaseSeconds) ||
    leaseSeconds < 15 ||
    leaseSeconds > 900
  ) {
    invalid("leaseSeconds must be between 15 and 900");
  }
  const data = await callRpc(client, "renew_media_ingest_lease", {
    p_tenant_kind: tenant.tenantKind,
    p_tenant_id: tenant.tenantId,
    p_session_id: sessionId,
    p_lease_fence: input.leaseFence,
    p_lease_seconds: leaseSeconds,
  });
  return assertRecordAuthority(parseMediaIngestRecord(data), {
    tenantKey: tenant.tenantKey,
    sessionId,
  });
}

export async function settleMediaIngestWork(
  client: MediaIngestRpcClient,
  input: {
    readonly tenantKey: string;
    readonly sessionId: string;
    readonly requestId: string;
    readonly leaseFence: number;
    readonly stage: MediaIngestWorkStage;
    readonly outcome: MediaIngestWorkerOutcome;
    readonly observedSize?: number | null;
    readonly observedSha256?: string | null;
    readonly scanEngine?: string | null;
    readonly scanReceiptHash?: string | null;
    readonly scanSubjectSha256?: string | null;
    readonly transcodeReceiptHash?: string | null;
    readonly errorCode?: string | null;
    readonly retryAt?: string | null;
  },
): Promise<MediaIngestRecord> {
  const tenant = parseMediaIngestTenantKey(input.tenantKey);
  const sessionId = normalizeUuid(input.sessionId, "sessionId");
  if (!MEDIA_INGEST_WORK_STAGES.includes(input.stage))
    invalid("stage is invalid");
  if (!MEDIA_INGEST_WORKER_OUTCOMES.includes(input.outcome))
    invalid("outcome is invalid");
  if (!Number.isInteger(input.leaseFence) || input.leaseFence < 1) {
    invalid("leaseFence must be positive");
  }
  const errorCode = input.errorCode?.trim().toLowerCase() || null;
  if (errorCode && !SAFE_CODE_PATTERN.test(errorCode))
    invalid("errorCode is invalid");
  const observedSize =
    input.observedSize === null || input.observedSize === undefined
      ? null
      : normalizeSafeInteger(input.observedSize, "observedSize");
  const observedSha256 = input.observedSha256
    ? normalizeSha256(input.observedSha256, "observedSha256")
    : null;
  const scanEngine = input.scanEngine
    ? normalizeSafeText(input.scanEngine, "scanEngine", 160)
    : null;
  const scanReceiptHash = input.scanReceiptHash
    ? normalizeSha256(input.scanReceiptHash, "scanReceiptHash")
    : null;
  const scanSubjectSha256 = input.scanSubjectSha256
    ? normalizeSha256(input.scanSubjectSha256, "scanSubjectSha256")
    : null;
  const transcodeReceiptHash = input.transcodeReceiptHash
    ? normalizeSha256(input.transcodeReceiptHash, "transcodeReceiptHash")
    : null;
  const retryAt = input.retryAt
    ? normalizeTimestamp(input.retryAt, "retryAt")
    : null;
  const hasVerifyEvidence = observedSize !== null || observedSha256 !== null;
  const hasScanEvidence =
    scanEngine !== null ||
    scanReceiptHash !== null ||
    scanSubjectSha256 !== null;
  if (
    (input.outcome === "verified" &&
      (input.stage !== "verify" ||
        observedSize === null ||
        observedSha256 === null ||
        hasScanEvidence ||
        transcodeReceiptHash !== null)) ||
    (["clean", "infected", "scan_error"].includes(input.outcome) &&
      (input.stage !== "scan" ||
        scanEngine === null ||
        scanReceiptHash === null ||
        scanSubjectSha256 === null ||
        hasVerifyEvidence ||
        transcodeReceiptHash !== null)) ||
    (input.outcome === "ready" &&
      (input.stage !== "transcode" ||
        transcodeReceiptHash === null ||
        hasVerifyEvidence ||
        hasScanEvidence)) ||
    (["retry", "failed"].includes(input.outcome) &&
      (hasVerifyEvidence || hasScanEvidence || transcodeReceiptHash !== null)) ||
    (input.outcome === "retry" && retryAt === null) ||
    (input.outcome !== "retry" && retryAt !== null)
  ) {
    invalid("settlement evidence does not match stage and outcome");
  }
  const data = await callRpc(client, "settle_media_ingest_work", {
    p_tenant_kind: tenant.tenantKind,
    p_tenant_id: tenant.tenantId,
    p_session_id: sessionId,
    p_request_id: normalizeUuid(input.requestId, "requestId"),
    p_lease_fence: input.leaseFence,
    p_stage: input.stage,
    p_outcome: input.outcome,
    p_observed_size: observedSize,
    p_observed_sha256: observedSha256,
    p_scan_engine: scanEngine,
    p_scan_receipt_hash: scanReceiptHash,
    p_scan_subject_sha256: scanSubjectSha256,
    p_transcode_receipt_hash: transcodeReceiptHash,
    p_error_code: errorCode,
    p_retry_at: retryAt,
  });
  return assertRecordAuthority(parseMediaIngestRecord(data), {
    tenantKey: tenant.tenantKey,
    sessionId,
  });
}
