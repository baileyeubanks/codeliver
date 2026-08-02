import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const component = readFileSync(
  resolve(repositoryRoot, "components/projects/ProjectCallSheetWorkspace.tsx"),
  "utf8",
);
const css = readFileSync(
  resolve(repositoryRoot, "components/projects/ProjectCallSheetWorkspace.module.css"),
  "utf8",
);
const cockpit = readFileSync(
  resolve(repositoryRoot, "components/projects/ProjectCockpit.tsx"),
  "utf8",
);
const cockpitCss = readFileSync(
  resolve(repositoryRoot, "components/projects/ProjectCockpit.module.css"),
  "utf8",
);
const hook = readFileSync(
  resolve(repositoryRoot, "lib/hooks/useProjectCallSheet.ts"),
  "utf8",
);

test("call sheets stay inside the existing Plan surface and URL state", () => {
  assert.match(cockpit, /"schedule" \| "call-sheet"/);
  assert.match(cockpit, /aria-pressed=\{activePlanWorkspace === "call-sheet"\}/);
  assert.match(cockpit, /selectPlanWorkspace\("call-sheet"\)/);
  assert.match(cockpit, /<ProjectCallSheetWorkspace/);
  assert.match(cockpitCss, /grid-template-columns: repeat\(5, minmax\(68px, 1fr\)\)/);
  assert.doesNotMatch(component, /next\/navigation|next\/link|\bShell\b/);
});

test("workspace connects an exact approved schedule day to immutable call-sheet work", () => {
  for (const label of [
    "Approved production schedule",
    "Shoot days",
    "Location and access",
    "Production contacts",
    "Day agenda",
    "Instructions and safety",
    "Revision summary",
    "Save revision",
    "Submit",
    "Request changes",
    "Approve and activate",
  ]) assert.match(component, new RegExp(label), label);
  assert.match(component, /productionScheduleContent\.days/);
  assert.match(component, /authority\.selectDay/);
  assert.match(component, /isProjectCallSheetSubmittable/);
  assert.match(component, /authority\.appendRevision/);
  assert.match(component, /authority\.submitRevision/);
  assert.match(component, /authority\.decideRevision/);
});

test("contacts, logistics, agenda, and instructions expose complete production controls", () => {
  for (const label of [
    "Location name",
    "Location contact",
    "Address",
    "Location phone",
    "Parking",
    "Access and load-in",
    "General notes",
    "Name",
    "Role",
    "Department",
    "Call time",
    "Email",
    "Phone",
    "Add contact",
    "Add instruction",
  ]) assert.match(component, new RegExp(label), label);
  for (const kind of ["safety", "weather", "transport", "meal", "equipment", "note"]) {
    assert.match(component, new RegExp(`${kind}:`), kind);
  }
  assert.match(component, /function moveContact/);
  assert.match(component, /function moveSection/);
  assert.match(component, /agenda\.map/);
});

test("readiness remains explicit and distribution claims stay closed", () => {
  for (const label of [
    "Location ready",
    "Reachable contact required",
    "Safety section required",
    "Agenda complete",
  ]) assert.match(component, new RegExp(label), label);
  assert.match(component, /Approval does not send, notify, acknowledge, or prove receipt/);
  assert.doesNotMatch(component, /Send call sheet|Distribute call sheet|Live weather|Map directions/);
  assert.doesNotMatch(component, /navigator\.share|mailto:|sms:/);
});

test("demo call sheet is deterministic, local-only, and cannot enable API traffic", () => {
  assert.match(component, /function demoCallSheet/);
  assert.match(component, /2026-07-20/);
  assert.match(component, /Local demo call sheet\. Changes stay in this preview, never call project APIs, and are not authoritative\./);
  assert.match(component, /useProjectCallSheet\(projectId, !demoMode\)/);
  assert.doesNotMatch(component, /\bfetch\s*\(/);
  assert.match(hook, /if \(!enabled \|\| !projectId/);
});

test("responsive call sheet preserves the bright dense cockpit grammar", () => {
  assert.match(css, /grid-template-columns: 184px minmax\(0, 1fr\)/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.body \{[\s\S]*?display: block/);
  assert.match(css, /\.dayRail \{[\s\S]*?overflow-x: auto/);
  assert.match(css, /@media \(max-width: 540px\)[\s\S]*?\.workflowActions,[\s\S]*?width: 100%/);
  assert.match(css, /border-radius: 8px/);
  assert.doesNotMatch(css, /font-size:\s*[^;]*(?:vw|cqw)/);
  assert.doesNotMatch(css, /letter-spacing:\s*-/);
  assert.doesNotMatch(component, /Dashboard|drawer|marketing/i);
});

test("workspace uses Lucide icons and native accessible form controls", () => {
  assert.match(component, /from "lucide-react"/);
  assert.doesNotMatch(component, /<svg\b|data:image\/svg|emoji/i);
  assert.match(component, /type="time"/);
  assert.match(component, /type="email"/);
  assert.match(component, /type="tel"/);
  assert.match(component, /aria-label="Governed production call sheet"/);
  assert.match(component, /aria-label="Call-sheet readiness"/);
  assert.match(component, /title="Move contact up"/);
});
