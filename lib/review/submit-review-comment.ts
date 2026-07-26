import type { Annotation, AnnotationData, Comment } from "@/lib/types/codeliver";
import { addDemoReviewComment } from "@/lib/demo/workspace-store";

interface SubmitReviewCommentInput {
  token: string;
  demoMode: boolean;
  assetId: string;
  assetType: string;
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
 * Local preview semantics: demo comments persist through the workspace store,
 * which has no annotation column, so the drawing rides on the returned
 * comment object (annotations + a WebP attachment) for this session. The
 * production comment schema does not yet persist annotation artifacts, so
 * remote requests send only the text/time/pin record. The drawing is kept in
 * this browser session and must not be mistaken for durable review evidence.
 */
function withDrawing(
  comment: Comment,
  annotations: AnnotationData[] | undefined,
  drawing: string | null | undefined,
  createdAt: string,
): Comment {
  const enriched: Comment = { ...comment };

  if (annotations?.length) {
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

  if (demoMode) {
    const persistedComment = addDemoReviewComment({
      assetId,
      authorName,
      assetType,
      body: commentBody,
      timeSeconds: timecode,
      pinX: pin?.x,
      pinY: pin?.y,
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
      annotations,
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

  // Keep the non-durable drawing visible to its author for this session.
  return withDrawing(comment, annotations, drawing, comment.created_at);
}
