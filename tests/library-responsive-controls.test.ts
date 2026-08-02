import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync("app/(dashboard)/library/page.tsx", "utf8");

test("library search and type filters collapse before overflowing mobile", () => {
  assert.match(source, /flex flex-col gap-3 sm:flex-row sm:items-center/);
  assert.match(source, /max-w-full gap-1 overflow-x-auto/);
  assert.match(source, /shrink-0 px-3 py-1\.5/);
  assert.match(source, /aria-label="Filter media type"/);
});

test("library media uses direct local demo thumbnails with an error fallback", () => {
  assert.match(source, /function AssetThumbnail/);
  assert.match(source, /src=\{asset\.thumbnail_url\}[\s\S]*?\bunoptimized\b/);
  assert.doesNotMatch(source, /remotePatterns/);
  assert.match(source, /onError=\{\(\) => setFailed\(true\)\}/);
  assert.match(source, /aria-label="Search media assets"/);
  assert.match(source, /aria-pressed=\{typeFilter === t\}/);
});
