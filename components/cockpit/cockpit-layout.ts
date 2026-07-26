export const COCKPIT_LAYOUT_VERSION = 1 as const;

export type CockpitLayoutMode = "review" | "edit" | "focus";
export type CockpitRailMode = "expanded" | "compact";
export type CockpitDockTab = "review" | "versions" | "inspector" | "activity";
export type CockpitDensity = "compact" | "comfortable";

export interface CockpitLayoutState {
  version: typeof COCKPIT_LAYOUT_VERSION;
  mode: CockpitLayoutMode;
  rail: CockpitRailMode;
  dockOpen: boolean;
  dockTab: CockpitDockTab;
  density: CockpitDensity;
}

export const DEFAULT_COCKPIT_LAYOUT: CockpitLayoutState = {
  version: COCKPIT_LAYOUT_VERSION,
  mode: "review",
  rail: "expanded",
  dockOpen: true,
  dockTab: "review",
  density: "compact",
};

const MODES = new Set<CockpitLayoutMode>(["review", "edit", "focus"]);
const RAILS = new Set<CockpitRailMode>(["expanded", "compact"]);
const TABS = new Set<CockpitDockTab>(["review", "versions", "inspector", "activity"]);
const DENSITIES = new Set<CockpitDensity>(["compact", "comfortable"]);

export function normalizeCockpitLayout(input: unknown): CockpitLayoutState {
  if (!input || typeof input !== "object") return DEFAULT_COCKPIT_LAYOUT;
  const candidate = input as Partial<CockpitLayoutState>;

  return {
    version: COCKPIT_LAYOUT_VERSION,
    mode: candidate.mode && MODES.has(candidate.mode) ? candidate.mode : DEFAULT_COCKPIT_LAYOUT.mode,
    rail: candidate.rail && RAILS.has(candidate.rail) ? candidate.rail : DEFAULT_COCKPIT_LAYOUT.rail,
    dockOpen: typeof candidate.dockOpen === "boolean"
      ? candidate.dockOpen
      : DEFAULT_COCKPIT_LAYOUT.dockOpen,
    dockTab: candidate.dockTab && TABS.has(candidate.dockTab)
      ? candidate.dockTab
      : DEFAULT_COCKPIT_LAYOUT.dockTab,
    density: candidate.density && DENSITIES.has(candidate.density)
      ? candidate.density
      : DEFAULT_COCKPIT_LAYOUT.density,
  };
}

export function parseCockpitLayout(serialized: string | null | undefined) {
  if (!serialized) return DEFAULT_COCKPIT_LAYOUT;
  try {
    return normalizeCockpitLayout(JSON.parse(serialized));
  } catch {
    return DEFAULT_COCKPIT_LAYOUT;
  }
}

export function applyCockpitMode(
  current: CockpitLayoutState,
  mode: CockpitLayoutMode,
): CockpitLayoutState {
  switch (mode) {
    case "edit":
      return {
        ...current,
        mode,
        rail: "compact",
        dockOpen: true,
        dockTab: "versions",
        density: "compact",
      };
    case "focus":
      return {
        ...current,
        mode,
        rail: "compact",
        dockOpen: false,
        density: "compact",
      };
    case "review":
    default:
      return {
        ...current,
        mode: "review",
        rail: "expanded",
        dockOpen: true,
        dockTab: "review",
        density: "compact",
      };
  }
}

export function cockpitLayoutStorageKey(projectId: string) {
  return `co-deliver.cockpit-layout.v${COCKPIT_LAYOUT_VERSION}:${projectId}`;
}
