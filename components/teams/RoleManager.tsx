"use client";

import { Shield, Check, X as XIcon } from "lucide-react";
import type { TeamRole } from "@/lib/types/codeliver";
import { canPerform } from "@/lib/utils/permissions";

interface Props {
  currentRole: TeamRole;
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

interface ActionCategory {
  label: string;
  actions: { action: Action; label: string }[];
}

const CATEGORIES: ActionCategory[] = [
  {
    label: "Project",
    actions: [
      { action: "project.create", label: "Create" },
      { action: "project.edit", label: "Edit" },
      { action: "project.delete", label: "Delete" },
      { action: "project.view", label: "View" },
    ],
  },
  {
    label: "Asset",
    actions: [
      { action: "asset.upload", label: "Upload" },
      { action: "asset.edit", label: "Edit" },
      { action: "asset.delete", label: "Delete" },
      { action: "asset.view", label: "View" },
      { action: "asset.download", label: "Download" },
    ],
  },
  {
    label: "Comment",
    actions: [
      { action: "comment.create", label: "Create" },
      { action: "comment.edit", label: "Edit" },
      { action: "comment.resolve", label: "Resolve" },
      { action: "comment.delete", label: "Delete" },
    ],
  },
  {
    label: "Approval",
    actions: [
      { action: "approval.create", label: "Create" },
      { action: "approval.decide", label: "Decide" },
      { action: "approval.edit", label: "Edit" },
    ],
  },
  {
    label: "Share",
    actions: [
      { action: "share.create", label: "Create Link" },
      { action: "share.revoke", label: "Revoke Link" },
    ],
  },
  {
    label: "Version",
    actions: [
      { action: "version.upload", label: "Upload" },
      { action: "version.delete", label: "Delete" },
    ],
  },
  {
    label: "Team",
    actions: [
      { action: "team.manage", label: "Manage" },
      { action: "team.invite", label: "Invite" },
      { action: "webhook.manage", label: "Webhooks" },
    ],
  },
  {
    label: "Analytics",
    actions: [{ action: "analytics.view", label: "View" }],
  },
];

const ROLES: TeamRole[] = ["owner", "admin", "member", "viewer"];

const ROLE_LABELS: Record<TeamRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

const ROLE_COLORS: Record<TeamRole, string> = {
  owner: "var(--purple)",
  admin: "var(--accent)",
  member: "var(--green)",
  viewer: "var(--muted)",
};

export default function RoleManager({ currentRole }: Props) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Shield size={18} className="text-[var(--accent)]" />
        <h3 className="font-semibold text-[var(--ink)]">Permission Matrix</h3>
        <span
          className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-md"
          style={{
            color: ROLE_COLORS[currentRole],
            backgroundColor: `color-mix(in srgb, ${ROLE_COLORS[currentRole]} 12%, transparent)`,
          }}
        >
          Your role: {ROLE_LABELS[currentRole]}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wider pb-3 pr-4 w-40">
                Permission
              </th>
              {ROLES.map((role) => (
                <th
                  key={role}
                  className="text-center pb-3 px-2"
                  style={{
                    minWidth: 80,
                  }}
                >
                  <span
                    className={`text-xs font-semibold px-2 py-1 rounded-md ${
                      role === currentRole
                        ? "ring-2 ring-offset-1"
                        : ""
                    }`}
                    style={{
                      color: ROLE_COLORS[role],
                      backgroundColor: `color-mix(in srgb, ${ROLE_COLORS[role]} 12%, transparent)`,
                      // offset for ring
                      ...(role === currentRole
                        ? ({
                            "--tw-ring-offset-color": "var(--surface)",
                            boxShadow: `0 0 0 2px var(--surface), 0 0 0 4px ${ROLE_COLORS[role]}`,
                          } as React.CSSProperties)
                        : {}),
                    }}
                  >
                    {ROLE_LABELS[role]}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((category) => (
              <>
                {/* Category header */}
                <tr key={`cat-${category.label}`}>
                  <td
                    colSpan={5}
                    className="text-xs font-bold text-[var(--muted)] uppercase tracking-widest pt-4 pb-2 border-t border-[var(--border)]"
                  >
                    {category.label}
                  </td>
                </tr>
                {/* Action rows */}
                {category.actions.map((item) => (
                  <tr
                    key={item.action}
                    className="hover:bg-white/[0.02]"
                  >
                    <td className="py-1.5 pr-4 text-[var(--ink)]">
                      {item.label}
                    </td>
                    {ROLES.map((role) => {
                      const allowed = canPerform(role, item.action);
                      const isCurrent = role === currentRole;
                      return (
                        <td
                          key={`${item.action}-${role}`}
                          className="text-center py-1.5 px-2"
                          style={
                            isCurrent
                              ? {
                                  backgroundColor: `color-mix(in srgb, ${ROLE_COLORS[currentRole]} 5%, transparent)`,
                                }
                              : undefined
                          }
                        >
                          {allowed ? (
                            <Check
                              size={15}
                              className="inline-block"
                              style={{ color: "var(--green)" }}
                            />
                          ) : (
                            <XIcon
                              size={15}
                              className="inline-block"
                              style={{ color: "var(--dim)", opacity: 0.4 }}
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
