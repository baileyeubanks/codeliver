import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "..");
const migrationPath =
  "supabase/migrations/20260716130000_project_script_revision_authority.sql";
const migration = readFileSync(resolve(repositoryRoot, migrationPath), "utf8");
const productionPlanMigration = readFileSync(
  resolve(
    repositoryRoot,
    "supabase/migrations/20260716040000_project_production_plan_task_authority.sql",
  ),
  "utf8",
);

function escapeRegExp(value: string): string {
  return value.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

function section(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, "missing section start: " + start);
  assert.notEqual(endIndex, -1, "missing section end: " + end);
  return source.slice(startIndex, endIndex);
}

function functionSql(source: string, qualifiedName: string): string {
  const match = new RegExp(
    "CREATE OR REPLACE FUNCTION\\s+" +
      escapeRegExp(qualifiedName) +
      "\\s*\\(",
  ).exec(source);
  assert.ok(match?.index !== undefined, "missing function " + qualifiedName);
  const end = source.indexOf("\n$$;", match.index);
  assert.notEqual(end, -1, "unterminated function " + qualifiedName);
  return source.slice(match.index, end + 4);
}

function normalizeSql(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

const scriptTable = section(
  migration,
  "CREATE TABLE co_production.project_script_revisions (",
  "COMMENT ON TABLE co_production.project_script_revisions",
);
const contentValidator = functionSql(
  migration,
  "co_production_private.project_script_content_is_valid",
);
const receiptVerifier = functionSql(
  migration,
  "co_production_private.verify_project_preproduction_receipt_hash",
);
const eventGuard = functionSql(
  migration,
  "co_production_private.guard_project_preproduction_event_insert",
);
const lineageGuard = functionSql(
  migration,
  "co_production_private.guard_project_script_revision_insert",
);
const getScript = functionSql(migration, "co_production.get_project_script");
const appendScript = functionSql(
  migration,
  "co_production.append_project_script_revision",
);
const submitScript = functionSql(
  migration,
  "co_production.submit_project_script_revision",
);
const decideScript = functionSql(
  migration,
  "co_production.decide_project_script_revision",
);

const scriptMutationKinds = [
  "project_script.created",
  "project_script.revised",
  "project_script.submitted",
  "project_script.approved",
  "project_script.changes_requested",
] as const;

test("migration is source-only, ordered after the brief binding, and keeps future visual authorities separate", () => {
  assert.match(migration, /^-- Canonical Co-Script revision authority/m);
  assert.match(migration, /additive, source-only, and intentionally unapplied/);
  assert.match(migration, /Storyboards[\s\S]*shot lists remain separate future authorities/i);
  assert.match(migration, /BEGIN;/);
  assert.match(migration, /COMMIT;\s*$/);
  assert.ok(
    migrationPath.includes("20260716130000"),
    "script authority must follow 20260716124000",
  );
  for (const relation of [
    "projects",
    "project_manual_origins",
    "project_preproject_origins",
    "project_brief_revisions",
    "project_preproduction_authorities",
    "project_preproduction_mutation_receipts",
    "project_preproduction_events",
  ]) {
    assert.match(
      migration,
      new RegExp(
        "to_regclass\\(\\s*'co_production\\." + relation + "'\\s*\\)",
      ),
    );
  }
  assert.match(
    migration,
    /project_brief_revisions_id_project_team_content_hash_key/,
  );
});

test("one project owns one immutable append-only revision stream with exact lineage", () => {
  assert.match(scriptTable, /id uuid PRIMARY KEY/);
  assert.match(scriptTable, /project_id uuid NOT NULL/);
  assert.match(scriptTable, /revision_number bigint NOT NULL/);
  assert.match(scriptTable, /UNIQUE \(project_id, revision_number\)/);
  assert.match(scriptTable, /base_revision_id uuid/);
  assert.match(
    scriptTable,
    /\(revision_number = 1 AND base_revision_id IS NULL\)[\s\S]*?\(revision_number > 1 AND base_revision_id IS NOT NULL\)/,
  );
  assert.match(
    scriptTable,
    /FOREIGN KEY \(base_revision_id, project_id\)[\s\S]*?REFERENCES co_production\.project_script_revisions\(id, project_id\)[\s\S]*?ON DELETE RESTRICT/,
  );
  assert.match(scriptTable, /content jsonb NOT NULL/);
  assert.match(
    scriptTable,
    /content_hash = co_production_private\.preproject_sha256\(content::text\)/,
  );
  assert.match(scriptTable, /change_summary text/);
  assert.match(scriptTable, /created_by uuid NOT NULL/);
  assert.match(scriptTable, /created_at timestamptz NOT NULL/);
  assert.doesNotMatch(
    scriptTable,
    /^\s+(?:status|state|is_current|current_revision_id|approved_at|submitted_at)\b/im,
  );
  assert.match(
    migration,
    /BEFORE UPDATE OR DELETE ON co_production\.project_script_revisions/,
  );
  assert.match(
    migration,
    /BEFORE TRUNCATE ON co_production\.project_script_revisions/,
  );
  assert.match(
    lineageGuard,
    /NEW\.revision_number IS DISTINCT FROM v_latest\.revision_number \+ 1/,
  );
  assert.match(
    lineageGuard,
    /NEW\.base_revision_id IS DISTINCT FROM v_latest\.id/,
  );
});

test("brief provenance is immutable, latest-bound for accepted proposals, nullable only for explicit manual origins", () => {
  assert.match(
    scriptTable,
    /source_kind IN \('accepted_proposal', 'manual'\)/,
  );
  assert.match(scriptTable, /source_project_brief_revision_id uuid/);
  assert.match(scriptTable, /source_project_brief_content_hash text/);
  assert.match(
    scriptTable,
    /source_kind = 'manual'[\s\S]*?source_project_brief_revision_id IS NULL[\s\S]*?source_project_brief_content_hash IS NULL/,
  );
  assert.match(
    scriptTable,
    /source_kind = 'accepted_proposal'[\s\S]*?source_project_brief_revision_id IS NOT NULL[\s\S]*?source_project_brief_content_hash IS NOT NULL/,
  );
  assert.match(
    scriptTable,
    /FOREIGN KEY \(\s*source_project_brief_revision_id,\s*project_id,\s*team_id,\s*source_project_brief_content_hash\s*\)[\s\S]*?REFERENCES co_production\.project_brief_revisions\(\s*id,\s*project_id,\s*team_id,\s*content_hash\s*\)/,
  );
  assert.match(lineageGuard, /v_has_accepted_origin = v_has_manual_origin/);
  assert.match(
    lineageGuard,
    /FROM co_production\.project_brief_revisions AS brief[\s\S]*?ORDER BY brief\.revision_number DESC[\s\S]*?LIMIT 1/,
  );
  assert.match(
    lineageGuard,
    /NEW\.source_project_brief_revision_id IS DISTINCT FROM v_latest_brief_id/,
  );
  assert.match(
    lineageGuard,
    /NEW\.source_project_brief_content_hash IS DISTINCT FROM v_latest_brief_hash/,
  );
  assert.match(
    appendScript,
    /v_has_accepted_origin = v_has_manual_origin[\s\S]*?project_script_origin_authority_invalid/,
  );
  assert.match(
    appendScript,
    /FROM co_production\.project_brief_revisions AS brief[\s\S]*?ORDER BY brief\.revision_number DESC[\s\S]*?LIMIT 1/,
  );
});

test("script content uses the exact v1 schema, enums, stable IDs, and hard document bounds", () => {
  assert.match(
    contentValidator,
    /ARRAY\[\s*'schemaVersion', 'title', 'logline', 'format',\s*'estimatedRuntimeSeconds', 'sections'\s*\]/,
  );
  assert.match(
    contentValidator,
    /p_content ->> 'schemaVersion' IS DISTINCT FROM 'cco\.script-content\.v1'/,
  );
  assert.match(
    contentValidator,
    /'commercial', 'documentary', 'interview', 'voice_over',\s*'screenplay', 'outline'/,
  );
  assert.match(
    contentValidator,
    /jsonb_array_length\(p_content -> 'sections'\)\s+NOT BETWEEN 1 AND 200/,
  );
  assert.match(
    contentValidator,
    /ARRAY\['id', 'heading', 'summary', 'estimatedDurationSeconds', 'blocks'\]/,
  );
  assert.match(
    contentValidator,
    /jsonb_array_length\(v_section -> 'blocks'\)\s+NOT BETWEEN 1 AND 200/,
  );
  assert.match(
    contentValidator,
    /ARRAY\['id', 'kind', 'text', 'speaker', 'parenthetical'\]/,
  );
  for (const kind of [
    "scene_heading",
    "visual",
    "action",
    "dialogue",
    "voice_over",
    "interview_question",
    "b_roll",
    "on_screen_text",
    "graphic",
    "music",
    "sfx",
    "transition",
    "note",
  ]) {
    assert.match(contentValidator, new RegExp("'" + kind + "'"));
  }
  assert.match(contentValidator, /v_stable_id = ANY\(v_seen_ids\)/);
  assert.match(contentValidator, /v_block_count > 2000/);
  assert.match(contentValidator, /v_normalized_text_chars > 200000/);
  assert.match(contentValidator, /v_normalized_text_chars <= 200000/);
  assert.match(contentValidator, /octet_length\(p_content::text\) > 524288/);
  assert.match(contentValidator, /preproject_safe_text/);
  assert.match(contentValidator, /pg_catalog\.btrim/);
});

test("shared receipts and events gain exact script targets and all five mutation kinds", () => {
  assert.match(
    migration,
    /ALTER TABLE co_production\.project_preproduction_mutation_receipts\s+ADD COLUMN script_revision_id uuid/,
  );
  assert.match(
    migration,
    /FOREIGN KEY \(script_revision_id, project_id\)[\s\S]*?REFERENCES co_production\.project_script_revisions\(id, project_id\)/,
  );
  for (const kind of scriptMutationKinds) {
    assert.match(migration, new RegExp("'" + escapeRegExp(kind) + "'"));
  }
  assert.match(
    migration,
    /mutation_kind IN \([\s\S]*?'project_script\.created'[\s\S]*?'project_script\.changes_requested'[\s\S]*?\)[\s\S]*?plan_revision_id IS NULL[\s\S]*?task_id IS NULL[\s\S]*?script_revision_id IS NOT NULL/,
  );
  assert.match(
    migration,
    /entity_kind IN \([\s\S]*?'production_plan_revision'[\s\S]*?'production_task'[\s\S]*?'project_script_revision'/,
  );
  assert.match(
    eventGuard,
    /NEW\.entity_kind IS DISTINCT FROM 'project_script_revision'[\s\S]*?NEW\.entity_id IS DISTINCT FROM v_receipt\.script_revision_id/,
  );
  assert.match(
    eventGuard,
    /NEW\.authority_version IS DISTINCT FROM v_authority\.authority_version \+ 1/,
  );
  assert.match(
    eventGuard,
    /NEW\.previous_event_hash IS DISTINCT FROM v_authority\.event_head_hash/,
  );
});

test("the explicit legacy receipt branch preserves the original plan and task hash payload exactly", () => {
  const priorVerifier = functionSql(
    productionPlanMigration,
    "co_production_private.verify_project_preproduction_receipt_hash",
  );
  const priorPayload = section(
    priorVerifier,
    "v_expected_hash :=",
    "\n\n  IF NEW.receipt_hash",
  );
  const preservedPayload = section(
    receiptVerifier,
    "v_expected_hash :=",
    "\n  ELSIF NEW.mutation_kind",
  );
  assert.equal(normalizeSql(preservedPayload), normalizeSql(priorPayload));
  assert.match(
    receiptVerifier,
    /IF NEW\.mutation_kind IN \(\s*'production_plan\.initialized',\s*'production_plan\.replanned',\s*'production_task\.mutated'\s*\) THEN/,
  );
  assert.match(
    receiptVerifier,
    /ELSIF NEW\.mutation_kind IN \([\s\S]*?'project_script\.created'[\s\S]*?'project_script\.changes_requested'/,
  );
  assert.match(
    receiptVerifier,
    /'scriptRevisionId', NEW\.script_revision_id/,
  );
});

test("effective state is derived in the required precedence without a mutable pointer", () => {
  const superseded = getScript.indexOf("THEN 'superseded'");
  const approved = getScript.indexOf("THEN 'approved'");
  const changesRequested = getScript.indexOf("THEN 'changes_requested'");
  const submitted = getScript.indexOf("THEN 'submitted'");
  const draft = getScript.indexOf("ELSE 'draft'");
  assert.ok(
    superseded >= 0 &&
      superseded < approved &&
      approved < changesRequested &&
      changesRequested < submitted &&
      submitted < draft,
  );
  assert.match(
    getScript,
    /later_revision\.revision_number > revision\.revision_number/,
  );
  for (const kind of [
    "project_script.approved",
    "project_script.changes_requested",
    "project_script.submitted",
  ]) {
    assert.match(getScript, new RegExp("'" + escapeRegExp(kind) + "'"));
  }
  assert.match(getScript, /'script', COALESCE\(v_revisions -> 0/);
  assert.match(getScript, /'revisions', v_revisions/);
});

test("RPC signatures and exact role thresholds exclude reviewer and viewer", () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION co_production\.get_project_script\(\s*p_project_id uuid\s*\)/,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION co_production\.append_project_script_revision\(\s*p_project_id uuid,\s*p_expected_authority_version bigint,\s*p_request_id uuid,\s*p_base_revision_id uuid,\s*p_change_summary text,\s*p_content jsonb\s*\)/,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION co_production\.submit_project_script_revision\(\s*p_project_id uuid,\s*p_script_revision_id uuid,\s*p_expected_authority_version bigint,\s*p_request_id uuid,\s*p_note text\s*\)/,
  );
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION co_production\.decide_project_script_revision\(\s*p_project_id uuid,\s*p_script_revision_id uuid,\s*p_expected_authority_version bigint,\s*p_request_id uuid,\s*p_decision text,\s*p_note text\s*\)/,
  );
  assert.match(
    getScript,
    /v_role NOT IN \('owner', 'admin', 'producer', 'editor', 'member'\)/,
  );
  assert.match(
    appendScript,
    /v_role NOT IN \('owner', 'admin', 'producer', 'editor'\)/,
  );
  assert.match(
    submitScript,
    /v_role NOT IN \('owner', 'admin', 'producer', 'editor'\)/,
  );
  assert.match(
    decideScript,
    /v_role NOT IN \('owner', 'admin', 'producer'\)/,
  );
  for (const command of [getScript, appendScript, submitScript, decideScript]) {
    assert.doesNotMatch(command, /v_role NOT IN \([^)]*reviewer/);
    assert.doesNotMatch(command, /v_role NOT IN \([^)]*viewer/);
  }
});

test("all commands replay exact receipts before shared authority conflicts", () => {
  for (const command of [appendScript, submitScript, decideScript]) {
    const replay = command.indexOf("RETURN v_existing.result");
    const versionConflict = command.indexOf(
      "IF v_authority.authority_version\n    IS DISTINCT FROM p_expected_authority_version",
    );
    assert.ok(replay >= 0 && replay < versionConflict);
    assert.match(command, /receipt\.project_id = p_project_id/);
    assert.match(command, /receipt\.request_id = p_request_id/);
    assert.match(command, /v_existing\.request_payload IS DISTINCT FROM v_request_payload/);
    assert.match(command, /v_existing\.request_hash IS DISTINCT FROM v_request_hash/);
    assert.match(command, /MESSAGE = 'project_script_idempotency_conflict'/);
    assert.match(command, /pg_advisory_xact_lock/);
  }
});

test("every command appends receipt then event then updates the authority head last", () => {
  for (const command of [appendScript, submitScript, decideScript]) {
    const receipt = command.indexOf(
      "INSERT INTO co_production.project_preproduction_mutation_receipts",
    );
    const event = command.indexOf(
      "INSERT INTO co_production.project_preproduction_events",
    );
    const authority = command.indexOf(
      "UPDATE co_production.project_preproduction_authorities",
    );
    assert.ok(receipt >= 0 && receipt < event && event < authority);
    assert.equal(
      (
        command.match(
          /UPDATE co_production\.project_preproduction_authorities/g,
        ) ?? []
      ).length,
      1,
    );
    assert.match(
      command,
      /authority_version = v_new_authority_version[\s\S]*?event_head_hash = v_event_hash/,
    );
  }
  assert.match(
    appendScript,
    /p_base_revision_id IS DISTINCT FROM v_latest\.id/,
  );
  assert.match(
    submitScript,
    /receipt\.mutation_kind IN \(\s*'project_script\.submitted',\s*'project_script\.approved',\s*'project_script\.changes_requested'/,
  );
  assert.match(
    decideScript,
    /p_decision IS NULL[\s\S]*?p_decision NOT IN \('approved', 'changes_requested'\)/,
  );
  assert.match(
    decideScript,
    /p_decision = 'changes_requested' AND p_note IS NULL/,
  );
  assert.match(
    decideScript,
    /v_current_state_kind IS DISTINCT FROM 'project_script\.submitted'/,
  );
});

test("FORCE RLS, member-only SELECT policies, and grants fail closed for service role", () => {
  assert.match(
    migration,
    /ALTER TABLE co_production\.project_script_revisions\s+ENABLE ROW LEVEL SECURITY;/,
  );
  assert.match(
    migration,
    /ALTER TABLE co_production\.project_script_revisions\s+FORCE ROW LEVEL SECURITY;/,
  );
  const policy = section(
    migration,
    "CREATE POLICY project_script_revisions_member_select",
    "ALTER POLICY project_preproduction_mutation_receipts_select",
  );
  assert.match(policy, /FOR SELECT TO authenticated/);
  assert.match(
    policy,
    /'owner', 'admin', 'producer', 'editor', 'member'/,
  );
  assert.doesNotMatch(policy, /reviewer|viewer|service_role/);
  assert.match(
    migration,
    /ALTER POLICY project_preproduction_mutation_receipts_select[\s\S]*?script_revision_id IS NULL[\s\S]*?'owner', 'admin', 'producer', 'editor', 'member'/,
  );
  assert.match(
    migration,
    /ALTER POLICY project_preproduction_events_select[\s\S]*?entity_kind <> 'project_script_revision'[\s\S]*?'owner', 'admin', 'producer', 'editor', 'member'/,
  );
  assert.doesNotMatch(
    migration,
    /CREATE POLICY[^;]*FOR (?:INSERT|UPDATE|DELETE|ALL)\b/i,
  );
  assert.doesNotMatch(
    migration,
    /\bGRANT\s+(?:INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER|ALL)\b/i,
  );
  assert.doesNotMatch(
    migration,
    /GRANT EXECUTE[\s\S]*?TO (?:PUBLIC|anon|service_role);/,
  );
  assert.equal(
    (
      migration.match(
        /GRANT EXECUTE ON FUNCTION[\s\S]*?\s+TO authenticated;/g,
      ) ?? []
    ).length,
    4,
  );
  assert.match(
    migration,
    /REVOKE ALL ON TABLE co_production\.project_script_revisions\s+FROM PUBLIC, anon, authenticated, service_role;/,
  );
});

test("every function fixes search_path and every definer is explicitly revoked", () => {
  const functions = [
    ...migration.matchAll(
      /CREATE OR REPLACE FUNCTION\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\s*\(/g,
    ),
  ].map((match) => match[1]);
  assert.deepEqual(functions.sort(), [
    "co_production.append_project_script_revision",
    "co_production.decide_project_script_revision",
    "co_production.get_project_script",
    "co_production.submit_project_script_revision",
    "co_production_private.guard_project_preproduction_event_insert",
    "co_production_private.guard_project_script_revision_insert",
    "co_production_private.project_script_content_is_valid",
    "co_production_private.verify_project_preproduction_receipt_hash",
  ]);
  for (const name of functions) {
    const sql = functionSql(migration, name);
    assert.match(sql, /SET search_path = ''/);
    if (sql.includes("SECURITY DEFINER")) {
      assert.match(
        migration,
        new RegExp(
          "REVOKE ALL ON FUNCTION\\s+" + escapeRegExp(name) + "\\([^;]*?\\)" +
            "\\s+FROM PUBLIC, anon, authenticated, service_role;",
        ),
      );
    }
  }
});

test("schema changes are additive except exact CHECK replacements and contain no destructive data SQL", () => {
  const droppedConstraints = [
    ...migration.matchAll(/\bDROP CONSTRAINT ([a-z_][a-z0-9_]*)/g),
  ].map((match) => match[1]);
  assert.deepEqual(droppedConstraints, [
    "project_preproduction_mutation_receipts_mutation_kind_check",
    "project_preproduction_receipts_target_shape",
    "project_preproduction_events_event_type_check",
    "project_preproduction_events_entity_kind_check",
  ]);
  assert.doesNotMatch(
    migration,
    /\bDROP\s+(?:TABLE|SCHEMA|COLUMN|FUNCTION|TRIGGER|POLICY)\b/i,
  );
  assert.doesNotMatch(migration, /\bDELETE\s+FROM\b/i);
  assert.doesNotMatch(migration, /\bTRUNCATE\s+TABLE\b/i);
  assert.doesNotMatch(migration, /\bALTER\s+TABLE[\s\S]*?\bDROP\s+COLUMN\b/i);
  assert.doesNotMatch(
    migration,
    /notification_outbox|webhook_delivery_outbox|pg_net|net\.http|send_(?:email|sms|message)/i,
  );
});

const postgresAuthorityChain = [
  "20260715093300_fail_closed_co_production_authority.sql",
  "20260715170500_proposal_handoff_authority.sql",
  "20260715183000_identity_governance_authority.sql",
  "20260716002000_project_operating_source_projection.sql",
  "20260716020000_preproject_crm_authority.sql",
  "20260716030000_preproject_project_origin_authority.sql",
  "20260716040000_project_production_plan_task_authority.sql",
  "20260716090001_project_manual_origin_authority.sql",
  "20260716100000_opportunity_proposal_readiness_authority.sql",
  "20260716113000_proposal_activation_authorization_authority.sql",
  "20260716123000_project_brief_projection_authority.sql",
  "20260716124000_production_plan_project_brief_binding.sql",
  "20260716130000_project_script_revision_authority.sql",
] as const;

function runDocker(args: string[], input?: string): string {
  const result = spawnSync("docker", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    input,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(
    result.status,
    0,
    "docker " + args.join(" ") + "\n" + result.stdout + "\n" + result.stderr,
  );
  return result.stdout;
}

function behaviorProofSql(): string {
  return [
    "INSERT INTO auth.users(id) VALUES",
    "  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),",
    "  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');",
    "",
    "INSERT INTO co_production.projects (id, team_id, owner_id, name)",
    "VALUES",
    "  ('11111111-1111-4111-8111-111111111111', NULL,",
    "   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Manual script project'),",
    "  ('22222222-2222-4222-8222-222222222222', NULL,",
    "   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Reviewer project'),",
    "  ('33333333-3333-4333-8333-333333333333', NULL,",
    "   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Missing origin project');",
    "",
    "INSERT INTO co_production.project_manual_origins (",
    "  project_id, team_id, created_by, request_id, request_hash, source_kind,",
    "  project_name, project_description, created_at",
    ")",
    "SELECT",
    "  seed.project_id,",
    "  NULL,",
    "  seed.actor_id,",
    "  seed.request_id,",
    "  co_production_private.preproject_sha256(",
    "    pg_catalog.jsonb_build_object(",
    "      'operation', 'create_manual_project_with_origin',",
    "      'actorId', seed.actor_id,",
    "      'projectId', seed.project_id,",
    "      'teamId', NULL,",
    "      'requestId', seed.request_id,",
    "      'name', seed.project_name,",
    "      'description', NULL",
    "    )::text",
    "  ),",
    "  'manual',",
    "  seed.project_name,",
    "  NULL,",
    "  statement_timestamp()",
    "FROM (VALUES",
    "  ('11111111-1111-4111-8111-111111111111'::uuid,",
    "   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,",
    "   '10000000-0000-4000-8000-000000000001'::uuid,",
    "   'Manual script project'::text),",
    "  ('22222222-2222-4222-8222-222222222222'::uuid,",
    "   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,",
    "   '10000000-0000-4000-8000-000000000002'::uuid,",
    "   'Reviewer project'::text)",
    ") AS seed(project_id, actor_id, request_id, project_name);",
    "",
    "INSERT INTO co_production.project_members (",
    "  project_id, user_id, role",
    ") VALUES (",
    "  '22222222-2222-4222-8222-222222222222',",
    "  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',",
    "  'reviewer'",
    ");",
    "",
    "SET ROLE authenticated;",
    "",
    "DO $project_script_behavior$",
    "DECLARE",
    "  v_project_id constant uuid :=",
    "    '11111111-1111-4111-8111-111111111111'::uuid;",
    "  v_reviewer_project_id constant uuid :=",
    "    '22222222-2222-4222-8222-222222222222'::uuid;",
    "  v_missing_origin_project_id constant uuid :=",
    "    '33333333-3333-4333-8333-333333333333'::uuid;",
    "  v_content_one jsonb := '{",
    "    \"schemaVersion\":\"cco.script-content.v1\",",
    "    \"title\":\"Launch Film\",",
    "    \"logline\":null,",
    "    \"format\":\"commercial\",",
    "    \"estimatedRuntimeSeconds\":30,",
    "    \"sections\":[{",
    "      \"id\":\"section.open\",",
    "      \"heading\":\"Open\",",
    "      \"summary\":null,",
    "      \"estimatedDurationSeconds\":30,",
    "      \"blocks\":[{",
    "        \"id\":\"block.open.1\",",
    "        \"kind\":\"visual\",",
    "        \"text\":\"Product on white.\",",
    "        \"speaker\":null,",
    "        \"parenthetical\":null",
    "      }]",
    "    }]",
    "  }'::jsonb;",
    "  v_content_two jsonb;",
    "  v_content_three jsonb;",
    "  v_invalid_content jsonb;",
    "  v_result jsonb;",
    "  v_replay jsonb;",
    "  v_read jsonb;",
    "  v_plan jsonb;",
    "  v_revision_one uuid;",
    "  v_revision_two uuid;",
    "  v_revision_three uuid;",
    "  v_task_id uuid;",
    "  v_state text;",
    "BEGIN",
    "  v_content_two := pg_catalog.jsonb_set(",
    "    pg_catalog.jsonb_set(",
    "      v_content_one,",
    "      '{title}',",
    "      '\"Launch Film v2\"'::jsonb",
    "    ),",
    "    '{sections,0,blocks,0,text}',",
    "    '\"Product enters frame.\"'::jsonb",
    "  );",
    "  v_content_three := pg_catalog.jsonb_set(",
    "    pg_catalog.jsonb_set(",
    "      v_content_two,",
    "      '{title}',",
    "      '\"Launch Film v3\"'::jsonb",
    "    ),",
    "    '{sections,0,blocks,0,text}',",
    "    '\"Product enters and resolves.\"'::jsonb",
    "  );",
    "",
    "  v_result := co_production.append_project_script_revision(",
    "    v_project_id,",
    "    0,",
    "    '40000000-0000-4000-8000-000000000001',",
    "    NULL,",
    "    NULL,",
    "    v_content_one",
    "  );",
    "  v_revision_one := (v_result ->> 'scriptRevisionId')::uuid;",
    "  IF v_result ->> 'authorityVersion' <> '1'",
    "    OR v_result ->> 'effectiveState' <> 'draft'",
    "    OR v_result ->> 'sourceProjectBriefRevisionId' IS NOT NULL",
    "    OR v_result ->> 'sourceProjectBriefContentHash' IS NOT NULL",
    "  THEN",
    "    RAISE EXCEPTION 'manual revision 1 result mismatch';",
    "  END IF;",
    "",
    "  v_replay := co_production.append_project_script_revision(",
    "    v_project_id,",
    "    0,",
    "    '40000000-0000-4000-8000-000000000001',",
    "    NULL,",
    "    NULL,",
    "    v_content_one",
    "  );",
    "  IF v_replay ->> 'replayed' <> 'true'",
    "    OR (v_replay ->> 'scriptRevisionId')::uuid <> v_revision_one",
    "  THEN",
    "    RAISE EXCEPTION 'revision 1 exact replay failed';",
    "  END IF;",
    "",
    "  v_result := co_production.append_project_script_revision(",
    "    v_project_id,",
    "    1,",
    "    '40000000-0000-4000-8000-000000000002',",
    "    v_revision_one,",
    "    'Tightened opening',",
    "    v_content_two",
    "  );",
    "  v_revision_two := (v_result ->> 'scriptRevisionId')::uuid;",
    "  v_read := co_production.get_project_script(v_project_id);",
    "  SELECT item.value ->> 'effectiveState'",
    "  INTO v_state",
    "  FROM pg_catalog.jsonb_array_elements(v_read -> 'revisions') AS item(value)",
    "  WHERE item.value ->> 'id' = v_revision_one::text;",
    "  IF v_state IS DISTINCT FROM 'superseded'",
    "    OR v_read #>> '{script,effectiveState}' <> 'draft'",
    "  THEN",
    "    RAISE EXCEPTION 'derived superseded or draft state mismatch';",
    "  END IF;",
    "",
    "  v_result := co_production.submit_project_script_revision(",
    "    v_project_id,",
    "    v_revision_two,",
    "    2,",
    "    '40000000-0000-4000-8000-000000000003',",
    "    'Ready for producer review'",
    "  );",
    "  IF v_result ->> 'effectiveState' <> 'submitted' THEN",
    "    RAISE EXCEPTION 'submission state mismatch';",
    "  END IF;",
    "  v_replay := co_production.submit_project_script_revision(",
    "    v_project_id,",
    "    v_revision_two,",
    "    2,",
    "    '40000000-0000-4000-8000-000000000003',",
    "    'Ready for producer review'",
    "  );",
    "  IF v_replay ->> 'replayed' <> 'true' THEN",
    "    RAISE EXCEPTION 'submission exact replay failed';",
    "  END IF;",
    "",
    "  v_result := co_production.decide_project_script_revision(",
    "    v_project_id,",
    "    v_revision_two,",
    "    3,",
    "    '40000000-0000-4000-8000-000000000004',",
    "    'changes_requested',",
    "    'Tighten the close'",
    "  );",
    "  IF v_result ->> 'effectiveState' <> 'changes_requested' THEN",
    "    RAISE EXCEPTION 'changes requested state mismatch';",
    "  END IF;",
    "",
    "  BEGIN",
    "    PERFORM co_production.decide_project_script_revision(",
    "      v_project_id,",
    "      v_revision_two,",
    "      4,",
    "      '40000000-0000-4000-8000-000000000099',",
    "      'changes_requested',",
    "      NULL",
    "    );",
    "    RAISE EXCEPTION 'missing changes-requested note was accepted';",
    "  EXCEPTION WHEN SQLSTATE '22023' THEN",
    "    NULL;",
    "  END;",
    "",
    "  v_result := co_production.append_project_script_revision(",
    "    v_project_id,",
    "    4,",
    "    '40000000-0000-4000-8000-000000000005',",
    "    v_revision_two,",
    "    'Resolved producer note',",
    "    v_content_three",
    "  );",
    "  v_revision_three := (v_result ->> 'scriptRevisionId')::uuid;",
    "  PERFORM co_production.submit_project_script_revision(",
    "    v_project_id,",
    "    v_revision_three,",
    "    5,",
    "    '40000000-0000-4000-8000-000000000006',",
    "    NULL",
    "  );",
    "  PERFORM co_production.decide_project_script_revision(",
    "    v_project_id,",
    "    v_revision_three,",
    "    6,",
    "    '40000000-0000-4000-8000-000000000007',",
    "    'approved',",
    "    NULL",
    "  );",
    "  v_read := co_production.get_project_script(v_project_id);",
    "  IF v_read #>> '{script,effectiveState}' <> 'approved' THEN",
    "    RAISE EXCEPTION 'approved state mismatch';",
    "  END IF;",
    "  SELECT item.value ->> 'effectiveState'",
    "  INTO v_state",
    "  FROM pg_catalog.jsonb_array_elements(v_read -> 'revisions') AS item(value)",
    "  WHERE item.value ->> 'id' = v_revision_two::text;",
    "  IF v_state IS DISTINCT FROM 'superseded' THEN",
    "    RAISE EXCEPTION 'later revision did not supersede changes-requested revision';",
    "  END IF;",
    "",
    "  v_plan := co_production.initialize_production_plan(",
    "    v_project_id,",
    "    0,",
    "    '40000000-0000-4000-8000-000000000008',",
    "    '{",
    "      \"title\":\"Production plan\",",
    "      \"summary\":null,",
    "      \"tasks\":[{",
    "        \"clientTaskId\":\"script.shoot\",",
    "        \"title\":\"Shoot\",",
    "        \"description\":null,",
    "        \"priority\":\"normal\",",
    "        \"assigneeId\":null,",
    "        \"dueDate\":null,",
    "        \"sourceKind\":\"manual\",",
    "        \"sourceRef\":null,",
    "        \"dependsOnClientTaskIds\":[]",
    "      }],",
    "      \"sourceDraftId\":null,",
    "      \"approvalNote\":null",
    "    }'::jsonb",
    "  );",
    "  v_plan := co_production.get_project_production_plan(v_project_id);",
    "  v_task_id := (v_plan #>> '{tasks,0,id}')::uuid;",
    "  PERFORM co_production.mutate_production_task(",
    "    v_task_id,",
    "    1,",
    "    '40000000-0000-4000-8000-000000000009',",
    "    '{\"status\":\"in_progress\"}'::jsonb",
    "  );",
    "",
    "  v_replay := co_production.append_project_script_revision(",
    "    v_project_id,",
    "    0,",
    "    '40000000-0000-4000-8000-000000000001',",
    "    NULL,",
    "    NULL,",
    "    v_content_one",
    "  );",
    "  IF v_replay ->> 'replayed' <> 'true' THEN",
    "    RAISE EXCEPTION 'script replay failed after unrelated authority writes';",
    "  END IF;",
    "  v_read := co_production.get_project_script(v_project_id);",
    "  IF v_read ->> 'authorityVersion' <> '9'",
    "    OR v_read #>> '{script,effectiveState}' <> 'approved'",
    "  THEN",
    "    RAISE EXCEPTION 'shared authority or final state mismatch';",
    "  END IF;",
    "",
    "  BEGIN",
    "    PERFORM co_production.get_project_script(v_reviewer_project_id);",
    "    RAISE EXCEPTION 'reviewer was allowed to read script authority';",
    "  EXCEPTION WHEN insufficient_privilege THEN",
    "    NULL;",
    "  END;",
    "",
    "  BEGIN",
    "    PERFORM co_production.append_project_script_revision(",
    "      v_missing_origin_project_id,",
    "      0,",
    "      '40000000-0000-4000-8000-000000000010',",
    "      NULL,",
    "      NULL,",
    "      v_content_one",
    "    );",
    "    RAISE EXCEPTION 'project without explicit origin accepted a script';",
    "  EXCEPTION WHEN SQLSTATE '55000' THEN",
    "    NULL;",
    "  END;",
    "",
    "  v_invalid_content := pg_catalog.jsonb_set(",
    "    v_content_one,",
    "    '{sections,0,blocks,0,id}',",
    "    '\"section.open\"'::jsonb",
    "  );",
    "  BEGIN",
    "    PERFORM co_production.append_project_script_revision(",
    "      v_project_id,",
    "      9,",
    "      '40000000-0000-4000-8000-000000000011',",
    "      v_revision_three,",
    "      NULL,",
    "      v_invalid_content",
    "    );",
    "    RAISE EXCEPTION 'duplicate stable ID content was accepted';",
    "  EXCEPTION WHEN SQLSTATE '22023' THEN",
    "    NULL;",
    "  END;",
    "END",
    "$project_script_behavior$;",
    "",
    "RESET ROLE;",
    "",
    "DO $project_script_internal_proof$",
    "DECLARE",
    "  v_project_id constant uuid :=",
    "    '11111111-1111-4111-8111-111111111111'::uuid;",
    "  v_head_hash text;",
    "BEGIN",
    "  IF (",
    "    SELECT authority.authority_version",
    "    FROM co_production.project_preproduction_authorities AS authority",
    "    WHERE authority.project_id = v_project_id",
    "  ) IS DISTINCT FROM 9 THEN",
    "    RAISE EXCEPTION 'authority did not advance exactly once per mutation';",
    "  END IF;",
    "  IF (",
    "    SELECT pg_catalog.count(*)",
    "    FROM co_production.project_script_revisions AS revision",
    "    WHERE revision.project_id = v_project_id",
    "  ) <> 3 THEN",
    "    RAISE EXCEPTION 'script replay or workflow command created extra revisions';",
    "  END IF;",
    "  IF (",
    "    SELECT pg_catalog.count(*)",
    "    FROM co_production.project_preproduction_mutation_receipts AS receipt",
    "    WHERE receipt.project_id = v_project_id",
    "  ) <> 9 OR (",
    "    SELECT pg_catalog.count(*)",
    "    FROM co_production.project_preproduction_events AS event_record",
    "    WHERE event_record.project_id = v_project_id",
    "  ) <> 9 THEN",
    "    RAISE EXCEPTION 'receipt or event cardinality mismatch';",
    "  END IF;",
    "  IF NOT EXISTS (",
    "    SELECT 1",
    "    FROM co_production.project_preproduction_mutation_receipts AS receipt",
    "    WHERE receipt.project_id = v_project_id",
    "      AND receipt.mutation_kind = 'production_plan.initialized'",
    "  ) OR NOT EXISTS (",
    "    SELECT 1",
    "    FROM co_production.project_preproduction_mutation_receipts AS receipt",
    "    WHERE receipt.project_id = v_project_id",
    "      AND receipt.mutation_kind = 'production_task.mutated'",
    "  ) THEN",
    "    RAISE EXCEPTION 'legacy plan/task receipt hash branches did not execute';",
    "  END IF;",
    "  IF EXISTS (",
    "    SELECT 1",
    "    FROM (",
    "      SELECT",
    "        event_record.previous_event_hash,",
    "        COALESCE(",
    "          pg_catalog.lag(event_record.event_hash) OVER (",
    "            ORDER BY event_record.authority_version",
    "          ),",
    "          'sha256:' || pg_catalog.repeat('0', 64)",
    "        ) AS expected_previous_hash",
    "      FROM co_production.project_preproduction_events AS event_record",
    "      WHERE event_record.project_id = v_project_id",
    "    ) AS chain",
    "    WHERE chain.previous_event_hash IS DISTINCT FROM chain.expected_previous_hash",
    "  ) THEN",
    "    RAISE EXCEPTION 'event hash chain is discontinuous';",
    "  END IF;",
    "  SELECT event_record.event_hash",
    "  INTO v_head_hash",
    "  FROM co_production.project_preproduction_events AS event_record",
    "  WHERE event_record.project_id = v_project_id",
    "  ORDER BY event_record.authority_version DESC",
    "  LIMIT 1;",
    "  IF (",
    "    SELECT authority.event_head_hash",
    "    FROM co_production.project_preproduction_authorities AS authority",
    "    WHERE authority.project_id = v_project_id",
    "  ) IS DISTINCT FROM v_head_hash THEN",
    "    RAISE EXCEPTION 'authority event head does not match the chain';",
    "  END IF;",
    "  IF EXISTS (",
    "    SELECT 1",
    "    FROM co_production.project_script_revisions AS revision",
    "    WHERE revision.project_id = v_project_id",
    "      AND (",
    "        revision.source_kind <> 'manual'",
    "        OR revision.source_project_brief_revision_id IS NOT NULL",
    "        OR revision.source_project_brief_content_hash IS NOT NULL",
    "      )",
    "  ) THEN",
    "    RAISE EXCEPTION 'manual provenance was not null-bound';",
    "  END IF;",
    "  IF EXISTS (",
    "    SELECT 1",
    "    FROM co_production.project_preproduction_authorities AS authority",
    "    WHERE authority.project_id =",
    "      '33333333-3333-4333-8333-333333333333'::uuid",
    "  ) THEN",
    "    RAISE EXCEPTION 'failed origin transaction left an authority row';",
    "  END IF;",
    "END",
    "$project_script_internal_proof$;",
    "",
    "SET ROLE service_role;",
    "DO $project_script_service_role_proof$",
    "BEGIN",
    "  BEGIN",
    "    PERFORM co_production.get_project_script(",
    "      '11111111-1111-4111-8111-111111111111'::uuid",
    "    );",
    "    RAISE EXCEPTION 'service role executed project script RPC';",
    "  EXCEPTION WHEN insufficient_privilege THEN",
    "    NULL;",
    "  END;",
    "  BEGIN",
    "    PERFORM 1 FROM co_production.project_script_revisions;",
    "    RAISE EXCEPTION 'service role read project script table';",
    "  EXCEPTION WHEN insufficient_privilege THEN",
    "    NULL;",
    "  END;",
    "END",
    "$project_script_service_role_proof$;",
    "RESET ROLE;",
  ].join("\n");
}

test(
  "PostgreSQL 15 proves replay, derived states, hash compatibility, roles, and fail-closed origin behavior",
  {
    skip: process.env.CCO_PROJECT_SCRIPT_POSTGRES_PROOF !== "1",
    timeout: 120_000,
  },
  async () => {
    const containerName =
      "cco-project-script-proof-" + randomUUID().replaceAll("-", "").slice(0, 12);
    try {
      runDocker([
        "run",
        "--detach",
        "--name",
        containerName,
        "--env",
        "POSTGRES_PASSWORD=postgres",
        "--mount",
        "type=bind,source=" + repositoryRoot + ",target=/workspace,readonly",
        "postgres:15",
        "-c",
        "wal_level=logical",
      ]);

      let ready = false;
      for (let attempt = 0; attempt < 120; attempt += 1) {
        const readiness = spawnSync(
          "docker",
          ["exec", containerName, "pg_isready", "--username", "postgres"],
          { encoding: "utf8" },
        );
        const logs = spawnSync("docker", ["logs", containerName], {
          encoding: "utf8",
        });
        const logOutput = (logs.stdout ?? "") + (logs.stderr ?? "");
        if (
          readiness.status === 0 &&
          logOutput.includes(
            "PostgreSQL init process complete; ready for start up.",
          )
        ) {
          ready = true;
          break;
        }
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
      }
      assert.ok(ready, "PostgreSQL 15 proof container did not become ready");

      runDocker([
        "exec",
        containerName,
        "psql",
        "--username",
        "postgres",
        "--dbname",
        "postgres",
        "--set",
        "ON_ERROR_STOP=1",
        "--file",
        "/workspace/scripts/certification/preproject-project-origin-authority-fixture.sql",
      ]);
      for (const authorityMigration of postgresAuthorityChain) {
        runDocker([
          "exec",
          containerName,
          "psql",
          "--username",
          "postgres",
          "--dbname",
          "postgres",
          "--set",
          "ON_ERROR_STOP=1",
          "--file",
          "/workspace/supabase/migrations/" + authorityMigration,
        ]);
      }
      runDocker(
        [
          "exec",
          "-i",
          containerName,
          "psql",
          "--username",
          "postgres",
          "--dbname",
          "postgres",
          "--set",
          "ON_ERROR_STOP=1",
        ],
        behaviorProofSql(),
      );
    } finally {
      spawnSync("docker", ["rm", "--force", containerName], {
        encoding: "utf8",
      });
    }
  },
);
