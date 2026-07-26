import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { JOURNEY_REQUIRED_ARRAYS, loadManifestRegistry } from "../../scripts/certification/lib/manifest.mjs";

const repoRoot = resolve(import.meta.dirname, "../..");

test("every journey carries the complete proof contract", () => {
  const registry = loadManifestRegistry(repoRoot);
  for (const journey of registry.journeys) {
    for (const key of JOURNEY_REQUIRED_ARRAYS) {
      assert.ok(Array.isArray(journey[key]) && journey[key].length > 0, `${journey.id}.${key}`);
    }
    assert.deepEqual(new Set(journey.viewports.map((viewport) => viewport.id)), new Set(["mobile", "desktop"]));
    assert.ok(journey.performanceBudgets.every((budget) => Number.isFinite(budget.value) && budget.value >= 0));
    assert.ok(journey.proofTtlDays > 0);
  }
});

test("journeys cover login through sign-out and every requested workflow family", () => {
  const registry = loadManifestRegistry(repoRoot);
  const routes = new Set(registry.journeys.flatMap((journey) => journey.routes));
  const required = [
    "/login",
    "/signup",
    "/api/auth/logout",
    "/projects/new",
    "/api/upload/tus",
    "/projects/[id]/assets/[assetId]",
    "/api/assets/[id]/comments",
    "/api/assets/[id]/approvals",
    "/settings",
    "/api/notifications/preferences",
    "/api/assets/[id]/share",
    "/review/[token]",
  ];
  for (const route of required) assert.equal(routes.has(route), true, route);
});
