"use client";

import { useRef, useState } from "react";
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

interface CockpitNavigationModeProps {
  demoMode?: boolean;
}

interface ProjectNavigationProps extends CockpitNavigationModeProps {
  activeSection: CockpitSection;
  dueTodayCount: number;
  projectId?: string;
  compact?: boolean;
  overviewOpen?: boolean;
  onSelect: (section: CockpitSection) => void;
  onCollapse?: () => void;
  onNavigate?: () => void;
}

export function CockpitProjectNavigation({
  activeSection,
  dueTodayCount,
  projectId,
  compact = false,
  demoMode = false,
  overviewOpen = false,
  onSelect,
  onCollapse,
  onNavigate,
}: ProjectNavigationProps) {
  const [secondaryOpen, setSecondaryOpen] = useState(false);
  const primarySections = new Set<CockpitSection>(["overview", "media", "plan", "delivery"]);
  const primaryNavigation = COCKPIT_NAVIGATION.filter((item) => primarySections.has(item.id));
  const secondaryNavigation = COCKPIT_NAVIGATION.filter((item) => !primarySections.has(item.id));

  function select(section: CockpitSection) {
    onSelect(section);
    onNavigate?.();
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
              data-active={activeSection === item.id}
              aria-current={activeSection === item.id ? "page" : undefined}
              aria-expanded={item.id === "overview" ? overviewOpen : undefined}
              aria-controls={item.id === "overview" ? "cockpit-project-overview" : undefined}
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
            href={`/projects/${encodeURIComponent(projectId)}/whiteboard${demoMode ? "?demo=1" : ""}`}
            title={compact ? "Whiteboard" : undefined}
            onClick={onNavigate}
          >
            <CalendarDays size={18} />
            <span className={styles.label}>Whiteboard</span>
          </Link>
        ) : null}
        <button
          type="button"
          className={styles.moreButton}
          aria-expanded={secondaryOpen}
          aria-controls="project-secondary-navigation"
          onClick={() => setSecondaryOpen((open) => !open)}
        >
          <Menu size={18} />
          <span className={styles.label}>More project tools</span>
        </button>
        {secondaryOpen ? (
          <div id="project-secondary-navigation" className={styles.secondary} aria-label="More project tools">
            {secondaryNavigation.map((item) => {
              const Icon = ICONS[item.icon];
              return (
                <button
                  key={item.id}
                  type="button"
                  data-active={activeSection === item.id}
                  aria-current={activeSection === item.id ? "page" : undefined}
                  onClick={() => select(item.id)}
                >
                  <Icon size={18} />
                  <span className={styles.label}>{item.label}</span>
                </button>
              );
            })}
            {projectId ? (
              <div className={styles.recordLinks}>
                <span>Project records</span>
                {[
                  ["brief", "Brief"], ["milestones", "Milestones"], ["deliverables", "Deliverables"],
                  ["team", "Team"], ["files", "Files"], ["comms", "Comms"], ["calendar", "Calendar"],
                ].map(([tab, label]) => (
                  <Link key={tab} href={`/projects/${encodeURIComponent(projectId)}?${demoMode ? "demo=1&" : ""}tab=${tab}`} onClick={onNavigate}>
                    {label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
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
  drawerOpen: boolean;
  overviewOpen?: boolean;
  onSelect: (section: CockpitSection) => void;
  onOpenDrawer: () => void;
}

export function CockpitMobileNavigation({
  activeSection,
  dueTodayCount,
  drawerOpen,
  overviewOpen = false,
  onSelect,
  onOpenDrawer,
}: CockpitMobileNavigationProps) {
  return (
    <nav className={styles.mobileBar} aria-label="Mobile project workspace">
      {MOBILE_COCKPIT_NAVIGATION.map((item) => {
        const Icon = ICONS[item.icon];
        return (
          <button
            key={item.id}
            type="button"
            data-active={activeSection === item.id}
            aria-current={activeSection === item.id ? "page" : undefined}
            aria-expanded={item.id === "overview" ? overviewOpen : undefined}
            aria-controls={item.id === "overview" ? "cockpit-project-overview" : undefined}
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
