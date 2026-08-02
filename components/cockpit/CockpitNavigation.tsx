"use client";

import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  FileSliders,
  History,
  Home,
  LayoutGrid,
  Menu,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  type LucideIcon,
} from "lucide-react";
import { useDialogFocus } from "@/components/navigation/useDialogFocus";
import {
  COCKPIT_LIFECYCLE_NAVIGATION,
  COCKPIT_MORE_VIEWS_NAVIGATION,
  MOBILE_COCKPIT_NAVIGATION,
  type CockpitNavigationItem,
  type CockpitNavigationIcon,
  type CockpitSection,
} from "./cockpit-navigation";
import styles from "./CockpitNavigation.module.css";
import CoProductionBrand from "@/components/brand/CoProductionBrand";

const ICONS: Record<CockpitNavigationIcon, LucideIcon> = {
  approvals: CheckCircle2,
  home: Home,
  media: LayoutGrid,
  metadata: FileSliders,
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
  compact?: boolean;
  overviewOpen?: boolean;
  onSelect: (section: CockpitSection) => void;
  onCollapse?: () => void;
  onNavigate?: () => void;
  moreViewsId?: string;
}

interface CockpitNavigationItemButtonProps {
  activeSection: CockpitSection;
  compact: boolean;
  dueTodayCount: number;
  item: CockpitNavigationItem;
  overviewOpen: boolean;
  onSelect: (section: CockpitSection) => void;
}

function CockpitNavigationItemButton({
  activeSection,
  compact,
  dueTodayCount,
  item,
  overviewOpen,
  onSelect,
}: CockpitNavigationItemButtonProps) {
  const Icon = ICONS[item.icon];
  const isOverview = item.id === "overview";
  const isActive = activeSection === item.id;

  return (
    <button
      type="button"
      data-active={isActive}
      aria-current={isActive ? "page" : undefined}
      aria-expanded={isOverview ? overviewOpen : undefined}
      aria-controls={isOverview ? "cockpit-project-overview" : undefined}
      aria-label={compact ? item.label : undefined}
      onClick={() => onSelect(item.id)}
      title={compact ? item.label : undefined}
    >
      <Icon size={18} />
      <span className={styles.label}>{item.label}</span>
      {item.id === "tasks" && dueTodayCount > 0 ? <small className={styles.badge}>{dueTodayCount}</small> : null}
    </button>
  );
}

export function CockpitProjectNavigation({
  activeSection,
  dueTodayCount,
  compact = false,
  overviewOpen = false,
  onSelect,
  onCollapse,
  onNavigate,
  moreViewsId = "cockpit-project-more-views",
}: ProjectNavigationProps) {
  const moreViewIsActive = COCKPIT_MORE_VIEWS_NAVIGATION.some((item) => item.id === activeSection);
  const [moreViewsOpen, setMoreViewsOpen] = useState(moreViewIsActive);
  const RailToggleIcon = compact ? PanelLeftOpen : PanelLeftClose;

  useEffect(() => {
    if (moreViewIsActive) setMoreViewsOpen(true);
  }, [moreViewIsActive]);

  function select(section: CockpitSection) {
    onSelect(section);
    onNavigate?.();
  }

  return (
    <div className={`${styles.rail} ${compact ? styles.compact : ""}`}>
      <nav className={styles.primary} aria-label="Project workspace">
        {COCKPIT_LIFECYCLE_NAVIGATION.map((item) => (
          <CockpitNavigationItemButton
            key={item.id}
            activeSection={activeSection}
            compact={compact}
            dueTodayCount={dueTodayCount}
            item={item}
            overviewOpen={overviewOpen}
            onSelect={select}
          />
        ))}
        <button
          className={styles.moreToggle}
          type="button"
          data-active={moreViewIsActive}
          aria-expanded={moreViewsOpen}
          aria-controls={moreViewsId}
          aria-label={compact ? "More views" : undefined}
          onClick={() => setMoreViewsOpen((open) => !open)}
          title={compact ? "More views" : undefined}
        >
          <Menu size={18} />
          <span className={styles.label}>More views</span>
          <ChevronDown className={styles.moreChevron} size={16} aria-hidden="true" />
        </button>
        <div id={moreViewsId} className={styles.moreViews} hidden={!moreViewsOpen}>
          {COCKPIT_MORE_VIEWS_NAVIGATION.map((item) => (
            <CockpitNavigationItemButton
              key={item.id}
              activeSection={activeSection}
              compact={compact}
              dueTodayCount={dueTodayCount}
              item={item}
              overviewOpen={overviewOpen}
              onSelect={select}
            />
          ))}
        </div>
      </nav>

      {onCollapse ? (
        <button
          className={styles.collapse}
          type="button"
          onClick={onCollapse}
          aria-label={compact ? "Expand project rail" : undefined}
          title={compact ? "Expand project rail" : "Compact project rail"}
        >
          <RailToggleIcon size={17} />
          <span className={styles.label}>Compact rail</span>
        </button>
      ) : null}
    </div>
  );
}

interface ProjectNavigationDrawerProps extends Omit<ProjectNavigationProps, "compact" | "moreViewsId" | "onCollapse" | "onNavigate"> {
  open: boolean;
  onClose: () => void;
}

export function CockpitProjectNavigationDrawer({
  open,
  onClose,
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
        id="cockpit-project-navigation-drawer"
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
          <CockpitProjectNavigation
            {...navigationProps}
            moreViewsId="cockpit-project-more-views-drawer"
            onNavigate={onClose}
          />
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
            title={item.label}
          >
            <Icon size={20} />
            <span>{item.shortLabel}</span>
            {item.id === "tasks" && dueTodayCount > 0 ? <span className={styles.badge}>{dueTodayCount}</span> : null}
          </button>
          );
      })}
      <button
        type="button"
        onClick={onOpenDrawer}
        aria-label="More project navigation"
        aria-controls="cockpit-project-navigation-drawer"
        aria-expanded={drawerOpen}
        aria-haspopup="dialog"
        title="More project navigation"
      >
        <Menu size={20} />
        <span>More</span>
      </button>
    </nav>
  );
}
