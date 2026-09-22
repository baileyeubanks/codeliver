import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
  resolve(
    repositoryRoot,
    "supabase/migrations/20260922052640_recipient_bound_review_admission.sql",
  ),
  "utf8",
);

test("recipient admission migration is a forward, fail-closed source artifact", () => {
  assert.match(
    migration,
    /source-only until compatibility preflight[\s\S]*explicit CCO-DB application approval/,
  );
  assert.match(
    migration,
    /DROP FUNCTION IF EXISTS co_production\.admit_review_invite\(text, uuid, text\);/,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION co_production\.admit_review_invite\([\s\S]*p_recipient_hash text/,
  );
  assert.match(migration, /recipient_required boolean/);
  assert.match(migration, /invite\.reviewer_email/);
  assert.match(
    migration,
    /p_recipient_hash IS DISTINCT FROM encode\([\s\S]*extensions\.digest\([\s\S]*lower\(btrim\(admitted_invite\.reviewer_email\)\)/,
  );
  assert.match(migration, /admission_status := 'recipient_required';/);

  const recipientGate = migration.indexOf("recipient_required :=");
  const admissionWrite = migration.indexOf(
    "INSERT INTO co_production.review_view_admissions",
  );
  const viewWrite = migration.indexOf(
    "UPDATE co_production.review_invites",
  );
  assert.ok(recipientGate >= 0);
  assert.ok(admissionWrite > recipientGate);
  assert.ok(viewWrite > recipientGate);

  assert.match(
    migration,
    /DROP FUNCTION IF EXISTS co_production\.authorize_review_media\(uuid, text\);/,
  );
  assert.match(
    migration,
    /CREATE FUNCTION co_production\.authorize_review_media\([\s\S]*reviewer_email text/,
  );
  assert.match(migration, /invite\.reviewer_email,/);
  assert.doesNotMatch(migration, /DROP FUNCTION[^;]*\bCASCADE\b/i);
});
