"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Activity,
  Search,
  Filter,
  Calendar,
  Loader2,
  ChevronDown,
  ExternalLink,
} from "lucide-react";

interface Props {
  teamId?: string;
  projectId?: string;
}

interface AuditEntry {
  id: string;
  actor_id: string | null;
  actor_name: string;
  action: string;
  details: Record<string, unknown>;
  project_id: string | null;
  asset_id: string | null;
  created_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  team_created: "Created team",
  team_renamed: "Renamed team",
  team_deleted: "Deleted team",
  team_role_changed: "Changed member role",
  team_member_removed: "Removed member",
  team_invite_sent: "Sent team invite",
  team_invite_accepted: "Accepted team invite",
  team_invite_declined: "Declined team invite",
  webhook_created: "Created webhook",
  approval_notification_sent: "Sent approval notification",
  comment_added: "Added comment",
  comment_resolved: "Resolved comment",
  asset_uploaded: "Uploaded asset",
  version_uploaded: "Uploaded version",
  share_link_created: "Created share link",
  share_link_viewed: "Share link viewed",
};

const ACTION_COLORS: Record<string, string> = {
  team_created: "var(--green)",
  team_deleted: "var(--red)",
  team_member_removed: "var(--red)",
  team_role_changed: "var(--orange)",
  team_invite_sent: "var(--accent)",
  team_invite_accepted: "var(--green)",
  team_invite_declined: "var(--muted)",
  webhook_created: "var(--purple)",
  comment_added: "var(--accent)",
  asset_uploaded: "var(--green)",
};

const ACTION_TYPES = [
  { value: "", label: "All actions" },
  { value: "team_created", label: "Team created" },
  { value: "team_renamed", label: "Team renamed" },
  { value: "team_role_changed", label: "Role changed" },
  { value: "team_member_removed", label: "Member removed" },
  { value: "team_invite_sent", label: "Invite sent" },
  { value: "team_invite_accepted", label: "Invite accepted" },
  { value: "webhook_created", label: "Webhook created" },
  { value: "comment_added", label: "Comment added" },
  { value: "asset_uploaded", label: "Asset uploaded" },
  { value: "version_uploaded", label: "Version uploaded" },
  { value: "share_link_created", label: "Share link created" },
];

export default function AuditLog({ teamId, projectId }: Props) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const limit = 50;

  const buildUrl = useCallback(
    (currentOffset: number) => {
      const params = new URLSearchParams();
      if (teamId) params.set("team_id", teamId);
      if (projectId) params.set("project_id", projectId);
      params.set("limit", limit.toString());
      params.set("offset", currentOffset.toString());
      if (actionFilter) params.set("action", actionFilter);
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      if (search) params.set("q", search);
      return `/api/teams/audit?${params.toString()}`;
    },
    [teamId, projectId, actionFilter, dateFrom, dateTo, search]
  );

  const fetchEntries = useCallback(
    async (reset = true) => {
      const newOffset = reset ? 0 : offset;
      if (reset) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      const res = await fetch(buildUrl(newOffset));
      if (res.ok) {
        const data = await res.json();
        if (reset) {
          setEntries(data.items);
          setOffset(limit);
        } else {
          setEntries((prev) => [...prev, ...data.items]);
          setOffset((prev) => prev + limit);
        }
        setTotal(data.total);
      }

      setLoading(false);
      setLoadingMore(false);
    },
    [buildUrl, offset]
  );

  useEffect(() => {
    fetchEntries(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, projectId, actionFilter, dateFrom, dateTo]);

  function handleSearch() {
    fetchEntries(true);
  }

  function formatAction(entry: AuditEntry): string {
    const base = ACTION_LABELS[entry.action] ?? entry.action.replace(/_/g, " ");
    const details = entry.details;

    if (entry.action === "team_role_changed" && details.new_role) {
      return `${base} to ${details.new_role}`;
    }
    if (entry.action === "team_invite_sent" && details.email) {
      return `${base} to ${details.email}`;
    }
    if (entry.action === "team_renamed" && details.name) {
      return `${base} to "${details.name}"`;
    }

    return base;
  }

  function getActionColor(action: string): string {
    return ACTION_COLORS[action] ?? "var(--muted)";
  }

  function formatTimestamp(ts: string): string {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;

    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
      hour: "numeric",
      minute: "2-digit",
    });
  }

  const hasMore = entries.length < total;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity size={18} className="text-[var(--accent)]" />
          <h3 className="font-semibold text-[var(--ink)]">Audit Log</h3>
          <span className="text-xs text-[var(--dim)]">
            {total} {total === 1 ? "entry" : "entries"}
          </span>
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
            showFilters
              ? "bg-[var(--accent)]/10 text-[var(--accent)]"
              : "text-[var(--muted)] hover:bg-white/5"
          }`}
        >
          <Filter size={13} />
          Filters
          <ChevronDown
            size={12}
            className={`transition-transform ${showFilters ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--dim)]"
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSearch();
          }}
          placeholder="Search audit log..."
          className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg pl-9 pr-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--dim)] outline-none focus:border-[var(--accent)] transition-colors"
        />
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="flex flex-wrap gap-3 mb-4 p-3 bg-[var(--bg)] rounded-lg border border-[var(--border)]">
          {/* Action type */}
          <div>
            <label className="text-xs text-[var(--dim)] mb-1 block">
              Action
            </label>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
            >
              {ACTION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Date from */}
          <div>
            <label className="text-xs text-[var(--dim)] mb-1 block">
              From
            </label>
            <div className="relative">
              <Calendar
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--dim)]"
              />
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="bg-[var(--surface)] border border-[var(--border)] rounded-lg pl-8 pr-3 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
              />
            </div>
          </div>

          {/* Date to */}
          <div>
            <label className="text-xs text-[var(--dim)] mb-1 block">
              To
            </label>
            <div className="relative">
              <Calendar
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--dim)]"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="bg-[var(--surface)] border border-[var(--border)] rounded-lg pl-8 pr-3 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
              />
            </div>
          </div>

          {/* Clear */}
          {(actionFilter || dateFrom || dateTo) && (
            <div className="flex items-end">
              <button
                onClick={() => {
                  setActionFilter("");
                  setDateFrom("");
                  setDateTo("");
                }}
                className="text-xs text-[var(--accent)] hover:underline pb-1.5"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* Entries */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="animate-spin text-[var(--muted)]" />
        </div>
      ) : entries.length === 0 ? (
        <div className="text-sm text-[var(--dim)] text-center py-8">
          No activity found
        </div>
      ) : (
        <div className="space-y-0.5">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-start gap-3 py-2.5 px-3 rounded-lg hover:bg-white/[0.02] group"
            >
              {/* Actor avatar */}
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 mt-0.5"
                style={{
                  backgroundColor: getActionColor(entry.action),
                  opacity: 0.85,
                }}
              >
                {(entry.actor_name || "?").slice(0, 2).toUpperCase()}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-[var(--ink)]">
                  <span className="font-medium">
                    {entry.actor_name || "System"}
                  </span>{" "}
                  <span className="text-[var(--muted)]">
                    {formatAction(entry)}
                  </span>
                </div>
                {/* Entity link */}
                {(entry.project_id || entry.asset_id) && (
                  <div className="flex items-center gap-1 mt-0.5">
                    {entry.asset_id && (
                      <a
                        href={`/projects/${entry.project_id ?? ""}/assets/${entry.asset_id}`}
                        className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1"
                      >
                        View asset
                        <ExternalLink size={10} />
                      </a>
                    )}
                    {entry.project_id && !entry.asset_id && (
                      <a
                        href={`/projects/${entry.project_id}`}
                        className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1"
                      >
                        View project
                        <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* Timestamp */}
              <span className="text-xs text-[var(--dim)] whitespace-nowrap shrink-0">
                {formatTimestamp(entry.created_at)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && !loading && (
        <div className="mt-4 text-center">
          <button
            onClick={() => fetchEntries(false)}
            disabled={loadingMore}
            className="text-sm font-medium text-[var(--accent)] hover:underline disabled:opacity-50 flex items-center gap-2 mx-auto"
          >
            {loadingMore && <Loader2 size={14} className="animate-spin" />}
            Load more ({total - entries.length} remaining)
          </button>
        </div>
      )}
    </div>
  );
}
