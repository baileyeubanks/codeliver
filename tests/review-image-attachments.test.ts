import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import {
  canAccessExternalCommentAttachment,
  canAccessInternalCommentAttachment,
  parseImageAttachmentForm,
  REVIEW_IMAGE_ATTACHMENT_MAX_BYTES,
  storeImageAttachment,
} from "../lib/comments/image-attachments.ts";

const COMMENT_ID = "11111111-1111-4111-8111-111111111111";
const VERSION_ID = "22222222-2222-4222-8222-222222222222";
const REQUEST_ID = "33333333-3333-4333-8333-333333333333";

test("attachment reads span the granted thread while writes stay author-bound", () => {
  const externalInvite = {
    id: "invite-reader",
    assetId: "asset-a",
    versionId: "version-a",
    canComment: false,
  };
  const otherReviewerComment = {
    assetId: "asset-a",
    versionId: "version-a",
    reviewInviteId: "invite-author",
    visibility: "external",
  };
  assert.equal(canAccessExternalCommentAttachment({
    invite: externalInvite,
    comment: otherReviewerComment,
    requireAuthor: false,
  }), true);
  assert.equal(canAccessExternalCommentAttachment({
    invite: { ...externalInvite, canComment: true },
    comment: otherReviewerComment,
    requireAuthor: true,
  }), false);
  assert.equal(canAccessExternalCommentAttachment({
    invite: { ...externalInvite, id: "invite-author", canComment: true },
    comment: otherReviewerComment,
    requireAuthor: true,
  }), true);
  for (const comment of [
    { ...otherReviewerComment, assetId: "asset-b" },
    { ...otherReviewerComment, versionId: "version-b" },
    { ...otherReviewerComment, visibility: "internal" },
  ]) {
    assert.equal(canAccessExternalCommentAttachment({
      invite: externalInvite,
      comment,
      requireAuthor: false,
    }), false);
  }

  const internalComment = {
    assetId: "asset-a",
    versionId: "version-a",
    authorId: "user-author",
    visibility: "internal",
  };
  assert.equal(canAccessInternalCommentAttachment({
    userId: "user-reader",
    assetId: "asset-a",
    versionId: "version-a",
    comment: internalComment,
    requireAuthor: false,
  }), true);
  assert.equal(canAccessInternalCommentAttachment({
    userId: "user-reader",
    assetId: "asset-a",
    versionId: "version-a",
    comment: internalComment,
    requireAuthor: true,
  }), false);
});

function request(file: File, overrides: Record<string, string> = {}) {
  const form = new FormData();
  form.set("file", file);
  form.set("comment_id", overrides.comment_id ?? COMMENT_ID);
  form.set("version_id", overrides.version_id ?? VERSION_ID);
  form.set("idempotency_key", overrides.idempotency_key ?? REQUEST_ID);
  return new Request("https://client.contentco-op.com/api/review/token/comments/attachments", {
    method: "POST",
    body: form,
  });
}

const png = new Uint8Array(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
));

test("review images require a bounded declared type with matching magic bytes", async () => {
  const parsed = await parseImageAttachmentForm(
    request(new File([png], "../../Frame <one>.PNG", { type: "image/png" })),
  );
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.attachment.safeName, "Frame-one.png");
    assert.equal(parsed.attachment.versionId, VERSION_ID);
  }

  for (const file of [
    new File(["not a png"], "spoof.png", { type: "image/png" }),
    new File([png.subarray(0, 8)], "header-only.png", { type: "image/png" }),
    new File([png], "document.pdf", { type: "application/pdf" }),
  ]) {
    const rejected = await parseImageAttachmentForm(request(file));
    assert.equal(rejected.ok, false);
    if (!rejected.ok) assert.equal(rejected.status, 415);
  }

  const oversized = await parseImageAttachmentForm(
    request(
      new File(
        [png, new Uint8Array(REVIEW_IMAGE_ATTACHMENT_MAX_BYTES)],
        "oversized.png",
        { type: "image/png" },
      ),
    ),
  );
  assert.deepEqual(oversized, {
    ok: false,
    status: 413,
    error: "Image exceeds the 10 MB limit",
  });

  const overDimension = await sharp({
    create: {
      width: 12_001,
      height: 1,
      channels: 3,
      background: "white",
    },
  }).png().toBuffer();
  const rejectedDimension = await parseImageAttachmentForm(
    request(new File([overDimension], "too-wide.png", { type: "image/png" })),
  );
  assert.equal(rejectedDimension.ok, false);
  if (!rejectedDimension.ok) assert.equal(rejectedDimension.status, 415);
});

test("concurrent identical retries create one persisted private object and bind changed content", async () => {
  type Row = Record<string, unknown>;
  const rows: Row[] = [];
  let uploads = 0;
  let signed = 0;
  let object: Blob | null = null;

  class Query {
    private filters = new Map<string, unknown>();
    private inserted: Row | null = null;
    select() { return this; }
    eq(column: string, value: unknown) { this.filters.set(column, value); return this; }
    insert(value: Row) { this.inserted = value; return this; }
    async maybeSingle() {
      return {
        data: rows.find((row) =>
          [...this.filters].every(([key, value]) => row[key] === value)) ?? null,
        error: null,
      };
    }
    async single() {
      assert.ok(this.inserted);
      if (rows.some((row) => row.storage_path === this.inserted?.storage_path)) {
        return { data: null, error: { message: "duplicate" } };
      }
      const row = {
        id: "44444444-4444-4444-8444-444444444444",
        created_at: "2026-09-22T12:00:00.000Z",
        ...this.inserted,
      };
      rows.push(row);
      return { data: row, error: null };
    }
  }

  const client = {
    from() { return new Query(); },
    storage: {
      from() {
        return {
          async upload() { uploads += 1; return { data: {}, error: null }; },
          async download() {
            return object
              ? { data: object, error: null }
              : { data: null, error: { message: "missing" } };
          },
          async createSignedUrl(path: string) {
            signed += 1;
            return { data: { signedUrl: `https://storage.test/signed/${encodeURIComponent(path)}` }, error: null };
          },
          async remove() { object = null; return { data: [], error: null }; },
        };
      },
    },
  };
  const parsed = await parseImageAttachmentForm(
    request(new File([png], "frame.png", { type: "image/png" })),
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const input = {
    client: client as never,
    context: {
      ownerId: "55555555-5555-4555-8555-555555555555",
      projectId: "66666666-6666-4666-8666-666666666666",
      assetId: "77777777-7777-4777-8777-777777777777",
      versionId: VERSION_ID,
      commentId: COMMENT_ID,
    },
    attachment: parsed.attachment,
    uploadedBy: null,
  };

  // Make object creation exclusive, like Supabase Storage upsert:false.
  client.storage.from = () => ({
    async upload(_path: string, bytes: Uint8Array, options: { contentType: string }) {
      uploads += 1;
      if (object) return { data: null, error: { message: "exists" } };
      object = new Blob([bytes], { type: options.contentType });
      return { data: {}, error: null };
    },
    async download() {
      return object
        ? { data: object, error: null }
        : { data: null, error: { message: "missing" } };
    },
    async createSignedUrl(path: string) {
      signed += 1;
      return { data: { signedUrl: `https://storage.test/signed/${encodeURIComponent(path)}` }, error: null };
    },
    async remove() { object = null; return { data: [], error: null }; },
  });

  const [first, retried] = await Promise.all([
    storeImageAttachment(input),
    storeImageAttachment(input),
  ]);
  assert.equal(first.ok, true);
  assert.equal(retried.ok, true);
  if (!first.ok || !retried.ok) return;
  assert.deepEqual(
    { ...retried.attachment, url_expires_at: null },
    { ...first.attachment, url_expires_at: null },
  );
  assert.equal(rows.length, 1);
  assert.equal(uploads, 2);
  assert.equal(signed, 2);
  assert.match(String(rows[0].file_url), /^storage:\/\/comment-attachments\//);
  assert.doesNotMatch(first.attachment.file_url, /^storage:|\/object\/public\//);

  const changedPng = await sharp({
    create: { width: 1, height: 1, channels: 3, background: "red" },
  }).png().toBuffer();
  const changed = await parseImageAttachmentForm(
    request(new File([changedPng], "renamed.png", { type: "image/png" })),
  );
  assert.equal(changed.ok, true);
  if (!changed.ok) return;
  assert.deepEqual(
    await storeImageAttachment({ ...input, attachment: changed.attachment }),
    { ok: false, kind: "conflict" },
  );
});

test("metadata failure with failed cleanup recovers the exact orphan on retry", async () => {
  type Row = Record<string, unknown>;
  const rows: Row[] = [];
  let object: Blob | null = null;
  let failInsert = true;
  class Query {
    private filters = new Map<string, unknown>();
    private inserted: Row | null = null;
    select() { return this; }
    eq(column: string, value: unknown) { this.filters.set(column, value); return this; }
    insert(value: Row) { this.inserted = value; return this; }
    async maybeSingle() {
      return { data: rows.find((row) => [...this.filters].every(([key, value]) => row[key] === value)) ?? null, error: null };
    }
    async single() {
      if (failInsert) { failInsert = false; return { data: null, error: { message: "db unavailable" } }; }
      const row = { id: "44444444-4444-4444-8444-444444444444", created_at: "2026-09-22T12:00:00.000Z", ...this.inserted };
      rows.push(row);
      return { data: row, error: null };
    }
  }
  const client = {
    from() { return new Query(); },
    storage: { from() { return {
      async upload(_path: string, bytes: Uint8Array, options: { contentType: string }) {
        if (object) return { data: null, error: { message: "exists" } };
        object = new Blob([bytes], { type: options.contentType });
        return { data: {}, error: null };
      },
      async download() { return object ? { data: object, error: null } : { data: null, error: { message: "missing" } }; },
      async createSignedUrl(path: string) { return { data: { signedUrl: `https://storage.test/${path}` }, error: null }; },
      async remove() { return { data: null, error: { message: "cleanup failed" } }; },
    }; } },
  };
  const parsed = await parseImageAttachmentForm(request(new File([png], "frame.png", { type: "image/png" })));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const input = {
    client: client as never,
    context: {
      ownerId: "55555555-5555-4555-8555-555555555555",
      projectId: "66666666-6666-4666-8666-666666666666",
      assetId: "77777777-7777-4777-8777-777777777777",
      versionId: VERSION_ID,
      commentId: COMMENT_ID,
    },
    attachment: parsed.attachment,
    uploadedBy: null,
  };
  assert.deepEqual(await storeImageAttachment(input), { ok: false, kind: "unavailable" });
  const recovered = await storeImageAttachment(input);
  assert.equal(recovered.ok, true);
  assert.equal(rows.length, 1);
});
