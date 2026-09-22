import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
  resolve(root, "supabase/migrations/20260922073000_version_bound_approval_rounds.sql"),
  "utf8",
);

test("approval decisions compare-and-set the exact current-version pending step", () => {
  const rpc = migration.slice(migration.indexOf("record_version_approval_decision"));
  assert.match(rpc, /assets AS asset[\s\S]*FOR UPDATE/);
  assert.match(rpc, /version\.id = p_version_id[\s\S]*version\.asset_id = p_asset_id[\s\S]*version\.is_current IS TRUE FOR UPDATE/);
  assert.match(rpc, /step\.id = p_approval_id[\s\S]*step\.asset_id = p_asset_id[\s\S]*step\.version_id = p_version_id/);
  assert.match(rpc, /step\.workflow_id = v_workflow\.id[\s\S]*step\.status = 'pending'/);
  assert.match(rpc, /RETURNING step\.\* INTO v_updated/);
  assert.match(rpc, /CVP_APPROVAL_ALREADY_DECIDED/);
});
