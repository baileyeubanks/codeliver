import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

const noise =
  /Video production workspace|Brief\s*→|Account access|Private account access|PORTAL|SESSION|RETURN|securityStatus|accessReadiness/;

test("VA-004/006/008 forgot password uses the quiet AuthShell", () => {
  const forgot = source("app/forgot-password/page.tsx");
  const shell = source("components/auth/AuthShell.tsx");

  assert.match(forgot, /<AuthShell\b/);
  assert.match(forgot, /Reset your password/);
  assert.match(forgot, /Back to sign in/);
  assert.match(forgot, /Send recovery link/);
  assert.match(forgot, /id="recovery-email"/);
  assert.doesNotMatch(forgot, noise);
  assert.doesNotMatch(shell, noise);
  assert.equal(shell.match(/<CoProductionBrand\b/g)?.length, 1);
});

test("VA-007 create account uses the quiet AuthShell", () => {
  const signup = source("app/signup/page.tsx");
  const shell = source("components/auth/AuthShell.tsx");

  assert.match(signup, /<AuthShell\b/);
  assert.match(signup, /Create your account/);
  assert.match(signup, /Create account/);
  assert.match(signup, /id="signup-email"/);
  assert.match(signup, /id="signup-password"/);
  assert.match(signup, /id="signup-confirm-password"/);
  assert.doesNotMatch(signup, noise);
  assert.doesNotMatch(shell, noise);
});
