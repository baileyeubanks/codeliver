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

test("the Co‑ProVideo lockup renders the wordmark + one four-color registration mark", () => {
  assert.match(componentSource, /const DEFAULT_LABEL = "Co‑ProVideo by Content Co-op"/);
  assert.match(componentSource, /role="img"/);
  assert.match(componentSource, /aria-label=\{label\}/);
  assert.match(componentSource, /<span className=\{styles\.product\}>Co‑ProVideo<\/span>/);
  assert.match(componentSource, /by Content Co-op/);
  assert.match(componentSource, /src="\/brand\/cvp-fourcolor-mark\.png"/);
  assert.doesNotMatch(componentSource, /Co-Production Pro|Co-Deliver/);
});

test("the registration mark exists on disk and is a valid PNG", () => {
  const file = resolve(repositoryRoot, "public/brand/cvp-fourcolor-mark.png");
  assert.ok(existsSync(file));
  assert.equal(readFileSync(file).subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
});

test("variants: compact drops the wordmark, stacked keeps it; one mark per surface", () => {
  assert.match(componentSource, /variant !== "compact-mark"/);
  assert.equal(componentSource.match(/cvp-fourcolor-mark\.png/g)?.length, 1, "one registration mark reference");
});
