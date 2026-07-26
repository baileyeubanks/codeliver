export const MEDIA_PIPELINE_SCHEMA_VERSION = 1;

export const MEDIA_PIPELINE_STAGES = [
  "queued",
  "ingest",
  "quarantine",
  "probe",
  "transcode",
  "derivatives",
  "publish",
] as const;

export type MediaPipelineStage = (typeof MEDIA_PIPELINE_STAGES)[number];

export const MEDIA_PIPELINE_STATUSES = [
  "queued",
  "running",
  "retry_wait",
  "published",
  "failed",
  "cancelled",
  "quarantined",
] as const;

export type MediaPipelineStatus = (typeof MEDIA_PIPELINE_STATUSES)[number];

export type MediaPipelineEventType =
  | "enqueued"
  | "claimed"
  | "stage_changed"
  | "progress"
  | "retry_scheduled"
  | "cancel_requested"
  | "cancelled"
  | "quarantined"
  | "published"
  | "failed"
  | "recovered";

export interface MediaPipelineEvent {
  at: string;
  type: MediaPipelineEventType;
  stage: MediaPipelineStage;
  progress: number;
  code?: string;
  message?: string;
}

export interface MediaPipelineSource {
  /**
   * A canonical object key relative to the configured storage root. This is
   * supplied by the ingest authority, never by a browser request.
   */
  objectKey: string;
  filename: string;
  versionNumber: number;
  expectedSize: number | null;
  expectedSha256: string | null;
  receipt?: MediaPipelineSourceReceipt | null;
}

export interface MediaPipelineSourceReceipt {
  provider: string;
  objectKey: string;
  size: number;
  sha256: string;
  providerVersionId: string | null;
  committedAt: string | null;
}

export interface MediaProbe {
  durationSeconds: number;
  width: number | null;
  height: number | null;
  frameRate: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  hasVideo: boolean;
  hasAudio: boolean;
  hasSubtitle: boolean;
  formatName: string | null;
}

export interface StoredMediaArtifact {
  kind:
    | "hls_playlist"
    | "hls_segment"
    | "hls_manifest"
    | "thumbnail"
    | "waveform"
    | "waveform_manifest"
    | "captions"
    | "caption_manifest"
    | "pipeline_manifest"
    | "restore_attestation";
  objectKey: string;
  filename: string;
  contentType: string;
  size: number;
  sha256: string;
  provider: string;
  providerVersionId: string | null;
}

export interface MediaPipelineArtifacts {
  hls: {
    playlist: StoredMediaArtifact;
    segments: StoredMediaArtifact[];
    manifest: StoredMediaArtifact;
  };
  thumbnail: StoredMediaArtifact | null;
  waveform: StoredMediaArtifact;
  captions: {
    content: StoredMediaArtifact;
    manifest: StoredMediaArtifact;
    status: "extracted" | "pending_transcription";
  };
  pipelineManifest: StoredMediaArtifact;
}

export interface MediaPipelineFailure {
  code: string;
  message: string;
  retryable: boolean;
  at: string;
}

export interface MediaPipelineScanReceipt {
  verdict: "clean" | "infected" | "pending" | "error";
  engine: string;
  signature: string | null;
  detail: string;
  scannedAt: string;
  subjectSha256: string;
  provider: string;
}

export interface MediaPipelineLease {
  holderId: string;
  acquiredAt: string;
  expiresAt: string;
}

export interface MediaPipelineJob {
  schemaVersion: typeof MEDIA_PIPELINE_SCHEMA_VERSION;
  id: string;
  idempotencyKey: string;
  assetId: string;
  versionId: string;
  projectId: string;
  /**
   * The current data model has no tenant column on assets. This is a
   * deterministic project-scoped namespace until organization authority lands.
   */
  tenantScope: string;
  source: MediaPipelineSource;
  status: MediaPipelineStatus;
  stage: MediaPipelineStage;
  progress: number;
  attempt: number;
  maxAttempts: number;
  retryAt: string | null;
  cancellationRequested: boolean;
  lease: MediaPipelineLease | null;
  sourceSha256: string | null;
  sourceSize: number | null;
  scan: MediaPipelineScanReceipt | null;
  probe: MediaProbe | null;
  artifacts: MediaPipelineArtifacts | null;
  failure: MediaPipelineFailure | null;
  events: MediaPipelineEvent[];
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export interface MediaPipelineEnqueueInput {
  assetId: string;
  versionId: string;
  projectId: string;
  source: MediaPipelineSource;
}

export interface MediaPipelineQueueDiagnostics {
  generatedAt: string;
  statusCounts: Record<MediaPipelineStatus, number>;
  totalJobs: number;
  activeJobs: number;
  terminalJobs: number;
  eligibleJobs: number;
  runningJobs: number;
  staleRunningJobs: number;
  retryReadyJobs: number;
  retryDeferredJobs: number;
  cancellationRequestedJobs: number;
  corruptJobFiles: number;
  stagedJobFiles: number;
  oldestQueuedAgeMs: number | null;
  oldestEligibleAgeMs: number | null;
  slo: {
    queuedMs: number;
    eligibleMs: number;
    runningMs: number;
    retryReadyMs: number;
    queuedBreaches: number;
    eligibleBreaches: number;
    runningBreaches: number;
    retryReadyBreaches: number;
    oldestRunningAgeMs: number | null;
    oldestRetryReadyAgeMs: number | null;
    breached: boolean;
  };
  quota: {
    maxActiveJobsPerProject: number | null;
    maxActiveBytesPerProject: string | null;
    projectsOverJobQuota: number;
    projectsOverByteQuota: number;
    largestProjectActiveJobs: number;
    largestProjectActiveBytes: string;
  };
}

export interface MediaPipelineLifecycleDiagnostics {
  generatedAt: string;
  inspectionLimit: number;
  inspectionTruncated: boolean;
  inspectedArtifactReferences: number;
  missingArtifactReferences: number;
  checksumMismatchReferences: number;
  terminalOrphanCandidateJobs: number;
  terminalOrphanArtifactReferences: number;
  terminalOrphanBytes: string;
  recoverableArtifactJobs: number;
  recoverableArtifactReferences: number;
  recoverableArtifactBytes: string;
  publishedArtifactJobs: number;
  publishedArtifactReferences: number;
  publishedArtifactBytes: string;
  oldestTerminalOrphanCandidateAgeMs: number | null;
  deleteMode: "disabled";
  policy: {
    lifecycleTieringSupported: boolean;
    legalHoldSupported: boolean;
    manualAttestationRequired: boolean;
  };
}

export interface MediaPipelineReplayDiagnostics {
  generatedAt: string;
  manifestInspectionLimit: number;
  manifestInspectionTruncated: boolean;
  inspectedManifests: number;
  missingManifests: number;
  unreadableManifests: number;
  checksumMismatchManifests: number;
  invalidJsonManifests: number;
  missingIntegrityManifests: number;
  integrityMismatchManifests: number;
  signedManifests: number;
  unsignedManifests: number;
  unverifiedSignatureManifests: number;
  missingSignatureManifests: number;
  invalidSignatureManifests: number;
  signatureRequired: boolean;
  signatureVerificationEnabled: boolean;
  semanticMismatchManifests: number;
  oversizeManifests: number;
  publishedManifests: number;
  recoverableManifests: number;
  driftDetected: boolean;
  maxManifestBytes: number;
}

export type MediaPipelineRestoreAttestationStatus =
  | "ready"
  | "not_found"
  | "not_published"
  | "drift_detected";

export type MediaPipelineManifestIntegrityStatus =
  | "valid_signed"
  | "valid_unsigned"
  | "missing_integrity"
  | "payload_mismatch"
  | "unverified_signature"
  | "missing_signature"
  | "invalid_signature";

export interface MediaPipelineRestoreArtifactAttestation {
  kind: StoredMediaArtifact["kind"];
  objectKeyDigest: string;
  provider: string;
  size: number;
  sha256: string;
  providerVersionIdDigest: string | null;
  present: boolean;
  checksumVerified: boolean;
}

export interface MediaPipelineRestoreAttestation {
  generatedAt: string;
  status: MediaPipelineRestoreAttestationStatus;
  ready: boolean;
  versionIdDigest: string;
  versionNumber: number | null;
  storageProvider: string | null;
  failureCodes: string[];
  manifest: {
    objectKeyDigest: string | null;
    size: number | null;
    sha256: string | null;
    present: boolean;
    checksumVerified: boolean;
    integrity: MediaPipelineManifestIntegrityStatus | null;
    semanticMatch: boolean;
    signed: boolean;
  };
  derivatives: {
    totalReferences: number;
    inspectedReferences: number;
    missingReferences: number;
    checksumMismatchReferences: number;
    totalBytes: string;
    references: MediaPipelineRestoreArtifactAttestation[];
  };
  limits: {
    maxManifestBytes: number;
    manifestSigningRequired: boolean;
    manifestVerificationKeyCount: number;
  };
}

export interface MediaPipelineRestoreAttestationReceipt {
  schemaVersion: typeof MEDIA_PIPELINE_SCHEMA_VERSION;
  type: "co_deliver_restore_attestation_receipt";
  receiptVersion: "v1";
  generatedAt: string;
  attestation: MediaPipelineRestoreAttestation;
  evidence: {
    attestationPayloadSha256: string;
    ready: boolean;
    status: MediaPipelineRestoreAttestationStatus;
    failureCodes: string[];
  };
  receiptIntegrity: {
    algorithm: "sha256" | "hmac-sha256";
    payloadSha256: string;
    signature: string | null;
    signingKeyDigest: string | null;
  };
}

export interface MediaPipelineRestoreAttestationReceiptPublication {
  generatedAt: string;
  persisted: boolean;
  reason: string | null;
  attestation: MediaPipelineRestoreAttestation;
  receipt: {
    objectKeyDigest: string | null;
    provider: string | null;
    size: number | null;
    sha256: string | null;
    providerVersionIdDigest: string | null;
    integrity: "sha256" | "hmac-sha256" | null;
    signed: boolean;
  };
}

export type MediaPipelineRestoreReceiptRepairMode = "dry_run" | "apply";
export type MediaPipelineRestoreReceiptCatalogScanRoot =
  | "tenant-object-namespace"
  | "provider-catalog"
  | "unsupported";

export interface MediaPipelineRestoreReceiptRepairResult {
  generatedAt: string;
  mode: MediaPipelineRestoreReceiptRepairMode;
  supported: boolean;
  scanRoot: MediaPipelineRestoreReceiptCatalogScanRoot;
  scanLimit: number;
  scannedJsonFiles: number;
  scanTruncated: boolean;
  cursorSupported: boolean;
  pagesScanned: number;
  checkpointRequired: boolean;
  nextCursorDigest: string | null;
  continuationToken: string | null;
  continuationTokenDigest: string | null;
  continuationTokenKeyDigest: string | null;
  continuationTokenExpiresAt: string | null;
  discoveredReceipts: number;
  alreadyIndexedReceipts: number;
  eligibleReceipts: number;
  repairedReceipts: number;
  skippedInvalidIntegrity: number;
  skippedInvalidPayload: number;
  skippedUnmatchedVersion: number;
  skippedDuplicateVersion: number;
  invalidJsonFiles: number;
  unsafeEntries: number;
  applied: boolean;
  dryRun: boolean;
}

export interface MediaPipelineRestoreReceiptDiagnostics {
  generatedAt: string;
  inspectionLimit: number;
  inspectionTruncated: boolean;
  publishedVersions: number;
  versionsWithReceipt: number;
  versionsMissingReceipt: number;
  duplicateReceiptVersions: number;
  totalReceipts: number;
  invalidReceiptRecords: number;
  inspectedReceipts: number;
  missingReceiptObjects: number;
  checksumMismatchReceipts: number;
  unreadableReceipts: number;
  invalidJsonReceipts: number;
  missingIntegrityReceipts: number;
  integrityMismatchReceipts: number;
  signedReceipts: number;
  unsignedReceipts: number;
  unverifiedSignatureReceipts: number;
  missingSignatureReceipts: number;
  invalidSignatureReceipts: number;
  attestationPayloadMismatchReceipts: number;
  statusDriftReceipts: number;
  signatureRequired: boolean;
  signatureVerificationEnabled: boolean;
  driftDetected: boolean;
  maxReceiptBytes: number;
  catalogRecovery: {
    supported: boolean;
    scanRoot: MediaPipelineRestoreReceiptCatalogScanRoot;
    scanLimit: number;
    scannedJsonFiles: number;
    scanTruncated: boolean;
    cursorSupported: boolean;
    pagesScanned: number;
    checkpointRequired: boolean;
    nextCursorDigest: string | null;
    discoveredReceipts: number;
    unindexedReceipts: number;
    invalidJsonFiles: number;
    unsafeEntries: number;
    repairRequired: boolean;
    checkpointRecords: number;
    invalidCheckpointRecords: number;
    staleCheckpointRecords: number;
    checkpointResetCandidates: number;
    unsafeCheckpointResetEntries: number;
    checkpointResetRecommended: boolean;
    checkpointRecord: {
      recorded: boolean;
      completed: boolean;
      stale: boolean;
      recordedAt: string | null;
      startedCursorDigest: string | null;
      nextCursorDigest: string | null;
      continuationTokenDigest: string | null;
      continuationTokenKeyDigest: string | null;
      continuationTokenExpiresAt: string | null;
      pagesScanned: number;
    };
  };
}

export interface MediaPipelineSourceReceiptDiagnostics {
  generatedAt: string;
  inspectionLimit: number;
  inspectionTruncated: boolean;
  totalJobs: number;
  jobsWithReceipt: number;
  jobsMissingReceipt: number;
  activeJobsMissingReceipt: number;
  publishedJobsWithReceipt: number;
  invalidReceiptJobs: number;
  inspectedReceipts: number;
  providerMismatchReceipts: number;
  missingStoredObjects: number;
  checksumMismatchReceipts: number;
  migrationReady: boolean;
}

export interface MediaPipelineStoragePolicyDiagnostics {
  egressPolicy: "allow-external" | "local-only";
  externalProvider: boolean;
  externalEgressAllowed: boolean;
  requiredCapabilities: string[];
  missingCapabilities: string[];
  requiredResidency: string | null;
  residencyVerification: "not-required" | "unverified";
  ready: boolean;
}

export interface MediaPipelineEncryptionPolicyDiagnostics {
  keyVersionPresent: boolean;
  keyVersionDigest: string | null;
  requiredKeyVersionDigest: string | null;
  requiredKeyVersionSatisfied: boolean;
  keyRotationDueAt: string | null;
  keyRotationOverdue: boolean;
  blockOnOverdueKeyRotation: boolean;
  ready: boolean;
}

export interface MediaPipelineProviderCatalogConformancePacketEscrowDiagnostics {
  generatedAt: string;
  packets: number;
  invalidRecords: number;
  duplicatePacketDigests: number;
  signedPackets: number;
  unsignedPackets: number;
  invalidIntegrityPackets: number;
  payloadMismatchPackets: number;
  eligiblePackets: number;
  blockedByLegalHold: number;
  oldestPacketAgeMs: number | null;
  oldestEligiblePacketAgeMs: number | null;
  policy: {
    maxRecords: number;
    retentionMs: number;
    legalHold: boolean;
    preserveLatest: boolean;
  };
  pressureDetected: boolean;
}

export interface MediaPipelineReceiptCatalogCheckpointResetReceiptPacketEscrowDiagnostics {
  generatedAt: string;
  packets: number;
  invalidRecords: number;
  duplicatePacketDigests: number;
  signedPackets: number;
  unsignedPackets: number;
  invalidIntegrityPackets: number;
  payloadMismatchPackets: number;
  eligiblePackets: number;
  blockedByLegalHold: number;
  oldestPacketAgeMs: number | null;
  oldestEligiblePacketAgeMs: number | null;
  policy: {
    maxRecords: number;
    retentionMs: number;
    legalHold: boolean;
    preserveLatest: boolean;
  };
  pressureDetected: boolean;
}

export interface MediaPipelineReceiptCatalogCheckpointResetReceiptPacketQuarantineDiagnostics {
  generatedAt: string;
  quarantinedPackets: number;
  invalidRecords: number;
  malformedRecordQuarantines: number;
  invalidIntegrityQuarantines: number;
  payloadMismatchQuarantines: number;
  unknownReasonQuarantines: number;
  eligiblePackets: number;
  blockedByLegalHold: number;
  oldestQuarantineAgeMs: number | null;
  oldestEligibleQuarantineAgeMs: number | null;
  policy: {
    maxRecords: number;
    retentionMs: number;
    legalHold: boolean;
    preserveLatest: boolean;
    manualReviewRequired: boolean;
  };
  pressureDetected: boolean;
}

export interface MediaPipelineProviderCatalogConformancePacketQuarantineAttestationDiagnostics {
  generatedAt: string;
  attestations: number;
  invalidRecords: number;
  reviewedAttestations: number;
  retainedAttestations: number;
  releasedAttestations: number;
  signedAttestations: number;
  unsignedAttestations: number;
  invalidIntegrityAttestations: number;
  payloadMismatchAttestations: number;
  eligibleAttestations: number;
  blockedByLegalHold: number;
  oldestAttestationAgeMs: number | null;
  oldestEligibleAttestationAgeMs: number | null;
  signatureRequired: boolean;
  signatureVerificationEnabled: boolean;
  policy: {
    maxRecords: number;
    retentionMs: number;
    legalHold: boolean;
    preserveLatest: boolean;
  };
  pressureDetected: boolean;
}

export interface MediaPipelineReceiptCatalogCheckpointResetReceiptDiagnostics {
  generatedAt: string;
  receipts: number;
  invalidRecords: number;
  signedReceipts: number;
  unsignedReceipts: number;
  invalidIntegrityReceipts: number;
  payloadMismatchReceipts: number;
  eligibleReceipts: number;
  blockedByLegalHold: number;
  oldestReceiptAgeMs: number | null;
  oldestEligibleReceiptAgeMs: number | null;
  signatureRequired: boolean;
  signatureVerificationEnabled: boolean;
  policy: {
    maxRecords: number;
    retentionMs: number;
    legalHold: boolean;
    preserveLatest: boolean;
  };
  pressureDetected: boolean;
  latest: {
    recordedAt: string;
    resetSnapshotDigest: string;
    deletedCheckpoints: number;
    signed: boolean;
    integrityStatus: MediaPipelineManifestIntegrityStatus;
  } | null;
}

export interface MediaPipelineWorkerDiagnostics extends MediaPipelineQueueDiagnostics {
  provider: string;
  storage: {
    label: string;
    configured: boolean;
    external: boolean;
    writeEnabled: boolean;
    readyForWrites: boolean;
    observedAt: string;
    capacity: {
      availableBytes: string | null;
      reservedBytes: string;
    } | null;
    checkCounts: Record<"pass" | "warn" | "fail", number>;
  };
  limits: {
    maxConcurrentJobs: number;
    maxSourceBytes: number;
    maxActiveJobsPerProject: number | null;
    maxActiveBytesPerProject: number | null;
    maxLifecycleInspectionArtifacts: number;
    sloQueuedMs: number;
    sloEligibleMs: number;
    sloRunningMs: number;
    sloRetryReadyMs: number;
    maxAttempts: number;
    retryBaseMs: number;
    retryCapMs: number;
    egressPolicy: "allow-external" | "local-only";
    requiredStorageCapabilities: string[];
    requiredResidency: string | null;
    requireSourceReceipt: boolean;
    keyRotationDueAt: string | null;
    blockOnOverdueKeyRotation: boolean;
    manifestSigningEnabled: boolean;
    manifestVerificationKeyCount: number;
    requireManifestSignature: boolean;
  };
  pressure: {
    workerSlotsUsed: number;
    eligibleOverCapacity: number;
    projectJobQuotaBreaches: number;
    projectByteQuotaBreaches: number;
    sloBreaches: number;
    storageReady: boolean;
    policyReady: boolean;
    encryptionReady: boolean;
  };
  policy: MediaPipelineStoragePolicyDiagnostics;
  encryption: MediaPipelineEncryptionPolicyDiagnostics;
  sourceReceipts: MediaPipelineSourceReceiptDiagnostics;
  restoreReceipts: MediaPipelineRestoreReceiptDiagnostics;
  receiptCatalogCheckpointResetReceipts:
    MediaPipelineReceiptCatalogCheckpointResetReceiptDiagnostics;
  receiptCatalogCheckpointResetReceiptPacketEscrow:
    MediaPipelineReceiptCatalogCheckpointResetReceiptPacketEscrowDiagnostics;
  receiptCatalogCheckpointResetReceiptPacketQuarantine:
    MediaPipelineReceiptCatalogCheckpointResetReceiptPacketQuarantineDiagnostics;
  providerCatalogConformancePacketEscrow: MediaPipelineProviderCatalogConformancePacketEscrowDiagnostics;
  providerCatalogConformancePacketQuarantineAttestations:
    MediaPipelineProviderCatalogConformancePacketQuarantineAttestationDiagnostics;
  lifecycle: MediaPipelineLifecycleDiagnostics;
  replay: MediaPipelineReplayDiagnostics;
}

export interface PublicMediaPipelineJob {
  id: string;
  assetId: string;
  versionId: string;
  status: MediaPipelineStatus;
  stage: MediaPipelineStage;
  progress: number;
  attempt: number;
  maxAttempts: number;
  retryAt: string | null;
  cancellationRequested: boolean;
  probe: MediaProbe | null;
  artifacts: MediaPipelineArtifacts | null;
  failure: Pick<MediaPipelineFailure, "code" | "message" | "retryable" | "at"> | null;
  events: MediaPipelineEvent[];
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export function toPublicMediaPipelineJob(job: MediaPipelineJob): PublicMediaPipelineJob {
  return {
    id: job.id,
    assetId: job.assetId,
    versionId: job.versionId,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    attempt: job.attempt,
    maxAttempts: job.maxAttempts,
    retryAt: job.retryAt,
    cancellationRequested: job.cancellationRequested,
    probe: job.probe,
    artifacts: job.artifacts,
    failure: job.failure,
    events: job.events,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    publishedAt: job.publishedAt,
  };
}
