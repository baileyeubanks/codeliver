import type { Comment } from "@/lib/types/codeliver";
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

    return {
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
    };
  }

  const response = await fetch(`/api/review/${token}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

  return comment;
}
