import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

test("CVP login passes the ACS quiet door grade", () => {
  const login = source("app/login/page.tsx");
  const authShell = source("components/auth/AuthShell.tsx");

  assert.match(login, /Open the cut that still needs a decision\./);
  assert.match(login, /id="login-email"/);
  assert.match(login, /id="login-password"/);
  assert.match(login, /id="auth-form"/);
  assert.match(login, /Forgot password\?/);
  assert.match(login, /"Sign in"/);
  assert.match(login, /Signing in…/);
  assert.doesNotMatch(login, /Request access|Create an account|Privacy|Terms/);
  assert.match(
    login,
    /setSurfaceMismatch\(resolveSurfaceMismatchNotice\(mismatchSearch\)\)/,
  );
  assert.doesNotMatch(login, /Open local workspace|Account access|Review and approve/);

  assert.match(authShell, /data-quiet="true"/);
  assert.match(authShell, /<CoProductionBrand\b/);
  assert.equal(authShell.match(/<CoProductionBrand\b/g)?.length, 1);
  assert.doesNotMatch(
    authShell,
    /Video production workspace|Access readiness|Private account access|securityStatus|accessStrip|tagline|Brief|Portal|Session|brandRail|brandStory/,
  );
});

test("A9 brand chrome is blue, status color stays on status, type stays plain", () => {
  const authStyles = source("components/auth/AuthShell.module.css");
  const login = source("app/login/page.tsx");
  const resting = authStyles
    .replace(/--auth-(?:positive|warn|danger):[^;]+;/g, "")
    .replace(/\.notice\s*\{[\s\S]*?\n\}/g, "")
    .replace(/\.warn\s*\{[\s\S]*?\n\}/g, "")
    .replace(/\.alert\s*\{[\s\S]*?\n\}/g, "")
    .replace(/\.input\[aria-invalid="true"\]\s*\{[\s\S]*?\n\}/g, "")
    .replace(/\.successIcon\s*\{[\s\S]*?\n\}/g, "")
    .replace(/\.successKicker\s*\{[\s\S]*?\n\}/g, "")
    .replace(/\[data-state="complete"\][\s\S]*?\n\}/g, "");

  assert.match(authStyles, /background:\s*var\(--auth-bg\)/);
  assert.doesNotMatch(authStyles, /linear-gradient/);
  assert.match(authStyles, /font-family:\s*var\(--font-body,\s*Inter/);
  assert.doesNotMatch(authStyles, /font-display|Playfair|Georgia|cursive|fantasy/);
  assert.match(authStyles, /--auth-accent:\s*var\(--cvp-blue/);
  assert.match(authStyles, /--auth-positive:\s*var\(--cvp-success/);
  assert.match(authStyles, /--auth-warn:\s*var\(--cvp-amber/);
  assert.match(authStyles, /--auth-danger:\s*var\(--cvp-red/);
  assert.match(authStyles, /\.heading h1,[\s\S]*?color:\s*var\(--auth-accent\)/);
  assert.match(authStyles, /\.submit\s*\{[\s\S]*?background:\s*var\(--auth-accent\)/);
  assert.match(authStyles, /\.quietLink\s*\{[\s\S]*?color:\s*var\(--auth-accent\)/);
  assert.match(authStyles, /\.notice\s*\{[\s\S]*?--auth-positive/);
  assert.match(authStyles, /\.warn\s*\{[\s\S]*?--auth-warn/);
  assert.match(authStyles, /\.alert\s*\{[\s\S]*?--auth-danger/);
  assert.doesNotMatch(
    resting,
    /--auth-positive|--auth-warn|--auth-danger|--cvp-success|--cvp-amber|--cvp-red|#16a34a|#f59e0b|#dc2626|#22c55e|#ecfdf5|#fffbeb|#fef2f2|#e5f6ec|#92400e/,
  );
  assert.doesNotMatch(login, /#16a34a|#f59e0b|#dc2626|#e8442e|#267553/);
  assert.doesNotMatch(login, /Start a free trial|Get started|logo wall|Captions/);
});
