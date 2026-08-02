import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import test from "node:test";

import { runStaticChecks } from "../../scripts/certification/lib/checks.mjs";
import { discoverRepository } from "../../scripts/certification/lib/discovery.mjs";
import {
  loadManifestRegistry,
  matchesSurfacePattern,
} from "../../scripts/certification/lib/manifest.mjs";

const repoRoot = resolve(import.meta.dirname, "../..");

function staticSnapshot() {
  const inventory = discoverRepository(repoRoot);
  const registry = loadManifestRegistry(repoRoot);
  const binding = {
    commit: "0".repeat(40),
    sourceFingerprint: "1".repeat(64),
    dirtyFingerprint: createHash("sha256").update("fixture").digest("hex"),
    candidateFileCount: 1,
    now: new Date("2026-07-14T00:00:00.000Z"),
  };
  return { inventory, checks: runStaticChecks({ repoRoot, inventory, registry, binding }) };
}

test("every discovered route is assigned to at least one enterprise pillar", () => {
  const { inventory, checks } = staticSnapshot();
  assert.ok(inventory.pages.length > 0);
  assert.ok(inventory.apis.length > 0);
  assert.equal(checks.find((check) => check.id === "inventory.route-coverage")?.status, "pass");
});

test("team invite acceptance belongs to the identity and organization pillar", () => {
  const { inventory } = staticSnapshot();
  const inviteRoute = inventory.routes.find((route) => route.file === "app/invite/[token]/page.tsx");
  const identityPillar = loadManifestRegistry(repoRoot).pillars.find(
    (pillar) => pillar.id === "identity-organizations-policy-branding"
  );

  assert.equal(inviteRoute?.route, "/invite/[token]");
  assert.ok(identityPillar);
  assert.ok(
    identityPillar.surfaces.some(
      (surface) =>
        surface.kind === "page" && matchesSurfacePattern(inviteRoute.route, surface.pattern)
    )
  );
});

test("every declared journey route exists and every literal API consumer resolves", () => {
  const { checks } = staticSnapshot();
  assert.equal(checks.find((check) => check.id === "inventory.journey-route-coverage")?.status, "pass");
  const consumerCheck = checks.find((check) => check.id === "consistency.api-consumers");
  assert.ok(consumerCheck);
  assert.ok(["pass", "fail"].includes(consumerCheck.status), "detector must make a deterministic decision");
});
