"use client";

/**
 * Project workspace route compatibility.
 *
 * The player-first cockpit and the retained ?tab= record routes are views into
 * the same project. The shared project rail is the only visible taxonomy; a
 * retained record route expands its named secondary group and marks itself.
 */

import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
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
  const selectCockpitSection = useCallback(
    (section: CockpitSection) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("tab");
      params.set("surface", section);
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return (
    <div>
      <div className={activeTab === "overview" ? undefined : styles.legacyWorkspace}>
        {activeTab !== "overview" ? (
          <aside className={styles.legacyRail} aria-label="Project navigation rail">
            <CockpitProjectNavigation
              activeSection="overview"
              dueTodayCount={0}
              projectId={id}
              activeRecordTab={activeTab}
              demoMode
              onSelect={selectCockpitSection}
            />
          </aside>
        ) : null}
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
      </div>
    </div>
  );
}
