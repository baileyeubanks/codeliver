/**
 * Browser-local media versions are a separate authority from imported source
 * records and the production catalog. They exist only when the browser has
 * explicitly stored a local deliverable and retain a media blob key per cut.
 */
import type { Version } from "../types/codeliver.ts";
export interface DemoMediaVersion {
  id: string;
  asset_id: string;
  version_number: number;
  /** Browser cache key for an uploaded local cut; imported source has none. */
  media_blob_id: string | null;
  /** Read-only source URL for the explicitly imported V1 only. */
  source_url: string | null;
  thumbnail_blob_id: string | null;
  /** Original filename is unavailable for pre-version-browser uploads. */
  file_name: string | null;
  file_type: string;
  /** Legacy browser records did not persist byte size. */
  file_size: number | null;
  duration_seconds: number | null;
  resolution?: string | null;
  source_label?: "Imported file" | null;
  created_at: string;
  is_current: boolean;
}

type NewDemoMediaVersionInput = {
  existing: readonly DemoMediaVersion[];
  assetId: string;
  versionId: string;
  mediaBlobId: string;
  thumbnailBlobId?: string | null;
  fileName: string;
  fileType: string;
  fileSize: number;
  durationSeconds?: number | null;
  createdAt: string;
};

type DemoMediaVersionResult =
  | { ok: true; version: DemoMediaVersion; versions: DemoMediaVersion[] }
  | { ok: false; error: string };

function nonEmptyText(value: string, label: string, maxLength: number) {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) return `${label} is invalid.`;
  return null;
}

function validTimestamp(value: string) {
  return Number.isFinite(Date.parse(value));
}

export function sortDemoMediaVersions(versions: readonly DemoMediaVersion[]) {
  return [...versions].sort((left, right) => {
    if (right.version_number !== left.version_number) {
      return right.version_number - left.version_number;
    }
    return right.created_at.localeCompare(left.created_at);
  });
}

export function currentDemoMediaVersion(
  versions: readonly DemoMediaVersion[],
  assetId: string,
): DemoMediaVersion | null {
  const scoped = versions.filter((candidate) => candidate.asset_id === assetId);
  if (scoped.length === 0) return null;
  const flagged = scoped.filter((candidate) => candidate.is_current);
  // Stored state is normalized before this helper sees it. Requiring exactly
  // one flag here means a malformed in-memory collection cannot choose an
  // arbitrary cut; restore is the only place that may prove a legacy record
  // is its standalone base and set that flag.
  if (flagged.length === 1) return flagged[0];
  return null;
}

/** An exact share pin is intentionally never allowed to resolve to a newer cut. */
export function resolvePinnedDemoMediaVersion(
  versions: readonly DemoMediaVersion[],
  assetId: string,
  versionId: string | null | undefined,
): DemoMediaVersion | null {
  if (!versionId?.trim()) return null;
  const matches = versions.filter(
    (candidate) => candidate.asset_id === assetId && candidate.id === versionId,
  );
  return matches.length === 1 ? matches[0] : null;
}

/** Source becomes revisionable only after its explicit Imported file base exists. */
export function isRevisionableDemoMedia(
  versions: readonly DemoMediaVersion[],
  assetId: string,
  sourceBacked: boolean,
) {
  if (!currentDemoMediaVersion(versions, assetId)) return false;
  return !sourceBacked || versions.some(
    (candidate) =>
      candidate.asset_id === assetId &&
      candidate.id === `source-version-${assetId}` &&
      candidate.version_number === 1 &&
      candidate.source_label === "Imported file",
  );
}

/** Convert one exact browser-local or imported cut into the shared review version shape. */
export function toDemoReviewVersion(
  version: DemoMediaVersion,
  mediaUrl: string,
  thumbnailUrl: string | null,
): Version {
  return {
    id: version.id,
    asset_id: version.asset_id,
    version_number: version.version_number,
    file_url: mediaUrl,
    file_size: version.file_size,
    thumbnail_url: thumbnailUrl,
    duration_seconds: version.duration_seconds,
    resolution: version.resolution ?? null,
    is_current: version.is_current,
    notes: version.source_label === "Imported file"
      ? "Imported file; archive version lineage is not established."
      : "Browser-local upload. Review authority is pinned to this exact cut.",
    uploaded_by: null,
    created_at: version.created_at,
  };
}

export function nextDemoMediaVersion(input: NewDemoMediaVersionInput): DemoMediaVersionResult {
  const assetIdError = nonEmptyText(input.assetId, "Asset id", 256);
  const versionIdError = nonEmptyText(input.versionId, "Version id", 256);
  const mediaBlobIdError = nonEmptyText(input.mediaBlobId, "Local media id", 256);
  const fileNameError = nonEmptyText(input.fileName, "File name", 512);
  const fileTypeError = nonEmptyText(input.fileType, "File type", 64);
  if (assetIdError || versionIdError || mediaBlobIdError || fileNameError || fileTypeError) {
    return { ok: false, error: assetIdError ?? versionIdError ?? mediaBlobIdError ?? fileNameError ?? fileTypeError ?? "Version is invalid." };
  }
  if (!Number.isSafeInteger(input.fileSize) || input.fileSize <= 0) {
    return { ok: false, error: "File size is invalid." };
  }
  if (
    input.durationSeconds != null &&
    (!Number.isFinite(input.durationSeconds) || input.durationSeconds < 0)
  ) {
    return { ok: false, error: "Duration is invalid." };
  }
  if (!validTimestamp(input.createdAt)) {
    return { ok: false, error: "Created time is invalid." };
  }

  const scoped = input.existing.filter((candidate) => candidate.asset_id === input.assetId);
  const current = currentDemoMediaVersion(scoped, input.assetId);
  if (!current) {
    return { ok: false, error: "This media does not have one established current cut to revise." };
  }
  if (input.existing.some((candidate) => candidate.id === input.versionId)) {
    return { ok: false, error: "Version id already exists." };
  }
  if (scoped.some((candidate) => candidate.media_blob_id === input.mediaBlobId)) {
    return { ok: false, error: "Local media id is already assigned to this deliverable." };
  }

  const versionNumber = Math.max(...scoped.map((candidate) => candidate.version_number)) + 1;
  const version: DemoMediaVersion = {
    id: input.versionId.trim(),
    asset_id: input.assetId.trim(),
    version_number: versionNumber,
    media_blob_id: input.mediaBlobId.trim(),
    source_url: null,
    thumbnail_blob_id: input.thumbnailBlobId?.trim() || null,
    file_name: input.fileName.trim(),
    file_type: input.fileType.trim(),
    file_size: input.fileSize,
    duration_seconds: input.durationSeconds ?? null,
    resolution: null,
    source_label: null,
    created_at: input.createdAt,
    is_current: true,
  };

  return {
    ok: true,
    version,
    versions: input.existing.map((candidate) =>
      candidate.asset_id === version.asset_id ? { ...candidate, is_current: false } : candidate,
    ).concat(version),
  };
}

export function createInitialDemoMediaVersion(input: Omit<NewDemoMediaVersionInput, "existing">): DemoMediaVersionResult {
  const assetIdError = nonEmptyText(input.assetId, "Asset id", 256);
  const versionIdError = nonEmptyText(input.versionId, "Version id", 256);
  const mediaBlobIdError = nonEmptyText(input.mediaBlobId, "Local media id", 256);
  const fileNameError = nonEmptyText(input.fileName, "File name", 512);
  const fileTypeError = nonEmptyText(input.fileType, "File type", 64);
  if (assetIdError || versionIdError || mediaBlobIdError || fileNameError || fileTypeError) {
    return { ok: false, error: assetIdError ?? versionIdError ?? mediaBlobIdError ?? fileNameError ?? fileTypeError ?? "Version is invalid." };
  }
  if (!Number.isSafeInteger(input.fileSize) || input.fileSize <= 0) {
    return { ok: false, error: "File size is invalid." };
  }
  if (input.durationSeconds != null && (!Number.isFinite(input.durationSeconds) || input.durationSeconds < 0)) {
    return { ok: false, error: "Duration is invalid." };
  }
  if (!validTimestamp(input.createdAt)) {
    return { ok: false, error: "Created time is invalid." };
  }

  const version: DemoMediaVersion = {
    id: input.versionId.trim(),
    asset_id: input.assetId.trim(),
    version_number: 1,
    media_blob_id: input.mediaBlobId.trim(),
    source_url: null,
    thumbnail_blob_id: input.thumbnailBlobId?.trim() || null,
    file_name: input.fileName.trim(),
    file_type: input.fileType.trim(),
    file_size: input.fileSize,
    duration_seconds: input.durationSeconds ?? null,
    resolution: null,
    source_label: null,
    created_at: input.createdAt,
    is_current: true,
  };
  return { ok: true, version, versions: [version] };
}
