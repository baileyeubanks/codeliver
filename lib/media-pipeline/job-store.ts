/* eslint-disable @typescript-eslint/ban-ts-comment */
import { createHash, randomUUID } from "node:crypto";
import { open, readFile, readdir, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

// @ts-ignore TS5097: Node's native TypeScript test runner requires explicit extensions.
import { ensureSafeDirectoryTree, resolveExistingRoot, resolvePathInsideRoot } from "../storage/path-safety.ts";
// @ts-ignore TS5097: Node's native TypeScript test runner requires explicit extensions.
import { MediaPipelineError } from "./errors.ts";
// @ts-ignore TS5097: Node's native TypeScript test runner requires explicit extensions.
import { MEDIA_PIPELINE_SCHEMA_VERSION, MEDIA_PIPELINE_STATUSES, type MediaPipelineEnqueueInput, type MediaPipelineEvent, type MediaPipelineJob, type MediaPipelineLease, type MediaPipelineQueueDiagnostics, type MediaPipelineRestoreAttestationStatus, type MediaPipelineRestoreReceiptCatalogScanRoot, type MediaPipelineSourceReceipt, type MediaPipelineStage, type MediaPipelineStatus, type StoredMediaArtifact } from "./types.ts";

const PIPELINE_ROOT = ".codeliver-ingest/control/media-pipeline";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_EVENTS = 160;
const ENQUEUE_LOCK_TTL_MS = 30_000;
const ENQUEUE_LOCK_WAIT_MS = 5_000;
const ENQUEUE_LOCK_POLL_MS = 25;
const RECEIPT_CATALOG_CHECKPOINT_STALE_MS = 24 * 60 * 60 * 1000;

export interface MediaPipelineJobStoreOptions {
  root: string;
  now?: () => Date;
}

export interface JobLeaseHandle {
  job: MediaPipelineJob;
  holderId: string;
  release: () => Promise<void>;
}

export interface WorkerSlotHandle {
  slot: number;
  holderId: string;
  release: () => Promise<void>;
}

export interface MediaPipelineAdmissionLimits {
  maxActiveJobsPerProject: number | null;
  maxActiveBytesPerProject: number | null;
}

export interface MediaPipelineSloLimits {
  queuedMs: number;
  eligibleMs: number;
  runningMs: number;
  retryReadyMs: number;
}

export type MediaPipelineLifecycleCategory =
  | "published"
  | "recoverable_unpublished"
  | "terminal_orphan_candidate";

export interface MediaPipelineLifecycleReference {
  category: MediaPipelineLifecycleCategory;
  objectKey: string;
  size: number;
  sha256: string;
  jobCreatedAt: string;
}

export interface MediaPipelineLifecycleInventory {
  generatedAt: string;
  references: MediaPipelineLifecycleReference[];
  publishedArtifactJobs: number;
  recoverableArtifactJobs: number;
  terminalOrphanCandidateJobs: number;
  oldestTerminalOrphanCandidateAgeMs: number | null;
}

export type MediaPipelineReplayManifestCategory = "published" | "recoverable_unpublished";

export interface MediaPipelineReplayManifestReference {
  category: MediaPipelineReplayManifestCategory;
  jobId: string;
  projectId: string;
  tenantScope: string;
  attempt: number;
  manifest: StoredMediaArtifact;
  artifacts: MediaPipelineJob["artifacts"];
  sourceSha256: string | null;
  sourceSize: number | null;
  storageProvider: string | null;
  versionId: string;
  versionNumber: number;
}

export interface MediaPipelineReplayManifestInventory {
  generatedAt: string;
  references: MediaPipelineReplayManifestReference[];
  publishedManifests: number;
  recoverableManifests: number;
}

export interface MediaPipelineSourceReceiptReference {
  objectKey: string;
  size: number;
  sha256: string;
  provider: string;
}

export interface MediaPipelineSourceReceiptInventory {
  generatedAt: string;
  references: MediaPipelineSourceReceiptReference[];
  totalJobs: number;
  jobsWithReceipt: number;
  jobsMissingReceipt: number;
  activeJobsMissingReceipt: number;
  publishedJobsWithReceipt: number;
  invalidReceiptJobs: number;
}

export interface MediaPipelineRestoreReceiptRecordInput {
  versionId: string;
  versionNumber: number;
  receipt: StoredMediaArtifact;
  attestationPayloadSha256: string;
  attestationStatus: MediaPipelineRestoreAttestationStatus;
  attestationReady: boolean;
  receiptGeneratedAt: string;
}

export interface MediaPipelineRestoreReceiptReference {
  versionId: string;
  versionNumber: number;
  objectKey: string;
  size: number;
  sha256: string;
  provider: string;
  attestationPayloadSha256: string;
  attestationStatus: MediaPipelineRestoreAttestationStatus;
  attestationReady: boolean;
  receiptGeneratedAt: string;
}

export interface MediaPipelineRestoreReceiptInventory {
  generatedAt: string;
  references: MediaPipelineRestoreReceiptReference[];
  publishedVersions: number;
  versionsWithReceipt: number;
  versionsMissingReceipt: number;
  duplicateReceiptVersions: number;
  invalidReceiptRecords: number;
}

export interface MediaPipelineReceiptCatalogCheckpointRecordInput {
  provider: string;
  scanRoot: MediaPipelineRestoreReceiptCatalogScanRoot;
  scanLimit: number;
  scannedJsonFiles: number;
  scanTruncated: boolean;
  cursorSupported: boolean;
  pagesScanned: number;
  startedCursorDigest?: string | null;
  checkpointRequired: boolean;
  nextCursorDigest: string | null;
  continuationTokenDigest?: string | null;
  continuationTokenKeyDigest?: string | null;
  continuationTokenExpiresAt?: string | null;
  discoveredReceipts: number;
  invalidJsonFiles: number;
  unsafeEntries: number;
}

export interface MediaPipelineReceiptCatalogCheckpointReference
  extends MediaPipelineReceiptCatalogCheckpointRecordInput {
  recordedAt: string;
  completed: boolean;
  stale: boolean;
}

export interface MediaPipelineReceiptCatalogCheckpointInventory {
  generatedAt: string;
  records: MediaPipelineReceiptCatalogCheckpointReference[];
  invalidRecords: number;
  staleRecords: number;
  latest: MediaPipelineReceiptCatalogCheckpointReference | null;
}

export interface MediaPipelineReceiptCatalogCheckpointResetInventory {
  generatedAt: string;
  fileNames: string[];
  unsafeEntries: number;
}

export interface MediaPipelineReceiptCatalogCheckpointResetReceiptRecordInput {
  recordedAt?: string;
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
  receipt: Record<string, unknown>;
}

export interface MediaPipelineReceiptCatalogCheckpointResetReceiptReference
  extends MediaPipelineReceiptCatalogCheckpointResetReceiptRecordInput {
  recordedAt: string;
  fileName: string;
}

export interface MediaPipelineReceiptCatalogCheckpointResetReceiptInventory {
  generatedAt: string;
  records: MediaPipelineReceiptCatalogCheckpointResetReceiptReference[];
  invalidRecords: number;
  signedReceipts: number;
  unsignedReceipts: number;
  latest: MediaPipelineReceiptCatalogCheckpointResetReceiptReference | null;
}

export interface MediaPipelineReceiptCatalogCheckpointResetReceiptPacketRecordInput {
  packetDigest: string;
  packetGeneratedAt: string;
  recordCount: number;
  signedReceipts: number;
  appliedReceipts: number;
  packetIntegrity: "sha256" | "hmac-sha256";
  packetSigned: boolean;
  packet: Record<string, unknown>;
}

export interface MediaPipelineReceiptCatalogCheckpointResetReceiptPacketReference
  extends MediaPipelineReceiptCatalogCheckpointResetReceiptPacketRecordInput {
  recordedAt: string;
  fileName: string;
}

export interface MediaPipelineReceiptCatalogCheckpointResetReceiptPacketInvalidReference {
  fileName: string;
  reason: "malformed_record";
}

export interface MediaPipelineReceiptCatalogCheckpointResetReceiptPacketInventory {
  generatedAt: string;
  records: MediaPipelineReceiptCatalogCheckpointResetReceiptPacketReference[];
  invalidRecords: number;
  invalidReferences: MediaPipelineReceiptCatalogCheckpointResetReceiptPacketInvalidReference[];
  duplicatePacketDigests: number;
  signedPackets: number;
  unsignedPackets: number;
  latest: MediaPipelineReceiptCatalogCheckpointResetReceiptPacketReference | null;
}

export type MediaPipelineReceiptCatalogCheckpointResetReceiptPacketQuarantineReason =
  | "malformed_record"
  | "invalid_integrity"
  | "payload_mismatch"
  | "unknown";

export interface MediaPipelineReceiptCatalogCheckpointResetReceiptPacketQuarantineReference {
  fileName: string;
  reason: MediaPipelineReceiptCatalogCheckpointResetReceiptPacketQuarantineReason;
  quarantinedAt: string;
}

export interface MediaPipelineReceiptCatalogCheckpointResetReceiptPacketQuarantineInventory {
  generatedAt: string;
  records: MediaPipelineReceiptCatalogCheckpointResetReceiptPacketQuarantineReference[];
  invalidRecords: number;
  malformedRecordQuarantines: number;
  invalidIntegrityQuarantines: number;
  payloadMismatchQuarantines: number;
  unknownReasonQuarantines: number;
  latest: MediaPipelineReceiptCatalogCheckpointResetReceiptPacketQuarantineReference | null;
}

export interface MediaPipelineProviderCatalogConformanceReceiptRecordInput {
  recordedAt?: string;
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

export interface MediaPipelineProviderCatalogConformanceReceiptReference
  extends MediaPipelineProviderCatalogConformanceReceiptRecordInput {
  recordedAt: string;
}

export interface MediaPipelineProviderCatalogConformanceReceiptInventory {
  generatedAt: string;
  records: MediaPipelineProviderCatalogConformanceReceiptReference[];
  invalidRecords: number;
  signedRecords: number;
  unsignedRecords: number;
  readyRecords: number;
  failedRecords: number;
  latest: MediaPipelineProviderCatalogConformanceReceiptReference | null;
}

export interface MediaPipelineProviderCatalogConformancePacketRecordInput {
  packetDigest: string;
  packetGeneratedAt: string;
  providerCount: number;
  recordCount: number;
  signedRecords: number;
  readyRecords: number;
  failedRecords: number;
  packetIntegrity: "sha256" | "hmac-sha256";
  packetSigned: boolean;
  packet: Record<string, unknown>;
}

export interface MediaPipelineProviderCatalogConformancePacketReference
  extends MediaPipelineProviderCatalogConformancePacketRecordInput {
  recordedAt: string;
  fileName: string;
}

export interface MediaPipelineProviderCatalogConformancePacketInvalidReference {
  fileName: string;
  reason: "malformed_record";
}

export interface MediaPipelineProviderCatalogConformancePacketInventory {
  generatedAt: string;
  records: MediaPipelineProviderCatalogConformancePacketReference[];
  invalidRecords: number;
  invalidReferences: MediaPipelineProviderCatalogConformancePacketInvalidReference[];
  duplicatePacketDigests: number;
  signedPackets: number;
  unsignedPackets: number;
  latest: MediaPipelineProviderCatalogConformancePacketReference | null;
}

export type MediaPipelineProviderCatalogConformancePacketQuarantineReason =
  | "malformed_record"
  | "invalid_integrity"
  | "payload_mismatch"
  | "unknown";

export interface MediaPipelineProviderCatalogConformancePacketQuarantineReference {
  fileName: string;
  reason: MediaPipelineProviderCatalogConformancePacketQuarantineReason;
  quarantinedAt: string;
}

export interface MediaPipelineProviderCatalogConformancePacketQuarantineInventory {
  generatedAt: string;
  records: MediaPipelineProviderCatalogConformancePacketQuarantineReference[];
  invalidRecords: number;
  malformedRecordQuarantines: number;
  invalidIntegrityQuarantines: number;
  payloadMismatchQuarantines: number;
  unknownReasonQuarantines: number;
  latest: MediaPipelineProviderCatalogConformancePacketQuarantineReference | null;
}

export type MediaPipelineProviderCatalogConformancePacketQuarantineAttestationDecision =
  | "reviewed"
  | "retained"
  | "released";

export interface MediaPipelineProviderCatalogConformancePacketQuarantineAttestationRecordInput {
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
  attestationSigned: boolean;
  attestation: Record<string, unknown>;
}

export interface MediaPipelineProviderCatalogConformancePacketQuarantineAttestationReference
  extends MediaPipelineProviderCatalogConformancePacketQuarantineAttestationRecordInput {
  recordedAt: string;
  fileName: string;
}

export interface MediaPipelineProviderCatalogConformancePacketQuarantineAttestationInventory {
  generatedAt: string;
  records: MediaPipelineProviderCatalogConformancePacketQuarantineAttestationReference[];
  invalidRecords: number;
  reviewedAttestations: number;
  retainedAttestations: number;
  releasedAttestations: number;
  signedAttestations: number;
  unsignedAttestations: number;
  latest: MediaPipelineProviderCatalogConformancePacketQuarantineAttestationReference | null;
}

type PersistedLock = {
  holderId: string;
  expiresAt: string;
};

function utc(now: () => Date): string {
  return now().toISOString();
}

function event(
  now: () => Date,
  type: MediaPipelineEvent["type"],
  stage: MediaPipelineStage,
  progress: number,
  code?: string,
  message?: string
): MediaPipelineEvent {
  return {
    at: utc(now),
    type,
    stage,
    progress,
    ...(code ? { code } : {}),
    ...(message ? { message } : {}),
  };
}

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function idempotencyHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function boundedProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value * 100) / 100));
}

function isTerminal(status: MediaPipelineStatus): boolean {
  return ["published", "failed", "cancelled", "quarantined"].includes(status);
}

function activeSourceBytes(job: MediaPipelineJob): number {
  const value = job.source.expectedSize ?? job.source.receipt?.size ?? job.sourceSize ?? 0;
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function validSourceReceipt(
  receipt: MediaPipelineSourceReceipt | null | undefined,
  objectKey: string
): receipt is MediaPipelineSourceReceipt {
  return Boolean(
    receipt &&
      typeof receipt.provider === "string" &&
      receipt.provider.length > 0 &&
      receipt.objectKey === objectKey &&
      Number.isSafeInteger(receipt.size) &&
      receipt.size >= 0 &&
      /^[a-f0-9]{64}$/.test(receipt.sha256) &&
      (receipt.providerVersionId === null || typeof receipt.providerVersionId === "string") &&
      (receipt.committedAt === null ||
        (typeof receipt.committedAt === "string" &&
          !Number.isNaN(Date.parse(receipt.committedAt))))
  );
}

function artifactReferences(job: MediaPipelineJob): StoredMediaArtifact[] {
  if (!job.artifacts) return [];
  return [
    job.artifacts.hls.playlist,
    job.artifacts.hls.manifest,
    ...job.artifacts.hls.segments,
    ...(job.artifacts.thumbnail ? [job.artifacts.thumbnail] : []),
    job.artifacts.waveform,
    job.artifacts.captions.content,
    job.artifacts.captions.manifest,
    job.artifacts.pipelineManifest,
  ];
}

function isRestoreAttestationStatus(value: unknown): value is MediaPipelineRestoreAttestationStatus {
  return (
    value === "ready" ||
    value === "not_found" ||
    value === "not_published" ||
    value === "drift_detected"
  );
}

function emptyStatusCounts(): Record<MediaPipelineStatus, number> {
  return Object.fromEntries(MEDIA_PIPELINE_STATUSES.map((status) => [status, 0])) as Record<
    MediaPipelineStatus,
    number
  >;
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isSha256Digest(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isEligibleForClaim(job: MediaPipelineJob, now: number): boolean {
  if (job.cancellationRequested) return false;
  if (job.status === "queued") return true;
  return (
    job.status === "retry_wait" &&
    job.retryAt !== null &&
    Date.parse(job.retryAt) <= now
  );
}

function assertJobShape(value: unknown): asserts value is MediaPipelineJob {
  if (!value || typeof value !== "object") {
    throw new MediaPipelineError("PIPELINE_STATE_CORRUPT", "Pipeline job state is invalid");
  }
  const job = value as Partial<MediaPipelineJob>;
  if (
    job.schemaVersion !== MEDIA_PIPELINE_SCHEMA_VERSION ||
    typeof job.id !== "string" ||
    !isUuid(job.id) ||
    typeof job.assetId !== "string" ||
    typeof job.versionId !== "string" ||
    typeof job.projectId !== "string" ||
    !MEDIA_PIPELINE_STATUSES.includes(job.status as MediaPipelineStatus) ||
    !Number.isSafeInteger(job.attempt) ||
    !Number.isSafeInteger(job.maxAttempts) ||
    (job.retryAt !== null && !isValidTimestamp(job.retryAt)) ||
    (job.status === "retry_wait" && !isValidTimestamp(job.retryAt)) ||
    (job.lease !== null &&
      (!job.lease ||
        typeof job.lease !== "object" ||
        !isValidTimestamp(job.lease.expiresAt))) ||
    !Array.isArray(job.events)
  ) {
    throw new MediaPipelineError("PIPELINE_STATE_CORRUPT", "Pipeline job state is malformed");
  }
}

export class MediaPipelineJobStore {
  private readonly root: string;
  private readonly now: () => Date;
  private canonicalRootPromise: Promise<string> | null = null;

  constructor(options: MediaPipelineJobStoreOptions) {
    this.root = options.root;
    this.now = options.now ?? (() => new Date());
  }

  private canonicalRoot(): Promise<string> {
    this.canonicalRootPromise ??= resolveExistingRoot(this.root);
    return this.canonicalRootPromise;
  }

  private controlDirectories() {
    return [
      "jobs",
      "keys",
      "locks",
      "worker-slots",
      "cancel",
      "work",
      "restore-receipts",
      "receipt-catalog-checkpoints",
      "receipt-catalog-checkpoint-reset-receipts",
      "receipt-catalog-checkpoint-reset-receipt-packets",
      "receipt-catalog-checkpoint-reset-receipt-packet-quarantine",
      "provider-catalog-conformance-receipts",
      "provider-catalog-conformance-packets",
      "provider-catalog-conformance-packet-quarantine",
      "provider-catalog-conformance-packet-quarantine-attestations",
    ] as const;
  }

  private async ensureLayout(): Promise<string> {
    const root = await this.canonicalRoot();
    await Promise.all(
      this.controlDirectories().map((directory) =>
        ensureSafeDirectoryTree(root, `${PIPELINE_ROOT}/${directory}`)
      )
    );
    return root;
  }

  private async path(
    directory:
      | "jobs"
      | "keys"
      | "locks"
      | "worker-slots"
      | "cancel"
      | "work"
      | "restore-receipts"
      | "receipt-catalog-checkpoints"
      | "receipt-catalog-checkpoint-reset-receipts"
      | "receipt-catalog-checkpoint-reset-receipt-packets"
      | "receipt-catalog-checkpoint-reset-receipt-packet-quarantine"
      | "provider-catalog-conformance-receipts"
      | "provider-catalog-conformance-packets"
      | "provider-catalog-conformance-packet-quarantine"
      | "provider-catalog-conformance-packet-quarantine-attestations",
    name: string
  ): Promise<string> {
    const root = await this.ensureLayout();
    return resolvePathInsideRoot(root, `${PIPELINE_ROOT}/${directory}/${name}`);
  }

  private async readJobRaw(jobId: string): Promise<MediaPipelineJob | null> {
    if (!isUuid(jobId)) {
      throw new MediaPipelineError("PIPELINE_JOB_NOT_FOUND", "Pipeline job id is invalid");
    }
    const path = await this.path("jobs", `${jobId}.json`);
    try {
      const raw = JSON.parse(await readFile(path, "utf8")) as unknown;
      assertJobShape(raw);
      const job = raw as MediaPipelineJob;
      return { ...job, scan: job.scan ?? null };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      if (error instanceof MediaPipelineError) throw error;
      throw new MediaPipelineError("PIPELINE_STATE_CORRUPT", "Pipeline job state cannot be read");
    }
  }

  private async cancellationRequested(jobId: string): Promise<boolean> {
    const path = await this.path("cancel", `${jobId}.json`);
    try {
      const raw = JSON.parse(await readFile(path, "utf8")) as { requestedAt?: unknown };
      return typeof raw.requestedAt === "string";
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      return true;
    }
  }

  private async writeState(path: string, value: MediaPipelineJob): Promise<void> {
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
    await rename(temporary, path);
  }

  private appendEvent(
    job: MediaPipelineJob,
    type: MediaPipelineEvent["type"],
    stage: MediaPipelineStage,
    progress: number,
    code?: string,
    message?: string
  ): MediaPipelineJob {
    const events = [...job.events, event(this.now, type, stage, progress, code, message)].slice(
      -MAX_EVENTS
    );
    return { ...job, events };
  }

  private async mutate(
    jobId: string,
    mutator: (job: MediaPipelineJob) => MediaPipelineJob
  ): Promise<MediaPipelineJob> {
    const current = await this.readJobRaw(jobId);
    if (!current) {
      throw new MediaPipelineError("PIPELINE_JOB_NOT_FOUND", "Pipeline job was not found");
    }
    const next = mutator({
      ...current,
      cancellationRequested:
        current.cancellationRequested || (await this.cancellationRequested(jobId)),
    });
    const path = await this.path("jobs", `${jobId}.json`);
    await this.writeState(path, { ...next, updatedAt: utc(this.now) });
    return this.getOrThrow(jobId);
  }

  private async getOrThrow(jobId: string): Promise<MediaPipelineJob> {
    const job = await this.get(jobId);
    if (!job) {
      throw new MediaPipelineError("PIPELINE_JOB_NOT_FOUND", "Pipeline job was not found");
    }
    return job;
  }

  async createOrGet(
    input: MediaPipelineEnqueueInput,
    maxAttempts: number,
    admissionLimits: MediaPipelineAdmissionLimits = {
      maxActiveJobsPerProject: null,
      maxActiveBytesPerProject: null,
    }
  ): Promise<MediaPipelineJob> {
    if (
      !input.assetId ||
      !input.versionId ||
      !input.projectId ||
      !input.source.objectKey ||
      !input.source.filename ||
      !Number.isSafeInteger(input.source.versionNumber) ||
      input.source.versionNumber <= 0
    ) {
      throw new MediaPipelineError("PIPELINE_SOURCE_INVALID", "Pipeline source binding is invalid");
    }

    const key = idempotencyHash(
      [
        input.assetId,
        input.versionId,
        input.source.objectKey,
        input.source.expectedSha256 ?? input.source.receipt?.sha256 ?? "",
      ].join(":")
    );
    const projectLockPath = await this.path(
      "locks",
      `project-admission-${idempotencyHash(input.projectId)}.json`
    );
    const projectLock = await this.acquireRequiredLock(
      projectLockPath,
      ENQUEUE_LOCK_TTL_MS,
      ENQUEUE_LOCK_WAIT_MS
    );
    const lockPath = await this.path("locks", `idempotency-${key}.json`);
    let lock: { holderId: string; expiresAt: string } | null = null;

    try {
      lock = await this.acquireRequiredLock(
        lockPath,
        ENQUEUE_LOCK_TTL_MS,
        ENQUEUE_LOCK_WAIT_MS
      );
      const indexPath = await this.path("keys", `${key}.json`);
      try {
        const existingIndex = JSON.parse(await readFile(indexPath, "utf8")) as {
          jobId?: unknown;
        };
        if (typeof existingIndex.jobId === "string") {
          const existing = await this.get(existingIndex.jobId);
          if (existing) return existing;
          await rm(indexPath, { force: true });
        } else {
          throw new MediaPipelineError(
            "PIPELINE_STATE_CORRUPT",
            "Pipeline idempotency index is malformed"
          );
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }

      await this.assertProjectAdmission(input, admissionLimits);

      const id = randomUUID();
      const createdAt = utc(this.now);
      const job: MediaPipelineJob = {
        schemaVersion: MEDIA_PIPELINE_SCHEMA_VERSION,
        id,
        idempotencyKey: key,
        assetId: input.assetId,
        versionId: input.versionId,
        projectId: input.projectId,
        tenantScope: `project:${input.projectId}`,
        source: input.source,
        status: "queued",
        stage: "queued",
        progress: 0,
        attempt: 0,
        maxAttempts,
        retryAt: null,
        cancellationRequested: false,
        lease: null,
        sourceSha256: null,
        sourceSize: null,
        scan: null,
        probe: null,
        artifacts: null,
        failure: null,
        events: [event(this.now, "enqueued", "queued", 0)],
        createdAt,
        updatedAt: createdAt,
        publishedAt: null,
      };

      const jobPath = await this.path("jobs", `${id}.json`);
      const stagedJobPath = await this.path("jobs", `${id}.${randomUUID()}.tmp`);
      const jobFile = await open(stagedJobPath, "wx", 0o600);
      try {
        await jobFile.writeFile(JSON.stringify(job, null, 2));
        await jobFile.sync();
      } finally {
        await jobFile.close();
      }

      let indexCreated = false;
      try {
        const indexFile = await open(indexPath, "wx", 0o600);
        try {
          await indexFile.writeFile(JSON.stringify({ jobId: id, createdAt }));
          await indexFile.sync();
        } finally {
          await indexFile.close();
        }
        indexCreated = true;
        await rename(stagedJobPath, jobPath);
        return job;
      } catch (error) {
        await rm(stagedJobPath, { force: true });
        if (indexCreated) {
          await rm(indexPath, { force: true });
          throw error;
        }
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const existingIndex = JSON.parse(await readFile(indexPath, "utf8")) as {
          jobId?: unknown;
        };
        if (typeof existingIndex.jobId !== "string") {
          throw new MediaPipelineError(
            "PIPELINE_STATE_CORRUPT",
            "Pipeline idempotency index is malformed"
          );
        }
        return this.getOrThrow(existingIndex.jobId);
      }
    } finally {
      if (lock) await this.releaseLock(lockPath, lock.holderId).catch(() => undefined);
      await this.releaseLock(projectLockPath, projectLock.holderId).catch(() => undefined);
    }
  }

  private async assertProjectAdmission(
    input: MediaPipelineEnqueueInput,
    limits: MediaPipelineAdmissionLimits
  ): Promise<void> {
    const nextBytes = input.source.expectedSize ?? input.source.receipt?.size ?? null;
    if (limits.maxActiveBytesPerProject !== null && nextBytes === null) {
      throw new MediaPipelineError(
        "PIPELINE_BACKPRESSURE",
        "Pipeline project byte quota requires an authoritative source size",
        true
      );
    }

    if (limits.maxActiveJobsPerProject === null && limits.maxActiveBytesPerProject === null) {
      return;
    }

    const jobsDir = await this.path("jobs", ".");
    const entries = await readdir(jobsDir, { withFileTypes: true });
    let activeJobs = 0;
    let activeBytes = 0;

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const jobId = entry.name.slice(0, -".json".length);
      if (!isUuid(jobId)) continue;
      const job = await this.get(jobId);
      if (!job || job.projectId !== input.projectId || isTerminal(job.status)) continue;
      activeJobs += 1;
      activeBytes += activeSourceBytes(job);
    }

    if (
      limits.maxActiveJobsPerProject !== null &&
      activeJobs + 1 > limits.maxActiveJobsPerProject
    ) {
      throw new MediaPipelineError(
        "PIPELINE_BACKPRESSURE",
        "Pipeline project active-job quota is saturated",
        true
      );
    }

    if (
      limits.maxActiveBytesPerProject !== null &&
      activeBytes + (nextBytes ?? 0) > limits.maxActiveBytesPerProject
    ) {
      throw new MediaPipelineError(
        "PIPELINE_BACKPRESSURE",
        "Pipeline project active-byte quota is saturated",
        true
      );
    }
  }

  async get(jobId: string): Promise<MediaPipelineJob | null> {
    const job = await this.readJobRaw(jobId);
    if (!job) return null;
    return {
      ...job,
      cancellationRequested:
        job.cancellationRequested || (await this.cancellationRequested(job.id)),
    };
  }

  async requestCancellation(jobId: string): Promise<MediaPipelineJob> {
    const job = await this.getOrThrow(jobId);
    if (isTerminal(job.status)) return job;
    const path = await this.path("cancel", `${jobId}.json`);
    await writeFile(path, JSON.stringify({ requestedAt: utc(this.now) }), {
      flag: "w",
      mode: 0o600,
    });
    return this.mutate(jobId, (current) =>
      this.appendEvent(
        { ...current, cancellationRequested: true },
        "cancel_requested",
        current.stage,
        current.progress
      )
    );
  }

  async requestRetry(jobId: string): Promise<MediaPipelineJob> {
    const cancelPath = await this.path("cancel", `${jobId}.json`);
    await unlink(cancelPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
    return this.mutate(jobId, (current) => {
      if (!["failed", "cancelled", "quarantined", "retry_wait"].includes(current.status)) {
        throw new MediaPipelineError("PIPELINE_JOB_CONFLICT", "Pipeline job cannot be retried now");
      }
      return this.appendEvent(
        {
          ...current,
          status: "queued",
          stage: "queued",
          progress: 0,
          retryAt: null,
          failure: null,
          cancellationRequested: false,
          lease: null,
        },
        "recovered",
        "queued",
        0
      );
    });
  }

  async setRunning(jobId: string, lease: MediaPipelineLease): Promise<MediaPipelineJob> {
    return this.mutate(jobId, (current) =>
      this.appendEvent(
        {
          ...current,
          status: "running",
          attempt: current.attempt + 1,
          retryAt: null,
          lease,
        },
        "claimed",
        current.stage,
        current.progress
      )
    );
  }

  async setStage(
    jobId: string,
    stage: MediaPipelineStage,
    progress: number
  ): Promise<MediaPipelineJob> {
    const nextProgress = boundedProgress(progress);
    return this.mutate(jobId, (current) =>
      this.appendEvent(
        { ...current, stage, progress: nextProgress },
        "stage_changed",
        stage,
        nextProgress
      )
    );
  }

  async setProgress(jobId: string, progress: number): Promise<MediaPipelineJob> {
    const nextProgress = boundedProgress(progress);
    return this.mutate(jobId, (current) =>
      this.appendEvent(
        { ...current, progress: nextProgress },
        "progress",
        current.stage,
        nextProgress
      )
    );
  }

  async setIngested(
    jobId: string,
    input: { sha256: string; size: number }
  ): Promise<MediaPipelineJob> {
    return this.mutate(jobId, (current) => ({
      ...current,
      sourceSha256: input.sha256,
      sourceSize: input.size,
    }));
  }

  async setProbe(jobId: string, probe: MediaPipelineJob["probe"]): Promise<MediaPipelineJob> {
    return this.mutate(jobId, (current) => ({ ...current, probe }));
  }

  async setScan(jobId: string, scan: MediaPipelineJob["scan"]): Promise<MediaPipelineJob> {
    return this.mutate(jobId, (current) => ({ ...current, scan }));
  }

  async setArtifacts(
    jobId: string,
    artifacts: NonNullable<MediaPipelineJob["artifacts"]>
  ): Promise<MediaPipelineJob> {
    return this.mutate(jobId, (current) => ({ ...current, artifacts }));
  }

  async markPublished(jobId: string): Promise<MediaPipelineJob> {
    return this.mutate(jobId, (current) =>
      this.appendEvent(
        {
          ...current,
          status: "published",
          stage: "publish",
          progress: 100,
          retryAt: null,
          lease: null,
          failure: null,
          publishedAt: utc(this.now),
        },
        "published",
        "publish",
        100
      )
    );
  }

  async markCancelled(jobId: string): Promise<MediaPipelineJob> {
    return this.mutate(jobId, (current) =>
      this.appendEvent(
        {
          ...current,
          status: "cancelled",
          retryAt: null,
          lease: null,
          failure: {
            code: "PIPELINE_CANCELLED",
            message: "Media processing was cancelled",
            retryable: false,
            at: utc(this.now),
          },
        },
        "cancelled",
        current.stage,
        current.progress,
        "PIPELINE_CANCELLED"
      )
    );
  }

  async markQuarantined(
    jobId: string,
    code: "PIPELINE_QUARANTINED" | "PIPELINE_QUARANTINE_PENDING",
    message: string
  ): Promise<MediaPipelineJob> {
    return this.mutate(jobId, (current) =>
      this.appendEvent(
        {
          ...current,
          status: "quarantined",
          retryAt: null,
          lease: null,
          failure: { code, message, retryable: false, at: utc(this.now) },
        },
        "quarantined",
        "quarantine",
        current.progress,
        code,
        message
      )
    );
  }

  async markRetry(
    jobId: string,
    failure: MediaPipelineJob["failure"],
    retryAt: Date
  ): Promise<MediaPipelineJob> {
    if (!failure) throw new MediaPipelineError("PIPELINE_STATE_CORRUPT", "Retry requires failure state");
    return this.mutate(jobId, (current) =>
      this.appendEvent(
        {
          ...current,
          status: "retry_wait",
          retryAt: retryAt.toISOString(),
          lease: null,
          failure,
        },
        "retry_scheduled",
        current.stage,
        current.progress,
        failure.code,
        failure.message
      )
    );
  }

  async markFailed(jobId: string, failure: NonNullable<MediaPipelineJob["failure"]>): Promise<MediaPipelineJob> {
    return this.mutate(jobId, (current) =>
      this.appendEvent(
        {
          ...current,
          status: "failed",
          retryAt: null,
          lease: null,
          failure,
        },
        "failed",
        current.stage,
        current.progress,
        failure.code,
        failure.message
      )
    );
  }

  async listEligible(limit = 25): Promise<MediaPipelineJob[]> {
    const jobsDir = await this.path("jobs", ".");
    const entries = await readdir(jobsDir, { withFileTypes: true });
    const now = this.now().getTime();
    const jobs: MediaPipelineJob[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const jobId = entry.name.slice(0, -".json".length);
      if (!isUuid(jobId)) continue;
      const job = await this.get(jobId);
      if (!job || isTerminal(job.status)) continue;
      const retryAt = job.retryAt ? Date.parse(job.retryAt) : 0;
      const leaseExpired = job.lease ? Date.parse(job.lease.expiresAt) <= now : true;
      const eligible =
        job.status === "queued" ||
        (job.status === "retry_wait" && retryAt <= now) ||
        (job.status === "running" && leaseExpired);
      if (eligible) jobs.push(job);
    }

    return jobs
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .slice(0, Math.max(1, limit));
  }

  async diagnoseQueue(
    admissionLimits: MediaPipelineAdmissionLimits = {
      maxActiveJobsPerProject: null,
      maxActiveBytesPerProject: null,
    },
    sloLimits: MediaPipelineSloLimits = {
      queuedMs: Number.MAX_SAFE_INTEGER,
      eligibleMs: Number.MAX_SAFE_INTEGER,
      runningMs: Number.MAX_SAFE_INTEGER,
      retryReadyMs: Number.MAX_SAFE_INTEGER,
    }
  ): Promise<MediaPipelineQueueDiagnostics> {
    const jobsDir = await this.path("jobs", ".");
    const entries = await readdir(jobsDir, { withFileTypes: true });
    const now = this.now().getTime();
    const counts = emptyStatusCounts();
    const projectUsage = new Map<string, { activeJobs: number; activeBytes: number }>();
    let totalJobs = 0;
    let activeJobs = 0;
    let terminalJobs = 0;
    let eligibleJobs = 0;
    let runningJobs = 0;
    let staleRunningJobs = 0;
    let retryReadyJobs = 0;
    let retryDeferredJobs = 0;
    let cancellationRequestedJobs = 0;
    let corruptJobFiles = 0;
    let stagedJobFiles = 0;
    let oldestQueuedAgeMs: number | null = null;
    let oldestEligibleAgeMs: number | null = null;
    let oldestRunningAgeMs: number | null = null;
    let oldestRetryReadyAgeMs: number | null = null;
    let queuedBreaches = 0;
    let eligibleBreaches = 0;
    let runningBreaches = 0;
    let retryReadyBreaches = 0;

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (entry.name.endsWith(".tmp")) {
        stagedJobFiles += 1;
        continue;
      }
      if (!entry.name.endsWith(".json")) continue;
      const jobId = entry.name.slice(0, -".json".length);
      if (!isUuid(jobId)) continue;

      const job = await this.get(jobId).catch((error) => {
        if (error instanceof MediaPipelineError && error.code === "PIPELINE_STATE_CORRUPT") {
          corruptJobFiles += 1;
          return null;
        }
        throw error;
      });
      if (!job) continue;

      totalJobs += 1;
      counts[job.status] += 1;
      if (job.cancellationRequested) cancellationRequestedJobs += 1;
      const terminal = isTerminal(job.status);
      if (terminal) terminalJobs += 1;
      else activeJobs += 1;
      if (!terminal) {
        const usage = projectUsage.get(job.projectId) ?? { activeJobs: 0, activeBytes: 0 };
        usage.activeJobs += 1;
        usage.activeBytes += activeSourceBytes(job);
        projectUsage.set(job.projectId, usage);
      }

      const createdAt = Date.parse(job.createdAt);
      const ageMs = Number.isFinite(createdAt) ? Math.max(0, now - createdAt) : null;
      if (job.status === "queued" && ageMs !== null) {
        oldestQueuedAgeMs =
          oldestQueuedAgeMs === null ? ageMs : Math.max(oldestQueuedAgeMs, ageMs);
        if (ageMs > sloLimits.queuedMs) queuedBreaches += 1;
      }

      const leaseExpired = job.lease ? Date.parse(job.lease.expiresAt) <= now : true;
      if (job.status === "running") {
        runningJobs += 1;
        if (leaseExpired) staleRunningJobs += 1;
        const acquiredAt = job.lease ? Date.parse(job.lease.acquiredAt) : NaN;
        const runningAgeMs = Number.isFinite(acquiredAt)
          ? Math.max(0, now - acquiredAt)
          : ageMs;
        if (runningAgeMs !== null) {
          oldestRunningAgeMs =
            oldestRunningAgeMs === null ? runningAgeMs : Math.max(oldestRunningAgeMs, runningAgeMs);
          if (runningAgeMs > sloLimits.runningMs) runningBreaches += 1;
        }
      }
      if (job.status === "retry_wait") {
        const retryAt = job.retryAt ? Date.parse(job.retryAt) : Number.POSITIVE_INFINITY;
        if (retryAt <= now) {
          retryReadyJobs += 1;
          const retryReadyAgeMs = Math.max(0, now - retryAt);
          oldestRetryReadyAgeMs =
            oldestRetryReadyAgeMs === null
              ? retryReadyAgeMs
              : Math.max(oldestRetryReadyAgeMs, retryReadyAgeMs);
          if (retryReadyAgeMs > sloLimits.retryReadyMs) retryReadyBreaches += 1;
        } else {
          retryDeferredJobs += 1;
        }
      }

      if (isEligibleForClaim(job, now) || (job.status === "running" && leaseExpired)) {
        eligibleJobs += 1;
        if (ageMs !== null) {
          oldestEligibleAgeMs =
            oldestEligibleAgeMs === null ? ageMs : Math.max(oldestEligibleAgeMs, ageMs);
          if (ageMs > sloLimits.eligibleMs) eligibleBreaches += 1;
        }
      }
    }

    let projectsOverJobQuota = 0;
    let projectsOverByteQuota = 0;
    let largestProjectActiveJobs = 0;
    let largestProjectActiveBytes = 0;
    for (const usage of projectUsage.values()) {
      largestProjectActiveJobs = Math.max(largestProjectActiveJobs, usage.activeJobs);
      largestProjectActiveBytes = Math.max(largestProjectActiveBytes, usage.activeBytes);
      if (
        admissionLimits.maxActiveJobsPerProject !== null &&
        usage.activeJobs >= admissionLimits.maxActiveJobsPerProject
      ) {
        projectsOverJobQuota += 1;
      }
      if (
        admissionLimits.maxActiveBytesPerProject !== null &&
        usage.activeBytes >= admissionLimits.maxActiveBytesPerProject
      ) {
        projectsOverByteQuota += 1;
      }
    }

    return {
      generatedAt: utc(this.now),
      statusCounts: counts,
      totalJobs,
      activeJobs,
      terminalJobs,
      eligibleJobs,
      runningJobs,
      staleRunningJobs,
      retryReadyJobs,
      retryDeferredJobs,
      cancellationRequestedJobs,
      corruptJobFiles,
      stagedJobFiles,
      oldestQueuedAgeMs,
      oldestEligibleAgeMs,
      slo: {
        queuedMs: sloLimits.queuedMs,
        eligibleMs: sloLimits.eligibleMs,
        runningMs: sloLimits.runningMs,
        retryReadyMs: sloLimits.retryReadyMs,
        queuedBreaches,
        eligibleBreaches,
        runningBreaches,
        retryReadyBreaches,
        oldestRunningAgeMs,
        oldestRetryReadyAgeMs,
        breached:
          queuedBreaches > 0 ||
          eligibleBreaches > 0 ||
          runningBreaches > 0 ||
          retryReadyBreaches > 0,
      },
      quota: {
        maxActiveJobsPerProject: admissionLimits.maxActiveJobsPerProject,
        maxActiveBytesPerProject:
          admissionLimits.maxActiveBytesPerProject === null
            ? null
            : String(admissionLimits.maxActiveBytesPerProject),
        projectsOverJobQuota,
        projectsOverByteQuota,
        largestProjectActiveJobs,
        largestProjectActiveBytes: String(largestProjectActiveBytes),
      },
    };
  }

  async lifecycleInventory(): Promise<MediaPipelineLifecycleInventory> {
    const jobsDir = await this.path("jobs", ".");
    const entries = await readdir(jobsDir, { withFileTypes: true });
    const now = this.now().getTime();
    const references: MediaPipelineLifecycleReference[] = [];
    const jobsByCategory: Record<MediaPipelineLifecycleCategory, Set<string>> = {
      published: new Set(),
      recoverable_unpublished: new Set(),
      terminal_orphan_candidate: new Set(),
    };
    let oldestTerminalOrphanCandidateAgeMs: number | null = null;

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const jobId = entry.name.slice(0, -".json".length);
      if (!isUuid(jobId)) continue;
      const job = await this.get(jobId).catch((error) => {
        if (error instanceof MediaPipelineError && error.code === "PIPELINE_STATE_CORRUPT") {
          return null;
        }
        throw error;
      });
      if (!job?.artifacts) continue;

      const category: MediaPipelineLifecycleCategory =
        job.status === "published"
          ? "published"
          : isTerminal(job.status)
            ? "terminal_orphan_candidate"
            : "recoverable_unpublished";
      jobsByCategory[category].add(job.id);

      if (category === "terminal_orphan_candidate") {
        const createdAt = Date.parse(job.createdAt);
        if (Number.isFinite(createdAt)) {
          const ageMs = Math.max(0, now - createdAt);
          oldestTerminalOrphanCandidateAgeMs =
            oldestTerminalOrphanCandidateAgeMs === null
              ? ageMs
              : Math.max(oldestTerminalOrphanCandidateAgeMs, ageMs);
        }
      }

      for (const artifact of artifactReferences(job)) {
        references.push({
          category,
          objectKey: artifact.objectKey,
          size: artifact.size,
          sha256: artifact.sha256,
          jobCreatedAt: job.createdAt,
        });
      }
    }

    return {
      generatedAt: utc(this.now),
      references,
      publishedArtifactJobs: jobsByCategory.published.size,
      recoverableArtifactJobs: jobsByCategory.recoverable_unpublished.size,
      terminalOrphanCandidateJobs: jobsByCategory.terminal_orphan_candidate.size,
      oldestTerminalOrphanCandidateAgeMs,
    };
  }

  async replayManifestInventory(): Promise<MediaPipelineReplayManifestInventory> {
    const jobsDir = await this.path("jobs", ".");
    const entries = await readdir(jobsDir, { withFileTypes: true });
    const references: MediaPipelineReplayManifestReference[] = [];
    let publishedManifests = 0;
    let recoverableManifests = 0;

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const jobId = entry.name.slice(0, -".json".length);
      if (!isUuid(jobId)) continue;
      const job = await this.get(jobId).catch((error) => {
        if (error instanceof MediaPipelineError && error.code === "PIPELINE_STATE_CORRUPT") {
          return null;
        }
        throw error;
      });
      if (!job?.artifacts) continue;
      if (job.status !== "published" && isTerminal(job.status)) continue;

      const category: MediaPipelineReplayManifestCategory =
        job.status === "published" ? "published" : "recoverable_unpublished";
      if (category === "published") publishedManifests += 1;
      else recoverableManifests += 1;

      references.push({
        category,
        jobId: job.id,
        projectId: job.projectId,
        tenantScope: job.tenantScope,
        attempt: job.attempt,
        manifest: job.artifacts.pipelineManifest,
        artifacts: job.artifacts,
        sourceSha256: job.sourceSha256,
        sourceSize: job.sourceSize,
        storageProvider: job.artifacts.pipelineManifest.provider,
        versionId: job.versionId,
        versionNumber: job.source.versionNumber,
      });
    }

    return {
      generatedAt: utc(this.now),
      references,
      publishedManifests,
      recoverableManifests,
    };
  }

  async recordRestoreAttestationReceipt(
    input: MediaPipelineRestoreReceiptRecordInput
  ): Promise<void> {
    if (
      !input.versionId ||
      !Number.isSafeInteger(input.versionNumber) ||
      input.versionNumber <= 0 ||
      input.receipt.kind !== "restore_attestation" ||
      !/^[a-f0-9]{64}$/.test(input.attestationPayloadSha256) ||
      !isRestoreAttestationStatus(input.attestationStatus) ||
      !isValidTimestamp(input.receiptGeneratedAt)
    ) {
      throw new MediaPipelineError(
        "PIPELINE_STATE_CORRUPT",
        "Restore attestation receipt record is invalid"
      );
    }
    const record = {
      schemaVersion: MEDIA_PIPELINE_SCHEMA_VERSION,
      type: "co_deliver_restore_attestation_receipt_record",
      recordedAt: utc(this.now),
      versionId: input.versionId,
      versionNumber: input.versionNumber,
      receipt: {
        objectKey: input.receipt.objectKey,
        size: input.receipt.size,
        sha256: input.receipt.sha256,
        provider: input.receipt.provider,
      },
      attestationPayloadSha256: input.attestationPayloadSha256,
      attestationStatus: input.attestationStatus,
      attestationReady: input.attestationReady,
      receiptGeneratedAt: input.receiptGeneratedAt,
    };
    const versionDigest = idempotencyHash(input.versionId);
    const receiptDigest = idempotencyHash(input.receipt.sha256 + ":" + input.receipt.objectKey);
    const path = await this.path(
      "restore-receipts",
      `${versionDigest}-${receiptDigest}.json`
    );
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(record, null, 2), { mode: 0o600 });
    await rename(temporary, path);
  }

  async restoreReceiptInventory(): Promise<MediaPipelineRestoreReceiptInventory> {
    const jobsDir = await this.path("jobs", ".");
    const jobEntries = await readdir(jobsDir, { withFileTypes: true });
    const publishedVersionIds = new Set<string>();

    for (const entry of jobEntries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const jobId = entry.name.slice(0, -".json".length);
      if (!isUuid(jobId)) continue;
      const job = await this.get(jobId).catch((error) => {
        if (error instanceof MediaPipelineError && error.code === "PIPELINE_STATE_CORRUPT") {
          return null;
        }
        throw error;
      });
      if (job?.status === "published") publishedVersionIds.add(job.versionId);
    }

    const receiptDir = await this.path("restore-receipts", ".");
    const receiptEntries = await readdir(receiptDir, { withFileTypes: true });
    const references: MediaPipelineRestoreReceiptReference[] = [];
    let invalidReceiptRecords = 0;
    const receiptCountsByVersion = new Map<string, number>();

    for (const entry of receiptEntries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      try {
        const raw = JSON.parse(
          await readFile(await this.path("restore-receipts", entry.name), "utf8")
        ) as Record<string, unknown>;
        const receipt = raw.receipt as Record<string, unknown> | undefined;
        if (
          raw.schemaVersion !== MEDIA_PIPELINE_SCHEMA_VERSION ||
          raw.type !== "co_deliver_restore_attestation_receipt_record" ||
          typeof raw.versionId !== "string" ||
          !Number.isSafeInteger(raw.versionNumber) ||
          !receipt ||
          typeof receipt.objectKey !== "string" ||
          typeof receipt.provider !== "string" ||
          !Number.isSafeInteger(receipt.size) ||
          !/^[a-f0-9]{64}$/.test(String(receipt.sha256)) ||
          !/^[a-f0-9]{64}$/.test(String(raw.attestationPayloadSha256)) ||
          !isRestoreAttestationStatus(raw.attestationStatus) ||
          typeof raw.attestationReady !== "boolean" ||
          typeof raw.receiptGeneratedAt !== "string" ||
          !isValidTimestamp(raw.receiptGeneratedAt)
        ) {
          invalidReceiptRecords += 1;
          continue;
        }
        const versionId = raw.versionId;
        const versionNumber = Number(raw.versionNumber);
        const size = Number(receipt.size);
        receiptCountsByVersion.set(versionId, (receiptCountsByVersion.get(versionId) ?? 0) + 1);
        references.push({
          versionId,
          versionNumber,
          objectKey: receipt.objectKey,
          size,
          sha256: String(receipt.sha256),
          provider: receipt.provider,
          attestationPayloadSha256: String(raw.attestationPayloadSha256),
          attestationStatus: raw.attestationStatus,
          attestationReady: raw.attestationReady,
          receiptGeneratedAt: raw.receiptGeneratedAt,
        });
      } catch {
        invalidReceiptRecords += 1;
      }
    }

    const versionsWithReceipt = [...publishedVersionIds].filter((versionId) =>
      receiptCountsByVersion.has(versionId)
    ).length;
    const duplicateReceiptVersions = [...receiptCountsByVersion.entries()].filter(
      ([versionId, count]) => publishedVersionIds.has(versionId) && count > 1
    ).length;

    return {
      generatedAt: utc(this.now),
      references,
      publishedVersions: publishedVersionIds.size,
      versionsWithReceipt,
      versionsMissingReceipt: publishedVersionIds.size - versionsWithReceipt,
      duplicateReceiptVersions,
      invalidReceiptRecords,
    };
  }

  async recordReceiptCatalogCheckpoint(
    input: MediaPipelineReceiptCatalogCheckpointRecordInput
  ): Promise<void> {
    if (
      !input.provider ||
      (input.scanRoot !== "tenant-object-namespace" &&
        input.scanRoot !== "provider-catalog" &&
        input.scanRoot !== "unsupported") ||
      !Number.isSafeInteger(input.scanLimit) ||
      input.scanLimit <= 0 ||
      !Number.isSafeInteger(input.scannedJsonFiles) ||
      input.scannedJsonFiles < 0 ||
      !Number.isSafeInteger(input.pagesScanned) ||
      input.pagesScanned < 0 ||
      (input.startedCursorDigest !== undefined &&
        input.startedCursorDigest !== null &&
        !/^[a-f0-9]{64}$/.test(input.startedCursorDigest)) ||
      !Number.isSafeInteger(input.discoveredReceipts) ||
      input.discoveredReceipts < 0 ||
      !Number.isSafeInteger(input.invalidJsonFiles) ||
      input.invalidJsonFiles < 0 ||
      !Number.isSafeInteger(input.unsafeEntries) ||
      input.unsafeEntries < 0 ||
      (input.nextCursorDigest !== null && !/^[a-f0-9]{64}$/.test(input.nextCursorDigest)) ||
      (input.continuationTokenDigest !== undefined &&
        input.continuationTokenDigest !== null &&
        !/^[a-f0-9]{64}$/.test(input.continuationTokenDigest)) ||
      (input.continuationTokenKeyDigest !== undefined &&
        input.continuationTokenKeyDigest !== null &&
        !/^[a-f0-9]{32}$/.test(input.continuationTokenKeyDigest)) ||
      (input.continuationTokenExpiresAt !== undefined &&
        input.continuationTokenExpiresAt !== null &&
        !isValidTimestamp(input.continuationTokenExpiresAt))
    ) {
      throw new MediaPipelineError(
        "PIPELINE_STATE_CORRUPT",
        "Receipt catalog checkpoint record is invalid"
      );
    }
    const record = {
      schemaVersion: MEDIA_PIPELINE_SCHEMA_VERSION,
      type: "co_deliver_receipt_catalog_checkpoint_record",
      recordedAt: utc(this.now),
      provider: input.provider,
      scanRoot: input.scanRoot,
      scanLimit: input.scanLimit,
      scannedJsonFiles: input.scannedJsonFiles,
      scanTruncated: input.scanTruncated,
      cursorSupported: input.cursorSupported,
      pagesScanned: input.pagesScanned,
      startedCursorDigest: input.startedCursorDigest ?? null,
      checkpointRequired: input.checkpointRequired,
      nextCursorDigest: input.nextCursorDigest,
      continuationTokenDigest: input.continuationTokenDigest ?? null,
      continuationTokenKeyDigest: input.continuationTokenKeyDigest ?? null,
      continuationTokenExpiresAt: input.continuationTokenExpiresAt ?? null,
      discoveredReceipts: input.discoveredReceipts,
      invalidJsonFiles: input.invalidJsonFiles,
      unsafeEntries: input.unsafeEntries,
      completed: !input.checkpointRequired,
    };
    const checkpointDigest = idempotencyHash(input.provider + ":" + input.scanRoot);
    const path = await this.path("receipt-catalog-checkpoints", `${checkpointDigest}.json`);
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(record, null, 2), { mode: 0o600 });
    await rename(temporary, path);
  }

  async receiptCatalogCheckpointInventory(): Promise<MediaPipelineReceiptCatalogCheckpointInventory> {
    const checkpointDir = await this.path("receipt-catalog-checkpoints", ".");
    const entries = await readdir(checkpointDir, { withFileTypes: true });
    const records: MediaPipelineReceiptCatalogCheckpointReference[] = [];
    let invalidRecords = 0;
    const nowMs = this.now().getTime();

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      try {
        const raw = JSON.parse(
          await readFile(await this.path("receipt-catalog-checkpoints", entry.name), "utf8")
        ) as Record<string, unknown>;
        if (
          raw.schemaVersion !== MEDIA_PIPELINE_SCHEMA_VERSION ||
          raw.type !== "co_deliver_receipt_catalog_checkpoint_record" ||
          typeof raw.recordedAt !== "string" ||
          !isValidTimestamp(raw.recordedAt) ||
          typeof raw.provider !== "string" ||
          (raw.scanRoot !== "tenant-object-namespace" &&
            raw.scanRoot !== "provider-catalog" &&
            raw.scanRoot !== "unsupported") ||
          !Number.isSafeInteger(raw.scanLimit) ||
          !Number.isSafeInteger(raw.scannedJsonFiles) ||
          typeof raw.scanTruncated !== "boolean" ||
          typeof raw.cursorSupported !== "boolean" ||
          !Number.isSafeInteger(raw.pagesScanned) ||
          (raw.startedCursorDigest !== undefined &&
            raw.startedCursorDigest !== null &&
            !/^[a-f0-9]{64}$/.test(String(raw.startedCursorDigest))) ||
          typeof raw.checkpointRequired !== "boolean" ||
          (raw.nextCursorDigest !== null &&
            !/^[a-f0-9]{64}$/.test(String(raw.nextCursorDigest))) ||
          (raw.continuationTokenDigest !== undefined &&
            raw.continuationTokenDigest !== null &&
            !/^[a-f0-9]{64}$/.test(String(raw.continuationTokenDigest))) ||
          (raw.continuationTokenKeyDigest !== undefined &&
            raw.continuationTokenKeyDigest !== null &&
            !/^[a-f0-9]{32}$/.test(String(raw.continuationTokenKeyDigest))) ||
          (raw.continuationTokenExpiresAt !== undefined &&
            raw.continuationTokenExpiresAt !== null &&
            !isValidTimestamp(String(raw.continuationTokenExpiresAt))) ||
          !Number.isSafeInteger(raw.discoveredReceipts) ||
          !Number.isSafeInteger(raw.invalidJsonFiles) ||
          !Number.isSafeInteger(raw.unsafeEntries) ||
          typeof raw.completed !== "boolean"
        ) {
          invalidRecords += 1;
          continue;
        }
        const recordedAt = String(raw.recordedAt);
        records.push({
          recordedAt,
          provider: raw.provider,
          scanRoot: raw.scanRoot,
          scanLimit: Number(raw.scanLimit),
          scannedJsonFiles: Number(raw.scannedJsonFiles),
          scanTruncated: raw.scanTruncated,
          cursorSupported: raw.cursorSupported,
          pagesScanned: Number(raw.pagesScanned),
          startedCursorDigest:
            raw.startedCursorDigest === undefined || raw.startedCursorDigest === null
              ? null
              : String(raw.startedCursorDigest),
          checkpointRequired: raw.checkpointRequired,
          nextCursorDigest: raw.nextCursorDigest === null ? null : String(raw.nextCursorDigest),
          continuationTokenDigest:
            raw.continuationTokenDigest === undefined || raw.continuationTokenDigest === null
              ? null
              : String(raw.continuationTokenDigest),
          continuationTokenKeyDigest:
            raw.continuationTokenKeyDigest === undefined ||
            raw.continuationTokenKeyDigest === null
              ? null
              : String(raw.continuationTokenKeyDigest),
          continuationTokenExpiresAt:
            raw.continuationTokenExpiresAt === undefined ||
            raw.continuationTokenExpiresAt === null
              ? null
              : String(raw.continuationTokenExpiresAt),
          discoveredReceipts: Number(raw.discoveredReceipts),
          invalidJsonFiles: Number(raw.invalidJsonFiles),
          unsafeEntries: Number(raw.unsafeEntries),
          completed: raw.completed,
          stale: nowMs - Date.parse(recordedAt) > RECEIPT_CATALOG_CHECKPOINT_STALE_MS,
        });
      } catch {
        invalidRecords += 1;
      }
    }

    records.sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));
    return {
      generatedAt: utc(this.now),
      records,
      invalidRecords,
      staleRecords: records.filter((record) => record.stale).length,
      latest: records[0] ?? null,
    };
  }

  async receiptCatalogCheckpointResetInventory(): Promise<MediaPipelineReceiptCatalogCheckpointResetInventory> {
    const checkpointDir = await this.path("receipt-catalog-checkpoints", ".");
    const entries = await readdir(checkpointDir, { withFileTypes: true });
    const fileNames: string[] = [];
    let unsafeEntries = 0;
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      if (/^[a-f0-9]{64}\.json$/.test(entry.name)) {
        fileNames.push(entry.name);
      } else {
        unsafeEntries += 1;
      }
    }
    fileNames.sort();
    return {
      generatedAt: utc(this.now),
      fileNames,
      unsafeEntries,
    };
  }

  async deleteReceiptCatalogCheckpoint(input: { fileName: string }): Promise<boolean> {
    if (!/^[a-f0-9]{64}\.json$/.test(input.fileName)) {
      throw new MediaPipelineError(
        "PIPELINE_STATE_CORRUPT",
        "Receipt catalog checkpoint reset key is invalid"
      );
    }
    const path = await this.path("receipt-catalog-checkpoints", input.fileName);
    try {
      await unlink(path);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  async recordReceiptCatalogCheckpointResetReceipt(
    input: MediaPipelineReceiptCatalogCheckpointResetReceiptRecordInput
  ): Promise<void> {
    if (
      input.mode !== "apply" ||
      (input.recordedAt !== undefined && !isValidTimestamp(input.recordedAt)) ||
      !isSha256Digest(input.resetSnapshotDigest) ||
      !Number.isSafeInteger(input.checkpointRecords) ||
      input.checkpointRecords < 0 ||
      !Number.isSafeInteger(input.invalidRecords) ||
      input.invalidRecords < 0 ||
      !Number.isSafeInteger(input.staleRecords) ||
      input.staleRecords < 0 ||
      !Number.isSafeInteger(input.resetCandidates) ||
      input.resetCandidates < 0 ||
      !Number.isSafeInteger(input.unsafeEntries) ||
      input.unsafeEntries < 0 ||
      !Number.isSafeInteger(input.deletedCheckpoints) ||
      input.deletedCheckpoints < 0 ||
      typeof input.applied !== "boolean" ||
      !isSha256Digest(input.receiptPayloadSha256) ||
      (input.receiptIntegrity !== "sha256" && input.receiptIntegrity !== "hmac-sha256") ||
      typeof input.receiptSigned !== "boolean" ||
      !input.receipt ||
      typeof input.receipt !== "object" ||
      Array.isArray(input.receipt)
    ) {
      throw new MediaPipelineError(
        "PIPELINE_STATE_CORRUPT",
        "Receipt catalog checkpoint reset receipt is invalid"
      );
    }
    const recordedAt = utc(this.now);
    const record = {
      schemaVersion: MEDIA_PIPELINE_SCHEMA_VERSION,
      type: "co_deliver_receipt_catalog_checkpoint_reset_receipt_record",
      recordedAt: input.recordedAt ?? recordedAt,
      mode: input.mode,
      resetSnapshotDigest: input.resetSnapshotDigest,
      checkpointRecords: input.checkpointRecords,
      invalidRecords: input.invalidRecords,
      staleRecords: input.staleRecords,
      resetCandidates: input.resetCandidates,
      unsafeEntries: input.unsafeEntries,
      deletedCheckpoints: input.deletedCheckpoints,
      applied: input.applied,
      receiptPayloadSha256: input.receiptPayloadSha256,
      receiptIntegrity: input.receiptIntegrity,
      receiptSigned: input.receiptSigned,
      receipt: input.receipt,
    };
    const path = await this.path(
      "receipt-catalog-checkpoint-reset-receipts",
      `reset-${input.resetSnapshotDigest}-${idempotencyHash((input.recordedAt ?? recordedAt) + ":" + input.receiptPayloadSha256).slice(0, 16)}.json`
    );
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(record, null, 2), { mode: 0o600 });
    await rename(temporary, path);
  }

  async receiptCatalogCheckpointResetReceiptInventory(): Promise<MediaPipelineReceiptCatalogCheckpointResetReceiptInventory> {
    const receiptDir = await this.path("receipt-catalog-checkpoint-reset-receipts", ".");
    const entries = await readdir(receiptDir, { withFileTypes: true });
    const records: MediaPipelineReceiptCatalogCheckpointResetReceiptReference[] = [];
    let invalidRecords = 0;

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      try {
        const raw = JSON.parse(
          await readFile(
            await this.path("receipt-catalog-checkpoint-reset-receipts", entry.name),
            "utf8"
          )
        ) as Record<string, unknown>;
        if (
          raw.schemaVersion !== MEDIA_PIPELINE_SCHEMA_VERSION ||
          raw.type !== "co_deliver_receipt_catalog_checkpoint_reset_receipt_record" ||
          !isValidTimestamp(raw.recordedAt) ||
          raw.mode !== "apply" ||
          !isSha256Digest(raw.resetSnapshotDigest) ||
          !Number.isSafeInteger(raw.checkpointRecords) ||
          Number(raw.checkpointRecords) < 0 ||
          !Number.isSafeInteger(raw.invalidRecords) ||
          Number(raw.invalidRecords) < 0 ||
          !Number.isSafeInteger(raw.staleRecords) ||
          Number(raw.staleRecords) < 0 ||
          !Number.isSafeInteger(raw.resetCandidates) ||
          Number(raw.resetCandidates) < 0 ||
          !Number.isSafeInteger(raw.unsafeEntries) ||
          Number(raw.unsafeEntries) < 0 ||
          !Number.isSafeInteger(raw.deletedCheckpoints) ||
          Number(raw.deletedCheckpoints) < 0 ||
          typeof raw.applied !== "boolean" ||
          !isSha256Digest(raw.receiptPayloadSha256) ||
          (raw.receiptIntegrity !== "sha256" && raw.receiptIntegrity !== "hmac-sha256") ||
          typeof raw.receiptSigned !== "boolean" ||
          !raw.receipt ||
          typeof raw.receipt !== "object" ||
          Array.isArray(raw.receipt)
        ) {
          invalidRecords += 1;
          continue;
        }
        records.push({
          recordedAt: raw.recordedAt,
          fileName: entry.name,
          mode: raw.mode,
          resetSnapshotDigest: raw.resetSnapshotDigest,
          checkpointRecords: Number(raw.checkpointRecords),
          invalidRecords: Number(raw.invalidRecords),
          staleRecords: Number(raw.staleRecords),
          resetCandidates: Number(raw.resetCandidates),
          unsafeEntries: Number(raw.unsafeEntries),
          deletedCheckpoints: Number(raw.deletedCheckpoints),
          applied: raw.applied,
          receiptPayloadSha256: raw.receiptPayloadSha256,
          receiptIntegrity: raw.receiptIntegrity,
          receiptSigned: raw.receiptSigned,
          receipt: raw.receipt as Record<string, unknown>,
        });
      } catch {
        invalidRecords += 1;
      }
    }

    records.sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));
    return {
      generatedAt: utc(this.now),
      records,
      invalidRecords,
      signedReceipts: records.filter((record) => record.receiptSigned).length,
      unsignedReceipts: records.filter((record) => !record.receiptSigned).length,
      latest: records[0] ?? null,
    };
  }

  async deleteReceiptCatalogCheckpointResetReceipt(input: {
    fileName: string;
  }): Promise<boolean> {
    if (!/^reset-[a-f0-9]{64}-[a-f0-9]{16}\.json$/.test(input.fileName)) {
      throw new MediaPipelineError(
        "PIPELINE_STATE_CORRUPT",
        "Receipt catalog checkpoint reset receipt lifecycle key is invalid"
      );
    }
    const path = await this.path(
      "receipt-catalog-checkpoint-reset-receipts",
      input.fileName
    );
    try {
      await unlink(path);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  async recordReceiptCatalogCheckpointResetReceiptPacket(
    input: MediaPipelineReceiptCatalogCheckpointResetReceiptPacketRecordInput
  ): Promise<void> {
    if (
      !isSha256Digest(input.packetDigest) ||
      !isValidTimestamp(input.packetGeneratedAt) ||
      !Number.isSafeInteger(input.recordCount) ||
      input.recordCount < 0 ||
      !Number.isSafeInteger(input.signedReceipts) ||
      input.signedReceipts < 0 ||
      !Number.isSafeInteger(input.appliedReceipts) ||
      input.appliedReceipts < 0 ||
      (input.packetIntegrity !== "sha256" && input.packetIntegrity !== "hmac-sha256") ||
      typeof input.packetSigned !== "boolean" ||
      !input.packet ||
      typeof input.packet !== "object" ||
      Array.isArray(input.packet)
    ) {
      throw new MediaPipelineError(
        "PIPELINE_STATE_CORRUPT",
        "Receipt catalog checkpoint reset receipt packet is invalid"
      );
    }
    const recordedAt = utc(this.now);
    const record = {
      schemaVersion: MEDIA_PIPELINE_SCHEMA_VERSION,
      type: "co_deliver_receipt_catalog_checkpoint_reset_receipt_packet_record",
      recordedAt,
      packetDigest: input.packetDigest,
      packetGeneratedAt: input.packetGeneratedAt,
      recordCount: input.recordCount,
      signedReceipts: input.signedReceipts,
      appliedReceipts: input.appliedReceipts,
      packetIntegrity: input.packetIntegrity,
      packetSigned: input.packetSigned,
      packet: input.packet,
    };
    const path = await this.path(
      "receipt-catalog-checkpoint-reset-receipt-packets",
      `${input.packetDigest}-${idempotencyHash(recordedAt + ":" + randomUUID()).slice(0, 16)}.json`
    );
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(record, null, 2), { mode: 0o600 });
    await rename(temporary, path);
  }

  async receiptCatalogCheckpointResetReceiptPacketInventory(): Promise<MediaPipelineReceiptCatalogCheckpointResetReceiptPacketInventory> {
    const packetDir = await this.path(
      "receipt-catalog-checkpoint-reset-receipt-packets",
      "."
    );
    const entries = await readdir(packetDir, { withFileTypes: true });
    const records: MediaPipelineReceiptCatalogCheckpointResetReceiptPacketReference[] = [];
    const invalidReferences: MediaPipelineReceiptCatalogCheckpointResetReceiptPacketInvalidReference[] = [];
    let invalidRecords = 0;

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      try {
        const raw = JSON.parse(
          await readFile(
            await this.path(
              "receipt-catalog-checkpoint-reset-receipt-packets",
              entry.name
            ),
            "utf8"
          )
        ) as Record<string, unknown>;
        const packet = raw.packet as Record<string, unknown> | undefined;
        if (
          raw.schemaVersion !== MEDIA_PIPELINE_SCHEMA_VERSION ||
          raw.type !== "co_deliver_receipt_catalog_checkpoint_reset_receipt_packet_record" ||
          !isValidTimestamp(raw.recordedAt) ||
          !isSha256Digest(raw.packetDigest) ||
          !isValidTimestamp(raw.packetGeneratedAt) ||
          !Number.isSafeInteger(raw.recordCount) ||
          Number(raw.recordCount) < 0 ||
          !Number.isSafeInteger(raw.signedReceipts) ||
          Number(raw.signedReceipts) < 0 ||
          !Number.isSafeInteger(raw.appliedReceipts) ||
          Number(raw.appliedReceipts) < 0 ||
          (raw.packetIntegrity !== "sha256" && raw.packetIntegrity !== "hmac-sha256") ||
          typeof raw.packetSigned !== "boolean" ||
          !packet ||
          typeof packet !== "object" ||
          Array.isArray(packet)
        ) {
          invalidRecords += 1;
          invalidReferences.push({ fileName: entry.name, reason: "malformed_record" });
          continue;
        }
        records.push({
          recordedAt: raw.recordedAt,
          fileName: entry.name,
          packetDigest: raw.packetDigest,
          packetGeneratedAt: raw.packetGeneratedAt,
          recordCount: Number(raw.recordCount),
          signedReceipts: Number(raw.signedReceipts),
          appliedReceipts: Number(raw.appliedReceipts),
          packetIntegrity: raw.packetIntegrity,
          packetSigned: raw.packetSigned,
          packet,
        });
      } catch {
        invalidRecords += 1;
        invalidReferences.push({ fileName: entry.name, reason: "malformed_record" });
      }
    }

    records.sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));
    const packetCounts = new Map<string, number>();
    for (const record of records) {
      packetCounts.set(record.packetDigest, (packetCounts.get(record.packetDigest) ?? 0) + 1);
    }
    return {
      generatedAt: utc(this.now),
      records,
      invalidRecords,
      invalidReferences,
      duplicatePacketDigests: [...packetCounts.values()].filter((count) => count > 1).length,
      signedPackets: records.filter((record) => record.packetSigned).length,
      unsignedPackets: records.filter((record) => !record.packetSigned).length,
      latest: records[0] ?? null,
    };
  }

  async deleteReceiptCatalogCheckpointResetReceiptPacket(input: {
    fileName: string;
  }): Promise<boolean> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,191}\.json$/.test(input.fileName)) {
      throw new MediaPipelineError(
        "PIPELINE_STATE_CORRUPT",
        "Receipt catalog checkpoint reset receipt packet lifecycle key is invalid"
      );
    }
    const path = await this.path(
      "receipt-catalog-checkpoint-reset-receipt-packets",
      input.fileName
    );
    try {
      await unlink(path);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  async quarantineReceiptCatalogCheckpointResetReceiptPacket(input: {
    fileName: string;
    reason: "malformed_record" | "invalid_integrity" | "payload_mismatch";
  }): Promise<boolean> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,191}\.json$/.test(input.fileName)) {
      throw new MediaPipelineError(
        "PIPELINE_STATE_CORRUPT",
        "Receipt catalog checkpoint reset receipt packet quarantine key is invalid"
      );
    }
    const source = await this.path(
      "receipt-catalog-checkpoint-reset-receipt-packets",
      input.fileName
    );
    const target = await this.path(
      "receipt-catalog-checkpoint-reset-receipt-packet-quarantine",
      `${idempotencyHash(utc(this.now) + ":" + randomUUID()).slice(0, 16)}-${input.reason}-${input.fileName}`
    );
    try {
      await rename(source, target);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  async receiptCatalogCheckpointResetReceiptPacketQuarantineInventory(): Promise<MediaPipelineReceiptCatalogCheckpointResetReceiptPacketQuarantineInventory> {
    const quarantineDir = await this.path(
      "receipt-catalog-checkpoint-reset-receipt-packet-quarantine",
      "."
    );
    const entries = await readdir(quarantineDir, { withFileTypes: true });
    const records: MediaPipelineReceiptCatalogCheckpointResetReceiptPacketQuarantineReference[] = [];
    let invalidRecords = 0;
    const reasonPattern =
      /^[a-f0-9]{16}-(malformed_record|invalid_integrity|payload_mismatch)-.+\.json$/;

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const match = entry.name.match(reasonPattern);
      const reason = match?.[1] as
        | MediaPipelineReceiptCatalogCheckpointResetReceiptPacketQuarantineReason
        | undefined;
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,255}\.json$/.test(entry.name)) {
        invalidRecords += 1;
        continue;
      }
      const fileStat = await stat(
        await this.path(
          "receipt-catalog-checkpoint-reset-receipt-packet-quarantine",
          entry.name
        )
      );
      records.push({
        fileName: entry.name,
        reason: reason ?? "unknown",
        quarantinedAt: fileStat.mtime.toISOString(),
      });
    }

    records.sort((left, right) => right.quarantinedAt.localeCompare(left.quarantinedAt));
    return {
      generatedAt: utc(this.now),
      records,
      invalidRecords,
      malformedRecordQuarantines: records.filter((record) => record.reason === "malformed_record").length,
      invalidIntegrityQuarantines: records.filter((record) => record.reason === "invalid_integrity").length,
      payloadMismatchQuarantines: records.filter((record) => record.reason === "payload_mismatch").length,
      unknownReasonQuarantines: records.filter((record) => record.reason === "unknown").length,
      latest: records[0] ?? null,
    };
  }

  async deleteReceiptCatalogCheckpointResetReceiptPacketQuarantine(input: {
    fileName: string;
  }): Promise<boolean> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,255}\.json$/.test(input.fileName)) {
      throw new MediaPipelineError(
        "PIPELINE_STATE_CORRUPT",
        "Receipt catalog checkpoint reset receipt packet quarantine lifecycle key is invalid"
      );
    }
    const path = await this.path(
      "receipt-catalog-checkpoint-reset-receipt-packet-quarantine",
      input.fileName
    );
    try {
      await unlink(path);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  async recordProviderCatalogConformanceReceipt(
    input: MediaPipelineProviderCatalogConformanceReceiptRecordInput
  ): Promise<void> {
    if (
      !input.provider ||
      !isSha256Digest(input.providerDigest) ||
      !isSha256Digest(input.reportPayloadSha256) ||
      !isSha256Digest(input.receiptPayloadSha256) ||
      (input.receiptIntegrity !== "sha256" && input.receiptIntegrity !== "hmac-sha256") ||
      typeof input.receiptSigned !== "boolean" ||
      !Number.isSafeInteger(input.findingCount) ||
      input.findingCount < 0 ||
      typeof input.ready !== "boolean" ||
      typeof input.capabilityPresent !== "boolean" ||
      typeof input.checkpointRequired !== "boolean" ||
      (input.recordedAt !== undefined && !isValidTimestamp(input.recordedAt)) ||
      !isValidTimestamp(input.receiptGeneratedAt) ||
      !input.receipt ||
      typeof input.receipt !== "object" ||
      Array.isArray(input.receipt)
    ) {
      throw new MediaPipelineError(
        "PIPELINE_STATE_CORRUPT",
        "Provider catalog conformance receipt record is invalid"
      );
    }
    const record = {
      schemaVersion: MEDIA_PIPELINE_SCHEMA_VERSION,
      type: "co_deliver_provider_catalog_conformance_receipt_record",
      recordedAt: input.recordedAt ?? utc(this.now),
      provider: input.provider,
      providerDigest: input.providerDigest,
      reportPayloadSha256: input.reportPayloadSha256,
      ready: input.ready,
      capabilityPresent: input.capabilityPresent,
      checkpointRequired: input.checkpointRequired,
      findingCount: input.findingCount,
      receiptPayloadSha256: input.receiptPayloadSha256,
      receiptIntegrity: input.receiptIntegrity,
      receiptSigned: input.receiptSigned,
      receiptGeneratedAt: input.receiptGeneratedAt,
      receipt: input.receipt,
    };
    const path = await this.path(
      "provider-catalog-conformance-receipts",
      `${input.providerDigest}-${input.receiptPayloadSha256}.json`
    );
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(record, null, 2), { mode: 0o600 });
    await rename(temporary, path);
  }

  async providerCatalogConformanceReceiptInventory(): Promise<MediaPipelineProviderCatalogConformanceReceiptInventory> {
    const receiptDir = await this.path("provider-catalog-conformance-receipts", ".");
    const entries = await readdir(receiptDir, { withFileTypes: true });
    const records: MediaPipelineProviderCatalogConformanceReceiptReference[] = [];
    let invalidRecords = 0;

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      try {
        const raw = JSON.parse(
          await readFile(
            await this.path("provider-catalog-conformance-receipts", entry.name),
            "utf8"
          )
        ) as Record<string, unknown>;
        const receipt = raw.receipt as Record<string, unknown> | undefined;
        if (
          raw.schemaVersion !== MEDIA_PIPELINE_SCHEMA_VERSION ||
          raw.type !== "co_deliver_provider_catalog_conformance_receipt_record" ||
          !isValidTimestamp(raw.recordedAt) ||
          typeof raw.provider !== "string" ||
          !isSha256Digest(raw.providerDigest) ||
          !isSha256Digest(raw.reportPayloadSha256) ||
          typeof raw.ready !== "boolean" ||
          typeof raw.capabilityPresent !== "boolean" ||
          typeof raw.checkpointRequired !== "boolean" ||
          !Number.isSafeInteger(raw.findingCount) ||
          Number(raw.findingCount) < 0 ||
          !isSha256Digest(raw.receiptPayloadSha256) ||
          (raw.receiptIntegrity !== "sha256" && raw.receiptIntegrity !== "hmac-sha256") ||
          typeof raw.receiptSigned !== "boolean" ||
          !isValidTimestamp(raw.receiptGeneratedAt) ||
          !receipt ||
          typeof receipt !== "object" ||
          Array.isArray(receipt)
        ) {
          invalidRecords += 1;
          continue;
        }
        records.push({
          recordedAt: raw.recordedAt,
          provider: raw.provider,
          providerDigest: raw.providerDigest,
          reportPayloadSha256: raw.reportPayloadSha256,
          ready: raw.ready,
          capabilityPresent: raw.capabilityPresent,
          checkpointRequired: raw.checkpointRequired,
          findingCount: Number(raw.findingCount),
          receiptPayloadSha256: raw.receiptPayloadSha256,
          receiptIntegrity: raw.receiptIntegrity,
          receiptSigned: raw.receiptSigned,
          receiptGeneratedAt: raw.receiptGeneratedAt,
          receipt,
        });
      } catch {
        invalidRecords += 1;
      }
    }

    records.sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));
    return {
      generatedAt: utc(this.now),
      records,
      invalidRecords,
      signedRecords: records.filter((record) => record.receiptSigned).length,
      unsignedRecords: records.filter((record) => !record.receiptSigned).length,
      readyRecords: records.filter((record) => record.ready).length,
      failedRecords: records.filter((record) => !record.ready).length,
      latest: records[0] ?? null,
    };
  }

  async deleteProviderCatalogConformanceReceipt(input: {
    providerDigest: string;
    receiptPayloadSha256: string;
  }): Promise<boolean> {
    if (
      !isSha256Digest(input.providerDigest) ||
      !isSha256Digest(input.receiptPayloadSha256)
    ) {
      throw new MediaPipelineError(
        "PIPELINE_STATE_CORRUPT",
        "Provider catalog conformance receipt delete key is invalid"
      );
    }
    const path = await this.path(
      "provider-catalog-conformance-receipts",
      `${input.providerDigest}-${input.receiptPayloadSha256}.json`
    );
    try {
      await unlink(path);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  async recordProviderCatalogConformancePacket(
    input: MediaPipelineProviderCatalogConformancePacketRecordInput
  ): Promise<void> {
    if (
      !isSha256Digest(input.packetDigest) ||
      !isValidTimestamp(input.packetGeneratedAt) ||
      !Number.isSafeInteger(input.providerCount) ||
      input.providerCount < 0 ||
      !Number.isSafeInteger(input.recordCount) ||
      input.recordCount < 0 ||
      !Number.isSafeInteger(input.signedRecords) ||
      input.signedRecords < 0 ||
      !Number.isSafeInteger(input.readyRecords) ||
      input.readyRecords < 0 ||
      !Number.isSafeInteger(input.failedRecords) ||
      input.failedRecords < 0 ||
      (input.packetIntegrity !== "sha256" && input.packetIntegrity !== "hmac-sha256") ||
      typeof input.packetSigned !== "boolean" ||
      !input.packet ||
      typeof input.packet !== "object" ||
      Array.isArray(input.packet)
    ) {
      throw new MediaPipelineError(
        "PIPELINE_STATE_CORRUPT",
        "Provider catalog conformance packet record is invalid"
      );
    }
    const recordedAt = utc(this.now);
    const record = {
      schemaVersion: MEDIA_PIPELINE_SCHEMA_VERSION,
      type: "co_deliver_provider_catalog_conformance_packet_record",
      recordedAt,
      packetDigest: input.packetDigest,
      packetGeneratedAt: input.packetGeneratedAt,
      providerCount: input.providerCount,
      recordCount: input.recordCount,
      signedRecords: input.signedRecords,
      readyRecords: input.readyRecords,
      failedRecords: input.failedRecords,
      packetIntegrity: input.packetIntegrity,
      packetSigned: input.packetSigned,
      packet: input.packet,
    };
    const path = await this.path(
      "provider-catalog-conformance-packets",
      `${input.packetDigest}-${idempotencyHash(recordedAt + ":" + randomUUID()).slice(0, 16)}.json`
    );
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(record, null, 2), { mode: 0o600 });
    await rename(temporary, path);
  }

  async providerCatalogConformancePacketInventory(): Promise<MediaPipelineProviderCatalogConformancePacketInventory> {
    const packetDir = await this.path("provider-catalog-conformance-packets", ".");
    const entries = await readdir(packetDir, { withFileTypes: true });
    const records: MediaPipelineProviderCatalogConformancePacketReference[] = [];
    const invalidReferences: MediaPipelineProviderCatalogConformancePacketInvalidReference[] = [];
    let invalidRecords = 0;

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      try {
        const raw = JSON.parse(
          await readFile(
            await this.path("provider-catalog-conformance-packets", entry.name),
            "utf8"
          )
        ) as Record<string, unknown>;
        const packet = raw.packet as Record<string, unknown> | undefined;
        if (
          raw.schemaVersion !== MEDIA_PIPELINE_SCHEMA_VERSION ||
          raw.type !== "co_deliver_provider_catalog_conformance_packet_record" ||
          !isValidTimestamp(raw.recordedAt) ||
          !isSha256Digest(raw.packetDigest) ||
          !isValidTimestamp(raw.packetGeneratedAt) ||
          !Number.isSafeInteger(raw.providerCount) ||
          Number(raw.providerCount) < 0 ||
          !Number.isSafeInteger(raw.recordCount) ||
          Number(raw.recordCount) < 0 ||
          !Number.isSafeInteger(raw.signedRecords) ||
          Number(raw.signedRecords) < 0 ||
          !Number.isSafeInteger(raw.readyRecords) ||
          Number(raw.readyRecords) < 0 ||
          !Number.isSafeInteger(raw.failedRecords) ||
          Number(raw.failedRecords) < 0 ||
          (raw.packetIntegrity !== "sha256" && raw.packetIntegrity !== "hmac-sha256") ||
          typeof raw.packetSigned !== "boolean" ||
          !packet ||
          typeof packet !== "object" ||
          Array.isArray(packet)
        ) {
          invalidRecords += 1;
          invalidReferences.push({ fileName: entry.name, reason: "malformed_record" });
          continue;
        }
        records.push({
          recordedAt: raw.recordedAt,
          fileName: entry.name,
          packetDigest: raw.packetDigest,
          packetGeneratedAt: raw.packetGeneratedAt,
          providerCount: Number(raw.providerCount),
          recordCount: Number(raw.recordCount),
          signedRecords: Number(raw.signedRecords),
          readyRecords: Number(raw.readyRecords),
          failedRecords: Number(raw.failedRecords),
          packetIntegrity: raw.packetIntegrity,
          packetSigned: raw.packetSigned,
          packet,
        });
      } catch {
        invalidRecords += 1;
        invalidReferences.push({ fileName: entry.name, reason: "malformed_record" });
      }
    }

    records.sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));
    const packetCounts = new Map<string, number>();
    for (const record of records) {
      packetCounts.set(record.packetDigest, (packetCounts.get(record.packetDigest) ?? 0) + 1);
    }
    return {
      generatedAt: utc(this.now),
      records,
      invalidRecords,
      invalidReferences,
      duplicatePacketDigests: [...packetCounts.values()].filter((count) => count > 1).length,
      signedPackets: records.filter((record) => record.packetSigned).length,
      unsignedPackets: records.filter((record) => !record.packetSigned).length,
      latest: records[0] ?? null,
    };
  }

  async deleteProviderCatalogConformancePacket(input: {
    fileName: string;
  }): Promise<boolean> {
    if (!/^[a-f0-9]{64}-[a-f0-9]{16}\.json$/.test(input.fileName)) {
      throw new MediaPipelineError(
        "PIPELINE_STATE_CORRUPT",
        "Provider catalog conformance packet delete key is invalid"
      );
    }
    const path = await this.path("provider-catalog-conformance-packets", input.fileName);
    try {
      await unlink(path);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  async quarantineProviderCatalogConformancePacket(input: {
    fileName: string;
    reason: "malformed_record" | "invalid_integrity" | "payload_mismatch";
  }): Promise<boolean> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,191}\.json$/.test(input.fileName)) {
      throw new MediaPipelineError(
        "PIPELINE_STATE_CORRUPT",
        "Provider catalog conformance packet quarantine key is invalid"
      );
    }
    const source = await this.path("provider-catalog-conformance-packets", input.fileName);
    const target = await this.path(
      "provider-catalog-conformance-packet-quarantine",
      `${idempotencyHash(utc(this.now) + ":" + randomUUID()).slice(0, 16)}-${input.reason}-${input.fileName}`
    );
    try {
      await rename(source, target);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  async providerCatalogConformancePacketQuarantineInventory(): Promise<MediaPipelineProviderCatalogConformancePacketQuarantineInventory> {
    const quarantineDir = await this.path(
      "provider-catalog-conformance-packet-quarantine",
      "."
    );
    const entries = await readdir(quarantineDir, { withFileTypes: true });
    const records: MediaPipelineProviderCatalogConformancePacketQuarantineReference[] = [];
    let invalidRecords = 0;
    const reasonPattern =
      /^[a-f0-9]{16}-(malformed_record|invalid_integrity|payload_mismatch)-.+\.json$/;

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const match = entry.name.match(reasonPattern);
      const reason = match?.[1] as
        | MediaPipelineProviderCatalogConformancePacketQuarantineReason
        | undefined;
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,255}\.json$/.test(entry.name)) {
        invalidRecords += 1;
        continue;
      }
      const fileStat = await stat(
        await this.path("provider-catalog-conformance-packet-quarantine", entry.name)
      );
      records.push({
        fileName: entry.name,
        reason: reason ?? "unknown",
        quarantinedAt: fileStat.mtime.toISOString(),
      });
    }

    records.sort((left, right) => right.quarantinedAt.localeCompare(left.quarantinedAt));
    return {
      generatedAt: utc(this.now),
      records,
      invalidRecords,
      malformedRecordQuarantines: records.filter((record) => record.reason === "malformed_record").length,
      invalidIntegrityQuarantines: records.filter((record) => record.reason === "invalid_integrity").length,
      payloadMismatchQuarantines: records.filter((record) => record.reason === "payload_mismatch").length,
      unknownReasonQuarantines: records.filter((record) => record.reason === "unknown").length,
      latest: records[0] ?? null,
    };
  }

  async deleteProviderCatalogConformancePacketQuarantine(input: {
    fileName: string;
  }): Promise<boolean> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,255}\.json$/.test(input.fileName)) {
      throw new MediaPipelineError(
        "PIPELINE_STATE_CORRUPT",
        "Provider catalog conformance packet quarantine lifecycle key is invalid"
      );
    }
    const path = await this.path(
      "provider-catalog-conformance-packet-quarantine",
      input.fileName
    );
    try {
      await unlink(path);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  async recordProviderCatalogConformancePacketQuarantineAttestation(
    input: MediaPipelineProviderCatalogConformancePacketQuarantineAttestationRecordInput
  ): Promise<void> {
    if (
      (input.decision !== "reviewed" &&
        input.decision !== "retained" &&
        input.decision !== "released") ||
      !isSha256Digest(input.quarantineSnapshotDigest) ||
      !Number.isSafeInteger(input.quarantinedPackets) ||
      input.quarantinedPackets < 0 ||
      !Number.isSafeInteger(input.malformedRecordQuarantines) ||
      input.malformedRecordQuarantines < 0 ||
      !Number.isSafeInteger(input.invalidIntegrityQuarantines) ||
      input.invalidIntegrityQuarantines < 0 ||
      !Number.isSafeInteger(input.payloadMismatchQuarantines) ||
      input.payloadMismatchQuarantines < 0 ||
      !Number.isSafeInteger(input.unknownReasonQuarantines) ||
      input.unknownReasonQuarantines < 0 ||
      (input.oldestQuarantineAgeMs !== null &&
        (!Number.isSafeInteger(input.oldestQuarantineAgeMs) ||
          input.oldestQuarantineAgeMs < 0)) ||
      !isSha256Digest(input.attestationPayloadSha256) ||
      (input.attestationIntegrity !== "sha256" &&
        input.attestationIntegrity !== "hmac-sha256") ||
      typeof input.attestationSigned !== "boolean" ||
      !input.attestation ||
      typeof input.attestation !== "object" ||
      Array.isArray(input.attestation)
    ) {
      throw new MediaPipelineError(
        "PIPELINE_STATE_CORRUPT",
        "Provider catalog packet quarantine attestation is invalid"
      );
    }
    const recordedAt = utc(this.now);
    const record = {
      schemaVersion: MEDIA_PIPELINE_SCHEMA_VERSION,
      type: "co_deliver_provider_catalog_packet_quarantine_attestation_record",
      recordedAt,
      decision: input.decision,
      quarantineSnapshotDigest: input.quarantineSnapshotDigest,
      quarantinedPackets: input.quarantinedPackets,
      malformedRecordQuarantines: input.malformedRecordQuarantines,
      invalidIntegrityQuarantines: input.invalidIntegrityQuarantines,
      payloadMismatchQuarantines: input.payloadMismatchQuarantines,
      unknownReasonQuarantines: input.unknownReasonQuarantines,
      oldestQuarantineAgeMs: input.oldestQuarantineAgeMs,
      attestationPayloadSha256: input.attestationPayloadSha256,
      attestationIntegrity: input.attestationIntegrity,
      attestationSigned: input.attestationSigned,
      attestation: input.attestation,
    };
    const path = await this.path(
      "provider-catalog-conformance-packet-quarantine-attestations",
      `${input.decision}-${input.quarantineSnapshotDigest}-${idempotencyHash(recordedAt + ":" + randomUUID()).slice(0, 16)}.json`
    );
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(record, null, 2), { mode: 0o600 });
    await rename(temporary, path);
  }

  async providerCatalogConformancePacketQuarantineAttestationInventory(): Promise<MediaPipelineProviderCatalogConformancePacketQuarantineAttestationInventory> {
    const attestationDir = await this.path(
      "provider-catalog-conformance-packet-quarantine-attestations",
      "."
    );
    const entries = await readdir(attestationDir, { withFileTypes: true });
    const records: MediaPipelineProviderCatalogConformancePacketQuarantineAttestationReference[] = [];
    let invalidRecords = 0;

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      try {
        const raw = JSON.parse(
          await readFile(
            await this.path(
              "provider-catalog-conformance-packet-quarantine-attestations",
              entry.name
            ),
            "utf8"
          )
        ) as Record<string, unknown>;
        if (
          raw.schemaVersion !== MEDIA_PIPELINE_SCHEMA_VERSION ||
          raw.type !== "co_deliver_provider_catalog_packet_quarantine_attestation_record" ||
          !isValidTimestamp(raw.recordedAt) ||
          (raw.decision !== "reviewed" &&
            raw.decision !== "retained" &&
            raw.decision !== "released") ||
          !isSha256Digest(raw.quarantineSnapshotDigest) ||
          !Number.isSafeInteger(raw.quarantinedPackets) ||
          Number(raw.quarantinedPackets) < 0 ||
          !Number.isSafeInteger(raw.malformedRecordQuarantines) ||
          Number(raw.malformedRecordQuarantines) < 0 ||
          !Number.isSafeInteger(raw.invalidIntegrityQuarantines) ||
          Number(raw.invalidIntegrityQuarantines) < 0 ||
          !Number.isSafeInteger(raw.payloadMismatchQuarantines) ||
          Number(raw.payloadMismatchQuarantines) < 0 ||
          !Number.isSafeInteger(raw.unknownReasonQuarantines) ||
          Number(raw.unknownReasonQuarantines) < 0 ||
          (raw.oldestQuarantineAgeMs !== null &&
            (!Number.isSafeInteger(raw.oldestQuarantineAgeMs) ||
              Number(raw.oldestQuarantineAgeMs) < 0)) ||
          !isSha256Digest(raw.attestationPayloadSha256) ||
          (raw.attestationIntegrity !== "sha256" &&
            raw.attestationIntegrity !== "hmac-sha256") ||
          typeof raw.attestationSigned !== "boolean" ||
          !raw.attestation ||
          typeof raw.attestation !== "object" ||
          Array.isArray(raw.attestation)
        ) {
          invalidRecords += 1;
          continue;
        }
        records.push({
          fileName: entry.name,
          recordedAt: raw.recordedAt,
          decision: raw.decision,
          quarantineSnapshotDigest: raw.quarantineSnapshotDigest,
          quarantinedPackets: Number(raw.quarantinedPackets),
          malformedRecordQuarantines: Number(raw.malformedRecordQuarantines),
          invalidIntegrityQuarantines: Number(raw.invalidIntegrityQuarantines),
          payloadMismatchQuarantines: Number(raw.payloadMismatchQuarantines),
          unknownReasonQuarantines: Number(raw.unknownReasonQuarantines),
          oldestQuarantineAgeMs:
            raw.oldestQuarantineAgeMs === null ? null : Number(raw.oldestQuarantineAgeMs),
          attestationPayloadSha256: raw.attestationPayloadSha256,
          attestationIntegrity: raw.attestationIntegrity,
          attestationSigned: raw.attestationSigned,
          attestation: raw.attestation as Record<string, unknown>,
        });
      } catch {
        invalidRecords += 1;
      }
    }

    records.sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));
    return {
      generatedAt: utc(this.now),
      records,
      invalidRecords,
      reviewedAttestations: records.filter((record) => record.decision === "reviewed").length,
      retainedAttestations: records.filter((record) => record.decision === "retained").length,
      releasedAttestations: records.filter((record) => record.decision === "released").length,
      signedAttestations: records.filter((record) => record.attestationSigned).length,
      unsignedAttestations: records.filter((record) => !record.attestationSigned).length,
      latest: records[0] ?? null,
    };
  }

  async deleteProviderCatalogConformancePacketQuarantineAttestation(input: {
    fileName: string;
  }): Promise<boolean> {
    if (
      !/^(reviewed|retained|released)-[a-f0-9]{64}-[a-f0-9]{16}\.json$/.test(
        input.fileName
      )
    ) {
      throw new MediaPipelineError(
        "PIPELINE_STATE_CORRUPT",
        "Provider catalog packet quarantine attestation lifecycle key is invalid"
      );
    }
    const path = await this.path(
      "provider-catalog-conformance-packet-quarantine-attestations",
      input.fileName
    );
    try {
      await unlink(path);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  async sourceReceiptInventory(): Promise<MediaPipelineSourceReceiptInventory> {
    const jobsDir = await this.path("jobs", ".");
    const entries = await readdir(jobsDir, { withFileTypes: true });
    const references: MediaPipelineSourceReceiptReference[] = [];
    let totalJobs = 0;
    let jobsWithReceipt = 0;
    let jobsMissingReceipt = 0;
    let activeJobsMissingReceipt = 0;
    let publishedJobsWithReceipt = 0;
    let invalidReceiptJobs = 0;

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const jobId = entry.name.slice(0, -".json".length);
      if (!isUuid(jobId)) continue;
      const job = await this.get(jobId).catch((error) => {
        if (error instanceof MediaPipelineError && error.code === "PIPELINE_STATE_CORRUPT") {
          return null;
        }
        throw error;
      });
      if (!job) continue;
      totalJobs += 1;
      const receipt = job.source.receipt ?? null;
      if (!receipt) {
        jobsMissingReceipt += 1;
        if (!isTerminal(job.status)) activeJobsMissingReceipt += 1;
        continue;
      }
      if (!validSourceReceipt(receipt, job.source.objectKey)) {
        invalidReceiptJobs += 1;
        continue;
      }
      jobsWithReceipt += 1;
      if (job.status === "published") publishedJobsWithReceipt += 1;
      references.push({
        objectKey: receipt.objectKey,
        size: receipt.size,
        sha256: receipt.sha256,
        provider: receipt.provider,
      });
    }

    return {
      generatedAt: utc(this.now),
      references,
      totalJobs,
      jobsWithReceipt,
      jobsMissingReceipt,
      activeJobsMissingReceipt,
      publishedJobsWithReceipt,
      invalidReceiptJobs,
    };
  }

  async recoverExpired(jobId: string): Promise<MediaPipelineJob> {
    return this.mutate(jobId, (current) => {
      const expired = current.lease && Date.parse(current.lease.expiresAt) <= this.now().getTime();
      if (current.status !== "running" || !expired) return current;
      return this.appendEvent(
        {
          ...current,
          status: "retry_wait",
          retryAt: utc(this.now),
          lease: null,
        },
        "recovered",
        current.stage,
        current.progress,
        "STALE_WORKER"
      );
    });
  }

  private async acquireLock(
    path: string,
    ttlMs: number
  ): Promise<{ holderId: string; expiresAt: string } | null> {
    const holderId = randomUUID();
    const expiresAt = new Date(this.now().getTime() + ttlMs).toISOString();
    const content = JSON.stringify({ holderId, expiresAt } satisfies PersistedLock);

    try {
      const file = await open(path, "wx", 0o600);
      try {
        await file.writeFile(content);
        await file.sync();
      } finally {
        await file.close();
      }
      return { holderId, expiresAt };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        const current = JSON.parse(await readFile(path, "utf8")) as PersistedLock;
        if (typeof current.expiresAt === "string" && Date.parse(current.expiresAt) <= this.now().getTime()) {
          await unlink(path);
          return this.acquireLock(path, ttlMs);
        }
      } catch (readError) {
        if ((readError as NodeJS.ErrnoException).code === "ENOENT") {
          return this.acquireLock(path, ttlMs);
        }
      }
      return null;
    }
  }

  private async acquireRequiredLock(
    path: string,
    ttlMs: number,
    waitMs: number
  ): Promise<{ holderId: string; expiresAt: string }> {
    const deadline = Date.now() + waitMs;
    do {
      const lock = await this.acquireLock(path, ttlMs);
      if (lock) return lock;
      await sleep(ENQUEUE_LOCK_POLL_MS);
    } while (Date.now() < deadline);

    throw new MediaPipelineError(
      "PIPELINE_BACKPRESSURE",
      "Pipeline enqueue is waiting for an equivalent job to settle",
      true
    );
  }

  private async releaseLock(path: string, holderId: string): Promise<void> {
    try {
      const current = JSON.parse(await readFile(path, "utf8")) as PersistedLock;
      if (current.holderId === holderId) {
        await unlink(path);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  async acquireJobLease(jobId: string, ttlMs: number): Promise<JobLeaseHandle | null> {
    const path = await this.path("locks", `${jobId}.json`);
    const lock = await this.acquireLock(path, ttlMs);
    if (!lock) return null;
    try {
      const job = await this.getOrThrow(jobId);
      if (!isEligibleForClaim(job, this.now().getTime())) {
        await this.releaseLock(path, lock.holderId);
        return null;
      }
      const lease: MediaPipelineLease = {
        holderId: lock.holderId,
        acquiredAt: utc(this.now),
        expiresAt: lock.expiresAt,
      };
      const claimed = await this.setRunning(jobId, lease);
      return {
        job: claimed,
        holderId: lock.holderId,
        release: () => this.releaseLock(path, lock.holderId),
      };
    } catch (error) {
      await this.releaseLock(path, lock.holderId).catch(() => undefined);
      throw error;
    }
  }

  async acquireWorkerSlot(maxSlots: number, ttlMs: number): Promise<WorkerSlotHandle | null> {
    for (let slot = 0; slot < maxSlots; slot += 1) {
      const path = await this.path("worker-slots", `${slot}.json`);
      const lock = await this.acquireLock(path, ttlMs);
      if (!lock) continue;
      return {
        slot,
        holderId: lock.holderId,
        release: () => this.releaseLock(path, lock.holderId),
      };
    }
    return null;
  }

  async workspace(jobId: string, attempt: number): Promise<string> {
    if (!isUuid(jobId) || !Number.isSafeInteger(attempt) || attempt < 0) {
      throw new MediaPipelineError("PIPELINE_SOURCE_INVALID", "Pipeline workspace input is invalid");
    }
    const root = await this.ensureLayout();
    return ensureSafeDirectoryTree(root, `${PIPELINE_ROOT}/work/${jobId}/attempt-${attempt}`);
  }

  async removeWorkspace(jobId: string, attempt: number): Promise<void> {
    const workspace = await this.workspace(jobId, attempt);
    await rm(workspace, { recursive: true, force: true });
  }
}
