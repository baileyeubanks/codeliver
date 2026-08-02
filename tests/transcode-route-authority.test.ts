import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const routeSource = readFileSync(
  resolve(repositoryRoot, "app/api/transcode/route.ts"),
  "utf8",
);
const legacyRouteSource = readFileSync(
  resolve(repositoryRoot, "app/api/media/transcode/route.ts"),
  "utf8",
);
const workerRouteSource = readFileSync(
  resolve(repositoryRoot, "app/api/transcode/worker/route.ts"),
  "utf8",
);
const jobRouteSource = readFileSync(
  resolve(repositoryRoot, "app/api/transcode/jobs/[id]/route.ts"),
  "utf8",
);
const productionGateSource = readFileSync(
  resolve(repositoryRoot, "lib/media-pipeline/production-gate.ts"),
  "utf8",
);
const brandCheckRouteSource = readFileSync(
  resolve(repositoryRoot, "app/api/ai/brand-check/route.ts"),
  "utf8",
);
const summarizeRouteSource = readFileSync(
  resolve(repositoryRoot, "app/api/ai/summarize/route.ts"),
  "utf8",
);

test("transcode enqueue remains bound to the project that passed authorization", () => {
  const authorityCheck = routeSource.indexOf(
    "asset.project_id !== ownership.data.project_id",
  );
  const enqueue = routeSource.indexOf("const job = await service.enqueue");

  assert.notEqual(authorityCheck, -1);
  assert.notEqual(enqueue, -1);
  assert.ok(authorityCheck < enqueue);
  assert.match(routeSource, /projectId:\s*ownership\.data\.project_id/);
  assert.doesNotMatch(routeSource, /projectId:\s*asset\.project_id/);
  assert.match(routeSource, /ASSET_PROJECT_AUTHORITY_CHANGED/);
});

test("every paid-compute mutation fails closed inside its production handler", () => {
  assert.match(productionGateSource, /process\.env\.NODE_ENV !== "production"/);
  assert.match(productionGateSource, /PAID_COMPUTE_AUTHORITY_REQUIRED/);
  assert.match(productionGateSource, /status: 403/);

  for (const source of [routeSource, legacyRouteSource, workerRouteSource]) {
    assert.match(source, /const launchGate = paidComputeProductionGate\(\);/);
    assert.match(source, /if \(launchGate\) return launchGate;/);
  }

  assert.ok(
    routeSource.indexOf("paidComputeProductionGate()") <
      routeSource.indexOf("const job = await service.enqueue"),
  );
  assert.ok(
    legacyRouteSource.indexOf("paidComputeProductionGate()") <
      legacyRouteSource.indexOf("const job = await enqueueTranscode"),
  );
  assert.ok(
    workerRouteSource.indexOf("paidComputeProductionGate()") <
      workerRouteSource.indexOf("await service.runJob"),
  );
  assert.match(
    jobRouteSource,
    /body\.action === "retry"[\s\S]*paidComputeProductionGate\(\)[\s\S]*requestRetry/,
  );

  for (const source of [brandCheckRouteSource, summarizeRouteSource]) {
    assert.match(source, /const launchGate = paidComputeProductionGate\(\);/);
    assert.match(source, /if \(launchGate\) return launchGate;/);
    assert.ok(
      source.indexOf("paidComputeProductionGate()") <
        source.indexOf('fetch("https://api.anthropic.com/v1/messages"'),
    );
  }
});
