"use client";

import { useSyncExternalStore } from "react";

const LOCAL_DEMO_DEFAULT =
  process.env.NODE_ENV === "development" &&
  (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

function subscribeToLocation(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

function getDemoModeSnapshot() {
  return (
    LOCAL_DEMO_DEFAULT ||
    new URLSearchParams(window.location.search).get("demo") === "1"
  );
}

export function useDemoMode() {
  return useSyncExternalStore(
    subscribeToLocation,
    getDemoModeSnapshot,
    () => LOCAL_DEMO_DEFAULT,
  );
}

export function useDemoSuffix() {
  return useDemoMode() ? "?demo=1" : "";
}
