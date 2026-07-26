import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { readMediaPipelineConfig } from "../lib/media-pipeline/config.ts";
import { MediaPipelineError } from "../lib/media-pipeline/errors.ts";
import type {
  CaptionExtraction,
  MediaProcessor,
  MediaProcessorCallbacks,
} from "../lib/media-pipeline/ffmpeg.ts";
import { MediaPipelineJobStore } from "../lib/media-pipeline/job-store.ts";
import { assessMediaPipelineProviderCatalogConformance } from "../lib/media-pipeline/provider-catalog-conformance.ts";
import { NoopMediaPipelineRepository } from "../lib/media-pipeline/repository.ts";
import { MediaPipelineService } from "../lib/media-pipeline/service.ts";
import type { MediaPipelineArtifacts, MediaProbe, StoredMediaArtifact } from "../lib/media-pipeline/types.ts";
import { parseMediaWorkerRequest } from "../lib/media-pipeline/worker-request.ts";
import type { StorageAdapter } from "../lib/storage/contracts.ts";
import { createStorageRuntime } from "../lib/storage/runtime.ts";

const probe: MediaProbe = {
  durationSeconds: 1,
  width: 1280,
  height: 720,
  frameRate: 24,
  videoCodec: "h264",
  audioCodec: "aac",
  hasVideo: true,
  hasAudio: true,
  hasSubtitle: false,
  formatName: "mov,mp4,m4a,3gp,3g2,mj2",
};

const execFileAsync = promisify(execFile);
const fixtureSourceBytes = Buffer.byteLength("fixture-master-v1");

class FixtureProcessor implements MediaProcessor {
  calls = 0;
  failTranscode = false;

  async probe(_inputPath: string, _callbacks: Pick<MediaProcessorCallbacks, "shouldCancel">): Promise<MediaProbe> {
    void _inputPath;
    void _callbacks;
    this.calls += 1;
    return probe;
  }

  async transcodeHls(
    _inputPath: string,
    outputDirectory: string,
    _probe: MediaProbe,
    callbacks: MediaProcessorCallbacks
  ): Promise<string> {
    void _inputPath;
    this.calls += 1;
    if (this.failTranscode) {
      throw new MediaPipelineError("PIPELINE_TIMEOUT", "simulated transient transcode timeout", true);
    }
    await mkdir(outputDirectory, { recursive: true });
    const playlist = join(outputDirectory, "playlist.m3u8");
    await writeFile(playlist, "#EXTM3U\n#EXTINF:1,\nsegment_00000.ts\n#EXT-X-ENDLIST\n");
    await writeFile(join(outputDirectory, "segment_00000.ts"), "transport-stream");
    await callbacks.onProgress(1);
    return playlist;
  }

  async generateThumbnail(
    _inputPath: string,
    outputPath: string,
    _probe: MediaProbe,
    _callbacks: MediaProcessorCallbacks
  ): Promise<string> {
    void _inputPath;
    void _probe;
    void _callbacks;
    this.calls += 1;
    await writeFile(outputPath, "thumbnail");
    return outputPath;
  }

  async generateWaveform(
    _inputPath: string,
    outputPath: string,
    _probe: MediaProbe,
    _callbacks: MediaProcessorCallbacks
  ): Promise<string> {
    void _inputPath;
    void _probe;
    void _callbacks;
    this.calls += 1;
    await writeFile(outputPath, "waveform");
    return outputPath;
  }

  async extractCaptions(
    _inputPath: string,
    _outputPath: string,
    _probe: MediaProbe,
    _callbacks: MediaProcessorCallbacks
  ): Promise<CaptionExtraction> {
    void _inputPath;
    void _outputPath;
    void _probe;
    void _callbacks;
    this.calls += 1;
    return {
      path: null,
      status: "pending_transcription",
      detail: "fixture has no embedded captions",
    };
  }
}

class RecordingRepository extends NoopMediaPipelineRepository {
  queued = 0;

  override async recordQueued(): Promise<void> {
    this.queued += 1;
  }
}

function storedArtifact(
  root: string,
  prefix: string,
  kind: StoredMediaArtifact["kind"],
  filename: string,
  content: string
): StoredMediaArtifact {
  const objectKey = `${prefix}/${filename}`;
  const path = join(root, objectKey);
  const bytes = Buffer.from(content);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
  return {
    kind,
    objectKey,
    filename,
    contentType: filename.endsWith(".json")
      ? "application/json"
      : filename.endsWith(".m3u8")
        ? "application/vnd.apple.mpegurl"
        : filename.endsWith(".vtt")
          ? "text/vtt"
          : "application/octet-stream",
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    provider: "local",
    providerVersionId: "local-version",
  };
}

function fixtureArtifacts(root: string, label: string): MediaPipelineArtifacts {
  const prefix = `tenants/t-lifecycle/projects/p-lifecycle/objects/${label}/versions/v00000001`;
  return {
    hls: {
      playlist: storedArtifact(root, prefix, "hls_playlist", "playlist.m3u8", `${label}-playlist`),
      segments: [storedArtifact(root, prefix, "hls_segment", "segment-000.ts", `${label}-segment`)],
      manifest: storedArtifact(root, prefix, "hls_manifest", "hls-manifest.json", `${label}-hls-manifest`),
    },
    thumbnail: null,
    waveform: storedArtifact(root, prefix, "waveform", "waveform.png", `${label}-waveform`),
    captions: {
      content: storedArtifact(root, prefix, "captions", "captions.vtt", `${label}-captions`),
      manifest: storedArtifact(root, prefix, "caption_manifest", "caption-manifest.json", `${label}-caption-manifest`),
      status: "pending_transcription",
    },
    pipelineManifest: storedArtifact(root, prefix, "pipeline_manifest", "pipeline-manifest.json", `${label}-pipeline-manifest`),
  };
}

function replacePipelineManifest(
  root: string,
  artifacts: MediaPipelineArtifacts,
  payload: unknown
): void {
  const bytes = Buffer.from(JSON.stringify(payload, null, 2));
  const manifestPath = join(root, artifacts.pipelineManifest.objectKey);
  chmodSync(manifestPath, 0o600);
  try {
    writeFileSync(manifestPath, bytes);
  } finally {
    chmodSync(manifestPath, 0o400);
  }
  artifacts.pipelineManifest = {
    ...artifacts.pipelineManifest,
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function artifactBytes(artifacts: MediaPipelineArtifacts): number {
  return [
    artifacts.hls.playlist,
    ...artifacts.hls.segments,
    artifacts.hls.manifest,
    artifacts.thumbnail,
    artifacts.waveform,
    artifacts.captions.content,
    artifacts.captions.manifest,
    artifacts.pipelineManifest,
  ]
    .filter((artifact): artifact is StoredMediaArtifact => Boolean(artifact))
    .reduce((total, artifact) => total + artifact.size, 0);
}

function harness(
  options: {
    malwarePolicy?: "required" | "allow-local-demo";
    processor?: FixtureProcessor;
    now?: () => Date;
    maxActiveJobsPerProject?: string;
    maxActiveBytesPerProject?: string;
    sloQueuedMs?: string;
    sloEligibleMs?: string;
    sloRunningMs?: string;
    sloRetryReadyMs?: string;
    egressPolicy?: string;
    requiredStorageCapabilities?: string;
    requiredResidency?: string;
    encryptionKeyVersion?: string;
    requiredEncryptionKeyVersion?: string;
    keyRotationDueAt?: string;
    blockOnOverdueKeyRotation?: string;
    requireSourceReceipt?: string;
    sourceReceipt?: boolean;
    manifestSigningKey?: string;
    manifestVerificationKeys?: string;
    requireManifestSignature?: string;
    receiptCatalogCursorTokenKey?: string;
    receiptCatalogCursorTokenVerificationKeys?: string;
    receiptCatalogCursorTokenTtlMs?: string;
    providerCatalogConformanceReceiptMaxRecords?: string;
    providerCatalogConformanceReceiptRetentionMs?: string;
    providerCatalogConformanceReceiptLegalHold?: string;
    providerCatalogConformancePacketEscrowMaxRecords?: string;
    providerCatalogConformancePacketEscrowRetentionMs?: string;
    providerCatalogConformancePacketEscrowLegalHold?: string;
    providerCatalogConformancePacketQuarantineMaxRecords?: string;
    providerCatalogConformancePacketQuarantineRetentionMs?: string;
    providerCatalogConformancePacketQuarantineLegalHold?: string;
    providerCatalogConformancePacketQuarantineAttestationMaxRecords?: string;
    providerCatalogConformancePacketQuarantineAttestationRetentionMs?: string;
    providerCatalogConformancePacketQuarantineAttestationLegalHold?: string;
    receiptCatalogCheckpointResetReceiptMaxRecords?: string;
    receiptCatalogCheckpointResetReceiptRetentionMs?: string;
    receiptCatalogCheckpointResetReceiptLegalHold?: string;
    receiptCatalogCheckpointResetReceiptPacketEscrowMaxRecords?: string;
    receiptCatalogCheckpointResetReceiptPacketEscrowRetentionMs?: string;
    receiptCatalogCheckpointResetReceiptPacketEscrowLegalHold?: string;
    receiptCatalogCheckpointResetReceiptPacketQuarantineMaxRecords?: string;
    receiptCatalogCheckpointResetReceiptPacketQuarantineRetentionMs?: string;
    receiptCatalogCheckpointResetReceiptPacketQuarantineLegalHold?: string;
  } = {}
) {
  const root = mkdtempSync(join(tmpdir(), "codeliver-media-pipeline-"));
  const env: Record<string, string> = {
    CODELIVER_STORAGE_PROVIDER: "local",
    CODELIVER_LOCAL_STORAGE_ROOT: root,
    CODELIVER_STORAGE_WRITE_ENABLED: "1",
    CODELIVER_STORAGE_RESERVED_BYTES: "0",
    CODELIVER_MALWARE_POLICY: options.malwarePolicy ?? "allow-local-demo",
    CODELIVER_MEDIA_PIPELINE_MAX_ATTEMPTS: "3",
    CODELIVER_MEDIA_PIPELINE_RETRY_BASE_MS: "60000",
    CODELIVER_MEDIA_PIPELINE_RETRY_CAP_MS: "300000",
  };
  if (options.maxActiveJobsPerProject) {
    env.CODELIVER_MEDIA_PIPELINE_MAX_ACTIVE_JOBS_PER_PROJECT =
      options.maxActiveJobsPerProject;
  }
  if (options.maxActiveBytesPerProject) {
    env.CODELIVER_MEDIA_PIPELINE_MAX_ACTIVE_BYTES_PER_PROJECT =
      options.maxActiveBytesPerProject;
  }
  if (options.sloQueuedMs) {
    env.CODELIVER_MEDIA_PIPELINE_SLO_QUEUED_MS = options.sloQueuedMs;
  }
  if (options.sloEligibleMs) {
    env.CODELIVER_MEDIA_PIPELINE_SLO_ELIGIBLE_MS = options.sloEligibleMs;
  }
  if (options.sloRunningMs) {
    env.CODELIVER_MEDIA_PIPELINE_SLO_RUNNING_MS = options.sloRunningMs;
  }
  if (options.sloRetryReadyMs) {
    env.CODELIVER_MEDIA_PIPELINE_SLO_RETRY_READY_MS = options.sloRetryReadyMs;
  }
  if (options.egressPolicy) {
    env.CODELIVER_MEDIA_PIPELINE_EGRESS_POLICY = options.egressPolicy;
  }
  if (options.requiredStorageCapabilities) {
    env.CODELIVER_MEDIA_PIPELINE_REQUIRED_STORAGE_CAPABILITIES =
      options.requiredStorageCapabilities;
  }
  if (options.requiredResidency) {
    env.CODELIVER_MEDIA_PIPELINE_REQUIRED_RESIDENCY = options.requiredResidency;
  }
  if (options.encryptionKeyVersion) {
    env.CODELIVER_MEDIA_PIPELINE_ENCRYPTION_KEY_VERSION = options.encryptionKeyVersion;
  }
  if (options.requiredEncryptionKeyVersion) {
    env.CODELIVER_MEDIA_PIPELINE_REQUIRED_ENCRYPTION_KEY_VERSION =
      options.requiredEncryptionKeyVersion;
  }
  if (options.keyRotationDueAt) {
    env.CODELIVER_MEDIA_PIPELINE_KEY_ROTATION_DUE_AT = options.keyRotationDueAt;
  }
  if (options.blockOnOverdueKeyRotation) {
    env.CODELIVER_MEDIA_PIPELINE_BLOCK_ON_OVERDUE_KEY_ROTATION =
      options.blockOnOverdueKeyRotation;
  }
  if (options.requireSourceReceipt) {
    env.CODELIVER_MEDIA_PIPELINE_REQUIRE_SOURCE_RECEIPT = options.requireSourceReceipt;
  }
  if (options.manifestSigningKey) {
    env.CODELIVER_MEDIA_PIPELINE_MANIFEST_SIGNING_KEY = options.manifestSigningKey;
  }
  if (options.manifestVerificationKeys) {
    env.CODELIVER_MEDIA_PIPELINE_MANIFEST_VERIFICATION_KEYS =
      options.manifestVerificationKeys;
  }
  if (options.requireManifestSignature) {
    env.CODELIVER_MEDIA_PIPELINE_REQUIRE_MANIFEST_SIGNATURE =
      options.requireManifestSignature;
  }
  if (options.receiptCatalogCursorTokenKey) {
    env.CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CURSOR_TOKEN_KEY =
      options.receiptCatalogCursorTokenKey;
  }
  if (options.receiptCatalogCursorTokenVerificationKeys) {
    env.CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CURSOR_TOKEN_VERIFICATION_KEYS =
      options.receiptCatalogCursorTokenVerificationKeys;
  }
  if (options.receiptCatalogCursorTokenTtlMs) {
    env.CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CURSOR_TOKEN_TTL_MS =
      options.receiptCatalogCursorTokenTtlMs;
  }
  if (options.providerCatalogConformanceReceiptMaxRecords) {
    env.CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_RECEIPT_MAX_RECORDS =
      options.providerCatalogConformanceReceiptMaxRecords;
  }
  if (options.providerCatalogConformanceReceiptRetentionMs) {
    env.CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_RECEIPT_RETENTION_MS =
      options.providerCatalogConformanceReceiptRetentionMs;
  }
  if (options.providerCatalogConformanceReceiptLegalHold) {
    env.CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_RECEIPT_LEGAL_HOLD =
      options.providerCatalogConformanceReceiptLegalHold;
  }
  if (options.providerCatalogConformancePacketEscrowMaxRecords) {
    env.CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_PACKET_ESCROW_MAX_RECORDS =
      options.providerCatalogConformancePacketEscrowMaxRecords;
  }
  if (options.providerCatalogConformancePacketEscrowRetentionMs) {
    env.CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_PACKET_ESCROW_RETENTION_MS =
      options.providerCatalogConformancePacketEscrowRetentionMs;
  }
  if (options.providerCatalogConformancePacketEscrowLegalHold) {
    env.CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_PACKET_ESCROW_LEGAL_HOLD =
      options.providerCatalogConformancePacketEscrowLegalHold;
  }
  if (options.providerCatalogConformancePacketQuarantineMaxRecords) {
    env.CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_PACKET_QUARANTINE_MAX_RECORDS =
      options.providerCatalogConformancePacketQuarantineMaxRecords;
  }
  if (options.providerCatalogConformancePacketQuarantineRetentionMs) {
    env.CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_PACKET_QUARANTINE_RETENTION_MS =
      options.providerCatalogConformancePacketQuarantineRetentionMs;
  }
  if (options.providerCatalogConformancePacketQuarantineLegalHold) {
    env.CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_PACKET_QUARANTINE_LEGAL_HOLD =
      options.providerCatalogConformancePacketQuarantineLegalHold;
  }
  if (options.providerCatalogConformancePacketQuarantineAttestationMaxRecords) {
    env.CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_PACKET_QUARANTINE_ATTESTATION_MAX_RECORDS =
      options.providerCatalogConformancePacketQuarantineAttestationMaxRecords;
  }
  if (options.providerCatalogConformancePacketQuarantineAttestationRetentionMs) {
    env.CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_PACKET_QUARANTINE_ATTESTATION_RETENTION_MS =
      options.providerCatalogConformancePacketQuarantineAttestationRetentionMs;
  }
  if (options.providerCatalogConformancePacketQuarantineAttestationLegalHold) {
    env.CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_PACKET_QUARANTINE_ATTESTATION_LEGAL_HOLD =
      options.providerCatalogConformancePacketQuarantineAttestationLegalHold;
  }
  if (options.receiptCatalogCheckpointResetReceiptMaxRecords) {
    env.CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CHECKPOINT_RESET_RECEIPT_MAX_RECORDS =
      options.receiptCatalogCheckpointResetReceiptMaxRecords;
  }
  if (options.receiptCatalogCheckpointResetReceiptRetentionMs) {
    env.CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CHECKPOINT_RESET_RECEIPT_RETENTION_MS =
      options.receiptCatalogCheckpointResetReceiptRetentionMs;
  }
  if (options.receiptCatalogCheckpointResetReceiptLegalHold) {
    env.CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CHECKPOINT_RESET_RECEIPT_LEGAL_HOLD =
      options.receiptCatalogCheckpointResetReceiptLegalHold;
  }
  if (options.receiptCatalogCheckpointResetReceiptPacketEscrowMaxRecords) {
    env.CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CHECKPOINT_RESET_RECEIPT_PACKET_ESCROW_MAX_RECORDS =
      options.receiptCatalogCheckpointResetReceiptPacketEscrowMaxRecords;
  }
  if (options.receiptCatalogCheckpointResetReceiptPacketEscrowRetentionMs) {
    env.CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CHECKPOINT_RESET_RECEIPT_PACKET_ESCROW_RETENTION_MS =
      options.receiptCatalogCheckpointResetReceiptPacketEscrowRetentionMs;
  }
  if (options.receiptCatalogCheckpointResetReceiptPacketEscrowLegalHold) {
    env.CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CHECKPOINT_RESET_RECEIPT_PACKET_ESCROW_LEGAL_HOLD =
      options.receiptCatalogCheckpointResetReceiptPacketEscrowLegalHold;
  }
  if (options.receiptCatalogCheckpointResetReceiptPacketQuarantineMaxRecords) {
    env.CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CHECKPOINT_RESET_RECEIPT_PACKET_QUARANTINE_MAX_RECORDS =
      options.receiptCatalogCheckpointResetReceiptPacketQuarantineMaxRecords;
  }
  if (options.receiptCatalogCheckpointResetReceiptPacketQuarantineRetentionMs) {
    env.CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CHECKPOINT_RESET_RECEIPT_PACKET_QUARANTINE_RETENTION_MS =
      options.receiptCatalogCheckpointResetReceiptPacketQuarantineRetentionMs;
  }
  if (options.receiptCatalogCheckpointResetReceiptPacketQuarantineLegalHold) {
    env.CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CHECKPOINT_RESET_RECEIPT_PACKET_QUARANTINE_LEGAL_HOLD =
      options.receiptCatalogCheckpointResetReceiptPacketQuarantineLegalHold;
  }
  const runtime = createStorageRuntime(env);
  const store = new MediaPipelineJobStore({ root, now: options.now });
  const processor = options.processor ?? new FixtureProcessor();
  const repository = new RecordingRepository();
  const service = new MediaPipelineService({
    runtime,
    config: readMediaPipelineConfig(runtime.config, env),
    store,
    processor,
    repository,
    metrics: { emit() {} },
    now: options.now,
  });
  const sourceKey = "sources/v1.mp4";
  const sourcePath = join(root, sourceKey);
  const source = Buffer.from("fixture-master-v1");
  const sourceSha256 = createHash("sha256").update(source).digest("hex");
  mkdirSync(join(root, "sources"), { recursive: true });
  writeFileSync(sourcePath, source);
  return {
    root,
    runtime,
    source,
    sourceKey,
    sourcePath,
    processor,
    repository,
    service,
    store,
    input: {
      assetId: "2fb1d5cc-8f78-4dc3-9c57-ae1566d6dc88",
      versionId: "177139fe-bffd-4f2b-8ff3-8c4be1e70861",
      projectId: "cb7a0a7a-7056-4e0f-8296-d970f0f87d67",
      source: {
        objectKey: sourceKey,
        filename: "fixture.mp4",
        versionNumber: 1,
        expectedSize: source.length,
        expectedSha256: sourceSha256,
        receipt: options.sourceReceipt
          ? {
              provider: "local",
              objectKey: sourceKey,
              size: source.length,
              sha256: sourceSha256,
              providerVersionId: "local-source-version",
              committedAt: "2026-07-15T00:00:00.000Z",
            }
          : null,
      },
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function remoteAdapterProxy(
  adapter: StorageAdapter,
  overrides: Record<PropertyKey, unknown> = {}
): StorageAdapter {
  return new Proxy(adapter, {
    get(target, property, receiver) {
      if (property in overrides) return overrides[property];
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as StorageAdapter;
}

test("pipeline is idempotent, version-bound, and publishes immutable derivative artifacts", async () => {
  const keyVersion = "kms/local-demo/v1";
  const manifestSigningKey = "manifest-signing-key-for-local-tests-0001";
  const testHarness = harness({
    encryptionKeyVersion: keyVersion,
    requiredEncryptionKeyVersion: keyVersion,
    sourceReceipt: true,
    manifestSigningKey,
  });
  try {
    const [first, replay] = await Promise.all([
      testHarness.service.enqueue(testHarness.input),
      testHarness.service.enqueue(testHarness.input),
    ]);
    assert.equal(first.id, replay.id);

    const result = await testHarness.service.runJob(first.id);
    assert.equal(result.outcome, "published");
    assert.equal(result.job?.status, "published");
    assert.equal(result.job?.sourceSha256, testHarness.input.source.expectedSha256);
    assert.equal(result.job?.scan?.verdict, "clean");
    assert.equal(result.job?.scan?.subjectSha256, testHarness.input.source.expectedSha256);
    assert.equal(result.job?.scan?.engine, "local-demo-policy");
    assert.equal(result.job?.artifacts?.captions.status, "pending_transcription");
    assert.ok(result.job?.artifacts?.hls.segments.length);
    assert.ok(result.job?.artifacts?.hls.manifest.objectKey.startsWith("tenants/"));
    assert.equal(result.job?.artifacts?.pipelineManifest.kind, "pipeline_manifest");
    assert.equal(
      existsSync(join(testHarness.root, result.job!.artifacts!.hls.manifest.objectKey)),
      true
    );
    const manifestPath = join(testHarness.root, result.job!.artifacts!.pipelineManifest.objectKey);
    assert.equal(existsSync(manifestPath), true);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      type?: unknown;
      versionId?: unknown;
      storageProvider?: unknown;
      pipelineConfigHash?: unknown;
      source?: {
        sha256?: unknown;
        receipt?: {
          provider?: unknown;
          objectKeyDigest?: unknown;
          size?: unknown;
          sha256?: unknown;
          providerVersionId?: unknown;
          committedAt?: unknown;
        };
      };
      scan?: { verdict?: unknown; subjectSha256?: unknown };
      storagePolicy?: {
        egressPolicy?: unknown;
        externalProvider?: unknown;
        externalEgressAllowed?: unknown;
        missingCapabilities?: unknown;
        ready?: unknown;
      };
      encryptionPolicy?: {
        keyVersionPresent?: unknown;
        keyVersionDigest?: unknown;
        requiredKeyVersionDigest?: unknown;
        requiredKeyVersionSatisfied?: unknown;
        keyRotationOverdue?: unknown;
        ready?: unknown;
      };
      manifestIntegrity?: {
        algorithm?: unknown;
        payloadSha256?: unknown;
        signature?: unknown;
        signingKeyDigest?: unknown;
      };
      artifacts?: { hls?: { playlist?: { sha256?: unknown } } };
    };
    assert.equal(manifest.type, "co_deliver_media_pipeline_manifest");
    assert.equal(manifest.versionId, testHarness.input.versionId);
    assert.equal(manifest.storageProvider, "local");
    assert.match(String(manifest.pipelineConfigHash), /^[a-f0-9]{64}$/);
    assert.equal(manifest.source?.sha256, testHarness.input.source.expectedSha256);
    assert.equal(manifest.source?.receipt?.provider, "local");
    assert.match(String(manifest.source?.receipt?.objectKeyDigest), /^[a-f0-9]{64}$/);
    assert.equal(manifest.source?.receipt?.size, testHarness.source.length);
    assert.equal(manifest.source?.receipt?.sha256, testHarness.input.source.expectedSha256);
    assert.equal(manifest.source?.receipt?.providerVersionId, "local-source-version");
    assert.equal(manifest.source?.receipt?.committedAt, "2026-07-15T00:00:00.000Z");
    assert.equal(manifest.scan?.verdict, "clean");
    assert.equal(manifest.scan?.subjectSha256, testHarness.input.source.expectedSha256);
    assert.equal(manifest.storagePolicy?.egressPolicy, "allow-external");
    assert.equal(manifest.storagePolicy?.externalProvider, false);
    assert.equal(manifest.storagePolicy?.externalEgressAllowed, true);
    assert.deepEqual(manifest.storagePolicy?.missingCapabilities, []);
    assert.equal(manifest.storagePolicy?.ready, true);
    assert.equal(manifest.encryptionPolicy?.keyVersionPresent, true);
    assert.match(String(manifest.encryptionPolicy?.keyVersionDigest), /^[a-f0-9]{64}$/);
    assert.equal(
      manifest.encryptionPolicy?.keyVersionDigest,
      manifest.encryptionPolicy?.requiredKeyVersionDigest
    );
    assert.equal(manifest.encryptionPolicy?.requiredKeyVersionSatisfied, true);
    assert.equal(manifest.encryptionPolicy?.keyRotationOverdue, false);
    assert.equal(manifest.encryptionPolicy?.ready, true);
    assert.equal(manifest.manifestIntegrity?.algorithm, "hmac-sha256");
    assert.match(String(manifest.manifestIntegrity?.payloadSha256), /^[a-f0-9]{64}$/);
    assert.match(String(manifest.manifestIntegrity?.signature), /^[a-f0-9]{64}$/);
    assert.match(String(manifest.manifestIntegrity?.signingKeyDigest), /^[a-f0-9]{64}$/);
    assert.equal(
      manifest.artifacts?.hls?.playlist?.sha256,
      result.job?.artifacts?.hls.playlist.sha256
    );
    const manifestPayload = JSON.stringify(manifest);
    assert.equal(manifestPayload.includes(testHarness.root), false);
    assert.equal(manifestPayload.includes(testHarness.sourcePath), false);
    assert.equal(manifestPayload.includes(testHarness.sourceKey), false);
    assert.equal(manifestPayload.includes(keyVersion), false);
    assert.equal(manifestPayload.includes(manifestSigningKey), false);
    assert.equal(readFileSync(testHarness.sourcePath, "utf8"), testHarness.source.toString("utf8"));
    const queuedBeforeReplay = testHarness.repository.queued;
    const publishedReplay = await testHarness.service.enqueue(testHarness.input);
    assert.equal(publishedReplay.status, "published");
    assert.equal(testHarness.repository.queued, queuedBeforeReplay);

    const diagnostics = await testHarness.service.diagnostics();
    assert.equal(diagnostics.replay.publishedManifests, 1);
    assert.equal(diagnostics.replay.inspectedManifests, 1);
    assert.equal(diagnostics.replay.signedManifests, 1);
    assert.equal(diagnostics.replay.invalidSignatureManifests, 0);
    assert.equal(diagnostics.replay.driftDetected, false);
    assert.equal(diagnostics.replay.semanticMismatchManifests, 0);

    const attestation = await testHarness.service.restoreAttestation(testHarness.input.versionId);
    assert.equal(attestation.status, "ready");
    assert.equal(attestation.ready, true);
    assert.deepEqual(attestation.failureCodes, []);
    assert.match(attestation.versionIdDigest, /^[a-f0-9]{64}$/);
    assert.equal(attestation.versionNumber, testHarness.input.source.versionNumber);
    assert.equal(attestation.storageProvider, "local");
    assert.equal(attestation.manifest.present, true);
    assert.equal(attestation.manifest.checksumVerified, true);
    assert.equal(attestation.manifest.integrity, "valid_signed");
    assert.equal(attestation.manifest.semanticMatch, true);
    assert.equal(attestation.manifest.signed, true);
    assert.equal(attestation.derivatives.totalReferences, 7);
    assert.equal(attestation.derivatives.inspectedReferences, 7);
    assert.equal(attestation.derivatives.missingReferences, 0);
    assert.equal(attestation.derivatives.checksumMismatchReferences, 0);
    assert.equal(
      attestation.derivatives.totalBytes,
      String(artifactBytes(result.job!.artifacts!) - result.job!.artifacts!.pipelineManifest.size)
    );
    assert.equal(
      attestation.derivatives.references.every((reference) => reference.checksumVerified),
      true
    );
    const attestationPayload = JSON.stringify(attestation);
    for (const forbidden of [
      first.id,
      testHarness.input.versionId,
      testHarness.input.projectId,
      testHarness.root,
      testHarness.sourcePath,
      testHarness.sourceKey,
      result.job!.artifacts!.hls.playlist.objectKey,
      result.job!.artifacts!.pipelineManifest.objectKey,
      manifestSigningKey,
    ]) {
      assert.equal(attestationPayload.includes(forbidden), false, forbidden);
    }
  } finally {
    testHarness.cleanup();
  }
});

test("source receipt policy fails closed before enqueue when receipt authority is missing", async () => {
  const testHarness = harness({ requireSourceReceipt: "1" });
  try {
    await assert.rejects(
      () => testHarness.service.enqueue(testHarness.input),
      (error) =>
        error instanceof MediaPipelineError &&
        error.code === "PIPELINE_SOURCE_RECEIPT_REQUIRED" &&
        error.retryable === false
    );
  } finally {
    testHarness.cleanup();
  }
});

test("restore attestation reports derivative drift without leaking object keys", async () => {
  const manifestSigningKey = "manifest-signing-key-for-restore-tests-0001";
  const testHarness = harness({ manifestSigningKey, sourceReceipt: true });
  try {
    const job = await testHarness.service.enqueue(testHarness.input);
    const result = await testHarness.service.runJob(job.id);
    assert.equal(result.outcome, "published");
    const artifacts = result.job!.artifacts!;
    rmSync(join(testHarness.root, artifacts.waveform.objectKey), { force: true });

    const attestation = await testHarness.service.restoreAttestation(testHarness.input.versionId);
    assert.equal(attestation.status, "drift_detected");
    assert.equal(attestation.ready, false);
    assert.deepEqual(attestation.failureCodes, ["PIPELINE_RESTORE_DERIVATIVE_MISSING"]);
    assert.equal(attestation.manifest.present, true);
    assert.equal(attestation.manifest.checksumVerified, true);
    assert.equal(attestation.manifest.integrity, "valid_signed");
    assert.equal(attestation.manifest.semanticMatch, true);
    assert.equal(attestation.derivatives.totalReferences, 7);
    assert.equal(attestation.derivatives.missingReferences, 1);
    assert.equal(attestation.derivatives.checksumMismatchReferences, 0);
    assert.equal(
      attestation.derivatives.references.find((reference) => reference.kind === "waveform")?.present,
      false
    );

    const payload = JSON.stringify(attestation);
    for (const forbidden of [
      job.id,
      testHarness.input.versionId,
      testHarness.input.projectId,
      artifacts.waveform.objectKey,
      artifacts.pipelineManifest.objectKey,
      manifestSigningKey,
    ]) {
      assert.equal(payload.includes(forbidden), false, forbidden);
    }
  } finally {
    testHarness.cleanup();
  }
});

test("restore receipt diagnostics track coverage, duplicates, and redaction", async () => {
  const manifestSigningKey = "manifest-signing-key-for-receipt-diagnostics-0001";
  let nowMs = Date.parse("2026-07-15T01:00:00.000Z");
  const testHarness = harness({
    manifestSigningKey,
    sourceReceipt: true,
    now: () => new Date(nowMs),
  });
  try {
    const job = await testHarness.service.enqueue(testHarness.input);
    const result = await testHarness.service.runJob(job.id);
    assert.equal(result.outcome, "published");

    const missingDiagnostics = await testHarness.service.diagnostics();
    assert.equal(missingDiagnostics.restoreReceipts.publishedVersions, 1);
    assert.equal(missingDiagnostics.restoreReceipts.versionsWithReceipt, 0);
    assert.equal(missingDiagnostics.restoreReceipts.versionsMissingReceipt, 1);
    assert.equal(missingDiagnostics.restoreReceipts.totalReceipts, 0);
    assert.equal(missingDiagnostics.restoreReceipts.driftDetected, true);

    nowMs += 1_000;
    const receipt = await testHarness.service.persistRestoreAttestationReceipt(
      testHarness.input.versionId
    );
    assert.equal(receipt.persisted, true);
    assert.equal(receipt.receipt.signed, true);
    assert.match(String(receipt.receipt.objectKeyDigest), /^[a-f0-9]{64}$/);

    const diagnostics = await testHarness.service.diagnostics();
    assert.equal(diagnostics.restoreReceipts.publishedVersions, 1);
    assert.equal(diagnostics.restoreReceipts.versionsWithReceipt, 1);
    assert.equal(diagnostics.restoreReceipts.versionsMissingReceipt, 0);
    assert.equal(diagnostics.restoreReceipts.duplicateReceiptVersions, 0);
    assert.equal(diagnostics.restoreReceipts.totalReceipts, 1);
    assert.equal(diagnostics.restoreReceipts.inspectedReceipts, 1);
    assert.equal(diagnostics.restoreReceipts.signedReceipts, 1);
    assert.equal(diagnostics.restoreReceipts.invalidSignatureReceipts, 0);
    assert.equal(diagnostics.restoreReceipts.attestationPayloadMismatchReceipts, 0);
    assert.equal(diagnostics.restoreReceipts.statusDriftReceipts, 0);
    assert.equal(diagnostics.restoreReceipts.driftDetected, false);

    const payload = JSON.stringify(diagnostics.restoreReceipts);
    for (const forbidden of [
      job.id,
      testHarness.input.versionId,
      testHarness.input.projectId,
      testHarness.sourceKey,
      result.job!.artifacts!.pipelineManifest.objectKey,
      manifestSigningKey,
    ]) {
      assert.equal(payload.includes(forbidden), false, forbidden);
    }

    const receiptIndexDir = join(
      testHarness.root,
      ".codeliver-ingest/control/media-pipeline/restore-receipts"
    );
    const corruptRecordPath = join(receiptIndexDir, "corrupt-record.json");
    writeFileSync(corruptRecordPath, "{not-json");
    const corruptDiagnostics = await testHarness.service.diagnostics();
    assert.equal(corruptDiagnostics.restoreReceipts.invalidReceiptRecords, 1);
    assert.equal(corruptDiagnostics.restoreReceipts.catalogRecovery.discoveredReceipts, 1);
    assert.equal(corruptDiagnostics.restoreReceipts.catalogRecovery.unindexedReceipts, 0);
    assert.equal(corruptDiagnostics.restoreReceipts.driftDetected, true);
    rmSync(corruptRecordPath, { force: true });

    nowMs += 1_000;
    const duplicateReceipt = await testHarness.service.persistRestoreAttestationReceipt(
      testHarness.input.versionId
    );
    assert.equal(duplicateReceipt.persisted, true);
    const duplicateDiagnostics = await testHarness.service.diagnostics();
    assert.equal(duplicateDiagnostics.restoreReceipts.totalReceipts, 2);
    assert.equal(duplicateDiagnostics.restoreReceipts.duplicateReceiptVersions, 1);
    assert.equal(duplicateDiagnostics.restoreReceipts.driftDetected, true);

    rmSync(receiptIndexDir, { recursive: true, force: true });
    const lostIndexDiagnostics = await testHarness.service.diagnostics();
    assert.equal(lostIndexDiagnostics.restoreReceipts.versionsWithReceipt, 0);
    assert.equal(lostIndexDiagnostics.restoreReceipts.versionsMissingReceipt, 1);
    assert.equal(lostIndexDiagnostics.restoreReceipts.totalReceipts, 0);
    assert.equal(lostIndexDiagnostics.restoreReceipts.catalogRecovery.supported, true);
    assert.equal(
      lostIndexDiagnostics.restoreReceipts.catalogRecovery.scanRoot,
      "tenant-object-namespace"
    );
    assert.equal(lostIndexDiagnostics.restoreReceipts.catalogRecovery.discoveredReceipts, 2);
    assert.equal(lostIndexDiagnostics.restoreReceipts.catalogRecovery.unindexedReceipts, 2);
    assert.equal(lostIndexDiagnostics.restoreReceipts.catalogRecovery.repairRequired, true);
    assert.equal(lostIndexDiagnostics.restoreReceipts.driftDetected, true);
  } finally {
    testHarness.cleanup();
  }
});

test("restore receipt diagnostics verify retired signing keys after rotation", async () => {
  const oldSigningKey = "restore-receipt-signing-key-before-rotation-0001";
  const newSigningKey = "restore-receipt-signing-key-after-rotation-0001";
  const testHarness = harness({ manifestSigningKey: oldSigningKey, sourceReceipt: true });
  try {
    const job = await testHarness.service.enqueue(testHarness.input);
    const result = await testHarness.service.runJob(job.id);
    assert.equal(result.outcome, "published");
    const receipt = await testHarness.service.persistRestoreAttestationReceipt(
      testHarness.input.versionId
    );
    assert.equal(receipt.persisted, true);

    const rotatedWithoutOldKey = new MediaPipelineService({
      runtime: testHarness.runtime,
      config: readMediaPipelineConfig(testHarness.runtime.config, {
        CODELIVER_MEDIA_PIPELINE_MANIFEST_SIGNING_KEY: newSigningKey,
      }),
      store: testHarness.store,
      processor: testHarness.processor,
      repository: testHarness.repository,
      metrics: { emit() {} },
    });
    const missingKeyDiagnostics = await rotatedWithoutOldKey.diagnostics();
    assert.equal(missingKeyDiagnostics.restoreReceipts.totalReceipts, 1);
    assert.equal(missingKeyDiagnostics.restoreReceipts.signedReceipts, 0);
    assert.equal(missingKeyDiagnostics.restoreReceipts.invalidSignatureReceipts, 1);
    assert.equal(missingKeyDiagnostics.restoreReceipts.driftDetected, true);

    const rotatedWithRetiredKey = new MediaPipelineService({
      runtime: testHarness.runtime,
      config: readMediaPipelineConfig(testHarness.runtime.config, {
        CODELIVER_MEDIA_PIPELINE_MANIFEST_SIGNING_KEY: newSigningKey,
        CODELIVER_MEDIA_PIPELINE_MANIFEST_VERIFICATION_KEYS: oldSigningKey,
      }),
      store: testHarness.store,
      processor: testHarness.processor,
      repository: testHarness.repository,
      metrics: { emit() {} },
    });
    const diagnostics = await rotatedWithRetiredKey.diagnostics();
    assert.equal(diagnostics.restoreReceipts.totalReceipts, 1);
    assert.equal(diagnostics.restoreReceipts.signedReceipts, 1);
    assert.equal(diagnostics.restoreReceipts.invalidSignatureReceipts, 0);
    assert.equal(diagnostics.restoreReceipts.driftDetected, false);

    const payload = JSON.stringify(diagnostics.restoreReceipts);
    for (const forbidden of [
      oldSigningKey,
      newSigningKey,
      job.id,
      testHarness.input.versionId,
      testHarness.input.projectId,
      result.job!.artifacts!.pipelineManifest.objectKey,
    ]) {
      assert.equal(payload.includes(forbidden), false, forbidden);
    }

    rmSync(
      join(testHarness.root, ".codeliver-ingest/control/media-pipeline/restore-receipts"),
      { recursive: true, force: true }
    );
    const missingKeyRepair = await rotatedWithoutOldKey.repairRestoreReceiptIndex("apply");
    assert.equal(missingKeyRepair.discoveredReceipts, 1);
    assert.equal(missingKeyRepair.skippedInvalidIntegrity, 1);
    assert.equal(missingKeyRepair.repairedReceipts, 0);

    const retiredKeyRepair = await rotatedWithRetiredKey.repairRestoreReceiptIndex("apply");
    assert.equal(retiredKeyRepair.discoveredReceipts, 1);
    assert.equal(retiredKeyRepair.skippedInvalidIntegrity, 0);
    assert.equal(retiredKeyRepair.repairedReceipts, 1);

    const repairPayload = JSON.stringify({ missingKeyRepair, retiredKeyRepair });
    for (const forbidden of [
      oldSigningKey,
      newSigningKey,
      job.id,
      testHarness.input.versionId,
      testHarness.input.projectId,
      result.job!.artifacts!.pipelineManifest.objectKey,
    ]) {
      assert.equal(repairPayload.includes(forbidden), false, forbidden);
    }
  } finally {
    testHarness.cleanup();
  }
});

test("restore receipt repair rebuilds a lost local index with dry-run and idempotent apply", async () => {
  const manifestSigningKey = "restore-receipt-repair-signing-key-0001";
  const testHarness = harness({ manifestSigningKey, sourceReceipt: true });
  try {
    const job = await testHarness.service.enqueue(testHarness.input);
    const result = await testHarness.service.runJob(job.id);
    assert.equal(result.outcome, "published");
    const receipt = await testHarness.service.persistRestoreAttestationReceipt(
      testHarness.input.versionId
    );
    assert.equal(receipt.persisted, true);

    const receiptIndexDir = join(
      testHarness.root,
      ".codeliver-ingest/control/media-pipeline/restore-receipts"
    );
    rmSync(receiptIndexDir, { recursive: true, force: true });
    const lostIndexDiagnostics = await testHarness.service.diagnostics();
    assert.equal(lostIndexDiagnostics.restoreReceipts.versionsMissingReceipt, 1);
    assert.equal(lostIndexDiagnostics.restoreReceipts.catalogRecovery.discoveredReceipts, 1);
    assert.equal(lostIndexDiagnostics.restoreReceipts.catalogRecovery.unindexedReceipts, 1);

    const dryRun = await testHarness.service.repairRestoreReceiptIndex("dry_run");
    assert.equal(dryRun.supported, true);
    assert.equal(dryRun.scanRoot, "tenant-object-namespace");
    assert.equal(dryRun.discoveredReceipts, 1);
    assert.equal(dryRun.alreadyIndexedReceipts, 0);
    assert.equal(dryRun.eligibleReceipts, 1);
    assert.equal(dryRun.repairedReceipts, 0);
    assert.equal(dryRun.skippedInvalidIntegrity, 0);
    assert.equal(dryRun.skippedInvalidPayload, 0);
    assert.equal(dryRun.skippedUnmatchedVersion, 0);
    assert.equal(dryRun.skippedDuplicateVersion, 0);
    assert.equal(dryRun.applied, false);
    assert.equal(dryRun.dryRun, true);

    const afterDryRunDiagnostics = await testHarness.service.diagnostics();
    assert.equal(afterDryRunDiagnostics.restoreReceipts.versionsMissingReceipt, 1);
    assert.equal(afterDryRunDiagnostics.restoreReceipts.catalogRecovery.unindexedReceipts, 1);

    const applied = await testHarness.service.repairRestoreReceiptIndex("apply");
    assert.equal(applied.supported, true);
    assert.equal(applied.discoveredReceipts, 1);
    assert.equal(applied.eligibleReceipts, 1);
    assert.equal(applied.repairedReceipts, 1);
    assert.equal(applied.applied, true);
    assert.equal(applied.dryRun, false);

    const repairedDiagnostics = await testHarness.service.diagnostics();
    assert.equal(repairedDiagnostics.restoreReceipts.versionsWithReceipt, 1);
    assert.equal(repairedDiagnostics.restoreReceipts.versionsMissingReceipt, 0);
    assert.equal(repairedDiagnostics.restoreReceipts.totalReceipts, 1);
    assert.equal(repairedDiagnostics.restoreReceipts.catalogRecovery.unindexedReceipts, 0);
    assert.equal(repairedDiagnostics.restoreReceipts.driftDetected, false);

    const idempotent = await testHarness.service.repairRestoreReceiptIndex("apply");
    assert.equal(idempotent.alreadyIndexedReceipts, 1);
    assert.equal(idempotent.eligibleReceipts, 0);
    assert.equal(idempotent.repairedReceipts, 0);

    const payload = JSON.stringify({ dryRun, applied, idempotent, repairedDiagnostics });
    for (const forbidden of [
      job.id,
      testHarness.input.versionId,
      testHarness.input.projectId,
      testHarness.sourceKey,
      result.job!.artifacts!.pipelineManifest.objectKey,
      testHarness.root,
      manifestSigningKey,
    ]) {
      assert.equal(payload.includes(forbidden), false, forbidden);
    }
  } finally {
    testHarness.cleanup();
  }
});

test("remote providers require an explicit receipt catalog capability for repair", async () => {
  const testHarness = harness();
  try {
    const remoteRuntime = {
      config: {
        ...testHarness.runtime.config,
        provider: "google-drive" as const,
        providerWasExplicit: true,
        filesystemRoot: null,
      },
      adapter: remoteAdapterProxy(testHarness.runtime.adapter, {
        kind: "google-drive",
        label: "Google Drive fixture",
        external: true,
      }),
    };
    const remoteService = new MediaPipelineService({
      runtime: remoteRuntime,
      config: readMediaPipelineConfig(remoteRuntime.config),
      store: testHarness.store,
      processor: testHarness.processor,
      repository: testHarness.repository,
      metrics: { emit() {} },
    });

    const diagnostics = await remoteService.diagnostics();
    assert.equal(diagnostics.restoreReceipts.catalogRecovery.supported, false);
    assert.equal(diagnostics.restoreReceipts.catalogRecovery.scanRoot, "unsupported");
    assert.equal(diagnostics.restoreReceipts.catalogRecovery.discoveredReceipts, 0);
    assert.equal(diagnostics.restoreReceipts.catalogRecovery.repairRequired, false);

    const repair = await remoteService.repairRestoreReceiptIndex("apply");
    assert.equal(repair.supported, false);
    assert.equal(repair.scanRoot, "unsupported");
    assert.equal(repair.discoveredReceipts, 0);
    assert.equal(repair.repairedReceipts, 0);
    assert.equal(repair.applied, false);
  } finally {
    testHarness.cleanup();
  }
});

test("provider-backed receipt catalog discovery can repair a remote index without leaking identities", async () => {
  const manifestSigningKey = "provider-catalog-repair-signing-key-0001";
  const testHarness = harness({ manifestSigningKey, sourceReceipt: true });
  try {
    const job = await testHarness.service.enqueue(testHarness.input);
    const result = await testHarness.service.runJob(job.id);
    assert.equal(result.outcome, "published");
    const receipt = await testHarness.service.persistRestoreAttestationReceipt(
      testHarness.input.versionId
    );
    assert.equal(receipt.persisted, true);
    const inventory = await testHarness.store.restoreReceiptInventory();
    assert.equal(inventory.references.length, 1);
    const receiptReference = inventory.references[0];

    rmSync(
      join(testHarness.root, ".codeliver-ingest/control/media-pipeline/restore-receipts"),
      { recursive: true, force: true }
    );
    const remoteRuntime = {
      config: {
        ...testHarness.runtime.config,
        provider: "google-drive" as const,
        providerWasExplicit: true,
        filesystemRoot: null,
      },
      adapter: remoteAdapterProxy(testHarness.runtime.adapter, {
        kind: "google-drive",
        label: "Google Drive catalog fixture",
        external: true,
        listMediaPipelineReceiptObjects: async (input: { kind: string; limit: number }) => {
          assert.equal(input.kind, "restore_attestation");
          assert.equal(input.limit > 0, true);
          return {
            objects: [
              {
                objectKey: receiptReference.objectKey,
                size: receiptReference.size,
                sha256: receiptReference.sha256,
                filename: "remote-restore-attestation.json",
                providerVersionId: "drive-revision-1",
              },
            ],
            truncated: false,
          };
        },
      }),
    };
    const remoteService = new MediaPipelineService({
      runtime: remoteRuntime,
      config: readMediaPipelineConfig(remoteRuntime.config, {
        CODELIVER_MEDIA_PIPELINE_MANIFEST_SIGNING_KEY: manifestSigningKey,
      }),
      store: testHarness.store,
      processor: testHarness.processor,
      repository: testHarness.repository,
      metrics: { emit() {} },
    });

    const dryRun = await remoteService.repairRestoreReceiptIndex("dry_run");
    assert.equal(dryRun.supported, true);
    assert.equal(dryRun.scanRoot, "provider-catalog");
    assert.equal(dryRun.discoveredReceipts, 1);
    assert.equal(dryRun.eligibleReceipts, 1);
    assert.equal(dryRun.repairedReceipts, 0);
    assert.equal(dryRun.applied, false);

    const apply = await remoteService.repairRestoreReceiptIndex("apply");
    assert.equal(apply.supported, true);
    assert.equal(apply.scanRoot, "provider-catalog");
    assert.equal(apply.discoveredReceipts, 1);
    assert.equal(apply.eligibleReceipts, 1);
    assert.equal(apply.repairedReceipts, 1);
    assert.equal(apply.applied, true);

    const diagnostics = await remoteService.diagnostics();
    assert.equal(diagnostics.restoreReceipts.versionsWithReceipt, 1);
    assert.equal(diagnostics.restoreReceipts.versionsMissingReceipt, 0);
    assert.equal(diagnostics.restoreReceipts.catalogRecovery.supported, true);
    assert.equal(diagnostics.restoreReceipts.catalogRecovery.scanRoot, "provider-catalog");
    assert.equal(diagnostics.restoreReceipts.catalogRecovery.unindexedReceipts, 0);
    assert.equal(diagnostics.restoreReceipts.driftDetected, false);

    const payload = JSON.stringify({ dryRun, apply, diagnostics });
    for (const forbidden of [
      job.id,
      testHarness.input.versionId,
      testHarness.input.projectId,
      testHarness.sourceKey,
      result.job!.artifacts!.pipelineManifest.objectKey,
      receiptReference.objectKey,
      testHarness.root,
      manifestSigningKey,
    ]) {
      assert.equal(payload.includes(forbidden), false, forbidden);
    }
  } finally {
    testHarness.cleanup();
  }
});

test("provider catalog conformance reports native readiness without leaking catalog identities", async () => {
  const manifestSigningKey = "provider-catalog-conformance-signing-key-0001";
  const testHarness = harness({ manifestSigningKey, sourceReceipt: true });
  try {
    const job = await testHarness.service.enqueue(testHarness.input);
    const result = await testHarness.service.runJob(job.id);
    assert.equal(result.outcome, "published");
    const firstReceipt = await testHarness.service.persistRestoreAttestationReceipt(
      testHarness.input.versionId
    );
    assert.equal(firstReceipt.persisted, true);
    const secondReceipt = await testHarness.service.persistRestoreAttestationReceipt(
      testHarness.input.versionId
    );
    assert.equal(secondReceipt.persisted, true);
    const inventory = await testHarness.store.restoreReceiptInventory();
    const [firstReference, secondReference] = inventory.references;

    const adapter = remoteAdapterProxy(testHarness.runtime.adapter, {
      kind: "object-store",
      label: "Object store catalog conformance fixture",
      external: true,
      listMediaPipelineReceiptObjects: async (input: {
        kind: string;
        limit: number;
        cursor?: string | null;
      }) => {
        assert.equal(input.kind, "restore_attestation");
        assert.equal(input.limit > 0, true);
        if (!input.cursor) {
          return {
            objects: [
              {
                objectKey: firstReference.objectKey,
                size: firstReference.size,
                sha256: firstReference.sha256,
              },
            ],
            truncated: true,
            nextCursor: "native-provider-page-2",
          };
        }
        if (input.cursor === "native-provider-page-2") {
          return {
            objects: [
              {
                objectKey: secondReference.objectKey,
                size: secondReference.size,
                sha256: secondReference.sha256,
              },
            ],
            truncated: false,
            nextCursor: null,
          };
        }
        throw new Error("unexpected cursor");
      },
    });

    const partial = await assessMediaPipelineProviderCatalogConformance({
      adapter,
      scanLimit: 2,
      pageLimit: 1,
      now: () => new Date("2026-07-15T06:00:00.000Z"),
    });
    assert.equal(partial.capabilityPresent, true);
    assert.equal(partial.ready, false);
    assert.equal(partial.cursorSupported, true);
    assert.equal(partial.checkpointRequired, true);
    assert.equal(partial.pagesScanned, 1);
    assert.equal(partial.listedObjects, 1);
    assert.equal(partial.validObjects, 1);
    assert.match(String(partial.nextCursorDigest), /^[a-f0-9]{64}$/);
    assert.deepEqual(partial.findings, []);

    const complete = await assessMediaPipelineProviderCatalogConformance({
      adapter,
      scanLimit: 2,
      pageLimit: 2,
      now: () => new Date("2026-07-15T06:01:00.000Z"),
    });
    assert.equal(complete.ready, true);
    assert.equal(complete.checkpointRequired, false);
    assert.equal(complete.nextCursorDigest, null);
    assert.equal(complete.pagesScanned, 2);
    assert.equal(complete.listedObjects, 2);
    assert.equal(complete.inspectedObjects, 2);
    assert.equal(complete.validObjects, 2);
    assert.deepEqual(complete.findings, []);

    const payload = JSON.stringify({ partial, complete });
    for (const forbidden of [
      job.id,
      testHarness.input.versionId,
      testHarness.input.projectId,
      testHarness.sourceKey,
      result.job!.artifacts!.pipelineManifest.objectKey,
      firstReference.objectKey,
      secondReference.objectKey,
      "native-provider-page-2",
      testHarness.root,
      manifestSigningKey,
    ]) {
      assert.equal(payload.includes(forbidden), false, forbidden);
    }
  } finally {
    testHarness.cleanup();
  }
});

test("provider catalog conformance receipts persist signed redacted evidence and detect tampering", async () => {
  const oldSigningKey = "provider-catalog-conformance-receipt-old-key-0001";
  const newSigningKey = "provider-catalog-conformance-receipt-new-key-0001";
  const nowMs = Date.parse("2026-07-15T06:10:00.000Z");
  const testHarness = harness({
    manifestSigningKey: oldSigningKey,
    sourceReceipt: true,
    now: () => new Date(nowMs),
  });
  try {
    const job = await testHarness.service.enqueue(testHarness.input);
    const result = await testHarness.service.runJob(job.id);
    assert.equal(result.outcome, "published");
    const restoreReceipt = await testHarness.service.persistRestoreAttestationReceipt(
      testHarness.input.versionId
    );
    assert.equal(restoreReceipt.persisted, true);
    const restoreInventory = await testHarness.store.restoreReceiptInventory();
    const receiptReference = restoreInventory.references[0];

    const remoteRuntime = {
      config: {
        ...testHarness.runtime.config,
        provider: "object-store" as const,
        providerWasExplicit: true,
        filesystemRoot: null,
      },
      adapter: remoteAdapterProxy(testHarness.runtime.adapter, {
        kind: "object-store",
        label: "Object store conformance receipt fixture",
        external: true,
        listMediaPipelineReceiptObjects: async (input: {
          kind: string;
          limit: number;
        }) => {
          assert.equal(input.kind, "restore_attestation");
          assert.equal(input.limit > 0, true);
          return {
            objects: [
              {
                objectKey: receiptReference.objectKey,
                size: receiptReference.size,
                sha256: receiptReference.sha256,
              },
            ],
            truncated: false,
            nextCursor: null,
          };
        },
      }),
    };
    const conformanceService = new MediaPipelineService({
      runtime: remoteRuntime,
      config: readMediaPipelineConfig(remoteRuntime.config, {
        CODELIVER_MEDIA_PIPELINE_MANIFEST_SIGNING_KEY: oldSigningKey,
      }),
      store: testHarness.store,
      processor: testHarness.processor,
      repository: testHarness.repository,
      metrics: { emit() {} },
      now: () => new Date(nowMs),
    });

    const publication = await conformanceService.persistProviderCatalogConformanceReceipt({
      scanLimit: 2,
      pageLimit: 1,
    });
    assert.equal(publication.persisted, true);
    assert.equal(publication.reason, null);
    assert.equal(publication.report.provider, "object-store");
    assert.equal(publication.report.ready, true);
    assert.equal(publication.report.validObjects, 1);
    assert.equal(publication.receipt.integrity, "hmac-sha256");
    assert.equal(publication.receipt.signed, true);
    assert.match(publication.receipt.providerDigest, /^[a-f0-9]{64}$/);
    assert.match(publication.receipt.reportPayloadSha256, /^[a-f0-9]{64}$/);
    assert.match(publication.receipt.receiptPayloadSha256, /^[a-f0-9]{64}$/);

    const inventory = await testHarness.store.providerCatalogConformanceReceiptInventory();
    assert.equal(inventory.records.length, 1);
    assert.equal(inventory.invalidRecords, 0);
    assert.equal(inventory.signedRecords, 1);
    assert.equal(inventory.readyRecords, 1);
    assert.equal(inventory.latest?.provider, "object-store");
    assert.equal(inventory.latest?.reportPayloadSha256, publication.receipt.reportPayloadSha256);

    const rotatedService = new MediaPipelineService({
      runtime: remoteRuntime,
      config: readMediaPipelineConfig(remoteRuntime.config, {
        CODELIVER_MEDIA_PIPELINE_MANIFEST_SIGNING_KEY: newSigningKey,
        CODELIVER_MEDIA_PIPELINE_MANIFEST_VERIFICATION_KEYS: oldSigningKey,
      }),
      store: testHarness.store,
      processor: testHarness.processor,
      repository: testHarness.repository,
      metrics: { emit() {} },
      now: () => new Date(nowMs),
    });
    const rotatedDiagnostics =
      await rotatedService.providerCatalogConformanceReceiptDiagnostics();
    assert.equal(rotatedDiagnostics.records, 1);
    assert.equal(rotatedDiagnostics.invalidRecords, 0);
    assert.equal(rotatedDiagnostics.invalidIntegrityRecords, 0);
    assert.equal(rotatedDiagnostics.payloadMismatchRecords, 0);
    assert.equal(rotatedDiagnostics.latest?.integrityStatus, "valid_signed");

    const receiptDir = join(
      testHarness.root,
      ".codeliver-ingest/control/media-pipeline/provider-catalog-conformance-receipts"
    );
    const receiptPath = join(receiptDir, readdirSync(receiptDir)[0]);
    const tampered = JSON.parse(readFileSync(receiptPath, "utf8")) as {
      receipt: { evidence: { ready: boolean } };
    };
    tampered.receipt.evidence.ready = !tampered.receipt.evidence.ready;
    writeFileSync(receiptPath, JSON.stringify(tampered, null, 2));

    const tamperedDiagnostics =
      await rotatedService.providerCatalogConformanceReceiptDiagnostics();
    assert.equal(tamperedDiagnostics.records, 1);
    assert.equal(tamperedDiagnostics.invalidIntegrityRecords, 1);
    assert.equal(tamperedDiagnostics.latest?.integrityStatus, "payload_mismatch");

    const payload = JSON.stringify({
      publication,
      inventory,
      rotatedDiagnostics,
      tamperedDiagnostics,
    });
    for (const forbidden of [
      job.id,
      testHarness.input.versionId,
      testHarness.input.projectId,
      testHarness.sourceKey,
      result.job!.artifacts!.pipelineManifest.objectKey,
      receiptReference.objectKey,
      testHarness.root,
      oldSigningKey,
      newSigningKey,
    ]) {
      assert.equal(payload.includes(forbidden), false, forbidden);
    }
  } finally {
    testHarness.cleanup();
  }
});

test("provider catalog conformance receipt lifecycle honors legal hold and bounded retention", async () => {
  const signingKey = "provider-catalog-conformance-retention-key-0001";
  let nowMs = Date.parse("2026-07-15T06:20:00.000Z");
  const testHarness = harness({
    manifestSigningKey: signingKey,
    providerCatalogConformanceReceiptMaxRecords: "1",
    providerCatalogConformanceReceiptRetentionMs: String(24 * 60 * 60_000),
    providerCatalogConformanceReceiptLegalHold: "true",
    now: () => new Date(nowMs),
  });
  try {
    for (let index = 0; index < 3; index += 1) {
      const receipt = await testHarness.service.persistProviderCatalogConformanceReceipt({
        scanLimit: 1,
        pageLimit: 1,
      });
      assert.equal(receipt.persisted, true);
      assert.equal(receipt.receipt.integrity, "hmac-sha256");
      nowMs += 1_000;
    }
    nowMs += 1_000;

    const holdDryRun = await testHarness.service.providerCatalogConformanceReceiptLifecycle(
      "dry_run"
    );
    assert.equal(holdDryRun.policy.legalHold, true);
    assert.equal(holdDryRun.policy.maxRecords, 1);
    assert.equal(holdDryRun.totalRecords, 3);
    assert.equal(holdDryRun.eligibleRecords, 2);
    assert.equal(holdDryRun.deletedRecords, 0);
    assert.equal(holdDryRun.blockedByLegalHold, 2);
    assert.equal(holdDryRun.retainedRecords, 3);
    assert.equal(holdDryRun.dryRun, true);
    assert.equal(holdDryRun.applied, false);
    assert.match(String(holdDryRun.latest?.providerDigest), /^[a-f0-9]{64}$/);

    const holdApply = await testHarness.service.providerCatalogConformanceReceiptLifecycle(
      "apply"
    );
    assert.equal(holdApply.policy.legalHold, true);
    assert.equal(holdApply.eligibleRecords, 2);
    assert.equal(holdApply.deletedRecords, 0);
    assert.equal(holdApply.blockedByLegalHold, 2);
    assert.equal(holdApply.retainedRecords, 3);
    assert.equal(holdApply.applied, false);
    assert.equal(
      (await testHarness.store.providerCatalogConformanceReceiptInventory()).records.length,
      3
    );

    const unlockedService = new MediaPipelineService({
      runtime: testHarness.runtime,
      config: readMediaPipelineConfig(testHarness.runtime.config, {
        CODELIVER_MEDIA_PIPELINE_MANIFEST_SIGNING_KEY: signingKey,
        CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_RECEIPT_MAX_RECORDS: "1",
        CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_RECEIPT_RETENTION_MS: String(
          24 * 60 * 60_000
        ),
      }),
      store: testHarness.store,
      processor: testHarness.processor,
      repository: testHarness.repository,
      metrics: { emit() {} },
      now: () => new Date(nowMs),
    });

    const unlockedDryRun =
      await unlockedService.providerCatalogConformanceReceiptLifecycle("dry_run");
    assert.equal(unlockedDryRun.policy.legalHold, false);
    assert.equal(unlockedDryRun.eligibleRecords, 2);
    assert.equal(unlockedDryRun.deletedRecords, 0);
    assert.equal(unlockedDryRun.retainedRecords, 3);
    assert.equal(unlockedDryRun.applied, false);

    const unlockedApply =
      await unlockedService.providerCatalogConformanceReceiptLifecycle("apply");
    assert.equal(unlockedApply.policy.legalHold, false);
    assert.equal(unlockedApply.eligibleRecords, 2);
    assert.equal(unlockedApply.deletedRecords, 2);
    assert.equal(unlockedApply.retainedRecords, 1);
    assert.equal(unlockedApply.blockedByLegalHold, 0);
    assert.equal(unlockedApply.applied, true);

    const finalInventory =
      await testHarness.store.providerCatalogConformanceReceiptInventory();
    assert.equal(finalInventory.records.length, 1);
    assert.equal(finalInventory.latest?.receiptPayloadSha256, unlockedApply.latest?.receiptPayloadSha256);

    const payload = JSON.stringify({
      holdDryRun,
      holdApply,
      unlockedDryRun,
      unlockedApply,
      finalInventory,
    });
    for (const forbidden of [testHarness.root, signingKey]) {
      assert.equal(payload.includes(forbidden), false, forbidden);
    }
  } finally {
    testHarness.cleanup();
  }
});

test("provider catalog conformance receipt packets export and import redacted migration evidence", async () => {
  const oldSigningKey = "provider-catalog-conformance-packet-old-key-0001";
  const newSigningKey = "provider-catalog-conformance-packet-new-key-0001";
  let nowMs = Date.parse("2026-07-15T06:30:00.000Z");
  const sourceHarness = harness({
    manifestSigningKey: oldSigningKey,
    sourceReceipt: true,
    now: () => new Date(nowMs),
  });
  const targetHarness = harness({
    manifestSigningKey: newSigningKey,
    manifestVerificationKeys: oldSigningKey,
    sourceReceipt: true,
    now: () => new Date(nowMs),
  });
  try {
    for (let index = 0; index < 2; index += 1) {
      const receipt = await sourceHarness.service.persistProviderCatalogConformanceReceipt({
        scanLimit: 1,
        pageLimit: 1,
      });
      assert.equal(receipt.persisted, true);
      assert.equal(receipt.receipt.signed, true);
      nowMs += 1_000;
    }

    const exported =
      await sourceHarness.service.exportProviderCatalogConformanceReceiptPacket();
    assert.equal(exported.recordsExported, 2);
    assert.equal(exported.packet.source.recordCount, 2);
    assert.equal(exported.packet.packetIntegrity.algorithm, "hmac-sha256");
    assert.match(exported.packetDigest, /^[a-f0-9]{64}$/);

    const dryRun = await targetHarness.service.importProviderCatalogConformanceReceiptPacket(
      exported.packet,
      "dry_run"
    );
    assert.equal(dryRun.packetIntegrity, "valid_signed");
    assert.equal(dryRun.recordsReceived, 2);
    assert.equal(dryRun.eligibleRecords, 2);
    assert.equal(dryRun.importedRecords, 0);
    assert.equal(dryRun.duplicateRecords, 0);
    assert.equal(dryRun.invalidPayloadRecords, 0);
    assert.equal(dryRun.invalidReceiptIntegrityRecords, 0);
    assert.equal(dryRun.dryRun, true);
    assert.equal(
      (await targetHarness.store.providerCatalogConformanceReceiptInventory()).records.length,
      0
    );

    const apply = await targetHarness.service.importProviderCatalogConformanceReceiptPacket(
      exported.packet,
      "apply"
    );
    assert.equal(apply.packetIntegrity, "valid_signed");
    assert.equal(apply.eligibleRecords, 2);
    assert.equal(apply.importedRecords, 2);
    assert.equal(apply.applied, true);
    const importedInventory =
      await targetHarness.store.providerCatalogConformanceReceiptInventory();
    assert.equal(importedInventory.records.length, 2);
    assert.equal(importedInventory.signedRecords, 2);
    assert.equal(importedInventory.latest?.recordedAt, exported.packet.records[0].recordedAt);

    const duplicate = await targetHarness.service.importProviderCatalogConformanceReceiptPacket(
      exported.packet,
      "apply"
    );
    assert.equal(duplicate.eligibleRecords, 0);
    assert.equal(duplicate.importedRecords, 0);
    assert.equal(duplicate.duplicateRecords, 2);
    assert.equal(
      (await targetHarness.store.providerCatalogConformanceReceiptInventory()).records.length,
      2
    );

    const tampered = structuredClone(exported.packet) as typeof exported.packet;
    tampered.source.recordCount = 7;
    const tamperedImport =
      await targetHarness.service.importProviderCatalogConformanceReceiptPacket(
        tampered,
        "dry_run"
      );
    assert.equal(tamperedImport.packetIntegrity, "payload_mismatch");
    assert.equal(tamperedImport.eligibleRecords, 0);
    assert.equal(tamperedImport.invalidPayloadRecords, 2);

    const payload = JSON.stringify({ exported, dryRun, apply, duplicate, tamperedImport });
    for (const forbidden of [
      sourceHarness.root,
      targetHarness.root,
      sourceHarness.sourceKey,
      targetHarness.sourceKey,
      oldSigningKey,
      newSigningKey,
    ]) {
      assert.equal(payload.includes(forbidden), false, forbidden);
    }
  } finally {
    sourceHarness.cleanup();
    targetHarness.cleanup();
  }
});

test("provider catalog conformance packet escrow inventories and recovers copied packets", async () => {
  const oldSigningKey = "provider-catalog-conformance-escrow-old-key-0001";
  const newSigningKey = "provider-catalog-conformance-escrow-new-key-0001";
  let nowMs = Date.parse("2026-07-15T06:40:00.000Z");
  const sourceHarness = harness({
    manifestSigningKey: oldSigningKey,
    sourceReceipt: true,
    now: () => new Date(nowMs),
  });
  const targetHarness = harness({
    manifestSigningKey: newSigningKey,
    manifestVerificationKeys: oldSigningKey,
    sourceReceipt: true,
    now: () => new Date(nowMs),
  });
  try {
    for (let index = 0; index < 2; index += 1) {
      const receipt = await sourceHarness.service.persistProviderCatalogConformanceReceipt({
        scanLimit: 1,
        pageLimit: 1,
      });
      assert.equal(receipt.persisted, true);
      nowMs += 1_000;
    }

    const escrowed = await sourceHarness.service.escrowProviderCatalogConformanceReceiptPacket();
    assert.equal(escrowed.escrowed, true);
    assert.equal(escrowed.recordsExported, 2);
    assert.equal(escrowed.packetIntegrity, "hmac-sha256");
    assert.equal(escrowed.signed, true);
    const duplicateEscrow =
      await sourceHarness.service.escrowProviderCatalogConformanceReceiptPacket();
    assert.equal(duplicateEscrow.packetDigest, escrowed.packetDigest);

    const sourceInventory =
      await sourceHarness.service.providerCatalogConformancePacketEscrowInventory();
    assert.equal(sourceInventory.packets, 2);
    assert.equal(sourceInventory.duplicatePacketDigests, 1);
    assert.equal(sourceInventory.invalidIntegrityPackets, 0);
    assert.equal(sourceInventory.payloadMismatchPackets, 0);
    assert.equal(sourceInventory.latest?.integrityStatus, "valid_signed");

    const packetInventory =
      await sourceHarness.store.providerCatalogConformancePacketInventory();
    assert.equal(packetInventory.records.length, 2);
    for (const record of packetInventory.records) {
      await targetHarness.store.recordProviderCatalogConformancePacket(record);
    }

    const targetInventory =
      await targetHarness.service.providerCatalogConformancePacketEscrowInventory();
    assert.equal(targetInventory.packets, 2);
    assert.equal(targetInventory.duplicatePacketDigests, 1);
    assert.equal(targetInventory.latest?.integrityStatus, "valid_signed");

    const dryRun =
      await targetHarness.service.recoverProviderCatalogConformanceReceiptsFromPacketEscrow(
        "dry_run"
      );
    assert.equal(dryRun.packetsScanned, 2);
    assert.equal(dryRun.validPackets, 1);
    assert.equal(dryRun.duplicatePacketDigests, 1);
    assert.equal(dryRun.recordsReceived, 2);
    assert.equal(dryRun.eligibleRecords, 2);
    assert.equal(dryRun.importedRecords, 0);
    assert.equal(dryRun.dryRun, true);
    assert.equal(
      (await targetHarness.store.providerCatalogConformanceReceiptInventory()).records.length,
      0
    );

    const apply =
      await targetHarness.service.recoverProviderCatalogConformanceReceiptsFromPacketEscrow(
        "apply"
      );
    assert.equal(apply.validPackets, 1);
    assert.equal(apply.importedRecords, 2);
    assert.equal(apply.applied, true);
    assert.equal(
      (await targetHarness.store.providerCatalogConformanceReceiptInventory()).records.length,
      2
    );

    const repeated =
      await targetHarness.service.recoverProviderCatalogConformanceReceiptsFromPacketEscrow(
        "apply"
      );
    assert.equal(repeated.importedRecords, 0);
    assert.equal(repeated.duplicateRecords, 2);

    const payload = JSON.stringify({
      escrowed,
      duplicateEscrow,
      sourceInventory,
      targetInventory,
      dryRun,
      apply,
      repeated,
    });
    for (const forbidden of [
      sourceHarness.root,
      targetHarness.root,
      sourceHarness.sourceKey,
      targetHarness.sourceKey,
      oldSigningKey,
      newSigningKey,
    ]) {
      assert.equal(payload.includes(forbidden), false, forbidden);
    }
  } finally {
    sourceHarness.cleanup();
    targetHarness.cleanup();
  }
});

test("provider catalog conformance packet escrow lifecycle honors legal hold and bounded retention", async () => {
  const signingKey = "provider-catalog-conformance-packet-lifecycle-key-0001";
  let nowMs = Date.parse("2026-07-15T06:50:00.000Z");
  const testHarness = harness({
    manifestSigningKey: signingKey,
    sourceReceipt: true,
    providerCatalogConformancePacketEscrowMaxRecords: "1",
    providerCatalogConformancePacketEscrowRetentionMs: String(24 * 60 * 60_000),
    providerCatalogConformancePacketEscrowLegalHold: "true",
    now: () => new Date(nowMs),
  });
  try {
    for (let index = 0; index < 3; index += 1) {
      const receipt = await testHarness.service.persistProviderCatalogConformanceReceipt({
        scanLimit: 1,
        pageLimit: 1,
      });
      assert.equal(receipt.persisted, true);
      const escrow = await testHarness.service.escrowProviderCatalogConformanceReceiptPacket();
      assert.equal(escrow.escrowed, true);
      assert.equal(escrow.signed, true);
      nowMs += 1_000;
    }
    nowMs += 1_000;

    const pressureDiagnostics = await testHarness.service.diagnostics();
    assert.equal(pressureDiagnostics.providerCatalogConformancePacketEscrow.packets, 3);
    assert.equal(
      pressureDiagnostics.providerCatalogConformancePacketEscrow.eligiblePackets,
      2
    );
    assert.equal(
      pressureDiagnostics.providerCatalogConformancePacketEscrow.blockedByLegalHold,
      2
    );
    assert.equal(
      pressureDiagnostics.providerCatalogConformancePacketEscrow.policy.legalHold,
      true
    );
    assert.equal(
      pressureDiagnostics.providerCatalogConformancePacketEscrow.pressureDetected,
      true
    );
    assert.ok(
      pressureDiagnostics.providerCatalogConformancePacketEscrow.oldestPacketAgeMs !==
        null
    );

    const holdDryRun =
      await testHarness.service.providerCatalogConformancePacketEscrowLifecycle(
        "dry_run"
      );
    assert.equal(holdDryRun.policy.legalHold, true);
    assert.equal(holdDryRun.policy.maxRecords, 1);
    assert.equal(holdDryRun.policy.preserveLatest, true);
    assert.equal(holdDryRun.totalPackets, 3);
    assert.equal(holdDryRun.eligiblePackets, 2);
    assert.equal(holdDryRun.deletedPackets, 0);
    assert.equal(holdDryRun.blockedByLegalHold, 2);
    assert.equal(holdDryRun.retainedPackets, 3);
    assert.equal(holdDryRun.dryRun, true);
    assert.equal(holdDryRun.applied, false);
    assert.match(String(holdDryRun.latest?.packetDigest), /^[a-f0-9]{64}$/);
    assert.equal(holdDryRun.latest?.recordCount, 3);

    const holdApply =
      await testHarness.service.providerCatalogConformancePacketEscrowLifecycle("apply");
    assert.equal(holdApply.policy.legalHold, true);
    assert.equal(holdApply.eligiblePackets, 2);
    assert.equal(holdApply.deletedPackets, 0);
    assert.equal(holdApply.blockedByLegalHold, 2);
    assert.equal(holdApply.retainedPackets, 3);
    assert.equal(holdApply.applied, false);
    assert.equal(
      (await testHarness.store.providerCatalogConformancePacketInventory()).records.length,
      3
    );

    const unlockedService = new MediaPipelineService({
      runtime: testHarness.runtime,
      config: readMediaPipelineConfig(testHarness.runtime.config, {
        CODELIVER_MEDIA_PIPELINE_MANIFEST_SIGNING_KEY: signingKey,
        CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_PACKET_ESCROW_MAX_RECORDS:
          "1",
        CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_PACKET_ESCROW_RETENTION_MS:
          String(24 * 60 * 60_000),
      }),
      store: testHarness.store,
      processor: testHarness.processor,
      repository: testHarness.repository,
      metrics: { emit() {} },
      now: () => new Date(nowMs),
    });

    const unlockedDryRun =
      await unlockedService.providerCatalogConformancePacketEscrowLifecycle("dry_run");
    assert.equal(unlockedDryRun.policy.legalHold, false);
    assert.equal(unlockedDryRun.eligiblePackets, 2);
    assert.equal(unlockedDryRun.deletedPackets, 0);
    assert.equal(unlockedDryRun.retainedPackets, 3);
    assert.equal(unlockedDryRun.applied, false);

    const unlockedApply =
      await unlockedService.providerCatalogConformancePacketEscrowLifecycle("apply");
    assert.equal(unlockedApply.policy.legalHold, false);
    assert.equal(unlockedApply.eligiblePackets, 2);
    assert.equal(unlockedApply.deletedPackets, 2);
    assert.equal(unlockedApply.retainedPackets, 1);
    assert.equal(unlockedApply.blockedByLegalHold, 0);
    assert.equal(unlockedApply.applied, true);

    const finalInventory =
      await testHarness.store.providerCatalogConformancePacketInventory();
    assert.equal(finalInventory.records.length, 1);
    assert.equal(finalInventory.latest?.packetDigest, unlockedApply.latest?.packetDigest);
    assert.equal(finalInventory.latest?.recordCount, 3);
    const finalDiagnostics = await unlockedService.diagnostics();
    assert.equal(finalDiagnostics.providerCatalogConformancePacketEscrow.packets, 1);
    assert.equal(
      finalDiagnostics.providerCatalogConformancePacketEscrow.eligiblePackets,
      0
    );
    assert.equal(
      finalDiagnostics.providerCatalogConformancePacketEscrow.pressureDetected,
      false
    );

    const payload = JSON.stringify({
      pressureDiagnostics,
      holdDryRun,
      holdApply,
      unlockedDryRun,
      unlockedApply,
      finalInventory,
      finalDiagnostics,
    });
    for (const forbidden of [testHarness.root, testHarness.sourceKey, signingKey]) {
      assert.equal(payload.includes(forbidden), false, forbidden);
    }
  } finally {
    testHarness.cleanup();
  }
});

test("provider catalog conformance packet escrow quarantine isolates corrupt packets", async () => {
  const signingKey = "provider-catalog-conformance-packet-quarantine-key-0001";
  let nowMs = Date.parse("2026-07-15T07:00:00.000Z");
  const testHarness = harness({
    manifestSigningKey: signingKey,
    sourceReceipt: true,
    providerCatalogConformancePacketQuarantineMaxRecords: "1",
    providerCatalogConformancePacketQuarantineRetentionMs: String(180 * 24 * 60 * 60_000),
    providerCatalogConformancePacketQuarantineLegalHold: "true",
    providerCatalogConformancePacketQuarantineAttestationMaxRecords: "1",
    providerCatalogConformancePacketQuarantineAttestationRetentionMs: String(
      365 * 24 * 60 * 60_000
    ),
    providerCatalogConformancePacketQuarantineAttestationLegalHold: "true",
    now: () => new Date(nowMs),
  });
  try {
    for (let index = 0; index < 2; index += 1) {
      const receipt = await testHarness.service.persistProviderCatalogConformanceReceipt({
        scanLimit: 1,
        pageLimit: 1,
      });
      assert.equal(receipt.persisted, true);
      const escrow = await testHarness.service.escrowProviderCatalogConformanceReceiptPacket();
      assert.equal(escrow.escrowed, true);
      nowMs += 1_000;
    }

    const packetDir = join(
      testHarness.root,
      ".codeliver-ingest/control/media-pipeline/provider-catalog-conformance-packets"
    );
    const packetFiles = readdirSync(packetDir)
      .filter((name) => name.endsWith(".json"))
      .sort();
    assert.equal(packetFiles.length, 2);
    const tamperedPacketFile = packetFiles[0];
    const tamperedPacketPath = join(packetDir, tamperedPacketFile);
    const tamperedPacketRecord = JSON.parse(
      readFileSync(tamperedPacketPath, "utf8")
    ) as { packetDigest: string; packet: { source: { recordCount: number } } };
    tamperedPacketRecord.packetDigest = "0".repeat(64);
    tamperedPacketRecord.packet.source.recordCount = 99;
    writeFileSync(tamperedPacketPath, JSON.stringify(tamperedPacketRecord, null, 2));
    const malformedPacketFile = "corrupt-packet-record.json";
    writeFileSync(join(packetDir, malformedPacketFile), "{not-json");

    const pressureDiagnostics = await testHarness.service.diagnostics();
    assert.equal(pressureDiagnostics.providerCatalogConformancePacketEscrow.packets, 2);
    assert.equal(
      pressureDiagnostics.providerCatalogConformancePacketEscrow.invalidRecords,
      1
    );
    assert.equal(
      pressureDiagnostics.providerCatalogConformancePacketEscrow.invalidIntegrityPackets,
      1
    );
    assert.equal(
      pressureDiagnostics.providerCatalogConformancePacketEscrow.payloadMismatchPackets,
      1
    );
    assert.equal(
      pressureDiagnostics.providerCatalogConformancePacketEscrow.pressureDetected,
      true
    );

    const dryRun =
      await testHarness.service.quarantineProviderCatalogConformancePacketEscrow(
        "dry_run"
      );
    assert.equal(dryRun.mode, "dry_run");
    assert.equal(dryRun.scannedPackets, 2);
    assert.equal(dryRun.invalidRecords, 1);
    assert.equal(dryRun.invalidIntegrityPackets, 1);
    assert.equal(dryRun.payloadMismatchPackets, 1);
    assert.equal(dryRun.quarantineCandidates, 2);
    assert.equal(dryRun.quarantinedPackets, 0);
    assert.equal(dryRun.retainedPackets, 3);
    assert.equal(dryRun.dryRun, true);
    assert.equal(dryRun.applied, false);
    assert.equal(
      readdirSync(packetDir).filter((name) => name.endsWith(".json")).length,
      3
    );

    const apply =
      await testHarness.service.quarantineProviderCatalogConformancePacketEscrow(
        "apply"
      );
    assert.equal(apply.mode, "apply");
    assert.equal(apply.quarantineCandidates, 2);
    assert.equal(apply.quarantinedPackets, 2);
    assert.equal(apply.retainedPackets, 1);
    assert.equal(apply.applied, true);

    const quarantineDir = join(
      testHarness.root,
      ".codeliver-ingest/control/media-pipeline/provider-catalog-conformance-packet-quarantine"
    );
    assert.equal(readdirSync(packetDir).filter((name) => name.endsWith(".json")).length, 1);
    assert.equal(
      readdirSync(quarantineDir).filter((name) => name.endsWith(".json")).length,
      2
    );
    const quarantineInventory =
      await testHarness.service.providerCatalogConformancePacketQuarantineInventory();
    assert.equal(quarantineInventory.quarantinedPackets, 2);
    assert.equal(quarantineInventory.invalidRecords, 0);
    assert.equal(quarantineInventory.malformedRecordQuarantines, 1);
    assert.equal(quarantineInventory.payloadMismatchQuarantines, 1);
    assert.equal(quarantineInventory.oldestQuarantineAgeMs !== null, true);

    const quarantineHoldDryRun =
      await testHarness.service.providerCatalogConformancePacketQuarantineLifecycle(
        "dry_run"
      );
    assert.equal(quarantineHoldDryRun.policy.legalHold, true);
    assert.equal(quarantineHoldDryRun.policy.maxRecords, 1);
    assert.equal(quarantineHoldDryRun.policy.manualReviewRequired, true);
    assert.equal(quarantineHoldDryRun.totalQuarantinedPackets, 2);
    assert.equal(quarantineHoldDryRun.eligiblePackets, 1);
    assert.equal(quarantineHoldDryRun.blockedByLegalHold, 1);
    assert.equal(quarantineHoldDryRun.deletedPackets, 0);
    assert.equal(quarantineHoldDryRun.retainedPackets, 2);

    const quarantineHoldApply =
      await testHarness.service.providerCatalogConformancePacketQuarantineLifecycle(
        "apply"
      );
    assert.equal(quarantineHoldApply.policy.legalHold, true);
    assert.equal(quarantineHoldApply.eligiblePackets, 1);
    assert.equal(quarantineHoldApply.deletedPackets, 0);
    assert.equal(quarantineHoldApply.retainedPackets, 2);

    const unlockedService = new MediaPipelineService({
      runtime: testHarness.runtime,
      config: readMediaPipelineConfig(testHarness.runtime.config, {
        CODELIVER_MEDIA_PIPELINE_MANIFEST_SIGNING_KEY: signingKey,
        CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_PACKET_QUARANTINE_MAX_RECORDS:
          "1",
        CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_PACKET_QUARANTINE_RETENTION_MS:
          String(180 * 24 * 60 * 60_000),
        CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_PACKET_QUARANTINE_ATTESTATION_MAX_RECORDS:
          "1",
        CODELIVER_MEDIA_PIPELINE_PROVIDER_CATALOG_CONFORMANCE_PACKET_QUARANTINE_ATTESTATION_RETENTION_MS:
          String(365 * 24 * 60 * 60_000),
      }),
      store: testHarness.store,
      processor: testHarness.processor,
      repository: testHarness.repository,
      metrics: { emit() {} },
      now: () => new Date(nowMs),
    });
    const quarantineUnlockedApply =
      await unlockedService.providerCatalogConformancePacketQuarantineLifecycle(
        "apply"
      );
    assert.equal(quarantineUnlockedApply.policy.legalHold, false);
    assert.equal(quarantineUnlockedApply.eligiblePackets, 1);
    assert.equal(quarantineUnlockedApply.deletedPackets, 1);
    assert.equal(quarantineUnlockedApply.retainedPackets, 1);
    assert.equal(
      readdirSync(quarantineDir).filter((name) => name.endsWith(".json")).length,
      1
    );
    const retainedAttestation =
      await unlockedService.attestProviderCatalogConformancePacketQuarantine(
        "retained"
      );
    assert.equal(retainedAttestation.attested, true);
    assert.equal(retainedAttestation.decision, "retained");
    assert.equal(retainedAttestation.quarantinedPackets, 1);
    assert.equal(retainedAttestation.signed, true);
    assert.equal(retainedAttestation.attestationIntegrity, "hmac-sha256");
    assert.match(retainedAttestation.quarantineSnapshotDigest, /^[a-f0-9]{64}$/);
    assert.match(retainedAttestation.attestationPayloadSha256, /^[a-f0-9]{64}$/);
    nowMs += 1_000;
    const releasedAttestation =
      await unlockedService.attestProviderCatalogConformancePacketQuarantine(
        "released"
      );
    assert.equal(releasedAttestation.decision, "released");
    assert.equal(releasedAttestation.quarantinedPackets, 1);
    const attestationInventory =
      await unlockedService.providerCatalogConformancePacketQuarantineAttestationInventory();
    assert.equal(attestationInventory.attestations, 2);
    assert.equal(attestationInventory.retainedAttestations, 1);
    assert.equal(attestationInventory.releasedAttestations, 1);
    assert.equal(attestationInventory.signedAttestations, 2);
    assert.equal(attestationInventory.invalidIntegrityAttestations, 0);
    assert.equal(attestationInventory.payloadMismatchAttestations, 0);
    assert.equal(attestationInventory.signatureVerificationEnabled, true);
    assert.equal(attestationInventory.latest?.decision, "released");
    assert.equal(attestationInventory.latest?.integrityStatus, "valid_signed");
    assert.equal(
      attestationInventory.latest?.quarantineSnapshotDigest,
      releasedAttestation.quarantineSnapshotDigest
    );
    const wrongKeyService = new MediaPipelineService({
      runtime: testHarness.runtime,
      config: readMediaPipelineConfig(testHarness.runtime.config, {
        CODELIVER_MEDIA_PIPELINE_MANIFEST_SIGNING_KEY:
          "wrong-packet-quarantine-attestation-key-0001",
        CODELIVER_MEDIA_PIPELINE_REQUIRE_MANIFEST_SIGNATURE: "1",
      }),
      store: testHarness.store,
      processor: testHarness.processor,
      repository: testHarness.repository,
      metrics: { emit() {} },
      now: () => new Date(nowMs),
    });
    const wrongKeyInventory =
      await wrongKeyService.providerCatalogConformancePacketQuarantineAttestationInventory();
    assert.equal(wrongKeyInventory.invalidIntegrityAttestations, 2);
    assert.equal(wrongKeyInventory.payloadMismatchAttestations, 0);
    assert.equal(wrongKeyInventory.latest?.integrityStatus, "invalid_signature");

    const attestationHoldDiagnostics = await testHarness.service.diagnostics();
    assert.equal(
      attestationHoldDiagnostics.providerCatalogConformancePacketQuarantineAttestations.attestations,
      2
    );
    assert.equal(
      attestationHoldDiagnostics.providerCatalogConformancePacketQuarantineAttestations.eligibleAttestations,
      1
    );
    assert.equal(
      attestationHoldDiagnostics.providerCatalogConformancePacketQuarantineAttestations.blockedByLegalHold,
      1
    );
    assert.equal(
      attestationHoldDiagnostics.providerCatalogConformancePacketQuarantineAttestations.pressureDetected,
      true
    );
    const attestationHoldApply =
      await testHarness.service.providerCatalogConformancePacketQuarantineAttestationLifecycle(
        "apply"
      );
    assert.equal(attestationHoldApply.policy.legalHold, true);
    assert.equal(attestationHoldApply.eligibleAttestations, 1);
    assert.equal(attestationHoldApply.deletedAttestations, 0);
    assert.equal(attestationHoldApply.blockedByLegalHold, 1);

    const attestationUnlockedDryRun =
      await unlockedService.providerCatalogConformancePacketQuarantineAttestationLifecycle(
        "dry_run"
      );
    assert.equal(attestationUnlockedDryRun.policy.legalHold, false);
    assert.equal(attestationUnlockedDryRun.totalAttestations, 2);
    assert.equal(attestationUnlockedDryRun.eligibleAttestations, 1);
    assert.equal(attestationUnlockedDryRun.deletedAttestations, 0);
    const attestationUnlockedApply =
      await unlockedService.providerCatalogConformancePacketQuarantineAttestationLifecycle(
        "apply"
      );
    assert.equal(attestationUnlockedApply.eligibleAttestations, 1);
    assert.equal(attestationUnlockedApply.deletedAttestations, 1);
    assert.equal(attestationUnlockedApply.retainedAttestations, 1);
    const postLifecycleAttestationInventory =
      await unlockedService.providerCatalogConformancePacketQuarantineAttestationInventory();
    assert.equal(postLifecycleAttestationInventory.attestations, 1);
    assert.equal(postLifecycleAttestationInventory.latest?.decision, "released");

    const finalDiagnostics = await testHarness.service.diagnostics();
    assert.equal(finalDiagnostics.providerCatalogConformancePacketEscrow.packets, 1);
    assert.equal(
      finalDiagnostics.providerCatalogConformancePacketEscrow.invalidRecords,
      0
    );
    assert.equal(
      finalDiagnostics.providerCatalogConformancePacketEscrow.invalidIntegrityPackets,
      0
    );
    assert.equal(
      finalDiagnostics.providerCatalogConformancePacketEscrow.payloadMismatchPackets,
      0
    );
    assert.equal(
      finalDiagnostics.providerCatalogConformancePacketEscrow.pressureDetected,
      false
    );
    assert.equal(
      finalDiagnostics.providerCatalogConformancePacketQuarantineAttestations.attestations,
      1
    );
    assert.equal(
      finalDiagnostics.providerCatalogConformancePacketQuarantineAttestations.eligibleAttestations,
      0
    );
    assert.equal(
      finalDiagnostics.providerCatalogConformancePacketQuarantineAttestations.pressureDetected,
      false
    );

    const recovery =
      await testHarness.service.recoverProviderCatalogConformanceReceiptsFromPacketEscrow(
        "dry_run"
      );
    assert.equal(recovery.packetsScanned, 1);
    assert.equal(recovery.validPackets, 1);
    assert.equal(recovery.invalidPackets, 0);

    const payload = JSON.stringify({
      pressureDiagnostics,
      dryRun,
      apply,
      quarantineInventory,
      quarantineHoldDryRun,
      quarantineHoldApply,
      quarantineUnlockedApply,
      retainedAttestation,
      releasedAttestation,
      attestationInventory,
      wrongKeyInventory,
      attestationHoldDiagnostics,
      attestationHoldApply,
      attestationUnlockedDryRun,
      attestationUnlockedApply,
      postLifecycleAttestationInventory,
      finalDiagnostics,
      recovery,
    });
    for (const forbidden of [
      testHarness.root,
      testHarness.sourceKey,
      signingKey,
      tamperedPacketFile,
      malformedPacketFile,
    ]) {
      assert.equal(payload.includes(forbidden), false, forbidden);
    }
  } finally {
    testHarness.cleanup();
  }
});

test("provider catalog conformance fails closed on malformed metadata and backpressure", async () => {
  const manifestSigningKey = "provider-catalog-conformance-fail-signing-key-0001";
  const testHarness = harness({ manifestSigningKey, sourceReceipt: true });
  try {
    const job = await testHarness.service.enqueue(testHarness.input);
    const result = await testHarness.service.runJob(job.id);
    assert.equal(result.outcome, "published");
    const receipt = await testHarness.service.persistRestoreAttestationReceipt(
      testHarness.input.versionId
    );
    assert.equal(receipt.persisted, true);
    const inventory = await testHarness.store.restoreReceiptInventory();
    const receiptReference = inventory.references[0];

    const missing = await assessMediaPipelineProviderCatalogConformance({
      adapter: remoteAdapterProxy(testHarness.runtime.adapter, {
        kind: "google-drive",
        label: "Drive fixture without catalog capability",
        external: true,
      }),
      scanLimit: 2,
      now: () => new Date("2026-07-15T06:05:00.000Z"),
    });
    assert.equal(missing.capabilityPresent, false);
    assert.equal(missing.ready, false);
    assert.deepEqual(missing.findings, [{ code: "missing_capability", count: 1 }]);

    const malformed = await assessMediaPipelineProviderCatalogConformance({
      adapter: remoteAdapterProxy(testHarness.runtime.adapter, {
        kind: "object-store",
        label: "Malformed object catalog fixture",
        external: true,
        listMediaPipelineReceiptObjects: async () => ({
          objects: [
            {
              objectKey: "../tenant-escape.json",
              size: 12,
              sha256: "0".repeat(64),
            },
            {
              objectKey: receiptReference.objectKey,
              size: receiptReference.size + 1,
              sha256: receiptReference.sha256,
            },
          ],
          truncated: true,
          nextCursor: null,
          unsafeEntries: 2,
        }),
      }),
      scanLimit: 2,
      now: () => new Date("2026-07-15T06:06:00.000Z"),
    });
    assert.equal(malformed.ready, false);
    assert.equal(malformed.invalidObjectMetadata, 1);
    assert.equal(malformed.inspectionMismatches, 1);
    assert.equal(malformed.unsafeEntries, 2);
    assert.equal(
      malformed.findings.some((finding) => finding.code === "invalid_cursor"),
      true
    );
    assert.equal(
      malformed.findings.some((finding) => finding.code === "invalid_object_metadata"),
      true
    );
    assert.equal(
      malformed.findings.some((finding) => finding.code === "inspection_mismatch"),
      true
    );

    const backpressure = await assessMediaPipelineProviderCatalogConformance({
      adapter: remoteAdapterProxy(testHarness.runtime.adapter, {
        kind: "object-store",
        label: "Backpressure catalog fixture",
        external: true,
        listMediaPipelineReceiptObjects: async () => {
          const error = new Error("tenant quota exceeded for /private/root");
          (error as Error & { code?: string }).code = "RATE_LIMIT";
          throw error;
        },
      }),
      scanLimit: 2,
      now: () => new Date("2026-07-15T06:07:00.000Z"),
    });
    assert.equal(backpressure.ready, false);
    assert.equal(backpressure.unavailable, true);
    assert.equal(backpressure.providerBackpressure, true);
    assert.equal(
      backpressure.findings.some((finding) => finding.code === "provider_backpressure"),
      true
    );

    const payload = JSON.stringify({ missing, malformed, backpressure });
    for (const forbidden of [
      job.id,
      testHarness.input.versionId,
      testHarness.input.projectId,
      testHarness.sourceKey,
      result.job!.artifacts!.pipelineManifest.objectKey,
      receiptReference.objectKey,
      "../tenant-escape.json",
      "/private/root",
      testHarness.root,
      manifestSigningKey,
    ]) {
      assert.equal(payload.includes(forbidden), false, forbidden);
    }
  } finally {
    testHarness.cleanup();
  }
});

test("provider catalog checkpoints block partial repair and resume across cursor pages", async () => {
  const manifestSigningKey = "provider-catalog-cursor-signing-key-0001";
  let nowMs = Date.parse("2026-07-15T03:00:00.000Z");
  const testHarness = harness({
    manifestSigningKey,
    sourceReceipt: true,
    now: () => new Date(nowMs),
  });
  try {
    const job = await testHarness.service.enqueue(testHarness.input);
    const result = await testHarness.service.runJob(job.id);
    assert.equal(result.outcome, "published");
    const firstReceipt = await testHarness.service.persistRestoreAttestationReceipt(
      testHarness.input.versionId
    );
    assert.equal(firstReceipt.persisted, true);
    nowMs += 1_000;
    const secondReceipt = await testHarness.service.persistRestoreAttestationReceipt(
      testHarness.input.versionId
    );
    assert.equal(secondReceipt.persisted, true);
    const inventory = await testHarness.store.restoreReceiptInventory();
    assert.equal(inventory.references.length, 2);
    const [firstReference, secondReference] = inventory.references;

    rmSync(
      join(testHarness.root, ".codeliver-ingest/control/media-pipeline/restore-receipts"),
      { recursive: true, force: true }
    );

    const buildRuntime = (inspectionLimit: string) => {
      const remoteConfig = {
        ...testHarness.runtime.config,
        provider: "object-store" as const,
        providerWasExplicit: true,
        filesystemRoot: null,
      };
      const calls: Array<{ cursor: string | null; limit: number }> = [];
      const runtime = {
        config: remoteConfig,
        adapter: remoteAdapterProxy(testHarness.runtime.adapter, {
          kind: "object-store",
          label: "Object store catalog fixture",
          external: true,
          listMediaPipelineReceiptObjects: async (input: {
            kind: string;
            limit: number;
            cursor?: string | null;
          }) => {
            assert.equal(input.kind, "restore_attestation");
            calls.push({ cursor: input.cursor ?? null, limit: input.limit });
            if (!input.cursor) {
              return {
                objects: [
                  {
                    objectKey: firstReference.objectKey,
                    size: firstReference.size,
                    sha256: firstReference.sha256,
                  },
                ],
                truncated: true,
                nextCursor: "provider-page-2",
              };
            }
            if (input.cursor === "provider-page-2") {
              return {
                objects: [
                  {
                    objectKey: secondReference.objectKey,
                    size: secondReference.size,
                    sha256: secondReference.sha256,
                  },
                ],
                truncated: false,
                nextCursor: null,
              };
            }
            throw new Error("unexpected cursor");
          },
        }),
      };
      const service = new MediaPipelineService({
        runtime,
        config: readMediaPipelineConfig(remoteConfig, {
          CODELIVER_MEDIA_PIPELINE_MANIFEST_SIGNING_KEY: manifestSigningKey,
          CODELIVER_MEDIA_PIPELINE_LIFECYCLE_INSPECTION_LIMIT: inspectionLimit,
        }),
        store: testHarness.store,
        processor: testHarness.processor,
        repository: testHarness.repository,
        metrics: { emit() {} },
        now: () => new Date(nowMs),
      });
      return { service, calls };
    };

    const partial = buildRuntime("1");
    const blockedApply = await partial.service.repairRestoreReceiptIndex("apply");
    assert.equal(blockedApply.supported, true);
    assert.equal(blockedApply.scanRoot, "provider-catalog");
    assert.equal(blockedApply.cursorSupported, true);
    assert.equal(blockedApply.pagesScanned, 1);
    assert.equal(blockedApply.checkpointRequired, true);
    assert.match(String(blockedApply.nextCursorDigest), /^[a-f0-9]{64}$/);
    assert.equal(blockedApply.discoveredReceipts, 1);
    assert.equal(blockedApply.eligibleReceipts, 1);
    assert.equal(blockedApply.repairedReceipts, 0);
    assert.equal(blockedApply.applied, false);
    assert.deepEqual(partial.calls, [{ cursor: null, limit: 1 }]);

    const partialCheckpoint = await testHarness.store.receiptCatalogCheckpointInventory();
    assert.equal(partialCheckpoint.records.length, 1);
    assert.equal(partialCheckpoint.invalidRecords, 0);
    assert.equal(partialCheckpoint.latest?.provider, "object-store");
    assert.equal(partialCheckpoint.latest?.scanRoot, "provider-catalog");
    assert.equal(partialCheckpoint.latest?.completed, false);
    assert.equal(partialCheckpoint.latest?.stale, false);
    assert.equal(partialCheckpoint.latest?.checkpointRequired, true);
    assert.equal(partialCheckpoint.latest?.pagesScanned, 1);
    assert.equal(partialCheckpoint.latest?.startedCursorDigest, null);
    assert.match(String(partialCheckpoint.latest?.nextCursorDigest), /^[a-f0-9]{64}$/);
    assert.equal(partialCheckpoint.latest?.continuationTokenDigest, null);
    assert.equal(partialCheckpoint.latest?.continuationTokenExpiresAt, null);

    const stillMissing = await testHarness.service.diagnostics();
    assert.equal(stillMissing.restoreReceipts.versionsMissingReceipt, 1);
    assert.equal(stillMissing.restoreReceipts.totalReceipts, 0);
    assert.equal(stillMissing.restoreReceipts.catalogRecovery.checkpointRecord.recorded, false);
    assert.equal(stillMissing.restoreReceipts.catalogRecovery.checkpointRecords, 1);
    assert.equal(stillMissing.restoreReceipts.catalogRecovery.invalidCheckpointRecords, 0);
    assert.equal(stillMissing.restoreReceipts.catalogRecovery.staleCheckpointRecords, 0);
    assert.equal(stillMissing.restoreReceipts.catalogRecovery.checkpointResetCandidates, 1);
    assert.equal(stillMissing.restoreReceipts.catalogRecovery.unsafeCheckpointResetEntries, 0);
    assert.equal(
      stillMissing.restoreReceipts.catalogRecovery.checkpointResetRecommended,
      false
    );

    const partialDiagnostics = await partial.service.diagnostics();
    assert.equal(partialDiagnostics.restoreReceipts.catalogRecovery.checkpointRequired, true);
    assert.equal(partialDiagnostics.restoreReceipts.catalogRecovery.checkpointRecord.recorded, true);
    assert.equal(partialDiagnostics.restoreReceipts.catalogRecovery.checkpointRecord.completed, false);
    assert.equal(partialDiagnostics.restoreReceipts.catalogRecovery.checkpointRecord.stale, false);
    assert.equal(
      partialDiagnostics.restoreReceipts.catalogRecovery.checkpointRecord.startedCursorDigest,
      null
    );
    assert.match(
      String(partialDiagnostics.restoreReceipts.catalogRecovery.checkpointRecord.nextCursorDigest),
      /^[a-f0-9]{64}$/
    );
    assert.equal(
      partialDiagnostics.restoreReceipts.catalogRecovery.checkpointRecord.continuationTokenDigest,
      null
    );
    assert.equal(
      partialDiagnostics.restoreReceipts.catalogRecovery.checkpointRecord.continuationTokenExpiresAt,
      null
    );

    nowMs += 25 * 60 * 60 * 1000;
    const staleCheckpoint = await testHarness.store.receiptCatalogCheckpointInventory();
    assert.equal(staleCheckpoint.latest?.stale, true);
    assert.equal(staleCheckpoint.staleRecords, 1);
    const staleDiagnostics = await partial.service.diagnostics();
    assert.equal(staleDiagnostics.restoreReceipts.catalogRecovery.checkpointRecords, 1);
    assert.equal(staleDiagnostics.restoreReceipts.catalogRecovery.invalidCheckpointRecords, 0);
    assert.equal(staleDiagnostics.restoreReceipts.catalogRecovery.staleCheckpointRecords, 1);
    assert.equal(staleDiagnostics.restoreReceipts.catalogRecovery.checkpointResetCandidates, 1);
    assert.equal(staleDiagnostics.restoreReceipts.catalogRecovery.unsafeCheckpointResetEntries, 0);
    assert.equal(
      staleDiagnostics.restoreReceipts.catalogRecovery.checkpointResetRecommended,
      true
    );

    const complete = buildRuntime("3");
    const completedApply = await complete.service.repairRestoreReceiptIndex("apply");
    assert.equal(completedApply.supported, true);
    assert.equal(completedApply.scanRoot, "provider-catalog");
    assert.equal(completedApply.cursorSupported, true);
    assert.equal(completedApply.pagesScanned, 2);
    assert.equal(completedApply.checkpointRequired, false);
    assert.equal(completedApply.nextCursorDigest, null);
    assert.equal(completedApply.discoveredReceipts, 2);
    assert.equal(completedApply.eligibleReceipts, 1);
    assert.equal(completedApply.skippedDuplicateVersion, 1);
    assert.equal(completedApply.repairedReceipts, 1);
    assert.equal(completedApply.applied, true);
    assert.deepEqual(complete.calls, [
      { cursor: null, limit: 3 },
      { cursor: "provider-page-2", limit: 2 },
    ]);

    const completeCheckpoint = await testHarness.store.receiptCatalogCheckpointInventory();
    assert.equal(completeCheckpoint.records.length, 1);
    assert.equal(completeCheckpoint.latest?.completed, true);
    assert.equal(completeCheckpoint.latest?.stale, false);
    assert.equal(completeCheckpoint.latest?.checkpointRequired, false);
    assert.equal(completeCheckpoint.latest?.startedCursorDigest, null);
    assert.equal(completeCheckpoint.latest?.nextCursorDigest, null);
    assert.equal(completeCheckpoint.latest?.continuationTokenDigest, null);
    assert.equal(completeCheckpoint.latest?.continuationTokenExpiresAt, null);
    assert.equal(completeCheckpoint.latest?.pagesScanned, 2);
    const checkpointDir = join(
      testHarness.root,
      ".codeliver-ingest/control/media-pipeline/receipt-catalog-checkpoints"
    );
    const checkpointFiles = readdirSync(checkpointDir)
      .filter((name) => name.endsWith(".json"))
      .sort();
    assert.equal(checkpointFiles.length, 1);
    const checkpointFile = checkpointFiles[0];
    writeFileSync(join(checkpointDir, checkpointFile), "{not-json");
    const corruptCheckpoint = await testHarness.store.receiptCatalogCheckpointInventory();
    assert.equal(corruptCheckpoint.records.length, 0);
    assert.equal(corruptCheckpoint.invalidRecords, 1);
    const corruptDiagnostics = await complete.service.diagnostics();
    assert.equal(corruptDiagnostics.restoreReceipts.catalogRecovery.checkpointRecords, 0);
    assert.equal(corruptDiagnostics.restoreReceipts.catalogRecovery.invalidCheckpointRecords, 1);
    assert.equal(corruptDiagnostics.restoreReceipts.catalogRecovery.staleCheckpointRecords, 0);
    assert.equal(corruptDiagnostics.restoreReceipts.catalogRecovery.checkpointResetCandidates, 1);
    assert.equal(corruptDiagnostics.restoreReceipts.catalogRecovery.unsafeCheckpointResetEntries, 0);
    assert.equal(
      corruptDiagnostics.restoreReceipts.catalogRecovery.checkpointResetRecommended,
      true
    );
    const resetDryRun = await complete.service.resetReceiptCatalogCheckpoints("dry_run");
    assert.equal(resetDryRun.mode, "dry_run");
    assert.equal(resetDryRun.checkpointRecords, 0);
    assert.equal(resetDryRun.invalidRecords, 1);
    assert.equal(resetDryRun.resetCandidates, 1);
    assert.equal(resetDryRun.unsafeEntries, 0);
    assert.equal(resetDryRun.deletedCheckpoints, 0);
    assert.equal(resetDryRun.receipt.recorded, false);
    assert.equal(resetDryRun.policy.checkpointDirectoryOnly, true);
    assert.equal(resetDryRun.policy.preservesReceiptObjects, true);
    assert.equal(resetDryRun.policy.rawCursorsRedacted, true);
    const dryRunResetReceiptInventory =
      await testHarness.store.receiptCatalogCheckpointResetReceiptInventory();
    assert.equal(dryRunResetReceiptInventory.records.length, 0);
    const resetApply = await complete.service.resetReceiptCatalogCheckpoints("apply");
    assert.equal(resetApply.mode, "apply");
    assert.equal(resetApply.resetCandidates, 1);
    assert.equal(resetApply.deletedCheckpoints, 1);
    assert.equal(resetApply.applied, true);
    assert.equal(resetApply.receipt.recorded, true);
    assert.match(String(resetApply.receipt.resetSnapshotDigest), /^[a-f0-9]{64}$/);
    assert.match(String(resetApply.receipt.receiptPayloadSha256), /^[a-f0-9]{64}$/);
    assert.equal(resetApply.receipt.integrity, "hmac-sha256");
    assert.equal(resetApply.receipt.signed, true);
    const resetInventory = await testHarness.store.receiptCatalogCheckpointInventory();
    assert.equal(resetInventory.records.length, 0);
    assert.equal(resetInventory.invalidRecords, 0);
    assert.equal((await testHarness.store.restoreReceiptInventory()).references.length, 1);
    const resetReceiptInventory =
      await testHarness.store.receiptCatalogCheckpointResetReceiptInventory();
    assert.equal(resetReceiptInventory.records.length, 1);
    assert.equal(resetReceiptInventory.invalidRecords, 0);
    assert.equal(resetReceiptInventory.signedReceipts, 1);
    assert.equal(resetReceiptInventory.unsignedReceipts, 0);
    assert.equal(
      resetReceiptInventory.latest?.resetSnapshotDigest,
      resetApply.receipt.resetSnapshotDigest
    );
    assert.equal(resetReceiptInventory.latest?.deletedCheckpoints, 1);
    const resetReceiptDiagnostics = await complete.service.diagnostics();
    assert.equal(resetReceiptDiagnostics.receiptCatalogCheckpointResetReceipts.receipts, 1);
    assert.equal(
      resetReceiptDiagnostics.receiptCatalogCheckpointResetReceipts.invalidRecords,
      0
    );
    assert.equal(
      resetReceiptDiagnostics.receiptCatalogCheckpointResetReceipts.signedReceipts,
      1
    );
    assert.equal(
      resetReceiptDiagnostics.receiptCatalogCheckpointResetReceipts.invalidIntegrityReceipts,
      0
    );
    assert.equal(
      resetReceiptDiagnostics.receiptCatalogCheckpointResetReceipts.payloadMismatchReceipts,
      0
    );
    assert.equal(
      resetReceiptDiagnostics.receiptCatalogCheckpointResetReceipts.latest?.integrityStatus,
      "valid_signed"
    );
    assert.equal(
      resetReceiptDiagnostics.receiptCatalogCheckpointResetReceipts.latest?.deletedCheckpoints,
      1
    );

    const payload = JSON.stringify({
      blockedApply,
      completedApply,
      partialCheckpoint,
      partialDiagnostics,
      staleCheckpoint,
      completeCheckpoint,
      corruptCheckpoint,
      resetDryRun,
      resetApply,
      resetInventory,
      resetReceiptInventory,
      resetReceiptDiagnostics,
    });
    for (const forbidden of [
      job.id,
      testHarness.input.versionId,
      testHarness.input.projectId,
      testHarness.sourceKey,
      result.job!.artifacts!.pipelineManifest.objectKey,
      firstReference.objectKey,
      secondReference.objectKey,
      "provider-page-2",
      checkpointFile,
      testHarness.root,
      manifestSigningKey,
    ]) {
      assert.equal(payload.includes(forbidden), false, forbidden);
    }
  } finally {
    testHarness.cleanup();
  }
});

test("receipt catalog checkpoint reset receipt lifecycle honors legal hold and bounded retention", async () => {
  const signingKey = "receipt-catalog-reset-lifecycle-key-0001";
  let nowMs = Date.parse("2026-07-15T10:00:00.000Z");
  const testHarness = harness({
    manifestSigningKey: signingKey,
    receiptCatalogCheckpointResetReceiptMaxRecords: "1",
    receiptCatalogCheckpointResetReceiptRetentionMs: String(24 * 60 * 60_000),
    receiptCatalogCheckpointResetReceiptLegalHold: "true",
    now: () => new Date(nowMs),
  });
  try {
    for (let index = 0; index < 3; index += 1) {
      const reset = await testHarness.service.resetReceiptCatalogCheckpoints("apply");
      assert.equal(reset.receipt.recorded, true);
      assert.equal(reset.receipt.integrity, "hmac-sha256");
      assert.equal(reset.receipt.signed, true);
      nowMs += 1_000;
    }
    nowMs += 1_000;

    const holdDiagnostics = await testHarness.service.diagnostics();
    assert.equal(holdDiagnostics.receiptCatalogCheckpointResetReceipts.receipts, 3);
    assert.equal(holdDiagnostics.receiptCatalogCheckpointResetReceipts.eligibleReceipts, 2);
    assert.equal(holdDiagnostics.receiptCatalogCheckpointResetReceipts.blockedByLegalHold, 2);
    assert.equal(holdDiagnostics.receiptCatalogCheckpointResetReceipts.pressureDetected, true);
    assert.equal(
      holdDiagnostics.receiptCatalogCheckpointResetReceipts.latest?.integrityStatus,
      "valid_signed"
    );

    const holdDryRun =
      await testHarness.service.receiptCatalogCheckpointResetReceiptLifecycle("dry_run");
    assert.equal(holdDryRun.policy.legalHold, true);
    assert.equal(holdDryRun.policy.maxRecords, 1);
    assert.equal(holdDryRun.totalReceipts, 3);
    assert.equal(holdDryRun.eligibleReceipts, 2);
    assert.equal(holdDryRun.deletedReceipts, 0);
    assert.equal(holdDryRun.blockedByLegalHold, 2);
    assert.equal(holdDryRun.retainedReceipts, 3);
    assert.equal(holdDryRun.dryRun, true);
    assert.equal(holdDryRun.applied, false);
    assert.match(String(holdDryRun.latest?.resetSnapshotDigest), /^[a-f0-9]{64}$/);

    const holdApply =
      await testHarness.service.receiptCatalogCheckpointResetReceiptLifecycle("apply");
    assert.equal(holdApply.policy.legalHold, true);
    assert.equal(holdApply.eligibleReceipts, 2);
    assert.equal(holdApply.deletedReceipts, 0);
    assert.equal(holdApply.blockedByLegalHold, 2);
    assert.equal(holdApply.retainedReceipts, 3);
    assert.equal(holdApply.applied, false);
    assert.equal(
      (await testHarness.store.receiptCatalogCheckpointResetReceiptInventory()).records.length,
      3
    );

    const unlockedService = new MediaPipelineService({
      runtime: testHarness.runtime,
      config: readMediaPipelineConfig(testHarness.runtime.config, {
        CODELIVER_MEDIA_PIPELINE_MANIFEST_SIGNING_KEY: signingKey,
        CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CHECKPOINT_RESET_RECEIPT_MAX_RECORDS: "1",
        CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CHECKPOINT_RESET_RECEIPT_RETENTION_MS: String(
          24 * 60 * 60_000
        ),
      }),
      store: testHarness.store,
      processor: testHarness.processor,
      repository: testHarness.repository,
      metrics: { emit() {} },
      now: () => new Date(nowMs),
    });

    const unlockedDryRun =
      await unlockedService.receiptCatalogCheckpointResetReceiptLifecycle("dry_run");
    assert.equal(unlockedDryRun.policy.legalHold, false);
    assert.equal(unlockedDryRun.eligibleReceipts, 2);
    assert.equal(unlockedDryRun.deletedReceipts, 0);
    assert.equal(unlockedDryRun.retainedReceipts, 3);
    assert.equal(unlockedDryRun.applied, false);

    const unlockedApply =
      await unlockedService.receiptCatalogCheckpointResetReceiptLifecycle("apply");
    assert.equal(unlockedApply.policy.legalHold, false);
    assert.equal(unlockedApply.eligibleReceipts, 2);
    assert.equal(unlockedApply.deletedReceipts, 2);
    assert.equal(unlockedApply.retainedReceipts, 1);
    assert.equal(unlockedApply.blockedByLegalHold, 0);
    assert.equal(unlockedApply.applied, true);

    const finalInventory =
      await testHarness.store.receiptCatalogCheckpointResetReceiptInventory();
    assert.equal(finalInventory.records.length, 1);
    assert.equal(finalInventory.invalidRecords, 0);
    assert.equal(finalInventory.signedReceipts, 1);
    const finalDiagnostics = await unlockedService.diagnostics();
    assert.equal(finalDiagnostics.receiptCatalogCheckpointResetReceipts.receipts, 1);
    assert.equal(finalDiagnostics.receiptCatalogCheckpointResetReceipts.eligibleReceipts, 0);
    assert.equal(finalDiagnostics.receiptCatalogCheckpointResetReceipts.pressureDetected, false);

    const payload = JSON.stringify({
      holdDiagnostics,
      holdDryRun,
      holdApply,
      unlockedDryRun,
      unlockedApply,
      finalDiagnostics,
    });
    for (const forbidden of [testHarness.root, signingKey]) {
      assert.equal(payload.includes(forbidden), false, forbidden);
    }
  } finally {
    testHarness.cleanup();
  }
});

test("receipt catalog checkpoint reset receipt packets export and import redacted recovery evidence", async () => {
  const oldSigningKey = "receipt-catalog-reset-packet-old-key-0001";
  const newSigningKey = "receipt-catalog-reset-packet-new-key-0001";
  let nowMs = Date.parse("2026-07-15T10:30:00.000Z");
  const sourceHarness = harness({
    manifestSigningKey: oldSigningKey,
    now: () => new Date(nowMs),
  });
  const targetHarness = harness({
    manifestSigningKey: newSigningKey,
    manifestVerificationKeys: oldSigningKey,
    now: () => new Date(nowMs),
  });
  try {
    for (let index = 0; index < 2; index += 1) {
      const reset = await sourceHarness.service.resetReceiptCatalogCheckpoints("apply");
      assert.equal(reset.receipt.recorded, true);
      assert.equal(reset.receipt.integrity, "hmac-sha256");
      assert.equal(reset.receipt.signed, true);
      nowMs += 1_000;
    }

    const exported =
      await sourceHarness.service.exportReceiptCatalogCheckpointResetReceiptPacket();
    assert.equal(exported.recordsExported, 2);
    assert.equal(exported.invalidRecords, 0);
    assert.equal(exported.signedReceipts, 2);
    assert.equal(exported.packet.source.recordCount, 2);
    assert.equal(exported.packet.packetIntegrity.algorithm, "hmac-sha256");
    assert.match(exported.packetDigest, /^[a-f0-9]{64}$/);

    const dryRun = await targetHarness.service.importReceiptCatalogCheckpointResetReceiptPacket(
      exported.packet,
      "dry_run"
    );
    assert.equal(dryRun.packetIntegrity, "valid_signed");
    assert.equal(dryRun.recordsReceived, 2);
    assert.equal(dryRun.eligibleRecords, 2);
    assert.equal(dryRun.importedRecords, 0);
    assert.equal(dryRun.duplicateRecords, 0);
    assert.equal(dryRun.invalidPayloadRecords, 0);
    assert.equal(dryRun.invalidReceiptIntegrityRecords, 0);
    assert.equal(dryRun.dryRun, true);
    assert.equal(
      (await targetHarness.store.receiptCatalogCheckpointResetReceiptInventory()).records.length,
      0
    );

    const apply = await targetHarness.service.importReceiptCatalogCheckpointResetReceiptPacket(
      exported.packet,
      "apply"
    );
    assert.equal(apply.packetIntegrity, "valid_signed");
    assert.equal(apply.eligibleRecords, 2);
    assert.equal(apply.importedRecords, 2);
    assert.equal(apply.applied, true);
    const importedInventory =
      await targetHarness.store.receiptCatalogCheckpointResetReceiptInventory();
    assert.equal(importedInventory.records.length, 2);
    assert.equal(importedInventory.signedReceipts, 2);
    assert.equal(importedInventory.invalidRecords, 0);

    const duplicate = await targetHarness.service.importReceiptCatalogCheckpointResetReceiptPacket(
      exported.packet,
      "apply"
    );
    assert.equal(duplicate.eligibleRecords, 0);
    assert.equal(duplicate.importedRecords, 0);
    assert.equal(duplicate.duplicateRecords, 2);
    assert.equal(
      (await targetHarness.store.receiptCatalogCheckpointResetReceiptInventory()).records.length,
      2
    );

    const tampered = structuredClone(exported.packet) as typeof exported.packet;
    tampered.source.recordCount = 7;
    const tamperedImport =
      await targetHarness.service.importReceiptCatalogCheckpointResetReceiptPacket(
        tampered,
        "dry_run"
      );
    assert.equal(tamperedImport.packetIntegrity, "payload_mismatch");
    assert.equal(tamperedImport.eligibleRecords, 0);
    assert.equal(tamperedImport.invalidPayloadRecords, 2);

    const payload = JSON.stringify({ exported, dryRun, apply, duplicate, tamperedImport });
    for (const forbidden of [
      sourceHarness.root,
      targetHarness.root,
      sourceHarness.sourceKey,
      targetHarness.sourceKey,
      oldSigningKey,
      newSigningKey,
    ]) {
      assert.equal(payload.includes(forbidden), false, forbidden);
    }
  } finally {
    sourceHarness.cleanup();
    targetHarness.cleanup();
  }
});

test("receipt catalog checkpoint reset receipt packet escrow inventories and recovers copied packets", async () => {
  const oldSigningKey = "receipt-catalog-reset-escrow-old-key-0001";
  const newSigningKey = "receipt-catalog-reset-escrow-new-key-0001";
  let nowMs = Date.parse("2026-07-15T10:40:00.000Z");
  const sourceHarness = harness({
    manifestSigningKey: oldSigningKey,
    now: () => new Date(nowMs),
  });
  const targetHarness = harness({
    manifestSigningKey: newSigningKey,
    manifestVerificationKeys: oldSigningKey,
    now: () => new Date(nowMs),
  });
  try {
    for (let index = 0; index < 2; index += 1) {
      const reset = await sourceHarness.service.resetReceiptCatalogCheckpoints("apply");
      assert.equal(reset.receipt.recorded, true);
      nowMs += 1_000;
    }

    const escrowed =
      await sourceHarness.service.escrowReceiptCatalogCheckpointResetReceiptPacket();
    assert.equal(escrowed.escrowed, true);
    assert.equal(escrowed.recordsExported, 2);
    assert.equal(escrowed.packetIntegrity, "hmac-sha256");
    assert.equal(escrowed.signed, true);
    assert.match(escrowed.packetDigest, /^[a-f0-9]{64}$/);

    const sourceInventory =
      await sourceHarness.service.receiptCatalogCheckpointResetReceiptPacketEscrowInventory();
    assert.equal(sourceInventory.packets, 1);
    assert.equal(sourceInventory.duplicatePacketDigests, 0);
    assert.equal(sourceInventory.invalidIntegrityPackets, 0);
    assert.equal(sourceInventory.payloadMismatchPackets, 0);
    assert.equal(sourceInventory.latest?.integrityStatus, "valid_signed");

    const packetInventory =
      await sourceHarness.store.receiptCatalogCheckpointResetReceiptPacketInventory();
    assert.equal(packetInventory.records.length, 1);
    for (const record of packetInventory.records) {
      await targetHarness.store.recordReceiptCatalogCheckpointResetReceiptPacket(record);
    }

    const targetInventory =
      await targetHarness.service.receiptCatalogCheckpointResetReceiptPacketEscrowInventory();
    assert.equal(targetInventory.packets, 1);
    assert.equal(targetInventory.latest?.integrityStatus, "valid_signed");

    const dryRun =
      await targetHarness.service.recoverReceiptCatalogCheckpointResetReceiptsFromPacketEscrow(
        "dry_run"
      );
    assert.equal(dryRun.packetsScanned, 1);
    assert.equal(dryRun.validPackets, 1);
    assert.equal(dryRun.recordsReceived, 2);
    assert.equal(dryRun.eligibleRecords, 2);
    assert.equal(dryRun.recoveredRecords, 0);
    assert.equal(dryRun.dryRun, true);
    assert.equal(
      (await targetHarness.store.receiptCatalogCheckpointResetReceiptInventory()).records.length,
      0
    );

    const apply =
      await targetHarness.service.recoverReceiptCatalogCheckpointResetReceiptsFromPacketEscrow(
        "apply"
      );
    assert.equal(apply.validPackets, 1);
    assert.equal(apply.recoveredRecords, 2);
    assert.equal(apply.applied, true);
    assert.equal(
      (await targetHarness.store.receiptCatalogCheckpointResetReceiptInventory()).records.length,
      2
    );

    const repeated =
      await targetHarness.service.recoverReceiptCatalogCheckpointResetReceiptsFromPacketEscrow(
        "apply"
      );
    assert.equal(repeated.recoveredRecords, 0);
    assert.equal(repeated.duplicateRecords, 2);

    const payload = JSON.stringify({
      escrowed,
      sourceInventory,
      targetInventory,
      dryRun,
      apply,
      repeated,
    });
    for (const forbidden of [
      sourceHarness.root,
      targetHarness.root,
      sourceHarness.sourceKey,
      targetHarness.sourceKey,
      oldSigningKey,
      newSigningKey,
    ]) {
      assert.equal(payload.includes(forbidden), false, forbidden);
    }
  } finally {
    sourceHarness.cleanup();
    targetHarness.cleanup();
  }
});

test("receipt catalog checkpoint reset receipt packet escrow lifecycle honors legal hold and bounded retention", async () => {
  const signingKey = "receipt-catalog-reset-packet-lifecycle-key-0001";
  let nowMs = Date.parse("2026-07-15T10:50:00.000Z");
  const testHarness = harness({
    manifestSigningKey: signingKey,
    receiptCatalogCheckpointResetReceiptPacketEscrowMaxRecords: "1",
    receiptCatalogCheckpointResetReceiptPacketEscrowRetentionMs: String(24 * 60 * 60_000),
    receiptCatalogCheckpointResetReceiptPacketEscrowLegalHold: "true",
    now: () => new Date(nowMs),
  });
  try {
    for (let index = 0; index < 3; index += 1) {
      const reset = await testHarness.service.resetReceiptCatalogCheckpoints("apply");
      assert.equal(reset.receipt.recorded, true);
      const escrow =
        await testHarness.service.escrowReceiptCatalogCheckpointResetReceiptPacket();
      assert.equal(escrow.escrowed, true);
      assert.equal(escrow.signed, true);
      nowMs += 1_000;
    }
    nowMs += 1_000;

    const pressureDiagnostics = await testHarness.service.diagnostics();
    assert.equal(
      pressureDiagnostics.receiptCatalogCheckpointResetReceiptPacketEscrow.packets,
      3
    );
    assert.equal(
      pressureDiagnostics.receiptCatalogCheckpointResetReceiptPacketEscrow.eligiblePackets,
      2
    );
    assert.equal(
      pressureDiagnostics.receiptCatalogCheckpointResetReceiptPacketEscrow.blockedByLegalHold,
      2
    );
    assert.equal(
      pressureDiagnostics.receiptCatalogCheckpointResetReceiptPacketEscrow.policy.legalHold,
      true
    );
    assert.equal(
      pressureDiagnostics.receiptCatalogCheckpointResetReceiptPacketEscrow.pressureDetected,
      true
    );

    const holdDryRun =
      await testHarness.service.receiptCatalogCheckpointResetReceiptPacketEscrowLifecycle(
        "dry_run"
      );
    assert.equal(holdDryRun.policy.legalHold, true);
    assert.equal(holdDryRun.policy.maxRecords, 1);
    assert.equal(holdDryRun.totalPackets, 3);
    assert.equal(holdDryRun.eligiblePackets, 2);
    assert.equal(holdDryRun.deletedPackets, 0);
    assert.equal(holdDryRun.blockedByLegalHold, 2);
    assert.equal(holdDryRun.retainedPackets, 3);
    assert.equal(holdDryRun.dryRun, true);
    assert.equal(holdDryRun.applied, false);
    assert.match(String(holdDryRun.latest?.packetDigest), /^[a-f0-9]{64}$/);
    assert.equal(holdDryRun.latest?.recordCount, 3);

    const holdApply =
      await testHarness.service.receiptCatalogCheckpointResetReceiptPacketEscrowLifecycle(
        "apply"
      );
    assert.equal(holdApply.policy.legalHold, true);
    assert.equal(holdApply.eligiblePackets, 2);
    assert.equal(holdApply.deletedPackets, 0);
    assert.equal(holdApply.blockedByLegalHold, 2);
    assert.equal(holdApply.retainedPackets, 3);
    assert.equal(holdApply.applied, false);

    const unlockedService = new MediaPipelineService({
      runtime: testHarness.runtime,
      config: readMediaPipelineConfig(testHarness.runtime.config, {
        CODELIVER_MEDIA_PIPELINE_MANIFEST_SIGNING_KEY: signingKey,
        CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CHECKPOINT_RESET_RECEIPT_PACKET_ESCROW_MAX_RECORDS:
          "1",
        CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CHECKPOINT_RESET_RECEIPT_PACKET_ESCROW_RETENTION_MS:
          String(24 * 60 * 60_000),
      }),
      store: testHarness.store,
      processor: testHarness.processor,
      repository: testHarness.repository,
      metrics: { emit() {} },
      now: () => new Date(nowMs),
    });

    const unlockedDryRun =
      await unlockedService.receiptCatalogCheckpointResetReceiptPacketEscrowLifecycle(
        "dry_run"
      );
    assert.equal(unlockedDryRun.policy.legalHold, false);
    assert.equal(unlockedDryRun.eligiblePackets, 2);
    assert.equal(unlockedDryRun.deletedPackets, 0);
    assert.equal(unlockedDryRun.retainedPackets, 3);
    assert.equal(unlockedDryRun.applied, false);

    const unlockedApply =
      await unlockedService.receiptCatalogCheckpointResetReceiptPacketEscrowLifecycle(
        "apply"
      );
    assert.equal(unlockedApply.policy.legalHold, false);
    assert.equal(unlockedApply.eligiblePackets, 2);
    assert.equal(unlockedApply.deletedPackets, 2);
    assert.equal(unlockedApply.retainedPackets, 1);
    assert.equal(unlockedApply.blockedByLegalHold, 0);
    assert.equal(unlockedApply.applied, true);

    const finalInventory =
      await testHarness.store.receiptCatalogCheckpointResetReceiptPacketInventory();
    assert.equal(finalInventory.records.length, 1);
    assert.equal(finalInventory.latest?.packetDigest, unlockedApply.latest?.packetDigest);
    assert.equal(finalInventory.latest?.recordCount, 3);
    const finalDiagnostics = await unlockedService.diagnostics();
    assert.equal(
      finalDiagnostics.receiptCatalogCheckpointResetReceiptPacketEscrow.packets,
      1
    );
    assert.equal(
      finalDiagnostics.receiptCatalogCheckpointResetReceiptPacketEscrow.eligiblePackets,
      0
    );
    assert.equal(
      finalDiagnostics.receiptCatalogCheckpointResetReceiptPacketEscrow.pressureDetected,
      false
    );

    const payload = JSON.stringify({
      pressureDiagnostics,
      holdDryRun,
      holdApply,
      unlockedDryRun,
      unlockedApply,
      finalDiagnostics,
    });
    for (const forbidden of [testHarness.root, signingKey]) {
      assert.equal(payload.includes(forbidden), false, forbidden);
    }
  } finally {
    testHarness.cleanup();
  }
});

test("receipt catalog checkpoint reset receipt packet escrow quarantine isolates corrupt packets", async () => {
  const signingKey = "receipt-catalog-reset-packet-quarantine-key-0001";
  let nowMs = Date.parse("2026-07-15T11:00:00.000Z");
  const testHarness = harness({
    manifestSigningKey: signingKey,
    receiptCatalogCheckpointResetReceiptPacketQuarantineMaxRecords: "1",
    receiptCatalogCheckpointResetReceiptPacketQuarantineRetentionMs: String(
      365 * 24 * 60 * 60_000
    ),
    receiptCatalogCheckpointResetReceiptPacketQuarantineLegalHold: "true",
    now: () => new Date(nowMs),
  });
  try {
    for (let index = 0; index < 2; index += 1) {
      const reset = await testHarness.service.resetReceiptCatalogCheckpoints("apply");
      assert.equal(reset.receipt.recorded, true);
      const escrow =
        await testHarness.service.escrowReceiptCatalogCheckpointResetReceiptPacket();
      assert.equal(escrow.escrowed, true);
      nowMs += 1_000;
    }

    const packetDir = join(
      testHarness.root,
      ".codeliver-ingest/control/media-pipeline/receipt-catalog-checkpoint-reset-receipt-packets"
    );
    const packetFiles = readdirSync(packetDir)
      .filter((name) => name.endsWith(".json"))
      .sort();
    assert.equal(packetFiles.length, 2);
    const tamperedPacketFile = packetFiles[0];
    const tamperedPacketPath = join(packetDir, tamperedPacketFile);
    const tamperedPacketRecord = JSON.parse(
      readFileSync(tamperedPacketPath, "utf8")
    ) as { packetDigest: string; packet: { source: { recordCount: number } } };
    tamperedPacketRecord.packetDigest = "0".repeat(64);
    tamperedPacketRecord.packet.source.recordCount = 99;
    writeFileSync(tamperedPacketPath, JSON.stringify(tamperedPacketRecord, null, 2));
    const malformedPacketFile = "corrupt-reset-packet-record.json";
    writeFileSync(join(packetDir, malformedPacketFile), "{not-json");

    const pressureDiagnostics = await testHarness.service.diagnostics();
    assert.equal(
      pressureDiagnostics.receiptCatalogCheckpointResetReceiptPacketEscrow.packets,
      2
    );
    assert.equal(
      pressureDiagnostics.receiptCatalogCheckpointResetReceiptPacketEscrow.invalidRecords,
      1
    );
    assert.equal(
      pressureDiagnostics.receiptCatalogCheckpointResetReceiptPacketEscrow.invalidIntegrityPackets,
      1
    );
    assert.equal(
      pressureDiagnostics.receiptCatalogCheckpointResetReceiptPacketEscrow.payloadMismatchPackets,
      1
    );
    assert.equal(
      pressureDiagnostics.receiptCatalogCheckpointResetReceiptPacketEscrow.pressureDetected,
      true
    );

    const dryRun =
      await testHarness.service.quarantineReceiptCatalogCheckpointResetReceiptPacketEscrow(
        "dry_run"
      );
    assert.equal(dryRun.mode, "dry_run");
    assert.equal(dryRun.scannedPackets, 2);
    assert.equal(dryRun.invalidRecords, 1);
    assert.equal(dryRun.invalidIntegrityPackets, 1);
    assert.equal(dryRun.payloadMismatchPackets, 1);
    assert.equal(dryRun.quarantineCandidates, 2);
    assert.equal(dryRun.quarantinedPackets, 0);
    assert.equal(dryRun.retainedPackets, 3);
    assert.equal(dryRun.dryRun, true);
    assert.equal(dryRun.applied, false);
    assert.equal(
      readdirSync(packetDir).filter((name) => name.endsWith(".json")).length,
      3
    );

    const apply =
      await testHarness.service.quarantineReceiptCatalogCheckpointResetReceiptPacketEscrow(
        "apply"
      );
    assert.equal(apply.mode, "apply");
    assert.equal(apply.quarantineCandidates, 2);
    assert.equal(apply.quarantinedPackets, 2);
    assert.equal(apply.retainedPackets, 1);
    assert.equal(apply.applied, true);

    const quarantineDir = join(
      testHarness.root,
      ".codeliver-ingest/control/media-pipeline/receipt-catalog-checkpoint-reset-receipt-packet-quarantine"
    );
    assert.equal(readdirSync(packetDir).filter((name) => name.endsWith(".json")).length, 1);
    assert.equal(
      readdirSync(quarantineDir).filter((name) => name.endsWith(".json")).length,
      2
    );
    const quarantineInventory =
      await testHarness.service.receiptCatalogCheckpointResetReceiptPacketQuarantineInventory();
    assert.equal(quarantineInventory.quarantinedPackets, 2);
    assert.equal(quarantineInventory.invalidRecords, 0);
    assert.equal(quarantineInventory.malformedRecordQuarantines, 1);
    assert.equal(quarantineInventory.payloadMismatchQuarantines, 1);
    assert.equal(quarantineInventory.oldestQuarantineAgeMs !== null, true);

    const quarantineHoldDryRun =
      await testHarness.service.receiptCatalogCheckpointResetReceiptPacketQuarantineLifecycle(
        "dry_run"
      );
    assert.equal(quarantineHoldDryRun.policy.legalHold, true);
    assert.equal(quarantineHoldDryRun.policy.maxRecords, 1);
    assert.equal(quarantineHoldDryRun.policy.manualReviewRequired, true);
    assert.equal(quarantineHoldDryRun.totalQuarantinedPackets, 2);
    assert.equal(quarantineHoldDryRun.eligiblePackets, 1);
    assert.equal(quarantineHoldDryRun.blockedByLegalHold, 1);
    assert.equal(quarantineHoldDryRun.deletedPackets, 0);
    assert.equal(quarantineHoldDryRun.retainedPackets, 2);

    const quarantineHoldApply =
      await testHarness.service.receiptCatalogCheckpointResetReceiptPacketQuarantineLifecycle(
        "apply"
      );
    assert.equal(quarantineHoldApply.policy.legalHold, true);
    assert.equal(quarantineHoldApply.eligiblePackets, 1);
    assert.equal(quarantineHoldApply.deletedPackets, 0);
    assert.equal(quarantineHoldApply.retainedPackets, 2);

    const unlockedService = new MediaPipelineService({
      runtime: testHarness.runtime,
      config: readMediaPipelineConfig(testHarness.runtime.config, {
        CODELIVER_MEDIA_PIPELINE_MANIFEST_SIGNING_KEY: signingKey,
        CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CHECKPOINT_RESET_RECEIPT_PACKET_QUARANTINE_MAX_RECORDS:
          "1",
        CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CHECKPOINT_RESET_RECEIPT_PACKET_QUARANTINE_RETENTION_MS:
          String(365 * 24 * 60 * 60_000),
      }),
      store: testHarness.store,
      processor: testHarness.processor,
      repository: testHarness.repository,
      metrics: { emit() {} },
      now: () => new Date(nowMs),
    });
    const quarantineUnlockedApply =
      await unlockedService.receiptCatalogCheckpointResetReceiptPacketQuarantineLifecycle(
        "apply"
      );
    assert.equal(quarantineUnlockedApply.policy.legalHold, false);
    assert.equal(quarantineUnlockedApply.eligiblePackets, 1);
    assert.equal(quarantineUnlockedApply.deletedPackets, 1);
    assert.equal(quarantineUnlockedApply.retainedPackets, 1);
    assert.equal(
      readdirSync(quarantineDir).filter((name) => name.endsWith(".json")).length,
      1
    );

    const finalDiagnostics = await unlockedService.diagnostics();
    assert.equal(
      finalDiagnostics.receiptCatalogCheckpointResetReceiptPacketEscrow.packets,
      1
    );
    assert.equal(
      finalDiagnostics.receiptCatalogCheckpointResetReceiptPacketEscrow.invalidRecords,
      0
    );
    assert.equal(
      finalDiagnostics.receiptCatalogCheckpointResetReceiptPacketEscrow.invalidIntegrityPackets,
      0
    );
    assert.equal(
      finalDiagnostics.receiptCatalogCheckpointResetReceiptPacketEscrow.payloadMismatchPackets,
      0
    );
    assert.equal(
      finalDiagnostics.receiptCatalogCheckpointResetReceiptPacketEscrow.pressureDetected,
      false
    );
    assert.equal(
      finalDiagnostics.receiptCatalogCheckpointResetReceiptPacketQuarantine.quarantinedPackets,
      1
    );
    assert.equal(
      finalDiagnostics.receiptCatalogCheckpointResetReceiptPacketQuarantine.eligiblePackets,
      0
    );
    assert.equal(
      finalDiagnostics.receiptCatalogCheckpointResetReceiptPacketQuarantine.pressureDetected,
      true
    );

    const recovery =
      await testHarness.service.recoverReceiptCatalogCheckpointResetReceiptsFromPacketEscrow(
        "dry_run"
      );
    assert.equal(recovery.packetsScanned, 1);
    assert.equal(recovery.validPackets, 1);
    assert.equal(recovery.invalidPackets, 0);

    const payload = JSON.stringify({
      pressureDiagnostics,
      dryRun,
      apply,
      quarantineInventory,
      quarantineHoldDryRun,
      quarantineHoldApply,
      quarantineUnlockedApply,
      finalDiagnostics,
      recovery,
    });
    for (const forbidden of [testHarness.root, signingKey, tamperedPacketFile]) {
      assert.equal(payload.includes(forbidden), false, forbidden);
    }
  } finally {
    testHarness.cleanup();
  }
});

test("provider catalog continuation tokens resume without leaking raw cursors", async () => {
  const manifestSigningKey = "provider-catalog-token-signing-key-0001";
  const cursorTokenKey = "provider-catalog-token-encryption-key-0001";
  const rotatedCursorTokenKey = "provider-catalog-token-encryption-key-0002";
  const wrongRetiredCursorTokenKey = "provider-catalog-token-encryption-key-wrong";
  let nowMs = Date.parse("2026-07-15T04:00:00.000Z");
  const testHarness = harness({
    manifestSigningKey,
    receiptCatalogCursorTokenKey: cursorTokenKey,
    receiptCatalogCursorTokenTtlMs: String(60 * 60_000),
    sourceReceipt: true,
    now: () => new Date(nowMs),
  });
  try {
    const job = await testHarness.service.enqueue(testHarness.input);
    const result = await testHarness.service.runJob(job.id);
    assert.equal(result.outcome, "published");
    const firstReceipt = await testHarness.service.persistRestoreAttestationReceipt(
      testHarness.input.versionId
    );
    nowMs += 1_000;
    const secondReceipt = await testHarness.service.persistRestoreAttestationReceipt(
      testHarness.input.versionId
    );
    const inventory = await testHarness.store.restoreReceiptInventory();
    const [firstReference, secondReference] = inventory.references;
    assert.ok(firstReceipt.persisted);
    assert.ok(secondReceipt.persisted);

    rmSync(
      join(testHarness.root, ".codeliver-ingest/control/media-pipeline/restore-receipts"),
      { recursive: true, force: true }
    );

    const buildRuntime = (
      provider: "object-store" | "drive" = "object-store",
      keyOptions: {
        cursorTokenKey?: string;
        cursorTokenVerificationKeys?: string;
      } = {}
    ) => {
      const remoteConfig = {
        ...testHarness.runtime.config,
        provider,
        providerWasExplicit: true,
        filesystemRoot: null,
      };
      const calls: Array<{ cursor: string | null; limit: number }> = [];
      const runtime = {
        config: remoteConfig,
        adapter: remoteAdapterProxy(testHarness.runtime.adapter, {
          kind: provider,
          label: "Object store catalog fixture",
          external: true,
          listMediaPipelineReceiptObjects: async (input: {
            kind: string;
            limit: number;
            cursor?: string | null;
          }) => {
            assert.equal(input.kind, "restore_attestation");
            calls.push({ cursor: input.cursor ?? null, limit: input.limit });
            if (!input.cursor) {
              return {
                objects: [
                  {
                    objectKey: firstReference.objectKey,
                    size: firstReference.size,
                    sha256: firstReference.sha256,
                  },
                ],
                truncated: true,
                nextCursor: "provider-page-2",
              };
            }
            if (input.cursor === "provider-page-2") {
              return {
                objects: [
                  {
                    objectKey: secondReference.objectKey,
                    size: secondReference.size,
                    sha256: secondReference.sha256,
                  },
                ],
                truncated: false,
                nextCursor: null,
              };
            }
            throw new Error("unexpected cursor");
          },
        }),
      };
      const service = new MediaPipelineService({
        runtime,
        config: readMediaPipelineConfig(remoteConfig, {
          CODELIVER_MEDIA_PIPELINE_MANIFEST_SIGNING_KEY: manifestSigningKey,
          CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CURSOR_TOKEN_KEY:
            keyOptions.cursorTokenKey ?? cursorTokenKey,
          ...(keyOptions.cursorTokenVerificationKeys
            ? {
                CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CURSOR_TOKEN_VERIFICATION_KEYS:
                  keyOptions.cursorTokenVerificationKeys,
              }
            : {}),
          CODELIVER_MEDIA_PIPELINE_RECEIPT_CATALOG_CURSOR_TOKEN_TTL_MS: String(60 * 60_000),
          CODELIVER_MEDIA_PIPELINE_LIFECYCLE_INSPECTION_LIMIT: "1",
        }),
        store: testHarness.store,
        processor: testHarness.processor,
        repository: testHarness.repository,
        metrics: { emit() {} },
        now: () => new Date(nowMs),
      });
      return { service, calls };
    };

    const partial = buildRuntime();
    const blockedApply = await partial.service.repairRestoreReceiptIndex("apply");
    assert.equal(blockedApply.checkpointRequired, true);
    assert.match(String(blockedApply.nextCursorDigest), /^[a-f0-9]{64}$/);
    assert.match(String(blockedApply.continuationToken), /^codeliver_rcc_v1\./);
    assert.match(String(blockedApply.continuationTokenDigest), /^[a-f0-9]{64}$/);
    assert.match(String(blockedApply.continuationTokenKeyDigest), /^[a-f0-9]{32}$/);
    assert.equal(blockedApply.continuationTokenExpiresAt, "2026-07-15T05:00:01.000Z");
    assert.deepEqual(partial.calls, [{ cursor: null, limit: 1 }]);
    const issuedTokenKeyDigest = String(blockedApply.continuationToken).split(".")[1];
    assert.equal(blockedApply.continuationTokenKeyDigest, issuedTokenKeyDigest);
    const partialCheckpoint = await testHarness.store.receiptCatalogCheckpointInventory();
    assert.equal(partialCheckpoint.latest?.startedCursorDigest, null);
    assert.equal(
      partialCheckpoint.latest?.continuationTokenDigest,
      blockedApply.continuationTokenDigest
    );
    assert.equal(
      partialCheckpoint.latest?.continuationTokenKeyDigest,
      blockedApply.continuationTokenKeyDigest
    );
    assert.equal(
      partialCheckpoint.latest?.continuationTokenExpiresAt,
      blockedApply.continuationTokenExpiresAt
    );

    const wrongRetiredKey = buildRuntime("object-store", {
      cursorTokenKey: rotatedCursorTokenKey,
      cursorTokenVerificationKeys: wrongRetiredCursorTokenKey,
    });
    await assert.rejects(
      () =>
        wrongRetiredKey.service.repairRestoreReceiptIndex("dry_run", {
          continuationToken: blockedApply.continuationToken,
        }),
      (error) =>
        error instanceof MediaPipelineError &&
        error.code === "PIPELINE_RECEIPT_CATALOG_CURSOR_INVALID"
    );

    const resumed = buildRuntime("object-store", {
      cursorTokenKey: rotatedCursorTokenKey,
      cursorTokenVerificationKeys: cursorTokenKey,
    });
    const completedApply = await resumed.service.repairRestoreReceiptIndex("apply", {
      continuationToken: blockedApply.continuationToken,
    });
    assert.equal(completedApply.checkpointRequired, false);
    assert.equal(completedApply.nextCursorDigest, null);
    assert.equal(completedApply.continuationToken, null);
    assert.equal(completedApply.continuationTokenDigest, null);
    assert.equal(completedApply.continuationTokenKeyDigest, null);
    assert.equal(completedApply.continuationTokenExpiresAt, null);
    assert.equal(completedApply.pagesScanned, 2);
    assert.equal(completedApply.discoveredReceipts, 1);
    assert.equal(completedApply.repairedReceipts, 1);
    assert.equal(completedApply.applied, true);
    assert.deepEqual(resumed.calls, [{ cursor: "provider-page-2", limit: 1 }]);

    const checkpoint = await testHarness.store.receiptCatalogCheckpointInventory();
    assert.equal(checkpoint.latest?.completed, true);
    assert.equal(checkpoint.latest?.pagesScanned, 2);
    assert.equal(checkpoint.latest?.startedCursorDigest, blockedApply.nextCursorDigest);
    assert.equal(checkpoint.latest?.nextCursorDigest, null);
    assert.equal(checkpoint.latest?.continuationTokenDigest, null);
    assert.equal(checkpoint.latest?.continuationTokenKeyDigest, null);
    assert.equal(checkpoint.latest?.continuationTokenExpiresAt, null);

    const wrongProvider = buildRuntime("drive");
    await assert.rejects(
      () =>
        wrongProvider.service.repairRestoreReceiptIndex("dry_run", {
          continuationToken: blockedApply.continuationToken,
        }),
      (error) =>
        error instanceof MediaPipelineError &&
        error.code === "PIPELINE_RECEIPT_CATALOG_CURSOR_INVALID"
    );
    nowMs += 61 * 60_000;
    await assert.rejects(
      () =>
        buildRuntime().service.repairRestoreReceiptIndex("dry_run", {
          continuationToken: blockedApply.continuationToken,
        }),
      (error) =>
        error instanceof MediaPipelineError &&
        error.code === "PIPELINE_RECEIPT_CATALOG_CURSOR_INVALID"
    );

    const payload = JSON.stringify({
      blockedApply,
      completedApply,
      partialCheckpoint,
      checkpoint,
    });
    for (const forbidden of [
      job.id,
      testHarness.input.versionId,
      testHarness.input.projectId,
      testHarness.sourceKey,
      result.job!.artifacts!.pipelineManifest.objectKey,
      firstReference.objectKey,
      secondReference.objectKey,
      "provider-page-2",
      testHarness.root,
      manifestSigningKey,
      cursorTokenKey,
      rotatedCursorTokenKey,
      wrongRetiredCursorTokenKey,
    ]) {
      assert.equal(payload.includes(forbidden), false, forbidden);
    }
  } finally {
    testHarness.cleanup();
  }
});

test("encryption key policy fails closed and redacts key versions from diagnostics", async () => {
  const currentKey = "kms/customer-a/v1";
  const requiredKey = "kms/customer-a/v2";
  const testHarness = harness({
    now: () => new Date("2026-07-15T00:00:00.000Z"),
    encryptionKeyVersion: currentKey,
    requiredEncryptionKeyVersion: requiredKey,
    keyRotationDueAt: "2026-07-14T00:00:00.000Z",
    blockOnOverdueKeyRotation: "1",
  });
  try {
    await assert.rejects(
      () => testHarness.service.enqueue(testHarness.input),
      (error) =>
        error instanceof MediaPipelineError &&
        error.code === "PIPELINE_ENCRYPTION_POLICY_BLOCKED" &&
        error.retryable === true
    );

    const diagnostics = await testHarness.service.diagnostics();
    assert.equal(diagnostics.encryption.ready, false);
    assert.equal(diagnostics.encryption.keyVersionPresent, true);
    assert.match(String(diagnostics.encryption.keyVersionDigest), /^[a-f0-9]{64}$/);
    assert.match(String(diagnostics.encryption.requiredKeyVersionDigest), /^[a-f0-9]{64}$/);
    assert.notEqual(
      diagnostics.encryption.keyVersionDigest,
      diagnostics.encryption.requiredKeyVersionDigest
    );
    assert.equal(diagnostics.encryption.requiredKeyVersionSatisfied, false);
    assert.equal(diagnostics.encryption.keyRotationDueAt, "2026-07-14T00:00:00.000Z");
    assert.equal(diagnostics.encryption.keyRotationOverdue, true);
    assert.equal(diagnostics.encryption.blockOnOverdueKeyRotation, true);
    assert.equal(diagnostics.pressure.encryptionReady, false);
    assert.equal(diagnostics.limits.keyRotationDueAt, "2026-07-14T00:00:00.000Z");
    assert.equal(diagnostics.limits.blockOnOverdueKeyRotation, true);

    const payload = JSON.stringify(diagnostics);
    for (const forbidden of [
      currentKey,
      requiredKey,
      testHarness.input.assetId,
      testHarness.input.projectId,
      testHarness.input.versionId,
      testHarness.input.source.objectKey,
      testHarness.input.source.filename,
      testHarness.root,
    ]) {
      assert.equal(payload.includes(forbidden), false, forbidden);
    }
  } finally {
    testHarness.cleanup();
  }
});

test("storage placement policy fails closed and reports redacted readiness pressure", async () => {
  const testHarness = harness({
    requiredStorageCapabilities: "legal-hold,signed-delivery",
    requiredResidency: "us-central1",
  });
  try {
    await assert.rejects(
      () => testHarness.service.enqueue(testHarness.input),
      (error) =>
        error instanceof MediaPipelineError &&
        error.code === "PIPELINE_STORAGE_POLICY_BLOCKED" &&
        error.retryable === true
    );

    const diagnostics = await testHarness.service.diagnostics();
    assert.equal(diagnostics.policy.ready, false);
    assert.equal(diagnostics.pressure.policyReady, false);
    assert.equal(diagnostics.policy.egressPolicy, "allow-external");
    assert.equal(diagnostics.policy.externalProvider, false);
    assert.equal(diagnostics.policy.externalEgressAllowed, true);
    assert.deepEqual(diagnostics.policy.requiredCapabilities, [
      "legal-hold",
      "signed-delivery",
    ]);
    assert.deepEqual(diagnostics.policy.missingCapabilities, [
      "legal-hold",
      "signed-delivery",
    ]);
    assert.equal(diagnostics.policy.requiredResidency, "us-central1");
    assert.equal(diagnostics.policy.residencyVerification, "unverified");
    assert.equal(diagnostics.limits.requiredResidency, "us-central1");

    const payload = JSON.stringify(diagnostics);
    for (const forbidden of [
      testHarness.input.assetId,
      testHarness.input.projectId,
      testHarness.input.versionId,
      testHarness.input.source.objectKey,
      testHarness.input.source.filename,
      testHarness.root,
    ]) {
      assert.equal(payload.includes(forbidden), false, forbidden);
    }
  } finally {
    testHarness.cleanup();
  }
});

test("pipeline reconciles a derivative whose provider commit response was lost", async () => {
  const testHarness = harness();
  try {
    const adapter = testHarness.runtime.adapter;
    const commit = adapter.commitMultipart.bind(adapter);
    let responseLost = false;
    adapter.commitMultipart = async (input) => {
      const receipt = await commit(input);
      if (!responseLost) {
        responseLost = true;
        const failure = new Error("simulated provider response loss") as NodeJS.ErrnoException;
        failure.code = "ECONNRESET";
        throw failure;
      }
      return receipt;
    };

    const job = await testHarness.service.enqueue(testHarness.input);
    const result = await testHarness.service.runJob(job.id);
    assert.equal(responseLost, true);
    assert.equal(result.outcome, "published");
    assert.equal(result.job?.status, "published");
    assert.ok(result.job?.artifacts?.hls.playlist.providerVersionId);
  } finally {
    testHarness.cleanup();
  }
});

test("concurrent idempotent enqueue exposes only one eligible queue job", async () => {
  const testHarness = harness();
  try {
    const jobs = await Promise.all(
      Array.from({ length: 20 }, () => testHarness.store.createOrGet(testHarness.input, 3))
    );
    const ids = new Set(jobs.map((job) => job.id));
    assert.equal(ids.size, 1);

    const eligible = await testHarness.store.listEligible();
    assert.deepEqual(
      eligible.map((job) => job.id),
      [jobs[0]!.id]
    );
  } finally {
    testHarness.cleanup();
  }
});

test("project admission quota blocks new work but permits idempotent replay", async () => {
  const testHarness = harness({ maxActiveJobsPerProject: "1" });
  const nextInput = {
    ...testHarness.input,
    versionId: "277139fe-bffd-4f2b-8ff3-8c4be1e70861",
    source: {
      ...testHarness.input.source,
      filename: "fixture-v2.mp4",
    },
  };

  try {
    const first = await testHarness.service.enqueue(testHarness.input);
    const replay = await testHarness.service.enqueue(testHarness.input);
    assert.equal(replay.id, first.id);

    await assert.rejects(
      () => testHarness.service.enqueue(nextInput),
      (error) =>
        error instanceof MediaPipelineError &&
        error.code === "PIPELINE_BACKPRESSURE" &&
        error.retryable === true
    );

    const diagnostics = await testHarness.service.diagnostics();
    assert.equal(diagnostics.limits.maxActiveJobsPerProject, 1);
    assert.equal(diagnostics.quota.maxActiveJobsPerProject, 1);
    assert.equal(diagnostics.quota.projectsOverJobQuota, 1);
    assert.equal(diagnostics.quota.largestProjectActiveJobs, 1);
    assert.equal(diagnostics.totalJobs, 1);
    assert.equal(JSON.stringify(diagnostics).includes(testHarness.input.projectId), false);
  } finally {
    testHarness.cleanup();
  }
});

test("project byte quota requires authoritative source size and blocks over-budget enqueue", async () => {
  const testHarness = harness({ maxActiveBytesPerProject: String(fixtureSourceBytes) });
  const sizedInput = {
    ...testHarness.input,
    versionId: "277139fe-bffd-4f2b-8ff3-8c4be1e70861",
    source: {
      ...testHarness.input.source,
      filename: "fixture-v2.mp4",
    },
  };
  const unknownSizeInput = {
    ...testHarness.input,
    versionId: "377139fe-bffd-4f2b-8ff3-8c4be1e70861",
    source: {
      ...testHarness.input.source,
      expectedSize: null,
      filename: "fixture-v3.mp4",
    },
  };

  try {
    await testHarness.service.enqueue(testHarness.input);

    await assert.rejects(
      () => testHarness.service.enqueue(sizedInput),
      (error) =>
        error instanceof MediaPipelineError &&
        error.code === "PIPELINE_BACKPRESSURE" &&
        error.retryable === true
    );
    await assert.rejects(
      () => testHarness.service.enqueue(unknownSizeInput),
      (error) =>
        error instanceof MediaPipelineError &&
        error.code === "PIPELINE_BACKPRESSURE" &&
        error.retryable === true
    );

    const diagnostics = await testHarness.service.diagnostics();
    assert.equal(diagnostics.limits.maxActiveBytesPerProject, testHarness.source.length);
    assert.equal(diagnostics.quota.maxActiveBytesPerProject, String(testHarness.source.length));
    assert.equal(diagnostics.quota.projectsOverByteQuota, 1);
    assert.equal(diagnostics.quota.largestProjectActiveBytes, String(testHarness.source.length));
    assert.equal(diagnostics.totalJobs, 1);
  } finally {
    testHarness.cleanup();
  }
});

test("worker diagnostics summarize queue pressure without leaking identifiers", async () => {
  let clock = new Date("2026-07-15T00:00:00.000Z");
  const testHarness = harness({ now: () => clock });
  const inputFor = (versionId: string) => ({
    ...testHarness.input,
    versionId,
    source: {
      ...testHarness.input.source,
      filename: `${versionId}.mp4`,
    },
  });

  try {
    const cancelled = await testHarness.store.createOrGet(
      inputFor("177139fe-bffd-4f2b-8ff3-8c4be1e70861"),
      3
    );
    await testHarness.store.requestCancellation(cancelled.id);

    const running = await testHarness.store.createOrGet(
      inputFor("277139fe-bffd-4f2b-8ff3-8c4be1e70861"),
      3
    );
    const lease = await testHarness.store.acquireJobLease(running.id, 1);
    assert.ok(lease);
    clock = new Date(clock.getTime() + 2);

    const retrying = await testHarness.store.createOrGet(
      inputFor("377139fe-bffd-4f2b-8ff3-8c4be1e70861"),
      3
    );
    await testHarness.store.markRetry(
      retrying.id,
      {
        code: "PIPELINE_TIMEOUT",
        message: "transient timeout",
        retryable: true,
        at: clock.toISOString(),
      },
      new Date(clock.getTime() + 60_000)
    );

    const queued = await testHarness.store.createOrGet(
      inputFor("477139fe-bffd-4f2b-8ff3-8c4be1e70861"),
      3
    );

    const diagnostics = await testHarness.service.diagnostics();
    assert.equal(diagnostics.totalJobs, 4);
    assert.equal(diagnostics.statusCounts.queued, 2);
    assert.equal(diagnostics.statusCounts.running, 1);
    assert.equal(diagnostics.statusCounts.retry_wait, 1);
    assert.equal(diagnostics.cancellationRequestedJobs, 1);
    assert.equal(diagnostics.staleRunningJobs, 1);
    assert.equal(diagnostics.retryDeferredJobs, 1);
    assert.equal(diagnostics.eligibleJobs, 2);
    assert.equal(diagnostics.pressure.workerSlotsUsed, 1);
    assert.equal(diagnostics.pressure.eligibleOverCapacity, 1);
    assert.equal(diagnostics.storage.readyForWrites, true);

    const payload = JSON.stringify(diagnostics);
    for (const forbidden of [
      cancelled.id,
      running.id,
      retrying.id,
      queued.id,
      testHarness.input.assetId,
      testHarness.input.projectId,
      testHarness.input.versionId,
      testHarness.input.source.filename,
    ]) {
      assert.equal(payload.includes(forbidden), false, forbidden);
    }

    await lease.release();
  } finally {
    testHarness.cleanup();
  }
});

test("worker diagnostics expose source receipt migration pressure without leaking identifiers", async () => {
  const testHarness = harness({ sourceReceipt: true });
  const writeSource = (objectKey: string, content: string) => {
    const path = join(testHarness.root, objectKey);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    return {
      size: Buffer.byteLength(content),
      sha256: createHash("sha256").update(content).digest("hex"),
    };
  };
  const inputFor = (
    versionId: string,
    objectKey: string,
    content: string,
    receipt: "valid" | "missing" | "provider_mismatch" | "checksum_mismatch"
  ) => {
    const actual = writeSource(objectKey, content);
    const receiptSha =
      receipt === "checksum_mismatch"
        ? createHash("sha256").update("different-content").digest("hex")
        : actual.sha256;
    return {
      ...testHarness.input,
      versionId,
      source: {
        objectKey,
        filename: `${versionId}.mp4`,
        versionNumber: 1,
        expectedSize: actual.size,
        expectedSha256: receipt === "missing" ? actual.sha256 : receiptSha,
        receipt:
          receipt === "missing"
            ? null
            : {
                provider: receipt === "provider_mismatch" ? "google-drive" : "local",
                objectKey,
                size: actual.size,
                sha256: receiptSha,
                providerVersionId: `${versionId}-receipt`,
                committedAt: "2026-07-15T00:00:00.000Z",
              },
      },
    };
  };

  try {
    await testHarness.store.createOrGet(testHarness.input, 3);
    const missing = await testHarness.store.createOrGet(
      inputFor("277139fe-bffd-4f2b-8ff3-8c4be1e70861", "sources/missing.mp4", "missing", "missing"),
      3
    );
    const mismatchedProvider = await testHarness.store.createOrGet(
      inputFor("377139fe-bffd-4f2b-8ff3-8c4be1e70861", "sources/provider.mp4", "provider", "provider_mismatch"),
      3
    );
    const drifted = await testHarness.store.createOrGet(
      inputFor("477139fe-bffd-4f2b-8ff3-8c4be1e70861", "sources/drift.mp4", "drift", "checksum_mismatch"),
      3
    );

    const diagnostics = await testHarness.service.diagnostics();
    assert.equal(diagnostics.sourceReceipts.totalJobs, 4);
    assert.equal(diagnostics.sourceReceipts.jobsWithReceipt, 3);
    assert.equal(diagnostics.sourceReceipts.jobsMissingReceipt, 1);
    assert.equal(diagnostics.sourceReceipts.activeJobsMissingReceipt, 1);
    assert.equal(diagnostics.sourceReceipts.inspectedReceipts, 3);
    assert.equal(diagnostics.sourceReceipts.providerMismatchReceipts, 1);
    assert.equal(diagnostics.sourceReceipts.missingStoredObjects, 0);
    assert.equal(diagnostics.sourceReceipts.checksumMismatchReceipts, 1);
    assert.equal(diagnostics.sourceReceipts.migrationReady, false);

    const payload = JSON.stringify(diagnostics);
    for (const forbidden of [
      missing.id,
      mismatchedProvider.id,
      drifted.id,
      testHarness.input.assetId,
      testHarness.input.projectId,
      testHarness.input.versionId,
      testHarness.input.source.objectKey,
      "sources/missing.mp4",
      "sources/provider.mp4",
      "sources/drift.mp4",
      "missing.mp4",
      "provider.mp4",
      "drift.mp4",
      testHarness.root,
    ]) {
      assert.equal(payload.includes(forbidden), false, forbidden);
    }
  } finally {
    testHarness.cleanup();
  }
});

test("worker diagnostics expose lifecycle pressure without leaking artifact identities", async () => {
  let clock = new Date("2026-07-15T00:00:00.000Z");
  const testHarness = harness({ now: () => clock });
  const inputFor = (versionId: string) => ({
    ...testHarness.input,
    versionId,
    source: {
      ...testHarness.input.source,
      filename: `${versionId}.mp4`,
    },
  });

  try {
    const terminalArtifacts = fixtureArtifacts(testHarness.root, "terminal");
    const recoverableArtifacts = fixtureArtifacts(testHarness.root, "recoverable");
    const publishedArtifacts = fixtureArtifacts(testHarness.root, "published");

    const terminal = await testHarness.store.createOrGet(
      inputFor("577139fe-bffd-4f2b-8ff3-8c4be1e70861"),
      3
    );
    await testHarness.store.setArtifacts(terminal.id, terminalArtifacts);
    clock = new Date(clock.getTime() + 1_000);
    await testHarness.store.markCancelled(terminal.id);

    const recoverable = await testHarness.store.createOrGet(
      inputFor("677139fe-bffd-4f2b-8ff3-8c4be1e70861"),
      3
    );
    await testHarness.store.setArtifacts(recoverable.id, recoverableArtifacts);
    await testHarness.store.markRetry(
      recoverable.id,
      {
        code: "PIPELINE_PUBLISH_FAILED",
        message: "publication retry",
        retryable: true,
        at: clock.toISOString(),
      },
      new Date(clock.getTime() + 60_000)
    );

    const published = await testHarness.store.createOrGet(
      inputFor("777139fe-bffd-4f2b-8ff3-8c4be1e70861"),
      3
    );
    await testHarness.store.setArtifacts(published.id, publishedArtifacts);
    await testHarness.store.markPublished(published.id);

    const diagnostics = await testHarness.service.diagnostics();
    assert.equal(diagnostics.lifecycle.deleteMode, "disabled");
    assert.equal(diagnostics.lifecycle.policy.manualAttestationRequired, true);
    assert.equal(diagnostics.lifecycle.terminalOrphanCandidateJobs, 1);
    assert.equal(diagnostics.lifecycle.recoverableArtifactJobs, 1);
    assert.equal(diagnostics.lifecycle.publishedArtifactJobs, 1);
    assert.equal(diagnostics.lifecycle.terminalOrphanArtifactReferences, 7);
    assert.equal(diagnostics.lifecycle.recoverableArtifactReferences, 7);
    assert.equal(diagnostics.lifecycle.publishedArtifactReferences, 7);
    assert.equal(diagnostics.lifecycle.inspectedArtifactReferences, 21);
    assert.equal(diagnostics.lifecycle.missingArtifactReferences, 0);
    assert.equal(diagnostics.lifecycle.checksumMismatchReferences, 0);
    assert.equal(diagnostics.lifecycle.terminalOrphanBytes, String(artifactBytes(terminalArtifacts)));
    assert.ok(diagnostics.lifecycle.oldestTerminalOrphanCandidateAgeMs !== null);

    const payload = JSON.stringify(diagnostics);
    for (const forbidden of [
      terminal.id,
      recoverable.id,
      published.id,
      terminalArtifacts.hls.playlist.objectKey,
      recoverableArtifacts.hls.playlist.objectKey,
      publishedArtifacts.hls.playlist.objectKey,
      testHarness.input.projectId,
    ]) {
      assert.equal(payload.includes(forbidden), false, forbidden);
    }
  } finally {
    testHarness.cleanup();
  }
});

test("worker diagnostics detect replay manifest semantic drift without leaking object keys", async () => {
  const testHarness = harness();
  const input = {
    ...testHarness.input,
    versionId: "b77139fe-bffd-4f2b-8ff3-8c4be1e70861",
    source: {
      ...testHarness.input.source,
      filename: "semantic-drift.mp4",
    },
  };

  try {
    const artifacts = fixtureArtifacts(testHarness.root, "semantic-drift");
    replacePipelineManifest(testHarness.root, artifacts, {
      schemaVersion: 1,
      type: "co_deliver_media_pipeline_manifest",
      pipelineVersion: "co-deliver-media-pipeline/v1",
      versionId: input.versionId,
      versionNumber: input.source.versionNumber,
      storageProvider: "local",
      pipelineConfigHash: "f".repeat(64),
      source: {
        size: testHarness.source.length,
        sha256: "0".repeat(64),
      },
      artifacts: {
        hls: {
          playlist: {
            objectKey: artifacts.hls.playlist.objectKey,
            sha256: artifacts.hls.playlist.sha256,
          },
          manifest: {
            objectKey: artifacts.hls.manifest.objectKey,
            sha256: artifacts.hls.manifest.sha256,
          },
          segments: artifacts.hls.segments.map((segment) => ({
            objectKey: segment.objectKey,
            sha256: segment.sha256,
          })),
        },
        thumbnail: null,
        waveform: {
          objectKey: artifacts.waveform.objectKey,
          sha256: artifacts.waveform.sha256,
        },
        captions: {
          content: {
            objectKey: artifacts.captions.content.objectKey,
            sha256: artifacts.captions.content.sha256,
          },
          manifest: {
            objectKey: artifacts.captions.manifest.objectKey,
            sha256: artifacts.captions.manifest.sha256,
          },
          status: artifacts.captions.status,
        },
      },
    });

    const job = await testHarness.store.createOrGet(input, 3);
    await testHarness.store.setIngested(job.id, {
      sha256: input.source.expectedSha256!,
      size: testHarness.source.length,
    });
    await testHarness.store.setArtifacts(job.id, artifacts);
    await testHarness.store.markPublished(job.id);

    const diagnostics = await testHarness.service.diagnostics();
    assert.equal(diagnostics.replay.publishedManifests, 1);
    assert.equal(diagnostics.replay.inspectedManifests, 1);
    assert.equal(diagnostics.replay.checksumMismatchManifests, 0);
    assert.equal(diagnostics.replay.invalidJsonManifests, 0);
    assert.equal(diagnostics.replay.semanticMismatchManifests, 1);
    assert.equal(diagnostics.replay.driftDetected, true);

    const payload = JSON.stringify(diagnostics);
    assert.equal(payload.includes(artifacts.pipelineManifest.objectKey), false);
    assert.equal(payload.includes(job.id), false);
    assert.equal(payload.includes(input.projectId), false);
  } finally {
    testHarness.cleanup();
  }
});

test("worker diagnostics detect replay manifest signature drift without leaking signing material", async () => {
  const manifestSigningKey = "manifest-signing-key-for-signature-drift-0001";
  const testHarness = harness({ manifestSigningKey, sourceReceipt: true });
  try {
    const job = await testHarness.service.enqueue(testHarness.input);
    const result = await testHarness.service.runJob(job.id);
    assert.equal(result.outcome, "published");
    const artifacts = result.job!.artifacts!;
    const manifestPath = join(testHarness.root, artifacts.pipelineManifest.objectKey);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      manifestIntegrity?: { signature?: string | null };
    };
    assert.match(String(manifest.manifestIntegrity?.signature), /^[a-f0-9]{64}$/);
    manifest.manifestIntegrity = {
      ...manifest.manifestIntegrity,
      signature: "0".repeat(64),
    };
    replacePipelineManifest(testHarness.root, artifacts, manifest);
    await testHarness.store.setArtifacts(result.job!.id, artifacts);

    const diagnostics = await testHarness.service.diagnostics();
    assert.equal(diagnostics.replay.publishedManifests, 1);
    assert.equal(diagnostics.replay.inspectedManifests, 1);
    assert.equal(diagnostics.replay.signedManifests, 0);
    assert.equal(diagnostics.replay.invalidSignatureManifests, 1);
    assert.equal(diagnostics.replay.integrityMismatchManifests, 0);
    assert.equal(diagnostics.replay.semanticMismatchManifests, 0);
    assert.equal(diagnostics.replay.driftDetected, true);
    assert.equal(diagnostics.limits.manifestSigningEnabled, true);
    assert.equal(diagnostics.limits.requireManifestSignature, false);

    const payload = JSON.stringify(diagnostics);
    assert.equal(payload.includes(manifestSigningKey), false);
    assert.equal(payload.includes(artifacts.pipelineManifest.objectKey), false);
    assert.equal(payload.includes(job.id), false);
    assert.equal(payload.includes(testHarness.input.projectId), false);
  } finally {
    testHarness.cleanup();
  }
});

test("worker diagnostics verify retired manifest signing keys after rotation", async () => {
  const oldSigningKey = "manifest-signing-key-before-rotation-0001";
  const newSigningKey = "manifest-signing-key-after-rotation-0001";
  const testHarness = harness({ manifestSigningKey: oldSigningKey, sourceReceipt: true });
  try {
    const job = await testHarness.service.enqueue(testHarness.input);
    const result = await testHarness.service.runJob(job.id);
    assert.equal(result.outcome, "published");

    const rotatedWithoutOldKey = new MediaPipelineService({
      runtime: testHarness.runtime,
      config: readMediaPipelineConfig(testHarness.runtime.config, {
        CODELIVER_MEDIA_PIPELINE_MANIFEST_SIGNING_KEY: newSigningKey,
      }),
      store: testHarness.store,
      processor: testHarness.processor,
      repository: testHarness.repository,
      metrics: { emit() {} },
    });
    const missingKeyDiagnostics = await rotatedWithoutOldKey.diagnostics();
    assert.equal(missingKeyDiagnostics.replay.signedManifests, 0);
    assert.equal(missingKeyDiagnostics.replay.invalidSignatureManifests, 1);
    assert.equal(missingKeyDiagnostics.replay.driftDetected, true);
    assert.equal(missingKeyDiagnostics.limits.manifestVerificationKeyCount, 1);

    const rotatedWithRetiredKey = new MediaPipelineService({
      runtime: testHarness.runtime,
      config: readMediaPipelineConfig(testHarness.runtime.config, {
        CODELIVER_MEDIA_PIPELINE_MANIFEST_SIGNING_KEY: newSigningKey,
        CODELIVER_MEDIA_PIPELINE_MANIFEST_VERIFICATION_KEYS: oldSigningKey,
      }),
      store: testHarness.store,
      processor: testHarness.processor,
      repository: testHarness.repository,
      metrics: { emit() {} },
    });
    const diagnostics = await rotatedWithRetiredKey.diagnostics();
    assert.equal(diagnostics.replay.publishedManifests, 1);
    assert.equal(diagnostics.replay.inspectedManifests, 1);
    assert.equal(diagnostics.replay.signedManifests, 1);
    assert.equal(diagnostics.replay.invalidSignatureManifests, 0);
    assert.equal(diagnostics.replay.unverifiedSignatureManifests, 0);
    assert.equal(diagnostics.replay.driftDetected, false);
    assert.equal(diagnostics.replay.signatureVerificationEnabled, true);
    assert.equal(diagnostics.limits.manifestSigningEnabled, true);
    assert.equal(diagnostics.limits.manifestVerificationKeyCount, 2);

    const payload = JSON.stringify(diagnostics);
    assert.equal(payload.includes(oldSigningKey), false);
    assert.equal(payload.includes(newSigningKey), false);
    assert.equal(payload.includes(job.id), false);
    assert.equal(payload.includes(testHarness.input.projectId), false);
  } finally {
    testHarness.cleanup();
  }
});

test("worker diagnostics surface SLO breaches without leaking job identifiers", async () => {
  let clock = new Date("2026-07-15T00:00:00.000Z");
  const testHarness = harness({
    now: () => clock,
    sloQueuedMs: "1000",
    sloEligibleMs: "1000",
    sloRunningMs: "1000",
    sloRetryReadyMs: "1000",
  });
  const inputFor = (versionId: string) => ({
    ...testHarness.input,
    versionId,
    source: {
      ...testHarness.input.source,
      filename: `${versionId}.mp4`,
    },
  });

  try {
    const queued = await testHarness.store.createOrGet(
      inputFor("877139fe-bffd-4f2b-8ff3-8c4be1e70861"),
      3
    );
    const running = await testHarness.store.createOrGet(
      inputFor("977139fe-bffd-4f2b-8ff3-8c4be1e70861"),
      3
    );
    const lease = await testHarness.store.acquireJobLease(running.id, 60_000);
    assert.ok(lease);
    const retryReady = await testHarness.store.createOrGet(
      inputFor("a77139fe-bffd-4f2b-8ff3-8c4be1e70861"),
      3
    );
    await testHarness.store.markRetry(
      retryReady.id,
      {
        code: "PIPELINE_TIMEOUT",
        message: "retry ready",
        retryable: true,
        at: clock.toISOString(),
      },
      new Date(clock.getTime() + 1_000)
    );

    clock = new Date(clock.getTime() + 5_000);
    const diagnostics = await testHarness.service.diagnostics();
    assert.equal(diagnostics.limits.sloQueuedMs, 1000);
    assert.equal(diagnostics.limits.sloEligibleMs, 1000);
    assert.equal(diagnostics.limits.sloRunningMs, 1000);
    assert.equal(diagnostics.limits.sloRetryReadyMs, 1000);
    assert.equal(diagnostics.slo.queuedBreaches, 1);
    assert.equal(diagnostics.slo.eligibleBreaches, 2);
    assert.equal(diagnostics.slo.runningBreaches, 1);
    assert.equal(diagnostics.slo.retryReadyBreaches, 1);
    assert.equal(diagnostics.slo.breached, true);
    assert.equal(diagnostics.pressure.sloBreaches, 5);
    assert.ok(diagnostics.slo.oldestRunningAgeMs !== null);
    assert.ok(diagnostics.slo.oldestRetryReadyAgeMs !== null);

    const payload = JSON.stringify(diagnostics);
    for (const forbidden of [
      queued.id,
      running.id,
      retryReady.id,
      testHarness.input.projectId,
      testHarness.input.source.filename,
    ]) {
      assert.equal(payload.includes(forbidden), false, forbidden);
    }

    await lease.release();
  } finally {
    testHarness.cleanup();
  }
});

test("cancellation is durable and avoids invoking the processor", async () => {
  const testHarness = harness();
  try {
    const job = await testHarness.service.enqueue(testHarness.input);
    await testHarness.service.requestCancellation(job.id);
    const result = await testHarness.service.runJob(job.id);
    assert.equal(result.outcome, "cancelled");
    assert.equal(result.job?.status, "cancelled");
    assert.equal(testHarness.processor.calls, 0);
  } finally {
    testHarness.cleanup();
  }
});

test("unconfigured production scanning quarantines the version before transcode", async () => {
  const testHarness = harness({ malwarePolicy: "required" });
  try {
    const job = await testHarness.service.enqueue(testHarness.input);
    const result = await testHarness.service.runJob(job.id);
    assert.equal(result.outcome, "quarantined");
    assert.equal(result.job?.status, "quarantined");
    assert.equal(result.job?.failure?.code, "PIPELINE_QUARANTINE_PENDING");
    assert.equal(result.job?.scan?.verdict, "pending");
    assert.equal(result.job?.scan?.engine, "unconfigured");
    assert.equal(result.job?.scan?.subjectSha256, testHarness.input.source.expectedSha256);
    assert.equal(testHarness.processor.calls, 0);
  } finally {
    testHarness.cleanup();
  }
});

test("retryable transcode failures schedule a bounded retry and preserve the job identity", async () => {
  const processor = new FixtureProcessor();
  processor.failTranscode = true;
  const testHarness = harness({ processor });
  try {
    const job = await testHarness.service.enqueue(testHarness.input);
    const result = await testHarness.service.runJob(job.id);
    assert.equal(result.outcome, "retry_scheduled");
    assert.equal(result.job?.status, "retry_wait");
    assert.equal(result.job?.id, job.id);
    assert.ok(result.job?.retryAt);
    const deferred = await testHarness.service.runJob(job.id);
    assert.equal(deferred.outcome, "not_eligible");

    const reset = await testHarness.service.requestRetry(job.id);
    assert.equal(reset.status, "queued");
    assert.equal(reset.failure, null);
  } finally {
    testHarness.cleanup();
  }
});

test("persisted retry backoff survives restart and cannot be bypassed at lease claim", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-media-pipeline-backoff-"));
  let clock = new Date("2026-07-15T00:00:00.000Z");
  const now = () => clock;
  const store = new MediaPipelineJobStore({ root, now });
  try {
    const job = await store.createOrGet(
      {
        assetId: "2fb1d5cc-8f78-4dc3-9c57-ae1566d6dc88",
        versionId: "177139fe-bffd-4f2b-8ff3-8c4be1e70861",
        projectId: "cb7a0a7a-7056-4e0f-8296-d970f0f87d67",
        source: {
          objectKey: "sources/v1.mp4",
          filename: "fixture.mp4",
          versionNumber: 1,
          expectedSize: 1,
          expectedSha256: null,
        },
      },
      3
    );
    const firstLease = await store.acquireJobLease(job.id, 120_000);
    assert.ok(firstLease);
    const retryAt = new Date(clock.getTime() + 60_000);
    await store.markRetry(
      job.id,
      {
        code: "PIPELINE_TIMEOUT",
        message: "transient timeout",
        retryable: true,
        at: clock.toISOString(),
      },
      retryAt
    );
    await firstLease.release();

    const restartedStore = new MediaPipelineJobStore({ root, now });
    const persisted = await restartedStore.get(job.id);
    assert.equal(persisted?.status, "retry_wait");
    assert.equal(persisted?.retryAt, retryAt.toISOString());
    assert.deepEqual(await restartedStore.listEligible(), []);
    assert.equal(await restartedStore.acquireJobLease(job.id, 120_000), null);
    assert.equal((await restartedStore.get(job.id))?.attempt, 1);

    clock = retryAt;
    assert.equal((await restartedStore.listEligible())[0]?.id, job.id);
    const resumedLease = await restartedStore.acquireJobLease(job.id, 120_000);
    assert.ok(resumedLease);
    assert.equal(resumedLease.job.attempt, 2);
    await resumedLease.release();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("worker request parsing rejects malformed JSON values without polling the queue", () => {
  for (const rawBody of ["null", "[]", '"job"', "7", "true"]) {
    const result = parseMediaWorkerRequest(rawBody);
    assert.equal(result.ok, false, rawBody);
    if (!result.ok) assert.equal(result.error, "Expected a JSON object body");
  }

  for (const rawBody of ['{"job_id":null}', '{"job_id":7}', '{"job_id":""}']) {
    const result = parseMediaWorkerRequest(rawBody);
    assert.equal(result.ok, false, rawBody);
    if (!result.ok) assert.equal(result.error, "job_id must be a non-empty string");
  }

  for (const rawBody of [
    '{"restore_attestation_version_id":null}',
    '{"restore_attestation_version_id":7}',
    '{"restore_attestation_version_id":""}',
  ]) {
    const result = parseMediaWorkerRequest(rawBody);
    assert.equal(result.ok, false, rawBody);
    if (!result.ok) {
      assert.equal(result.error, "restore_attestation_version_id must be a non-empty string");
    }
  }

  for (const rawBody of [
    '{"restore_receipt_repair":null}',
    '{"restore_receipt_repair":7}',
    '{"restore_receipt_repair":[]}',
  ]) {
    const result = parseMediaWorkerRequest(rawBody);
    assert.equal(result.ok, false, rawBody);
    if (!result.ok) {
      assert.equal(result.error, "restore_receipt_repair must be an object");
    }
  }

  for (const rawBody of [
    '{"restore_receipt_repair":{}}',
    '{"restore_receipt_repair":{"mode":"repair"}}',
  ]) {
    const result = parseMediaWorkerRequest(rawBody);
    assert.equal(result.ok, false, rawBody);
    if (!result.ok) {
      assert.equal(result.error, "restore_receipt_repair.mode must be dry_run or apply");
    }
  }

  for (const rawBody of [
    '{"restore_receipt_repair":{"mode":"dry_run","continuation_token":null}}',
    '{"restore_receipt_repair":{"mode":"dry_run","continuation_token":""}}',
    '{"restore_receipt_repair":{"mode":"dry_run","continuation_token":"not-a-token"}}',
  ]) {
    const result = parseMediaWorkerRequest(rawBody);
    assert.equal(result.ok, false, rawBody);
    if (!result.ok) {
      assert.equal(
        result.error,
        "restore_receipt_repair.continuation_token must be a valid cursor token"
      );
    }
  }

  for (const rawBody of [
    '{"provider_catalog_conformance":null}',
    '{"provider_catalog_conformance":7}',
    '{"provider_catalog_conformance":[]}',
  ]) {
    const result = parseMediaWorkerRequest(rawBody);
    assert.equal(result.ok, false, rawBody);
    if (!result.ok) {
      assert.equal(result.error, "provider_catalog_conformance must be an object");
    }
  }

  for (const rawBody of [
    '{"provider_catalog_conformance":{"scan_limit":0}}',
    '{"provider_catalog_conformance":{"scan_limit":10001}}',
    '{"provider_catalog_conformance":{"scan_limit":"5"}}',
  ]) {
    const result = parseMediaWorkerRequest(rawBody);
    assert.equal(result.ok, false, rawBody);
    if (!result.ok) {
      assert.equal(
        result.error,
        "provider_catalog_conformance.scan_limit must be a positive safe integer"
      );
    }
  }

  for (const rawBody of [
    '{"provider_catalog_conformance":{"page_limit":0}}',
    '{"provider_catalog_conformance":{"page_limit":10001}}',
    '{"provider_catalog_conformance":{"page_limit":"1"}}',
  ]) {
    const result = parseMediaWorkerRequest(rawBody);
    assert.equal(result.ok, false, rawBody);
    if (!result.ok) {
      assert.equal(
        result.error,
        "provider_catalog_conformance.page_limit must be a positive safe integer"
      );
    }
  }

  for (const rawBody of [
    '{"provider_catalog_conformance":{"persist":"true"}}',
    '{"provider_catalog_conformance":{"persist":1}}',
  ]) {
    const result = parseMediaWorkerRequest(rawBody);
    assert.equal(result.ok, false, rawBody);
    if (!result.ok) {
      assert.equal(
        result.error,
        "provider_catalog_conformance.persist must be a boolean"
      );
    }
  }

  for (const rawBody of [
    '{"receipt_catalog_checkpoint_reset":null}',
    '{"receipt_catalog_checkpoint_reset":7}',
    '{"receipt_catalog_checkpoint_reset":[]}',
  ]) {
    const result = parseMediaWorkerRequest(rawBody);
    assert.equal(result.ok, false, rawBody);
    if (!result.ok) {
      assert.equal(result.error, "receipt_catalog_checkpoint_reset must be an object");
    }
  }

  for (const rawBody of [
    '{"receipt_catalog_checkpoint_reset":{}}',
    '{"receipt_catalog_checkpoint_reset":{"mode":"delete"}}',
  ]) {
    const result = parseMediaWorkerRequest(rawBody);
    assert.equal(result.ok, false, rawBody);
    if (!result.ok) {
      assert.equal(
        result.error,
        "receipt_catalog_checkpoint_reset.mode must be dry_run or apply"
      );
    }
  }

  for (const rawBody of [
    '{"receipt_catalog_checkpoint_reset_lifecycle":null}',
    '{"receipt_catalog_checkpoint_reset_lifecycle":7}',
    '{"receipt_catalog_checkpoint_reset_lifecycle":[]}',
  ]) {
    const result = parseMediaWorkerRequest(rawBody);
    assert.equal(result.ok, false, rawBody);
    if (!result.ok) {
      assert.equal(
        result.error,
        "receipt_catalog_checkpoint_reset_lifecycle must be an object"
      );
    }
  }

  for (const rawBody of [
    '{"receipt_catalog_checkpoint_reset_lifecycle":{}}',
    '{"receipt_catalog_checkpoint_reset_lifecycle":{"mode":"delete"}}',
  ]) {
    const result = parseMediaWorkerRequest(rawBody);
    assert.equal(result.ok, false, rawBody);
    if (!result.ok) {
      assert.equal(
        result.error,
        "receipt_catalog_checkpoint_reset_lifecycle.mode must be dry_run or apply"
      );
    }
  }

  for (const rawBody of [
    '{"receipt_catalog_checkpoint_reset_receipt_packet":null}',
    '{"receipt_catalog_checkpoint_reset_receipt_packet":7}',
    '{"receipt_catalog_checkpoint_reset_receipt_packet":[]}',
  ]) {
    const result = parseMediaWorkerRequest(rawBody);
    assert.equal(result.ok, false, rawBody);
    if (!result.ok) {
      assert.equal(
        result.error,
        "receipt_catalog_checkpoint_reset_receipt_packet must be an object"
      );
    }
  }

  for (const rawBody of [
    '{"receipt_catalog_checkpoint_reset_receipt_packet":{}}',
    '{"receipt_catalog_checkpoint_reset_receipt_packet":{"action":"sync"}}',
  ]) {
    const result = parseMediaWorkerRequest(rawBody);
    assert.equal(result.ok, false, rawBody);
    if (!result.ok) {
      assert.equal(
        result.error,
        "receipt_catalog_checkpoint_reset_receipt_packet.action must be export, import, escrow, inventory, recover, lifecycle, quarantine, quarantine_inventory, or quarantine_lifecycle"
      );
    }
  }

  for (const rawBody of [
    '{"receipt_catalog_checkpoint_reset_receipt_packet":{"action":"import"}}',
    '{"receipt_catalog_checkpoint_reset_receipt_packet":{"action":"import","mode":"merge","packet":{}}}',
    '{"receipt_catalog_checkpoint_reset_receipt_packet":{"action":"recover"}}',
    '{"receipt_catalog_checkpoint_reset_receipt_packet":{"action":"recover","mode":"merge"}}',
    '{"receipt_catalog_checkpoint_reset_receipt_packet":{"action":"lifecycle"}}',
    '{"receipt_catalog_checkpoint_reset_receipt_packet":{"action":"lifecycle","mode":"merge"}}',
    '{"receipt_catalog_checkpoint_reset_receipt_packet":{"action":"quarantine"}}',
    '{"receipt_catalog_checkpoint_reset_receipt_packet":{"action":"quarantine","mode":"merge"}}',
    '{"receipt_catalog_checkpoint_reset_receipt_packet":{"action":"quarantine_lifecycle"}}',
    '{"receipt_catalog_checkpoint_reset_receipt_packet":{"action":"quarantine_lifecycle","mode":"merge"}}',
  ]) {
    const result = parseMediaWorkerRequest(rawBody);
    assert.equal(result.ok, false, rawBody);
    if (!result.ok) {
      assert.equal(
        result.error,
        "receipt_catalog_checkpoint_reset_receipt_packet.mode must be dry_run or apply"
      );
    }
  }

  for (const rawBody of [
    '{"receipt_catalog_checkpoint_reset_receipt_packet":{"action":"import","mode":"dry_run"}}',
    '{"receipt_catalog_checkpoint_reset_receipt_packet":{"action":"import","mode":"dry_run","packet":[]}}',
  ]) {
    const result = parseMediaWorkerRequest(rawBody);
    assert.equal(result.ok, false, rawBody);
    if (!result.ok) {
      assert.equal(
        result.error,
        "receipt_catalog_checkpoint_reset_receipt_packet.packet must be an object"
      );
    }
  }

  for (const rawBody of [
    '{"provider_catalog_conformance_receipt_lifecycle":null}',
    '{"provider_catalog_conformance_receipt_lifecycle":7}',
    '{"provider_catalog_conformance_receipt_lifecycle":[]}',
  ]) {
    const result = parseMediaWorkerRequest(rawBody);
    assert.equal(result.ok, false, rawBody);
    if (!result.ok) {
      assert.equal(
        result.error,
        "provider_catalog_conformance_receipt_lifecycle must be an object"
      );
    }
  }

  for (const rawBody of [
    '{"provider_catalog_conformance_receipt_lifecycle":{}}',
    '{"provider_catalog_conformance_receipt_lifecycle":{"mode":"delete"}}',
  ]) {
    const result = parseMediaWorkerRequest(rawBody);
    assert.equal(result.ok, false, rawBody);
    if (!result.ok) {
      assert.equal(
        result.error,
        "provider_catalog_conformance_receipt_lifecycle.mode must be dry_run or apply"
      );
    }
  }

  for (const rawBody of [
    '{"provider_catalog_conformance_receipt_packet":null}',
    '{"provider_catalog_conformance_receipt_packet":7}',
    '{"provider_catalog_conformance_receipt_packet":[]}',
  ]) {
    const result = parseMediaWorkerRequest(rawBody);
    assert.equal(result.ok, false, rawBody);
    if (!result.ok) {
      assert.equal(
        result.error,
        "provider_catalog_conformance_receipt_packet must be an object"
      );
    }
  }

  for (const rawBody of [
    '{"provider_catalog_conformance_receipt_packet":{}}',
    '{"provider_catalog_conformance_receipt_packet":{"action":"sync"}}',
  ]) {
    const result = parseMediaWorkerRequest(rawBody);
    assert.equal(result.ok, false, rawBody);
    if (!result.ok) {
      assert.equal(
        result.error,
        "provider_catalog_conformance_receipt_packet.action must be export, import, escrow, inventory, recover, lifecycle, quarantine, quarantine_inventory, quarantine_lifecycle, quarantine_attest, quarantine_attestation_inventory, or quarantine_attestation_lifecycle"
      );
    }
  }

  for (const rawBody of [
    '{"provider_catalog_conformance_receipt_packet":{"action":"quarantine_attest"}}',
    '{"provider_catalog_conformance_receipt_packet":{"action":"quarantine_attest","decision":"delete"}}',
  ]) {
    const result = parseMediaWorkerRequest(rawBody);
    assert.equal(result.ok, false, rawBody);
    if (!result.ok) {
      assert.equal(
        result.error,
        "provider_catalog_conformance_receipt_packet.decision must be reviewed, retained, or released"
      );
    }
  }

  for (const rawBody of [
    '{"provider_catalog_conformance_receipt_packet":{"action":"import"}}',
    '{"provider_catalog_conformance_receipt_packet":{"action":"import","mode":"merge","packet":{}}}',
    '{"provider_catalog_conformance_receipt_packet":{"action":"recover"}}',
    '{"provider_catalog_conformance_receipt_packet":{"action":"recover","mode":"merge"}}',
    '{"provider_catalog_conformance_receipt_packet":{"action":"lifecycle"}}',
    '{"provider_catalog_conformance_receipt_packet":{"action":"lifecycle","mode":"merge"}}',
    '{"provider_catalog_conformance_receipt_packet":{"action":"quarantine"}}',
    '{"provider_catalog_conformance_receipt_packet":{"action":"quarantine","mode":"merge"}}',
    '{"provider_catalog_conformance_receipt_packet":{"action":"quarantine_lifecycle"}}',
    '{"provider_catalog_conformance_receipt_packet":{"action":"quarantine_lifecycle","mode":"merge"}}',
    '{"provider_catalog_conformance_receipt_packet":{"action":"quarantine_attestation_lifecycle"}}',
    '{"provider_catalog_conformance_receipt_packet":{"action":"quarantine_attestation_lifecycle","mode":"merge"}}',
  ]) {
    const result = parseMediaWorkerRequest(rawBody);
    assert.equal(result.ok, false, rawBody);
    if (!result.ok) {
      assert.equal(
        result.error,
        "provider_catalog_conformance_receipt_packet.mode must be dry_run or apply"
      );
    }
  }

  for (const rawBody of [
    '{"provider_catalog_conformance_receipt_packet":{"action":"import","mode":"dry_run"}}',
    '{"provider_catalog_conformance_receipt_packet":{"action":"import","mode":"dry_run","packet":[]}}',
  ]) {
    const result = parseMediaWorkerRequest(rawBody);
    assert.equal(result.ok, false, rawBody);
    if (!result.ok) {
      assert.equal(
        result.error,
        "provider_catalog_conformance_receipt_packet.packet must be an object"
      );
    }
  }

  assert.deepEqual(parseMediaWorkerRequest("{"), {
    ok: false,
    error: "Expected a JSON request body",
  });
  assert.deepEqual(parseMediaWorkerRequest(""), { ok: true });
  assert.deepEqual(parseMediaWorkerRequest("{}"), { ok: true });
  assert.deepEqual(
    parseMediaWorkerRequest('{"job_id":"0d538d9e-f8c8-482d-bca8-03380f1f1d78"}'),
    { ok: true, jobId: "0d538d9e-f8c8-482d-bca8-03380f1f1d78" }
  );
  assert.deepEqual(
    parseMediaWorkerRequest(
      '{"restore_attestation_version_id":"177139fe-bffd-4f2b-8ff3-8c4be1e70861"}'
    ),
    {
      ok: true,
      restoreAttestationVersionId: "177139fe-bffd-4f2b-8ff3-8c4be1e70861",
    }
  );
  assert.deepEqual(
    parseMediaWorkerRequest('{"restore_receipt_repair":{"mode":"dry_run"}}'),
    { ok: true, restoreReceiptRepairMode: "dry_run" }
  );
  assert.deepEqual(
    parseMediaWorkerRequest('{"restore_receipt_repair":{"mode":"apply"}}'),
    { ok: true, restoreReceiptRepairMode: "apply" }
  );
  assert.deepEqual(
    parseMediaWorkerRequest(
      '{"restore_receipt_repair":{"mode":"apply","continuation_token":"codeliver_rcc_v1.abc.def"}}'
    ),
    {
      ok: true,
      restoreReceiptRepairMode: "apply",
      restoreReceiptContinuationToken: "codeliver_rcc_v1.abc.def",
    }
  );
  assert.deepEqual(
    parseMediaWorkerRequest('{"receipt_catalog_checkpoint_reset":{"mode":"dry_run"}}'),
    { ok: true, receiptCatalogCheckpointResetMode: "dry_run" }
  );
  assert.deepEqual(
    parseMediaWorkerRequest('{"receipt_catalog_checkpoint_reset":{"mode":"apply"}}'),
    { ok: true, receiptCatalogCheckpointResetMode: "apply" }
  );
  assert.deepEqual(
    parseMediaWorkerRequest(
      '{"receipt_catalog_checkpoint_reset_lifecycle":{"mode":"dry_run"}}'
    ),
    { ok: true, receiptCatalogCheckpointResetLifecycleMode: "dry_run" }
  );
  assert.deepEqual(
    parseMediaWorkerRequest(
      '{"receipt_catalog_checkpoint_reset_lifecycle":{"mode":"apply"}}'
    ),
    { ok: true, receiptCatalogCheckpointResetLifecycleMode: "apply" }
  );
  assert.deepEqual(
    parseMediaWorkerRequest(
      '{"receipt_catalog_checkpoint_reset_receipt_packet":{"action":"export"}}'
    ),
    {
      ok: true,
      receiptCatalogCheckpointResetReceiptPacket: { action: "export" },
    }
  );
  assert.deepEqual(
    parseMediaWorkerRequest(
      '{"receipt_catalog_checkpoint_reset_receipt_packet":{"action":"escrow"}}'
    ),
    {
      ok: true,
      receiptCatalogCheckpointResetReceiptPacket: { action: "escrow" },
    }
  );
  assert.deepEqual(
    parseMediaWorkerRequest(
      '{"receipt_catalog_checkpoint_reset_receipt_packet":{"action":"inventory"}}'
    ),
    {
      ok: true,
      receiptCatalogCheckpointResetReceiptPacket: { action: "inventory" },
    }
  );
  assert.deepEqual(
    parseMediaWorkerRequest(
      '{"receipt_catalog_checkpoint_reset_receipt_packet":{"action":"recover","mode":"apply"}}'
    ),
    {
      ok: true,
      receiptCatalogCheckpointResetReceiptPacket: { action: "recover", mode: "apply" },
    }
  );
  assert.deepEqual(
    parseMediaWorkerRequest(
      '{"receipt_catalog_checkpoint_reset_receipt_packet":{"action":"lifecycle","mode":"dry_run"}}'
    ),
    {
      ok: true,
      receiptCatalogCheckpointResetReceiptPacket: {
        action: "lifecycle",
        mode: "dry_run",
      },
    }
  );
  assert.deepEqual(
    parseMediaWorkerRequest(
      '{"receipt_catalog_checkpoint_reset_receipt_packet":{"action":"quarantine","mode":"apply"}}'
    ),
    {
      ok: true,
      receiptCatalogCheckpointResetReceiptPacket: {
        action: "quarantine",
        mode: "apply",
      },
    }
  );
  assert.deepEqual(
    parseMediaWorkerRequest(
      '{"receipt_catalog_checkpoint_reset_receipt_packet":{"action":"quarantine_inventory"}}'
    ),
    {
      ok: true,
      receiptCatalogCheckpointResetReceiptPacket: {
        action: "quarantine_inventory",
      },
    }
  );
  assert.deepEqual(
    parseMediaWorkerRequest(
      '{"receipt_catalog_checkpoint_reset_receipt_packet":{"action":"quarantine_lifecycle","mode":"apply"}}'
    ),
    {
      ok: true,
      receiptCatalogCheckpointResetReceiptPacket: {
        action: "quarantine_lifecycle",
        mode: "apply",
      },
    }
  );
  assert.deepEqual(
    parseMediaWorkerRequest(
      '{"receipt_catalog_checkpoint_reset_receipt_packet":{"action":"import","mode":"dry_run","packet":{"schemaVersion":1}}}'
    ),
    {
      ok: true,
      receiptCatalogCheckpointResetReceiptPacket: {
        action: "import",
        mode: "dry_run",
        packet: { schemaVersion: 1 },
      },
    }
  );
  assert.deepEqual(
    parseMediaWorkerRequest('{"provider_catalog_conformance":{}}'),
    { ok: true, providerCatalogConformance: {} }
  );
  assert.deepEqual(
    parseMediaWorkerRequest(
      '{"provider_catalog_conformance":{"scan_limit":12,"page_limit":2,"persist":true}}'
    ),
    {
      ok: true,
      providerCatalogConformance: { scanLimit: 12, pageLimit: 2, persist: true },
    }
  );
  assert.deepEqual(
    parseMediaWorkerRequest(
      '{"provider_catalog_conformance_receipt_lifecycle":{"mode":"dry_run"}}'
    ),
    {
      ok: true,
      providerCatalogConformanceReceiptLifecycleMode: "dry_run",
    }
  );
  assert.deepEqual(
    parseMediaWorkerRequest(
      '{"provider_catalog_conformance_receipt_lifecycle":{"mode":"apply"}}'
    ),
    {
      ok: true,
      providerCatalogConformanceReceiptLifecycleMode: "apply",
    }
  );
  assert.deepEqual(
    parseMediaWorkerRequest(
      '{"provider_catalog_conformance_receipt_packet":{"action":"export"}}'
    ),
    {
      ok: true,
      providerCatalogConformanceReceiptPacket: { action: "export" },
    }
  );
  assert.deepEqual(
    parseMediaWorkerRequest(
      '{"provider_catalog_conformance_receipt_packet":{"action":"escrow"}}'
    ),
    {
      ok: true,
      providerCatalogConformanceReceiptPacket: { action: "escrow" },
    }
  );
  assert.deepEqual(
    parseMediaWorkerRequest(
      '{"provider_catalog_conformance_receipt_packet":{"action":"inventory"}}'
    ),
    {
      ok: true,
      providerCatalogConformanceReceiptPacket: { action: "inventory" },
    }
  );
  assert.deepEqual(
    parseMediaWorkerRequest(
      '{"provider_catalog_conformance_receipt_packet":{"action":"recover","mode":"apply"}}'
    ),
    {
      ok: true,
      providerCatalogConformanceReceiptPacket: { action: "recover", mode: "apply" },
    }
  );
  assert.deepEqual(
    parseMediaWorkerRequest(
      '{"provider_catalog_conformance_receipt_packet":{"action":"lifecycle","mode":"dry_run"}}'
    ),
    {
      ok: true,
      providerCatalogConformanceReceiptPacket: {
        action: "lifecycle",
        mode: "dry_run",
      },
    }
  );
  assert.deepEqual(
    parseMediaWorkerRequest(
      '{"provider_catalog_conformance_receipt_packet":{"action":"quarantine","mode":"apply"}}'
    ),
    {
      ok: true,
      providerCatalogConformanceReceiptPacket: {
        action: "quarantine",
        mode: "apply",
      },
    }
  );
  assert.deepEqual(
    parseMediaWorkerRequest(
      '{"provider_catalog_conformance_receipt_packet":{"action":"quarantine_inventory"}}'
    ),
    {
      ok: true,
      providerCatalogConformanceReceiptPacket: {
        action: "quarantine_inventory",
      },
    }
  );
  assert.deepEqual(
    parseMediaWorkerRequest(
      '{"provider_catalog_conformance_receipt_packet":{"action":"quarantine_lifecycle","mode":"dry_run"}}'
    ),
    {
      ok: true,
      providerCatalogConformanceReceiptPacket: {
        action: "quarantine_lifecycle",
        mode: "dry_run",
      },
    }
  );
  assert.deepEqual(
    parseMediaWorkerRequest(
      '{"provider_catalog_conformance_receipt_packet":{"action":"quarantine_attest","decision":"reviewed"}}'
    ),
    {
      ok: true,
      providerCatalogConformanceReceiptPacket: {
        action: "quarantine_attest",
        decision: "reviewed",
      },
    }
  );
  assert.deepEqual(
    parseMediaWorkerRequest(
      '{"provider_catalog_conformance_receipt_packet":{"action":"quarantine_attestation_inventory"}}'
    ),
    {
      ok: true,
      providerCatalogConformanceReceiptPacket: {
        action: "quarantine_attestation_inventory",
      },
    }
  );
  assert.deepEqual(
    parseMediaWorkerRequest(
      '{"provider_catalog_conformance_receipt_packet":{"action":"quarantine_attestation_lifecycle","mode":"apply"}}'
    ),
    {
      ok: true,
      providerCatalogConformanceReceiptPacket: {
        action: "quarantine_attestation_lifecycle",
        mode: "apply",
      },
    }
  );
  assert.deepEqual(
    parseMediaWorkerRequest(
      '{"provider_catalog_conformance_receipt_packet":{"action":"import","mode":"dry_run","packet":{"schemaVersion":1}}}'
    ),
    {
      ok: true,
      providerCatalogConformanceReceiptPacket: {
        action: "import",
        mode: "dry_run",
        packet: { schemaVersion: 1 },
      },
    }
  );
  assert.deepEqual(
    parseMediaWorkerRequest(
      '{"job_id":"0d538d9e-f8c8-482d-bca8-03380f1f1d78","restore_attestation_version_id":"177139fe-bffd-4f2b-8ff3-8c4be1e70861"}'
    ),
    {
      ok: false,
      error: "Choose only one worker command",
    }
  );
  assert.deepEqual(
    parseMediaWorkerRequest(
      '{"restore_attestation_version_id":"177139fe-bffd-4f2b-8ff3-8c4be1e70861","restore_receipt_repair":{"mode":"dry_run"}}'
    ),
    {
      ok: false,
      error: "Choose only one worker command",
    }
  );
  assert.deepEqual(
    parseMediaWorkerRequest(
      '{"provider_catalog_conformance":{},"restore_receipt_repair":{"mode":"dry_run"}}'
    ),
    {
      ok: false,
      error: "Choose only one worker command",
    }
  );
  assert.deepEqual(
    parseMediaWorkerRequest(
      '{"provider_catalog_conformance":{},"provider_catalog_conformance_receipt_lifecycle":{"mode":"dry_run"}}'
    ),
    {
      ok: false,
      error: "Choose only one worker command",
    }
  );
  assert.deepEqual(
    parseMediaWorkerRequest(
      '{"provider_catalog_conformance_receipt_lifecycle":{"mode":"dry_run"},"provider_catalog_conformance_receipt_packet":{"action":"export"}}'
    ),
    {
      ok: false,
      error: "Choose only one worker command",
    }
  );
  assert.deepEqual(
    parseMediaWorkerRequest(
      '{"receipt_catalog_checkpoint_reset_receipt_packet":{"action":"export"},"provider_catalog_conformance_receipt_packet":{"action":"export"}}'
    ),
    {
      ok: false,
      error: "Choose only one worker command",
    }
  );
});

test("worker configuration rejects leases shorter than the full command budget", () => {
  const testHarness = harness();
  try {
    const runtime = createStorageRuntime({
      CODELIVER_STORAGE_PROVIDER: "local",
      CODELIVER_LOCAL_STORAGE_ROOT: testHarness.root,
      CODELIVER_STORAGE_WRITE_ENABLED: "1",
      CODELIVER_STORAGE_RESERVED_BYTES: "0",
    });
    assert.throws(
      () =>
        readMediaPipelineConfig(runtime.config, {
          CODELIVER_MEDIA_PIPELINE_COMMAND_TIMEOUT_MS: "1000",
          CODELIVER_MEDIA_PIPELINE_JOB_LEASE_MS: "1000",
          CODELIVER_MEDIA_PIPELINE_WORKER_LEASE_MS: "1000",
        }),
      /must cover the configured command budget/
    );
  } finally {
    testHarness.cleanup();
  }
});

test("worker configuration rejects required manifest signatures without a signing key", () => {
  const testHarness = harness();
  try {
    const runtime = createStorageRuntime({
      CODELIVER_STORAGE_PROVIDER: "local",
      CODELIVER_LOCAL_STORAGE_ROOT: testHarness.root,
      CODELIVER_STORAGE_WRITE_ENABLED: "1",
      CODELIVER_STORAGE_RESERVED_BYTES: "0",
    });
    assert.throws(
      () =>
        readMediaPipelineConfig(runtime.config, {
          CODELIVER_MEDIA_PIPELINE_REQUIRE_MANIFEST_SIGNATURE: "1",
        }),
      /requires CODELIVER_MEDIA_PIPELINE_MANIFEST_SIGNING_KEY/
    );
  } finally {
    testHarness.cleanup();
  }
});

test("expired worker leases become eligible for recovery without starting a second owner", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-media-pipeline-lease-"));
  let clock = new Date("2026-07-15T00:00:00.000Z");
  const store = new MediaPipelineJobStore({ root, now: () => clock });
  try {
    const job = await store.createOrGet(
      {
        assetId: "2fb1d5cc-8f78-4dc3-9c57-ae1566d6dc88",
        versionId: "177139fe-bffd-4f2b-8ff3-8c4be1e70861",
        projectId: "cb7a0a7a-7056-4e0f-8296-d970f0f87d67",
        source: {
          objectKey: "sources/v1.mp4",
          filename: "fixture.mp4",
          versionNumber: 1,
          expectedSize: 1,
          expectedSha256: null,
        },
      },
      3
    );
    const lease = await store.acquireJobLease(job.id, 1);
    assert.ok(lease);
    clock = new Date(clock.getTime() + 2);
    const eligible = await store.listEligible();
    assert.equal(eligible[0]?.id, job.id);
    const recovered = await store.recoverExpired(job.id);
    assert.equal(recovered.status, "retry_wait");
    await lease?.release();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("safe local execution probes and renders a real one-second media source", async (t) => {
  const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
  const ffprobe = process.env.FFPROBE_PATH || "ffprobe";
  const root = mkdtempSync(join(tmpdir(), "codeliver-media-pipeline-real-"));
  try {
    const sourceKey = "sources/local-proof.mp4";
    const sourcePath = join(root, sourceKey);
    mkdirSync(join(root, "sources"), { recursive: true });
    try {
      await execFileAsync(ffmpeg, [
        "-nostdin",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=128x72:rate=24",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=660:sample_rate=44100",
        "-t",
        "1",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        sourcePath,
      ]);
    } catch {
      t.skip("ffmpeg is unavailable in this environment");
      return;
    }

    const source = readFileSync(sourcePath);
    const env = {
      CODELIVER_STORAGE_PROVIDER: "local",
      CODELIVER_LOCAL_STORAGE_ROOT: root,
      CODELIVER_STORAGE_WRITE_ENABLED: "1",
      CODELIVER_STORAGE_RESERVED_BYTES: "0",
      CODELIVER_MALWARE_POLICY: "allow-local-demo",
      FFMPEG_PATH: ffmpeg,
      FFPROBE_PATH: ffprobe,
      CODELIVER_MEDIA_PIPELINE_COMMAND_TIMEOUT_MS: "120000",
    };
    const runtime = createStorageRuntime(env);
    const service = new MediaPipelineService({
      runtime,
      config: readMediaPipelineConfig(runtime.config, env),
      store: new MediaPipelineJobStore({ root }),
      repository: new NoopMediaPipelineRepository(),
      metrics: { emit() {} },
    });
    const job = await service.enqueue({
      assetId: "02c3f61c-631d-40f1-93e1-7b3d8df4f76a",
      versionId: "3adbe171-20e4-4ffd-b09f-cb845b444950",
      projectId: "1df76006-acee-47d2-9d2e-9ebae3c5ca5b",
      source: {
        objectKey: sourceKey,
        filename: "local-proof.mp4",
        versionNumber: 1,
        expectedSize: source.length,
        expectedSha256: createHash("sha256").update(source).digest("hex"),
      },
    });
    const result = await service.runJob(job.id);
    assert.equal(result.outcome, "published");
    assert.equal(result.job?.probe?.hasVideo, true);
    assert.equal(result.job?.probe?.hasAudio, true);
    assert.equal(result.job?.artifacts?.captions.status, "pending_transcription");
    assert.equal(
      existsSync(join(root, result.job!.artifacts!.hls.playlist.objectKey)),
      true
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
