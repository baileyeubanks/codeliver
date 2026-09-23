import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

test("CVP login is the ACS-quiet door: one mark, one card, Sign in", () => {
  const login = source("app/login/page.tsx");
  const authShell = source("components/auth/AuthShell.tsx");
  const quietStart = authShell.indexOf("if (quiet)");
  const loudStart = authShell.indexOf("const ContextIcon");
  assert.ok(quietStart !== -1 && loudStart > quietStart);
  const quietShell = authShell.slice(quietStart, loudStart);

  assert.match(login, /<AuthShell\b[^>]*\bquiet\b/);
  assert.match(login, /Open the cut that still needs a decision\./);
  assert.match(login, /Forgot password\?/);
  assert.match(login, /"Sign in"/);
  assert.match(login, /Signing in…/);
  assert.doesNotMatch(login, /Open local workspace/);
  assert.doesNotMatch(login, /Account access/);
  assert.doesNotMatch(login, /Review and approve/);
  assert.doesNotMatch(login, /<p>/);

  assert.match(quietShell, /data-quiet="true"/);
  assert.match(quietShell, /variant="compact-mark"/);
  assert.equal(quietShell.match(/<CoProductionBrand\b/g)?.length, 1);
  assert.doesNotMatch(quietShell, /Video production workspace/);
  assert.doesNotMatch(quietShell, /Access readiness/);
  assert.doesNotMatch(quietShell, /Private account access/);
  assert.doesNotMatch(quietShell, /securityStatus|accessStrip|tagline|Brief/);
});

test("quiet login chrome is brand blue; green, yellow, and red stay on status", () => {
  const authStyles = source("components/auth/AuthShell.module.css");
  const quietCss = authStyles.slice(authStyles.indexOf(".shell[data-quiet=\"true\"]"));
  assert.match(quietCss, /--auth-accent-soft/);
  assert.match(quietCss, /--auth-accent/);
  assert.doesNotMatch(quietCss, /--auth-positive|--auth-danger|#267553|#b23a2c|#f59e0b|#16a34a|#e8442e/i);
  assert.match(authStyles, /\.alert\s*\{[\s\S]*?--auth-danger/);
  assert.match(authStyles, /\.notice\s*\{[\s\S]*?--auth-positive/);
});
