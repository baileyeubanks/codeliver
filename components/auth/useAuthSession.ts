"use client";

import { useCallback, useEffect, useState } from "react";
import type { TrustedSurfaceRole } from "@/lib/auth/host-surface";

export interface AuthSessionSnapshot {
  authenticated: true;
  id: string;
  email: string | null;
  surfaceRole: TrustedSurfaceRole;
}

function isSessionSnapshot(value: unknown): value is AuthSessionSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<AuthSessionSnapshot>;
  return Boolean(
    candidate.authenticated === true &&
      typeof candidate.id === "string" &&
      (candidate.email === null || typeof candidate.email === "string") &&
      (candidate.surfaceRole === "staff" || candidate.surfaceRole === "client"),
  );
}

export function useAuthSession(enabled: boolean) {
  const [session, setSession] = useState<AuthSessionSnapshot | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (signal?: AbortSignal) => {
    if (!enabled) {
      setSession(null);
      setLoading(false);
      setError(null);
      return null;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/session", {
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal,
      });
      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok || !isSessionSnapshot(payload)) {
        throw new Error("session_unavailable");
      }
      setSession(payload);
      setError(null);
      return payload;
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return null;
      setSession(null);
      setError("Account session is temporarily unavailable");
      return null;
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    const controller = new AbortController();
    if (!enabled) {
      void reload(controller.signal);
      return () => controller.abort();
    }

    // Let query-derived demo mode settle after hydration before opening a
    // managed-session request that the next render may immediately cancel.
    const timer = window.setTimeout(() => {
      void reload(controller.signal);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, reload]);

  return { session, loading, error, reload };
}
