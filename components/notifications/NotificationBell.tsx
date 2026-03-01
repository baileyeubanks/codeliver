"use client";

import { useEffect, useRef } from "react";
import { Bell } from "lucide-react";
import { useNotificationStore } from "@/lib/stores/notificationStore";
import NotificationList from "@/components/notifications/NotificationList";

export default function NotificationBell() {
  const { unreadCount, open, toggleOpen, setOpen, fetchNotifications } =
    useNotificationStore();
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Fetch notifications on mount
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open, setOpen]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        className="relative flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--red)] px-1 text-[10px] font-bold leading-none text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full z-50 mt-2 w-[380px] overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-xl"
        >
          <NotificationList />
        </div>
      )}
    </div>
  );
}
