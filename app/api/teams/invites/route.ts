import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { sendEmail, getBaseUrl } from "@/lib/email";
import { requireTeamRole } from "@/lib/middleware/rbac";
import { nanoid } from "nanoid";
import type { TeamRole } from "@/lib/types/codeliver";

/* ── GET — list pending invites for a team ── */
export async function GET(request: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const teamId = request.nextUrl.searchParams.get("team_id");
  if (!teamId) {
    return NextResponse.json(
      { error: "team_id is required" },
      { status: 400 }
    );
  }

  const check = await requireTeamRole(teamId, user.id, "admin");
  if (!check.allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("team_invites")
    .select("*")
    .eq("team_id", teamId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}

/* ── POST — create a new invite and send email ── */
export async function POST(request: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { team_id, email, role } = body as {
    team_id?: string;
    email?: string;
    role?: TeamRole;
  };

  if (!team_id || !email) {
    return NextResponse.json(
      { error: "team_id and email are required" },
      { status: 400 }
    );
  }

  const inviteRole = role ?? "member";
  if (!["admin", "member", "viewer"].includes(inviteRole)) {
    return NextResponse.json(
      { error: "Invalid role. Must be admin, member, or viewer." },
      { status: 400 }
    );
  }

  const check = await requireTeamRole(team_id, user.id, "admin");
  if (!check.allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Only owner can invite admins
  if (inviteRole === "admin" && check.role !== "owner") {
    return NextResponse.json(
      { error: "Only the owner can invite admins" },
      { status: 403 }
    );
  }

  const supabase = getSupabase();

  // Check if already a member
  const { data: existingUser } = await supabase
    .from("team_members")
    .select("id")
    .eq("team_id", team_id)
    .eq("user_id", email) // Will not match UUIDs, but let's also check by email later
    .maybeSingle();

  // Check for existing pending invite
  const { data: existingInvite } = await supabase
    .from("team_invites")
    .select("id")
    .eq("team_id", team_id)
    .eq("email", email)
    .eq("status", "pending")
    .maybeSingle();

  if (existingInvite) {
    return NextResponse.json(
      { error: "An invite is already pending for this email" },
      { status: 409 }
    );
  }

  const token = nanoid(32);
  const expiresAt = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000
  ).toISOString(); // 7 days

  const { data: invite, error: invErr } = await supabase
    .from("team_invites")
    .insert({
      team_id,
      email,
      role: inviteRole,
      token,
      status: "pending",
      invited_by: user.id,
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (invErr) {
    return NextResponse.json({ error: invErr.message }, { status: 500 });
  }

  // Get team name for the email
  const { data: team } = await supabase
    .from("teams")
    .select("name")
    .eq("id", team_id)
    .single();

  const acceptUrl = `${getBaseUrl()}/invite/${token}`;

  await sendEmail({
    to: email,
    subject: `You're invited to join ${team?.name ?? "a team"} on CoDeliver`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #f1f5f9;">Team Invitation</h2>
        <p style="color: #94a3b8;">
          ${user.email ?? "Someone"} has invited you to join
          <strong style="color: #f1f5f9;">${team?.name ?? "a team"}</strong>
          as a <strong style="color: #3b82f6;">${inviteRole}</strong>.
        </p>
        <a href="${acceptUrl}"
           style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          Accept Invitation
        </a>
        <p style="color: #64748b; font-size: 12px; margin-top: 24px;">
          This invitation expires in 7 days.
        </p>
      </div>
    `,
  });

  await supabase.from("activity_log").insert({
    actor_id: user.id,
    actor_name: user.email ?? "Unknown",
    action: "team_invite_sent",
    details: { team_id, email, role: inviteRole },
  });

  return NextResponse.json(invite, { status: 201 });
}

/* ── PATCH — accept or decline an invite ── */
export async function PATCH(request: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { invite_id, action } = body as {
    invite_id?: string;
    action?: "accept" | "decline";
  };

  if (!invite_id || !action) {
    return NextResponse.json(
      { error: "invite_id and action are required" },
      { status: 400 }
    );
  }

  if (action !== "accept" && action !== "decline") {
    return NextResponse.json(
      { error: "action must be 'accept' or 'decline'" },
      { status: 400 }
    );
  }

  const supabase = getSupabase();

  const { data: invite, error: invErr } = await supabase
    .from("team_invites")
    .select("*")
    .eq("id", invite_id)
    .eq("status", "pending")
    .single();

  if (invErr || !invite) {
    return NextResponse.json(
      { error: "Invite not found or already processed" },
      { status: 404 }
    );
  }

  // Check expiration
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    await supabase
      .from("team_invites")
      .update({ status: "revoked" })
      .eq("id", invite_id);
    return NextResponse.json(
      { error: "This invitation has expired" },
      { status: 410 }
    );
  }

  // Verify the invite email matches the user
  if (invite.email !== user.email) {
    return NextResponse.json(
      { error: "This invitation was sent to a different email address" },
      { status: 403 }
    );
  }

  const newStatus = action === "accept" ? "accepted" : "declined";

  const { error: updateErr } = await supabase
    .from("team_invites")
    .update({ status: newStatus })
    .eq("id", invite_id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  if (action === "accept") {
    // Add user to team
    const { error: memberErr } = await supabase.from("team_members").insert({
      team_id: invite.team_id,
      user_id: user.id,
      role: invite.role,
      invited_by: invite.invited_by,
    });

    if (memberErr) {
      // If they're already a member, that's okay
      if (!memberErr.message.includes("duplicate")) {
        return NextResponse.json(
          { error: memberErr.message },
          { status: 500 }
        );
      }
    }

    await supabase.from("activity_log").insert({
      actor_id: user.id,
      actor_name: user.email ?? "Unknown",
      action: "team_invite_accepted",
      details: { team_id: invite.team_id, role: invite.role },
    });
  } else {
    await supabase.from("activity_log").insert({
      actor_id: user.id,
      actor_name: user.email ?? "Unknown",
      action: "team_invite_declined",
      details: { team_id: invite.team_id },
    });
  }

  return NextResponse.json({ ok: true, status: newStatus });
}

/* ── DELETE — revoke a pending invite ── */
export async function DELETE(request: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { invite_id } = body as { invite_id?: string };

  if (!invite_id) {
    return NextResponse.json(
      { error: "invite_id is required" },
      { status: 400 }
    );
  }

  const supabase = getSupabase();

  // Get invite to verify team access
  const { data: invite, error: invErr } = await supabase
    .from("team_invites")
    .select("team_id")
    .eq("id", invite_id)
    .eq("status", "pending")
    .single();

  if (invErr || !invite) {
    return NextResponse.json(
      { error: "Invite not found or already processed" },
      { status: 404 }
    );
  }

  const check = await requireTeamRole(invite.team_id, user.id, "admin");
  if (!check.allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase
    .from("team_invites")
    .update({ status: "revoked" })
    .eq("id", invite_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
