"use client";

/**
 * Project workspace route compatibility.
 *
 * The player-first cockpit and the retained ?tab= record routes are views into
 * the same project. The shared project rail is the only visible taxonomy; a
 * retained record route expands its named secondary group and marks itself.
 */

import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, type ReactNode } from "react";
import { BriefcaseBusiness, ChevronDown, Menu, Plus } from "lucide-react";
import ProjectCockpit, { type CockpitUploadStatus } from "./ProjectCockpit";
import ProjectBriefPanel from "./ProjectBriefPanel";
import ProjectMilestonesPanel from "./ProjectMilestonesPanel";
import ProjectDeliverablesPanel from "./ProjectDeliverablesPanel";
import ProjectTeamPanel from "./ProjectTeamPanel";
import ProjectFilesPanel from "./ProjectFilesPanel";
import ProjectCommsPanel from "./ProjectCommsPanel";
import ProjectCalendarPanel from "./ProjectCalendarPanel";
import type { CockpitSection } from "@/components/cockpit/cockpit-navigation";
import {
  CockpitMobileNavigation,
  CockpitProjectNavigation,
  CockpitProjectNavigationDrawer,
} from "@/components/cockpit/CockpitNavigation";
import CoProductionBrand from "@/components/brand/CoProductionBrand";
import { useCockpitLayout } from "@/components/cockpit/useCockpitLayout";
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
  onUploadRevision?: (assetId: string) => void;
  onUploadDismiss?: () => void;
}

export interface ProjectWorkspaceChromeProps {
  activeRecordTab?: WorkspaceTabId;
  activeWhiteboard?: boolean;
  children: ReactNode;
  project: DemoProject;
  projects?: DemoProject[];
  demoMode: boolean;
  projectQuery: string;
  uploading: boolean;
  onUpload: () => void;
  primaryActionLabel?: string;
  onSelect: (section: CockpitSection) => void;
}

export function ProjectWorkspaceChrome({
  activeRecordTab,
  activeWhiteboard = false,
  children,
  project,
  projects,
  demoMode,
  projectQuery,
  uploading,
  onUpload,
  primaryActionLabel = "Upload",
  onSelect,
}: ProjectWorkspaceChromeProps) {
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { layout, toggleRail } = useCockpitLayout(project.id);
  const compactRail = layout.rail === "compact";

  return (
    <div className={`cockpit-shell ${styles.recordShell}`} data-rail={compactRail ? "compact" : "expanded"}>
      <a className={styles.skipLink} href="#project-record-content">Skip to project workspace</a>
      <header className="cockpit-header">
        <Link className="cockpit-brand" href={demoMode ? "/projects?demo=1" : "/projects"} aria-label="Co‑VideoPro projects">
          <CoProductionBrand className={styles.brandLockup} priority />
        </Link>
        <div className="cockpit-project-switcher">
          <button
            className="cockpit-mobile-menu"
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open project navigation"
            aria-expanded={mobileNavOpen}
          >
            <Menu size={20} />
          </button>
          <BriefcaseBusiness size={21} />
          <label>
            <span>Projects</span>
            <select
              value={project.id}
              onChange={(event) => router.push(`/projects/${event.target.value}${demoMode ? "?demo=1" : ""}`)}
              aria-label="Current project"
            >
              {(projects ?? [project]).map((candidate) => (
                <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
              ))}
            </select>
          </label>
          <ChevronDown size={15} aria-hidden="true" />
        </div>
        <span className={styles.recordHeaderFill} aria-hidden="true" />
        <div className="cockpit-header-actions">
          <button
            className="cockpit-action-primary"
            type="button"
            onClick={onUpload}
            disabled={uploading}
            aria-label={uploading ? "Uploading media" : primaryActionLabel === "Upload" ? "Upload media" : primaryActionLabel}
          >
            <Plus size={18} /> <span>{uploading ? "Uploading" : primaryActionLabel}</span>
          </button>
        </div>
      </header>

      <aside className="cockpit-sidebar" aria-label="Project navigation rail">
        <CockpitProjectNavigation
          activeSection="overview"
          dueTodayCount={0}
          projectId={project.id}
          projectQuery={projectQuery}
          activeRecordTab={activeRecordTab}
          activeWhiteboard={activeWhiteboard}
          demoMode={demoMode}
          compact={compactRail}
          onSelect={onSelect}
          onCollapse={toggleRail}
        />
      </aside>
      <CockpitProjectNavigationDrawer
        open={mobileNavOpen}
        activeSection="overview"
        dueTodayCount={0}
        projectId={project.id}
        projectQuery={projectQuery}
        activeRecordTab={activeRecordTab}
        activeWhiteboard={activeWhiteboard}
        demoMode={demoMode}
        onSelect={onSelect}
        onClose={() => setMobileNavOpen(false)}
      />
      <CockpitMobileNavigation
        activeSection="overview"
        dueTodayCount={0}
        activeRecordTab={activeRecordTab}
        activeWhiteboard={activeWhiteboard}
        drawerOpen={mobileNavOpen}
        onSelect={onSelect}
        onOpenDrawer={() => setMobileNavOpen(true)}
      />
      <main id="project-record-content" className={`cockpit-main ${styles.recordMain}`} tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}

export default function ProjectWorkspaceTabs(props: ProjectWorkspaceTabsProps) {
  const { project } = props;
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: WorkspaceTabId = isWorkspaceTab(tabParam) ? tabParam : "overview";
  const selectCockpitSection = useCallback(
    (section: CockpitSection) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("tab");
      params.set("surface", section);
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const recordPanel = (
    <div
      role="tabpanel"
      id={`project-tabpanel-${activeTab}`}
      aria-label={`${project.name} ${activeTab} workspace`}
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
  );

  if (activeTab === "overview") return recordPanel;

  return (
    <ProjectWorkspaceChrome
      activeRecordTab={activeTab}
      project={project}
      projects={props.projects}
      demoMode
      projectQuery={searchParams.toString()}
      uploading={props.uploading}
      onUpload={props.onUpload}
      onSelect={selectCockpitSection}
    >
      {recordPanel}
    </ProjectWorkspaceChrome>
  );
}
