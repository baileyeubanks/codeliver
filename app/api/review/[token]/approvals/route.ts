import { NextResponse } from "next/server";
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

export async function PATCH(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json();

  if (process.env.NODE_ENV !== "production" && token === "demo") {
    if (!body.id || !ALLOWED_DECISIONS.has(body.status)) {
      return NextResponse.json({ error: "Invalid approval decision" }, { status: 400 });
    }

    const approval = demoReviewPayload.approvals.find((item) => item.id === body.id);
    if (!approval) {
      return NextResponse.json({ error: "Approval step not found" }, { status: 404 });
    }

    const updatedApprovals = demoReviewPayload.approvals.map((item) =>
      item.id === body.id
        ? {
            ...item,
            status: body.status,
            decision_note: body.decision_note || null,
            decided_at: new Date().toISOString(),
          }
        : item,
    );
    const approvalState = getExternalApprovalState({
      approvals: updatedApprovals,
      invite: {
        ...demoReviewPayload.invite,
        asset_id: demoReviewPayload.asset.id,
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
      },
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

    return NextResponse.json({
      approval: {
        ...approval,
        status: body.status,
        decision_note: body.decision_note || null,
        decided_at: new Date().toISOString(),
      },
      asset_status: assetStatus,
      active_approval_ids: approvalState.activeApprovalIds,
      approval_access_message: approvalState.approvalAccessMessage,
    });
  }

  const inviteLookup = await getReviewInviteByToken(token);

  if (!inviteLookup.ok) {
    return NextResponse.json(
      { error: inviteLookup.error },
      { status: inviteLookup.status }
    );
  }

  const { invite } = inviteLookup;
  if (!inviteCanApprove(invite)) {
    return NextResponse.json({ error: "This review link cannot approve" }, { status: 403 });
  }

  if (!body.id || !ALLOWED_DECISIONS.has(body.status)) {
    return NextResponse.json({ error: "Invalid approval decision" }, { status: 400 });
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
    return NextResponse.json({ error: approvalsResult.error.message }, { status: 500 });
  }

  if (workflowResult.error) {
    return NextResponse.json({ error: workflowResult.error.message }, { status: 500 });
  }

  const approvalAccess = canInviteDecideApproval({
    approvalId: body.id,
    approvals: approvalsResult.data ?? [],
    invite,
    workflowMode: workflowResult.data?.mode ?? null,
  });

  if (!approvalAccess.ok) {
    return NextResponse.json({ error: approvalAccess.error }, { status: approvalAccess.statusCode });
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
    return NextResponse.json({ error: decision.error }, { status: decision.statusCode });
  }

  const { data: updatedApprovals, error: updatedApprovalsError } = await supabase
    .from("approvals")
    .select("*")
    .eq("asset_id", invite.asset_id)
    .order("step_order", { ascending: true });

  if (updatedApprovalsError) {
    return NextResponse.json({ error: updatedApprovalsError.message }, { status: 500 });
  }

  const approvalState = getExternalApprovalState({
    approvals: updatedApprovals ?? [],
    invite: {
      ...invite,
      reviewer_name: invite.reviewer_name || body.reviewer_name?.trim() || null,
    },
    workflowMode: workflowResult.data?.mode ?? null,
  });

  return NextResponse.json({
    approval: decision.data,
    asset_status: decision.assetStatus,
    active_approval_ids: approvalState.activeApprovalIds,
    approval_access_message: approvalState.approvalAccessMessage,
  });
}
