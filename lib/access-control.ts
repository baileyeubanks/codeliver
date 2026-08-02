import { getSupabaseDataSchema } from "@/lib/data-authority";
import {
  getSupabase,
  type DataSupabaseClient,
} from "@/lib/supabase";
import {
  projectTenantAuthority,
  type TenantAuthority,
} from "@/lib/tenant-authority";

export {
  projectTenantAuthority,
  tenantAuthorityKey,
} from "@/lib/tenant-authority";
export type {
  TenantAuthority,
  TenantAuthorityKind,
} from "@/lib/tenant-authority";

type DataClient = DataSupabaseClient;

const ACCESS_LOOKUP_ERROR = "Access lookup failed";

type AccessFailure = {
  ok: false;
  status: number;
  error: string;
};

type AccessSuccess<T> = {
  ok: true;
  data: T;
};

export type AccessResult<T> = AccessFailure | AccessSuccess<T>;

export type ProjectAccessRole =
  | "viewer"
  | "reviewer"
  | "member"
  | "editor"
  | "producer"
  | "admin"
  | "owner";

export const PROJECT_ROLE_RANK: Record<ProjectAccessRole, number> = {
  viewer: 10,
  reviewer: 30,
  member: 50,
  editor: 60,
  producer: 70,
  admin: 80,
  owner: 100,
};

export interface OwnedProject {
  id: string;
  name: string;
  owner_id: string;
}

export interface AccessibleProject extends OwnedProject {
  team_id: string | null;
  tenant_authority: TenantAuthority;
  access_role: ProjectAccessRole;
  access_rank: number;
}

export interface OwnedAsset {
  id: string;
  project_id: string;
  title: string;
  file_type: string;
  file_url: string | null;
  status: string;
  duration_seconds: number | null;
}

export interface AccessibleAsset extends OwnedAsset {
  tenant_authority: TenantAuthority;
  access_role: ProjectAccessRole;
  access_rank: number;
}

export interface OwnedWorkflow {
  id: string;
  asset_id: string;
  version_id: string | null;
  mode: string;
  status: string;
}

export interface OwnedReviewInvite {
  id: string;
  asset_id: string;
  version_id: string | null;
  token?: string;
  permissions: string;
  reviewer_email: string | null;
  reviewer_name: string | null;
}

export interface AccessibleReviewInvite extends OwnedReviewInvite {
  access_role: ProjectAccessRole;
  access_rank: number;
}

export interface AssetCommentRecord {
  id: string;
  asset_id: string;
  version_id: string | null;
  parent_id: string | null;
  timecode_seconds: number | null;
  review_invite_id: string | null;
  visibility: "internal" | "external";
}

function db(client?: DataClient) {
  return client ?? getSupabase();
}

function roleRank(value: unknown) {
  return typeof value === "string" && value in PROJECT_ROLE_RANK
    ? PROJECT_ROLE_RANK[value as ProjectAccessRole]
    : 0;
}

function highestRole(roles: unknown[]): ProjectAccessRole | null {
  return roles.reduce<ProjectAccessRole | null>((highest, role) => {
    if (roleRank(role) <= roleRank(highest)) return highest;
    return role as ProjectAccessRole;
  }, null);
}

export async function getProjectAccess(
  projectId: string,
  userId: string,
  minimumRole: ProjectAccessRole = "viewer",
  client?: DataClient,
): Promise<AccessResult<AccessibleProject>> {
  const database = db(client);
  if (getSupabaseDataSchema() === "public") {
    const { data, error } = await database
      .from("projects")
      .select("id, name, owner_id")
      .eq("id", projectId)
      .eq("owner_id", userId)
      .maybeSingle();
    if (error) return { ok: false, status: 503, error: ACCESS_LOOKUP_ERROR };
    if (!data) return { ok: false, status: 404, error: "Project not found" };
    return {
      ok: true,
      data: {
        ...data,
        team_id: null,
        tenant_authority: projectTenantAuthority({
          owner_id: data.owner_id,
          team_id: null,
        }),
        access_role: "owner",
        access_rank: PROJECT_ROLE_RANK.owner,
      },
    };
  }

  const { data: project, error: projectError } = await database
    .from("projects")
    .select("id, name, owner_id, team_id")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) {
    return { ok: false, status: 503, error: ACCESS_LOOKUP_ERROR };
  }
  if (!project) return { ok: false, status: 404, error: "Project not found" };

  const roles: unknown[] = [];
  if (project.owner_id === userId) roles.push("owner");

  const member = await database
    .from("project_members")
    .select("role, expires_at")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (member.error) {
    return { ok: false, status: 503, error: ACCESS_LOOKUP_ERROR };
  }
  if (
    member.data &&
    (!member.data.expires_at || new Date(member.data.expires_at) > new Date())
  ) {
    roles.push(member.data.role);
  }

  if (project.team_id) {
    const [team, teamMember] = await Promise.all([
      database
        .from("teams")
        .select("owner_id")
        .eq("id", project.team_id)
        .maybeSingle(),
      database
        .from("team_members")
        .select("role")
        .eq("team_id", project.team_id)
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
    if (team.error || teamMember.error) {
      return {
        ok: false,
        status: 503,
        error: ACCESS_LOOKUP_ERROR,
      };
    }
    if (team.data?.owner_id === userId) roles.push("owner");
    if (teamMember.data?.role) roles.push(teamMember.data.role);
  }

  const accessRole = highestRole(roles);
  const accessRank = roleRank(accessRole);
  if (!accessRole || accessRank < PROJECT_ROLE_RANK[minimumRole]) {
    return { ok: false, status: 404, error: "Project not found" };
  }
  return {
    ok: true,
    data: {
      id: project.id,
      name: project.name,
      owner_id: project.owner_id,
      team_id: project.team_id,
      tenant_authority: projectTenantAuthority(project),
      access_role: accessRole,
      access_rank: accessRank,
    },
  };
}

export async function getAssetAccess(
  assetId: string,
  userId: string,
  minimumRole: ProjectAccessRole = "viewer",
  client?: DataClient,
): Promise<AccessResult<AccessibleAsset>> {
  const { data, error } = await db(client)
    .from("assets")
    .select("id, project_id, title, file_type, file_url, status, duration_seconds")
    .eq("id", assetId)
    .maybeSingle();
  if (error) return { ok: false, status: 503, error: ACCESS_LOOKUP_ERROR };
  if (!data) return { ok: false, status: 404, error: "Asset not found" };

  const projectAccess = await getProjectAccess(
    data.project_id,
    userId,
    minimumRole,
    client,
  );
  if (!projectAccess.ok) return projectAccess;
  return {
    ok: true,
    data: {
      ...data,
      tenant_authority: projectAccess.data.tenant_authority,
      access_role: projectAccess.data.access_role,
      access_rank: projectAccess.data.access_rank,
    },
  };
}

export async function getOwnedProject(
  projectId: string,
  userId: string,
  client?: DataClient,
): Promise<AccessResult<OwnedProject>> {
  const access = await getProjectAccess(projectId, userId, "owner", client);
  if (!access.ok) return access;
  return {
    ok: true,
    data: {
      id: access.data.id,
      name: access.data.name,
      owner_id: access.data.owner_id,
    },
  };
}

export async function getOwnedAsset(
  assetId: string,
  userId: string,
  client?: DataClient,
): Promise<AccessResult<OwnedAsset>> {
  const access = await getAssetAccess(assetId, userId, "owner", client);
  if (!access.ok) return access;
  return {
    ok: true,
    data: {
      id: access.data.id,
      project_id: access.data.project_id,
      title: access.data.title,
      file_type: access.data.file_type,
      file_url: access.data.file_url,
      status: access.data.status,
      duration_seconds: access.data.duration_seconds,
    },
  };
}

export async function getOwnedWorkflow(
  workflowId: string,
  userId: string,
  client?: DataClient,
): Promise<AccessResult<OwnedWorkflow>> {
  const { data, error } = await db(client)
    .from("approval_workflows")
    .select("id, asset_id, version_id, mode, status")
    .eq("id", workflowId)
    .maybeSingle();

  if (error) {
    return { ok: false, status: 503, error: ACCESS_LOOKUP_ERROR };
  }

  if (!data) {
    return { ok: false, status: 404, error: "Approval workflow not found" };
  }

  const assetAccess = await getOwnedAsset(data.asset_id, userId, client);
  if (!assetAccess.ok) {
    return assetAccess;
  }

  return { ok: true, data };
}

export async function getOwnedReviewInvite(
  inviteId: string,
  userId: string,
  client?: DataClient,
): Promise<AccessResult<OwnedReviewInvite>> {
  const access = await getReviewInviteAccess(inviteId, userId, "owner", client);
  if (!access.ok) return access;
  return {
    ok: true,
    data: {
      id: access.data.id,
      asset_id: access.data.asset_id,
      version_id: access.data.version_id,
      permissions: access.data.permissions,
      reviewer_email: access.data.reviewer_email,
      reviewer_name: access.data.reviewer_name,
    },
  };
}

export async function getReviewInviteAccess(
  inviteId: string,
  userId: string,
  minimumRole: ProjectAccessRole = "member",
  client?: DataClient,
): Promise<AccessResult<AccessibleReviewInvite>> {
  const { data, error } = await db(client)
    .from("review_invites")
    .select("id, asset_id, version_id, permissions, reviewer_email, reviewer_name")
    .eq("id", inviteId)
    .maybeSingle();

  if (error) {
    return { ok: false, status: 503, error: ACCESS_LOOKUP_ERROR };
  }

  if (!data) {
    return { ok: false, status: 404, error: "Review invite not found" };
  }

  const assetAccess = await getAssetAccess(
    data.asset_id,
    userId,
    minimumRole,
    client,
  );
  if (!assetAccess.ok) {
    return assetAccess;
  }

  return {
    ok: true,
    data: {
      ...data,
      access_role: assetAccess.data.access_role,
      access_rank: assetAccess.data.access_rank,
    },
  };
}

export async function getAssetComment(
  commentId: string,
  assetId: string,
  client?: DataClient,
): Promise<AccessResult<AssetCommentRecord>> {
  const { data, error } = await db(client)
    .from("comments")
    .select("id, asset_id, version_id, parent_id, timecode_seconds, review_invite_id, visibility")
    .eq("id", commentId)
    .eq("asset_id", assetId)
    .maybeSingle();

  if (error) {
    return { ok: false, status: 503, error: ACCESS_LOOKUP_ERROR };
  }

  if (!data) {
    return { ok: false, status: 404, error: "Comment not found" };
  }

  return {
    ok: true,
    data: data as AssetCommentRecord,
  };
}
