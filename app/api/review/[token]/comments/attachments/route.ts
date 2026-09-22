import {
  canAccessExternalCommentAttachment,
  listImageAttachments,
  parseImageAttachmentForm,
  REVIEW_IMAGE_ATTACHMENT_MULTIPART_MAX_BYTES,
  storeImageAttachment,
  type ImageAttachmentContext,
} from "@/lib/comments/image-attachments";
import {
  authorizeAdmittedReviewInvite,
  reserveReviewActionRate,
} from "@/lib/review/admission-authority";
import { inviteCanComment, type ReviewInviteRecord } from "@/lib/review-invites";
import {
  validateReviewMultipartMutationRequest,
  validateReviewReadRequest,
} from "@/lib/review/request-boundary";
import {
  reviewBackendUnavailable,
  reviewError,
  reviewJson,
} from "@/lib/review/responses";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ token: string }> };

function unavailable(status: number, headers?: HeadersInit) {
  if (status >= 500) return reviewBackendUnavailable(headers);
  return reviewError(
    "Review attachment is unavailable",
    status === 403 ? "REVIEW_ATTACHMENT_FORBIDDEN" : "REVIEW_ATTACHMENT_UNAVAILABLE",
    status,
    headers,
  );
}

async function authorizeExternalComment({
  invite,
  commentId,
  versionId,
  requireAuthor,
}: {
  invite: ReviewInviteRecord;
  commentId: string;
  versionId: string;
  requireAuthor: boolean;
}): Promise<{ ok: true; context: ImageAttachmentContext } | { ok: false; status: number }> {
  if (!invite.version_id || invite.version_id !== versionId) {
    return { ok: false, status: 403 };
  }
  const client = getSupabase();
  const comment = await client
    .from("comments")
    .select("id, asset_id, version_id, review_invite_id, visibility")
    .eq("id", commentId)
    .eq("asset_id", invite.asset_id)
    .eq("version_id", versionId)
    .maybeSingle();
  if (comment.error) throw comment.error;
  if (!comment.data || !canAccessExternalCommentAttachment({
    invite: {
      id: invite.id,
      assetId: invite.asset_id,
      versionId: invite.version_id,
      canComment: inviteCanComment(invite),
    },
    comment: {
      assetId: comment.data.asset_id,
      versionId: comment.data.version_id,
      reviewInviteId: comment.data.review_invite_id,
      visibility: comment.data.visibility,
    },
    requireAuthor,
  })) {
    return { ok: false, status: 404 };
  }
  const asset = await client
    .from("assets")
    .select("id, project_id")
    .eq("id", invite.asset_id)
    .maybeSingle();
  if (asset.error) throw asset.error;
  if (!asset.data?.project_id) return { ok: false, status: 404 };
  const project = await client
    .from("projects")
    .select("id, owner_id")
    .eq("id", asset.data.project_id)
    .maybeSingle();
  if (project.error) throw project.error;
  if (!project.data?.owner_id) return { ok: false, status: 404 };
  return {
    ok: true,
    context: {
      ownerId: project.data.owner_id,
      projectId: asset.data.project_id,
      assetId: invite.asset_id,
      versionId,
      commentId,
    },
  };
}

export async function GET(request: Request, { params }: RouteContext) {
  const boundary = validateReviewReadRequest(request);
  if (!boundary.ok) return unavailable(boundary.status);
  const { token } = await params;
  try {
    const authority = await authorizeAdmittedReviewInvite(request, token);
    if (!authority.ok) return unavailable(authority.status);
    const headers = { "Set-Cookie": authority.setCookie };
    const url = new URL(request.url);
    const authorization = await authorizeExternalComment({
      invite: authority.invite,
      commentId: url.searchParams.get("comment_id") ?? "",
      versionId: url.searchParams.get("version_id") ?? "",
      requireAuthor: false,
    });
    if (!authorization.ok) return unavailable(authorization.status, headers);
    const attachments = await listImageAttachments(
      getSupabase(),
      authorization.context,
    );
    return attachments
      ? reviewJson({ attachments }, { headers })
      : reviewBackendUnavailable(headers);
  } catch {
    return reviewBackendUnavailable();
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  const boundary = validateReviewMultipartMutationRequest(request, {
    maxBytes: REVIEW_IMAGE_ATTACHMENT_MULTIPART_MAX_BYTES,
  });
  if (!boundary.ok) return unavailable(boundary.status);
  const { token } = await params;
  try {
    const authority = await authorizeAdmittedReviewInvite(request, token);
    if (!authority.ok) return unavailable(authority.status);
    const headers = { "Set-Cookie": authority.setCookie };
    const rate = await reserveReviewActionRate({
      token,
      claims: authority.claims,
      action: "comment",
    });
    if (!rate.ok) {
      return unavailable(rate.status, {
        ...headers,
        ...(rate.status === 429
          ? { "Retry-After": String(Math.max(1, rate.retryAfterSeconds ?? 60)) }
          : {}),
      });
    }
    const parsed = await parseImageAttachmentForm(request);
    if (!parsed.ok) {
      return reviewError(
        parsed.error,
        "REVIEW_ATTACHMENT_INVALID",
        parsed.status,
        headers,
      );
    }
    const authorization = await authorizeExternalComment({
      invite: authority.invite,
      commentId: parsed.attachment.commentId,
      versionId: parsed.attachment.versionId,
      requireAuthor: true,
    });
    if (!authorization.ok) return unavailable(authorization.status, headers);
    const stored = await storeImageAttachment({
      client: getSupabase(),
      context: authorization.context,
      attachment: parsed.attachment,
      uploadedBy: null,
    });
    if (!stored.ok) {
      return stored.kind === "conflict"
        ? reviewError(
            "Attachment retry key is already bound to different content",
            "REVIEW_ATTACHMENT_CONFLICT",
            409,
            headers,
          )
        : reviewBackendUnavailable(headers);
    }
    return reviewJson(
      { attachment: stored.attachment },
      { status: 201, headers },
    );
  } catch {
    return reviewBackendUnavailable();
  }
}
