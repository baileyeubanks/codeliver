import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const protectedRoutes = [
  "app/api/assets/[id]/share/route.ts",
  "app/api/assets/[id]/approvals/route.ts",
  "app/api/assets/[id]/export/route.ts",
  "app/api/assets/[id]/versions/route.ts",
  "app/api/assets/[id]/edit-decisions/route.ts",
  "app/api/assets/[id]/transcript/route.ts",
  "app/api/assets/[id]/comments/route.ts",
  "app/api/assets/[id]/analysis/route.ts",
  "app/api/assets/[id]/analysis/batch/route.ts",
  "app/api/assets/[id]/analysis/decisions/route.ts",
  "app/api/assets/[id]/analysis/composition/route.ts",
  "app/api/assets/[id]/transcript/batch/route.ts",
  "app/api/assets/tags/route.ts",
  "app/api/assets/batch-share/route.ts",
  "app/api/assets/bulk/route.ts",
];

test("asset API handlers have an opaque backend failure boundary", () => {
  const helper = readFileSync(
    resolve(root, "app/api/assets/asset-route-boundary.ts"),
    "utf8",
  );
  assert.match(helper, /catch\s*\{[\s\S]*?code:\s*"BACKEND_UNAVAILABLE"/);
  assert.match(helper, /Cache-Control.*no-store/);

  for (const path of protectedRoutes) {
    const source = readFileSync(resolve(root, path), "utf8");
    assert.match(source, /withAssetRouteBoundary/);
    assert.doesNotMatch(source, /export async function (GET|POST|PUT|PATCH|DELETE)/);
    assert.doesNotMatch(source, /error:\s*\w+\.message/);
  }
});
