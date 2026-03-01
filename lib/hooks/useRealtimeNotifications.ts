"use client";

import { useEffect } from "react";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import { useNotificationStore } from "@/lib/stores/notificationStore";
import type { Notification } from "@/lib/types/codeliver";

export function useRealtimeNotifications(userId: string) {
  const addNotification = useNotificationStore((s) => s.addNotification);

  useEffect(() => {
    if (!userId) return;

    const supabase = createSupabaseBrowser();

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const notification = payload.new as Notification;
          addNotification(notification);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, addNotification]);
}
