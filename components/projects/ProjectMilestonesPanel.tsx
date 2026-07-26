"use client";

/**
 * P24 Milestones tab — kickoff, pre-production, shoot dates, edit rounds,
 * approval, delivery. States and dates are derived from the Project
 * Operating Record (lib/projects/milestones.ts) — never hand-entered.
 */

import { useMemo } from "react";
import {
  deriveProjectMilestones,
  type WorkspaceMilestoneState,
} from "@/lib/projects/milestones.ts";
import { formatDateShort } from "@/lib/projects/dates.ts";
import { useDemoWorkspace } from "@/lib/demo/workspace-store";
import styles from "./ProjectWorkspaceTabs.module.css";

const STATE_LABELS: Record<WorkspaceMilestoneState, string> = {
  done: "Done",
  current: "Now",
  upcoming: "Upcoming",
  at_risk: "At risk",
};

function dotClass(state: WorkspaceMilestoneState) {
  switch (state) {
    case "done": return styles.milestoneDotDone;
    case "current": return styles.milestoneDotCurrent;
    case "at_risk": return styles.milestoneDotAtRisk;
    default: return styles.milestoneDot;
  }
}

function chipClass(state: WorkspaceMilestoneState) {
  switch (state) {
    case "done": return styles.chipSuccess;
    case "current": return styles.chipAccent;
    case "at_risk": return styles.chipWarning;
    default: return styles.chip;
  }
}

export default function ProjectMilestonesPanel({ projectId }: { projectId: string }) {
  const workspace = useDemoWorkspace();
  const milestones = useMemo(() => {
    const scoped = <T extends { project_id: string }>(rows: readonly T[]) =>
      rows.filter((row) => row.project_id === projectId);
    return deriveProjectMilestones({
      stage: workspace.projects.find((project) => project.id === projectId)?.stage ?? "development",
      briefs: scoped(workspace.briefs),
      proposals: scoped(workspace.proposals),
      planItems: scoped(workspace.planItems),
      productionDays: scoped(workspace.productionDays),
      revisionRequests: scoped(workspace.revisionRequests),
      approvalStages: workspace.approvalStages.filter((stage) => stage.project_id === projectId),
      deliverables: scoped(workspace.deliverables),
      today: new Date().toISOString().slice(0, 10),
    });
  }, [workspace, projectId]);

  return (
    <div className={styles.panelInner}>
      <div className={styles.panelHeader}>
        <div>
          <h2 className={styles.panelTitle}>Milestones</h2>
          <p className={styles.panelSubtitle}>
            Kickoff through delivery, derived from the project record.
          </p>
        </div>
      </div>
      <ol className={`${styles.card} ${styles.milestoneList}`}>
        {milestones.map((milestone) => (
          <li key={milestone.id} className={styles.milestoneItem}>
            <span className={dotClass(milestone.state)} aria-hidden="true" />
            <div>
              <div className={styles.milestoneHeading}>
                <span className={styles.milestoneLabel}>{milestone.label}</span>
                <span className={chipClass(milestone.state)}>{STATE_LABELS[milestone.state]}</span>
                {milestone.date && (
                  <span className={styles.milestoneDate}>{formatDateShort(milestone.date)}</span>
                )}
              </div>
              <span className={styles.muted}>{milestone.detail}</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
