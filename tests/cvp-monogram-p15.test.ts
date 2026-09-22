import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(resolve(repositoryRoot, path))).digest("hex");
}

test("the retired colorful CVP monogram is absent from product source", () => {
  assert.equal(existsSync(resolve(repositoryRoot, "components/navigation/CvpMonogram.tsx")), false);
  assert.equal(existsSync(resolve(repositoryRoot, "app/icon.svg")), false);
});

test("the workspace shell owns the supplied brand without duplicating it in the rail", () => {
  const rail = source("components/navigation/WorkspaceRail.tsx");
  const shell = source("components/Shell.tsx");
  assert.match(shell, /<CoProductionBrand\b/);
  assert.match(rail, /aria-label="Workspace rail"/);
  assert.doesNotMatch(rail, /<CvpMonogram\b|<CoProductionBrand\b|styles\.brandHeader/);
});

test("the auth shell brand hero uses the supplied compact CVP mark", () => {
  const authShell = source("components/auth/AuthShell.tsx");
  assert.match(authShell, /<CoProductionBrand variant="compact-mark"/);
  assert.doesNotMatch(authShell, /<CvpMonogram\b/);
  assert.match(authShell, /Brief/);
  assert.match(authShell, /shoot/);
  assert.match(authShell, /delivery/);
});

test("the application icon is the exact supplied sapphire artwork", () => {
  const icon = resolve(repositoryRoot, "app/icon.png");
  assert.ok(existsSync(icon));
  assert.equal(readFileSync(icon).subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(sha256("app/icon.png"), sha256("public/brand/cvp-sapphire-mark.png"));
});

test("welcome keeps a branded public entry without fixture media", () => {
  const welcome = source("app/welcome/page.tsx");
  assert.match(welcome, /<CoProductionBrand\b/);
  assert.doesNotMatch(welcome, /ica-ceo-preview\.mp4|ica-review-filmstrip\.jpg/);
  assert.match(welcome, /Request access/);
  assert.doesNotMatch(welcome, /demo=1/);
});
