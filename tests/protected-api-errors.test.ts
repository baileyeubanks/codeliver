import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

test("protected activity and readiness routes convert backend failures to structured no-store responses", () => {
  for (const path of [
    "app/api/activity/route.ts",
    "app/api/storage/readiness/route.ts",
  ]) {
    const route = source(path);
    assert.match(route, /backendUnavailable\(\)|STORAGE_UNAVAILABLE/);
    assert.match(route, /apiError\(/);
    assert.doesNotMatch(route, /NextResponse\.json\(\{ items: \[\] \}\)/);
  }
});

test("protected media and approval routes do not expose provider error messages", () => {
  for (const path of [
    "app/api/media/browse/route.ts",
    "app/api/media/stream/route.ts",
    "app/api/media/upload/route.ts",
    "app/api/approvals/notify/route.ts",
    "app/api/approvals/workflow/route.ts",
  ]) {
    const route = source(path);
    assert.match(route, /apiError\(|backendUnavailable\(/);
    assert.doesNotMatch(route, /error:\s*\w+\.message/);
    if (path.startsWith("app/api/media/")) {
      assert.doesNotMatch(route, /NextResponse\.json\(/);
    }
  }
});

test("legacy media upload never reports success after its asset record fails", () => {
  const route = source("app/api/media/upload/route.ts");
  assert.match(
    route,
    /if \(error\) \{[\s\S]*?unlink\(created\.absolutePath\)[\s\S]*?return backendUnavailable\(\)/,
  );
  assert.match(route, /return apiJson\(\{\s*success: true,/);
});

test("approval workflow validates bodies and cannot report a stale update as success", () => {
  const route = source("app/api/approvals/workflow/route.ts");
  assert.match(route, /req\.json\(\)\.catch\(\(\) => null\)/);
  assert.match(route, /WORKFLOW_MODES/);
  assert.match(route, /updatedError/);
  assert.match(route, /updatedStepsError/);
  assert.doesNotMatch(route, /error:\s*\w+\.message/);
});

test("public review APIs map database helper failures to the opaque backend contract", () => {
  for (const path of [
    "app/api/review/[token]/route.ts",
    "app/api/review/[token]/comments/route.ts",
    "app/api/review/[token]/approvals/route.ts",
    "app/api/review/[token]/edit-decisions/route.ts",
  ]) {
    const route = source(path);
    assert.match(route, /status >= 500\) return backendUnavailable\(\)/);
  }
});

test("upload target authority distinguishes missing records from backend outages", () => {
  const shared = source("app/api/upload/_shared.ts");
  assert.match(
    shared,
    /projectAccess\.status >= 500[\s\S]*?BackendUnavailableError/,
  );
  assert.match(shared, /const \{ data: folder, error \}/);
  assert.match(
    shared,
    /if \(error\) \{[\s\S]*?BackendUnavailableError\("Upload folder authority"\)/,
  );
});
