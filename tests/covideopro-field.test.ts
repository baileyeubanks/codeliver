import assert from "node:assert/strict";
import test from "node:test";
import { defaultFieldProjectId, nearestFieldDay } from "../lib/covideopro/field.ts";
import type { ProductionDay } from "../lib/covideopro/record.ts";

function day(id: string, date: string, status: ProductionDay["status"] = "scheduled", projectId = "p"): ProductionDay {
  return {
    id, project_id: projectId, date, call: null, wrap: null,
    type: "principal", status, notes: "",
    created_at: "", updated_at: "", created_by: "u",
  };
}

test("nearest field day is the next upcoming day, else the most recent past day", () => {
  const days = [day("a", "2026-08-01"), day("b", "2026-08-18"), day("c", "2026-08-20")];
  assert.equal(nearestFieldDay(days, "2026-07-17")?.id, "a");
  assert.equal(nearestFieldDay(days, "2026-08-19")?.id, "c");
  assert.equal(nearestFieldDay(days, "2026-09-01")?.id, "c", "all past → most recent");
  assert.equal(nearestFieldDay([], "2026-07-17"), null);
});

test("cancelled days never anchor the field view", () => {
  const days = [day("a", "2026-08-18", "cancelled"), day("b", "2026-08-20")];
  assert.equal(nearestFieldDay(days, "2026-07-17")?.id, "b");
  assert.equal(nearestFieldDay([day("a", "2026-08-18", "cancelled")], "2026-07-17"), null);
});

test("default field project is the one with the nearest upcoming day", () => {
  const projects = [{ id: "alpha" }, { id: "beta" }];
  const days = [day("a", "2026-09-01", "scheduled", "alpha"), day("b", "2026-08-01", "scheduled", "beta")];
  assert.equal(defaultFieldProjectId(projects, days, "2026-07-17"), "beta");
});

test("with no upcoming days anywhere, the most recent past shoot wins", () => {
  const projects = [{ id: "alpha" }, { id: "beta" }];
  const days = [day("a", "2026-06-01", "scheduled", "alpha"), day("b", "2026-07-01", "scheduled", "beta")];
  assert.equal(defaultFieldProjectId(projects, days, "2026-07-17"), "beta");
  assert.equal(defaultFieldProjectId(projects, [], "2026-07-17"), "alpha", "no days → first project");
});
