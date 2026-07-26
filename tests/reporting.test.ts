import assert from "node:assert/strict";
import test from "node:test";

import {
  formatPercent,
  formatWatchTime,
  outlierMetric,
  rankCreatives,
  shapeCreativePerformance,
  summarizePerformance,
  topCreative,
  type PerformanceMetric,
} from "../lib/reporting/performance.ts";
import {
  INSIGHT_RULES,
  INSIGHT_THRESHOLDS,
  evaluateInsights,
} from "../lib/reporting/insights.ts";
import { escapeCsvValue, performanceCsv, toCsv } from "../lib/reporting/csv.ts";
import {
  buildProjectRecap,
  currentRecapProposal,
  formatMoney,
} from "../lib/reporting/recap.ts";
import {
  seedDeliverables,
  seedPaymentMilestones,
  seedPlanItems,
  seedProposals,
} from "../lib/demo/record-seed.ts";

function metric(overrides: Partial<PerformanceMetric> = {}): PerformanceMetric {
  return {
    id: "m-1",
    asset_id: "asset-1",
    project_id: "ica",
    title: "Cut, v1",
    platform: "LinkedIn",
    aspect: "16:9",
    published_at: "2026-07-01T12:00:00.000Z",
    duration_seconds: 60,
    views: 1000,
    engagements: 50,
    avg_watch_seconds: 30,
    completions: 500,
    clicks: 20,
    leads: 2,
    ...overrides,
  };
}

/* ---------------------------- performance.ts ------------------------------ */

test("shapeCreativePerformance derives rates with divide-by-zero safety", () => {
  const [shaped] = shapeCreativePerformance([metric()]);
  assert.equal(shaped.engagement_rate, 0.05);
  assert.equal(shaped.completion_rate, 0.5);
  assert.equal(shaped.ctr, 0.02);
  assert.equal(shaped.watch_rate, 0.5);

  const [empty] = shapeCreativePerformance([
    metric({ views: 0, engagements: 0, completions: 0, clicks: 0, duration_seconds: 0 }),
  ]);
  assert.equal(empty.engagement_rate, 0);
  assert.equal(empty.completion_rate, 0);
  assert.equal(empty.ctr, 0);
  assert.equal(empty.watch_rate, 0);
});

test("summarizePerformance rolls KPIs up view-weighted, not rate-averaged", () => {
  const creatives = shapeCreativePerformance([
    metric({ id: "a", views: 1000, engagements: 100, completions: 500, avg_watch_seconds: 40, clicks: 10, leads: 1 }),
    metric({ id: "b", views: 100, engagements: 9, completions: 90, avg_watch_seconds: 10, clicks: 5, leads: 3 }),
  ]);
  const summary = summarizePerformance(creatives);
  assert.equal(summary.creativeCount, 2);
  assert.equal(summary.views, 1100);
  // (100 + 9) / 1100 — not (10% + 9%) / 2.
  assert.ok(Math.abs(summary.engagementRate - 109 / 1100) < 1e-12);
  assert.ok(Math.abs(summary.completionRate - 590 / 1100) < 1e-12);
  // View-weighted watch time: (40*1000 + 10*100) / 1100.
  assert.ok(Math.abs(summary.avgWatchSeconds - 41000 / 1100) < 1e-9);
  assert.equal(summary.clicks, 15);
  assert.equal(summary.leads, 4);
});

test("outlierMetric picks the KPI with the strongest max/median standout", () => {
  const creatives = shapeCreativePerformance([
    metric({ id: "a", views: 1000, clicks: 20 }),
    metric({ id: "b", views: 1100, clicks: 22 }),
    metric({ id: "c", views: 900, clicks: 21 }),
    metric({ id: "d", views: 1050, clicks: 200 }),
  ]);
  assert.equal(outlierMetric(creatives), "clicks");
});

test("outlierMetric falls back to views when medians are zero", () => {
  const creatives = shapeCreativePerformance([
    metric({ id: "a", views: 10, clicks: 0, leads: 0, engagements: 0, completions: 0 }),
    metric({ id: "b", views: 20, clicks: 0, leads: 0, engagements: 0, completions: 0 }),
  ]);
  assert.equal(outlierMetric(creatives), "views");
});

test("rankCreatives sorts descending with stable tie order; topCreative by views", () => {
  const creatives = shapeCreativePerformance([
    metric({ id: "a", views: 500, clicks: 10 }),
    metric({ id: "b", views: 900, clicks: 10 }),
    metric({ id: "c", views: 900, clicks: 40 }),
  ]);
  assert.deepEqual(
    rankCreatives(creatives, "views").map((creative) => creative.id),
    ["b", "c", "a"],
  );
  assert.equal(topCreative(creatives)?.id, "b");
  assert.equal(topCreative([]), null);
});

test("format helpers render honest labels", () => {
  assert.equal(formatPercent(0.389), "38.9%");
  assert.equal(formatWatchTime(31.2), "31s");
  assert.equal(formatWatchTime(78.4), "1m 18s");
});

/* ----------------------------- insights.ts -------------------------------- */

test("hook rule fires below 40% completion with the source metric attached", () => {
  const creatives = shapeCreativePerformance([
    metric({ id: "weak", title: "Weak Open", views: 100, completions: 39 }),
    metric({ id: "fine", views: 100, completions: 55 }),
  ]);
  const insights = evaluateInsights(creatives, [INSIGHT_RULES[0]]);
  assert.equal(insights.length, 1);
  assert.equal(insights[0].ruleId, "low-completion-hook");
  assert.match(insights[0].recommendation, /tighter 15s cut/);
  assert.deepEqual(insights[0].source, {
    metricId: "weak",
    assetId: "asset-1",
    title: "Weak Open",
    metric: "Completion rate",
    value: "39.0%",
  });
});

test("vertical rule fires only when 9:16 beats 16:9 by the margin", () => {
  const rule = INSIGHT_RULES.find((candidate) => candidate.id === "vertical-outperforms");
  assert.ok(rule);
  const fires = evaluateInsights(
    shapeCreativePerformance([
      metric({ id: "v", aspect: "9:16", views: 100, engagements: 8 }),
      metric({ id: "w", aspect: "16:9", views: 100, engagements: 4 }),
    ]),
    [rule],
  );
  assert.equal(fires.length, 1);
  assert.match(fires[0].recommendation, /Prioritize 9:16 variants/);
  assert.equal(fires[0].source.metric, "Engagement rate (top 9:16)");

  const tooClose = evaluateInsights(
    shapeCreativePerformance([
      metric({ id: "v", aspect: "9:16", views: 100, engagements: 5 }),
      metric({ id: "w", aspect: "16:9", views: 100, engagements: 4.9 }),
    ]),
    [rule],
  );
  assert.equal(tooClose.length, 0);

  const noVertical = evaluateInsights(
    shapeCreativePerformance([metric({ id: "w", aspect: "16:9" })]),
    [rule],
  );
  assert.equal(noVertical.length, 0);
});

test("CTA rule fires on high completion with low CTR", () => {
  const rule = INSIGHT_RULES.find((candidate) => candidate.id === "high-completion-low-ctr");
  assert.ok(rule);
  const insights = evaluateInsights(
    shapeCreativePerformance([
      metric({ id: "finish-no-click", views: 100, completions: 60, clicks: 1 }),
      metric({ id: "finish-click", views: 100, completions: 60, clicks: 5 }),
    ]),
    [rule],
  );
  assert.equal(insights.length, 1);
  assert.equal(insights[0].source.metricId, "finish-no-click");
  assert.match(insights[0].recommendation, /call to action/);
});

test("breakout rule fires at 2x median views and needs at least two creatives", () => {
  const rule = INSIGHT_RULES.find((candidate) => candidate.id === "breakout-creative");
  assert.ok(rule);
  const insights = evaluateInsights(
    shapeCreativePerformance([
      metric({ id: "a", views: 100 }),
      metric({ id: "b", views: 110 }),
      metric({ id: "star", views: 1000 }),
    ]),
    [rule],
  );
  assert.equal(insights.length, 1);
  assert.equal(insights[0].source.metricId, "star");
  assert.equal(insights[0].tone, "opportunity");

  assert.equal(evaluateInsights(shapeCreativePerformance([metric({ views: 5000 })]), [rule]).length, 0);
});

test("engagement floor rule respects the threshold constant", () => {
  const rule = INSIGHT_RULES.find((candidate) => candidate.id === "low-engagement");
  assert.ok(rule);
  const insights = evaluateInsights(
    shapeCreativePerformance([
      metric({ id: "flat", views: 1000, engagements: Math.floor(INSIGHT_THRESHOLDS.lowEngagement * 1000) - 1 }),
      metric({ id: "lively", views: 1000, engagements: 100 }),
    ]),
    [rule],
  );
  assert.equal(insights.length, 1);
  assert.equal(insights[0].source.metricId, "flat");
});

test("evaluateInsights is deterministic across runs", () => {
  const creatives = shapeCreativePerformance([
    metric({ id: "a", aspect: "9:16", views: 1000, engagements: 80, completions: 300 }),
    metric({ id: "b", aspect: "16:9", views: 400, engagements: 12, completions: 260, clicks: 2 }),
    metric({ id: "c", aspect: "16:9", views: 420, engagements: 20, completions: 180 }),
  ]);
  assert.deepEqual(evaluateInsights(creatives), evaluateInsights(creatives));
});

/* -------------------------------- csv.ts ---------------------------------- */

test("escapeCsvValue quotes commas, quotes, and newlines; doubles quotes", () => {
  assert.equal(escapeCsvValue("plain"), "plain");
  assert.equal(escapeCsvValue("has,comma"), '"has,comma"');
  assert.equal(escapeCsvValue('say "hi"'), '"say ""hi"""');
  assert.equal(escapeCsvValue("line\nbreak"), '"line\nbreak"');
  assert.equal(escapeCsvValue("carriage\rreturn"), '"carriage\rreturn"');
  assert.equal(escapeCsvValue(42), "42");
});

test("toCsv joins with CRLF and a trailing newline", () => {
  const csv = toCsv([
    ["a", "b"],
    ["1", "2"],
  ]);
  assert.equal(csv, "a,b\r\n1,2\r\n");
});

test("performanceCsv serializes the table with escaped titles and real rates", () => {
  const [creative] = shapeCreativePerformance([
    metric({ title: 'Roadshow, "Final"', views: 200, engagements: 10, completions: 100, clicks: 4 }),
  ]);
  const csv = performanceCsv([creative], { ica: "ICA" });
  const lines = csv.split("\r\n");
  assert.equal(lines[0].startsWith("Creative,Project,Platform,Aspect,Published,Views,"), true);
  assert.match(lines[1], /^"Roadshow, ""Final""",ICA,LinkedIn,16:9,2026-07-01,200,5\.0%,30\.0,50\.0%,4,2\.0%,2$/);
  assert.equal(lines[2], "");
});

/* ------------------------------- recap.ts --------------------------------- */

test("recap budget math matches the ICA seeds (internal-only numbers)", () => {
  const recap = buildProjectRecap({
    projectId: "ica",
    projectName: "ICA",
    deliverables: seedDeliverables,
    planItems: seedPlanItems,
    approvalStages: [],
    activity: [],
    proposals: seedProposals,
    paymentMilestones: seedPaymentMilestones,
    shareLinks: [],
  });

  assert.equal(recap.deliverables.total, 2);
  assert.equal(recap.deliverables.completed, 1);

  // Σ quantity × unit rate over non-optional lines: 3400+1200+480+3200+900 = 9180.
  assert.equal(recap.budget.costCents, 918000);
  // Markup: 340+120+0+480+135 = 1075.
  assert.equal(recap.budget.marginCents, 107500);
  assert.equal(recap.budget.totalCents, 1025500);
  // Optional Spanish subtitles line.
  assert.equal(recap.budget.optionalCents, 45000);
  // Deposit paid, balance pending — and they sum to the client total.
  assert.equal(recap.budget.paidCents, 307650);
  assert.equal(recap.budget.outstandingCents, 717850);
  assert.equal(recap.budget.paidCents + recap.budget.outstandingCents, recap.budget.totalCents);
  assert.equal(recap.budget.internal, true);
  assert.equal(recap.budget.proposalTitle, "ICA Roadshow 2026 — Opening Film Package");
});

test("recap timeline pairs planned dates with actual completion dates", () => {
  const recap = buildProjectRecap({
    projectId: "ica",
    projectName: "ICA",
    deliverables: [],
    planItems: [
      {
        id: "p-early", project_id: "ica", kind: "milestone", title: "Early", date: "2026-07-10",
        status: "done", updated_at: "2026-07-09T10:00:00.000Z",
      },
      {
        id: "p-late", project_id: "ica", kind: "task", title: "Late", date: "2026-07-08",
        status: "done", updated_at: "2026-07-12T10:00:00.000Z",
      },
      {
        id: "p-open", project_id: "ica", kind: "milestone", title: "Open", date: "2026-07-20",
        status: "in_progress", updated_at: "2026-07-15T10:00:00.000Z",
      },
      {
        id: "p-shoot", project_id: "ica", kind: "production_day", title: "Shoot", date: "2026-07-01",
        status: "done", updated_at: "2026-07-01T10:00:00.000Z",
      },
    ],
    approvalStages: [],
    activity: [],
    proposals: [],
    paymentMilestones: [],
    shareLinks: [],
  });

  // Production days are not milestones/tasks — excluded from the recap timeline.
  assert.deepEqual(
    recap.timeline.map((entry) => entry.id),
    ["p-late", "p-early", "p-open"],
  );
  const [late, early, open] = recap.timeline;
  assert.equal(late.plannedDate, "2026-07-08");
  assert.equal(late.actualDate, "2026-07-12");
  assert.equal(late.onTime, false);
  assert.equal(early.onTime, true);
  assert.equal(open.actualDate, null);
  assert.equal(open.onTime, null);
});

test("recap approvals roll up stages and approval activity events", () => {
  const recap = buildProjectRecap({
    projectId: "ica",
    projectName: "ICA",
    deliverables: [],
    planItems: [],
    approvalStages: [
      {
        id: "stage-1", project_id: "ica", asset_id: "asset-1", name: "Client Review",
        reviewer_names: ["A", "B"], approved_reviewer_names: ["A"], status: "in_progress",
      },
      {
        id: "stage-2", project_id: "bp", asset_id: "asset-9", name: "Other project",
        reviewer_names: ["C"], approved_reviewer_names: [], status: "pending",
      },
    ],
    activity: [
      {
        id: "act-1", project_id: "ica", action: "approved_asset", actor_name: "Morgan Lee",
        details: { asset_title: "MASTER" }, created_at: "2026-07-14T22:08:00.000Z",
      },
      {
        id: "act-2", project_id: "ica", action: "added_comment", actor_name: "Alex",
        details: {}, created_at: "2026-07-14T21:00:00.000Z",
      },
      {
        id: "act-3", project_id: "bp", action: "approved_asset", actor_name: "Rachel",
        details: {}, created_at: "2026-07-14T20:00:00.000Z",
      },
    ],
    proposals: [],
    paymentMilestones: [],
    shareLinks: [],
    assetTitles: { "asset-1": "Cut v4" },
  });

  assert.equal(recap.approvals.length, 1);
  assert.deepEqual(recap.approvals[0], {
    id: "stage-1",
    name: "Client Review",
    assetId: "asset-1",
    assetTitle: "Cut v4",
    reviewerCount: 2,
    approvedCount: 1,
    approvedNames: ["A"],
    status: "in_progress",
  });
  // Only approval actions for this project become events.
  assert.equal(recap.approvalEvents.length, 1);
  assert.equal(recap.approvalEvents[0].actor, "Morgan Lee");
  assert.equal(recap.approvalEvents[0].detail, "MASTER");
});

test("recap final links are active share links attached to project assets", () => {
  const recap = buildProjectRecap({
    projectId: "ica",
    projectName: "ICA",
    deliverables: [],
    planItems: [],
    approvalStages: [],
    activity: [],
    proposals: [],
    paymentMilestones: [],
    shareLinks: [
      {
        id: "link-1", message: "Final approval", permission: "approve", is_active: true,
        public_url: "/review/demo?share=a", asset_ids: ["asset-1"],
      },
      {
        id: "link-2", message: "Inactive", permission: "view", is_active: false,
        public_url: "/review/demo?share=b", asset_ids: ["asset-1"],
      },
      {
        id: "link-3", message: "Other project", permission: "view", is_active: true,
        public_url: "/review/demo?share=c", asset_ids: ["asset-9"],
      },
    ],
    assetIds: ["asset-1", "asset-2"],
  });

  assert.equal(recap.finalLinks.length, 1);
  assert.equal(recap.finalLinks[0].id, "link-1");
  assert.equal(recap.finalLinks[0].url, "/review/demo?share=a");
});

test("currentRecapProposal prefers approved, then highest live version", () => {
  const proposals = [
    { id: "v1", project_id: "ica", version: 1, status: "superseded", title: "v1", estimate_lines: [], approved_at: null },
    { id: "v2", project_id: "ica", version: 2, status: "approved", title: "v2", estimate_lines: [], approved_at: "2026-03-01T00:00:00.000Z" },
    { id: "v3", project_id: "ica", version: 3, status: "sent", title: "v3", estimate_lines: [], approved_at: null },
  ];
  assert.equal(currentRecapProposal(proposals)?.id, "v2");
  assert.equal(currentRecapProposal([]), null);
});

test("formatMoney renders cents as USD", () => {
  assert.equal(formatMoney(1025500), "$10,255.00");
  assert.equal(formatMoney(0), "$0.00");
});
