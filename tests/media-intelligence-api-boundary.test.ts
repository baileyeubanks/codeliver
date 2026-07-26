import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);

function source(path: string): string {
  return readFileSync(new URL(path, ROOT), "utf8");
}

test("owned transcript and analysis routes contain no direct persistence mutation", () => {
  const routes = [
    "app/api/assets/[id]/transcript/route.ts",
    "app/api/assets/[id]/transcript/batch/route.ts",
    "app/api/assets/[id]/analysis/route.ts",
    "app/api/assets/[id]/analysis/batch/route.ts",
    "app/api/assets/[id]/analysis/decisions/route.ts",
    "app/api/assets/[id]/analysis/composition/route.ts",
  ];
  const mutation = /\.(?:insert|update|upsert|delete)\s*\(/;

  for (const route of routes) {
    assert.doesNotMatch(source(route), mutation, `${route} bypasses the transactional authority`);
  }
});

test("execution and decision writes fail closed when durable authority is unconfigured", () => {
  const transcript = source("app/api/assets/[id]/transcript/route.ts");
  const transcriptBatch = source("app/api/assets/[id]/transcript/batch/route.ts");
  const analysis = source("app/api/assets/[id]/analysis/route.ts");
  const analysisBatch = source("app/api/assets/[id]/analysis/batch/route.ts");
  const decisions = source("app/api/assets/[id]/analysis/decisions/route.ts");
  const server = source("lib/transcript/server.ts");

  for (const route of [transcript, transcriptBatch, analysis, analysisBatch, decisions]) {
    assert.match(route, /durableMediaIntelligenceUnavailable/);
    assert.match(route, /status:\s*503/);
  }
  assert.match(server, /configured:\s*false/);
  assert.match(server, /trusted_source_sha256_receipt/);
  assert.match(server, /atomic_artifact_and_audit_commit/);
  assert.match(server, /paidProviderCallsEnabled:\s*false/);
});

test("safe-demo claims are regenerated against the canonical fixture during parsing", () => {
  const core = source("lib/transcript/core.ts");

  assert.match(core, /safeDemoIntegrityErrors\(document\)/);
  assert.match(core, /createSafeDemoTranscript\(\{/);
  assert.match(core, /canonical deterministic fixture/);
});
