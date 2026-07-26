import { NextRequest } from "next/server";
import { requireAuthWithClient } from "@/lib/auth-client";
import { apiError, apiJson, backendUnavailable } from "@/lib/api/responses";
import { isBackendUnavailableError } from "@/lib/api/backend";
import { requireTeamRole } from "@/lib/middleware/rbac";
import type { TeamRole } from "@/lib/types/codeliver";

async function getSession() {
  try {
    const session = await requireAuthWithClient();
    return session.user ? session : { response: apiError("Unauthorized", "UNAUTHORIZED", 401) };
  } catch (error) {
    return { response: isBackendUnavailableError(error) ? backendUnavailable() : apiError("Authentication service is unavailable", "AUTH_UNAVAILABLE", 503) };
  }
}

async function parseBody(request: Request) {
  const body = await request.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
}

async function teamRole(teamId: string, userId: string, minimum: TeamRole) {
  try {
    return await requireTeamRole(teamId, userId, minimum);
  } catch {
    return null;
  }
}

async function audit(client: Awaited<ReturnType<typeof requireAuthWithClient>>["supabase"], actorId: string, actorName: string | undefined, action: string, details: Record<string, unknown>) {
  try {
    await client.from("activity_log").insert({ actor_id: actorId, actor_name: actorName ?? "Unknown", action, details });
  } catch {
    // Audit durability is surfaced by the write route; never disclose provider detail.
  }
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if ("response" in session) return session.response;
  const { supabase } = session;
  const user = session.user!;
  const teamId = request.nextUrl.searchParams.get("team_id");
  try {
    if (teamId) {
      const membership = await supabase.from("team_members").select("role").eq("team_id", teamId).eq("user_id", user.id).single();
      if (membership.error) return membership.error.code === "PGRST116" ? apiError("Team not found", "TEAM_NOT_FOUND", 404) : backendUnavailable();
      if (!membership.data) return apiError("Forbidden", "FORBIDDEN", 403);
      const team = await supabase.from("teams").select("*").eq("id", teamId).single();
      if (team.error) return team.error.code === "PGRST116" ? apiError("Team not found", "TEAM_NOT_FOUND", 404) : backendUnavailable();
      const members = await supabase.from("team_members").select("*").eq("team_id", teamId).order("joined_at", { ascending: true });
      if (members.error) return backendUnavailable();
      return apiJson({ ...team.data, members: members.data ?? [], currentRole: membership.data.role });
    }
    const memberships = await supabase.from("team_members").select("team_id, role").eq("user_id", user.id);
    if (memberships.error) return backendUnavailable();
    if (!memberships.data?.length) return apiJson({ items: [] });
    const ids = memberships.data.map((membership) => membership.team_id);
    const teams = await supabase.from("teams").select("*").in("id", ids).order("created_at", { ascending: false });
    if (teams.error) return backendUnavailable();
    const roles = new Map(memberships.data.map((membership) => [membership.team_id, membership.role]));
    return apiJson({ items: (teams.data ?? []).map((team) => ({ ...team, currentRole: roles.get(team.id) ?? "viewer" })) });
  } catch {
    return backendUnavailable();
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if ("response" in session) return session.response;
  const { supabase } = session;
  const user = session.user!;
  const body = await parseBody(request);
  if (!body) return apiError("A JSON object is required", "INVALID_REQUEST", 400);
  const action = body.action;
  const teamId = typeof body.team_id === "string" ? body.team_id : null;
  const targetId = typeof body.user_id === "string" ? body.user_id : null;
  try {
    if (action === "change_role" || action === "remove") {
      if (!teamId || !targetId) return apiError("team_id and user_id are required", "INVALID_REQUEST", 400);
      const check = await teamRole(teamId, user.id, "admin");
      if (!check) return backendUnavailable();
      if (check.status === 503) return backendUnavailable();
      if (!check.allowed) return apiError("Forbidden", "FORBIDDEN", 403);
      const target = await supabase.from("team_members").select("role").eq("team_id", teamId).eq("user_id", targetId).single();
      if (target.error) return target.error.code === "PGRST116" ? apiError("Member not found", "MEMBER_NOT_FOUND", 404) : backendUnavailable();
      if (target.data.role === "owner") return apiError("Cannot modify team owner", "FORBIDDEN", 403);
      if (action === "change_role") {
        const role = body.role;
        if (role !== "admin" && role !== "member" && role !== "viewer") return apiError("Valid role is required (admin, member, viewer)", "INVALID_REQUEST", 400);
        if (role === "admin" && check.role !== "owner") return apiError("Only the owner can promote to admin", "FORBIDDEN", 403);
        const updated = await supabase.from("team_members").update({ role }).eq("team_id", teamId).eq("user_id", targetId).select("user_id");
        if (updated.error) return backendUnavailable();
        if (!updated.data?.length) return apiError("Member not found", "MEMBER_NOT_FOUND", 404);
        await audit(supabase, user.id, user.email, "team_role_changed", { team_id: teamId, user_id: targetId, new_role: role });
        return apiJson({ ok: true });
      }
      const deleted = await supabase.from("team_members").delete().eq("team_id", teamId).eq("user_id", targetId).select("user_id");
      if (deleted.error) return backendUnavailable();
      if (!deleted.data?.length) return apiError("Member not found", "MEMBER_NOT_FOUND", 404);
      await audit(supabase, user.id, user.email, "team_member_removed", { team_id: teamId, user_id: targetId });
      return apiJson({ ok: true });
    }
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return apiError("name is required", "INVALID_REQUEST", 400);
    const created = await supabase.from("teams").insert({ name, owner_id: user.id }).select().single();
    if (created.error || !created.data) return backendUnavailable();
    const member = await supabase
      .from("team_members")
      .select("role")
      .eq("team_id", created.data.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (member.error || member.data?.role !== "owner") return backendUnavailable();
    await audit(supabase, user.id, user.email, "team_created", { team_id: created.data.id, name });
    return apiJson(created.data, { status: 201 });
  } catch {
    return backendUnavailable();
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if ("response" in session) return session.response;
  const { supabase } = session;
  const user = session.user!;
  const body = await parseBody(request);
  const teamId = typeof body?.team_id === "string" ? body.team_id : null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!teamId || !name) return apiError("team_id and name are required", "INVALID_REQUEST", 400);
  try {
    const check = await teamRole(teamId, user.id, "admin");
    if (!check) return backendUnavailable();
    if (check.status === 503) return backendUnavailable();
    if (!check.allowed) return apiError("Forbidden", "FORBIDDEN", 403);
    const updated = await supabase.from("teams").update({ name }).eq("id", teamId).select().single();
    if (updated.error || !updated.data) return updated.error?.code === "PGRST116" ? apiError("Team not found", "TEAM_NOT_FOUND", 404) : backendUnavailable();
    await audit(supabase, user.id, user.email, "team_renamed", { team_id: teamId, name });
    return apiJson(updated.data);
  } catch { return backendUnavailable(); }
}

export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if ("response" in session) return session.response;
  const { supabase } = session;
  const user = session.user!;
  const body = await parseBody(request);
  const teamId = typeof body?.team_id === "string" ? body.team_id : null;
  if (!teamId) return apiError("team_id is required", "INVALID_REQUEST", 400);
  try {
    const check = await teamRole(teamId, user.id, "owner");
    if (!check) return backendUnavailable();
    if (check.status === 503) return backendUnavailable();
    if (!check.allowed) return apiError("Only the team owner can delete a team", "FORBIDDEN", 403);
    const deleted = await supabase.from("teams").delete().eq("id", teamId).select("id");
    if (deleted.error) return backendUnavailable();
    if (!deleted.data?.length) return apiError("Team not found", "TEAM_NOT_FOUND", 404);
    await audit(supabase, user.id, user.email, "team_deleted", { team_id: teamId });
    return apiJson({ ok: true });
  } catch { return backendUnavailable(); }
}
