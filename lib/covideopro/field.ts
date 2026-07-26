/**
 * Co‑ProVideo — field workspace day selection (T4).
 *
 * The field view anchors on the nearest live production day: the next
 * upcoming day, or the most recent one when the shoot is behind you.
 * Cancelled days never anchor. All selection is deterministic off the
 * record — the phone in the producer's pocket shows the truth, not a guess.
 */

import type { ProductionDay } from "./record.ts";

export function nearestFieldDay(days: readonly ProductionDay[], fromDate: string): ProductionDay | null {
  const live = days
    .filter((day) => day.status !== "cancelled")
    .sort((a, b) => a.date.localeCompare(b.date));
  return live.find((day) => day.date >= fromDate) ?? live[live.length - 1] ?? null;
}

/** The project whose shoot is nearest — the field view's default project. */
export function defaultFieldProjectId(
  projects: readonly { id: string }[],
  days: readonly ProductionDay[],
  fromDate: string,
): string | null {
  const anchors = projects
    .map((project) => nearestFieldDay(days.filter((day) => day.project_id === project.id), fromDate))
    .filter((day): day is ProductionDay => day !== null);
  const upcoming = anchors
    .filter((day) => day.date >= fromDate)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (upcoming.length > 0) return upcoming[0].project_id;
  const past = anchors.sort((a, b) => b.date.localeCompare(a.date));
  return past[0]?.project_id ?? projects[0]?.id ?? null;
}
