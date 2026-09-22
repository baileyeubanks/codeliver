import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

const BRAND_COLORS = ["#E8442E", "#1E40AF", "#16A34A", "#F59E0B"];

test("the inline CVP monogram paints all four brand colors", () => {
  const monogram = source("components/navigation/CvpMonogram.tsx");
  for (const color of BRAND_COLORS) {
    assert.ok(monogram.includes(color), `monogram is missing ${color}`);
  }
});

test("the workspace shell owns the brand without duplicating it in the rail", () => {
  const rail = source("components/navigation/WorkspaceRail.tsx");
  const shell = source("components/Shell.tsx");
  assert.match(shell, /<CoProductionBrand\b/);
  assert.match(rail, /aria-label="Workspace rail"/);
  assert.doesNotMatch(rail, /<CvpMonogram\b|<CoProductionBrand\b|styles\.brandHeader/);
});

test("the auth shell brand hero shows the monogram and the CVP tagline", () => {
  const authShell = source("components/auth/AuthShell.tsx");
  assert.match(authShell, /<CvpMonogram\b/);
  assert.match(authShell, /Brief/);
  assert.match(authShell, /shoot/);
  assert.match(authShell, /delivery/);
});

test("welcome keeps a branded public entry without fixture media", () => {
  const welcome = source("app/welcome/page.tsx");
  assert.match(welcome, /<CoProductionBrand\b/);
  assert.doesNotMatch(welcome, /ica-ceo-preview\.mp4|ica-review-filmstrip\.jpg/);
  assert.match(welcome, /Request access/);
  assert.doesNotMatch(welcome, /demo=1/);
});

test("the app icon is the CVP monogram, not a generic play button", () => {
  const icon = source("app/icon.svg");
  assert.match(icon, /^<svg\b/);
  assert.match(icon, /viewBox="0 0 64 64"/);
  for (const color of BRAND_COLORS) {
    assert.ok(icon.includes(color), `app icon is missing ${color}`);
  }
  assert.doesNotMatch(icon, /#6d5dfc/i);
});
