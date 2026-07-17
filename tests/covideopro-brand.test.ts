import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const componentSource = readFileSync(
  resolve(repositoryRoot, "components/brand/CoProductionBrand.tsx"),
  "utf8",
);

test("the Co-VideoPro lockup renders Bailey's CVP artwork with an accessible label", () => {
  assert.match(componentSource, /const DEFAULT_LABEL = "Co-VideoPro by Content Co-op"/);
  assert.match(componentSource, /import Image from "next\/image"/);
  assert.match(componentSource, /alt=\{label\}/);
  assert.match(componentSource, /unoptimized/);
  assert.match(componentSource, /Co-VideoPro/);
  assert.doesNotMatch(componentSource, /Co-Production Pro|Co-Deliver/);
});

test("variant artwork maps to the real CVP raster files that exist on disk", () => {
  assert.match(componentSource, /horizontal: \{ src: "\/brand\/cvp-long\.png"/);
  assert.match(componentSource, /stacked: \{ src: "\/brand\/cvp-stacked\.png"/);
  assert.match(componentSource, /"compact-mark": \{ src: "\/brand\/cvp-mark\.png"/);
  for (const file of ["cvp-long.png", "cvp-stacked.png", "cvp-mark.png"]) {
    assert.ok(existsSync(resolve(repositoryRoot, "public/brand", file)), `public/brand/${file} exists`);
    const signature = readFileSync(resolve(repositoryRoot, "public/brand", file)).subarray(0, 8).toString("hex");
    assert.equal(signature, "89504e470d0a1a0a", `${file} is a valid PNG`);
  }
});

test("the retired co-production-pro rasters are no longer referenced", () => {
  assert.doesNotMatch(componentSource, /co-production-pro-/);
});
