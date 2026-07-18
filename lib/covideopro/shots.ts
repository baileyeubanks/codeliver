/**
 * Co‑ProVideo — shot list readiness (T5).
 *
 * The shot list is the shoot-day truth: what the day owes the edit.
 * Readiness is deterministic and keyed to the day's own lifecycle: a
 * scheduled day can only be unplanned or listed; once the day is in
 * progress (or wrapped), coverage takes over — behind until every
 * must-shot is covered, ready then, wrapped when nothing is left.
 * Dropped shots never count; cancelled days never roll up.
 */

import type { ProductionDay, Shot } from "./record.ts";

export type ShotReadiness = "unplanned" | "listed" | "behind" | "ready" | "wrapped";

export interface DayShotReadiness {
  productionDayId: string;
  /** planned + covered — dropped shots never count. */
  total: number;
  covered: number;
  mustTotal: number;
  mustCovered: number;
  readiness: ShotReadiness;
}

export function shotReadinessForDay(
  day: Pick<ProductionDay, "id" | "status">,
  shots: readonly Shot[],
): DayShotReadiness {
  const live = shots.filter((shot) => shot.production_day_id === day.id && shot.status !== "dropped");
  const covered = live.filter((shot) => shot.status === "covered").length;
  const must = live.filter((shot) => shot.priority === "must");
  const mustCovered = must.filter((shot) => shot.status === "covered").length;
  let readiness: ShotReadiness;
  if (live.length === 0) readiness = "unplanned";
  else if (day.status === "scheduled" || day.status === "cancelled") readiness = "listed";
  else if (covered === live.length) readiness = "wrapped";
  else if (mustCovered === must.length) readiness = "ready";
  else readiness = "behind";
  return { productionDayId: day.id, total: live.length, covered, mustTotal: must.length, mustCovered, readiness };
}

export interface ProjectShotRollup {
  perDay: DayShotReadiness[];
  total: number;
  covered: number;
  mustTotal: number;
  mustCovered: number;
  unplannedDays: number;
}

/** Roll a project's shot list up across its principal days. Cancelled, scout, and contingency days are out. */
export function projectShotRollup(days: readonly ProductionDay[], shots: readonly Shot[]): ProjectShotRollup {
  const perDay = days
    .filter((day) => day.status !== "cancelled" && day.type === "principal")
    .map((day) => shotReadinessForDay(day, shots));
  return {
    perDay,
    total: perDay.reduce((sum, entry) => sum + entry.total, 0),
    covered: perDay.reduce((sum, entry) => sum + entry.covered, 0),
    mustTotal: perDay.reduce((sum, entry) => sum + entry.mustTotal, 0),
    mustCovered: perDay.reduce((sum, entry) => sum + entry.mustCovered, 0),
    unplannedDays: perDay.filter((entry) => entry.readiness === "unplanned").length,
  };
}
