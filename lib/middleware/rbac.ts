import {
  getSupabase,
  type DataSupabaseClient,
} from "@/lib/supabase";
import { canPerform } from "@/lib/utils/permissions";
import type { TeamRole } from "@/lib/types/codeliver";

export type TeamAuthorityRole =
  | TeamRole
  | "producer"
  | "editor"
  | "reviewer";

type DataClient = DataSupabaseClient;

const TEAM_AUTHORITY_RANK: Record<TeamAuthorityRole, number> = {
  viewer: 10,
  reviewer: 30,
  member: 50,
  editor: 60,
  producer: 70,
  admin: 80,
  owner: 100,
};

function isTeamAuthorityRole(value: unknown): value is TeamAuthorityRole {
  return typeof value === "string" && value in TEAM_AUTHORITY_RANK;
}

function permissionRole(role: TeamAuthorityRole): TeamRole {
  if (role === "producer" || role === "editor") return "member";
  if (role === "reviewer") return "viewer";
  return role;
}

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
  action: Action,
  client?: DataClient,
): Promise<boolean> {
  const role = await getTeamRole(teamId, userId, client);
  return role ? canPerform(permissionRole(role), action) : false;
}

/**
 * Returns the user's role for the given team, or null if they are not a member.
 */
export async function getTeamRole(
  teamId: string,
  userId: string,
  client?: DataClient,
): Promise<TeamAuthorityRole | null> {
  const supabase = client ?? getSupabase();

  const membership = await supabase
    .from("team_members")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .maybeSingle();

  if (membership.error) return null;
  return isTeamAuthorityRole(membership.data?.role)
    ? membership.data.role
    : null;
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
  minimumRole: TeamAuthorityRole,
  client?: DataClient,
): Promise<{ allowed: boolean; role: TeamAuthorityRole | null }> {
  const role = await getTeamRole(teamId, userId, client);

  if (!role) {
    return { allowed: false, role: null };
  }

  return {
    allowed:
      TEAM_AUTHORITY_RANK[role] >= TEAM_AUTHORITY_RANK[minimumRole],
    role,
  };
}
