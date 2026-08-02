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

test("Overview opens the project home and leaves the review canvas asset-scoped", () => {
  assert.match(cockpitSource, /<CockpitOverviewDrawer/);
  assert.match(cockpitSource, /<ProjectOverviewHome/);
  assert.match(cockpitSource, /assets\.find\(\(asset\) => asset\.id === requestedAssetId\)\?\.id \?\? ""/);
  assert.match(cockpitSource, /params\.delete\("asset"\)/);
  assert.match(cockpitSource, /setOverviewOpen\(false\)/);
  assert.doesNotMatch(cockpitSource, /<section className="cockpit-metrics"/);
  assert.match(cockpitSource, /value: dueTodayCount/);
  assert.match(cockpitSource, /unit: "Tasks"/);
  assert.match(cockpitSource, /productionPlan\.snapshot\?\.tasks/);
});

test("Overview drawer retains the reference hierarchy and keyboard-safe dialog controls", () => {
  assert.match(drawerSource, /id="cockpit-project-overview"/);
  assert.match(drawerSource, /role="dialog"/);
  assert.match(drawerSource, /aria-labelledby="cockpit-overview-title"/);
  assert.match(drawerSource, /useDialogFocus\(open, drawerRef, onClose, closeRef\)/);
  assert.match(drawerSource, /Welcome back, \{viewerName\}/);
  assert.match(drawerSource, /Here is what is happening with \{projectName\}/);
  assert.match(drawerSource, /<section className=\{styles\.metrics\} aria-label="Project metrics">/);
});
