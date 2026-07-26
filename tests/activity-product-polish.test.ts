import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

test("activity page presents production audit history as a cockpit surface", () => {
  const activityPage = source("app/(dashboard)/activity/page.tsx");

  assert.match(activityPage, /Audit history/);
  assert.match(activityPage, /Production activity/);
  assert.match(activityPage, /activityReadiness/);
  assert.match(activityPage, /Activity readiness/);
  assert.match(activityPage, /Review comments/);
  assert.match(activityPage, /Decision trail/);
  assert.match(activityPage, /Review cockpit/);
  assert.match(activityPage, /href=\{reviewHref\}/);
});

test("activity filters and empty states are route-backed and honest", () => {
  const activityPage = source("app/(dashboard)/activity/page.tsx");

  assert.match(activityPage, /type ActivityFilter = "all" \| "comments" \| "approvals" \| "uploads" \| "audit"/);
  assert.match(activityPage, /aria-label="Activity filters"/);
  assert.match(activityPage, /aria-pressed=\{activeFilter === filter.id\}/);
  assert.match(activityPage, /No production activity yet/);
  assert.match(activityPage, /Activity appears after uploads, comments, approval decisions, share notifications, or backend audit events/);
  assert.match(activityPage, /Open project cockpit/);
  assert.doesNotMatch(activityPage, /AI cleanup complete/i);
  assert.doesNotMatch(activityPage, /notification sent/i);
});
