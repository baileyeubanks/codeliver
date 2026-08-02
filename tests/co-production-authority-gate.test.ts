import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const gate = readFileSync(
  resolve(
    repositoryRoot,
    "docs/reality/co-production-data-authority-gate-2026-07-15.md",
  ),
  "utf8",
);

test("the production authority gate remains explicitly fail closed", () => {
  assert.match(gate, /FAIL CLOSED - NOT APPROVED FOR PRODUCTION DATA OR TRAFFIC/);
  assert.match(gate, /migration[^\n]+is unapplied/i);
  assert.match(gate, /No remote SQL was executed/i);
  assert.match(gate, /public `contentco-op\.com` site[^\n]+must remain untouched/i);
});

test("the gate separates source proof from database and launch proof", () => {
  assert.match(gate, /source and local-test evidence only/i);
  assert.match(gate, /tenant-impersonation/i);
  assert.match(gate, /staging migration apply and rollback receipts/i);
  assert.match(gate, /direct database\/API evidence/i);
  assert.match(gate, /clean-tree manifest/i);
});

test("production writes require ordered staging and separate approvals", () => {
  assert.match(gate, /Every item is mandatory and sequential/i);
  assert.match(gate, /three separate writes and approvals/i);
  assert.match(gate, /leaving `contentco-op\.com` unchanged/i);
  assert.match(gate, /must not be applied to production as an experiment/i);
});
