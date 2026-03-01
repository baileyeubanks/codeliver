"use client";

import { useMemo } from "react";
import { CheckCheck } from "lucide-react";
import { useNotificationStore } from "@/lib/stores/notificationStore";
import NotificationItem from "@/components/notifications/NotificationItem";
import type { Notification } from "@/lib/types/codeliver";

function getDateGroup(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 1
  );

  if (date >= startOfToday) return "Today";
  if (date >= startOfYesterday) return "Yesterday";
  return "Older";
}

interface GroupedNotifications {
  label: string;
  items: Notification[];
}

export default function NotificationList() {
  const { notifications, loading, unreadCount, markRead, markAllRead } =
    useNotificationStore();

  const groups = useMemo<GroupedNotifications[]>(() => {
    const buckets = new Map<string, Notification[]>();
    const order = ["Today", "Yesterday", "Older"];

    for (const n of notifications) {
      const group = getDateGroup(n.created_at);
      const existing = buckets.get(group) ?? [];
      existing.push(n);
      buckets.set(group, existing);
    }

    return order
      .filter((label) => buckets.has(label))
      .map((label) => ({
        label,
        items: buckets.get(label)!,
      }));
  }, [notifications]);

  if (loading) {
    return (
      <div className="p-4">
        <div className="flex items-center justify-between pb-3">
          <div className="h-4 w-24 animate-pulse rounded bg-[var(--surface-2)]" />
          <div className="h-4 w-20 animate-pulse rounded bg-[var(--surface-2)]" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex gap-3 rounded-[var(--radius-sm)] p-3"
            >
              <div className="h-8 w-8 animate-pulse rounded-full bg-[var(--surface-2)]" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-3/4 animate-pulse rounded bg-[var(--surface-2)]" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--surface-2)]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex max-h-96 flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--ink)]">
          Notifications
        </h3>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            className="flex items-center gap-1 text-xs font-medium text-[var(--accent)] transition-colors hover:text-[var(--accent-hover)]"
          >
            <CheckCheck size={14} />
            Mark all read
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-sm text-[var(--dim)]">No notifications</p>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label}>
              <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg)] px-4 py-1.5">
                <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--dim)]">
                  {group.label}
                </span>
              </div>
              {group.items.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkRead={markRead}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
