import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { NextRequest } from "next/server.js";

import { readMediaPipelineConfig } from "../lib/media-pipeline/config.ts";
import type {
  CaptionExtraction,
  MediaProcessor,
  MediaProcessorCallbacks,
} from "../lib/media-pipeline/ffmpeg.ts";
import { MediaPipelineJobStore } from "../lib/media-pipeline/job-store.ts";
import { NoopMediaPipelineRepository } from "../lib/media-pipeline/repository.ts";
import { MediaPipelineService } from "../lib/media-pipeline/service.ts";
import type { MediaProbe } from "../lib/media-pipeline/types.ts";
import { createStorageRuntime } from "../lib/storage/runtime.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier.startsWith("@/")) {
      const candidate = resolve(repositoryRoot, specifier.slice(2));
      return nextResolve(pathToFileURL(`${candidate}.ts`).href, context);
    }
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      const candidate = resolve(dirname(fileURLToPath(context.parentURL)), specifier);
      if (existsSync(`${candidate}.ts`)) {
        return nextResolve(pathToFileURL(`${candidate}.ts`).href, context);
      }
    }
    return nextResolve(specifier, context);
  },
});

const probe: MediaProbe = {
  durationSeconds: 1,
  width: 1920,
  height: 1080,
  frameRate: 29.97,
  videoCodec: "h264",
  audioCodec: "aac",
  hasVideo: true,
  hasAudio: true,
  hasSubtitle: false,
  formatName: "mov,mp4,m4a,3gp,3g2,mj2",
};

class FixtureProcessor implements MediaProcessor {
  async probe(): Promise<MediaProbe> {
    return probe;
  }

  async transcodeHls(
    _inputPath: string,
    outputDirectory: string,
    _probe: MediaProbe,
    callbacks: MediaProcessorCallbacks
  ): Promise<string> {
    void _inputPath;
    void _probe;
    await mkdir(outputDirectory, { recursive: true });
    const playlist = join(outputDirectory, "playlist.m3u8");
    await writeFile(playlist, "#EXTM3U\n#EXTINF:1,\nsegment_00000.ts\n#EXT-X-ENDLIST\n");
    await writeFile(join(outputDirectory, "segment_00000.ts"), "transport-stream");
    await callbacks.onProgress(1);
    return playlist;
  }

  async generateThumbnail(): Promise<string | null> {
    return null;
  }

  async generateWaveform(
    _inputPath: string,
    outputPath: string,
    _probe: MediaProbe,
    callbacks: MediaProcessorCallbacks
  ): Promise<string | null> {
    void _inputPath;
    void _probe;
    await writeFile(outputPath, "waveform");
    await callbacks.onProgress(1);
    return outputPath;
  }

  async extractCaptions(
    _inputPath: string,
    outputPath: string,
    _probe: MediaProbe,
    callbacks: MediaProcessorCallbacks
  ): Promise<CaptionExtraction> {
    void _inputPath;
    void _probe;
    await writeFile(outputPath, "WEBVTT\n\n");
    await callbacks.onProgress(1);
    return {
      path: null,
      status: "pending_transcription",
      detail: "fixture has no embedded captions",
    };
  }
}

function withEnv<T>(env: Record<string, string>, run: () => Promise<T>): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  return run().finally(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

async function publishFixture(root: string) {
  const runtime = createStorageRuntime(process.env);
  const store = new MediaPipelineJobStore({ root });
  const service = new MediaPipelineService({
    runtime,
    config: readMediaPipelineConfig(runtime.config),
    store,
    processor: new FixtureProcessor(),
    repository: new NoopMediaPipelineRepository(),
    metrics: { emit() {} },
  });
  const sourceKey = "sources/api-source.mp4";
  const source = Buffer.from("restore-api-source");
  mkdirSync(join(root, "sources"), { recursive: true });
  writeFileSync(join(root, sourceKey), source);
  const sourceSha256 = createHash("sha256").update(source).digest("hex");
  const job = await service.enqueue({
    assetId: "2fb1d5cc-8f78-4dc3-9c57-ae1566d6dc88",
    versionId: "177139fe-bffd-4f2b-8ff3-8c4be1e70861",
    projectId: "cb7a0a7a-7056-4e0f-8296-d970f0f87d67",
    source: {
      objectKey: sourceKey,
      filename: "api-source.mp4",
      versionNumber: 1,
      expectedSize: source.length,
      expectedSha256: sourceSha256,
      receipt: {
        provider: "local",
        objectKey: sourceKey,
        size: source.length,
        sha256: sourceSha256,
        providerVersionId: "api-source-version",
        committedAt: "2026-07-15T00:00:00.000Z",
      },
    },
  });
  const result = await service.runJob(job.id);
  assert.equal(result.outcome, "published");
  assert.ok(result.job?.artifacts);
  return { job: result.job, sourceKey };
}

function restoreReceiptPayloads(root: string): Array<{ path: string; raw: string }> {
  const payloads: Array<{ path: string; raw: string }> = [];
  function visit(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(path);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const raw = readFileSync(path, "utf8");
      try {
        const parsed = JSON.parse(raw) as { type?: unknown };
        if (parsed.type === "co_deliver_restore_attestation_receipt") {
          payloads.push({ path, raw });
        }
      } catch {
        // Ignore unrelated control files that are not JSON payloads under test.
      }
    }
  }
  visit(root);
  return payloads;
}

test("worker route restore attestation is token-authorized and redacted", async () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-restore-api-"));
  const workerToken = "restore-attestation-worker-token";
  const signingKey = "restore-attestation-signing-key-0001";
  try {
    await withEnv(
      {
        CODELIVER_STORAGE_PROVIDER: "local",
        CODELIVER_LOCAL_STORAGE_ROOT: root,
        CODELIVER_STORAGE_WRITE_ENABLED: "1",
        CODELIVER_STORAGE_RESERVED_BYTES: "0",
        CODELIVER_MALWARE_POLICY: "allow-local-demo",
        CODELIVER_MEDIA_PIPELINE_WORKER_TOKEN: workerToken,
        CODELIVER_MEDIA_PIPELINE_MANIFEST_SIGNING_KEY: signingKey,
      },
      async () => {
        const { GET, POST } = await import(
          pathToFileURL(
            resolve(repositoryRoot, "app/api/transcode/worker/route.ts")
          ).href
        );

        const unauthorized = await GET(
          new NextRequest(
            "https://admin.contentco-op.com/api/transcode/worker?restore_attestation_version_id=177139fe-bffd-4f2b-8ff3-8c4be1e70861"
          )
        );
        assert.equal(unauthorized.status, 401);

        const missingVersion = await GET(
          new NextRequest(
            "https://admin.contentco-op.com/api/transcode/worker?restore_attestation_version_id=",
            { headers: { "x-codeliver-media-worker-token": workerToken } }
          )
        );
        assert.equal(missingVersion.status, 400);

        const { job, sourceKey } = await publishFixture(root);
        const response = await GET(
          new NextRequest(
            `https://admin.contentco-op.com/api/transcode/worker?restore_attestation_version_id=${job!.versionId}`,
            { headers: { "x-codeliver-media-worker-token": workerToken } }
          )
        );
        assert.equal(response.status, 200);
        const body = (await response.json()) as {
          attestation: {
            status: string;
            ready: boolean;
            manifest: { integrity: string; signed: boolean; semanticMatch: boolean };
            derivatives: { totalReferences: number; missingReferences: number };
          };
        };
        assert.equal(body.attestation.status, "ready");
        assert.equal(body.attestation.ready, true);
        assert.equal(body.attestation.manifest.integrity, "valid_signed");
        assert.equal(body.attestation.manifest.signed, true);
        assert.equal(body.attestation.manifest.semanticMatch, true);
        assert.equal(body.attestation.derivatives.totalReferences, 6);
        assert.equal(body.attestation.derivatives.missingReferences, 0);

        const payload = JSON.stringify(body);
        for (const forbidden of [
          job!.id,
          job!.versionId,
          job!.projectId,
          sourceKey,
          job!.artifacts!.pipelineManifest.objectKey,
          root,
          workerToken,
          signingKey,
        ]) {
          assert.equal(payload.includes(forbidden), false, forbidden);
        }

        const unauthorizedReceipt = await POST(
          new NextRequest("https://admin.contentco-op.com/api/transcode/worker", {
            method: "POST",
            body: JSON.stringify({
              restore_attestation_version_id: job!.versionId,
            }),
          })
        );
        assert.equal(unauthorizedReceipt.status, 401);

        const malformedReceipt = await POST(
          new NextRequest("https://admin.contentco-op.com/api/transcode/worker", {
            method: "POST",
            headers: { "x-codeliver-media-worker-token": workerToken },
            body: JSON.stringify({
              restore_attestation_version_id: "",
            }),
          })
        );
        assert.equal(malformedReceipt.status, 400);

        const malformedRepair = await POST(
          new NextRequest("https://admin.contentco-op.com/api/transcode/worker", {
            method: "POST",
            headers: { "x-codeliver-media-worker-token": workerToken },
            body: JSON.stringify({
              restore_receipt_repair: { mode: "repair" },
            }),
          })
        );
        assert.equal(malformedRepair.status, 400);

        const ambiguousCommand = await POST(
          new NextRequest("https://admin.contentco-op.com/api/transcode/worker", {
            method: "POST",
            headers: { "x-codeliver-media-worker-token": workerToken },
            body: JSON.stringify({
              job_id: job!.id,
              restore_attestation_version_id: job!.versionId,
            }),
          })
        );
        assert.equal(ambiguousCommand.status, 400);

        const malformedConformance = await POST(
          new NextRequest("https://admin.contentco-op.com/api/transcode/worker", {
            method: "POST",
            headers: { "x-codeliver-media-worker-token": workerToken },
            body: JSON.stringify({
              provider_catalog_conformance: { scan_limit: 0 },
            }),
          })
        );
        assert.equal(malformedConformance.status, 400);

        const conformancePreflight = await POST(
          new NextRequest("https://admin.contentco-op.com/api/transcode/worker", {
            method: "POST",
            headers: { "x-codeliver-media-worker-token": workerToken },
            body: JSON.stringify({
              provider_catalog_conformance: { scan_limit: 5, page_limit: 2 },
            }),
          })
        );
        assert.equal(conformancePreflight.status, 200);
        const conformanceBody = (await conformancePreflight.json()) as {
          providerCatalogConformance: {
            provider: string;
            capabilityPresent: boolean;
            ready: boolean;
            scanLimit: number;
            pageLimit: number;
            listedObjects: number;
            findings: Array<{ code: string; count: number }>;
          };
        };
        assert.equal(conformanceBody.providerCatalogConformance.provider, "local");
        assert.equal(conformanceBody.providerCatalogConformance.capabilityPresent, false);
        assert.equal(conformanceBody.providerCatalogConformance.ready, false);
        assert.equal(conformanceBody.providerCatalogConformance.scanLimit, 5);
        assert.equal(conformanceBody.providerCatalogConformance.pageLimit, 2);
        assert.equal(conformanceBody.providerCatalogConformance.listedObjects, 0);
        assert.deepEqual(conformanceBody.providerCatalogConformance.findings, [
          { code: "missing_capability", count: 1 },
        ]);

        const conformancePayload = JSON.stringify(conformanceBody);
        for (const forbidden of [
          job!.id,
          job!.versionId,
          job!.projectId,
          sourceKey,
          job!.artifacts!.pipelineManifest.objectKey,
          root,
          workerToken,
          signingKey,
        ]) {
          assert.equal(conformancePayload.includes(forbidden), false, forbidden);
        }

        const conformanceReceiptResponse = await POST(
          new NextRequest("https://admin.contentco-op.com/api/transcode/worker", {
            method: "POST",
            headers: { "x-codeliver-media-worker-token": workerToken },
            body: JSON.stringify({
              provider_catalog_conformance: {
                scan_limit: 5,
                page_limit: 2,
                persist: true,
              },
            }),
          })
        );
        assert.equal(conformanceReceiptResponse.status, 200);
        const conformanceReceiptBody = (await conformanceReceiptResponse.json()) as {
          providerCatalogConformanceReceipt: {
            persisted: boolean;
            reason: string | null;
            report: {
              provider: string;
              capabilityPresent: boolean;
              ready: boolean;
              findings: Array<{ code: string; count: number }>;
            };
            receipt: {
              provider: string;
              providerDigest: string;
              reportPayloadSha256: string;
              receiptPayloadSha256: string;
              integrity: string;
              signed: boolean;
            };
          };
        };
        assert.equal(conformanceReceiptBody.providerCatalogConformanceReceipt.persisted, true);
        assert.equal(conformanceReceiptBody.providerCatalogConformanceReceipt.reason, null);
        assert.equal(conformanceReceiptBody.providerCatalogConformanceReceipt.report.provider, "local");
        assert.equal(
          conformanceReceiptBody.providerCatalogConformanceReceipt.report.capabilityPresent,
          false
        );
        assert.equal(conformanceReceiptBody.providerCatalogConformanceReceipt.report.ready, false);
        assert.deepEqual(
          conformanceReceiptBody.providerCatalogConformanceReceipt.report.findings,
          [{ code: "missing_capability", count: 1 }]
        );
        assert.equal(
          conformanceReceiptBody.providerCatalogConformanceReceipt.receipt.provider,
          "local"
        );
        assert.match(
          conformanceReceiptBody.providerCatalogConformanceReceipt.receipt.providerDigest,
          /^[a-f0-9]{64}$/
        );
        assert.match(
          conformanceReceiptBody.providerCatalogConformanceReceipt.receipt.reportPayloadSha256,
          /^[a-f0-9]{64}$/
        );
        assert.match(
          conformanceReceiptBody.providerCatalogConformanceReceipt.receipt.receiptPayloadSha256,
          /^[a-f0-9]{64}$/
        );
        assert.equal(
          conformanceReceiptBody.providerCatalogConformanceReceipt.receipt.integrity,
          "hmac-sha256"
        );
        assert.equal(conformanceReceiptBody.providerCatalogConformanceReceipt.receipt.signed, true);

        const conformanceReceiptPayload = JSON.stringify(conformanceReceiptBody);
        for (const forbidden of [
          job!.id,
          job!.versionId,
          job!.projectId,
          sourceKey,
          job!.artifacts!.pipelineManifest.objectKey,
          root,
          workerToken,
          signingKey,
        ]) {
          assert.equal(conformanceReceiptPayload.includes(forbidden), false, forbidden);
        }

        const resetReceiptResponse = await POST(
          new NextRequest("https://admin.contentco-op.com/api/transcode/worker", {
            method: "POST",
            headers: { "x-codeliver-media-worker-token": workerToken },
            body: JSON.stringify({
              receipt_catalog_checkpoint_reset: { mode: "apply" },
            }),
          })
        );
        assert.equal(resetReceiptResponse.status, 200);
        const resetReceiptBody = (await resetReceiptResponse.json()) as {
          receiptCatalogCheckpointReset: {
            mode: string;
            deletedCheckpoints: number;
            applied: boolean;
            receipt: {
              recorded: boolean;
              resetSnapshotDigest: string;
              receiptPayloadSha256: string;
              integrity: string;
              signed: boolean;
            };
          };
        };
        assert.equal(resetReceiptBody.receiptCatalogCheckpointReset.mode, "apply");
        assert.equal(resetReceiptBody.receiptCatalogCheckpointReset.deletedCheckpoints, 0);
        assert.equal(resetReceiptBody.receiptCatalogCheckpointReset.applied, false);
        assert.equal(resetReceiptBody.receiptCatalogCheckpointReset.receipt.recorded, true);
        assert.match(
          resetReceiptBody.receiptCatalogCheckpointReset.receipt.resetSnapshotDigest,
          /^[a-f0-9]{64}$/
        );
        assert.match(
          resetReceiptBody.receiptCatalogCheckpointReset.receipt.receiptPayloadSha256,
          /^[a-f0-9]{64}$/
        );
        assert.equal(resetReceiptBody.receiptCatalogCheckpointReset.receipt.integrity, "hmac-sha256");
        assert.equal(resetReceiptBody.receiptCatalogCheckpointReset.receipt.signed, true);

        const resetPacketExportResponse = await POST(
          new NextRequest("https://admin.contentco-op.com/api/transcode/worker", {
            method: "POST",
            headers: { "x-codeliver-media-worker-token": workerToken },
            body: JSON.stringify({
              receipt_catalog_checkpoint_reset_receipt_packet: { action: "export" },
            }),
          })
        );
        assert.equal(resetPacketExportResponse.status, 200);
        const resetPacketExportBody = (await resetPacketExportResponse.json()) as {
          receiptCatalogCheckpointResetReceiptPacket: {
            packetDigest: string;
            recordsExported: number;
            signedReceipts: number;
            packet: {
              type: string;
              source: { recordCount: number; signedReceipts: number };
              records: unknown[];
              packetIntegrity: {
                algorithm: string;
                payloadSha256: string;
                signature: string | null;
              };
            };
          };
        };
        assert.equal(resetPacketExportBody.receiptCatalogCheckpointResetReceiptPacket.recordsExported, 1);
        assert.equal(resetPacketExportBody.receiptCatalogCheckpointResetReceiptPacket.signedReceipts, 1);
        assert.equal(
          resetPacketExportBody.receiptCatalogCheckpointResetReceiptPacket.packet.type,
          "co_deliver_receipt_catalog_checkpoint_reset_receipt_packet"
        );
        assert.equal(
          resetPacketExportBody.receiptCatalogCheckpointResetReceiptPacket.packet.source.recordCount,
          1
        );
        assert.equal(
          resetPacketExportBody.receiptCatalogCheckpointResetReceiptPacket.packet.source.signedReceipts,
          1
        );
        assert.equal(
          resetPacketExportBody.receiptCatalogCheckpointResetReceiptPacket.packet.packetIntegrity.algorithm,
          "hmac-sha256"
        );
        assert.match(
          resetPacketExportBody.receiptCatalogCheckpointResetReceiptPacket.packetDigest,
          /^[a-f0-9]{64}$/
        );

        const resetPacketImportResponse = await POST(
          new NextRequest("https://admin.contentco-op.com/api/transcode/worker", {
            method: "POST",
            headers: { "x-codeliver-media-worker-token": workerToken },
            body: JSON.stringify({
              receipt_catalog_checkpoint_reset_receipt_packet: {
                action: "import",
                mode: "dry_run",
                packet:
                  resetPacketExportBody.receiptCatalogCheckpointResetReceiptPacket.packet,
              },
            }),
          })
        );
        assert.equal(resetPacketImportResponse.status, 200);
        const resetPacketImportBody = (await resetPacketImportResponse.json()) as {
          receiptCatalogCheckpointResetReceiptPacketImport: {
            mode: string;
            packetIntegrity: string;
            recordsReceived: number;
            eligibleRecords: number;
            importedRecords: number;
            duplicateRecords: number;
            dryRun: boolean;
            applied: boolean;
          };
        };
        assert.equal(resetPacketImportBody.receiptCatalogCheckpointResetReceiptPacketImport.mode, "dry_run");
        assert.equal(
          resetPacketImportBody.receiptCatalogCheckpointResetReceiptPacketImport.packetIntegrity,
          "valid_signed"
        );
        assert.equal(resetPacketImportBody.receiptCatalogCheckpointResetReceiptPacketImport.recordsReceived, 1);
        assert.equal(resetPacketImportBody.receiptCatalogCheckpointResetReceiptPacketImport.eligibleRecords, 0);
        assert.equal(resetPacketImportBody.receiptCatalogCheckpointResetReceiptPacketImport.importedRecords, 0);
        assert.equal(resetPacketImportBody.receiptCatalogCheckpointResetReceiptPacketImport.duplicateRecords, 1);
        assert.equal(resetPacketImportBody.receiptCatalogCheckpointResetReceiptPacketImport.dryRun, true);
        assert.equal(resetPacketImportBody.receiptCatalogCheckpointResetReceiptPacketImport.applied, false);

        const resetPacketEscrowResponse = await POST(
          new NextRequest("https://admin.contentco-op.com/api/transcode/worker", {
            method: "POST",
            headers: { "x-codeliver-media-worker-token": workerToken },
            body: JSON.stringify({
              receipt_catalog_checkpoint_reset_receipt_packet: { action: "escrow" },
            }),
          })
        );
        assert.equal(resetPacketEscrowResponse.status, 200);
        const resetPacketEscrowBody = (await resetPacketEscrowResponse.json()) as {
          receiptCatalogCheckpointResetReceiptPacketEscrow: {
            escrowed: boolean;
            packetDigest: string;
            recordsExported: number;
            packetIntegrity: string;
            signed: boolean;
          };
        };
        assert.equal(resetPacketEscrowBody.receiptCatalogCheckpointResetReceiptPacketEscrow.escrowed, true);
        assert.equal(resetPacketEscrowBody.receiptCatalogCheckpointResetReceiptPacketEscrow.recordsExported, 1);
        assert.equal(resetPacketEscrowBody.receiptCatalogCheckpointResetReceiptPacketEscrow.packetIntegrity, "hmac-sha256");
        assert.equal(resetPacketEscrowBody.receiptCatalogCheckpointResetReceiptPacketEscrow.signed, true);
        assert.match(
          resetPacketEscrowBody.receiptCatalogCheckpointResetReceiptPacketEscrow.packetDigest,
          /^[a-f0-9]{64}$/
        );

        const resetPacketInventoryResponse = await POST(
          new NextRequest("https://admin.contentco-op.com/api/transcode/worker", {
            method: "POST",
            headers: { "x-codeliver-media-worker-token": workerToken },
            body: JSON.stringify({
              receipt_catalog_checkpoint_reset_receipt_packet: { action: "inventory" },
            }),
          })
        );
        assert.equal(resetPacketInventoryResponse.status, 200);
        const resetPacketInventoryBody = (await resetPacketInventoryResponse.json()) as {
          receiptCatalogCheckpointResetReceiptPacketEscrowInventory: {
            packets: number;
            duplicatePacketDigests: number;
            signedPackets: number;
            invalidIntegrityPackets: number;
            latest: {
              packetDigest: string;
              recordCount: number;
              integrityStatus: string;
            } | null;
          };
        };
        assert.equal(resetPacketInventoryBody.receiptCatalogCheckpointResetReceiptPacketEscrowInventory.packets, 1);
        assert.equal(
          resetPacketInventoryBody.receiptCatalogCheckpointResetReceiptPacketEscrowInventory.duplicatePacketDigests,
          0
        );
        assert.equal(resetPacketInventoryBody.receiptCatalogCheckpointResetReceiptPacketEscrowInventory.signedPackets, 1);
        assert.equal(
          resetPacketInventoryBody.receiptCatalogCheckpointResetReceiptPacketEscrowInventory.invalidIntegrityPackets,
          0
        );
        assert.equal(
          resetPacketInventoryBody.receiptCatalogCheckpointResetReceiptPacketEscrowInventory.latest?.recordCount,
          1
        );
        assert.equal(
          resetPacketInventoryBody.receiptCatalogCheckpointResetReceiptPacketEscrowInventory.latest?.integrityStatus,
          "valid_signed"
        );

        const resetPacketRecoverResponse = await POST(
          new NextRequest("https://admin.contentco-op.com/api/transcode/worker", {
            method: "POST",
            headers: { "x-codeliver-media-worker-token": workerToken },
            body: JSON.stringify({
              receipt_catalog_checkpoint_reset_receipt_packet: {
                action: "recover",
                mode: "dry_run",
              },
            }),
          })
        );
        assert.equal(resetPacketRecoverResponse.status, 200);
        const resetPacketRecoverBody = (await resetPacketRecoverResponse.json()) as {
          receiptCatalogCheckpointResetReceiptPacketEscrowRecovery: {
            mode: string;
            packetsScanned: number;
            validPackets: number;
            recordsReceived: number;
            eligibleRecords: number;
            recoveredRecords: number;
            duplicateRecords: number;
            dryRun: boolean;
            applied: boolean;
          };
        };
        assert.equal(resetPacketRecoverBody.receiptCatalogCheckpointResetReceiptPacketEscrowRecovery.mode, "dry_run");
        assert.equal(resetPacketRecoverBody.receiptCatalogCheckpointResetReceiptPacketEscrowRecovery.packetsScanned, 1);
        assert.equal(resetPacketRecoverBody.receiptCatalogCheckpointResetReceiptPacketEscrowRecovery.validPackets, 1);
        assert.equal(resetPacketRecoverBody.receiptCatalogCheckpointResetReceiptPacketEscrowRecovery.recordsReceived, 1);
        assert.equal(resetPacketRecoverBody.receiptCatalogCheckpointResetReceiptPacketEscrowRecovery.eligibleRecords, 0);
        assert.equal(resetPacketRecoverBody.receiptCatalogCheckpointResetReceiptPacketEscrowRecovery.recoveredRecords, 0);
        assert.equal(resetPacketRecoverBody.receiptCatalogCheckpointResetReceiptPacketEscrowRecovery.duplicateRecords, 1);
        assert.equal(resetPacketRecoverBody.receiptCatalogCheckpointResetReceiptPacketEscrowRecovery.dryRun, true);
        assert.equal(resetPacketRecoverBody.receiptCatalogCheckpointResetReceiptPacketEscrowRecovery.applied, false);

        const resetPacketLifecycleResponse = await POST(
          new NextRequest("https://admin.contentco-op.com/api/transcode/worker", {
            method: "POST",
            headers: { "x-codeliver-media-worker-token": workerToken },
            body: JSON.stringify({
              receipt_catalog_checkpoint_reset_receipt_packet: {
                action: "lifecycle",
                mode: "dry_run",
              },
            }),
          })
        );
        assert.equal(resetPacketLifecycleResponse.status, 200);
        const resetPacketLifecycleBody = (await resetPacketLifecycleResponse.json()) as {
          receiptCatalogCheckpointResetReceiptPacketEscrowLifecycle: {
            mode: string;
            totalPackets: number;
            eligiblePackets: number;
            deletedPackets: number;
            retainedPackets: number;
            dryRun: boolean;
            applied: boolean;
            policy: { preserveLatest: boolean; legalHold: boolean };
          };
        };
        assert.equal(
          resetPacketLifecycleBody.receiptCatalogCheckpointResetReceiptPacketEscrowLifecycle.mode,
          "dry_run"
        );
        assert.equal(
          resetPacketLifecycleBody.receiptCatalogCheckpointResetReceiptPacketEscrowLifecycle.totalPackets,
          1
        );
        assert.equal(
          resetPacketLifecycleBody.receiptCatalogCheckpointResetReceiptPacketEscrowLifecycle.eligiblePackets,
          0
        );
        assert.equal(
          resetPacketLifecycleBody.receiptCatalogCheckpointResetReceiptPacketEscrowLifecycle.deletedPackets,
          0
        );
        assert.equal(
          resetPacketLifecycleBody.receiptCatalogCheckpointResetReceiptPacketEscrowLifecycle.retainedPackets,
          1
        );
        assert.equal(
          resetPacketLifecycleBody.receiptCatalogCheckpointResetReceiptPacketEscrowLifecycle.policy.preserveLatest,
          true
        );
        assert.equal(
          resetPacketLifecycleBody.receiptCatalogCheckpointResetReceiptPacketEscrowLifecycle.policy.legalHold,
          false
        );
        assert.equal(
          resetPacketLifecycleBody.receiptCatalogCheckpointResetReceiptPacketEscrowLifecycle.dryRun,
          true
        );
        assert.equal(
          resetPacketLifecycleBody.receiptCatalogCheckpointResetReceiptPacketEscrowLifecycle.applied,
          false
        );

        const resetPacketQuarantineResponse = await POST(
          new NextRequest("https://admin.contentco-op.com/api/transcode/worker", {
            method: "POST",
            headers: { "x-codeliver-media-worker-token": workerToken },
            body: JSON.stringify({
              receipt_catalog_checkpoint_reset_receipt_packet: {
                action: "quarantine",
                mode: "dry_run",
              },
            }),
          })
        );
        assert.equal(resetPacketQuarantineResponse.status, 200);
        const resetPacketQuarantineBody = (await resetPacketQuarantineResponse.json()) as {
          receiptCatalogCheckpointResetReceiptPacketEscrowQuarantine: {
            mode: string;
            scannedPackets: number;
            invalidRecords: number;
            quarantineCandidates: number;
            quarantinedPackets: number;
            retainedPackets: number;
            dryRun: boolean;
            applied: boolean;
          };
        };
        assert.equal(
          resetPacketQuarantineBody.receiptCatalogCheckpointResetReceiptPacketEscrowQuarantine.mode,
          "dry_run"
        );
        assert.equal(
          resetPacketQuarantineBody.receiptCatalogCheckpointResetReceiptPacketEscrowQuarantine.scannedPackets,
          1
        );
        assert.equal(
          resetPacketQuarantineBody.receiptCatalogCheckpointResetReceiptPacketEscrowQuarantine.invalidRecords,
          0
        );
        assert.equal(
          resetPacketQuarantineBody.receiptCatalogCheckpointResetReceiptPacketEscrowQuarantine.quarantineCandidates,
          0
        );
        assert.equal(
          resetPacketQuarantineBody.receiptCatalogCheckpointResetReceiptPacketEscrowQuarantine.quarantinedPackets,
          0
        );
        assert.equal(
          resetPacketQuarantineBody.receiptCatalogCheckpointResetReceiptPacketEscrowQuarantine.retainedPackets,
          1
        );
        assert.equal(
          resetPacketQuarantineBody.receiptCatalogCheckpointResetReceiptPacketEscrowQuarantine.dryRun,
          true
        );
        assert.equal(
          resetPacketQuarantineBody.receiptCatalogCheckpointResetReceiptPacketEscrowQuarantine.applied,
          false
        );

        const resetPacketQuarantineInventoryResponse = await POST(
          new NextRequest("https://admin.contentco-op.com/api/transcode/worker", {
            method: "POST",
            headers: { "x-codeliver-media-worker-token": workerToken },
            body: JSON.stringify({
              receipt_catalog_checkpoint_reset_receipt_packet: {
                action: "quarantine_inventory",
              },
            }),
          })
        );
        assert.equal(resetPacketQuarantineInventoryResponse.status, 200);
        const resetPacketQuarantineInventoryBody =
          (await resetPacketQuarantineInventoryResponse.json()) as {
            receiptCatalogCheckpointResetReceiptPacketQuarantineInventory: {
              quarantinedPackets: number;
              invalidRecords: number;
              oldestQuarantineAgeMs: number | null;
              latest: unknown | null;
            };
          };
        assert.equal(
          resetPacketQuarantineInventoryBody.receiptCatalogCheckpointResetReceiptPacketQuarantineInventory.quarantinedPackets,
          0
        );
        assert.equal(
          resetPacketQuarantineInventoryBody.receiptCatalogCheckpointResetReceiptPacketQuarantineInventory.invalidRecords,
          0
        );
        assert.equal(
          resetPacketQuarantineInventoryBody.receiptCatalogCheckpointResetReceiptPacketQuarantineInventory.oldestQuarantineAgeMs,
          null
        );
        assert.equal(
          resetPacketQuarantineInventoryBody.receiptCatalogCheckpointResetReceiptPacketQuarantineInventory.latest,
          null
        );

        const resetPacketQuarantineLifecycleResponse = await POST(
          new NextRequest("https://admin.contentco-op.com/api/transcode/worker", {
            method: "POST",
            headers: { "x-codeliver-media-worker-token": workerToken },
            body: JSON.stringify({
              receipt_catalog_checkpoint_reset_receipt_packet: {
                action: "quarantine_lifecycle",
                mode: "dry_run",
              },
            }),
          })
        );
        assert.equal(resetPacketQuarantineLifecycleResponse.status, 200);
        const resetPacketQuarantineLifecycleBody =
          (await resetPacketQuarantineLifecycleResponse.json()) as {
            receiptCatalogCheckpointResetReceiptPacketQuarantineLifecycle: {
              mode: string;
              totalQuarantinedPackets: number;
              eligiblePackets: number;
              deletedPackets: number;
              retainedPackets: number;
              dryRun: boolean;
              applied: boolean;
              policy: { manualReviewRequired: boolean; legalHold: boolean };
            };
          };
        assert.equal(
          resetPacketQuarantineLifecycleBody.receiptCatalogCheckpointResetReceiptPacketQuarantineLifecycle.mode,
          "dry_run"
        );
        assert.equal(
          resetPacketQuarantineLifecycleBody.receiptCatalogCheckpointResetReceiptPacketQuarantineLifecycle.totalQuarantinedPackets,
          0
        );
        assert.equal(
          resetPacketQuarantineLifecycleBody.receiptCatalogCheckpointResetReceiptPacketQuarantineLifecycle.eligiblePackets,
          0
        );
        assert.equal(
          resetPacketQuarantineLifecycleBody.receiptCatalogCheckpointResetReceiptPacketQuarantineLifecycle.deletedPackets,
          0
        );
        assert.equal(
          resetPacketQuarantineLifecycleBody.receiptCatalogCheckpointResetReceiptPacketQuarantineLifecycle.retainedPackets,
          0
        );
        assert.equal(
          resetPacketQuarantineLifecycleBody.receiptCatalogCheckpointResetReceiptPacketQuarantineLifecycle.policy.manualReviewRequired,
          true
        );
        assert.equal(
          resetPacketQuarantineLifecycleBody.receiptCatalogCheckpointResetReceiptPacketQuarantineLifecycle.policy.legalHold,
          false
        );
        assert.equal(
          resetPacketQuarantineLifecycleBody.receiptCatalogCheckpointResetReceiptPacketQuarantineLifecycle.dryRun,
          true
        );
        assert.equal(
          resetPacketQuarantineLifecycleBody.receiptCatalogCheckpointResetReceiptPacketQuarantineLifecycle.applied,
          false
        );

        const resetPacketPayload = JSON.stringify({
          resetReceiptBody,
          resetPacketExportBody,
          resetPacketImportBody,
          resetPacketEscrowBody,
          resetPacketInventoryBody,
          resetPacketRecoverBody,
          resetPacketLifecycleBody,
          resetPacketQuarantineBody,
          resetPacketQuarantineInventoryBody,
          resetPacketQuarantineLifecycleBody,
        });
        for (const forbidden of [
          job!.id,
          job!.versionId,
          job!.projectId,
          sourceKey,
          job!.artifacts!.pipelineManifest.objectKey,
          root,
          workerToken,
          signingKey,
        ]) {
          assert.equal(resetPacketPayload.includes(forbidden), false, forbidden);
        }

        const conformanceLifecycleResponse = await POST(
          new NextRequest("https://admin.contentco-op.com/api/transcode/worker", {
            method: "POST",
            headers: { "x-codeliver-media-worker-token": workerToken },
            body: JSON.stringify({
              provider_catalog_conformance_receipt_lifecycle: { mode: "dry_run" },
            }),
          })
        );
        assert.equal(conformanceLifecycleResponse.status, 200);
        const conformanceLifecycleBody = (await conformanceLifecycleResponse.json()) as {
          providerCatalogConformanceReceiptLifecycle: {
            mode: string;
            policy: {
              maxRecords: number;
              retentionMs: number;
              legalHold: boolean;
              preserveLatest: boolean;
            };
            totalRecords: number;
            eligibleRecords: number;
            deletedRecords: number;
            retainedRecords: number;
            dryRun: boolean;
            applied: boolean;
          };
        };
        assert.equal(
          conformanceLifecycleBody.providerCatalogConformanceReceiptLifecycle.mode,
          "dry_run"
        );
        assert.equal(
          conformanceLifecycleBody.providerCatalogConformanceReceiptLifecycle.policy.preserveLatest,
          true
        );
        assert.equal(
          conformanceLifecycleBody.providerCatalogConformanceReceiptLifecycle.totalRecords,
          1
        );
        assert.equal(
          conformanceLifecycleBody.providerCatalogConformanceReceiptLifecycle.eligibleRecords,
          0
        );
        assert.equal(
          conformanceLifecycleBody.providerCatalogConformanceReceiptLifecycle.deletedRecords,
          0
        );
        assert.equal(
          conformanceLifecycleBody.providerCatalogConformanceReceiptLifecycle.retainedRecords,
          1
        );
        assert.equal(
          conformanceLifecycleBody.providerCatalogConformanceReceiptLifecycle.dryRun,
          true
        );
        assert.equal(
          conformanceLifecycleBody.providerCatalogConformanceReceiptLifecycle.applied,
          false
        );

        const conformanceLifecyclePayload = JSON.stringify(conformanceLifecycleBody);
        for (const forbidden of [
          job!.id,
          job!.versionId,
          job!.projectId,
          sourceKey,
          job!.artifacts!.pipelineManifest.objectKey,
          root,
          workerToken,
          signingKey,
        ]) {
          assert.equal(conformanceLifecyclePayload.includes(forbidden), false, forbidden);
        }

        const conformancePacketExportResponse = await POST(
          new NextRequest("https://admin.contentco-op.com/api/transcode/worker", {
            method: "POST",
            headers: { "x-codeliver-media-worker-token": workerToken },
            body: JSON.stringify({
              provider_catalog_conformance_receipt_packet: { action: "export" },
            }),
          })
        );
        assert.equal(conformancePacketExportResponse.status, 200);
        const conformancePacketExportBody = (await conformancePacketExportResponse.json()) as {
          providerCatalogConformanceReceiptPacket: {
            packetDigest: string;
            recordsExported: number;
            packet: {
              type: string;
              source: { recordCount: number };
              records: unknown[];
              packetIntegrity: {
                algorithm: string;
                payloadSha256: string;
                signature: string | null;
              };
            };
          };
        };
        assert.equal(
          conformancePacketExportBody.providerCatalogConformanceReceiptPacket.recordsExported,
          1
        );
        assert.equal(
          conformancePacketExportBody.providerCatalogConformanceReceiptPacket.packet.type,
          "co_deliver_provider_catalog_conformance_receipt_packet"
        );
        assert.equal(
          conformancePacketExportBody.providerCatalogConformanceReceiptPacket.packet.source.recordCount,
          1
        );
        assert.equal(
          conformancePacketExportBody.providerCatalogConformanceReceiptPacket.packet.packetIntegrity.algorithm,
          "hmac-sha256"
        );
        assert.match(
          conformancePacketExportBody.providerCatalogConformanceReceiptPacket.packetDigest,
          /^[a-f0-9]{64}$/
        );

        const conformancePacketImportResponse = await POST(
          new NextRequest("https://admin.contentco-op.com/api/transcode/worker", {
            method: "POST",
            headers: { "x-codeliver-media-worker-token": workerToken },
            body: JSON.stringify({
              provider_catalog_conformance_receipt_packet: {
                action: "import",
                mode: "dry_run",
                packet: conformancePacketExportBody.providerCatalogConformanceReceiptPacket.packet,
              },
            }),
          })
        );
        assert.equal(conformancePacketImportResponse.status, 200);
        const conformancePacketImportBody = (await conformancePacketImportResponse.json()) as {
          providerCatalogConformanceReceiptPacketImport: {
            mode: string;
            packetIntegrity: string;
            recordsReceived: number;
            eligibleRecords: number;
            importedRecords: number;
            duplicateRecords: number;
            dryRun: boolean;
            applied: boolean;
          };
        };
        assert.equal(
          conformancePacketImportBody.providerCatalogConformanceReceiptPacketImport.mode,
          "dry_run"
        );
        assert.equal(
          conformancePacketImportBody.providerCatalogConformanceReceiptPacketImport.packetIntegrity,
          "valid_signed"
        );
        assert.equal(
          conformancePacketImportBody.providerCatalogConformanceReceiptPacketImport.recordsReceived,
          1
        );
        assert.equal(
          conformancePacketImportBody.providerCatalogConformanceReceiptPacketImport.eligibleRecords,
          0
        );
        assert.equal(
          conformancePacketImportBody.providerCatalogConformanceReceiptPacketImport.importedRecords,
          0
        );
        assert.equal(
          conformancePacketImportBody.providerCatalogConformanceReceiptPacketImport.duplicateRecords,
          1
        );
        assert.equal(
          conformancePacketImportBody.providerCatalogConformanceReceiptPacketImport.dryRun,
          true
        );
        assert.equal(
          conformancePacketImportBody.providerCatalogConformanceReceiptPacketImport.applied,
          false
        );

        const conformancePacketPayload = JSON.stringify({
          conformancePacketExportBody,
          conformancePacketImportBody,
        });
        for (const forbidden of [
          job!.id,
          job!.versionId,
          job!.projectId,
          sourceKey,
          job!.artifacts!.pipelineManifest.objectKey,
          root,
          workerToken,
          signingKey,
        ]) {
          assert.equal(conformancePacketPayload.includes(forbidden), false, forbidden);
        }

        const conformancePacketEscrowResponse = await POST(
          new NextRequest("https://admin.contentco-op.com/api/transcode/worker", {
            method: "POST",
            headers: { "x-codeliver-media-worker-token": workerToken },
            body: JSON.stringify({
              provider_catalog_conformance_receipt_packet: { action: "escrow" },
            }),
          })
        );
        assert.equal(conformancePacketEscrowResponse.status, 200);
        const conformancePacketEscrowBody = (await conformancePacketEscrowResponse.json()) as {
          providerCatalogConformanceReceiptPacketEscrow: {
            escrowed: boolean;
            packetDigest: string;
            recordsExported: number;
            packetIntegrity: string;
            signed: boolean;
          };
        };
        assert.equal(
          conformancePacketEscrowBody.providerCatalogConformanceReceiptPacketEscrow.escrowed,
          true
        );
        assert.match(
          conformancePacketEscrowBody.providerCatalogConformanceReceiptPacketEscrow.packetDigest,
          /^[a-f0-9]{64}$/
        );
        assert.equal(
          conformancePacketEscrowBody.providerCatalogConformanceReceiptPacketEscrow.recordsExported,
          1
        );
        assert.equal(
          conformancePacketEscrowBody.providerCatalogConformanceReceiptPacketEscrow.packetIntegrity,
          "hmac-sha256"
        );
        assert.equal(
          conformancePacketEscrowBody.providerCatalogConformanceReceiptPacketEscrow.signed,
          true
        );

        const conformancePacketInventoryResponse = await POST(
          new NextRequest("https://admin.contentco-op.com/api/transcode/worker", {
            method: "POST",
            headers: { "x-codeliver-media-worker-token": workerToken },
            body: JSON.stringify({
              provider_catalog_conformance_receipt_packet: { action: "inventory" },
            }),
          })
        );
        assert.equal(conformancePacketInventoryResponse.status, 200);
        const conformancePacketInventoryBody = (await conformancePacketInventoryResponse.json()) as {
          providerCatalogConformanceReceiptPacketEscrowInventory: {
            packets: number;
            duplicatePacketDigests: number;
            signedPackets: number;
            invalidIntegrityPackets: number;
            latest: {
              packetDigest: string;
              recordCount: number;
              integrityStatus: string;
            } | null;
          };
        };
        assert.equal(
          conformancePacketInventoryBody.providerCatalogConformanceReceiptPacketEscrowInventory.packets,
          1
        );
        assert.equal(
          conformancePacketInventoryBody.providerCatalogConformanceReceiptPacketEscrowInventory.duplicatePacketDigests,
          0
        );
        assert.equal(
          conformancePacketInventoryBody.providerCatalogConformanceReceiptPacketEscrowInventory.signedPackets,
          1
        );
        assert.equal(
          conformancePacketInventoryBody.providerCatalogConformanceReceiptPacketEscrowInventory.invalidIntegrityPackets,
          0
        );
        assert.match(
          String(conformancePacketInventoryBody.providerCatalogConformanceReceiptPacketEscrowInventory.latest?.packetDigest),
          /^[a-f0-9]{64}$/
        );
        assert.equal(
          conformancePacketInventoryBody.providerCatalogConformanceReceiptPacketEscrowInventory.latest?.recordCount,
          1
        );
        assert.equal(
          conformancePacketInventoryBody.providerCatalogConformanceReceiptPacketEscrowInventory.latest?.integrityStatus,
          "valid_signed"
        );

        const conformancePacketLifecycleResponse = await POST(
          new NextRequest("https://admin.contentco-op.com/api/transcode/worker", {
            method: "POST",
            headers: { "x-codeliver-media-worker-token": workerToken },
            body: JSON.stringify({
              provider_catalog_conformance_receipt_packet: {
                action: "lifecycle",
                mode: "dry_run",
              },
            }),
          })
        );
        assert.equal(conformancePacketLifecycleResponse.status, 200);
        const conformancePacketLifecycleBody =
          (await conformancePacketLifecycleResponse.json()) as {
            providerCatalogConformanceReceiptPacketEscrowLifecycle: {
              mode: string;
              policy: { preserveLatest: boolean; legalHold: boolean };
              totalPackets: number;
              eligiblePackets: number;
              deletedPackets: number;
              retainedPackets: number;
              dryRun: boolean;
              applied: boolean;
              latest: { packetDigest: string; recordCount: number } | null;
            };
          };
        assert.equal(
          conformancePacketLifecycleBody.providerCatalogConformanceReceiptPacketEscrowLifecycle.mode,
          "dry_run"
        );
        assert.equal(
          conformancePacketLifecycleBody.providerCatalogConformanceReceiptPacketEscrowLifecycle.policy.preserveLatest,
          true
        );
        assert.equal(
          conformancePacketLifecycleBody.providerCatalogConformanceReceiptPacketEscrowLifecycle.policy.legalHold,
          false
        );
        assert.equal(
          conformancePacketLifecycleBody.providerCatalogConformanceReceiptPacketEscrowLifecycle.totalPackets,
          1
        );
        assert.equal(
          conformancePacketLifecycleBody.providerCatalogConformanceReceiptPacketEscrowLifecycle.eligiblePackets,
          0
        );
        assert.equal(
          conformancePacketLifecycleBody.providerCatalogConformanceReceiptPacketEscrowLifecycle.deletedPackets,
          0
        );
        assert.equal(
          conformancePacketLifecycleBody.providerCatalogConformanceReceiptPacketEscrowLifecycle.retainedPackets,
          1
        );
        assert.equal(
          conformancePacketLifecycleBody.providerCatalogConformanceReceiptPacketEscrowLifecycle.dryRun,
          true
        );
        assert.equal(
          conformancePacketLifecycleBody.providerCatalogConformanceReceiptPacketEscrowLifecycle.applied,
          false
        );
        assert.match(
          String(conformancePacketLifecycleBody.providerCatalogConformanceReceiptPacketEscrowLifecycle.latest?.packetDigest),
          /^[a-f0-9]{64}$/
        );
        assert.equal(
          conformancePacketLifecycleBody.providerCatalogConformanceReceiptPacketEscrowLifecycle.latest?.recordCount,
          1
        );

        const conformancePacketQuarantineResponse = await POST(
          new NextRequest("https://admin.contentco-op.com/api/transcode/worker", {
            method: "POST",
            headers: { "x-codeliver-media-worker-token": workerToken },
            body: JSON.stringify({
              provider_catalog_conformance_receipt_packet: {
                action: "quarantine",
                mode: "dry_run",
              },
            }),
          })
        );
        assert.equal(conformancePacketQuarantineResponse.status, 200);
        const conformancePacketQuarantineBody =
          (await conformancePacketQuarantineResponse.json()) as {
            providerCatalogConformanceReceiptPacketEscrowQuarantine: {
              mode: string;
              scannedPackets: number;
              invalidRecords: number;
              quarantineCandidates: number;
              quarantinedPackets: number;
              retainedPackets: number;
              dryRun: boolean;
              applied: boolean;
              policy: {
                manualReviewRequired: boolean;
                preservesQuarantinedEvidence: boolean;
              };
            };
          };
        assert.equal(
          conformancePacketQuarantineBody.providerCatalogConformanceReceiptPacketEscrowQuarantine.mode,
          "dry_run"
        );
        assert.equal(
          conformancePacketQuarantineBody.providerCatalogConformanceReceiptPacketEscrowQuarantine.scannedPackets,
          1
        );
        assert.equal(
          conformancePacketQuarantineBody.providerCatalogConformanceReceiptPacketEscrowQuarantine.invalidRecords,
          0
        );
        assert.equal(
          conformancePacketQuarantineBody.providerCatalogConformanceReceiptPacketEscrowQuarantine.quarantineCandidates,
          0
        );
        assert.equal(
          conformancePacketQuarantineBody.providerCatalogConformanceReceiptPacketEscrowQuarantine.quarantinedPackets,
          0
        );
        assert.equal(
          conformancePacketQuarantineBody.providerCatalogConformanceReceiptPacketEscrowQuarantine.retainedPackets,
          1
        );
        assert.equal(
          conformancePacketQuarantineBody.providerCatalogConformanceReceiptPacketEscrowQuarantine.dryRun,
          true
        );
        assert.equal(
          conformancePacketQuarantineBody.providerCatalogConformanceReceiptPacketEscrowQuarantine.applied,
          false
        );
        assert.equal(
          conformancePacketQuarantineBody.providerCatalogConformanceReceiptPacketEscrowQuarantine.policy.manualReviewRequired,
          true
        );
        assert.equal(
          conformancePacketQuarantineBody.providerCatalogConformanceReceiptPacketEscrowQuarantine.policy.preservesQuarantinedEvidence,
          true
        );

        const conformancePacketQuarantineInventoryResponse = await POST(
          new NextRequest("https://admin.contentco-op.com/api/transcode/worker", {
            method: "POST",
            headers: { "x-codeliver-media-worker-token": workerToken },
            body: JSON.stringify({
              provider_catalog_conformance_receipt_packet: {
                action: "quarantine_inventory",
              },
            }),
          })
        );
        assert.equal(conformancePacketQuarantineInventoryResponse.status, 200);
        const conformancePacketQuarantineInventoryBody =
          (await conformancePacketQuarantineInventoryResponse.json()) as {
            providerCatalogConformanceReceiptPacketQuarantineInventory: {
              quarantinedPackets: number;
              invalidRecords: number;
              oldestQuarantineAgeMs: number | null;
              latest: { reason: string } | null;
            };
          };
        assert.equal(
          conformancePacketQuarantineInventoryBody.providerCatalogConformanceReceiptPacketQuarantineInventory.quarantinedPackets,
          0
        );
        assert.equal(
          conformancePacketQuarantineInventoryBody.providerCatalogConformanceReceiptPacketQuarantineInventory.invalidRecords,
          0
        );
        assert.equal(
          conformancePacketQuarantineInventoryBody.providerCatalogConformanceReceiptPacketQuarantineInventory.oldestQuarantineAgeMs,
          null
        );
        assert.equal(
          conformancePacketQuarantineInventoryBody.providerCatalogConformanceReceiptPacketQuarantineInventory.latest,
          null
        );

        const conformancePacketQuarantineLifecycleResponse = await POST(
          new NextRequest("https://admin.contentco-op.com/api/transcode/worker", {
            method: "POST",
            headers: { "x-codeliver-media-worker-token": workerToken },
            body: JSON.stringify({
              provider_catalog_conformance_receipt_packet: {
                action: "quarantine_lifecycle",
                mode: "dry_run",
              },
            }),
          })
        );
        assert.equal(conformancePacketQuarantineLifecycleResponse.status, 200);
        const conformancePacketQuarantineLifecycleBody =
          (await conformancePacketQuarantineLifecycleResponse.json()) as {
            providerCatalogConformanceReceiptPacketQuarantineLifecycle: {
              totalQuarantinedPackets: number;
              eligiblePackets: number;
              deletedPackets: number;
              retainedPackets: number;
              dryRun: boolean;
              applied: boolean;
              policy: {
                preserveLatest: boolean;
                manualReviewRequired: boolean;
              };
            };
          };
        assert.equal(
          conformancePacketQuarantineLifecycleBody.providerCatalogConformanceReceiptPacketQuarantineLifecycle.totalQuarantinedPackets,
          0
        );
        assert.equal(
          conformancePacketQuarantineLifecycleBody.providerCatalogConformanceReceiptPacketQuarantineLifecycle.eligiblePackets,
          0
        );
        assert.equal(
          conformancePacketQuarantineLifecycleBody.providerCatalogConformanceReceiptPacketQuarantineLifecycle.deletedPackets,
          0
        );
        assert.equal(
          conformancePacketQuarantineLifecycleBody.providerCatalogConformanceReceiptPacketQuarantineLifecycle.retainedPackets,
          0
        );
        assert.equal(
          conformancePacketQuarantineLifecycleBody.providerCatalogConformanceReceiptPacketQuarantineLifecycle.dryRun,
          true
        );
        assert.equal(
          conformancePacketQuarantineLifecycleBody.providerCatalogConformanceReceiptPacketQuarantineLifecycle.applied,
          false
        );
        assert.equal(
          conformancePacketQuarantineLifecycleBody.providerCatalogConformanceReceiptPacketQuarantineLifecycle.policy.preserveLatest,
          true
        );
        assert.equal(
          conformancePacketQuarantineLifecycleBody.providerCatalogConformanceReceiptPacketQuarantineLifecycle.policy.manualReviewRequired,
          true
        );

        const conformancePacketQuarantineAttestationResponse = await POST(
          new NextRequest("https://admin.contentco-op.com/api/transcode/worker", {
            method: "POST",
            headers: { "x-codeliver-media-worker-token": workerToken },
            body: JSON.stringify({
              provider_catalog_conformance_receipt_packet: {
                action: "quarantine_attest",
                decision: "reviewed",
              },
            }),
          })
        );
        assert.equal(conformancePacketQuarantineAttestationResponse.status, 200);
        const conformancePacketQuarantineAttestationBody =
          (await conformancePacketQuarantineAttestationResponse.json()) as {
            providerCatalogConformanceReceiptPacketQuarantineAttestation: {
              attested: boolean;
              decision: string;
              quarantinedPackets: number;
              quarantineSnapshotDigest: string;
              attestationPayloadSha256: string;
              attestationIntegrity: string;
              signed: boolean;
            };
          };
        assert.equal(
          conformancePacketQuarantineAttestationBody.providerCatalogConformanceReceiptPacketQuarantineAttestation.attested,
          true
        );
        assert.equal(
          conformancePacketQuarantineAttestationBody.providerCatalogConformanceReceiptPacketQuarantineAttestation.decision,
          "reviewed"
        );
        assert.equal(
          conformancePacketQuarantineAttestationBody.providerCatalogConformanceReceiptPacketQuarantineAttestation.quarantinedPackets,
          0
        );
        assert.match(
          conformancePacketQuarantineAttestationBody.providerCatalogConformanceReceiptPacketQuarantineAttestation.quarantineSnapshotDigest,
          /^[a-f0-9]{64}$/
        );
        assert.match(
          conformancePacketQuarantineAttestationBody.providerCatalogConformanceReceiptPacketQuarantineAttestation.attestationPayloadSha256,
          /^[a-f0-9]{64}$/
        );
        assert.equal(
          conformancePacketQuarantineAttestationBody.providerCatalogConformanceReceiptPacketQuarantineAttestation.attestationIntegrity,
          "hmac-sha256"
        );
        assert.equal(
          conformancePacketQuarantineAttestationBody.providerCatalogConformanceReceiptPacketQuarantineAttestation.signed,
          true
        );

        const conformancePacketQuarantineAttestationInventoryResponse = await POST(
          new NextRequest("https://admin.contentco-op.com/api/transcode/worker", {
            method: "POST",
            headers: { "x-codeliver-media-worker-token": workerToken },
            body: JSON.stringify({
              provider_catalog_conformance_receipt_packet: {
                action: "quarantine_attestation_inventory",
              },
            }),
          })
        );
        assert.equal(conformancePacketQuarantineAttestationInventoryResponse.status, 200);
        const conformancePacketQuarantineAttestationInventoryBody =
          (await conformancePacketQuarantineAttestationInventoryResponse.json()) as {
            providerCatalogConformanceReceiptPacketQuarantineAttestationInventory: {
              attestations: number;
              reviewedAttestations: number;
              signedAttestations: number;
              invalidIntegrityAttestations: number;
              payloadMismatchAttestations: number;
              latest: {
                decision: string;
                quarantineSnapshotDigest: string;
                quarantinedPackets: number;
                signed: boolean;
                integrityStatus: string;
              } | null;
            };
          };
        assert.equal(
          conformancePacketQuarantineAttestationInventoryBody.providerCatalogConformanceReceiptPacketQuarantineAttestationInventory.attestations,
          1
        );
        assert.equal(
          conformancePacketQuarantineAttestationInventoryBody.providerCatalogConformanceReceiptPacketQuarantineAttestationInventory.reviewedAttestations,
          1
        );
        assert.equal(
          conformancePacketQuarantineAttestationInventoryBody.providerCatalogConformanceReceiptPacketQuarantineAttestationInventory.signedAttestations,
          1
        );
        assert.equal(
          conformancePacketQuarantineAttestationInventoryBody.providerCatalogConformanceReceiptPacketQuarantineAttestationInventory.invalidIntegrityAttestations,
          0
        );
        assert.equal(
          conformancePacketQuarantineAttestationInventoryBody.providerCatalogConformanceReceiptPacketQuarantineAttestationInventory.payloadMismatchAttestations,
          0
        );
        assert.equal(
          conformancePacketQuarantineAttestationInventoryBody.providerCatalogConformanceReceiptPacketQuarantineAttestationInventory.latest?.decision,
          "reviewed"
        );
        assert.equal(
          conformancePacketQuarantineAttestationInventoryBody.providerCatalogConformanceReceiptPacketQuarantineAttestationInventory.latest?.quarantinedPackets,
          0
        );
        assert.equal(
          conformancePacketQuarantineAttestationInventoryBody.providerCatalogConformanceReceiptPacketQuarantineAttestationInventory.latest?.signed,
          true
        );
        assert.equal(
          conformancePacketQuarantineAttestationInventoryBody.providerCatalogConformanceReceiptPacketQuarantineAttestationInventory.latest?.integrityStatus,
          "valid_signed"
        );

        const conformancePacketQuarantineAttestationLifecycleResponse = await POST(
          new NextRequest("https://admin.contentco-op.com/api/transcode/worker", {
            method: "POST",
            headers: { "x-codeliver-media-worker-token": workerToken },
            body: JSON.stringify({
              provider_catalog_conformance_receipt_packet: {
                action: "quarantine_attestation_lifecycle",
                mode: "dry_run",
              },
            }),
          })
        );
        assert.equal(conformancePacketQuarantineAttestationLifecycleResponse.status, 200);
        const conformancePacketQuarantineAttestationLifecycleBody =
          (await conformancePacketQuarantineAttestationLifecycleResponse.json()) as {
            providerCatalogConformanceReceiptPacketQuarantineAttestationLifecycle: {
              totalAttestations: number;
              eligibleAttestations: number;
              deletedAttestations: number;
              blockedByLegalHold: number;
              dryRun: boolean;
              applied: boolean;
              policy: {
                preserveLatest: boolean;
                manualReviewRequired: boolean;
              };
            };
          };
        assert.equal(
          conformancePacketQuarantineAttestationLifecycleBody.providerCatalogConformanceReceiptPacketQuarantineAttestationLifecycle.totalAttestations,
          1
        );
        assert.equal(
          conformancePacketQuarantineAttestationLifecycleBody.providerCatalogConformanceReceiptPacketQuarantineAttestationLifecycle.eligibleAttestations,
          0
        );
        assert.equal(
          conformancePacketQuarantineAttestationLifecycleBody.providerCatalogConformanceReceiptPacketQuarantineAttestationLifecycle.deletedAttestations,
          0
        );
        assert.equal(
          conformancePacketQuarantineAttestationLifecycleBody.providerCatalogConformanceReceiptPacketQuarantineAttestationLifecycle.blockedByLegalHold,
          0
        );
        assert.equal(
          conformancePacketQuarantineAttestationLifecycleBody.providerCatalogConformanceReceiptPacketQuarantineAttestationLifecycle.dryRun,
          true
        );
        assert.equal(
          conformancePacketQuarantineAttestationLifecycleBody.providerCatalogConformanceReceiptPacketQuarantineAttestationLifecycle.applied,
          false
        );
        assert.equal(
          conformancePacketQuarantineAttestationLifecycleBody.providerCatalogConformanceReceiptPacketQuarantineAttestationLifecycle.policy.preserveLatest,
          true
        );
        assert.equal(
          conformancePacketQuarantineAttestationLifecycleBody.providerCatalogConformanceReceiptPacketQuarantineAttestationLifecycle.policy.manualReviewRequired,
          true
        );

        const conformancePacketEscrowPayload = JSON.stringify({
          conformancePacketEscrowBody,
          conformancePacketInventoryBody,
          conformancePacketLifecycleBody,
          conformancePacketQuarantineBody,
          conformancePacketQuarantineInventoryBody,
          conformancePacketQuarantineLifecycleBody,
          conformancePacketQuarantineAttestationBody,
          conformancePacketQuarantineAttestationInventoryBody,
          conformancePacketQuarantineAttestationLifecycleBody,
        });
        for (const forbidden of [
          job!.id,
          job!.versionId,
          job!.projectId,
          sourceKey,
          job!.artifacts!.pipelineManifest.objectKey,
          root,
          workerToken,
          signingKey,
        ]) {
          assert.equal(conformancePacketEscrowPayload.includes(forbidden), false, forbidden);
        }

        const receiptResponse = await POST(
          new NextRequest("https://admin.contentco-op.com/api/transcode/worker", {
            method: "POST",
            headers: { "x-codeliver-media-worker-token": workerToken },
            body: JSON.stringify({
              restore_attestation_version_id: job!.versionId,
            }),
          })
        );
        assert.equal(receiptResponse.status, 200);
        const receiptBody = (await receiptResponse.json()) as {
          receipt: {
            persisted: boolean;
            reason: string | null;
            attestation: { status: string; ready: boolean };
            receipt: {
              objectKeyDigest: string | null;
              provider: string | null;
              size: number | null;
              sha256: string | null;
              integrity: string | null;
              signed: boolean;
            };
          };
        };
        assert.equal(receiptBody.receipt.persisted, true);
        assert.equal(receiptBody.receipt.reason, null);
        assert.equal(receiptBody.receipt.attestation.status, "ready");
        assert.equal(receiptBody.receipt.attestation.ready, true);
        assert.match(String(receiptBody.receipt.receipt.objectKeyDigest), /^[a-f0-9]{64}$/);
        assert.equal(receiptBody.receipt.receipt.provider, "local");
        assert.match(String(receiptBody.receipt.receipt.sha256), /^[a-f0-9]{64}$/);
        assert.equal(receiptBody.receipt.receipt.integrity, "hmac-sha256");
        assert.equal(receiptBody.receipt.receipt.signed, true);

        const receiptPayloads = restoreReceiptPayloads(root);
        const storedReceiptPayloads = receiptPayloads.filter((receipt) =>
          receipt.path.includes("/tenants/")
        );
        assert.equal(storedReceiptPayloads.length, 1);
        const storedReceipt = JSON.parse(storedReceiptPayloads[0].raw) as {
          type: string;
          evidence: {
            attestationPayloadSha256: string;
            ready: boolean;
            status: string;
          };
          receiptIntegrity: {
            algorithm: string;
            payloadSha256: string;
            signature: string | null;
            signingKeyDigest: string | null;
          };
        };
        assert.equal(storedReceipt.type, "co_deliver_restore_attestation_receipt");
        assert.match(storedReceipt.evidence.attestationPayloadSha256, /^[a-f0-9]{64}$/);
        assert.equal(storedReceipt.evidence.ready, true);
        assert.equal(storedReceipt.evidence.status, "ready");
        assert.equal(storedReceipt.receiptIntegrity.algorithm, "hmac-sha256");
        assert.match(storedReceipt.receiptIntegrity.payloadSha256, /^[a-f0-9]{64}$/);
        assert.match(String(storedReceipt.receiptIntegrity.signature), /^[a-f0-9]{64}$/);
        assert.match(String(storedReceipt.receiptIntegrity.signingKeyDigest), /^[a-f0-9]{64}$/);

        const receiptResponsePayload = JSON.stringify(receiptBody);
        const receiptStoragePayload = receiptPayloads.map((receipt) => receipt.raw).join("\n");
        for (const forbidden of [
          job!.id,
          job!.versionId,
          job!.projectId,
          sourceKey,
          job!.artifacts!.pipelineManifest.objectKey,
          root,
          workerToken,
          signingKey,
        ]) {
          assert.equal(receiptResponsePayload.includes(forbidden), false, forbidden);
          assert.equal(receiptStoragePayload.includes(forbidden), false, forbidden);
        }

        rmSync(
          join(root, ".codeliver-ingest/control/media-pipeline/restore-receipts"),
          { recursive: true, force: true }
        );
        const dryRunRepair = await POST(
          new NextRequest("https://admin.contentco-op.com/api/transcode/worker", {
            method: "POST",
            headers: { "x-codeliver-media-worker-token": workerToken },
            body: JSON.stringify({
              restore_receipt_repair: { mode: "dry_run" },
            }),
          })
        );
        assert.equal(dryRunRepair.status, 200);
        const dryRunRepairBody = (await dryRunRepair.json()) as {
          repair: {
            supported: boolean;
            dryRun: boolean;
            applied: boolean;
            discoveredReceipts: number;
            eligibleReceipts: number;
            repairedReceipts: number;
          };
        };
        assert.equal(dryRunRepairBody.repair.supported, true);
        assert.equal(dryRunRepairBody.repair.dryRun, true);
        assert.equal(dryRunRepairBody.repair.applied, false);
        assert.equal(dryRunRepairBody.repair.discoveredReceipts, 1);
        assert.equal(dryRunRepairBody.repair.eligibleReceipts, 1);
        assert.equal(dryRunRepairBody.repair.repairedReceipts, 0);

        const applyRepair = await POST(
          new NextRequest("https://admin.contentco-op.com/api/transcode/worker", {
            method: "POST",
            headers: { "x-codeliver-media-worker-token": workerToken },
            body: JSON.stringify({
              restore_receipt_repair: { mode: "apply" },
            }),
          })
        );
        assert.equal(applyRepair.status, 200);
        const applyRepairBody = (await applyRepair.json()) as {
          repair: {
            supported: boolean;
            dryRun: boolean;
            applied: boolean;
            discoveredReceipts: number;
            eligibleReceipts: number;
            repairedReceipts: number;
          };
        };
        assert.equal(applyRepairBody.repair.supported, true);
        assert.equal(applyRepairBody.repair.dryRun, false);
        assert.equal(applyRepairBody.repair.applied, true);
        assert.equal(applyRepairBody.repair.discoveredReceipts, 1);
        assert.equal(applyRepairBody.repair.eligibleReceipts, 1);
        assert.equal(applyRepairBody.repair.repairedReceipts, 1);

        const checkpointReset = await POST(
          new NextRequest("https://admin.contentco-op.com/api/transcode/worker", {
            method: "POST",
            headers: { "x-codeliver-media-worker-token": workerToken },
            body: JSON.stringify({
              receipt_catalog_checkpoint_reset: { mode: "dry_run" },
            }),
          })
        );
        assert.equal(checkpointReset.status, 200);
        const checkpointResetBody = (await checkpointReset.json()) as {
          receiptCatalogCheckpointReset: {
            mode: string;
            checkpointRecords: number;
            invalidRecords: number;
            resetCandidates: number;
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
            };
          };
        };
        assert.equal(checkpointResetBody.receiptCatalogCheckpointReset.mode, "dry_run");
        assert.equal(checkpointResetBody.receiptCatalogCheckpointReset.checkpointRecords, 0);
        assert.equal(checkpointResetBody.receiptCatalogCheckpointReset.invalidRecords, 0);
        assert.equal(checkpointResetBody.receiptCatalogCheckpointReset.resetCandidates, 0);
        assert.equal(checkpointResetBody.receiptCatalogCheckpointReset.deletedCheckpoints, 0);
        assert.equal(checkpointResetBody.receiptCatalogCheckpointReset.dryRun, true);
        assert.equal(checkpointResetBody.receiptCatalogCheckpointReset.applied, false);
        assert.equal(
          checkpointResetBody.receiptCatalogCheckpointReset.policy.checkpointDirectoryOnly,
          true
        );
        assert.equal(
          checkpointResetBody.receiptCatalogCheckpointReset.policy.preservesReceiptObjects,
          true
        );
        assert.equal(
          checkpointResetBody.receiptCatalogCheckpointReset.policy.rawCursorsRedacted,
          true
        );
        assert.equal(checkpointResetBody.receiptCatalogCheckpointReset.receipt.recorded, false);

        const checkpointResetApply = await POST(
          new NextRequest("https://admin.contentco-op.com/api/transcode/worker", {
            method: "POST",
            headers: { "x-codeliver-media-worker-token": workerToken },
            body: JSON.stringify({
              receipt_catalog_checkpoint_reset: { mode: "apply" },
            }),
          })
        );
        assert.equal(checkpointResetApply.status, 200);
        const checkpointResetApplyBody = (await checkpointResetApply.json()) as {
          receiptCatalogCheckpointReset: {
            mode: string;
            resetCandidates: number;
            deletedCheckpoints: number;
            applied: boolean;
            receipt: {
              recorded: boolean;
              resetSnapshotDigest: string | null;
              receiptPayloadSha256: string | null;
              integrity: string | null;
              signed: boolean;
            };
          };
        };
        assert.equal(checkpointResetApplyBody.receiptCatalogCheckpointReset.mode, "apply");
        assert.equal(checkpointResetApplyBody.receiptCatalogCheckpointReset.resetCandidates, 0);
        assert.equal(checkpointResetApplyBody.receiptCatalogCheckpointReset.deletedCheckpoints, 0);
        assert.equal(checkpointResetApplyBody.receiptCatalogCheckpointReset.applied, false);
        assert.equal(
          checkpointResetApplyBody.receiptCatalogCheckpointReset.receipt.recorded,
          true
        );
        assert.match(
          String(
            checkpointResetApplyBody.receiptCatalogCheckpointReset.receipt
              .resetSnapshotDigest
          ),
          /^[a-f0-9]{64}$/
        );
        assert.match(
          String(
            checkpointResetApplyBody.receiptCatalogCheckpointReset.receipt
              .receiptPayloadSha256
          ),
          /^[a-f0-9]{64}$/
        );
        assert.equal(
          checkpointResetApplyBody.receiptCatalogCheckpointReset.receipt.integrity,
          "hmac-sha256"
        );
        assert.equal(
          checkpointResetApplyBody.receiptCatalogCheckpointReset.receipt.signed,
          true
        );

        const checkpointResetLifecycle = await POST(
          new NextRequest("https://admin.contentco-op.com/api/transcode/worker", {
            method: "POST",
            headers: { "x-codeliver-media-worker-token": workerToken },
            body: JSON.stringify({
              receipt_catalog_checkpoint_reset_lifecycle: { mode: "dry_run" },
            }),
          })
        );
        assert.equal(checkpointResetLifecycle.status, 200);
        const checkpointResetLifecycleBody = (await checkpointResetLifecycle.json()) as {
          receiptCatalogCheckpointResetLifecycle: {
            mode: string;
            totalReceipts: number;
            eligibleReceipts: number;
            deletedReceipts: number;
            dryRun: boolean;
            applied: boolean;
            policy: {
              preserveLatest: boolean;
              legalHold: boolean;
            };
          };
        };
        assert.equal(
          checkpointResetLifecycleBody.receiptCatalogCheckpointResetLifecycle.mode,
          "dry_run"
        );
        assert.equal(
          checkpointResetLifecycleBody.receiptCatalogCheckpointResetLifecycle.totalReceipts,
          2
        );
        assert.equal(
          checkpointResetLifecycleBody.receiptCatalogCheckpointResetLifecycle.eligibleReceipts,
          0
        );
        assert.equal(
          checkpointResetLifecycleBody.receiptCatalogCheckpointResetLifecycle.deletedReceipts,
          0
        );
        assert.equal(
          checkpointResetLifecycleBody.receiptCatalogCheckpointResetLifecycle.dryRun,
          true
        );
        assert.equal(
          checkpointResetLifecycleBody.receiptCatalogCheckpointResetLifecycle.applied,
          false
        );
        assert.equal(
          checkpointResetLifecycleBody.receiptCatalogCheckpointResetLifecycle.policy
            .preserveLatest,
          true
        );

        const repairPayload = JSON.stringify({
          dryRunRepairBody,
          applyRepairBody,
          checkpointResetBody,
          checkpointResetApplyBody,
          checkpointResetLifecycleBody,
        });
        for (const forbidden of [
          job!.id,
          job!.versionId,
          job!.projectId,
          sourceKey,
          job!.artifacts!.pipelineManifest.objectKey,
          root,
          workerToken,
          signingKey,
        ]) {
          assert.equal(repairPayload.includes(forbidden), false, forbidden);
        }
      }
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
