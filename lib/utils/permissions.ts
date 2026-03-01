import type { TeamRole, SharePermission } from "@/lib/types/codeliver";

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

const ROLE_PERMISSIONS: Record<TeamRole, Set<Action>> = {
  owner: new Set([
    "project.create", "project.edit", "project.delete", "project.view",
    "asset.upload", "asset.edit", "asset.delete", "asset.view", "asset.download",
    "comment.create", "comment.edit", "comment.resolve", "comment.delete",
    "approval.create", "approval.decide", "approval.edit",
    "share.create", "share.revoke",
    "version.upload", "version.delete",
    "team.manage", "team.invite",
    "webhook.manage",
    "analytics.view",
  ]),
  admin: new Set([
    "project.create", "project.edit", "project.view",
    "asset.upload", "asset.edit", "asset.view", "asset.download",
    "comment.create", "comment.edit", "comment.resolve",
    "approval.create", "approval.decide", "approval.edit",
    "share.create", "share.revoke",
    "version.upload",
    "team.invite",
    "analytics.view",
  ]),
  member: new Set([
    "project.view",
    "asset.upload", "asset.edit", "asset.view", "asset.download",
    "comment.create", "comment.resolve",
    "approval.decide",
    "share.create",
    "version.upload",
  ]),
  viewer: new Set([
    "project.view",
    "asset.view",
    "comment.create",
  ]),
};

const SHARE_PERMISSIONS: Record<SharePermission, Set<Action>> = {
  view: new Set(["asset.view"]),
  comment: new Set(["asset.view", "comment.create"]),
  approve: new Set(["asset.view", "comment.create", "approval.decide"]),
};

export function canPerform(role: TeamRole, action: Action): boolean {
  return ROLE_PERMISSIONS[role]?.has(action) ?? false;
}

export function canPerformAsGuest(permission: SharePermission, action: Action): boolean {
  return SHARE_PERMISSIONS[permission]?.has(action) ?? false;
}

export function isAtLeast(role: TeamRole, minimumRole: TeamRole): boolean {
  const hierarchy: TeamRole[] = ["viewer", "member", "admin", "owner"];
  return hierarchy.indexOf(role) >= hierarchy.indexOf(minimumRole);
}

export function getPermittedActions(role: TeamRole): Action[] {
  return Array.from(ROLE_PERMISSIONS[role] ?? []);
}
