import type { StorageRuntimeConfig } from "../storage/config";
import type { StorageCapability } from "../storage/contracts";

export type MediaPipelineEgressPolicy = "allow-external" | "local-only";

export interface MediaPipelineConfig {
  maxAttempts: number;
  retryBaseMs: number;
  retryCapMs: number;
  jobLeaseMs: number;
  workerLeaseMs: number;
  maxConcurrentJobs: number;
  maxSourceBytes: number;
  maxActiveJobsPerProject: number | null;
  maxActiveBytesPerProject: number | null;
  maxLifecycleInspectionArtifacts: number;
  maxReplayManifestBytes: number;
  sloQueuedMs: number;
  sloEligibleMs: number;
  sloRunningMs: number;
  sloRetryReadyMs: number;
  egressPolicy: MediaPipelineEgressPolicy;
  requiredStorageCapabilities: StorageCapability[];
  requiredResidency: string | null;
  requireSourceReceipt: boolean;
  encryptionKeyVersion: string | null;
  requiredEncryptionKeyVersion: string | null;
  keyRotationDueAt: string | null;
  blockOnOverdueKeyRotation: boolean;
  manifestSigningKey: string | null;
  manifestVerificationKeys: string[];
  requireManifestSignature: boolean;
  receiptCatalogCursorTokenKey: string | null;
  receiptCatalogCursorTokenVerificationKeys: string[];
  receiptCatalogCursorTokenTtlMs: number;
  providerCatalogConformanceReceiptMaxRecords: number;
  providerCatalogConformanceReceiptRetentionMs: number;
  providerCatalogConformanceReceiptLegalHold: boolean;
  providerCatalogConformancePacketEscrowMaxRecords: number;
  providerCatalogConformancePacketEscrowRetentionMs: number;
  providerCatalogConformancePacketEscrowLegalHold: boolean;
  providerCatalogConformancePacketQuarantineMaxRecords: number;
  providerCatalogConformancePacketQuarantineRetentionMs: number;
  providerCatalogConformancePacketQuarantineLegalHold: boolean;
  providerCatalogConformancePacketQuarantineAttestationMaxRecords: number;
  providerCatalogConformancePacketQuarantineAttestationRetentionMs: number;
  providerCatalogConformancePacketQuarantineAttestationLegalHold: boolean;
  receiptCatalogCheckpointResetReceiptMaxRecords: number;
  receiptCatalogCheckpointResetReceiptRetentionMs: number;
  receiptCatalogCheckpointResetReceiptLegalHold: boolean;
  receiptCatalogCheckpointResetReceiptPacketEscrowMaxRecords: number;
  receiptCatalogCheckpointResetReceiptPacketEscrowRetentionMs: number;
  receiptCatalogCheckpointResetReceiptPacketEscrowLegalHold: boolean;
  receiptCatalogCheckpointResetReceiptPacketQuarantineMaxRecords: number;
  receiptCatalogCheckpointResetReceiptPacketQuarantineRetentionMs: number;
  receiptCatalogCheckpointResetReceiptPacketQuarantineLegalHold: boolean;
  commandTimeoutMs: number;
  ffmpegPath: string;
  ffprobePath: string;
}

const STORAGE_CAPABILITIES: readonly StorageCapability[] = [
  "multipart-ingest",
  "atomic-placement",
  "capacity-reporting",
  "server-checksum",
  "signed-delivery",
  "object-versioning",
  "lifecycle-tiering",
  "legal-hold",
] as const;

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  label: string
): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return parsed;
}

function parseSafeByteLimit(
  value: string | undefined,
  fallback: bigint,
  label: string
): number {
  const raw = value?.trim();
  const parsed = raw ? BigInt(raw) : fallback;
  if (parsed <= 0n || parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} must be a positive safe integer byte count`);
  }
  return Number(parsed);
}

function parseOptionalPositiveInteger(value: string | undefined, label: string): number | null {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return parsed;
}

function parseOptionalSafeByteLimit(value: string | undefined, label: string): number | null {
  const raw = value?.trim();
  if (!raw) return null;
  const parsed = BigInt(raw);
  if (parsed <= 0n || parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} must be a positive safe integer byte count`);
  }
  return Number(parsed);
}

function parseEgressPolicy(value: string | undefined): MediaPipelineEgressPolicy {
  const normalized = value?.trim() || "allow-external";
  if (normalized === "allow-external" || normalized === "local-only") {
    return normalized;
  }
  throw new Error("CODELIVER_MEDIA_PIPELINE_EGRESS_POLICY must be allow-external or local-only");
}

function parseStorageCapabilities(value: string | undefined): StorageCapability[] {
  if (!value?.trim()) return [];
  const allowed = new Set<string>(STORAGE_CAPABILITIES);
  const seen = new Set<StorageCapability>();
  for (const raw of value.split(",")) {
    const capability = raw.trim();
    if (!capability) continue;
    if (!allowed.has(capability)) {
      throw new Error(
        "CODELIVER_MEDIA_PIPELINE_REQUIRED_STORAGE_CAPABILITIES contains an unsupported capability"
      );
    }
    seen.add(capability as StorageCapability);
  }
  return [...seen].sort();
}

function parsePolicyLabel(value: string | undefined, label: string): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  if (normalized.length > 128 || !/^[A-Za-z0-9._:@/-]+$/.test(normalized)) {
    throw new Error(`${label} must be a non-secret policy label of 128 safe characters or fewer`);
  }
  return normalized;
}

function parseOptionalIsoDate(value: string | undefined, label: string): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== normalized) {
    throw new Error(`${label} must be an ISO-8601 UTC timestamp`);
  }
  return normalized;
}

function parseBooleanFlag(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

function parseSecret(value: string | undefined, label: string): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  if (normalized.length < 32) {
    throw new Error(`${label} must be at least 32 characters`);
  }
  return normalized;
}

function parseSecretList(value: string | undefined, label: string): string[] {
  if (!value?.trim()) return [];
  const seen = new Set<string>();
  for (const raw of value.split(",")) {
    const secret = parseSecret(raw, label);
    if (secret) seen.add(secret);
  }
  return [...seen];
}

export function readMediaPipelineConfig(
  storage: StorageRuntimeConfig,
  env: NodeJS.ProcessEnv = process.env
): MediaPipelineConfig {
  const commandTimeoutMs = parsePositiveInteger(
    env.CODELIVER_MEDIA_PIPELINE_COMMAND_TIMEOUT_MS,
    30 * 60_000,
    "CODELIVER_MEDIA_PIPELINE_COMMAND_TIMEOUT_MS"
  );
  if (commandTimeoutMs > Math.floor((Number.MAX_SAFE_INTEGER - 2 * 60_000) / 4)) {
    throw new Error("CODELIVER_MEDIA_PIPELINE_COMMAND_TIMEOUT_MS is too large for lease validation");
  }
  // A run can invoke transcode, thumbnail, waveform, and caption commands.
  // Shorter leases permit a second worker to race an active first worker.
  const minimumLeaseMs = commandTimeoutMs * 4 + 2 * 60_000;
  const jobLeaseMs = parsePositiveInteger(
    env.CODELIVER_MEDIA_PIPELINE_JOB_LEASE_MS,
    minimumLeaseMs,
    "CODELIVER_MEDIA_PIPELINE_JOB_LEASE_MS"
  );
  const workerLeaseMs = parsePositiveInteger(
    env.CODELIVER_MEDIA_PIPELINE_WORKER_LEASE_MS,
    minimumLeaseMs,
    "CODELIVER_MEDIA_PIPELINE_WORKER_LEASE_MS"
  );
  if (jobLeaseMs < minimumLeaseMs || workerLeaseMs < minimumLeaseMs) {
    throw new Error(
      "Media pipeline job and worker leases must cover the configured command budget"
    );
  }
  const manifestSigningKey = parseSecret(
    env.CODELIVER_MEDIA_PIPELINE_MANIFEST_SIGNING_KEY,
    "CODELIVER_MEDIA_PIPELINE_MANIFEST_SIGNING_KEY"
  );
  const manifestVerificationKeys = [
    ...new Set(
      [
        manifestSigningKey,
        ...parseSecretList(
          env.CODELIVER_MEDIA_PIPELINE_MANIFEST_VERIFICATION_KEYS,
          "CODELIVER_MEDIA_PIPELINE_MANIFEST_VERIFICATION_KEYS"
        ),
      ].filter((key): key is string => Boolean(key))
    ),
  ];
  const requireManifestSignature = parseBooleanFlag(
    env.CODELIVER_MEDIA_PIPELINE_REQUIRE_MANIFEST_SIGNATURE
  );
  if (requireManifestSignature && !manifestSigningKey) {
    throw new Error(
      "CODELIVER_MEDIA_PIPELINE_REQUIRE_MANIFEST_SIGNATURE requires CODELIVER_MEDIA_PIPELINE_MANIFEST_SIGNING_KEY"
    );
  }
  const receiptCatalogCursorTokenKey = parseSecret(
    env.CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CURSOR_TOKEN_KEY,
    "CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CURSOR_TOKEN_KEY"
  );
  const receiptCatalogCursorTokenVerificationKeys = [
    ...new Set(
      [
        receiptCatalogCursorTokenKey,
        ...parseSecretList(
          env.CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CURSOR_TOKEN_VERIFICATION_KEYS,
          "CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CURSOR_TOKEN_VERIFICATION_KEYS"
        ),
      ].filter((key): key is string => Boolean(key))
    ),
  ];

  return {
    maxAttempts: parsePositiveInteger(
      env.CODELIVER_MEDIA_PIPELINE_MAX_ATTEMPTS,
      4,
      "CODELIVER_MEDIA_PIPELINE_MAX_ATTEMPTS"
    ),
    retryBaseMs: parsePositiveInteger(
      env.CODELIVER_MEDIA_PIPELINE_RETRY_BASE_MS,
      30_000,
      "CODELIVER_MEDIA_PIPELINE_RETRY_BASE_MS"
    ),
    retryCapMs: parsePositiveInteger(
      env.CODELIVER_MEDIA_PIPELINE_RETRY_CAP_MS,
      30 * 60_000,
      "CODELIVER_MEDIA_PIPELINE_RETRY_CAP_MS"
    ),
    jobLeaseMs,
    workerLeaseMs,
    maxConcurrentJobs: parsePositiveInteger(
      env.CODELIVER_MEDIA_PIPELINE_MAX_CONCURRENT_JOBS,
      1,
      "CODELIVER_MEDIA_PIPELINE_MAX_CONCURRENT_JOBS"
    ),
    maxSourceBytes: parseSafeByteLimit(
      env.CODELIVER_MEDIA_PIPELINE_MAX_SOURCE_BYTES,
      storage.maxUploadBytes,
      "CODELIVER_MEDIA_PIPELINE_MAX_SOURCE_BYTES"
    ),
    maxActiveJobsPerProject: parseOptionalPositiveInteger(
      env.CODELIVER_MEDIA_PIPELINE_MAX_ACTIVE_JOBS_PER_PROJECT,
      "CODELIVER_MEDIA_PIPELINE_MAX_ACTIVE_JOBS_PER_PROJECT"
    ),
    maxActiveBytesPerProject: parseOptionalSafeByteLimit(
      env.CODELIVER_MEDIA_PIPELINE_MAX_ACTIVE_BYTES_PER_PROJECT,
      "CODELIVER_MEDIA_PIPELINE_MAX_ACTIVE_BYTES_PER_PROJECT"
    ),
    maxLifecycleInspectionArtifacts: parsePositiveInteger(
      env.CODELIVER_MEDIA_PIPELINE_LIFECYCLE_INSPECTION_LIMIT,
      500,
      "CODELIVER_MEDIA_PIPELINE_LIFECYCLE_INSPECTION_LIMIT"
    ),
    maxReplayManifestBytes: parseSafeByteLimit(
      env.CODELIVER_MEDIA_PIPELINE_REPLAY_MANIFEST_MAX_BYTES,
      1_048_576n,
      "CODELIVER_MEDIA_PIPELINE_REPLAY_MANIFEST_MAX_BYTES"
    ),
    sloQueuedMs: parsePositiveInteger(
      env.CODELIVER_MEDIA_PIPELINE_SLO_QUEUED_MS,
      15 * 60_000,
      "CODELIVER_MEDIA_PIPELINE_SLO_QUEUED_MS"
    ),
    sloEligibleMs: parsePositiveInteger(
      env.CODELIVER_MEDIA_PIPELINE_SLO_ELIGIBLE_MS,
      5 * 60_000,
      "CODELIVER_MEDIA_PIPELINE_SLO_ELIGIBLE_MS"
    ),
    sloRunningMs: parsePositiveInteger(
      env.CODELIVER_MEDIA_PIPELINE_SLO_RUNNING_MS,
      workerLeaseMs,
      "CODELIVER_MEDIA_PIPELINE_SLO_RUNNING_MS"
    ),
    sloRetryReadyMs: parsePositiveInteger(
      env.CODELIVER_MEDIA_PIPELINE_SLO_RETRY_READY_MS,
      5 * 60_000,
      "CODELIVER_MEDIA_PIPELINE_SLO_RETRY_READY_MS"
    ),
    egressPolicy: parseEgressPolicy(env.CODELIVER_MEDIA_PIPELINE_EGRESS_POLICY),
    requiredStorageCapabilities: parseStorageCapabilities(
      env.CODELIVER_MEDIA_PIPELINE_REQUIRED_STORAGE_CAPABILITIES
    ),
    requiredResidency: env.CODELIVER_MEDIA_PIPELINE_REQUIRED_RESIDENCY?.trim() || null,
    requireSourceReceipt: parseBooleanFlag(
      env.CODELIVER_MEDIA_PIPELINE_REQUIRE_SOURCE_RECEIPT
    ),
    encryptionKeyVersion: parsePolicyLabel(
      env.CODELIVER_MEDIA_PIPELINE_ENCRYPTION_KEY_VERSION,
      "CODELIVER_MEDIA_PIPELINE_ENCRYPTION_KEY_VERSION"
    ),
    requiredEncryptionKeyVersion: parsePolicyLabel(
      env.CODELIVER_MEDIA_PIPELINE_REQUIRED_ENCRYPTION_KEY_VERSION,
      "CODELIVER_MEDIA_PIPELINE_REQUIRED_ENCRYPTION_KEY_VERSION"
    ),
    keyRotationDueAt: parseOptionalIsoDate(
      env.CODELIVER_MEDIA_PIPELINE_KEY_ROTATION_DUE_AT,
      "CODELIVER_MEDIA_PIPELINE_KEY_ROTATION_DUE_AT"
    ),
    blockOnOverdueKeyRotation: parseBooleanFlag(
      env.CODELIVER_MEDIA_PIPELINE_BLOCK_ON_OVERDUE_KEY_ROTATION
    ),
    manifestSigningKey,
    manifestVerificationKeys,
    requireManifestSignature,
    receiptCatalogCursorTokenKey,
    receiptCatalogCursorTokenVerificationKeys,
    receiptCatalogCursorTokenTtlMs: parsePositiveInteger(
      env.CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CURSOR_TOKEN_TTL_MS,
      6 * 60 * 60_000,
      "CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CURSOR_TOKEN_TTL_MS"
    ),
    providerCatalogConformanceReceiptMaxRecords: parsePositiveInteger(
      env.CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_RECEIPT_MAX_RECORDS,
      100,
      "CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_RECEIPT_MAX_RECORDS"
    ),
    providerCatalogConformanceReceiptRetentionMs: parsePositiveInteger(
      env.CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_RECEIPT_RETENTION_MS,
      90 * 24 * 60 * 60_000,
      "CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_RECEIPT_RETENTION_MS"
    ),
    providerCatalogConformanceReceiptLegalHold: parseBooleanFlag(
      env.CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_RECEIPT_LEGAL_HOLD
    ),
    providerCatalogConformancePacketEscrowMaxRecords: parsePositiveInteger(
      env.CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_PACKET_ESCROW_MAX_RECORDS,
      100,
      "CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_PACKET_ESCROW_MAX_RECORDS"
    ),
    providerCatalogConformancePacketEscrowRetentionMs: parsePositiveInteger(
      env.CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_PACKET_ESCROW_RETENTION_MS,
      90 * 24 * 60 * 60_000,
      "CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_PACKET_ESCROW_RETENTION_MS"
    ),
    providerCatalogConformancePacketEscrowLegalHold: parseBooleanFlag(
      env.CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_PACKET_ESCROW_LEGAL_HOLD
    ),
    providerCatalogConformancePacketQuarantineMaxRecords: parsePositiveInteger(
      env.CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_PACKET_QUARANTINE_MAX_RECORDS,
      100,
      "CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_PACKET_QUARANTINE_MAX_RECORDS"
    ),
    providerCatalogConformancePacketQuarantineRetentionMs: parsePositiveInteger(
      env.CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_PACKET_QUARANTINE_RETENTION_MS,
      180 * 24 * 60 * 60_000,
      "CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_PACKET_QUARANTINE_RETENTION_MS"
    ),
    providerCatalogConformancePacketQuarantineLegalHold: parseBooleanFlag(
      env.CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_PACKET_QUARANTINE_LEGAL_HOLD
    ),
    providerCatalogConformancePacketQuarantineAttestationMaxRecords: parsePositiveInteger(
      env.CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_PACKET_QUARANTINE_ATTESTATION_MAX_RECORDS,
      100,
      "CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_PACKET_QUARANTINE_ATTESTATION_MAX_RECORDS"
    ),
    providerCatalogConformancePacketQuarantineAttestationRetentionMs: parsePositiveInteger(
      env.CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_PACKET_QUARANTINE_ATTESTATION_RETENTION_MS,
      365 * 24 * 60 * 60_000,
      "CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_PACKET_QUARANTINE_ATTESTATION_RETENTION_MS"
    ),
    providerCatalogConformancePacketQuarantineAttestationLegalHold: parseBooleanFlag(
      env.CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_PACKET_QUARANTINE_ATTESTATION_LEGAL_HOLD
    ),
    receiptCatalogCheckpointResetReceiptMaxRecords: parsePositiveInteger(
      env.CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CHECKPOINT_RESET_RECEIPT_MAX_RECORDS,
      100,
      "CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CHECKPOINT_RESET_RECEIPT_MAX_RECORDS"
    ),
    receiptCatalogCheckpointResetReceiptRetentionMs: parsePositiveInteger(
      env.CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CHECKPOINT_RESET_RECEIPT_RETENTION_MS,
      365 * 24 * 60 * 60_000,
      "CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CHECKPOINT_RESET_RECEIPT_RETENTION_MS"
    ),
    receiptCatalogCheckpointResetReceiptLegalHold: parseBooleanFlag(
      env.CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CHECKPOINT_RESET_RECEIPT_LEGAL_HOLD
    ),
    receiptCatalogCheckpointResetReceiptPacketEscrowMaxRecords: parsePositiveInteger(
      env.CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CHECKPOINT_RESET_RECEIPT_PACKET_ESCROW_MAX_RECORDS,
      100,
      "CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CHECKPOINT_RESET_RECEIPT_PACKET_ESCROW_MAX_RECORDS"
    ),
    receiptCatalogCheckpointResetReceiptPacketEscrowRetentionMs: parsePositiveInteger(
      env.CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CHECKPOINT_RESET_RECEIPT_PACKET_ESCROW_RETENTION_MS,
      365 * 24 * 60 * 60_000,
      "CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CHECKPOINT_RESET_RECEIPT_PACKET_ESCROW_RETENTION_MS"
    ),
    receiptCatalogCheckpointResetReceiptPacketEscrowLegalHold: parseBooleanFlag(
      env.CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CHECKPOINT_RESET_RECEIPT_PACKET_ESCROW_LEGAL_HOLD
    ),
    receiptCatalogCheckpointResetReceiptPacketQuarantineMaxRecords: parsePositiveInteger(
      env.CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CHECKPOINT_RESET_RECEIPT_PACKET_QUARANTINE_MAX_RECORDS,
      100,
      "CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CHECKPOINT_RESET_RECEIPT_PACKET_QUARANTINE_MAX_RECORDS"
    ),
    receiptCatalogCheckpointResetReceiptPacketQuarantineRetentionMs: parsePositiveInteger(
      env.CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CHECKPOINT_RESET_RECEIPT_PACKET_QUARANTINE_RETENTION_MS,
      365 * 24 * 60 * 60_000,
      "CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CHECKPOINT_RESET_RECEIPT_PACKET_QUARANTINE_RETENTION_MS"
    ),
    receiptCatalogCheckpointResetReceiptPacketQuarantineLegalHold: parseBooleanFlag(
      env.CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CHECKPOINT_RESET_RECEIPT_PACKET_QUARANTINE_LEGAL_HOLD
    ),
    commandTimeoutMs,
    ffmpegPath: env.FFMPEG_PATH?.trim() || "ffmpeg",
    ffprobePath: env.FFPROBE_PATH?.trim() || "ffprobe",
  };
}

export function retryDelayMs(jobAttempt: number, config: MediaPipelineConfig): number {
  const exponent = Math.max(0, jobAttempt - 1);
  return Math.min(config.retryCapMs, config.retryBaseMs * 2 ** exponent);
}
