/**
 * P21 — Triage state for the producer summary board (Frame.io completed /
 * completer model): every triage action records *who* triaged and *when*.
 * Pure logic lives here so it is testable without a store or a DOM.
 */

export const TRIAGE_STATES = [
  "resolved",
  "duplicate",
  "out_of_scope",
  "needs_clarification",
] as const;

/** A comment with no record is implicitly "untriaged". */
export type TriageState = (typeof TRIAGE_STATES)[number];

export interface TriageRecord {
  comment_id: string;
  state: TriageState;
  /** Frame.io completer_id equivalent: who performed the triage. */
  completed_by: string;
  /** ISO timestamp of the triage action. */
  completed_at: string;
}

export type TriageCounts = Record<TriageState, number> & {
  untriaged: number;
  total: number;
};

export function isTriageState(value: unknown): value is TriageState {
  return typeof value === "string" && (TRIAGE_STATES as readonly string[]).includes(value);
}

export const TRIAGE_STATE_LABELS: Record<TriageState, string> = {
  resolved: "Resolved",
  duplicate: "Duplicate",
  out_of_scope: "Out of scope",
  needs_clarification: "Needs clarification",
};

/** Upsert a triage record. Returns a new map; pure. */
export function applyTriage(
  records: Record<string, TriageRecord>,
  record: TriageRecord,
): Record<string, TriageRecord> {
  return { ...records, [record.comment_id]: record };
}

/** Remove a triage record (back to untriaged). Returns a new map; pure. */
export function clearTriage(
  records: Record<string, TriageRecord>,
  commentId: string,
): Record<string, TriageRecord> {
  if (!(commentId in records)) return records;
  const next = { ...records };
  delete next[commentId];
  return next;
}

/**
 * Count triage states across a known set of comments. Comments without a
 * record count as untriaged; records for unknown comment ids are ignored so
 * counts always describe the comments actually on the board.
 */
export function triageCounts(
  commentIds: string[],
  records: Record<string, TriageRecord>,
): TriageCounts {
  const counts: TriageCounts = {
    resolved: 0,
    duplicate: 0,
    out_of_scope: 0,
    needs_clarification: 0,
    untriaged: 0,
    total: commentIds.length,
  };
  for (const id of commentIds) {
    const record = records[id];
    if (record) counts[record.state] += 1;
    else counts.untriaged += 1;
  }
  return counts;
}

/** Revive records from untrusted persisted JSON (localStorage). */
export function reviveTriageRecords(value: unknown): Record<string, TriageRecord> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const records: Record<string, TriageRecord> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const candidate = raw as Record<string, unknown>;
    if (
      candidate.comment_id === key &&
      isTriageState(candidate.state) &&
      typeof candidate.completed_by === "string" &&
      candidate.completed_by.trim().length > 0 &&
      typeof candidate.completed_at === "string" &&
      !Number.isNaN(Date.parse(candidate.completed_at))
    ) {
      records[key] = {
        comment_id: key,
        state: candidate.state,
        completed_by: candidate.completed_by,
        completed_at: candidate.completed_at,
      };
    }
  }
  return records;
}
