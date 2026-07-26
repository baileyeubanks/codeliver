"use client";

/**
 * P21 — Producer summary view: a printable one-page brief (project, asset,
 * version, review window, comments by classification with timecodes, triage
 * states, approval status). PDF export is honest: the browser's print dialog
 * does the saving; no fake binary generation.
 */
import type { SummaryCommentInput } from "@/lib/summary/consolidate";

import TriageBoard from "./TriageBoard";
import styles from "./summary.module.css";

export interface ProducerSummaryPanelProps {
  projectName: string;
  assetTitle: string;
  versionLabel: string;
  /** Human-readable review window, e.g. "Jul 21 – Jul 25, 2026". */
  reviewWindow: string;
  /** Honest approval status line, e.g. "1 of 2 steps approved". */
  approvalStatus: string;
  comments: SummaryCommentInput[];
  /** Display name recorded as completer on triage actions. */
  completerName: string;
  onSeek?: (seconds: number) => void;
}

export default function ProducerSummaryPanel({
  projectName,
  assetTitle,
  versionLabel,
  reviewWindow,
  approvalStatus,
  comments,
  completerName,
  onSeek,
}: ProducerSummaryPanelProps) {
  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <h2 className={styles.headerTitle}>Producer review summary</h2>
        <div className={styles.headerMeta}>
          <span>
            Project <strong>{projectName}</strong>
          </span>
          <span>
            Asset <strong>{assetTitle}</strong>
          </span>
          <span>
            Version <strong>{versionLabel}</strong>
          </span>
          <span>
            Review window <strong>{reviewWindow}</strong>
          </span>
          <span>
            Approval <strong>{approvalStatus}</strong>
          </span>
        </div>
      </header>

      <TriageBoard comments={comments} completerName={completerName} onSeek={onSeek} />

      <div className={`${styles.printActions} no-print`}>
        <button
          type="button"
          className={styles.printButton}
          onClick={() => window.print()}
        >
          Open print dialog to save as PDF
        </button>
      </div>

      <p className={styles.printOnly}>
        Generated from the local review record. Classifications are rule-based
        suggestions unless marked as producer-confirmed.
      </p>
    </div>
  );
}
