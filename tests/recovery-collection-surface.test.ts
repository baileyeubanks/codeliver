import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(
  resolve(repositoryRoot, "components/demo/DemoAssetCollection.tsx"),
  "utf8",
);

test("archive and trash recovery surfaces use cockpit command copy", () => {
  assert.match(source, /if \(!demoMode\)/);
  assert.match(source, /Recovery unavailable/);
  assert.match(source, /not available in this workspace until project media recovery has durable authority/);
  assert.match(source, /Back to projects/);
  assert.match(source, /Project archive/);
  assert.match(source, /Trash is empty/);
  assert.match(source, /Open project browser/);
  assert.doesNotMatch(source, /> Projects\s*</);
  assert.doesNotMatch(source, /No \{title\.toLowerCase\(\)\} items/);
});

test("recovery surfaces explain restore authority without adding fake controls", () => {
  assert.match(source, /Recovery queue/);
  assert.match(source, /Restore authority/);
  assert.match(source, /Restores to active project media/);
  assert.match(source, /Recovery is available before permanent removal/);
  assert.match(source, /aria-label=\{`Restore \$\{asset\.title\}`\}/);
  assert.match(source, /restoreDemoArchivedAsset\(asset\.id\)/);
  assert.match(source, /restoreDemoAsset\(asset\.id\)/);
});

test("recovery surfaces keep modest cockpit radius discipline", () => {
  assert.doesNotMatch(source, /rounded-lg|rounded-xl|rounded-2xl|shadow-2xl/);
});
