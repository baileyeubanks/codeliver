import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  getAssetAccess,
  PROJECT_ROLE_RANK,
} from "@/lib/access-control";
import { getSupabase } from "@/lib/supabase";
import { apiError, apiJson, backendUnavailable } from "@/lib/api/responses";

const ASSET_STATUSES = new Set([
  "draft",
  "in_review",
  "approved",
  "needs_changes",
  "final",
  "processing",
  "ready",
  "failed",
]);

async function readPatchBody(request: Request) {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try { user = await requireAuth(); } catch { return backendUnavailable(); }
  if (!user) return apiError("Unauthorized", "UNAUTHORIZED", 401);

  const { id } = await params;
  const assetAccess = await getAssetAccess(id, user.id, "viewer");
  if (!assetAccess.ok) {
    if (assetAccess.status >= 500) return backendUnavailable();
    return apiError("Asset not found", "ASSET_ACCESS_DENIED", assetAccess.status);
  }

  let result;
  try { result = await getSupabase()
    .from("assets")
    .select(
      "id, project_id, folder_id, title, file_type, file_url, thumbnail_url, proxy_url, file_size, duration_seconds, status, metadata, position, uploaded_by, created_at, updated_at",
    )
    .eq("id", id)
    .single(); } catch { return backendUnavailable(); }
  const { data, error } = result;

  if (error) return apiError("Asset could not be loaded", "BACKEND_UNAVAILABLE", 503);
  if (!data) return apiError("Asset not found", "ASSET_NOT_FOUND", 404);

  let versions;
  try { versions = await getSupabase()
    .from("versions")
    .select(
      "id, asset_id, version_number, file_url, file_size, notes, uploaded_by, is_current, thumbnail_url, duration_seconds, resolution, created_at, updated_at",
    )
    .eq("asset_id", id)
    .order("is_current", { ascending: false })
    .order("version_number", { ascending: false }); } catch { return backendUnavailable(); }

  if (versions.error) {
    return apiError("Asset versions could not be loaded", "BACKEND_UNAVAILABLE", 503);
  }

  return apiJson({
    ...data,
    current_version: versions.data?.[0] ?? null,
    version_count: versions.data?.length ?? 0,
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try { user = await requireAuth(); } catch { return backendUnavailable(); }
  if (!user) return apiError("Unauthorized", "UNAUTHORIZED", 401);

  const { id } = await params;
  const body = await readPatchBody(req);
  if (!body) {
    return apiError("Request body must be a JSON object", "INVALID_REQUEST", 400);
  }
  const assetAccess = await getAssetAccess(id, user.id, "editor");
  if (!assetAccess.ok) {
    if (assetAccess.status >= 500) return backendUnavailable();
    return apiError("Asset not found", "ASSET_ACCESS_DENIED", assetAccess.status);
  }

  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) {
    if (typeof body.title !== "string" || body.title.trim().length < 1 || body.title.trim().length > 500) {
      return apiError("title is invalid", "INVALID_REQUEST", 400);
    }
    updates.title = body.title.trim();
  }
  if (body.folder_id !== undefined) {
    if (body.folder_id !== null && typeof body.folder_id !== "string") {
      return apiError("folder_id is invalid", "INVALID_REQUEST", 400);
    }
    updates.folder_id = body.folder_id;
  }
  if (body.position !== undefined) {
    if (!Number.isInteger(body.position) || Number(body.position) < 0) {
      return apiError("position is invalid", "INVALID_REQUEST", 400);
    }
    updates.position = body.position;
  }
  if (body.metadata !== undefined) {
    if (
      !body.metadata ||
      typeof body.metadata !== "object" ||
      Array.isArray(body.metadata) ||
      JSON.stringify(body.metadata).length > 65_536
    ) {
      return apiError("metadata is invalid", "INVALID_REQUEST", 400);
    }
    updates.metadata = body.metadata;
  }
  if (body.status !== undefined) {
    if (
      typeof body.status !== "string" ||
      !ASSET_STATUSES.has(body.status)
    ) {
      return apiError("status is invalid", "INVALID_REQUEST", 400);
    }
    if (assetAccess.data.access_rank < PROJECT_ROLE_RANK.producer) {
      return apiError("Asset not found", "ASSET_NOT_FOUND", 404);
    }
    updates.status = body.status;
  }
  if (Object.keys(updates).length === 0) {
    return apiError("No supported fields to update", "INVALID_REQUEST", 400);
  }
  updates.updated_at = new Date().toISOString();

  let result;
  try { result = await getSupabase()
    .from("assets")
    .update(updates)
    .eq("id", id)
    .select()
    .single(); } catch { return backendUnavailable(); }
  const { data, error } = result;

  if (error) return apiError("Asset could not be updated", "BACKEND_UNAVAILABLE", 503);
  if (!data) return apiError("Asset not found", "ASSET_NOT_FOUND", 404);
  return apiJson(data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try { user = await requireAuth(); } catch { return backendUnavailable(); }
  if (!user) return apiError("Unauthorized", "UNAUTHORIZED", 401);

  const { id } = await params;
  const assetAccess = await getAssetAccess(id, user.id, "admin");
  if (!assetAccess.ok) {
    if (assetAccess.status >= 500) return backendUnavailable();
    return apiError("Asset not found", "ASSET_ACCESS_DENIED", assetAccess.status);
  }

  let result;
  try { result = await getSupabase()
    .from("assets")
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id); } catch { return backendUnavailable(); }
  const { error } = result;

  if (error) return apiError("Asset could not be deleted", "BACKEND_UNAVAILABLE", 503);
  return apiJson({ ok: true });
}
