"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Settings,
  Pencil,
  Check,
  X,
  ChevronDown,
  UserMinus,
  ShieldCheck,
  ShieldAlert,
  Eye,
  Users,
  Trash2,
  Loader2,
} from "lucide-react";
import type { TeamRole, Team, TeamMember } from "@/lib/types/codeliver";
import TeamInvite from "./TeamInvite";

interface TeamWithRole extends Team {
  currentRole: TeamRole;
}

interface Props {
  teamId: string;
}

const ROLE_COLORS: Record<TeamRole, string> = {
  owner: "var(--purple)",
  admin: "var(--accent)",
  member: "var(--green)",
  viewer: "var(--muted)",
};

const ROLE_LABELS: Record<TeamRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

export default function TeamSettings({ teamId }: Props) {
  const [team, setTeam] = useState<TeamWithRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [actionMenu, setActionMenu] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchTeam = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/teams?team_id=${teamId}`);
    if (res.ok) {
      const data = await res.json();
      setTeam(data);
      setNameValue(data.name);
    }
    setLoading(false);
  }, [teamId]);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  async function saveName() {
    if (!nameValue.trim() || nameValue === team?.name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    const res = await fetch("/api/teams", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team_id: teamId, name: nameValue.trim() }),
    });
    if (res.ok) {
      await fetchTeam();
    }
    setSavingName(false);
    setEditingName(false);
  }

  async function changeRole(userId: string, role: TeamRole) {
    await fetch("/api/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        team_id: teamId,
        action: "change_role",
        user_id: userId,
        role,
      }),
    });
    setActionMenu(null);
    await fetchTeam();
  }

  async function removeMember(userId: string) {
    await fetch("/api/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        team_id: teamId,
        action: "remove",
        user_id: userId,
      }),
    });
    setActionMenu(null);
    await fetchTeam();
  }

  async function deleteTeam() {
    setDeleting(true);
    const res = await fetch("/api/teams", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team_id: teamId }),
    });
    if (res.ok) {
      window.location.href = "/dashboard";
    }
    setDeleting(false);
  }

  const isAdmin =
    team?.currentRole === "owner" || team?.currentRole === "admin";
  const isOwner = team?.currentRole === "owner";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="animate-spin text-[var(--muted)]" />
      </div>
    );
  }

  if (!team) {
    return (
      <div className="text-[var(--muted)] text-sm py-8 text-center">
        Team not found
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
        <div className="flex items-center gap-3 mb-1">
          <Settings size={18} className="text-[var(--accent)]" />
          <h2 className="font-semibold text-[var(--ink)]">Team Settings</h2>
        </div>

        {/* Team Name */}
        <div className="mt-4">
          <label className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2 block">
            Team Name
          </label>
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveName();
                  if (e.key === "Escape") {
                    setEditingName(false);
                    setNameValue(team.name);
                  }
                }}
                autoFocus
                className="flex-1 bg-[var(--bg)] border border-[var(--accent)] rounded-lg px-3 py-2 text-sm text-[var(--ink)] outline-none"
              />
              <button
                onClick={saveName}
                disabled={savingName}
                className="p-2 text-[var(--green)] hover:bg-[var(--green)]/10 rounded-lg transition-colors"
              >
                {savingName ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Check size={16} />
                )}
              </button>
              <button
                onClick={() => {
                  setEditingName(false);
                  setNameValue(team.name);
                }}
                className="p-2 text-[var(--muted)] hover:bg-white/5 rounded-lg transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[var(--ink)] font-medium">{team.name}</span>
              {isAdmin && (
                <button
                  onClick={() => setEditingName(true)}
                  className="p-1.5 text-[var(--muted)] hover:text-[var(--ink)] hover:bg-white/5 rounded-lg transition-colors"
                >
                  <Pencil size={14} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Members */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-[var(--accent)]" />
            <h3 className="font-semibold text-[var(--ink)]">
              Members ({team.members?.length ?? 0})
            </h3>
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowInvite(!showInvite)}
              className="text-xs font-semibold bg-[var(--accent)] text-white px-3 py-1.5 rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
            >
              Invite Member
            </button>
          )}
        </div>

        {showInvite && (
          <div className="mb-4 p-4 bg-[var(--bg)] rounded-xl border border-[var(--border)]">
            <TeamInvite
              teamId={teamId}
              onInvited={() => {
                setShowInvite(false);
                fetchTeam();
              }}
            />
          </div>
        )}

        <div className="space-y-1">
          {(team.members ?? []).map((member: TeamMember) => (
            <div
              key={member.id}
              className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-white/[0.03] group"
            >
              {/* Avatar */}
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                style={{
                  backgroundColor: ROLE_COLORS[member.role],
                  opacity: 0.9,
                }}
              >
                {member.user_id.slice(0, 2).toUpperCase()}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-[var(--ink)] truncate">
                  {member.user_id}
                </div>
                <div className="text-xs text-[var(--dim)]">
                  Joined{" "}
                  {new Date(member.joined_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </div>
              </div>

              {/* Role Badge */}
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-md"
                style={{
                  color: ROLE_COLORS[member.role],
                  backgroundColor: `color-mix(in srgb, ${ROLE_COLORS[member.role]} 12%, transparent)`,
                }}
              >
                {ROLE_LABELS[member.role]}
              </span>

              {/* Actions */}
              {isAdmin && member.role !== "owner" && (
                <div className="relative">
                  <button
                    onClick={() =>
                      setActionMenu(
                        actionMenu === member.id ? null : member.id
                      )
                    }
                    className="p-1.5 text-[var(--dim)] hover:text-[var(--ink)] hover:bg-white/5 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <ChevronDown size={14} />
                  </button>

                  {actionMenu === member.id && (
                    <div className="absolute right-0 top-full mt-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg shadow-xl z-20 py-1 w-44">
                      {isOwner && member.role !== "admin" && (
                        <button
                          onClick={() => changeRole(member.user_id, "admin")}
                          className="w-full text-left px-3 py-2 text-sm text-[var(--ink)] hover:bg-white/5 flex items-center gap-2"
                        >
                          <ShieldCheck size={14} className="text-[var(--accent)]" />
                          Make Admin
                        </button>
                      )}
                      {member.role !== "member" && (
                        <button
                          onClick={() => changeRole(member.user_id, "member")}
                          className="w-full text-left px-3 py-2 text-sm text-[var(--ink)] hover:bg-white/5 flex items-center gap-2"
                        >
                          <Users size={14} className="text-[var(--green)]" />
                          Set as Member
                        </button>
                      )}
                      {member.role !== "viewer" && (
                        <button
                          onClick={() => changeRole(member.user_id, "viewer")}
                          className="w-full text-left px-3 py-2 text-sm text-[var(--ink)] hover:bg-white/5 flex items-center gap-2"
                        >
                          <Eye size={14} className="text-[var(--muted)]" />
                          Set as Viewer
                        </button>
                      )}
                      <div className="border-t border-[var(--border)] my-1" />
                      <button
                        onClick={() => removeMember(member.user_id)}
                        className="w-full text-left px-3 py-2 text-sm text-[var(--red)] hover:bg-[var(--red)]/5 flex items-center gap-2"
                      >
                        <UserMinus size={14} />
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Danger Zone */}
      {isOwner && (
        <div className="bg-[var(--surface)] border border-[var(--red)]/20 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert size={18} className="text-[var(--red)]" />
            <h3 className="font-semibold text-[var(--red)]">Danger Zone</h3>
          </div>
          <p className="text-sm text-[var(--muted)] mb-4">
            Deleting this team is permanent. All members will lose access, and
            pending invites will be cancelled.
          </p>
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-sm font-semibold text-[var(--red)] border border-[var(--red)]/30 px-4 py-2 rounded-lg hover:bg-[var(--red)]/10 transition-colors"
            >
              Delete Team
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-sm text-[var(--red)]">
                Are you sure? This cannot be undone.
              </span>
              <button
                onClick={deleteTeam}
                disabled={deleting}
                className="text-sm font-semibold bg-[var(--red)] text-white px-4 py-2 rounded-lg hover:bg-[var(--red)]/80 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {deleting && <Loader2 size={14} className="animate-spin" />}
                <Trash2 size={14} />
                Confirm Delete
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-sm text-[var(--muted)] hover:text-[var(--ink)] px-3 py-2 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
