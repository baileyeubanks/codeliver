import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

test("projects page opens as a production library cockpit surface", () => {
  const projectsPage = source("app/(dashboard)/projects/page.tsx");

  assert.match(projectsPage, /Production library/);
  assert.match(projectsPage, /projectReadiness/);
  assert.match(projectsPage, /aria-label="Project readiness"/);
  assert.match(projectsPage, /aria-label="Production lifecycle"/);
  assert.match(projectsPage, /New workspace/);
  assert.match(projectsPage, /Open review/);
  assert.match(projectsPage, /Manage project media, review readiness, share links, versions, and delivery state/);
  assert.match(projectsPage, /Transcript, waveform, and export readiness appear after processing jobs report back/);
  assert.doesNotMatch(projectsPage, /rounded-xl/);
});

test("projects page keeps upload, share, and empty states route-backed and honest", () => {
  const projectsPage = source("app/(dashboard)/projects/page.tsx");

  assert.match(projectsPage, /primaryReviewHref/);
  assert.match(projectsPage, /href=\{`\/projects\/new\$\{demoSuffix\}`\}/);
  assert.match(projectsPage, /setShareOpen\(true\)/);
  assert.match(projectsPage, /Workspace name\.\.\./);
  assert.match(projectsPage, /Create workspace/);
  assert.match(projectsPage, /Upload media to start versioning, review, comments, approvals, and delivery/);
  assert.doesNotMatch(projectsPage, /AI cleanup complete/i);
  assert.doesNotMatch(projectsPage, /waveform generated/i);
  assert.doesNotMatch(projectsPage, /notification sent/i);
});

test("project toolbar does not expose unsupported folder or cloud-import actions as complete", () => {
  const toolbar = source("components/projects/ProjectToolbar.tsx");

  assert.match(toolbar, /New production workspace/);
  assert.match(toolbar, /New workspace/);
  assert.match(toolbar, /Cloud import not connected/);
  assert.match(toolbar, /aria-disabled="true"/);
  assert.doesNotMatch(toolbar, />\s*New Folder\s*</);
  assert.doesNotMatch(toolbar, />\s*Import from cloud\s*</);
});
