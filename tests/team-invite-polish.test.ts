import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

test("team invite acceptance uses the polished auth shell and invitation readiness", () => {
  const invite = source("components/auth/TeamInviteAcceptance.tsx");
  const styles = source("components/auth/AuthShell.module.css");
  const route = source("app/invite/[token]/page.tsx");

  assert.match(route, /<TeamInviteAcceptance token=\{token\}/);
  assert.match(invite, /<AuthShell demoMode=\{false\} loginHref=\{loginHref\}>/);
  assert.match(invite, /aria-label="Invitation readiness"/);
  assert.match(invite, /Workspace/);
  assert.match(invite, /Role/);
  assert.match(invite, /Expires/);
  assert.match(invite, /formatInviteExpiry\(state\.invite\.expires_at\)/);
  assert.match(invite, /encodeURIComponent\(invitePath\)/);
  assert.match(invite, /Verifying team access/);
  assert.match(invite, /Workspace access confirmed/);
  assert.match(invite, /Invitation closed/);

  assert.match(styles, /\.loadingRow\s*\{[\s\S]*?border-radius:\s*8px/);
  assert.match(styles, /\.secondaryAction\s*\{[\s\S]*?border-radius:\s*7px/);
  assert.match(styles, /\.spinIcon\s*\{[\s\S]*?animation:\s*authSpin/);
  assert.doesNotMatch(invite, /rounded-xl|card wall|marketing|hero/i);
});

test("team invite decisions remain explicit and do not imply silent access changes", () => {
  const invite = source("components/auth/TeamInviteAcceptance.tsx");

  assert.match(invite, /body:\s*JSON\.stringify\(\{ token, action \}\)/);
  assert.match(invite, /This access change was not applied\./);
  assert.match(invite, /No team access was added\./);
  assert.match(invite, /type="button"[\s\S]*?onClick=\{\(\) => decide\("accept"\)\}/);
  assert.match(invite, /className=\{styles\.secondaryAction\}[\s\S]*?onClick=\{\(\) => decide\("decline"\)\}/);
  assert.match(invite, /if \(action === "accept"\) \{[\s\S]*?router\.replace\("\/projects"\)/);
  assert.doesNotMatch(invite, /if \(action === "decline"\) \{[\s\S]*?router\.replace/);
});
