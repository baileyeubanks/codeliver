"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_AUTH_HOST_CONTEXT,
  resolveAuthHostContext,
} from "./auth-context";

function subscribeToHostname() {
  return () => undefined;
}

function getHostnameSnapshot() {
  return resolveAuthHostContext(window.location.hostname);
}

export default function useAuthHostContext() {
  return useSyncExternalStore(
    subscribeToHostname,
    getHostnameSnapshot,
    () => DEFAULT_AUTH_HOST_CONTEXT,
  );
}
