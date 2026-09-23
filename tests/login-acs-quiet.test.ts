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

  assert.match(login, /Open the cut that still needs a decision\./);
  assert.match(login, /id="login-email"/);
  assert.match(login, /id="login-password"/);
  assert.match(login, /id="auth-form"/);
  assert.match(login, /Forgot password\?/);
  assert.match(login, /"Sign in"/);
  assert.match(login, /Signing in…/);
  assert.doesNotMatch(login, /Request access|Create an account/);
  assert.match(
    login,
    /setSurfaceMismatch\(resolveSurfaceMismatchNotice\(mismatchSearch\)\)/,
  );
  assert.doesNotMatch(login, /Open local workspace/);
  assert.doesNotMatch(login, /Account access/);
  assert.doesNotMatch(login, /Review and approve/);
  assert.doesNotMatch(login, /Privacy|Terms/);

  assert.match(authShell, /data-quiet="true"/);
  assert.match(authShell, /<CoProductionBrand\b/);
  assert.equal(authShell.match(/<CoProductionBrand\b/g)?.length, 1);
  assert.doesNotMatch(
    authShell,
    /Video production workspace|Access readiness|Private account access|securityStatus|accessStrip|tagline|Brief|Portal|Session/,
  );
});

test("quiet login chrome is brand blue; green, yellow, and red stay on status", () => {
  const authStyles = source("components/auth/AuthShell.module.css");
  const login = source("app/login/page.tsx");

  assert.match(authStyles, /--auth-accent:\s*var\(--cvp-blue/);
  assert.match(authStyles, /--auth-positive:\s*var\(--cvp-success/);
  assert.match(authStyles, /--auth-warn:\s*var\(--cvp-amber/);
  assert.match(authStyles, /--auth-danger:\s*var\(--cvp-red/);
  assert.match(authStyles, /\.heading h1,[\s\S]*?color:\s*var\(--auth-accent\)/);
  assert.match(authStyles, /\.heading h1,[\s\S]*?font-family:\s*inherit/);
  assert.match(authStyles, /\.heading h1,[\s\S]*?letter-spacing:\s*0/);
  assert.match(authStyles, /\.quietLink\s*\{[\s\S]*?color:\s*var\(--auth-accent\)/);
  assert.match(
    authStyles,
    /\.shell\s*\{[\s\S]*?font-family:\s*var\(--cvp-font-body,\s*ui-sans-serif\),\s*system-ui,\s*sans-serif/,
  );
  assert.doesNotMatch(authStyles, /--font-display|Georgia|Times New Roman|Newsreader|Fraunces/);
  assert.match(authStyles, /\.notice\s*\{[\s\S]*?--auth-positive/);
  assert.match(authStyles, /\.warn\s*\{[\s\S]*?--auth-warn/);
  assert.match(authStyles, /\.alert\s*\{[\s\S]*?--auth-danger/);
  assert.doesNotMatch(login, /#16a34a|#f59e0b|#dc2626|#e8442e|#267553/);
});

test("forgot and create use the quiet shell with no portal chips or private footer", () => {
  const authShell = source("components/auth/AuthShell.tsx");
  const forgot = source("app/forgot-password/page.tsx");
  const signup = source("app/signup/page.tsx");
  const stripped = /Video production workspace|Private account access|Account access|Access readiness|Brief[\s\S]{0,80}delivery/;

  assert.match(forgot, /<AuthShell\b/);
  assert.match(signup, /<AuthShell\b/);
  assert.doesNotMatch(authShell, stripped);
  assert.doesNotMatch(forgot, stripped);
  assert.doesNotMatch(signup, stripped);
  assert.doesNotMatch(authShell, />\s*Portal\s*</);
  assert.doesNotMatch(authShell, />\s*Session\s*</);
  assert.doesNotMatch(authShell, />\s*Return\s*</);
});
