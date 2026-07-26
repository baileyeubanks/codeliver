"use client";

import { useState } from "react";
import { BarChart3, ClipboardList } from "lucide-react";
import { useDemoMode } from "@/lib/demo/mode";
import { useDemoWorkspace } from "@/lib/demo/workspace-store";
import { performanceCsv } from "@/lib/reporting/csv.ts";
import { evaluateInsights } from "@/lib/reporting/insights.ts";
import {
  outlierMetric,
  rankCreatives,
  shapeCreativePerformance,
  summarizePerformance,
} from "@/lib/reporting/performance.ts";
import { buildProjectRecap } from "@/lib/reporting/recap.ts";
import RecapPanel from "./RecapPanel";
import PerformancePanel from "./PerformancePanel";
import styles from "./reports-print.module.css";

type ReportsTab = "recap" | "performance";

/**
 * P28: /reports — project recap + performance dashboard for the demo
 * workspace. All rollup logic is pure (lib/reporting/); this component only
 * wires the workspace store to the presentational panels.
 */
export default function ReportsClient() {
  const demoMode = useDemoMode();
  const workspace = useDemoWorkspace();
  const [tab, setTab] = useState<ReportsTab>("recap");
  const [projectId, setProjectId] = useState("ica");

  const project = workspace.projects.find((candidate) => candidate.id === projectId)
    ?? workspace.projects[0]
    ?? null;

  const recap = project
    ? buildProjectRecap({
        projectId: project.id,
        projectName: project.name,
        deliverables: workspace.deliverables,
        planItems: workspace.planItems,
        approvalStages: workspace.approvalStages,
        activity: workspace.activity,
        proposals: workspace.proposals,
        paymentMilestones: workspace.paymentMilestones,
        shareLinks: workspace.shareLinks,
        assetTitles: Object.fromEntries(
          workspace.assets.map((asset) => [asset.id, asset.title]),
        ),
        assetIds: workspace.assets
          .filter((asset) => asset.project_id === project.id)
          .map((asset) => asset.id),
      })
    : null;

  const creatives = shapeCreativePerformance(workspace.performanceMetrics);
  const summary = summarizePerformance(creatives);
  const insights = evaluateInsights(creatives);
  const sortKey = outlierMetric(creatives);
  const ranked = rankCreatives(creatives, sortKey);

  function handleExportCsv() {
    const projectNames = Object.fromEntries(
      workspace.projects.map((candidate) => [candidate.id, candidate.name]),
    );
    const csv = performanceCsv(ranked, projectNames);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "co-videopro-performance-report.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function handlePrint() {
    document.body.classList.add(styles.printingRecap);
    window.addEventListener(
      "afterprint",
      () => document.body.classList.remove(styles.printingRecap),
      { once: true },
    );
    window.print();
  }

  if (!demoMode) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-4 sm:px-6">
        <header className="border-b border-[var(--border)] pb-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
            Reporting
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--ink)]">Reports</h1>
        </header>
        <p className="text-sm text-[var(--muted)]" data-testid="reports-empty">
          Reports are available in the demo workspace. Connect an analytics source before
          reporting on real projects — no live metrics are implied here.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-4 sm:px-6"
      data-testid="reports-root">
      <header className="flex flex-col gap-4 border-b border-[var(--border)] pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
            Reporting
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--ink)]">Reports</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Project recap from the operating record, plus performance for published content.
          </p>
        </div>
        {tab === "recap" && project ? (
          <label className="no-print flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
            Project
            <select
              value={project.id}
              onChange={(event) => setProjectId(event.target.value)}
              data-testid="recap-project-select"
              className="input h-11 min-w-[180px]"
            >
              {workspace.projects.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
              ))}
            </select>
          </label>
        ) : null}
      </header>

      <div className="no-print flex flex-wrap gap-1" role="tablist" aria-label="Report views"
        data-testid="reports-tablist">
        <button
          type="button"
          role="tab"
          id="tab-recap"
          aria-selected={tab === "recap"}
          aria-controls="panel-recap"
          data-testid="tab-recap"
          className={`inline-flex h-11 items-center gap-2 rounded-md px-4 text-sm font-semibold transition ${
            tab === "recap"
              ? "bg-[var(--accent-dim)] text-[var(--accent)]"
              : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
          }`}
          onClick={() => setTab("recap")}
        >
          <ClipboardList size={15} />
          Project recap
        </button>
        <button
          type="button"
          role="tab"
          id="tab-performance"
          aria-selected={tab === "performance"}
          aria-controls="panel-performance"
          data-testid="tab-performance"
          className={`inline-flex h-11 items-center gap-2 rounded-md px-4 text-sm font-semibold transition ${
            tab === "performance"
              ? "bg-[var(--accent-dim)] text-[var(--accent)]"
              : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
          }`}
          onClick={() => setTab("performance")}
        >
          <BarChart3 size={15} />
          Performance
        </button>
      </div>

      {tab === "recap" ? (
        <div role="tabpanel" id="panel-recap" aria-labelledby="tab-recap">
          {recap ? <RecapPanel recap={recap} onPrint={handlePrint} /> : null}
        </div>
      ) : (
        <div role="tabpanel" id="panel-performance" aria-labelledby="tab-performance">
          <PerformancePanel
            creatives={ranked}
            summary={summary}
            insights={insights}
            sortKey={sortKey}
            onExportCsv={handleExportCsv}
          />
        </div>
      )}
    </div>
  );
}
