import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { requireTeamRole } from "@/lib/middleware/rbac";

interface AuditEntry {
  id: string;
  actor_id: string | null;
  actor_name: string;
  action: string;
  details: Record<string, unknown>;
  project_id: string | null;
  asset_id: string | null;
  created_at: string;
}

/* ── GET — query audit log for a team or project ── */
export async function GET(request: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const teamId = params.get("team_id");
  const projectId = params.get("project_id");
  const actionFilter = params.get("action");
  const actorFilter = params.get("actor");
  const dateFrom = params.get("from");
  const dateTo = params.get("to");
  const search = params.get("q");
  const limit = Math.min(parseInt(params.get("limit") ?? "50", 10), 200);
  const offset = parseInt(params.get("offset") ?? "0", 10);

  if (!teamId && !projectId) {
    return NextResponse.json(
      { error: "team_id or project_id is required" },
      { status: 400 }
    );
  }

  const supabase = getSupabase();

  // If team_id is provided, verify the user has analytics.view permission
  if (teamId) {
    const check = await requireTeamRole(teamId, user.id, "member");
    if (!check.allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Build query
  let query = supabase
    .from("activity_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (teamId) {
    // Get all projects belonging to this team's scope
    // Filter by team-level actions stored in details.team_id
    // or by projects associated with the team
    query = query.or(
      `details->team_id.eq.${teamId},details->>team_id.eq.${teamId}`
    );
  }

  if (projectId) {
    query = query.eq("project_id", projectId);
  }

  if (actionFilter) {
    query = query.eq("action", actionFilter);
  }

  if (actorFilter) {
    query = query.eq("actor_id", actorFilter);
  }

  if (dateFrom) {
    query = query.gte("created_at", dateFrom);
  }

  if (dateTo) {
    query = query.lte("created_at", dateTo);
  }

  if (search) {
    query = query.or(
      `action.ilike.%${search}%,actor_name.ilike.%${search}%`
    );
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    items: (data as AuditEntry[]) ?? [],
    total: count ?? 0,
    limit,
    offset,
  });
}
