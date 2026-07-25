import { apiError, apiJson, backendUnavailable } from "@/lib/api/responses";
import { recordApprovalDecision } from "@/lib/approval-decisions";
import { demoReviewPayload } from "@/lib/review/demoReview";
import {
  canInviteDecideApproval,
  getExternalApprovalState,
  inviteCanApprove,
  getReviewInviteByToken,
} from "@/lib/review-invites";
import type { ApprovalDecision } from "@/lib/types/codeliver";
import { getSupabase } from "@/lib/supabase";

const ALLOWED_DECISIONS = new Set<ApprovalDecision>([
  "approved",
  "approved_with_changes",
  "changes_requested",
  "rejected",
]);

const BLOCKING_DECISIONS = new Set<ApprovalDecision>([
  "changes_requested",
  "rejected",
]);

function reviewError(error: string, status: number, code = "REVIEW_REQUEST_INVALID") {
  if (status >= 500) return backendUnavailable();
  return apiError(error, code, status);
}

async function patchApproval(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return reviewError("Approval request must be JSON.", 400);
  }

  if (process.env.NODE_ENV !== "production" && token === "demo") {
    if (!body.id || !ALLOWED_DECISIONS.has(body.status)) {
      return reviewError("Invalid approval decision", 400);
    }

    const demoInvite = {
      ...demoReviewPayload.invite,
      asset_id: demoReviewPayload.asset.id,
      version_id: null,
      token,
      reviewer_name: demoReviewPayload.reviewer_name,
      reviewer_email: demoReviewPayload.reviewer_email,
      permissions: demoReviewPayload.permissions,
      password_hash: null,
      expires_at: demoReviewPayload.expires_at,
      watermark_enabled: demoReviewPayload.watermark_enabled,
      watermark_text: demoReviewPayload.watermark_text,
      download_enabled: demoReviewPayload.download_enabled,
      view_count: demoReviewPayload.invite.view_count,
      max_views: demoReviewPayload.invite.max_views,
      last_viewed_at: null,
    };
    const approvalAccess = canInviteDecideApproval({
      approvalId: body.id,
      approvals: demoReviewPayload.approvals,
      invite: demoInvite,
      workflowMode: demoReviewPayload.workflow_mode,
    });

    if (!approvalAccess.ok) {
      return reviewError(approvalAccess.error, approvalAccess.statusCode, "REVIEW_APPROVAL_FORBIDDEN");
    }

    const approval = approvalAccess.approval;
    const decidedAt = new Date().toISOString();
    const updatedApprovals = demoReviewPayload.approvals.map((item) =>
      item.id === body.id
        ? {
            ...item,
            status: body.status,
            decision_note: body.decision_note || null,
            decided_at: decidedAt,
          }
        : item,
    );
    const approvalState = getExternalApprovalState({
      approvals: updatedApprovals,
      invite: demoInvite,
      workflowMode: demoReviewPayload.workflow_mode,
    });
    const assetStatus =
      updatedApprovals.length > 0 &&
      updatedApprovals.every(
        (item) => item.status === "approved" || item.status === "approved_with_changes",
      )
        ? "approved"
        : BLOCKING_DECISIONS.has(body.status)
          ? "needs_changes"
          : demoReviewPayload.asset.status;

    return apiJson({
      approval: {
        ...approval,
        status: body.status,
        decision_note: body.decision_note || null,
        decided_at: decidedAt,
      },
      asset_status: assetStatus,
      active_approval_ids: approvalState.activeApprovalIds,
      approval_access_message: approvalState.approvalAccessMessage,
    });
  }

  const inviteLookup = await getReviewInviteByToken(token);

  if (!inviteLookup.ok) {
    return reviewError(inviteLookup.error, inviteLookup.status, "REVIEW_INVITE_UNAVAILABLE");
  }

  const { invite } = inviteLookup;
  if (!inviteCanApprove(invite)) {
    return reviewError("This review link cannot approve", 403, "REVIEW_APPROVAL_FORBIDDEN");
  }

  if (!body.id || !ALLOWED_DECISIONS.has(body.status)) {
    return reviewError("Invalid approval decision", 400);
  }

  const supabase = getSupabase();
  const [approvalsResult, workflowResult] = await Promise.all([
    supabase
      .from("approvals")
      .select("*")
      .eq("asset_id", invite.asset_id)
      .order("step_order", { ascending: true }),
    supabase
      .from("approval_workflows")
      .select("mode")
      .eq("asset_id", invite.asset_id)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  if (approvalsResult.error) {
    return backendUnavailable();
  }

  if (workflowResult.error) {
    return backendUnavailable();
  }

  const approvalAccess = canInviteDecideApproval({
    approvalId: body.id,
    approvals: approvalsResult.data ?? [],
    invite,
    workflowMode: workflowResult.data?.mode ?? null,
  });

  if (!approvalAccess.ok) {
    return reviewError(approvalAccess.error, approvalAccess.statusCode, "REVIEW_APPROVAL_FORBIDDEN");
  }

  const reviewerName =
    body.reviewer_name?.trim() ||
    invite.reviewer_name ||
    invite.reviewer_email ||
    "External reviewer";

  if (!invite.reviewer_name && body.reviewer_name?.trim()) {
    await supabase
      .from("review_invites")
      .update({ reviewer_name: body.reviewer_name.trim() })
      .eq("id", invite.id);
  }

  const decision = await recordApprovalDecision({
    assetId: invite.asset_id,
    approvalId: body.id,
    status: body.status,
    decisionNote: body.decision_note,
    actor: {
      id: null,
      name: reviewerName,
    },
  });

  if (!decision.ok) {
    return reviewError(decision.error, decision.statusCode, "REVIEW_APPROVAL_UNAVAILABLE");
  }

  const { data: updatedApprovals, error: updatedApprovalsError } = await supabase
    .from("approvals")
    .select("*")
    .eq("asset_id", invite.asset_id)
    .order("step_order", { ascending: true });

  if (updatedApprovalsError) {
    return backendUnavailable();
  }

  const approvalState = getExternalApprovalState({
    approvals: updatedApprovals ?? [],
    invite: {
      ...invite,
      reviewer_name: invite.reviewer_name || body.reviewer_name?.trim() || null,
    },
    workflowMode: workflowResult.data?.mode ?? null,
  });

  return apiJson({
    approval: decision.data,
    asset_status: decision.assetStatus,
    active_approval_ids: approvalState.activeApprovalIds,
    approval_access_message: approvalState.approvalAccessMessage,
  });
}

export async function PATCH(req: Request, context: { params: Promise<{ token: string }> }) {
  try {
    return await patchApproval(req, context);
  } catch {
    return backendUnavailable();
  }
}
