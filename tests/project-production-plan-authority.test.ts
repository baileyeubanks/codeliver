import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
  resolve(
    repositoryRoot,
    "supabase/migrations/20260716040000_project_production_plan_task_authority.sql",
  ),
  "utf8",
);

const newTables = [
  "project_preproduction_authorities",
  "production_plan_revisions",
  "production_tasks",
  "production_task_dependencies",
  "project_preproduction_mutation_receipts",
  "project_preproduction_events",
] as const;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tableSql(name: (typeof newTables)[number]): string {
  const marker = `CREATE TABLE co_production.${name} (`;
  const start = migration.indexOf(marker);
  assert.notEqual(start, -1, `missing table ${name}`);
  const end = migration.indexOf("\n);", start + marker.length);
  assert.notEqual(end, -1, `unterminated table ${name}`);
  return migration.slice(start, end + 3);
}

function functionSql(schema: string, name: string): string {
  const marker = `CREATE OR REPLACE FUNCTION ${schema}.${name}(`;
  const start = migration.indexOf(marker);
  assert.notEqual(start, -1, `missing function ${schema}.${name}`);
  const end = migration.indexOf("\n$$;", start + marker.length);
  assert.notEqual(end, -1, `unterminated function ${schema}.${name}`);
  return migration.slice(start, end + 4);
}

function assertImmutable(table: string): void {
  const escaped = escapeRegExp(table);
  assert.match(
    migration,
    new RegExp(`BEFORE UPDATE OR DELETE ON co_production\\.${escaped}`),
  );
  assert.match(
    migration,
    new RegExp(`BEFORE TRUNCATE ON co_production\\.${escaped}`),
  );
}

function assertForcedProjectRead(table: string): void {
  const escaped = escapeRegExp(table);
  assert.match(
    migration,
    new RegExp(
      `ALTER TABLE co_production\\.${escaped}\\s+ENABLE ROW LEVEL SECURITY;`,
    ),
  );
  assert.match(
    migration,
    new RegExp(
      `ALTER TABLE co_production\\.${escaped}\\s+FORCE ROW LEVEL SECURITY;`,
    ),
  );
  assert.match(
    migration,
    new RegExp(
      `CREATE POLICY [a-z_][a-z0-9_]*\\s+ON co_production\\.${escaped}` +
        `[\\s\\S]*?FOR SELECT TO authenticated` +
        `[\\s\\S]*?project_preproduction_role\\(project_id\\) IS NOT NULL` +
        `[\\s\\S]*?;`,
    ),
  );
  assert.match(
    migration,
    new RegExp(
      `REVOKE ALL ON TABLE co_production\\.${escaped}` +
        `\\s+FROM PUBLIC, anon, authenticated, service_role;`,
    ),
  );
}

test("migration preflights the existing project, identity, hash, and proposal authorities", () => {
  assert.match(migration, /^-- Project-scoped pre-production/m);
  assert.match(migration, /intentionally unapplied/);
  assert.match(migration, /BEGIN;/);
  assert.match(migration, /server_version_num[\s\S]*150000/);
  for (const relation of [
    "projects",
    "teams",
    "team_members",
    "project_members",
    "proposal_handoff_receipts",
  ]) {
    assert.match(
      migration,
      new RegExp(`to_regclass\\('co_production\\.${relation}'\\)`),
    );
  }
  for (const helper of [
    "has_active_surface_identity()",
    "preproject_sha256(text)",
    "preproject_safe_text(text,integer,integer)",
    "preproject_exact_json_keys(jsonb,text[])",
    "preproject_iso_date_is_valid(text)",
  ]) {
    assert.match(migration, new RegExp(escapeRegExp(helper)));
  }
  assert.match(
    migration,
    /proposal_handoff_receipts_id_team_project_unique/,
  );
  assert.match(migration, /COMMIT;\s*$/);
  assert.doesNotMatch(migration, /\bDROP\s+(?:TABLE|SCHEMA|COLUMN)\b/i);
});

test("plan revisions are immutable, exact, project-revision history without mutable phase state", () => {
  const plan = tableSql("production_plan_revisions");
  assert.match(plan, /revision_number integer NOT NULL/);
  assert.match(plan, /UNIQUE \(project_id, revision_number\)/);
  assert.match(plan, /UNIQUE \(project_id, request_id\)/);
  assert.match(plan, /content jsonb NOT NULL/);
  assert.match(
    plan,
    /content_hash = co_production_private\.preproject_sha256\(content::text\)/,
  );
  assert.match(
    plan,
    /request_hash = co_production_private\.preproject_sha256\([\s\S]*?'operation', 'initialize_production_plan'[\s\S]*?'expectedPlanRevision', revision_number - 1[\s\S]*?'plan', content/,
  );
  assert.match(plan, /source_kind IN \('accepted_proposal', 'manual'\)/);
  assert.match(plan, /source_receipt_id uuid/);
  assert.match(
    plan,
    /FOREIGN KEY \(source_receipt_id, team_id, project_id\)[\s\S]*?REFERENCES co_production\.proposal_handoff_receipts\(id, team_id, project_id\)/,
  );
  assert.doesNotMatch(plan, /^\s+(?:phase_)?status text\b/m);
  assert.doesNotMatch(plan, /^\s+is_current boolean\b/m);
  assertImmutable("production_plan_revisions");

  const read = functionSql("co_production", "get_project_production_plan");
  assert.match(
    read,
    /FROM co_production\.production_plan_revisions AS plan[\s\S]*?WHERE plan\.project_id = p_project_id[\s\S]*?ORDER BY plan\.revision_number DESC[\s\S]*?LIMIT 1/,
  );
  assert.match(read, /'status', 'active'/);
});

test("tasks are revision-bound optimistic records with controlled completion evidence", () => {
  const tasks = tableSql("production_tasks");
  assert.match(tasks, /plan_revision_id uuid NOT NULL/);
  assert.match(tasks, /client_task_id text NOT NULL/);
  assert.match(tasks, /UNIQUE \(plan_revision_id, client_task_id\)/);
  assert.match(
    tasks,
    /FOREIGN KEY \(plan_revision_id, project_id\)[\s\S]*?REFERENCES co_production\.production_plan_revisions\(id, project_id\)/,
  );
  assert.match(
    tasks,
    /status IN \('todo', 'in_progress', 'blocked', 'completed', 'cancelled'\)/,
  );
  assert.match(tasks, /priority IN \('low', 'normal', 'high', 'urgent'\)/);
  assert.match(
    tasks,
    /source_kind IN \('plan', 'review_comment', 'manual', 'agent_proposal'\)/,
  );
  assert.match(tasks, /source_ref text/);
  assert.match(tasks, /authority_version bigint NOT NULL DEFAULT 1/);
  assert.match(tasks, /status = 'completed'[\s\S]*?completed_by IS NOT NULL/);
  assert.match(tasks, /status = 'completed'[\s\S]*?completed_at IS NOT NULL/);
  assert.match(tasks, /status <> 'completed'[\s\S]*?completed_by IS NULL/);
  assert.match(tasks, /status <> 'completed'[\s\S]*?completed_at IS NULL/);

  const guard = functionSql(
    "co_production_private",
    "guard_production_task_write",
  );
  assert.match(guard, /ORDER BY plan\.revision_number DESC[\s\S]*?LIMIT 1/);
  assert.match(
    guard,
    /v_latest_plan_revision_id IS DISTINCT FROM NEW\.plan_revision_id/,
  );
  assert.match(guard, /is_project_internal_participant/);
  assert.match(
    guard,
    /NEW\.authority_version IS DISTINCT FROM OLD\.authority_version \+ 1/,
  );
  assert.match(guard, /NEW\.source_kind[\s\S]*?OLD\.source_kind/);
  assert.match(guard, /NEW\.source_ref[\s\S]*?OLD\.source_ref/);
  assert.match(migration, /BEFORE INSERT OR UPDATE OR DELETE ON co_production\.production_tasks/);
  assert.match(migration, /BEFORE TRUNCATE ON co_production\.production_tasks/);
});

test("dependency edges are immutable, same-project, self-safe, and cycle-safe under the authority lock", () => {
  const dependencies = tableSql("production_task_dependencies");
  assert.match(dependencies, /task_id <> depends_on_task_id/);
  assert.equal(
    (
      dependencies.match(
        /FOREIGN KEY \([^)]*project_id, plan_revision_id\)[\s\S]*?REFERENCES co_production\.production_tasks\(id, project_id, plan_revision_id\)/g,
      ) ?? []
    ).length,
    2,
  );
  assertImmutable("production_task_dependencies");

  const guard = functionSql(
    "co_production_private",
    "guard_production_task_dependency_insert",
  );
  assert.match(
    guard,
    /FROM co_production\.project_preproduction_authorities AS authority[\s\S]*?FOR UPDATE/,
  );
  assert.match(guard, /WITH RECURSIVE dependency_walk/);
  assert.match(guard, /walk\.task_id = NEW\.task_id/);
  assert.match(guard, /MESSAGE = 'preproduction_dependency_cycle'/);
  assert.match(
    migration,
    /BEFORE INSERT ON co_production\.production_task_dependencies/,
  );
});

test("project authority versions and event heads advance exactly once per append", () => {
  const authority = tableSql("project_preproduction_authorities");
  assert.match(authority, /authority_version bigint NOT NULL DEFAULT 0/);
  assert.match(authority, /event_head_hash text NOT NULL DEFAULT/);
  assert.match(authority, /event_head_hash ~ '\^sha256:\[0-9a-f\]\{64\}\$'/);

  const authorityGuard = functionSql(
    "co_production_private",
    "guard_project_preproduction_authority",
  );
  assert.match(
    authorityGuard,
    /NEW\.authority_version IS DISTINCT FROM OLD\.authority_version \+ 1/,
  );
  assert.match(
    authorityGuard,
    /NEW\.event_head_hash IS NOT DISTINCT FROM OLD\.event_head_hash/,
  );
  assert.match(
    migration,
    /BEFORE UPDATE OR DELETE ON co_production\.project_preproduction_authorities/,
  );
  assert.match(
    migration,
    /BEFORE TRUNCATE ON co_production\.project_preproduction_authorities/,
  );
});

test("receipts and events are immutable exact-request project-wide hash history", () => {
  const receipts = tableSql("project_preproduction_mutation_receipts");
  assert.match(receipts, /UNIQUE \(project_id, request_id\)/);
  assert.match(receipts, /UNIQUE \(project_id, authority_version\)/);
  assert.match(receipts, /request_payload jsonb NOT NULL/);
  assert.match(
    receipts,
    /request_hash =[\s\S]*?preproject_sha256\(request_payload::text\)/,
  );
  assert.match(
    receipts,
    /resulting_entity_version = expected_entity_version \+ 1/,
  );
  assert.match(receipts, /receipt_hash text NOT NULL UNIQUE/);
  assertImmutable("project_preproduction_mutation_receipts");

  const receiptHash = functionSql(
    "co_production_private",
    "verify_project_preproduction_receipt_hash",
  );
  assert.match(receiptHash, /'requestHash', NEW\.request_hash/);
  assert.match(receiptHash, /'result', NEW\.result/);
  assert.match(receiptHash, /NEW\.receipt_hash IS DISTINCT FROM v_expected_hash/);

  const events = tableSql("project_preproduction_events");
  assert.match(events, /receipt_id uuid NOT NULL UNIQUE/);
  assert.match(events, /UNIQUE \(project_id, authority_version\)/);
  assert.match(events, /previous_event_hash text NOT NULL/);
  assert.match(events, /event_hash text NOT NULL UNIQUE/);
  assertImmutable("project_preproduction_events");

  const eventGuard = functionSql(
    "co_production_private",
    "guard_project_preproduction_event_insert",
  );
  assert.match(
    eventGuard,
    /FROM co_production\.project_preproduction_authorities AS authority[\s\S]*?FOR UPDATE/,
  );
  assert.match(
    eventGuard,
    /NEW\.authority_version IS DISTINCT FROM v_authority\.authority_version \+ 1/,
  );
  assert.match(
    eventGuard,
    /NEW\.previous_event_hash IS DISTINCT FROM v_authority\.event_head_hash/,
  );
  assert.match(eventGuard, /NEW\.event_type IS DISTINCT FROM v_receipt\.mutation_kind/);
  assert.match(eventGuard, /NEW\.event_hash IS DISTINCT FROM v_expected_hash/);
});

test("role authority uses exact role sets and assignees exclude reviewer and viewer", () => {
  const role = functionSql(
    "co_production_private",
    "project_preproduction_role",
  );
  for (const exactRole of [
    "owner",
    "admin",
    "producer",
    "editor",
    "member",
    "reviewer",
    "viewer",
  ]) {
    assert.match(role, new RegExp(`'${exactRole}'`));
  }
  assert.match(role, /has_active_surface_identity\(\)/);
  assert.match(role, /project\.owner_id = \(SELECT auth\.uid\(\)\)/);
  assert.match(role, /team\.owner_id = \(SELECT auth\.uid\(\)\)/);
  assert.match(role, /member\.expires_at IS NULL OR member\.expires_at > now\(\)/);
  assert.doesNotMatch(role, /role_rank|has_project_role\([^)]*,\s*[0-9]+\)/);

  const assignee = functionSql(
    "co_production_private",
    "is_project_internal_participant",
  );
  assert.match(
    assignee,
    /member\.role IN \('owner', 'admin', 'producer', 'editor', 'member'\)/,
  );
  assert.doesNotMatch(assignee, /member\.role IN \([^)]*reviewer/);
  assert.doesNotMatch(assignee, /member\.role IN \([^)]*viewer/);
  assert.match(assignee, /member\.expires_at IS NULL OR member\.expires_at > now\(\)/);

  const initialize = functionSql(
    "co_production",
    "initialize_production_plan",
  );
  assert.match(initialize, /v_role NOT IN \('owner', 'admin', 'producer'\)/);
  assert.match(initialize, /is_project_internal_participant/);

  const mutate = functionSql("co_production", "mutate_production_task");
  assert.match(
    mutate,
    /p_patch - ARRAY\['status'\][\s\S]*?v_role NOT IN \('owner', 'admin', 'producer'\)/,
  );
  assert.match(
    mutate,
    /p_patch \? 'status'[\s\S]*?v_role NOT IN \('owner', 'admin', 'producer', 'editor', 'member'\)/,
  );
});

test("plan initialization validates the exact bounded graph before serialized writes", () => {
  const validator = functionSql(
    "co_production_private",
    "production_plan_payload_is_valid",
  );
  assert.match(
    validator,
    /preproject_exact_json_keys\([\s\S]*?ARRAY\['title', 'summary', 'tasks', 'sourceDraftId', 'approvalNote'\]/,
  );
  assert.match(validator, /jsonb_typeof\(p_plan -> 'sourceDraftId'\) NOT IN \('string', 'null'\)/);
  assert.match(validator, /jsonb_typeof\(p_plan -> 'approvalNote'\) NOT IN \('string', 'null'\)/);
  for (const key of [
    "clientTaskId",
    "title",
    "description",
    "priority",
    "assigneeId",
    "dueDate",
    "sourceKind",
    "sourceRef",
    "dependsOnClientTaskIds",
  ]) {
    assert.match(validator, new RegExp(`'${key}'`));
  }
  assert.match(validator, /jsonb_array_length\(p_plan -> 'tasks'\) NOT BETWEEN 1 AND 200/);
  assert.match(
    validator,
    /jsonb_array_length\(v_task -> 'dependsOnClientTaskIds'\) > 40/,
  );
  assert.match(validator, /131072/);
  assert.match(validator, /v_client_task_id = ANY\(v_seen_task_ids\)/);
  assert.match(validator, /v_dependency_id = ANY\(v_seen_dependency_ids\)/);

  const initialize = functionSql(
    "co_production",
    "initialize_production_plan",
  );
  assert.match(initialize, /WITH RECURSIVE dependency_edges/);
  assert.match(initialize, /MESSAGE = 'invalid_preproduction_dependency'/);
  assert.match(initialize, /MESSAGE = 'preproduction_dependency_cycle'/);
  assert.match(
    initialize,
    /pg_advisory_xact_lock[\s\S]*?project_preproduction_authorities AS authority[\s\S]*?FOR UPDATE/,
  );
  assert.match(
    initialize,
    /WHERE receipt\.project_id = p_project_id[\s\S]*?receipt\.request_id = p_request_id/,
  );
  assert.match(initialize, /MESSAGE = 'preproduction_idempotency_conflict'/);
  assert.match(
    initialize,
    /max\(plan\.revision_number\)[\s\S]*?v_current_plan_revision IS DISTINCT FROM p_expected_plan_revision/,
  );
  assert.match(initialize, /MESSAGE = 'preproduction_plan_version_conflict'/);
  assert.match(
    initialize,
    /FROM co_production\.proposal_handoff_receipts AS receipt[\s\S]*?receipt\.project_id = p_project_id/,
  );
  assert.match(initialize, /v_source_kind := 'accepted_proposal'/);
  assert.match(initialize, /v_source_kind := 'manual'/);
  assert.match(
    initialize,
    /INSERT INTO co_production\.production_tasks[\s\S]*?task\.value ->> 'clientTaskId'/,
  );
  assert.match(
    initialize,
    /dependent_task\.client_task_id = seed\.value ->> 'clientTaskId'/,
  );
  assert.match(
    initialize,
    /prerequisite_task\.client_task_id = dependency\.value #>> '\{\}'/,
  );
  assert.match(initialize, /GET DIAGNOSTICS v_inserted_dependency_count = ROW_COUNT/);
  assert.ok(
    initialize.indexOf("INSERT INTO co_production.production_plan_revisions") <
      initialize.indexOf("INSERT INTO co_production.production_tasks") &&
      initialize.indexOf("INSERT INTO co_production.production_tasks") <
        initialize.indexOf("INSERT INTO co_production.production_task_dependencies") &&
      initialize.indexOf("INSERT INTO co_production.project_preproduction_mutation_receipts") <
        initialize.indexOf("INSERT INTO co_production.project_preproduction_events") &&
      initialize.indexOf("INSERT INTO co_production.project_preproduction_events") <
        initialize.indexOf("UPDATE co_production.project_preproduction_authorities"),
  );
});

test("task mutation enforces exact patches, latest-plan versions, transitions, and completion actors", () => {
  const validator = functionSql(
    "co_production_private",
    "production_task_patch_is_valid",
  );
  assert.match(validator, /p_patch <> '\{\}'::jsonb/);
  assert.match(
    validator,
    /p_patch - ARRAY\[[\s\S]*?'status'[\s\S]*?'title'[\s\S]*?'description'[\s\S]*?'priority'[\s\S]*?'assigneeId'[\s\S]*?'dueDate'[\s\S]*?\] = '\{\}'::jsonb/,
  );
  assert.match(validator, /16384/);

  const mutate = functionSql("co_production", "mutate_production_task");
  assert.match(
    mutate,
    /pg_advisory_xact_lock[\s\S]*?project_preproduction_authorities AS authority[\s\S]*?FOR UPDATE/,
  );
  assert.match(mutate, /FROM co_production\.production_tasks AS task[\s\S]*?FOR UPDATE/);
  assert.match(mutate, /MESSAGE = 'preproduction_idempotency_conflict'/);
  assert.ok(
    mutate.indexOf("RETURN v_existing.result") <
      mutate.indexOf("v_latest_plan_revision_id IS DISTINCT FROM"),
    "an exact replay must survive a later replan",
  );
  assert.match(
    mutate,
    /v_latest_plan_revision_id IS DISTINCT FROM v_task\.plan_revision_id/,
  );
  assert.match(
    mutate,
    /v_task\.authority_version IS DISTINCT FROM p_expected_version/,
  );
  assert.match(mutate, /MESSAGE = 'preproduction_task_version_conflict'/);
  assert.match(mutate, /MESSAGE = 'preproduction_invalid_transition'/);
  assert.match(mutate, /v_task\.status = 'completed'[\s\S]*?v_new_status IN \('todo', 'in_progress'\)/);
  assert.match(mutate, /v_task\.status = 'cancelled'[\s\S]*?v_new_status = 'todo'/);
  assert.match(mutate, /completed_by = CASE[\s\S]*?THEN v_actor_id/);
  assert.match(mutate, /completed_at = CASE[\s\S]*?THEN v_now/);
  assert.match(
    mutate,
    /authority_version = v_new_task_version[\s\S]*?task\.authority_version = p_expected_version/,
  );
  assert.match(mutate, /is_project_internal_participant/);
  assert.ok(
    mutate.indexOf("INSERT INTO co_production.project_preproduction_mutation_receipts") <
      mutate.indexOf("INSERT INTO co_production.project_preproduction_events") &&
      mutate.indexOf("INSERT INTO co_production.project_preproduction_events") <
        mutate.indexOf("UPDATE co_production.project_preproduction_authorities"),
  );
});

test("read RPC returns the camelCase sanitized contract and role permissions", () => {
  const read = functionSql("co_production", "get_project_production_plan");
  assert.match(read, /SECURITY DEFINER/);
  assert.match(read, /SET search_path = ''/);
  for (const key of [
    "projectId",
    "authorityVersion",
    "eventHeadHash",
    "plan",
    "tasks",
    "dependencies",
    "permissions",
  ]) {
    assert.match(read, new RegExp(`'${key}'`));
  }
  for (const permission of ["role", "canInitialize", "canManage", "canUpdateStatus"]) {
    assert.match(read, new RegExp(`'${permission}'`));
  }
  assert.match(read, /'contentHash', v_plan\.content_hash/);
  assert.match(read, /'sourceReceiptId', v_plan\.source_receipt_id/);
  assert.match(read, /'taskId', dependency\.task_id/);
  assert.match(read, /'dependsOnTaskId', dependency\.depends_on_task_id/);
  assert.doesNotMatch(
    read,
    /inquiryId|accountId|primaryContactId|opportunityId|briefRevisionId|briefContentHash|originContextHash|linkHash|proposalContentHash|quoteContentHash|requestHash/,
  );
});

test("all authority tables are FORCE-RLS SELECT-only defenses with no direct grants", () => {
  for (const table of newTables) assertForcedProjectRead(table);
  assert.doesNotMatch(
    migration,
    /CREATE POLICY[^;]*FOR (?:INSERT|UPDATE|DELETE|ALL)\b/i,
  );
  assert.doesNotMatch(migration, /\bGRANT\b[^;]*\bON TABLE\b/i);
  assert.doesNotMatch(
    migration,
    /\bGRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER|ALL)\b/i,
  );

  const executeGrants = [
    ...migration.matchAll(
      /GRANT EXECUTE ON FUNCTION (co_production\.[a-z_][a-z0-9_]*\([^;]+?\))\s+TO authenticated;/g,
    ),
  ].map((match) => match[1].replace(/\s+/g, " "));
  assert.deepEqual(executeGrants, [
    "co_production.get_project_production_plan(uuid)",
    "co_production.initialize_production_plan(uuid, integer, uuid, jsonb)",
    "co_production.mutate_production_task(uuid, bigint, uuid, jsonb)",
  ]);
  assert.doesNotMatch(migration, /GRANT EXECUTE[\s\S]*?TO (?:anon|service_role|PUBLIC);/);
});

test("every function fixes its search path and every definer is explicitly revoked", () => {
  const functions = [
    ...migration.matchAll(
      /CREATE OR REPLACE FUNCTION ([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\(/g,
    ),
  ].map((match) => match[1]);
  assert.equal(functions.length, 13);
  for (const qualifiedName of functions) {
    const [schema, name] = qualifiedName.split(".");
    const sql = functionSql(schema, name);
    assert.match(sql, /SET search_path = ''/);
    if (sql.includes("SECURITY DEFINER")) {
      const escaped = escapeRegExp(qualifiedName);
      assert.match(
        migration,
        new RegExp(
          `REVOKE ALL ON FUNCTION ${escaped}\\([^;]*?\\)` +
            `\\s+FROM PUBLIC, anon, authenticated, service_role;`,
        ),
      );
    }
  }
});

test("authority mutations cannot mirror to activity or trigger external delivery", () => {
  assert.doesNotMatch(
    migration,
    /(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+|FROM\s+)?co_production\.activity_log\b/i,
  );
  assert.doesNotMatch(
    migration,
    /notification_outbox|webhook_delivery_outbox|outbound|send_(?:message|email|sms)|dispatch_(?:message|notification)|enqueue_(?:message|notification)|provider_send|pg_net|net\.http|http_(?:post|get)|extensions\.http/i,
  );
  assert.doesNotMatch(
    migration,
    /INSERT INTO co_production\.(?:projects|proposal_handoff_receipts|opportunity_lifecycle_events)\b/i,
  );
});
