import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const componentSource = readFileSync(
  resolve(repositoryRoot, "components/brand/CoProductionBrand.tsx"),
  "utf8",
);
const stylesheetSource = readFileSync(
  resolve(repositoryRoot, "components/brand/CoProductionBrand.module.css"),
  "utf8",
);

test("the Co-VideoPro lockup renders the product name as real, accessible text", () => {
  assert.match(componentSource, /const DEFAULT_LABEL = "Co-VideoPro by Content Co-op"/);
  assert.match(componentSource, /role="img"/);
  assert.match(componentSource, /aria-label=\{label\}/);
  assert.match(componentSource, /<span className=\{styles\.product\}>Co-VideoPro<\/span>/);
  assert.match(componentSource, /by Content Co-op/);
});

test("the lockup no longer depends on retired raster artwork", () => {
  assert.doesNotMatch(componentSource, /next\/image/);
  assert.doesNotMatch(componentSource, /co-production-pro-/);
  assert.doesNotMatch(componentSource, /Co-Production Pro|Co-Deliver/);
  assert.doesNotMatch(stylesheetSource, /crop-x|crop-y|image-width/);
});

test("all three variants keep a working style hook and shared mark", () => {
  for (const variant of ["horizontal", "stacked", "compactMark"]) {
    assert.match(stylesheetSource, new RegExp(`\\.${variant}\\b`), `missing .${variant} rule`);
  }
  assert.match(componentSource, /horizontal: styles\.horizontal/);
  assert.match(componentSource, /stacked: styles\.stacked/);
  assert.match(componentSource, /"compact-mark": styles\.compactMark/);
  assert.match(stylesheetSource, /\.markGlyph/);
});

test("the wordmark stays theme-aware (color inherits, no baked background)", () => {
  assert.match(stylesheetSource, /\.brand \{[^}]*color: inherit/s);
  assert.doesNotMatch(stylesheetSource, /\.brand \{[^}]*background/s);
});
