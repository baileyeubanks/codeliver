/**
 * P21 — Consolidation of classified review comments into a producer-friendly
 * summary: grouping by classification, stakeholder roll-up, and Frame.io-style
 * conflict surfacing when two stakeholders disagree at the same moment.
 */

import {
  CLASSIFICATION_LABELS,
  SUMMARY_CLASSIFICATIONS,
  classifyComment,
  resolveClassification,
  type ClassificationResult,
  type SummaryClassification,
} from "./classify";

/** Minimum comment data the summary needs. Structurally compatible with the
 *  shared `Comment` model in lib/types/codeliver.ts. */
export interface SummaryCommentInput {
  id: string;
  author_name: string;
  body: string;
  timecode_seconds: number | null;
  status: string;
  parent_id?: string | null;
}

export interface ClassifiedSummaryComment extends SummaryCommentInput {
  suggested: ClassificationResult;
  /** Producer override, when one exists. */
  override: SummaryClassification | null;
  /** Effective classification (override wins over suggestion). */
  classification: SummaryClassification;
}

/** Stance buckets used for disagreement detection. */
export type CommentStance = "change" | "approval" | "neutral";

/** Two comments within this many seconds are considered "the same moment". */
export const CONFLICT_TIMECODE_WINDOW_SECONDS = 1;

export interface SummaryConflict {
  /** The earlier of the two timecodes (midpoints are noise for a 1s window). */
  timecode_seconds: number;
  comment_ids: [string, string];
  authors: [string, string];
  stances: [CommentStance, CommentStance];
  reason: string;
}

export interface ClassificationGroup {
  classification: SummaryClassification;
  label: string;
  comments: ClassifiedSummaryComment[];
}

export interface StakeholderRollup {
  author_name: string;
  total: number;
  byClassification: Partial<Record<SummaryClassification, number>>;
  comment_ids: string[];
}

export interface ProducerSummary {
  total_comments: number;
  open_comments: number;
  resolved_comments: number;
  groups: ClassificationGroup[];
  stakeholders: StakeholderRollup[];
  conflicts: SummaryConflict[];
  /** Truth in labeling: classifications are heuristic until confirmed. */
  classification_basis: "rule_based_heuristic";
}

function byTimecodeThenId(
  left: ClassifiedSummaryComment,
  right: ClassifiedSummaryComment,
): number {
  const leftTime = left.timecode_seconds ?? Number.POSITIVE_INFINITY;
  const rightTime = right.timecode_seconds ?? Number.POSITIVE_INFINITY;
  if (leftTime !== rightTime) return leftTime - rightTime;
  return left.id.localeCompare(right.id);
}

/** Map an effective classification to the stance used for conflict checks. */
export function stanceForClassification(
  classification: SummaryClassification,
): CommentStance {
  switch (classification) {
    case "required_correction":
    case "new_request":
      return "change";
    case "approval":
      return "approval";
    default:
      return "neutral";
  }
}

/**
 * Frame.io-style conflict surfacing: two *different* stakeholders leave
 * non-neutral, disagreeing stances at the same timecode (±1s). Replies to a
 * parent comment never conflict with their own thread root — that's a
 * conversation, not a disagreement.
 */
export function detectConflicts(
  comments: ClassifiedSummaryComment[],
): SummaryConflict[] {
  const timed = comments.filter(
    (comment) => typeof comment.timecode_seconds === "number",
  );
  const conflicts: SummaryConflict[] = [];

  for (let index = 0; index < timed.length; index += 1) {
    for (let other = index + 1; other < timed.length; other += 1) {
      const left = timed[index];
      const right = timed[other];
      const leftTime = left.timecode_seconds as number;
      const rightTime = right.timecode_seconds as number;
      if (Math.abs(leftTime - rightTime) > CONFLICT_TIMECODE_WINDOW_SECONDS) {
        continue;
      }
      if (left.author_name.trim() === right.author_name.trim()) continue;
      if (left.parent_id && left.parent_id === right.id) continue;
      if (right.parent_id && right.parent_id === left.id) continue;

      const leftStance = stanceForClassification(left.classification);
      const rightStance = stanceForClassification(right.classification);
      if (leftStance === "neutral" || rightStance === "neutral") continue;
      if (leftStance === rightStance) continue;

      conflicts.push({
        timecode_seconds: Math.min(leftTime, rightTime),
        comment_ids: [left.id, right.id],
        authors: [left.author_name, right.author_name],
        stances: [leftStance, rightStance],
        reason: `${left.author_name} ${leftStance === "approval" ? "approves" : "requests changes"} while ${right.author_name} ${rightStance === "approval" ? "approves" : "requests changes"} at the same moment`,
      });
    }
  }

  return conflicts.sort((a, b) => a.timecode_seconds - b.timecode_seconds);
}

/**
 * Build the consolidated producer summary. `overrides` maps comment id to a
 * producer-confirmed classification; everything else keeps its suggestion.
 */
export function consolidateComments(
  comments: SummaryCommentInput[],
  overrides: Record<string, SummaryClassification> = {},
): ProducerSummary {
  const classified: ClassifiedSummaryComment[] = comments.map((comment) => {
    const suggested = classifyComment(comment.body);
    const override = overrides[comment.id] ?? null;
    return {
      ...comment,
      suggested,
      override,
      classification: resolveClassification(suggested, override),
    };
  });

  const groups: ClassificationGroup[] = SUMMARY_CLASSIFICATIONS.map(
    (classification) => ({
      classification,
      label: CLASSIFICATION_LABELS[classification],
      comments: classified
        .filter((comment) => comment.classification === classification)
        .sort(byTimecodeThenId),
    }),
  );

  const stakeholdersByName = new Map<string, StakeholderRollup>();
  for (const comment of classified) {
    const name = comment.author_name.trim() || "Unknown reviewer";
    let rollup = stakeholdersByName.get(name);
    if (!rollup) {
      rollup = { author_name: name, total: 0, byClassification: {}, comment_ids: [] };
      stakeholdersByName.set(name, rollup);
    }
    rollup.total += 1;
    rollup.byClassification[comment.classification] =
      (rollup.byClassification[comment.classification] ?? 0) + 1;
    rollup.comment_ids.push(comment.id);
  }
  const stakeholders = [...stakeholdersByName.values()].sort(
    (left, right) => right.total - left.total || left.author_name.localeCompare(right.author_name),
  );

  return {
    total_comments: classified.length,
    open_comments: classified.filter((comment) => comment.status === "open").length,
    resolved_comments: classified.filter((comment) => comment.status === "resolved").length,
    groups,
    stakeholders,
    conflicts: detectConflicts(classified),
    classification_basis: "rule_based_heuristic",
  };
}

/** Format seconds as m:ss for summary and print output. */
export function formatSummaryTimecode(seconds: number | null): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) {
    return "—";
  }
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const remainder = whole % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}
