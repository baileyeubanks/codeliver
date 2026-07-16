"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  createEnterpriseIdentityState,
  ENTERPRISE_IDENTITY_STORAGE_KEY,
  restoreEnterpriseIdentityState,
  type EnterpriseIdentityState,
  type EnterpriseMutationResult,
} from "./enterprise-model";

type EnterpriseMutation = (state: EnterpriseIdentityState) => EnterpriseMutationResult;

const serverState = createEnterpriseIdentityState();
let currentState = serverState;
let hydrated = false;
const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  function handleStorage(event: StorageEvent) {
    if (event.key !== ENTERPRISE_IDENTITY_STORAGE_KEY) return;
    currentState = restoreEnterpriseIdentityState(event.newValue).state;
    hydrated = true;
    emitChange();
  }

  window.addEventListener("storage", handleStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

function getServerSnapshot() {
  return serverState;
}

function getReadOnlySnapshot() {
  return serverState;
}

function getDemoSnapshot() {
  if (!hydrated && typeof window !== "undefined") {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(ENTERPRISE_IDENTITY_STORAGE_KEY);
    } catch {
      // Use the in-memory seed when browser storage is unavailable.
    }
    currentState = restoreEnterpriseIdentityState(stored).state;
    hydrated = true;
  }
  return currentState;
}

function saveDemoState(next: EnterpriseIdentityState) {
  currentState = next;
  hydrated = true;
  try {
    window.localStorage.setItem(ENTERPRISE_IDENTITY_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // In-memory demo governance remains usable when browser storage is unavailable.
  }
  emitChange();
}

export function useEnterpriseIdentityDemo(enabled: boolean) {
  const state = useSyncExternalStore(
    subscribe,
    enabled ? getDemoSnapshot : getReadOnlySnapshot,
    getServerSnapshot,
  );

  const mutate = useCallback(
    (mutation: EnterpriseMutation) => {
      if (!enabled) {
        return {
          state,
          changed: false,
          reason: "forbidden" as const,
        };
      }
      const outcome = mutation(state);
      if (outcome.changed) saveDemoState(outcome.state);
      return outcome;
    },
    [enabled, state],
  );

  const reset = useCallback(() => {
    if (!enabled) return;
    saveDemoState(createEnterpriseIdentityState());
  }, [enabled]);

  return { state, hydrated: enabled ? hydrated : true, mutate, reset };
}
