import { NextResponse } from "next/server";
import {
  createInviteReviewAccessGrant,
  getAuthorizedReviewInvite,
  getExternalApprovalState,
  reviewInviteErrorPayload,
} from "@/lib/review-invites";
import { createReviewAccessGrant } from "@/lib/security/review-password";
import { createReviewViewGrant } from "@/lib/security/review-view-grant";
import {
  claimShareLinkView,
  reviewViewClaimRequestId,
  usesAtomicShareLinkViewClaims,
  type AtomicShareLinkViewClaim,
} from "@/lib/sharing/share-claims";
import { deriveShareIntent } from "@/lib/sharing/share-intent";
import { getSupabase } from "@/lib/supabase";
import type { ApprovalStep, SharePermission } from "@/lib/types/codeliver";
import { resolveAssetVersion } from "@/lib/versions";
import {
  canInviteCompleteReview,
  toPublicReviewCompletion,
} from "@/lib/review/completion";
import {
  toPublicEditDecision,
  toPublicReviewAsset,
  toPublicReviewComment,
  toPublicReviewVersion,
} from "@/lib/review/public-dto";

const VIEW_LIMIT_ERROR = "This review link has reached its view limit";
const TEMPORARY_ACCESS_ERROR = "Review access is temporarily unavailable";

function withCookie(request: Request, name: string, value: string) {
  const headers = new Headers(request.headers);
  const cookieSegments = (headers.get("cookie") ?? "")
    .split(";")
    .map((segment) => segment.trim())
    .filter((segment) => segment && !segment.startsWith(`${name}=`));
  cookieSegments.push(`${name}=${value}`);
  headers.set("cookie", cookieSegments.join("; "));
  return new Request(request, { headers });
}

function claimMatchesInvite(
  claim: AtomicShareLinkViewClaim,
  invite: {
    id: string;
    asset_id: string;
    version_id: string | null;
    assets?: { projects: { id: string } | null } | null;
  },
) {
  const projectId = invite.assets?.projects?.id ?? null;
  return (
    projectId !== null &&
    claim.inviteId === invite.id &&
    claim.assetId === invite.asset_id &&
    claim.versionId === invite.version_id &&
    claim.projectId === projectId
  );
}

function claimError(result: { status: number; error: string }) {
  return NextResponse.json({ error: result.error }, { status: result.status });
}

function isUnavailableReviewCompletionRelation(error: {
  code?: string | null;
  message?: string | null;
} | null) {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const atomicClaims = usesAtomicShareLinkViewClaims();
  const requestId = atomicClaims ? reviewViewClaimRequestId(request) : null;
  let claim: AtomicShareLinkViewClaim | null = null;
  let inviteLookup = await getAuthorizedReviewInvite(request, token, {
    enforceViewLimit: true,
  });

  // A response can be lost after the final view commits. Replaying the same
  // request UUID recovers that claim without charging another view.
  if (
    atomicClaims &&
    !inviteLookup.ok &&
    inviteLookup.status === 410 &&
    inviteLookup.error === VIEW_LIMIT_ERROR
  ) {
    const replay = await claimShareLinkView({ token, requestId });
    if (!replay.ok) return claimError(replay);
    if (replay.mode !== "atomic") {
      return claimError({ status: 503, error: TEMPORARY_ACCESS_ERROR });
    }

    claim = replay.claim;
    try {
      const compatibilityGrant = createReviewAccessGrant({
        token,
        inviteId: claim.inviteId,
        passwordHash: `unprotected:${claim.inviteId}`,
      });
      inviteLookup = await getAuthorizedReviewInvite(
        withCookie(request, compatibilityGrant.name, compatibilityGrant.value),
        token,
        { enforceViewLimit: true },
      );
    } catch {
      return claimError({ status: 503, error: TEMPORARY_ACCESS_ERROR });
    }
  }

  if (!inviteLookup.ok) {
    return NextResponse.json(
      reviewInviteErrorPayload(inviteLookup),
      { status: inviteLookup.status }
    );
  }

  const { invite } = inviteLookup;
  if (atomicClaims && !claim) {
    const claimed = await claimShareLinkView({ token, requestId });
    if (!claimed.ok) return claimError(claimed);
    if (claimed.mode !== "atomic") {
      return claimError({ status: 503, error: TEMPORARY_ACCESS_ERROR });
    }
    claim = claimed.claim;
  }

  if (claim && !claimMatchesInvite(claim, invite)) {
    return claimError({ status: 503, error: TEMPORARY_ACCESS_ERROR });
  }

  const supabase = getSupabase();
  const versionLookup = await resolveAssetVersion({
    assetId: invite.asset_id,
    versionId: invite.version_id,
  });

  if (!versionLookup.ok) {
    return NextResponse.json(
      {
        error:
          versionLookup.status >= 500
            ? "Review media is temporarily unavailable"
            : versionLookup.error,
      },
      { status: versionLookup.status >= 500 ? 503 : versionLookup.status },
    );
  }

  const [
    commentsResult,
    approvalsResult,
    workflowResult,
    editDecisionsResult,
    completionResult,
  ] = await Promise.all([
    supabase
      .from("comments")
      .select(
        "id, asset_id, version_id, parent_id, author_name, body, timecode_seconds, frame_number, pin_x, pin_y, status, resolved_at, created_at, updated_at",
      )
      .eq("asset_id", invite.asset_id)
      .eq("version_id", versionLookup.version.id)
      .eq("visibility", "external")
      .eq("review_invite_id", invite.id)
      .order("created_at", { ascending: true }),
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
      .select("id, version_id, mode, status")
      .eq("asset_id", invite.asset_id)
      .eq("version_id", versionLookup.version.id)
      .maybeSingle(),
    supabase
      .from("edit_decisions")
      .select(
        "id, asset_id, version_id, created_by_name, decision_type, source, status, start_seconds, end_seconds, label, confidence, client_request_id, created_at, updated_at",
      )
      .eq("asset_id", invite.asset_id)
      .eq("version_id", versionLookup.version.id)
      .eq("review_invite_id", invite.id)
      .order("start_seconds", { ascending: true }),
    supabase
      .from("review_invite_completions")
      .select(
        "id, review_invite_id, asset_id, version_id, reviewer_name, reviewer_email, note, completed_at",
      )
      .eq("review_invite_id", invite.id)
      .eq("asset_id", invite.asset_id)
      .eq("version_id", versionLookup.version.id)
      .maybeSingle(),
  ]);

  if (commentsResult.error) {
    return NextResponse.json({ error: "Review comments are temporarily unavailable" }, { status: 503 });
  }

  if (approvalsResult.error) {
    return NextResponse.json({ error: "Review approvals are temporarily unavailable" }, { status: 503 });
  }

  if (workflowResult.error) {
    return NextResponse.json({ error: "Review workflow is temporarily unavailable" }, { status: 503 });
  }

  if (editDecisionsResult.error) {
    return NextResponse.json({ error: "Review decisions are temporarily unavailable" }, { status: 503 });
  }

  const completionUnavailable = isUnavailableReviewCompletionRelation(
    completionResult.error,
  );
  if (completionResult.error && !completionUnavailable) {
    return NextResponse.json({ error: "Review completion is temporarily unavailable" }, { status: 503 });
  }

  const currentViewCount = invite.view_count ?? 0;
  const viewLimitReached =
    typeof invite.max_views === "number" &&
    currentViewCount >= invite.max_views;
  let nextViewCount = claim?.viewCount ?? currentViewCount;

  if (!atomicClaims && !(inviteLookup.accessGranted && viewLimitReached)) {
    let viewUpdateQuery = supabase
      .from("review_invites")
      .update({
        view_count: currentViewCount + 1,
        last_viewed_at: new Date().toISOString(),
      })
      .eq("id", invite.id);

    viewUpdateQuery =
      typeof invite.view_count === "number"
        ? viewUpdateQuery.eq("view_count", currentViewCount)
        : viewUpdateQuery.is("view_count", null);

    const viewUpdate = await viewUpdateQuery
      .select("view_count")
      .maybeSingle();

    if (viewUpdate.error) {
      return NextResponse.json(
        { error: "Review access is temporarily unavailable" },
        { status: 503 },
      );
    }
    if (!viewUpdate.data) {
      return NextResponse.json(
        { error: "Review access changed while this link was opening. Try again." },
        { status: 409 },
      );
    }
    nextViewCount = viewUpdate.data.view_count;
  }

  const effectiveMaxViews = claim?.maxViews ?? invite.max_views;

  const baseApprovalState = getExternalApprovalState({
    approvals: (approvalsResult.data ?? []) as ApprovalStep[],
    invite,
    workflowMode: workflowResult.data?.mode ?? null,
  });
  const approvalState = versionLookup.version.is_current
    ? baseApprovalState
    : {
        ...baseApprovalState,
        approvals: baseApprovalState.approvals.map((approval) => ({
          ...approval,
          can_decide: false,
        })),
        activeApprovalIds: [],
        approvalAccessMessage:
          "This approval link is for an earlier version. Ask the producer to share the current version.",
      };
  const mediaUrl = `/api/review/${encodeURIComponent(token)}/media`;
  const downloadEnabled = invite.download_enabled === true;

  const response = NextResponse.json({
    asset: invite.assets ? toPublicReviewAsset(invite.assets, mediaUrl) : null,
    version: toPublicReviewVersion(versionLookup.version, mediaUrl),
    download_url: downloadEnabled ? `${mediaUrl}?download=1` : null,
    edit_decisions: (editDecisionsResult.data ?? []).map(toPublicEditDecision),
    approvals: approvalState.approvals,
    active_approval_ids: approvalState.activeApprovalIds,
    approval_access_message: approvalState.approvalAccessMessage,
    comments: (commentsResult.data ?? []).map(toPublicReviewComment),
    completion: completionResult.data
      ? toPublicReviewCompletion(completionResult.data)
      : null,
    completion_available: !completionUnavailable,
    can_complete_review:
      !completionUnavailable && canInviteCompleteReview(invite),
    permissions: invite.permissions,
    share_intent: deriveShareIntent({
      permissions: invite.permissions as SharePermission,
      downloadEnabled,
      watermarkEnabled: invite.watermark_enabled,
    }),
    reviewer_name: invite.reviewer_name,
    expires_at: invite.expires_at,
    download_enabled: downloadEnabled,
    watermark_enabled: invite.watermark_enabled ?? false,
    watermark_text: invite.watermark_text,
    workflow_mode: workflowResult.data?.mode ?? null,
    invite: {
      id: invite.id,
      approval_id: invite.approval_id,
      reviewer_name: invite.reviewer_name,
      expires_at: invite.expires_at,
      permissions: invite.permissions,
      download_enabled: downloadEnabled,
      watermark_enabled: invite.watermark_enabled ?? false,
      watermark_text: invite.watermark_text,
      view_count: nextViewCount,
      max_views: effectiveMaxViews,
    },
  });

  try {
    if (invite.password_hash || typeof effectiveMaxViews === "number") {
      const grant = createInviteReviewAccessGrant(token, invite);
      response.cookies.set(grant.name, grant.value, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: grant.maxAge,
      });
    }

    if (claim) {
      const viewGrant = createReviewViewGrant({
        token,
        inviteId: invite.id,
        claimId: claim.claimId,
        requestId: claim.requestId,
        inviteExpiresAt: invite.expires_at,
      });
      response.cookies.set(viewGrant.name, viewGrant.value, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: viewGrant.maxAge,
      });
    }
  } catch {
    return NextResponse.json(
      { error: TEMPORARY_ACCESS_ERROR },
      { status: 503 },
    );
  }

  return response;
}
