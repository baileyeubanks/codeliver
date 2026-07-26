import { getProjectAccess } from "@/lib/access-control";
import { apiError, apiJson, backendUnavailable } from "@/lib/api/responses";
import { requireAuth } from "@/lib/auth";
import { getSupabaseDataSchema } from "@/lib/data-authority";
import { normalizeMediaReference } from "@/lib/security/media-reference";
import { getSupabase } from "@/lib/supabase";

async function authenticatedUser() {
  try {
    const user = await requireAuth();
    return user ? { user } : { response: apiError("Unauthorized", "UNAUTHORIZED", 401) };
  } catch {
    return { response: backendUnavailable() };
  }
}

function accessFailure(access: { status: number; error: string }) {
  if (access.status >= 500) return backendUnavailable();
  return apiError(access.error, "PROJECT_NOT_FOUND", access.status);
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticatedUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  try {
    const { id } = await params;
    const projectAccess = await getProjectAccess(id, user.id, "viewer");
    if (!projectAccess.ok) return accessFailure(projectAccess);
    const { data, error } = await getSupabase()
      .from("projects")
      .select(
        getSupabaseDataSchema() === "co_production"
          ? "id, team_id, owner_id, name, description, status, stage, organization_id, primary_contact_id, thumbnail_url, created_at, updated_at"
          : "id, team_id, owner_id, name, description, status, thumbnail_url, created_at, updated_at",
      )
      .eq("id", id)
      .maybeSingle();

    if (error) return backendUnavailable();
    if (!data) return apiError("Project not found", "PROJECT_NOT_FOUND", 404);
    return apiJson(data as unknown as Record<string, unknown>);
  } catch {
    return backendUnavailable();
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticatedUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  try {
    const { id } = await params;
    const projectAccess = await getProjectAccess(id, user.id, "producer");
    if (!projectAccess.ok) return accessFailure(projectAccess);
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return apiError("Project body must be an object", "INVALID_REQUEST", 400);
    }
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) {
    if (
      typeof body.name !== "string" ||
      !body.name.trim() ||
      body.name.trim().length > 240
    ) {
      return apiError("name is invalid", "INVALID_REQUEST", 400);
    }
    updates.name = body.name.trim();
  }
  if (body.description !== undefined) {
    if (
      body.description !== null &&
      (typeof body.description !== "string" || body.description.length > 10_000)
    ) {
      return apiError("description is invalid", "INVALID_REQUEST", 400);
    }
    updates.description =
      typeof body.description === "string"
        ? body.description.trim() || null
        : null;
  }
  if (body.status !== undefined) {
    if (!["active", "archived", "completed"].includes(body.status as string)) {
      return apiError("status is invalid", "INVALID_REQUEST", 400);
    }
    updates.status = body.status;
  }
  if (body.thumbnail_url !== undefined) {
    try {
      updates.thumbnail_url =
        body.thumbnail_url === null
          ? null
          : normalizeMediaReference(body.thumbnail_url, "thumbnail_url");
    } catch {
      return apiError("thumbnail_url is invalid", "INVALID_REQUEST", 400);
    }
  }
  if (Object.keys(updates).length === 0) {
    return apiError("No supported fields to update", "INVALID_REQUEST", 400);
  }
  updates.updated_at = new Date().toISOString();
  const { data, error } = await getSupabase()
    .from("projects")
    .update(updates)
    .eq("id", id)
    .select()
    .maybeSingle();

    if (error) return backendUnavailable();
    if (!data) return apiError("Project not found", "PROJECT_NOT_FOUND", 404);
    return apiJson(data as Record<string, unknown>);
  } catch {
    return backendUnavailable();
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticatedUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  try {
    const { id } = await params;
    const projectAccess = await getProjectAccess(id, user.id, "owner");
    if (!projectAccess.ok) return accessFailure(projectAccess);
    const { error } = await getSupabase()
      .from("projects")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) return backendUnavailable();
    return apiJson({ ok: true, status: "archived" });
  } catch {
    return backendUnavailable();
  }
}
