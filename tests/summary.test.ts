import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

register("./typescript-resolver.mjs", import.meta.url);

const {
  SUMMARY_CLASSIFICATIONS,
  CLASSIFICATION_LABELS,
  FALLBACK_CLASSIFICATION,
  classifyComment,
  isSummaryClassification,
  resolveClassification,
} = await import("../lib/summary/classify.ts");
const {
  CONFLICT_TIMECODE_WINDOW_SECONDS,
  consolidateComments,
  formatSummaryTimecode,
  stanceForClassification,
} = await import("../lib/summary/consolidate.ts");
const {
  TRIAGE_STATES,
  applyTriage,
  clearTriage,
  isTriageState,
  reviveTriageRecords,
  triageCounts,
} = await import("../lib/summary/triage.ts");

function comment(partial: {
  id: string;
  body: string;
  author?: string;
  timecode?: number | null;
  status?: string;
  parent_id?: string | null;
}) {
  return {
    id: partial.id,
    author_name: partial.author ?? "Reviewer",
    body: partial.body,
    timecode_seconds: partial.timecode === undefined ? null : partial.timecode,
    status: partial.status ?? "open",
    parent_id: partial.parent_id ?? null,
  };
}

// ── Classifier ─────────────────────────────────────────────────

test("classifier covers the full taxonomy with deterministic rules", () => {
  const cases: Array<[string, (typeof SUMMARY_CLASSIFICATIONS)[number]]> = [
    ["Fix the typo in the lower third before this ships.", "required_correction"],
    ["The logo is wrong — it must be the 2026 lockup.", "required_correction"],
    ["Start the response a beat earlier; it would feel tighter.", "creative_preference"],
    ["We'd also like a 15-second cutdown for social.", "new_request"],
    ["Scratch that earlier note — disregard it.", "contradictory"],
    ["That's a separate deliverable, not this video.", "out_of_scope"],
    ["The dialogue mix peaks hot — check loudness before export.", "technical"],
    ["Can we confirm the music license covers broadcast use?", "question"],
    ["Approved from the agency side — this section works as-is.", "approval"],
    ["The title treatment works here. No further changes on this section.", "approval"],
    ["Color pass can wait until the next version — not a blocker.", "deferred"],
  ];
  for (const [body, expected] of cases) {
    const result = classifyComment(body);
    assert.equal(
      result.classification,
      expected,
      `"${body}" → ${result.classification} (signals: ${result.matchedSignals.join(", ")})`,
    );
    assert.equal(result.basis, "rule");
    assert.ok(result.matchedSignals.length > 0, "rule-based hits report their signals");
  }
});

test("classifier is deterministic and reports a low-confidence fallback", () => {
  const body = "Interesting.";
  const first = classifyComment(body);
  const second = classifyComment(body);
  assert.deepEqual(first, second);
  assert.equal(first.basis, "fallback");
  assert.equal(first.classification, FALLBACK_CLASSIFICATION);
  assert.deepEqual(first.matchedSignals, []);
});

test("rule priority: a licensing question stays a question, not a compliance correction", () => {
  assert.equal(
    classifyComment("Can we confirm the music license covers broadcast use?").classification,
    "question",
  );
});

test("every classification has a label and passes the guard", () => {
  for (const classification of SUMMARY_CLASSIFICATIONS) {
    assert.ok(CLASSIFICATION_LABELS[classification].length > 0);
    assert.ok(isSummaryClassification(classification));
  }
  assert.equal(isSummaryClassification("made_up"), false);
  assert.equal(isSummaryClassification(42), false);
});

test("producer override wins over the suggestion", () => {
  const suggested = classifyComment("Fix the typo.");
  assert.equal(suggested.classification, "required_correction");
  assert.equal(resolveClassification(suggested, null), "required_correction");
  assert.equal(resolveClassification(suggested, undefined), "required_correction");
  assert.equal(resolveClassification(suggested, "creative_preference"), "creative_preference");
});

// ── Consolidation ──────────────────────────────────────────────

test("consolidation groups by effective classification and rolls up stakeholders", () => {
  const comments = [
    comment({ id: "a", body: "Fix the typo.", author: "Alice", timecode: 2 }),
    comment({ id: "b", body: "Approved, works as-is.", author: "Bob", timecode: 3 }),
    comment({ id: "c", body: "Fix the framing too.", author: "Alice", timecode: 1 }),
  ];
  const summary = consolidateComments(comments);

  assert.equal(summary.total_comments, 3);
  assert.equal(summary.open_comments, 3);
  assert.equal(summary.resolved_comments, 0);
  assert.equal(summary.classification_basis, "rule_based_heuristic");

  const corrections = summary.groups.find((g) => g.classification === "required_correction");
  assert.deepEqual(corrections?.comments.map((c) => c.id), ["c", "a"], "timecode order");

  const approvals = summary.groups.find((g) => g.classification === "approval");
  assert.deepEqual(approvals?.comments.map((c) => c.id), ["b"]);

  const alice = summary.stakeholders.find((s) => s.author_name === "Alice");
  assert.equal(alice?.total, 2);
  assert.equal(alice?.byClassification.required_correction, 2);
  assert.deepEqual(alice?.comment_ids.sort(), ["a", "c"]);
  const bob = summary.stakeholders.find((s) => s.author_name === "Bob");
  assert.equal(bob?.byClassification.approval, 1);
});

test("overrides move comments between groups", () => {
  const comments = [comment({ id: "a", body: "Fix the typo.", timecode: 2 })];
  const base = consolidateComments(comments);
  assert.equal(
    base.groups.find((g) => g.classification === "required_correction")?.comments.length,
    1,
  );
  const overridden = consolidateComments(comments, { a: "creative_preference" });
  assert.equal(
    overridden.groups.find((g) => g.classification === "required_correction")?.comments.length,
    0,
  );
  assert.equal(
    overridden.groups.find((g) => g.classification === "creative_preference")?.comments.length,
    1,
  );
  assert.equal(overridden.groups.flatMap((g) => g.comments)[0]?.override, "creative_preference");
});

// ── Conflict detection ─────────────────────────────────────────

test("conflict surfaces when two stakeholders disagree at the same timecode ±1s", () => {
  const comments = [
    comment({ id: "fix", body: "Fix the typo.", author: "Client", timecode: 2.0 }),
    comment({ id: "ok", body: "Approved, works as-is.", author: "Agency", timecode: 2.2 }),
  ];
  const summary = consolidateComments(comments);
  assert.equal(summary.conflicts.length, 1);
  const conflict = summary.conflicts[0];
  assert.equal(conflict.timecode_seconds, 2.0);
  assert.deepEqual(conflict.comment_ids, ["fix", "ok"]);
  assert.deepEqual(conflict.authors, ["Client", "Agency"]);
  assert.match(conflict.reason, /Client/);
  assert.match(conflict.reason, /Agency/);
});

test("no conflict when the same stakeholder disagrees with themselves", () => {
  const comments = [
    comment({ id: "fix", body: "Fix the typo.", author: "Client", timecode: 2.0 }),
    comment({ id: "ok", body: "Approved, works as-is.", author: "Client", timecode: 2.1 }),
  ];
  assert.equal(consolidateComments(comments).conflicts.length, 0);
});

test("no conflict outside the ±1s window", () => {
  const comments = [
    comment({ id: "fix", body: "Fix the typo.", author: "Client", timecode: 2.0 }),
    comment({
      id: "ok",
      body: "Approved, works as-is.",
      author: "Agency",
      timecode: 2.0 + CONFLICT_TIMECODE_WINDOW_SECONDS + 0.5,
    }),
  ];
  assert.equal(consolidateComments(comments).conflicts.length, 0);
});

test("neutral stances (question, technical, preference) never conflict", () => {
  const comments = [
    comment({ id: "q", body: "Can we confirm the license?", author: "Client", timecode: 2 }),
    comment({ id: "ok", body: "Approved, works as-is.", author: "Agency", timecode: 2.2 }),
    comment({ id: "t", body: "Check loudness before export.", author: "Editor", timecode: 2.4 }),
  ];
  assert.equal(consolidateComments(comments).conflicts.length, 0);
});

test("a reply does not conflict with its own thread root", () => {
  const comments = [
    comment({ id: "root", body: "Approved, works as-is.", author: "Client", timecode: 2 }),
    comment({
      id: "reply",
      body: "Actually we must change this.",
      author: "Agency",
      timecode: 2,
      parent_id: "root",
    }),
  ];
  assert.equal(consolidateComments(comments).conflicts.length, 0);
});

test("stance mapping is stable", () => {
  assert.equal(stanceForClassification("required_correction"), "change");
  assert.equal(stanceForClassification("new_request"), "change");
  assert.equal(stanceForClassification("approval"), "approval");
  assert.equal(stanceForClassification("question"), "neutral");
  assert.equal(stanceForClassification("technical"), "neutral");
  assert.equal(stanceForClassification("creative_preference"), "neutral");
  assert.equal(stanceForClassification("deferred"), "neutral");
  assert.equal(stanceForClassification("out_of_scope"), "neutral");
  assert.equal(stanceForClassification("contradictory"), "neutral");
});

// ── Triage (Frame.io completed/completer model) ───────────────

test("triage records who triaged and when; counts update", () => {
  let records = {};
  records = applyTriage(records, {
    comment_id: "a",
    state: "resolved",
    completed_by: "Producer",
    completed_at: "2026-07-25T12:00:00.000Z",
  });
  records = applyTriage(records, {
    comment_id: "b",
    state: "duplicate",
    completed_by: "Producer",
    completed_at: "2026-07-25T12:01:00.000Z",
  });

  const record = records.a;
  assert.equal(record.completed_by, "Producer");
  assert.equal(record.completed_at, "2026-07-25T12:00:00.000Z");

  const counts = triageCounts(["a", "b", "c"], records);
  assert.equal(counts.resolved, 1);
  assert.equal(counts.duplicate, 1);
  assert.equal(counts.untriaged, 1);
  assert.equal(counts.total, 3);

  // Re-triage replaces the record (same completer model, new timestamp).
  records = applyTriage(records, {
    comment_id: "a",
    state: "needs_clarification",
    completed_by: "Producer",
    completed_at: "2026-07-25T12:02:00.000Z",
  });
  assert.equal(triageCounts(["a", "b", "c"], records).needs_clarification, 1);
  assert.equal(triageCounts(["a", "b", "c"], records).resolved, 0);

  records = clearTriage(records, "a");
  assert.equal(triageCounts(["a", "b", "c"], records).untriaged, 2);
  assert.deepEqual(clearTriage(records, "missing"), records, "clearing a no-op returns input");
});

test("triage records survive an untrusted-JSON round trip", () => {
  const revived = reviveTriageRecords({
    good: {
      comment_id: "good",
      state: "out_of_scope",
      completed_by: "Producer",
      completed_at: "2026-07-25T12:00:00.000Z",
    },
    badState: { comment_id: "badState", state: "nope", completed_by: "P", completed_at: "2026-07-25T12:00:00.000Z" },
    noCompleter: { comment_id: "noCompleter", state: "resolved", completed_by: "", completed_at: "2026-07-25T12:00:00.000Z" },
    badDate: { comment_id: "badDate", state: "resolved", completed_by: "P", completed_at: "not-a-date" },
  });
  assert.deepEqual(Object.keys(revived), ["good"]);
  assert.equal(reviveTriageRecords(null) && Object.keys(reviveTriageRecords(null)).length, 0);
  assert.equal(isTriageState("resolved"), true);
  assert.equal(isTriageState("untriaged"), false);
  for (const state of TRIAGE_STATES) assert.equal(isTriageState(state), true);
});

// ── Formatting ─────────────────────────────────────────────────

test("timecode formatting for the summary and print view", () => {
  assert.equal(formatSummaryTimecode(0), "0:00");
  assert.equal(formatSummaryTimecode(4.8), "0:04");
  assert.equal(formatSummaryTimecode(75), "1:15");
  assert.equal(formatSummaryTimecode(null), "—");
  assert.equal(formatSummaryTimecode(Number.NaN), "—");
});
