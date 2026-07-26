export type CockpitSection =
  | "overview"
  | "creative"
  | "proposal"
  | "plan"
  | "media"
  | "sequences"
  | "reviews"
  | "approvals"
  | "tasks"
  | "versions"
  | "delivery"
  | "metadata";

export type CockpitNavigationIcon =
  | "approvals"
  | "creative"
  | "delivery"
  | "home"
  | "media"
  | "metadata"
  | "plan"
  | "proposal"
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

/**
 * Lifecycle-ordered contextual navigation for the Project Operating Record.
 * Sections are views into ONE project record, not separate products
 * (docs/COVIDEOPRO_TARGET_ARCHITECTURE.md §2.2).
 */
export const COCKPIT_NAVIGATION: CockpitNavigationItem[] = [
  { id: "overview", label: "Overview", shortLabel: "Home", icon: "home" },
  { id: "creative", label: "Creative", shortLabel: "Creative", icon: "creative" },
  { id: "proposal", label: "Proposal", shortLabel: "Proposal", icon: "proposal" },
  { id: "plan", label: "Plan", shortLabel: "Plan", icon: "plan" },
  { id: "media", label: "Media", shortLabel: "Media", icon: "media" },
  { id: "sequences", label: "Sequences", shortLabel: "Sequence", icon: "sequences" },
  { id: "reviews", label: "Reviews", shortLabel: "Reviews", icon: "reviews" },
  { id: "approvals", label: "Approvals", shortLabel: "Approve", icon: "approvals" },
  { id: "delivery", label: "Delivery", shortLabel: "Delivery", icon: "delivery" },
  { id: "tasks", label: "Tasks", shortLabel: "Tasks", icon: "tasks" },
  { id: "versions", label: "Versions", shortLabel: "Versions", icon: "versions" },
  { id: "metadata", label: "Metadata", shortLabel: "Info", icon: "metadata" },
];

const MOBILE_IDS = new Set<CockpitSection>(["overview", "media", "reviews", "tasks"]);

export const MOBILE_COCKPIT_NAVIGATION = COCKPIT_NAVIGATION.filter((item) =>
  MOBILE_IDS.has(item.id),
);
