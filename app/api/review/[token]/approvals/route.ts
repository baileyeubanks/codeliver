import { NextResponse } from "next/server";
import { recordApprovalDecision } from "@/lib/approval-decisions";
import { demoReviewPayload } from "@/lib/review/demoReview";
import {
  canInviteDecideApproval,
  getAuthorizedReviewInvite,
  getExternalApprovalState,
  inviteCanApprove,
  reviewInviteErrorPayload,
} from "@/lib/review-invites";
import type { ApprovalDecision } from "@/lib/types/codeliver";
import { getSupabase } from "@/lib/supabase";
import { toPublicApprovalStep } from "@/lib/review/public-dto";
import type { ApprovalStep } from "@/lib/types/codeliver";
import { resolveAssetVersion } from "@/lib/versions";

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

    const demoInvite = {
      ...demoReviewPayload.invite,
      asset_id: demoReviewPayload.asset.id,
      version_id: null,
      approval_id: demoReviewPayload.invite.approval_id,
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
      return NextResponse.json(
        { error: approvalAccess.error },
        { status: approvalAccess.statusCode },
      );
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

    return NextResponse.json({
      approval: toPublicApprovalStep({
        ...approval,
        status: body.status,
        decision_note: body.decision_note || null,
        decided_at: decidedAt,
      }),
      asset_status: assetStatus,
      active_approval_ids: approvalState.activeApprovalIds,
      approval_access_message: approvalState.approvalAccessMessage,
    });
  }

  const inviteLookup = await getAuthorizedReviewInvite(req, token);

  if (!inviteLookup.ok) {
    return NextResponse.json(
      reviewInviteErrorPayload(inviteLookup),
      { status: inviteLookup.status }
    );
  }

  const { invite } = inviteLookup;
  if (!inviteCanApprove(invite)) {
    return NextResponse.json({ error: "This review link cannot approve" }, { status: 403 });
  }

  if (!invite.version_id) {
    return NextResponse.json(
      { error: "This approval link is not bound to a media version" },
      { status: 409 },
    );
  }

  const versionLookup = await resolveAssetVersion({
    assetId: invite.asset_id,
    versionId: invite.version_id,
  });
  if (!versionLookup.ok) {
    return NextResponse.json(
      {
        error:
          versionLookup.status >= 500
            ? "Approval media is temporarily unavailable"
            : versionLookup.error,
      },
      { status: versionLookup.status >= 500 ? 503 : versionLookup.status },
    );
  }
  if (!versionLookup.version.is_current) {
    return NextResponse.json(
      {
        error:
          "This approval link is for an earlier version. Ask the producer to share the current version.",
      },
      { status: 409 },
    );
  }

  if (!body.id || !ALLOWED_DECISIONS.has(body.status)) {
    return NextResponse.json({ error: "Invalid approval decision" }, { status: 400 });
  }

  const supabase = getSupabase();
  const [approvalsResult, workflowResult] = await Promise.all([
    supabase
      .from("approvals")
      .select(
        "id, asset_id, version_id, workflow_id, step_order, role_label, assignee_email, assignee_id, status, decision_note, decided_at, created_at",
      )
      .eq("asset_id", invite.asset_id)
      .eq("version_id", versionLookup.version.id)
      .order("step_order", { ascending: true }),
    supabase
      .from("approval_workflows")
      .select("mode, version_id")
      .eq("asset_id", invite.asset_id)
      .eq("version_id", versionLookup.version.id)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  if (approvalsResult.error) {
    return NextResponse.json({ error: "Approval workflow is temporarily unavailable" }, { status: 503 });
  }

  if (workflowResult.error) {
    return NextResponse.json({ error: "Approval workflow is temporarily unavailable" }, { status: 503 });
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
    versionId: versionLookup.version.id,
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
    .select(
      "id, asset_id, version_id, workflow_id, step_order, role_label, assignee_email, assignee_id, status, decision_note, decided_at, created_at",
    )
    .eq("asset_id", invite.asset_id)
    .eq("version_id", versionLookup.version.id)
    .order("step_order", { ascending: true });

  if (updatedApprovalsError) {
    return NextResponse.json({ error: "Approval workflow is temporarily unavailable" }, { status: 503 });
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
    approval: toPublicApprovalStep(decision.data as ApprovalStep),
    asset_status: decision.assetStatus,
    active_approval_ids: approvalState.activeApprovalIds,
    approval_access_message: approvalState.approvalAccessMessage,
  });
}
