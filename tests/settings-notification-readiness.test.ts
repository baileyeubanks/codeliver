import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("settings notifications expose honest delivery readiness instead of implying live sends", () => {
  const source = readFileSync(
    resolve(repositoryRoot, "components/auth/DemoSettingsSurface.tsx"),
    "utf8",
  );

  assert.match(source, /NotificationReadinessSummary/);
  assert.match(source, /Notification readiness/);
  assert.match(source, /Live send authority/);
  assert.match(source, /External sends still require share-recipient consent/);
  assert.match(source, /origin checks, idempotency, and configured adapters/);
  assert.match(source, /Fail-closed/);
  assert.match(source, /Needs an E\.164 text number/);
  assert.match(source, /logs outbound messages locally/);
  assert.doesNotMatch(source, /live sends are ready/i);
});
