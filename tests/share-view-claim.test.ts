import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260715211000_share_link_claims.sql",
    import.meta.url,
  ),
  "utf8",
);

function executableSql(sql: string) {
  return sql.replace(/--.*$/gm, " ").replace(/\s+/g, " ").trim();
}

function claimFunction() {
  const start = migration.indexOf(
    "CREATE OR REPLACE FUNCTION co_production.claim_share_link_view(",
  );
  const end = migration.indexOf("$claim_share_link_view$;", start);
  assert.ok(start >= 0, "missing claim_share_link_view function");
  assert.ok(end > start, "claim_share_link_view function is unterminated");
  return migration.slice(start, end);
}

test("migration is additive, ordered, and preserves legacy link compatibility", () => {
  const sql = executableSql(migration);
  const preflight = migration.indexOf("DO $preflight$");
  const createClaims = migration.indexOf(
    "CREATE TABLE co_production.share_link_view_claims",
  );

  assert.match(sql, /^BEGIN;/);
  assert.match(sql, /COMMIT;$/);
  assert.ok(preflight > migration.indexOf("BEGIN;"));
  assert.ok(createClaims > preflight, "preflight must precede claim DDL");
  assert.match(migration, /to_regclass\('co_production\.review_invites'\)/);
  assert.match(migration, /attname = 'token_hash'/);
  assert.match(migration, /attname = 'active'[\s\S]*attribute\.attnotnull/);
  assert.match(migration, /attname = 'view_count'[\s\S]*attribute\.attnotnull/);
  for (const column of [
    "asset_id",
    "version_id",
    "expires_at",
    "last_viewed_at",
    "max_views",
  ]) {
    assert.match(migration, new RegExp(`\\('${column}'\\)`));
  }

  assert.doesNotMatch(
    sql,
    /(?:CREATE|ALTER|DROP|TRUNCATE|INSERT|UPDATE|DELETE)\s+(?:TABLE\s+)?public\./i,
  );
  assert.doesNotMatch(
    sql,
    /ALTER TABLE co_production\.review_invites/i,
    "existing invite rows and policy fields must remain compatible in place",
  );
});

test("claims are project-scoped and relationally bound to one invite asset", () => {
  const table = migration.match(
    /CREATE TABLE co_production\.share_link_view_claims \(([\s\S]*?)\n\);/,
  );
  assert.ok(table, "missing share_link_view_claims table");
  const definition = executableSql(table[1]);

  for (const column of [
    "project_id uuid NOT NULL",
    "asset_id uuid NOT NULL",
    "invite_id uuid NOT NULL",
    "request_id uuid NOT NULL",
    "resulting_view_count integer NOT NULL",
  ]) {
    assert.ok(definition.includes(column), `missing ${column}`);
  }

  assert.match(
    definition,
    /UNIQUE \(project_id, request_id\)/,
    "request retries must be idempotent within their tenant project",
  );
  assert.match(
    definition,
    /FOREIGN KEY \(asset_id, project_id\) REFERENCES co_production\.assets\(id, project_id\) ON DELETE CASCADE/,
  );
  assert.match(
    definition,
    /FOREIGN KEY \(invite_id, asset_id\) REFERENCES co_production\.review_invites\(id, asset_id\) ON DELETE CASCADE/,
  );
  assert.match(
    definition,
    /max_views_at_claim IS NULL OR resulting_view_count <= max_views_at_claim/,
  );
  assert.doesNotMatch(definition, /\btoken(?:_hash|_ciphertext)?\b/i);
});

test("claim decision locks the invite and enforces every policy before mutation", () => {
  const fn = claimFunction();
  const normalized = executableSql(fn);
  const lockIndex = fn.indexOf("FOR UPDATE OF invite");
  const replayIndex = fn.indexOf(
    "FROM co_production.share_link_view_claims AS claim",
  );
  const revokedIndex = fn.indexOf("IF NOT v_invite_active THEN");
  const expiryIndex = fn.indexOf(
    "IF v_expires_at IS NOT NULL AND v_expires_at <= v_claimed_at THEN",
  );
  const limitIndex = fn.indexOf(
    "IF v_max_views IS NOT NULL AND v_current_view_count >= v_max_views THEN",
  );
  const updateIndex = fn.indexOf("UPDATE co_production.review_invites AS invite");
  const insertIndex = fn.indexOf(
    "INSERT INTO co_production.share_link_view_claims",
  );

  assert.match(
    normalized,
    /p_token_hash IS NULL OR p_token_hash !~ '\^\[0-9a-f\]\{64\}\$'/,
  );
  assert.match(normalized, /WHERE invite\.token_hash = p_token_hash FOR UPDATE OF invite/);
  assert.ok(lockIndex >= 0);
  assert.ok(replayIndex > lockIndex, "replay lookup must follow the invite lock");
  assert.ok(revokedIndex > replayIndex, "a committed retry must replay before revocation checks");
  assert.ok(expiryIndex > revokedIndex);
  assert.ok(limitIndex > expiryIndex);
  assert.ok(updateIndex > limitIndex);
  assert.ok(insertIndex > updateIndex);

  assert.match(
    normalized,
    /AND invite\.active AND \(invite\.expires_at IS NULL OR invite\.expires_at > v_claimed_at\) AND \(invite\.max_views IS NULL OR invite\.view_count < invite\.max_views\)/,
    "the write must repeat every mutable policy predicate",
  );
  assert.match(normalized, /SET view_count = invite\.view_count \+ 1,/);
  assert.match(normalized, /last_viewed_at = v_claimed_at/);
  assert.match(normalized, /ERRCODE = '40001', MESSAGE = 'share_link_claim_state_changed'/);
});

test("request identity replays once and rejects rebinding to another link", () => {
  const fn = claimFunction();
  const normalized = executableSql(fn);

  assert.match(
    normalized,
    /WHERE claim\.project_id = v_project_id AND claim\.request_id = p_request_id/,
  );
  assert.match(
    normalized,
    /IF v_existing_invite_id IS DISTINCT FROM v_invite_id THEN RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'share_link_claim_request_conflict'/,
  );
  assert.match(normalized, /'status', 'claimed', 'replayed', true/);
  assert.match(normalized, /'status', 'claimed', 'replayed', false/);
  assert.match(
    normalized,
    /EXCEPTION WHEN unique_violation THEN[\s\S]*share_link_claim_request_conflict/,
    "a concurrent key collision must roll back its nested counter update",
  );

  for (const outcome of ["not_found", "revoked", "expired", "exhausted"] as const) {
    assert.match(normalized, new RegExp(`'status', '${outcome}'`));
  }
});

test("the RPC and ledger expose no plaintext bearer surface", () => {
  const fn = executableSql(claimFunction());

  assert.match(
    fn,
    /claim_share_link_view\( p_token_hash text, p_request_id uuid \)/,
  );
  assert.doesNotMatch(fn, /\bp_token\s+text\b/i);
  assert.doesNotMatch(fn, /invite\.token\b/i);
  assert.doesNotMatch(fn, /'token(?:_hash|_ciphertext)?'/i);
  assert.match(fn, /WHERE invite\.token_hash = p_token_hash/);
});

test("forced RLS and grants keep writes behind the service-only RPC", () => {
  const sql = executableSql(migration);

  assert.match(
    sql,
    /ALTER TABLE co_production\.share_link_view_claims ENABLE ROW LEVEL SECURITY;/,
  );
  assert.match(
    sql,
    /ALTER TABLE co_production\.share_link_view_claims FORCE ROW LEVEL SECURITY;/,
  );
  assert.match(
    sql,
    /CREATE POLICY share_link_view_claims_tenant_select ON co_production\.share_link_view_claims FOR SELECT TO authenticated USING \( co_production_private\.is_staff_surface\(\) AND co_production_private\.has_project_role\(project_id, 70\) \);/,
  );
  assert.match(
    sql,
    /REVOKE ALL ON TABLE co_production\.share_link_view_claims FROM PUBLIC, anon, authenticated, service_role;/,
  );
  assert.match(
    sql,
    /GRANT SELECT \( id, project_id, asset_id, invite_id, claimed_at, resulting_view_count, max_views_at_claim \) ON co_production\.share_link_view_claims TO authenticated;/,
  );
  assert.doesNotMatch(sql, /GRANT (?:INSERT|UPDATE|DELETE|ALL).*share_link_view_claims/i);

  assert.match(
    claimFunction(),
    /SECURITY DEFINER[\s\S]*SET search_path = ''[\s\S]*SET row_security = off/,
  );
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION co_production\.claim_share_link_view\(text, uuid\) FROM PUBLIC, anon, authenticated, service_role;/,
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION co_production\.claim_share_link_view\(text, uuid\) TO service_role;/,
  );
  assert.doesNotMatch(
    sql,
    /GRANT EXECUTE ON FUNCTION co_production\.claim_share_link_view\(text, uuid\) TO (?:anon|authenticated|PUBLIC)/,
  );
});

test("migration postflight executes privilege and RLS invariants", () => {
  const postflightStart = migration.indexOf("DO $postflight$");
  const postflightEnd = migration.indexOf("$postflight$;", postflightStart);
  assert.ok(postflightStart >= 0);
  assert.ok(postflightEnd > postflightStart);
  const postflight = migration.slice(postflightStart, postflightEnd);

  assert.match(postflight, /relation\.relrowsecurity, relation\.relforcerowsecurity/);
  assert.match(postflight, /has_table_privilege\(/);
  assert.match(postflight, /'service_role', claims_relation, 'SELECT'/);
  assert.match(postflight, /'service_role', claims_relation, 'TRUNCATE'/);
  assert.match(postflight, /has_column_privilege\(/);
  assert.match(postflight, /has_function_privilege\(/);
  assert.match(postflight, /attribute\.attname ~ 'token'/);
  assert.match(postflight, /RAISE EXCEPTION USING/g);
});
