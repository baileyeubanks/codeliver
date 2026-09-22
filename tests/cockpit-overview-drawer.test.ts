import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cockpitSource = readFileSync(
  resolve(repositoryRoot, "components/projects/ProjectCockpit.tsx"),
  "utf8",
);
const drawerSource = readFileSync(
  resolve(repositoryRoot, "components/cockpit/CockpitOverviewDrawer.tsx"),
  "utf8",
);

test("the review canvas uses persistent project navigation and contextual tools without a second overview layer", () => {
  assert.doesNotMatch(cockpitSource, /<CockpitOverviewDrawer/);
  assert.doesNotMatch(cockpitSource, /<section className="cockpit-metrics"/);
  assert.match(cockpitSource, /<CockpitProjectNavigation[\s\S]*?activeSection=\{activeSection\}/);
  assert.match(cockpitSource, /<CockpitToolbar[\s\S]*?dockOpen=\{dockVisible\}/);
  assert.match(cockpitSource, /onToggleDock=\{toggleOperatorDock\}/);
  assert.match(cockpitSource, /<ProjectSourceArchive projectId=\{project.id\}/);
});

test("the retained Overview drawer component keeps keyboard-safe dialog controls", () => {
  assert.match(drawerSource, /id="cockpit-project-overview"/);
  assert.match(drawerSource, /role="dialog"/);
  assert.match(drawerSource, /aria-labelledby="cockpit-overview-title"/);
  assert.match(drawerSource, /useDialogFocus\(open, drawerRef, onClose, closeRef\)/);
  assert.match(drawerSource, /Welcome back, \{viewerName\}/);
  assert.match(drawerSource, /Here is what is happening with \{projectName\}/);
  assert.match(drawerSource, /<section className=\{styles\.metrics\} aria-label="Project metrics">/);
});
