import type { DemoReviewComment } from "@/lib/demo/workspace-store";
import { parseExternalAnnotations } from "@/lib/review/annotation-persistence";
import type { Annotation, Comment } from "@/lib/types/codeliver";

export interface DemoReviewCommentBinding {
  projectId: string;
  assetId: string;
  versionId: string;
  reviewInviteId: string;
  assetType: string;
}

/**
 * Rebuild a public-review comment from browser-local storage only when every
 * immutable review identity matches the cut currently being loaded. Persisted
 * raster previews are intentionally unsupported; normalized vectors are the
 * durable local representation.
 */
export function projectPersistedDemoReviewComment(
  comment: DemoReviewComment,
  binding: DemoReviewCommentBinding,
): Comment | null {
  if (
    comment.project_id !== binding.projectId ||
    comment.asset_id !== binding.assetId ||
    comment.version_id !== binding.versionId ||
    comment.review_invite_id !== binding.reviewInviteId
  ) {
    return null;
  }

  const annotationSource = comment.annotations ??
    (comment.drawing ? [comment.drawing] : []);
  const parsedAnnotations = parseExternalAnnotations(annotationSource);
  const annotations: Annotation[] = parsedAnnotations.ok
    ? parsedAnnotations.annotations.map((data, index) => ({
        id: `annotation-${comment.id}-${index}`,
        comment_id: comment.id,
        asset_id: binding.assetId,
        version_id: binding.versionId,
        type: data.kind,
        data,
        frame_number: null,
        created_by: null,
        created_at: comment.created_at,
      }))
    : [];

  return {
    id: comment.id,
    review_id: null,
    review_invite_id: binding.reviewInviteId,
    asset_id: binding.assetId,
    version_id: binding.versionId,
    parent_id: comment.parent_id ?? null,
    author_name: comment.author_name,
    author_email: comment.author_email ?? null,
    author_id: null,
    body: comment.body,
    rich_body: null,
    timecode_seconds:
      binding.assetType === "video" && !comment.parent_id ? comment.time_seconds : null,
    frame_number: null,
    pin_x: comment.pin_x ?? null,
    pin_y: comment.pin_y ?? null,
    mentions: [],
    status: comment.status,
    visibility: "external",
    resolved_by: null,
    resolved_at: null,
    created_at: comment.created_at,
    updated_at: comment.created_at,
    ...(annotations.length > 0 ? { annotations } : {}),
  };
}
