import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { sendEmail, getBaseUrl } from "@/lib/email";
import { requireTeamRole } from "@/lib/middleware/rbac";
import {
  opaqueTokenLookup,
  persistedOpaqueTokenFields,
  withoutPersistedTokenSecrets,
} from "@/lib/security/opaque-token";
import { nanoid } from "nanoid";
import type { TeamRole } from "@/lib/types/codeliver";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value: string) {
  const normalized = value.trim().toLowerCase();
  return EMAIL_PATTERN.test(normalized) ? normalized : null;
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );
}

function serializeTeamInvite(row: Record<string, unknown>) {
  const safe = withoutPersistedTokenSecrets(row);
  delete safe.token;
  return safe;
}

/* ── GET — list pending invites for a team ── */
export async function GET(request: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = request.nextUrl.searchParams.get("token");
  if (token) {
    const lookup = opaqueTokenLookup(token);
    const supabase = getSupabase();
    const { data: invite, error } = await supabase
      .from("team_invites")
      .select("id, team_id, email, role, status, expires_at, teams(name)")
      .eq(lookup.column, lookup.value)
      .eq("status", "pending")
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!invite) {
      return NextResponse.json(
        { error: "Invite not found or already processed" },
        { status: 404 },
      );
    }
    if (invite.expires_at && new Date(invite.expires_at) <= new Date()) {
      return NextResponse.json(
        { error: "This invitation has expired" },
        { status: 410 },
      );
    }
    if (!user.email || invite.email.toLowerCase() !== user.email.toLowerCase()) {
      return NextResponse.json(
        { error: "This invitation was sent to a different email address" },
        { status: 403 },
      );
    }

    const team = Array.isArray(invite.teams) ? invite.teams[0] : invite.teams;
    return NextResponse.json({
      invite: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        expires_at: invite.expires_at,
        team: {
          id: invite.team_id,
          name: team?.name ?? "Content Co-op team",
        },
      },
    });
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

  return NextResponse.json({
    items: (data ?? []).map((invite) =>
      serializeTeamInvite(invite as Record<string, unknown>),
    ),
  });
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

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return NextResponse.json(
      { error: "A valid email address is required" },
      { status: 400 },
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

  // Check for existing pending invite
  const { data: existingInvite } = await supabase
    .from("team_invites")
    .select("id")
    .eq("team_id", team_id)
    .eq("email", normalizedEmail)
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
      email: normalizedEmail,
      role: inviteRole,
      ...persistedOpaqueTokenFields(token),
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
  const teamName = team?.name ?? "a team";
  const senderName = user.email ?? "A Content Co-op producer";

  const delivery = await sendEmail({
    to: normalizedEmail,
    subject: `You're invited to join ${teamName} on Webster`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #0f1f3d;">Team invitation</h2>
        <p style="color: #526079;">
          ${escapeHtml(senderName)} has invited you to join
          <strong style="color: #0f1f3d;">${escapeHtml(teamName)}</strong>
          as a <strong style="color: #1265e8;">${escapeHtml(inviteRole)}</strong>.
        </p>
        <a href="${acceptUrl}"
           style="display: inline-block; background: #1265e8; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">
          Accept Invitation
        </a>
        <p style="color: #6b7890; font-size: 12px; margin-top: 24px;">
          This invitation expires in 7 days.
        </p>
      </div>
    `,
  });

  await supabase.from("activity_log").insert({
    actor_id: user.id,
    actor_name: user.email ?? "Unknown",
    action: "team_invite_sent",
    details: {
      team_id,
      email: normalizedEmail,
      role: inviteRole,
      delivery_status: delivery ? "sent" : "not_sent",
    },
  });

  return NextResponse.json(
    {
      invite: serializeTeamInvite(invite as Record<string, unknown>),
      accept_url: acceptUrl,
      email_sent: Boolean(delivery),
    },
    { status: 201 },
  );
}

/* ── PATCH — accept or decline an invite ── */
export async function PATCH(request: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { invite_id, token, action } = body as {
    invite_id?: string;
    token?: string;
    action?: "accept" | "decline";
  };

  if ((!invite_id && !token) || !action) {
    return NextResponse.json(
      { error: "token or invite_id and action are required" },
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

  const lookup = token
    ? opaqueTokenLookup(token)
    : { column: "id" as const, value: invite_id as string };
  const { data: invite, error: invErr } = await supabase
    .from("team_invites")
    .select("*")
    .eq(lookup.column, lookup.value)
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
      .eq("id", invite.id);
    return NextResponse.json(
      { error: "This invitation has expired" },
      { status: 410 }
    );
  }

  // Verify the invite email matches the user
  if (!user.email || invite.email.toLowerCase() !== user.email.toLowerCase()) {
    return NextResponse.json(
      { error: "This invitation was sent to a different email address" },
      { status: 403 }
    );
  }

  const newStatus = action === "accept" ? "accepted" : "declined";

  if (action === "accept") {
    const membership = await supabase
      .from("team_members")
      .insert({
      team_id: invite.team_id,
      user_id: user.id,
      role: invite.role,
      invited_by: invite.invited_by,
      })
      .select("id")
      .single();
    const alreadyMember =
      membership.error?.code === "23505" ||
      membership.error?.message.toLowerCase().includes("duplicate") === true;

    if (membership.error && !alreadyMember) {
      return NextResponse.json(
        { error: membership.error.message },
        { status: 500 },
      );
    }

    const update = await supabase
      .from("team_invites")
      .update({ status: newStatus })
      .eq("id", invite.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (update.error || !update.data) {
      const rollback = membership.data
        ? await supabase.from("team_members").delete().eq("id", membership.data.id)
        : null;
      if (rollback?.error) {
        return NextResponse.json(
          { error: "Invite acceptance conflicted and membership rollback failed" },
          { status: 503 },
        );
      }
      return NextResponse.json(
        { error: update.error?.message ?? "Invite was already processed" },
        { status: update.error ? 500 : 409 },
      );
    }

    const audit = await supabase.from("activity_log").insert({
      actor_id: user.id,
      actor_name: user.email ?? "Unknown",
      action: "team_invite_accepted",
      details: {
        team_id: invite.team_id,
        role: invite.role,
        already_member: alreadyMember,
      },
    });
    return NextResponse.json({
      ok: true,
      status: newStatus,
      already_member: alreadyMember,
      audit_recorded: !audit.error,
    });
  }

  const update = await supabase
    .from("team_invites")
    .update({ status: newStatus })
    .eq("id", invite.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (update.error || !update.data) {
    return NextResponse.json(
      { error: update.error?.message ?? "Invite was already processed" },
      { status: update.error ? 500 : 409 },
    );
  }

  const audit = await supabase.from("activity_log").insert({
      actor_id: user.id,
      actor_name: user.email ?? "Unknown",
      action: "team_invite_declined",
      details: { team_id: invite.team_id },
  });

  return NextResponse.json({
    ok: true,
    status: newStatus,
    audit_recorded: !audit.error,
  });
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
