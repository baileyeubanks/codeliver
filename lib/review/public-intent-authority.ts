import {
  deriveShareIntent,
  normalizeShareIntent,
  type ShareIntent,
} from "@/lib/sharing/share-intent";
import type { SharePermission } from "@/lib/types/codeliver";

type IntentAuthority = {
  permissions: SharePermission;
  downloadEnabled: boolean;
  watermarkEnabled: boolean;
};

type TokenBoundShare = IntentAuthority & {
  shareIntent?: ShareIntent | null;
};

type ResolvePublicReviewIntentInput = {
  sourceCatalogPreview: boolean;
  tokenBoundShare: TokenBoundShare | null;
  queryIntent: unknown;
  fallback: IntentAuthority;
};

/**
 * A valid share token is the public authority for its recipient surface. Its
 * query string can name an older intent, but must never widen or downgrade the
 * record-bound permission. Direct fixture previews have no token, so they may
 * still select a valid preview intent from the query.
 */
export function resolvePublicReviewIntent({
  sourceCatalogPreview,
  tokenBoundShare,
  queryIntent,
  fallback,
}: ResolvePublicReviewIntentInput): ShareIntent {
  if (sourceCatalogPreview && !tokenBoundShare) {
    return "internal_review";
  }

  if (tokenBoundShare) {
    return (
      normalizeShareIntent(tokenBoundShare.shareIntent) ??
      deriveShareIntent(tokenBoundShare)
    );
  }

  return normalizeShareIntent(queryIntent) ?? deriveShareIntent(fallback);
}
