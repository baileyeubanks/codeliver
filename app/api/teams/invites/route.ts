import { NextRequest } from "next/server";
import { nanoid } from "nanoid";
import { requireAuthWithClient } from "@/lib/auth-client";
import { apiError, apiJson, backendUnavailable } from "@/lib/api/responses";
import { isBackendUnavailableError } from "@/lib/api/backend";
import { getBaseUrl, sendEmail } from "@/lib/email";
import { requireTeamRole } from "@/lib/middleware/rbac";
import { opaqueTokenLookup, persistedOpaqueTokenFields, withoutPersistedTokenSecrets } from "@/lib/security/opaque-token";
import type { TeamRole } from "@/lib/types/codeliver";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const validRole = (value: unknown): value is Exclude<TeamRole, "owner"> => value === "admin" || value === "member" || value === "viewer";

async function getSession() {
  try { const session = await requireAuthWithClient(); return session.user ? session : { response: apiError("Unauthorized", "UNAUTHORIZED", 401) }; }
  catch (error) { return { response: isBackendUnavailableError(error) ? backendUnavailable() : apiError("Authentication service is unavailable", "AUTH_UNAVAILABLE", 503) }; }
}
async function bodyOf(request: Request) { const body = await request.json().catch(() => null); return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null; }
function emailOf(value: unknown) { const email = typeof value === "string" ? value.trim().toLowerCase() : ""; return EMAIL_PATTERN.test(email) ? email : null; }
function inviteRow(row: Record<string, unknown>) { const safe = withoutPersistedTokenSecrets(row); delete safe.token; return safe; }
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character); }

export async function GET(request: NextRequest) {
  const session = await getSession(); if ("response" in session) return session.response;
  const { supabase } = session; const user = session.user!; const token = request.nextUrl.searchParams.get("token"); const teamId = request.nextUrl.searchParams.get("team_id");
  try {
    if (token) {
      const lookup = opaqueTokenLookup(token);
      const result = await supabase.from("team_invites").select("id, team_id, email, role, status, expires_at, teams(name)").eq(lookup.column, lookup.value).eq("status", "pending").maybeSingle();
      if (result.error) return backendUnavailable();
      if (!result.data) return apiError("Invite not found or already processed", "INVITE_NOT_FOUND", 404);
      if (result.data.expires_at && new Date(result.data.expires_at) <= new Date()) return apiError("This invitation has expired", "INVITE_EXPIRED", 410);
      if (!user.email || result.data.email.toLowerCase() !== user.email.toLowerCase()) return apiError("This invitation was sent to a different email address", "FORBIDDEN", 403);
      const team = Array.isArray(result.data.teams) ? result.data.teams[0] : result.data.teams;
      return apiJson({ invite: { id: result.data.id, email: result.data.email, role: result.data.role, expires_at: result.data.expires_at, team: { id: result.data.team_id, name: team?.name ?? "Content Co-op team" } } });
    }
    if (!teamId) return apiError("team_id is required", "INVALID_REQUEST", 400);
    const check = await requireTeamRole(teamId, user.id, "admin");
    if (check.status === 503) return backendUnavailable();
    if (!check.allowed) return apiError("Forbidden", "FORBIDDEN", 403);
    const result = await supabase.from("team_invites").select("*").eq("team_id", teamId).eq("status", "pending").order("created_at", { ascending: false });
    if (result.error) return backendUnavailable();
    return apiJson({ items: (result.data ?? []).map((invite) => inviteRow(invite as Record<string, unknown>)) });
  } catch { return backendUnavailable(); }
}

export async function POST(request: NextRequest) {
  const session = await getSession(); if ("response" in session) return session.response;
  const { supabase } = session; const user = session.user!; const body = await bodyOf(request); if (!body) return apiError("A JSON object is required", "INVALID_REQUEST", 400);
  const teamId = typeof body.team_id === "string" ? body.team_id : null; const email = emailOf(body.email); const role = body.role ?? "member";
  if (!teamId || !email) return apiError("team_id and a valid email are required", "INVALID_REQUEST", 400);
  if (!validRole(role)) return apiError("Invalid role. Must be admin, member, or viewer.", "INVALID_REQUEST", 400);
  try {
    const check = await requireTeamRole(teamId, user.id, "admin");
    if (check.status === 503) return backendUnavailable();
    if (!check.allowed) return apiError("Forbidden", "FORBIDDEN", 403);
    if (role === "admin" && check.role !== "owner") return apiError("Only the owner can invite admins", "FORBIDDEN", 403);
    const existing = await supabase.from("team_invites").select("id").eq("team_id", teamId).eq("email", email).eq("status", "pending").maybeSingle();
    if (existing.error) return backendUnavailable();
    if (existing.data) return apiError("An invite is already pending for this email", "INVITE_CONFLICT", 409);
    const token = nanoid(32); const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const inserted = await supabase.from("team_invites").insert({ team_id: teamId, email, role, ...persistedOpaqueTokenFields(token), status: "pending", invited_by: user.id, expires_at: expiresAt }).select().single();
    if (inserted.error || !inserted.data) return backendUnavailable();
    const team = await supabase.from("teams").select("name").eq("id", teamId).single();
    if (team.error) return backendUnavailable();
    const acceptUrl = `${getBaseUrl()}/invite/${token}`; const teamName = team.data?.name ?? "a team"; const senderName = user.email ?? "A Content Co-op producer";
    let delivered = false;
    try { delivered = Boolean(await sendEmail({ to: email, subject: `You're invited to join ${teamName} on Co‑ProVideo`, html: `<p>${escapeHtml(senderName)} invited you to join <strong>${escapeHtml(teamName)}</strong> as ${escapeHtml(role)}.</p><p><a href="${acceptUrl}">Accept Invitation</a></p>` })); } catch { delivered = false; }
    await supabase.from("activity_log").insert({ actor_id: user.id, actor_name: user.email ?? "Unknown", action: "team_invite_sent", details: { team_id: teamId, email, role, delivery_status: delivered ? "sent" : "not_sent" } });
    return apiJson({ invite: inviteRow(inserted.data as Record<string, unknown>), accept_url: acceptUrl, email_sent: delivered }, { status: 201 });
  } catch { return backendUnavailable(); }
}

export async function PATCH(request: NextRequest) {
  const session = await getSession(); if ("response" in session) return session.response;
  const { supabase } = session; const user = session.user!; const body = await bodyOf(request); if (!body) return apiError("A JSON object is required", "INVALID_REQUEST", 400);
  const token = typeof body.token === "string" ? body.token : null; const inviteId = typeof body.invite_id === "string" ? body.invite_id : null; const action = body.action;
  if ((!token && !inviteId) || (action !== "accept" && action !== "decline")) return apiError("token or invite_id and action are required", "INVALID_REQUEST", 400);
  try {
    const lookup = token ? opaqueTokenLookup(token) : { column: "id" as const, value: inviteId! };
    const result = await supabase.from("team_invites").select("*").eq(lookup.column, lookup.value).eq("status", "pending").single();
    if (result.error || !result.data) return result.error?.code === "PGRST116" ? apiError("Invite not found or already processed", "INVITE_NOT_FOUND", 404) : backendUnavailable();
    const invite = result.data;
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) { await supabase.from("team_invites").update({ status: "revoked" }).eq("id", invite.id); return apiError("This invitation has expired", "INVITE_EXPIRED", 410); }
    if (!user.email || invite.email.toLowerCase() !== user.email.toLowerCase()) return apiError("This invitation was sent to a different email address", "FORBIDDEN", 403);
    if (action === "accept") {
      const member = await supabase.from("team_members").insert({ team_id: invite.team_id, user_id: user.id, role: invite.role, invited_by: invite.invited_by });
      if (member.error && member.error.code !== "23505") return backendUnavailable();
    }
    const updated = await supabase.from("team_invites").update({ status: action === "accept" ? "accepted" : "declined" }).eq("id", invite.id).eq("status", "pending").select("id").maybeSingle();
    if (updated.error) return backendUnavailable();
    if (!updated.data) return apiError("Invite was already processed", "INVITE_CONFLICT", 409);
    await supabase.from("activity_log").insert({ actor_id: user.id, actor_name: user.email ?? "Unknown", action: action === "accept" ? "team_invite_accepted" : "team_invite_declined", details: { team_id: invite.team_id, role: invite.role } });
    return apiJson({ ok: true, status: action === "accept" ? "accepted" : "declined" });
  } catch { return backendUnavailable(); }
}

export async function DELETE(request: NextRequest) {
  const session = await getSession(); if ("response" in session) return session.response;
  const { supabase } = session; const user = session.user!; const body = await bodyOf(request); const inviteId = typeof body?.invite_id === "string" ? body.invite_id : null;
  if (!inviteId) return apiError("invite_id is required", "INVALID_REQUEST", 400);
  try {
    const invite = await supabase.from("team_invites").select("team_id").eq("id", inviteId).eq("status", "pending").single();
    if (invite.error || !invite.data) return invite.error?.code === "PGRST116" ? apiError("Invite not found or already processed", "INVITE_NOT_FOUND", 404) : backendUnavailable();
    const check = await requireTeamRole(invite.data.team_id, user.id, "admin"); if (check.status === 503) return backendUnavailable(); if (!check.allowed) return apiError("Forbidden", "FORBIDDEN", 403);
    const revoked = await supabase.from("team_invites").update({ status: "revoked" }).eq("id", inviteId); if (revoked.error) return backendUnavailable();
    return apiJson({ ok: true });
  } catch { return backendUnavailable(); }
}
