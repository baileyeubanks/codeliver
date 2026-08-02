import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

test("public review loading, error, and default header states use the product lockup", () => {
  const workspace = source("components/review/PublicReviewWorkspace.tsx");
  const styles = source("components/review/PublicReviewWorkspace.module.css");

  assert.match(workspace, /CoProductionBrand/);
  assert.match(workspace, /label="Co‑VideoPro by Content Co-op"/);
  assert.match(workspace, /aria-label=\{brand\?\.displayName \?\? "Co‑VideoPro by Content Co-op"\}/);
  assert.match(workspace, /className=\{styles\.stateLogo\}/);
  assert.match(workspace, /className=\{styles\.brandLockup\}/);
  assert.match(workspace, /Preparing your review/);
  assert.match(workspace, /Review unavailable/);
  assert.doesNotMatch(workspace, /\/demo\/cco-lockup\.png/);
  assert.doesNotMatch(workspace, /aria-label=\{brand\?\.displayName \?\? "Content Co-op"\}/);

  assert.match(styles, /\.productBrand/);
  assert.match(styles, /\.brandLockup/);
  assert.match(styles, /--co-production-brand-width:\s*150px/);
  assert.match(styles, /--co-production-brand-width:\s*166px/);
  assert.doesNotMatch(styles, /border-radius:\s*(?:9999px|999px|1rem|12px)/);
});

test("tenant-branded public review links keep their custom logo and copy contract", () => {
  const workspace = source("components/review/PublicReviewWorkspace.tsx");

  assert.match(workspace, /src=\{brand\.logoPath\}/);
  assert.match(workspace, /<strong>\{brand\.displayName\}<\/strong>/);
  assert.match(workspace, /<small>\{brand\.playerLabel\}<\/small>/);
  assert.match(workspace, /--accent/);
  assert.match(workspace, /brand\.primaryColor/);
});
