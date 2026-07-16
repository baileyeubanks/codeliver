import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { loadManifestRegistry } from "../../scripts/certification/lib/manifest.mjs";

const repoRoot = resolve(import.meta.dirname, "../..");

test("the enterprise loop can always select a next risk from a proof obligation", () => {
  const registry = loadManifestRegistry(repoRoot);
  for (const pillar of registry.pillars) {
    for (const obligation of pillar.obligations) {
      assert.ok(obligation.id);
      assert.ok(obligation.residualRisk);
      assert.ok(obligation.checks.length > 0);
      assert.ok([1, 2, 3].includes(obligation.horizon));
    }
  }
});

test("all canonical enterprise authority domains are represented", () => {
  const registry = loadManifestRegistry(repoRoot);
  const represented = new Set(registry.pillars.flatMap((pillar) => pillar.authorityDomains));
  assert.deepEqual(
    represented,
    new Set(["identity", "tenant", "project", "version", "permission", "billing", "audit"])
  );
});
