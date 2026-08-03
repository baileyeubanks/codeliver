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

test("the workspace rail brand slot carries the monogram, wordmark, and microcopy", () => {
  const rail = source("components/navigation/WorkspaceRail.tsx");
  assert.match(rail, /<CvpMonogram\b/);
  assert.match(rail, /<strong>Co‑VideoPro<\/strong>/);
  assert.match(rail, /by Content Co-op/);
  const railStyles = source("components/navigation/WorkspaceRail.module.css");
  assert.match(railStyles, /\.brandHeader::before[\s\S]*?--cvp-gradient-ribbon/);
});

test("the auth shell brand hero shows the monogram and the CVP tagline", () => {
  const authShell = source("components/auth/AuthShell.tsx");
  assert.match(authShell, /<CvpMonogram\b/);
  assert.match(authShell, /Brief/);
  assert.match(authShell, /shoot/);
  assert.match(authShell, /delivery/);
});

test("welcome public door uses a real review player face, not a centered card", () => {
  const welcome = source("app/welcome/page.tsx");
  assert.match(welcome, /ica-ceo-preview\.mp4/);
  assert.match(welcome, /ica-review-filmstrip\.jpg/);
  assert.match(welcome, /brandSignal/);
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
