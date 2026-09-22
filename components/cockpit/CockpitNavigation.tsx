"use client";

import { useCallback, useId, useRef, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileSliders,
  FileText,
  History,
  Home,
  LayoutGrid,
  Lightbulb,
  ListChecks,
  Menu,
  MessageCircle,
  PackageCheck,
  PanelLeftClose,
  Settings,
  X,
  type LucideIcon,
} from "lucide-react";
import { useDialogFocus } from "@/components/navigation/useDialogFocus";
import {
  COCKPIT_NAVIGATION,
  MOBILE_COCKPIT_NAVIGATION,
  type CockpitNavigationIcon,
  type CockpitSection,
} from "./cockpit-navigation";
import styles from "./CockpitNavigation.module.css";
import CoProductionBrand from "@/components/brand/CoProductionBrand";

const ICONS: Record<CockpitNavigationIcon, LucideIcon> = {
  approvals: CheckCircle2,
  creative: Lightbulb,
  delivery: PackageCheck,
  home: Home,
  media: LayoutGrid,
  metadata: FileSliders,
  plan: ListChecks,
  proposal: FileText,
  reviews: MessageCircle,
  sequences: CalendarDays,
  tasks: ClipboardCheck,
  versions: History,
};

const SECONDARY_GROUPS: ReadonlyArray<{
  label: string;
  sections: CockpitSection[];
}> = [
  { label: "Create", sections: ["creative", "proposal", "sequences"] },
  { label: "Review & deliver", sections: ["reviews", "approvals", "versions"] },
  { label: "Operate", sections: ["tasks", "metadata"] },
];

const PROJECT_TOOLS_EVENT = "co-deliver:project-tools";
const projectToolsMemoryFallback = new Map<string, string>();

function projectToolsStorageKey(projectId?: string) {
  return projectId ? `co-deliver.project-tools.v1:${projectId}` : "";
}

function readProjectToolsPreference(key: string) {
  if (!key || typeof window === "undefined") return "";
  try {
    return window.sessionStorage.getItem(key) ?? projectToolsMemoryFallback.get(key) ?? "";
  } catch {
    return projectToolsMemoryFallback.get(key) ?? "";
  }
}

function writeProjectToolsPreference(key: string, value: "open" | "closed") {
  if (!key || typeof window === "undefined") return;
  projectToolsMemoryFallback.set(key, value);
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // The in-memory preference preserves continuity when storage is blocked.
  }
  window.dispatchEvent(new CustomEvent(PROJECT_TOOLS_EVENT, { detail: { key } }));
}

function useProjectToolsPreference(projectId?: string) {
  const key = projectToolsStorageKey(projectId);
  const subscribe = useCallback((notify: () => void) => {
    if (!key) return () => undefined;
    const onStorage = (event: StorageEvent) => {
      if (event.key === key) notify();
    };
    const onPreference = (event: Event) => {
      if ((event as CustomEvent<{ key: string }>).detail?.key === key) notify();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(PROJECT_TOOLS_EVENT, onPreference);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(PROJECT_TOOLS_EVENT, onPreference);
    };
  }, [key]);
  const getSnapshot = useCallback(() => readProjectToolsPreference(key), [key]);
  return useSyncExternalStore(subscribe, getSnapshot, () => "");
}

interface CockpitNavigationModeProps {
  demoMode?: boolean;
}

interface ProjectNavigationProps extends CockpitNavigationModeProps {
  activeSection: CockpitSection;
  dueTodayCount: number;
  projectId?: string;
  projectQuery?: string;
  activeRecordTab?: string;
  activeWhiteboard?: boolean;
  compact?: boolean;
  onSelect: (section: CockpitSection) => void;
  onCollapse?: () => void;
  onNavigate?: () => void;
}

export function CockpitProjectNavigation({
  activeSection,
  dueTodayCount,
  projectId,
  projectQuery,
  activeRecordTab,
  activeWhiteboard = false,
  compact = false,
  demoMode = false,
  onSelect,
  onCollapse,
  onNavigate,
}: ProjectNavigationProps) {
  const secondaryNavigationId = useId();
  const primaryIds: CockpitSection[] = ["overview", "media", "plan", "delivery"];
  const primarySections = new Set<CockpitSection>(primaryIds);
  const storedSecondaryPreference = useProjectToolsPreference(projectId);
  const primaryNavigation = primaryIds.flatMap((id) => COCKPIT_NAVIGATION.filter((item) => item.id === id));
  const secondaryNavigation = new Map(
    COCKPIT_NAVIGATION
      .filter((item) => !primarySections.has(item.id))
      .map((item) => [item.id, item]),
  );
  const hasProjectSurfaceActive = !activeRecordTab && !activeWhiteboard;
  const shouldRevealSelectedSecondary = Boolean(activeRecordTab)
    || (!activeWhiteboard && !primarySections.has(activeSection));
  const secondaryVisible = storedSecondaryPreference
    ? storedSecondaryPreference === "open"
    : shouldRevealSelectedSecondary;

  function select(section: CockpitSection) {
    onSelect(section);
    onNavigate?.();
  }

  function toggleSecondary() {
    writeProjectToolsPreference(
      projectToolsStorageKey(projectId),
      secondaryVisible ? "closed" : "open",
    );
  }

  function projectHref(path: string, updates: Record<string, string | null> = {}) {
    const query = new URLSearchParams(projectQuery ?? (demoMode ? "demo=1" : ""));
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) query.delete(key);
      else query.set(key, value);
    }
    const serialized = query.toString();
    return serialized ? `${path}?${serialized}` : path;
  }

  return (
    <div className={`${styles.rail} ${compact ? styles.compact : ""}`}>
      <nav className={styles.primary} aria-label="Project workspace">
        {primaryNavigation.map((item) => {
          const Icon = ICONS[item.icon];
          return (
            <button
              key={item.id}
              type="button"
              data-active={hasProjectSurfaceActive && activeSection === item.id}
              aria-current={hasProjectSurfaceActive && activeSection === item.id ? "page" : undefined}
              onClick={() => select(item.id)}
              title={item.label}
            >
              <Icon size={18} />
              <span className={styles.label}>{item.label}</span>
              {item.id === "tasks" && dueTodayCount > 0 ? <small className={styles.badge}>{dueTodayCount}</small> : null}
            </button>
          );
        })}
        {projectId ? (
          <Link
            href={projectHref(`/projects/${encodeURIComponent(projectId)}/whiteboard`, { tab: null, surface: null })}
            title={compact ? "Whiteboard" : undefined}
            aria-current={activeWhiteboard ? "page" : undefined}
            onClick={onNavigate}
          >
            <CalendarDays size={18} />
            <span className={styles.label}>Whiteboard</span>
          </Link>
        ) : null}
        <div className={styles.moreGroup}>
          <button
            type="button"
            className={styles.moreButton}
            aria-label="More project tools"
            aria-expanded={secondaryVisible}
            aria-controls={secondaryNavigationId}
            onClick={toggleSecondary}
          >
            <Menu size={18} />
            <span className={styles.label}>More project tools</span>
          </button>
          {secondaryVisible ? (
            <div id={secondaryNavigationId} className={styles.secondary} aria-label="More project tools">
            {SECONDARY_GROUPS.map((group) => (
              <div key={group.label} className={styles.toolGroup}>
                <span>{group.label}</span>
                {group.sections.map((section) => {
                  const item = secondaryNavigation.get(section);
                  if (!item) return null;
                  const Icon = ICONS[item.icon];
                  return (
                    <button
                      key={item.id}
                      type="button"
                      title={item.label}
                      aria-label={item.label}
                      data-active={hasProjectSurfaceActive && activeSection === item.id}
                      aria-current={hasProjectSurfaceActive && activeSection === item.id ? "page" : undefined}
                      onClick={() => select(item.id)}
                    >
                      <Icon size={18} />
                      <span className={styles.label}>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
            {projectId ? (
              <div className={styles.recordLinks}>
                <span>Project records</span>
                {[
                  ["brief", "Brief"], ["milestones", "Milestones"], ["deliverables", "Deliverables"],
                  ["team", "Team"], ["files", "Files"], ["comms", "Comms"], ["calendar", "Calendar"],
                ].map(([tab, label]) => (
                  <Link
                    key={tab}
                    href={projectHref(`/projects/${encodeURIComponent(projectId)}`, { surface: null, tab })}
                    title={label}
                    aria-label={label}
                    aria-current={activeRecordTab === tab ? "page" : undefined}
                    onClick={onNavigate}
                  >
                    <span className={styles.label}>{label}</span>
                  </Link>
                ))}
              </div>
            ) : null}
            </div>
          ) : null}
        </div>
        <Link href={demoMode ? "/settings?demo=1" : "/settings"} title={compact ? "Settings" : undefined} onClick={onNavigate}>
          <Settings size={18} />
          <span className={styles.label}>Settings</span>
        </Link>
      </nav>

      {onCollapse ? (
        <button className={styles.collapse} type="button" onClick={onCollapse} title="Compact project rail">
          <PanelLeftClose size={17} />
          <span className={styles.label}>Compact rail</span>
        </button>
      ) : null}
    </div>
  );
}

interface ProjectNavigationDrawerProps extends Omit<ProjectNavigationProps, "compact" | "onCollapse" | "onNavigate"> {
  open: boolean;
  onClose: () => void;
}

export function CockpitProjectNavigationDrawer({
  open,
  onClose,
  demoMode = false,
  ...navigationProps
}: ProjectNavigationDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useDialogFocus(open, drawerRef, onClose, closeRef);

  if (!open) return null;

  return (
    <div className={styles.drawerOverlay} role="presentation" onMouseDown={onClose}>
      <aside
        ref={drawerRef}
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-label="Project navigation"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={styles.drawerHead}>
          <CoProductionBrand />
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close project navigation"><X size={20} /></button>
        </header>
        <div className={styles.drawerBody}>
          <CockpitProjectNavigation {...navigationProps} demoMode={demoMode} onNavigate={onClose} />
        </div>
      </aside>
    </div>
  );
}

interface CockpitMobileNavigationProps extends CockpitNavigationModeProps {
  activeSection: CockpitSection;
  dueTodayCount: number;
  activeRecordTab?: string;
  activeWhiteboard?: boolean;
  drawerOpen: boolean;
  onSelect: (section: CockpitSection) => void;
  onOpenDrawer: () => void;
}

export function CockpitMobileNavigation({
  activeSection,
  dueTodayCount,
  activeRecordTab,
  activeWhiteboard = false,
  drawerOpen,
  onSelect,
  onOpenDrawer,
}: CockpitMobileNavigationProps) {
  const hasProjectSurfaceActive = !activeRecordTab && !activeWhiteboard;

  return (
    <nav className={styles.mobileBar} aria-label="Mobile project workspace">
      {MOBILE_COCKPIT_NAVIGATION.map((item) => {
        const Icon = ICONS[item.icon];
        return (
          <button
            key={item.id}
            type="button"
            data-active={hasProjectSurfaceActive && activeSection === item.id}
            aria-current={hasProjectSurfaceActive && activeSection === item.id ? "page" : undefined}
            onClick={() => onSelect(item.id)}
          >
            <Icon size={20} />
            <span>{item.shortLabel}</span>
            {item.id === "tasks" && dueTodayCount > 0 ? <span className={styles.badge}>{dueTodayCount}</span> : null}
          </button>
        );
      })}
      <button type="button" onClick={onOpenDrawer} aria-label="More project navigation" aria-expanded={drawerOpen}>
        <Menu size={20} />
        <span>More</span>
      </button>
    </nav>
  );
}
