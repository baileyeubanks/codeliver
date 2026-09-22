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

/**
 * The project cockpit is a route-backed workspace. Keep the parser and URL
 * writer together so a direct URL, browser history, and a rail selection all
 * resolve the same surface without canonicalizing during hydration.
 */
export function cockpitSectionFromSearchParams(searchParams: URLSearchParams): CockpitSection {
  const requested = searchParams.get("surface");
  return isCockpitSection(requested) ? requested : "overview";
}

export function projectCockpitSurfaceHref(
  projectId: string,
  search: string | URLSearchParams,
  section: CockpitSection,
) {
  const params = new URLSearchParams(search);
  // Record tabs and the focused review mode render different workspace
  // contracts. Selecting a cockpit surface deliberately clears only those.
  params.delete("tab");
  params.delete("view");
  if (section === "overview") params.delete("surface");
  else params.set("surface", section);
  const query = params.toString();
  return `/projects/${encodeURIComponent(projectId)}${query ? `?${query}` : ""}`;
}

function isCockpitSection(value: string | null): value is CockpitSection {
  return COCKPIT_NAVIGATION.some((item) => item.id === value);
}

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
  { id: "overview", label: "Review", shortLabel: "Review", icon: "home" },
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

const PRIMARY_IDS: CockpitSection[] = ["overview", "media", "plan", "delivery"];

export const MOBILE_COCKPIT_NAVIGATION = PRIMARY_IDS.flatMap((id) =>
  COCKPIT_NAVIGATION.filter((item) => item.id === id),
);
