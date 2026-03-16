import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";

type AccessFailure = {
  ok: false;
  status: number;
  error: string;
};

type AccessSuccess<T> = {
  ok: true;
  data: T;
};

export type AccessResult<T> = AccessFailure | AccessSuccess<T>;

export interface OwnedProject {
  id: string;
  name: string;
  owner_id: string;
}

export interface OwnedAsset {
  id: string;
  project_id: string;
  title: string;
  file_type: string;
  file_url: string | null;
  status: string;
  duration_seconds: number | null;
}

export interface OwnedWorkflow {
  id: string;
  asset_id: string;
  mode: string;
  status: string;
}

export interface OwnedReviewInvite {
  id: string;
  asset_id: string;
  token: string;
  permissions: string;
  reviewer_email: string | null;
  reviewer_name: string | null;
}

export interface AssetCommentRecord {
  id: string;
  asset_id: string;
  visibility: "internal" | "external";
}

function db(client?: SupabaseClient) {
  return client ?? getSupabase();
}

export async function getOwnedProject(
  projectId: string,
  userId: string,
  client?: SupabaseClient,
): Promise<AccessResult<OwnedProject>> {
  const { data, error } = await db(client)
    .from("projects")
    .select("id, name, owner_id")
    .eq("id", projectId)
    .eq("owner_id", userId)
    .maybeSingle();

  if (error) {
    return { ok: false, status: 500, error: error.message };
  }

  if (!data) {
    return { ok: false, status: 404, error: "Project not found" };
  }

  return { ok: true, data };
}

export async function getOwnedAsset(
  assetId: string,
  userId: string,
  client?: SupabaseClient,
): Promise<AccessResult<OwnedAsset>> {
  const { data, error } = await db(client)
    .from("assets")
    .select(
      "id, project_id, title, file_type, file_url, status, duration_seconds, projects!inner(owner_id)",
    )
    .eq("id", assetId)
    .eq("projects.owner_id", userId)
    .maybeSingle();

  if (error) {
    return { ok: false, status: 500, error: error.message };
  }

  if (!data) {
    return { ok: false, status: 404, error: "Asset not found" };
  }

  const { projects: _projects, ...asset } = data;
  return { ok: true, data: asset };
}

export async function getOwnedWorkflow(
  workflowId: string,
  userId: string,
  client?: SupabaseClient,
): Promise<AccessResult<OwnedWorkflow>> {
  const { data, error } = await db(client)
    .from("approval_workflows")
    .select("id, asset_id, mode, status")
    .eq("id", workflowId)
    .maybeSingle();

  if (error) {
    return { ok: false, status: 500, error: error.message };
  }

  if (!data) {
    return { ok: false, status: 404, error: "Approval workflow not found" };
  }

  const assetAccess = await getOwnedAsset(data.asset_id, userId, client);
  if (!assetAccess.ok) {
    return assetAccess;
  }

  return { ok: true, data };
}

export async function getOwnedReviewInvite(
  inviteId: string,
  userId: string,
  client?: SupabaseClient,
): Promise<AccessResult<OwnedReviewInvite>> {
  const { data, error } = await db(client)
    .from("review_invites")
    .select("id, asset_id, token, permissions, reviewer_email, reviewer_name")
    .eq("id", inviteId)
    .maybeSingle();

  if (error) {
    return { ok: false, status: 500, error: error.message };
  }

  if (!data) {
    return { ok: false, status: 404, error: "Review invite not found" };
  }

  const assetAccess = await getOwnedAsset(data.asset_id, userId, client);
  if (!assetAccess.ok) {
    return assetAccess;
  }

  return { ok: true, data };
}

export async function getAssetComment(
  commentId: string,
  assetId: string,
  client?: SupabaseClient,
): Promise<AccessResult<AssetCommentRecord>> {
  const { data, error } = await db(client)
    .from("comments")
    .select("id, asset_id, visibility")
    .eq("id", commentId)
    .eq("asset_id", assetId)
    .maybeSingle();

  if (error) {
    return { ok: false, status: 500, error: error.message };
  }

  if (!data) {
    return { ok: false, status: 404, error: "Comment not found" };
  }

  return {
    ok: true,
    data: data as AssetCommentRecord,
  };
}
