import assert from "node:assert/strict";
import test from "node:test";

import type { ApprovalStep } from "../lib/types/codeliver.ts";
import {
  activeApprovalSteps,
  auditEntriesFromSteps,
  canTransition,
  currentAssetState,
  shapeAuditEntry,
  stepChipState,
  transition,
  type AssetApprovalState,
} from "../lib/approvals/approval-machine.ts";

function makeStep(overrides: Partial<ApprovalStep> = {}): ApprovalStep {
  return {
    id: "step-1",
    asset_id: "asset-1",
    workflow_id: "workflow-1",
    step_order: 1,
    role_label: "Client Lead",
    assignee_email: "reviewer@client.example",
    assignee_id: null,
    status: "pending",
    decision_note: null,
    decided_at: null,
    created_at: "2026-07-20T10:00:00.000Z",
    ...overrides,
  };
}

const ALL_STATES: AssetApprovalState[] = [
  "needs_review",
  "feedback_submitted",
  "changes_in_progress",
  "approved",
  "locked",
];

const LEGAL: Record<AssetApprovalState, AssetApprovalState[]> = {
  needs_review: ["feedback_submitted", "approved"],
  feedback_submitted: ["changes_in_progress", "approved"],
  changes_in_progress: ["approved"],
  approved: ["locked"],
  locked: [],
};

test("canTransition encodes the full legal-transition table", () => {
  for (const from of ALL_STATES) {
    for (const to of ALL_STATES) {
      assert.equal(
        canTransition(from, to),
        LEGAL[from].includes(to),
        `${from} -> ${to}`,
      );
    }
  }
});

test("locked is terminal: no outbound transition, not even to itself", () => {
  for (const to of ALL_STATES) {
    assert.equal(canTransition("locked", to), false, `locked -> ${to}`);
  }
});

test("locked is only reachable from approved", () => {
  for (const from of ALL_STATES) {
    assert.equal(canTransition(from, "locked"), from === "approved", `${from} -> locked`);
  }
});

test("no backwards transitions except changes_in_progress <- feedback_submitted", () => {
  // Backwards means: moving to an earlier stage in the lifecycle order.
  const order: AssetApprovalState[] = [
    "needs_review",
    "feedback_submitted",
    "changes_in_progress",
    "approved",
    "locked",
  ];
  for (const from of order) {
    for (const to of order) {
      if (order.indexOf(to) < order.indexOf(from)) {
        assert.equal(canTransition(from, to), false, `${from} -> ${to} must not go backwards`);
      }
    }
  }
  // The single sanctioned "loop back" edge in the spec.
  assert.equal(canTransition("feedback_submitted", "changes_in_progress"), true);
});

test("transition walks the happy path end to end", () => {
  const submitted = transition("needs_review", "submit_feedback");
  assert.deepEqual(submitted, { ok: true, state: "feedback_submitted" });

  const inProgress = transition("feedback_submitted", "request_changes");
  assert.deepEqual(inProgress, { ok: true, state: "changes_in_progress" });

  const approved = transition("changes_in_progress", "approve");
  assert.deepEqual(approved, { ok: true, state: "approved" });

  const locked = transition("approved", "lock");
  assert.deepEqual(locked, { ok: true, state: "locked" });
});

test("transition allows direct approval without feedback (one-click approve)", () => {
  assert.deepEqual(transition("needs_review", "approve"), { ok: true, state: "approved" });
  assert.deepEqual(transition("feedback_submitted", "approve"), { ok: true, state: "approved" });
});

test("transition rejects illegal actions with a structured error", () => {
  const skipAhead = transition("needs_review", "request_changes");
  assert.equal(skipAhead.ok, false);
  if (!skipAhead.ok) assert.match(skipAhead.error, /needs_review/);

  const lockTooEarly = transition("needs_review", "lock");
  assert.equal(lockTooEarly.ok, false);
  if (!lockTooEarly.ok) assert.match(lockTooEarly.error, /lock/i);

  const backwards = transition("approved", "submit_feedback");
  assert.equal(backwards.ok, false);

  const reopen = transition("changes_in_progress", "submit_feedback");
  assert.equal(reopen.ok, false, "changes_in_progress cannot move backwards to feedback_submitted");
});

test("transition out of locked always fails", () => {
  for (const action of ["submit_feedback", "request_changes", "approve", "lock"] as const) {
    const result = transition("locked", action);
    assert.equal(result.ok, false, `locked + ${action}`);
    if (!result.ok) assert.match(result.error, /locked/i);
  }
});

test("currentAssetState derives needs_review when nothing has happened", () => {
  assert.equal(currentAssetState([], []), "needs_review");
  assert.equal(currentAssetState([makeStep()], []), "needs_review");
});

test("currentAssetState derives feedback_submitted from reviewer comments", () => {
  assert.equal(
    currentAssetState([makeStep()], [{ id: "comment-1" }]),
    "feedback_submitted",
  );
});

test("currentAssetState derives changes_in_progress from a blocking decision", () => {
  assert.equal(
    currentAssetState([makeStep({ status: "changes_requested" })], []),
    "changes_in_progress",
  );
  assert.equal(
    currentAssetState([makeStep({ status: "rejected" })], [{ id: "c" }]),
    "changes_in_progress",
  );
});

test("currentAssetState derives approved only when every step approved", () => {
  const steps = [
    makeStep({ id: "s1", step_order: 1, status: "approved" }),
    makeStep({ id: "s2", step_order: 2, status: "approved_with_changes" }),
  ];
  assert.equal(currentAssetState(steps, []), "approved");

  const partial = [steps[0], makeStep({ id: "s3", step_order: 3 })];
  assert.equal(
    currentAssetState(partial, []),
    "needs_review",
    "a partial approval with no feedback is still needs_review",
  );
  assert.equal(currentAssetState([], []), "needs_review", "no steps means nothing to approve");
});

test("currentAssetState never returns locked: locked is an explicit gate, not a derivation", () => {
  const steps = [makeStep({ status: "approved" })];
  assert.notEqual(currentAssetState(steps, []), "locked");
});

test("activeApprovalSteps: sequential activates only the lowest pending step_order", () => {
  const steps = [
    makeStep({ id: "s2", step_order: 2 }),
    makeStep({ id: "s1", step_order: 1, status: "approved" }),
    makeStep({ id: "s3", step_order: 3 }),
  ];
  const active = activeApprovalSteps(steps, "sequential");
  assert.deepEqual(active.map((step) => step.id), ["s2"]);
});

test("activeApprovalSteps: parallel activates every pending step", () => {
  const steps = [
    makeStep({ id: "s1", step_order: 1 }),
    makeStep({ id: "s2", step_order: 2 }),
    makeStep({ id: "s3", step_order: 3, status: "approved" }),
  ];
  const active = activeApprovalSteps(steps, "parallel");
  assert.deepEqual(active.map((step) => step.id), ["s1", "s2"]);
});

test("activeApprovalSteps: unknown workflow mode treats all pending steps as active", () => {
  const steps = [makeStep({ id: "s1", step_order: 1 }), makeStep({ id: "s2", step_order: 2 })];
  assert.deepEqual(activeApprovalSteps(steps, null).map((step) => step.id), ["s1", "s2"]);
});

test("stepChipState maps decisions and the current step truthfully", () => {
  assert.equal(stepChipState(makeStep({ status: "approved" }), []), "approved");
  assert.equal(stepChipState(makeStep({ status: "approved_with_changes" }), []), "approved");
  assert.equal(stepChipState(makeStep({ status: "changes_requested" }), []), "rejected");
  assert.equal(stepChipState(makeStep({ status: "rejected" }), []), "rejected");
  assert.equal(stepChipState(makeStep({ id: "s1" }), ["s1"]), "current");
  assert.equal(stepChipState(makeStep({ id: "s1" }), ["s2"]), "pending");
  assert.equal(stepChipState(makeStep({ id: "s1" }), []), "pending");
});

test("shapeAuditEntry records actor, action, note and timestamp (Documenso-style)", () => {
  const entry = shapeAuditEntry({
    step: makeStep({ id: "approval-1", step_order: 1, role_label: "Client Lead" }),
    actor: { id: null, name: "Morgan Lee", email: "morgan@client.example" },
    decision: "approved",
    note: "  Ship it.  ",
    decidedAt: "2026-07-25T12:00:00.000Z",
    userAgent: "Mozilla/5.0 (Test)",
  });

  assert.deepEqual(entry, {
    step_id: "approval-1",
    step_order: 1,
    role_label: "Client Lead",
    actor: { id: null, name: "Morgan Lee", email: "morgan@client.example" },
    action: "approved",
    note: "Ship it.",
    decided_at: "2026-07-25T12:00:00.000Z",
    user_agent: "Mozilla/5.0 (Test)",
  });
});

test("shapeAuditEntry never fabricates userAgent", () => {
  const entry = shapeAuditEntry({
    step: makeStep(),
    actor: { name: "Morgan Lee" },
    decision: "approved",
    decidedAt: "2026-07-25T12:00:00.000Z",
  });
  assert.equal("user_agent" in entry, false);

  const blank = shapeAuditEntry({
    step: makeStep(),
    actor: { name: "Morgan Lee" },
    decision: "approved",
    decidedAt: "2026-07-25T12:00:00.000Z",
    userAgent: "   ",
  });
  assert.equal("user_agent" in blank, false);
});

test("shapeAuditEntry normalizes empty notes to null", () => {
  const entry = shapeAuditEntry({
    step: makeStep(),
    actor: { name: "Morgan Lee" },
    decision: "changes_requested",
    note: "   ",
    decidedAt: "2026-07-25T12:00:00.000Z",
  });
  assert.equal(entry.note, null);
});

test("shapeAuditEntry refuses pending decisions, anonymous actors and bogus timestamps", () => {
  assert.throws(
    () =>
      shapeAuditEntry({
        step: makeStep(),
        actor: { name: "Morgan Lee" },
        // @ts-expect-error pending is not a recorded decision
        decision: "pending",
        decidedAt: "2026-07-25T12:00:00.000Z",
      }),
    /pending/i,
  );
  assert.throws(
    () =>
      shapeAuditEntry({
        step: makeStep(),
        actor: { name: "  " },
        decision: "approved",
        decidedAt: "2026-07-25T12:00:00.000Z",
      }),
    /actor/i,
  );
  assert.throws(
    () =>
      shapeAuditEntry({
        step: makeStep(),
        actor: { name: "Morgan Lee" },
        decision: "approved",
        decidedAt: "not-a-date",
      }),
    /decidedAt|decided_at|date/i,
  );
});

test("auditEntriesFromSteps derives a chronological trail from decided steps only", () => {
  const steps = [
    makeStep({ id: "s1", step_order: 1, status: "pending" }),
    makeStep({
      id: "s2",
      step_order: 2,
      role_label: "Producer",
      status: "approved",
      decision_note: "Editorial pass complete.",
      decided_at: "2026-07-24T09:00:00.000Z",
      assignee_email: "producer@contentcoop.example",
    }),
    makeStep({
      id: "s3",
      step_order: 3,
      role_label: "Client Lead",
      status: "changes_requested",
      decision_note: null,
      decided_at: "2026-07-25T09:00:00.000Z",
      assignee_email: "reviewer@client.example",
    }),
  ];

  const entries = auditEntriesFromSteps(steps);
  assert.equal(entries.length, 2, "pending steps produce no audit entry");
  assert.deepEqual(entries.map((entry) => entry.step_id), ["s2", "s3"], "chronological by decided_at");
  assert.equal(entries[0].action, "approved");
  assert.equal(entries[0].note, "Editorial pass complete.");
  assert.equal(entries[0].actor.email, "producer@contentcoop.example");
  assert.equal(
    entries[0].actor.name,
    null,
    "derived entries never invent an actor name the step does not record",
  );
  assert.equal("user_agent" in entries[0], false, "derived entries never fabricate userAgent");
});
