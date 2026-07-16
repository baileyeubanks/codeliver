"use client";

import {
  Check,
  Clapperboard,
  Ellipsis,
  Focus,
  MessageSquareText,
  PanelLeft,
  PanelRight,
  Save,
  Search,
  WifiOff,
} from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import type { CockpitLayoutMode } from "./cockpit-layout";
import styles from "./CockpitToolbar.module.css";

interface CockpitToolbarProps {
  mode: CockpitLayoutMode;
  railExpanded: boolean;
  dockOpen: boolean;
  online: boolean;
  savedAt: number | null;
  collaborators: readonly string[];
  lifecycleControl?: ReactNode;
  onModeChange: (mode: CockpitLayoutMode) => void;
  onToggleRail: () => void;
  onToggleDock: () => void;
  onSave: () => void;
  onOpenCommandPalette: () => void;
  commandButtonRef: RefObject<HTMLButtonElement | null>;
}

const MODE_OPTIONS = [
  { id: "review", label: "Review", icon: MessageSquareText },
  { id: "edit", label: "Edit", icon: Clapperboard },
  { id: "focus", label: "Focus", icon: Focus },
] as const;

const MOBILE_MEDIA_QUERY = "(max-width: 900px)";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function getMenuItems(menu: HTMLDivElement | null) {
  if (!menu) return [];
  return Array.from(
    menu.querySelectorAll<HTMLButtonElement>(
      '[role="menuitem"], [role="menuitemcheckbox"]',
    ),
  );
}

export default function CockpitToolbar({
  mode,
  railExpanded,
  dockOpen,
  online,
  savedAt,
  collaborators,
  lifecycleControl,
  onModeChange,
  onToggleRail,
  onToggleDock,
  onSave,
  onOpenCommandPalette,
  commandButtonRef,
}: CockpitToolbarProps) {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowMenuId = `cockpit-toolbar-overflow-${useId().replaceAll(":", "")}`;
  const overflowRootRef = useRef<HTMLDivElement>(null);
  const overflowButtonRef = useRef<HTMLButtonElement>(null);
  const overflowMenuRef = useRef<HTMLDivElement>(null);
  const desktopCommandButtonRef = useRef<HTMLButtonElement>(null);
  const initialMenuFocusRef = useRef<"first" | "last">("first");

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
    const overflowButton = overflowButtonRef.current;
    const desktopCommandButton = desktopCommandButtonRef.current;

    const assignActiveCommandButton = (mobile: boolean) => {
      commandButtonRef.current = mobile
        ? overflowButton
        : desktopCommandButton;
    };

    const handleBreakpointChange = (event: MediaQueryListEvent) => {
      assignActiveCommandButton(event.matches);
      if (!event.matches) setOverflowOpen(false);
    };

    assignActiveCommandButton(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleBreakpointChange);

    return () => {
      mediaQuery.removeEventListener("change", handleBreakpointChange);
      if (
        commandButtonRef.current === overflowButton
        || commandButtonRef.current === desktopCommandButton
      ) {
        commandButtonRef.current = null;
      }
    };
  }, [commandButtonRef]);

  useEffect(() => {
    if (!overflowOpen) return;

    const focusFrame = window.requestAnimationFrame(() => {
      const items = getMenuItems(overflowMenuRef.current);
      const targetIndex = initialMenuFocusRef.current === "last" ? items.length - 1 : 0;
      items[targetIndex]?.focus();
      initialMenuFocusRef.current = "first";
    });

    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node
        && !overflowRootRef.current?.contains(event.target)
      ) {
        setOverflowOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [overflowOpen]);

  function restoreOverflowFocus() {
    window.requestAnimationFrame(() => overflowButtonRef.current?.focus());
  }

  function runOverflowAction(action: () => void) {
    setOverflowOpen(false);
    action();
    restoreOverflowFocus();
  }

  function openCommandsFromOverflow() {
    setOverflowOpen(false);
    commandButtonRef.current = overflowButtonRef.current;
    onOpenCommandPalette();
  }

  function handleOverflowButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    initialMenuFocusRef.current = event.key === "ArrowUp" ? "last" : "first";
    setOverflowOpen(true);
  }

  function handleOverflowMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = getMenuItems(overflowMenuRef.current);
    if (items.length === 0) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);

    if (event.key === "Escape") {
      event.preventDefault();
      setOverflowOpen(false);
      restoreOverflowFocus();
      return;
    }

    if (event.key === "Tab") {
      setOverflowOpen(false);
      return;
    }

    let nextIndex: number | null = null;
    if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % items.length;
    if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + items.length) % items.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = items.length - 1;

    if (nextIndex !== null && items[nextIndex]) {
      event.preventDefault();
      items[nextIndex].focus();
    }
  }

  return (
    <div
      className={styles.toolbar}
      role="toolbar"
      aria-label="Cockpit layout controls"
      aria-orientation="horizontal"
    >
      <div className={styles.modes} role="group" aria-label="Workspace mode">
        {MODE_OPTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-label={`${label} workspace`}
            aria-pressed={mode === id}
            onClick={() => onModeChange(id)}
            title={`${label} workspace`}
          >
            <Icon size={15} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className={styles.desktopControls}>
        <span className={styles.divider} aria-hidden="true" />
        <button
          className={styles.iconButton}
          type="button"
          aria-label={railExpanded ? "Compact project rail" : "Expand project rail"}
          aria-pressed={railExpanded}
          onClick={onToggleRail}
          title={railExpanded ? "Compact project rail" : "Expand project rail"}
        >
          <PanelLeft size={17} aria-hidden="true" />
        </button>
        <button
          className={styles.iconButton}
          type="button"
          aria-label={dockOpen ? "Close operator dock" : "Open operator dock"}
          aria-pressed={dockOpen}
          onClick={onToggleDock}
          title={dockOpen ? "Close operator dock" : "Open operator dock"}
        >
          <PanelRight size={17} aria-hidden="true" />
        </button>
        <button
          ref={desktopCommandButtonRef}
          className={styles.commandButton}
          type="button"
          onClick={onOpenCommandPalette}
          title="Open project commands"
        >
          <Search size={16} aria-hidden="true" />
          <span>Commands</span>
        </button>
        <button
          className={styles.iconButton}
          type="button"
          onClick={onSave}
          aria-label="Save workspace layout"
          title="Save workspace layout"
        >
          <Save size={16} aria-hidden="true" />
        </button>
        {savedAt ? (
          <span className={styles.saved} role="status">
            <Check size={13} aria-hidden="true" /> Saved
          </span>
        ) : null}
      </div>

      <div className={styles.lifecycle}>{lifecycleControl}</div>

      <div className={styles.presence} aria-label={`${collaborators.length} collaborators in this project`}>
        <div className={styles.avatars} aria-hidden="true">
          {collaborators.slice(0, 3).map((name) => <span key={name} title={name}>{initials(name)}</span>)}
        </div>
        {online ? (
          <span className={styles.presenceLabel}>{collaborators.length} in project</span>
        ) : (
          <span className={styles.offline}><WifiOff size={13} aria-hidden="true" /> Offline</span>
        )}
      </div>

      <div ref={overflowRootRef} className={styles.overflow}>
        <button
          ref={overflowButtonRef}
          className={styles.overflowButton}
          type="button"
          aria-label="More cockpit controls"
          aria-haspopup="menu"
          aria-expanded={overflowOpen}
          aria-controls={overflowMenuId}
          title="More cockpit controls"
          onClick={() => setOverflowOpen((open) => !open)}
          onKeyDown={handleOverflowButtonKeyDown}
        >
          <Ellipsis size={19} aria-hidden="true" />
        </button>

        {overflowOpen ? (
          <div
            ref={overflowMenuRef}
            id={overflowMenuId}
            className={styles.overflowMenu}
            role="menu"
            aria-label="More cockpit controls"
            onKeyDown={handleOverflowMenuKeyDown}
          >
            <span className={styles.menuLabel} role="presentation">Workspace controls</span>
            <button
              className={styles.menuItem}
              type="button"
              role="menuitemcheckbox"
              aria-checked={dockOpen}
              tabIndex={-1}
              onClick={() => runOverflowAction(onToggleDock)}
            >
              <PanelRight size={17} aria-hidden="true" />
              <span className={styles.menuItemCopy}>
                <strong>Operator dock</strong>
                <small>{dockOpen ? "Visible" : "Hidden"}</small>
              </span>
              <span className={styles.menuItemState}>{dockOpen ? "On" : "Off"}</span>
            </button>
            <button
              className={styles.menuItem}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={openCommandsFromOverflow}
            >
              <Search size={17} aria-hidden="true" />
              <span className={styles.menuItemCopy}>
                <strong>Commands</strong>
                <small>Search project actions</small>
              </span>
            </button>
            <button
              className={styles.menuItem}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => runOverflowAction(onSave)}
            >
              <Save size={17} aria-hidden="true" />
              <span className={styles.menuItemCopy}>
                <strong>Save layout</strong>
                <small>Keep this workspace arrangement</small>
              </span>
            </button>

            <div className={styles.menuStatus} role="group" aria-label="Workspace status">
              {savedAt ? (
                <span role="status">
                  <Check size={13} aria-hidden="true" /> Saved
                </span>
              ) : null}
              {online ? (
                <span>{collaborators.length} in project</span>
              ) : (
                <span className={styles.offline}>
                  <WifiOff size={13} aria-hidden="true" /> Offline
                </span>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
