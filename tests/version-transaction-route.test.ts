import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("app/api/assets/[id]/versions/route.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260715093300_fail_closed_co_production_authority.sql",
  "utf8",
);
const checks = readFileSync("scripts/certification/lib/checks.mjs", "utf8");

test("production version creation uses the authenticated atomic RPC", () => {
  assert.match(route, /requireAuthWithClient\(\)/);
  assert.match(route, /getAssetAccess\(id, user\.id, "editor", supabase\)/);
  assert.match(
    route,
    /getSupabaseDataSchema\(\) === CO_PRODUCTION_DATA_SCHEMA[\s\S]*?supabase\.rpc\("create_asset_version"/,
  );
  assert.match(route, /target_asset_id: id/);
  assert.match(route, /if \(!version \|\| version\.asset_id !== id\)/);
});

test("the atomic RPC locks and advances every version-owned authority together", () => {
  const rpc = migration.match(
    /CREATE OR REPLACE FUNCTION co_production\.create_asset_version\([\s\S]*?\$create_asset_version\$;/,
  )?.[0];
  assert.ok(rpc, "missing create_asset_version RPC");
  assert.match(rpc, /FROM co_production\.assets AS asset[\s\S]*?FOR UPDATE/);
  assert.match(rpc, /INSERT INTO co_production\.versions/);
  assert.match(rpc, /UPDATE co_production\.assets AS asset/);
  assert.match(rpc, /INSERT INTO co_production\.comments/);
  assert.match(rpc, /UPDATE co_production\.approvals AS approval/);
  assert.match(rpc, /INSERT INTO co_production\.activity_log/);
  assert.match(rpc, /RETURN created_version/);
});

test("the route fails closed for conflicts, permissions, invalid input, and unconfirmed rows", () => {
  assert.match(route, /error\?\.code === "23505"[\s\S]*?status: 409/);
  assert.match(route, /error\?\.code === "42501"[\s\S]*?status: 403/);
  assert.match(route, /error\?\.code === "22023"[\s\S]*?status: 400/);
  assert.match(route, /error\?\.code === "28000"[\s\S]*?status: 401/);
  assert.match(route, /The created version could not be confirmed/);
});

test("certification recognizes only the named version transaction RPC", () => {
  assert.match(
    checks,
    /\\\.rpc\\\(\\s\*\["'\]create_asset_version\["'\]/,
  );
});
