import type { MediaPipelineSource } from "@/lib/media-pipeline/types";
import {
  normalizeMediaRelativePath,
  sanitizeMediaFilename,
} from "@/lib/storage/safe-media-path";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const SUPPORTED_PIPELINE_PROVIDERS = new Set(["local", "ccnas"]);

type SelectedVersion = {
  id: string;
  asset_id: string;
  version_number: number;
  file_size: number | string | null;
};

type AssetSource = {
  id: string;
  nas_path: unknown;
  file_size: unknown;
};

type ManagedVersionReceiptRow = {
  id?: unknown;
  asset_id?: unknown;
  version_number?: unknown;
  file_size?: unknown;
  storage_provider?: unknown;
  storage_object_key?: unknown;
  storage_sha256?: unknown;
  storage_provider_version_id?: unknown;
  storage_committed_at?: unknown;
  original_filename?: unknown;
};

export type ManagedTranscodeSourceResult =
  | { ok: true; source: MediaPipelineSource }
  | {
      ok: false;
      code: "VERSION_SOURCE_NOT_READY" | "VERSION_SOURCE_MISMATCH";
      message: string;
    };

function safePositiveSize(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function exactBoundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  return value.trim().length > 0 &&
    value.length <= maxLength &&
    !CONTROL_CHARACTERS.test(value)
    ? value
    : null;
}

function canonicalObjectKey(value: unknown): string | null {
  const key = exactBoundedText(value, 2_048);
  if (!key) return null;
  try {
    return normalizeMediaRelativePath(key);
  } catch {
    return null;
  }
}

export function buildManagedTranscodeSource({
  asset,
  selectedVersion,
  receiptRow,
}: {
  asset: AssetSource;
  selectedVersion: SelectedVersion;
  receiptRow: ManagedVersionReceiptRow | null;
}): ManagedTranscodeSourceResult {
  const provider = exactBoundedText(receiptRow?.storage_provider, 64);
  const objectKey = canonicalObjectKey(receiptRow?.storage_object_key);
  const sha256 = exactBoundedText(receiptRow?.storage_sha256, 64);
  const providerVersionId = exactBoundedText(
    receiptRow?.storage_provider_version_id,
    1_024,
  );
  const committedAt = exactBoundedText(receiptRow?.storage_committed_at, 128);
  const originalFilename = exactBoundedText(receiptRow?.original_filename, 512);
  const receiptSize = safePositiveSize(receiptRow?.file_size);

  if (
    !receiptRow ||
    !provider ||
    !SUPPORTED_PIPELINE_PROVIDERS.has(provider) ||
    !objectKey ||
    !sha256 ||
    !SHA256_PATTERN.test(sha256) ||
    !providerVersionId ||
    !committedAt ||
    Number.isNaN(Date.parse(committedAt)) ||
    !originalFilename ||
    receiptSize === null
  ) {
    return {
      ok: false,
      code: "VERSION_SOURCE_NOT_READY",
      message: "This version does not have a complete managed storage receipt.",
    };
  }

  const assetObjectKey = canonicalObjectKey(asset.nas_path);
  const assetSize = safePositiveSize(asset.file_size);
  const selectedSize = safePositiveSize(selectedVersion.file_size);
  if (
    receiptRow.id !== selectedVersion.id ||
    receiptRow.asset_id !== asset.id ||
    selectedVersion.asset_id !== asset.id ||
    receiptRow.version_number !== selectedVersion.version_number ||
    !assetObjectKey ||
    objectKey !== assetObjectKey ||
    assetSize !== receiptSize ||
    selectedSize !== receiptSize
  ) {
    return {
      ok: false,
      code: "VERSION_SOURCE_MISMATCH",
      message: "The selected version does not match the asset's managed source receipt.",
    };
  }

  return {
    ok: true,
    source: {
      objectKey,
      filename: sanitizeMediaFilename(originalFilename),
      versionNumber: selectedVersion.version_number,
      expectedSize: receiptSize,
      expectedSha256: sha256,
      receipt: {
        provider,
        objectKey,
        size: receiptSize,
        sha256,
        providerVersionId,
        committedAt,
      },
    },
  };
}
