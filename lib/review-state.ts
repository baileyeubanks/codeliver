import type { ShareIntent } from "@/lib/sharing/share-intent";
import type {
  ApprovalDecision,
  ApprovalStep,
  Comment,
  SharePermission,
  WorkflowMode,
} from "@/lib/types/codeliver";

const POSITIVE_APPROVALS = new Set<ApprovalDecision>([
  "approved",
  "approved_with_changes",
]);

const BLOCKING_APPROVALS = new Set<ApprovalDecision>([
  "changes_requested",
  "rejected",
]);

export type ReviewStateKey =
  | "delivery"
  | "approval_not_configured"
  | "changes_requested"
  | "approved_with_changes"
  | "approved"
  | "awaiting_approval"
  | "feedback_open"
  | "view_only"
  | "ready_for_review";

export type ReviewStateTone = "accent" | "orange" | "red" | "green" | "slate";

export interface ReviewStateCounts {
  openThreads: number;
  resolvedThreads: number;
  totalThreads: number;
  pendingApprovals: number;
  decidedApprovals: number;
  totalApprovals: number;
  approvedWithChanges: number;
  blockingApprovals: number;
  activeApprovalIds: string[];
}

export interface DerivedReviewState {
  key: ReviewStateKey;
  label: string;
  tone: ReviewStateTone;
  summary: string;
  nextStep: string;
  decisionMeaning: string;
  lifecycleLabel: string;
  counts: ReviewStateCounts;
}

interface DeriveReviewStateInput {
  approvals?: ApprovalStep[];
  comments?: Comment[];
  assetStatus?: string | null;
  shareIntent?: ShareIntent | null;
  permissions?: SharePermission | null;
  workflowMode?: WorkflowMode | null;
  internal?: boolean;
}

export function formatAssetStatusLabel(status?: string | null) {
  return (status || "unknown").replace(/_/g, " ");
}

export function getWorkflowActiveApprovalIds(
  approvals: ApprovalStep[],
  workflowMode: WorkflowMode | null,
) {
  const orderedApprovals = [...approvals].sort((a, b) => a.step_order - b.step_order);
  const pendingApprovals = orderedApprovals.filter((approval) => approval.status === "pending");
  const activeApprovals =
    workflowMode === "sequential" ? pendingApprovals.slice(0, 1) : pendingApprovals;

  return activeApprovals.map((approval) => approval.id);
}

export function deriveReviewState({
  approvals = [],
  comments = [],
  assetStatus,
  shareIntent,
  permissions,
  workflowMode,
  internal = false,
}: DeriveReviewStateInput): DerivedReviewState {
  const rootComments = comments.filter((comment) => !comment.parent_id);
  const openThreads = rootComments.filter((comment) => comment.status === "open").length;
  const resolvedThreads = rootComments.filter((comment) => comment.status === "resolved").length;
  const orderedApprovals = [...approvals].sort((a, b) => a.step_order - b.step_order);
  const pendingApprovals = orderedApprovals.filter((approval) => approval.status === "pending");
  const positiveApprovals = orderedApprovals.filter((approval) =>
    POSITIVE_APPROVALS.has(approval.status),
  );
  const approvalsWithChanges = orderedApprovals.filter(
    (approval) => approval.status === "approved_with_changes",
  );
  const blockingApprovals = orderedApprovals.filter((approval) =>
    BLOCKING_APPROVALS.has(approval.status),
  );
  const activeApprovalIds = getWorkflowActiveApprovalIds(orderedApprovals, workflowMode ?? null);
  const lifecycleLabel = `Asset status: ${formatAssetStatusLabel(assetStatus)}`;
  const decisionMeaning =
    orderedApprovals.length > 0
      ? "Comments capture feedback tied to the media. Approval records the decision on this version."
      : "Comments capture the review conversation. Add approval steps when the cut needs explicit sign-off.";

  const sharedCounts: ReviewStateCounts = {
    openThreads,
    resolvedThreads,
    totalThreads: rootComments.length,
    pendingApprovals: pendingApprovals.length,
    decidedApprovals: orderedApprovals.length - pendingApprovals.length,
    totalApprovals: orderedApprovals.length,
    approvedWithChanges: approvalsWithChanges.length,
    blockingApprovals: blockingApprovals.length,
    activeApprovalIds,
  };

  if (shareIntent === "final_delivery" || assetStatus === "final") {
    return {
      key: "delivery",
      label: "Final delivery",
      tone: "accent",
      summary: "This review has moved out of feedback mode and into a finished handoff state.",
      nextStep: "Review the delivery details, then download or forward the approved asset instead of reopening review.",
      decisionMeaning,
      lifecycleLabel,
      counts: sharedCounts,
    };
  }

  if (permissions === "approve" && orderedApprovals.length === 0) {
    return {
      key: "approval_not_configured",
      label: "Approval setup needed",
      tone: "orange",
      summary: "This review asks for sign-off, but no approval step is assigned yet.",
      nextStep: internal
        ? "Create or assign the approval step before treating this review as a true approval request."
        : "Use comments for feedback for now. The owner still needs to assign the approval step that this link controls.",
      decisionMeaning,
      lifecycleLabel,
      counts: sharedCounts,
    };
  }

  if (blockingApprovals.length > 0 || assetStatus === "needs_changes") {
    return {
      key: "changes_requested",
      label: "Changes requested",
      tone: "red",
      summary: "This cut is not approved yet. At least one decision has formally sent it back for revision.",
      nextStep: internal
        ? "Address the blocking notes, upload a new version, and reopen approval on the next cut."
        : "Use comments to capture exact revisions, then return for approval after the updated cut is ready.",
      decisionMeaning,
      lifecycleLabel,
      counts: sharedCounts,
    };
  }

  if (positiveApprovals.length === orderedApprovals.length && orderedApprovals.length > 0) {
    if (approvalsWithChanges.length > 0 || openThreads > 0) {
      return {
        key: "approved_with_changes",
        label: "Approved with follow-up",
        tone: "green",
        summary: "Approval has been granted, but there are still follow-up notes attached to this version.",
        nextStep: internal
          ? "Use the decision notes and remaining comments to finish the revision before final handoff."
          : "Treat the decision notes and any open threads as the follow-up list for the next revision or final export.",
        decisionMeaning,
        lifecycleLabel,
        counts: sharedCounts,
      };
    }

    return {
      key: "approved",
      label: "Approved",
      tone: "green",
      summary: "All required approval decisions are complete on this version.",
      nextStep: internal
        ? "This cut is ready for handoff, packaging, or a final delivery link."
        : "No further decision is needed on this review link.",
      decisionMeaning,
      lifecycleLabel,
      counts: sharedCounts,
    };
  }

  if (openThreads > 0) {
    return {
      key: "feedback_open",
      label: "Feedback in progress",
      tone: "orange",
      summary: "Open comments are still driving changes on this cut, so the review is not settled yet.",
      nextStep:
        permissions === "approve"
          ? "Use comments for blockers and context first. Record approval only when this version is actually ready."
          : "Keep notes tied to the right frame or timestamp so the next revision is unambiguous.",
      decisionMeaning,
      lifecycleLabel,
      counts: sharedCounts,
    };
  }

  if (pendingApprovals.length > 0) {
    return {
      key: "awaiting_approval",
      label: "Awaiting approval",
      tone: "accent",
      summary: "Feedback is settled and the next step is an approval decision on this version.",
      nextStep:
        permissions === "approve"
          ? activeApprovalIds.length > 0
            ? "If this is your step, record a decision from the approval panel."
            : "Approval is pending, but this link is not assigned to the active approval step."
          : "Wait for the active approver to record a decision.",
      decisionMeaning,
      lifecycleLabel,
      counts: sharedCounts,
    };
  }

  if (permissions === "view") {
    return {
      key: "view_only",
      label: "View only",
      tone: "slate",
      summary: "This share is for reference, not for collecting more feedback or approval.",
      nextStep: "Use the rail to review the existing history and download the file if the handoff allows it.",
      decisionMeaning,
      lifecycleLabel,
      counts: sharedCounts,
    };
  }

  return {
    key: "ready_for_review",
    label: "Ready for review",
    tone: "accent",
    summary: "The cut is ready for the next round of review and there are no open blockers recorded yet.",
    nextStep:
      permissions === "approve"
        ? "Add any final context in comments, then record approval when the cut is ready."
        : "Start the review by leaving the first clear note against the media.",
    decisionMeaning,
    lifecycleLabel,
    counts: sharedCounts,
  };
}
