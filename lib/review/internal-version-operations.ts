/**
 * An internal route may name a version before the live API can prove that
 * version. In that state the current asset remains visible for navigation,
 * but no player or mutation may act on it as a substitute.
 */
export function canOperateExactInternalReviewVersion(input: {
  demoMode: boolean;
  requestedVersionId: string | null;
  activeDemoVersionId: string | null;
  requestedAssetId?: string | null;
  activeAssetId?: string | null;
  /** Present for live review once the protected versions response resolves. */
  liveResolvedVersionId?: string | null;
  liveResolvedAssetId?: string | null;
}) {
  // `null` means that the URL did not request a version. An empty string is
  // an explicit, malformed `?version=` and must never become the current cut.
  if (input.requestedVersionId === null) {
    // The cockpit supplies these fields while live versions load. Requiring a
    // resolved identity prevents a current-cut write without a version_id.
    if (!input.demoMode && input.liveResolvedVersionId !== undefined) {
      return Boolean(input.liveResolvedVersionId)
        && input.liveResolvedAssetId === input.activeAssetId;
    }
    return true;
  }
  if (!input.requestedVersionId.trim()) return false;

  // A direct versioned URL must also resolve the asset it named. Otherwise an
  // unknown `asset` query could fall through to the first asset in the cockpit.
  const assetMatches = input.requestedAssetId === undefined
    || input.requestedAssetId === null
    || input.requestedAssetId === input.activeAssetId;
  if (!assetMatches) return false;

  if (input.demoMode) return input.activeDemoVersionId === input.requestedVersionId;

  return input.liveResolvedVersionId === input.requestedVersionId
    && input.liveResolvedAssetId === input.activeAssetId;
}

/** Keeps an unavailable route from invoking a network mutation at all. */
export function runWhenInternalReviewVersionIsAvailable<T>(
  available: boolean,
  operation: () => T,
): T | undefined {
  return available ? operation() : undefined;
}

/** An unavailable versioned route must not render records from a fallback cut. */
export function visibleExactInternalReviewRecords<T>(
  available: boolean,
  records: readonly T[],
): readonly T[] {
  return available ? records : [];
}

export interface InternalLiveReviewVersion {
  id: string;
  asset_id: string;
  version_number: number;
  is_current: boolean;
}

export type ExactLiveInternalReviewVersion<T extends InternalLiveReviewVersion> =
  | { status: "resolved"; version: T }
  | { status: "unavailable" };

/**
 * A live response is usable only when it identifies one version of the asset
 * currently rendered in the cockpit. This keeps malformed URLs and mixed
 * responses from silently selecting a newer cut.
 */
export function resolveExactLiveInternalReviewVersion<T extends InternalLiveReviewVersion>(input: {
  requestedAssetId: string | null;
  activeAssetId: string | null;
  requestedVersionId: string | null;
  versions: readonly T[];
}): ExactLiveInternalReviewVersion<T> {
  const activeAssetId = input.activeAssetId;
  if (!activeAssetId || (input.requestedAssetId !== null && input.requestedAssetId !== activeAssetId)) {
    return { status: "unavailable" };
  }

  const scopedVersions = input.versions.filter((version) => version.asset_id === activeAssetId);
  if (new Set(scopedVersions.map((version) => version.id)).size !== scopedVersions.length) {
    return { status: "unavailable" };
  }
  if (input.requestedVersionId !== null) {
    const requestedVersionId = input.requestedVersionId.trim();
    if (!requestedVersionId) return { status: "unavailable" };
    const matches = scopedVersions.filter((version) => version.id === requestedVersionId);
    return matches.length === 1 ? { status: "resolved", version: matches[0] } : { status: "unavailable" };
  }

  const markedCurrent = scopedVersions.filter((version) => version.is_current);
  return markedCurrent.length === 1
    ? { status: "resolved", version: markedCurrent[0] }
    : { status: "unavailable" };
}

/** Ignore a response if a newer request or a different active asset superseded it. */
export function shouldApplyLiveInternalReviewResponse(input: {
  requestId: number;
  latestRequestId: number;
  requestedAssetId: string;
  activeAssetId: string | null;
}) {
  return input.requestId === input.latestRequestId && input.requestedAssetId === input.activeAssetId;
}

/** A typed but unsent note must remain with the exact cut it was written on. */
export function reviewCommentDraftKey(assetId: string, versionId: string | null) {
  return `${assetId}:${versionId ?? "current"}`;
}
