export type WorkspaceRole =
  | "owner"
  | "admin"
  | "producer"
  | "editor"
  | "member"
  | "reviewer"
  | "viewer"
  | "client";

export type WorkspaceCapability =
  | "projects:read"
  | "projects:create"
  | "media:read"
  | "media:write"
  | "reviews:read"
  | "reviews:comment"
  | "reviews:approve"
  | "sales:read"
  | "sales:qualify"
  | "activity:read"
  | "workspace:manage";

export type NavigationIconName =
  | "activity"
  | "archive"
  | "folder"
  | "library"
  | "plus"
  | "reviews"
  | "sales"
  | "settings"
  | "trash";

export interface WorkspaceNavigationItem {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  href: string;
  icon: NavigationIconName;
  capability: WorkspaceCapability;
  primary?: boolean;
  mobile?: boolean;
}

export interface WorkspaceNavigationSection {
  id: string;
  label: string;
  items: WorkspaceNavigationItem[];
}

const ROLE_CAPABILITIES: Record<WorkspaceRole, ReadonlySet<WorkspaceCapability>> = {
  owner: new Set<WorkspaceCapability>([
    "projects:read",
    "projects:create",
    "media:read",
    "media:write",
    "reviews:read",
    "reviews:comment",
    "reviews:approve",
    "sales:read",
    "sales:qualify",
    "activity:read",
    "workspace:manage",
  ]),
  admin: new Set<WorkspaceCapability>([
    "projects:read",
    "projects:create",
    "media:read",
    "media:write",
    "reviews:read",
    "reviews:comment",
    "reviews:approve",
    "sales:read",
    "sales:qualify",
    "activity:read",
    "workspace:manage",
  ]),
  producer: new Set<WorkspaceCapability>([
    "projects:read",
    "projects:create",
    "media:read",
    "media:write",
    "reviews:read",
    "reviews:comment",
    "reviews:approve",
    "sales:read",
    "sales:qualify",
    "activity:read",
  ]),
  editor: new Set<WorkspaceCapability>([
    "projects:read",
    "media:read",
    "media:write",
    "reviews:read",
    "reviews:comment",
    "activity:read",
  ]),
  member: new Set<WorkspaceCapability>([
    "projects:read",
    "media:read",
    "media:write",
    "reviews:read",
    "reviews:comment",
    "reviews:approve",
  ]),
  reviewer: new Set<WorkspaceCapability>([
    "projects:read",
    "media:read",
    "reviews:read",
    "reviews:comment",
    "reviews:approve",
  ]),
  viewer: new Set<WorkspaceCapability>([
    "projects:read",
    "media:read",
    "reviews:read",
  ]),
  client: new Set<WorkspaceCapability>([
    "reviews:read",
    "reviews:comment",
    "reviews:approve",
  ]),
};

export const WORKSPACE_NAVIGATION: WorkspaceNavigationSection[] = [
  {
    id: "work",
    label: "Workspace",
    items: [
      {
        id: "projects",
        label: "Projects",
        shortLabel: "Projects",
        description: "Browse active productions and deliveries",
        href: "/projects",
        icon: "folder",
        capability: "projects:read",
        primary: true,
        mobile: true,
      },
      {
        id: "reviews",
        label: "Reviews",
        shortLabel: "Reviews",
        description: "Track active review and approval work",
        href: "/reviews",
        icon: "reviews",
        capability: "reviews:read",
        primary: true,
        mobile: true,
      },
      {
        id: "sales",
        label: "Sales & intake",
        shortLabel: "Sales",
        description: "Qualify inquiries and prepare proposal handoffs",
        href: "/sales",
        icon: "sales",
        capability: "sales:read",
        primary: true,
      },
      {
        id: "library",
        label: "Media library",
        shortLabel: "Library",
        description: "Search media across every project",
        href: "/library",
        icon: "library",
        capability: "media:read",
        primary: true,
        mobile: true,
      },
      {
        id: "activity",
        label: "Activity",
        shortLabel: "Activity",
        description: "Review workspace and delivery history",
        href: "/activity",
        icon: "activity",
        capability: "activity:read",
        primary: true,
      },
    ],
  },
  {
    id: "administration",
    label: "Administration",
    items: [
      {
        id: "settings",
        label: "Workspace settings",
        shortLabel: "Settings",
        description: "Manage profile, brand, team, and preferences",
        href: "/settings",
        icon: "settings",
        capability: "workspace:manage",
      },
    ],
  },
];

export interface SearchableCommand {
  id: string;
  label: string;
  description?: string;
  keywords?: readonly string[];
  section?: string;
}

export function roleCan(role: WorkspaceRole, capability: WorkspaceCapability) {
  return ROLE_CAPABILITIES[role].has(capability);
}

export function visibleNavigation(role: WorkspaceRole) {
  return WORKSPACE_NAVIGATION.map((section) => ({
    ...section,
    items: section.items.filter((item) => roleCan(role, item.capability)),
  })).filter((section) => section.items.length > 0);
}

export function primaryNavigation(role: WorkspaceRole) {
  return visibleNavigation(role)
    .flatMap((section) => section.items)
    .filter((item) => item.primary);
}

export function mobileNavigation(role: WorkspaceRole) {
  return visibleNavigation(role)
    .flatMap((section) => section.items)
    .filter((item) => item.mobile);
}

export function activeNavigationId(pathname: string, role: WorkspaceRole) {
  const matches = visibleNavigation(role)
    .flatMap((section) => section.items)
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((left, right) => right.href.length - left.href.length);

  return matches[0]?.id ?? null;
}

export function withWorkspaceQuery(href: string, querySuffix: string) {
  if (!querySuffix || !href.startsWith("/")) return href;

  const [pathAndQuery, hash] = href.split("#", 2);
  const normalizedSuffix = querySuffix.replace(/^\?/, "");
  const separator = pathAndQuery.includes("?") ? "&" : "?";
  return `${pathAndQuery}${separator}${normalizedSuffix}${hash ? `#${hash}` : ""}`;
}

function commandScore(command: SearchableCommand, terms: string[]) {
  const label = command.label.toLocaleLowerCase();
  const description = command.description?.toLocaleLowerCase() ?? "";
  const keywords = command.keywords?.join(" ").toLocaleLowerCase() ?? "";
  const haystack = `${label} ${description} ${keywords}`;

  let score = 0;
  for (const term of terms) {
    if (!haystack.includes(term)) return -1;
    if (label === term) score += 100;
    else if (label.startsWith(term)) score += 50;
    else if (label.includes(term)) score += 25;
    else if (keywords.includes(term)) score += 12;
    else score += 5;
  }
  return score;
}

export function rankCommands<T extends SearchableCommand>(
  commands: readonly T[],
  query: string,
  limit = 18,
) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return commands.slice(0, limit);

  return commands
    .map((command, index) => ({ command, index, score: commandScore(command, terms) }))
    .filter((candidate) => candidate.score >= 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .map((candidate) => candidate.command);
}
