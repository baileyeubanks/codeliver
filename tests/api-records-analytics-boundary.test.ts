import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

test("records, analytics, and transcode routes use structured no-store errors", () => {
  for (const path of [
    "app/api/contacts/route.ts",
    "app/api/contacts/[id]/route.ts",
    "app/api/organizations/route.ts",
    "app/api/organizations/[id]/route.ts",
    "app/api/inquiries/route.ts",
    "app/api/inquiries/[id]/route.ts",
    "app/api/inquiries/[id]/convert/route.ts",
    "app/api/analytics/project/route.ts",
    "app/api/analytics/export/route.ts",
    "app/api/analytics/export/pdf/route.ts",
    "app/api/assets/[id]/route.ts",
    "app/api/transcode/route.ts",
    "app/api/transcode/jobs/[id]/route.ts",
  ]) {
    const route = source(path);
    assert.match(route, /apiError\(/, path);
    assert.doesNotMatch(route, /error:\s*\w+\.message/, path);
  }
});

test("every records and analytics handler catches infrastructure throws after authenticating", () => {
  const handlers: Array<[string, number]> = [
    ["app/api/contacts/route.ts", 2],
    ["app/api/contacts/[id]/route.ts", 2],
    ["app/api/organizations/route.ts", 2],
    ["app/api/organizations/[id]/route.ts", 2],
    ["app/api/inquiries/route.ts", 2],
    ["app/api/inquiries/[id]/route.ts", 2],
    ["app/api/inquiries/[id]/convert/route.ts", 1],
    ["app/api/analytics/project/route.ts", 1],
    ["app/api/analytics/export/route.ts", 1],
    ["app/api/analytics/export/pdf/route.ts", 1],
  ];

  for (const [path, exportedHandlerCount] of handlers) {
    const route = source(path);
    assert.equal(
      (route.match(/export async function (?:GET|POST|PATCH)\([^)]*\) \{\s*try \{/g) ?? []).length,
      exportedHandlerCount,
      `${path} must guard each exported handler`,
    );
    assert.match(route, /catch \{\s*return backendUnavailable\(\);\s*\}/, path);
    if (route.includes("await readJsonObject")) {
      assert.ok(
        route.indexOf("await requireAuth()") < route.indexOf("await readJsonObject"),
        `${path} must authenticate before reading a JSON body`,
      );
    }
  }
});

test("asset and pipeline endpoints fail closed when auth or storage infrastructure is unavailable", () => {
  for (const path of [
    "app/api/assets/[id]/route.ts",
    "app/api/transcode/route.ts",
    "app/api/transcode/jobs/[id]/route.ts",
  ]) {
    const route = source(path);
    assert.match(route, /backendUnavailable\(\)/, path);
    assert.match(route, /BACKEND_UNAVAILABLE|PIPELINE_UNAVAILABLE/, path);
  }
});

test("reviewed access boundaries map infrastructure statuses to opaque backend failures", () => {
  for (const path of [
    "app/api/assets/[id]/route.ts",
    "app/api/assets/[id]/export/route.ts",
    "app/api/transcode/route.ts",
    "app/api/transcode/jobs/[id]/route.ts",
  ]) {
    const route = source(path);
    assert.match(route, /status >= 500/, path);
    assert.match(route, /backendUnavailable\(\)/, path);
  }
});

test("collaboration asset routes do not serialize provider exception messages", () => {
  for (const path of [
    "app/api/assets/[id]/share/route.ts",
    "app/api/assets/[id]/approvals/route.ts",
    "app/api/assets/[id]/comments/route.ts",
    "app/api/assets/[id]/edit-decisions/route.ts",
    "app/api/assets/[id]/versions/route.ts",
    "app/api/assets/[id]/analysis/route.ts",
    "app/api/assets/[id]/analysis/batch/route.ts",
    "app/api/assets/[id]/analysis/decisions/route.ts",
    "app/api/assets/[id]/analysis/composition/route.ts",
    "app/api/assets/[id]/export/route.ts",
    "app/api/assets/[id]/transcript/route.ts",
    "app/api/assets/[id]/transcript/batch/route.ts",
  ]) {
    const route = source(path);
    assert.doesNotMatch(route, /error:\s*\w+(?:\.error)?\.message/, path);
    assert.doesNotMatch(route, /instanceof Error \? \w+\.message/, path);
  }
});
