"use client";

/**
 * P21 — Triage board: every comment card can be triaged (Frame.io
 * completed/completer model — who triaged and when is always recorded) and
 * every suggested classification can be overridden by the producer.
 */
import {
  CLASSIFICATION_LABELS,
  SUMMARY_CLASSIFICATIONS,
  type SummaryClassification,
} from "@/lib/summary/classify";
import {
  consolidateComments,
  formatSummaryTimecode,
  type ClassifiedSummaryComment,
  type SummaryCommentInput,
} from "@/lib/summary/consolidate";
import {
  TRIAGE_STATE_LABELS,
  TRIAGE_STATES,
  triageCounts,
  type TriageState,
} from "@/lib/summary/triage";
import { useSummaryTriageStore } from "@/lib/summary/triageStore";

import styles from "./summary.module.css";

export interface TriageBoardProps {
  comments: SummaryCommentInput[];
  /** Display name recorded as the completer on every triage action. */
  completerName: string;
  /** Optional seek handler so a timecode can jump the player. */
  onSeek?: (seconds: number) => void;
}

function TriageCard({
  comment,
  completerName,
  onSeek,
}: {
  comment: ClassifiedSummaryComment;
  completerName: string;
  onSeek?: (seconds: number) => void;
}) {
  const record = useSummaryTriageStore((state) => state.triage[comment.id]);
  const markTriaged = useSummaryTriageStore((state) => state.markTriaged);
  const clearTriageRecord = useSummaryTriageStore((state) => state.clearTriageRecord);
  const setClassificationOverride = useSummaryTriageStore(
    (state) => state.setClassificationOverride,
  );

  const suggestedLabel = CLASSIFICATION_LABELS[comment.suggested.classification];
  const effectiveLabel = CLASSIFICATION_LABELS[comment.classification];

  return (
    <article
      className={`${styles.card}${record ? ` ${styles.cardTriaged}` : ""}`}
      data-comment-id={comment.id}
      data-triage-state={record?.state ?? "untriaged"}
    >
      <div className={styles.cardTop}>
        {comment.timecode_seconds !== null && onSeek ? (
          <button
            type="button"
            className={styles.timecode}
            onClick={() => onSeek(comment.timecode_seconds as number)}
            aria-label={`Seek to ${formatSummaryTimecode(comment.timecode_seconds)}`}
          >
            {formatSummaryTimecode(comment.timecode_seconds)}
          </button>
        ) : (
          <span className={styles.timecode}>
            {formatSummaryTimecode(comment.timecode_seconds)}
          </span>
        )}
        <span className={styles.author}>{comment.author_name}</span>
        {comment.override ? (
          <span
            className={styles.confirmedBadge}
            title={`Producer confirmed (suggested: ${suggestedLabel})`}
          >
            {effectiveLabel}
          </span>
        ) : (
          <span
            className={styles.suggestedBadge}
            title={
              comment.suggested.basis === "rule"
                ? `Heuristic signals: ${comment.suggested.matchedSignals.join(", ")}`
                : "No heuristic signal matched — low-confidence guess"
            }
          >
            Suggested: {suggestedLabel}
          </span>
        )}
        {record ? (
          <span className={styles.triageBadge}>{TRIAGE_STATE_LABELS[record.state]}</span>
        ) : null}
      </div>

      <p className={styles.body}>{comment.body}</p>

      <div className={`${styles.cardActions} no-print`}>
        {TRIAGE_STATES.map((state: TriageState) => (
          <button
            key={state}
            type="button"
            className={styles.triageButton}
            aria-pressed={record?.state === state}
            aria-label={`Mark comment ${comment.id} as ${TRIAGE_STATE_LABELS[state]}`}
            onClick={() =>
              record?.state === state
                ? clearTriageRecord(comment.id)
                : markTriaged(comment.id, state, completerName)
            }
          >
            {TRIAGE_STATE_LABELS[state]}
          </button>
        ))}
        <select
          className={styles.overrideSelect}
          aria-label={`Classification for comment ${comment.id}`}
          value={comment.override ?? ""}
          onChange={(event) =>
            setClassificationOverride(
              comment.id,
              (event.target.value || null) as SummaryClassification | null,
            )
          }
        >
          <option value="">Suggested: {suggestedLabel}</option>
          {SUMMARY_CLASSIFICATIONS.map((classification) => (
            <option key={classification} value={classification}>
              {CLASSIFICATION_LABELS[classification]}
            </option>
          ))}
        </select>
      </div>

      {record ? (
        <p className={styles.completer}>
          {TRIAGE_STATE_LABELS[record.state]} by {record.completed_by} ·{" "}
          <time dateTime={record.completed_at}>
            {new Date(record.completed_at).toLocaleString()}
          </time>
        </p>
      ) : null}
    </article>
  );
}

export default function TriageBoard({ comments, completerName, onSeek }: TriageBoardProps) {
  const triage = useSummaryTriageStore((state) => state.triage);
  const overrides = useSummaryTriageStore((state) => state.overrides);

  const summary = consolidateComments(comments, overrides);
  const counts = triageCounts(
    comments.map((comment) => comment.id),
    triage,
  );

  return (
    <section aria-label="Review triage board">
      <div className={styles.countsBar} aria-live="polite">
        <span className={styles.countChip}>{counts.total} comments</span>
        <span className={styles.countChip}>{counts.untriaged} untriaged</span>
        <span className={`${styles.countChip} ${styles.countChipResolved}`}>
          {counts.resolved} resolved
        </span>
        <span className={styles.countChip}>{counts.duplicate} duplicate</span>
        <span className={styles.countChip}>{counts.out_of_scope} out of scope</span>
        <span className={`${styles.countChip} ${styles.countChipOpen}`}>
          {counts.needs_clarification} needs clarification
        </span>
      </div>

      {summary.conflicts.length > 0 ? (
        <div className={styles.conflicts} role="alert">
          <p className={styles.conflictsTitle}>
            {summary.conflicts.length} stakeholder{" "}
            {summary.conflicts.length === 1 ? "conflict" : "conflicts"} to resolve
          </p>
          {summary.conflicts.map((conflict) => (
            <p key={conflict.comment_ids.join("+")} className={styles.conflictItem}>
              <strong>{formatSummaryTimecode(conflict.timecode_seconds)}</strong> —{" "}
              {conflict.reason}
            </p>
          ))}
        </div>
      ) : null}

      {summary.groups
        .filter((group) => group.comments.length > 0)
        .map((group) => (
          <section key={group.classification} className={styles.group}>
            <h3 className={styles.groupTitle}>
              {group.label}
              <span className={styles.groupCount}>
                {group.comments.length}
              </span>
            </h3>
            {group.comments.map((comment) => (
              <TriageCard
                key={comment.id}
                comment={comment}
                completerName={completerName}
                onSeek={onSeek}
              />
            ))}
          </section>
        ))}

      <p className={styles.basisNote}>
        Classifications are rule-based suggestions, not AI. They stand as
        “Suggested” until a producer confirms them here.
      </p>
    </section>
  );
}
