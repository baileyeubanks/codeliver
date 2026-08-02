import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { CHECK_IDS } from "../scripts/certification/lib/checks.mjs";
import { loadManifestRegistry } from "../scripts/certification/lib/manifest.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pillarPath =
  "scripts/certification/pillars/identity-organizations-policy-branding.json";

function manifest(path: string) {
  return JSON.parse(readFileSync(resolve(repositoryRoot, path), "utf8"));
}

test("identity authority pillar registers with six explicit fail-closed detectors", () => {
  const registry = loadManifestRegistry(repositoryRoot);
  const relevantErrors = registry.errors.filter(
    (error) =>
      error.includes(pillarPath) ||
      error.includes("duplicate manifest id identity-organizations-policy-branding"),
  );
  assert.deepEqual(relevantErrors, []);

  const pillar = manifest(pillarPath);
  assert.equal(pillar.id, "identity-organizations-policy-branding");
  assert.deepEqual(pillar.horizons, [1, 2, 3]);
  assert.deepEqual(
    new Set(pillar.authorityDomains),
    new Set(["identity", "tenant", "permission", "audit"]),
  );

  const requiredSurfaces = [
    ["page", "/settings"],
    ["api", "/api/auth/session"],
    ["api", "/api/auth/logout"],
    ["api", "/api/identity/**"],
    ["api", "/api/teams"],
    ["api", "/api/teams/**"],
    ["api", "/api/notifications/preferences"],
  ];
  const surfaces = new Set(
    pillar.surfaces.map((surface: { kind: string; pattern: string }) =>
      `${surface.kind}:${surface.pattern}`
    ),
  );
  for (const [kind, pattern] of requiredSurfaces) {
    assert.equal(surfaces.has(`${kind}:${pattern}`), true, `${kind}:${pattern}`);
  }

  const expectedDetectors = new Map([
    ["identity.h1.actor-coherence", "evidence.auth-lifecycle"],
    ["identity.h1.membership-role", "security.cross-tenant-attack-proof"],
    ["identity.h1.persisted-preferences", "product.production-settings-authority"],
    ["identity.h1.demo-isolation", "evidence.auth-lifecycle"],
    ["identity.h1.sign-out", "evidence.auth-lifecycle"],
    ["identity.h1.cross-tenant-denial", "security.cross-tenant-attack-proof"],
  ]);
  const obligations = new Map(
    pillar.obligations.map((obligation: { id: string }) => [obligation.id, obligation]),
  );

  for (const [id, dedicatedCheck] of expectedDetectors) {
    const obligation = obligations.get(id) as
      | { horizon: number; severity: string; checks: string[]; residualRisk: string }
      | undefined;
    assert.ok(obligation, `missing ${id}`);
    assert.equal(obligation.horizon, 1);
    assert.equal(obligation.severity, "critical");
    assert.equal(obligation.checks.includes("commands.product-tests"), true);
    assert.equal(obligation.checks.includes(dedicatedCheck), true);
    assert.ok(obligation.residualRisk.length > 20);
  }

  const checks = pillar.obligations.flatMap(
    (obligation: { checks: string[] }) => obligation.checks,
  );
  for (const check of checks) {
    assert.equal(CHECK_IDS.has(check), true, `unregistered identity check ${check}`);
  }
});
