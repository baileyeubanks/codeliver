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
  markRead: (id: string) => Promise<boolean>;
  markAllRead: () => Promise<boolean>;
  setLoading: (loading: boolean) => void;
  fetchNotifications: (options?: { silent?: boolean }) => Promise<boolean>;
}

function notificationState(notifications: Notification[]) {
  return {
    notifications,
    unreadCount: notifications.filter((notification) => !notification.read).length,
  };
}

async function persistReadState(body: Record<string, unknown>): Promise<boolean> {
  try {
    const response = await fetch("/api/notifications", {
      method: "PATCH",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) return false;
    const payload = await response.json().catch(() => null);
    return Boolean(payload && typeof payload === "object" && payload.ok === true);
  } catch {
    return false;
  }
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,
  open: false,

  setOpen: (open) => set({ open }),
  toggleOpen: () => set((s) => ({ open: !s.open })),

  setNotifications: (notifications) => set(notificationState(notifications)),

  addNotification: (notification) => {
    const current = get().notifications;
    const existingIndex = current.findIndex((item) => item.id === notification.id);
    const next = existingIndex === -1
      ? [notification, ...current]
      : current.map((item) => (item.id === notification.id ? notification : item));
    set(notificationState(next));
  },

  markRead: async (id) => {
    const target = get().notifications.find((notification) => notification.id === id);
    if (!target) return false;
    if (target.read) return true;

    set((state) => notificationState(
      state.notifications.map((notification) => (
        notification.id === id ? { ...notification, read: true } : notification
      )),
    ));

    if (await persistReadState({ id, read: true })) return true;

    set((state) => notificationState(
      state.notifications.map((notification) => (
        notification.id === id ? { ...notification, read: target.read } : notification
      )),
    ));
    await get().fetchNotifications({ silent: true });
    return false;
  },

  markAllRead: async () => {
    const unreadIds = new Set(
      get().notifications
        .filter((notification) => !notification.read)
        .map((notification) => notification.id),
    );
    if (unreadIds.size === 0) return true;

    set((state) => notificationState(
      state.notifications.map((notification) => ({ ...notification, read: true })),
    ));

    if (await persistReadState({ all: true })) return true;

    set((state) => notificationState(
      state.notifications.map((notification) => (
        unreadIds.has(notification.id) ? { ...notification, read: false } : notification
      )),
    ));
    await get().fetchNotifications({ silent: true });
    return false;
  },

  setLoading: (loading) => set({ loading }),

  fetchNotifications: async (options = {}) => {
    if (!options.silent) set({ loading: true });
    try {
      const response = await fetch("/api/notifications", {
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return false;
      const payload = await response.json().catch(() => null);
      if (!payload || typeof payload !== "object" || !Array.isArray(payload.items)) {
        return false;
      }
      set(notificationState(payload.items as Notification[]));
      return true;
    } catch {
      return false;
    } finally {
      if (!options.silent) set({ loading: false });
    }
  },
}));
