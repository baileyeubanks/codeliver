"use client";

import {
  MessageSquare,
  Eye,
  Download,
  Share2,
  Upload,
  Clock,
} from "lucide-react";

interface ActivityEntry {
  id: string;
  action: string;
  actor_name: string;
  created_at: string;
}

interface ActivityPanelProps {
  entries: ActivityEntry[];
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function getDateGroup(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "Today";
  if (days < 7) return `${days} day${days > 1 ? "s" : ""} ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) > 1 ? "s" : ""} ago`;
  return `${Math.floor(days / 30)} month${Math.floor(days / 30) > 1 ? "s" : ""} ago`;
}

function actionIcon(action: string) {
  if (action.includes("comment")) return <MessageSquare size={13} />;
  if (action.includes("view")) return <Eye size={13} />;
  if (action.includes("download")) return <Download size={13} />;
  if (action.includes("share")) return <Share2 size={13} />;
  if (action.includes("upload")) return <Upload size={13} />;
  return <Clock size={13} />;
}

function actionText(action: string) {
  if (action.includes("comment")) return "made a comment";
  if (action.includes("view")) return "viewed this media";
  if (action.includes("download")) return "downloaded this media item";
  if (action.includes("share")) return "included this media in a share";
  if (action.includes("upload")) return "uploaded this media";
  return action.replace(/_/g, " ");
}

export default function ActivityPanel({ entries }: ActivityPanelProps) {
  if (entries.length === 0) {
    return (
      <div className="empty-state" style={{ padding: "32px 0" }}>
        <div className="empty-state-icon">
          <Clock size={20} />
        </div>
        <p className="empty-state-text">No activity yet</p>
      </div>
    );
  }

  // Group by date
  const groups: { label: string; items: ActivityEntry[] }[] = [];
  let currentGroup = "";

  for (const entry of entries) {
    const group = getDateGroup(entry.created_at);
    if (group !== currentGroup) {
      groups.push({ label: group, items: [] });
      currentGroup = group;
    }
    groups[groups.length - 1].items.push(entry);
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="kicker mb-2">{group.label}</p>
          <div className="space-y-1">
            {group.items.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-3 py-2 px-2 rounded-lg hover:bg-[var(--surface-hover)] transition-colors"
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: "var(--surface-2)", color: "var(--muted)" }}
                >
                  {actionIcon(entry.action)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs">
                    <span className="font-semibold">{entry.actor_name}</span>{" "}
                    <span className="text-[var(--muted)]">{actionText(entry.action)}</span>
                  </p>
                  <p className="text-xs text-[var(--dim)] mt-0.5">{timeAgo(entry.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
