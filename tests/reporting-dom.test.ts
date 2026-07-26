import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

import React, { type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

import { evaluateInsights } from "../lib/reporting/insights.ts";
import * as insightsModule from "../lib/reporting/insights.ts";
import * as csvModule from "../lib/reporting/csv.ts";
import * as performanceModule from "../lib/reporting/performance.ts";
import * as recapModule from "../lib/reporting/recap.ts";

const require = createRequire(import.meta.url);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const Icon = (props: Record<string, unknown>) => React.createElement("svg", props);
const iconStub = new Proxy({}, { get: () => Icon });

function transpileTsModule(modulePath: string): string {
  return ts.transpileModule(readFileSync(modulePath, "utf8"), {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: modulePath,
  }).outputText;
}

function evaluateModule(output: string, mockRequire: (specifier: string) => unknown) {
  const loadedModule = { exports: {} as Record<string, unknown> };
  const evaluate = runInNewContext(
    `(function (require, module, exports) { ${output}\n })`,
  ) as (
    loader: typeof mockRequire,
    moduleRecord: typeof loadedModule,
    exports: Record<string, unknown>,
  ) => void;
  evaluate(mockRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

function panelRequire(specifier: string): unknown {
  if (specifier === "react" || specifier === "react/jsx-runtime") return require(specifier);
  if (specifier === "lucide-react") return iconStub;
  if (specifier === "@/lib/reporting/recap.ts") return recapModule;
  if (specifier === "@/lib/reporting/insights.ts") return insightsModule;
  if (specifier === "@/lib/reporting/performance.ts") return performanceModule;
  throw new Error(`Unexpected panel import: ${specifier}`);
}

const recapPanelModule = evaluateModule(
  transpileTsModule(resolve(repositoryRoot, "components/reporting/RecapPanel.tsx")),
  panelRequire,
) as { default: ComponentType<{ recap: recapModule.ProjectRecap; onPrint: () => void }> };

const performancePanelModule = evaluateModule(
  transpileTsModule(resolve(repositoryRoot, "components/reporting/PerformancePanel.tsx")),
  panelRequire,
) as {
  default: ComponentType<{
    creatives: performanceModule.CreativePerformance[];
    summary: performanceModule.PerformanceSummary;
    insights: insightsModule.Insight[];
    sortKey: performanceModule.PerformanceMetricKey;
    onExportCsv: () => void;
  }>;
};

const fixtureWorkspace = {
  projects: [{ id: "ica", name: "ICA" }],
  deliverables: [
    {
      id: "del-1", project_id: "ica", name: "MASTER_16x9.mov", status: "delivered",
      delivered_at: "2026-03-09T19:30:00.000Z",
      spec: { resolution: "3840x2160", codec: "ProRes 422 HQ", aspect: "16:9" },
    },
    {
      id: "del-2", project_id: "ica", name: "SOCIAL_9x16.mp4", status: "qc",
      delivered_at: null,
      spec: { resolution: "1080x1920", codec: "H.264", aspect: "9:16" },
    },
  ],
  planItems: [
    {
      id: "plan-1", project_id: "ica", kind: "milestone", title: "Rough cut approved",
      date: "2026-03-01", status: "done", updated_at: "2026-02-28T12:00:00.000Z",
    },
  ],
  approvalStages: [
    {
      id: "stage-1", project_id: "ica", asset_id: "asset-1", name: "Client Review",
      reviewer_names: ["A", "B"], approved_reviewer_names: ["A", "B"], status: "approved",
    },
  ],
  activity: [],
  proposals: [
    {
      id: "prop-1", project_id: "ica", version: 1, status: "approved", title: "Film Package",
      estimate_lines: [
        { category: "post", description: "Edit", quantity: 1, unit_rate: 1000, markup_pct: 10, optional: false },
      ],
      approved_at: "2026-03-01T00:00:00.000Z",
    },
  ],
  paymentMilestones: [
    {
      id: "pm-1", project_id: "ica", proposal_id: "prop-1", label: "Balance",
      amount_cents: 110000, status: "pending", paid_at: null,
    },
  ],
  shareLinks: [],
  assets: [{ id: "asset-1", project_id: "ica", title: "Cut v4" }],
  performanceMetrics: [
    {
      id: "perf-1", asset_id: "asset-1", project_id: "ica", title: "MASTER_16x9",
      platform: "LinkedIn", aspect: "16:9", published_at: "2026-03-12T14:00:00.000Z",
      duration_seconds: 60, views: 1000, engagements: 50, avg_watch_seconds: 30,
      completions: 300, clicks: 20, leads: 2,
    },
    {
      id: "perf-2", asset_id: "asset-1", project_id: "ica", title: "SOCIAL_9x16",
      platform: "Instagram Reels", aspect: "9:16", published_at: "2026-03-12T14:05:00.000Z",
      duration_seconds: 30, views: 3000, engagements: 240, avg_watch_seconds: 22,
      completions: 1800, clicks: 90, leads: 6,
    },
  ],
};

const reportsClientModule = evaluateModule(
  transpileTsModule(resolve(repositoryRoot, "components/reporting/ReportsClient.tsx")),
  (specifier: string) => {
    if (specifier === "react" || specifier === "react/jsx-runtime") return require(specifier);
    if (specifier === "lucide-react") return iconStub;
    if (specifier === "@/lib/demo/mode") return { useDemoMode: () => true };
    if (specifier === "@/lib/demo/workspace-store") {
      return { useDemoWorkspace: () => fixtureWorkspace };
    }
    if (specifier === "@/lib/reporting/csv.ts") return csvModule;
    if (specifier === "@/lib/reporting/insights.ts") return insightsModule;
    if (specifier === "@/lib/reporting/performance.ts") return performanceModule;
    if (specifier === "@/lib/reporting/recap.ts") return recapModule;
    if (specifier === "./RecapPanel") return recapPanelModule;
    if (specifier === "./PerformancePanel") return performancePanelModule;
    if (specifier === "./reports-print.module.css") return { printingRecap: "printingRecap" };
    throw new Error(`Unexpected ReportsClient import: ${specifier}`);
  },
) as { default: ComponentType<Record<string, never>> };

const fixtureCreatives = performanceModule.shapeCreativePerformance(
  fixtureWorkspace.performanceMetrics,
);
const fixtureSummary = performanceModule.summarizePerformance(fixtureCreatives);
const fixtureInsights = evaluateInsights(fixtureCreatives);

/* ------------------------------ tab semantics ----------------------------- */

test("reports tab bar uses tablist semantics with 44px targets", () => {
  const markup = renderToStaticMarkup(React.createElement(reportsClientModule.default));

  assert.match(markup, /role="tablist" aria-label="Report views"/);
  assert.match(markup, /id="tab-recap" aria-selected="true" aria-controls="panel-recap"/);
  assert.match(markup, /id="tab-performance" aria-selected="false" aria-controls="panel-performance"/);
  // h-11 = 44px minimum target height on both tabs.
  assert.equal(markup.match(/role="tab"[^>]*class="[^"]*h-11/g)?.length, 2);
  assert.match(markup, /role="tabpanel" id="panel-recap" aria-labelledby="tab-recap"/);
});

test("recap tab renders real rollup numbers and the internal-only budget label", () => {
  const markup = renderToStaticMarkup(React.createElement(reportsClientModule.default));

  assert.match(markup, /1 of 2 delivered/);
  assert.match(markup, /MASTER_16x9\.mov/);
  assert.match(markup, /Internal only — never client-facing/);
  assert.match(markup, /\$1,000\.00/); // estimated cost
  assert.match(markup, /\$100\.00/); // internal markup (10%)
  assert.match(markup, /\$1,100\.00/); // client total + outstanding milestone
  assert.match(markup, /Open print dialog to save as PDF\./);
  assert.match(markup, /2 of 2 reviewers approved/);
});

/* ------------------------------- recap panel ------------------------------ */

test("recap timeline table has a caption, scoped headers, and on-time state", () => {
  const recap = recapModule.buildProjectRecap({
    projectId: "ica",
    projectName: "ICA",
    deliverables: fixtureWorkspace.deliverables,
    planItems: fixtureWorkspace.planItems,
    approvalStages: fixtureWorkspace.approvalStages,
    activity: fixtureWorkspace.activity,
    proposals: fixtureWorkspace.proposals,
    paymentMilestones: fixtureWorkspace.paymentMilestones,
    shareLinks: fixtureWorkspace.shareLinks,
    assetIds: ["asset-1"],
  });
  const markup = renderToStaticMarkup(
    React.createElement(recapPanelModule.default, { recap, onPrint: () => {} }),
  );

  assert.match(markup, /<caption[^>]*>Planned versus actual dates/);
  assert.ok((markup.match(/<th scope="col">/g) ?? []).length >= 4);
  assert.match(markup, /Rough cut approved/);
  assert.match(markup, /on time/);
  assert.match(markup, /data-testid="print-recap"/);
});

/* ---------------------------- performance panel --------------------------- */

test("performance panel renders KPI cards, honest demo label, and accessible table", () => {
  const sortKey = performanceModule.outlierMetric(fixtureCreatives);
  const ranked = performanceModule.rankCreatives(fixtureCreatives, sortKey);
  const markup = renderToStaticMarkup(
    React.createElement(performancePanelModule.default, {
      creatives: ranked,
      summary: fixtureSummary,
      insights: fixtureInsights,
      sortKey,
      onExportCsv: () => {},
    }),
  );

  assert.match(markup, /Demo metrics — local preview/);
  assert.match(markup, /data-testid="kpi-views">4,000</);
  assert.match(markup, /data-testid="kpi-leads">8</);
  assert.match(markup, /<caption[^>]*>Per-creative performance metrics, sorted by/);
  assert.ok((markup.match(/<th scope="col">/g) ?? []).length >= 9);
  assert.match(markup, /Top-performing creative:<\/strong> SOCIAL_9x16/);
  assert.match(markup, /data-testid="export-csv"/);
});

test("insights render with their rule name and source metric attached", () => {
  const sortKey = performanceModule.outlierMetric(fixtureCreatives);
  const ranked = performanceModule.rankCreatives(fixtureCreatives, sortKey);
  const markup = renderToStaticMarkup(
    React.createElement(performancePanelModule.default, {
      creatives: ranked,
      summary: fixtureSummary,
      insights: fixtureInsights,
      sortKey,
      onExportCsv: () => {},
    }),
  );

  assert.match(markup, /Rule-based suggestions — not AI/);
  // MASTER_16x9 completes at 30% → hook rule fires with its source metric.
  assert.match(markup, /data-testid="insight-low-completion-hook:perf-1"/);
  assert.match(markup, /Source: MASTER_16x9 · Completion rate = 30\.0% · Rule: Hook check \(completion &lt; 40%\)/);
  // 9:16 at 8% vs 16:9 at 5% engagement → vertical rule fires.
  assert.match(markup, /data-testid="insight-vertical-outperforms:portfolio"/);
  assert.match(markup, /Prioritize 9:16 variants/);
});
