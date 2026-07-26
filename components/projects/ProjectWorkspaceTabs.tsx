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
import { useCallback, useRef, type KeyboardEvent } from "react";
import { Presentation } from "lucide-react";
import ProjectCockpit, { type CockpitUploadStatus } from "./ProjectCockpit";
import ProjectBriefPanel from "./ProjectBriefPanel";
import ProjectMilestonesPanel from "./ProjectMilestonesPanel";
import ProjectDeliverablesPanel from "./ProjectDeliverablesPanel";
import ProjectTeamPanel from "./ProjectTeamPanel";
import ProjectFilesPanel from "./ProjectFilesPanel";
import ProjectCommsPanel from "./ProjectCommsPanel";
import ProjectCalendarPanel from "./ProjectCalendarPanel";
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
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

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

  function onTabListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const currentIndex = WORKSPACE_TABS.findIndex((tab) => tab.id === activeTab);
    let nextIndex = -1;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % WORKSPACE_TABS.length;
    else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + WORKSPACE_TABS.length) % WORKSPACE_TABS.length;
    } else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = WORKSPACE_TABS.length - 1;
    if (nextIndex === -1) return;
    event.preventDefault();
    selectTab(WORKSPACE_TABS[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <div>
      <div
        className={styles.tabBar}
        role="tablist"
        aria-label={`${project.name} project workspace`}
        onKeyDown={onTabListKeyDown}
      >
        {WORKSPACE_TABS.map((tab, index) => (
          <button
            key={tab.id}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
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
        ))}
        <Link
          className={styles.tabLink}
          href={`/projects/${encodeURIComponent(id)}/whiteboard?demo=1`}
        >
          <Presentation size={15} aria-hidden="true" />
          Whiteboard
        </Link>
      </div>

      <div
        role="tabpanel"
        id={`project-tabpanel-${activeTab}`}
        aria-labelledby={`project-tab-${activeTab}`}
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
  );
}
