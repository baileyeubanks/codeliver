import type { CommentAttachment } from "@/lib/types/codeliver";

export const REVIEW_IMAGE_ACCEPT = "image/jpeg,image/png,image/gif,image/webp";
export const REVIEW_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const REVIEW_IMAGE_TYPES = new Set(REVIEW_IMAGE_ACCEPT.split(","));

export function validateReviewImage(file: File): string | null {
  if (!REVIEW_IMAGE_TYPES.has(file.type)) return "Choose a JPEG, PNG, GIF, or WebP image.";
  if (file.size <= 0 || file.size > REVIEW_IMAGE_MAX_BYTES) return "Images must be 10 MB or smaller.";
  return null;
}

export async function uploadReviewImageAttachment(input: {
  endpoint: string;
  commentId: string;
  versionId: string;
  idempotencyKey: string;
  file: File;
}): Promise<CommentAttachment> {
  const invalid = validateReviewImage(input.file);
  if (invalid) throw new Error(invalid);
  const form = new FormData();
  form.set("comment_id", input.commentId);
  form.set("version_id", input.versionId);
  form.set("idempotency_key", input.idempotencyKey);
  form.set("file", input.file);
  const response = await fetch(input.endpoint, {
    method: "POST",
    body: form,
    credentials: "same-origin",
    cache: "no-store",
    referrerPolicy: "no-referrer",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.attachment?.id) {
    throw new Error(payload?.error || "Could not attach this image. Your comment was saved; retry the image without posting another comment.");
  }
  return payload.attachment as CommentAttachment;
}

export async function refreshReviewImageAttachments(input: {
  endpoint: string;
  commentId: string;
  versionId: string;
}): Promise<CommentAttachment[]> {
  const query = new URLSearchParams({ comment_id: input.commentId, version_id: input.versionId });
  const response = await fetch(`${input.endpoint}?${query}`, {
    credentials: "same-origin", cache: "no-store", referrerPolicy: "no-referrer",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(payload?.attachments)) throw new Error("Could not refresh this image link.");
  return payload.attachments as CommentAttachment[];
}
