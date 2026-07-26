import { NextRequest } from "next/server";
import { requireAuthWithClient } from "@/lib/auth-client";
import { getProjectAccess } from "@/lib/access-control";
import { apiError, apiJson, backendUnavailable } from "@/lib/api/responses";

type FolderRow = {
  id: string;
  project_id: string;
  parent_id: string | null;
  name: string;
  position: number;
  created_by: string | null;
  created_at: string;
};

type FolderTree = FolderRow & { children: FolderTree[] };

function buildTree(rows: FolderRow[]): FolderTree[] {
  const map = new Map<string, FolderTree>();
  const roots: FolderTree[] = [];

  for (const row of rows) {
    map.set(row.id, { ...row, children: [] });
  }

  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortByPosition = (list: FolderTree[]) => {
    list.sort((a, b) => a.position - b.position);
    list.forEach((n) => sortByPosition(n.children));
  };
  sortByPosition(roots);
  return roots;
}

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

async function assertParentInProject(
  supabase: ReturnType<typeof requireAuthWithClient> extends Promise<infer Context>
    ? Context extends { supabase: infer Client }
      ? Client
      : never
    : never,
  projectId: string,
  parentId: unknown,
) {
  if (parentId === undefined || parentId === null) return null;
  if (typeof parentId !== "string") {
    return apiError("parent_id is invalid", "INVALID_REQUEST", 400);
  }
  const { data, error } = await supabase
    .from("folders")
    .select("id")
    .eq("id", parentId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) return backendUnavailable();
  if (!data) return apiError("Parent folder not found", "FOLDER_NOT_FOUND", 404);
  return null;
}

async function assertNoFolderCycle(
  supabase: ReturnType<typeof requireAuthWithClient> extends Promise<infer Context>
    ? Context extends { supabase: infer Client }
      ? Client
      : never
    : never,
  projectId: string,
  folderId: string,
  parentId: unknown,
) {
  if (parentId === undefined || parentId === null) return null;
  if (typeof parentId !== "string") {
    return apiError("parent_id is invalid", "INVALID_REQUEST", 400);
  }
  if (parentId === folderId) {
    return apiError("A folder cannot be its own parent", "INVALID_REQUEST", 400);
  }

  const { data, error } = await supabase
    .from("folders")
    .select("id, parent_id")
    .eq("project_id", projectId);
  if (error) return backendUnavailable();

  const parents = new Map(
    (data ?? []).map((folder) => [folder.id, folder.parent_id] as const),
  );
  const visited = new Set<string>();
  let ancestorId: string | null | undefined = parentId;
  while (ancestorId) {
    if (ancestorId === folderId) {
      return apiError(
        "A folder cannot be moved into one of its descendants",
        "INVALID_REQUEST",
        400,
      );
    }
    if (visited.has(ancestorId)) {
      return apiError("Folder hierarchy is invalid", "INVALID_REQUEST", 400);
    }
    visited.add(ancestorId);
    ancestorId = parents.get(ancestorId);
  }
  return null;
}

export async function GET(request: NextRequest) {
  const context = await authenticatedClient();
  if ("response" in context) return context.response;
  const { user, supabase } = context;
  if (!user) return backendUnavailable();

  const projectId = request.nextUrl.searchParams.get("project_id");

  // If no project_id, return all folders for projects the user owns
  if (!projectId) {
    try {
      const { data, error } = await supabase
        .from("folders")
        .select("*, projects!inner(owner_id)")
        .eq("projects.owner_id", user.id)
        .order("position", { ascending: true });

      if (error) {
        return backendUnavailable();
      }
      return apiJson({ items: buildTree(data || []) });
    } catch {
      return backendUnavailable();
    }
  }

  try {
    const projectAccess = await getProjectAccess(projectId, user.id, "viewer", supabase);
    if (!projectAccess.ok) return accessFailure(projectAccess);
    const { data, error } = await supabase
      .from("folders")
      .select("*")
      .eq("project_id", projectId)
      .order("position", { ascending: true });

    if (error) {
      return backendUnavailable();
    }
    return apiJson({ items: buildTree(data || []) });
  } catch {
    return backendUnavailable();
  }
}

export async function POST(request: NextRequest) {
  const context = await authenticatedClient();
  if ("response" in context) return context.response;
  const { user, supabase } = context;
  if (!user) return backendUnavailable();

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return apiError("Folder body must be an object", "INVALID_REQUEST", 400);
  }
  const { project_id, name, parent_id } = body;

  if (!project_id || !name) {
    return apiError("project_id and name are required", "INVALID_REQUEST", 400);
  }

  try {
    const projectAccess = await getProjectAccess(project_id, user.id, "editor", supabase);
    if (!projectAccess.ok) return accessFailure(projectAccess);
    const parentFailure = await assertParentInProject(supabase, project_id, parent_id);
    if (parentFailure) return parentFailure;

    // Get next position
    const { data: siblings, error: siblingError } = await supabase
      .from("folders")
      .select("position")
      .eq("project_id", project_id)
      .is("parent_id", parent_id || null)
      .order("position", { ascending: false })
      .limit(1);
    if (siblingError) return backendUnavailable();

    const nextPos = siblings && siblings.length > 0 ? siblings[0].position + 1 : 0;

    const { data, error } = await supabase
      .from("folders")
      .insert({
        project_id,
        name,
        parent_id: parent_id || null,
        position: nextPos,
        created_by: user.id,
      })
      .select()
      .single();

    if (error || !data) return backendUnavailable();

    return apiJson(data as Record<string, unknown>, { status: 201 });
  } catch {
    return backendUnavailable();
  }
}

export async function PATCH(request: NextRequest) {
  const context = await authenticatedClient();
  if ("response" in context) return context.response;
  const { user, supabase } = context;
  if (!user) return backendUnavailable();

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return apiError("Folder body must be an object", "INVALID_REQUEST", 400);
  }
  const { id, name, parent_id, position } = body;

  if (!id) {
    return apiError("id is required", "INVALID_REQUEST", 400);
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (parent_id !== undefined) updates.parent_id = parent_id || null;
  if (position !== undefined) updates.position = position;

  if (Object.keys(updates).length === 0) {
    return apiError("No fields to update", "INVALID_REQUEST", 400);
  }

  try {
    const { data: folder, error: folderError } = await supabase
      .from("folders")
      .select("project_id")
      .eq("id", id)
      .maybeSingle();
    if (folderError) return backendUnavailable();
    if (!folder) return apiError("Folder not found", "FOLDER_NOT_FOUND", 404);
    const projectAccess = await getProjectAccess(folder.project_id, user.id, "editor", supabase);
    if (!projectAccess.ok) return accessFailure(projectAccess);
    const parentFailure = await assertParentInProject(supabase, folder.project_id, parent_id);
    if (parentFailure) return parentFailure;
    const cycleFailure = await assertNoFolderCycle(
      supabase,
      folder.project_id,
      id,
      parent_id,
    );
    if (cycleFailure) return cycleFailure;

    const { data, error } = await supabase
      .from("folders")
      .update(updates)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) return backendUnavailable();
    if (!data) return apiError("Folder not found", "FOLDER_NOT_FOUND", 404);

    return apiJson(data as Record<string, unknown>);
  } catch {
    return backendUnavailable();
  }
}

export async function DELETE(request: NextRequest) {
  const context = await authenticatedClient();
  if ("response" in context) return context.response;
  const { user, supabase } = context;
  if (!user) return backendUnavailable();

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return apiError("Folder body must be an object", "INVALID_REQUEST", 400);
  }
  const { id } = body;

  if (!id) {
    return apiError("id is required", "INVALID_REQUEST", 400);
  }

  try {
    // Get folder to find its parent and prove the caller can mutate its project.
    const { data: folder, error: folderError } = await supabase
      .from("folders")
      .select("parent_id, project_id")
      .eq("id", id)
      .maybeSingle();
    if (folderError) return backendUnavailable();
    if (!folder) return apiError("Folder not found", "FOLDER_NOT_FOUND", 404);
    const projectAccess = await getProjectAccess(folder.project_id, user.id, "editor", supabase);
    if (!projectAccess.ok) return accessFailure(projectAccess);

    const { data: deleted, error } = await supabase.rpc(
      "delete_folder_atomically",
      { p_folder_id: id, p_project_id: folder.project_id },
    );
    if (error) return backendUnavailable();
    if (deleted !== true) {
      return apiError("Folder not found", "FOLDER_NOT_FOUND", 404);
    }

    return apiJson({ ok: true });
  } catch {
    return backendUnavailable();
  }
}
