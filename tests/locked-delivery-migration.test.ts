import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const migration = readFileSync(
  resolve(repositoryRoot, "supabase/migrations/20260812120000_locked_delivery.sql"),
  "utf8",
);

test("locked-delivery migration follows the operating-record conventions", () => {
  assert.match(migration, /^-- Co-VideoPro — Migration: Locked Delivery/);
  assert.match(migration, /\bBEGIN;/);
  assert.match(migration, /\bCOMMIT;/);
});

test("deliverables gains the lock fields and the delivered-requires-lock check", () => {
  assert.match(
    migration,
    /ALTER TABLE co_production\.deliverables[\s\S]*locked_at timestamptz/,
  );
  assert.match(migration, /locked_by uuid REFERENCES auth\.users\(id\)/);
  assert.match(migration, /approval_id uuid/);
  assert.match(
    migration,
    /CHECK \(status <> 'delivered' OR locked_at IS NOT NULL\)/,
  );
});

test("deliverable_items binds versions with checksums and cascade semantics", () => {
  assert.match(
    migration,
    /CREATE TABLE IF NOT EXISTS co_production\.deliverable_items/,
  );
  assert.match(
    migration,
    /deliverable_id uuid NOT NULL REFERENCES co_production\.deliverables\(id\) ON DELETE CASCADE/,
  );
  assert.match(migration, /asset_id uuid NOT NULL/);
  assert.match(migration, /version_id uuid NOT NULL/);
  assert.match(migration, /sha256 text/);
  assert.match(migration, /UNIQUE \(deliverable_id, version_id\)/);
});

test("a locked delivery's item set is immutable via trigger", () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION co_production\.reject_locked_deliverable_item_mutation/,
  );
  assert.match(migration, /d\.locked_at IS NOT NULL/);
  assert.match(
    migration,
    /CREATE TRIGGER deliverable_items_locked_guard[\s\S]*BEFORE INSERT OR UPDATE OR DELETE ON co_production\.deliverable_items/,
  );
});

test("the item guard checks both the OLD and NEW parent on UPDATE", () => {
  // An UPDATE that re-parents an item must not escape the lock by checking
  // only the target delivery (F5).
  assert.match(
    migration,
    /TG_OP IN \('UPDATE', 'DELETE'\)[\s\S]*OLD\.deliverable_id[\s\S]*d\.locked_at IS NOT NULL/,
  );
  assert.match(
    migration,
    /TG_OP IN \('INSERT', 'UPDATE'\)[\s\S]*NEW\.deliverable_id[\s\S]*d\.locked_at IS NOT NULL/,
  );
});

test("deliverable_items is RLS-forced with an owner-scoped select policy", () => {
  assert.match(
    migration,
    /ALTER TABLE co_production\.deliverable_items ENABLE ROW LEVEL SECURITY/,
  );
  assert.match(
    migration,
    /ALTER TABLE co_production\.deliverable_items FORCE ROW LEVEL SECURITY/,
  );
  assert.match(
    migration,
    /CREATE POLICY deliverable_items_select_owner ON co_production\.deliverable_items[\s\S]*FOR SELECT USING[\s\S]*p\.owner_id = auth\.uid\(\)/,
  );
});

test("grants mirror the operating record: service_role writes, authenticated reads", () => {
  assert.match(
    migration,
    /GRANT ALL ON TABLE co_production\.deliverable_items TO service_role;/,
  );
  assert.match(
    migration,
    /GRANT SELECT ON TABLE co_production\.deliverable_items TO authenticated;/,
  );
});
