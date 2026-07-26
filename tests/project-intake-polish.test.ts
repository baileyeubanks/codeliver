import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

test("project intake stays focused on the four fields needed to open a workspace", () => {
  const newProjectPage = source("app/(dashboard)/projects/new/page.tsx");

  assert.match(newProjectPage, /Project intake/);
  assert.match(newProjectPage, /New production workspace/);
  assert.match(newProjectPage, /Workspace details/);
  assert.match(newProjectPage, /Project name/);
  assert.match(newProjectPage, /Client \/ company/);
  assert.match(newProjectPage, /Brief/);
  assert.match(newProjectPage, /Business context/);
  assert.match(newProjectPage, /Create workspace/);
  assert.match(newProjectPage, /Cancel/);
  assert.doesNotMatch(newProjectPage, /intakePath/);
  assert.doesNotMatch(newProjectPage, /frontOfficeReadiness/);
  assert.doesNotMatch(newProjectPage, /readinessStrip/);
  assert.doesNotMatch(newProjectPage, /What happens next/);
  assert.doesNotMatch(newProjectPage, /value: "Live"/);
  assert.doesNotMatch(newProjectPage, /value: "Payload"/);
  assert.doesNotMatch(newProjectPage, /value: "Gated"/);
  assert.doesNotMatch(newProjectPage, /value: "Planned"/);
  assert.doesNotMatch(newProjectPage, /rounded-xl/);
});

test("project intake validates the workspace contract before routing", () => {
  const newProjectPage = source("app/(dashboard)/projects/new/page.tsx");

  assert.match(newProjectPage, /Project name is required before a workspace can be created/);
  assert.match(newProjectPage, /String\(fd\.get\("name"\) \?\? ""\)\.trim\(\)/);
  assert.match(newProjectPage, /String\(fd\.get\("description"\) \?\? ""\)\.trim\(\)/);
  assert.match(newProjectPage, /String\(fd\.get\("clientName"\) \?\? ""\)\.trim\(\)/);
  assert.match(newProjectPage, /String\(fd\.get\("businessContext"\) \?\? ""\)\.trim\(\)/);
  assert.match(newProjectPage, /descriptionPayload/);
  assert.match(newProjectPage, /Client \/ company/);
  assert.match(newProjectPage, /Business context/);
  assert.match(newProjectPage, /Creating workspace\.\.\./);
  assert.match(newProjectPage, /These details become the starting project record/);
  assert.doesNotMatch(newProjectPage, /Activity trail/);
  assert.doesNotMatch(newProjectPage, /readiness-gated/);
  assert.doesNotMatch(newProjectPage, /AI cleanup complete/i);
  assert.doesNotMatch(newProjectPage, /waveform generated/i);
  assert.doesNotMatch(newProjectPage, /notification sent/i);
  assert.doesNotMatch(newProjectPage, /payment received/i);
  assert.doesNotMatch(newProjectPage, /contract signed/i);
  assert.doesNotMatch(newProjectPage, /deposit paid/i);
});
