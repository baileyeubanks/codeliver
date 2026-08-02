import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const component = readFileSync(
  resolve(repositoryRoot, "components/projects/ProjectShotPlanWorkspace.tsx"),
  "utf8",
);
const css = readFileSync(
  resolve(repositoryRoot, "components/projects/ProjectShotPlanWorkspace.module.css"),
  "utf8",
);
const cockpit = readFileSync(
  resolve(repositoryRoot, "components/projects/ProjectCockpit.tsx"),
  "utf8",
);
const hook = readFileSync(
  resolve(repositoryRoot, "lib/hooks/useProjectShotPlan.ts"),
  "utf8",
);

test("shot planning stays inside the existing Plan workspace", () => {
  assert.match(cockpit, /type PlanWorkspaceMode = "script" \| "shots" \| "tasks" \| "schedule"/);
  assert.match(cockpit, /aria-pressed=\{activePlanWorkspace === "shots"\}/);
  assert.match(cockpit, /onClick=\{\(\) => selectPlanWorkspace\("shots"\)\}/);
  assert.match(cockpit, /<ProjectShotPlanWorkspace/);
  assert.match(cockpit, /params\.set\("surface", "tasks"\)/);
  assert.match(cockpit, /params\.set\("plan", mode\)/);
  assert.doesNotMatch(cockpit, /activeSection === "shots"/);
  assert.doesNotMatch(component, /next\/navigation|next\/link|\bShell\b/);
});

test("storyboard and shot list are two views of one governed content model", () => {
  assert.match(component, /type ShotPlanView = "storyboard" \| "shot-list"/);
  assert.match(component, /aria-label="Shot plan view"/);
  assert.match(component, /Storyboard/);
  assert.match(component, /Shot list/);
  assert.match(component, /selectedScene\.shots\.map/);
  assert.match(component, /storyboardPanels\.map/);
  assert.match(component, /Panel \{panel\.order\} · Text brief/);
  assert.match(component, /className=\{styles\.storyboardCard\}[\s\S]*?aria-pressed=/);
  assert.match(component, /className=\{styles\.shotSelect\}[\s\S]*?aria-label=/);
  assert.match(component, /htmlFor=\{`shot-plan-panel-\$\{panel\.id\}`\}/);
  assert.doesNotMatch(component, /<label key=\{panel\.id\}>/);
  assert.doesNotMatch(component, /<img\b|<Image\b|placeholder image|fake asset/i);
  assert.doesNotMatch(component, /assetId\s*=|versionId\s*=/);
});

test("workspace exposes complete immutable revision and producer-decision controls", () => {
  for (const label of [
    "Generate shot plan",
    "Add shot",
    "Remove shot",
    "Move shot up",
    "Move shot down",
    "Add panel",
    "Move panel up",
    "Move panel down",
    "Remove panel",
    "History",
    "Revision summary",
    "Save revision",
    "Submit",
    "Request changes",
    "Approve and activate",
  ]) {
    assert.match(component, new RegExp(label), label);
  }
  assert.match(component, /parseProjectShotPlanContent\(draft\)/);
  assert.match(component, /authority\.appendRevision/);
  assert.match(component, /authority\.submitRevision/);
  assert.match(component, /authority\.decideRevision/);
  assert.match(component, /addPanel/);
  assert.match(component, /movePanel/);
  assert.match(component, /removePanel/);
  assert.match(component, /<details className=\{styles\.historyMenu\}>/);
  assert.match(component, /decision === "changes_requested" && !decisionNote\.trim\(\)/);
  assert.match(component, /PRODUCER_ROLES/);
  assert.match(component, /WRITE_ROLES/);
});

test("demo flow is deterministic and cannot enable project API traffic", () => {
  assert.match(component, /deriveProjectShotPlanContent\(demoScript\(projectName\)\)/);
  assert.match(component, /useProjectShotPlan\(projectId, !demoMode\)/);
  assert.doesNotMatch(component, /\bfetch\s*\(/);
  assert.match(hook, /if \(!enabled \|\| !projectId\) return/);
  assert.match(hook, /if \(!enabled\) \{[\s\S]*?abortRef\.current\?\.abort\(\)/);
});

test("hook owns exact endpoints, stable replay requests, and conflict reloads", () => {
  for (const endpoint of [
    "/shot-plan`",
    "/shot-plan/generate`",
    "/shot-plan/submit`",
    "/shot-plan/decision`",
  ]) {
    assert.match(hook, new RegExp(endpoint.replaceAll("/", "\\/")));
  }
  assert.match(hook, /requestId: crypto\.randomUUID\(\)/);
  assert.match(hook, /setConflict\(message\);[\s\S]*?await load\(true\)/);
  assert.equal((hook.match(/response\.status === 409/g) ?? []).length, 4);
  assert.match(hook, /parseProjectShotPlanSnapshot\(body\)/);
});

test("responsive layout remains dense and usable without page overflow", () => {
  assert.match(css, /grid-template-columns: 190px minmax\(0, 1fr\) 270px/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.body \{[\s\S]*?display: block/);
  assert.match(css, /\.sceneRail \{[\s\S]*?overflow-x: auto/);
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*?\.workflowActions,[\s\S]*?width: 100%/);
  assert.match(css, /border-radius: 8px/);
  assert.match(css, /\.storyboardCard:focus-visible,[\s\S]*?\.shotSelect:focus-visible/);
  assert.doesNotMatch(css, /font-size:\s*[^;]*(?:vw|cqw)/);
  assert.doesNotMatch(css, /letter-spacing:\s*-/);
});

test("workspace uses lucide controls without handcrafted visible assets", () => {
  assert.match(component, /from "lucide-react"/);
  assert.doesNotMatch(component, /<svg\b|data:image\/svg|emoji/i);
  assert.match(component, /title="Move shot up" aria-label="Move shot up"/);
  assert.match(component, /title="Move shot down" aria-label="Move shot down"/);
  assert.match(component, /title="Remove shot" aria-label="Remove shot"/);
});
