import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { requireAuthWithClient } from "@/lib/auth-client";
import { tenantAuthorityKey } from "@/lib/access-control";
import { isInviteReturnPath } from "@/lib/auth/host-surface";
import {
  mergeProvisionedRole,
  resolveProvisionedRole,
} from "@/lib/auth/provisioning";
import { getSupabase } from "@/lib/supabase";
import { getBaseUrl } from "@/lib/email";
import { requireTeamRole } from "@/lib/middleware/rbac";
import {
  dispatchTransactionalNotification,
  notificationChannelStatus,
} from "@/lib/notifications/transactional";
import {
  opaqueTokenLookup,
  persistedOpaqueTokenFields,
  withoutPersistedTokenSecrets,
} from "@/lib/security/opaque-token";
import { nanoid } from "nanoid";
import type { TeamRole } from "@/lib/types/codeliver";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

function inviteJson(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...Object.fromEntries(new Headers(init?.headers).entries()),
      ...NO_STORE_HEADERS,
    },
  });
}

function normalizeEmail(value: string) {
  const normalized = value.trim().toLowerCase();
  return EMAIL_PATTERN.test(normalized) ? normalized : null;
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
    if (!isInviteReturnPath(`/invite/${token}`)) {
      return inviteJson({ error: "Invitation token is invalid" }, { status: 400 });
    }
    const lookup = opaqueTokenLookup(token);
    const supabase = getSupabase();
    const { data: invite, error } = await supabase
      .from("team_invites")
      .select("id, team_id, email, role, status, expires_at, teams(name)")
      .eq(lookup.column, lookup.value)
      .eq("status", "pending")
      .maybeSingle();
    if (error) {
      return inviteJson({ error: "Invitation access is temporarily unavailable" }, { status: 503 });
    }
    if (!invite) {
      return inviteJson(
        { error: "Invite not found or already processed" },
        { status: 404 },
      );
    }
    if (invite.expires_at && new Date(invite.expires_at) <= new Date()) {
      return inviteJson(
        { error: "This invitation has expired" },
        { status: 410 },
      );
    }
    if (!user.email || invite.email.toLowerCase() !== user.email.toLowerCase()) {
      return inviteJson(
        { error: "This invitation was sent to a different email address" },
        { status: 403 },
      );
    }

    const team = Array.isArray(invite.teams) ? invite.teams[0] : invite.teams;
    return inviteJson({
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

  const notification = await dispatchTransactionalNotification({
    client: supabase,
    tenantId: tenantAuthorityKey("team", team_id),
    actorId: user.id,
    actorName: senderName,
    eventType: "team_invite",
    idempotencyKey: `team-invite:${invite.id}`,
    channels: ["email"],
    recipient: { email: normalizedEmail },
    message: {
      title: `You're invited to join ${teamName} on Co-VideoPro`,
      body: `${senderName} invited you to join ${teamName} as a ${inviteRole}. This invitation expires in 7 days.`,
      actionUrl: `/invite/${token}`,
    },
  });
  if (
    !notification.ok &&
    "code" in notification &&
    notification.code === "notification_queue_unavailable"
  ) {
    return NextResponse.json(
      { error: notification.error, code: notification.code },
      { status: 503 },
    );
  }
  const emailStatus = notificationChannelStatus(notification, "email");

  await supabase.from("activity_log").insert({
    actor_id: user.id,
    actor_name: user.email ?? "Unknown",
    action: "team_invite_created",
    details: {
      team_id,
      invite_id: invite.id,
      role: inviteRole,
      expires_at: expiresAt,
      delivery_status: emailStatus,
    },
  });

  return NextResponse.json(
    {
      invite: serializeTeamInvite(invite as Record<string, unknown>),
      accept_url: acceptUrl,
      email_sent: emailStatus === "sent",
      notification_delivery: emailStatus,
    },
    { status: 201 },
  );
}

/* ── PATCH — accept or decline an invite ── */
export async function PATCH(request: NextRequest) {
  const { user, supabase: authClient } = await requireAuthWithClient();
  if (!user) {
    return inviteJson({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return inviteJson({ error: "Invalid invitation request" }, { status: 400 });
  }

  const inviteId = typeof body.invite_id === "string" ? body.invite_id : null;
  const token = typeof body.token === "string" ? body.token : null;
  const action = body.action;

  if ((!inviteId && !token) || (action !== "accept" && action !== "decline")) {
    return inviteJson(
      { error: "A valid invitation and decision are required" },
      { status: 400 },
    );
  }
  if (token && !isInviteReturnPath(`/invite/${token}`)) {
    return inviteJson({ error: "Invitation token is invalid" }, { status: 400 });
  }

  const supabase = getSupabase();
  const lookup = token
    ? opaqueTokenLookup(token)
    : { column: "id" as const, value: inviteId as string };
  const { data: invite, error: inviteError } = await supabase
    .from("team_invites")
    .select("*")
    .eq(lookup.column, lookup.value)
    .maybeSingle();

  if (inviteError) {
    return inviteJson(
      { error: "Invitation access is temporarily unavailable" },
      { status: 503 },
    );
  }
  if (!invite) {
    return inviteJson({ error: "Invitation not found" }, { status: 404 });
  }
  if (!user.email || invite.email.toLowerCase() !== user.email.toLowerCase()) {
    return inviteJson(
      { error: "This invitation was sent to a different email address" },
      { status: 403 },
    );
  }
  if (!user.email_confirmed_at) {
    return inviteJson(
      { error: "Confirm your email address before accepting this invitation" },
      { status: 403 },
    );
  }

  if (invite.status !== "pending") {
    if (invite.status === "accepted" && action === "accept") {
      const membership = await supabase
        .from("team_members")
        .select("id")
        .eq("team_id", invite.team_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (membership.error) {
        return inviteJson(
          { error: "Invitation access is temporarily unavailable" },
          { status: 503 },
        );
      }
      if (!membership.data) {
        return inviteJson(
          {
            error: "Invitation state requires administrator recovery",
            code: "INVITE_MEMBERSHIP_RECOVERY_REQUIRED",
          },
          { status: 409 },
        );
      }

      const auditRecorded = await ensureAcceptedInviteAudit({
        serviceClient: supabase,
        invite,
        user,
        alreadyMember: true,
      });
      if (!auditRecorded) {
        return inviteJson(
          {
            error: "Invitation audit requires administrator recovery",
            code: "INVITE_AUDIT_RECOVERY_REQUIRED",
          },
          { status: 503 },
        );
      }

      const authority = await ensureInvitedSurfaceAuthority({
        serviceClient: supabase,
        authClient,
        user,
      });
      if (!authority.ok) {
        return inviteJson(
          {
            error: "Account access could not be provisioned",
            code: "INVITE_AUTHORITY_UNAVAILABLE",
          },
          { status: 503 },
        );
      }

      return inviteJson({
        ok: true,
        status: "accepted",
        already_member: true,
        idempotent_replay: true,
        audit_recorded: true,
        reauthentication_required: !authority.sessionRefreshed,
      });
    }

    if (invite.status === "declined" && action === "decline") {
      return inviteJson({
        ok: true,
        status: "declined",
        idempotent_replay: true,
        audit_recorded: true,
      });
    }

    return inviteJson(
      { error: "Invitation was already processed" },
      { status: 409 },
    );
  }

  if (invite.expires_at && new Date(invite.expires_at) <= new Date()) {
    await supabase
      .from("team_invites")
      .update({ status: "revoked" })
      .eq("id", invite.id)
      .eq("status", "pending");
    return inviteJson({ error: "This invitation has expired" }, { status: 410 });
  }

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
      return inviteJson(
        { error: "Team access could not be created" },
        { status: 503 },
      );
    }

    const inviteUpdate = await supabase
      .from("team_invites")
      .update({ status: "accepted" })
      .eq("id", invite.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (inviteUpdate.error || !inviteUpdate.data) {
      const rollback = membership.data
        ? await supabase.from("team_members").delete().eq("id", membership.data.id)
        : null;
      if (rollback?.error) {
        return inviteJson(
          {
            error: "Invitation state requires administrator recovery",
            code: "INVITE_MEMBERSHIP_RECOVERY_REQUIRED",
          },
          { status: 503 },
        );
      }
      return inviteJson(
        { error: "Invitation was already processed" },
        { status: 409 },
      );
    }

    const audit = await supabase
      .from("activity_log")
      .insert({
        actor_id: user.id,
        actor_name: user.email ?? "Unknown",
        action: "team_invite_accepted",
        details: {
          team_id: invite.team_id,
          invite_id: invite.id,
          role: invite.role,
          already_member: alreadyMember,
        },
      })
      .select("id")
      .single();
    if (audit.error || !audit.data) {
      const rolledBack = await rollbackAcceptedInvite({
        serviceClient: supabase,
        inviteId: invite.id,
        membershipId: membership.data?.id ?? null,
        auditId: null,
      });
      return inviteJson(
        {
          error: rolledBack
            ? "Invitation access is temporarily unavailable"
            : "Invitation state requires administrator recovery",
          code: rolledBack
            ? "INVITE_AUDIT_UNAVAILABLE"
            : "INVITE_AUDIT_RECOVERY_REQUIRED",
        },
        { status: 503 },
      );
    }

    const authority = await ensureInvitedSurfaceAuthority({
      serviceClient: supabase,
      authClient,
      user,
    });
    if (!authority.ok) {
      const rolledBack = await rollbackAcceptedInvite({
        serviceClient: supabase,
        inviteId: invite.id,
        membershipId: membership.data?.id ?? null,
        auditId: audit.data.id,
      });
      return inviteJson(
        {
          error: rolledBack
            ? "Account access could not be provisioned"
            : "Invitation state requires administrator recovery",
          code: rolledBack
            ? "INVITE_AUTHORITY_UNAVAILABLE"
            : "INVITE_AUTHORITY_RECOVERY_REQUIRED",
        },
        { status: 503 },
      );
    }

    return inviteJson({
      ok: true,
      status: "accepted",
      already_member: alreadyMember,
      audit_recorded: true,
      reauthentication_required: !authority.sessionRefreshed,
    });
  }

  const inviteUpdate = await supabase
    .from("team_invites")
    .update({ status: "declined" })
    .eq("id", invite.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (inviteUpdate.error || !inviteUpdate.data) {
    return inviteJson(
      { error: "Invitation was already processed" },
      { status: 409 },
    );
  }

  const audit = await supabase.from("activity_log").insert({
    actor_id: user.id,
    actor_name: user.email ?? "Unknown",
    action: "team_invite_declined",
    details: { team_id: invite.team_id, invite_id: invite.id },
  });
  if (audit.error) {
    const rollback = await supabase
      .from("team_invites")
      .update({ status: "pending" })
      .eq("id", invite.id)
      .eq("status", "declined");
    return inviteJson(
      {
        error: rollback.error
          ? "Invitation state requires administrator recovery"
          : "Invitation access is temporarily unavailable",
        code: rollback.error
          ? "INVITE_AUDIT_RECOVERY_REQUIRED"
          : "INVITE_AUDIT_UNAVAILABLE",
      },
      { status: 503 },
    );
  }

  return inviteJson({
    ok: true,
    status: "declined",
    audit_recorded: true,
  });
}

async function rollbackAcceptedInvite({
  serviceClient,
  inviteId,
  membershipId,
  auditId,
}: {
  serviceClient: ReturnType<typeof getSupabase>;
  inviteId: string;
  membershipId: string | null;
  auditId: string | null;
}) {
  let clean = true;
  if (auditId) {
    const auditRollback = await serviceClient
      .from("activity_log")
      .delete()
      .eq("id", auditId);
    clean = clean && !auditRollback.error;
  }
  const inviteRollback = await serviceClient
    .from("team_invites")
    .update({ status: "pending" })
    .eq("id", inviteId)
    .eq("status", "accepted");
  clean = clean && !inviteRollback.error;
  if (membershipId) {
    const membershipRollback = await serviceClient
      .from("team_members")
      .delete()
      .eq("id", membershipId);
    clean = clean && !membershipRollback.error;
  }
  return clean;
}

async function ensureAcceptedInviteAudit({
  serviceClient,
  invite,
  user,
  alreadyMember,
}: {
  serviceClient: ReturnType<typeof getSupabase>;
  invite: Record<string, unknown> & {
    id: string;
    team_id: string;
    role: string;
  };
  user: NonNullable<Awaited<ReturnType<typeof requireAuthWithClient>>["user"]>;
  alreadyMember: boolean;
}) {
  const existing = await serviceClient
    .from("activity_log")
    .select("id")
    .eq("actor_id", user.id)
    .eq("action", "team_invite_accepted")
    .contains("details", { invite_id: invite.id })
    .maybeSingle();
  if (existing.error) return false;
  if (existing.data) return true;

  const inserted = await serviceClient.from("activity_log").insert({
    actor_id: user.id,
    actor_name: user.email ?? "Unknown",
    action: "team_invite_accepted",
    details: {
      team_id: invite.team_id,
      invite_id: invite.id,
      role: invite.role,
      already_member: alreadyMember,
      recovered_from_accepted_state: true,
    },
  });
  return !inserted.error;
}

async function ensureInvitedSurfaceAuthority({
  serviceClient,
  authClient,
  user,
}: {
  serviceClient: ReturnType<typeof getSupabase>;
  authClient: Awaited<ReturnType<typeof import("@/lib/supabase-auth").createSupabaseAuth>>;
  user: NonNullable<Awaited<ReturnType<typeof requireAuthWithClient>>["user"]>;
}): Promise<
  | { ok: true; sessionRefreshed: boolean }
  | { ok: false; sessionRefreshed: false }
> {
  if (resolveProvisionedRole(user)) {
    return { ok: true, sessionRefreshed: true };
  }

  const provisioned = await serviceClient.auth.admin.updateUserById(user.id, {
    app_metadata: mergeProvisionedRole(user.app_metadata, "client"),
  });
  if (provisioned.error) {
    return { ok: false, sessionRefreshed: false };
  }

  const refreshed = await authClient.auth.refreshSession();
  if (!refreshed.error && refreshed.data.session) {
    return { ok: true, sessionRefreshed: true };
  }

  await authClient.auth.signOut({ scope: "local" }).catch(() => undefined);
  return { ok: true, sessionRefreshed: false };
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
