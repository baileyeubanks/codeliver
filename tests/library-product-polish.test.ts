import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

test("media library has an operational asset summary and route-backed empty state", () => {
  const libraryPage = source("app/(dashboard)/library/page.tsx");

  assert.match(libraryPage, /libraryReadiness/);
  assert.match(libraryPage, /Asset management/);
  assert.match(libraryPage, /Review queue/);
  assert.match(libraryPage, /Ready for delivery/);
  assert.match(libraryPage, /aria-label="File type filters"/);
  assert.match(libraryPage, /aria-pressed=\{typeFilter === t\}/);
  assert.match(libraryPage, /href=\{demoMode \? "\/projects\?demo=1" : "\/projects"\}/);
  assert.match(libraryPage, /Upload media from a project cockpit/);
  assert.doesNotMatch(libraryPage, /rounded-xl/);
});

test("media library does not imply processing state that is not backed by assets", () => {
  const libraryPage = source("app/(dashboard)/library/page.tsx");

  assert.doesNotMatch(libraryPage, /AI cleanup complete/i);
  assert.doesNotMatch(libraryPage, /transcript ready/i);
  assert.doesNotMatch(libraryPage, /waveform generated/i);
});
