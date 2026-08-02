import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
  resolve(
    repositoryRoot,
    "supabase/migrations/20260716090001_project_manual_origin_authority.sql",
  ),
  "utf8",
);
const projectsRoute = readFileSync(
  resolve(repositoryRoot, "app/api/projects/route.ts"),
  "utf8",
);
const newProjectPage = readFileSync(
  resolve(repositoryRoot, "app/(dashboard)/projects/new/page.tsx"),
  "utf8",
);

function functionSql(schema: string, name: string) {
  const marker = `CREATE OR REPLACE FUNCTION ${schema}.${name}(`;
  const start = migration.indexOf(marker);
  assert.notEqual(start, -1, `missing ${schema}.${name}`);
  const end = migration.indexOf("\n$$;", start + marker.length);
  assert.notEqual(end, -1, `unterminated ${schema}.${name}`);
  return migration.slice(start, end + 4);
}

test("manual project origins are immutable, project-scoped, and intentionally separate from proposal handoffs", () => {
  const table = /CREATE TABLE co_production\.project_manual_origins \(([\s\S]*?)\n\);/.exec(migration)?.[0];
  assert.ok(table, "missing project_manual_origins table");
  assert.match(table, /project_id uuid PRIMARY KEY[\s\S]*?REFERENCES co_production\.projects\(id\) ON DELETE RESTRICT/);
  assert.match(table, /team_id uuid REFERENCES co_production\.teams\(id\) ON DELETE RESTRICT/);
  assert.match(table, /created_by uuid NOT NULL REFERENCES auth\.users\(id\) ON DELETE RESTRICT/);
  assert.match(table, /request_id uuid NOT NULL/);
  assert.match(table, /request_hash text NOT NULL CHECK/);
  assert.match(table, /source_kind text NOT NULL DEFAULT 'manual' CHECK \(source_kind = 'manual'\)/);
  assert.match(table, /UNIQUE \(created_by, request_id\)/);
  assert.match(table, /'operation', 'create_manual_project_with_origin'/);
  assert.doesNotMatch(table, /proposal_handoff_receipt_id/);

  assert.match(migration, /ALTER TABLE co_production\.project_manual_origins ENABLE ROW LEVEL SECURITY;/);
  assert.match(migration, /ALTER TABLE co_production\.project_manual_origins FORCE ROW LEVEL SECURITY;/);
  assert.match(migration, /CREATE POLICY project_manual_origins_select[\s\S]*?FOR SELECT TO authenticated[\s\S]*?has_project_role\(project_id, 10\)/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON co_production\.project_manual_origins/);
  assert.match(migration, /BEFORE TRUNCATE ON co_production\.project_manual_origins/);
  assert.match(migration, /REVOKE ALL ON TABLE co_production\.project_manual_origins[\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/);
  assert.match(migration, /GRANT SELECT ON TABLE co_production\.project_manual_origins TO authenticated;/);
});

test("manual project creation is authenticated, atomic, retry-safe, and auditable", () => {
  const create = functionSql("co_production", "create_manual_project_with_origin");
  assert.match(create, /SECURITY DEFINER/);
  assert.match(create, /SET search_path = ''/);
  assert.match(create, /auth\.uid\(\)/);
  assert.match(create, /has_active_surface_identity\(\)/);
  assert.match(create, /has_team_role\(p_team_id, 80\)/);
  assert.match(create, /pg_advisory_xact_lock/);
  assert.match(create, /FROM co_production\.project_manual_origins AS origin[\s\S]*?origin\.created_by = v_actor_id[\s\S]*?origin\.request_id = p_request_id/);
  assert.match(create, /MESSAGE = 'manual_project_idempotency_conflict'/);
  assert.match(create, /INSERT INTO co_production\.projects/);
  assert.match(create, /INSERT INTO co_production\.project_manual_origins/);
  assert.match(create, /INSERT INTO co_production\.activity_log/);
  assert.match(create, /'project_manual_origin_created'/);
  assert.match(create, /'replayed', true/);
  assert.match(create, /'replayed', false/);

  assert.match(migration, /REVOKE ALL ON FUNCTION co_production\.create_manual_project_with_origin\(uuid, text, text, uuid\)[\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION co_production\.create_manual_project_with_origin\(uuid, text, text, uuid\)[\s\S]*?TO authenticated;/);
});

test("the application uses the durable manual-origin RPC only in the isolated schema", () => {
  assert.match(projectsRoute, /const isolated = getSupabaseDataSchema\(\) === "co_production"/);
  assert.match(projectsRoute, /A valid project creation request_id is required/);
  assert.match(projectsRoute, /\.rpc\(\s*"create_manual_project_with_origin"/);
  assert.match(projectsRoute, /p_request_id: requestId/);
  assert.match(projectsRoute, /project\.replayed \? 200 : 201/);
  assert.match(projectsRoute, /manual_project_idempotency_conflict/);
  assert.match(projectsRoute, /if \(isolated\) \{[\s\S]*?create_manual_project_with_origin[\s\S]*?\n    \}/);

  assert.match(newProjectPage, /const requestIdRef = useRef<string \| null>\(null\)/);
  assert.match(newProjectPage, /requestIdRef\.current = crypto\.randomUUID\(\)/);
  assert.match(newProjectPage, /request_id: requestIdRef\.current/);
});
