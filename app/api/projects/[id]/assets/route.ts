import { requireAuthWithClient } from "@/lib/auth-client";
import { getProjectAccess } from "@/lib/access-control";
import { apiError, apiJson, backendUnavailable } from "@/lib/api/responses";
import { legacyUploadRetiredResponse } from "@/lib/tus/legacy-retirement";

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
  const { user, supabase: authSupabase } = context;
  if (!user) return backendUnavailable();

  try {
    const { id } = await params;
    const projectAccess = await getProjectAccess(
      id,
      user.id,
      "viewer",
      authSupabase,
    );
    if (!projectAccess.ok) return accessFailure(projectAccess);

    const { data, error } = await authSupabase
      .from("assets")
      .select(
        "id, project_id, folder_id, title, file_type, file_url, thumbnail_url, proxy_url, file_size, duration_seconds, status, position, uploaded_by, created_at, updated_at, comments(count), approvals(id, status, step_order, role_label, assignee_email), versions(count)",
      )
      .eq("project_id", id)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });

    if (error) {
      return backendUnavailable();
    }
    return apiJson({ items: data ?? [] });
  } catch {
    return backendUnavailable();
  }
}

export async function POST() {
  return legacyUploadRetiredResponse();
}
