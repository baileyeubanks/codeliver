import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "..");
const migration = readFileSync(
  resolve(
    repositoryRoot,
    "supabase/migrations/20260716002000_project_operating_source_projection.sql",
  ),
  "utf8",
);

test("operating source projection remains project-scoped and read-only", () => {
  assert.match(
    migration,
    /CREATE VIEW co_production\.project_operating_sources[\s\S]*security_invoker = true/,
  );
  assert.match(
    migration,
    /WHERE co_production_private\.has_project_role\(receipt\.project_id, 10\)/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON TABLE co_production\.project_operating_sources[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
  );
  assert.match(
    migration,
    /GRANT SELECT ON TABLE co_production\.project_operating_sources[\s\S]*TO authenticated/,
  );
  assert.doesNotMatch(migration, /GRANT (INSERT|UPDATE|DELETE|TRUNCATE)/);
});

test("the projection exposes production context without commercial or acceptance detail", () => {
  const selectProjection = migration.match(
    /AS\nSELECT([\s\S]*?)\nFROM co_production\.proposal_handoff_receipts/,
  )?.[1];
  assert.ok(selectProjection);

  assert.match(selectProjection, /brief_id/);
  assert.match(selectProjection, /scope_item_ids/);
  assert.match(selectProjection, /deliverables/);
  assert.match(selectProjection, /production_modules/);
  assert.match(selectProjection, /production_start_date/);
  assert.match(selectProjection, /production_due_date/);

  for (const forbidden of [
    "decision_receipt",
    "proposal_content_hash",
    "quote_content_hash",
    "approval_receipt_ids",
    "artifactRefs",
    "coCreditBudget",
    "receiver_hmac_secret",
    "totalCents",
    "payment",
    "invoice",
  ]) {
    assert.equal(selectProjection.includes(forbidden), false, forbidden);
  }
});
