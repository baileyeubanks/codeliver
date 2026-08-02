"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  MessageSquare,
  CheckCircle2,
  Upload,
  Eye,
  AtSign,
} from "lucide-react";
import type { Notification, NotificationType } from "@/lib/types/codeliver";

interface NotificationItemProps {
  notification: Notification;
  onMarkRead: (id: string) => Promise<boolean>;
}

const ICON_MAP: Record<NotificationType, React.ReactNode> = {
  comment_added: <MessageSquare size={16} />,
  comment_resolved: <CheckCircle2 size={16} />,
  comment_reply: <MessageSquare size={16} />,
  approval_requested: <CheckCircle2 size={16} />,
  approval_decided: <CheckCircle2 size={16} />,
  asset_uploaded: <Upload size={16} />,
  version_uploaded: <Upload size={16} />,
  share_link_viewed: <Eye size={16} />,
  mention: <AtSign size={16} />,
};

const ICON_COLOR_MAP: Record<NotificationType, string> = {
  comment_added: "text-[var(--accent)]",
  comment_resolved: "text-[var(--green)]",
  comment_reply: "text-[var(--accent)]",
  approval_requested: "text-[var(--orange)]",
  approval_decided: "text-[var(--green)]",
  asset_uploaded: "text-[var(--accent)]",
  version_uploaded: "text-[var(--accent)]",
  share_link_viewed: "text-[var(--muted)]",
  mention: "text-[var(--orange)]",
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function notificationDestination(notification: Notification): string | null {
  const actionUrl = notification.data.action_url;
  if (typeof actionUrl === "string" && actionUrl.length <= 2_048 && actionUrl.startsWith("/")) {
    try {
      const target = new URL(actionUrl, "https://co-videopro.local");
      if (target.origin === "https://co-videopro.local") {
        return `${target.pathname}${target.search}${target.hash}`;
      }
    } catch {
      // Fall through to canonical project context.
    }
  }

  const projectId = notification.data.project_id;
  const assetId = notification.data.asset_id;
  if (typeof projectId !== "string" || !projectId) return null;
  if (typeof assetId === "string" && assetId) {
    return `/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}`;
  }
  return `/projects/${encodeURIComponent(projectId)}`;
}

export default function NotificationItem({
  notification,
  onMarkRead,
}: NotificationItemProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [readError, setReadError] = useState(false);

  async function handleClick() {
    if (pending) return;
    setReadError(false);
    if (!notification.read) {
      setPending(true);
      const persisted = await onMarkRead(notification.id).catch(() => false);
      setPending(false);
      if (!persisted) {
        setReadError(true);
        return;
      }
    }

    const destination = notificationDestination(notification);
    if (destination) router.push(destination);
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={pending}
      aria-busy={pending}
      className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-2)]/50"
    >
      {/* Unread indicator */}
      <div className="flex w-2 shrink-0 items-start pt-2">
        {!notification.read && (
          <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
        )}
      </div>

      {/* Icon */}
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] ${ICON_COLOR_MAP[notification.type]}`}
      >
        {ICON_MAP[notification.type]}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--ink)]">
          {notification.title}
        </p>
        {notification.body && (
          <p className="mt-0.5 line-clamp-2 text-xs text-[var(--muted)]">
            {notification.body}
          </p>
        )}
        <p className="mt-1 text-[11px] text-[var(--dim)]">
          {timeAgo(notification.created_at)}
        </p>
        {readError ? (
          <p className="mt-1 text-[11px] font-medium text-[var(--red)]" role="status">
            Could not mark as read. Try again.
          </p>
        ) : null}
      </div>
    </button>
  );
}
