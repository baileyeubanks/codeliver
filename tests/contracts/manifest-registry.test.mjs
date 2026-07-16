import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { CHECK_IDS } from "../../scripts/certification/lib/checks.mjs";
import { loadManifestRegistry } from "../../scripts/certification/lib/manifest.mjs";

const repoRoot = resolve(import.meta.dirname, "../..");

test("canonical enterprise pillars and journeys auto-register without errors", () => {
  const registry = loadManifestRegistry(repoRoot);
  assert.deepEqual(registry.errors, []);
  assert.equal(registry.pillars.length, 9);
  assert.equal(registry.journeys.length, 9);

  for (const pillar of registry.pillars) {
    assert.deepEqual(pillar.horizons, [1, 2, 3]);
    assert.ok(pillar.authorityDomains.length > 0);
    assert.deepEqual(new Set(pillar.obligations.map((obligation) => obligation.horizon)), new Set([1, 2, 3]));
  }

  const references = [
    ...registry.pillars.flatMap((pillar) => pillar.obligations.flatMap((obligation) => obligation.checks)),
    ...registry.journeys.flatMap((journey) => journey.checks),
  ];
  assert.deepEqual([...new Set(references.filter((id) => !CHECK_IDS.has(id)))], []);
});

test("dropping a new pillar JSON into the directory requires no central registry edit", () => {
  const root = mkdtempSync(join(tmpdir(), "codeliver-certification-registry-"));
  const baseDirectory = join(root, "scripts", "certification");
  mkdirSync(join(baseDirectory, "pillars"), { recursive: true });
  mkdirSync(join(baseDirectory, "journeys"), { recursive: true });
  const obligation = (horizon) => ({
    id: `example.h${horizon}`,
    title: `Horizon ${horizon}`,
    category: "test",
    severity: "high",
    horizon,
    checks: ["manifest.validity"],
    residualRisk: "Fixture risk",
  });
  writeFileSync(
    join(baseDirectory, "pillars", "new-pillar.json"),
    JSON.stringify({
      schemaVersion: 1,
      kind: "pillar",
      id: "new-pillar",
      title: "New pillar",
      horizons: [1, 2, 3],
      owner: "Test",
      objective: "Prove automatic registration",
      authorityDomains: ["audit"],
      surfaces: [{ kind: "api", pattern: "/api/example" }],
      obligations: [obligation(1), obligation(2), obligation(3)],
      slos: [],
    })
  );

  try {
    const registry = loadManifestRegistry(root, { baseDirectory });
    assert.deepEqual(registry.errors, []);
    assert.deepEqual(registry.pillars.map((pillar) => pillar.id), ["new-pillar"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
