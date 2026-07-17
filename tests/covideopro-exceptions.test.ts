import assert from "node:assert/strict";
import test from "node:test";

import { deriveExceptions } from "../lib/covideopro/exceptions.ts";

const OWNER = "Bailey Eubanks";

function base(overrides: Partial<Parameters<typeof deriveExceptions>[0]> = {}) {
  return {
    releases: [],
    productionDays: [],
    proposals: [],
    revisionRequests: [],
    deliverables: [],
    planItems: [],
    ownerName: OWNER,
    ...overrides,
  };
}

test("unsigned release near shoot is critical and carries the repair verb", () => {
  const exceptions = deriveExceptions(base({
    releases: [
      { id: "r1", project_id: "p", person_name: "Ephram Sims", type: "appearance", status: "unsent", signed_at: null, file_url: null, language: "en", production_day_ids: ["d1"], created_at: "", updated_at: "", created_by: "u" },
      { id: "r2", project_id: "p", person_name: "Signed Person", type: "appearance", status: "signed", signed_at: "", file_url: null, language: "en", production_day_ids: ["d1"], created_at: "", updated_at: "", created_by: "u" },
    ],
    productionDays: [
      { id: "d1", project_id: "p", date: "2026-07-19", call: null, wrap: null, type: "principal", status: "scheduled", notes: "", created_at: "", updated_at: "", created_by: "u" },
    ],
  }), "2026-07-17");

  assert.equal(exceptions.length, 1);
  const exception = exceptions[0];
  assert.equal(exception.kind, "release_unsigned");
  assert.equal(exception.severity, "critical");
  assert.match(exception.title, /Ephram Sims/);
  assert.match(exception.title, /in 2 days/);
  assert.equal(exception.repair.label, "Send release");
  assert.match(exception.repair.href, /surface=plan/);
  assert.ok(exception.clearCondition.length > 0);
});

test("signed, far-future, and cancelled-day releases raise nothing", () => {
  const exceptions = deriveExceptions(base({
    releases: [
      { id: "r1", project_id: "p", person_name: "Far", type: "appearance", status: "unsent", signed_at: null, file_url: null, language: "en", production_day_ids: ["d2"], created_at: "", updated_at: "", created_by: "u" },
      { id: "r2", project_id: "p", person_name: "Cancelled", type: "appearance", status: "unsent", signed_at: null, file_url: null, language: "en", production_day_ids: ["d3"], created_at: "", updated_at: "", created_by: "u" },
    ],
    productionDays: [
      { id: "d2", project_id: "p", date: "2026-09-01", call: null, wrap: null, type: "principal", status: "scheduled", notes: "", created_at: "", updated_at: "", created_by: "u" },
      { id: "d3", project_id: "p", date: "2026-07-18", call: null, wrap: null, type: "principal", status: "cancelled", notes: "", created_at: "", updated_at: "", created_by: "u" },
    ],
  }), "2026-07-17");
  assert.deepEqual(exceptions, []);
});

test("stale proposal, stale revision, stale QC, overdue milestone all fire with correct verbs", () => {
  const exceptions = deriveExceptions(base({
    proposals: [
      { id: "pr1", project_id: "p", version: 1, status: "sent", title: "Film", narrative: "", estimate_lines: [], valid_until: null, approved_by: null, approved_at: null, created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z", created_by: "u" },
    ],
    revisionRequests: [
      { id: "rr1", project_id: "p", asset_id: "a", version_id: null, round: 2, summary: "tighten the cut", status: "in_progress", comment_ids: [], created_at: "2026-07-05T00:00:00Z", updated_at: "2026-07-05T00:00:00Z", created_by: "u" },
    ],
    deliverables: [
      { id: "de1", project_id: "p", name: "MASTER.mov", spec: { resolution: "4K", codec: "ProRes", aspect: "16:9", captions: true, audio: "stereo", watermark: false }, source_version_id: "v", status: "qc", qc_notes: "", delivered_at: null, created_at: "2026-07-08T00:00:00Z", updated_at: "2026-07-08T00:00:00Z", created_by: "u" },
    ],
    planItems: [
      { id: "pl1", project_id: "p", kind: "milestone", title: "Rough cut to client", date: "2026-07-15", assignee: null, status: "pending", depends_on: [], meta: {}, created_at: "", updated_at: "", created_by: "u" },
      { id: "pl2", project_id: "p", kind: "task", title: "Future task", date: "2026-08-15", assignee: null, status: "pending", depends_on: [], meta: {}, created_at: "", updated_at: "", created_by: "u" },
    ],
  }), "2026-07-17");

  const kinds = exceptions.map((exception) => exception.kind).sort();
  assert.deepEqual(kinds, ["plan_overdue", "proposal_stale", "qc_stale", "revision_stale"]);
  assert.equal(exceptions.find((exception) => exception.kind === "proposal_stale")?.repair.label, "Nudge client");
  assert.equal(exceptions.find((exception) => exception.kind === "revision_stale")?.repair.label, "Mark addressed");
  assert.equal(exceptions.find((exception) => exception.kind === "qc_stale")?.repair.label, "Finish QC");
  assert.equal(exceptions.find((exception) => exception.kind === "plan_overdue")?.severity, "critical", "overdue milestone is critical");
});

test("critical exceptions outrank attention; nothing fires inside freshness windows", () => {
  const exceptions = deriveExceptions(base({
    proposals: [
      { id: "pr1", project_id: "p", version: 1, status: "sent", title: "Fresh", narrative: "", estimate_lines: [], valid_until: null, approved_by: null, approved_at: null, created_at: "2026-07-14T00:00:00Z", updated_at: "2026-07-14T00:00:00Z", created_by: "u" },
    ],
    releases: [
      { id: "r1", project_id: "p", person_name: "Urgent", type: "appearance", status: "sent", signed_at: null, file_url: null, language: "en", production_day_ids: ["d1"], created_at: "", updated_at: "", created_by: "u" },
    ],
    productionDays: [
      { id: "d1", project_id: "p", date: "2026-07-18", call: null, wrap: null, type: "principal", status: "scheduled", notes: "", created_at: "", updated_at: "", created_by: "u" },
    ],
  }), "2026-07-17");

  assert.equal(exceptions.length, 1, "fresh proposal raises nothing");
  assert.equal(exceptions[0].kind, "release_unsigned");
  assert.equal(exceptions[0].severity, "critical");
  assert.equal(exceptions[0].repair.label, "Chase signature", "sent-but-unsigned gets the chase verb");
});
