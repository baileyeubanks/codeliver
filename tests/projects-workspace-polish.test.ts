import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

test("projects page keeps a single project index instead of duplicating review and media queues", () => {
  const projectsPage = source("app/(dashboard)/projects/page.tsx");

  assert.match(projectsPage, /<h1>Projects<\/h1>/);
  assert.match(projectsPage, /data-testid="project-list"/);
  assert.match(projectsPage, /Open project/);
  assert.doesNotMatch(projectsPage, /Review queue/);
  assert.doesNotMatch(projectsPage, /Recent media/);
  assert.doesNotMatch(projectsPage, /projectReadiness/);
  assert.doesNotMatch(projectsPage, /aria-label="Production lifecycle"/);
  assert.doesNotMatch(projectsPage, /rounded-xl/);
});

test("projects page keeps async states and asset navigation route-backed and honest", () => {
  const projectsPage = source("app/(dashboard)/projects/page.tsx");

  assert.doesNotMatch(projectsPage, /canonicalProjectId/);
  assert.doesNotMatch(projectsPage, /<AssetUpload/);
  assert.match(projectsPage, /href=\{`\/projects\/new\$\{demoSuffix\}`\}/);
  assert.doesNotMatch(projectsPage, /\/assets\/\$\{encodeURIComponent\(asset\.id\)\}/);
  assert.match(projectsPage, /data-projects-state="error"/);
  assert.match(projectsPage, /data-projects-state="empty"/);
  assert.match(projectsPage, /Projects unavailable/);
  assert.match(projectsPage, /Create your first project/);
  assert.match(projectsPage, /Retry/);
  assert.doesNotMatch(projectsPage, /AI cleanup complete/i);
  assert.doesNotMatch(projectsPage, /waveform generated/i);
  assert.doesNotMatch(projectsPage, /notification sent/i);
});

test("project toolbar exposes only real actions — no placeholder or disabled controls", () => {
  const toolbar = source("components/projects/ProjectToolbar.tsx");

  assert.match(toolbar, /New production workspace/);
  assert.match(toolbar, /New workspace/);
  assert.doesNotMatch(toolbar, /Cloud import/);
  assert.doesNotMatch(toolbar, /Batch actions/);
  assert.doesNotMatch(toolbar, /aria-disabled="true"/);
  assert.doesNotMatch(toolbar, />\s*New Folder\s*</);
  assert.doesNotMatch(toolbar, />\s*Import from cloud\s*</);
});
