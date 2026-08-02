"use client";

import { useEffect } from "react";
import { getSupabaseBrowserDataSchema } from "@/lib/data-authority";
import { hasSupabasePublicConfig } from "@/lib/public-env";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import { useNotificationStore } from "@/lib/stores/notificationStore";
import type { Notification } from "@/lib/types/codeliver";

const HAS_SUPABASE_CONFIG = hasSupabasePublicConfig();
const MIN_POLL_INTERVAL_MS = 15_000;
const MAX_POLL_INTERVAL_MS = 120_000;
const DEFAULT_POLL_INTERVAL_MS = 30_000;

interface RealtimeNotificationOptions {
  enabled?: boolean;
  userId?: string | null;
  pollIntervalMs?: number;
}

export function boundedNotificationPollInterval(value?: number): number {
  if (!Number.isFinite(value)) return DEFAULT_POLL_INTERVAL_MS;
  return Math.min(
    MAX_POLL_INTERVAL_MS,
    Math.max(MIN_POLL_INTERVAL_MS, Math.round(value as number)),
  );
}

export function useRealtimeNotifications(
  input: string | RealtimeNotificationOptions = {},
) {
  const options = typeof input === "string" ? { userId: input } : input;
  const enabled = options.enabled ?? true;
  const requestedUserId = options.userId ?? null;
  const pollIntervalMs = boundedNotificationPollInterval(options.pollIntervalMs);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const fetchNotifications = useNotificationStore((s) => s.fetchNotifications);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let fallbackTimer: number | null = null;
    let fallbackInFlight = false;
    let realtimeConnected = false;
    let removeRealtimeChannel: (() => void) | null = null;

    function clearFallbackTimer() {
      if (fallbackTimer !== null) {
        window.clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
    }

    function scheduleFallback(delay = pollIntervalMs) {
      if (cancelled || realtimeConnected) return;
      clearFallbackTimer();
      fallbackTimer = window.setTimeout(() => {
        fallbackTimer = null;
        if (cancelled || realtimeConnected) return;
        if (document.visibilityState === "hidden" || fallbackInFlight) {
          scheduleFallback();
          return;
        }
        fallbackInFlight = true;
        void fetchNotifications({ silent: true }).finally(() => {
          fallbackInFlight = false;
          scheduleFallback();
        });
      }, delay);
    }

    function refreshFallback() {
      if (cancelled || realtimeConnected || fallbackInFlight) return;
      clearFallbackTimer();
      fallbackInFlight = true;
      void fetchNotifications({ silent: true }).finally(() => {
        fallbackInFlight = false;
        scheduleFallback();
      });
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") refreshFallback();
    }

    void fetchNotifications();
    scheduleFallback();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", refreshFallback);

    if (!HAS_SUPABASE_CONFIG) {
      return () => {
        cancelled = true;
        clearFallbackTimer();
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        window.removeEventListener("online", refreshFallback);
      };
    }

    const supabase = createSupabaseBrowser();
    void (async () => {
      try {
        const resolvedUserId = requestedUserId || (await supabase.auth.getUser()).data.user?.id;
        if (cancelled || !resolvedUserId) return;

        const channel = supabase
          .channel(`notifications:${resolvedUserId}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: getSupabaseBrowserDataSchema(),
              table: "notifications",
              filter: `user_id=eq.${resolvedUserId}`,
            },
          (payload) => {
            addNotification(payload.new as Notification);
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: getSupabaseBrowserDataSchema(),
            table: "notifications",
            filter: `user_id=eq.${resolvedUserId}`,
          },
          (payload) => {
            addNotification(payload.new as Notification);
          },
        )
        .subscribe((status) => {
            if (cancelled) return;
            if (status === "SUBSCRIBED") {
              realtimeConnected = true;
              clearFallbackTimer();
              void fetchNotifications({ silent: true });
              return;
            }
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
              realtimeConnected = false;
              scheduleFallback(0);
            }
          });

        removeRealtimeChannel = () => {
          void supabase.removeChannel(channel);
        };
      } catch {
        scheduleFallback(0);
      }
    })();

    return () => {
      cancelled = true;
      clearFallbackTimer();
      removeRealtimeChannel?.();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", refreshFallback);
    };
  }, [addNotification, enabled, fetchNotifications, pollIntervalMs, requestedUserId]);
}
