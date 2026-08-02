"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import {
  DEFAULT_COCKPIT_LAYOUT,
  applyCockpitMode,
  cockpitLayoutStorageKey,
  parseCockpitLayout,
  type CockpitDockTab,
  type CockpitLayoutMode,
  type CockpitLayoutState,
} from "./cockpit-layout";

const LAYOUT_EVENT = "co-deliver:cockpit-layout";
const memoryFallback = new Map<string, string>();

function readSnapshot(key: string) {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(key) ?? memoryFallback.get(key) ?? "";
  } catch {
    return memoryFallback.get(key) ?? "";
  }
}

function writeSnapshot(key: string, layout: CockpitLayoutState) {
  const serialized = JSON.stringify(layout);
  memoryFallback.set(key, serialized);
  try {
    window.localStorage.setItem(key, serialized);
  } catch {
    // The in-memory layout keeps the workspace usable when local storage is blocked.
  }
  window.dispatchEvent(new CustomEvent(LAYOUT_EVENT, { detail: { key } }));
}

export function useCockpitLayout(projectId: string) {
  const key = useMemo(() => cockpitLayoutStorageKey(projectId), [projectId]);
  const subscribe = useCallback((notify: () => void) => {
    function handleStorage(event: StorageEvent) {
      if (event.key === key) notify();
    }
    function handleLayout(event: Event) {
      if ((event as CustomEvent<{ key: string }>).detail?.key === key) notify();
    }
    window.addEventListener("storage", handleStorage);
    window.addEventListener(LAYOUT_EVENT, handleLayout);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(LAYOUT_EVENT, handleLayout);
    };
  }, [key]);
  const getSnapshot = useCallback(() => readSnapshot(key), [key]);
  const serialized = useSyncExternalStore(subscribe, getSnapshot, () => "");
  const layout = useMemo(
    () => serialized ? parseCockpitLayout(serialized) : DEFAULT_COCKPIT_LAYOUT,
    [serialized],
  );
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const updateLayout = useCallback((update: (current: CockpitLayoutState) => CockpitLayoutState) => {
    writeSnapshot(key, update(layout));
  }, [key, layout]);

  const setMode = useCallback((mode: CockpitLayoutMode) => {
    updateLayout((current) => applyCockpitMode(current, mode));
  }, [updateLayout]);

  const toggleRail = useCallback(() => {
    updateLayout((current) => ({
      ...current,
      rail: current.rail === "expanded" ? "compact" : "expanded",
    }));
  }, [updateLayout]);

  const toggleDock = useCallback(() => {
    updateLayout((current) => ({ ...current, dockOpen: !current.dockOpen }));
  }, [updateLayout]);

  const setDockTab = useCallback((dockTab: CockpitDockTab) => {
    updateLayout((current) => ({ ...current, dockOpen: true, dockTab }));
  }, [updateLayout]);

  const saveWorkspace = useCallback(() => {
    writeSnapshot(key, layout);
    setSavedAt(Date.now());
  }, [key, layout]);

  return {
    layout,
    savedAt,
    setMode,
    toggleRail,
    toggleDock,
    setDockTab,
    saveWorkspace,
  };
}
