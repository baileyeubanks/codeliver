/**
 * P28: CSV serialization for the performance table.
 *
 * RFC 4180-style escaping: values containing commas, quotes, CR, or LF are
 * quoted; embedded quotes are doubled. Lines end CRLF with a trailing
 * newline so spreadsheet tools parse the file cleanly.
 */

import {
  formatPercent,
  type CreativePerformance,
} from "./performance.ts";

export function escapeCsvValue(value: string | number): string {
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(rows: (string | number)[][]): string {
  return rows.map((row) => row.map(escapeCsvValue).join(",")).join("\r\n") + "\r\n";
}

export const PERFORMANCE_CSV_HEADERS = [
  "Creative",
  "Project",
  "Platform",
  "Aspect",
  "Published",
  "Views",
  "Engagement rate",
  "Avg watch (s)",
  "Completion rate",
  "Clicks",
  "CTR",
  "Leads",
] as const;

/** Serialize shaped creatives to a CSV document (header + one row each). */
export function performanceCsv(
  creatives: CreativePerformance[],
  projectNames: Record<string, string> = {},
): string {
  const rows: (string | number)[][] = [
    [...PERFORMANCE_CSV_HEADERS],
    ...creatives.map((creative) => [
      creative.title,
      projectNames[creative.project_id] ?? creative.project_id,
      creative.platform,
      creative.aspect,
      creative.published_at.slice(0, 10),
      creative.views,
      formatPercent(creative.engagement_rate),
      creative.avg_watch_seconds.toFixed(1),
      formatPercent(creative.completion_rate),
      creative.clicks,
      formatPercent(creative.ctr),
      creative.leads,
    ]),
  ];
  return toCsv(rows);
}
