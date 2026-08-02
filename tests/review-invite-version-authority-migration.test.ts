import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260715094026_review_invite_version_authority.sql",
    import.meta.url,
  ),
  "utf8",
);

test("legacy public review invites bind to the latest matching asset version", () => {
  assert.match(migration, /WITH latest_asset_versions AS \(/);
  assert.match(migration, /FROM public\.versions AS asset_version/);
  assert.match(
    migration,
    /ORDER BY[\s\S]*asset_version\.asset_id,[\s\S]*\(asset_version\.is_current IS TRUE\) DESC,[\s\S]*asset_version\.version_number DESC,[\s\S]*asset_version\.created_at DESC/,
  );
  assert.match(
    migration,
    /UPDATE public\.review_invites AS review_invite[\s\S]*SET version_id = latest_asset_version\.version_id[\s\S]*latest_asset_version\.asset_id = review_invite\.asset_id/,
  );
});

test("migration fails closed before applying NOT NULL when an invite cannot be backfilled", () => {
  const backfillIndex = migration.indexOf("UPDATE public.review_invites AS review_invite");
  const guardIndex = migration.indexOf("DO $public_review_invite_version_guard$");
  const constraintIndex = migration.indexOf("ALTER COLUMN version_id SET NOT NULL;");

  assert.ok(backfillIndex >= 0, "migration must backfill legacy rows");
  assert.ok(guardIndex > backfillIndex, "the fail-closed guard must follow the backfill");
  assert.ok(constraintIndex > guardIndex, "NOT NULL must follow the fail-closed guard");
  assert.match(migration, /WHERE review_invite\.version_id IS NULL/);
  assert.match(migration, /IF unresolved_count > 0 THEN[\s\S]*RAISE EXCEPTION USING/);
  assert.match(migration, /have no matching public\.versions row/);
});

test("public review invite versions are required and immutable", () => {
  assert.match(
    migration,
    /ALTER TABLE public\.review_invites\s+ALTER COLUMN version_id SET NOT NULL/,
  );
  assert.match(
    migration,
    /IF NEW\.version_id IS DISTINCT FROM OLD\.version_id THEN[\s\S]*version_id is immutable/,
  );
  assert.match(
    migration,
    /BEFORE UPDATE OF version_id ON public\.review_invites[\s\S]*EXECUTE FUNCTION public\.enforce_review_invite_version_immutable\(\)/,
  );
});

test("optional co-production authority preserves and verifies NOT NULL", () => {
  assert.match(
    migration,
    /to_regclass\('co_production\.review_invites'\)/,
  );
  assert.match(
    migration,
    /SELECT count\(\*\) FROM co_production\.review_invites WHERE version_id IS NULL/,
  );
  assert.match(
    migration,
    /ALTER TABLE co_production\.review_invites ALTER COLUMN version_id SET NOT NULL/,
  );
  assert.match(migration, /attribute\.attnotnull/);
  assert.doesNotMatch(migration, /ALTER COLUMN version_id DROP NOT NULL/);
});

test("optional co-production review invite versions are immutable", () => {
  const conditionalIndex = migration.indexOf("IF invite_relation IS NOT NULL THEN");
  const functionIndex = migration.indexOf(
    "CREATE OR REPLACE FUNCTION co_production_private.enforce_review_invite_version_immutable()",
  );
  const triggerIndex = migration.indexOf(
    "BEFORE UPDATE OF version_id ON co_production.review_invites",
  );
  const conditionalEndIndex = migration.indexOf(
    "$co_production_review_invite_version_guard$;",
    conditionalIndex,
  );

  assert.ok(conditionalIndex >= 0, "co-production enforcement must be conditional");
  assert.ok(functionIndex > conditionalIndex, "the function must be created inside the guard");
  assert.ok(triggerIndex > functionIndex, "the trigger must follow its function");
  assert.ok(
    conditionalEndIndex > triggerIndex,
    "the trigger must remain inside the table-existence guard",
  );

  const functionDefinition = migration.slice(functionIndex, triggerIndex);
  assert.match(functionDefinition, /SET search_path = ''/);
  assert.match(
    functionDefinition,
    /IF NEW\.version_id IS DISTINCT FROM OLD\.version_id THEN[\s\S]*co_production\.review_invites\.version_id is immutable/,
  );
  assert.match(
    functionDefinition,
    /REVOKE ALL ON FUNCTION co_production_private\.enforce_review_invite_version_immutable\(\) FROM PUBLIC, anon, authenticated/,
  );
  assert.match(
    functionDefinition,
    /GRANT EXECUTE ON FUNCTION co_production_private\.enforce_review_invite_version_immutable\(\) TO service_role/,
  );
  assert.match(
    migration,
    /BEFORE UPDATE OF version_id ON co_production\.review_invites[\s\S]*EXECUTE FUNCTION co_production_private\.enforce_review_invite_version_immutable\(\)/,
  );
});
