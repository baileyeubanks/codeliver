"use client";

import { useSyncExternalStore } from "react";
import {
  CANONICAL_PRODUCT_HOST,
  CANONICAL_PRODUCT_WWW_HOST,
} from "@/lib/auth/host-surface";

const LOCAL_DEMO_DEFAULT =
  process.env.NODE_ENV === "development" &&
  (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

function subscribeToLocation(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

function demoHostIsAllowed() {
  const hostname = window.location.hostname.toLowerCase();
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === CANONICAL_PRODUCT_HOST ||
    hostname === CANONICAL_PRODUCT_WWW_HOST
  );
}

function getDemoModeSnapshot() {
  if (!demoHostIsAllowed()) return false;
  const localHost = ["localhost", "127.0.0.1", "[::1]"].includes(
    window.location.hostname.toLowerCase(),
  );
  return (
    (LOCAL_DEMO_DEFAULT && localHost) ||
    new URLSearchParams(window.location.search).get("demo") === "1"
  );
}

export function useDemoMode() {
  return useSyncExternalStore(
    subscribeToLocation,
    getDemoModeSnapshot,
    () => false,
  );
}

export function useDemoSuffix() {
  return useDemoMode() ? "?demo=1" : "";
}
