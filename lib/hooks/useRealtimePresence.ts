"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase-browser";

interface PresenceUser {
  userId: string;
  userName: string;
  lastSeen: string;
}

interface PresenceState {
  userId: string;
  userName: string;
  lastSeen: string;
}

const HEARTBEAT_INTERVAL = 10_000; // 10 seconds
const STALE_THRESHOLD = 30_000; // 30 seconds

export function useRealtimePresence(
  assetId: string,
  userId: string,
  userName: string
): PresenceUser[] {
  const [users, setUsers] = useState<PresenceUser[]>([]);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const staleCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const removeStale = useCallback(() => {
    const now = Date.now();
    setUsers((prev) =>
      prev.filter(
        (u) => now - new Date(u.lastSeen).getTime() < STALE_THRESHOLD
      )
    );
  }, []);

  useEffect(() => {
    if (!assetId || !userId) return;

    const supabase = createSupabaseBrowser();

    const channel = supabase.channel(`presence:${assetId}`, {
      config: { presence: { key: userId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<PresenceState>();
        const present: PresenceUser[] = [];

        for (const key of Object.keys(state)) {
          const entries = state[key];
          if (entries && entries.length > 0) {
            const entry = entries[0];
            present.push({
              userId: entry.userId,
              userName: entry.userName,
              lastSeen: entry.lastSeen,
            });
          }
        }

        setUsers(present);
      })
      .on("presence", { event: "join" }, ({ newPresences }) => {
        setUsers((prev) => {
          const next = [...prev];
          for (const p of newPresences) {
            const entry = p as unknown as PresenceState;
            const idx = next.findIndex((u) => u.userId === entry.userId);
            if (idx >= 0) {
              next[idx] = {
                userId: entry.userId,
                userName: entry.userName,
                lastSeen: entry.lastSeen,
              };
            } else {
              next.push({
                userId: entry.userId,
                userName: entry.userName,
                lastSeen: entry.lastSeen,
              });
            }
          }
          return next;
        });
      })
      .on("presence", { event: "leave" }, ({ leftPresences }) => {
        setUsers((prev) => {
          const leftIds = new Set(
            leftPresences.map(
              (p) => (p as unknown as PresenceState).userId
            )
          );
          return prev.filter((u) => !leftIds.has(u.userId));
        });
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            userId,
            userName,
            lastSeen: new Date().toISOString(),
          });
        }
      });

    // Heartbeat: re-track presence every 10s
    heartbeatRef.current = setInterval(async () => {
      await channel.track({
        userId,
        userName,
        lastSeen: new Date().toISOString(),
      });
    }, HEARTBEAT_INTERVAL);

    // Stale check: remove users not seen in 30s
    staleCheckRef.current = setInterval(removeStale, HEARTBEAT_INTERVAL);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (staleCheckRef.current) clearInterval(staleCheckRef.current);
      channel.untrack();
      supabase.removeChannel(channel);
    };
  }, [assetId, userId, userName, removeStale]);

  return users;
}
