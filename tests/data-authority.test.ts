import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CO_PRODUCTION_DATA_SCHEMA,
  LEGACY_DATA_SCHEMA,
  resolveSupabaseDataSchema,
} from "../lib/data-authority.ts";

const migrationPath = new URL(
  "../supabase/migrations/20260715093300_fail_closed_co_production_authority.sql",
  import.meta.url,
);
const migration = readFileSync(migrationPath, "utf8");

const expectedTables = [
  "teams",
  "team_members",
  "team_invites",
  "projects",
  "project_members",
  "folders",
  "assets",
  "versions",
  "reviews",
  "review_invites",
  "comments",
  "annotations",
  "comment_reactions",
  "comment_attachments",
  "approval_workflows",
  "approvals",
  "approval_history",
  "activity_log",
  "tags",
  "asset_tags",
  "notifications",
  "notification_preferences",
  "transcriptions",
  "brand_checks",
  "comparison_sessions",
  "project_analytics_cache",
  "edit_decisions",
  "share_analytics",
  "webhooks",
  "webhook_deliveries",
  "transcode_jobs",
  "usage_events",
];

test("development preserves the legacy demo unless the isolated schema is selected", () => {
  assert.equal(
    resolveSupabaseDataSchema({ audience: "server", environment: "development" }),
    LEGACY_DATA_SCHEMA,
  );
  assert.equal(
    resolveSupabaseDataSchema({
      audience: "server",
      environment: "development",
      serverSchema: CO_PRODUCTION_DATA_SCHEMA,
      browserSchema: CO_PRODUCTION_DATA_SCHEMA,
    }),
    CO_PRODUCTION_DATA_SCHEMA,
  );
});

test("production fails closed unless server and browser target co_production", () => {
  assert.throws(
    () =>
      resolveSupabaseDataSchema({
        audience: "server",
        environment: "production",
      }),
    /Production requires SUPABASE_DATA_SCHEMA=co_production/,
  );
  assert.throws(
    () =>
      resolveSupabaseDataSchema({
        audience: "server",
        environment: "production",
        serverSchema: CO_PRODUCTION_DATA_SCHEMA,
      }),
    /NEXT_PUBLIC_SUPABASE_DATA_SCHEMA=co_production/,
  );
  assert.equal(
    resolveSupabaseDataSchema({
      audience: "server",
      environment: "production",
      serverSchema: CO_PRODUCTION_DATA_SCHEMA,
      browserSchema: CO_PRODUCTION_DATA_SCHEMA,
    }),
    CO_PRODUCTION_DATA_SCHEMA,
  );
  assert.equal(
    resolveSupabaseDataSchema({
      audience: "browser",
      environment: "production",
      browserSchema: CO_PRODUCTION_DATA_SCHEMA,
    }),
    CO_PRODUCTION_DATA_SCHEMA,
  );
});

test("unknown or mismatched data schemas are rejected", () => {
  assert.throws(
    () =>
      resolveSupabaseDataSchema({
        audience: "server",
        serverSchema: "customer_uploads",
      }),
    /SUPABASE_DATA_SCHEMA must be co_production or public/,
  );
  assert.throws(
    () =>
      resolveSupabaseDataSchema({
        audience: "server",
        serverSchema: CO_PRODUCTION_DATA_SCHEMA,
        browserSchema: LEGACY_DATA_SCHEMA,
      }),
    /must match/,
  );
});

test("the migration creates a complete namespaced authority without touching shared public tables", () => {
  assert.match(migration, /CREATE SCHEMA IF NOT EXISTS co_production;/);
  assert.match(migration, /CREATE SCHEMA IF NOT EXISTS co_production_private;/);

  for (const table of expectedTables) {
    assert.match(
      migration,
      new RegExp(`CREATE TABLE co_production\\.${table} \\(`),
      `missing co_production.${table}`,
    );
  }

  const executableLines = migration
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  assert.doesNotMatch(
    executableLines,
    /\b(?:CREATE|ALTER|DROP|TRUNCATE|INSERT|UPDATE|DELETE)\s+(?:TABLE\s+)?public\.(?:projects|assets|reviews|comments|approvals|review_invites|activity_log|share_links)\b/i,
  );
});

test("every authority table is force-RLS and browser roles are never fail-open", () => {
  const rlsBlock = migration.match(/FOREACH table_name IN ARRAY ARRAY\[([\s\S]*?)\]\s*LOOP/);
  assert.ok(rlsBlock, "missing force-RLS table inventory");
  for (const table of expectedTables) {
    assert.match(rlsBlock[1], new RegExp(`'${table}'`), `RLS inventory missing ${table}`);
  }
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/);
  assert.doesNotMatch(migration, /USING\s*\(\s*true\s*\)/i);
  assert.doesNotMatch(migration, /WITH CHECK\s*\(\s*true\s*\)/i);
  assert.doesNotMatch(migration, /TO\s+PUBLIC/i);
  assert.doesNotMatch(migration, /TO\s+anon/i);
  assert.match(
    migration,
    /REVOKE ALL ON ALL TABLES IN SCHEMA co_production FROM PUBLIC, anon, authenticated;/,
  );
  assert.match(migration, /GRANT ALL ON ALL TABLES IN SCHEMA co_production TO service_role;/);
});

test("update policies require both row visibility and post-update validation", () => {
  const updatePolicies = migration.match(/CREATE POLICY[\s\S]*?FOR UPDATE TO authenticated[\s\S]*?;/g) ?? [];
  assert.ok(updatePolicies.length >= 15, "expected broad update-policy coverage");
  for (const policy of updatePolicies) {
    assert.match(policy, /USING\s*\(/, `update policy missing USING: ${policy.slice(0, 80)}`);
    assert.match(
      policy,
      /WITH CHECK\s*\(/,
      `update policy missing WITH CHECK: ${policy.slice(0, 80)}`,
    );
  }
});

test("bearer credentials and webhook secrets are not stored in plaintext", () => {
  assert.doesNotMatch(migration, /\btoken\s+text\b/i);
  assert.doesNotMatch(migration, /\bsecret\s+text\b/i);
  assert.match(migration, /token_hash text NOT NULL UNIQUE/);
  assert.match(migration, /token_ciphertext text NOT NULL/);
  assert.match(migration, /secret_ciphertext text NOT NULL/);
  assert.doesNotMatch(
    migration,
    /GRANT[\s\S]{0,400}review_invites[\s\S]{0,80}TO authenticated;/i,
  );
});

test("security-definer helpers are private and compatibility views honor RLS", () => {
  const functionBlocks = migration.split(/(?=CREATE OR REPLACE FUNCTION )/g);
  const definerBlocks = functionBlocks.filter((block) => /SECURITY DEFINER/.test(block));
  assert.ok(definerBlocks.length >= 6);
  for (const block of definerBlocks) {
    assert.match(block, /^CREATE OR REPLACE FUNCTION co_production_private\./);
    assert.match(block, /SET search_path = ''/);
  }
  assert.match(
    migration,
    /CREATE VIEW co_production\.approval_steps\s+WITH \(security_invoker = true\)/,
  );
});

test("all data clients use the selected authority and server calls require a service key", () => {
  const serverClient = readFileSync(new URL("../lib/supabase.ts", import.meta.url), "utf8");
  const authClient = readFileSync(new URL("../lib/supabase-auth.ts", import.meta.url), "utf8");
  const browserClient = readFileSync(
    new URL("../lib/supabase-browser.ts", import.meta.url),
    "utf8",
  );
  const realtimeComments = readFileSync(
    new URL("../lib/hooks/useRealtimeComments.ts", import.meta.url),
    "utf8",
  );
  const realtimeNotifications = readFileSync(
    new URL("../lib/hooks/useRealtimeNotifications.ts", import.meta.url),
    "utf8",
  );

  assert.match(serverClient, /getSupabaseServiceKey\(\)/);
  assert.doesNotMatch(serverClient, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  assert.match(serverClient, /db: \{ schema: getSupabaseDataSchema\(\) \}/);
  assert.match(authClient, /db: \{ schema: getSupabaseDataSchema\(\) \}/);
  assert.match(
    browserClient,
    /db: \{ schema: getSupabaseBrowserDataSchema\(\) \}/,
  );
  assert.match(realtimeComments, /schema: getSupabaseBrowserDataSchema\(\)/);
  assert.match(realtimeNotifications, /schema: getSupabaseBrowserDataSchema\(\)/);
});
