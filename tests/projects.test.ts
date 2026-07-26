import assert from "node:assert/strict";
import test from "node:test";

import {
  diffBriefVersions,
  diffStringList,
  diffText,
  sortBriefVersionsNewestFirst,
  type BriefLike,
} from "../lib/projects/briefs.ts";
import {
  buildCalendarGrid,
  collectProjectEvents,
  groupEventsByDate,
} from "../lib/projects/calendar.ts";
import { formatDateShort, toDateKey } from "../lib/projects/dates.ts";
import {
  buildDeliverableRows,
  findReviewAssetId,
  rollupDeliverableRows,
} from "../lib/projects/deliverables.ts";
import { groupProjectFiles } from "../lib/projects/files.ts";
import { deriveProjectMilestones } from "../lib/projects/milestones.ts";

/* ------------------------------------------------------------------------- */
/* Brief versioning + diff                                                    */
/* ------------------------------------------------------------------------- */

const briefV1: BriefLike = {
  version: 1,
  status: "superseded",
  objectives: "Open the roadshow with a 60-second film.",
  audience: "Roadshow attendees.",
  message: "Precision work, honored publicly.",
  references: ["2025 roadshow open", "CERAWeek speaker package"],
  deliverables_notes: "16:9 master, captioned.",
  updated_at: "2026-07-13T16:30:00.000Z",
};

const briefV2: BriefLike = {
  version: 2,
  status: "approved",
  objectives: "Open the roadshow with a 60-second film and a social cutdown.",
  audience: "Roadshow attendees.",
  message: "Precision work, honored publicly.",
  references: ["2025 roadshow open", "ICA brand guidelines 2026"],
  deliverables_notes: "16:9 master, 9:16 social cut, captioned.",
  updated_at: "2026-07-14T20:10:00.000Z",
};

test("sortBriefVersionsNewestFirst orders by version descending without mutating input", () => {
  const input = [briefV1, briefV2];
  const sorted = sortBriefVersionsNewestFirst(input);
  assert.deepEqual(sorted.map((brief) => brief.version), [2, 1]);
  assert.deepEqual(input.map((brief) => brief.version), [1, 2], "input untouched");
});

test("diffText marks added and removed words at word level", () => {
  const segments = diffText("open the roadshow film", "open the roadshow film and a cutdown");
  assert.deepEqual(segments, [
    { kind: "same", text: "open the roadshow film" },
    { kind: "added", text: "and a cutdown" },
  ]);
});

test("diffText handles removal and replacement", () => {
  const segments = diffText("recruitment cut from workshop", "customer story film");
  const added = segments.filter((segment) => segment.kind === "added").map((segment) => segment.text).join(" ");
  const removed = segments.filter((segment) => segment.kind === "removed").map((segment) => segment.text).join(" ");
  assert.equal(added, "customer story film");
  assert.equal(removed, "recruitment cut from workshop");
});

test("diffText returns a single same segment for identical text", () => {
  assert.deepEqual(diffText("same words here", "same words here"), [
    { kind: "same", text: "same words here" },
  ]);
  assert.deepEqual(diffText("", ""), []);
});

test("diffStringList reports added, removed, and unchanged references", () => {
  assert.deepEqual(
    diffStringList(["a", "b"], ["b", "c"]),
    { added: ["c"], removed: ["a"], unchanged: ["b"] },
  );
});

test("diffBriefVersions compares consecutive versions field by field", () => {
  const diff = diffBriefVersions(briefV1, briefV2);
  assert.equal(diff.fromVersion, 1);
  assert.equal(diff.toVersion, 2);

  const objectives = diff.fields.find((field) => field.field === "objectives");
  assert.equal(objectives?.changed, true);
  assert.ok(
    objectives?.segments.some((segment) => segment.kind === "added" && segment.text.includes("social cutdown")),
    "objectives diff highlights the added phrase",
  );

  const message = diff.fields.find((field) => field.field === "message");
  assert.equal(message?.changed, false, "unchanged message is not flagged");

  assert.deepEqual(diff.references.added, ["ICA brand guidelines 2026"]);
  assert.deepEqual(diff.references.removed, ["CERAWeek speaker package"]);
  assert.equal(diff.changedFieldCount, 3, "objectives + references + deliverables notes");
});

/* ------------------------------------------------------------------------- */
/* Deliverables tracker                                                       */
/* ------------------------------------------------------------------------- */

const deliverableFixtures = [
  {
    id: "del-master",
    project_id: "ica",
    name: "ICA_ROADSHOW_MASTER_16x9.mov",
    spec: { resolution: "3840x2160", codec: "ProRes 422 HQ", aspect: "16:9", captions: true, audio: "stereo 48kHz", watermark: false },
    source_version_id: "ver-ica-final-v5",
    status: "delivered" as const,
    qc_checks: [],
    qc_notes: "",
    delivered_at: "2026-03-09T19:30:00.000Z",
    created_at: "2026-07-10T15:00:00.000Z",
    updated_at: "2026-03-09T19:30:00.000Z",
    created_by: "user-bailey",
  },
  {
    id: "del-social",
    project_id: "ica",
    name: "ICA_ROADSHOW_SOCIAL_9x16.mp4",
    spec: { resolution: "1080x1920", codec: "H.264 12Mbps", aspect: "9:16", captions: true, audio: "stereo 48kHz", watermark: false },
    source_version_id: "ver-ica-final-v5",
    status: "qc" as const,
    qc_checks: [],
    qc_notes: "",
    delivered_at: null,
    created_at: "2026-07-11T16:30:00.000Z",
    updated_at: "2026-07-13T16:30:00.000Z",
    created_by: "user-bailey",
  },
];

const assetFixtures = [
  { id: "ica-roadshow-final", project_id: "ica", title: "ICA_ROADSHOW_x_FINAL", file_type: "video", duration_seconds: 60, status: "approved" },
  { id: "denie-mcdonald-v4", project_id: "ica", title: "Denie McDonald_v4", file_type: "video", duration_seconds: 71, status: "in_review" },
  { id: "ica-ceo-hero-v1", project_id: "ica", title: "ICA CEO Hero_v1", file_type: "video", duration_seconds: 45, status: "approved" },
];

test("findReviewAssetId links a deliverable to its source asset by name tokens", () => {
  assert.equal(findReviewAssetId(deliverableFixtures[0], assetFixtures), "ica-roadshow-final");
  assert.equal(findReviewAssetId(deliverableFixtures[1], assetFixtures), "ica-roadshow-final");
});

test("findReviewAssetId returns null when nothing matches honestly", () => {
  const orphan = { ...deliverableFixtures[0], name: "UNRELATED_EXPORT_v1.mov", source_version_id: null };
  assert.equal(findReviewAssetId(orphan, assetFixtures), null);
});

test("buildDeliverableRows combines export records and media assets", () => {
  const rows = buildDeliverableRows({ deliverables: deliverableFixtures, assets: assetFixtures });
  assert.equal(rows.length, 5, "2 export records + 3 media assets");

  const master = rows.find((row) => row.id === "del-master");
  assert.equal(master?.kind, "export");
  assert.equal(master?.statusKey, "delivered");
  assert.equal(master?.reviewAssetId, "ica-roadshow-final");
  assert.match(master?.format ?? "", /16:9/);
  assert.match(master?.format ?? "", /ProRes/);
  assert.match(master?.timeline ?? "", /Delivered/);

  const denie = rows.find((row) => row.id === "denie-mcdonald-v4");
  assert.equal(denie?.kind, "media");
  assert.equal(denie?.durationSeconds, 71);
  assert.equal(denie?.reviewAssetId, "denie-mcdonald-v4", "media rows review-link to themselves");

  const social = rows.find((row) => row.id === "del-social");
  assert.equal(social?.timeline, "Not scheduled", "no invented due dates");
});

test("rollupDeliverableRows counts rows by status in stable order", () => {
  const rows = buildDeliverableRows({ deliverables: deliverableFixtures, assets: assetFixtures });
  const rollup = rollupDeliverableRows(rows);
  assert.equal(rollup.total, 5);
  const byKey = new Map(rollup.counts.map((entry) => [entry.statusKey, entry.count]));
  assert.equal(byKey.get("delivered"), 1);
  assert.equal(byKey.get("qc"), 1);
  assert.equal(byKey.get("in_review"), 1);
  assert.equal(byKey.get("approved"), 2);
  assert.equal(
    rollup.counts.reduce((sum, entry) => sum + entry.count, 0),
    5,
    "counts always add up to the total",
  );
});

/* ------------------------------------------------------------------------- */
/* Milestone derivation                                                       */
/* ------------------------------------------------------------------------- */

test("deriveProjectMilestones reflects the ICA seed truth (review stage, round 2 open)", () => {
  const milestones = deriveProjectMilestones({
    stage: "review",
    briefs: [{ version: 1, status: "approved", created_at: "2026-07-10T15:00:00.000Z" }],
    proposals: [{ status: "approved", approved_at: "2026-03-01T17:20:00.000Z" }],
    planItems: [
      { id: "p1", kind: "task", title: "Caption pass", date: "2026-07-16", status: "done" },
    ],
    productionDays: [],
    revisionRequests: [{ round: 2, status: "in_progress", updated_at: "2026-07-15T18:45:00.000Z" }],
    approvalStages: [
      { status: "in_progress" },
      { status: "pending" },
      { status: "approved" },
    ],
    deliverables: [
      { status: "delivered", delivered_at: "2026-03-09T19:30:00.000Z" },
      { status: "qc", delivered_at: null },
    ],
    today: "2026-07-26",
  });

  const byId = new Map(milestones.map((milestone) => [milestone.id, milestone]));
  assert.equal(byId.get("kickoff")?.state, "done");
  assert.equal(byId.get("preproduction")?.state, "done");
  assert.equal(byId.get("edit")?.state, "current", "revision round 2 still open");
  assert.match(byId.get("edit")?.detail ?? "", /Round 2/);
  assert.equal(byId.get("approval")?.state, "current");
  assert.match(byId.get("approval")?.detail ?? "", /1 of 3/);
  assert.equal(byId.get("delivery")?.state, "current", "master delivered, social still in QC");
  assert.equal(byId.get("delivery")?.date, "2026-03-09T19:30:00.000Z");
});

test("deriveProjectMilestones flags blocked production as at risk", () => {
  const milestones = deriveProjectMilestones({
    stage: "production",
    briefs: [],
    proposals: [],
    planItems: [
      { id: "pd1", kind: "production_day", title: "Shoot day 1", date: "2026-07-20", status: "blocked" },
    ],
    productionDays: [],
    revisionRequests: [],
    approvalStages: [],
    deliverables: [],
    today: "2026-07-26",
  });
  const production = milestones.find((milestone) => milestone.id === "production");
  assert.equal(production?.state, "at_risk");
  assert.match(production?.detail ?? "", /[Bb]locked/);
});

test("deriveProjectMilestones keeps early-stage projects upcoming, never done", () => {
  const milestones = deriveProjectMilestones({
    stage: "development",
    briefs: [{ version: 1, status: "draft", created_at: "2026-07-10T15:00:00.000Z" }],
    proposals: [],
    planItems: [],
    productionDays: [],
    revisionRequests: [],
    approvalStages: [],
    deliverables: [],
    today: "2026-07-26",
  });
  const byId = new Map(milestones.map((milestone) => [milestone.id, milestone]));
  assert.equal(byId.get("kickoff")?.state, "current");
  assert.equal(byId.get("production")?.state, "upcoming");
  assert.equal(byId.get("delivery")?.state, "upcoming");
  assert.equal(byId.get("delivery")?.date, null);
});

/* ------------------------------------------------------------------------- */
/* Calendar                                                                   */
/* ------------------------------------------------------------------------- */

test("buildCalendarGrid covers the whole month in Sunday-start weeks", () => {
  const weeks = buildCalendarGrid(2026, 6, "2026-07-26"); // July 2026
  assert.equal(weeks.length, 5, "July 2026 spans 5 Sunday-start weeks");
  for (const week of weeks) assert.equal(week.length, 7);

  const first = weeks[0][0];
  assert.equal(first.date, "2026-06-28", "week opens on the preceding Sunday");
  assert.equal(first.inMonth, false);

  const july1 = weeks.flat().find((cell) => cell.date === "2026-07-01");
  assert.equal(july1?.inMonth, true);

  const last = weeks.at(-1)?.at(-1);
  assert.equal(last?.date, "2026-08-01");

  const today = weeks.flat().find((cell) => cell.isToday);
  assert.equal(today?.date, "2026-07-26");
});

test("buildCalendarGrid handles months needing six weeks", () => {
  const weeks = buildCalendarGrid(2026, 7, "2026-08-15"); // August 2026
  assert.equal(weeks.length, 6);
  assert.equal(weeks[0][0].date, "2026-07-26");
});

test("collectProjectEvents maps seeds to typed, dated events", () => {
  const events = collectProjectEvents({
    planItems: [
      { id: "plan-shoot", kind: "production_day", title: "Rodeo recap — day 1", date: "2026-07-18", status: "pending" },
      { id: "plan-rough", kind: "milestone", title: "Rough cut to Rachel", date: "2026-07-24", status: "pending" },
      { id: "plan-captions", kind: "task", title: "Caption pass on roadshow master", date: "2026-07-16", status: "done" },
      { id: "plan-undated", kind: "task", title: "Someday task", date: null, status: "pending" },
    ],
    productionDays: [
      { id: "pd-1", date: "2026-08-18", type: "principal", notes: "Control room interview" },
    ],
    deliverables: [
      { id: "del-1", name: "MASTER.mov", status: "delivered", delivered_at: "2026-03-09T19:30:00.000Z" },
    ],
  });

  const byId = new Map(events.map((event) => [event.id, event]));
  assert.equal(byId.get("plan-shoot")?.type, "shoot");
  assert.equal(byId.get("plan-rough")?.type, "review", "cut-to-client milestones read as review deadlines");
  assert.equal(byId.get("plan-captions")?.type, "task");
  assert.equal(byId.get("pd-1")?.type, "shoot");
  assert.equal(byId.get("del-1")?.type, "delivery");
  assert.equal(byId.get("del-1")?.date, "2026-03-09", "datetimes are reduced to date keys");
  assert.equal(byId.has("plan-undated"), false, "undated items never invent dates");
});

test("groupEventsByDate buckets events under their date key", () => {
  const grouped = groupEventsByDate([
    { id: "a", date: "2026-07-16", type: "task", label: "Caption pass" },
    { id: "b", date: "2026-07-16", type: "shoot", label: "Shoot day" },
    { id: "c", date: "2026-07-24", type: "review", label: "Rough cut" },
  ]);
  assert.equal(grouped["2026-07-16"].length, 2);
  assert.equal(grouped["2026-07-24"].length, 1);
});

/* ------------------------------------------------------------------------- */
/* Files grouping                                                             */
/* ------------------------------------------------------------------------- */

test("groupProjectFiles keeps honest download states per group", () => {
  const groups = groupProjectFiles({
    briefs: [
      { id: "brief-1", version: 2, status: "approved", updated_at: "2026-07-14T20:10:00.000Z" },
      { id: "brief-1-v1", version: 1, status: "superseded", updated_at: "2026-07-13T16:30:00.000Z" },
    ],
    assets: [
      { id: "hero", title: "ICA CEO Hero_v1", file_url: "/demo/ica-ceo-preview.mp4", file_type: "video" },
      { id: "denie", title: "Denie McDonald_v4", file_url: null, file_type: "video" },
    ],
    releases: [
      { id: "rel-1", person_name: "Gisela Rivas", status: "signed", file_url: null },
    ],
    deliverables: [
      { id: "del-1", name: "ICA_ROADSHOW_MASTER_16x9.mov", status: "delivered", delivered_at: "2026-03-09T19:30:00.000Z" },
    ],
  });

  const byId = new Map(groups.map((group) => [group.id, group]));
  assert.deepEqual(
    groups.map((group) => group.id),
    ["briefs", "scripts", "brand", "uploads", "releases", "exports"],
    "all six founder-spec groups, in order",
  );

  const briefsGroup = byId.get("briefs");
  assert.equal(briefsGroup?.rows.length, 2);
  assert.equal(briefsGroup?.rows[0].availability, "on_request");

  const uploads = byId.get("uploads");
  const hero = uploads?.rows.find((row) => row.id === "hero");
  assert.equal(hero?.availability, "download");
  assert.equal(hero?.href, "/demo/ica-ceo-preview.mp4");
  const denie = uploads?.rows.find((row) => row.id === "denie");
  assert.equal(denie?.availability, "on_request");
  assert.equal(denie?.href, null, "no fake download links");

  assert.equal(byId.get("scripts")?.rows.length, 0, "empty groups stay empty honestly");

  const release = byId.get("releases")?.rows[0];
  assert.match(release?.detail ?? "", /[Ss]igned/);
  assert.equal(release?.availability, "on_request");

  const exportRow = byId.get("exports")?.rows[0];
  assert.match(exportRow?.detail ?? "", /Delivered/);
});

/* ------------------------------------------------------------------------- */
/* Brand guardrails                                                           */
/* ------------------------------------------------------------------------- */

test("projectBrandGuardrails returns standing guardrails, never invented ones", async () => {
  const { projectBrandGuardrails } = await import("../lib/projects/guardrails.ts");
  assert.ok(projectBrandGuardrails("ica").length > 0);
  assert.deepEqual(projectBrandGuardrails("unknown-project"), []);
});

/* ------------------------------------------------------------------------- */
/* Dates                                                                      */
/* ------------------------------------------------------------------------- */

test("formatDateShort and toDateKey are locale-stable", () => {
  assert.equal(toDateKey("2026-03-09T19:30:00.000Z"), "2026-03-09");
  assert.equal(formatDateShort("2026-03-09"), "Mar 9, 2026");
  assert.equal(formatDateShort("2026-03-09T19:30:00.000Z"), "Mar 9, 2026");
  assert.equal(formatDateShort(null), "—");
});
