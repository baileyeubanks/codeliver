/**
 * P28: rule-based insights over shaped performance metrics.
 *
 * Deterministic named rules with explicit thresholds — no AI, no
 * randomness. Every insight links back to the source metric that fired it
 * so the UI can show its provenance. Labeled "rule-based suggestions" in
 * the product.
 */

import {
  formatPercent,
  type CreativePerformance,
} from "./performance.ts";

export const INSIGHT_THRESHOLDS = {
  /** Completion below this fires the hook rule. */
  lowCompletion: 0.4,
  /** Relative engagement-rate margin by which 9:16 must beat 16:9. */
  verticalMargin: 0.15,
  /** Completion at or above this counts as "people finish it". */
  highCompletion: 0.55,
  /** CTR below this (with high completion) fires the CTA rule. */
  lowCtr: 0.02,
  /** Views at or above this multiple of the median fires the breakout rule. */
  breakoutMultiple: 2,
  /** Engagement rate below this fires the engagement rule. */
  lowEngagement: 0.04,
} as const;

export interface InsightSource {
  metricId: string;
  assetId: string;
  title: string;
  /** Human label of the metric that fired the rule. */
  metric: string;
  /** Formatted value of that metric. */
  value: string;
}

export interface Insight {
  id: string;
  ruleId: string;
  ruleName: string;
  tone: "warning" | "opportunity";
  title: string;
  recommendation: string;
  source: InsightSource;
}

export interface InsightRule {
  id: string;
  name: string;
  evaluate(creatives: CreativePerformance[]): Insight[];
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export const INSIGHT_RULES: InsightRule[] = [
  {
    id: "low-completion-hook",
    name: "Hook check (completion < 40%)",
    evaluate(creatives) {
      return creatives
        .filter((creative) => creative.completion_rate < INSIGHT_THRESHOLDS.lowCompletion)
        .map((creative) => ({
          id: `low-completion-hook:${creative.id}`,
          ruleId: "low-completion-hook",
          ruleName: "Hook check (completion < 40%)",
          tone: "warning" as const,
          title: `The hook underperforms on "${creative.title}"`,
          recommendation:
            `Only ${formatPercent(creative.completion_rate)} of viewers finish. ` +
            "Recommend a tighter 15s cut that front-loads the strongest moment.",
          source: {
            metricId: creative.id,
            assetId: creative.asset_id,
            title: creative.title,
            metric: "Completion rate",
            value: formatPercent(creative.completion_rate),
          },
        }));
    },
  },
  {
    id: "vertical-outperforms",
    name: "Format read (9:16 vs 16:9 engagement)",
    evaluate(creatives) {
      const vertical = creatives.filter((creative) => creative.aspect === "9:16");
      const wide = creatives.filter((creative) => creative.aspect === "16:9");
      if (vertical.length === 0 || wide.length === 0) return [];
      const verticalRate = mean(vertical.map((creative) => creative.engagement_rate));
      const wideRate = mean(wide.map((creative) => creative.engagement_rate));
      if (wideRate <= 0) return [];
      const margin = (verticalRate - wideRate) / wideRate;
      if (margin < INSIGHT_THRESHOLDS.verticalMargin) return [];
      const strongest = [...vertical].sort((a, b) => b.engagement_rate - a.engagement_rate)[0];
      return [
        {
          id: "vertical-outperforms:portfolio",
          ruleId: "vertical-outperforms",
          ruleName: "Format read (9:16 vs 16:9 engagement)",
          tone: "opportunity" as const,
          title: "Vertical is outperforming 16:9 on engagement",
          recommendation:
            `9:16 averages ${formatPercent(verticalRate)} engagement vs ` +
            `${formatPercent(wideRate)} on 16:9. Prioritize 9:16 variants in the next content round.`,
          source: {
            metricId: strongest.id,
            assetId: strongest.asset_id,
            title: strongest.title,
            metric: "Engagement rate (top 9:16)",
            value: formatPercent(strongest.engagement_rate),
          },
        },
      ];
    },
  },
  {
    id: "high-completion-low-ctr",
    name: "CTA check (finishers not clicking)",
    evaluate(creatives) {
      return creatives
        .filter(
          (creative) =>
            creative.completion_rate >= INSIGHT_THRESHOLDS.highCompletion &&
            creative.ctr < INSIGHT_THRESHOLDS.lowCtr,
        )
        .map((creative) => ({
          id: `high-completion-low-ctr:${creative.id}`,
          ruleId: "high-completion-low-ctr",
          ruleName: "CTA check (finishers not clicking)",
          tone: "warning" as const,
          title: `Viewers finish "${creative.title}" but don't act`,
          recommendation:
            `${formatPercent(creative.completion_rate)} completion with only ` +
            `${formatPercent(creative.ctr)} CTR. Strengthen the end-card call to action.`,
          source: {
            metricId: creative.id,
            assetId: creative.asset_id,
            title: creative.title,
            metric: "Click-through rate",
            value: formatPercent(creative.ctr),
          },
        }));
    },
  },
  {
    id: "breakout-creative",
    name: "Breakout creative (views ≥ 2× median)",
    evaluate(creatives) {
      if (creatives.length < 2) return [];
      const center = medianOf(creatives.map((creative) => creative.views));
      if (center <= 0) return [];
      return creatives
        .filter((creative) => creative.views >= INSIGHT_THRESHOLDS.breakoutMultiple * center)
        .map((creative) => ({
          id: `breakout-creative:${creative.id}`,
          ruleId: "breakout-creative",
          ruleName: "Breakout creative (views ≥ 2× median)",
          tone: "opportunity" as const,
          title: `"${creative.title}" is the breakout creative`,
          recommendation:
            `${creative.views.toLocaleString("en-US")} views — ` +
            `${(creative.views / center).toFixed(1)}× the median. Scale what works: spin ` +
            "cutdowns and a follow-up piece from this creative.",
          source: {
            metricId: creative.id,
            assetId: creative.asset_id,
            title: creative.title,
            metric: "Views",
            value: creative.views.toLocaleString("en-US"),
          },
        }));
    },
  },
  {
    id: "low-engagement",
    name: "Engagement floor (engagement < 4%)",
    evaluate(creatives) {
      return creatives
        .filter((creative) => creative.engagement_rate < INSIGHT_THRESHOLDS.lowEngagement)
        .map((creative) => ({
          id: `low-engagement:${creative.id}`,
          ruleId: "low-engagement",
          ruleName: "Engagement floor (engagement < 4%)",
          tone: "warning" as const,
          title: `"${creative.title}" is not earning engagement`,
          recommendation:
            `${formatPercent(creative.engagement_rate)} engagement is below the 4% floor. ` +
            "Refresh the opening frame and lead with the outcome, not the logo.",
          source: {
            metricId: creative.id,
            assetId: creative.asset_id,
            title: creative.title,
            metric: "Engagement rate",
            value: formatPercent(creative.engagement_rate),
          },
        }));
    },
  },
];

/** Run every rule and flatten, in rule order. Deterministic. */
export function evaluateInsights(
  creatives: CreativePerformance[],
  rules: InsightRule[] = INSIGHT_RULES,
): Insight[] {
  return rules.flatMap((rule) => rule.evaluate(creatives));
}
