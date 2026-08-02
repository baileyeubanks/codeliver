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

function deliveryPhaseSource() {
  const phase = /"delivery-assets": \{([\s\S]*?)\n      \},\n    \};/.exec(cockpitSource)?.[1];
  assert.ok(phase, "missing delivery-assets lifecycle phase");
  return phase;
}

test("cockpit does not represent approved media as a final delivery record", () => {
  const phase = deliveryPhaseSource();

  assert.match(phase, /href: null/);
  assert.match(phase, /label: "Not configured"/);
  assert.match(phase, /label: "Delivery setup required"/);
  assert.match(phase, /approved media/);
  assert.match(phase, /label: "Asset library"/);
  assert.doesNotMatch(phase, /Project archive/);
});
