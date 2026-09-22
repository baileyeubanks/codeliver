import assert from "node:assert/strict";
import test from "node:test";
import {
  REVIEW_IMAGE_MAX_BYTES,
  refreshReviewImageAttachments,
  uploadReviewImageAttachment,
  validateReviewImage,
} from "../lib/review/image-attachments-client.ts";

const file = new File([new Uint8Array([1, 2, 3])], "frame.png", { type: "image/png" });

test("review image client rejects unsupported and oversized files before a request", () => {
  assert.match(validateReviewImage(new File(["x"], "frame.pdf", { type: "application/pdf" })) ?? "", /JPEG/);
  assert.match(validateReviewImage(new File([new Uint8Array(REVIEW_IMAGE_MAX_BYTES + 1)], "large.png", { type: "image/png" })) ?? "", /10 MB/);
  assert.equal(validateReviewImage(file), null);
});

test("review image client binds a persisted comment, version, and stable retry key", async () => {
  const originalFetch = globalThis.fetch;
  let captured: RequestInit | undefined;
  globalThis.fetch = (async (_url, init) => {
    captured = init;
    return new Response(JSON.stringify({ attachment: { id: "attachment-1", comment_id: "comment-1", file_url: "https://signed.test/image", file_name: "frame.png", file_type: "image/png", file_size: 3 } }), { status: 201 });
  }) as typeof fetch;
  try {
    const attachment = await uploadReviewImageAttachment({ endpoint: "/api/review/token/comments/attachments", commentId: "comment-1", versionId: "version-1", idempotencyKey: "11111111-1111-4111-8111-111111111111", file });
    assert.equal(attachment.id, "attachment-1");
    const form = captured?.body as FormData;
    assert.equal(form.get("comment_id"), "comment-1");
    assert.equal(form.get("version_id"), "version-1");
    assert.equal(form.get("idempotency_key"), "11111111-1111-4111-8111-111111111111");
    assert.equal((form.get("file") as File).name, "frame.png");
  } finally { globalThis.fetch = originalFetch; }
});

test("refresh requests fresh URLs only for the exact comment and version", async () => {
  const originalFetch = globalThis.fetch;
  let url = "";
  globalThis.fetch = (async (request) => { url = String(request); return new Response(JSON.stringify({ attachments: [] })); }) as typeof fetch;
  try {
    assert.deepEqual(await refreshReviewImageAttachments({ endpoint: "/api/assets/asset/comments/attachments", commentId: "comment-1", versionId: "version-1" }), []);
    assert.match(url, /comment_id=comment-1/);
    assert.match(url, /version_id=version-1/);
  } finally { globalThis.fetch = originalFetch; }
});
