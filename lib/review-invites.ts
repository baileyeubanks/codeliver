import crypto from "crypto";
import type {
  ApprovalStep,
  SharePermission,
  WorkflowMode,
} from "@/lib/types/codeliver";
import { getSupabase, type DataSupabaseClient } from "@/lib/supabase";
import {
  opaqueTokenLookup,
  persistedOpaqueTokenFields,
  withoutPersistedTokenSecrets,
} from "@/lib/security/opaque-token";
import {
  createReviewAccessGrant,
  hasValidReviewAccessGrant,
} from "@/lib/security/review-password";
import { resolveAssetVersion } from "@/lib/versions";
import { toPublicApprovalStep } from "@/lib/review/public-dto";
import {
  CO_PRODUCTION_DATA_SCHEMA,
  getSupabaseDataSchema,
} from "@/lib/data-authority";

interface ReviewInviteAsset {
  id: string;
  title: string;
  file_type: string;
  status: string;
  projects: { id: string; name: string } | null;
}

export interface ReviewInviteRecord {
  id: string;
  asset_id: string;
  version_id: string | null;
  approval_id: string | null;
  token?: string;
  token_hash?: string;
  token_ciphertext?: string;
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
  active?: boolean | null;
  assets?: ReviewInviteAsset | null;
}

interface ExternalApprovalStateInput {
  approvals: ApprovalStep[];
  invite: ReviewInviteRecord;
  workflowMode: WorkflowMode | null;
}

interface CreateApprovalInviteInput {
  assetId: string;
  versionId: string;
  approvalId: string;
  reviewerEmail: string;
  reviewerName?: string | null;
  createdBy?: string | null;
}

const ASSIGNEE_VERIFICATION_ERROR = "Assignee could not be verified";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeReviewerEmail(value?: string | null) {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

export async function resolvePrivilegedApprovalAssigneeEmailAfterAuthorization({
  assigneeId,
  expectedEmail,
}: {
  assigneeId: string;
  expectedEmail?: string | null;
}) {
  const normalizedId = assigneeId.trim();
  if (!UUID_PATTERN.test(normalizedId)) {
    return {
      ok: false as const,
      error: ASSIGNEE_VERIFICATION_ERROR,
    };
  }

  const { data, error } = await getSupabase().auth.admin.getUserById(
    normalizedId,
  );
  const email = normalizeReviewerEmail(data?.user?.email);
  const normalizedExpectedEmail = normalizeReviewerEmail(expectedEmail);

  if (
    error ||
    !email ||
    (normalizedExpectedEmail !== null && normalizedExpectedEmail !== email)
  ) {
    return {
      ok: false as const,
      error: ASSIGNEE_VERIFICATION_ERROR,
    };
  }

  return { ok: true as const, email };
}

export async function getReviewInviteByToken(
  token: string,
  { enforceViewLimit = true }: { enforceViewLimit?: boolean } = {},
) {
  const lookup = opaqueTokenLookup(token);
  const activeSelection =
    getSupabaseDataSchema() === CO_PRODUCTION_DATA_SCHEMA ? ", active" : "";
  const { data, error } = await getSupabase()
    .from("review_invites")
    .select(
      `id, asset_id, version_id, approval_id, password_hash, reviewer_name, reviewer_email, permissions, expires_at, watermark_enabled, watermark_text, download_enabled, view_count, last_viewed_at, max_views${activeSelection}, assets(id, title, file_type, status, projects(id, name))`,
    )
    .eq(lookup.column, lookup.value)
    .maybeSingle();

  if (error || !data) {
    return {
      ok: false as const,
      status: 404,
      error: "Invalid or expired review link",
    };
  }

  const invite = withoutPersistedTokenSecrets(
    data as unknown as Record<string, unknown>,
  ) as unknown as ReviewInviteRecord;

  if (invite.active === false) {
    return {
      ok: false as const,
      status: 410,
      error: "This review link is no longer active",
    };
  }

  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return {
      ok: false as const,
      status: 410,
      error: "This review link has expired",
    };
  }

  if (
    enforceViewLimit &&
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

export async function getAuthorizedReviewInvite(
  request: Request,
  token: string,
  { enforceViewLimit = false }: { enforceViewLimit?: boolean } = {},
) {
  const lookup = await getReviewInviteByToken(token, { enforceViewLimit: false });
  if (!lookup.ok) return lookup;

  const grantBinding =
    lookup.invite.password_hash ?? `unprotected:${lookup.invite.id}`;
  let accessGranted = false;

  try {
    accessGranted = hasValidReviewAccessGrant(request, {
      token,
      inviteId: lookup.invite.id,
      passwordHash: grantBinding,
    });
  } catch {
    return {
      ok: false as const,
      status: 503,
      error: "Review access is temporarily unavailable",
    };
  }

  if (lookup.invite.password_hash && !accessGranted) {
    return {
      ok: false as const,
      status: 401,
      error: "Password required",
      passwordRequired: true,
    };
  }

  const viewLimitReached =
    typeof lookup.invite.max_views === "number" &&
    typeof lookup.invite.view_count === "number" &&
    lookup.invite.view_count >= lookup.invite.max_views;

  if (enforceViewLimit && viewLimitReached && !accessGranted) {
    return {
      ok: false as const,
      status: 410,
      error: "This review link has reached its view limit",
    };
  }

  if (
    !enforceViewLimit &&
    typeof lookup.invite.max_views === "number" &&
    !accessGranted
  ) {
    return {
      ok: false as const,
      status: 401,
      error: "Open the review link before using this resource",
    };
  }

  return { ...lookup, accessGranted };
}

export function createInviteReviewAccessGrant(
  token: string,
  invite: ReviewInviteRecord,
) {
  return createReviewAccessGrant({
    token,
    inviteId: invite.id,
    passwordHash: invite.password_hash ?? `unprotected:${invite.id}`,
    inviteExpiresAt: invite.expires_at,
  });
}

export function reviewInviteErrorPayload(result: {
  error: string;
  passwordRequired?: boolean;
}) {
  return result.passwordRequired
    ? { error: result.error, password_required: true }
    : { error: result.error };
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
  const linkedApproval = invite.approval_id
    ? workflowActiveApprovals.find((approval) => approval.id === invite.approval_id) ?? null
    : null;
  const activeApprovalIds = new Set(
    linkedApproval && normalizeReviewerEmail(linkedApproval.assignee_email) === inviteEmail
      ? [linkedApproval.id]
      : [],
  );

  let approvalAccessMessage: string | null = null;

  if (inviteCanApprove(invite)) {
    if (!invite.approval_id) {
      approvalAccessMessage =
        "This approval link is not bound to one approval step. Ask the producer to create a new link.";
    } else if (!inviteEmail) {
      approvalAccessMessage =
        "Approval links must be created for a specific reviewer email.";
    } else if (orderedApprovals.length === 0) {
      approvalAccessMessage = "No approval step is assigned to this review link yet.";
    } else if (activeApprovalIds.size === 0) {
      const linkedPendingStep = pendingApprovals.find(
        (approval) => approval.id === invite.approval_id,
      );

      approvalAccessMessage = linkedPendingStep
        ? workflowMode === "sequential"
          ? "This review link is waiting on an earlier approval step."
          : "This review link does not control an active approval step."
        : "This review link is not assigned to an active approval step.";
    }
  }

  return {
    approvals: orderedApprovals.map((approval) =>
      toPublicApprovalStep(approval, activeApprovalIds.has(approval.id)),
    ),
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

  if (!invite.approval_id) {
    return {
      ok: false as const,
      statusCode: 403,
      error: "This approval link is not bound to one approval step.",
    };
  }

  if (approvalId !== invite.approval_id) {
    return {
      ok: false as const,
      statusCode: 403,
      error: "This approval link is not assigned to that approval step.",
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

async function createOpaqueApprovalInvite(
  {
    assetId,
    versionId,
    approvalId,
    reviewerEmail,
    reviewerName,
    createdBy,
  }: CreateApprovalInviteInput,
  versionClient: DataSupabaseClient,
  privilegedClient: DataSupabaseClient,
) {
  const normalizedEmail = normalizeReviewerEmail(reviewerEmail);
  if (!normalizedEmail) {
    throw new Error("Approval invites require a reviewer email");
  }

  const versionLookup = await resolveAssetVersion({
    assetId,
    versionId,
    client: versionClient,
  });
  if (!versionLookup.ok || !versionLookup.version.is_current) {
    throw new Error("Could not create approval invite");
  }

  const { data: approval, error: approvalError } = await versionClient
    .from("approvals")
    .select("id, asset_id, version_id, assignee_email, status")
    .eq("id", approvalId)
    .eq("asset_id", assetId)
    .eq("version_id", versionLookup.version.id)
    .eq("status", "pending")
    .maybeSingle();
  if (
    approvalError ||
    !approval ||
    normalizeReviewerEmail(approval.assignee_email) !== normalizedEmail
  ) {
    throw new Error("Could not create approval invite");
  }

  const token = crypto.randomBytes(16).toString("hex");
  const { data, error } = await privilegedClient
    .from("review_invites")
    .insert({
      asset_id: assetId,
      version_id: versionLookup.version.id,
      approval_id: approval.id,
      ...persistedOpaqueTokenFields(token),
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
    throw new Error("Could not create approval invite");
  }

  return {
    ...withoutPersistedTokenSecrets(data as Record<string, unknown>),
    token,
  } as unknown as ReviewInviteRecord;
}

export async function createPrivilegedApprovalInviteAfterAuthorization({
  authorizedClient,
  ...input
}: CreateApprovalInviteInput & { authorizedClient: DataSupabaseClient }) {
  return createOpaqueApprovalInvite(input, authorizedClient, getSupabase());
}

export async function createApprovalInvite(input: CreateApprovalInviteInput) {
  const privilegedClient = getSupabase();
  return createOpaqueApprovalInvite(input, privilegedClient, privilegedClient);
}
