import assert from "node:assert/strict";
import test from "node:test";

import {
  CLAMP_LINE_THRESHOLD,
  estimateLineCount,
  shouldClamp,
} from "../lib/comments/clamp.ts";
import {
  extractMentionQuery,
  filterMentionRoster,
  parseMentions,
  splitMentionSegments,
} from "../lib/comments/mentions.ts";
import {
  REACTION_EMOJIS,
  groupReactions,
  toggleReaction,
} from "../lib/comments/reactions.ts";
import {
  buildThreads,
  countThreadsByStatus,
  filterThreads,
} from "../lib/comments/threads.ts";
import type {
  Comment,
  CommentReaction,
  MentionRosterEntry,
} from "../lib/types/codeliver.ts";

function makeComment(overrides: Partial<Comment>): Comment {
  return {
    id: "c-0",
    review_id: null,
    review_invite_id: null,
    asset_id: "asset-1",
    version_id: null,
    parent_id: null,
    author_name: "Author",
    author_email: null,
    author_id: null,
    body: "Body",
    rich_body: null,
    timecode_seconds: null,
    frame_number: null,
    pin_x: null,
    pin_y: null,
    mentions: [],
    status: "open",
    visibility: "internal",
    resolved_by: null,
    resolved_at: null,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

// ── Mentions parser ──

test("parseMentions finds handles at start and after whitespace/punctuation", () => {
  assert.deepEqual(parseMentions("@jane take a look"), ["jane"]);
  assert.deepEqual(parseMentions("cc @jane and (@marcus)"), ["jane", "marcus"]);
  assert.deepEqual(parseMentions("hey @jane.doe-smith!"), ["jane.doe-smith"]);
});

test("parseMentions ignores email addresses", () => {
  assert.deepEqual(parseMentions("mail jane@example.com please"), []);
  assert.deepEqual(parseMentions("jane@example.com"), []);
});

test("parseMentions ignores @@ escapes", () => {
  assert.deepEqual(parseMentions("literal @@notamention here"), []);
  assert.deepEqual(parseMentions("@@ jane"), []);
});

test("parseMentions does not swallow trailing punctuation", () => {
  assert.deepEqual(parseMentions("@jane, please review."), ["jane"]);
  assert.deepEqual(parseMentions("(@jane.)"), ["jane"]);
});

test("parseMentions dedupes case-insensitively and keeps order", () => {
  assert.deepEqual(parseMentions("@Jane then @jane then @MARCUS"), [
    "jane",
    "marcus",
  ]);
});

test("splitMentionSegments marks mention spans for highlighting", () => {
  const segments = splitMentionSegments("hey @jane look");
  assert.deepEqual(segments, [
    { text: "hey ", mention: null },
    { text: "@jane", mention: "jane" },
    { text: " look", mention: null },
  ]);
  // Email addresses stay plain text.
  assert.deepEqual(splitMentionSegments("a@b.com"), [
    { text: "a@b.com", mention: null },
  ]);
});

test("extractMentionQuery detects an in-progress mention at the caret", () => {
  assert.deepEqual(extractMentionQuery("hello @ja", 9), {
    start: 6,
    query: "ja",
  });
  assert.deepEqual(extractMentionQuery("@", 1), { start: 0, query: "" });
  assert.equal(extractMentionQuery("a@b", 3), null); // email
  assert.equal(extractMentionQuery("hello jane", 10), null); // no @
});

test("filterMentionRoster matches handle or display name", () => {
  const roster: MentionRosterEntry[] = [
    { id: "1", handle: "jane.doe", name: "Jane Doe" },
    { id: "2", handle: "marcus", name: "Marcus Lee" },
  ];
  assert.deepEqual(filterMentionRoster(roster, "jan"), [roster[0]]);
  assert.deepEqual(filterMentionRoster(roster, "lee"), [roster[1]]);
  assert.equal(filterMentionRoster(roster, "zzz").length, 0);
});

// ── Thread shaping ──

test("buildThreads nests replies under their root, oldest first", () => {
  const threads = buildThreads([
    makeComment({ id: "r2", created_at: "2026-07-01T02:00:00.000Z" }),
    makeComment({
      id: "reply-2",
      parent_id: "r1",
      created_at: "2026-07-01T03:00:00.000Z",
    }),
    makeComment({ id: "r1", created_at: "2026-07-01T01:00:00.000Z" }),
    makeComment({
      id: "reply-1",
      parent_id: "r1",
      created_at: "2026-07-01T02:30:00.000Z",
    }),
  ]);

  assert.deepEqual(
    threads.map((thread) => thread.comment.id),
    ["r1", "r2"],
  );
  assert.deepEqual(
    threads[0].replies.map((reply) => reply.id),
    ["reply-1", "reply-2"],
  );
  assert.deepEqual(threads[1].replies, []);
});

test("buildThreads promotes orphaned replies to roots", () => {
  const threads = buildThreads([
    makeComment({ id: "orphan", parent_id: "missing-parent" }),
  ]);
  assert.equal(threads.length, 1);
  assert.equal(threads[0].comment.id, "orphan");
  assert.deepEqual(threads[0].replies, []);
});

test("buildThreads does not mutate the input array", () => {
  const input = [
    makeComment({ id: "b", created_at: "2026-07-01T02:00:00.000Z" }),
    makeComment({ id: "a", created_at: "2026-07-01T01:00:00.000Z" }),
  ];
  buildThreads(input);
  assert.deepEqual(
    input.map((comment) => comment.id),
    ["b", "a"],
  );
});

test("filterThreads and countThreadsByStatus honor All / Open / Resolved", () => {
  const threads = buildThreads([
    makeComment({ id: "open-1", status: "open" }),
    makeComment({
      id: "resolved-1",
      status: "resolved",
      created_at: "2026-07-01T01:00:00.000Z",
    }),
  ]);

  assert.deepEqual(countThreadsByStatus(threads), {
    all: 2,
    open: 1,
    resolved: 1,
  });
  assert.equal(filterThreads(threads, "all").length, 2);
  assert.deepEqual(
    filterThreads(threads, "open").map((thread) => thread.comment.id),
    ["open-1"],
  );
  assert.deepEqual(
    filterThreads(threads, "resolved").map((thread) => thread.comment.id),
    ["resolved-1"],
  );
});

// ── Reaction toggling ──

function makeReaction(overrides: Partial<CommentReaction>): CommentReaction {
  return {
    id: "rx-0",
    comment_id: "c-1",
    user_id: "u-1",
    emoji: "👍",
    created_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

test("toggleReaction adds own reaction and removes it on second toggle", () => {
  let id = 0;
  const makeId = () => `rx-${++id}`;

  const added = toggleReaction([], "👍", "u-1", "c-1", makeId);
  assert.equal(added.length, 1);
  assert.deepEqual(added[0], {
    id: "rx-1",
    comment_id: "c-1",
    user_id: "u-1",
    emoji: "👍",
    created_at: added[0].created_at,
  });

  const removed = toggleReaction(added, "👍", "u-1", "c-1", makeId);
  assert.deepEqual(removed, []);
});

test("toggleReaction never touches other users' reactions", () => {
  const others = [
    makeReaction({ id: "rx-a", user_id: "u-2", emoji: "👍" }),
    makeReaction({ id: "rx-b", user_id: "u-3", emoji: "👍" }),
  ];
  const result = toggleReaction(others, "👍", "u-1", "c-1", () => "rx-new");
  assert.equal(result.length, 3);
  // Toggling off removes only the caller's own reaction.
  const off = toggleReaction(result, "👍", "u-1", "c-1", () => "rx-x");
  assert.deepEqual(off, others);
});

test("groupReactions aggregates counts and own-reaction state", () => {
  const grouped = groupReactions(
    [
      makeReaction({ id: "1", user_id: "u-1", emoji: "👍" }),
      makeReaction({ id: "2", user_id: "u-2", emoji: "👍" }),
      makeReaction({ id: "3", user_id: "u-2", emoji: "❤️" }),
    ],
    "u-1",
  );
  assert.deepEqual(grouped, [
    { emoji: "👍", count: 2, userReacted: true },
    { emoji: "❤️", count: 1, userReacted: false },
  ]);
});

test("REACTION_EMOJIS is the fixed spec row", () => {
  assert.deepEqual([...REACTION_EMOJIS], ["👍", "❤️", "✅", "👀"]);
});

// ── Clamp threshold ──

test("estimateLineCount counts hard newlines and wrapping", () => {
  assert.equal(estimateLineCount(""), 0);
  assert.equal(estimateLineCount("short"), 1);
  assert.equal(estimateLineCount("a\nb\nc"), 3);
  // 200 chars at 72 chars/line wraps to 3 lines.
  assert.equal(estimateLineCount("x".repeat(200), 72), 3);
  // Blank lines still occupy a rendered line.
  assert.equal(estimateLineCount("a\n\nb"), 3);
});

test("shouldClamp trips just past the 3-line threshold", () => {
  assert.equal(CLAMP_LINE_THRESHOLD, 3);
  assert.equal(shouldClamp("x".repeat(72 * 3)), false);
  assert.equal(shouldClamp("x".repeat(72 * 3 + 1)), true);
  assert.equal(shouldClamp("one\ntwo\nthree\nfour"), true);
  assert.equal(shouldClamp("one\ntwo\nthree"), false);
});
