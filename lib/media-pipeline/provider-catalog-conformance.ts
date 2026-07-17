import { createHash } from "node:crypto";

import type { StorageAdapter } from "../storage/contracts";
import { mediaPipelineReceiptCatalogCapability } from "./receipt-catalog.ts";

export type MediaPipelineProviderCatalogFindingCode =
  | "missing_capability"
  | "list_unavailable"
  | "provider_backpressure"
  | "invalid_listing_shape"
  | "invalid_unsafe_entry_count"
  | "page_exceeded_limit"
  | "invalid_object_metadata"
  | "inspection_unavailable"
  | "inspection_mismatch"
  | "invalid_cursor";

export interface MediaPipelineProviderCatalogFinding {
  code: MediaPipelineProviderCatalogFindingCode;
  count: number;
}

export interface MediaPipelineProviderCatalogConformanceReport {
  generatedAt: string;
  provider: string;
  capabilityPresent: boolean;
  ready: boolean;
  scanLimit: number;
  pageLimit: number;
  pagesScanned: number;
  cursorSupported: boolean;
  checkpointRequired: boolean;
  nextCursorDigest: string | null;
  listedObjects: number;
  inspectedObjects: number;
  validObjects: number;
  invalidObjectMetadata: number;
  inspectionFailures: number;
  inspectionMismatches: number;
  unsafeEntries: number;
  providerBackpressure: boolean;
  unavailable: boolean;
  findings: MediaPipelineProviderCatalogFinding[];
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function addFinding(
  findings: Map<MediaPipelineProviderCatalogFindingCode, number>,
  code: MediaPipelineProviderCatalogFindingCode,
  count = 1
): void {
  if (count <= 0) return;
  findings.set(code, (findings.get(code) ?? 0) + count);
}

function safePositiveInteger(value: number, fallback: number): number {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isCatalogObjectKey(value: string): boolean {
  if (
    !value ||
    value.length > 2048 ||
    value.startsWith("/") ||
    value.includes("\\") ||
    value.includes("\0")
  ) {
    return false;
  }
  return value.split("/").every((part) => part && part !== "." && part !== "..");
}

function looksLikeBackpressure(error: unknown): boolean {
  const record =
    error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const code = String(record.code ?? record.name ?? "");
  const message = String(record.message ?? "");
  return /RATE|LIMIT|QUOTA|THROTTLE|429|BACKPRESSURE/i.test(`${code} ${message}`);
}

export async function assessMediaPipelineProviderCatalogConformance(input: {
  adapter: StorageAdapter;
  scanLimit: number;
  pageLimit?: number;
  now?: () => Date;
}): Promise<MediaPipelineProviderCatalogConformanceReport> {
  const now = input.now ?? (() => new Date());
  const findings = new Map<MediaPipelineProviderCatalogFindingCode, number>();
  const scanLimit = safePositiveInteger(input.scanLimit, 1);
  const pageLimit = safePositiveInteger(input.pageLimit ?? scanLimit, scanLimit);
  const catalog = mediaPipelineReceiptCatalogCapability(input.adapter);
  if (!catalog) {
    addFinding(findings, "missing_capability");
    return {
      generatedAt: now().toISOString(),
      provider: input.adapter.kind,
      capabilityPresent: false,
      ready: false,
      scanLimit,
      pageLimit,
      pagesScanned: 0,
      cursorSupported: false,
      checkpointRequired: false,
      nextCursorDigest: null,
      listedObjects: 0,
      inspectedObjects: 0,
      validObjects: 0,
      invalidObjectMetadata: 0,
      inspectionFailures: 0,
      inspectionMismatches: 0,
      unsafeEntries: 0,
      providerBackpressure: false,
      unavailable: false,
      findings: [...findings].map(([code, count]) => ({ code, count })),
    };
  }

  let cursor: string | null = null;
  let nextCursorDigest: string | null = null;
  let cursorSupported = false;
  let listedObjects = 0;
  let inspectedObjects = 0;
  let validObjects = 0;
  let invalidObjectMetadata = 0;
  let inspectionFailures = 0;
  let inspectionMismatches = 0;
  let unsafeEntries = 0;
  let unavailable = false;
  let providerBackpressure = false;
  let pagesScanned = 0;

  while (listedObjects < scanLimit && pagesScanned < pageLimit) {
    const remaining = scanLimit - listedObjects;
    let listing;
    try {
      listing = await catalog.listMediaPipelineReceiptObjects({
        kind: "restore_attestation",
        limit: remaining,
        cursor,
      });
    } catch (error) {
      unavailable = true;
      addFinding(findings, "list_unavailable");
      if (looksLikeBackpressure(error)) {
        providerBackpressure = true;
        addFinding(findings, "provider_backpressure");
      }
      break;
    }
    pagesScanned += 1;
    if (
      !listing ||
      typeof listing !== "object" ||
      !Array.isArray(listing.objects) ||
      typeof listing.truncated !== "boolean"
    ) {
      addFinding(findings, "invalid_listing_shape");
      break;
    }
    if (Number.isSafeInteger(listing.unsafeEntries) && Number(listing.unsafeEntries) >= 0) {
      unsafeEntries += Number(listing.unsafeEntries);
    } else if (listing.unsafeEntries !== undefined) {
      addFinding(findings, "invalid_unsafe_entry_count");
    }
    if (listing.objects.length > remaining) {
      addFinding(findings, "page_exceeded_limit", listing.objects.length - remaining);
    }

    for (const object of listing.objects.slice(0, remaining)) {
      listedObjects += 1;
      if (
        typeof object.objectKey !== "string" ||
        !isCatalogObjectKey(object.objectKey) ||
        !object.objectKey.endsWith(".json") ||
        !Number.isSafeInteger(object.size) ||
        object.size < 0 ||
        !isSha256(object.sha256)
      ) {
        invalidObjectMetadata += 1;
        addFinding(findings, "invalid_object_metadata");
        continue;
      }
      let inspection;
      try {
        inspection = await input.adapter.inspectStoredObject(object.objectKey);
      } catch {
        inspectionFailures += 1;
        addFinding(findings, "inspection_unavailable");
        continue;
      }
      inspectedObjects += 1;
      if (!inspection || inspection.size !== object.size || inspection.sha256 !== object.sha256) {
        inspectionMismatches += 1;
        addFinding(findings, "inspection_mismatch");
        continue;
      }
      validObjects += 1;
    }

    if (typeof listing.nextCursor === "string" && listing.nextCursor.trim()) {
      cursor = listing.nextCursor;
      cursorSupported = true;
      nextCursorDigest = sha256Hex(listing.nextCursor);
      continue;
    }
    if (listing.truncated || listing.nextCursor !== null && listing.nextCursor !== undefined) {
      addFinding(findings, "invalid_cursor");
    }
    cursor = null;
    nextCursorDigest = null;
    break;
  }

  const checkpointRequired = Boolean(cursor) && (listedObjects >= scanLimit || pagesScanned >= pageLimit);
  const reportFindings = [...findings].map(([code, count]) => ({ code, count }));
  return {
    generatedAt: now().toISOString(),
    provider: input.adapter.kind,
    capabilityPresent: true,
    ready:
      reportFindings.length === 0 &&
      !checkpointRequired &&
      !unavailable &&
      !providerBackpressure,
    scanLimit,
    pageLimit,
    pagesScanned,
    cursorSupported,
    checkpointRequired,
    nextCursorDigest: checkpointRequired ? nextCursorDigest : null,
    listedObjects,
    inspectedObjects,
    validObjects,
    invalidObjectMetadata,
    inspectionFailures,
    inspectionMismatches,
    unsafeEntries,
    providerBackpressure,
    unavailable,
    findings: reportFindings,
  };
}
