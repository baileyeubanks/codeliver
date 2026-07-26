import { recordApprovalDecision } from "@/lib/approval-decisions";
import {
  authorizeAdmittedReviewInvite,
  reserveReviewActionRate,
} from "@/lib/review/admission-authority";
import { demoReviewPayload } from "@/lib/review/demoReview";
import {
  canInviteDecideApproval,
  getExternalApprovalState,
  inviteCanApprove,
} from "@/lib/review-invites";
import {
  readReviewJsonObject,
  validateReviewMutationRequest,
} from "@/lib/review/request-boundary";
import {
  reviewBackendUnavailable,
  reviewError as reviewResponseError,
  reviewJson,
} from "@/lib/review/responses";
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
const APPROVAL_BODY_LIMIT_BYTES = 8 * 1_024;

function reviewError(
  error: string,
  status: number,
  code = "REVIEW_REQUEST_INVALID",
  headers?: HeadersInit,
) {
  if (status >= 500) return reviewBackendUnavailable(headers);
  return reviewResponseError(error, code, status, headers);
}

async function patchApproval(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const boundary = validateReviewMutationRequest(req, {
    maxBytes: APPROVAL_BODY_LIMIT_BYTES,
  });
  if (!boundary.ok) {
    return reviewError(
      "Review approval request is not allowed",
      boundary.status,
      boundary.code,
    );
  }

  const { token } = await params;
  const demo = process.env.NODE_ENV !== "production" && token === "demo";
  let authority:
    | Awaited<ReturnType<typeof authorizeAdmittedReviewInvite>>
    | null = null;
  let responseHeaders: HeadersInit | undefined;

  if (!demo) {
    authority = await authorizeAdmittedReviewInvite(req, token);
    if (!authority.ok) {
      return reviewError(
        "Review link is unavailable",
        authority.status,
        authority.code,
      );
    }
    responseHeaders = { "Set-Cookie": authority.setCookie };
    const rate = await reserveReviewActionRate({
      token,
      claims: authority.claims,
      action: "approval",
    });
    if (!rate.ok) {
      return reviewError(
        rate.status === 429
          ? "Review approval rate exceeded"
          : "Review link is unavailable",
        rate.status,
        rate.code,
        {
          ...responseHeaders,
          ...(rate.status === 429
            ? {
                "Retry-After": String(
                  Math.max(1, rate.retryAfterSeconds ?? 60),
                ),
              }
            : {}),
        },
      );
    }
  }

  const bodyResult = await readReviewJsonObject(req, {
    maxBytes: APPROVAL_BODY_LIMIT_BYTES,
  });
  if (!bodyResult.ok) {
    return reviewError(
      bodyResult.status === 413
        ? "Approval request is too large"
        : "Approval request must be JSON.",
      bodyResult.status,
      bodyResult.code,
      responseHeaders,
    );
  }
  const body = bodyResult.value;
  const approvalId =
    typeof body.id === "string" && body.id ? body.id : null;
  const requestedStatus =
    typeof body.status === "string" &&
    ALLOWED_DECISIONS.has(body.status as ApprovalDecision)
      ? (body.status as ApprovalDecision)
      : null;

  if (demo) {
    if (!approvalId || !requestedStatus) {
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
      approvalId,
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
      item.id === approvalId
        ? {
            ...item,
            status: requestedStatus,
            decision_note:
              typeof body.decision_note === "string"
                ? body.decision_note
                : null,
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
        : BLOCKING_DECISIONS.has(requestedStatus)
          ? "needs_changes"
          : demoReviewPayload.asset.status;

    return reviewJson({
      approval: {
        ...approval,
        status: requestedStatus,
        decision_note:
          typeof body.decision_note === "string"
            ? body.decision_note
            : null,
        decided_at: decidedAt,
      },
      asset_status: assetStatus,
      active_approval_ids: approvalState.activeApprovalIds,
      approval_access_message: approvalState.approvalAccessMessage,
    });
  }

  if (!authority?.ok) return reviewBackendUnavailable(responseHeaders);
  const { invite } = authority;
  if (!inviteCanApprove(invite)) {
    return reviewError(
      "This review link cannot approve",
      403,
      "REVIEW_APPROVAL_FORBIDDEN",
      responseHeaders,
    );
  }

  if (!approvalId || !requestedStatus) {
    return reviewError(
      "Invalid approval decision",
      400,
      "REVIEW_REQUEST_INVALID",
      responseHeaders,
    );
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
    return reviewBackendUnavailable(responseHeaders);
  }

  if (workflowResult.error) {
    return reviewBackendUnavailable(responseHeaders);
  }

  const approvalAccess = canInviteDecideApproval({
    approvalId,
    approvals: approvalsResult.data ?? [],
    invite,
    workflowMode: workflowResult.data?.mode ?? null,
  });

  if (!approvalAccess.ok) {
    return reviewError(
      approvalAccess.error,
      approvalAccess.statusCode,
      "REVIEW_APPROVAL_FORBIDDEN",
      responseHeaders,
    );
  }

  const requestedReviewerName =
    typeof body.reviewer_name === "string"
      ? body.reviewer_name.trim()
      : "";
  const reviewerName =
    requestedReviewerName ||
    invite.reviewer_name ||
    invite.reviewer_email ||
    "External reviewer";

  if (!invite.reviewer_name && requestedReviewerName) {
    await supabase
      .from("review_invites")
      .update({ reviewer_name: requestedReviewerName })
      .eq("id", invite.id);
  }

  const decision = await recordApprovalDecision({
    assetId: invite.asset_id,
    approvalId,
    status: requestedStatus,
    decisionNote:
      typeof body.decision_note === "string"
        ? body.decision_note
        : null,
    actor: {
      id: null,
      name: reviewerName,
    },
  });

  if (!decision.ok) {
    return reviewError(
      decision.error,
      decision.statusCode,
      "REVIEW_APPROVAL_UNAVAILABLE",
      responseHeaders,
    );
  }

  const { data: updatedApprovals, error: updatedApprovalsError } = await supabase
    .from("approvals")
    .select("*")
    .eq("asset_id", invite.asset_id)
    .order("step_order", { ascending: true });

  if (updatedApprovalsError) {
    return reviewBackendUnavailable(responseHeaders);
  }

  const approvalState = getExternalApprovalState({
    approvals: updatedApprovals ?? [],
    invite: {
      ...invite,
      reviewer_name:
        invite.reviewer_name || requestedReviewerName || null,
    },
    workflowMode: workflowResult.data?.mode ?? null,
  });

  return reviewJson({
    approval: decision.data,
    asset_status: decision.assetStatus,
    active_approval_ids: approvalState.activeApprovalIds,
    approval_access_message: approvalState.approvalAccessMessage,
  }, { headers: responseHeaders });
}

export async function PATCH(req: Request, context: { params: Promise<{ token: string }> }) {
  try {
    return await patchApproval(req, context);
  } catch {
    return reviewBackendUnavailable();
  }
}
