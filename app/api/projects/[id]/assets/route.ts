import { requireAuthWithClient } from "@/lib/auth-client";
import { getProjectAccess } from "@/lib/access-control";
import { apiError, apiJson, backendUnavailable } from "@/lib/api/responses";
import { normalizeMediaReference } from "@/lib/security/media-reference";

async function authenticatedClient() {
  try {
    const context = await requireAuthWithClient();
    if (!context.user) return { response: apiError("Unauthorized", "UNAUTHORIZED", 401) };
    return { ...context };
  } catch {
    return { response: backendUnavailable() };
  }
}

function accessFailure(access: { status: number; error: string }) {
  if (access.status >= 500) return backendUnavailable();
  return apiError(access.error, "PROJECT_NOT_FOUND", access.status);
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authenticatedClient();
  if ("response" in context) return context.response;
  const { user, supabase } = context;
  if (!user) return backendUnavailable();

  try {
    const { id } = await params;
    const projectAccess = await getProjectAccess(id, user.id, "viewer", supabase);
    if (!projectAccess.ok) return accessFailure(projectAccess);

    const { data, error } = await supabase
      .from("assets")
      .select(
        "id, project_id, folder_id, title, file_type, file_url, thumbnail_url, proxy_url, file_size, duration_seconds, status, metadata, position, uploaded_by, created_at, updated_at, comments(count), approvals(id, status, step_order, role_label, assignee_email), versions(count)",
      )
      .eq("project_id", id)
      .order("updated_at", { ascending: false });

    if (error) {
      return backendUnavailable();
    }
    return apiJson({ items: data ?? [] });
  } catch {
    return backendUnavailable();
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await authenticatedClient();
  if ("response" in context) return context.response;
  const { user, supabase } = context;
  if (!user) return backendUnavailable();

  try {
    const { id } = await params;
    const projectAccess = await getProjectAccess(id, user.id, "editor", supabase);
    if (!projectAccess.ok) return accessFailure(projectAccess);
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return apiError("Asset body must be an object", "INVALID_REQUEST", 400);
    }
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const fileType = body.file_type ?? "video";
    if (!title || title.length > 500) {
      return apiError("title must contain 1-500 characters", "INVALID_REQUEST", 400);
    }
    if (!["video", "image", "audio", "document", "other"].includes(fileType)) {
      return apiError("file_type is invalid", "INVALID_REQUEST", 400);
    }
    let fileUrl: string | null = null;
    let thumbnailUrl: string | null = null;
    try {
      if (body.file_url !== undefined && body.file_url !== null) {
        fileUrl = normalizeMediaReference(body.file_url, "file_url");
      }
      if (body.thumbnail_url !== undefined && body.thumbnail_url !== null) {
        thumbnailUrl = normalizeMediaReference(
          body.thumbnail_url,
          "thumbnail_url",
        );
      }
    } catch {
      return apiError("Media URL is invalid", "INVALID_REQUEST", 400);
    }
    const fileSize = body.file_size ?? null;
    if (
      fileSize !== null &&
      (!Number.isSafeInteger(fileSize) || Number(fileSize) < 0)
    ) {
      return apiError("file_size is invalid", "INVALID_REQUEST", 400);
    }
    const durationSeconds = body.duration_seconds ?? null;
    if (
      durationSeconds !== null &&
      (typeof durationSeconds !== "number" ||
        !Number.isFinite(durationSeconds) ||
        durationSeconds < 0 ||
        durationSeconds > 604_800)
    ) {
      return apiError("duration_seconds is invalid", "INVALID_REQUEST", 400);
    }

    const { data, error } = await supabase
      .from("assets")
      .insert({
        project_id: id,
        title,
        file_type: fileType,
        file_url: fileUrl,
        thumbnail_url: thumbnailUrl,
        file_size: fileSize,
        duration_seconds: durationSeconds,
        uploaded_by: user.id,
      })
      .select()
      .single();

    if (error) {
      return backendUnavailable();
    }

    // Log activity (don't fail if this errors)
    await supabase.from("activity_log").insert({
      project_id: id,
      asset_id: data.id,
      actor_id: user.id,
      actor_name: user.email,
      action: "uploaded_asset",
      details: { asset_title: data.title },
    }).then(() => {}, () => {});

    return apiJson(data as Record<string, unknown>, { status: 201 });
  } catch {
    return backendUnavailable();
  }
}
