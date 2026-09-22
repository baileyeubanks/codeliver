import type { Comment, Version } from "../types/codeliver.ts";
import { currentVersion, sortVersions } from "../versions/versions.ts";

interface DemoVersionAuthorityInput {
  assetId: string;
  versionCount: number;
  fileUrl: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  createdAt: string;
  seededVersions: readonly Version[];
  sourceMetadata?: { fileSize: number; resolution: string };
}

export function buildDemoVersionAuthority({
  assetId,
  versionCount,
  fileUrl,
  thumbnailUrl,
  durationSeconds,
  createdAt,
  seededVersions,
  sourceMetadata,
}: DemoVersionAuthorityInput): { current: Version; versions: Version[] } {
  const fallbackNumber = currentVersion(seededVersions)?.version_number ?? 1;
  const currentNumber =
    Number.isSafeInteger(versionCount) && versionCount > 0
      ? versionCount
      : fallbackNumber;
  const currentId = sourceMetadata ? `source-version-${assetId}` : `demo-version-${currentNumber}`;
  const matchingSeed = seededVersions.find(
    (candidate) => candidate.version_number === currentNumber,
  );
  const current: Version = {
    ...(matchingSeed ?? {
      file_size: sourceMetadata?.fileSize ?? null,
      resolution: sourceMetadata?.resolution ?? "1920 x 1080",
      notes: sourceMetadata ? "Imported source file; archive version lineage is not established." : "Local demo review version",
      uploaded_by: null,
    }),
    id: currentId,
    asset_id: assetId,
    version_number: currentNumber,
    file_url: fileUrl,
    thumbnail_url: thumbnailUrl,
    duration_seconds: durationSeconds,
    is_current: true,
    created_at: createdAt,
  };
  const historical = seededVersions
    .filter((candidate) => candidate.version_number < currentNumber)
    .map((candidate) => ({
      ...candidate,
      asset_id: assetId,
      is_current: false,
    }));

  return {
    current,
    versions: sortVersions([...historical, current]),
  };
}

export function bindDemoReviewComments(
  comments: readonly Comment[],
  assetId: string,
): Comment[] {
  return comments.map((comment) => ({ ...comment, asset_id: assetId }));
}
