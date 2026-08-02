import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = new URL(
  "../supabase/migrations/20260715093300_fail_closed_co_production_authority.sql",
  import.meta.url,
);
const migration = readFileSync(migrationPath, "utf8");

function normalizeSql(sql: string): string {
  return sql.replace(/--.*$/gm, " ").replace(/\s+/g, " ").trim();
}

function tableDefinition(tableName: string): string {
  const definition = migration.match(
    new RegExp(`CREATE TABLE co_production\\.${tableName} \\(([\\s\\S]*?)\\n\\);`),
  );
  assert.ok(definition, `missing co_production.${tableName} definition`);
  return normalizeSql(definition[1]);
}

function policyDefinition(policyName: string): string {
  const definition = migration.match(
    new RegExp(`CREATE POLICY ${policyName} ON [\\s\\S]*?;`),
  );
  assert.ok(definition, `missing ${policyName} policy`);
  return normalizeSql(definition[0]);
}

test("migration preflights PostgreSQL and selective Realtime before schema changes", () => {
  const beginIndex = migration.indexOf("BEGIN;");
  const preflightIndex = migration.indexOf("DO $preflight$");
  const preflightEndIndex = migration.indexOf("$preflight$;", preflightIndex);
  const firstSchemaChangeIndex = migration.indexOf("CREATE SCHEMA");

  assert.ok(beginIndex >= 0, "migration must begin a transaction");
  assert.ok(preflightIndex > beginIndex, "preflight must run inside the transaction");
  assert.ok(preflightEndIndex > preflightIndex, "preflight block must terminate");
  assert.ok(
    preflightEndIndex < firstSchemaChangeIndex,
    "preflight must finish before the first schema change",
  );
  assert.match(migration, /server_version_num\s*<\s*150000/);
  assert.match(migration, /requires PostgreSQL 15 or newer/);
  assert.match(migration, /current_setting\('wal_level'\)\s*<>\s*'logical'/);
  assert.match(migration, /FROM pg_catalog\.pg_publication AS publication/);
  assert.match(migration, /publication\.pubname = 'supabase_realtime'/);
  assert.match(migration, /IF realtime_publication_all_tables THEN/);
  assert.match(migration, /pg_catalog\.pg_has_role\(/);
  assert.match(migration, /requires the supabase_realtime publication/);
  assert.match(migration, /ALTER PUBLICATION supabase_realtime ADD TABLE co_production\.comments/);
  assert.match(
    migration,
    /ALTER PUBLICATION supabase_realtime ADD TABLE co_production\.notifications/,
  );
  assert.match(migration, /COMMIT;\s*$/);
});

test("UUID defaults and private function defaults are schema-qualified and fail closed", () => {
  const generators = migration.match(/\b(?:[a-z_][a-z0-9_]*\.)?gen_random_uuid\(\)/gi) ?? [];
  assert.ok(generators.length > 20, "expected UUID defaults throughout the authority schema");
  for (const generator of generators) {
    assert.equal(generator.toLowerCase(), "pg_catalog.gen_random_uuid()");
  }

  assert.match(
    normalizeSql(migration),
    /ALTER DEFAULT PRIVILEGES IN SCHEMA co_production_private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;/,
  );
});

test("tenant-bearing relationships use composite foreign keys with valid targets", () => {
  const expectedUniqueTargets = [
    ["folders", "CONSTRAINT folders_id_project_key UNIQUE (id, project_id)"],
    ["assets", "UNIQUE (id, project_id)"],
    ["reviews", "CONSTRAINT reviews_id_asset_key UNIQUE (id, asset_id)"],
    [
      "review_invites",
      "CONSTRAINT review_invites_id_asset_key UNIQUE (id, asset_id)",
    ],
    ["comments", "CONSTRAINT comments_id_asset_key UNIQUE (id, asset_id)"],
    [
      "approval_workflows",
      "CONSTRAINT approval_workflows_id_asset_key UNIQUE (id, asset_id)",
    ],
  ] as const;

  for (const [tableName, uniqueConstraint] of expectedUniqueTargets) {
    assert.ok(
      tableDefinition(tableName).includes(uniqueConstraint),
      `${tableName} must expose ${uniqueConstraint}`,
    );
  }

  const expectedForeignKeys = [
    [
      "folders",
      "CONSTRAINT folders_parent_project_fk FOREIGN KEY (parent_id, project_id) REFERENCES co_production.folders(id, project_id) ON DELETE SET NULL (parent_id)",
    ],
    [
      "assets",
      "CONSTRAINT assets_folder_project_fk FOREIGN KEY (folder_id, project_id) REFERENCES co_production.folders(id, project_id) ON DELETE SET NULL (folder_id)",
    ],
    [
      "comments",
      "CONSTRAINT comments_review_asset_fk FOREIGN KEY (review_id, asset_id) REFERENCES co_production.reviews(id, asset_id) ON DELETE CASCADE",
    ],
    [
      "comments",
      "CONSTRAINT comments_review_invite_asset_fk FOREIGN KEY (review_invite_id, asset_id) REFERENCES co_production.review_invites(id, asset_id) ON DELETE SET NULL (review_invite_id)",
    ],
    [
      "comments",
      "CONSTRAINT comments_parent_asset_fk FOREIGN KEY (parent_id, asset_id) REFERENCES co_production.comments(id, asset_id) ON DELETE CASCADE",
    ],
    [
      "annotations",
      "CONSTRAINT annotations_comment_asset_fk FOREIGN KEY (comment_id, asset_id) REFERENCES co_production.comments(id, asset_id) ON DELETE CASCADE",
    ],
    [
      "approvals",
      "CONSTRAINT approvals_workflow_asset_fk FOREIGN KEY (workflow_id, asset_id) REFERENCES co_production.approval_workflows(id, asset_id) ON DELETE CASCADE",
    ],
    [
      "activity_log",
      "CONSTRAINT activity_log_asset_project_fk FOREIGN KEY (asset_id, project_id) REFERENCES co_production.assets(id, project_id) ON DELETE CASCADE",
    ],
    [
      "edit_decisions",
      "CONSTRAINT edit_decisions_review_invite_asset_fk FOREIGN KEY (review_invite_id, asset_id) REFERENCES co_production.review_invites(id, asset_id) ON DELETE SET NULL (review_invite_id)",
    ],
  ] as const;

  for (const [tableName, foreignKey] of expectedForeignKeys) {
    assert.ok(
      tableDefinition(tableName).includes(foreignKey),
      `${tableName} must enforce ${foreignKey}`,
    );
  }
});

test("tenant-bearing nullable links do not retain unsafe scalar foreign keys", () => {
  const unsafeScalarLinks = [
    ["folders", /parent_id uuid REFERENCES co_production\.folders/],
    ["assets", /folder_id uuid REFERENCES co_production\.folders/],
    ["comments", /review_id uuid REFERENCES co_production\.reviews/],
    ["comments", /review_invite_id uuid REFERENCES co_production\.review_invites/],
    ["comments", /parent_id uuid REFERENCES co_production\.comments/],
    ["annotations", /comment_id uuid REFERENCES co_production\.comments/],
    ["approvals", /workflow_id uuid REFERENCES co_production\.approval_workflows/],
    ["edit_decisions", /review_invite_id uuid REFERENCES co_production\.review_invites/],
  ] as const;

  for (const [tableName, unsafeReference] of unsafeScalarLinks) {
    assert.doesNotMatch(tableDefinition(tableName), unsafeReference);
  }
});

test("activity policies authorize every supplied scope instead of either scope", () => {
  const selectPolicy = policyDefinition("activity_log_select");
  const insertPolicy = policyDefinition("activity_log_insert");
  const everyScopeMustPass =
    "(project_id IS NULL OR co_production_private.has_project_role(project_id, 10)) " +
    "AND (asset_id IS NULL OR co_production_private.has_asset_role(asset_id, 10)) " +
    "AND (project_id IS NOT NULL OR asset_id IS NOT NULL)";

  assert.ok(selectPolicy.includes(everyScopeMustPass));
  assert.ok(insertPolicy.includes(everyScopeMustPass));
  assert.match(insertPolicy, /actor_id = \(SELECT auth\.uid\(\)\) AND/);
  assert.doesNotMatch(
    selectPolicy,
    /project_id IS NOT NULL AND[\s\S]*\) OR \(asset_id IS NOT NULL AND/,
  );
  assert.doesNotMatch(
    insertPolicy,
    /project_id IS NOT NULL AND[\s\S]*\) OR \(asset_id IS NOT NULL AND/,
  );
});

test("authenticated notification inserts can target only the current user", () => {
  const insertPolicy = policyDefinition("notifications_insert");

  assert.equal(
    insertPolicy,
    "CREATE POLICY notifications_insert ON co_production.notifications " +
      "FOR INSERT TO authenticated " +
      "WITH CHECK (user_id = (SELECT auth.uid()));",
  );
  assert.doesNotMatch(insertPolicy, /USING\s*\(\s*true\s*\)/i);
  assert.doesNotMatch(insertPolicy, /WITH CHECK\s*\(\s*true\s*\)/i);
});

test("version creation RPC is atomic, invoker-secured, and RLS-compatible", () => {
  const functionMatch = migration.match(
    /CREATE OR REPLACE FUNCTION co_production\.create_asset_version\([\s\S]*?\$create_asset_version\$;/,
  );
  assert.ok(functionMatch, "missing create_asset_version RPC");
  const rpc = normalizeSql(functionMatch[0]);

  assert.match(rpc, /RETURNS co_production\.versions LANGUAGE plpgsql VOLATILE/);
  assert.match(rpc, /SECURITY INVOKER SET search_path = ''/);
  assert.doesNotMatch(rpc, /SECURITY DEFINER/);
  assert.match(rpc, /actor_user_id uuid := \(SELECT auth\.uid\(\)\)/);
  assert.match(rpc, /\(SELECT auth\.jwt\(\)\) ->> 'email'/);
  assert.doesNotMatch(
    rpc.slice(0, rpc.indexOf("RETURNS co_production.versions")),
    /actor_(?:id|user_id)/,
  );

  assert.match(
    rpc,
    /FROM co_production\.assets AS asset WHERE asset\.id = target_asset_id FOR UPDATE/,
  );
  assert.match(
    rpc,
    /ORDER BY version\.version_number DESC LIMIT 1; next_version_number := COALESCE\(previous_version_number, 0\) \+ 1/,
  );
  assert.match(
    rpc,
    /UPDATE co_production\.versions AS version SET is_current = false,[\s\S]*?AND version\.is_current/,
  );
  assert.match(
    rpc,
    /INSERT INTO co_production\.versions[\s\S]*?actor_user_id, true,[\s\S]*?RETURNING \* INTO created_version/,
  );
  assert.match(
    rpc,
    /UPDATE co_production\.assets AS asset SET file_url = new_file_url, file_size = new_file_size,[\s\S]*?status = 'in_review'/,
  );

  assert.match(
    rpc,
    /INSERT INTO co_production\.comments[\s\S]*?actor_user_id,[\s\S]*?pg_catalog\.left\([\s\S]*?20000[\s\S]*?comment\.status <> 'resolved' AND comment\.parent_id IS NULL/,
  );
  assert.match(
    rpc,
    /approval_count > 0 AND NOT co_production_private\.has_asset_role\( target_asset_id, 70 \)/,
  );
  assert.match(
    rpc,
    /UPDATE co_production\.approvals AS approval SET status = 'pending', decided_at = NULL, decision_note = NULL/,
  );
  assert.match(rpc, /GET DIAGNOSTICS reset_approval_count = ROW_COUNT/);
  assert.match(rpc, /reset_approval_count <> approval_count/);
  assert.match(
    rpc,
    /INSERT INTO co_production\.activity_log[\s\S]*?'uploaded_version'[\s\S]*?'approvals_reset'/,
  );
  assert.match(rpc, /RETURN created_version; END \$create_asset_version\$;/);

  const normalizedMigration = normalizeSql(migration);
  const revokeIndex = normalizedMigration.indexOf(
    "REVOKE ALL ON ALL FUNCTIONS IN SCHEMA co_production FROM PUBLIC, anon, authenticated;",
  );
  const grant =
    "GRANT EXECUTE ON FUNCTION co_production.create_asset_version( uuid, text, bigint, text, text, double precision, text ) TO authenticated, service_role;";
  const grantIndex = normalizedMigration.indexOf(grant);
  assert.ok(revokeIndex >= 0, "missing broad function revoke");
  assert.ok(grantIndex > revokeIndex, "RPC grant must follow the broad function revoke");
  assert.doesNotMatch(
    normalizedMigration,
    /GRANT EXECUTE ON FUNCTION co_production\.create_asset_version\([\s\S]*?\) TO (?:PUBLIC|anon)/,
  );
});
