import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("authenticated storage readiness exposes revisions only after the database capability probe passes", () => {
  const route = readFileSync(
    resolve(root, "app/api/storage/readiness/route.ts"),
    "utf8",
  );

  assert.match(route, /rpc\(\s*"revision_upload_capability",?\s*\)/);
  assert.match(route, /features:\s*\{[\s\S]*revisionUploads/);
  assert.match(route, /readiness\.readyForWrites/);
  assert.match(route, /CO_PRODUCTION_DATA_SCHEMA/);
  assert.match(route, /capability\.error\s*===\s*null/);
  assert.match(route, /capability\.data\s*===\s*true/);
});

test("revision migration publishes a service-only read probe and rollback remains additive-safe", () => {
  const migration = readFileSync(
    resolve(
      root,
      "supabase/migrations/20260922055310_attach_committed_upload_revision.sql",
    ),
    "utf8",
  );

  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION co_production\.revision_upload_capability\(\)/,
  );
  assert.match(migration, /to_regprocedure\([\s\S]*attach_committed_upload_revision/);
  assert.match(migration, /has_function_privilege\([\s\S]*current_user/);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION co_production\.revision_upload_capability\(\)[\s\S]*FROM PUBLIC, anon, authenticated/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION co_production\.revision_upload_capability\(\)[\s\S]*TO service_role/,
  );
});

test("disposable qualification bootstraps the minimum catalog and runs every race as service_role", () => {
  const fixture = readFileSync(
    resolve(root, "scripts/verify-production-revision-publication-local.sh"),
    "utf8",
  );

  assert.match(fixture, /CVP_LOCAL_ADMIN_DATABASE_URL/);
  assert.match(fixture, /CVP_LOCAL_SERVICE_DATABASE_URL/);
  assert.match(fixture, /service_role/);
  for (const caseName of [
    "revision-first",
    "lock-first",
    "multi-row",
    "rollback",
    "unsupported-isolation",
  ]) {
    assert.match(fixture, new RegExp(caseName));
  }
  assert.match(
    fixture,
    /20260922055310_attach_committed_upload_revision\.sql/,
  );
  assert.doesNotMatch(fixture, /set -x|echo .*DATABASE_URL/);
});

test("production migration preflight is read-only and checks every required authority", () => {
  const preflight = readFileSync(
    resolve(root, "scripts/preflight-production-revision-upload.sql"),
    "utf8",
  );

  assert.match(preflight, /BEGIN TRANSACTION READ ONLY/);
  assert.match(preflight, /co_production\.assets/);
  assert.match(preflight, /co_production\.versions/);
  assert.match(preflight, /co_production\.deliverables/);
  assert.match(preflight, /co_production\.deliverable_items/);
  assert.match(preflight, /versions_source_upload_unique_idx/);
  assert.match(preflight, /versions_storage_object_unique_idx/);
  assert.match(preflight, /previous_version_id/);
  assert.match(preflight, /revision_upload_capability/);
  assert.match(preflight, /pgrst\.db_schemas/);
  assert.doesNotMatch(
    preflight,
    /^\s*(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b/im,
  );
});

test("schema rollback refuses to erase landed revision lineage", () => {
  const rollback = readFileSync(
    resolve(root, "scripts/rollback-production-revision-upload.sql"),
    "utf8",
  );

  assert.match(rollback, /BEGIN/);
  assert.match(rollback, /previous_version_id IS NOT NULL/);
  assert.match(rollback, /RAISE EXCEPTION/);
  assert.match(rollback, /DROP TRIGGER IF EXISTS deliverable_items_a_publication_guard/);
  assert.match(rollback, /DROP TRIGGER IF EXISTS deliverables_a_publication_guard/);
  assert.match(rollback, /DROP FUNCTION IF EXISTS co_production\.revision_upload_capability/);
  assert.match(rollback, /DROP FUNCTION IF EXISTS co_production\.attach_committed_upload_revision/);
  assert.match(rollback, /DROP COLUMN IF EXISTS previous_version_id/);
  assert.match(rollback, /COMMIT/);
});
