import assert from "node:assert/strict";
import test from "node:test";

import {
  PROJECT_STAGES,
  currentBrief,
  currentProposal,
  openRevisionRequests,
  proposalEstimateTotal,
  type EstimateLine,
} from "../lib/covideopro/record.ts";
import {
  clipsFromSelects,
  nextBriefVersion,
  nextProposalVersion,
  nextRevisionRound,
  transitionBrief,
  transitionDeliverable,
  transitionInquiry,
  transitionProjectStage,
  transitionProposal,
  transitionRevisionRequest,
  transitionSequence,
  validateSequenceClip,
  type ProjectStageContext,
} from "../lib/covideopro/transitions.ts";

/* ------------------------------ Inquiry ---------------------------------- */

test("inquiry follows new → triaged → qualified → converted with guards", () => {
  const base = { status: "new" as const, organization_id: null, contact_id: null, project_id: null };

  assert.deepEqual(transitionInquiry(base, "qualified"), {
    ok: false,
    reason: "Invalid transition new → qualified.",
  });
  assert.deepEqual(transitionInquiry(base, "triaged"), { ok: true });

  const triaged = { ...base, status: "triaged" as const };
  assert.equal(transitionInquiry(triaged, "qualified").ok, false, "qualify needs org + contact");

  const linked = { ...triaged, organization_id: "org-1", contact_id: "contact-1" };
  assert.deepEqual(transitionInquiry(linked, "qualified"), { ok: true });

  const qualified = { ...linked, status: "qualified" as const };
  assert.equal(transitionInquiry(qualified, "converted").ok, false, "convert needs a project");
  assert.deepEqual(transitionInquiry({ ...qualified, project_id: "proj-1" }, "converted"), { ok: true });

  assert.equal(transitionInquiry({ ...base, status: "converted" }, "triaged").ok, false);
  assert.deepEqual(transitionInquiry(base, "declined"), { ok: true });
});

/* ------------------------------- Brief ----------------------------------- */

test("brief review gate requires objectives; approval requires audience + message", () => {
  const empty = { status: "draft" as const, objectives: "", audience: "", message: "" };
  assert.equal(transitionBrief(empty, "in_review").ok, false);

  const drafted = { ...empty, objectives: "Launch film for the new line." };
  assert.deepEqual(transitionBrief(drafted, "in_review"), { ok: true });

  const inReview = { ...drafted, status: "in_review" as const };
  assert.equal(transitionBrief(inReview, "approved").ok, false);

  const complete = { ...inReview, audience: "Refinery ops leads", message: "Safety is craft." };
  assert.deepEqual(transitionBrief(complete, "approved"), { ok: true });
  assert.deepEqual(transitionBrief({ ...complete, status: "approved" }, "superseded"), { ok: true });
});

test("revising an approved brief creates the next version and supersedes the old", () => {
  assert.deepEqual(nextBriefVersion({ version: 2, status: "approved" }), {
    ok: true,
    version: 3,
    supersedePrevious: true,
  });
  assert.deepEqual(nextBriefVersion({ version: 1, status: "draft" }), {
    ok: true,
    version: 2,
    supersedePrevious: false,
  });
  assert.equal(nextBriefVersion({ version: 3, status: "superseded" }).ok, false);
});

test("currentBrief ignores superseded versions", () => {
  const make = (version: number, status: "draft" | "approved" | "superseded") => ({
    id: `b${version}`,
    project_id: "p",
    version,
    status,
    objectives: "o",
    audience: "a",
    message: "m",
    references: [],
    deliverables_notes: "",
    created_at: "",
    updated_at: "",
    created_by: "u",
  });
  assert.equal(currentBrief([make(1, "superseded"), make(2, "approved")])?.version, 2);
  assert.equal(currentBrief([make(1, "superseded")]), null);
});

/* ------------------------------ Proposal --------------------------------- */

const lines: EstimateLine[] = [
  { id: "l1", category: "crew", description: "DP", quantity: 2, unit_rate: 850, markup_pct: 10, optional: false },
  { id: "l2", category: "post", description: "Online edit", quantity: 1, unit_rate: 2400, markup_pct: 0, optional: true },
];

test("proposal send requires a valid non-optional estimate line", () => {
  const draft = { status: "draft" as const, estimate_lines: [] };
  assert.deepEqual(transitionProposal(draft, "sent"), {
    ok: false,
    reason: "Invalid transition draft → sent.",
  });

  const inReview = { status: "in_review" as const, estimate_lines: [] };
  assert.equal(transitionProposal(inReview, "sent").ok, false);

  const optionalOnly = { ...inReview, estimate_lines: [lines[1]] };
  assert.equal(transitionProposal(optionalOnly, "sent").ok, false);

  const valid = { ...inReview, estimate_lines: lines };
  assert.deepEqual(transitionProposal(valid, "sent"), { ok: true });
});

test("proposal approval requires an identified approver; decline is terminal", () => {
  const sent = { status: "sent" as const, estimate_lines: lines };
  assert.equal(transitionProposal(sent, "approved").ok, false);
  assert.deepEqual(transitionProposal(sent, "approved", { actorEmail: "client@example.com" }), { ok: true });
  assert.deepEqual(transitionProposal(sent, "declined"), { ok: true });
  assert.equal(transitionProposal({ ...sent, status: "declined" }, "sent").ok, false);
});

test("estimate totals exclude optional lines by default", () => {
  assert.equal(proposalEstimateTotal(lines), 2 * 850 * 1.1);
  assert.equal(proposalEstimateTotal(lines, { includeOptional: true }), 2 * 850 * 1.1 + 2400);
  assert.equal(currentProposal([]), null);
});

test("change order on an approved proposal versions forward", () => {
  assert.deepEqual(nextProposalVersion({ version: 1, status: "approved" }), {
    ok: true,
    version: 2,
    supersedePrevious: true,
  });
  assert.equal(nextProposalVersion({ version: 1, status: "declined" }).ok, false);
});

/* ------------------------------ Sequence --------------------------------- */

test("sequence review gate requires clips and a review version", () => {
  const sequence = { id: "seq-1", status: "draft" as const };
  assert.equal(
    transitionSequence(sequence, "in_review", { clips: [], hasReviewVersion: false }).ok,
    false,
  );
  const clip = { sequence_id: "seq-1" };
  assert.equal(
    transitionSequence(sequence, "in_review", { clips: [clip], hasReviewVersion: false }).ok,
    false,
  );
  assert.deepEqual(
    transitionSequence(sequence, "in_review", { clips: [clip], hasReviewVersion: true }),
    { ok: true },
  );
  assert.deepEqual(
    transitionSequence({ ...sequence, status: "approved" }, "locked", { clips: [clip], hasReviewVersion: true }),
    { ok: true },
  );
});

test("clip validation enforces real source/record times", () => {
  const speedChange = validateSequenceClip({ timeline_in_seconds: 0, timeline_out_seconds: 5, source_in_seconds: 10, source_out_seconds: 14 });
  assert.equal(speedChange.ok, false);
  if (!speedChange.ok) {
    assert.match(speedChange.reason, /durations must match/);
  }
  assert.deepEqual(
    validateSequenceClip({ timeline_in_seconds: 0, timeline_out_seconds: 4, source_in_seconds: 10, source_out_seconds: 14 }),
    { ok: true },
  );
  assert.equal(
    validateSequenceClip({ timeline_in_seconds: 0, timeline_out_seconds: 4, source_in_seconds: 10, source_out_seconds: 9 }).ok,
    false,
  );
});

test("clipsFromSelects assembles a back-to-back radio cut", () => {
  let id = 0;
  const clips = clipsFromSelects(
    "seq-9",
    [
      { id: "sel-1", asset_id: "a1", version_id: null, in_seconds: 5, out_seconds: 12 },
      { id: "sel-2", asset_id: "a1", version_id: "v2", in_seconds: 40, out_seconds: 55 },
    ],
    () => `clip-${++id}`,
  );
  assert.deepEqual(
    clips.map((clip) => [clip.timeline_in_seconds, clip.timeline_out_seconds]),
    [[0, 7], [7, 22]],
  );
  assert.deepEqual(clips.map((clip) => clip.select_id), ["sel-1", "sel-2"]);
  assert.equal(clips[1].source_in_seconds, 40);
});

/* -------------------------- Revision requests ----------------------------- */

test("revision rounds increment per asset and verification guards unresolved comments", () => {
  assert.equal(nextRevisionRound([], "asset-1"), 1);
  assert.equal(nextRevisionRound([{ asset_id: "asset-1", round: 2 }, { asset_id: "asset-2", round: 7 }], "asset-1"), 3);

  const addressed = { status: "addressed" as const };
  assert.equal(
    transitionRevisionRequest(addressed, "verified", { unresolvedCommentCount: 2, waivedUnresolved: false }).ok,
    false,
  );
  assert.deepEqual(
    transitionRevisionRequest(addressed, "verified", { unresolvedCommentCount: 0, waivedUnresolved: false }),
    { ok: true },
  );
  assert.deepEqual(
    transitionRevisionRequest(addressed, "verified", { unresolvedCommentCount: 2, waivedUnresolved: true }),
    { ok: true },
  );

  const requests = [
    { status: "open" as const },
    { status: "verified" as const },
    { status: "in_progress" as const },
  ] as Parameters<typeof openRevisionRequests>[0];
  assert.equal(openRevisionRequests(requests).length, 2);
});

/* ----------------------------- Deliverables ------------------------------- */

test("deliverable QC requires a frozen source version; expiry only from ready", () => {
  const encoding = { status: "encoding" as const, source_version_id: null };
  assert.equal(transitionDeliverable(encoding, "qc").ok, false);
  assert.deepEqual(transitionDeliverable({ ...encoding, source_version_id: "ver-1" }, "qc"), { ok: true });
  assert.equal(transitionDeliverable({ status: "qc", source_version_id: "ver-1" }, "delivered").ok, false);
  assert.deepEqual(transitionDeliverable({ status: "ready", source_version_id: "ver-1" }, "delivered"), { ok: true });
  assert.deepEqual(transitionDeliverable({ status: "ready", source_version_id: "ver-1" }, "expired"), { ok: true });
});

/* ---------------------------- Project stage ------------------------------- */

function stageContext(patch: Partial<ProjectStageContext> = {}): ProjectStageContext {
  return {
    hasOrganization: false,
    hasContact: false,
    hasBrief: false,
    hasApprovedProposal: false,
    hasProductionDay: false,
    hasSequence: false,
    hasActiveReview: false,
    hasFinalApproval: false,
    hasSpeccedDeliverable: false,
    allDeliverablesClosed: false,
    planItems: [],
    ...patch,
  };
}

test("project stage advances one gated step at a time, never regresses", () => {
  assert.equal(PROJECT_STAGES.length, 9);

  const inquiry = { stage: "inquiry" as const };
  assert.equal(transitionProjectStage(inquiry, "development", stageContext()).ok, false, "no skipping");
  assert.equal(transitionProjectStage(inquiry, "intake", stageContext()).ok, false, "gate: org + contact");
  assert.deepEqual(
    transitionProjectStage(inquiry, "intake", stageContext({ hasOrganization: true, hasContact: true })),
    { ok: true },
  );

  const intake = { stage: "intake" as const };
  assert.equal(transitionProjectStage(intake, "inquiry", stageContext()).ok, false, "no silent regression");
  assert.equal(transitionProjectStage(intake, "development", stageContext()).ok, false, "gate: brief");
  assert.deepEqual(transitionProjectStage(intake, "development", stageContext({ hasBrief: true })), { ok: true });

  const delivery = { stage: "delivery" as const };
  assert.equal(
    transitionProjectStage(delivery, "archived", stageContext({ allDeliverablesClosed: false })).ok,
    false,
  );
  assert.deepEqual(
    transitionProjectStage(delivery, "archived", stageContext({ allDeliverablesClosed: true })),
    { ok: true },
  );
});
