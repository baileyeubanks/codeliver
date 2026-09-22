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

test("the Co‑VideoPro lockup renders one supplied sapphire artwork", () => {
  assert.match(componentSource, /const DEFAULT_LABEL = "Co‑VideoPro by Content Co-op"/);
  assert.match(componentSource, /role="img"/);
  assert.match(componentSource, /aria-label=\{label\}/);
  assert.match(componentSource, /by Content Co-op/);
  assert.match(componentSource, /src="\/brand\/cvp-sapphire-mark\.png"/);
  assert.doesNotMatch(componentSource, /Co-Production Pro|Co-Deliver/);
});

test("the supplied sapphire mark exists on disk and is a valid PNG", () => {
  const file = resolve(repositoryRoot, "public/brand/cvp-sapphire-mark.png");
  assert.ok(existsSync(file));
  assert.equal(readFileSync(file).subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
});

test("variants share one supplied source artwork", () => {
  assert.equal(componentSource.match(/cvp-sapphire-mark\.png/g)?.length, 1, "one registration mark reference");
});
