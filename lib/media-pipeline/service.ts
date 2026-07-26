/* eslint-disable @typescript-eslint/ban-ts-comment */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, readdir, realpath, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, extname, join, relative, sep } from "node:path";

import type { MalwareScanHook, MalwareScanResult } from "../storage/malware";
import type { StorageReadiness } from "../storage/contracts";
import type { StorageRuntime } from "../storage/runtime";
// @ts-ignore TS5097: Node's native TypeScript test runner requires explicit extensions.
import { createMalwareScanHook } from "../storage/malware.ts";
// @ts-ignore TS5097: Node's native TypeScript test runner requires explicit extensions.
import { isStorageError } from "../storage/errors.ts";
// @ts-ignore TS5097: Node's native TypeScript test runner requires explicit extensions.
import { assertSafeRegularFile, resolveExistingRoot, resolvePathInsideRoot } from "../storage/path-safety.ts";
// @ts-ignore TS5097: Node's native TypeScript test runner requires explicit extensions.
import { createStorageRuntime } from "../storage/runtime.ts";
// @ts-ignore TS5097: Node's native TypeScript test runner requires explicit extensions.
import { readMediaPipelineConfig, retryDelayMs, type MediaPipelineConfig } from "./config.ts";
// @ts-ignore TS5097: Node's native TypeScript test runner requires explicit extensions.
import { decodeReceiptCatalogContinuationToken, issueReceiptCatalogContinuationToken } from "./cursor-token.ts";
// @ts-ignore TS5097: Node's native TypeScript test runner requires explicit extensions.
import { isMediaPipelineError, MediaPipelineError, publicPipelineErrorMessage } from "./errors.ts";
// @ts-ignore TS5097: Node's native TypeScript test runner requires explicit extensions.
import { LocalMediaProcessor, type MediaProcessor, type MediaProcessorCallbacks } from "./ffmpeg.ts";
// @ts-ignore TS5097: Node's native TypeScript test runner requires explicit extensions.
import { MediaPipelineJobStore, type MediaPipelineReplayManifestReference } from "./job-store.ts";
// @ts-ignore TS5097: Node's native TypeScript test runner requires explicit extensions.
import { ConsoleMediaPipelineMetricSink, emitMetric, jobMetricLabels, type MediaPipelineMetricSink } from "./observability.ts";
// @ts-ignore TS5097: Node's native TypeScript test runner requires explicit extensions.
import { assessMediaPipelineProviderCatalogConformance, type MediaPipelineProviderCatalogConformanceReport } from "./provider-catalog-conformance.ts";
// @ts-ignore TS5097: Node's native TypeScript test runner requires explicit extensions.
import { mediaPipelineReceiptCatalogCapability, type MediaPipelineReceiptCatalogObject } from "./receipt-catalog.ts";
// @ts-ignore TS5097: Node's native TypeScript test runner requires explicit extensions.
import { NoopMediaPipelineRepository, SupabaseMediaPipelineRepository, type MediaPipelineRepository } from "./repository.ts";
// @ts-ignore TS5097: Node's native TypeScript test runner requires explicit extensions.
import { checksumFile, collectSafeFiles, relativeArtifactName, uploadDerivative, uploadVersionedMediaArtifact, writePipelineJson } from "./storage.ts";
// @ts-ignore TS5097: Node's native TypeScript test runner requires explicit extensions.
import type {
  MediaPipelineArtifacts,
  MediaPipelineEncryptionPolicyDiagnostics,
  MediaPipelineEnqueueInput,
  MediaPipelineFailure,
  MediaPipelineJob,
  MediaPipelineLifecycleDiagnostics,
  MediaPipelineManifestIntegrityStatus,
  MediaPipelineProviderCatalogConformancePacketEscrowDiagnostics,
  MediaPipelineProviderCatalogConformancePacketQuarantineAttestationDiagnostics,
  MediaPipelineReplayDiagnostics,
  MediaPipelineReceiptCatalogCheckpointResetReceiptPacketEscrowDiagnostics,
  MediaPipelineReceiptCatalogCheckpointResetReceiptPacketQuarantineDiagnostics,
  MediaPipelineRestoreArtifactAttestation,
  MediaPipelineRestoreAttestation,
  MediaPipelineRestoreAttestationReceipt,
  MediaPipelineRestoreAttestationReceiptPublication,
  MediaPipelineRestoreAttestationStatus,
  MediaPipelineRestoreReceiptCatalogScanRoot,
  MediaPipelineRestoreReceiptDiagnostics,
  MediaPipelineRestoreReceiptRepairMode,
  MediaPipelineRestoreReceiptRepairResult,
  MediaPipelineScanReceipt,
  MediaPipelineSource,
  MediaPipelineSourceReceiptDiagnostics,
  MediaPipelineSourceReceipt,
  MediaPipelineStoragePolicyDiagnostics,
  MediaPipelineWorkerDiagnostics,
  StoredMediaArtifact,
} from "./types.ts";

export type MediaPipelineRunOutcome =
  | "published"
  | "retry_scheduled"
  | "failed"
  | "cancelled"
  | "quarantined"
  | "not_found"
  | "not_claimed"
  | "not_eligible"
  | "busy"
  | "already_terminal";

interface MediaPipelineProviderCatalogConformanceReceipt {
  schemaVersion: 1;
  type: "co_deliver_provider_catalog_conformance_receipt";
  receiptVersion: "v1";
  generatedAt: string;
  report: MediaPipelineProviderCatalogConformanceReport;
  evidence: {
    reportPayloadSha256: string;
    ready: boolean;
    provider: string;
    providerDigest: string;
    capabilityPresent: boolean;
    checkpointRequired: boolean;
    findingCount: number;
    listedObjects: number;
    validObjects: number;
    unsafeEntries: number;
    providerBackpressure: boolean;
    unavailable: boolean;
  };
  receiptIntegrity: {
    algorithm: "sha256" | "hmac-sha256";
    payloadSha256: string;
    signature: string | null;
    signingKeyDigest: string | null;
  };
}

interface MediaPipelineProviderCatalogConformanceReceiptPublication {
  generatedAt: string;
  persisted: boolean;
  reason: string | null;
  report: MediaPipelineProviderCatalogConformanceReport;
  receipt: {
    provider: string;
    providerDigest: string;
    reportPayloadSha256: string;
    receiptPayloadSha256: string;
    integrity: "sha256" | "hmac-sha256";
    signed: boolean;
  };
}

interface MediaPipelineProviderCatalogConformanceReceiptDiagnostics {
  generatedAt: string;
  records: number;
  invalidRecords: number;
  signedRecords: number;
  unsignedRecords: number;
  readyRecords: number;
  failedRecords: number;
  invalidIntegrityRecords: number;
  payloadMismatchRecords: number;
  latest: {
    recordedAt: string;
    provider: string;
    providerDigest: string;
    reportPayloadSha256: string;
    ready: boolean;
    receiptPayloadSha256: string;
    integrity: "sha256" | "hmac-sha256";
    signed: boolean;
    integrityStatus: MediaPipelineManifestIntegrityStatus;
  } | null;
}

type MediaPipelineProviderCatalogConformanceReceiptLifecycleMode = "dry_run" | "apply";

interface MediaPipelineProviderCatalogConformanceReceiptLifecycleResult {
  generatedAt: string;
  mode: MediaPipelineProviderCatalogConformanceReceiptLifecycleMode;
  policy: {
    maxRecords: number;
    retentionMs: number;
    legalHold: boolean;
    preserveLatest: true;
  };
  totalRecords: number;
  invalidRecords: number;
  signedRecords: number;
  readyRecords: number;
  failedRecords: number;
  retainedRecords: number;
  eligibleRecords: number;
  deletedRecords: number;
  blockedByLegalHold: number;
  oldestRetainedAgeMs: number | null;
  oldestEligibleAgeMs: number | null;
  latest: {
    recordedAt: string;
    provider: string;
    providerDigest: string;
    receiptPayloadSha256: string;
    ready: boolean;
    signed: boolean;
  } | null;
  dryRun: boolean;
  applied: boolean;
}

interface MediaPipelineReceiptCatalogCheckpointResetResult {
  generatedAt: string;
  mode: "dry_run" | "apply";
  checkpointRecords: number;
  invalidRecords: number;
  staleRecords: number;
  resetCandidates: number;
  unsafeEntries: number;
  deletedCheckpoints: number;
  dryRun: boolean;
  applied: boolean;
  policy: {
    checkpointDirectoryOnly: boolean;
    preservesReceiptObjects: boolean;
    rawCursorsRedacted: boolean;
  };
  receipt: {
    recorded: boolean;
    resetSnapshotDigest: string | null;
    receiptPayloadSha256: string | null;
    integrity: "sha256" | "hmac-sha256" | null;
    signed: boolean;
  };
}

interface MediaPipelineReceiptCatalogCheckpointResetReceipt {
  schemaVersion: 1;
  type: "co_deliver_receipt_catalog_checkpoint_reset_receipt";
  receiptVersion: "v1";
  generatedAt: string;
  provider: string;
  mode: "apply";
  reset: {
    checkpointRecords: number;
    invalidRecords: number;
    staleRecords: number;
    resetCandidates: number;
    unsafeEntries: number;
    deletedCheckpoints: number;
    applied: boolean;
  };
  evidence: {
    resetSnapshotDigest: string;
    receiptObjectsPreserved: boolean;
    rawIdentifiersRedacted: boolean;
  };
  policy: {
    checkpointDirectoryOnly: boolean;
    preservesReceiptObjects: boolean;
    rawCursorsRedacted: boolean;
  };
  receiptIntegrity: {
    algorithm: "sha256" | "hmac-sha256";
    payloadSha256: string;
    signature: string | null;
    signingKeyDigest: string | null;
  };
}

interface MediaPipelineReceiptCatalogCheckpointResetReceiptDiagnostics {
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

interface MediaPipelineReceiptCatalogCheckpointResetReceiptLifecycleResult {
  generatedAt: string;
  mode: "dry_run" | "apply";
  policy: {
    maxRecords: number;
    retentionMs: number;
    legalHold: boolean;
    preserveLatest: boolean;
  };
  totalReceipts: number;
  invalidRecords: number;
  signedReceipts: number;
  unsignedReceipts: number;
  retainedReceipts: number;
  eligibleReceipts: number;
  deletedReceipts: number;
  blockedByLegalHold: number;
  oldestRetainedAgeMs: number | null;
  oldestEligibleReceiptAgeMs: number | null;
  latest: {
    recordedAt: string;
    resetSnapshotDigest: string;
    deletedCheckpoints: number;
    signed: boolean;
  } | null;
  dryRun: boolean;
  applied: boolean;
}

interface MediaPipelineReceiptCatalogCheckpointResetReceiptPacketRecord {
  recordedAt: string;
  mode: "apply";
  resetSnapshotDigest: string;
  checkpointRecords: number;
  invalidRecords: number;
  staleRecords: number;
  resetCandidates: number;
  unsafeEntries: number;
  deletedCheckpoints: number;
  applied: boolean;
  receiptPayloadSha256: string;
  receiptIntegrity: "sha256" | "hmac-sha256";
  receiptSigned: boolean;
  receiptGeneratedAt: string;
  receipt: Record<string, unknown>;
}

interface MediaPipelineReceiptCatalogCheckpointResetReceiptPacket {
  schemaVersion: 1;
  type: "co_deliver_receipt_catalog_checkpoint_reset_receipt_packet";
  packetVersion: "v1";
  generatedAt: string;
  source: {
    recordCount: number;
    invalidRecords: number;
    signedReceipts: number;
    appliedReceipts: number;
  };
  records: MediaPipelineReceiptCatalogCheckpointResetReceiptPacketRecord[];
  packetIntegrity: {
    algorithm: "sha256" | "hmac-sha256";
    payloadSha256: string;
    signature: string | null;
    signingKeyDigest: string | null;
  };
}

interface MediaPipelineReceiptCatalogCheckpointResetReceiptPacketExportResult {
  generatedAt: string;
  packet: MediaPipelineReceiptCatalogCheckpointResetReceiptPacket;
  packetDigest: string;
  recordsExported: number;
  invalidRecords: number;
  signedReceipts: number;
  appliedReceipts: number;
}

interface MediaPipelineReceiptCatalogCheckpointResetReceiptPacketImportResult {
  generatedAt: string;
  mode: "dry_run" | "apply";
  packetDigest: string | null;
  packetIntegrity: MediaPipelineManifestIntegrityStatus;
  recordsReceived: number;
  eligibleRecords: number;
  importedRecords: number;
  duplicateRecords: number;
  invalidReceiptIntegrityRecords: number;
  invalidPayloadRecords: number;
  applied: boolean;
  dryRun: boolean;
}

interface MediaPipelineReceiptCatalogCheckpointResetReceiptPacketEscrowResult {
  generatedAt: string;
  escrowed: boolean;
  packetDigest: string;
  recordsExported: number;
  packetIntegrity: "sha256" | "hmac-sha256";
  signed: boolean;
}

interface MediaPipelineReceiptCatalogCheckpointResetReceiptPacketEscrowInventoryResult {
  generatedAt: string;
  packets: number;
  invalidRecords: number;
  duplicatePacketDigests: number;
  signedPackets: number;
  unsignedPackets: number;
  invalidIntegrityPackets: number;
  payloadMismatchPackets: number;
  latest: {
    recordedAt: string;
    packetDigest: string;
    packetGeneratedAt: string;
    recordCount: number;
    signed: boolean;
    integrityStatus: MediaPipelineManifestIntegrityStatus;
  } | null;
}

interface MediaPipelineReceiptCatalogCheckpointResetReceiptPacketRecoveryResult {
  generatedAt: string;
  mode: "dry_run" | "apply";
  packetsScanned: number;
  validPackets: number;
  invalidPackets: number;
  recordsReceived: number;
  eligibleRecords: number;
  recoveredRecords: number;
  duplicateRecords: number;
  invalidReceiptIntegrityRecords: number;
  invalidPayloadRecords: number;
  applied: boolean;
  dryRun: boolean;
}

interface MediaPipelineReceiptCatalogCheckpointResetReceiptPacketEscrowLifecycleResult {
  generatedAt: string;
  mode: "dry_run" | "apply";
  policy: {
    maxRecords: number;
    retentionMs: number;
    legalHold: boolean;
    preserveLatest: boolean;
  };
  totalPackets: number;
  invalidRecords: number;
  duplicatePacketDigests: number;
  signedPackets: number;
  unsignedPackets: number;
  retainedPackets: number;
  eligiblePackets: number;
  deletedPackets: number;
  blockedByLegalHold: number;
  oldestRetainedAgeMs: number | null;
  oldestEligibleAgeMs: number | null;
  latest: {
    recordedAt: string;
    packetDigest: string;
    packetGeneratedAt: string;
    recordCount: number;
    signed: boolean;
  } | null;
  dryRun: boolean;
  applied: boolean;
}

interface MediaPipelineReceiptCatalogCheckpointResetReceiptPacketEscrowQuarantineResult {
  generatedAt: string;
  mode: "dry_run" | "apply";
  scannedPackets: number;
  invalidRecords: number;
  invalidIntegrityPackets: number;
  payloadMismatchPackets: number;
  quarantineCandidates: number;
  quarantinedPackets: number;
  retainedPackets: number;
  dryRun: boolean;
  applied: boolean;
  policy: {
    manualReviewRequired: boolean;
    preservesQuarantinedEvidence: boolean;
  };
}

interface MediaPipelineReceiptCatalogCheckpointResetReceiptPacketQuarantineInventoryResult {
  generatedAt: string;
  quarantinedPackets: number;
  invalidRecords: number;
  malformedRecordQuarantines: number;
  invalidIntegrityQuarantines: number;
  payloadMismatchQuarantines: number;
  unknownReasonQuarantines: number;
  oldestQuarantineAgeMs: number | null;
  latest: {
    quarantinedAt: string;
    reason: "malformed_record" | "invalid_integrity" | "payload_mismatch" | "unknown";
  } | null;
}

interface MediaPipelineReceiptCatalogCheckpointResetReceiptPacketQuarantineLifecycleResult {
  generatedAt: string;
  mode: "dry_run" | "apply";
  policy: {
    maxRecords: number;
    retentionMs: number;
    legalHold: boolean;
    preserveLatest: boolean;
    manualReviewRequired: boolean;
  };
  totalQuarantinedPackets: number;
  invalidRecords: number;
  retainedPackets: number;
  eligiblePackets: number;
  deletedPackets: number;
  blockedByLegalHold: number;
  oldestRetainedAgeMs: number | null;
  oldestEligibleAgeMs: number | null;
  latest: {
    quarantinedAt: string;
    reason: "malformed_record" | "invalid_integrity" | "payload_mismatch" | "unknown";
  } | null;
  dryRun: boolean;
  applied: boolean;
}

interface MediaPipelineProviderCatalogConformanceReceiptPacketRecord {
  recordedAt: string;
  provider: string;
  providerDigest: string;
  reportPayloadSha256: string;
  ready: boolean;
  capabilityPresent: boolean;
  checkpointRequired: boolean;
  findingCount: number;
  receiptPayloadSha256: string;
  receiptIntegrity: "sha256" | "hmac-sha256";
  receiptSigned: boolean;
  receiptGeneratedAt: string;
  receipt: Record<string, unknown>;
}

interface MediaPipelineProviderCatalogConformanceReceiptPacket {
  schemaVersion: 1;
  type: "co_deliver_provider_catalog_conformance_receipt_packet";
  packetVersion: "v1";
  generatedAt: string;
  source: {
    providerCount: number;
    recordCount: number;
    invalidRecords: number;
    signedRecords: number;
    readyRecords: number;
    failedRecords: number;
  };
  records: MediaPipelineProviderCatalogConformanceReceiptPacketRecord[];
  packetIntegrity: {
    algorithm: "sha256" | "hmac-sha256";
    payloadSha256: string;
    signature: string | null;
    signingKeyDigest: string | null;
  };
}

interface MediaPipelineProviderCatalogConformanceReceiptPacketExportResult {
  generatedAt: string;
  packet: MediaPipelineProviderCatalogConformanceReceiptPacket;
  packetDigest: string;
  recordsExported: number;
  invalidRecords: number;
  signedRecords: number;
  readyRecords: number;
  failedRecords: number;
}

interface MediaPipelineProviderCatalogConformanceReceiptPacketImportResult {
  generatedAt: string;
  mode: "dry_run" | "apply";
  packetDigest: string | null;
  packetIntegrity: MediaPipelineManifestIntegrityStatus;
  recordsReceived: number;
  eligibleRecords: number;
  importedRecords: number;
  duplicateRecords: number;
  invalidReceiptIntegrityRecords: number;
  invalidPayloadRecords: number;
  applied: boolean;
  dryRun: boolean;
}

interface MediaPipelineProviderCatalogConformancePacketEscrowResult {
  generatedAt: string;
  escrowed: boolean;
  packetDigest: string;
  recordsExported: number;
  packetIntegrity: "sha256" | "hmac-sha256";
  signed: boolean;
}

interface MediaPipelineProviderCatalogConformancePacketEscrowInventoryResult {
  generatedAt: string;
  packets: number;
  invalidRecords: number;
  duplicatePacketDigests: number;
  signedPackets: number;
  unsignedPackets: number;
  invalidIntegrityPackets: number;
  payloadMismatchPackets: number;
  latest: {
    recordedAt: string;
    packetDigest: string;
    packetGeneratedAt: string;
    providerCount: number;
    recordCount: number;
    signedRecords: number;
    readyRecords: number;
    failedRecords: number;
    packetIntegrity: "sha256" | "hmac-sha256";
    signed: boolean;
    integrityStatus: MediaPipelineManifestIntegrityStatus;
  } | null;
}

interface MediaPipelineProviderCatalogConformancePacketEscrowLifecycleResult {
  generatedAt: string;
  mode: "dry_run" | "apply";
  policy: {
    maxRecords: number;
    retentionMs: number;
    legalHold: boolean;
    preserveLatest: boolean;
  };
  totalPackets: number;
  invalidRecords: number;
  duplicatePacketDigests: number;
  signedPackets: number;
  unsignedPackets: number;
  retainedPackets: number;
  eligiblePackets: number;
  deletedPackets: number;
  blockedByLegalHold: number;
  oldestRetainedAgeMs: number | null;
  oldestEligibleAgeMs: number | null;
  latest: {
    recordedAt: string;
    packetDigest: string;
    packetGeneratedAt: string;
    recordCount: number;
    signed: boolean;
  } | null;
  dryRun: boolean;
  applied: boolean;
}

interface MediaPipelineProviderCatalogConformancePacketEscrowQuarantineResult {
  generatedAt: string;
  mode: "dry_run" | "apply";
  scannedPackets: number;
  invalidRecords: number;
  invalidIntegrityPackets: number;
  payloadMismatchPackets: number;
  quarantineCandidates: number;
  quarantinedPackets: number;
  retainedPackets: number;
  dryRun: boolean;
  applied: boolean;
  policy: {
    manualReviewRequired: boolean;
    preservesQuarantinedEvidence: boolean;
  };
}

interface MediaPipelineProviderCatalogConformancePacketQuarantineInventoryResult {
  generatedAt: string;
  quarantinedPackets: number;
  invalidRecords: number;
  malformedRecordQuarantines: number;
  invalidIntegrityQuarantines: number;
  payloadMismatchQuarantines: number;
  unknownReasonQuarantines: number;
  oldestQuarantineAgeMs: number | null;
  latest: {
    quarantinedAt: string;
    reason: "malformed_record" | "invalid_integrity" | "payload_mismatch" | "unknown";
  } | null;
}

interface MediaPipelineProviderCatalogConformancePacketQuarantineLifecycleResult {
  generatedAt: string;
  mode: "dry_run" | "apply";
  policy: {
    maxRecords: number;
    retentionMs: number;
    legalHold: boolean;
    preserveLatest: boolean;
    manualReviewRequired: boolean;
  };
  totalQuarantinedPackets: number;
  invalidRecords: number;
  retainedPackets: number;
  eligiblePackets: number;
  deletedPackets: number;
  blockedByLegalHold: number;
  oldestRetainedAgeMs: number | null;
  oldestEligibleAgeMs: number | null;
  dryRun: boolean;
  applied: boolean;
}

type MediaPipelineProviderCatalogConformancePacketQuarantineAttestationDecision =
  | "reviewed"
  | "retained"
  | "released";

interface MediaPipelineProviderCatalogConformancePacketQuarantineAttestation {
  schemaVersion: 1;
  type: "co_deliver_provider_catalog_packet_quarantine_attestation";
  attestationVersion: "v1";
  generatedAt: string;
  decision: MediaPipelineProviderCatalogConformancePacketQuarantineAttestationDecision;
  snapshot: {
    quarantinedPackets: number;
    malformedRecordQuarantines: number;
    invalidIntegrityQuarantines: number;
    payloadMismatchQuarantines: number;
    unknownReasonQuarantines: number;
    oldestQuarantineAgeMs: number | null;
    latestReason: "malformed_record" | "invalid_integrity" | "payload_mismatch" | "unknown" | null;
  };
  evidence: {
    quarantineSnapshotDigest: string;
    manualReviewRequired: boolean;
    rawIdentifiersRedacted: boolean;
  };
  attestationIntegrity: {
    algorithm: "sha256" | "hmac-sha256";
    payloadSha256: string;
    signature: string | null;
    signingKeyDigest: string | null;
  };
}

interface MediaPipelineProviderCatalogConformancePacketQuarantineAttestationResult {
  generatedAt: string;
  attested: boolean;
  decision: MediaPipelineProviderCatalogConformancePacketQuarantineAttestationDecision;
  quarantineSnapshotDigest: string;
  quarantinedPackets: number;
  malformedRecordQuarantines: number;
  invalidIntegrityQuarantines: number;
  payloadMismatchQuarantines: number;
  unknownReasonQuarantines: number;
  oldestQuarantineAgeMs: number | null;
  attestationPayloadSha256: string;
  attestationIntegrity: "sha256" | "hmac-sha256";
  signed: boolean;
}

interface MediaPipelineProviderCatalogConformancePacketQuarantineAttestationInventoryResult {
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
  signatureRequired: boolean;
  signatureVerificationEnabled: boolean;
  latest: {
    recordedAt: string;
    decision: MediaPipelineProviderCatalogConformancePacketQuarantineAttestationDecision;
    quarantineSnapshotDigest: string;
    quarantinedPackets: number;
    signed: boolean;
    integrityStatus: MediaPipelineManifestIntegrityStatus;
  } | null;
}

interface MediaPipelineProviderCatalogConformancePacketQuarantineAttestationLifecycleResult {
  generatedAt: string;
  mode: "dry_run" | "apply";
  policy: {
    maxRecords: number;
    retentionMs: number;
    legalHold: boolean;
    preserveLatest: boolean;
    manualReviewRequired: boolean;
  };
  totalAttestations: number;
  invalidRecords: number;
  retainedAttestations: number;
  eligibleAttestations: number;
  deletedAttestations: number;
  blockedByLegalHold: number;
  oldestRetainedAgeMs: number | null;
  oldestEligibleAgeMs: number | null;
  dryRun: boolean;
  applied: boolean;
}

interface MediaPipelineProviderCatalogConformancePacketEscrowRecoveryResult {
  generatedAt: string;
  mode: "dry_run" | "apply";
  packetsScanned: number;
  validPackets: number;
  invalidPackets: number;
  duplicatePacketDigests: number;
  recordsReceived: number;
  eligibleRecords: number;
  importedRecords: number;
  duplicateRecords: number;
  invalidReceiptIntegrityRecords: number;
  invalidPayloadRecords: number;
  applied: boolean;
  dryRun: boolean;
}

export interface MediaPipelineRunResult {
  outcome: MediaPipelineRunOutcome;
  job: MediaPipelineJob | null;
}

export interface MediaPipelineServiceDependencies {
  runtime: StorageRuntime;
  config: MediaPipelineConfig;
  store: MediaPipelineJobStore;
  processor?: MediaProcessor;
  scanner?: MalwareScanHook;
  repository?: MediaPipelineRepository;
  metrics?: MediaPipelineMetricSink;
  now?: () => Date;
}

interface PreparedSource {
  path: string;
  sha256: string;
  size: number;
}

interface RestoreReceiptCatalogEntry {
  objectKey: string;
  filename: string;
  raw: string;
  sha256: string;
  size: number;
  parsed: unknown;
}

interface RestoreReceiptCatalogDiscovery {
  supported: boolean;
  scanRoot: MediaPipelineRestoreReceiptCatalogScanRoot;
  scanLimit: number;
  scannedJsonFiles: number;
  scanTruncated: boolean;
  cursorSupported: boolean;
  pagesScanned: number;
  startedCursorDigest?: string | null;
  checkpointRequired: boolean;
  nextCursorDigest: string | null;
  continuationToken: string | null;
  continuationTokenDigest: string | null;
  continuationTokenKeyDigest: string | null;
  continuationTokenExpiresAt: string | null;
  invalidJsonFiles: number;
  unsafeEntries: number;
  receipts: RestoreReceiptCatalogEntry[];
}

const MIME_TYPES: Record<string, string> = {
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".mkv": "video/x-matroska",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".mxf": "application/mxf",
  ".wav": "audio/wav",
  ".webm": "video/webm",
};

function mediaMimeType(filename: string): string {
  return MIME_TYPES[extname(filename).toLowerCase()] ?? "application/octet-stream";
}

function isPathInside(root: string, candidate: string): boolean {
  const relation = relative(root, candidate);
  return Boolean(relation) && relation !== ".." && !relation.startsWith(".." + sep);
}

function isCatalogObjectKey(value: string): boolean {
  return (
    Boolean(value) &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    !value.includes("\0") &&
    value.split("/").every((part) => part && part !== "." && part !== "..")
  );
}

function nowIso(now: () => Date): string {
  return now().toISOString();
}

function clampProgress(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function pipelineConfigHash(config: MediaPipelineConfig, provider: string): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        provider,
        commandTimeoutMs: config.commandTimeoutMs,
        maxAttempts: config.maxAttempts,
        maxConcurrentJobs: config.maxConcurrentJobs,
        maxSourceBytes: config.maxSourceBytes,
        retryBaseMs: config.retryBaseMs,
        retryCapMs: config.retryCapMs,
        egressPolicy: config.egressPolicy,
        requiredStorageCapabilities: config.requiredStorageCapabilities,
        requiredResidency: config.requiredResidency,
        requireSourceReceipt: config.requireSourceReceipt,
        encryptionKeyVersionDigest: digestPolicyValue(config.encryptionKeyVersion),
        requiredEncryptionKeyVersionDigest: digestPolicyValue(config.requiredEncryptionKeyVersion),
        keyRotationDueAt: config.keyRotationDueAt,
        blockOnOverdueKeyRotation: config.blockOnOverdueKeyRotation,
        manifestSigningKeyDigest: digestPolicyValue(config.manifestSigningKey),
        manifestVerificationKeyDigests: config.manifestVerificationKeys
          .map((key) => digestPolicyValue(key))
          .sort(),
        requireManifestSignature: config.requireManifestSignature,
        ffmpegCommand: basename(config.ffmpegPath),
        ffprobeCommand: basename(config.ffprobePath),
      })
    )
    .digest("hex");
}

function digestPolicyValue(value: string | null): string | null {
  return value ? sha256Hex(value) : null;
}

function digestObjectKey(objectKey: string): string {
  return sha256Hex(objectKey);
}

function hmacSha256(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function equalHex(left: string, right: string): boolean {
  if (!/^[a-f0-9]+$/.test(left) || !/^[a-f0-9]+$/.test(right)) return false;
  const leftBytes = Buffer.from(left, "hex");
  const rightBytes = Buffer.from(right, "hex");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function isSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

function isRestoreAttestationStatusValue(
  value: unknown
): value is MediaPipelineRestoreAttestationStatus {
  return (
    value === "ready" ||
    value === "not_found" ||
    value === "not_published" ||
    value === "drift_detected"
  );
}

function isIsoOrNull(value: string | null): boolean {
  if (value === null) return true;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function isIsoString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function sourceReceiptEvidence(receipt: MediaPipelineSourceReceipt | null | undefined) {
  return receipt
    ? {
        provider: receipt.provider,
        objectKeyDigest: digestObjectKey(receipt.objectKey),
        size: receipt.size,
        sha256: receipt.sha256,
        providerVersionId: receipt.providerVersionId,
        committedAt: receipt.committedAt,
      }
    : null;
}

function signManifestPayload(payload: Record<string, unknown>, config: MediaPipelineConfig) {
  const canonicalPayload = canonicalJson(payload);
  const payloadSha256 = sha256Hex(canonicalPayload);
  return {
    ...payload,
    manifestIntegrity: {
      algorithm: config.manifestSigningKey ? "hmac-sha256" : "sha256",
      payloadSha256,
      signature: config.manifestSigningKey
        ? hmacSha256(canonicalPayload, config.manifestSigningKey)
        : null,
      signingKeyDigest: digestPolicyValue(config.manifestSigningKey),
    },
  };
}

function signRestoreAttestationReceiptPayload(
  payload: Omit<MediaPipelineRestoreAttestationReceipt, "receiptIntegrity">,
  config: MediaPipelineConfig
): MediaPipelineRestoreAttestationReceipt {
  const canonicalPayload = canonicalJson(payload);
  const payloadSha256 = sha256Hex(canonicalPayload);
  return {
    ...payload,
    receiptIntegrity: {
      algorithm: config.manifestSigningKey ? "hmac-sha256" : "sha256",
      payloadSha256,
      signature: config.manifestSigningKey
        ? hmacSha256(canonicalPayload, config.manifestSigningKey)
        : null,
      signingKeyDigest: digestPolicyValue(config.manifestSigningKey),
    },
  };
}

function signProviderCatalogConformanceReceiptPayload(
  payload: Omit<MediaPipelineProviderCatalogConformanceReceipt, "receiptIntegrity">,
  config: MediaPipelineConfig
): MediaPipelineProviderCatalogConformanceReceipt {
  const canonicalPayload = canonicalJson(payload);
  const payloadSha256 = sha256Hex(canonicalPayload);
  return {
    ...payload,
    receiptIntegrity: {
      algorithm: config.manifestSigningKey ? "hmac-sha256" : "sha256",
      payloadSha256,
      signature: config.manifestSigningKey
        ? hmacSha256(canonicalPayload, config.manifestSigningKey)
        : null,
      signingKeyDigest: digestPolicyValue(config.manifestSigningKey),
    },
  };
}

function signProviderCatalogConformanceReceiptPacket(
  payload: Omit<MediaPipelineProviderCatalogConformanceReceiptPacket, "packetIntegrity">,
  config: MediaPipelineConfig
): MediaPipelineProviderCatalogConformanceReceiptPacket {
  const canonicalPayload = canonicalJson(payload);
  const payloadSha256 = sha256Hex(canonicalPayload);
  return {
    ...payload,
    packetIntegrity: {
      algorithm: config.manifestSigningKey ? "hmac-sha256" : "sha256",
      payloadSha256,
      signature: config.manifestSigningKey
        ? hmacSha256(canonicalPayload, config.manifestSigningKey)
        : null,
      signingKeyDigest: digestPolicyValue(config.manifestSigningKey),
    },
  };
}

function signProviderCatalogConformancePacketQuarantineAttestation(
  payload: Omit<
    MediaPipelineProviderCatalogConformancePacketQuarantineAttestation,
    "attestationIntegrity"
  >,
  config: MediaPipelineConfig
): MediaPipelineProviderCatalogConformancePacketQuarantineAttestation {
  const canonicalPayload = canonicalJson(payload);
  const payloadSha256 = sha256Hex(canonicalPayload);
  return {
    ...payload,
    attestationIntegrity: {
      algorithm: config.manifestSigningKey ? "hmac-sha256" : "sha256",
      payloadSha256,
      signature: config.manifestSigningKey
        ? hmacSha256(canonicalPayload, config.manifestSigningKey)
        : null,
      signingKeyDigest: digestPolicyValue(config.manifestSigningKey),
    },
  };
}

function signReceiptCatalogCheckpointResetReceipt(
  payload: Omit<MediaPipelineReceiptCatalogCheckpointResetReceipt, "receiptIntegrity">,
  config: MediaPipelineConfig
): MediaPipelineReceiptCatalogCheckpointResetReceipt {
  const canonicalPayload = canonicalJson(payload);
  const payloadSha256 = sha256Hex(canonicalPayload);
  return {
    ...payload,
    receiptIntegrity: {
      algorithm: config.manifestSigningKey ? "hmac-sha256" : "sha256",
      payloadSha256,
      signature: config.manifestSigningKey
        ? hmacSha256(canonicalPayload, config.manifestSigningKey)
        : null,
      signingKeyDigest: digestPolicyValue(config.manifestSigningKey),
    },
  };
}

function signReceiptCatalogCheckpointResetReceiptPacket(
  payload: Omit<
    MediaPipelineReceiptCatalogCheckpointResetReceiptPacket,
    "packetIntegrity"
  >,
  config: MediaPipelineConfig
): MediaPipelineReceiptCatalogCheckpointResetReceiptPacket {
  const canonicalPayload = canonicalJson(payload);
  const payloadSha256 = sha256Hex(canonicalPayload);
  return {
    ...payload,
    packetIntegrity: {
      algorithm: config.manifestSigningKey ? "hmac-sha256" : "sha256",
      payloadSha256,
      signature: config.manifestSigningKey
        ? hmacSha256(canonicalPayload, config.manifestSigningKey)
        : null,
      signingKeyDigest: digestPolicyValue(config.manifestSigningKey),
    },
  };
}

function verifyManifestIntegrity(
  value: unknown,
  config: MediaPipelineConfig
): MediaPipelineManifestIntegrityStatus {
  const manifest = asRecord(value);
  if (!manifest) return "missing_integrity";
  const integrity = nestedRecord(manifest, "manifestIntegrity");
  if (!integrity) return "missing_integrity";
  const payloadSha256 = stringField(integrity, "payloadSha256");
  const signature = stringField(integrity, "signature");
  const signingKeyDigest = stringField(integrity, "signingKeyDigest");
  const payload = { ...manifest };
  delete payload.manifestIntegrity;
  if (!payloadSha256 || !equalHex(payloadSha256, sha256Hex(canonicalJson(payload)))) {
    return "payload_mismatch";
  }
  if (!signature) {
    return config.requireManifestSignature ? "missing_signature" : "valid_unsigned";
  }
  if (config.manifestVerificationKeys.length === 0) {
    return config.requireManifestSignature ? "invalid_signature" : "unverified_signature";
  }
  const keys = signingKeyDigest
    ? config.manifestVerificationKeys.filter(
        (key) => digestPolicyValue(key) === signingKeyDigest
      )
    : config.manifestVerificationKeys;
  if (keys.length === 0) return "invalid_signature";
  const canonicalPayload = canonicalJson(payload);
  return keys.some((key) => equalHex(signature, hmacSha256(canonicalPayload, key)))
    ? "valid_signed"
    : "invalid_signature";
}

function verifyReceiptIntegrity(
  value: unknown,
  config: MediaPipelineConfig
): MediaPipelineManifestIntegrityStatus {
  const receipt = asRecord(value);
  if (!receipt) return "missing_integrity";
  const integrity = nestedRecord(receipt, "receiptIntegrity");
  if (!integrity) return "missing_integrity";
  const payloadSha256 = stringField(integrity, "payloadSha256");
  const signature = stringField(integrity, "signature");
  const signingKeyDigest = stringField(integrity, "signingKeyDigest");
  const payload = { ...receipt };
  delete payload.receiptIntegrity;
  if (!payloadSha256 || !equalHex(payloadSha256, sha256Hex(canonicalJson(payload)))) {
    return "payload_mismatch";
  }
  if (!signature) {
    return config.requireManifestSignature ? "missing_signature" : "valid_unsigned";
  }
  if (config.manifestVerificationKeys.length === 0) {
    return config.requireManifestSignature ? "invalid_signature" : "unverified_signature";
  }
  const keys = signingKeyDigest
    ? config.manifestVerificationKeys.filter(
        (key) => digestPolicyValue(key) === signingKeyDigest
      )
    : config.manifestVerificationKeys;
  if (keys.length === 0) return "invalid_signature";
  const canonicalPayload = canonicalJson(payload);
  return keys.some((key) => equalHex(signature, hmacSha256(canonicalPayload, key)))
    ? "valid_signed"
    : "invalid_signature";
}

function verifyPacketIntegrity(
  value: unknown,
  config: MediaPipelineConfig
): MediaPipelineManifestIntegrityStatus {
  const packet = asRecord(value);
  if (!packet) return "missing_integrity";
  const integrity = nestedRecord(packet, "packetIntegrity");
  if (!integrity) return "missing_integrity";
  const payloadSha256 = stringField(integrity, "payloadSha256");
  const signature = stringField(integrity, "signature");
  const signingKeyDigest = stringField(integrity, "signingKeyDigest");
  const payload = { ...packet };
  delete payload.packetIntegrity;
  if (!payloadSha256 || !equalHex(payloadSha256, sha256Hex(canonicalJson(payload)))) {
    return "payload_mismatch";
  }
  if (!signature) {
    return config.requireManifestSignature ? "missing_signature" : "valid_unsigned";
  }
  if (config.manifestVerificationKeys.length === 0) {
    return config.requireManifestSignature ? "invalid_signature" : "unverified_signature";
  }
  const keys = signingKeyDigest
    ? config.manifestVerificationKeys.filter(
        (key) => digestPolicyValue(key) === signingKeyDigest
      )
    : config.manifestVerificationKeys;
  if (keys.length === 0) return "invalid_signature";
  const canonicalPayload = canonicalJson(payload);
  return keys.some((key) => equalHex(signature, hmacSha256(canonicalPayload, key)))
    ? "valid_signed"
    : "invalid_signature";
}

function verifyPacketQuarantineAttestationIntegrity(
  value: unknown,
  config: MediaPipelineConfig
): MediaPipelineManifestIntegrityStatus {
  const attestation = asRecord(value);
  if (!attestation) return "missing_integrity";
  const integrity = nestedRecord(attestation, "attestationIntegrity");
  if (!integrity) return "missing_integrity";
  const payloadSha256 = stringField(integrity, "payloadSha256");
  const signature = stringField(integrity, "signature");
  const signingKeyDigest = stringField(integrity, "signingKeyDigest");
  const payload = { ...attestation };
  delete payload.attestationIntegrity;
  if (!payloadSha256 || !equalHex(payloadSha256, sha256Hex(canonicalJson(payload)))) {
    return "payload_mismatch";
  }
  if (!signature) {
    return config.requireManifestSignature ? "missing_signature" : "valid_unsigned";
  }
  if (config.manifestVerificationKeys.length === 0) {
    return config.requireManifestSignature ? "invalid_signature" : "unverified_signature";
  }
  const keys = signingKeyDigest
    ? config.manifestVerificationKeys.filter(
        (key) => digestPolicyValue(key) === signingKeyDigest
      )
    : config.manifestVerificationKeys;
  if (keys.length === 0) return "invalid_signature";
  const canonicalPayload = canonicalJson(payload);
  return keys.some((key) => equalHex(signature, hmacSha256(canonicalPayload, key)))
    ? "valid_signed"
    : "invalid_signature";
}

function encryptionPolicyDiagnostics(
  config: MediaPipelineConfig,
  now: Date
): MediaPipelineEncryptionPolicyDiagnostics {
  const requiredKeyVersionSatisfied =
    !config.requiredEncryptionKeyVersion ||
    config.encryptionKeyVersion === config.requiredEncryptionKeyVersion;
  const rotationDueAt = config.keyRotationDueAt
    ? new Date(config.keyRotationDueAt)
    : null;
  const keyRotationOverdue = Boolean(rotationDueAt && rotationDueAt.getTime() <= now.getTime());
  return {
    keyVersionPresent: Boolean(config.encryptionKeyVersion),
    keyVersionDigest: digestPolicyValue(config.encryptionKeyVersion),
    requiredKeyVersionDigest: digestPolicyValue(config.requiredEncryptionKeyVersion),
    requiredKeyVersionSatisfied,
    keyRotationDueAt: config.keyRotationDueAt,
    keyRotationOverdue,
    blockOnOverdueKeyRotation: config.blockOnOverdueKeyRotation,
    ready:
      requiredKeyVersionSatisfied &&
      !(config.blockOnOverdueKeyRotation && keyRotationOverdue),
  };
}

function storagePolicyDiagnostics(
  config: MediaPipelineConfig,
  readiness: Pick<StorageReadiness, "external" | "capabilities">
): MediaPipelineStoragePolicyDiagnostics {
  const capabilities = new Set(readiness.capabilities);
  const missingCapabilities = config.requiredStorageCapabilities.filter(
    (capability) => !capabilities.has(capability)
  );
  const externalEgressAllowed =
    config.egressPolicy === "allow-external" || !readiness.external;
  const residencyVerification = config.requiredResidency ? "unverified" : "not-required";
  return {
    egressPolicy: config.egressPolicy,
    externalProvider: readiness.external,
    externalEgressAllowed,
    requiredCapabilities: [...config.requiredStorageCapabilities],
    missingCapabilities,
    requiredResidency: config.requiredResidency,
    residencyVerification,
    ready: externalEgressAllowed && missingCapabilities.length === 0,
  };
}

function sumLifecycleBytes(
  references: Awaited<ReturnType<MediaPipelineJobStore["lifecycleInventory"]>>["references"],
  category: "published" | "recoverable_unpublished" | "terminal_orphan_candidate"
): number {
  return references
    .filter((reference) => reference.category === category)
    .reduce((total, reference) => total + reference.size, 0);
}

function derivativeArtifacts(artifacts: MediaPipelineArtifacts): StoredMediaArtifact[] {
  return [
    artifacts.hls.playlist,
    artifacts.hls.manifest,
    ...artifacts.hls.segments,
    ...(artifacts.thumbnail ? [artifacts.thumbnail] : []),
    artifacts.waveform,
    artifacts.captions.content,
    artifacts.captions.manifest,
  ];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nestedRecord(record: Record<string, unknown>, key: string): Record<string, unknown> | null {
  return asRecord(record[key]);
}

function stringField(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" ? value : null;
}

function numberField(record: Record<string, unknown> | null, key: string): number | null {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function manifestArtifactMatches(
  record: Record<string, unknown> | null,
  expected: { objectKey: string; sha256: string } | null
): boolean {
  if (!expected) return record === null;
  return (
    stringField(record, "objectKey") === expected.objectKey &&
    stringField(record, "sha256") === expected.sha256
  );
}

function replayManifestMatches(
  reference: MediaPipelineReplayManifestReference,
  value: unknown
): boolean {
  const manifest = asRecord(value);
  if (!manifest || !reference.artifacts) return false;
  const source = nestedRecord(manifest, "source");
  const artifacts = nestedRecord(manifest, "artifacts");
  const hls = nestedRecord(artifacts ?? {}, "hls");
  const captions = nestedRecord(artifacts ?? {}, "captions");
  const segments = hls?.segments;
  const expectedSegments = reference.artifacts.hls.segments;

  if (
    stringField(manifest, "type") !== "co_deliver_media_pipeline_manifest" ||
    stringField(manifest, "versionId") !== reference.versionId ||
    numberField(manifest, "versionNumber") !== reference.versionNumber ||
    stringField(manifest, "storageProvider") !== reference.storageProvider ||
    !/^[a-f0-9]{64}$/.test(stringField(manifest, "pipelineConfigHash") ?? "") ||
    stringField(source, "sha256") !== reference.sourceSha256 ||
    numberField(source, "size") !== reference.sourceSize
  ) {
    return false;
  }

  if (
    !manifestArtifactMatches(nestedRecord(hls ?? {}, "playlist"), reference.artifacts.hls.playlist) ||
    !manifestArtifactMatches(nestedRecord(hls ?? {}, "manifest"), reference.artifacts.hls.manifest) ||
    !Array.isArray(segments) ||
    segments.length !== expectedSegments.length
  ) {
    return false;
  }
  for (let index = 0; index < expectedSegments.length; index += 1) {
    if (!manifestArtifactMatches(asRecord(segments[index]), expectedSegments[index] ?? null)) {
      return false;
    }
  }

  return (
    manifestArtifactMatches(
      nestedRecord(artifacts ?? {}, "thumbnail"),
      reference.artifacts.thumbnail
    ) &&
    manifestArtifactMatches(
      nestedRecord(artifacts ?? {}, "waveform"),
      reference.artifacts.waveform
    ) &&
    manifestArtifactMatches(
      nestedRecord(captions ?? {}, "content"),
      reference.artifacts.captions.content
    ) &&
    manifestArtifactMatches(
      nestedRecord(captions ?? {}, "manifest"),
      reference.artifacts.captions.manifest
    ) &&
    stringField(captions, "status") === reference.artifacts.captions.status
  );
}

function scanReceipt(
  result: MalwareScanResult,
  source: PreparedSource,
  provider: string
): MediaPipelineScanReceipt {
  return {
    verdict: result.verdict,
    engine: result.engine,
    signature: result.signature,
    detail: result.detail,
    scannedAt: result.scannedAt,
    subjectSha256: source.sha256,
    provider,
  };
}

export class MediaPipelineService {
  private readonly runtime: StorageRuntime;
  private readonly config: MediaPipelineConfig;
  private readonly store: MediaPipelineJobStore;
  private readonly processor: MediaProcessor;
  private readonly scanner: MalwareScanHook;
  private readonly repository: MediaPipelineRepository;
  private readonly metrics: MediaPipelineMetricSink;
  private readonly now: () => Date;

  constructor(dependencies: MediaPipelineServiceDependencies) {
    this.runtime = dependencies.runtime;
    this.config = dependencies.config;
    this.store = dependencies.store;
    this.processor =
      dependencies.processor ??
      new LocalMediaProcessor({
        ffmpegPath: dependencies.config.ffmpegPath,
        ffprobePath: dependencies.config.ffprobePath,
        timeoutMs: dependencies.config.commandTimeoutMs,
      });
    this.scanner = dependencies.scanner ?? createMalwareScanHook(dependencies.runtime.config.malwarePolicy);
    this.repository = dependencies.repository ?? new NoopMediaPipelineRepository();
    this.metrics = dependencies.metrics ?? new ConsoleMediaPipelineMetricSink();
    this.now = dependencies.now ?? (() => new Date());
  }

  private async emit(
    job: MediaPipelineJob,
    name:
      | "media_pipeline_jobs_total"
      | "media_pipeline_stage_duration_ms"
      | "media_pipeline_bytes_total"
      | "media_pipeline_failures_total"
      | "media_pipeline_queue_depth",
    value: number,
    extra: Record<string, string> = {}
  ): Promise<void> {
    await emitMetric(this.metrics, {
      name,
      value,
      labels: { ...jobMetricLabels(job, this.runtime.adapter.kind), ...extra },
    });
  }

  private async requireStorageReady(): Promise<void> {
    const readiness = await this.runtime.adapter.diagnose();
    if (!readiness.readyForWrites || !this.runtime.config.filesystemRoot) {
      throw new MediaPipelineError(
        "PIPELINE_STORAGE_NOT_READY",
        "Configured storage is not ready for media pipeline writes",
        true
      );
    }
    const policy = storagePolicyDiagnostics(this.config, readiness);
    if (!policy.ready) {
      throw new MediaPipelineError(
        "PIPELINE_STORAGE_POLICY_BLOCKED",
        "Configured storage does not satisfy media pipeline placement policy",
        true
      );
    }
    const encryption = encryptionPolicyDiagnostics(this.config, this.now());
    if (!encryption.ready) {
      throw new MediaPipelineError(
        "PIPELINE_ENCRYPTION_POLICY_BLOCKED",
        "Configured storage does not satisfy media pipeline encryption policy",
        true
      );
    }
  }

  private requireValidSourceReceipt(source: MediaPipelineSource): MediaPipelineSourceReceipt | null {
    const receipt = source.receipt ?? null;
    if (!receipt) {
      if (this.config.requireSourceReceipt) {
        throw new MediaPipelineError(
          "PIPELINE_SOURCE_RECEIPT_REQUIRED",
          "Pipeline source is missing an authoritative storage receipt"
        );
      }
      return null;
    }
    if (
      receipt.provider !== this.runtime.adapter.kind ||
      receipt.objectKey !== source.objectKey ||
      !Number.isSafeInteger(receipt.size) ||
      receipt.size < 0 ||
      !isSha256(receipt.sha256) ||
      (receipt.providerVersionId !== null && typeof receipt.providerVersionId !== "string") ||
      !isIsoOrNull(receipt.committedAt)
    ) {
      throw new MediaPipelineError("PIPELINE_SOURCE_INVALID", "Pipeline source receipt is invalid");
    }
    if (source.expectedSize !== null && source.expectedSize !== receipt.size) {
      throw new MediaPipelineError(
        "PIPELINE_SOURCE_CHANGED",
        "Version source size does not match its storage receipt"
      );
    }
    if (source.expectedSha256 !== null && source.expectedSha256 !== receipt.sha256) {
      throw new MediaPipelineError(
        "PIPELINE_SOURCE_CHANGED",
        "Version source checksum does not match its storage receipt"
      );
    }
    return receipt;
  }

  async enqueue(input: MediaPipelineEnqueueInput): Promise<MediaPipelineJob> {
    await this.requireStorageReady();
    this.requireValidSourceReceipt(input.source);
    const job = await this.store.createOrGet(input, this.config.maxAttempts, {
      maxActiveJobsPerProject: this.config.maxActiveJobsPerProject,
      maxActiveBytesPerProject: this.config.maxActiveBytesPerProject,
    });
    const initialEnqueue =
      job.status === "queued" &&
      job.attempt === 0 &&
      job.failure === null &&
      job.events.length === 1 &&
      job.events[0]?.type === "enqueued";
    if (initialEnqueue) {
      await this.emit(job, "media_pipeline_jobs_total", 1, { event: "enqueued" });
      await this.repository.recordQueued(job).catch(async () => {
        await this.emit(job, "media_pipeline_failures_total", 1, {
          code: "queue_projection",
          event: "repository_error",
        });
      });
    }
    return job;
  }

  async get(jobId: string): Promise<MediaPipelineJob | null> {
    return this.store.get(jobId);
  }

  async restoreAttestation(versionId: string): Promise<MediaPipelineRestoreAttestation> {
    const generatedAt = nowIso(this.now);
    const base = {
      generatedAt,
      versionIdDigest: sha256Hex(versionId),
      versionNumber: null,
      storageProvider: null,
      manifest: {
        objectKeyDigest: null,
        size: null,
        sha256: null,
        present: false,
        checksumVerified: false,
        integrity: null,
        semanticMatch: false,
        signed: false,
      },
      derivatives: {
        totalReferences: 0,
        inspectedReferences: 0,
        missingReferences: 0,
        checksumMismatchReferences: 0,
        totalBytes: "0",
        references: [],
      },
      limits: {
        maxManifestBytes: this.config.maxReplayManifestBytes,
        manifestSigningRequired: this.config.requireManifestSignature,
        manifestVerificationKeyCount: this.config.manifestVerificationKeys.length,
      },
    } satisfies Omit<MediaPipelineRestoreAttestation, "status" | "ready" | "failureCodes">;
    const inventory = await this.store.replayManifestInventory();
    const candidates = inventory.references.filter((reference) => reference.versionId === versionId);
    if (candidates.length === 0) {
      return {
        ...base,
        status: "not_found",
        ready: false,
        failureCodes: ["PIPELINE_RESTORE_VERSION_NOT_FOUND"],
      };
    }

    const published = candidates.filter((reference) => reference.category === "published");
    const reference = published[0] ?? candidates[0];
    if (!reference || reference.category !== "published") {
      return {
        ...base,
        status: "not_published",
        ready: false,
        versionNumber: reference?.versionNumber ?? null,
        storageProvider: reference?.storageProvider ?? null,
        failureCodes: ["PIPELINE_RESTORE_VERSION_NOT_PUBLISHED"],
      };
    }

    const failureCodes = new Set<string>();
    if (candidates.length > 1 || published.length !== 1) {
      failureCodes.add("PIPELINE_RESTORE_VERSION_AMBIGUOUS");
    }

    let manifestPresent = false;
    let manifestChecksumVerified = false;
    let manifestIntegrity: MediaPipelineManifestIntegrityStatus | null = null;
    let manifestSemanticMatch = false;
    const manifestInspection = await this.runtime.adapter.inspectStoredObject(reference.manifest.objectKey);
    if (!manifestInspection) {
      failureCodes.add("PIPELINE_RESTORE_MANIFEST_MISSING");
    } else {
      manifestPresent = true;
      if (
        manifestInspection.size !== reference.manifest.size ||
        manifestInspection.sha256 !== reference.manifest.sha256
      ) {
        failureCodes.add("PIPELINE_RESTORE_MANIFEST_CHECKSUM_MISMATCH");
      } else if (manifestInspection.size > this.config.maxReplayManifestBytes) {
        failureCodes.add("PIPELINE_RESTORE_MANIFEST_OVERSIZE");
      } else {
        manifestChecksumVerified = true;
        let parsed: unknown;
        try {
          const raw = await this.readStoredText(
            reference.manifest.objectKey,
            this.config.maxReplayManifestBytes
          );
          if (raw === "oversize") {
            failureCodes.add("PIPELINE_RESTORE_MANIFEST_OVERSIZE");
          } else {
            parsed = JSON.parse(raw);
          }
        } catch {
          failureCodes.add("PIPELINE_RESTORE_MANIFEST_UNREADABLE");
        }
        if (parsed !== undefined) {
          manifestIntegrity = verifyManifestIntegrity(parsed, this.config);
          manifestSemanticMatch = replayManifestMatches(reference, parsed);
          if (manifestIntegrity !== "valid_signed" && manifestIntegrity !== "valid_unsigned") {
            failureCodes.add("PIPELINE_RESTORE_MANIFEST_INTEGRITY_DRIFT");
          }
          if (!manifestSemanticMatch) {
            failureCodes.add("PIPELINE_RESTORE_MANIFEST_SEMANTIC_DRIFT");
          }
        }
      }
    }

    const artifacts = reference.artifacts ? derivativeArtifacts(reference.artifacts) : [];
    if (!reference.artifacts) failureCodes.add("PIPELINE_RESTORE_DERIVATIVE_GRAPH_MISSING");
    let missingReferences = 0;
    let checksumMismatchReferences = 0;
    const artifactEvidence: MediaPipelineRestoreArtifactAttestation[] = [];
    for (const artifact of artifacts) {
      const inspection = await this.runtime.adapter.inspectStoredObject(artifact.objectKey);
      const present = Boolean(inspection);
      const checksumVerified = Boolean(
        inspection && inspection.size === artifact.size && inspection.sha256 === artifact.sha256
      );
      if (!present) {
        missingReferences += 1;
        failureCodes.add("PIPELINE_RESTORE_DERIVATIVE_MISSING");
      } else if (!checksumVerified) {
        checksumMismatchReferences += 1;
        failureCodes.add("PIPELINE_RESTORE_DERIVATIVE_CHECKSUM_MISMATCH");
      }
      artifactEvidence.push({
        kind: artifact.kind,
        objectKeyDigest: digestObjectKey(artifact.objectKey),
        provider: artifact.provider,
        size: artifact.size,
        sha256: artifact.sha256,
        providerVersionIdDigest: digestPolicyValue(artifact.providerVersionId),
        present,
        checksumVerified,
      });
    }

    const ready = failureCodes.size === 0;
    return {
      ...base,
      status: ready ? "ready" : "drift_detected",
      ready,
      versionNumber: reference.versionNumber,
      storageProvider: reference.storageProvider,
      failureCodes: [...failureCodes].sort(),
      manifest: {
        objectKeyDigest: digestObjectKey(reference.manifest.objectKey),
        size: reference.manifest.size,
        sha256: reference.manifest.sha256,
        present: manifestPresent,
        checksumVerified: manifestChecksumVerified,
        integrity: manifestIntegrity,
        semanticMatch: manifestSemanticMatch,
        signed: manifestIntegrity === "valid_signed",
      },
      derivatives: {
        totalReferences: artifacts.length,
        inspectedReferences: artifacts.length,
        missingReferences,
        checksumMismatchReferences,
        totalBytes: String(artifacts.reduce((total, artifact) => total + artifact.size, 0)),
        references: artifactEvidence,
      },
    };
  }

  async persistRestoreAttestationReceipt(
    versionId: string
  ): Promise<MediaPipelineRestoreAttestationReceiptPublication> {
    const generatedAt = nowIso(this.now);
    const attestation = await this.restoreAttestation(versionId);
    const emptyReceipt: MediaPipelineRestoreAttestationReceiptPublication["receipt"] = {
      objectKeyDigest: null,
      provider: null,
      size: null,
      sha256: null,
      providerVersionIdDigest: null,
      integrity: null,
      signed: false,
    };
    if (attestation.status === "not_found" || attestation.status === "not_published") {
      return {
        generatedAt,
        persisted: false,
        reason: attestation.failureCodes[0] ?? "PIPELINE_RESTORE_RECEIPT_NOT_PERSISTED",
        attestation,
        receipt: emptyReceipt,
      };
    }

    await this.requireStorageReady();
    const inventory = await this.store.replayManifestInventory();
    const published = inventory.references.filter(
      (reference) =>
        reference.versionId === versionId &&
        reference.category === "published"
    );
    const reference = published.length === 1 ? published[0] : null;
    if (!reference) {
      return {
        generatedAt,
        persisted: false,
        reason: "PIPELINE_RESTORE_RECEIPT_REFERENCE_UNAVAILABLE",
        attestation,
        receipt: emptyReceipt,
      };
    }

    const attestationPayloadSha256 = sha256Hex(canonicalJson(attestation));
    const receiptPayload = signRestoreAttestationReceiptPayload(
      {
        schemaVersion: 1,
        type: "co_deliver_restore_attestation_receipt",
        receiptVersion: "v1",
        generatedAt,
        attestation,
        evidence: {
          attestationPayloadSha256,
          ready: attestation.ready,
          status: attestation.status,
          failureCodes: attestation.failureCodes,
        },
      },
      this.config
    );
    const receiptDigest = receiptPayload.receiptIntegrity.payloadSha256;
    const workspace = await this.store.workspace(reference.jobId, reference.attempt);
    const filename = "restore-attestation-" + receiptDigest.slice(0, 16) + ".json";
    const receiptPath = join(workspace, filename);
    await writePipelineJson(receiptPath, receiptPayload);
    const stored = await uploadVersionedMediaArtifact(this.runtime.adapter, {
      tenantScope: reference.tenantScope,
      projectId: reference.projectId,
      versionId,
      jobId: reference.jobId,
      versionNumber: reference.versionNumber,
      path: receiptPath,
      kind: "restore_attestation",
      filename,
      generation: reference.versionNumber,
      suffix: "restore-attestation-" + receiptDigest.slice(0, 20),
    });
    await this.store.recordRestoreAttestationReceipt({
      versionId,
      versionNumber: reference.versionNumber,
      receipt: stored.artifact,
      attestationPayloadSha256,
      attestationStatus: attestation.status,
      attestationReady: attestation.ready,
      receiptGeneratedAt: generatedAt,
    });

    return {
      generatedAt,
      persisted: true,
      reason: null,
      attestation,
      receipt: {
        objectKeyDigest: digestObjectKey(stored.artifact.objectKey),
        provider: stored.artifact.provider,
        size: stored.artifact.size,
        sha256: stored.artifact.sha256,
        providerVersionIdDigest: digestPolicyValue(stored.artifact.providerVersionId),
        integrity: receiptPayload.receiptIntegrity.algorithm,
        signed: Boolean(receiptPayload.receiptIntegrity.signature),
      },
    };
  }

  async repairRestoreReceiptIndex(
    mode: MediaPipelineRestoreReceiptRepairMode,
    options: { continuationToken?: string | null } = {}
  ): Promise<MediaPipelineRestoreReceiptRepairResult> {
    const generatedAt = nowIso(this.now);
    const scanLimit = this.config.maxLifecycleInspectionArtifacts;
    const discovery = await this.discoverRestoreReceiptCatalog(
      scanLimit,
      options.continuationToken ?? null
    );
    const indexed = await this.store.restoreReceiptInventory();
    const indexedReceiptSha256 = new Set(indexed.references.map((reference) => reference.sha256));
    const published = (await this.store.replayManifestInventory()).references.filter(
      (reference) => reference.category === "published"
    );
    const publishedByVersionDigest = new Map<
      string,
      MediaPipelineReplayManifestReference[]
    >();
    for (const reference of published) {
      const digest = sha256Hex(reference.versionId);
      const existing = publishedByVersionDigest.get(digest) ?? [];
      existing.push(reference);
      publishedByVersionDigest.set(digest, existing);
    }

    let alreadyIndexedReceipts = 0;
    let eligibleReceipts = 0;
    let repairedReceipts = 0;
    let skippedInvalidIntegrity = 0;
    let skippedInvalidPayload = 0;
    let skippedUnmatchedVersion = 0;
    let skippedDuplicateVersion = 0;
    const repairedVersionDigests = new Set<string>();

    const repairMutationAllowed = !(
      mode === "apply" &&
      discovery.scanRoot === "provider-catalog" &&
      discovery.checkpointRequired
    );

    if (discovery.supported) {
      for (const entry of discovery.receipts) {
        if (indexedReceiptSha256.has(entry.sha256)) {
          alreadyIndexedReceipts += 1;
          continue;
        }

        const receipt = asRecord(entry.parsed);
        const attestation = receipt ? nestedRecord(receipt, "attestation") : null;
        const evidence = receipt ? nestedRecord(receipt, "evidence") : null;
        const versionIdDigest = stringField(attestation, "versionIdDigest");
        const attestationPayloadSha256 = stringField(evidence, "attestationPayloadSha256");
        const evidenceStatus = evidence?.status;
        const attestationStatus = attestation?.status;
        const evidenceReady = evidence?.ready;
        const attestationReady = attestation?.ready;
        const attestationVersionNumber = numberField(attestation, "versionNumber");
        if (
          !receipt ||
          receipt.schemaVersion !== 1 ||
          receipt.type !== "co_deliver_restore_attestation_receipt" ||
          receipt.receiptVersion !== "v1" ||
          !isIsoString(receipt.generatedAt) ||
          !attestation ||
          !evidence ||
          !versionIdDigest ||
          !isSha256(versionIdDigest) ||
          !attestationPayloadSha256 ||
          !isSha256(attestationPayloadSha256) ||
          !equalHex(attestationPayloadSha256, sha256Hex(canonicalJson(attestation))) ||
          !isRestoreAttestationStatusValue(evidenceStatus) ||
          !isRestoreAttestationStatusValue(attestationStatus) ||
          evidenceStatus !== attestationStatus ||
          typeof evidenceReady !== "boolean" ||
          typeof attestationReady !== "boolean" ||
          evidenceReady !== attestationReady ||
          typeof attestationVersionNumber !== "number" ||
          !Number.isSafeInteger(attestationVersionNumber) ||
          attestationVersionNumber <= 0
        ) {
          skippedInvalidPayload += 1;
          continue;
        }
        const recoveredVersionNumber = Number(attestationVersionNumber);

        const integrity = verifyReceiptIntegrity(entry.parsed, this.config);
        if (integrity !== "valid_signed" && integrity !== "valid_unsigned") {
          skippedInvalidIntegrity += 1;
          continue;
        }

        const matches = publishedByVersionDigest.get(versionIdDigest) ?? [];
        if (matches.length !== 1) {
          skippedUnmatchedVersion += 1;
          continue;
        }
        const reference = matches[0];
        if (reference.versionNumber !== recoveredVersionNumber) {
          skippedInvalidPayload += 1;
          continue;
        }
        if (repairedVersionDigests.has(versionIdDigest)) {
          skippedDuplicateVersion += 1;
          continue;
        }
        repairedVersionDigests.add(versionIdDigest);
        eligibleReceipts += 1;

        if (mode === "apply" && repairMutationAllowed) {
          const receiptArtifact: StoredMediaArtifact = {
            kind: "restore_attestation",
            objectKey: entry.objectKey,
            filename: entry.filename,
            contentType: "application/json",
            size: entry.size,
            sha256: entry.sha256,
            provider: this.runtime.adapter.kind,
            providerVersionId: entry.sha256,
          };
          await this.store.recordRestoreAttestationReceipt({
            versionId: reference.versionId,
            versionNumber: reference.versionNumber,
            receipt: receiptArtifact,
            attestationPayloadSha256,
            attestationStatus,
            attestationReady,
            receiptGeneratedAt: receipt.generatedAt,
          });
          indexedReceiptSha256.add(entry.sha256);
          repairedReceipts += 1;
        }
      }
    }

    return {
      generatedAt,
      mode,
      supported: discovery.supported,
      scanRoot: discovery.scanRoot,
      scanLimit: discovery.scanLimit,
      scannedJsonFiles: discovery.scannedJsonFiles,
      scanTruncated: discovery.scanTruncated,
      cursorSupported: discovery.cursorSupported,
      pagesScanned: discovery.pagesScanned,
      checkpointRequired: discovery.checkpointRequired,
      nextCursorDigest: discovery.nextCursorDigest,
      continuationToken: discovery.continuationToken,
      continuationTokenDigest: discovery.continuationTokenDigest,
      continuationTokenKeyDigest: discovery.continuationTokenKeyDigest,
      continuationTokenExpiresAt: discovery.continuationTokenExpiresAt,
      discoveredReceipts: discovery.receipts.length,
      alreadyIndexedReceipts,
      eligibleReceipts,
      repairedReceipts,
      skippedInvalidIntegrity,
      skippedInvalidPayload,
      skippedUnmatchedVersion,
      skippedDuplicateVersion,
      invalidJsonFiles: discovery.invalidJsonFiles,
      unsafeEntries: discovery.unsafeEntries,
      applied: mode === "apply" && discovery.supported && repairMutationAllowed,
      dryRun: mode === "dry_run",
    };
  }

  async resetReceiptCatalogCheckpoints(
    mode: "dry_run" | "apply"
  ): Promise<MediaPipelineReceiptCatalogCheckpointResetResult> {
    const generatedAt = nowIso(this.now);
    const [checkpointInventory, resetInventory] = await Promise.all([
      this.store.receiptCatalogCheckpointInventory(),
      this.store.receiptCatalogCheckpointResetInventory(),
    ]);
    let deletedCheckpoints = 0;
    if (mode === "apply") {
      for (const fileName of resetInventory.fileNames) {
        if (await this.store.deleteReceiptCatalogCheckpoint({ fileName })) {
          deletedCheckpoints += 1;
        }
      }
    }
    const applied = mode === "apply" && deletedCheckpoints > 0;
    const policy = {
      checkpointDirectoryOnly: true,
      preservesReceiptObjects: true,
      rawCursorsRedacted: true,
    };
    const resetSnapshot = {
      mode,
      checkpointRecords: checkpointInventory.records.length,
      invalidRecords: checkpointInventory.invalidRecords,
      staleRecords: checkpointInventory.staleRecords,
      resetCandidates: resetInventory.fileNames.length,
      unsafeEntries: resetInventory.unsafeEntries,
      deletedCheckpoints,
      applied,
    };
    let receipt: MediaPipelineReceiptCatalogCheckpointResetResult["receipt"] = {
      recorded: false,
      resetSnapshotDigest: null,
      receiptPayloadSha256: null,
      integrity: null,
      signed: false,
    };
    if (mode === "apply") {
      const resetSnapshotDigest = sha256Hex(canonicalJson(resetSnapshot));
      const signedReceipt = signReceiptCatalogCheckpointResetReceipt(
        {
          schemaVersion: 1,
          type: "co_deliver_receipt_catalog_checkpoint_reset_receipt",
          receiptVersion: "v1",
          generatedAt,
          provider: this.runtime.adapter.kind,
          mode,
          reset: {
            checkpointRecords: checkpointInventory.records.length,
            invalidRecords: checkpointInventory.invalidRecords,
            staleRecords: checkpointInventory.staleRecords,
            resetCandidates: resetInventory.fileNames.length,
            unsafeEntries: resetInventory.unsafeEntries,
            deletedCheckpoints,
            applied,
          },
          evidence: {
            resetSnapshotDigest,
            receiptObjectsPreserved: true,
            rawIdentifiersRedacted: true,
          },
          policy,
        },
        this.config
      );
      await this.store.recordReceiptCatalogCheckpointResetReceipt({
        mode,
        resetSnapshotDigest,
        checkpointRecords: checkpointInventory.records.length,
        invalidRecords: checkpointInventory.invalidRecords,
        staleRecords: checkpointInventory.staleRecords,
        resetCandidates: resetInventory.fileNames.length,
        unsafeEntries: resetInventory.unsafeEntries,
        deletedCheckpoints,
        applied,
        receiptPayloadSha256: signedReceipt.receiptIntegrity.payloadSha256,
        receiptIntegrity: signedReceipt.receiptIntegrity.algorithm,
        receiptSigned: Boolean(signedReceipt.receiptIntegrity.signature),
        receipt: signedReceipt as unknown as Record<string, unknown>,
      });
      receipt = {
        recorded: true,
        resetSnapshotDigest,
        receiptPayloadSha256: signedReceipt.receiptIntegrity.payloadSha256,
        integrity: signedReceipt.receiptIntegrity.algorithm,
        signed: Boolean(signedReceipt.receiptIntegrity.signature),
      };
    }
    return {
      generatedAt,
      mode,
      checkpointRecords: checkpointInventory.records.length,
      invalidRecords: checkpointInventory.invalidRecords,
      staleRecords: checkpointInventory.staleRecords,
      resetCandidates: resetInventory.fileNames.length,
      unsafeEntries: resetInventory.unsafeEntries,
      deletedCheckpoints,
      dryRun: mode === "dry_run",
      applied,
      policy,
      receipt,
    };
  }

  async receiptCatalogCheckpointResetReceiptLifecycle(
    mode: "dry_run" | "apply"
  ): Promise<MediaPipelineReceiptCatalogCheckpointResetReceiptLifecycleResult> {
    const inventory = await this.store.receiptCatalogCheckpointResetReceiptInventory();
    const nowMs = this.now().getTime();
    const maxRecords = this.config.receiptCatalogCheckpointResetReceiptMaxRecords;
    const retentionMs = this.config.receiptCatalogCheckpointResetReceiptRetentionMs;
    const legalHold = this.config.receiptCatalogCheckpointResetReceiptLegalHold;
    const eligible = inventory.records.filter((record, index) => {
      if (index === 0) return false;
      const ageMs = Math.max(0, nowMs - Date.parse(record.recordedAt));
      return index >= maxRecords || ageMs > retentionMs;
    });
    let deletedReceipts = 0;
    if (mode === "apply" && !legalHold) {
      for (const record of eligible) {
        if (
          await this.store.deleteReceiptCatalogCheckpointResetReceipt({
            fileName: record.fileName,
          })
        ) {
          deletedReceipts += 1;
        }
      }
    }
    const retainedCandidates =
      mode === "apply" && !legalHold
        ? inventory.records.filter(
            (record) =>
              !eligible.some((candidate) => candidate.fileName === record.fileName)
          )
        : inventory.records;
    const retainedAges = retainedCandidates.map((record) =>
      Math.max(0, nowMs - Date.parse(record.recordedAt))
    );
    const eligibleAges = eligible.map((record) =>
      Math.max(0, nowMs - Date.parse(record.recordedAt))
    );
    return {
      generatedAt: nowIso(this.now),
      mode,
      policy: {
        maxRecords,
        retentionMs,
        legalHold,
        preserveLatest: true,
      },
      totalReceipts: inventory.records.length,
      invalidRecords: inventory.invalidRecords,
      signedReceipts: inventory.signedReceipts,
      unsignedReceipts: inventory.unsignedReceipts,
      retainedReceipts:
        mode === "apply" && !legalHold
          ? inventory.records.length - deletedReceipts
          : inventory.records.length,
      eligibleReceipts: eligible.length,
      deletedReceipts,
      blockedByLegalHold: legalHold ? eligible.length : 0,
      oldestRetainedAgeMs: retainedAges.length > 0 ? Math.max(...retainedAges) : null,
      oldestEligibleReceiptAgeMs:
        eligibleAges.length > 0 ? Math.max(...eligibleAges) : null,
      latest: inventory.latest
        ? {
            recordedAt: inventory.latest.recordedAt,
            resetSnapshotDigest: inventory.latest.resetSnapshotDigest,
            deletedCheckpoints: inventory.latest.deletedCheckpoints,
            signed: inventory.latest.receiptSigned,
          }
        : null,
      dryRun: mode === "dry_run",
      applied: mode === "apply" && !legalHold && deletedReceipts > 0,
    };
  }

  async exportReceiptCatalogCheckpointResetReceiptPacket(): Promise<MediaPipelineReceiptCatalogCheckpointResetReceiptPacketExportResult> {
    const generatedAt = nowIso(this.now);
    const inventory = await this.store.receiptCatalogCheckpointResetReceiptInventory();
    const records = inventory.records.map((record) => ({
      recordedAt: record.recordedAt,
      mode: record.mode,
      resetSnapshotDigest: record.resetSnapshotDigest,
      checkpointRecords: record.checkpointRecords,
      invalidRecords: record.invalidRecords,
      staleRecords: record.staleRecords,
      resetCandidates: record.resetCandidates,
      unsafeEntries: record.unsafeEntries,
      deletedCheckpoints: record.deletedCheckpoints,
      applied: record.applied,
      receiptPayloadSha256: record.receiptPayloadSha256,
      receiptIntegrity: record.receiptIntegrity,
      receiptSigned: record.receiptSigned,
      receiptGeneratedAt: stringField(record.receipt, "generatedAt") ?? record.recordedAt,
      receipt: record.receipt,
    }));
    const appliedReceipts = records.filter((record) => record.applied).length;
    const packet = signReceiptCatalogCheckpointResetReceiptPacket(
      {
        schemaVersion: 1,
        type: "co_deliver_receipt_catalog_checkpoint_reset_receipt_packet",
        packetVersion: "v1",
        generatedAt,
        source: {
          recordCount: records.length,
          invalidRecords: inventory.invalidRecords,
          signedReceipts: inventory.signedReceipts,
          appliedReceipts,
        },
        records,
      },
      this.config
    );
    return {
      generatedAt,
      packet,
      packetDigest: packet.packetIntegrity.payloadSha256,
      recordsExported: records.length,
      invalidRecords: inventory.invalidRecords,
      signedReceipts: inventory.signedReceipts,
      appliedReceipts,
    };
  }

  async importReceiptCatalogCheckpointResetReceiptPacket(
    packet: unknown,
    mode: "dry_run" | "apply"
  ): Promise<MediaPipelineReceiptCatalogCheckpointResetReceiptPacketImportResult> {
    const packetRecord = asRecord(packet);
    const packetIntegrity = verifyPacketIntegrity(packet, this.config);
    const packetDigest =
      stringField(packetRecord ? nestedRecord(packetRecord, "packetIntegrity") : null, "payloadSha256") ?? null;
    const records = Array.isArray(packetRecord?.records) ? packetRecord.records : [];
    const inventory = await this.store.receiptCatalogCheckpointResetReceiptInventory();
    const seen = new Set(
      inventory.records.map(
        (record) => `${record.resetSnapshotDigest}:${record.receiptPayloadSha256}`
      )
    );

    let eligibleRecords = 0;
    let importedRecords = 0;
    let duplicateRecords = 0;
    let invalidReceiptIntegrityRecords = 0;
    let invalidPayloadRecords = 0;
    const importRecords: MediaPipelineReceiptCatalogCheckpointResetReceiptPacketRecord[] = [];

    if (
      !packetRecord ||
      packetRecord.schemaVersion !== 1 ||
      packetRecord.type !== "co_deliver_receipt_catalog_checkpoint_reset_receipt_packet" ||
      packetRecord.packetVersion !== "v1" ||
      !isIsoString(packetRecord.generatedAt) ||
      !nestedRecord(packetRecord, "source") ||
      !Array.isArray(packetRecord.records) ||
      packetRecord.records.length > this.config.maxLifecycleInspectionArtifacts
    ) {
      invalidPayloadRecords = records.length || 1;
    } else if (packetIntegrity !== "valid_signed" && packetIntegrity !== "valid_unsigned") {
      invalidPayloadRecords = records.length;
    } else {
      for (const raw of records) {
        const record = asRecord(raw);
        const receipt = record ? asRecord(record.receipt) : null;
        const receiptEvidence = receipt ? nestedRecord(receipt, "evidence") : null;
        const receiptReset = receipt ? nestedRecord(receipt, "reset") : null;
        const receiptIntegrity = verifyReceiptIntegrity(receipt, this.config);
        if (
          !record ||
          !isIsoString(record.recordedAt) ||
          record.mode !== "apply" ||
          !isSha256(String(record.resetSnapshotDigest)) ||
          !Number.isSafeInteger(record.checkpointRecords) ||
          Number(record.checkpointRecords) < 0 ||
          !Number.isSafeInteger(record.invalidRecords) ||
          Number(record.invalidRecords) < 0 ||
          !Number.isSafeInteger(record.staleRecords) ||
          Number(record.staleRecords) < 0 ||
          !Number.isSafeInteger(record.resetCandidates) ||
          Number(record.resetCandidates) < 0 ||
          !Number.isSafeInteger(record.unsafeEntries) ||
          Number(record.unsafeEntries) < 0 ||
          !Number.isSafeInteger(record.deletedCheckpoints) ||
          Number(record.deletedCheckpoints) < 0 ||
          typeof record.applied !== "boolean" ||
          !isSha256(String(record.receiptPayloadSha256)) ||
          (record.receiptIntegrity !== "sha256" && record.receiptIntegrity !== "hmac-sha256") ||
          typeof record.receiptSigned !== "boolean" ||
          !isIsoString(record.receiptGeneratedAt) ||
          !receipt ||
          !receiptEvidence ||
          !receiptReset
        ) {
          invalidPayloadRecords += 1;
          continue;
        }
        if (receiptIntegrity !== "valid_signed" && receiptIntegrity !== "valid_unsigned") {
          invalidReceiptIntegrityRecords += 1;
          continue;
        }
        const resetSnapshotDigest = String(record.resetSnapshotDigest);
        const receiptPayloadSha256 = String(record.receiptPayloadSha256);
        const receiptPayloadDigest = stringField(
          nestedRecord(receipt, "receiptIntegrity"),
          "payloadSha256"
        );
        if (
          !equalHex(stringField(receiptEvidence, "resetSnapshotDigest") ?? "", resetSnapshotDigest) ||
          !equalHex(receiptPayloadDigest ?? "", receiptPayloadSha256) ||
          numberField(receiptReset, "deletedCheckpoints") !==
            Number(record.deletedCheckpoints) ||
          receiptReset.applied !== record.applied
        ) {
          invalidPayloadRecords += 1;
          continue;
        }
        const importKey = `${resetSnapshotDigest}:${receiptPayloadSha256}`;
        if (seen.has(importKey)) {
          duplicateRecords += 1;
          continue;
        }
        seen.add(importKey);
        const importRecord = {
          recordedAt: String(record.recordedAt),
          mode: "apply",
          resetSnapshotDigest,
          checkpointRecords: Number(record.checkpointRecords),
          invalidRecords: Number(record.invalidRecords),
          staleRecords: Number(record.staleRecords),
          resetCandidates: Number(record.resetCandidates),
          unsafeEntries: Number(record.unsafeEntries),
          deletedCheckpoints: Number(record.deletedCheckpoints),
          applied: Boolean(record.applied),
          receiptPayloadSha256,
          receiptIntegrity: record.receiptIntegrity,
          receiptSigned: Boolean(record.receiptSigned),
          receiptGeneratedAt: String(record.receiptGeneratedAt),
          receipt,
        } satisfies MediaPipelineReceiptCatalogCheckpointResetReceiptPacketRecord;
        importRecords.push(importRecord);
        eligibleRecords += 1;
      }
    }

    if (
      mode === "apply" &&
      packetIntegrity !== "valid_signed" &&
      packetIntegrity !== "valid_unsigned"
    ) {
      eligibleRecords = 0;
    }
    if (mode === "apply" && invalidPayloadRecords === 0 && invalidReceiptIntegrityRecords === 0) {
      for (const record of importRecords) {
        await this.store.recordReceiptCatalogCheckpointResetReceipt(record);
        importedRecords += 1;
      }
    }

    return {
      generatedAt: nowIso(this.now),
      mode,
      packetDigest,
      packetIntegrity,
      recordsReceived: records.length,
      eligibleRecords,
      importedRecords,
      duplicateRecords,
      invalidReceiptIntegrityRecords,
      invalidPayloadRecords,
      applied: mode === "apply" && importedRecords > 0,
      dryRun: mode === "dry_run",
    };
  }

  async escrowReceiptCatalogCheckpointResetReceiptPacket(): Promise<MediaPipelineReceiptCatalogCheckpointResetReceiptPacketEscrowResult> {
    const exported = await this.exportReceiptCatalogCheckpointResetReceiptPacket();
    await this.store.recordReceiptCatalogCheckpointResetReceiptPacket({
      packetDigest: exported.packetDigest,
      packetGeneratedAt: exported.packet.generatedAt,
      recordCount: exported.recordsExported,
      signedReceipts: exported.signedReceipts,
      appliedReceipts: exported.appliedReceipts,
      packetIntegrity: exported.packet.packetIntegrity.algorithm,
      packetSigned: Boolean(exported.packet.packetIntegrity.signature),
      packet: exported.packet as unknown as Record<string, unknown>,
    });
    return {
      generatedAt: nowIso(this.now),
      escrowed: true,
      packetDigest: exported.packetDigest,
      recordsExported: exported.recordsExported,
      packetIntegrity: exported.packet.packetIntegrity.algorithm,
      signed: Boolean(exported.packet.packetIntegrity.signature),
    };
  }

  async receiptCatalogCheckpointResetReceiptPacketEscrowInventory(): Promise<MediaPipelineReceiptCatalogCheckpointResetReceiptPacketEscrowInventoryResult> {
    const inventory =
      await this.store.receiptCatalogCheckpointResetReceiptPacketInventory();
    let invalidIntegrityPackets = 0;
    let payloadMismatchPackets = 0;
    let latestIntegrityStatus: MediaPipelineManifestIntegrityStatus | null = null;
    for (const record of inventory.records) {
      const integrityStatus = verifyPacketIntegrity(record.packet, this.config);
      if (integrityStatus !== "valid_signed" && integrityStatus !== "valid_unsigned") {
        invalidIntegrityPackets += 1;
      }
      if (integrityStatus === "payload_mismatch") {
        payloadMismatchPackets += 1;
      }
      if (record === inventory.latest) {
        latestIntegrityStatus = integrityStatus;
      }
    }
    return {
      generatedAt: inventory.generatedAt,
      packets: inventory.records.length,
      invalidRecords: inventory.invalidRecords,
      duplicatePacketDigests: inventory.duplicatePacketDigests,
      signedPackets: inventory.signedPackets,
      unsignedPackets: inventory.unsignedPackets,
      invalidIntegrityPackets,
      payloadMismatchPackets,
      latest: inventory.latest
        ? {
            recordedAt: inventory.latest.recordedAt,
            packetDigest: inventory.latest.packetDigest,
            packetGeneratedAt: inventory.latest.packetGeneratedAt,
            recordCount: inventory.latest.recordCount,
            signed: inventory.latest.packetSigned,
            integrityStatus: latestIntegrityStatus ?? "missing_integrity",
          }
        : null,
    };
  }

  async recoverReceiptCatalogCheckpointResetReceiptsFromPacketEscrow(
    mode: "dry_run" | "apply"
  ): Promise<MediaPipelineReceiptCatalogCheckpointResetReceiptPacketRecoveryResult> {
    const inventory =
      await this.store.receiptCatalogCheckpointResetReceiptPacketInventory();
    let validPackets = 0;
    let invalidPackets = inventory.invalidRecords;
    let recordsReceived = 0;
    let eligibleRecords = 0;
    let recoveredRecords = 0;
    let duplicateRecords = 0;
    let invalidReceiptIntegrityRecords = 0;
    let invalidPayloadRecords = 0;

    for (const record of inventory.records) {
      const result = await this.importReceiptCatalogCheckpointResetReceiptPacket(
        record.packet,
        mode
      );
      recordsReceived += result.recordsReceived;
      eligibleRecords += result.eligibleRecords;
      recoveredRecords += result.importedRecords;
      duplicateRecords += result.duplicateRecords;
      invalidReceiptIntegrityRecords += result.invalidReceiptIntegrityRecords;
      invalidPayloadRecords += result.invalidPayloadRecords;
      if (result.packetIntegrity === "valid_signed" || result.packetIntegrity === "valid_unsigned") {
        validPackets += 1;
      } else {
        invalidPackets += 1;
      }
    }
    return {
      generatedAt: nowIso(this.now),
      mode,
      packetsScanned: inventory.records.length,
      validPackets,
      invalidPackets,
      recordsReceived,
      eligibleRecords,
      recoveredRecords,
      duplicateRecords,
      invalidReceiptIntegrityRecords,
      invalidPayloadRecords,
      applied: mode === "apply" && recoveredRecords > 0,
      dryRun: mode === "dry_run",
    };
  }

  async receiptCatalogCheckpointResetReceiptPacketEscrowLifecycle(
    mode: "dry_run" | "apply"
  ): Promise<MediaPipelineReceiptCatalogCheckpointResetReceiptPacketEscrowLifecycleResult> {
    const inventory =
      await this.store.receiptCatalogCheckpointResetReceiptPacketInventory();
    const nowMs = this.now().getTime();
    const maxRecords =
      this.config.receiptCatalogCheckpointResetReceiptPacketEscrowMaxRecords;
    const retentionMs =
      this.config.receiptCatalogCheckpointResetReceiptPacketEscrowRetentionMs;
    const legalHold =
      this.config.receiptCatalogCheckpointResetReceiptPacketEscrowLegalHold;
    const eligible = inventory.records.filter((record, index) => {
      if (index === 0) return false;
      const ageMs = Math.max(0, nowMs - Date.parse(record.recordedAt));
      return index >= maxRecords || ageMs > retentionMs;
    });
    let deletedPackets = 0;
    const deletedFileNames = new Set<string>();
    if (mode === "apply" && !legalHold) {
      for (const record of eligible) {
        if (
          await this.store.deleteReceiptCatalogCheckpointResetReceiptPacket({
            fileName: record.fileName,
          })
        ) {
          deletedPackets += 1;
          deletedFileNames.add(record.fileName);
        }
      }
    }
    const retainedCandidates =
      mode === "apply" && !legalHold
        ? inventory.records.filter((record) => !deletedFileNames.has(record.fileName))
        : inventory.records;
    const retainedAges = retainedCandidates.map((record) =>
      Math.max(0, nowMs - Date.parse(record.recordedAt))
    );
    const eligibleAges = eligible.map((record) =>
      Math.max(0, nowMs - Date.parse(record.recordedAt))
    );

    return {
      generatedAt: nowIso(this.now),
      mode,
      policy: {
        maxRecords,
        retentionMs,
        legalHold,
        preserveLatest: true,
      },
      totalPackets: inventory.records.length,
      invalidRecords: inventory.invalidRecords,
      duplicatePacketDigests: inventory.duplicatePacketDigests,
      signedPackets: inventory.signedPackets,
      unsignedPackets: inventory.unsignedPackets,
      retainedPackets: retainedCandidates.length,
      eligiblePackets: eligible.length,
      deletedPackets,
      blockedByLegalHold: legalHold ? eligible.length : 0,
      oldestRetainedAgeMs: retainedAges.length > 0 ? Math.max(...retainedAges) : null,
      oldestEligibleAgeMs: eligibleAges.length > 0 ? Math.max(...eligibleAges) : null,
      latest: inventory.latest
        ? {
            recordedAt: inventory.latest.recordedAt,
            packetDigest: inventory.latest.packetDigest,
            packetGeneratedAt: inventory.latest.packetGeneratedAt,
            recordCount: inventory.latest.recordCount,
            signed: inventory.latest.packetSigned,
          }
        : null,
      dryRun: mode === "dry_run",
      applied: mode === "apply" && !legalHold && deletedPackets > 0,
    };
  }

  async quarantineReceiptCatalogCheckpointResetReceiptPacketEscrow(
    mode: "dry_run" | "apply"
  ): Promise<MediaPipelineReceiptCatalogCheckpointResetReceiptPacketEscrowQuarantineResult> {
    const inventory =
      await this.store.receiptCatalogCheckpointResetReceiptPacketInventory();
    const candidates = new Map<
      string,
      "malformed_record" | "invalid_integrity" | "payload_mismatch"
    >();
    let invalidIntegrityPackets = 0;
    let payloadMismatchPackets = 0;

    for (const reference of inventory.invalidReferences) {
      candidates.set(reference.fileName, reference.reason);
    }

    for (const record of inventory.records) {
      const integrityStatus = verifyPacketIntegrity(record.packet, this.config);
      const payloadDigest = stringField(
        nestedRecord(record.packet, "packetIntegrity"),
        "payloadSha256"
      );
      const payloadMismatch = !payloadDigest || !equalHex(payloadDigest, record.packetDigest);
      if (integrityStatus !== "valid_signed" && integrityStatus !== "valid_unsigned") {
        invalidIntegrityPackets += 1;
        candidates.set(record.fileName, "invalid_integrity");
      }
      if (payloadMismatch) {
        payloadMismatchPackets += 1;
        candidates.set(record.fileName, "payload_mismatch");
      }
    }

    let quarantinedPackets = 0;
    if (mode === "apply") {
      for (const [fileName, reason] of candidates) {
        if (
          await this.store.quarantineReceiptCatalogCheckpointResetReceiptPacket({
            fileName,
            reason,
          })
        ) {
          quarantinedPackets += 1;
        }
      }
    }

    return {
      generatedAt: nowIso(this.now),
      mode,
      scannedPackets: inventory.records.length,
      invalidRecords: inventory.invalidRecords,
      invalidIntegrityPackets,
      payloadMismatchPackets,
      quarantineCandidates: candidates.size,
      quarantinedPackets,
      retainedPackets:
        mode === "apply"
          ? inventory.records.length + inventory.invalidRecords - quarantinedPackets
          : inventory.records.length + inventory.invalidRecords,
      dryRun: mode === "dry_run",
      applied: mode === "apply" && quarantinedPackets > 0,
      policy: {
        manualReviewRequired: true,
        preservesQuarantinedEvidence: true,
      },
    };
  }

  async receiptCatalogCheckpointResetReceiptPacketQuarantineInventory(): Promise<MediaPipelineReceiptCatalogCheckpointResetReceiptPacketQuarantineInventoryResult> {
    const inventory =
      await this.store.receiptCatalogCheckpointResetReceiptPacketQuarantineInventory();
    const nowMs = this.now().getTime();
    const quarantineAges = inventory.records.map((record) =>
      Math.max(0, nowMs - Date.parse(record.quarantinedAt))
    );
    return {
      generatedAt: nowIso(this.now),
      quarantinedPackets: inventory.records.length,
      invalidRecords: inventory.invalidRecords,
      malformedRecordQuarantines: inventory.malformedRecordQuarantines,
      invalidIntegrityQuarantines: inventory.invalidIntegrityQuarantines,
      payloadMismatchQuarantines: inventory.payloadMismatchQuarantines,
      unknownReasonQuarantines: inventory.unknownReasonQuarantines,
      oldestQuarantineAgeMs:
        quarantineAges.length > 0 ? Math.max(...quarantineAges) : null,
      latest: inventory.latest
        ? {
            quarantinedAt: inventory.latest.quarantinedAt,
            reason: inventory.latest.reason,
          }
        : null,
    };
  }

  async receiptCatalogCheckpointResetReceiptPacketQuarantineLifecycle(
    mode: "dry_run" | "apply"
  ): Promise<MediaPipelineReceiptCatalogCheckpointResetReceiptPacketQuarantineLifecycleResult> {
    const inventory =
      await this.store.receiptCatalogCheckpointResetReceiptPacketQuarantineInventory();
    const nowMs = this.now().getTime();
    const maxRecords =
      this.config.receiptCatalogCheckpointResetReceiptPacketQuarantineMaxRecords;
    const retentionMs =
      this.config.receiptCatalogCheckpointResetReceiptPacketQuarantineRetentionMs;
    const legalHold =
      this.config.receiptCatalogCheckpointResetReceiptPacketQuarantineLegalHold;
    const eligible = inventory.records.filter((record, index) => {
      if (index === 0) return false;
      const ageMs = Math.max(0, nowMs - Date.parse(record.quarantinedAt));
      return index >= maxRecords || ageMs > retentionMs;
    });
    let deletedPackets = 0;
    const deletedFileNames = new Set<string>();
    if (mode === "apply" && !legalHold) {
      for (const record of eligible) {
        if (
          await this.store.deleteReceiptCatalogCheckpointResetReceiptPacketQuarantine({
            fileName: record.fileName,
          })
        ) {
          deletedPackets += 1;
          deletedFileNames.add(record.fileName);
        }
      }
    }
    const retainedCandidates =
      mode === "apply" && !legalHold
        ? inventory.records.filter((record) => !deletedFileNames.has(record.fileName))
        : inventory.records;
    const retainedAges = retainedCandidates.map((record) =>
      Math.max(0, nowMs - Date.parse(record.quarantinedAt))
    );
    const eligibleAges = eligible.map((record) =>
      Math.max(0, nowMs - Date.parse(record.quarantinedAt))
    );

    return {
      generatedAt: nowIso(this.now),
      mode,
      policy: {
        maxRecords,
        retentionMs,
        legalHold,
        preserveLatest: true,
        manualReviewRequired: true,
      },
      totalQuarantinedPackets: inventory.records.length,
      invalidRecords: inventory.invalidRecords,
      retainedPackets: retainedCandidates.length,
      eligiblePackets: eligible.length,
      deletedPackets,
      blockedByLegalHold: legalHold ? eligible.length : 0,
      oldestRetainedAgeMs: retainedAges.length > 0 ? Math.max(...retainedAges) : null,
      oldestEligibleAgeMs: eligibleAges.length > 0 ? Math.max(...eligibleAges) : null,
      latest: inventory.latest
        ? {
            quarantinedAt: inventory.latest.quarantinedAt,
            reason: inventory.latest.reason,
          }
        : null,
      dryRun: mode === "dry_run",
      applied: mode === "apply" && !legalHold && deletedPackets > 0,
    };
  }

  async providerCatalogConformance(options: {
    scanLimit?: number;
    pageLimit?: number;
  } = {}): Promise<MediaPipelineProviderCatalogConformanceReport> {
    const configuredLimit = this.config.maxLifecycleInspectionArtifacts;
    const scanLimit =
      Number.isSafeInteger(options.scanLimit) && Number(options.scanLimit) > 0
        ? Math.min(Number(options.scanLimit), configuredLimit)
        : configuredLimit;
    const pageLimit =
      Number.isSafeInteger(options.pageLimit) && Number(options.pageLimit) > 0
        ? Math.min(Number(options.pageLimit), scanLimit)
        : scanLimit;
    return assessMediaPipelineProviderCatalogConformance({
      adapter: this.runtime.adapter,
      scanLimit,
      pageLimit,
      now: this.now,
    });
  }

  async persistProviderCatalogConformanceReceipt(options: {
    scanLimit?: number;
    pageLimit?: number;
  } = {}): Promise<MediaPipelineProviderCatalogConformanceReceiptPublication> {
    const generatedAt = nowIso(this.now);
    const report = await this.providerCatalogConformance(options);
    const providerDigest = sha256Hex(report.provider);
    const reportPayloadSha256 = sha256Hex(canonicalJson(report));
    const receiptPayload = signProviderCatalogConformanceReceiptPayload(
      {
        schemaVersion: 1,
        type: "co_deliver_provider_catalog_conformance_receipt",
        receiptVersion: "v1",
        generatedAt,
        report,
        evidence: {
          reportPayloadSha256,
          ready: report.ready,
          provider: report.provider,
          providerDigest,
          capabilityPresent: report.capabilityPresent,
          checkpointRequired: report.checkpointRequired,
          findingCount: report.findings.length,
          listedObjects: report.listedObjects,
          validObjects: report.validObjects,
          unsafeEntries: report.unsafeEntries,
          providerBackpressure: report.providerBackpressure,
          unavailable: report.unavailable,
        },
      },
      this.config
    );

    await this.store.recordProviderCatalogConformanceReceipt({
      provider: report.provider,
      providerDigest,
      reportPayloadSha256,
      ready: report.ready,
      capabilityPresent: report.capabilityPresent,
      checkpointRequired: report.checkpointRequired,
      findingCount: report.findings.length,
      receiptPayloadSha256: receiptPayload.receiptIntegrity.payloadSha256,
      receiptIntegrity: receiptPayload.receiptIntegrity.algorithm,
      receiptSigned: Boolean(receiptPayload.receiptIntegrity.signature),
      receiptGeneratedAt: generatedAt,
      receipt: receiptPayload as unknown as Record<string, unknown>,
    });

    return {
      generatedAt,
      persisted: true,
      reason: null,
      report,
      receipt: {
        provider: report.provider,
        providerDigest,
        reportPayloadSha256,
        receiptPayloadSha256: receiptPayload.receiptIntegrity.payloadSha256,
        integrity: receiptPayload.receiptIntegrity.algorithm,
        signed: Boolean(receiptPayload.receiptIntegrity.signature),
      },
    };
  }

  async providerCatalogConformanceReceiptDiagnostics(): Promise<MediaPipelineProviderCatalogConformanceReceiptDiagnostics> {
    const inventory = await this.store.providerCatalogConformanceReceiptInventory();
    let invalidIntegrityRecords = 0;
    let payloadMismatchRecords = 0;
    let latest: MediaPipelineProviderCatalogConformanceReceiptDiagnostics["latest"] = null;

    for (const record of inventory.records) {
      const integrityStatus = verifyReceiptIntegrity(record.receipt, this.config);
      const receipt = asRecord(record.receipt);
      const report = receipt ? nestedRecord(receipt, "report") : null;
      const evidence = receipt ? nestedRecord(receipt, "evidence") : null;
      const evidenceReportPayloadSha256 = stringField(evidence, "reportPayloadSha256");
      const evidenceProviderDigest = stringField(evidence, "providerDigest");
      const reportPayloadMatches = Boolean(
        report &&
          evidenceReportPayloadSha256 &&
          equalHex(evidenceReportPayloadSha256, sha256Hex(canonicalJson(report))) &&
          equalHex(evidenceReportPayloadSha256, record.reportPayloadSha256)
      );
      const providerDigestMatches = Boolean(
        evidenceProviderDigest && equalHex(evidenceProviderDigest, record.providerDigest)
      );
      if (
        integrityStatus !== "valid_signed" &&
        integrityStatus !== "valid_unsigned"
      ) {
        invalidIntegrityRecords += 1;
      }
      if (!reportPayloadMatches || !providerDigestMatches) {
        payloadMismatchRecords += 1;
      }
      if (!latest) {
        latest = {
          recordedAt: record.recordedAt,
          provider: record.provider,
          providerDigest: record.providerDigest,
          reportPayloadSha256: record.reportPayloadSha256,
          ready: record.ready,
          receiptPayloadSha256: record.receiptPayloadSha256,
          integrity: record.receiptIntegrity,
          signed: record.receiptSigned,
          integrityStatus,
        };
      }
    }

    return {
      generatedAt: nowIso(this.now),
      records: inventory.records.length,
      invalidRecords: inventory.invalidRecords,
      signedRecords: inventory.signedRecords,
      unsignedRecords: inventory.unsignedRecords,
      readyRecords: inventory.readyRecords,
      failedRecords: inventory.failedRecords,
      invalidIntegrityRecords,
      payloadMismatchRecords,
      latest,
    };
  }

  async providerCatalogConformanceReceiptLifecycle(
    mode: MediaPipelineProviderCatalogConformanceReceiptLifecycleMode
  ): Promise<MediaPipelineProviderCatalogConformanceReceiptLifecycleResult> {
    const inventory = await this.store.providerCatalogConformanceReceiptInventory();
    const nowMs = this.now().getTime();
    const maxRecords = this.config.providerCatalogConformanceReceiptMaxRecords;
    const retentionMs = this.config.providerCatalogConformanceReceiptRetentionMs;
    const legalHold = this.config.providerCatalogConformanceReceiptLegalHold;
    const eligible = inventory.records.filter((record, index) => {
      if (index === 0) return false;
      const ageMs = Math.max(0, nowMs - Date.parse(record.recordedAt));
      return index >= maxRecords || ageMs > retentionMs;
    });
    let deletedRecords = 0;
    if (mode === "apply" && !legalHold) {
      for (const record of eligible) {
        if (
          await this.store.deleteProviderCatalogConformanceReceipt({
            providerDigest: record.providerDigest,
            receiptPayloadSha256: record.receiptPayloadSha256,
          })
        ) {
          deletedRecords += 1;
        }
      }
    }

    const retainedRecords =
      mode === "apply" && !legalHold
        ? inventory.records.length - deletedRecords
        : inventory.records.length;
    const retainedCandidates =
      mode === "apply" && !legalHold
        ? inventory.records.filter(
            (record) =>
              !eligible.some(
                (candidate) =>
                  candidate.providerDigest === record.providerDigest &&
                  candidate.receiptPayloadSha256 === record.receiptPayloadSha256
              )
          )
        : inventory.records;
    const retainedAges = retainedCandidates.map((record) =>
      Math.max(0, nowMs - Date.parse(record.recordedAt))
    );
    const eligibleAges = eligible.map((record) =>
      Math.max(0, nowMs - Date.parse(record.recordedAt))
    );

    return {
      generatedAt: nowIso(this.now),
      mode,
      policy: {
        maxRecords,
        retentionMs,
        legalHold,
        preserveLatest: true,
      },
      totalRecords: inventory.records.length,
      invalidRecords: inventory.invalidRecords,
      signedRecords: inventory.signedRecords,
      readyRecords: inventory.readyRecords,
      failedRecords: inventory.failedRecords,
      retainedRecords,
      eligibleRecords: eligible.length,
      deletedRecords,
      blockedByLegalHold: legalHold ? eligible.length : 0,
      oldestRetainedAgeMs: retainedAges.length > 0 ? Math.max(...retainedAges) : null,
      oldestEligibleAgeMs: eligibleAges.length > 0 ? Math.max(...eligibleAges) : null,
      latest: inventory.latest
        ? {
            recordedAt: inventory.latest.recordedAt,
            provider: inventory.latest.provider,
            providerDigest: inventory.latest.providerDigest,
            receiptPayloadSha256: inventory.latest.receiptPayloadSha256,
            ready: inventory.latest.ready,
            signed: inventory.latest.receiptSigned,
          }
        : null,
      dryRun: mode === "dry_run",
      applied: mode === "apply" && !legalHold,
    };
  }

  async exportProviderCatalogConformanceReceiptPacket(): Promise<MediaPipelineProviderCatalogConformanceReceiptPacketExportResult> {
    const generatedAt = nowIso(this.now);
    const inventory = await this.store.providerCatalogConformanceReceiptInventory();
    const records = inventory.records.map((record) => ({
      recordedAt: record.recordedAt,
      provider: record.provider,
      providerDigest: record.providerDigest,
      reportPayloadSha256: record.reportPayloadSha256,
      ready: record.ready,
      capabilityPresent: record.capabilityPresent,
      checkpointRequired: record.checkpointRequired,
      findingCount: record.findingCount,
      receiptPayloadSha256: record.receiptPayloadSha256,
      receiptIntegrity: record.receiptIntegrity,
      receiptSigned: record.receiptSigned,
      receiptGeneratedAt: record.receiptGeneratedAt,
      receipt: record.receipt,
    }));
    const providerCount = new Set(records.map((record) => record.providerDigest)).size;
    const packet = signProviderCatalogConformanceReceiptPacket(
      {
        schemaVersion: 1,
        type: "co_deliver_provider_catalog_conformance_receipt_packet",
        packetVersion: "v1",
        generatedAt,
        source: {
          providerCount,
          recordCount: records.length,
          invalidRecords: inventory.invalidRecords,
          signedRecords: inventory.signedRecords,
          readyRecords: inventory.readyRecords,
          failedRecords: inventory.failedRecords,
        },
        records,
      },
      this.config
    );
    return {
      generatedAt,
      packet,
      packetDigest: packet.packetIntegrity.payloadSha256,
      recordsExported: records.length,
      invalidRecords: inventory.invalidRecords,
      signedRecords: inventory.signedRecords,
      readyRecords: inventory.readyRecords,
      failedRecords: inventory.failedRecords,
    };
  }

  async importProviderCatalogConformanceReceiptPacket(
    packet: unknown,
    mode: "dry_run" | "apply"
  ): Promise<MediaPipelineProviderCatalogConformanceReceiptPacketImportResult> {
    const packetRecord = asRecord(packet);
    const packetIntegrity = verifyPacketIntegrity(packet, this.config);
    const packetDigest =
      stringField(packetRecord ? nestedRecord(packetRecord, "packetIntegrity") : null, "payloadSha256") ?? null;
    const records = Array.isArray(packetRecord?.records) ? packetRecord.records : [];
    const inventory = await this.store.providerCatalogConformanceReceiptInventory();
    const seen = new Set(
      inventory.records.map((record) => `${record.providerDigest}:${record.receiptPayloadSha256}`)
    );

    let eligibleRecords = 0;
    let importedRecords = 0;
    let duplicateRecords = 0;
    let invalidReceiptIntegrityRecords = 0;
    let invalidPayloadRecords = 0;
    const importRecords: MediaPipelineProviderCatalogConformanceReceiptPacketRecord[] = [];

    if (
      !packetRecord ||
      packetRecord.schemaVersion !== 1 ||
      packetRecord.type !== "co_deliver_provider_catalog_conformance_receipt_packet" ||
      packetRecord.packetVersion !== "v1" ||
      !isIsoString(packetRecord.generatedAt) ||
      !nestedRecord(packetRecord, "source") ||
      !Array.isArray(packetRecord.records) ||
      packetRecord.records.length > this.config.maxLifecycleInspectionArtifacts
    ) {
      invalidPayloadRecords = records.length || 1;
    } else if (packetIntegrity !== "valid_signed" && packetIntegrity !== "valid_unsigned") {
      invalidPayloadRecords = records.length;
    } else {
      for (const raw of records) {
        const record = asRecord(raw);
        const receipt = record ? asRecord(record.receipt) : null;
        const receiptEvidence = receipt ? nestedRecord(receipt, "evidence") : null;
        const receiptReport = receipt ? nestedRecord(receipt, "report") : null;
        const receiptIntegrity = verifyReceiptIntegrity(receipt, this.config);
        if (
          !record ||
          !isIsoString(record.recordedAt) ||
          typeof record.provider !== "string" ||
          !isSha256(String(record.providerDigest)) ||
          !isSha256(String(record.reportPayloadSha256)) ||
          typeof record.ready !== "boolean" ||
          typeof record.capabilityPresent !== "boolean" ||
          typeof record.checkpointRequired !== "boolean" ||
          !Number.isSafeInteger(record.findingCount) ||
          Number(record.findingCount) < 0 ||
          !isSha256(String(record.receiptPayloadSha256)) ||
          (record.receiptIntegrity !== "sha256" && record.receiptIntegrity !== "hmac-sha256") ||
          typeof record.receiptSigned !== "boolean" ||
          !isIsoString(record.receiptGeneratedAt) ||
          !receipt ||
          !receiptEvidence ||
          !receiptReport
        ) {
          invalidPayloadRecords += 1;
          continue;
        }
        if (receiptIntegrity !== "valid_signed" && receiptIntegrity !== "valid_unsigned") {
          invalidReceiptIntegrityRecords += 1;
          continue;
        }
        const reportPayloadSha256 = String(record.reportPayloadSha256);
        const providerDigest = String(record.providerDigest);
        const receiptPayloadSha256 = String(record.receiptPayloadSha256);
        const evidenceReportPayloadSha256 = stringField(receiptEvidence, "reportPayloadSha256");
        const evidenceProviderDigest = stringField(receiptEvidence, "providerDigest");
        const receiptPayloadDigest = stringField(
          nestedRecord(receipt, "receiptIntegrity"),
          "payloadSha256"
        );
        if (
          !evidenceReportPayloadSha256 ||
          !evidenceProviderDigest ||
          !receiptPayloadDigest ||
          !equalHex(evidenceReportPayloadSha256, reportPayloadSha256) ||
          !equalHex(evidenceReportPayloadSha256, sha256Hex(canonicalJson(receiptReport))) ||
          !equalHex(evidenceProviderDigest, providerDigest) ||
          !equalHex(receiptPayloadDigest, receiptPayloadSha256)
        ) {
          invalidPayloadRecords += 1;
          continue;
        }
        const importKey = `${providerDigest}:${receiptPayloadSha256}`;
        if (seen.has(importKey)) {
          duplicateRecords += 1;
          continue;
        }
        seen.add(importKey);
        const importRecord = {
          recordedAt: String(record.recordedAt),
          provider: String(record.provider),
          providerDigest,
          reportPayloadSha256,
          ready: Boolean(record.ready),
          capabilityPresent: Boolean(record.capabilityPresent),
          checkpointRequired: Boolean(record.checkpointRequired),
          findingCount: Number(record.findingCount),
          receiptPayloadSha256,
          receiptIntegrity: record.receiptIntegrity,
          receiptSigned: Boolean(record.receiptSigned),
          receiptGeneratedAt: String(record.receiptGeneratedAt),
          receipt,
        } satisfies MediaPipelineProviderCatalogConformanceReceiptPacketRecord;
        importRecords.push(importRecord);
        eligibleRecords += 1;
      }
    }

    if (
      mode === "apply" &&
      packetIntegrity !== "valid_signed" &&
      packetIntegrity !== "valid_unsigned"
    ) {
      eligibleRecords = 0;
    }
    if (mode === "apply" && invalidPayloadRecords === 0 && invalidReceiptIntegrityRecords === 0) {
      for (const record of importRecords) {
        await this.store.recordProviderCatalogConformanceReceipt(record);
        importedRecords += 1;
      }
    }

    return {
      generatedAt: nowIso(this.now),
      mode,
      packetDigest,
      packetIntegrity,
      recordsReceived: records.length,
      eligibleRecords,
      importedRecords,
      duplicateRecords,
      invalidReceiptIntegrityRecords,
      invalidPayloadRecords,
      applied: mode === "apply" && importedRecords > 0,
      dryRun: mode === "dry_run",
    };
  }

  async escrowProviderCatalogConformanceReceiptPacket(): Promise<MediaPipelineProviderCatalogConformancePacketEscrowResult> {
    const exported = await this.exportProviderCatalogConformanceReceiptPacket();
    await this.store.recordProviderCatalogConformancePacket({
      packetDigest: exported.packetDigest,
      packetGeneratedAt: exported.packet.generatedAt,
      providerCount: exported.packet.source.providerCount,
      recordCount: exported.packet.source.recordCount,
      signedRecords: exported.packet.source.signedRecords,
      readyRecords: exported.packet.source.readyRecords,
      failedRecords: exported.packet.source.failedRecords,
      packetIntegrity: exported.packet.packetIntegrity.algorithm,
      packetSigned: Boolean(exported.packet.packetIntegrity.signature),
      packet: exported.packet as unknown as Record<string, unknown>,
    });
    return {
      generatedAt: nowIso(this.now),
      escrowed: true,
      packetDigest: exported.packetDigest,
      recordsExported: exported.recordsExported,
      packetIntegrity: exported.packet.packetIntegrity.algorithm,
      signed: Boolean(exported.packet.packetIntegrity.signature),
    };
  }

  async providerCatalogConformancePacketEscrowInventory(): Promise<MediaPipelineProviderCatalogConformancePacketEscrowInventoryResult> {
    const inventory = await this.store.providerCatalogConformancePacketInventory();
    let invalidIntegrityPackets = 0;
    let payloadMismatchPackets = 0;
    let latest: MediaPipelineProviderCatalogConformancePacketEscrowInventoryResult["latest"] = null;

    for (const record of inventory.records) {
      const integrityStatus = verifyPacketIntegrity(record.packet, this.config);
      if (integrityStatus !== "valid_signed" && integrityStatus !== "valid_unsigned") {
        invalidIntegrityPackets += 1;
      }
      const payloadDigest = stringField(
        nestedRecord(record.packet, "packetIntegrity"),
        "payloadSha256"
      );
      if (!payloadDigest || !equalHex(payloadDigest, record.packetDigest)) {
        payloadMismatchPackets += 1;
      }
      if (!latest) {
        latest = {
          recordedAt: record.recordedAt,
          packetDigest: record.packetDigest,
          packetGeneratedAt: record.packetGeneratedAt,
          providerCount: record.providerCount,
          recordCount: record.recordCount,
          signedRecords: record.signedRecords,
          readyRecords: record.readyRecords,
          failedRecords: record.failedRecords,
          packetIntegrity: record.packetIntegrity,
          signed: record.packetSigned,
          integrityStatus,
        };
      }
    }

    return {
      generatedAt: nowIso(this.now),
      packets: inventory.records.length,
      invalidRecords: inventory.invalidRecords,
      duplicatePacketDigests: inventory.duplicatePacketDigests,
      signedPackets: inventory.signedPackets,
      unsignedPackets: inventory.unsignedPackets,
      invalidIntegrityPackets,
      payloadMismatchPackets,
      latest,
    };
  }

  async providerCatalogConformancePacketEscrowLifecycle(
    mode: "dry_run" | "apply"
  ): Promise<MediaPipelineProviderCatalogConformancePacketEscrowLifecycleResult> {
    const inventory = await this.store.providerCatalogConformancePacketInventory();
    const nowMs = this.now().getTime();
    const maxRecords = this.config.providerCatalogConformancePacketEscrowMaxRecords;
    const retentionMs = this.config.providerCatalogConformancePacketEscrowRetentionMs;
    const legalHold = this.config.providerCatalogConformancePacketEscrowLegalHold;
    const eligible = inventory.records.filter((record, index) => {
      if (index === 0) return false;
      const ageMs = Math.max(0, nowMs - Date.parse(record.recordedAt));
      return index >= maxRecords || ageMs > retentionMs;
    });
    let deletedPackets = 0;
    const deletedFileNames = new Set<string>();
    if (mode === "apply" && !legalHold) {
      for (const record of eligible) {
        if (
          await this.store.deleteProviderCatalogConformancePacket({
            fileName: record.fileName,
          })
        ) {
          deletedPackets += 1;
          deletedFileNames.add(record.fileName);
        }
      }
    }
    const retainedCandidates =
      mode === "apply" && !legalHold
        ? inventory.records.filter((record) => !deletedFileNames.has(record.fileName))
        : inventory.records;
    const retainedAges = retainedCandidates.map((record) =>
      Math.max(0, nowMs - Date.parse(record.recordedAt))
    );
    const eligibleAges = eligible.map((record) =>
      Math.max(0, nowMs - Date.parse(record.recordedAt))
    );

    return {
      generatedAt: nowIso(this.now),
      mode,
      policy: {
        maxRecords,
        retentionMs,
        legalHold,
        preserveLatest: true,
      },
      totalPackets: inventory.records.length,
      invalidRecords: inventory.invalidRecords,
      duplicatePacketDigests: inventory.duplicatePacketDigests,
      signedPackets: inventory.signedPackets,
      unsignedPackets: inventory.unsignedPackets,
      retainedPackets: retainedCandidates.length,
      eligiblePackets: eligible.length,
      deletedPackets,
      blockedByLegalHold: legalHold ? eligible.length : 0,
      oldestRetainedAgeMs: retainedAges.length > 0 ? Math.max(...retainedAges) : null,
      oldestEligibleAgeMs: eligibleAges.length > 0 ? Math.max(...eligibleAges) : null,
      latest: inventory.latest
        ? {
            recordedAt: inventory.latest.recordedAt,
            packetDigest: inventory.latest.packetDigest,
            packetGeneratedAt: inventory.latest.packetGeneratedAt,
            recordCount: inventory.latest.recordCount,
            signed: inventory.latest.packetSigned,
          }
        : null,
      dryRun: mode === "dry_run",
      applied: mode === "apply" && !legalHold,
    };
  }

  async quarantineProviderCatalogConformancePacketEscrow(
    mode: "dry_run" | "apply"
  ): Promise<MediaPipelineProviderCatalogConformancePacketEscrowQuarantineResult> {
    const inventory = await this.store.providerCatalogConformancePacketInventory();
    const candidates = new Map<
      string,
      "malformed_record" | "invalid_integrity" | "payload_mismatch"
    >();
    let invalidIntegrityPackets = 0;
    let payloadMismatchPackets = 0;

    for (const reference of inventory.invalidReferences) {
      candidates.set(reference.fileName, reference.reason);
    }

    for (const record of inventory.records) {
      const integrityStatus = verifyPacketIntegrity(record.packet, this.config);
      const payloadDigest = stringField(
        nestedRecord(record.packet, "packetIntegrity"),
        "payloadSha256"
      );
      const payloadMismatch = !payloadDigest || !equalHex(payloadDigest, record.packetDigest);
      if (integrityStatus !== "valid_signed" && integrityStatus !== "valid_unsigned") {
        invalidIntegrityPackets += 1;
        candidates.set(record.fileName, "invalid_integrity");
      }
      if (payloadMismatch) {
        payloadMismatchPackets += 1;
        candidates.set(record.fileName, "payload_mismatch");
      }
    }

    let quarantinedPackets = 0;
    if (mode === "apply") {
      for (const [fileName, reason] of candidates) {
        if (
          await this.store.quarantineProviderCatalogConformancePacket({
            fileName,
            reason,
          })
        ) {
          quarantinedPackets += 1;
        }
      }
    }

    return {
      generatedAt: nowIso(this.now),
      mode,
      scannedPackets: inventory.records.length,
      invalidRecords: inventory.invalidRecords,
      invalidIntegrityPackets,
      payloadMismatchPackets,
      quarantineCandidates: candidates.size,
      quarantinedPackets,
      retainedPackets:
        mode === "apply"
          ? inventory.records.length + inventory.invalidRecords - quarantinedPackets
          : inventory.records.length + inventory.invalidRecords,
      dryRun: mode === "dry_run",
      applied: mode === "apply" && quarantinedPackets > 0,
      policy: {
        manualReviewRequired: true,
        preservesQuarantinedEvidence: true,
      },
    };
  }

  async providerCatalogConformancePacketQuarantineInventory(): Promise<MediaPipelineProviderCatalogConformancePacketQuarantineInventoryResult> {
    const inventory =
      await this.store.providerCatalogConformancePacketQuarantineInventory();
    const nowMs = this.now().getTime();
    const quarantineAges = inventory.records.map((record) =>
      Math.max(0, nowMs - Date.parse(record.quarantinedAt))
    );
    return {
      generatedAt: nowIso(this.now),
      quarantinedPackets: inventory.records.length,
      invalidRecords: inventory.invalidRecords,
      malformedRecordQuarantines: inventory.malformedRecordQuarantines,
      invalidIntegrityQuarantines: inventory.invalidIntegrityQuarantines,
      payloadMismatchQuarantines: inventory.payloadMismatchQuarantines,
      unknownReasonQuarantines: inventory.unknownReasonQuarantines,
      oldestQuarantineAgeMs:
        quarantineAges.length > 0 ? Math.max(...quarantineAges) : null,
      latest: inventory.latest
        ? {
            quarantinedAt: inventory.latest.quarantinedAt,
            reason: inventory.latest.reason,
          }
        : null,
    };
  }

  async providerCatalogConformancePacketQuarantineLifecycle(
    mode: "dry_run" | "apply"
  ): Promise<MediaPipelineProviderCatalogConformancePacketQuarantineLifecycleResult> {
    const inventory =
      await this.store.providerCatalogConformancePacketQuarantineInventory();
    const nowMs = this.now().getTime();
    const maxRecords = this.config.providerCatalogConformancePacketQuarantineMaxRecords;
    const retentionMs = this.config.providerCatalogConformancePacketQuarantineRetentionMs;
    const legalHold = this.config.providerCatalogConformancePacketQuarantineLegalHold;
    const eligible = inventory.records.filter((record, index) => {
      if (index === 0) return false;
      const ageMs = Math.max(0, nowMs - Date.parse(record.quarantinedAt));
      return index >= maxRecords || ageMs > retentionMs;
    });
    let deletedPackets = 0;
    const deletedFileNames = new Set<string>();
    if (mode === "apply" && !legalHold) {
      for (const record of eligible) {
        if (
          await this.store.deleteProviderCatalogConformancePacketQuarantine({
            fileName: record.fileName,
          })
        ) {
          deletedPackets += 1;
          deletedFileNames.add(record.fileName);
        }
      }
    }
    const retainedCandidates =
      mode === "apply" && !legalHold
        ? inventory.records.filter((record) => !deletedFileNames.has(record.fileName))
        : inventory.records;
    const retainedAges = retainedCandidates.map((record) =>
      Math.max(0, nowMs - Date.parse(record.quarantinedAt))
    );
    const eligibleAges = eligible.map((record) =>
      Math.max(0, nowMs - Date.parse(record.quarantinedAt))
    );

    return {
      generatedAt: nowIso(this.now),
      mode,
      policy: {
        maxRecords,
        retentionMs,
        legalHold,
        preserveLatest: true,
        manualReviewRequired: true,
      },
      totalQuarantinedPackets: inventory.records.length,
      invalidRecords: inventory.invalidRecords,
      retainedPackets: retainedCandidates.length,
      eligiblePackets: eligible.length,
      deletedPackets,
      blockedByLegalHold: legalHold ? eligible.length : 0,
      oldestRetainedAgeMs: retainedAges.length > 0 ? Math.max(...retainedAges) : null,
      oldestEligibleAgeMs: eligibleAges.length > 0 ? Math.max(...eligibleAges) : null,
      dryRun: mode === "dry_run",
      applied: mode === "apply" && !legalHold && deletedPackets > 0,
    };
  }

  async attestProviderCatalogConformancePacketQuarantine(
    decision: MediaPipelineProviderCatalogConformancePacketQuarantineAttestationDecision
  ): Promise<MediaPipelineProviderCatalogConformancePacketQuarantineAttestationResult> {
    const inventory =
      await this.store.providerCatalogConformancePacketQuarantineInventory();
    const nowMs = this.now().getTime();
    const quarantineAges = inventory.records.map((record) =>
      Math.max(0, nowMs - Date.parse(record.quarantinedAt))
    );
    const snapshot = {
      quarantinedPackets: inventory.records.length,
      malformedRecordQuarantines: inventory.malformedRecordQuarantines,
      invalidIntegrityQuarantines: inventory.invalidIntegrityQuarantines,
      payloadMismatchQuarantines: inventory.payloadMismatchQuarantines,
      unknownReasonQuarantines: inventory.unknownReasonQuarantines,
      oldestQuarantineAgeMs:
        quarantineAges.length > 0 ? Math.max(...quarantineAges) : null,
      latestReason: inventory.latest?.reason ?? null,
    };
    const quarantineSnapshotDigest = sha256Hex(canonicalJson(snapshot));
    const attestation = signProviderCatalogConformancePacketQuarantineAttestation(
      {
        schemaVersion: 1,
        type: "co_deliver_provider_catalog_packet_quarantine_attestation",
        attestationVersion: "v1",
        generatedAt: nowIso(this.now),
        decision,
        snapshot,
        evidence: {
          quarantineSnapshotDigest,
          manualReviewRequired: true,
          rawIdentifiersRedacted: true,
        },
      },
      this.config
    );
    await this.store.recordProviderCatalogConformancePacketQuarantineAttestation({
      decision,
      quarantineSnapshotDigest,
      quarantinedPackets: snapshot.quarantinedPackets,
      malformedRecordQuarantines: snapshot.malformedRecordQuarantines,
      invalidIntegrityQuarantines: snapshot.invalidIntegrityQuarantines,
      payloadMismatchQuarantines: snapshot.payloadMismatchQuarantines,
      unknownReasonQuarantines: snapshot.unknownReasonQuarantines,
      oldestQuarantineAgeMs: snapshot.oldestQuarantineAgeMs,
      attestationPayloadSha256: attestation.attestationIntegrity.payloadSha256,
      attestationIntegrity: attestation.attestationIntegrity.algorithm,
      attestationSigned: Boolean(attestation.attestationIntegrity.signature),
      attestation: attestation as unknown as Record<string, unknown>,
    });
    return {
      generatedAt: attestation.generatedAt,
      attested: true,
      decision,
      quarantineSnapshotDigest,
      quarantinedPackets: snapshot.quarantinedPackets,
      malformedRecordQuarantines: snapshot.malformedRecordQuarantines,
      invalidIntegrityQuarantines: snapshot.invalidIntegrityQuarantines,
      payloadMismatchQuarantines: snapshot.payloadMismatchQuarantines,
      unknownReasonQuarantines: snapshot.unknownReasonQuarantines,
      oldestQuarantineAgeMs: snapshot.oldestQuarantineAgeMs,
      attestationPayloadSha256: attestation.attestationIntegrity.payloadSha256,
      attestationIntegrity: attestation.attestationIntegrity.algorithm,
      signed: Boolean(attestation.attestationIntegrity.signature),
    };
  }

  async providerCatalogConformancePacketQuarantineAttestationInventory(): Promise<MediaPipelineProviderCatalogConformancePacketQuarantineAttestationInventoryResult> {
    const inventory =
      await this.store.providerCatalogConformancePacketQuarantineAttestationInventory();
    let invalidIntegrityAttestations = 0;
    let payloadMismatchAttestations = 0;
    const integrityStatuses = new Map<
      string,
      MediaPipelineManifestIntegrityStatus
    >();
    for (const record of inventory.records) {
      const integrityStatus = verifyPacketQuarantineAttestationIntegrity(
        record.attestation,
        this.config
      );
      integrityStatuses.set(record.fileName, integrityStatus);
      if (integrityStatus !== "valid_signed" && integrityStatus !== "valid_unsigned") {
        invalidIntegrityAttestations += 1;
      }
      const payloadDigest = stringField(
        nestedRecord(record.attestation, "attestationIntegrity"),
        "payloadSha256"
      );
      if (!payloadDigest || !equalHex(payloadDigest, record.attestationPayloadSha256)) {
        payloadMismatchAttestations += 1;
      }
    }
    return {
      generatedAt: nowIso(this.now),
      attestations: inventory.records.length,
      invalidRecords: inventory.invalidRecords,
      reviewedAttestations: inventory.reviewedAttestations,
      retainedAttestations: inventory.retainedAttestations,
      releasedAttestations: inventory.releasedAttestations,
      signedAttestations: inventory.signedAttestations,
      unsignedAttestations: inventory.unsignedAttestations,
      invalidIntegrityAttestations,
      payloadMismatchAttestations,
      signatureRequired: this.config.requireManifestSignature,
      signatureVerificationEnabled: this.config.manifestVerificationKeys.length > 0,
      latest: inventory.latest
        ? {
            recordedAt: inventory.latest.recordedAt,
            decision: inventory.latest.decision,
            quarantineSnapshotDigest: inventory.latest.quarantineSnapshotDigest,
            quarantinedPackets: inventory.latest.quarantinedPackets,
            signed: inventory.latest.attestationSigned,
            integrityStatus:
              integrityStatuses.get(inventory.latest.fileName) ?? "missing_integrity",
          }
        : null,
    };
  }

  async providerCatalogConformancePacketQuarantineAttestationLifecycle(
    mode: "dry_run" | "apply"
  ): Promise<MediaPipelineProviderCatalogConformancePacketQuarantineAttestationLifecycleResult> {
    const inventory =
      await this.store.providerCatalogConformancePacketQuarantineAttestationInventory();
    const nowMs = this.now().getTime();
    const maxRecords =
      this.config.providerCatalogConformancePacketQuarantineAttestationMaxRecords;
    const retentionMs =
      this.config.providerCatalogConformancePacketQuarantineAttestationRetentionMs;
    const legalHold =
      this.config.providerCatalogConformancePacketQuarantineAttestationLegalHold;
    const eligible = inventory.records.filter((record, index) => {
      if (index === 0) return false;
      const ageMs = Math.max(0, nowMs - Date.parse(record.recordedAt));
      return index >= maxRecords || ageMs > retentionMs;
    });
    let deletedAttestations = 0;
    const deletedFileNames = new Set<string>();
    if (mode === "apply" && !legalHold) {
      for (const record of eligible) {
        if (
          await this.store.deleteProviderCatalogConformancePacketQuarantineAttestation({
            fileName: record.fileName,
          })
        ) {
          deletedAttestations += 1;
          deletedFileNames.add(record.fileName);
        }
      }
    }
    const retainedCandidates =
      mode === "apply" && !legalHold
        ? inventory.records.filter((record) => !deletedFileNames.has(record.fileName))
        : inventory.records;
    const retainedAges = retainedCandidates.map((record) =>
      Math.max(0, nowMs - Date.parse(record.recordedAt))
    );
    const eligibleAges = eligible.map((record) =>
      Math.max(0, nowMs - Date.parse(record.recordedAt))
    );

    return {
      generatedAt: nowIso(this.now),
      mode,
      policy: {
        maxRecords,
        retentionMs,
        legalHold,
        preserveLatest: true,
        manualReviewRequired: true,
      },
      totalAttestations: inventory.records.length,
      invalidRecords: inventory.invalidRecords,
      retainedAttestations: retainedCandidates.length,
      eligibleAttestations: eligible.length,
      deletedAttestations,
      blockedByLegalHold: legalHold ? eligible.length : 0,
      oldestRetainedAgeMs: retainedAges.length > 0 ? Math.max(...retainedAges) : null,
      oldestEligibleAgeMs: eligibleAges.length > 0 ? Math.max(...eligibleAges) : null,
      dryRun: mode === "dry_run",
      applied: mode === "apply" && !legalHold && deletedAttestations > 0,
    };
  }

  async recoverProviderCatalogConformanceReceiptsFromPacketEscrow(
    mode: "dry_run" | "apply"
  ): Promise<MediaPipelineProviderCatalogConformancePacketEscrowRecoveryResult> {
    const inventory = await this.store.providerCatalogConformancePacketInventory();
    const seenPackets = new Set<string>();
    let validPackets = 0;
    let invalidPackets = inventory.invalidRecords;
    let recordsReceived = 0;
    let eligibleRecords = 0;
    let importedRecords = 0;
    let duplicateRecords = 0;
    let invalidReceiptIntegrityRecords = 0;
    let invalidPayloadRecords = 0;

    for (const record of inventory.records) {
      if (seenPackets.has(record.packetDigest)) continue;
      seenPackets.add(record.packetDigest);
      const integrityStatus = verifyPacketIntegrity(record.packet, this.config);
      if (integrityStatus !== "valid_signed" && integrityStatus !== "valid_unsigned") {
        invalidPackets += 1;
        continue;
      }
      validPackets += 1;
      const result = await this.importProviderCatalogConformanceReceiptPacket(
        record.packet,
        mode
      );
      recordsReceived += result.recordsReceived;
      eligibleRecords += result.eligibleRecords;
      importedRecords += result.importedRecords;
      duplicateRecords += result.duplicateRecords;
      invalidReceiptIntegrityRecords += result.invalidReceiptIntegrityRecords;
      invalidPayloadRecords += result.invalidPayloadRecords;
    }

    return {
      generatedAt: nowIso(this.now),
      mode,
      packetsScanned: inventory.records.length,
      validPackets,
      invalidPackets,
      duplicatePacketDigests: inventory.duplicatePacketDigests,
      recordsReceived,
      eligibleRecords,
      importedRecords,
      duplicateRecords,
      invalidReceiptIntegrityRecords,
      invalidPayloadRecords,
      applied: mode === "apply" && importedRecords > 0,
      dryRun: mode === "dry_run",
    };
  }

  async requestCancellation(jobId: string): Promise<MediaPipelineJob> {
    return this.store.requestCancellation(jobId);
  }

  async requestRetry(jobId: string): Promise<MediaPipelineJob> {
    const job = await this.store.requestRetry(jobId);
    await this.repository.recordQueued(job).catch(() => undefined);
    return job;
  }

  private async cancellationRequested(jobId: string): Promise<boolean> {
    return Boolean((await this.store.get(jobId))?.cancellationRequested);
  }

  private async throwIfCancelled(jobId: string): Promise<void> {
    if (await this.cancellationRequested(jobId)) {
      throw new MediaPipelineError("PIPELINE_CANCELLED", "Media processing was cancelled");
    }
  }

  private callbacks(jobId: string, start: number, end: number): MediaProcessorCallbacks {
    let lastProgress = -1;
    return {
      shouldCancel: () => this.cancellationRequested(jobId),
      onProgress: async (ratio) => {
        const progress = start + (end - start) * clampProgress(ratio);
        if (progress - lastProgress < 1 && progress < end) return;
        lastProgress = progress;
        await this.store.setProgress(jobId, progress);
      },
    };
  }

  private async resolveSource(job: MediaPipelineJob): Promise<string> {
    const configuredRoot = this.runtime.config.filesystemRoot;
    if (!configuredRoot) {
      throw new MediaPipelineError("PIPELINE_NOT_CONFIGURED", "Storage root is not configured");
    }
    const root = await resolveExistingRoot(configuredRoot);
    const candidate = resolvePathInsideRoot(root, job.source.objectKey);
    await assertSafeRegularFile(candidate);
    const canonicalSource = await realpath(candidate);
    if (!isPathInside(root, canonicalSource)) {
      throw new MediaPipelineError("PIPELINE_SOURCE_INVALID", "Version source resolves outside its storage root");
    }
    await assertSafeRegularFile(canonicalSource);
    const receipt = this.requireValidSourceReceipt(job.source);
    if (receipt) {
      const inspection = await this.runtime.adapter.inspectStoredObject(receipt.objectKey);
      if (!inspection) {
        throw new MediaPipelineError(
          "PIPELINE_SOURCE_MISSING",
          "Version source receipt no longer resolves to a stored object"
        );
      }
      if (inspection.size !== receipt.size || inspection.sha256 !== receipt.sha256) {
        throw new MediaPipelineError(
          "PIPELINE_SOURCE_CHANGED",
          "Stored source object no longer matches its authoritative receipt"
        );
      }
    }
    const sourceStatus = await stat(canonicalSource);
    if (!sourceStatus.isFile()) {
      throw new MediaPipelineError("PIPELINE_SOURCE_MISSING", "Version source is not a regular file");
    }
    const expectedSize = job.source.expectedSize ?? receipt?.size ?? null;
    if (
      expectedSize !== null &&
      (!Number.isSafeInteger(expectedSize) || sourceStatus.size !== expectedSize)
    ) {
      throw new MediaPipelineError(
        "PIPELINE_SOURCE_CHANGED",
        "Version source size no longer matches its authoritative version record"
      );
    }
    if (sourceStatus.size > this.config.maxSourceBytes) {
      throw new MediaPipelineError(
        "PIPELINE_SOURCE_TOO_LARGE",
        "Version source exceeds the configured local worker limit"
      );
    }
    return canonicalSource;
  }

  private async stageSource(
    job: MediaPipelineJob,
    sourcePath: string,
    workspace: string
  ): Promise<PreparedSource> {
    const sourceStatus = await stat(sourcePath);
    const destination = join(workspace, "source" + (extname(job.source.filename) || ".media"));
    const temporary = destination + ".partial";
    const output = await open(temporary, "wx", 0o600);
    const hash = createHash("sha256");
    let bytes = 0;
    let closed = false;
    const input = createReadStream(sourcePath);

    try {
      for await (const chunk of input) {
        await this.throwIfCancelled(job.id);
        const buffer = Buffer.from(chunk);
        let offset = 0;
        while (offset < buffer.length) {
          const result = await output.write(buffer, offset, buffer.length - offset, null);
          if (result.bytesWritten <= 0) {
            throw new MediaPipelineError("PIPELINE_PUBLISH_FAILED", "Pipeline staging made no progress", true);
          }
          offset += result.bytesWritten;
        }
        hash.update(buffer);
        bytes += buffer.length;
        await this.store.setProgress(
          job.id,
          3 + (sourceStatus.size > 0 ? Math.min(1, bytes / sourceStatus.size) * 9 : 9)
        );
      }
      await output.sync();
      await output.close();
      closed = true;
      await rename(temporary, destination);
      const sha256 = hash.digest("hex");
      const postCopySource = await checksumFile(sourcePath);
      if (
        postCopySource.size !== bytes ||
        postCopySource.sha256 !== sha256 ||
        bytes !== sourceStatus.size
      ) {
        throw new MediaPipelineError(
          "PIPELINE_SOURCE_CHANGED",
          "Version source changed while the worker was staging it",
          true
        );
      }
      const expectedSha256 = job.source.expectedSha256 ?? job.source.receipt?.sha256 ?? null;
      if (expectedSha256 && expectedSha256 !== sha256) {
        throw new MediaPipelineError(
          "PIPELINE_SOURCE_CHANGED",
          "Version source checksum no longer matches its authoritative ingest receipt"
        );
      }
      return { path: destination, sha256, size: bytes };
    } catch (error) {
      input.destroy();
      if (!closed) await output.close().catch(() => undefined);
      await unlink(temporary).catch(() => undefined);
      await unlink(destination).catch(() => undefined);
      throw error;
    }
  }

  private async quarantine(
    job: MediaPipelineJob,
    source: PreparedSource
  ): Promise<{ outcome: "clean"; job: MediaPipelineJob } | { outcome: "quarantined" }> {
    const result = await this.scanner.scan({
      uploadId: job.id,
      provider: this.runtime.adapter.kind,
      filename: job.source.filename,
      mimeType: mediaMimeType(job.source.filename),
      size: source.size,
      sha256: source.sha256,
      openStream: async () => createReadStream(source.path),
    });
    const scanned = await this.store.setScan(
      job.id,
      scanReceipt(result, source, this.runtime.adapter.kind)
    );
    if (result.verdict === "clean") return { outcome: "clean", job: scanned };
    if (result.verdict === "infected") {
      const final = await this.store.markQuarantined(
        scanned.id,
        "PIPELINE_QUARANTINED",
        "Security scan did not clear the version"
      );
      await this.repository.recordTerminal(final).catch(() => undefined);
      return { outcome: "quarantined" };
    }
    if (result.verdict === "pending") {
      const final = await this.store.markQuarantined(
        scanned.id,
        "PIPELINE_QUARANTINE_PENDING",
        "Security scan is required before processing can continue"
      );
      await this.repository.recordTerminal(final).catch(() => undefined);
      return { outcome: "quarantined" };
    }
    throw new MediaPipelineError(
      "PIPELINE_QUARANTINE_ERROR",
      "Security scan could not produce a trusted verdict",
      true
    );
  }

  private async buildArtifacts(
    job: MediaPipelineJob,
    sourcePath: string,
    workspace: string
  ): Promise<MediaPipelineArtifacts> {
    if (!job.probe) {
      throw new MediaPipelineError("PIPELINE_STATE_CORRUPT", "Pipeline cannot render without a probe result");
    }
    const hlsDirectory = join(workspace, "hls");
    const transcodeCallbacks = this.callbacks(job.id, 28, 64);
    await this.processor.transcodeHls(sourcePath, hlsDirectory, job.probe, transcodeCallbacks);
    await this.throwIfCancelled(job.id);
    const hlsFiles = await collectSafeFiles(hlsDirectory);
    const playlistPath = hlsFiles.find((path) => path.endsWith(".m3u8"));
    const segmentPaths = hlsFiles.filter((path) => path !== playlistPath);
    if (!playlistPath || segmentPaths.length === 0) {
      throw new MediaPipelineError("PIPELINE_PUBLISH_FAILED", "HLS render did not produce a playlist and segments");
    }

    await this.store.setStage(job.id, "derivatives", 65);
    const generation = job.attempt;
    const segments = [];
    for (const path of segmentPaths) {
      await this.throwIfCancelled(job.id);
      const stored = await uploadDerivative(this.runtime.adapter, job, {
        path,
        kind: "hls_segment",
        filename: relativeArtifactName(hlsDirectory, path),
        generation,
        suffix: "hls-segment-" + relativeArtifactName(hlsDirectory, path),
      });
      segments.push(stored.artifact);
    }
    const playlist = (
      await uploadDerivative(this.runtime.adapter, job, {
        path: playlistPath,
        kind: "hls_playlist",
        filename: "playlist.m3u8",
        generation,
        suffix: "hls-playlist",
      })
    ).artifact;
    const hlsManifestPath = join(workspace, "hls-manifest.json");
    await writePipelineJson(hlsManifestPath, {
      schemaVersion: 1,
      type: "hls_delivery_manifest",
      versionId: job.versionId,
      playlist: {
        filename: playlist.filename,
        objectKey: playlist.objectKey,
        sha256: playlist.sha256,
      },
      segments: segments.map((segment) => ({
        filename: segment.filename,
        objectKey: segment.objectKey,
        sha256: segment.sha256,
      })),
    });
    const manifest = (
      await uploadDerivative(this.runtime.adapter, job, {
        path: hlsManifestPath,
        kind: "hls_manifest",
        generation,
        suffix: "hls-manifest",
      })
    ).artifact;

    const thumbnailPath = join(workspace, "poster.jpg");
    const thumbnailOutput = await this.processor.generateThumbnail(
      sourcePath,
      thumbnailPath,
      job.probe,
      this.callbacks(job.id, 65, 72)
    );
    const thumbnail = thumbnailOutput
      ? (
          await uploadDerivative(this.runtime.adapter, job, {
            path: thumbnailOutput,
            kind: "thumbnail",
            generation,
            suffix: "thumbnail",
          })
        ).artifact
      : null;

    const waveformPath = join(workspace, "waveform.png");
    const waveformOutput = await this.processor.generateWaveform(
      sourcePath,
      waveformPath,
      job.probe,
      this.callbacks(job.id, 72, 78)
    );
    let waveformArtifact;
    if (waveformOutput) {
      waveformArtifact = (
        await uploadDerivative(this.runtime.adapter, job, {
          path: waveformOutput,
          kind: "waveform",
          generation,
          suffix: "waveform",
        })
      ).artifact;
    } else {
      const waveformManifest = join(workspace, "waveform-manifest.json");
      await writePipelineJson(waveformManifest, {
        schemaVersion: 1,
        type: "waveform",
        status: "unavailable_no_audio_stream",
        versionId: job.versionId,
      });
      waveformArtifact = (
        await uploadDerivative(this.runtime.adapter, job, {
          path: waveformManifest,
          kind: "waveform_manifest",
          generation,
          suffix: "waveform-manifest",
        })
      ).artifact;
    }

    const captionsPath = join(workspace, "captions.vtt");
    const captions = await this.processor.extractCaptions(
      sourcePath,
      captionsPath,
      job.probe,
      this.callbacks(job.id, 78, 82)
    );
    const captionContentPath = captions.path ?? captionsPath;
    if (!captions.path) {
      await writeFile(
        captionContentPath,
        "WEBVTT\n\nNOTE Captions are pending explicit transcription.\n",
        { mode: 0o600 }
      );
    }
    const captionContent = (
      await uploadDerivative(this.runtime.adapter, job, {
        path: captionContentPath,
        kind: "captions",
        generation,
        suffix: "captions",
      })
    ).artifact;
    const captionManifestPath = join(workspace, "caption-manifest.json");
    await writePipelineJson(captionManifestPath, {
      schemaVersion: 1,
      type: "captions",
      status: captions.status,
      detail: captions.detail,
      versionId: job.versionId,
      sourceSha256: job.sourceSha256,
      transcriptionRequired: captions.status === "pending_transcription",
    });
    const captionManifest = (
      await uploadDerivative(this.runtime.adapter, job, {
        path: captionManifestPath,
        kind: "caption_manifest",
        generation,
        suffix: "caption-manifest",
      })
    ).artifact;

    const pipelineManifestPath = join(workspace, "pipeline-manifest.json");
    const pipelineManifestPayload = {
      schemaVersion: 1,
      type: "co_deliver_media_pipeline_manifest",
      pipelineVersion: "co-deliver-media-pipeline/v1",
      versionId: job.versionId,
      versionNumber: job.source.versionNumber,
      storageProvider: this.runtime.adapter.kind,
      generation,
      pipelineConfigHash: pipelineConfigHash(this.config, this.runtime.adapter.kind),
      storagePolicy: storagePolicyDiagnostics(this.config, {
        external: this.runtime.adapter.external,
        capabilities: this.runtime.adapter.capabilities,
      }),
      encryptionPolicy: encryptionPolicyDiagnostics(this.config, this.now()),
      source: {
        size: job.sourceSize,
        sha256: job.sourceSha256,
        receipt: sourceReceiptEvidence(job.source.receipt),
      },
      scan: job.scan,
      probe: job.probe,
      artifacts: {
        hls: {
          playlist: {
            objectKey: playlist.objectKey,
            sha256: playlist.sha256,
          },
          manifest: {
            objectKey: manifest.objectKey,
            sha256: manifest.sha256,
          },
          segments: segments.map((segment) => ({
            objectKey: segment.objectKey,
            sha256: segment.sha256,
          })),
        },
        thumbnail: thumbnail
          ? {
              objectKey: thumbnail.objectKey,
              sha256: thumbnail.sha256,
            }
          : null,
        waveform: {
          objectKey: waveformArtifact.objectKey,
          sha256: waveformArtifact.sha256,
        },
        captions: {
          content: {
            objectKey: captionContent.objectKey,
            sha256: captionContent.sha256,
          },
          manifest: {
            objectKey: captionManifest.objectKey,
            sha256: captionManifest.sha256,
          },
          status: captions.status,
        },
      },
      execution: {
        ffmpegCommand: basename(this.config.ffmpegPath),
        ffprobeCommand: basename(this.config.ffprobePath),
      },
    };
    await writePipelineJson(
      pipelineManifestPath,
      signManifestPayload(pipelineManifestPayload, this.config)
    );
    const pipelineManifest = (
      await uploadDerivative(this.runtime.adapter, job, {
        path: pipelineManifestPath,
        kind: "pipeline_manifest",
        generation,
        suffix: "pipeline-manifest",
      })
    ).artifact;

    return {
      hls: { playlist, segments, manifest },
      thumbnail,
      waveform: waveformArtifact,
      captions: {
        content: captionContent,
        manifest: captionManifest,
        status: captions.status,
      },
      pipelineManifest,
    };
  }

  private async publish(job: MediaPipelineJob): Promise<MediaPipelineJob> {
    if (!job.artifacts || !job.probe || !job.sourceSha256 || job.sourceSize === null) {
      throw new MediaPipelineError("PIPELINE_PUBLISH_FAILED", "Pipeline publication is incomplete", true);
    }
    await this.throwIfCancelled(job.id);
    const publishing = await this.store.setStage(job.id, "publish", 94);
    try {
      await this.repository.publish(publishing);
    } catch {
      throw new MediaPipelineError(
        "PIPELINE_PUBLISH_FAILED",
        "Pipeline derivatives were stored but publication metadata could not be committed",
        true
      );
    }
    const final = await this.store.markPublished(job.id);
    await this.emit(final, "media_pipeline_jobs_total", 1, { event: "published" });
    return final;
  }

  private classifyError(error: unknown): MediaPipelineError {
    if (isMediaPipelineError(error)) return error;
    if (isStorageError(error)) {
      return new MediaPipelineError(
        "PIPELINE_PUBLISH_FAILED",
        "Storage adapter rejected a media pipeline operation",
        error.retryable
      );
    }
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ENOSPC" || code === "EIO" || code === "ESTALE" || code === "ETIMEDOUT") {
      return new MediaPipelineError("PIPELINE_PUBLISH_FAILED", "Media pipeline encountered a transient storage error", true);
    }
    return new MediaPipelineError(
      "PIPELINE_PUBLISH_FAILED",
      error instanceof Error ? error.message.slice(0, 600) : "Media pipeline failed unexpectedly",
      true
    );
  }

  private async terminalFromError(jobId: string, error: unknown): Promise<MediaPipelineRunResult> {
    const pipelineError = this.classifyError(error);
    const job = await this.store.get(jobId);
    if (!job) return { outcome: "not_found", job: null };
    if (pipelineError.code === "PIPELINE_CANCELLED") {
      const final = await this.store.markCancelled(jobId);
      await this.repository.recordTerminal(final).catch(() => undefined);
      await this.emit(final, "media_pipeline_jobs_total", 1, { event: "cancelled" });
      return { outcome: "cancelled", job: final };
    }

    const failure: MediaPipelineFailure = {
      code: pipelineError.code,
      message: publicPipelineErrorMessage(pipelineError),
      retryable: pipelineError.retryable,
      at: nowIso(this.now),
    };
    if (pipelineError.retryable && job.attempt < job.maxAttempts) {
      const retryAt = new Date(this.now().getTime() + retryDelayMs(job.attempt, this.config));
      const final = await this.store.markRetry(jobId, failure, retryAt);
      await this.repository.recordRetry(final).catch(() => undefined);
      await this.emit(final, "media_pipeline_failures_total", 1, {
        code: pipelineError.code,
        outcome: "retry",
      });
      return { outcome: "retry_scheduled", job: final };
    }
    const final = await this.store.markFailed(jobId, failure);
    await this.repository.recordTerminal(final).catch(() => undefined);
    await this.emit(final, "media_pipeline_failures_total", 1, {
      code: pipelineError.code,
      outcome: "failed",
    });
    return { outcome: "failed", job: final };
  }

  private async execute(job: MediaPipelineJob): Promise<MediaPipelineRunResult> {
    const startedAt = this.now().getTime();
    try {
      await this.throwIfCancelled(job.id);
      await this.requireStorageReady();
      if (job.artifacts && job.probe && job.sourceSha256 && job.sourceSize !== null) {
        const final = await this.publish(job);
        return { outcome: "published", job: final };
      }

      const working = await this.store.setStage(job.id, "ingest", 2);
      const workspace = await this.store.workspace(working.id, working.attempt);
      try {
        const sourcePath = await this.resolveSource(working);
        const source = await this.stageSource(working, sourcePath, workspace);
        let current = await this.store.setIngested(working.id, { sha256: source.sha256, size: source.size });
        await this.emit(current, "media_pipeline_bytes_total", source.size, { direction: "ingest" });

        current = await this.store.setStage(current.id, "quarantine", 14);
        const quarantine = await this.quarantine(current, source);
        if (quarantine.outcome === "quarantined") {
          const final = await this.store.get(current.id);
          return { outcome: "quarantined", job: final };
        }
        current = quarantine.job;

        await this.throwIfCancelled(current.id);
        current = await this.store.setStage(current.id, "probe", 20);
        const probe = await this.processor.probe(source.path, {
          shouldCancel: () => this.cancellationRequested(current.id),
        });
        if (!probe.hasVideo && !probe.hasAudio) {
          throw new MediaPipelineError(
            "PIPELINE_UNSUPPORTED_MEDIA",
            "Version does not contain a processable video or audio stream"
          );
        }
        current = await this.store.setProbe(current.id, probe);
        current = await this.store.setStage(current.id, "transcode", 28);
        const artifacts = await this.buildArtifacts(current, source.path, workspace);
        current = await this.store.setArtifacts(current.id, artifacts);
        const final = await this.publish(current);
        await this.emit(final, "media_pipeline_stage_duration_ms", this.now().getTime() - startedAt, {
          stage: "end_to_end",
        });
        return { outcome: "published", job: final };
      } finally {
        await this.store.removeWorkspace(working.id, working.attempt).catch(() => undefined);
      }
    } catch (error) {
      return this.terminalFromError(job.id, error);
    }
  }

  async runJob(jobId: string): Promise<MediaPipelineRunResult> {
    let current = await this.store.get(jobId);
    if (!current) return { outcome: "not_found", job: null };
    if (["published", "failed", "cancelled", "quarantined"].includes(current.status)) {
      return { outcome: "already_terminal", job: current };
    }
    if (
      current.status === "running" &&
      current.lease &&
      Date.parse(current.lease.expiresAt) > this.now().getTime()
    ) {
      return { outcome: "busy", job: current };
    }
    if (current.status === "running") {
      current = await this.store.recoverExpired(current.id);
    }
    if (current.cancellationRequested) {
      const final = await this.store.markCancelled(current.id);
      await this.repository.recordTerminal(final).catch(() => undefined);
      return { outcome: "cancelled", job: final };
    }
    if (
      current.status === "retry_wait" &&
      current.retryAt &&
      Date.parse(current.retryAt) > this.now().getTime()
    ) {
      return { outcome: "not_eligible", job: current };
    }

    const slot = await this.store.acquireWorkerSlot(
      this.config.maxConcurrentJobs,
      this.config.workerLeaseMs
    );
    if (!slot) return { outcome: "busy", job: current };
    try {
      const lease = await this.store.acquireJobLease(current.id, this.config.jobLeaseMs);
      if (!lease) return { outcome: "not_claimed", job: await this.store.get(current.id) };
      try {
        await this.repository.recordRunning(lease.job).catch(() => undefined);
        return await this.execute(lease.job);
      } finally {
        await lease.release();
      }
    } finally {
      await slot.release();
    }
  }

  async recoverAndRunNext(): Promise<MediaPipelineRunResult> {
    const eligible = await this.store.listEligible(25);
    if (eligible.length === 0) return { outcome: "not_found", job: null };
    const first = eligible[0];
    await this.emit(first, "media_pipeline_queue_depth", eligible.length, {
      event: "worker_poll",
    });
    if (first.status === "running") {
      await this.store.recoverExpired(first.id);
    }
    return this.runJob(first.id);
  }

  async diagnostics(): Promise<MediaPipelineWorkerDiagnostics> {
    const [queue, storage] = await Promise.all([
      this.store.diagnoseQueue({
        maxActiveJobsPerProject: this.config.maxActiveJobsPerProject,
        maxActiveBytesPerProject: this.config.maxActiveBytesPerProject,
      }, {
        queuedMs: this.config.sloQueuedMs,
        eligibleMs: this.config.sloEligibleMs,
        runningMs: this.config.sloRunningMs,
        retryReadyMs: this.config.sloRetryReadyMs,
      }),
      this.runtime.adapter.diagnose(),
    ]);
    const checkCounts = { pass: 0, warn: 0, fail: 0 };
    for (const check of storage.checks) {
      checkCounts[check.status] += 1;
    }
    const policy = storagePolicyDiagnostics(this.config, storage);
    const encryption = encryptionPolicyDiagnostics(this.config, this.now());
    const sourceReceipts = await this.sourceReceiptDiagnostics();
    const receiptCatalogCheckpointResetReceipts =
      await this.receiptCatalogCheckpointResetReceiptDiagnostics();
    const receiptCatalogCheckpointResetReceiptPacketEscrow =
      await this.receiptCatalogCheckpointResetReceiptPacketEscrowDiagnostics();
    const receiptCatalogCheckpointResetReceiptPacketQuarantine =
      await this.receiptCatalogCheckpointResetReceiptPacketQuarantineDiagnostics();
    const providerCatalogConformancePacketEscrow =
      await this.providerCatalogConformancePacketEscrowDiagnostics();
    const providerCatalogConformancePacketQuarantineAttestations =
      await this.providerCatalogConformancePacketQuarantineAttestationDiagnostics();
    return {
      ...queue,
      provider: this.runtime.adapter.kind,
      storage: {
        label: storage.label,
        configured: storage.configured,
        external: storage.external,
        writeEnabled: storage.writeEnabled,
        readyForWrites: storage.readyForWrites,
        observedAt: storage.observedAt,
        capacity: storage.capacity
          ? {
              availableBytes: storage.capacity.availableBytes,
              reservedBytes: storage.capacity.reservedBytes,
            }
          : null,
        checkCounts,
      },
      limits: {
        maxConcurrentJobs: this.config.maxConcurrentJobs,
        maxSourceBytes: this.config.maxSourceBytes,
        maxActiveJobsPerProject: this.config.maxActiveJobsPerProject,
        maxActiveBytesPerProject: this.config.maxActiveBytesPerProject,
        maxLifecycleInspectionArtifacts: this.config.maxLifecycleInspectionArtifacts,
        sloQueuedMs: this.config.sloQueuedMs,
        sloEligibleMs: this.config.sloEligibleMs,
        sloRunningMs: this.config.sloRunningMs,
        sloRetryReadyMs: this.config.sloRetryReadyMs,
        maxAttempts: this.config.maxAttempts,
        retryBaseMs: this.config.retryBaseMs,
        retryCapMs: this.config.retryCapMs,
        egressPolicy: this.config.egressPolicy,
        requiredStorageCapabilities: [...this.config.requiredStorageCapabilities],
        requiredResidency: this.config.requiredResidency,
        requireSourceReceipt: this.config.requireSourceReceipt,
        keyRotationDueAt: this.config.keyRotationDueAt,
        blockOnOverdueKeyRotation: this.config.blockOnOverdueKeyRotation,
        manifestSigningEnabled: Boolean(this.config.manifestSigningKey),
        manifestVerificationKeyCount: this.config.manifestVerificationKeys.length,
        requireManifestSignature: this.config.requireManifestSignature,
      },
      pressure: {
        workerSlotsUsed: queue.runningJobs,
        eligibleOverCapacity: Math.max(0, queue.eligibleJobs - this.config.maxConcurrentJobs),
        projectJobQuotaBreaches: queue.quota.projectsOverJobQuota,
        projectByteQuotaBreaches: queue.quota.projectsOverByteQuota,
        sloBreaches:
          queue.slo.queuedBreaches +
          queue.slo.eligibleBreaches +
          queue.slo.runningBreaches +
          queue.slo.retryReadyBreaches,
        storageReady: storage.readyForWrites,
        policyReady: policy.ready,
        encryptionReady: encryption.ready,
      },
      policy,
      encryption,
      sourceReceipts,
      restoreReceipts: await this.restoreReceiptDiagnostics(),
      receiptCatalogCheckpointResetReceipts,
      receiptCatalogCheckpointResetReceiptPacketEscrow,
      receiptCatalogCheckpointResetReceiptPacketQuarantine,
      providerCatalogConformancePacketEscrow,
      providerCatalogConformancePacketQuarantineAttestations,
      lifecycle: await this.lifecycleDiagnostics(),
      replay: await this.replayDiagnostics(),
    };
  }

  private async readStoredText(objectKey: string, maxBytes: number): Promise<string | "oversize"> {
    const stream = await this.runtime.adapter.openStoredObjectReadStream(objectKey);
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of stream) {
      const buffer = Buffer.from(chunk);
      size += buffer.length;
      if (size > maxBytes) return "oversize";
      chunks.push(buffer);
    }
    return Buffer.concat(chunks).toString("utf8");
  }

  private async replayDiagnostics(): Promise<MediaPipelineReplayDiagnostics> {
    const inventory = await this.store.replayManifestInventory();
    const manifestInspectionLimit = this.config.maxLifecycleInspectionArtifacts;
    const referencesToInspect = inventory.references.slice(0, manifestInspectionLimit);
    let missingManifests = 0;
    let unreadableManifests = 0;
    let checksumMismatchManifests = 0;
    let invalidJsonManifests = 0;
    let missingIntegrityManifests = 0;
    let integrityMismatchManifests = 0;
    let signedManifests = 0;
    let unsignedManifests = 0;
    let unverifiedSignatureManifests = 0;
    let missingSignatureManifests = 0;
    let invalidSignatureManifests = 0;
    let semanticMismatchManifests = 0;
    let oversizeManifests = 0;

    for (const reference of referencesToInspect) {
      const inspection = await this.runtime.adapter.inspectStoredObject(reference.manifest.objectKey);
      if (!inspection) {
        missingManifests += 1;
        continue;
      }
      if (inspection.size !== reference.manifest.size || inspection.sha256 !== reference.manifest.sha256) {
        checksumMismatchManifests += 1;
        continue;
      }
      if (inspection.size > this.config.maxReplayManifestBytes) {
        oversizeManifests += 1;
        continue;
      }

      let raw: string | "oversize";
      try {
        raw = await this.readStoredText(
          reference.manifest.objectKey,
          this.config.maxReplayManifestBytes
        );
      } catch {
        unreadableManifests += 1;
        continue;
      }
      if (raw === "oversize") {
        oversizeManifests += 1;
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        invalidJsonManifests += 1;
        continue;
      }
      const integrity = verifyManifestIntegrity(parsed, this.config);
      if (integrity === "missing_integrity") missingIntegrityManifests += 1;
      else if (integrity === "payload_mismatch") integrityMismatchManifests += 1;
      else if (integrity === "valid_signed") signedManifests += 1;
      else if (integrity === "valid_unsigned") unsignedManifests += 1;
      else if (integrity === "unverified_signature") unverifiedSignatureManifests += 1;
      else if (integrity === "missing_signature") missingSignatureManifests += 1;
      else if (integrity === "invalid_signature") invalidSignatureManifests += 1;
      if (!replayManifestMatches(reference, parsed)) {
        semanticMismatchManifests += 1;
      }
    }

    const drift =
      missingManifests +
      unreadableManifests +
      checksumMismatchManifests +
      invalidJsonManifests +
      (this.config.requireManifestSignature ? missingIntegrityManifests : 0) +
      integrityMismatchManifests +
      (this.config.requireManifestSignature ? unverifiedSignatureManifests : 0) +
      missingSignatureManifests +
      invalidSignatureManifests +
      semanticMismatchManifests +
      oversizeManifests;

    return {
      generatedAt: inventory.generatedAt,
      manifestInspectionLimit,
      manifestInspectionTruncated: inventory.references.length > manifestInspectionLimit,
      inspectedManifests: referencesToInspect.length,
      missingManifests,
      unreadableManifests,
      checksumMismatchManifests,
      invalidJsonManifests,
      missingIntegrityManifests,
      integrityMismatchManifests,
      signedManifests,
      unsignedManifests,
      unverifiedSignatureManifests,
      missingSignatureManifests,
      invalidSignatureManifests,
      signatureRequired: this.config.requireManifestSignature,
      signatureVerificationEnabled: this.config.manifestVerificationKeys.length > 0,
      semanticMismatchManifests,
      oversizeManifests,
      publishedManifests: inventory.publishedManifests,
      recoverableManifests: inventory.recoverableManifests,
      driftDetected: drift > 0,
      maxManifestBytes: this.config.maxReplayManifestBytes,
    };
  }

  private async restoreReceiptDiagnostics(): Promise<MediaPipelineRestoreReceiptDiagnostics> {
    const inventory = await this.store.restoreReceiptInventory();
    const inspectionLimit = this.config.maxLifecycleInspectionArtifacts;
    const referencesToInspect = inventory.references.slice(0, inspectionLimit);
    const indexedReceiptSha256 = new Set(inventory.references.map((reference) => reference.sha256));
    let missingReceiptObjects = 0;
    let checksumMismatchReceipts = 0;
    let unreadableReceipts = 0;
    let invalidJsonReceipts = 0;
    let missingIntegrityReceipts = 0;
    let integrityMismatchReceipts = 0;
    let signedReceipts = 0;
    let unsignedReceipts = 0;
    let unverifiedSignatureReceipts = 0;
    let missingSignatureReceipts = 0;
    let invalidSignatureReceipts = 0;
    let attestationPayloadMismatchReceipts = 0;
    let statusDriftReceipts = 0;

    for (const reference of referencesToInspect) {
      const inspection = await this.runtime.adapter.inspectStoredObject(reference.objectKey);
      if (!inspection) {
        missingReceiptObjects += 1;
        continue;
      }
      if (inspection.size !== reference.size || inspection.sha256 !== reference.sha256) {
        checksumMismatchReceipts += 1;
        continue;
      }

      let raw: string | "oversize";
      try {
        raw = await this.readStoredText(reference.objectKey, this.config.maxReplayManifestBytes);
      } catch {
        unreadableReceipts += 1;
        continue;
      }
      if (raw === "oversize") {
        unreadableReceipts += 1;
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        invalidJsonReceipts += 1;
        continue;
      }

      const integrity = verifyReceiptIntegrity(parsed, this.config);
      if (integrity === "missing_integrity") missingIntegrityReceipts += 1;
      else if (integrity === "payload_mismatch") integrityMismatchReceipts += 1;
      else if (integrity === "valid_signed") signedReceipts += 1;
      else if (integrity === "valid_unsigned") unsignedReceipts += 1;
      else if (integrity === "unverified_signature") unverifiedSignatureReceipts += 1;
      else if (integrity === "missing_signature") missingSignatureReceipts += 1;
      else if (integrity === "invalid_signature") invalidSignatureReceipts += 1;

      const receipt = asRecord(parsed);
      const attestation = nestedRecord(receipt ?? {}, "attestation");
      const evidence = nestedRecord(receipt ?? {}, "evidence");
      const attestationPayloadSha256 = stringField(evidence, "attestationPayloadSha256");
      const evidenceStatus = stringField(evidence, "status");
      const evidenceReady = evidence?.ready;
      const attestationStatus = stringField(attestation, "status");
      const attestationReady = attestation?.ready;
      if (
        !attestationPayloadSha256 ||
        !equalHex(attestationPayloadSha256, sha256Hex(canonicalJson(attestation))) ||
        !equalHex(attestationPayloadSha256, reference.attestationPayloadSha256)
      ) {
        attestationPayloadMismatchReceipts += 1;
      }
      if (
        evidenceStatus !== reference.attestationStatus ||
        attestationStatus !== reference.attestationStatus ||
        evidenceReady !== reference.attestationReady ||
        attestationReady !== reference.attestationReady
      ) {
        statusDriftReceipts += 1;
      }
    }

    const catalogRecovery = await this.restoreReceiptCatalogRecoveryDiagnostics(
      indexedReceiptSha256,
      inspectionLimit
    );

    const drift =
      inventory.versionsMissingReceipt +
      inventory.duplicateReceiptVersions +
      inventory.invalidReceiptRecords +
      missingReceiptObjects +
      checksumMismatchReceipts +
      unreadableReceipts +
      invalidJsonReceipts +
      (this.config.requireManifestSignature ? missingIntegrityReceipts : 0) +
      integrityMismatchReceipts +
      (this.config.requireManifestSignature ? unverifiedSignatureReceipts : 0) +
      missingSignatureReceipts +
      invalidSignatureReceipts +
      attestationPayloadMismatchReceipts +
      statusDriftReceipts +
      (catalogRecovery.repairRequired ? 1 : 0);

    return {
      generatedAt: inventory.generatedAt,
      inspectionLimit,
      inspectionTruncated: inventory.references.length > inspectionLimit,
      publishedVersions: inventory.publishedVersions,
      versionsWithReceipt: inventory.versionsWithReceipt,
      versionsMissingReceipt: inventory.versionsMissingReceipt,
      duplicateReceiptVersions: inventory.duplicateReceiptVersions,
      totalReceipts: inventory.references.length,
      invalidReceiptRecords: inventory.invalidReceiptRecords,
      inspectedReceipts: referencesToInspect.length,
      missingReceiptObjects,
      checksumMismatchReceipts,
      unreadableReceipts,
      invalidJsonReceipts,
      missingIntegrityReceipts,
      integrityMismatchReceipts,
      signedReceipts,
      unsignedReceipts,
      unverifiedSignatureReceipts,
      missingSignatureReceipts,
      invalidSignatureReceipts,
      attestationPayloadMismatchReceipts,
      statusDriftReceipts,
      signatureRequired: this.config.requireManifestSignature,
      signatureVerificationEnabled: this.config.manifestVerificationKeys.length > 0,
      driftDetected: drift > 0,
      maxReceiptBytes: this.config.maxReplayManifestBytes,
      catalogRecovery,
    };
  }

  private async receiptCatalogCheckpointResetReceiptDiagnostics(): Promise<MediaPipelineReceiptCatalogCheckpointResetReceiptDiagnostics> {
    const inventory = await this.store.receiptCatalogCheckpointResetReceiptInventory();
    const nowMs = this.now().getTime();
    const maxRecords = this.config.receiptCatalogCheckpointResetReceiptMaxRecords;
    const retentionMs = this.config.receiptCatalogCheckpointResetReceiptRetentionMs;
    const legalHold = this.config.receiptCatalogCheckpointResetReceiptLegalHold;
    const receiptAges = inventory.records.map((record) =>
      Math.max(0, nowMs - Date.parse(record.recordedAt))
    );
    const eligible = inventory.records.filter((record, index) => {
      if (index === 0) return false;
      const ageMs = Math.max(0, nowMs - Date.parse(record.recordedAt));
      return index >= maxRecords || ageMs > retentionMs;
    });
    const eligibleAges = eligible.map((record) =>
      Math.max(0, nowMs - Date.parse(record.recordedAt))
    );
    let invalidIntegrityReceipts = 0;
    let payloadMismatchReceipts = 0;
    let latestIntegrityStatus: MediaPipelineManifestIntegrityStatus | null = null;
    for (const record of inventory.records) {
      const integrityStatus = verifyReceiptIntegrity(record.receipt, this.config);
      if (integrityStatus !== "valid_signed" && integrityStatus !== "valid_unsigned") {
        invalidIntegrityReceipts += 1;
      }
      if (integrityStatus === "payload_mismatch") {
        payloadMismatchReceipts += 1;
      }
      if (record === inventory.latest) {
        latestIntegrityStatus = integrityStatus;
      }
    }
    return {
      generatedAt: inventory.generatedAt,
      receipts: inventory.records.length,
      invalidRecords: inventory.invalidRecords,
      signedReceipts: inventory.signedReceipts,
      unsignedReceipts: inventory.unsignedReceipts,
      invalidIntegrityReceipts,
      payloadMismatchReceipts,
      eligibleReceipts: eligible.length,
      blockedByLegalHold: legalHold ? eligible.length : 0,
      oldestReceiptAgeMs: receiptAges.length > 0 ? Math.max(...receiptAges) : null,
      oldestEligibleReceiptAgeMs:
        eligibleAges.length > 0 ? Math.max(...eligibleAges) : null,
      signatureRequired: this.config.requireManifestSignature,
      signatureVerificationEnabled: this.config.manifestVerificationKeys.length > 0,
      policy: {
        maxRecords,
        retentionMs,
        legalHold,
        preserveLatest: true,
      },
      pressureDetected:
        inventory.invalidRecords > 0 ||
        invalidIntegrityReceipts > 0 ||
        payloadMismatchReceipts > 0 ||
        eligible.length > 0,
      latest: inventory.latest
        ? {
            recordedAt: inventory.latest.recordedAt,
            resetSnapshotDigest: inventory.latest.resetSnapshotDigest,
            deletedCheckpoints: inventory.latest.deletedCheckpoints,
            signed: inventory.latest.receiptSigned,
            integrityStatus: latestIntegrityStatus ?? "missing_integrity",
          }
        : null,
    };
  }

  private async restoreReceiptCatalogRecoveryDiagnostics(
    indexedReceiptSha256: Set<string>,
    scanLimit: number
  ): Promise<MediaPipelineRestoreReceiptDiagnostics["catalogRecovery"]> {
    const [checkpointInventory, resetInventory] = await Promise.all([
      this.store.receiptCatalogCheckpointInventory(),
      this.store.receiptCatalogCheckpointResetInventory(),
    ]);
    if (checkpointInventory.invalidRecords > 0) {
      return {
        supported: false,
        scanRoot: "unsupported",
        scanLimit,
        scannedJsonFiles: 0,
        scanTruncated: false,
        cursorSupported: false,
        pagesScanned: 0,
        checkpointRequired: false,
        nextCursorDigest: null,
        discoveredReceipts: 0,
        unindexedReceipts: 0,
        invalidJsonFiles: 0,
        unsafeEntries: 0,
        repairRequired: true,
        checkpointRecords: checkpointInventory.records.length,
        invalidCheckpointRecords: checkpointInventory.invalidRecords,
        staleCheckpointRecords: checkpointInventory.staleRecords,
        checkpointResetCandidates: resetInventory.fileNames.length,
        unsafeCheckpointResetEntries: resetInventory.unsafeEntries,
        checkpointResetRecommended: true,
        checkpointRecord: {
          recorded: false,
          completed: false,
          stale: false,
          recordedAt: null,
          startedCursorDigest: null,
          nextCursorDigest: null,
          continuationTokenDigest: null,
          continuationTokenKeyDigest: null,
          continuationTokenExpiresAt: null,
          pagesScanned: 0,
        },
      };
    }
    const discovery = await this.discoverRestoreReceiptCatalog(scanLimit);
    const latestCheckpoint =
      checkpointInventory.records.find(
        (record) =>
          record.provider === this.runtime.adapter.kind &&
          record.scanRoot === discovery.scanRoot
      ) ?? null;
    const discoveredReceipts = discovery.receipts.length;
    const unindexedReceipts = discovery.receipts.filter(
      (receipt) => !indexedReceiptSha256.has(receipt.sha256)
    ).length;
    return {
      supported: discovery.supported,
      scanRoot: discovery.scanRoot,
      scanLimit: discovery.scanLimit,
      scannedJsonFiles: discovery.scannedJsonFiles,
      scanTruncated: discovery.scanTruncated,
      cursorSupported: discovery.cursorSupported,
      pagesScanned: discovery.pagesScanned,
      checkpointRequired: discovery.checkpointRequired,
      nextCursorDigest: discovery.nextCursorDigest,
      discoveredReceipts,
      unindexedReceipts,
      invalidJsonFiles: discovery.invalidJsonFiles,
      unsafeEntries: discovery.unsafeEntries,
      repairRequired:
        unindexedReceipts > 0 ||
        discovery.invalidJsonFiles > 0 ||
        discovery.unsafeEntries > 0 ||
        discovery.checkpointRequired,
      checkpointRecords: checkpointInventory.records.length,
      invalidCheckpointRecords: checkpointInventory.invalidRecords,
      staleCheckpointRecords: checkpointInventory.staleRecords,
      checkpointResetCandidates: resetInventory.fileNames.length,
      unsafeCheckpointResetEntries: resetInventory.unsafeEntries,
      checkpointResetRecommended:
        checkpointInventory.invalidRecords > 0 ||
        checkpointInventory.staleRecords > 0 ||
        resetInventory.unsafeEntries > 0,
      checkpointRecord: {
        recorded: Boolean(latestCheckpoint),
        completed: latestCheckpoint?.completed ?? false,
        stale: latestCheckpoint?.stale ?? false,
        recordedAt: latestCheckpoint?.recordedAt ?? null,
        startedCursorDigest: latestCheckpoint?.startedCursorDigest ?? null,
        nextCursorDigest: latestCheckpoint?.nextCursorDigest ?? null,
        continuationTokenDigest: latestCheckpoint?.continuationTokenDigest ?? null,
        continuationTokenKeyDigest: latestCheckpoint?.continuationTokenKeyDigest ?? null,
        continuationTokenExpiresAt: latestCheckpoint?.continuationTokenExpiresAt ?? null,
        pagesScanned: latestCheckpoint?.pagesScanned ?? 0,
      },
    };
  }

  private async discoverRestoreReceiptCatalog(
    scanLimit: number,
    continuationToken: string | null = null
  ): Promise<RestoreReceiptCatalogDiscovery> {
    const localProvider =
      this.runtime.config.provider === "local" || this.runtime.config.provider === "ccnas";
    if (!localProvider) {
      const catalog = mediaPipelineReceiptCatalogCapability(this.runtime.adapter);
      if (catalog) {
        return this.discoverProviderRestoreReceiptCatalog(catalog, scanLimit, continuationToken);
      }
      if (continuationToken) {
        throw new MediaPipelineError(
          "PIPELINE_RECEIPT_CATALOG_CURSOR_INVALID",
          "Receipt catalog continuation token is invalid"
        );
      }
      return {
        supported: false,
        scanRoot: "unsupported",
        scanLimit,
        scannedJsonFiles: 0,
        scanTruncated: false,
        cursorSupported: false,
        pagesScanned: 0,
        checkpointRequired: false,
        nextCursorDigest: null,
        continuationToken: null,
        continuationTokenDigest: null,
        continuationTokenKeyDigest: null,
        continuationTokenExpiresAt: null,
        invalidJsonFiles: 0,
        unsafeEntries: 0,
        receipts: [],
      };
    }
    if (continuationToken) {
      throw new MediaPipelineError(
        "PIPELINE_RECEIPT_CATALOG_CURSOR_INVALID",
        "Receipt catalog continuation token is invalid"
      );
    }
    if (!this.runtime.config.filesystemRoot) {
      return {
        supported: true,
        scanRoot: "tenant-object-namespace",
        scanLimit,
        scannedJsonFiles: 0,
        scanTruncated: false,
        cursorSupported: false,
        pagesScanned: 0,
        checkpointRequired: false,
        nextCursorDigest: null,
        continuationToken: null,
        continuationTokenDigest: null,
        continuationTokenKeyDigest: null,
        continuationTokenExpiresAt: null,
        invalidJsonFiles: 0,
        unsafeEntries: 1,
        receipts: [],
      };
    }

    let root: string;
    try {
      root = await resolveExistingRoot(this.runtime.config.filesystemRoot);
    } catch {
      return {
        supported: true,
        scanRoot: "tenant-object-namespace",
        scanLimit,
        scannedJsonFiles: 0,
        scanTruncated: false,
        cursorSupported: false,
        pagesScanned: 0,
        checkpointRequired: false,
        nextCursorDigest: null,
        continuationToken: null,
        continuationTokenDigest: null,
        continuationTokenKeyDigest: null,
        continuationTokenExpiresAt: null,
        invalidJsonFiles: 0,
        unsafeEntries: 0,
        receipts: [],
      };
    }

    const tenantsRoot = resolvePathInsideRoot(root, "tenants");
    const directories = [tenantsRoot];
    let scannedJsonFiles = 0;
    let scanTruncated = false;
    let invalidJsonFiles = 0;
    let unsafeEntries = 0;
    const receipts: RestoreReceiptCatalogEntry[] = [];

    while (directories.length > 0) {
      const current = directories.pop()!;
      let entries;
      try {
        entries = await readdir(current, { withFileTypes: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        unsafeEntries += 1;
        continue;
      }

      for (const entry of entries) {
        if (entry.isSymbolicLink()) {
          unsafeEntries += 1;
          continue;
        }
        const path = join(current, entry.name);
        const relation = relative(root, path);
        if (!relation || relation === ".." || relation.startsWith(".." + sep)) {
          unsafeEntries += 1;
          continue;
        }
        if (entry.isDirectory()) {
          directories.push(path);
          continue;
        }
        if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
        if (scannedJsonFiles >= scanLimit) {
          scanTruncated = true;
          continue;
        }
        scannedJsonFiles += 1;

        let bytes: Buffer;
        try {
          const file = await stat(path);
          if (!file.isFile() || file.size > this.config.maxReplayManifestBytes) {
            unsafeEntries += 1;
            continue;
          }
          bytes = await open(path, "r").then(async (handle) => {
            try {
              return await handle.readFile();
            } finally {
              await handle.close();
            }
          });
        } catch {
          unsafeEntries += 1;
          continue;
        }

        const raw = bytes.toString("utf8");
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          invalidJsonFiles += 1;
          continue;
        }
        if (asRecord(parsed)?.type !== "co_deliver_restore_attestation_receipt") {
          continue;
        }
        receipts.push({
          objectKey: relation.split(sep).join("/"),
          filename: entry.name,
          raw,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          size: bytes.length,
          parsed,
        });
      }
    }

    return {
      supported: true,
      scanRoot: "tenant-object-namespace",
      scanLimit,
      scannedJsonFiles,
      scanTruncated,
      cursorSupported: false,
      pagesScanned: 1,
      checkpointRequired: false,
      nextCursorDigest: null,
      continuationToken: null,
      continuationTokenDigest: null,
      continuationTokenKeyDigest: null,
      continuationTokenExpiresAt: null,
      invalidJsonFiles,
      unsafeEntries,
      receipts,
    };
  }

  private async discoverProviderRestoreReceiptCatalog(
    catalog: ReturnType<typeof mediaPipelineReceiptCatalogCapability> extends infer T
      ? NonNullable<T>
      : never,
    scanLimit: number,
    continuationToken: string | null = null
  ): Promise<RestoreReceiptCatalogDiscovery> {
    let scanTruncated = false;
    let unsafeEntries = 0;
    let scannedJsonFiles = 0;
    let invalidJsonFiles = 0;
    let pagesScanned = 0;
    let priorPagesScanned = 0;
    let cursor: string | null = null;
    let cursorSupported = false;
    let startedCursorDigest: string | null = null;
    let nextCursorDigest: string | null = null;
    if (continuationToken) {
      const decoded = decodeReceiptCatalogContinuationToken({
        token: continuationToken,
        expectedProvider: this.runtime.adapter.kind,
        config: this.config,
        now: this.now,
      });
      cursor = decoded.cursor;
      cursorSupported = true;
      startedCursorDigest = decoded.cursorDigest;
      nextCursorDigest = decoded.cursorDigest;
      priorPagesScanned = decoded.pagesScanned;
    }
    const receipts: RestoreReceiptCatalogEntry[] = [];

    while (scannedJsonFiles < scanLimit) {
      let objects: MediaPipelineReceiptCatalogObject[];
      let nextCursor: unknown;
      try {
        const listing = await catalog.listMediaPipelineReceiptObjects({
          kind: "restore_attestation",
          limit: scanLimit - scannedJsonFiles,
          cursor,
        });
        pagesScanned += 1;
        objects = Array.isArray(listing.objects) ? listing.objects : [];
        nextCursor = listing.nextCursor;
        scanTruncated = scanTruncated || Boolean(listing.truncated) || objects.length > scanLimit - scannedJsonFiles;
        unsafeEntries += Number.isSafeInteger(listing.unsafeEntries)
          ? Math.max(0, Number(listing.unsafeEntries))
          : 0;
      } catch {
        const failureDiscovery = {
          supported: true,
          scanRoot: "provider-catalog",
          scanLimit,
          scannedJsonFiles,
          scanTruncated,
          cursorSupported,
          pagesScanned: priorPagesScanned + pagesScanned,
          startedCursorDigest,
          checkpointRequired: Boolean(cursor),
          nextCursorDigest,
          continuationToken: null,
          continuationTokenDigest: null,
          continuationTokenKeyDigest: null,
          continuationTokenExpiresAt: null,
          invalidJsonFiles,
          unsafeEntries: unsafeEntries + 1,
          receipts,
        } satisfies RestoreReceiptCatalogDiscovery;
        await this.recordReceiptCatalogCheckpoint(failureDiscovery);
        return failureDiscovery;
      }
      const pageObjects = objects.slice(0, Math.max(0, scanLimit - scannedJsonFiles));
      for (const object of pageObjects) {
        if (
          typeof object.objectKey !== "string" ||
          !isCatalogObjectKey(object.objectKey) ||
          !object.objectKey.endsWith(".json") ||
          !Number.isSafeInteger(object.size) ||
          object.size < 0 ||
          object.size > this.config.maxReplayManifestBytes ||
          typeof object.sha256 !== "string" ||
          !isSha256(object.sha256)
        ) {
          unsafeEntries += 1;
          continue;
        }
        scannedJsonFiles += 1;

        let inspection;
        try {
          inspection = await this.runtime.adapter.inspectStoredObject(object.objectKey);
        } catch {
          unsafeEntries += 1;
          continue;
        }
        if (
          !inspection ||
          inspection.size !== object.size ||
          inspection.sha256 !== object.sha256
        ) {
          unsafeEntries += 1;
          continue;
        }

        let raw: string | "oversize";
        try {
          raw = await this.readStoredText(object.objectKey, this.config.maxReplayManifestBytes);
        } catch {
          unsafeEntries += 1;
          continue;
        }
        if (raw === "oversize") {
          unsafeEntries += 1;
          continue;
        }
        const rawBytes = Buffer.from(raw);
        const sha256 = createHash("sha256").update(rawBytes).digest("hex");
        if (rawBytes.length !== object.size || !equalHex(sha256, object.sha256)) {
          unsafeEntries += 1;
          continue;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          invalidJsonFiles += 1;
          continue;
        }
        if (asRecord(parsed)?.type !== "co_deliver_restore_attestation_receipt") {
          continue;
        }
        receipts.push({
          objectKey: object.objectKey,
          filename: object.filename?.trim() || basename(object.objectKey),
          raw,
          sha256,
          size: rawBytes.length,
          parsed,
        });
      }

      if (typeof nextCursor === "string" && nextCursor.trim()) {
        cursorSupported = true;
        cursor = nextCursor;
        nextCursorDigest = sha256Hex(nextCursor);
        if (scannedJsonFiles >= scanLimit) {
          scanTruncated = true;
          break;
        }
        continue;
      }
      if (nextCursor !== null && nextCursor !== undefined) {
        unsafeEntries += 1;
      }
      cursor = null;
      nextCursorDigest = null;
      break;
    }

    const checkpointRequired = Boolean(cursor);
    const continuation =
      checkpointRequired && nextCursorDigest
        ? issueReceiptCatalogContinuationToken({
            provider: this.runtime.adapter.kind,
            cursor: cursor!,
            scanLimit,
            pagesScanned: priorPagesScanned + pagesScanned,
            config: this.config,
            now: this.now,
          })
        : null;
    const discovery = {
      supported: true,
      scanRoot: "provider-catalog",
      scanLimit,
      scannedJsonFiles,
      scanTruncated,
      cursorSupported,
      pagesScanned: priorPagesScanned + pagesScanned,
      startedCursorDigest,
      checkpointRequired,
      nextCursorDigest: checkpointRequired ? nextCursorDigest : null,
      continuationToken: continuation?.token ?? null,
      continuationTokenDigest: continuation?.tokenDigest ?? null,
      continuationTokenKeyDigest: continuation?.tokenKeyDigest ?? null,
      continuationTokenExpiresAt: continuation?.expiresAt ?? null,
      invalidJsonFiles,
      unsafeEntries,
      receipts,
    } satisfies RestoreReceiptCatalogDiscovery;
    await this.recordReceiptCatalogCheckpoint(discovery);
    return discovery;
  }

  private async recordReceiptCatalogCheckpoint(
    discovery: RestoreReceiptCatalogDiscovery
  ): Promise<void> {
    if (discovery.scanRoot !== "provider-catalog") return;
    await this.store.recordReceiptCatalogCheckpoint({
      provider: this.runtime.adapter.kind,
      scanRoot: discovery.scanRoot,
      scanLimit: discovery.scanLimit,
      scannedJsonFiles: discovery.scannedJsonFiles,
      scanTruncated: discovery.scanTruncated,
      cursorSupported: discovery.cursorSupported,
      pagesScanned: discovery.pagesScanned,
      startedCursorDigest: discovery.startedCursorDigest ?? null,
      checkpointRequired: discovery.checkpointRequired,
      nextCursorDigest: discovery.nextCursorDigest,
      continuationTokenDigest: discovery.continuationTokenDigest,
      continuationTokenKeyDigest: discovery.continuationTokenKeyDigest,
      continuationTokenExpiresAt: discovery.continuationTokenExpiresAt,
      discoveredReceipts: discovery.receipts.length,
      invalidJsonFiles: discovery.invalidJsonFiles,
      unsafeEntries: discovery.unsafeEntries,
    });
  }

  private async sourceReceiptDiagnostics(): Promise<MediaPipelineSourceReceiptDiagnostics> {
    const inventory = await this.store.sourceReceiptInventory();
    const inspectionLimit = this.config.maxLifecycleInspectionArtifacts;
    const referencesToInspect = inventory.references.slice(0, inspectionLimit);
    let providerMismatchReceipts = 0;
    let missingStoredObjects = 0;
    let checksumMismatchReceipts = 0;

    for (const reference of referencesToInspect) {
      if (reference.provider !== this.runtime.adapter.kind) {
        providerMismatchReceipts += 1;
        continue;
      }
      const inspection = await this.runtime.adapter.inspectStoredObject(reference.objectKey);
      if (!inspection) {
        missingStoredObjects += 1;
        continue;
      }
      if (inspection.size !== reference.size || inspection.sha256 !== reference.sha256) {
        checksumMismatchReceipts += 1;
      }
    }

    return {
      generatedAt: inventory.generatedAt,
      inspectionLimit,
      inspectionTruncated: inventory.references.length > inspectionLimit,
      totalJobs: inventory.totalJobs,
      jobsWithReceipt: inventory.jobsWithReceipt,
      jobsMissingReceipt: inventory.jobsMissingReceipt,
      activeJobsMissingReceipt: inventory.activeJobsMissingReceipt,
      publishedJobsWithReceipt: inventory.publishedJobsWithReceipt,
      invalidReceiptJobs: inventory.invalidReceiptJobs,
      inspectedReceipts: referencesToInspect.length,
      providerMismatchReceipts,
      missingStoredObjects,
      checksumMismatchReceipts,
      migrationReady:
        inventory.activeJobsMissingReceipt === 0 &&
        inventory.invalidReceiptJobs === 0 &&
        providerMismatchReceipts === 0 &&
        missingStoredObjects === 0 &&
        checksumMismatchReceipts === 0,
    };
  }

  private async lifecycleDiagnostics(): Promise<MediaPipelineLifecycleDiagnostics> {
    const inventory = await this.store.lifecycleInventory();
    const inspectionLimit = this.config.maxLifecycleInspectionArtifacts;
    const referencesToInspect = inventory.references.slice(0, inspectionLimit);
    let missingArtifactReferences = 0;
    let checksumMismatchReferences = 0;

    for (const reference of referencesToInspect) {
      const inspection = await this.runtime.adapter.inspectStoredObject(reference.objectKey);
      if (!inspection) {
        missingArtifactReferences += 1;
        continue;
      }
      if (inspection.size !== reference.size || inspection.sha256 !== reference.sha256) {
        checksumMismatchReferences += 1;
      }
    }

    const terminalReferences = inventory.references.filter(
      (reference) => reference.category === "terminal_orphan_candidate"
    );
    const recoverableReferences = inventory.references.filter(
      (reference) => reference.category === "recoverable_unpublished"
    );
    const publishedReferences = inventory.references.filter(
      (reference) => reference.category === "published"
    );

    return {
      generatedAt: inventory.generatedAt,
      inspectionLimit,
      inspectionTruncated: inventory.references.length > inspectionLimit,
      inspectedArtifactReferences: referencesToInspect.length,
      missingArtifactReferences,
      checksumMismatchReferences,
      terminalOrphanCandidateJobs: inventory.terminalOrphanCandidateJobs,
      terminalOrphanArtifactReferences: terminalReferences.length,
      terminalOrphanBytes: String(sumLifecycleBytes(inventory.references, "terminal_orphan_candidate")),
      recoverableArtifactJobs: inventory.recoverableArtifactJobs,
      recoverableArtifactReferences: recoverableReferences.length,
      recoverableArtifactBytes: String(sumLifecycleBytes(inventory.references, "recoverable_unpublished")),
      publishedArtifactJobs: inventory.publishedArtifactJobs,
      publishedArtifactReferences: publishedReferences.length,
      publishedArtifactBytes: String(sumLifecycleBytes(inventory.references, "published")),
      oldestTerminalOrphanCandidateAgeMs: inventory.oldestTerminalOrphanCandidateAgeMs,
      deleteMode: "disabled",
      policy: {
        lifecycleTieringSupported: this.runtime.adapter.capabilities.includes("lifecycle-tiering"),
        legalHoldSupported: this.runtime.adapter.capabilities.includes("legal-hold"),
        manualAttestationRequired: true,
      },
    };
  }

  private async providerCatalogConformancePacketEscrowDiagnostics(): Promise<MediaPipelineProviderCatalogConformancePacketEscrowDiagnostics> {
    const inventory = await this.store.providerCatalogConformancePacketInventory();
    const nowMs = this.now().getTime();
    const maxRecords = this.config.providerCatalogConformancePacketEscrowMaxRecords;
    const retentionMs = this.config.providerCatalogConformancePacketEscrowRetentionMs;
    const legalHold = this.config.providerCatalogConformancePacketEscrowLegalHold;
    let invalidIntegrityPackets = 0;
    let payloadMismatchPackets = 0;
    const packetAges = inventory.records.map((record) =>
      Math.max(0, nowMs - Date.parse(record.recordedAt))
    );
    const eligible = inventory.records.filter((record, index) => {
      if (index === 0) return false;
      const ageMs = Math.max(0, nowMs - Date.parse(record.recordedAt));
      return index >= maxRecords || ageMs > retentionMs;
    });

    for (const record of inventory.records) {
      const integrityStatus = verifyPacketIntegrity(record.packet, this.config);
      if (integrityStatus !== "valid_signed" && integrityStatus !== "valid_unsigned") {
        invalidIntegrityPackets += 1;
      }
      const payloadDigest = stringField(
        nestedRecord(record.packet, "packetIntegrity"),
        "payloadSha256"
      );
      if (!payloadDigest || !equalHex(payloadDigest, record.packetDigest)) {
        payloadMismatchPackets += 1;
      }
    }

    const eligibleAges = eligible.map((record) =>
      Math.max(0, nowMs - Date.parse(record.recordedAt))
    );
    const blockedByLegalHold = legalHold ? eligible.length : 0;

    return {
      generatedAt: inventory.generatedAt,
      packets: inventory.records.length,
      invalidRecords: inventory.invalidRecords,
      duplicatePacketDigests: inventory.duplicatePacketDigests,
      signedPackets: inventory.signedPackets,
      unsignedPackets: inventory.unsignedPackets,
      invalidIntegrityPackets,
      payloadMismatchPackets,
      eligiblePackets: eligible.length,
      blockedByLegalHold,
      oldestPacketAgeMs: packetAges.length > 0 ? Math.max(...packetAges) : null,
      oldestEligiblePacketAgeMs:
        eligibleAges.length > 0 ? Math.max(...eligibleAges) : null,
      policy: {
        maxRecords,
        retentionMs,
        legalHold,
        preserveLatest: true,
      },
      pressureDetected:
        inventory.invalidRecords > 0 ||
        inventory.duplicatePacketDigests > 0 ||
        invalidIntegrityPackets > 0 ||
        payloadMismatchPackets > 0 ||
        eligible.length > 0,
    };
  }

  private async receiptCatalogCheckpointResetReceiptPacketEscrowDiagnostics(): Promise<MediaPipelineReceiptCatalogCheckpointResetReceiptPacketEscrowDiagnostics> {
    const inventory =
      await this.store.receiptCatalogCheckpointResetReceiptPacketInventory();
    const nowMs = this.now().getTime();
    const maxRecords =
      this.config.receiptCatalogCheckpointResetReceiptPacketEscrowMaxRecords;
    const retentionMs =
      this.config.receiptCatalogCheckpointResetReceiptPacketEscrowRetentionMs;
    const legalHold =
      this.config.receiptCatalogCheckpointResetReceiptPacketEscrowLegalHold;
    let invalidIntegrityPackets = 0;
    let payloadMismatchPackets = 0;
    const packetAges = inventory.records.map((record) =>
      Math.max(0, nowMs - Date.parse(record.recordedAt))
    );
    const eligible = inventory.records.filter((record, index) => {
      if (index === 0) return false;
      const ageMs = Math.max(0, nowMs - Date.parse(record.recordedAt));
      return index >= maxRecords || ageMs > retentionMs;
    });

    for (const record of inventory.records) {
      const integrityStatus = verifyPacketIntegrity(record.packet, this.config);
      if (integrityStatus !== "valid_signed" && integrityStatus !== "valid_unsigned") {
        invalidIntegrityPackets += 1;
      }
      const payloadDigest = stringField(
        nestedRecord(record.packet, "packetIntegrity"),
        "payloadSha256"
      );
      if (!payloadDigest || !equalHex(payloadDigest, record.packetDigest)) {
        payloadMismatchPackets += 1;
      }
    }

    const eligibleAges = eligible.map((record) =>
      Math.max(0, nowMs - Date.parse(record.recordedAt))
    );
    const blockedByLegalHold = legalHold ? eligible.length : 0;

    return {
      generatedAt: inventory.generatedAt,
      packets: inventory.records.length,
      invalidRecords: inventory.invalidRecords,
      duplicatePacketDigests: inventory.duplicatePacketDigests,
      signedPackets: inventory.signedPackets,
      unsignedPackets: inventory.unsignedPackets,
      invalidIntegrityPackets,
      payloadMismatchPackets,
      eligiblePackets: eligible.length,
      blockedByLegalHold,
      oldestPacketAgeMs: packetAges.length > 0 ? Math.max(...packetAges) : null,
      oldestEligiblePacketAgeMs:
        eligibleAges.length > 0 ? Math.max(...eligibleAges) : null,
      policy: {
        maxRecords,
        retentionMs,
        legalHold,
        preserveLatest: true,
      },
      pressureDetected:
        inventory.invalidRecords > 0 ||
        inventory.duplicatePacketDigests > 0 ||
        invalidIntegrityPackets > 0 ||
        payloadMismatchPackets > 0 ||
        eligible.length > 0,
    };
  }

  private async receiptCatalogCheckpointResetReceiptPacketQuarantineDiagnostics(): Promise<MediaPipelineReceiptCatalogCheckpointResetReceiptPacketQuarantineDiagnostics> {
    const inventory =
      await this.store.receiptCatalogCheckpointResetReceiptPacketQuarantineInventory();
    const nowMs = this.now().getTime();
    const maxRecords =
      this.config.receiptCatalogCheckpointResetReceiptPacketQuarantineMaxRecords;
    const retentionMs =
      this.config.receiptCatalogCheckpointResetReceiptPacketQuarantineRetentionMs;
    const legalHold =
      this.config.receiptCatalogCheckpointResetReceiptPacketQuarantineLegalHold;
    const quarantineAges = inventory.records.map((record) =>
      Math.max(0, nowMs - Date.parse(record.quarantinedAt))
    );
    const eligible = inventory.records.filter((record, index) => {
      if (index === 0) return false;
      const ageMs = Math.max(0, nowMs - Date.parse(record.quarantinedAt));
      return index >= maxRecords || ageMs > retentionMs;
    });
    const eligibleAges = eligible.map((record) =>
      Math.max(0, nowMs - Date.parse(record.quarantinedAt))
    );
    const blockedByLegalHold = legalHold ? eligible.length : 0;

    return {
      generatedAt: inventory.generatedAt,
      quarantinedPackets: inventory.records.length,
      invalidRecords: inventory.invalidRecords,
      malformedRecordQuarantines: inventory.malformedRecordQuarantines,
      invalidIntegrityQuarantines: inventory.invalidIntegrityQuarantines,
      payloadMismatchQuarantines: inventory.payloadMismatchQuarantines,
      unknownReasonQuarantines: inventory.unknownReasonQuarantines,
      eligiblePackets: eligible.length,
      blockedByLegalHold,
      oldestQuarantineAgeMs:
        quarantineAges.length > 0 ? Math.max(...quarantineAges) : null,
      oldestEligibleQuarantineAgeMs:
        eligibleAges.length > 0 ? Math.max(...eligibleAges) : null,
      policy: {
        maxRecords,
        retentionMs,
        legalHold,
        preserveLatest: true,
        manualReviewRequired: true,
      },
      pressureDetected:
        inventory.invalidRecords > 0 ||
        inventory.records.length > 0 ||
        eligible.length > 0,
    };
  }

  private async providerCatalogConformancePacketQuarantineAttestationDiagnostics(): Promise<MediaPipelineProviderCatalogConformancePacketQuarantineAttestationDiagnostics> {
    const inventory =
      await this.store.providerCatalogConformancePacketQuarantineAttestationInventory();
    const nowMs = this.now().getTime();
    const maxRecords =
      this.config.providerCatalogConformancePacketQuarantineAttestationMaxRecords;
    const retentionMs =
      this.config.providerCatalogConformancePacketQuarantineAttestationRetentionMs;
    const legalHold =
      this.config.providerCatalogConformancePacketQuarantineAttestationLegalHold;
    let invalidIntegrityAttestations = 0;
    let payloadMismatchAttestations = 0;
    const attestationAges = inventory.records.map((record) =>
      Math.max(0, nowMs - Date.parse(record.recordedAt))
    );
    const eligible = inventory.records.filter((record, index) => {
      if (index === 0) return false;
      const ageMs = Math.max(0, nowMs - Date.parse(record.recordedAt));
      return index >= maxRecords || ageMs > retentionMs;
    });

    for (const record of inventory.records) {
      const integrityStatus = verifyPacketQuarantineAttestationIntegrity(
        record.attestation,
        this.config
      );
      if (integrityStatus !== "valid_signed" && integrityStatus !== "valid_unsigned") {
        invalidIntegrityAttestations += 1;
      }
      const payloadDigest = stringField(
        nestedRecord(record.attestation, "attestationIntegrity"),
        "payloadSha256"
      );
      if (!payloadDigest || !equalHex(payloadDigest, record.attestationPayloadSha256)) {
        payloadMismatchAttestations += 1;
      }
    }

    const eligibleAges = eligible.map((record) =>
      Math.max(0, nowMs - Date.parse(record.recordedAt))
    );
    const blockedByLegalHold = legalHold ? eligible.length : 0;

    return {
      generatedAt: inventory.generatedAt,
      attestations: inventory.records.length,
      invalidRecords: inventory.invalidRecords,
      reviewedAttestations: inventory.reviewedAttestations,
      retainedAttestations: inventory.retainedAttestations,
      releasedAttestations: inventory.releasedAttestations,
      signedAttestations: inventory.signedAttestations,
      unsignedAttestations: inventory.unsignedAttestations,
      invalidIntegrityAttestations,
      payloadMismatchAttestations,
      eligibleAttestations: eligible.length,
      blockedByLegalHold,
      oldestAttestationAgeMs:
        attestationAges.length > 0 ? Math.max(...attestationAges) : null,
      oldestEligibleAttestationAgeMs:
        eligibleAges.length > 0 ? Math.max(...eligibleAges) : null,
      signatureRequired: this.config.requireManifestSignature,
      signatureVerificationEnabled: this.config.manifestVerificationKeys.length > 0,
      policy: {
        maxRecords,
        retentionMs,
        legalHold,
        preserveLatest: true,
      },
      pressureDetected:
        inventory.invalidRecords > 0 ||
        invalidIntegrityAttestations > 0 ||
        payloadMismatchAttestations > 0 ||
        eligible.length > 0,
    };
  }
}

export function createMediaPipelineService(
  env: NodeJS.ProcessEnv = process.env,
  repository: MediaPipelineRepository = new SupabaseMediaPipelineRepository()
): MediaPipelineService {
  const runtime = createStorageRuntime(env);
  if (!runtime.config.filesystemRoot) {
    throw new MediaPipelineError("PIPELINE_NOT_CONFIGURED", "Filesystem storage root is not configured");
  }
  const config = readMediaPipelineConfig(runtime.config, env);
  return new MediaPipelineService({
    runtime,
    config,
    store: new MediaPipelineJobStore({ root: runtime.config.filesystemRoot }),
    repository,
  });
}
