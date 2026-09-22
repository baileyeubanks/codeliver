import { apiError, apiJson, backendUnavailable } from "@/lib/api/responses";
import { requireAuth } from "@/lib/auth";
import { getAssetAccess } from "@/lib/access-control";
import {
  canAccessInternalCommentAttachment,
  listImageAttachments,
  parseImageAttachmentForm,
  REVIEW_IMAGE_ATTACHMENT_MULTIPART_MAX_BYTES,
  storeImageAttachment,
  type ImageAttachmentContext,
} from "@/lib/comments/image-attachments";
import { validateReviewMultipartMutationRequest } from "@/lib/review/request-boundary";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };
const NO_STORE = { "Cache-Control": "private, no-store" };

function invalid(error: string, status = 400) {
  return apiError(
    error,
    status === 401 ? "UNAUTHORIZED" : status === 404 ? "NOT_FOUND" : "INVALID_REQUEST",
    status,
    NO_STORE,
  );
}

async function authorizeInternalComment({
  assetId,
  userId,
  commentId,
  versionId,
  requireAuthor,
}: {
  assetId: string;
  userId: string;
  commentId: string;
  versionId: string;
  requireAuthor: boolean;
}): Promise<{ ok: true; context: ImageAttachmentContext } | { ok: false; status: number }> {
  const client = getSupabase();
  const asset = await getAssetAccess(
    assetId,
    userId,
    requireAuthor ? "reviewer" : "viewer",
    client,
  );
  if (!asset.ok) return { ok: false, status: asset.status };

  const comment = await client
    .from("comments")
    .select("id, asset_id, version_id, author_id, visibility")
    .eq("id", commentId)
    .eq("asset_id", assetId)
    .eq("version_id", versionId)
    .maybeSingle();
  if (comment.error) throw comment.error;
  if (!comment.data || !canAccessInternalCommentAttachment({
    userId,
    assetId,
    versionId,
    requireAuthor,
    comment: {
      assetId: comment.data.asset_id,
      versionId: comment.data.version_id,
      authorId: comment.data.author_id,
      visibility: comment.data.visibility,
    },
  })) {
    return { ok: false, status: 404 };
  }

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
      assetId,
      versionId,
      commentId,
    },
  };
}

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const user = await requireAuth();
    if (!user?.id) return invalid("Unauthorized", 401);
    const { id: assetId } = await params;
    const url = new URL(request.url);
    const commentId = url.searchParams.get("comment_id") ?? "";
    const versionId = url.searchParams.get("version_id") ?? "";
    const authorization = await authorizeInternalComment({
      assetId,
      userId: user.id,
      commentId,
      versionId,
      requireAuthor: false,
    });
    if (!authorization.ok) return invalid("Comment not found", authorization.status);
    const attachments = await listImageAttachments(
      getSupabase(),
      authorization.context,
    );
    return attachments
      ? apiJson({ attachments }, { headers: NO_STORE })
      : backendUnavailable();
  } catch {
    return backendUnavailable();
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const user = await requireAuth();
    if (!user?.id) return invalid("Unauthorized", 401);
    const boundary = validateReviewMultipartMutationRequest(request, {
      maxBytes: REVIEW_IMAGE_ATTACHMENT_MULTIPART_MAX_BYTES,
    });
    if (!boundary.ok) {
      return invalid("Image attachment request is not allowed", boundary.status);
    }
    const parsed = await parseImageAttachmentForm(request);
    if (!parsed.ok) return invalid(parsed.error, parsed.status);
    const { id: assetId } = await params;
    const authorization = await authorizeInternalComment({
      assetId,
      userId: user.id,
      commentId: parsed.attachment.commentId,
      versionId: parsed.attachment.versionId,
      requireAuthor: true,
    });
    if (!authorization.ok) return invalid("Comment not found", authorization.status);
    const stored = await storeImageAttachment({
      client: getSupabase(),
      context: authorization.context,
      attachment: parsed.attachment,
      uploadedBy: user.id,
    });
    if (!stored.ok) {
      return stored.kind === "conflict"
        ? apiError(
            "Attachment retry key is already bound to different content",
            "ATTACHMENT_IDEMPOTENCY_CONFLICT",
            409,
            NO_STORE,
          )
        : backendUnavailable();
    }
    return apiJson(
      { attachment: stored.attachment },
      { status: 201, headers: NO_STORE },
    );
  } catch {
    return backendUnavailable();
  }
}
