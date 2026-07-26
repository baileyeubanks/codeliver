/**
 * Brief versioning primitives for the project workspace (P24).
 *
 * Briefs are append-only in the demo store — an edit writes a new version and
 * supersedes the approved one, never an in-place overwrite. These pure
 * helpers order that history and diff consecutive versions so the UI can show
 * exactly what changed, word by word.
 */

export interface BriefLike {
  version: number;
  status: string;
  objectives: string;
  audience: string;
  message: string;
  references: string[];
  deliverables_notes: string;
  updated_at: string;
}

/** Newest version first; input array is not mutated. */
export function sortBriefVersionsNewestFirst<T extends { version: number }>(
  briefs: readonly T[],
): T[] {
  return [...briefs].sort((a, b) => b.version - a.version);
}

/* -------------------------------------------------------------------------- */
/* Word-level text diff (LCS over whitespace tokens)                          */
/* -------------------------------------------------------------------------- */

export interface TextDiffSegment {
  kind: "same" | "added" | "removed";
  text: string;
}

function tokenize(text: string): string[] {
  return text.split(/\s+/).filter((token) => token.length > 0);
}

function pushSegment(segments: TextDiffSegment[], kind: TextDiffSegment["kind"], token: string) {
  const last = segments[segments.length - 1];
  if (last && last.kind === kind) {
    last.text = `${last.text} ${token}`;
  } else {
    segments.push({ kind, text: token });
  }
}

/**
 * Diff two free-text fields word by word. Consecutive same-kind words merge
 * into one segment so the UI can highlight whole phrases.
 */
export function diffText(before: string, after: string): TextDiffSegment[] {
  const a = tokenize(before);
  const b = tokenize(after);
  if (a.length === 0 && b.length === 0) return [];

  // Longest-common-subsequence table; brief fields are short, O(n*m) is fine.
  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i][j] = a[i] === b[j]
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const segments: TextDiffSegment[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      pushSegment(segments, "same", a[i]);
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      pushSegment(segments, "removed", a[i]);
      i += 1;
    } else {
      pushSegment(segments, "added", b[j]);
      j += 1;
    }
  }
  while (i < a.length) {
    pushSegment(segments, "removed", a[i]);
    i += 1;
  }
  while (j < b.length) {
    pushSegment(segments, "added", b[j]);
    j += 1;
  }
  return segments;
}

/* -------------------------------------------------------------------------- */
/* Reference list diff                                                        */
/* -------------------------------------------------------------------------- */

export interface ListDiff {
  added: string[];
  removed: string[];
  unchanged: string[];
}

export function diffStringList(before: readonly string[], after: readonly string[]): ListDiff {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return {
    added: after.filter((item) => !beforeSet.has(item)),
    removed: before.filter((item) => !afterSet.has(item)),
    unchanged: after.filter((item) => beforeSet.has(item)),
  };
}

/* -------------------------------------------------------------------------- */
/* Whole-brief diff                                                           */
/* -------------------------------------------------------------------------- */

export type BriefDiffField = "objectives" | "audience" | "message" | "deliverables_notes";

export interface BriefFieldChange {
  field: BriefDiffField;
  label: string;
  changed: boolean;
  segments: TextDiffSegment[];
}

export interface BriefVersionDiff {
  fromVersion: number;
  toVersion: number;
  fields: BriefFieldChange[];
  references: ListDiff;
  /** Text fields that changed, plus the references list when it changed. */
  changedFieldCount: number;
}

const FIELD_LABELS: Record<BriefDiffField, string> = {
  objectives: "Objectives",
  audience: "Audience",
  message: "Messaging",
  deliverables_notes: "Deliverables notes",
};

const DIFF_FIELDS: BriefDiffField[] = ["objectives", "audience", "message", "deliverables_notes"];

/** Diff two consecutive brief versions (before → after). */
export function diffBriefVersions(before: BriefLike, after: BriefLike): BriefVersionDiff {
  const fields = DIFF_FIELDS.map((field) => {
    const segments = diffText(before[field], after[field]);
    return {
      field,
      label: FIELD_LABELS[field],
      changed: segments.some((segment) => segment.kind !== "same"),
      segments,
    };
  });
  const references = diffStringList(before.references, after.references);
  const referencesChanged = references.added.length > 0 || references.removed.length > 0;
  return {
    fromVersion: before.version,
    toVersion: after.version,
    fields,
    references,
    changedFieldCount:
      fields.filter((field) => field.changed).length + (referencesChanged ? 1 : 0),
  };
}
