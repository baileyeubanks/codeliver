import { NextRequest, NextResponse } from "next/server";

import { createMediaPipelineService } from "@/lib/media-pipeline/service";
import { toPublicMediaPipelineJob } from "@/lib/media-pipeline/types";
import { parseMediaWorkerRequest } from "@/lib/media-pipeline/worker-request";

import { authorizedMediaWorker } from "../_lib/worker-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!authorizedMediaWorker(req)) {
    return NextResponse.json({ error: "Worker authorization required" }, { status: 401 });
  }

  try {
    const service = createMediaPipelineService();
    const restoreVersionId = req.nextUrl.searchParams.get("restore_attestation_version_id");
    if (restoreVersionId !== null) {
      if (!restoreVersionId.trim()) {
        return NextResponse.json(
          { error: "restore_attestation_version_id must be a non-empty string" },
          { status: 400 }
        );
      }
      return NextResponse.json({
        attestation: await service.restoreAttestation(restoreVersionId),
      });
    }
    return NextResponse.json({ diagnostics: await service.diagnostics() });
  } catch {
    return NextResponse.json({ error: "Media worker request is unavailable" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  if (!authorizedMediaWorker(req)) {
    return NextResponse.json({ error: "Worker authorization required" }, { status: 401 });
  }
  const body = parseMediaWorkerRequest(await req.text());
  if (!body.ok) {
    return NextResponse.json({ error: body.error }, { status: 400 });
  }

  try {
    const service = createMediaPipelineService();
    if (body.restoreAttestationVersionId) {
      return NextResponse.json({
        receipt: await service.persistRestoreAttestationReceipt(body.restoreAttestationVersionId),
      });
    }
    if (body.restoreReceiptRepairMode) {
      return NextResponse.json({
        repair: await service.repairRestoreReceiptIndex(body.restoreReceiptRepairMode, {
          continuationToken: body.restoreReceiptContinuationToken,
        }),
      });
    }
    if (body.receiptCatalogCheckpointResetMode) {
      return NextResponse.json({
        receiptCatalogCheckpointReset:
          await service.resetReceiptCatalogCheckpoints(
            body.receiptCatalogCheckpointResetMode
          ),
      });
    }
    if (body.receiptCatalogCheckpointResetLifecycleMode) {
      return NextResponse.json({
        receiptCatalogCheckpointResetLifecycle:
          await service.receiptCatalogCheckpointResetReceiptLifecycle(
            body.receiptCatalogCheckpointResetLifecycleMode
          ),
      });
    }
    if (body.receiptCatalogCheckpointResetReceiptPacket) {
      if (body.receiptCatalogCheckpointResetReceiptPacket.action === "export") {
        return NextResponse.json({
          receiptCatalogCheckpointResetReceiptPacket:
            await service.exportReceiptCatalogCheckpointResetReceiptPacket(),
        });
      }
      if (body.receiptCatalogCheckpointResetReceiptPacket.action === "escrow") {
        return NextResponse.json({
          receiptCatalogCheckpointResetReceiptPacketEscrow:
            await service.escrowReceiptCatalogCheckpointResetReceiptPacket(),
        });
      }
      if (body.receiptCatalogCheckpointResetReceiptPacket.action === "inventory") {
        return NextResponse.json({
          receiptCatalogCheckpointResetReceiptPacketEscrowInventory:
            await service.receiptCatalogCheckpointResetReceiptPacketEscrowInventory(),
        });
      }
      if (body.receiptCatalogCheckpointResetReceiptPacket.action === "lifecycle") {
        return NextResponse.json({
          receiptCatalogCheckpointResetReceiptPacketEscrowLifecycle:
            await service.receiptCatalogCheckpointResetReceiptPacketEscrowLifecycle(
              body.receiptCatalogCheckpointResetReceiptPacket.mode
            ),
        });
      }
      if (body.receiptCatalogCheckpointResetReceiptPacket.action === "quarantine") {
        return NextResponse.json({
          receiptCatalogCheckpointResetReceiptPacketEscrowQuarantine:
            await service.quarantineReceiptCatalogCheckpointResetReceiptPacketEscrow(
              body.receiptCatalogCheckpointResetReceiptPacket.mode
            ),
        });
      }
      if (body.receiptCatalogCheckpointResetReceiptPacket.action === "quarantine_inventory") {
        return NextResponse.json({
          receiptCatalogCheckpointResetReceiptPacketQuarantineInventory:
            await service.receiptCatalogCheckpointResetReceiptPacketQuarantineInventory(),
        });
      }
      if (body.receiptCatalogCheckpointResetReceiptPacket.action === "quarantine_lifecycle") {
        return NextResponse.json({
          receiptCatalogCheckpointResetReceiptPacketQuarantineLifecycle:
            await service.receiptCatalogCheckpointResetReceiptPacketQuarantineLifecycle(
              body.receiptCatalogCheckpointResetReceiptPacket.mode
            ),
        });
      }
      if (body.receiptCatalogCheckpointResetReceiptPacket.action === "recover") {
        return NextResponse.json({
          receiptCatalogCheckpointResetReceiptPacketEscrowRecovery:
            await service.recoverReceiptCatalogCheckpointResetReceiptsFromPacketEscrow(
              body.receiptCatalogCheckpointResetReceiptPacket.mode
            ),
        });
      }
      return NextResponse.json({
        receiptCatalogCheckpointResetReceiptPacketImport:
          await service.importReceiptCatalogCheckpointResetReceiptPacket(
            body.receiptCatalogCheckpointResetReceiptPacket.packet,
            body.receiptCatalogCheckpointResetReceiptPacket.mode
          ),
      });
    }
    if (body.providerCatalogConformance) {
      if (body.providerCatalogConformance.persist) {
        return NextResponse.json({
          providerCatalogConformanceReceipt:
            await service.persistProviderCatalogConformanceReceipt(
              body.providerCatalogConformance
            ),
        });
      }
      return NextResponse.json({
        providerCatalogConformance: await service.providerCatalogConformance(
          body.providerCatalogConformance
        ),
      });
    }
    if (body.providerCatalogConformanceReceiptLifecycleMode) {
      return NextResponse.json({
        providerCatalogConformanceReceiptLifecycle:
          await service.providerCatalogConformanceReceiptLifecycle(
            body.providerCatalogConformanceReceiptLifecycleMode
          ),
      });
    }
    if (body.providerCatalogConformanceReceiptPacket) {
      if (body.providerCatalogConformanceReceiptPacket.action === "export") {
        return NextResponse.json({
          providerCatalogConformanceReceiptPacket:
            await service.exportProviderCatalogConformanceReceiptPacket(),
        });
      }
      if (body.providerCatalogConformanceReceiptPacket.action === "escrow") {
        return NextResponse.json({
          providerCatalogConformanceReceiptPacketEscrow:
            await service.escrowProviderCatalogConformanceReceiptPacket(),
        });
      }
      if (body.providerCatalogConformanceReceiptPacket.action === "inventory") {
        return NextResponse.json({
          providerCatalogConformanceReceiptPacketEscrowInventory:
            await service.providerCatalogConformancePacketEscrowInventory(),
        });
      }
      if (body.providerCatalogConformanceReceiptPacket.action === "lifecycle") {
        return NextResponse.json({
          providerCatalogConformanceReceiptPacketEscrowLifecycle:
            await service.providerCatalogConformancePacketEscrowLifecycle(
              body.providerCatalogConformanceReceiptPacket.mode
            ),
        });
      }
      if (body.providerCatalogConformanceReceiptPacket.action === "quarantine") {
        return NextResponse.json({
          providerCatalogConformanceReceiptPacketEscrowQuarantine:
            await service.quarantineProviderCatalogConformancePacketEscrow(
              body.providerCatalogConformanceReceiptPacket.mode
            ),
        });
      }
      if (body.providerCatalogConformanceReceiptPacket.action === "quarantine_inventory") {
        return NextResponse.json({
          providerCatalogConformanceReceiptPacketQuarantineInventory:
            await service.providerCatalogConformancePacketQuarantineInventory(),
        });
      }
      if (body.providerCatalogConformanceReceiptPacket.action === "quarantine_lifecycle") {
        return NextResponse.json({
          providerCatalogConformanceReceiptPacketQuarantineLifecycle:
            await service.providerCatalogConformancePacketQuarantineLifecycle(
              body.providerCatalogConformanceReceiptPacket.mode
            ),
        });
      }
      if (body.providerCatalogConformanceReceiptPacket.action === "quarantine_attest") {
        return NextResponse.json({
          providerCatalogConformanceReceiptPacketQuarantineAttestation:
            await service.attestProviderCatalogConformancePacketQuarantine(
              body.providerCatalogConformanceReceiptPacket.decision
            ),
        });
      }
      if (
        body.providerCatalogConformanceReceiptPacket.action ===
        "quarantine_attestation_inventory"
      ) {
        return NextResponse.json({
          providerCatalogConformanceReceiptPacketQuarantineAttestationInventory:
            await service.providerCatalogConformancePacketQuarantineAttestationInventory(),
        });
      }
      if (
        body.providerCatalogConformanceReceiptPacket.action ===
        "quarantine_attestation_lifecycle"
      ) {
        return NextResponse.json({
          providerCatalogConformanceReceiptPacketQuarantineAttestationLifecycle:
            await service.providerCatalogConformancePacketQuarantineAttestationLifecycle(
              body.providerCatalogConformanceReceiptPacket.mode
            ),
        });
      }
      if (body.providerCatalogConformanceReceiptPacket.action === "recover") {
        return NextResponse.json({
          providerCatalogConformanceReceiptPacketEscrowRecovery:
            await service.recoverProviderCatalogConformanceReceiptsFromPacketEscrow(
              body.providerCatalogConformanceReceiptPacket.mode
            ),
        });
      }
      return NextResponse.json({
        providerCatalogConformanceReceiptPacketImport:
          await service.importProviderCatalogConformanceReceiptPacket(
            body.providerCatalogConformanceReceiptPacket.packet,
            body.providerCatalogConformanceReceiptPacket.mode
          ),
      });
    }
    const result =
      body.jobId
        ? await service.runJob(body.jobId)
        : await service.recoverAndRunNext();
    return NextResponse.json({
      outcome: result.outcome,
      job: result.job ? toPublicMediaPipelineJob(result.job) : null,
    });
  } catch {
    return NextResponse.json({ error: "Media worker could not run" }, { status: 503 });
  }
}
