"use client";

import Link from "next/link";
import { BriefcaseBusiness } from "lucide-react";
import CvpMonogram from "./CvpMonogram";
import { NAVIGATION_ICONS } from "./navigation-icons";
import {
  activeNavigationId,
  visibleNavigation,
  withWorkspaceQuery,
  type WorkspaceRole,
} from "./navigation-model";
import styles from "./WorkspaceRail.module.css";

interface ProjectNavigationTarget {
  id: string;
  name: string;
}

interface WorkspaceRailProps {
  pathname: string;
  querySuffix: string;
  role: WorkspaceRole;
  projects?: readonly ProjectNavigationTarget[];
}

/**
 * The new shell's left rail (desktop ≥901px): grouped navigation, recent
 * projects, and a quiet role footer. Mobile keeps the bottom bar + drawer
 * in WorkspaceNavigation. Only real surfaces appear here — no dead ends.
 */
export default function WorkspaceRail({ pathname, querySuffix, role, projects = [] }: WorkspaceRailProps) {
  const sections = visibleNavigation(role);
  const activeId = activeNavigationId(pathname, role);
  const activeProjectId = pathname.match(/^\/projects\/([^/]+)/)?.[1] ?? null;

  return (
    <nav className={styles.rail} aria-label="Workspace rail">
      <header className={styles.brandHeader}>
        <Link
          href={withWorkspaceQuery("/", querySuffix)}
          className={styles.brandLink}
          aria-label="Co‑VideoPro by Content Co-op home"
        >
          <CvpMonogram size={26} className={styles.brandMark} />
          <span className={styles.brandCopy}>
            <strong>Co‑VideoPro</strong>
            <small>by Content Co-op</small>
          </span>
        </Link>
      </header>
      <div className={styles.scroll}>
        {sections.map((section) => (
          <section key={section.id} className={styles.group}>
            <h2 className={styles.groupLabel}>{section.label}</h2>
            {section.items.map((item) => {
              const Icon = NAVIGATION_ICONS[item.icon];
              return (
                <Link
                  key={item.id}
                  href={withWorkspaceQuery(item.href, querySuffix)}
                  data-active={activeId === item.id}
                  aria-current={activeId === item.id ? "page" : undefined}
                  className={styles.item}
                  title={item.label}
                >
                  <Icon size={16} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </section>
        ))}

        {projects.length > 0 ? (
          <section className={styles.group}>
            <h2 className={styles.groupLabel}>Recent projects</h2>
            {projects.slice(0, 4).map((project) => (
              <Link
                key={project.id}
                href={withWorkspaceQuery(`/projects/${project.id}`, querySuffix)}
                data-active={activeProjectId === project.id}
                aria-current={activeProjectId === project.id ? "page" : undefined}
                className={styles.item}
                title={project.name}
              >
                <BriefcaseBusiness size={16} />
                <span>{project.name}</span>
              </Link>
            ))}
          </section>
        ) : null}
      </div>

      <footer className={styles.footer}>
        <span>Co‑VideoPro workspace</span>
        <strong>{role}</strong>
      </footer>
    </nav>
  );
}
