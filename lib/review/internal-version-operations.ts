/**
 * An internal route may name a version before the live API can prove that
 * version. In that state the current asset remains visible for navigation,
 * but no player or mutation may act on it as a substitute.
 */
export function canOperateExactInternalReviewVersion(input: {
  demoMode: boolean;
  requestedVersionId: string | null;
  activeDemoVersionId: string | null;
}) {
  if (!input.requestedVersionId) return true;
  return input.demoMode && Boolean(input.activeDemoVersionId);
}

/** Keeps an unavailable route from invoking a network mutation at all. */
export function runWhenInternalReviewVersionIsAvailable<T>(
  available: boolean,
  operation: () => T,
): T | undefined {
  return available ? operation() : undefined;
}

/** A typed but unsent note must remain with the exact cut it was written on. */
export function reviewCommentDraftKey(assetId: string, versionId: string | null) {
  return `${assetId}:${versionId ?? "current"}`;
}
