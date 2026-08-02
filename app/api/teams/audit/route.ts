import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithClient } from "@/lib/auth-client";
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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTION_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,119}$/i;
const SEARCH_PATTERN = /^[a-z0-9 @._:'/-]{1,100}$/i;

function parseBoundedInteger(
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
}

function parseDate(value: string | null) {
  if (value === null) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
}

/* ── GET — query audit log for a team or project ── */
export async function GET(request: NextRequest) {
  const { user, supabase } = await requireAuthWithClient();
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
  const search = params.get("q")?.trim() || null;
  const limit = parseBoundedInteger(params.get("limit"), 50, 1, 200);
  const offset = parseBoundedInteger(params.get("offset"), 0, 0, 100_000);
  const from = parseDate(dateFrom);
  const to = parseDate(dateTo);

  if (!teamId && !projectId) {
    return NextResponse.json(
      { error: "team_id or project_id is required" },
      { status: 400 }
    );
  }

  if (
    (teamId !== null && !UUID_PATTERN.test(teamId)) ||
    (projectId !== null && !UUID_PATTERN.test(projectId)) ||
    (actorFilter !== null && !UUID_PATTERN.test(actorFilter)) ||
    (actionFilter !== null && !ACTION_PATTERN.test(actionFilter)) ||
    (search !== null && !SEARCH_PATTERN.test(search)) ||
    limit === null ||
    offset === null ||
    from === undefined ||
    to === undefined ||
    (from !== null && to !== null && from > to)
  ) {
    return NextResponse.json({ error: "Invalid audit filter" }, { status: 400 });
  }

  if (teamId) {
    const check = await requireTeamRole(teamId, user.id, "member", supabase);
    if (!check.allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (projectId) {
    let projectQuery = supabase
      .from("projects")
      .select("id, team_id")
      .eq("id", projectId);
    if (teamId) projectQuery = projectQuery.eq("team_id", teamId);
    const { data: project, error: projectError } = await projectQuery.maybeSingle();
    if (projectError || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
  }

  // Build query
  let query = supabase
    .from("activity_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (teamId) {
    query = query.contains("details", { team_id: teamId });
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

  if (from) {
    query = query.gte("created_at", from);
  }

  if (to) {
    query = query.lte("created_at", to);
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
