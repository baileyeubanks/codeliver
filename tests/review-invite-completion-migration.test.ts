import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260716143000_review_invite_completion_authority.sql",
    import.meta.url,
  ),
  "utf8",
);

function functionSource(qualifiedName: string) {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION ${qualifiedName}(`);
  assert.notEqual(start, -1, `missing function ${qualifiedName}`);
  const end = migration.indexOf("\n$complete_review_invite$;", start);
  assert.notEqual(end, -1, `unterminated function ${qualifiedName}`);
  return migration.slice(start, end + "\n$complete_review_invite$;".length);
}

test("review completion has one durable record per invite in both data authorities", () => {
  for (const schema of ["public", "co_production"]) {
    assert.match(
      migration,
      new RegExp(`CREATE TABLE IF NOT EXISTS ${schema}\\.review_invite_completions`),
    );
    assert.match(
      migration,
      new RegExp(`${schema.replace("_", "_")}[^]*?UNIQUE \\(review_invite_id\\)`),
    );
    assert.match(
      migration,
      new RegExp(`ALTER TABLE ${schema}\\.review_invite_completions ENABLE ROW LEVEL SECURITY`),
    );
    assert.match(
      migration,
      new RegExp(`REVOKE ALL ON TABLE ${schema}\\.review_invite_completions FROM PUBLIC, anon, authenticated`),
    );
  }

  assert.match(
    migration,
    /FOREIGN KEY \(version_id, asset_id\)[\s\S]*?REFERENCES public\.versions\(id, asset_id\)[\s\S]*?ON DELETE RESTRICT/,
  );
  assert.match(
    migration,
    /FOREIGN KEY \(review_invite_id, asset_id\)[\s\S]*?REFERENCES co_production\.review_invites\(id, asset_id\)[\s\S]*?ON DELETE RESTRICT/,
  );
  assert.match(
    migration,
    /FOREIGN KEY \(version_id, asset_id\)[\s\S]*?REFERENCES co_production\.versions\(id, asset_id\)[\s\S]*?ON DELETE RESTRICT/,
  );
});

test("completion RPCs lock and validate the exact invite, asset, and version", () => {
  for (const qualifiedName of [
    "public.complete_review_invite",
    "co_production.complete_review_invite",
  ]) {
    const source = functionSource(qualifiedName);
    assert.match(source, /SECURITY DEFINER[\s\S]*?SET search_path = ''/);
    assert.match(source, /auth\.role\(\)[\s\S]*?'service_role'/);
    assert.match(source, /FOR UPDATE OF review_invite/);
    assert.match(
      source,
      /v_invite_asset_id IS DISTINCT FROM p_asset_id[\s\S]*?v_invite_version_id IS DISTINCT FROM p_version_id/,
    );
    assert.match(source, /v_permissions NOT IN \('comment', 'approve'\)/);
    assert.match(source, /v_invite_email/);
    assert.match(source, /v_expires_at IS NOT NULL AND v_expires_at <= now\(\)/);
  }
});

test("completion is idempotent and emits one versioned activity receipt only for a new record", () => {
  for (const qualifiedName of [
    "public.complete_review_invite",
    "co_production.complete_review_invite",
  ]) {
    const source = functionSource(qualifiedName);
    assert.match(source, /ON CONFLICT \(review_invite_id\) DO NOTHING/);
    const insertIndex = source.indexOf("INSERT INTO");
    const activityIndex = source.indexOf("INSERT INTO", insertIndex + 1);
    const foundIndex = source.indexOf("IF FOUND THEN", insertIndex);
    assert.ok(foundIndex > insertIndex, `${qualifiedName} must branch on the insert result`);
    assert.ok(activityIndex > foundIndex, `${qualifiedName} must only log after a new completion`);
    assert.match(source, /'review_completed'/);
    assert.match(source, /'version_id', p_version_id/);
    assert.match(source, /'review_invite_id', p_review_invite_id/);
    assert.match(source, /v_completion\.version_id IS DISTINCT FROM p_version_id/);
  }
});

test("completion never mutates workflow state, asset status, or historical review rows", () => {
  assert.doesNotMatch(
    migration,
    /UPDATE\s+(?:public\.|co_production\.)?(?:approvals|approval_workflows|assets|review_invites)\b/i,
  );
  assert.doesNotMatch(migration, /DELETE\s+FROM\s+(?:public\.|co_production\.)?comments\b/i);
  assert.match(migration, /(?:^|\n)BEGIN;[\s\S]*COMMIT;\s*$/);
});
