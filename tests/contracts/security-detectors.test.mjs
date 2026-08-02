import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { CHECK_IDS, runStaticChecks } from "../../scripts/certification/lib/checks.mjs";
import { discoverRepository } from "../../scripts/certification/lib/discovery.mjs";
import { loadManifestRegistry } from "../../scripts/certification/lib/manifest.mjs";

const repoRoot = resolve(import.meta.dirname, "../..");

test("every critical authority detector returns a decision and residual risk on failure", () => {
  const inventory = discoverRepository(repoRoot);
  const registry = loadManifestRegistry(repoRoot);
  const checks = runStaticChecks({
    repoRoot,
    inventory,
    registry,
    binding: {
      commit: "0".repeat(40),
      sourceFingerprint: "1".repeat(64),
      dirtyFingerprint: "2".repeat(64),
      candidateFileCount: 1,
      now: new Date("2026-07-14T00:00:00.000Z"),
    },
  });
  const ids = [
    "security.upload-filename-boundary",
    "security.upload-tenant-authority",
    "security.review-link-row-privacy",
    "security.review-link-password",
    "security.public-file-controls",
    "security.notification-recipient-authorization",
    "security.webhook-egress-guard",
    "consistency.version-binding",
    "consistency.schema-contract",
  ];
  for (const id of ids) {
    assert.equal(CHECK_IDS.has(id), true);
    const check = checks.find((candidate) => candidate.id === id);
    assert.ok(check, `${id} must execute`);
    assert.ok(["pass", "fail"].includes(check.status), `${id} must not silently remain unverified`);
    if (check.status === "fail") assert.ok(check.residualRisk, `${id} must emit residual risk`);
  }
});

test("security detectors follow the active upload, recipient, and webhook guard boundaries", () => {
  const inventory = discoverRepository(repoRoot);
  const registry = loadManifestRegistry(repoRoot);
  const checks = runStaticChecks({
    repoRoot,
    inventory,
    registry,
    binding: {
      commit: "0".repeat(40),
      sourceFingerprint: "1".repeat(64),
      dirtyFingerprint: "2".repeat(64),
      candidateFileCount: 1,
      now: new Date("2026-07-14T00:00:00.000Z"),
    },
  });
  const checkById = new Map(checks.map((check) => [check.id, check]));

  for (const id of [
    "security.upload-filename-boundary",
    "security.upload-tenant-authority",
    "security.review-link-password",
    "security.public-file-controls",
    "security.notification-recipient-authorization",
    "consistency.version-binding",
    "consistency.schema-contract",
  ]) {
    assert.equal(checkById.get(id)?.status, "pass", `${id} must recognize its active guard`);
  }

  const webhook = checkById.get("security.webhook-egress-guard");
  assert.equal(webhook?.status, "pass");
  assert.equal(webhook?.summary, "Webhook egress protections detected");
});
