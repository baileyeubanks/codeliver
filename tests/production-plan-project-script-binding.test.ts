import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "..");
const migrationPath =
  "supabase/migrations/20260716131000_production_plan_project_script_binding.sql";
const migration = readFileSync(resolve(repositoryRoot, migrationPath), "utf8");

function boundedSection(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing section start: ${start}`);
  assert.notEqual(endIndex, -1, `missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
}

function functionSql(qualifiedName: string): string {
  const nameIndex = migration.indexOf(`${qualifiedName}(`);
  assert.notEqual(nameIndex, -1, `missing function ${qualifiedName}`);
  const start = migration.lastIndexOf("CREATE OR REPLACE FUNCTION", nameIndex);
  const end = migration.indexOf("\n$$;", nameIndex);
  assert.notEqual(start, -1, `missing function start ${qualifiedName}`);
  assert.notEqual(end, -1, `unterminated function ${qualifiedName}`);
  return migration.slice(start, end + 4);
}

const draftTable = boundedSection(
  migration,
  "CREATE TABLE co_production.production_plan_script_drafts (",
  "ALTER TABLE co_production.project_preproduction_mutation_receipts",
);
const bindingTable = boundedSection(
  migration,
  "CREATE TABLE co_production.production_plan_script_bindings (",
  "CREATE OR REPLACE FUNCTION\n  co_production_private.verify_project_preproduction_receipt_hash()",
);
const derive = functionSql(
  "co_production_private.derive_project_script_plan_content",
);
const draftInsertGuard = functionSql(
  "co_production_private.guard_production_plan_script_draft_insert",
);
const planInsertGuard = functionSql(
  "co_production_private.enforce_production_plan_script_draft",
);
const bindingTrigger = functionSql(
  "co_production_private.bind_production_plan_script_draft_receipt",
);
const receiptHashGuard = functionSql(
  "co_production_private.verify_project_preproduction_receipt_hash",
);
const eventGuard = functionSql(
  "co_production_private.guard_project_preproduction_event_insert",
);
const proposal = functionSql(
  "co_production.get_project_script_plan_proposal",
);
const generate = functionSql(
  "co_production.generate_project_script_plan_draft",
);
const approve = functionSql(
  "co_production.approve_project_script_plan_draft",
);

test("migration replaces auto-binding with explicit governed draft authority", () => {
  assert.match(migration, /^-- Govern approved-script production-plan drafts/m);
  assert.match(migration, /Generating a draft never activates a plan/);
  assert.match(migration, /BEGIN;/);
  assert.match(migration, /COMMIT;\s*$/);
  assert.ok(migrationPath.includes("20260716131000"));

  assert.doesNotMatch(
    migration,
    /ADD COLUMN source_project_script_(?:revision_id|content_hash)/,
  );
  assert.doesNotMatch(
    migration,
    /NEW\.source_project_script_(?:revision_id|content_hash)\s*:=/,
  );
  assert.doesNotMatch(
    migration,
    /bind_production_plan_project_script/,
  );
});

test("script identity and immutable drafts preserve exact source and request evidence", () => {
  assert.match(
    migration,
    /ADD CONSTRAINT project_script_revisions_id_project_content_hash_key\s+UNIQUE \(id, project_id, content_hash\);/,
  );
  for (const column of [
    "id uuid PRIMARY KEY",
    "project_id uuid NOT NULL",
    "team_id uuid",
    "source_project_script_revision_id uuid NOT NULL",
    "source_project_script_content_hash text NOT NULL",
    "derivation_version text NOT NULL",
    "content jsonb NOT NULL",
    "content_hash text NOT NULL",
    "request_id uuid NOT NULL",
    "request_hash text NOT NULL",
    "generated_by uuid NOT NULL",
    "generated_at timestamptz NOT NULL",
  ]) {
    assert.ok(draftTable.includes(column), `missing draft column: ${column}`);
  }
  assert.match(
    draftTable,
    /derivation_version = 'cco\.script-plan\.v1'/,
  );
  assert.match(
    draftTable,
    /preproject_exact_json_keys\(\s*content,\s*ARRAY\['title', 'summary', 'tasks'\]/,
  );
  assert.match(
    draftTable,
    /UNIQUE \(\s*project_id,\s*source_project_script_revision_id,\s*derivation_version\s*\)/,
  );
  assert.match(
    draftTable,
    /FOREIGN KEY \(\s*source_project_script_revision_id,\s*project_id,\s*source_project_script_content_hash\s*\)\s+REFERENCES co_production\.project_script_revisions\(\s*id,\s*project_id,\s*content_hash\s*\)/,
  );
  assert.match(
    draftTable,
    /content_hash = co_production_private\.preproject_sha256\(content::text\)/,
  );
});

test("bindings exactly join plan, draft, script, receipt, and producer approval", () => {
  for (const column of [
    "plan_revision_id uuid NOT NULL",
    "project_id uuid NOT NULL",
    "team_id uuid",
    "plan_draft_id uuid NOT NULL",
    "source_project_script_revision_id uuid NOT NULL",
    "source_project_script_content_hash text NOT NULL",
    "plan_mutation_receipt_id uuid NOT NULL",
    "approval_note text NOT NULL",
    "approved_by uuid NOT NULL",
    "approved_at timestamptz NOT NULL",
  ]) {
    assert.ok(bindingTable.includes(column), `missing binding column: ${column}`);
  }
  assert.match(bindingTable, /UNIQUE \(plan_revision_id\)/);
  assert.match(bindingTable, /UNIQUE \(plan_draft_id\)/);
  assert.match(bindingTable, /UNIQUE \(plan_mutation_receipt_id\)/);
  assert.match(
    bindingTable,
    /FOREIGN KEY \(plan_revision_id, project_id\)\s+REFERENCES co_production\.production_plan_revisions\(id, project_id\)/,
  );
  assert.match(
    bindingTable,
    /FOREIGN KEY \(\s*plan_draft_id,\s*project_id,\s*source_project_script_revision_id,\s*source_project_script_content_hash\s*\)/,
  );
  assert.match(
    bindingTable,
    /FOREIGN KEY \(\s*plan_mutation_receipt_id,\s*project_id,\s*plan_revision_id\s*\)/,
  );
  assert.match(
    bindingTable,
    /preproject_safe_text\(approval_note, 1, 4000\)/,
  );
});

test("private derivation matches the TypeScript title, summary, task, and cue contract", () => {
  assert.match(derive, /IMMUTABLE/);
  assert.match(derive, /STRICT/);
  assert.match(derive, /PARALLEL SAFE/);
  assert.match(derive, /SET search_path = ''/);
  assert.match(
    derive,
    /'title',[\s\S]*?p_script_content ->> 'title'\) \|\| ' production plan'[\s\S]*?240/,
  );
  assert.match(
    derive,
    /'Production plan derived from the approved '[\s\S]*?replace\(p_script_content ->> 'format', '_', ' '\)[\s\S]*?' script\.'/,
  );
  assert.match(derive, /WHERE block\.value ->> 'kind' = 'interview_question'/);
  assert.match(derive, /IN \('visual', 'action', 'b_roll'\)/);
  assert.match(derive, /v_prefix := 'Plan interview: '/);
  assert.match(derive, /v_prefix := 'Plan coverage: '/);
  assert.match(derive, /v_prefix := 'Plan section: '/);

  for (const cueLabel of [
    "Scene",
    "Visual",
    "Action",
    "Dialogue",
    "Voice over",
    "Interview question",
    "B-roll",
    "On-screen text",
    "Graphic",
    "Music",
    "Sound effect",
    "Transition",
    "Production note",
  ]) {
    assert.ok(derive.includes(`THEN '${cueLabel}'`), cueLabel);
  }
  assert.match(derive, /'Purpose: '/);
  assert.match(derive, /'Target runtime: '/);
  assert.match(derive, /'Script cues:'/);
  assert.match(derive, /pg_catalog\.left\(v_description, 4000\)/);
  assert.match(
    derive,
    /'clientTaskId', 'script-section-'[\s\S]*?lpad\(v_section_number::text, 3, '0'\)/,
  );
  assert.match(derive, /'priority', 'normal'/);
  assert.match(derive, /'assigneeId', NULL/);
  assert.match(derive, /'dueDate', NULL/);
  assert.match(derive, /'sourceKind', 'plan'/);
  assert.match(
    derive,
    /'sourceRef', 'script-section:' \|\| \(v_section ->> 'id'\)/,
  );
  assert.match(derive, /'dependsOnClientTaskIds', '\[\]'::jsonb/);
});

test("draft generation is the only new receipt/event kind and preserves legacy hashes", () => {
  assert.match(
    migration,
    /ADD COLUMN plan_draft_id uuid/,
  );
  assert.match(
    migration,
    /mutation_kind = 'production_plan_draft\.generated'[\s\S]*?plan_revision_id IS NULL[\s\S]*?task_id IS NULL[\s\S]*?script_revision_id IS NULL[\s\S]*?plan_draft_id IS NOT NULL/,
  );
  assert.match(
    migration,
    /entity_kind IN \([\s\S]*?'production_plan_script_draft'/,
  );
  assert.equal(
    (migration.match(/'production_plan_draft\.generated'/g) ?? []).length > 0,
    true,
  );
  assert.doesNotMatch(migration, /production_plan_draft\.(?:approved|activated)/);

  const legacyBranch = boundedSection(
    receiptHashGuard,
    "IF NEW.mutation_kind IN (",
    "ELSIF NEW.mutation_kind IN (",
  );
  assert.doesNotMatch(legacyBranch, /scriptRevisionId|planDraftId/);
  assert.match(
    receiptHashGuard,
    /NEW\.mutation_kind = 'production_plan_draft\.generated'[\s\S]*?'planDraftId', NEW\.plan_draft_id/,
  );
  assert.match(
    eventGuard,
    /v_receipt\.mutation_kind = 'production_plan_draft\.generated'[\s\S]*?NEW\.entity_kind IS DISTINCT FROM 'production_plan_script_draft'[\s\S]*?NEW\.entity_id IS DISTINCT FROM v_receipt\.plan_draft_id/,
  );
});

test("generation is replay-before-conflict and advances the shared hash chain once", () => {
  assert.match(
    generate,
    /v_role NOT IN \('owner', 'admin', 'producer'\)/,
  );
  assert.match(
    generate,
    /'operation', 'generate_project_script_plan_draft'[\s\S]*?'expectedAuthorityVersion', p_expected_authority_version[\s\S]*?'expectedScriptRevisionId', p_expected_script_revision_id[\s\S]*?'derivationVersion', v_derivation_version/,
  );
  const replayIndex = generate.indexOf("RETURN v_existing.result");
  const authorityConflictIndex = generate.indexOf(
    "v_authority.authority_version\n    IS DISTINCT FROM p_expected_authority_version",
  );
  const scriptLookupIndex = generate.indexOf(
    "FROM co_production.project_script_revisions AS revision",
  );
  const duplicateSourceIndex = generate.indexOf(
    "FROM co_production.production_plan_script_drafts AS draft",
  );
  assert.ok(replayIndex >= 0 && replayIndex < authorityConflictIndex);
  assert.ok(replayIndex < scriptLookupIndex);
  assert.ok(replayIndex < duplicateSourceIndex);
  assert.match(generate, /pg_advisory_xact_lock/);
  assert.match(generate, /'cco:project-preproduction:' \|\| p_project_id::text/);
  assert.match(
    generate,
    /INSERT INTO co_production\.project_preproduction_mutation_receipts/,
  );
  assert.match(generate, /INSERT INTO co_production\.project_preproduction_events/);
  assert.match(
    generate,
    /authority_version = v_new_authority_version[\s\S]*?event_head_hash = v_event_hash/,
  );
});

test("latest approved source may be behind script head but supplied source must be exact", () => {
  for (const command of [draftInsertGuard, planInsertGuard, proposal, generate]) {
    assert.match(
      command,
      /JOIN LATERAL \([\s\S]*?receipt\.script_revision_id = revision\.id[\s\S]*?ORDER BY receipt\.authority_version DESC[\s\S]*?LIMIT 1[\s\S]*?latest_workflow\.mutation_kind = 'project_script\.approved'/,
    );
    assert.match(
      command,
      /ORDER BY revision\.revision_number DESC[\s\S]*?LIMIT 1/,
    );
  }
  assert.match(
    generate,
    /v_script\.id IS DISTINCT FROM p_expected_script_revision_id/,
  );
  assert.match(
    draftInsertGuard,
    /revision\.content_hash = NEW\.source_project_script_content_hash/,
  );
});

test("plan insertion rejects manual, forged, stale, changed, and duplicate draft use", () => {
  assert.match(
    planInsertGuard,
    /IF NOT FOUND THEN[\s\S]*?jsonb_typeof\(NEW\.content -> 'sourceDraftId'\)[\s\S]*?IS DISTINCT FROM 'null'[\s\S]*?jsonb_typeof\(NEW\.content -> 'approvalNote'\)[\s\S]*?IS DISTINCT FROM 'null'/,
  );
  assert.match(
    planInsertGuard,
    /jsonb_typeof\(NEW\.content -> 'sourceDraftId'\)[\s\S]*?IS DISTINCT FROM 'string'/,
  );
  assert.match(
    planInsertGuard,
    /preproject_safe_text\(v_approval_note, 1, 4000\)/,
  );
  assert.match(
    planInsertGuard,
    /draft\.project_id = NEW\.project_id[\s\S]*?draft\.team_id IS NOT DISTINCT FROM NEW\.team_id[\s\S]*?draft\.source_project_script_revision_id = v_latest_script_id[\s\S]*?draft\.source_project_script_content_hash =\s+v_latest_script_content_hash/,
  );
  assert.match(
    planInsertGuard,
    /production_plan_script_bindings AS binding[\s\S]*?binding\.plan_draft_id = v_draft\.id[\s\S]*?production_plan_draft_already_materialized/,
  );
  assert.match(
    planInsertGuard,
    /v_draft\.content IS DISTINCT FROM\s+NEW\.content - ARRAY\['sourceDraftId', 'approvalNote'\]::text\[\]/,
  );
  assert.doesNotMatch(planInsertGuard, /NEW\.[a-z_]+\s*:=/);
});

test("plan receipt materialization inserts one exact binding atomically", () => {
  assert.match(
    migration,
    /CREATE TRIGGER project_preproduction_receipts_bind_script_draft\s+AFTER INSERT ON co_production\.project_preproduction_mutation_receipts/,
  );
  assert.match(
    bindingTrigger,
    /NEW\.mutation_kind NOT IN \(\s*'production_plan\.initialized', 'production_plan\.replanned'/,
  );
  assert.match(
    bindingTrigger,
    /plan\.id = NEW\.plan_revision_id[\s\S]*?plan\.project_id = NEW\.project_id[\s\S]*?plan\.team_id IS NOT DISTINCT FROM NEW\.team_id/,
  );
  assert.match(bindingTrigger, /v_plan\.created_by IS DISTINCT FROM NEW\.actor_id/);
  assert.match(bindingTrigger, /v_plan\.created_at IS DISTINCT FROM NEW\.created_at/);
  assert.match(
    bindingTrigger,
    /INSERT INTO co_production\.production_plan_script_bindings/,
  );
  assert.match(
    bindingTrigger,
    /v_draft\.source_project_script_revision_id[\s\S]*?v_draft\.source_project_script_content_hash[\s\S]*?NEW\.id[\s\S]*?v_approval_note[\s\S]*?NEW\.actor_id[\s\S]*?NEW\.created_at/,
  );
});

test("proposal RPC returns the exact parser shape and truthful null states", () => {
  for (const key of [
    "projectId",
    "authorityVersion",
    "currentPlanRevision",
    "available",
    "scriptRevisionId",
    "scriptRevisionNumber",
    "scriptTitle",
    "preview",
    "draft",
    "alreadyMaterialized",
    "materializedPlanRevision",
    "permissions",
  ]) {
    assert.ok(proposal.includes(`'${key}'`), `missing proposal key ${key}`);
  }
  for (const key of [
    "id",
    "derivationVersion",
    "content",
    "contentHash",
    "generatedAt",
  ]) {
    assert.ok(proposal.includes(`'${key}'`), `missing draft key ${key}`);
  }
  assert.match(proposal, /WHEN v_script\.id IS NULL THEN NULL/);
  assert.match(
    proposal,
    /'preview',[\s\S]*?derive_project_script_plan_content\(\s*v_script\.content\s*\)/,
  );
  assert.match(proposal, /WHEN v_draft\.id IS NULL THEN NULL/);
  assert.match(proposal, /'alreadyMaterialized', v_binding\.id IS NOT NULL/);
  assert.match(proposal, /'canGenerate'/);
  assert.match(proposal, /'canApprove'/);
  assert.doesNotMatch(
    proposal,
    /'alreadyGenerated'|'scriptContentHash'|'planDraftId'|'role'/,
  );
});

test("generate and approve receipts expose only their exact public fields", () => {
  assert.match(
    generate,
    /generate_project_script_plan_draft\(\s*p_project_id uuid,\s*p_expected_authority_version bigint,\s*p_request_id uuid,\s*p_expected_script_revision_id uuid\s*\)/,
  );
  const generatedResult = boundedSection(
    generate,
    "v_result := pg_catalog.jsonb_build_object(",
    "v_receipt_hash :=",
  );
  for (const key of [
    "draftId",
    "projectId",
    "scriptRevisionId",
    "scriptRevisionNumber",
    "authorityVersion",
    "requestId",
    "replayed",
  ]) {
    assert.ok(generatedResult.includes(`'${key}'`), `missing generate key ${key}`);
  }
  assert.doesNotMatch(
    generatedResult,
    /'contentHash'|'scriptContentHash'|'derivationVersion'|'planDraftId'/,
  );

  assert.match(
    approve,
    /approve_project_script_plan_draft\(\s*p_project_id uuid,\s*p_draft_id uuid,\s*p_expected_plan_revision integer,\s*p_request_id uuid,\s*p_note text\s*\)/,
  );
  assert.match(
    approve,
    /v_plan := v_draft\.content \|\| pg_catalog\.jsonb_build_object\(\s*'sourceDraftId', v_draft\.id,\s*'approvalNote', p_note/,
  );
  assert.match(
    approve,
    /v_result := co_production\.initialize_production_plan\(/,
  );
  const approvedResult = boundedSection(
    approve,
    "RETURN v_result || pg_catalog.jsonb_build_object(",
    "END\n$$;",
  );
  assert.match(approvedResult, /'draftId', v_draft\.id/);
  assert.match(
    approvedResult,
    /'scriptRevisionId', v_draft\.source_project_script_revision_id/,
  );
  assert.match(
    approvedResult,
    /'scriptRevisionNumber', v_script_revision_number/,
  );
  assert.doesNotMatch(
    approvedResult,
    /'approvalNote'|'approvedBy'|'approvedAt'|'planMutationReceiptId'|'derivationVersion'/,
  );
});

test("contributors can read immutable rows while every write remains definer-only", () => {
  const normalizedMigration = migration.replace(/\s+/g, " ");
  for (const table of [
    "production_plan_script_drafts",
    "production_plan_script_bindings",
  ]) {
    assert.match(
      migration,
      new RegExp(`ALTER TABLE co_production\\.${table}\\s+ENABLE ROW LEVEL SECURITY;`),
    );
    assert.match(
      migration,
      new RegExp(`ALTER TABLE co_production\\.${table}\\s+FORCE ROW LEVEL SECURITY;`),
    );
    assert.match(
      migration,
      new RegExp(`GRANT SELECT ON TABLE co_production\\.${table}\\s+TO authenticated;`),
    );
    assert.match(
      migration,
      new RegExp(`BEFORE UPDATE OR DELETE ON co_production\\.${table}`),
    );
    assert.match(
      migration,
      new RegExp(`BEFORE TRUNCATE ON co_production\\.${table}`),
    );
  }
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION\s+co_production_private\.can_read_production_plan_script_evidence\([\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''[\s\S]*?'owner', 'admin', 'producer', 'editor', 'member'/,
  );
  assert.equal(
    (
      migration.match(
        /can_read_production_plan_script_evidence\(project_id\)/g,
      ) ?? []
    ).length,
    2,
  );
  assert.match(
    normalizedMigration,
    /GRANT EXECUTE ON FUNCTION co_production_private\.can_read_production_plan_script_evidence\(uuid\) TO authenticated;/,
  );
  assert.doesNotMatch(
    migration,
    /CREATE POLICY[^;]*FOR (?:INSERT|UPDATE|DELETE|ALL)\b/i,
  );
  assert.doesNotMatch(
    migration,
    /GRANT (?:INSERT|UPDATE|DELETE|TRUNCATE|ALL)/i,
  );

  for (const rpc of [
    "co_production.get_project_script_plan_proposal(uuid)",
    "co_production.generate_project_script_plan_draft(uuid, bigint, uuid, uuid)",
    "co_production.approve_project_script_plan_draft(uuid, uuid, integer, uuid, text)",
  ]) {
    assert.ok(normalizedMigration.includes(`REVOKE ALL ON FUNCTION ${rpc}`));
    assert.ok(normalizedMigration.includes(`GRANT EXECUTE ON FUNCTION ${rpc}`));
  }
  assert.doesNotMatch(
    migration,
    /notification_outbox|webhook_delivery_outbox|pg_net|net\.http|send_(?:email|sms|message)/i,
  );
});
