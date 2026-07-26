import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

test("production library renders a retryable error for non-2xx and network failures", () => {
  const libraryPage = source("app/(dashboard)/library/page.tsx");

  assert.match(libraryPage, /if \(!response\.ok\)/);
  assert.match(libraryPage, /setRemoteLoadError\(true\)/);
  assert.match(libraryPage, /const retryRemoteAssets = \(\) =>/);
  assert.match(libraryPage, /\) : loadError \? \(/);
  assert.match(libraryPage, /role="alert"/);
  assert.match(libraryPage, /Couldn(?:'|&apos;)t load the media library/);
  assert.match(libraryPage, /onClick=\{retryRemoteAssets\}/);
  assert.match(libraryPage, />\s*Retry\s*</);
});

test("production library keeps a successful empty response distinct and demo mode local", () => {
  const libraryPage = source("app/(dashboard)/library/page.tsx");

  assert.match(libraryPage, /Array\.isArray\(data\.items\) \? data\.items : \[\]/);
  assert.match(libraryPage, /setRemoteAssets\(items\)/);
  assert.match(libraryPage, /const loadError = demoMode \? false : remoteLoadError/);
  assert.match(libraryPage, /if \(demoMode\) return/);

  const errorBranch = libraryPage.indexOf(") : loadError ? (");
  const emptyBranch = libraryPage.indexOf(") : filtered.length === 0 ? (");
  assert.ok(errorBranch >= 0, "load-error branch must exist");
  assert.ok(emptyBranch > errorBranch, "load-error branch must render before the valid empty state");
});
