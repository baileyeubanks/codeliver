export type CockpitSection =
  | "overview"
  | "media"
  | "sequences"
  | "reviews"
  | "approvals"
  | "tasks"
  | "versions"
  | "metadata";

export type CockpitNavigationIcon =
  | "approvals"
  | "home"
  | "media"
  | "metadata"
  | "reviews"
  | "sequences"
  | "tasks"
  | "versions";

export interface CockpitNavigationItem {
  id: CockpitSection;
  label: string;
  shortLabel: string;
  icon: CockpitNavigationIcon;
}

export const COCKPIT_NAVIGATION: CockpitNavigationItem[] = [
  { id: "overview", label: "Overview", shortLabel: "Home", icon: "home" },
  { id: "media", label: "Media", shortLabel: "Media", icon: "media" },
  { id: "sequences", label: "Sequences", shortLabel: "Sequence", icon: "sequences" },
  { id: "reviews", label: "Reviews", shortLabel: "Reviews", icon: "reviews" },
  { id: "approvals", label: "Approvals", shortLabel: "Approve", icon: "approvals" },
  { id: "tasks", label: "Tasks", shortLabel: "Tasks", icon: "tasks" },
  { id: "versions", label: "Versions", shortLabel: "Versions", icon: "versions" },
  { id: "metadata", label: "Metadata", shortLabel: "Info", icon: "metadata" },
];

const MOBILE_IDS = new Set<CockpitSection>(["overview", "media", "reviews", "tasks"]);

export const MOBILE_COCKPIT_NAVIGATION = COCKPIT_NAVIGATION.filter((item) =>
  MOBILE_IDS.has(item.id),
);
