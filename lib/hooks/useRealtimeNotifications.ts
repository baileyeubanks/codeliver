"use client";

import { useEffect } from "react";
import { getSupabaseBrowserDataSchema } from "@/lib/data-authority";
import { hasSupabasePublicConfig } from "@/lib/public-env";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import { useNotificationStore } from "@/lib/stores/notificationStore";
import type { Notification } from "@/lib/types/codeliver";

const HAS_SUPABASE_CONFIG = hasSupabasePublicConfig();

export function useRealtimeNotifications(userId: string) {
  const addNotification = useNotificationStore((s) => s.addNotification);

  useEffect(() => {
    if (!userId || !HAS_SUPABASE_CONFIG) return;

    const supabase = createSupabaseBrowser();

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: getSupabaseBrowserDataSchema(),
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
