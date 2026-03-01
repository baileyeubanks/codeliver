"use client";

import {
  Upload,
  MessageSquare,
  CheckCircle2,
  Edit,
  Share,
  Clock,
} from "lucide-react";

interface TimelineEvent {
  id: string;
  action: string;
  actor_name: string;
  created_at: string;
  details?: Record<string, unknown>;
}

interface AssetTimelineProps {
  assetId: string;
  events: TimelineEvent[];
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  upload: <Upload size={14} />,
  comment: <MessageSquare size={14} />,
  approve: <CheckCircle2 size={14} />,
  edit: <Edit size={14} />,
  share: <Share size={14} />,
};

const ACTION_COLORS: Record<string, string> = {
  upload: "var(--accent)",
  comment: "var(--orange)",
  approve: "var(--green)",
  edit: "var(--purple)",
  share: "var(--muted)",
};

function actionLabel(action: string): string {
  switch (action) {
    case "upload":
      return "uploaded a new version";
    case "comment":
      return "left a comment";
    case "approve":
      return "approved the asset";
    case "edit":
      return "made changes";
    case "share":
      return "shared a review link";
    default:
      return action;
  }
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;

  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export default function AssetTimeline({
  assetId: _assetId,
  events,
}: AssetTimelineProps) {
  // Sort newest first
  const sorted = [...events].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  if (sorted.length === 0) {
    return (
      <p className="text-sm text-[var(--dim)] py-4">No activity yet.</p>
    );
  }

  return (
    <div className="max-h-[480px] overflow-y-auto pr-1">
      <div className="flex flex-col">
        {sorted.map((event, i) => {
          const color = ACTION_COLORS[event.action] || "var(--dim)";
          const icon = ACTION_ICONS[event.action] || <Clock size={14} />;
          const isLast = i === sorted.length - 1;

          return (
            <div key={event.id} className="flex gap-3">
              {/* Dot + Line */}
              <div className="flex flex-col items-center">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
                    color,
                  }}
                >
                  {icon}
                </div>
                {!isLast && (
                  <div
                    className="w-px flex-1 min-h-[24px]"
                    style={{ backgroundColor: "var(--border)" }}
                  />
                )}
              </div>

              {/* Content */}
              <div className="pb-5 -mt-0.5 min-w-0">
                <p className="text-sm text-[var(--ink)]">
                  <span className="font-medium">{event.actor_name}</span>{" "}
                  <span className="text-[var(--muted)]">
                    {actionLabel(event.action)}
                  </span>
                </p>
                {event.details && Object.keys(event.details).length > 0 && (
                  <p className="text-xs text-[var(--dim)] mt-0.5 truncate">
                    {Object.entries(event.details)
                      .map(([k, v]) => `${k}: ${String(v)}`)
                      .join(" | ")}
                  </p>
                )}
                <p className="text-[11px] text-[var(--dim)] mt-1">
                  {relativeTime(event.created_at)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
