export type MediaWorkerRequest =
  | {
      ok: true;
      jobId?: string;
      restoreAttestationVersionId?: string;
      restoreReceiptRepairMode?: "dry_run" | "apply";
      restoreReceiptContinuationToken?: string;
      receiptCatalogCheckpointResetMode?: "dry_run" | "apply";
      receiptCatalogCheckpointResetLifecycleMode?: "dry_run" | "apply";
      receiptCatalogCheckpointResetReceiptPacket?:
        | { action: "export" }
        | { action: "escrow" }
        | { action: "inventory" }
        | { action: "lifecycle"; mode: "dry_run" | "apply" }
        | { action: "quarantine"; mode: "dry_run" | "apply" }
        | { action: "quarantine_inventory" }
        | { action: "quarantine_lifecycle"; mode: "dry_run" | "apply" }
        | { action: "recover"; mode: "dry_run" | "apply" }
        | { action: "import"; mode: "dry_run" | "apply"; packet: Record<string, unknown> };
      providerCatalogConformance?: {
        scanLimit?: number;
        pageLimit?: number;
        persist?: boolean;
      };
      providerCatalogConformanceReceiptLifecycleMode?: "dry_run" | "apply";
      providerCatalogConformanceReceiptPacket?:
        | { action: "export" }
        | { action: "escrow" }
        | { action: "inventory" }
        | { action: "lifecycle"; mode: "dry_run" | "apply" }
        | { action: "quarantine"; mode: "dry_run" | "apply" }
        | { action: "quarantine_inventory" }
        | { action: "quarantine_lifecycle"; mode: "dry_run" | "apply" }
        | { action: "quarantine_attest"; decision: "reviewed" | "retained" | "released" }
        | { action: "quarantine_attestation_inventory" }
        | { action: "quarantine_attestation_lifecycle"; mode: "dry_run" | "apply" }
        | { action: "recover"; mode: "dry_run" | "apply" }
        | { action: "import"; mode: "dry_run" | "apply"; packet: Record<string, unknown> };
    }
  | { ok: false; error: string };

export function parseMediaWorkerRequest(rawBody: string): MediaWorkerRequest {
  if (!rawBody.trim()) return { ok: true };

  let value: unknown;
  try {
    value = JSON.parse(rawBody) as unknown;
  } catch {
    return { ok: false, error: "Expected a JSON request body" };
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Expected a JSON object body" };
  }

  const jobId = (value as Record<string, unknown>).job_id;
  const restoreAttestationVersionId = (value as Record<string, unknown>)
    .restore_attestation_version_id;
  const restoreReceiptRepair = (value as Record<string, unknown>).restore_receipt_repair;
  const receiptCatalogCheckpointReset = (value as Record<string, unknown>)
    .receipt_catalog_checkpoint_reset;
  const receiptCatalogCheckpointResetLifecycle = (value as Record<string, unknown>)
    .receipt_catalog_checkpoint_reset_lifecycle;
  const receiptCatalogCheckpointResetReceiptPacket = (value as Record<string, unknown>)
    .receipt_catalog_checkpoint_reset_receipt_packet;
  const providerCatalogConformance = (value as Record<string, unknown>)
    .provider_catalog_conformance;
  const providerCatalogConformanceReceiptLifecycle = (value as Record<string, unknown>)
    .provider_catalog_conformance_receipt_lifecycle;
  const providerCatalogConformanceReceiptPacket = (value as Record<string, unknown>)
    .provider_catalog_conformance_receipt_packet;
  const commandCount = [
    jobId !== undefined,
    restoreAttestationVersionId !== undefined,
    restoreReceiptRepair !== undefined,
    receiptCatalogCheckpointReset !== undefined,
    receiptCatalogCheckpointResetLifecycle !== undefined,
    receiptCatalogCheckpointResetReceiptPacket !== undefined,
    providerCatalogConformance !== undefined,
    providerCatalogConformanceReceiptLifecycle !== undefined,
    providerCatalogConformanceReceiptPacket !== undefined,
  ].filter(Boolean).length;
  if (commandCount > 1) {
    return {
      ok: false,
      error: "Choose only one worker command",
    };
  }
  if (jobId !== undefined) {
    if (typeof jobId !== "string" || !jobId.trim()) {
      return { ok: false, error: "job_id must be a non-empty string" };
    }
    return { ok: true, jobId };
  }
  if (restoreAttestationVersionId !== undefined) {
    if (
      typeof restoreAttestationVersionId !== "string" ||
      !restoreAttestationVersionId.trim()
    ) {
      return {
        ok: false,
        error: "restore_attestation_version_id must be a non-empty string",
      };
    }
    return { ok: true, restoreAttestationVersionId };
  }
  if (providerCatalogConformance !== undefined) {
    if (
      !providerCatalogConformance ||
      typeof providerCatalogConformance !== "object" ||
      Array.isArray(providerCatalogConformance)
    ) {
      return {
        ok: false,
        error: "provider_catalog_conformance must be an object",
      };
    }
    const scanLimit = (providerCatalogConformance as Record<string, unknown>).scan_limit;
    const pageLimit = (providerCatalogConformance as Record<string, unknown>).page_limit;
    const persist = (providerCatalogConformance as Record<string, unknown>).persist;
    if (
      scanLimit !== undefined &&
      (!Number.isSafeInteger(scanLimit) || Number(scanLimit) <= 0 || Number(scanLimit) > 10_000)
    ) {
      return {
        ok: false,
        error: "provider_catalog_conformance.scan_limit must be a positive safe integer",
      };
    }
    if (
      pageLimit !== undefined &&
      (!Number.isSafeInteger(pageLimit) || Number(pageLimit) <= 0 || Number(pageLimit) > 10_000)
    ) {
      return {
        ok: false,
        error: "provider_catalog_conformance.page_limit must be a positive safe integer",
      };
    }
    if (persist !== undefined && typeof persist !== "boolean") {
      return {
        ok: false,
        error: "provider_catalog_conformance.persist must be a boolean",
      };
    }
    const parsed = {
      ok: true,
      providerCatalogConformance: {},
    } as Extract<MediaWorkerRequest, { ok: true }>;
    if (typeof scanLimit === "number") {
      parsed.providerCatalogConformance!.scanLimit = scanLimit;
    }
    if (typeof pageLimit === "number") {
      parsed.providerCatalogConformance!.pageLimit = pageLimit;
    }
    if (typeof persist === "boolean") {
      parsed.providerCatalogConformance!.persist = persist;
    }
    return parsed;
  }
  if (receiptCatalogCheckpointReset !== undefined) {
    if (
      !receiptCatalogCheckpointReset ||
      typeof receiptCatalogCheckpointReset !== "object" ||
      Array.isArray(receiptCatalogCheckpointReset)
    ) {
      return {
        ok: false,
        error: "receipt_catalog_checkpoint_reset must be an object",
      };
    }
    const mode = (receiptCatalogCheckpointReset as Record<string, unknown>).mode;
    if (mode !== "dry_run" && mode !== "apply") {
      return {
        ok: false,
        error: "receipt_catalog_checkpoint_reset.mode must be dry_run or apply",
      };
    }
    return {
      ok: true,
      receiptCatalogCheckpointResetMode: mode,
    };
  }
  if (receiptCatalogCheckpointResetLifecycle !== undefined) {
    if (
      !receiptCatalogCheckpointResetLifecycle ||
      typeof receiptCatalogCheckpointResetLifecycle !== "object" ||
      Array.isArray(receiptCatalogCheckpointResetLifecycle)
    ) {
      return {
        ok: false,
        error: "receipt_catalog_checkpoint_reset_lifecycle must be an object",
      };
    }
    const mode = (receiptCatalogCheckpointResetLifecycle as Record<string, unknown>).mode;
    if (mode !== "dry_run" && mode !== "apply") {
      return {
        ok: false,
        error: "receipt_catalog_checkpoint_reset_lifecycle.mode must be dry_run or apply",
      };
    }
    return {
      ok: true,
      receiptCatalogCheckpointResetLifecycleMode: mode,
    };
  }
  if (receiptCatalogCheckpointResetReceiptPacket !== undefined) {
    if (
      !receiptCatalogCheckpointResetReceiptPacket ||
      typeof receiptCatalogCheckpointResetReceiptPacket !== "object" ||
      Array.isArray(receiptCatalogCheckpointResetReceiptPacket)
    ) {
      return {
        ok: false,
        error: "receipt_catalog_checkpoint_reset_receipt_packet must be an object",
      };
    }
    const action = (receiptCatalogCheckpointResetReceiptPacket as Record<string, unknown>)
      .action;
    if (
      action !== "export" &&
      action !== "import" &&
      action !== "escrow" &&
      action !== "inventory" &&
      action !== "lifecycle" &&
      action !== "quarantine" &&
      action !== "quarantine_inventory" &&
      action !== "quarantine_lifecycle" &&
      action !== "recover"
    ) {
      return {
        ok: false,
        error: "receipt_catalog_checkpoint_reset_receipt_packet.action must be export, import, escrow, inventory, recover, lifecycle, quarantine, quarantine_inventory, or quarantine_lifecycle",
      };
    }
    if (
      action === "export" ||
      action === "escrow" ||
      action === "inventory" ||
      action === "quarantine_inventory"
    ) {
      return {
        ok: true,
        receiptCatalogCheckpointResetReceiptPacket: { action },
      };
    }
    const mode = (receiptCatalogCheckpointResetReceiptPacket as Record<string, unknown>).mode;
    if (mode !== "dry_run" && mode !== "apply") {
      return {
        ok: false,
        error: "receipt_catalog_checkpoint_reset_receipt_packet.mode must be dry_run or apply",
      };
    }
    if (
      action === "lifecycle" ||
      action === "quarantine" ||
      action === "quarantine_lifecycle"
    ) {
      return {
        ok: true,
        receiptCatalogCheckpointResetReceiptPacket: { action, mode },
      };
    }
    if (action === "recover") {
      return {
        ok: true,
        receiptCatalogCheckpointResetReceiptPacket: { action: "recover", mode },
      };
    }
    const packet = (receiptCatalogCheckpointResetReceiptPacket as Record<string, unknown>)
      .packet;
    if (!packet || typeof packet !== "object" || Array.isArray(packet)) {
      return {
        ok: false,
        error: "receipt_catalog_checkpoint_reset_receipt_packet.packet must be an object",
      };
    }
    return {
      ok: true,
      receiptCatalogCheckpointResetReceiptPacket: {
        action: "import",
        mode,
        packet: packet as Record<string, unknown>,
      },
    };
  }
  if (providerCatalogConformanceReceiptLifecycle !== undefined) {
    if (
      !providerCatalogConformanceReceiptLifecycle ||
      typeof providerCatalogConformanceReceiptLifecycle !== "object" ||
      Array.isArray(providerCatalogConformanceReceiptLifecycle)
    ) {
      return {
        ok: false,
        error: "provider_catalog_conformance_receipt_lifecycle must be an object",
      };
    }
    const mode = (providerCatalogConformanceReceiptLifecycle as Record<string, unknown>).mode;
    if (mode !== "dry_run" && mode !== "apply") {
      return {
        ok: false,
        error: "provider_catalog_conformance_receipt_lifecycle.mode must be dry_run or apply",
      };
    }
    return {
      ok: true,
      providerCatalogConformanceReceiptLifecycleMode: mode,
    };
  }
  if (providerCatalogConformanceReceiptPacket !== undefined) {
    if (
      !providerCatalogConformanceReceiptPacket ||
      typeof providerCatalogConformanceReceiptPacket !== "object" ||
      Array.isArray(providerCatalogConformanceReceiptPacket)
    ) {
      return {
        ok: false,
        error: "provider_catalog_conformance_receipt_packet must be an object",
      };
    }
    const action = (providerCatalogConformanceReceiptPacket as Record<string, unknown>).action;
    if (
      action !== "export" &&
      action !== "import" &&
      action !== "escrow" &&
      action !== "inventory" &&
      action !== "lifecycle" &&
      action !== "quarantine" &&
      action !== "quarantine_inventory" &&
      action !== "quarantine_lifecycle" &&
      action !== "quarantine_attest" &&
      action !== "quarantine_attestation_inventory" &&
      action !== "quarantine_attestation_lifecycle" &&
      action !== "recover"
    ) {
      return {
        ok: false,
        error: "provider_catalog_conformance_receipt_packet.action must be export, import, escrow, inventory, recover, lifecycle, quarantine, quarantine_inventory, quarantine_lifecycle, quarantine_attest, quarantine_attestation_inventory, or quarantine_attestation_lifecycle",
      };
    }
    if (
      action === "export" ||
      action === "escrow" ||
      action === "inventory" ||
      action === "quarantine_inventory" ||
      action === "quarantine_attestation_inventory"
    ) {
      return {
        ok: true,
        providerCatalogConformanceReceiptPacket: { action },
      };
    }
    if (action === "quarantine_attest") {
      const decision = (providerCatalogConformanceReceiptPacket as Record<string, unknown>)
        .decision;
      if (
        decision !== "reviewed" &&
        decision !== "retained" &&
        decision !== "released"
      ) {
        return {
          ok: false,
          error:
            "provider_catalog_conformance_receipt_packet.decision must be reviewed, retained, or released",
        };
      }
      return {
        ok: true,
        providerCatalogConformanceReceiptPacket: { action, decision },
      };
    }
    const mode = (providerCatalogConformanceReceiptPacket as Record<string, unknown>).mode;
    if (
      action === "lifecycle" ||
      action === "quarantine" ||
      action === "quarantine_lifecycle" ||
      action === "quarantine_attestation_lifecycle"
    ) {
      if (mode !== "dry_run" && mode !== "apply") {
        return {
          ok: false,
          error: "provider_catalog_conformance_receipt_packet.mode must be dry_run or apply",
        };
      }
      return {
        ok: true,
        providerCatalogConformanceReceiptPacket: { action, mode },
      };
    }
    if (action === "recover") {
      if (mode !== "dry_run" && mode !== "apply") {
        return {
          ok: false,
          error: "provider_catalog_conformance_receipt_packet.mode must be dry_run or apply",
        };
      }
      return {
        ok: true,
        providerCatalogConformanceReceiptPacket: { action: "recover", mode },
      };
    }
    const packet = (providerCatalogConformanceReceiptPacket as Record<string, unknown>).packet;
    if (mode !== "dry_run" && mode !== "apply") {
      return {
        ok: false,
        error: "provider_catalog_conformance_receipt_packet.mode must be dry_run or apply",
      };
    }
    if (!packet || typeof packet !== "object" || Array.isArray(packet)) {
      return {
        ok: false,
        error: "provider_catalog_conformance_receipt_packet.packet must be an object",
      };
    }
    return {
      ok: true,
      providerCatalogConformanceReceiptPacket: {
        action: "import",
        mode,
        packet: packet as Record<string, unknown>,
      },
    };
  }
  if (restoreReceiptRepair === undefined) return { ok: true };
  if (
    !restoreReceiptRepair ||
    typeof restoreReceiptRepair !== "object" ||
    Array.isArray(restoreReceiptRepair)
  ) {
    return {
      ok: false,
      error: "restore_receipt_repair must be an object",
    };
  }
  const mode = (restoreReceiptRepair as Record<string, unknown>).mode;
  const continuationToken = (restoreReceiptRepair as Record<string, unknown>)
    .continuation_token;
  if (mode !== "dry_run" && mode !== "apply") {
    return {
      ok: false,
      error: "restore_receipt_repair.mode must be dry_run or apply",
    };
  }
  if (
    continuationToken !== undefined &&
    (typeof continuationToken !== "string" ||
      !continuationToken.trim() ||
      Buffer.byteLength(continuationToken) > 8192 ||
      !/^codeliver_rcc_v1\.[A-Za-z0-9_.-]+$/.test(continuationToken))
  ) {
    return {
      ok: false,
      error: "restore_receipt_repair.continuation_token must be a valid cursor token",
    };
  }
  const parsed = {
    ok: true,
    restoreReceiptRepairMode: mode,
  } as Extract<MediaWorkerRequest, { ok: true }>;
  if (typeof continuationToken === "string") {
    parsed.restoreReceiptContinuationToken = continuationToken;
  }
  return parsed;
}
