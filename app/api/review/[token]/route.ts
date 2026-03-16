import { NextResponse } from "next/server";
import { getExternalApprovalState, getReviewInviteByToken } from "@/lib/review-invites";
import { deriveShareIntent } from "@/lib/sharing/share-intent";
import { getSupabase } from "@/lib/supabase";
import type { ApprovalStep, SharePermission } from "@/lib/types/codeliver";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inviteLookup = await getReviewInviteByToken(token);

  if (!inviteLookup.ok) {
    return NextResponse.json(
      { error: inviteLookup.error },
      { status: inviteLookup.status }
    );
  }

  const { invite } = inviteLookup;
  const supabase = getSupabase();

  const [commentsResult, approvalsResult, workflowResult] = await Promise.all([
    supabase
      .from("comments")
      .select("*")
      .eq("asset_id", invite.asset_id)
      .eq("visibility", "external")
      .order("created_at", { ascending: true }),
    supabase
      .from("approvals")
      .select("*")
      .eq("asset_id", invite.asset_id)
      .order("step_order", { ascending: true }),
    supabase
      .from("approval_workflows")
      .select("id, mode, status")
      .eq("asset_id", invite.asset_id)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  if (commentsResult.error) {
    return NextResponse.json({ error: commentsResult.error.message }, { status: 500 });
  }

  if (approvalsResult.error) {
    return NextResponse.json({ error: approvalsResult.error.message }, { status: 500 });
  }

  if (workflowResult.error) {
    return NextResponse.json({ error: workflowResult.error.message }, { status: 500 });
  }

  const nextViewCount = (invite.view_count ?? 0) + 1;
  await supabase
    .from("review_invites")
    .update({
      view_count: nextViewCount,
      last_viewed_at: new Date().toISOString(),
    })
    .eq("id", invite.id);

  const approvalState = getExternalApprovalState({
    approvals: (approvalsResult.data ?? []) as ApprovalStep[],
    invite,
    workflowMode: workflowResult.data?.mode ?? null,
  });

  return NextResponse.json({
    asset: invite.assets,
    approvals: approvalState.approvals,
    active_approval_ids: approvalState.activeApprovalIds,
    approval_access_message: approvalState.approvalAccessMessage,
    comments: commentsResult.data ?? [],
    permissions: invite.permissions,
    share_intent: deriveShareIntent({
      permissions: invite.permissions as SharePermission,
      downloadEnabled: invite.download_enabled,
      watermarkEnabled: invite.watermark_enabled,
    }),
    reviewer_name: invite.reviewer_name,
    expires_at: invite.expires_at,
    download_enabled: invite.download_enabled ?? true,
    watermark_enabled: invite.watermark_enabled ?? false,
    watermark_text: invite.watermark_text,
    workflow_mode: workflowResult.data?.mode ?? null,
    invite: {
      id: invite.id,
      reviewer_name: invite.reviewer_name,
      expires_at: invite.expires_at,
      permissions: invite.permissions,
      download_enabled: invite.download_enabled ?? true,
      watermark_enabled: invite.watermark_enabled ?? false,
      watermark_text: invite.watermark_text,
      view_count: nextViewCount,
      max_views: invite.max_views,
    },
  });
}
