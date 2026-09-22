import type { Annotation, AnnotationData, Comment } from "@/lib/types/codeliver";
import { addDemoReviewComment } from "@/lib/demo/workspace-store";
import {
  MAX_REVIEW_ANNOTATIONS,
  prepareReviewAnnotations,
} from "@/lib/review/annotation";

interface SubmitReviewCommentInput {
  token: string;
  demoMode: boolean;
  assetId: string;
  assetType: string;
  /** Resolved cut identity. Used only by browser-local demo persistence. */
  versionId: string | null;
  /** Resolved share identity. Used only by browser-local demo persistence. */
  reviewInviteId: string | null;
  reviewerName: string;
  body: string;
  timecode: number;
  pin: { x: number; y: number } | null;
  /** WebP data-URI raster of the drawing, when the comment carries one. */
  drawing?: string | null;
  /** Vector strokes (normalized 0-1) behind the drawing. */
  annotations?: AnnotationData[];
}

/**
 * Local preview semantics: demo comments persist normalized vectors through
 * the workspace store while the WebP raster stays session-only. Real review
 * requests persist normalized vectors through the API. The WebP raster is
 * never accepted as an arbitrary upload URL.
 */
function withDrawing(
  comment: Comment,
  annotations: AnnotationData[] | undefined,
  drawing: string | null | undefined,
  createdAt: string,
): Comment {
  const enriched: Comment = { ...comment };

  if (annotations?.length && !comment.annotations?.length) {
    const annotationRecords: Annotation[] = annotations.map((data, index) => ({
      id: `annotation-${comment.id}-${index}`,
      comment_id: comment.id,
      asset_id: comment.asset_id,
      version_id: comment.version_id,
      type: data.kind,
      data,
      frame_number: comment.frame_number,
      created_by: null,
      created_at: createdAt,
    }));
    enriched.annotations = [...(comment.annotations ?? []), ...annotationRecords];
  }

  if (drawing) {
    enriched.attachments = [
      ...(comment.attachments ?? []),
      {
        id: `drawing-${comment.id}`,
        comment_id: comment.id,
        file_url: drawing,
        file_name: "frame-drawing.webp",
        file_type: "image/webp",
        file_size: Math.round((drawing.length * 3) / 4),
      },
    ];
  }

  return enriched;
}

export async function submitReviewComment({
  token,
  demoMode,
  assetId,
  assetType,
  versionId,
  reviewInviteId,
  reviewerName,
  body,
  timecode,
  pin,
  drawing,
  annotations,
}: SubmitReviewCommentInput): Promise<Comment> {
  const authorName = reviewerName.trim();
  const commentBody = body.trim();

  if (!authorName || !commentBody) {
    throw new Error("Add your name and a comment before sending.");
  }

  const preparedAnnotations = prepareReviewAnnotations(annotations ?? []);
  if (!preparedAnnotations.ok) {
    throw new Error(
      `This drawing has more than ${MAX_REVIEW_ANNOTATIONS} strokes. Clear the drawing and try again with ${MAX_REVIEW_ANNOTATIONS} or fewer strokes.`,
    );
  }
  const transportAnnotations =
    preparedAnnotations.annotations.length > 0
      ? preparedAnnotations.annotations
      : undefined;

  if (demoMode) {
    if (!versionId?.trim() || !reviewInviteId?.trim()) {
      throw new Error("Could not resolve this demo review version.");
    }

    const persistedComment = addDemoReviewComment({
      assetId,
      versionId,
      reviewInviteId,
      authorName,
      assetType,
      body: commentBody,
      timeSeconds: timecode,
      pinX: pin?.x,
      pinY: pin?.y,
      annotations: transportAnnotations,
    });

    if (!persistedComment) {
      throw new Error("Could not save your demo comment.");
    }

    return withDrawing(
      {
        id: persistedComment.id,
        review_id: null,
        review_invite_id: persistedComment.review_invite_id ?? "invite-demo",
        asset_id: persistedComment.asset_id,
        version_id: persistedComment.version_id ?? null,
        parent_id: null,
        author_name: persistedComment.author_name,
        author_email: persistedComment.author_email ?? null,
        author_id: null,
        body: persistedComment.body,
        rich_body: null,
        timecode_seconds: assetType === "video" ? persistedComment.time_seconds : null,
        frame_number: null,
        pin_x: persistedComment.pin_x ?? null,
        pin_y: persistedComment.pin_y ?? null,
        mentions: [],
        status: persistedComment.status,
        visibility: "external",
        resolved_by: null,
        resolved_at: null,
        created_at: persistedComment.created_at,
        updated_at: persistedComment.created_at,
      },
      transportAnnotations,
      drawing,
      persistedComment.created_at,
    );
  }

  const response = await fetch(`/api/review/${token}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    referrerPolicy: "no-referrer",
    body: JSON.stringify({
      body: commentBody,
      author_name: authorName,
      timecode_seconds: assetType === "video" ? timecode : null,
      pin_x: pin?.x ?? null,
      pin_y: pin?.y ?? null,
      annotations: transportAnnotations ?? null,
    }),
  });

  if (!response.ok) {
    throw new Error("Could not post your comment.");
  }

  const payload = await response.json().catch(() => null);
  const comment = (payload?.comment ?? payload) as Comment | null;

  if (!comment?.id) {
    throw new Error("Comment saved, but the response was invalid.");
  }

  // The API returns durable vector annotations. Keep only the raster preview
  // local to this browser session; fall back to the submitted vectors solely
  // for compatibility with an older response shape.
  return withDrawing(comment, transportAnnotations, drawing, comment.created_at);
}
