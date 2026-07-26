import {
  AlertTriangle,
  Clock3,
  Download,
  Eye,
  Lightbulb,
  MousePointerClick,
  PlayCircle,
  ThumbsUp,
  TrendingUp,
  Trophy,
  UserPlus,
} from "lucide-react";
import type { Insight } from "@/lib/reporting/insights.ts";
import {
  PERFORMANCE_METRIC_LABELS,
  formatCount,
  formatPercent,
  formatWatchTime,
  type CreativePerformance,
  type PerformanceMetricKey,
  type PerformanceSummary,
} from "@/lib/reporting/performance.ts";

/**
 * P28: presentational performance dashboard. Every number is seeded demo
 * data (labeled "Demo metrics — local preview"); insights are deterministic
 * rule output, labeled "rule-based suggestions" — not AI.
 */
export default function PerformancePanel({
  creatives,
  summary,
  insights,
  sortKey,
  onExportCsv,
}: {
  /** Already ranked by the outlier metric. */
  creatives: CreativePerformance[];
  summary: PerformanceSummary;
  insights: Insight[];
  sortKey: PerformanceMetricKey;
  onExportCsv: () => void;
}) {
  const kpis = [
    { label: "Views", value: formatCount(summary.views), icon: Eye, testid: "kpi-views" },
    { label: "Engagement rate", value: formatPercent(summary.engagementRate), icon: ThumbsUp, testid: "kpi-engagement" },
    { label: "Avg watch time", value: formatWatchTime(summary.avgWatchSeconds), icon: Clock3, testid: "kpi-watch" },
    { label: "Completion rate", value: formatPercent(summary.completionRate), icon: PlayCircle, testid: "kpi-completion" },
    { label: "Clicks", value: formatCount(summary.clicks), icon: MousePointerClick, testid: "kpi-clicks" },
    { label: "Leads", value: formatCount(summary.leads), icon: UserPlus, testid: "kpi-leads" },
  ];
  const top = creatives.length > 0
    ? creatives.reduce((best, creative) => (creative.views > best.views ? creative : best), creatives[0])
    : null;

  return (
    <div className="flex flex-col gap-5" data-testid="performance-panel">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <span className="badge badge-working" data-testid="performance-demo-label">
          Demo metrics — local preview
        </span>
        <button
          type="button"
          onClick={onExportCsv}
          data-testid="export-csv"
          className="inline-flex h-11 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--ink)]"
        >
          <Download size={15} />
          Export CSV
        </button>
      </div>

      <section aria-label="Performance KPIs" data-testid="kpi-cards"
        className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label}
              className="grid min-h-[74px] grid-cols-[32px_minmax(0,1fr)] items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--surface)] text-[var(--accent)]">
                <Icon size={16} />
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--dim)]">
                  {kpi.label}
                </span>
                <strong className="text-xl font-semibold text-[var(--ink)]" data-testid={kpi.testid}>
                  {kpi.value}
                </strong>
              </span>
            </div>
          );
        })}
      </section>

      {top ? (
        <section aria-label="Top-performing creative" data-testid="top-creative"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--accent)] bg-[var(--accent-dim)] px-4 py-3">
          <Trophy size={18} className="text-[var(--accent)]" />
          <p className="text-sm text-[var(--ink)]">
            <strong>Top-performing creative:</strong> {top.title} — {formatCount(top.views)} views,{" "}
            {formatPercent(top.completion_rate)} completion on {top.platform}.
          </p>
        </section>
      ) : null}

      <section aria-label="Per-creative performance" className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
        <div className="table-container">
          <table className="table" data-testid="performance-table">
            <caption className="sr-only">
              Per-creative performance metrics, sorted by {PERFORMANCE_METRIC_LABELS[sortKey]} (strongest outlier), descending
            </caption>
            <thead>
              <tr>
                <th scope="col">Creative</th>
                <th scope="col">Platform</th>
                <th scope="col">Aspect</th>
                <th scope="col">Views</th>
                <th scope="col">Engagement</th>
                <th scope="col">Avg watch</th>
                <th scope="col">Completion</th>
                <th scope="col">Clicks</th>
                <th scope="col">Leads</th>
              </tr>
            </thead>
            <tbody>
              {creatives.map((creative) => (
                <tr key={creative.id} data-testid={`performance-row-${creative.id}`}>
                  <td data-label="Creative" className="max-w-[220px] truncate text-sm font-medium">
                    {creative.title}
                  </td>
                  <td data-label="Platform" className="text-xs">{creative.platform}</td>
                  <td data-label="Aspect" className="text-xs">{creative.aspect}</td>
                  <td data-label="Views" className="text-xs">{formatCount(creative.views)}</td>
                  <td data-label="Engagement" className="text-xs">{formatPercent(creative.engagement_rate)}</td>
                  <td data-label="Avg watch" className="text-xs">{formatWatchTime(creative.avg_watch_seconds)}</td>
                  <td data-label="Completion" className="text-xs">{formatPercent(creative.completion_rate)}</td>
                  <td data-label="Clicks" className="text-xs">{formatCount(creative.clicks)}</td>
                  <td data-label="Leads" className="text-xs">{formatCount(creative.leads)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-[var(--border)] px-4 py-2 text-xs text-[var(--muted)]">
          Sorted by {PERFORMANCE_METRIC_LABELS[sortKey]} — the strongest outlier across these creatives.
        </p>
      </section>

      <section aria-label="Insights" data-testid="insights-list"
        className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
            <Lightbulb size={16} className="text-[var(--accent)]" />
            Insights
          </h2>
          <span className="badge badge-working" data-testid="insights-rule-label">
            Rule-based suggestions — not AI
          </span>
        </header>
        {insights.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            No rules fired on the current metrics. Rules re-evaluate as new performance data arrives.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {insights.map((insight) => (
              <li key={insight.id} data-testid={`insight-${insight.id}`}
                className="flex gap-3 rounded-md border border-[var(--border)] px-3 py-2">
                <span className="mt-0.5 shrink-0 text-[var(--accent)]">
                  {insight.tone === "warning" ? <AlertTriangle size={16} /> : <TrendingUp size={16} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[var(--ink)]">{insight.title}</span>
                  <span className="mt-0.5 block text-sm text-[var(--muted)]">{insight.recommendation}</span>
                  <span className="mt-1 block text-xs text-[var(--dim)]" data-testid={`insight-source-${insight.id}`}>
                    Source: {insight.source.title} · {insight.source.metric} = {insight.source.value}
                    {" · "}Rule: {insight.ruleName}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
