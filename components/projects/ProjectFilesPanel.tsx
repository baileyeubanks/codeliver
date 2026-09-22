"use client";

/**
 * P24 Files tab — briefs, scripts, brand assets, uploads, release forms, and
 * exports in six groups. Download links render only where a real file URL
 * exists; everything else honestly reads "Available on request".
 */

import { useMemo } from "react";
import { Download } from "lucide-react";
import { groupProjectFiles } from "@/lib/projects/files.ts";
import { useDemoWorkspace } from "@/lib/demo/workspace-store";
import styles from "./ProjectWorkspaceTabs.module.css";

export default function ProjectFilesPanel({ projectId }: { projectId: string }) {
  const workspace = useDemoWorkspace();
  const groups = useMemo(
    () =>
      groupProjectFiles({
        briefs: workspace.briefs.filter((brief) => brief.project_id === projectId),
        assets: workspace.assets.filter((asset) => asset.project_id === projectId),
        releases: workspace.releases.filter((release) => release.project_id === projectId),
        deliverables: workspace.deliverables.filter(
          (deliverable) => deliverable.project_id === projectId,
        ),
      }),
    [workspace.briefs, workspace.assets, workspace.releases, workspace.deliverables, projectId],
  );
  const populatedGroups = groups.filter((group) => group.rows.length > 0);
  const emptyGroups = groups.filter((group) => group.rows.length === 0);
  const availableFileCount = populatedGroups.reduce((total, group) => total + group.rows.length, 0);

  return (
    <div className={styles.panelInner}>
      <div className={styles.panelHeader}>
        <div>
          <h2 className={styles.panelTitle}>Files</h2>
          <p className={styles.panelSubtitle}>
            Project documents and media. Real downloads only — everything else is available on request.
          </p>
        </div>
      </div>

      {populatedGroups.length > 0 ? (
        <h3 className={styles.sectionHeading}>Available file records ({availableFileCount})</h3>
      ) : (
        <div className={styles.emptyRecordNotice} role="status">
          <h3>No project files are indexed</h3>
          <p>This project has no file records available in this workspace.</p>
        </div>
      )}

      {populatedGroups.map((group) => (
        <section key={group.id} className={styles.fileGroup} aria-label={group.label}>
          <h4 className={styles.fileGroupLabel}>{group.label}</h4>
          <ul className={styles.fileRows}>
            {group.rows.map((row) => (
              <li key={row.id} className={styles.fileRow}>
                <div>
                  <p className={styles.fileName}>{row.name}</p>
                  <p className={styles.fileDetail}>{row.detail}</p>
                </div>
                {row.availability === "download" && row.href ? (
                  <a className={styles.downloadLink} href={row.href} download>
                    <Download size={15} aria-hidden="true" />
                    Download
                  </a>
                ) : (
                  <span className={styles.onRequest}>Available on request</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {emptyGroups.length > 0 ? (
        <details className={styles.emptyFileGroups}>
          <summary>{emptyGroups.length} categories without file records</summary>
          <ul>
            {emptyGroups.map((group) => (
              <li key={group.id}>
                <strong>{group.label}</strong>
                <span>{group.emptyLabel}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
