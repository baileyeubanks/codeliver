/**
 * P28: published-content performance shaping.
 *
 * Pure, DOM-free logic: raw per-creative metric rows (seeded in
 * lib/demo/workspace-store.ts for the demo workspace) are shaped into
 * derived rates, rolled up into KPI summaries, and ranked by the metric
 * with the strongest outlier. No analytics provider is implied — every
 * number here is local-preview demo data and the UI labels it that way.
 */

export interface PerformanceMetric {
  id: string;
  asset_id: string;
  project_id: string;
  title: string;
  platform: string;
  aspect: string;
  published_at: string;
  duration_seconds: number;
  views: number;
  engagements: number;
  avg_watch_seconds: number;
  completions: number;
  clicks: number;
  leads: number;
}

export interface CreativePerformance extends PerformanceMetric {
  /** engagements / views (0 when views = 0). */
  engagement_rate: number;
  /** completions / views. */
  completion_rate: number;
  /** clicks / views. */
  ctr: number;
  /** avg_watch_seconds / duration_seconds. */
  watch_rate: number;
}

export function rate(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return numerator / denominator;
}

export function shapeCreativePerformance(metrics: PerformanceMetric[]): CreativePerformance[] {
  return metrics.map((metric) => ({
    ...metric,
    engagement_rate: rate(metric.engagements, metric.views),
    completion_rate: rate(metric.completions, metric.views),
    ctr: rate(metric.clicks, metric.views),
    watch_rate: rate(metric.avg_watch_seconds, metric.duration_seconds),
  }));
}

export interface PerformanceSummary {
  creativeCount: number;
  views: number;
  /** Total engagements / total views (view-weighted, not an average of rates). */
  engagementRate: number;
  /** View-weighted average watch time in seconds. */
  avgWatchSeconds: number;
  /** Total completions / total views. */
  completionRate: number;
  clicks: number;
  leads: number;
}

export function summarizePerformance(creatives: CreativePerformance[]): PerformanceSummary {
  const views = creatives.reduce((total, creative) => total + creative.views, 0);
  const engagements = creatives.reduce((total, creative) => total + creative.engagements, 0);
  const completions = creatives.reduce((total, creative) => total + creative.completions, 0);
  const watchSeconds = creatives.reduce(
    (total, creative) => total + creative.avg_watch_seconds * creative.views,
    0,
  );
  return {
    creativeCount: creatives.length,
    views,
    engagementRate: rate(engagements, views),
    avgWatchSeconds: rate(watchSeconds, views),
    completionRate: rate(completions, views),
    clicks: creatives.reduce((total, creative) => total + creative.clicks, 0),
    leads: creatives.reduce((total, creative) => total + creative.leads, 0),
  };
}

export const PERFORMANCE_METRIC_KEYS = [
  "views",
  "engagement_rate",
  "completion_rate",
  "clicks",
  "leads",
] as const;
export type PerformanceMetricKey = (typeof PERFORMANCE_METRIC_KEYS)[number];

export const PERFORMANCE_METRIC_LABELS: Record<PerformanceMetricKey, string> = {
  views: "Views",
  engagement_rate: "Engagement rate",
  completion_rate: "Completion rate",
  clicks: "Clicks",
  leads: "Leads",
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/**
 * The KPI with the strongest standout creative: the largest max/median
 * ratio across the metric keys. Deterministic; ties break toward the
 * earlier key in PERFORMANCE_METRIC_KEYS. Falls back to "views" when
 * every median is zero (or there is nothing to rank).
 */
export function outlierMetric(creatives: CreativePerformance[]): PerformanceMetricKey {
  let best: PerformanceMetricKey = "views";
  let bestRatio = 1;
  for (const key of PERFORMANCE_METRIC_KEYS) {
    const values = creatives.map((creative) => creative[key]);
    const center = median(values);
    if (center <= 0) continue;
    const peak = Math.max(...values);
    const ratio = peak / center;
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = key;
    }
  }
  return best;
}

/** Sort creatives by a metric, strongest first. Input order breaks ties. */
export function rankCreatives(
  creatives: CreativePerformance[],
  key: PerformanceMetricKey,
): CreativePerformance[] {
  return creatives
    .map((creative, index) => ({ creative, index }))
    .sort((a, b) => b.creative[key] - a.creative[key] || a.index - b.index)
    .map((entry) => entry.creative);
}

/** The top-performing creative, by views. */
export function topCreative(creatives: CreativePerformance[]): CreativePerformance | null {
  if (creatives.length === 0) return null;
  return rankCreatives(creatives, "views")[0];
}

/** Shared percent formatting so the UI, CSV, and insights agree. */
export function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

export function formatWatchTime(seconds: number): string {
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return minutes > 0 ? `${minutes}m ${remainder}s` : `${remainder}s`;
}
