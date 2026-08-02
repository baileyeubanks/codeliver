"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BriefcaseBusiness, ChevronDown, Menu, Search, X } from "lucide-react";
import { NAVIGATION_ICONS } from "./navigation-icons";
import {
  activeNavigationId,
  mobileNavigation,
  visibleNavigation,
  withWorkspaceQuery,
  type WorkspaceRole,
} from "./navigation-model";
import { useDialogFocus } from "./useDialogFocus";
import styles from "./WorkspaceNavigation.module.css";
import CoProductionBrand from "@/components/brand/CoProductionBrand";

interface ProjectNavigationTarget {
  id: string;
  name: string;
}

interface WorkspaceNavigationProps {
  pathname: string;
  querySuffix: string;
  role: WorkspaceRole;
  drawerOpen: boolean;
  projects?: readonly ProjectNavigationTarget[];
  onOpenDrawer: () => void;
  onCloseDrawer: () => void;
  onOpenCommandPalette: () => void;
}

export default function WorkspaceNavigation({
  pathname,
  querySuffix,
  role,
  drawerOpen,
  projects = [],
  onOpenDrawer,
  onCloseDrawer,
  onOpenCommandPalette,
}: WorkspaceNavigationProps) {
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const sections = useMemo(() => visibleNavigation(role), [role]);
  const mobile = useMemo(() => mobileNavigation(role).slice(0, 3), [role]);
  const activeId = activeNavigationId(pathname, role);
  const activeProjectId = pathname.match(/^\/projects\/([^/]+)/)?.[1] ?? null;
  const [collapsedSections, setCollapsedSections] = useState<ReadonlySet<string>>(new Set());
  useDialogFocus(drawerOpen, drawerRef, onCloseDrawer, closeRef);

  function toggleSection(sectionId: string) {
    setCollapsedSections((current) => {
      const next = new Set(current);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }

  return (
    <>
      <nav className={styles.mobileBar} aria-label="Mobile workspace">
        {mobile.map((item) => {
          const Icon = NAVIGATION_ICONS[item.icon];
          return (
            <Link
              key={item.id}
              href={withWorkspaceQuery(item.href, querySuffix)}
              data-active={activeId === item.id}
              aria-current={activeId === item.id ? "page" : undefined}
            >
              <Icon size={20} />
              <span>{item.shortLabel}</span>
            </Link>
          );
        })}
        <button type="button" onClick={onOpenDrawer} aria-label="More workspace navigation" aria-expanded={drawerOpen}>
          <Menu size={20} />
          <span>More</span>
        </button>
      </nav>

      {drawerOpen ? (
        <div className={styles.drawerOverlay} role="presentation" onMouseDown={onCloseDrawer}>
          <aside
            ref={drawerRef}
            className={styles.drawer}
            role="dialog"
            aria-modal="true"
            aria-label="Workspace navigation"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className={styles.drawerHeader}>
              <CoProductionBrand priority />
              <button ref={closeRef} className={styles.iconButton} type="button" onClick={onCloseDrawer} aria-label="Close workspace navigation">
                <X size={20} />
              </button>
            </header>

            <button
              className={styles.commandButton}
              type="button"
              onClick={() => {
                onCloseDrawer();
                window.requestAnimationFrame(onOpenCommandPalette);
              }}
            >
              <Search size={17} />
              <span>Search workspace</span>
            </button>

            <div className={styles.drawerScroll}>
              {projects.length > 0 ? (
                <section className={styles.group}>
                  <button
                    className={styles.groupToggle}
                    type="button"
                    aria-expanded={!collapsedSections.has("recent-projects")}
                    onClick={() => toggleSection("recent-projects")}
                  >
                    Recent projects <ChevronDown size={14} />
                  </button>
                  {!collapsedSections.has("recent-projects") ? (
                    <div className={styles.recentProjects}>
                      {projects.slice(0, 6).map((project) => (
                        <Link
                          key={project.id}
                          href={withWorkspaceQuery(`/projects/${project.id}`, querySuffix)}
                          data-active={activeProjectId === project.id}
                          aria-current={activeProjectId === project.id ? "page" : undefined}
                          onClick={onCloseDrawer}
                        >
                          <BriefcaseBusiness size={16} />
                          <span>{project.name}</span>
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </section>
              ) : null}

              {sections.map((section) => {
                const expanded = !collapsedSections.has(section.id);
                return (
                  <section className={styles.group} key={section.id}>
                    <button
                      className={styles.groupToggle}
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => toggleSection(section.id)}
                    >
                      {section.label} <ChevronDown size={14} />
                    </button>
                    {expanded ? (
                      <div className={styles.groupLinks}>
                        {section.items.map((item) => {
                          const Icon = NAVIGATION_ICONS[item.icon];
                          return (
                            <Link
                              key={item.id}
                              href={withWorkspaceQuery(item.href, querySuffix)}
                              data-active={activeId === item.id}
                              aria-current={activeId === item.id ? "page" : undefined}
                              onClick={onCloseDrawer}
                            >
                              <span className={styles.linkIcon}><Icon size={17} /></span>
                              <span className={styles.linkCopy}>
                                <strong>{item.label}</strong>
                                <small>{item.description}</small>
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>

            <footer className={styles.drawerFooter}>
              <span>Co‑VideoPro workspace</span>
              <strong>{role}</strong>
            </footer>
          </aside>
        </div>
      ) : null}
    </>
  );
}
