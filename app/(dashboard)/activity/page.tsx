"use client";

import { useEffect, useState } from "react";
import {
  MessageSquare,
  CheckCircle2,
  Upload,
  FolderOpen,
  AlertTriangle,
  Clock,
} from "lucide-react";

interface ActivityItem {
  id: string;
  action: string;
  actor_name: string;
  details: Record<string, string>;
  created_at: string;
  project_id: string;
  asset_id: string | null;
}

function actionIcon(action: string) {
  if (action.includes("comment")) return <MessageSquare size={14} className="text-[var(--accent)]" />;
  if (action.includes("approved")) return <CheckCircle2 size={14} className="text-[var(--green)]" />;
  if (action.includes("upload") || action.includes("created")) return <Upload size={14} className="text-[var(--purple)]" />;
  if (action.includes("change") || action.includes("reject")) return <AlertTriangle size={14} className="text-[var(--orange)]" />;
  return <Clock size={14} className="text-[var(--dim)]" />;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  if (hrs < 48) return "yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ActivityPage() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/activity")
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold tracking-tight mb-1">Activity</h1>
      <p className="text-sm text-[var(--muted)] mb-6">Recent activity across all projects</p>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton h-16 rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <Clock size={32} className="mx-auto mb-3 text-[var(--dim)]" />
          <p className="text-[var(--muted)]">No activity yet</p>
        </div>
      ) : (
        <div className="space-y-1">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-start gap-4 py-3 border-b border-[var(--border)]/50"
            >
              <div className="mt-0.5 w-7 h-7 rounded-full bg-[var(--surface)] flex items-center justify-center flex-shrink-0">
                {actionIcon(item.action)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm">
                  <span className="font-medium">{item.actor_name || "Someone"}</span>{" "}
                  <span className="text-[var(--muted)]">{item.action.replace(/_/g, " ")}</span>
                  {item.details?.asset_title && (
                    <span className="text-[var(--ink)]"> on {item.details.asset_title}</span>
                  )}
                </p>
                {item.details?.body && (
                  <p className="text-xs text-[var(--dim)] mt-0.5 truncate">
                    &ldquo;{item.details.body}&rdquo;
                  </p>
                )}
              </div>
              <span className="text-xs text-[var(--dim)] flex-shrink-0">
                {formatDate(item.created_at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
