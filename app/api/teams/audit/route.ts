import { NextRequest } from "next/server";
import { requireAuthWithClient } from "@/lib/auth-client";
import { apiError, apiJson, backendUnavailable } from "@/lib/api/responses";
import { isBackendUnavailableError } from "@/lib/api/backend";
import { requireTeamRole } from "@/lib/middleware/rbac";
import { getProjectAccess } from "@/lib/access-control";

interface AuditEntry {
  id: string; actor_id: string | null; actor_name: string; action: string;
  details: Record<string, unknown>; project_id: string | null; asset_id: string | null; created_at: string;
}

export async function GET(request: NextRequest) {
  let session: Awaited<ReturnType<typeof requireAuthWithClient>>;
  try { session = await requireAuthWithClient(); } catch (error) {
    return isBackendUnavailableError(error) ? backendUnavailable() : apiError("Authentication service is unavailable", "AUTH_UNAVAILABLE", 503);
  }
  if (!session.user) return apiError("Unauthorized", "UNAUTHORIZED", 401);
  const { user, supabase } = session;
  const params = request.nextUrl.searchParams;
  const teamId = params.get("team_id");
  const projectId = params.get("project_id");
  const limitValue = Number.parseInt(params.get("limit") ?? "50", 10);
  const offsetValue = Number.parseInt(params.get("offset") ?? "0", 10);
  const limit = Number.isInteger(limitValue) ? Math.min(Math.max(limitValue, 1), 200) : 50;
  const offset = Number.isInteger(offsetValue) ? Math.max(offsetValue, 0) : 0;
  if (!teamId && !projectId) return apiError("team_id or project_id is required", "INVALID_REQUEST", 400);
  try {
    if (teamId) {
      const check = await requireTeamRole(teamId, user.id, "member");
      if (check.status === 503) return backendUnavailable();
      if (!check.allowed) return apiError("Forbidden", "FORBIDDEN", 403);
    }
    if (projectId) {
      const access = await getProjectAccess(projectId, user.id, "viewer", supabase);
      if (!access.ok) {
        return access.status >= 500
          ? backendUnavailable()
          : apiError("Project not found", "PROJECT_NOT_FOUND", 404);
      }
    }
    let query = supabase.from("activity_log").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    if (teamId) query = query.or(`details->team_id.eq.${teamId},details->>team_id.eq.${teamId}`);
    if (projectId) query = query.eq("project_id", projectId);
    const action = params.get("action"); const actor = params.get("actor"); const from = params.get("from"); const to = params.get("to"); const search = params.get("q");
    if (action) query = query.eq("action", action);
    if (actor) query = query.eq("actor_id", actor);
    if (from) query = query.gte("created_at", from);
    if (to) query = query.lte("created_at", to);
    if (search) query = query.or(`action.ilike.%${search}%,actor_name.ilike.%${search}%`);
    const { data, error, count } = await query;
    if (error) return backendUnavailable();
    return apiJson({ items: (data as AuditEntry[]) ?? [], total: count ?? 0, limit, offset });
  } catch { return backendUnavailable(); }
}
