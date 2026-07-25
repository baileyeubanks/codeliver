import type { SupabaseClient } from "@supabase/supabase-js";
import { apiError, apiJson, backendUnavailable } from "@/lib/api/responses";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

const PRIVATE_BUCKET = "comment-attachments";
const LEGACY_BUCKET = "deliverables";
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_MULTIPART_SIZE = MAX_FILE_SIZE + 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 5 * 60;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ALLOWED_CONTENT_TYPES: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "pptx",
  "application/zip": "zip",
};

type AuthorizedComment = {
  tenantId: string;
  projectId: string;
  assetId: string;
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
  storage_bucket?: string | null;
  storage_path?: string | null;
};

type StorageLocation = {
  bucket: string;
  path: string;
};

type AccessResult =
  | { ok: true; context: AuthorizedComment }
  | { ok: false; status: number; error: string };

function errorResponse(error: string, status: number) {
  return status >= 500
    ? backendUnavailable()
    : apiError(error, status === 401 ? "UNAUTHORIZED" : status === 404 ? "COMMENT_NOT_FOUND" : "INVALID_REQUEST", status);
}

function internalErrorResponse() {
  return errorResponse("Unable to process attachment request", 500);
}

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function sanitizeFileName(originalName: string, contentType: string): string {
  const extension = ALLOWED_CONTENT_TYPES[contentType];
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

  return `${stem || "attachment"}.${extension}`;
}

async function authorizeComment(
  supabase: SupabaseClient,
  commentId: string,
  userId: string,
): Promise<AccessResult> {
  const { data: comment, error: commentError } = await supabase
    .from("comments")
    .select("id, asset_id")
    .eq("id", commentId)
    .maybeSingle();

  if (commentError) {
    return {
      ok: false,
      status: 500,
      error: "Unable to process attachment request",
    };
  }

  if (!comment || typeof comment.asset_id !== "string") {
    return { ok: false, status: 404, error: "Comment not found" };
  }

  const { data: asset, error: assetError } = await supabase
    .from("assets")
    .select("id, project_id")
    .eq("id", comment.asset_id)
    .maybeSingle();

  if (assetError) {
    return {
      ok: false,
      status: 500,
      error: "Unable to process attachment request",
    };
  }

  if (!asset || typeof asset.project_id !== "string") {
    return { ok: false, status: 404, error: "Comment not found" };
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", asset.project_id)
    .eq("owner_id", userId)
    .maybeSingle();

  if (projectError) {
    return {
      ok: false,
      status: 500,
      error: "Unable to process attachment request",
    };
  }

  if (!project) {
    return { ok: false, status: 404, error: "Comment not found" };
  }

  return {
    ok: true,
    context: {
      tenantId: userId,
      projectId: asset.project_id,
      assetId: comment.asset_id,
      commentId,
    },
  };
}

function privateStorageLocation(
  row: AttachmentRow,
  context: AuthorizedComment,
): StorageLocation | null {
  if (row.storage_bucket !== PRIVATE_BUCKET || !row.storage_path) {
    return null;
  }

  const expectedPrefix = [
    context.tenantId,
    context.projectId,
    context.assetId,
    context.commentId,
    "",
  ].join("/");
  const filename = row.storage_path.slice(expectedPrefix.length);

  if (
    !row.storage_path.startsWith(expectedPrefix) ||
    !filename ||
    filename.includes("/") ||
    filename === "." ||
    filename === ".."
  ) {
    return null;
  }

  return { bucket: PRIVATE_BUCKET, path: row.storage_path };
}

function legacyStorageLocation(row: AttachmentRow): StorageLocation | null {
  if (!row.file_url) return null;

  try {
    const url = new URL(row.file_url);
    const marker = `/storage/v1/object/public/${LEGACY_BUCKET}/`;
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex < 0) return null;

    const path = decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
    const expectedPrefix = `comments/${row.comment_id}/`;
    const filename = path.slice(expectedPrefix.length);

    if (
      !path.startsWith(expectedPrefix) ||
      !filename ||
      filename.includes("/") ||
      filename === "." ||
      filename === ".."
    ) {
      return null;
    }

    return { bucket: LEGACY_BUCKET, path };
  } catch {
    return null;
  }
}

function storageLocation(
  row: AttachmentRow,
  context: AuthorizedComment,
): StorageLocation | null {
  return privateStorageLocation(row, context) ?? legacyStorageLocation(row);
}

function attachmentResponse(
  row: AttachmentRow,
  signedUrl: string | null,
  expiresAt: string | null,
) {
  return {
    id: row.id,
    comment_id: row.comment_id,
    file_url: signedUrl,
    file_name: row.file_name,
    file_type: row.file_type,
    file_size: row.file_size,
    created_at: row.created_at,
    url_expires_at: expiresAt,
  };
}

async function signAttachment(
  supabase: SupabaseClient,
  row: AttachmentRow,
  context: AuthorizedComment,
) {
  const location = storageLocation(row, context);
  if (!location) {
    return {
      ok: true as const,
      attachment: attachmentResponse(row, null, null),
    };
  }

  const { data, error } = await supabase.storage
    .from(location.bucket)
    .createSignedUrl(location.path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    return { ok: false as const };
  }

  return {
    ok: true as const,
    attachment: attachmentResponse(
      row,
      data.signedUrl,
      new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
    ),
  };
}

async function authenticatedUser() {
  try {
    return await requireAuth();
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const user = await authenticatedUser();
  if (!user?.id) {
    return errorResponse("Unauthorized", 401);
  }

  const { searchParams } = new URL(req.url);
  const commentId = searchParams.get("comment_id")?.trim() ?? "";
  if (!isUuid(commentId)) {
    return errorResponse("A valid comment_id is required", 400);
  }

  try {
    const supabase = getSupabase();
    const access = await authorizeComment(supabase, commentId, user.id);
    if (!access.ok) {
      return errorResponse(access.error, access.status);
    }

    const { data, error } = await supabase
      .from("comment_attachments")
      .select(
        "id, comment_id, file_url, file_name, file_type, file_size, created_at, storage_bucket, storage_path",
      )
      .eq("comment_id", commentId)
      .order("created_at", { ascending: true });

    if (error || !Array.isArray(data)) {
      return internalErrorResponse();
    }

    const attachments = [];
    for (const row of data as AttachmentRow[]) {
      const signed = await signAttachment(supabase, row, access.context);
      if (!signed.ok) {
        return internalErrorResponse();
      }
      attachments.push(signed.attachment);
    }

    return apiJson({ attachments });
  } catch {
    return internalErrorResponse();
  }
}

export async function POST(req: Request) {
  const user = await authenticatedUser();
  if (!user?.id) {
    return errorResponse("Unauthorized", 401);
  }

  const contentLength = req.headers.get("content-length");
  if (contentLength) {
    const parsedLength = Number(contentLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) {
      return errorResponse("Invalid request", 400);
    }
    if (parsedLength > MAX_MULTIPART_SIZE) {
      return errorResponse("File size exceeds 25 MB limit", 413);
    }
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return errorResponse("Invalid multipart form data", 400);
  }

  const fileValue = formData.get("file");
  const commentValue = formData.get("comment_id");
  const commentId =
    typeof commentValue === "string" ? commentValue.trim() : "";

  if (!(fileValue instanceof File) || !isUuid(commentId)) {
    return errorResponse("A file and valid comment_id are required", 400);
  }

  try {
    const supabase = getSupabase();
    const access = await authorizeComment(supabase, commentId, user.id);
    if (!access.ok) {
      return errorResponse(access.error, access.status);
    }

    if (fileValue.size === 0) {
      return errorResponse("File must not be empty", 400);
    }
    if (fileValue.size > MAX_FILE_SIZE) {
      return errorResponse("File size exceeds 25 MB limit", 413);
    }

    const contentType = fileValue.type.trim().toLowerCase();
    if (!Object.hasOwn(ALLOWED_CONTENT_TYPES, contentType)) {
      return errorResponse("File type is not allowed", 415);
    }

    const safeName = sanitizeFileName(fileValue.name, contentType);
    const storagePath = [
      access.context.tenantId,
      access.context.projectId,
      access.context.assetId,
      access.context.commentId,
      `${crypto.randomUUID()}-${safeName}`,
    ].join("/");

    const buffer = new Uint8Array(await fileValue.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from(PRIVATE_BUCKET)
      .upload(storagePath, buffer, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      return errorResponse("Unable to store attachment", 500);
    }

    const { data, error: insertError } = await supabase
      .from("comment_attachments")
      .insert({
        comment_id: commentId,
        file_url: `storage://${PRIVATE_BUCKET}/${storagePath}`,
        file_name: safeName,
        file_type: contentType,
        file_size: fileValue.size,
        storage_bucket: PRIVATE_BUCKET,
        storage_path: storagePath,
        uploaded_by: user.id,
      })
      .select(
        "id, comment_id, file_url, file_name, file_type, file_size, created_at, storage_bucket, storage_path",
      )
      .single();

    if (insertError || !data) {
      return errorResponse("Unable to store attachment", 500);
    }

    const signed = await signAttachment(
      supabase,
      data as AttachmentRow,
      access.context,
    );
    if (!signed.ok) {
      return internalErrorResponse();
    }

    return apiJson({ attachment: signed.attachment }, { status: 201 });
  } catch {
    return internalErrorResponse();
  }
}
