import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";

const PRIVATE_BUCKET = "comment-attachments";
const SIGNED_URL_TTL_SECONDS = 5 * 60;
const MAX_IMAGE_DIMENSION = 12_000;
const MAX_IMAGE_PIXELS = 40_000_000;
export const REVIEW_IMAGE_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const REVIEW_IMAGE_ATTACHMENT_MULTIPART_MAX_BYTES =
  REVIEW_IMAGE_ATTACHMENT_MAX_BYTES + 1024 * 1024;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IMAGE_TYPES: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

// The service client deliberately supports either configured PostgREST schema.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DataClient = SupabaseClient<any, any, any>;

export type ImageAttachmentContext = {
  ownerId: string;
  projectId: string;
  assetId: string;
  versionId: string;
  commentId: string;
};

type AttachmentRow = {
  id: string;
  comment_id: string;
  file_url: string;
  file_name: string;
  file_type: string | null;
  file_size: number | string | null;
  created_at: string;
  storage_bucket: string | null;
  storage_path: string | null;
};

export type ParsedImageAttachment = {
  commentId: string;
  versionId: string;
  idempotencyKey: string;
  bytes: Uint8Array;
  contentType: keyof typeof IMAGE_TYPES;
  safeName: string;
  size: number;
  sha256: string;
};

export type ImageAttachmentResponse = {
  id: string;
  comment_id: string;
  file_url: string;
  file_name: string;
  file_type: string | null;
  file_size: number | string | null;
  created_at: string;
  url_expires_at: string;
};

export type ImageAttachmentParseResult =
  | { ok: true; attachment: ParsedImageAttachment }
  | { ok: false; status: 400 | 413 | 415; error: string };

export type StoreImageAttachmentResult =
  | { ok: true; attachment: ImageAttachmentResponse }
  | { ok: false; kind: "conflict" | "unavailable" };

export function canAccessExternalCommentAttachment({
  invite,
  comment,
  requireAuthor,
}: {
  invite: {
    id: string;
    assetId: string;
    versionId: string | null;
    canComment: boolean;
  };
  comment: {
    assetId: string;
    versionId: string | null;
    reviewInviteId: string | null;
    visibility: string;
  };
  requireAuthor: boolean;
}): boolean {
  return (
    invite.versionId !== null &&
    comment.assetId === invite.assetId &&
    comment.versionId === invite.versionId &&
    comment.visibility === "external" &&
    (!requireAuthor ||
      (invite.canComment && comment.reviewInviteId === invite.id))
  );
}

export function canAccessInternalCommentAttachment({
  userId,
  assetId,
  versionId,
  comment,
  requireAuthor,
}: {
  userId: string;
  assetId: string;
  versionId: string;
  comment: {
    assetId: string;
    versionId: string | null;
    authorId: string | null;
    visibility: string;
  };
  requireAuthor: boolean;
}): boolean {
  return (
    comment.assetId === assetId &&
    comment.versionId === versionId &&
    comment.visibility === "internal" &&
    (!requireAuthor || comment.authorId === userId)
  );
}

function sanitizeFileName(originalName: string, contentType: string): string {
  const extension = IMAGE_TYPES[contentType];
  const basename = originalName.replace(/\\/g, "/").split("/").pop() ?? "";
  const dotIndex = basename.lastIndexOf(".");
  const rawStem = dotIndex > 0 ? basename.slice(0, dotIndex) : basename;
  const stem = rawStem
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "-")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, 80);
  return `${stem || "image"}.${extension}`;
}

function hasImageSignature(bytes: Uint8Array, contentType: string): boolean {
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
  }
  if (contentType === "image/gif") {
    if (bytes.length < 6) return false;
    const header = new TextDecoder("ascii").decode(bytes.subarray(0, 6));
    return header === "GIF87a" || header === "GIF89a";
  }
  if (contentType === "image/webp") {
    if (bytes.length < 12) return false;
    const decoder = new TextDecoder("ascii");
    return (
      decoder.decode(bytes.subarray(0, 4)) === "RIFF" &&
      decoder.decode(bytes.subarray(8, 12)) === "WEBP"
    );
  }
  return false;
}

async function hasDecodableImageMetadata(
  bytes: Uint8Array,
  contentType: string,
): Promise<boolean> {
  const expectedFormat: Record<string, string> = {
    "image/jpeg": "jpeg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
  };
  try {
    const metadata = await sharp(bytes, {
      failOn: "error",
      limitInputPixels: MAX_IMAGE_PIXELS,
    }).metadata();
    return (
      metadata.format === expectedFormat[contentType] &&
      typeof metadata.width === "number" &&
      Number.isSafeInteger(metadata.width) &&
      metadata.width > 0 &&
      metadata.width <= MAX_IMAGE_DIMENSION &&
      typeof metadata.height === "number" &&
      Number.isSafeInteger(metadata.height) &&
      metadata.height > 0 &&
      metadata.height <= MAX_IMAGE_DIMENSION &&
      metadata.width * metadata.height <= MAX_IMAGE_PIXELS
    );
  } catch {
    return false;
  }
}

export async function parseImageAttachmentForm(
  request: Request,
): Promise<ImageAttachmentParseResult> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return { ok: false, status: 400, error: "Invalid multipart form data" };
  }

  const file = formData.get("file");
  const commentId = formData.get("comment_id");
  const versionId = formData.get("version_id");
  const idempotencyKey = formData.get("idempotency_key");
  if (
    !(file instanceof File) ||
    typeof commentId !== "string" ||
    !UUID_PATTERN.test(commentId) ||
    typeof versionId !== "string" ||
    !UUID_PATTERN.test(versionId) ||
    typeof idempotencyKey !== "string" ||
    !UUID_PATTERN.test(idempotencyKey)
  ) {
    return {
      ok: false,
      status: 400,
      error: "A file, comment_id, version_id, and idempotency_key are required",
    };
  }
  if (file.size <= 0) {
    return { ok: false, status: 400, error: "Image must not be empty" };
  }
  if (file.size > REVIEW_IMAGE_ATTACHMENT_MAX_BYTES) {
    return { ok: false, status: 413, error: "Image exceeds the 10 MB limit" };
  }
  const contentType = file.type.trim().toLowerCase();
  if (!Object.hasOwn(IMAGE_TYPES, contentType)) {
    return { ok: false, status: 415, error: "Only JPEG, PNG, GIF, and WebP images are allowed" };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (
    bytes.byteLength !== file.size ||
    !hasImageSignature(bytes, contentType) ||
    !(await hasDecodableImageMetadata(bytes, contentType))
  ) {
    return { ok: false, status: 415, error: "Image content does not match its declared type" };
  }
  return {
    ok: true,
    attachment: {
      commentId,
      versionId,
      idempotencyKey,
      bytes,
      contentType: contentType as keyof typeof IMAGE_TYPES,
      safeName: sanitizeFileName(file.name, contentType),
      size: file.size,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
  };
}

function expectedPrefix(context: ImageAttachmentContext): string {
  return `${context.ownerId}/${context.projectId}/${context.assetId}/${context.commentId}/`;
}

async function signRow(
  client: DataClient,
  row: AttachmentRow,
  context: ImageAttachmentContext,
): Promise<ImageAttachmentResponse | null> {
  if (
    row.comment_id !== context.commentId ||
    row.storage_bucket !== PRIVATE_BUCKET ||
    !row.storage_path?.startsWith(expectedPrefix(context)) ||
    row.storage_path.slice(expectedPrefix(context).length).includes("/")
  ) {
    return null;
  }
  const { data, error } = await client.storage
    .from(PRIVATE_BUCKET)
    .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return {
    id: row.id,
    comment_id: row.comment_id,
    file_url: data.signedUrl,
    file_name: row.file_name,
    file_type: row.file_type,
    file_size: row.file_size,
    created_at: row.created_at,
    url_expires_at: new Date(
      Date.now() + SIGNED_URL_TTL_SECONDS * 1_000,
    ).toISOString(),
  };
}

const ATTACHMENT_COLUMNS =
  "id, comment_id, file_url, file_name, file_type, file_size, created_at, storage_bucket, storage_path";

async function existingRow(client: DataClient, storagePath: string) {
  const result = await client
    .from("comment_attachments")
    .select(ATTACHMENT_COLUMNS)
    .eq("storage_bucket", PRIVATE_BUCKET)
    .eq("storage_path", storagePath)
    .maybeSingle();
  return result.error || !result.data ? null : (result.data as AttachmentRow);
}

function boundFileUrl(storagePath: string, sha256: string): string {
  return `storage://${PRIVATE_BUCKET}/${storagePath}?sha256=${sha256}`;
}

function rowMatchesAttachment(
  row: AttachmentRow,
  storagePath: string,
  attachment: ParsedImageAttachment,
): boolean {
  return (
    row.storage_bucket === PRIVATE_BUCKET &&
    row.storage_path === storagePath &&
    row.file_url === boundFileUrl(storagePath, attachment.sha256) &&
    Number(row.file_size) === attachment.size &&
    row.file_type === attachment.contentType
  );
}

async function persistAttachmentRow({
  client,
  context,
  attachment,
  uploadedBy,
  storagePath,
}: {
  client: DataClient;
  context: ImageAttachmentContext;
  attachment: ParsedImageAttachment;
  uploadedBy: string | null;
  storagePath: string;
}): Promise<StoreImageAttachmentResult> {
  const inserted = await client
    .from("comment_attachments")
    .insert({
      comment_id: context.commentId,
      file_url: boundFileUrl(storagePath, attachment.sha256),
      file_name: attachment.safeName,
      file_type: attachment.contentType,
      file_size: attachment.size,
      storage_bucket: PRIVATE_BUCKET,
      storage_path: storagePath,
      uploaded_by: uploadedBy,
    })
    .select(ATTACHMENT_COLUMNS)
    .single();
  if (!inserted.error && inserted.data) {
    const signed = await signRow(client, inserted.data as AttachmentRow, context);
    return signed
      ? { ok: true, attachment: signed }
      : { ok: false, kind: "unavailable" };
  }
  const raced = await existingRow(client, storagePath);
  if (!raced) return { ok: false, kind: "unavailable" };
  if (!rowMatchesAttachment(raced, storagePath, attachment)) {
    return { ok: false, kind: "conflict" };
  }
  const signed = await signRow(client, raced, context);
  return signed
    ? { ok: true, attachment: signed }
    : { ok: false, kind: "unavailable" };
}

export async function storeImageAttachment({
  client,
  context,
  attachment,
  uploadedBy,
}: {
  client: DataClient;
  context: ImageAttachmentContext;
  attachment: ParsedImageAttachment;
  uploadedBy: string | null;
}): Promise<StoreImageAttachmentResult> {
  // The object name is the immutable operation key. Its first successful
  // content is bound in metadata by SHA, size, and media type.
  const storagePath = `${expectedPrefix(context)}${attachment.idempotencyKey}`;
  const prior = await existingRow(client, storagePath);
  if (prior) {
    if (!rowMatchesAttachment(prior, storagePath, attachment)) {
      return { ok: false, kind: "conflict" };
    }
    const signed = await signRow(client, prior, context);
    return signed
      ? { ok: true, attachment: signed }
      : { ok: false, kind: "unavailable" };
  }

  const bucket = client.storage.from(PRIVATE_BUCKET);
  const upload = await bucket.upload(
    storagePath,
    attachment.bytes,
    { contentType: attachment.contentType, upsert: false },
  );
  if (upload.error) {
    const raced = await existingRow(client, storagePath);
    if (raced) {
      if (!rowMatchesAttachment(raced, storagePath, attachment)) {
        return { ok: false, kind: "conflict" };
      }
      const signed = await signRow(client, raced, context);
      return signed
        ? { ok: true, attachment: signed }
        : { ok: false, kind: "unavailable" };
    }

    // A prior attempt may have stored the object before its metadata insert
    // failed and cleanup could not complete. Recover only the exact bytes and
    // content type bound to this retry key.
    const recovered = await bucket.download(storagePath);
    if (recovered.error || !recovered.data) {
      return { ok: false, kind: "unavailable" };
    }
    const recoveredBytes = new Uint8Array(await recovered.data.arrayBuffer());
    const recoveredSha = createHash("sha256").update(recoveredBytes).digest("hex");
    if (
      recoveredBytes.byteLength !== attachment.size ||
      recoveredSha !== attachment.sha256 ||
      recovered.data.type.toLowerCase() !== attachment.contentType
    ) {
      return { ok: false, kind: "conflict" };
    }
    return persistAttachmentRow({
      client,
      context,
      attachment,
      uploadedBy,
      storagePath,
    });
  }

  const persisted = await persistAttachmentRow({
    client,
    context,
    attachment,
    uploadedBy,
    storagePath,
  });
  if (!persisted.ok && persisted.kind === "unavailable") {
    await bucket.remove([storagePath]).catch(() => undefined);
  }
  return persisted;
}

export async function listImageAttachments(
  client: DataClient,
  context: ImageAttachmentContext,
): Promise<ImageAttachmentResponse[] | null> {
  const result = await client
    .from("comment_attachments")
    .select(ATTACHMENT_COLUMNS)
    .eq("comment_id", context.commentId)
    .order("created_at", { ascending: true });
  if (result.error || !Array.isArray(result.data)) return null;
  const attachments: ImageAttachmentResponse[] = [];
  for (const row of result.data as AttachmentRow[]) {
    // The canvas API is image-only even if an older generic attachment exists.
    if (!row.file_type || !Object.hasOwn(IMAGE_TYPES, row.file_type)) continue;
    const signed = await signRow(client, row, context);
    if (!signed) return null;
    attachments.push(signed);
  }
  return attachments;
}
