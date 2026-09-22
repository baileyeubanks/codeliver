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
}) {
  // `null` means that the URL did not request a version. An empty string is
  // an explicit, malformed `?version=` and must never become the current cut.
  if (input.requestedVersionId === null) return true;
  if (!input.requestedVersionId.trim()) return false;
  if (!input.demoMode || input.activeDemoVersionId !== input.requestedVersionId) return false;

  // A direct versioned URL must also resolve the asset it named. Otherwise an
  // unknown `asset` query could fall through to the first asset in the cockpit.
  return input.requestedAssetId === undefined
    || input.requestedAssetId === null
    || input.requestedAssetId === input.activeAssetId;
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

/** A typed but unsent note must remain with the exact cut it was written on. */
export function reviewCommentDraftKey(assetId: string, versionId: string | null) {
  return `${assetId}:${versionId ?? "current"}`;
}
