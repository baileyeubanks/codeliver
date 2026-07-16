import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function source(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

test("project intake reads as the first step of the production workflow", () => {
  const newProjectPage = source("app/(dashboard)/projects/new/page.tsx");

  assert.match(newProjectPage, /Project intake/);
  assert.match(newProjectPage, /New production workspace/);
  assert.match(newProjectPage, /intakePath/);
  assert.match(newProjectPage, /Client intake/);
  assert.match(newProjectPage, /readinessStrip/);
  assert.match(newProjectPage, /Intake readiness/);
  assert.match(newProjectPage, /Billing authority/);
  assert.match(newProjectPage, /No payment state claimed/);
  assert.match(newProjectPage, /Setup path/);
  assert.match(newProjectPage, /What happens next/);
  assert.match(newProjectPage, /Front-office readiness/);
  assert.match(newProjectPage, /Upload media/);
  assert.match(newProjectPage, /Review link/);
  assert.match(newProjectPage, /Delivery trail/);
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
  assert.match(newProjectPage, /Activity trail/);
  assert.match(
    newProjectPage,
    /CRM, contracts, signatures, invoices,[\s\S]*deposits, payments, and expenses remain readiness-gated/,
  );
  assert.match(newProjectPage, /No money state is marked received until billing authority exists/);
  assert.doesNotMatch(newProjectPage, /AI cleanup complete/i);
  assert.doesNotMatch(newProjectPage, /waveform generated/i);
  assert.doesNotMatch(newProjectPage, /notification sent/i);
  assert.doesNotMatch(newProjectPage, /payment received/i);
  assert.doesNotMatch(newProjectPage, /contract signed/i);
  assert.doesNotMatch(newProjectPage, /deposit paid/i);
});
