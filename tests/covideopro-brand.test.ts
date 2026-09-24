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

test("the Co‑VideoPro lockup renders one supplied transparent ribbon", () => {
  assert.match(componentSource, /const DEFAULT_LABEL = "Co‑VideoPro by Content Co-op"/);
  assert.match(componentSource, /role="img"/);
  assert.match(componentSource, /aria-label=\{label\}/);
  assert.match(componentSource, /by Content Co-op/);
  assert.match(componentSource, /src="\/brand\/cvp-ribbon-transparent\.png"/);
  assert.match(componentSource, /unoptimized/);
  assert.doesNotMatch(componentSource, /cvp-sapphire-mark\.png/);
  assert.doesNotMatch(componentSource, /Co-Production Pro|Co-Deliver/);
});

test("the login ribbon is a padded transparent PNG", () => {
  const file = resolve(repositoryRoot, "public/brand/cvp-ribbon-transparent.png");
  assert.ok(existsSync(file));
  const bytes = readFileSync(file);
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(bytes.subarray(12, 16).toString("ascii"), "IHDR");
  assert.equal(bytes.readUInt32BE(16), 965);
  assert.equal(bytes.readUInt32BE(20), 534);
  assert.equal(bytes[24], 8, "8-bit depth");
  assert.equal(bytes[25], 6, "RGBA so the page shows through the ribbon");
});

test("variants share one supplied source artwork", () => {
  assert.equal(componentSource.match(/cvp-ribbon-transparent\.png/g)?.length, 1, "one registration mark reference");
});

test("brand layout contains the ribbon and does not crop it", () => {
  const css = readFileSync(resolve(repositoryRoot, "components/brand/CoProductionBrand.module.css"), "utf8");
  const authCss = readFileSync(resolve(repositoryRoot, "components/auth/AuthShell.module.css"), "utf8");
  assert.match(css, /object-fit:\s*contain/);
  assert.match(css, /background:\s*transparent/);
  assert.match(css, /overflow:\s*visible/);
  assert.match(css, /height:\s*auto/);
  assert.doesNotMatch(css, /overflow:\s*hidden/);
  assert.doesNotMatch(css, /height:\s*114px/);
  assert.doesNotMatch(css, /background:\s*(?:#fff|#ffffff|white)\b/i);
  assert.match(authCss, /\.column \.brandLockup img[\s\S]*?object-fit:\s*contain/);
  assert.match(authCss, /\.column \.brandLockup img[\s\S]*?height:\s*auto/);
  assert.match(authCss, /\.column \.brandLockup img[\s\S]*?max-height:\s*none/);
  assert.match(authCss, /\.column \.brandLockup img[\s\S]*?background:\s*transparent/);
  assert.match(authCss, /\.column \.brandLockup[\s\S]*?overflow:\s*visible/);
  assert.match(authCss, /\.column \.brandLockup[\s\S]*?padding:\s*16px 12px 6px/);
});
