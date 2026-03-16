import crypto from "crypto";
import type {
  ApprovalDecision,
  ApprovalStep,
  SharePermission,
  WorkflowMode,
} from "@/lib/types/codeliver";
import { getSupabase } from "@/lib/supabase";

interface ReviewInviteAsset {
  id: string;
  title: string;
  file_type: string;
  file_url: string | null;
  status: string;
  projects: { name: string } | null;
}

export interface ReviewInviteRecord {
  id: string;
  asset_id: string;
  token: string;
  reviewer_name: string | null;
  reviewer_email: string | null;
  permissions: SharePermission;
  password_hash: string | null;
  expires_at: string | null;
  watermark_enabled: boolean | null;
  watermark_text: string | null;
  download_enabled: boolean | null;
  view_count: number | null;
  max_views: number | null;
  last_viewed_at: string | null;
  assets?: ReviewInviteAsset | null;
}

interface ExternalApprovalStateInput {
  approvals: ApprovalStep[];
  invite: ReviewInviteRecord;
  workflowMode: WorkflowMode | null;
}

export function normalizeReviewerEmail(value?: string | null) {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

export async function getReviewInviteByToken(token: string) {
  const { data, error } = await getSupabase()
    .from("review_invites")
    .select("*, assets(*, projects(name))")
    .eq("token", token)
    .maybeSingle();

  if (error || !data) {
    return {
      ok: false as const,
      status: 404,
      error: "Invalid or expired review link",
    };
  }

  const invite = data as ReviewInviteRecord;

  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return {
      ok: false as const,
      status: 410,
      error: "This review link has expired",
    };
  }

  if (
    typeof invite.max_views === "number" &&
    typeof invite.view_count === "number" &&
    invite.view_count >= invite.max_views
  ) {
    return {
      ok: false as const,
      status: 410,
      error: "This review link has reached its view limit",
    };
  }

  return {
    ok: true as const,
    invite,
  };
}

export function inviteCanComment(invite: ReviewInviteRecord) {
  return invite.permissions === "comment" || invite.permissions === "approve";
}

export function inviteCanApprove(invite: ReviewInviteRecord) {
  return invite.permissions === "approve";
}

export function getExternalApprovalState({
  approvals,
  invite,
  workflowMode,
}: ExternalApprovalStateInput) {
  const orderedApprovals = [...approvals].sort((a, b) => a.step_order - b.step_order);
  const pendingApprovals = orderedApprovals.filter((approval) => approval.status === "pending");
  const workflowActiveApprovals =
    workflowMode === "sequential" ? pendingApprovals.slice(0, 1) : pendingApprovals;
  const inviteEmail = normalizeReviewerEmail(invite.reviewer_email);
  const activeApprovalIds = new Set(
    workflowActiveApprovals
      .filter((approval) => normalizeReviewerEmail(approval.assignee_email) === inviteEmail)
      .map((approval) => approval.id),
  );

  let approvalAccessMessage: string | null = null;

  if (inviteCanApprove(invite)) {
    if (!inviteEmail) {
      approvalAccessMessage =
        "Approval links must be created for a specific reviewer email.";
    } else if (orderedApprovals.length === 0) {
      approvalAccessMessage = "No approval step is assigned to this review link yet.";
    } else if (activeApprovalIds.size === 0) {
      const hasAssignedPendingStep = pendingApprovals.some(
        (approval) => normalizeReviewerEmail(approval.assignee_email) === inviteEmail,
      );

      approvalAccessMessage = hasAssignedPendingStep
        ? workflowMode === "sequential"
          ? "This review link is waiting on an earlier approval step."
          : "This review link does not control an active approval step."
        : "This review link is not assigned to an active approval step.";
    }
  }

  return {
    approvals: orderedApprovals.map((approval) => ({
      ...approval,
      assignee_email: null,
      assignee_id: null,
      can_decide: activeApprovalIds.has(approval.id),
    })),
    activeApprovalIds: Array.from(activeApprovalIds),
    approvalAccessMessage,
  };
}

export function canInviteDecideApproval({
  approvalId,
  approvals,
  invite,
  workflowMode,
}: ExternalApprovalStateInput & { approvalId: string }) {
  if (!inviteCanApprove(invite)) {
    return {
      ok: false as const,
      statusCode: 403,
      error: "This review link cannot approve",
    };
  }

  const approval = approvals.find((item) => item.id === approvalId);
  if (!approval) {
    return {
      ok: false as const,
      statusCode: 404,
      error: "Approval step not found",
    };
  }

  const approvalState = getExternalApprovalState({ approvals, invite, workflowMode });
  if (!approvalState.activeApprovalIds.includes(approvalId)) {
    return {
      ok: false as const,
      statusCode: 403,
      error:
        approvalState.approvalAccessMessage ||
        "This review link is not assigned to the active approval step.",
    };
  }

  return {
    ok: true as const,
    approval,
  };
}

export async function createApprovalInvite({
  assetId,
  reviewerEmail,
  reviewerName,
  createdBy,
}: {
  assetId: string;
  reviewerEmail: string;
  reviewerName?: string | null;
  createdBy?: string | null;
}) {
  const normalizedEmail = normalizeReviewerEmail(reviewerEmail);
  if (!normalizedEmail) {
    throw new Error("Approval invites require a reviewer email");
  }

  const token = crypto.randomBytes(16).toString("hex");
  const { data, error } = await getSupabase()
    .from("review_invites")
    .insert({
      asset_id: assetId,
      token,
      permissions: "approve" satisfies SharePermission,
      created_by: createdBy ?? null,
      reviewer_email: normalizedEmail,
      reviewer_name: reviewerName?.trim() || null,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      download_enabled: false,
      watermark_enabled: false,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Could not create approval invite");
  }

  return data as ReviewInviteRecord;
}
