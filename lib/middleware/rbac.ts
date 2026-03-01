import { getSupabase } from "@/lib/supabase";
import { canPerform, isAtLeast } from "@/lib/utils/permissions";
import type { TeamRole } from "@/lib/types/codeliver";

type Action =
  | "project.create"
  | "project.edit"
  | "project.delete"
  | "project.view"
  | "asset.upload"
  | "asset.edit"
  | "asset.delete"
  | "asset.view"
  | "asset.download"
  | "comment.create"
  | "comment.edit"
  | "comment.resolve"
  | "comment.delete"
  | "approval.create"
  | "approval.decide"
  | "approval.edit"
  | "share.create"
  | "share.revoke"
  | "version.upload"
  | "version.delete"
  | "team.manage"
  | "team.invite"
  | "webhook.manage"
  | "analytics.view";

/**
 * Check whether a user has a specific permission within a team.
 * Looks up the user's role in team_members and delegates to canPerform().
 */
export async function checkTeamPermission(
  teamId: string,
  userId: string,
  action: Action
): Promise<boolean> {
  const supabase = getSupabase();

  const { data: membership, error } = await supabase
    .from("team_members")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .single();

  if (error || !membership) {
    return false;
  }

  return canPerform(membership.role as TeamRole, action);
}

/**
 * Returns the user's role for the given team, or null if they are not a member.
 */
export async function getTeamRole(
  teamId: string,
  userId: string
): Promise<TeamRole | null> {
  const supabase = getSupabase();

  const { data: membership, error } = await supabase
    .from("team_members")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .single();

  if (error || !membership) {
    return null;
  }

  return membership.role as TeamRole;
}

/**
 * Middleware-style function that checks whether the authenticated user
 * has at least the given role within a team.
 *
 * Returns { allowed: true, role } on success, or { allowed: false, role: null } on failure.
 * Use with requireAuth() in API routes:
 *
 * ```ts
 * const user = await requireAuth();
 * const check = await requireTeamRole(teamId, user.id, "admin");
 * if (!check.allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
 * ```
 */
export async function requireTeamRole(
  teamId: string,
  userId: string,
  minimumRole: TeamRole
): Promise<{ allowed: boolean; role: TeamRole | null }> {
  const role = await getTeamRole(teamId, userId);

  if (!role) {
    return { allowed: false, role: null };
  }

  return {
    allowed: isAtLeast(role, minimumRole),
    role,
  };
}
