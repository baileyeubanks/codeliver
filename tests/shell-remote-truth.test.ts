import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const shellSource = readFileSync(resolve(repositoryRoot, "components/Shell.tsx"), "utf8");
const sessionRouteSource = readFileSync(
  resolve(repositoryRoot, "app/api/auth/session/route.ts"),
  "utf8",
);

test("the remote shell derives identity from the session, never a hard-coded person", () => {
  assert.doesNotMatch(shellSource, /Bailey Eubanks/);
  assert.doesNotMatch(shellSource, /bailey@contentco-op\.com/);
  assert.match(shellSource, /fetch\("\/api\/auth\/session", \{ cache: "no-store"/);
  assert.match(shellSource, /remoteSession\?\.displayName \?\? remoteSession\?\.email \?\? "Workspace member"/);
});

test("the remote shell role fails closed to viewer until the session resolves", () => {
  assert.match(shellSource, /: \(remoteSession\?\.role \?\? "viewer"\)/);
  assert.match(shellSource, /demoWorkspace\.session\.role \?\? "owner"/);
  assert.match(shellSource, /WORKSPACE_ROLES\.includes\(value as WorkspaceRole\) \? \(value as WorkspaceRole\) : "viewer"/);
});

test("the session route maps provisioned auth roles onto workspace roles fail-closed", () => {
  assert.match(sessionRouteSource, /resolveProvisionedRole/);
  assert.match(sessionRouteSource, /staff: "owner"/);
  assert.match(sessionRouteSource, /client: "viewer"/);
  assert.match(sessionRouteSource, /workspace_role: provisioned \? [^\n]+ : "viewer"/);
  assert.match(sessionRouteSource, /state: provisioned \? "provisioned" : "pending"/);
  assert.match(sessionRouteSource, /display_name/);
});

test("remote notifications come from the notifications API, not the demo store", () => {
  assert.match(shellSource, /fetch\("\/api\/notifications\?limit=3", \{ cache: "no-store"/);
  assert.match(shellSource, /\{demoSuffix \? \(/);
  assert.match(shellSource, /remoteNotifications\.map\(/);
  assert.match(shellSource, /remoteNotifications\.length === 0 \? <p>No new notifications\.<\/p> : null/);
});
