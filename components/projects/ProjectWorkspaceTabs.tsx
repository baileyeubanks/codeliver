"use client";

/**
 * P24 Project Workspace tabs.
 *
 * The project route becomes a tabbed workspace: the existing cockpit is the
 * Overview tab, and Brief / Milestones / Deliverables / Team / Files / Comms /
 * Calendar are live views over the same Project Operating Record. Whiteboard
 * stays its own full-screen route and is linked, not rebuilt.
 *
 * A11y: role=tablist/tab/tabpanel with roving tabindex; ArrowLeft/ArrowRight/
 * Home/End move between tabs (automatic activation). Every target is ≥44px.
 */

import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Presentation } from "lucide-react";
import ProjectCockpit, { type CockpitUploadStatus } from "./ProjectCockpit";
import ProjectBriefPanel from "./ProjectBriefPanel";
import ProjectMilestonesPanel from "./ProjectMilestonesPanel";
import ProjectDeliverablesPanel from "./ProjectDeliverablesPanel";
import ProjectTeamPanel from "./ProjectTeamPanel";
import ProjectFilesPanel from "./ProjectFilesPanel";
import ProjectCommsPanel from "./ProjectCommsPanel";
import ProjectCalendarPanel from "./ProjectCalendarPanel";
import type { CockpitSection } from "@/components/cockpit/cockpit-navigation";
import { CockpitProjectNavigation } from "@/components/cockpit/CockpitNavigation";
import type { DemoProject } from "@/lib/demo/workspace";
import type { MediaAsset } from "./MediaCard";
import styles from "./ProjectWorkspaceTabs.module.css";

export const WORKSPACE_TABS = [
  { id: "overview", label: "Overview" },
  { id: "brief", label: "Brief" },
  { id: "milestones", label: "Milestones" },
  { id: "deliverables", label: "Deliverables" },
  { id: "team", label: "Team" },
  { id: "files", label: "Files" },
  { id: "comms", label: "Comms" },
  { id: "calendar", label: "Calendar" },
] as const;

export type WorkspaceTabId = (typeof WORKSPACE_TABS)[number]["id"];

const COCKPIT_MENU_GROUPS: ReadonlyArray<{
  label: string;
  items: ReadonlyArray<{ id: CockpitSection; label: string }>;
}> = [
  {
    label: "Make",
    items: [
      { id: "creative", label: "Creative" },
      { id: "proposal", label: "Proposal" },
      { id: "plan", label: "Plan" },
      { id: "media", label: "Media" },
      { id: "sequences", label: "Sequences" },
    ],
  },
  {
    label: "Review and deliver",
    items: [
      { id: "reviews", label: "Reviews" },
      { id: "approvals", label: "Approvals" },
      { id: "delivery", label: "Delivery" },
      { id: "versions", label: "Versions" },
    ],
  },
  {
    label: "Operate",
    items: [
      { id: "tasks", label: "Tasks" },
      { id: "metadata", label: "Metadata" },
    ],
  },
];

function isWorkspaceTab(value: string | null): value is WorkspaceTabId {
  return WORKSPACE_TABS.some((tab) => tab.id === value);
}

export interface ProjectWorkspaceTabsProps {
  project: DemoProject;
  assets: MediaAsset[];
  projects?: DemoProject[];
  uploading: boolean;
  uploadStatus: CockpitUploadStatus | null;
  onUpload: () => void;
  onUploadRevision?: (assetId: string) => void;
  onUploadDismiss?: () => void;
}

export default function ProjectWorkspaceTabs(props: ProjectWorkspaceTabsProps) {
  const { project } = props;
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: WorkspaceTabId = isWorkspaceTab(tabParam) ? tabParam : "overview";
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const projectMenuButtonRef = useRef<HTMLButtonElement>(null);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);

  useEffect(() => {
    if (!projectMenuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !projectMenuRef.current?.contains(event.target)) {
        setProjectMenuOpen(false);
      }
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setProjectMenuOpen(false);
      projectMenuButtonRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [projectMenuOpen]);

  const selectTab = useCallback(
    (tab: WorkspaceTabId) => {
      const params = new URLSearchParams(searchParams.toString());
      if (tab === "overview") {
        params.delete("tab");
      } else {
        params.set("tab", tab);
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const selectCockpitSection = useCallback(
    (section: CockpitSection) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("tab");
      params.set("surface", section);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  function renderWorkspaceTab(tab: (typeof WORKSPACE_TABS)[number]) {
    return (
      <button
        key={tab.id}
        type="button"
        role="tab"
        id={`project-tab-${tab.id}`}
        aria-selected={activeTab === tab.id}
        aria-controls={`project-tabpanel-${tab.id}`}
        tabIndex={activeTab === tab.id ? 0 : -1}
        className={activeTab === tab.id ? styles.tabActive : styles.tab}
        onClick={() => selectTab(tab.id)}
      >
        {tab.label}
      </button>
    );
  }

  return (
    <div>
      <div
        className={styles.tabBar}
        role="tablist"
        aria-label={`${project.name} project workspace`}
      >
        {renderWorkspaceTab(WORKSPACE_TABS[0])}
        <Link
          className={styles.tabLink}
          href={`/projects/${encodeURIComponent(id)}/whiteboard?demo=1`}
        >
          <Presentation size={15} aria-hidden="true" />
          Whiteboard
        </Link>
        <div ref={projectMenuRef} className={styles.projectMenu}>
          <button
            ref={projectMenuButtonRef}
            id="project-workspace-menu-button"
            className={activeTab === "overview" ? styles.projectMenuButton : styles.projectMenuButtonActive}
            type="button"
            aria-haspopup="menu"
            aria-expanded={projectMenuOpen}
            aria-controls="project-workspace-menu"
            onClick={() => setProjectMenuOpen((open) => !open)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setProjectMenuOpen(true);
                window.requestAnimationFrame(() => {
                  projectMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
                });
              }
            }}
          >
            Project <ChevronDown size={15} aria-hidden="true" />
          </button>
          {projectMenuOpen ? (
            <div id="project-workspace-menu" className={styles.projectMenuList} role="menu" aria-label="Project records">
              {WORKSPACE_TABS.slice(1).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  data-active={activeTab === tab.id}
                  onClick={() => {
                    selectTab(tab.id);
                    setProjectMenuOpen(false);
                    projectMenuButtonRef.current?.focus();
                  }}
                  onKeyDown={(event) => {
                    const menuItems = Array.from(projectMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
                    const current = menuItems.indexOf(event.currentTarget);
                    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                      event.preventDefault();
                      const offset = event.key === "ArrowDown" ? 1 : -1;
                      menuItems[(current + offset + menuItems.length) % menuItems.length]?.focus();
                    }
                    if (event.key === "Home") { event.preventDefault(); menuItems[0]?.focus(); }
                    if (event.key === "End") { event.preventDefault(); menuItems.at(-1)?.focus(); }
                  }}
                >
                  {tab.label}
                </button>
              ))}
              {COCKPIT_MENU_GROUPS.map((group) => (
                <div key={group.label} className={styles.projectMenuGroup}>
                  <span>{group.label}</span>
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      tabIndex={-1}
                      onClick={() => {
                        selectCockpitSection(item.id);
                        setProjectMenuOpen(false);
                        projectMenuButtonRef.current?.focus();
                      }}
                      onKeyDown={(event) => {
                        const menuItems = Array.from(projectMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
                        const current = menuItems.indexOf(event.currentTarget);
                        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                          event.preventDefault();
                          const offset = event.key === "ArrowDown" ? 1 : -1;
                          menuItems[(current + offset + menuItems.length) % menuItems.length]?.focus();
                        }
                        if (event.key === "Home") { event.preventDefault(); menuItems[0]?.focus(); }
                        if (event.key === "End") { event.preventDefault(); menuItems.at(-1)?.focus(); }
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className={activeTab === "overview" ? undefined : styles.legacyWorkspace}>
        {activeTab !== "overview" ? (
          <aside className={styles.legacyRail} aria-label="Project navigation rail">
            <CockpitProjectNavigation
              activeSection="overview"
              dueTodayCount={0}
              projectId={id}
              demoMode
              onSelect={selectCockpitSection}
            />
          </aside>
        ) : null}
        <div
          role="tabpanel"
          id={`project-tabpanel-${activeTab}`}
          aria-labelledby={activeTab === "overview" ? "project-tab-overview" : "project-workspace-menu-button"}
          className={activeTab === "overview" ? undefined : styles.panel}
        >
        {activeTab === "overview" && (
          <ProjectCockpit
            project={project}
            assets={props.assets}
            demoMode
            projects={props.projects}
            uploading={props.uploading}
            uploadStatus={props.uploadStatus}
            onUpload={props.onUpload}
            onUploadRevision={props.onUploadRevision}
            onUploadDismiss={props.onUploadDismiss}
          />
        )}
        {activeTab === "brief" && <ProjectBriefPanel projectId={id} projectName={project.name} />}
        {activeTab === "milestones" && <ProjectMilestonesPanel projectId={id} />}
        {activeTab === "deliverables" && <ProjectDeliverablesPanel projectId={id} />}
        {activeTab === "team" && <ProjectTeamPanel projectId={id} />}
        {activeTab === "files" && <ProjectFilesPanel projectId={id} />}
        {activeTab === "comms" && <ProjectCommsPanel projectId={id} />}
        {activeTab === "calendar" && <ProjectCalendarPanel projectId={id} />}
        </div>
      </div>
    </div>
  );
}
