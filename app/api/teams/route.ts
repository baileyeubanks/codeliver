import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { requireTeamRole } from "@/lib/middleware/rbac";
import type { TeamRole } from "@/lib/types/codeliver";

/* ── GET — fetch a single team with members, or list all teams for current user ── */
export async function GET(request: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  const teamId = request.nextUrl.searchParams.get("team_id");

  if (teamId) {
    // Fetch single team with members
    const { data: team, error: teamErr } = await supabase
      .from("teams")
      .select("*")
      .eq("id", teamId)
      .single();

    if (teamErr || !team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    // Verify membership
    const { data: membership } = await supabase
      .from("team_members")
      .select("role")
      .eq("team_id", teamId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: members } = await supabase
      .from("team_members")
      .select("*")
      .eq("team_id", teamId)
      .order("joined_at", { ascending: true });

    return NextResponse.json({
      ...team,
      members: members ?? [],
      currentRole: membership.role,
    });
  }

  // List all teams for the current user
  const { data: memberships, error: memErr } = await supabase
    .from("team_members")
    .select("team_id, role")
    .eq("user_id", user.id);

  if (memErr) {
    return NextResponse.json({ error: memErr.message }, { status: 500 });
  }

  if (!memberships || memberships.length === 0) {
    return NextResponse.json({ items: [] });
  }

  const teamIds = memberships.map((m) => m.team_id);
  const roleMap = new Map(memberships.map((m) => [m.team_id, m.role]));

  const { data: teams, error: teamsErr } = await supabase
    .from("teams")
    .select("*")
    .in("id", teamIds)
    .order("created_at", { ascending: false });

  if (teamsErr) {
    return NextResponse.json({ error: teamsErr.message }, { status: 500 });
  }

  const items = (teams ?? []).map((t) => ({
    ...t,
    currentRole: roleMap.get(t.id) ?? "viewer",
  }));

  return NextResponse.json({ items });
}

/* ── POST — create team or perform member operations ── */
export async function POST(request: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const supabase = getSupabase();

  // Member operations: change_role / remove
  if (body.action === "change_role" || body.action === "remove") {
    const { team_id, action, user_id, role } = body as {
      team_id: string;
      action: string;
      user_id: string;
      role?: TeamRole;
    };

    if (!team_id || !user_id) {
      return NextResponse.json(
        { error: "team_id and user_id are required" },
        { status: 400 }
      );
    }

    // Require admin or owner
    const check = await requireTeamRole(team_id, user.id, "admin");
    if (!check.allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Prevent modifying the owner
    const { data: targetMember } = await supabase
      .from("team_members")
      .select("role")
      .eq("team_id", team_id)
      .eq("user_id", user_id)
      .single();

    if (!targetMember) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    if (targetMember.role === "owner") {
      return NextResponse.json(
        { error: "Cannot modify team owner" },
        { status: 403 }
      );
    }

    if (action === "change_role") {
      if (!role || !["admin", "member", "viewer"].includes(role)) {
        return NextResponse.json(
          { error: "Valid role is required (admin, member, viewer)" },
          { status: 400 }
        );
      }

      // Only owner can promote to admin
      if (role === "admin" && check.role !== "owner") {
        return NextResponse.json(
          { error: "Only the owner can promote to admin" },
          { status: 403 }
        );
      }

      const { error } = await supabase
        .from("team_members")
        .update({ role })
        .eq("team_id", team_id)
        .eq("user_id", user_id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Log activity
      await supabase.from("activity_log").insert({
        actor_id: user.id,
        actor_name: user.email ?? "Unknown",
        action: "team_role_changed",
        details: { team_id, user_id, new_role: role },
      });

      return NextResponse.json({ ok: true });
    }

    if (action === "remove") {
      const { error } = await supabase
        .from("team_members")
        .delete()
        .eq("team_id", team_id)
        .eq("user_id", user_id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      await supabase.from("activity_log").insert({
        actor_id: user.id,
        actor_name: user.email ?? "Unknown",
        action: "team_member_removed",
        details: { team_id, user_id },
      });

      return NextResponse.json({ ok: true });
    }
  }

  // Create new team
  const { name } = body as { name?: string };
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const { data: team, error: teamErr } = await supabase
    .from("teams")
    .insert({ name, owner_id: user.id })
    .select()
    .single();

  if (teamErr) {
    return NextResponse.json({ error: teamErr.message }, { status: 500 });
  }

  // Add creator as owner member
  const { error: memberErr } = await supabase.from("team_members").insert({
    team_id: team.id,
    user_id: user.id,
    role: "owner",
    invited_by: user.id,
  });

  if (memberErr) {
    return NextResponse.json({ error: memberErr.message }, { status: 500 });
  }

  await supabase.from("activity_log").insert({
    actor_id: user.id,
    actor_name: user.email ?? "Unknown",
    action: "team_created",
    details: { team_id: team.id, name },
  });

  return NextResponse.json(team, { status: 201 });
}

/* ── PATCH — rename team ── */
export async function PATCH(request: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { team_id, name } = body as { team_id?: string; name?: string };

  if (!team_id || !name) {
    return NextResponse.json(
      { error: "team_id and name are required" },
      { status: 400 }
    );
  }

  const check = await requireTeamRole(team_id, user.id, "admin");
  if (!check.allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("teams")
    .update({ name })
    .eq("id", team_id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("activity_log").insert({
    actor_id: user.id,
    actor_name: user.email ?? "Unknown",
    action: "team_renamed",
    details: { team_id, name },
  });

  return NextResponse.json(data);
}

/* ── DELETE — delete team (owner only) ── */
export async function DELETE(request: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { team_id } = body as { team_id?: string };

  if (!team_id) {
    return NextResponse.json(
      { error: "team_id is required" },
      { status: 400 }
    );
  }

  const check = await requireTeamRole(team_id, user.id, "owner");
  if (!check.allowed) {
    return NextResponse.json(
      { error: "Only the team owner can delete a team" },
      { status: 403 }
    );
  }

  const supabase = getSupabase();

  // Cascade delete handles members, invites, webhooks via FK
  const { error } = await supabase.from("teams").delete().eq("id", team_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("activity_log").insert({
    actor_id: user.id,
    actor_name: user.email ?? "Unknown",
    action: "team_deleted",
    details: { team_id },
  });

  return NextResponse.json({ ok: true });
}
