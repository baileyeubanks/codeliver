import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const component = readFileSync(resolve(repositoryRoot, "components/projects/ProjectProductionScheduleWorkspace.tsx"), "utf8");
const css = readFileSync(resolve(repositoryRoot, "components/projects/ProjectProductionScheduleWorkspace.module.css"), "utf8");
const cockpit = readFileSync(resolve(repositoryRoot, "components/projects/ProjectCockpit.tsx"), "utf8");
const cockpitCss = readFileSync(resolve(repositoryRoot, "components/projects/ProjectCockpit.module.css"), "utf8");
const hook = readFileSync(resolve(repositoryRoot, "lib/hooks/useProjectProductionSchedule.ts"), "utf8");

test("production scheduling stays inside the existing Plan workspace and URL state", () => {
  assert.match(cockpit, /type PlanWorkspaceMode = "script" \| "shots" \| "tasks" \| "schedule" \| "call-sheet"/);
  assert.match(cockpit, /aria-pressed=\{activePlanWorkspace === "schedule"\}/);
  assert.match(cockpit, /onClick=\{\(\) => selectPlanWorkspace\("schedule"\)\}/);
  assert.match(cockpit, /<ProjectProductionScheduleWorkspace/);
  assert.match(cockpit, /if \(mode !== "tasks"\) params\.set\("plan", mode\)/);
  assert.match(cockpitCss, /grid-template-columns: repeat\(5, minmax\(68px, 1fr\)\)/);
  assert.doesNotMatch(component, /next\/navigation|next\/link|\bShell\b/);
});

test("workspace owns explicit production timing and never infers call-sheet readiness", () => {
  for (const label of [
    "Schedule title",
    "Timezone",
    "Date",
    "Unit call",
    "Start",
    "Minutes",
    "Assignment",
    "Revision summary",
    "Save revision",
    "Submit",
    "Request changes",
    "Approve and activate",
  ]) assert.match(component, new RegExp(label), label);
  for (const kind of ["setup", "meal", "company_move", "break", "note"]) {
    assert.match(component, new RegExp(`${kind}:`), kind);
  }
  assert.match(component, /isProjectProductionScheduleSubmittable/);
  assert.match(component, /Crew, locations, permits, weather, and call sheets remain separate/);
  assert.doesNotMatch(component, /Send call sheet|Publish call sheet|Weather forecast|Map directions/);
});

test("stripboard supports day assignment, ordering, banners, and immutable workflow commands", () => {
  for (const action of [
    "Add shoot day",
    "Remove shoot day",
    "Move shoot day earlier",
    "Move shoot day later",
    "Move item up",
    "Move item down",
    "Add schedule item",
    "Remove schedule item",
    "History",
  ]) assert.match(component, new RegExp(action), action);
  assert.match(component, /relocateItem/);
  assert.match(component, /function moveDay/);
  assert.match(component, /normalizeItems/);
  assert.match(component, /authority\.appendRevision/);
  assert.match(component, /authority\.submitRevision/);
  assert.match(component, /authority\.decideRevision/);
  assert.match(component, /decision === "changes_requested" && !decisionNote\.trim\(\)/);
});

test("demo schedule is deterministic, local-only, and cannot enable API traffic", () => {
  assert.match(component, /function localDemoSchedule/);
  assert.match(component, /2026-07-20/);
  assert.match(component, /Local demo schedule\. Changes stay in this preview, never call project APIs, and are not authoritative\./);
  assert.match(component, /useProjectProductionSchedule\(projectId, !demoMode\)/);
  assert.doesNotMatch(component, /\bfetch\s*\(/);
  assert.match(hook, /if \(!enabled \|\| !projectId\) return/);
});

test("responsive schedule stays dense without a dashboard, drawer, or page overflow", () => {
  assert.match(css, /grid-template-columns: 190px minmax\(0, 1fr\)/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.body \{[\s\S]*?display: block/);
  assert.match(css, /\.dayRail \{[\s\S]*?overflow-x: auto/);
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*?\.workflowActions,[\s\S]*?width: 100%/);
  assert.match(css, /border-radius: 8px/);
  assert.doesNotMatch(css, /font-size:\s*[^;]*(?:vw|cqw)/);
  assert.doesNotMatch(css, /letter-spacing:\s*-/);
  assert.doesNotMatch(component, /Dashboard|drawer|calendar grid/i);
});

test("workspace uses Lucide controls and real form elements", () => {
  assert.match(component, /from "lucide-react"/);
  assert.doesNotMatch(component, /<svg\b|data:image\/svg|emoji/i);
  assert.match(component, /type="date"/);
  assert.match(component, /type="time"/);
  assert.match(component, /type="number"/);
  assert.match(component, /list="production-schedule-timezones"/);
  assert.match(component, /aria-label="Production schedule settings"/);
  assert.match(component, /title="Move item up"/);
});
