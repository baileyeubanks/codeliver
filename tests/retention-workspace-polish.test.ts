import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

test("archive and trash share a polished retention workspace", () => {
  const collection = source("components/demo/DemoAssetCollection.tsx");

  assert.match(collection, /Retention workspace/);
  assert.match(collection, /Project archive/);
  assert.match(collection, /Project trash/);
  assert.match(collection, /aria-label=\{`\$\{modeLabel\} readiness`\}/);
  assert.match(collection, /Return to production library/);
  assert.match(collection, /Open library/);
  assert.doesNotMatch(collection, /rounded-xl/);
});

test("retention workspace is honest about demo restore and deletion authority", () => {
  const collection = source("components/demo/DemoAssetCollection.tsx");

  assert.match(collection, /Production retention requires the storage contract/);
  assert.match(collection, /Permanent deletion is intentionally not exposed here/);
  assert.match(collection, /Restore keeps the asset in local demo authority/);
  assert.match(collection, /Local state only/);
  assert.match(collection, /Needs backend/);
  assert.doesNotMatch(collection, /Permanently delete/i);
  assert.doesNotMatch(collection, /hard delete/i);
});
