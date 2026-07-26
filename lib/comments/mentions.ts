// Pure mention parsing for Co-Deliver comments.
//
// A mention is an `@handle` token where:
//   - the `@` is at the start of the text or preceded by a character that is
//     NOT a word character and NOT another `@` (so emails like
//     `jane@example.com` and literal `@@` do not count), and
//   - the handle is letters/digits/underscore with optional single inner
//     `.` or `-` separators (so `jane.doe` works but trailing punctuation
//     like `@jane.` is not swallowed into the handle).

const HANDLE = "[A-Za-z0-9_]+(?:[.-][A-Za-z0-9_]+)*";
const MENTION_SOURCE = `(^|[^A-Za-z0-9_@])@(${HANDLE})`;
const MENTION_RE = new RegExp(MENTION_SOURCE, "g");

export interface MentionSegment {
  text: string;
  /** Lowercase handle without the `@`, when this segment is a mention. */
  mention: string | null;
}

/** Parse unique mentioned handles from a comment body, in order of appearance. */
export function parseMentions(body: string): string[] {
  const handles: string[] = [];
  const seen = new Set<string>();
  for (const match of body.matchAll(MENTION_RE)) {
    const handle = match[2].toLowerCase();
    if (!seen.has(handle)) {
      seen.add(handle);
      handles.push(handle);
    }
  }
  return handles;
}

/** Split a body into text/mention segments so UIs can highlight handles. */
export function splitMentionSegments(body: string): MentionSegment[] {
  const segments: MentionSegment[] = [];
  let cursor = 0;
  for (const match of body.matchAll(MENTION_RE)) {
    const atIndex = match.index + match[1].length;
    if (atIndex > cursor) {
      segments.push({ text: body.slice(cursor, atIndex), mention: null });
    }
    const token = `@${match[2]}`;
    segments.push({ text: token, mention: match[2].toLowerCase() });
    cursor = atIndex + token.length;
  }
  if (cursor < body.length) {
    segments.push({ text: body.slice(cursor), mention: null });
  }
  return segments;
}

export interface MentionQuery {
  /** Index of the `@` that opened this query. */
  start: number;
  /** Partial handle typed so far (may be empty right after `@`). */
  query: string;
}

const QUERY_HANDLE_RE = /^[A-Za-z0-9_.-]*$/;

/**
 * Find an in-progress mention query ending at `caret` inside `text`, for
 * autocomplete. Returns null when the caret is not inside a mention token.
 */
export function extractMentionQuery(
  text: string,
  caret: number,
): MentionQuery | null {
  const safeCaret = Math.max(0, Math.min(caret, text.length));
  let index = safeCaret;
  while (index > 0 && QUERY_HANDLE_RE.test(text[index - 1])) {
    index -= 1;
  }
  if (index === 0 || text[index - 1] !== "@") return null;
  const atIndex = index - 1;
  const before = atIndex === 0 ? "" : text[atIndex - 1];
  if (before && /[A-Za-z0-9_@]/.test(before)) return null;
  return { start: atIndex, query: text.slice(index, safeCaret) };
}

/** Filter a roster by a partial handle or display name, case-insensitive. */
export function filterMentionRoster<
  T extends { handle: string; name: string },
>(roster: T[], query: string, limit = 6): T[] {
  const needle = query.toLowerCase();
  return roster
    .filter(
      (entry) =>
        entry.handle.toLowerCase().includes(needle) ||
        entry.name.toLowerCase().includes(needle),
    )
    .slice(0, limit);
}
