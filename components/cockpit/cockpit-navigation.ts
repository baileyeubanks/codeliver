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

function navigationItem(
  id: CockpitSection,
  labels: Partial<Pick<CockpitNavigationItem, "label" | "shortLabel">> = {},
): CockpitNavigationItem {
  const item = COCKPIT_NAVIGATION.find((candidate) => candidate.id === id);

  if (!item) {
    throw new Error(`Missing cockpit navigation item: ${id}`);
  }

  return { ...item, ...labels };
}

export const COCKPIT_LIFECYCLE_NAVIGATION: CockpitNavigationItem[] = [
  navigationItem("overview", { shortLabel: "Overview" }),
  navigationItem("tasks", { label: "Plan", shortLabel: "Plan" }),
  navigationItem("media", { label: "Edit", shortLabel: "Edit" }),
  navigationItem("reviews", { label: "Review", shortLabel: "Review" }),
];

export const COCKPIT_MORE_VIEWS_NAVIGATION: CockpitNavigationItem[] = [
  navigationItem("sequences"),
  navigationItem("versions"),
  navigationItem("approvals"),
  navigationItem("metadata", { label: "Details", shortLabel: "Details" }),
];

export const MOBILE_COCKPIT_NAVIGATION = [...COCKPIT_LIFECYCLE_NAVIGATION];
