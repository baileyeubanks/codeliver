import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

test("cockpit notification and account popovers stay operational and route backed", () => {
  const cockpit = source("components/projects/ProjectCockpit.tsx");
  const globals = source("app/globals.css");
  const popoverStyles = globals.slice(
    globals.indexOf(".cockpit-popover-heading"),
    globals.indexOf(".cockpit-sidebar"),
  );

  assert.match(cockpit, /Audit notifications/);
  assert.match(cockpit, /Project signal is scoped to this workspace/);
  assert.match(cockpit, /selectDockTab\("activity"\)/);
  assert.match(cockpit, /No project audit events are waiting/);
  assert.match(cockpit, /href=\{demoMode \? "\/settings\?demo=1" : "\/settings"\}/);
  assert.match(cockpit, /Branding and preferences/);
  assert.doesNotMatch(cockpit, /Mark all/i);

  assert.match(popoverStyles, /\.cockpit-popover-heading/);
  assert.match(popoverStyles, /\.cockpit-notification-summary/);
  assert.doesNotMatch(popoverStyles, /border-radius:\s*(?:9999px|999px|1rem|12px)/);
});
