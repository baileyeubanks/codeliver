import { demoReviewPayload } from "@/lib/review/demoReview";
import type { SharePermission } from "@/lib/types/codeliver";

/**
 * Single authority for the reviewer identity a demo public-review session acts
 * as. The demo review page used to resolve this twice with divergent gates —
 * the load path fell back to the payload reviewer only for the
 * "approval_needed" intent while the decision-record path fell back whenever
 * permissions were "approve" — so an approve-capable link without a named
 * reviewer could hide Approve/Request-changes on load yet still accept the
 * decision on submit. Identity is keyed on the approval PERMISSION (the
 * authority boundary), never on the presentational share intent.
 */
export function resolveDemoReviewerEmail({
  shareReviewerEmail,
  permissions,
}: {
  shareReviewerEmail?: string | null;
  permissions: SharePermission;
}): string | null {
  const normalized = shareReviewerEmail?.trim().toLowerCase();
  if (normalized) return normalized;
  if (permissions === "approve") {
    return demoReviewPayload.reviewer_email?.trim().toLowerCase() || null;
  }
  return null;
}
