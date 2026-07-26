import { getExternalApprovalState } from "@/lib/review-invites";
import { authorizeAdmittedReviewInvite } from "@/lib/review/admission-authority";
import {
  EXTERNAL_COMMENT_COLUMNS,
  projectExternalComment,
} from "@/lib/review/external-comment";
import { validateReviewReadRequest } from "@/lib/review/request-boundary";
import {
  reviewBackendUnavailable,
  reviewError,
  reviewJson,
} from "@/lib/review/responses";
import { deriveShareIntent } from "@/lib/sharing/share-intent";
import { getSupabase } from "@/lib/supabase";
import type { ApprovalStep, SharePermission } from "@/lib/types/codeliver";
import { resolveAssetVersion } from "@/lib/versions";

async function getReview(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const boundary = validateReviewReadRequest(_req);
  if (!boundary.ok) {
    return reviewError(
      "Review request is not allowed",
      boundary.code,
      boundary.status,
    );
  }

  const { token } = await params;
  const authority = await authorizeAdmittedReviewInvite(_req, token);
  if (!authority.ok) {
    return reviewError(
      authority.status >= 500
        ? "Review service is unavailable"
        : "Review link is unavailable",
      authority.code,
      authority.status,
    );
  }

  const { invite } = authority;
  const supabase = getSupabase();
  const versionLookup = await resolveAssetVersion({
    assetId: invite.asset_id,
    versionId: invite.version_id,
  });

  if (!versionLookup.ok) {
    if (versionLookup.status >= 500) return reviewBackendUnavailable();
    return reviewError(
      versionLookup.error,
      "REVIEW_VERSION_UNAVAILABLE",
      versionLookup.status,
    );
  }

  const [commentsResult, approvalsResult, workflowResult, editDecisionsResult] = await Promise.all([
    supabase
      .from("comments")
      .select(EXTERNAL_COMMENT_COLUMNS)
      .eq("asset_id", invite.asset_id)
      .eq("version_id", versionLookup.version.id)
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
    supabase
      .from("edit_decisions")
      .select(
        "id, asset_id, version_id, review_invite_id, created_by_name, decision_type, source, status, start_seconds, end_seconds, label, confidence, client_request_id, created_at, updated_at",
      )
      .eq("asset_id", invite.asset_id)
      .eq("version_id", versionLookup.version.id)
      .or(`review_invite_id.eq.${invite.id},status.in.(accepted,applied)`)
      .order("start_seconds", { ascending: true }),
  ]);

  if (commentsResult.error) {
    return reviewBackendUnavailable();
  }

  if (approvalsResult.error) {
    return reviewBackendUnavailable();
  }

  if (workflowResult.error) {
    return reviewBackendUnavailable();
  }

  if (editDecisionsResult.error) {
    return reviewBackendUnavailable();
  }

  const approvalState = getExternalApprovalState({
    approvals: (approvalsResult.data ?? []) as ApprovalStep[],
    invite,
    workflowMode: workflowResult.data?.mode ?? null,
  });

  const mediaUrl = `/api/review/media/${authority.claims.admissionId}`;

  return reviewJson({
    asset: invite.assets
      ? {
          id: invite.assets.id,
          title: invite.assets.title,
          file_type: invite.assets.file_type,
          file_url: mediaUrl,
          status: invite.assets.status,
          projects: invite.assets.projects,
        }
      : null,
    version: {
      id: versionLookup.version.id,
      asset_id: versionLookup.version.asset_id,
      version_number: versionLookup.version.version_number,
      file_url: mediaUrl,
      file_size: versionLookup.version.file_size,
      thumbnail_url: null,
      duration_seconds: versionLookup.version.duration_seconds,
      resolution: versionLookup.version.resolution,
      is_current: versionLookup.version.is_current,
      created_at: versionLookup.version.created_at,
    },
    edit_decisions: (editDecisionsResult.data ?? []).map((decision) => ({
      id: decision.id,
      asset_id: decision.asset_id,
      version_id: decision.version_id,
      created_by_name: decision.created_by_name,
      decision_type: decision.decision_type,
      source: decision.source,
      status: decision.status,
      start_seconds: decision.start_seconds,
      end_seconds: decision.end_seconds,
      label: decision.label,
      confidence: decision.confidence,
      created_at: decision.created_at,
      updated_at: decision.updated_at,
    })),
    approvals: approvalState.approvals,
    active_approval_ids: approvalState.activeApprovalIds,
    approval_access_message: approvalState.approvalAccessMessage,
    comments: (commentsResult.data ?? []).map((comment) =>
      projectExternalComment(comment)
    ),
    permissions: invite.permissions,
    share_intent: deriveShareIntent({
      permissions: invite.permissions as SharePermission,
      downloadEnabled: invite.download_enabled,
      watermarkEnabled: invite.watermark_enabled,
    }),
    reviewer_name: invite.reviewer_name,
    expires_at: invite.expires_at,
    download_enabled: invite.download_enabled ?? false,
    watermark_enabled: invite.watermark_enabled ?? true,
    watermark_text: invite.watermark_text,
    workflow_mode: workflowResult.data?.mode ?? null,
    invite: {
      id: invite.id,
      reviewer_name: invite.reviewer_name,
      expires_at: invite.expires_at,
      permissions: invite.permissions,
      download_enabled: invite.download_enabled ?? false,
      watermark_enabled: invite.watermark_enabled ?? true,
      watermark_text: invite.watermark_text,
      view_count: invite.view_count,
      max_views: invite.max_views,
    },
  }, {
    headers: { "Set-Cookie": authority.setCookie },
  });
}

export async function GET(req: Request, context: { params: Promise<{ token: string }> }) {
  try {
    return await getReview(req, context);
  } catch {
    return reviewBackendUnavailable();
  }
}
