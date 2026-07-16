import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260715024552_versioned_edit_decisions.sql", import.meta.url),
  "utf8",
);

test("edit decisions are version-bound, idempotent, and protected by RLS", () => {
  assert.match(migration, /version_id uuid NOT NULL REFERENCES versions\(id\)/);
  assert.match(migration, /UNIQUE \(version_id, client_request_id\)/);
  assert.match(migration, /ALTER TABLE edit_decisions ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /TO authenticated/);
  assert.match(migration, /projects\.owner_id = \(SELECT auth\.uid\(\)\)/);
  assert.match(migration, /REVOKE ALL ON TABLE edit_decisions FROM anon/);
});

test("legacy public review policies are removed in favor of token-aware server routes", () => {
  assert.match(migration, /DROP POLICY IF EXISTS "Invites public by token"/);
  assert.match(migration, /DROP POLICY IF EXISTS "Comments insertable by anyone"/);
  assert.match(migration, /REVOKE ALL ON TABLE review_invites FROM anon/);
  assert.match(migration, /REVOKE ALL ON TABLE comments FROM anon/);
});

test("review links and comments are backfilled onto explicit versions", () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS version_id uuid REFERENCES versions\(id\)/);
  assert.match(migration, /UPDATE review_invites[\s\S]*WHERE review_invites\.version_id IS NULL/);
  assert.match(migration, /UPDATE comments[\s\S]*WHERE comments\.version_id IS NULL/);
});
