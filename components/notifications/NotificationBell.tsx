"use client";

import { useCallback, useEffect, useId, useMemo, useRef } from "react";
import { Bell } from "lucide-react";
import { useNotificationStore } from "@/lib/stores/notificationStore";
import { useRealtimeNotifications } from "@/lib/hooks/useRealtimeNotifications";
import NotificationList from "@/components/notifications/NotificationList";
import NotificationItem from "@/components/notifications/NotificationItem";
import type { Notification } from "@/lib/types/codeliver";

interface NotificationBellProps {
  projectId?: string;
  wrapperClassName?: string;
  buttonClassName?: string;
  panelClassName?: string;
  onOpenChange?: (open: boolean) => void;
}

function joinClasses(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

function belongsToProject(notification: Notification, projectId: string) {
  return notification.data.project_id === projectId;
}

function ProjectNotificationList({
  notifications,
  loading,
}: {
  notifications: Notification[];
  loading: boolean;
}) {
  const markRead = useNotificationStore((state) => state.markRead);

  return (
    <div className="flex max-h-96 flex-col">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--ink)]">Project notifications</h3>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading && notifications.length === 0 ? (
          <div className="space-y-2 p-4" aria-label="Loading project notifications">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-14 animate-pulse rounded-[var(--radius-sm)] bg-[var(--surface-2)]" />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex items-center justify-center px-4 py-12">
            <p className="text-sm text-[var(--dim)]">No project notifications</p>
          </div>
        ) : (
          notifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onMarkRead={markRead}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default function NotificationBell({
  projectId,
  wrapperClassName,
  buttonClassName,
  panelClassName,
  onOpenChange,
}: NotificationBellProps = {}) {
  const { notifications, unreadCount, loading, open, setOpen } = useNotificationStore();
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  useRealtimeNotifications();

  const scopedNotifications = useMemo(
    () => projectId
      ? notifications.filter((notification) => belongsToProject(notification, projectId))
      : notifications,
    [notifications, projectId],
  );
  const scopedUnreadCount = projectId
    ? scopedNotifications.filter((notification) => !notification.read).length
    : unreadCount;

  const updateOpen = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }, [onOpenChange, setOpen]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        updateOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      updateOpen(false);
      buttonRef.current?.focus();
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, updateOpen]);

  return (
    <div className={joinClasses("relative", wrapperClassName)}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => updateOpen(!open)}
        className={joinClasses(
          "relative flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]",
          buttonClassName,
        )}
        aria-label={projectId ? "Project notifications" : "Notifications"}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
      >
        <Bell size={18} />
        {scopedUnreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--red)] px-1 text-[10px] font-bold leading-none text-white">
            {scopedUnreadCount > 99 ? "99+" : scopedUnreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          ref={panelRef}
          className={joinClasses(
            "absolute right-0 top-full z-50 mt-2 w-[min(380px,calc(100vw-24px))] overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-xl",
            panelClassName,
          )}
          role="region"
          aria-label={projectId ? "Project notifications" : "Notifications"}
        >
          {projectId ? (
            <ProjectNotificationList notifications={scopedNotifications} loading={loading} />
          ) : (
            <NotificationList />
          )}
        </div>
      )}
    </div>
  );
}
