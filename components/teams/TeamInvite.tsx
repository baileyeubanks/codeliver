"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Mail,
  Send,
  Loader2,
  Clock,
  RotateCcw,
  X,
  ChevronDown,
  UserPlus,
} from "lucide-react";
import type { TeamRole } from "@/lib/types/codeliver";

interface Props {
  teamId: string;
  onInvited: () => void;
}

interface PendingInvite {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  expires_at: string | null;
}

const ROLES: { value: TeamRole; label: string; desc: string }[] = [
  { value: "admin", label: "Admin", desc: "Manage team, projects, and members" },
  { value: "member", label: "Member", desc: "Upload, edit, and comment on assets" },
  { value: "viewer", label: "Viewer", desc: "View assets and leave comments" },
];

export default function TeamInvite({ teamId, onInvited }: Props) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamRole>("member");
  const [roleOpen, setRoleOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(true);

  const fetchInvites = useCallback(async () => {
    setLoadingInvites(true);
    const res = await fetch(`/api/teams/invites?team_id=${teamId}`);
    if (res.ok) {
      const data = await res.json();
      setInvites(data.items ?? []);
    }
    setLoadingInvites(false);
  }, [teamId]);

  useEffect(() => {
    fetchInvites();
  }, [fetchInvites]);

  async function sendInvite() {
    if (!email.trim()) return;
    setError("");
    setSuccess("");
    setSending(true);

    const res = await fetch("/api/teams/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team_id: teamId, email: email.trim(), role }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Failed to send invite");
    } else {
      setSuccess(`Invite sent to ${email.trim()}`);
      setEmail("");
      fetchInvites();
      onInvited();
    }

    setSending(false);
  }

  async function revokeInvite(inviteId: string) {
    const res = await fetch("/api/teams/invites", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invite_id: inviteId }),
    });

    if (res.ok) {
      fetchInvites();
    }
  }

  async function resendInvite(invite: PendingInvite) {
    // Revoke old, create new
    await fetch("/api/teams/invites", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invite_id: invite.id }),
    });

    const res = await fetch("/api/teams/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        team_id: teamId,
        email: invite.email,
        role: invite.role,
      }),
    });

    if (res.ok) {
      setSuccess(`Invite resent to ${invite.email}`);
      fetchInvites();
    }
  }

  const selectedRole = ROLES.find((r) => r.value === role);

  return (
    <div className="space-y-4">
      {/* Invite Form */}
      <div className="flex items-center gap-2 mb-1">
        <UserPlus size={16} className="text-[var(--accent)]" />
        <span className="text-sm font-semibold text-[var(--ink)]">
          Invite a Team Member
        </span>
      </div>

      <div className="flex gap-2">
        {/* Email */}
        <div className="relative flex-1">
          <Mail
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--dim)]"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError("");
              setSuccess("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendInvite();
            }}
            placeholder="name@example.com"
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg pl-9 pr-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--dim)] outline-none focus:border-[var(--accent)] transition-colors"
          />
        </div>

        {/* Role Selector */}
        <div className="relative">
          <button
            onClick={() => setRoleOpen(!roleOpen)}
            className="flex items-center gap-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--ink)] hover:border-[var(--accent)] transition-colors min-w-[120px]"
          >
            <span>{selectedRole?.label ?? "Role"}</span>
            <ChevronDown size={14} className="text-[var(--dim)]" />
          </button>
          {roleOpen && (
            <div className="absolute right-0 top-full mt-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg shadow-xl z-20 py-1 w-56">
              {ROLES.map((r) => (
                <button
                  key={r.value}
                  onClick={() => {
                    setRole(r.value);
                    setRoleOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-white/5 ${
                    role === r.value
                      ? "text-[var(--accent)]"
                      : "text-[var(--ink)]"
                  }`}
                >
                  <div className="font-medium">{r.label}</div>
                  <div className="text-xs text-[var(--dim)]">{r.desc}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Send Button */}
        <button
          onClick={sendInvite}
          disabled={sending || !email.trim()}
          className="bg-[var(--accent)] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {sending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Send size={14} />
          )}
          Send
        </button>
      </div>

      {/* Feedback */}
      {error && (
        <div className="text-sm text-[var(--red)] bg-[var(--red)]/5 border border-[var(--red)]/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
      {success && (
        <div className="text-sm text-[var(--green)] bg-[var(--green)]/5 border border-[var(--green)]/20 rounded-lg px-3 py-2">
          {success}
        </div>
      )}

      {/* Pending Invites */}
      {loadingInvites ? (
        <div className="flex items-center gap-2 text-sm text-[var(--dim)]">
          <Loader2 size={14} className="animate-spin" />
          Loading invites...
        </div>
      ) : invites.length > 0 ? (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Clock size={14} className="text-[var(--orange)]" />
            <span className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
              Pending Invites
            </span>
          </div>
          <div className="space-y-1">
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="flex items-center gap-3 py-2 px-3 rounded-lg bg-[var(--surface)] border border-[var(--border)] group"
              >
                <Mail size={14} className="text-[var(--dim)] shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[var(--ink)] truncate">
                    {invite.email}
                  </div>
                  <div className="text-xs text-[var(--dim)]">
                    Invited{" "}
                    {new Date(invite.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    &middot;{" "}
                    <span className="capitalize">{invite.role}</span>
                  </div>
                </div>
                <span className="text-xs font-medium text-[var(--orange)] bg-[var(--orange)]/10 px-2 py-0.5 rounded-md">
                  Pending
                </span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => resendInvite(invite)}
                    className="p-1.5 text-[var(--muted)] hover:text-[var(--ink)] hover:bg-white/5 rounded-lg transition-colors"
                    title="Resend"
                  >
                    <RotateCcw size={13} />
                  </button>
                  <button
                    onClick={() => revokeInvite(invite.id)}
                    className="p-1.5 text-[var(--muted)] hover:text-[var(--red)] hover:bg-[var(--red)]/5 rounded-lg transition-colors"
                    title="Revoke"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
