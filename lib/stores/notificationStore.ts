import { create } from "zustand";
import type { Notification } from "@/lib/types/codeliver";

interface NotificationStore {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  open: boolean;

  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  setNotifications: (notifications: Notification[]) => void;
  addNotification: (notification: Notification) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  setLoading: (loading: boolean) => void;
  fetchNotifications: () => Promise<void>;
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,
  open: false,

  setOpen: (open) => set({ open }),
  toggleOpen: () => set((s) => ({ open: !s.open })),

  setNotifications: (notifications) =>
    set({
      notifications,
      unreadCount: notifications.filter((n) => !n.read).length,
    }),

  addNotification: (notification) => {
    const current = get().notifications;
    set({
      notifications: [notification, ...current],
      unreadCount: get().unreadCount + (notification.read ? 0 : 1),
    });
  },

  markRead: async (id) => {
    set((s) => ({
      notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
      unreadCount: Math.max(0, s.unreadCount - 1),
    }));
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, read: true }),
    }).catch(() => {});
  },

  markAllRead: async () => {
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }));
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).catch(() => {});
  },

  setLoading: (loading) => set({ loading }),

  fetchNotifications: async () => {
    set({ loading: true });
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        const items: Notification[] = data.items ?? [];
        set({
          notifications: items,
          unreadCount: items.filter((n) => !n.read).length,
        });
      }
    } catch {
      // silent
    } finally {
      set({ loading: false });
    }
  },
}));
