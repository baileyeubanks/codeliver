import { apiError, apiJson } from "@/lib/api/responses";
import { demoReviewPayload } from "@/lib/review/demoReview";
import { consolidateComments } from "@/lib/summary/consolidate";

/**
 * P21 — Producer review summary for the local demo. Demo-scoped on purpose:
 * the proxy does not launch-gate this route for production surfaces, so the
 * handler itself refuses anything that is not the local demo preview rather
 * than silently summarizing real tenant data without an access check.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const isLocalDemo =
    process.env.NODE_ENV !== "production" && url.searchParams.get("demo") === "1";
  if (!isLocalDemo) {
    return apiError(
      "Producer summary is available in the local demo preview only",
      "SUMMARY_UNAVAILABLE",
      403,
    );
  }

  // Replies stay attached to their thread root; the summary consolidates
  // top-level feedback only, matching how the board groups comments.
  const topLevelComments = demoReviewPayload.comments.filter(
    (comment) => !comment.parent_id,
  );
  const summary = consolidateComments(
    topLevelComments.map((comment) => ({
      id: comment.id,
      author_name: comment.author_name,
      body: comment.body,
      timecode_seconds: comment.timecode_seconds,
      status: comment.status,
      parent_id: comment.parent_id,
    })),
  );

  const approvedSteps = demoReviewPayload.approvals.filter(
    (step) => step.status === "approved" || step.status === "approved_with_changes",
  ).length;

  return apiJson({
    project: demoReviewPayload.asset.projects?.name ?? "Untitled project",
    asset: demoReviewPayload.asset.title,
    asset_status: demoReviewPayload.asset.status,
    approval: {
      total_steps: demoReviewPayload.approvals.length,
      approved_steps: approvedSteps,
      label: `${approvedSteps} of ${demoReviewPayload.approvals.length} steps approved`,
    },
    summary,
  });
}
