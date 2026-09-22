"use client";

/**
 * P24 Deliverables tab — every video, cutdown, and export package with
 * format, duration, status, timeline, and a real review link where one
 * exists. Rollup counts come from the same rows the table renders.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  buildDeliverableRows,
  rollupDeliverableRows,
  type DeliverableRecordLike,
} from "@/lib/projects/deliverables.ts";
import { formatDuration } from "@/lib/projects/dates.ts";
import { buildInternalDemoAssetHref } from "@/lib/demo/workspace";
import { useDemoWorkspace } from "@/lib/demo/workspace-store";
import styles from "./ProjectWorkspaceTabs.module.css";

export default function ProjectDeliverablesPanel({ projectId }: { projectId: string }) {
  const workspace = useDemoWorkspace();
  // Locked delivery (6.4): the export-package feed is the canonical
  // deliverables API, not the demo store; media rows still project live
  // assets from the workspace store.
  const [deliverables, setDeliverables] = useState<DeliverableRecordLike[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/deliverables`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { deliverables: [] }))
      .then((body: { deliverables?: DeliverableRecordLike[] }) => {
        if (!cancelled) setDeliverables(body.deliverables ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const rows = useMemo(
    () =>
      buildDeliverableRows({
        deliverables,
        assets: workspace.assets.filter((asset) => asset.project_id === projectId),
      }),
    [deliverables, workspace.assets, projectId],
  );
  const rollup = useMemo(() => rollupDeliverableRows(rows), [rows]);

  return (
    <div className={styles.panelInner}>
      <div className={styles.panelHeader}>
        <div>
          <h2 className={styles.panelTitle}>Deliverables</h2>
          <p className={styles.panelSubtitle}>
            {rollup.total} item{rollup.total === 1 ? "" : "s"} owed on this project.
          </p>
        </div>
      </div>

      <div className={styles.rollupRow} aria-label="Deliverable counts by status">
        {rollup.counts.map((entry) => (
          <span key={entry.statusKey} className={styles.chip}>
            {entry.count} {entry.label.toLowerCase()}
          </span>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className={styles.emptyState}>No deliverables on this project yet.</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Format</th>
                <th scope="col">Duration</th>
                <th scope="col">Status</th>
                <th scope="col">Timeline</th>
                <th scope="col">Review</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{row.format}</td>
                  <td>{formatDuration(row.durationSeconds)}</td>
                  <td>
                    <span className={styles.chipAccent}>{row.statusLabel}</span>
                  </td>
                  <td>{row.timeline}</td>
                  <td>
                    {row.reviewAssetId ? (
                      <Link
                        className={styles.reviewLink}
                        href={buildInternalDemoAssetHref(projectId, row.reviewAssetId)}
                      >
                        Open review
                      </Link>
                    ) : (
                      <span className={styles.muted}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
