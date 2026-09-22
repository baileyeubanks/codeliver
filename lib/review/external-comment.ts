import type { ExternalAnnotation } from "@/lib/review/annotation-persistence";

export const EXTERNAL_COMMENT_COLUMNS =
  "id, asset_id, version_id, parent_id, author_name, body, timecode_seconds, frame_number, pin_x, pin_y, status, visibility, created_at, updated_at";

export function projectExternalComment(
  comment: Record<string, unknown>,
  annotations: ExternalAnnotation[] = [],
): Record<string, unknown> {
  const projected: Record<string, unknown> = {
    id: comment.id,
    asset_id: comment.asset_id,
    version_id: comment.version_id,
    parent_id: comment.parent_id,
    author_name: comment.author_name,
    body: comment.body,
    timecode_seconds: comment.timecode_seconds,
    frame_number: comment.frame_number,
    pin_x: comment.pin_x,
    pin_y: comment.pin_y,
    status: comment.status,
    visibility: comment.visibility,
    created_at: comment.created_at,
    updated_at: comment.updated_at,
  };

  if (annotations.length > 0) projected.annotations = annotations;
  return projected;
}
