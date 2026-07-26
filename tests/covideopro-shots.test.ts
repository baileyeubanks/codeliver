import assert from "node:assert/strict";
import test from "node:test";
import { projectShotRollup, shotReadinessForDay } from "../lib/covideopro/shots.ts";
import type { ProductionDay, Shot } from "../lib/covideopro/record.ts";

function shot(overrides: Partial<Shot>): Shot {
  return {
    id: "s1", project_id: "p", production_day_id: "d1", scene: "Control room",
    description: "Wide establishing — operators at consoles", size: "wide",
    priority: "must", status: "planned", notes: "",
    created_at: "", updated_at: "", created_by: "u",
    ...overrides,
  };
}

function day(status: ProductionDay["status"], id = "d1"): ProductionDay {
  return {
    id, project_id: "p", date: "2026-08-18", call: null, wrap: null,
    type: "principal", status, notes: "",
    created_at: "", updated_at: "", created_by: "u",
  };
}

test("a scheduled day is unplanned without shots and listed with them", () => {
  assert.equal(shotReadinessForDay(day("scheduled"), []).readiness, "unplanned");
  assert.equal(shotReadinessForDay(day("scheduled"), [shot({})]).readiness, "listed");
});

test("coverage rules take over once the day is in progress", () => {
  const planned = [shot({ id: "a" }), shot({ id: "b", priority: "nice" })];
  assert.equal(shotReadinessForDay(day("in_progress"), planned).readiness, "behind");

  const mustCovered = [shot({ id: "a", status: "covered" }), shot({ id: "b", priority: "nice" })];
  assert.equal(shotReadinessForDay(day("in_progress"), mustCovered).readiness, "ready");

  const allCovered = mustCovered.map((entry) => ({ ...entry, status: "covered" as const }));
  assert.equal(shotReadinessForDay(day("in_progress"), allCovered).readiness, "wrapped");
});

test("dropped shots never count", () => {
  const readiness = shotReadinessForDay(day("in_progress"), [shot({ status: "dropped" })]);
  assert.equal(readiness.total, 0);
  assert.equal(readiness.readiness, "unplanned");
});

test("a wrapped day still owing must shots reads behind", () => {
  assert.equal(shotReadinessForDay(day("wrapped"), [shot({})]).readiness, "behind");
});

test("project roll-up excludes cancelled days and counts unplanned days", () => {
  const days = [day("scheduled", "d1"), day("cancelled", "d2"), day("scheduled", "d3")];
  const shots = [shot({ production_day_id: "d1" }), shot({ production_day_id: "d2" })];
  const rollup = projectShotRollup(days, shots);
  assert.equal(rollup.perDay.length, 2);
  assert.equal(rollup.unplannedDays, 1);
  assert.equal(rollup.total, 1);
  assert.equal(rollup.mustTotal, 1);
});
