import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(repositoryRoot, path), "utf8");

const migration = read(
  "supabase/migrations/20260716124000_production_plan_project_brief_binding.sql",
);
const projectBriefAuthority = read(
  "supabase/migrations/20260716123000_project_brief_projection_authority.sql",
);
const productionPlanAuthority = read(
  "supabase/migrations/20260716040000_project_production_plan_task_authority.sql",
);

function section(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing section start: ${start}`);
  assert.notEqual(endIndex, -1, `missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
}

function functionSql(source: string, qualifiedName: string): string {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION ${qualifiedName}(`);
  assert.notEqual(start, -1, `missing function ${qualifiedName}`);
  const end = source.indexOf("\n$$;", start);
  assert.notEqual(end, -1, `unterminated function ${qualifiedName}`);
  return source.slice(start, end + 4);
}

const bridgeFunction = section(
  migration,
  "CREATE OR REPLACE FUNCTION\n  co_production_private.bind_production_plan_project_brief()",
  "CREATE TRIGGER production_plan_revisions_bind_project_brief",
);
const initializer = functionSql(
  productionPlanAuthority,
  "co_production.initialize_production_plan",
);
const readRpc = functionSql(
  productionPlanAuthority,
  "co_production.get_project_production_plan",
);

test("the bridge extends the exact landed authorities without replacing either", () => {
  const projectBriefTable = section(
    projectBriefAuthority,
    "CREATE TABLE co_production.project_brief_revisions (",
    "ALTER TABLE co_production.project_brief_revisions ENABLE ROW LEVEL SECURITY",
  );
  const planTable = section(
    productionPlanAuthority,
    "CREATE TABLE co_production.production_plan_revisions (",
    "CREATE TABLE co_production.production_tasks (",
  );

  for (const column of [
    "id uuid PRIMARY KEY",
    "project_id uuid NOT NULL",
    "team_id uuid NOT NULL",
    "revision_number integer NOT NULL DEFAULT 1",
    "proposal_handoff_receipt_id uuid NOT NULL",
    "content_hash text NOT NULL",
  ]) {
    assert.ok(projectBriefTable.includes(column), column);
  }
  assert.match(
    projectBriefTable,
    /UNIQUE \(id, project_id, team_id\)/,
  );
  assert.match(planTable, /source_kind IN \('accepted_proposal', 'manual'\)/);
  assert.match(planTable, /source_receipt_id uuid/);
  assert.doesNotMatch(
    projectBriefAuthority + productionPlanAuthority,
    /source_project_brief_(?:revision_id|content_hash)/,
  );
  assert.match(migration, /^-- Bind new accepted-proposal production plans/m);
  assert.match(migration, /BEGIN;/);
  assert.match(migration, /COMMIT;\s*$/);
});

test("nullable binding columns use one exact composite candidate key and foreign key", () => {
  assert.match(
    migration,
    /ALTER TABLE co_production\.project_brief_revisions\s+ADD CONSTRAINT project_brief_revisions_id_project_team_content_hash_key\s+UNIQUE \(id, project_id, team_id, content_hash\);/,
  );
  assert.match(
    migration,
    /ADD COLUMN source_project_brief_revision_id uuid,\s+ADD COLUMN source_project_brief_content_hash text,/,
  );
  assert.doesNotMatch(
    migration,
    /ADD COLUMN source_project_brief_(?:revision_id uuid|content_hash text)\s+(?:NOT NULL|DEFAULT)/,
  );
  assert.match(
    migration,
    /FOREIGN KEY \(\s*source_project_brief_revision_id,\s*project_id,\s*team_id,\s*source_project_brief_content_hash\s*\)\s+REFERENCES co_production\.project_brief_revisions\(\s*id,\s*project_id,\s*team_id,\s*content_hash\s*\)\s+ON DELETE RESTRICT;/,
  );
  assert.doesNotMatch(migration, /\bNOT VALID\b/);
});

test("the shape permits only two nulls or an accepted-proposal exact pair", () => {
  assert.match(
    migration,
    /source_project_brief_revision_id IS NULL\s+AND source_project_brief_content_hash IS NULL\s*\)\s+OR \(\s*source_kind = 'accepted_proposal'\s+AND source_project_brief_revision_id IS NOT NULL\s+AND source_project_brief_content_hash IS NOT NULL/,
  );
  assert.doesNotMatch(
    migration,
    /source_kind = 'manual'[\s\S]*?source_project_brief_(?:revision_id|content_hash) IS NOT NULL/,
  );
});

test("a revoked private BEFORE INSERT trigger owns all binding derivation", () => {
  assert.match(bridgeFunction, /RETURNS trigger/);
  assert.match(bridgeFunction, /LANGUAGE plpgsql/);
  assert.match(bridgeFunction, /SECURITY DEFINER/);
  assert.match(bridgeFunction, /SET search_path = ''/);
  assert.match(
    migration,
    /CREATE TRIGGER production_plan_revisions_bind_project_brief\s+BEFORE INSERT ON co_production\.production_plan_revisions\s+FOR EACH ROW\s+EXECUTE FUNCTION\s+co_production_private\.bind_production_plan_project_brief\(\);/,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION\s+co_production_private\.bind_production_plan_project_brief\(\)\s+FROM PUBLIC, anon, authenticated, service_role;/,
  );
  assert.doesNotMatch(migration, /\bGRANT\b/);
});

test("accepted proposals bind revision 1 by the exact project, team, and handoff receipt", () => {
  const resetId = bridgeFunction.indexOf(
    "NEW.source_project_brief_revision_id := NULL",
  );
  const resetHash = bridgeFunction.indexOf(
    "NEW.source_project_brief_content_hash := NULL",
  );
  const acceptedBranch = bridgeFunction.indexOf(
    "IF NEW.source_kind IS DISTINCT FROM 'accepted_proposal' THEN",
  );
  const exactLookup = bridgeFunction.indexOf(
    "FROM co_production.project_brief_revisions AS brief",
  );
  assert.ok(resetId >= 0 && resetId < acceptedBranch);
  assert.ok(resetHash >= 0 && resetHash < acceptedBranch);
  assert.ok(acceptedBranch < exactLookup);
  assert.match(
    bridgeFunction,
    /SELECT brief\.id, brief\.content_hash\s+INTO v_project_brief_revision_id, v_project_brief_content_hash\s+FROM co_production\.project_brief_revisions AS brief\s+WHERE brief\.revision_number = 1\s+AND brief\.project_id = NEW\.project_id\s+AND brief\.team_id = NEW\.team_id\s+AND brief\.proposal_handoff_receipt_id = NEW\.source_receipt_id;/,
  );
  assert.match(
    bridgeFunction,
    /IF FOUND THEN\s+NEW\.source_project_brief_revision_id := v_project_brief_revision_id;\s+NEW\.source_project_brief_content_hash := v_project_brief_content_hash;\s+RETURN NEW;/,
  );
  assert.equal(
    (bridgeFunction.match(/NEW\.source_project_brief_revision_id/g) ?? []).length,
    2,
  );
  assert.equal(
    (bridgeFunction.match(/NEW\.source_project_brief_content_hash/g) ?? []).length,
    2,
  );
  assert.doesNotMatch(bridgeFunction, /preproject_sha256|jsonb_build_object/);
});

test("manual and true legacy plans stay null while any related brief drift fails closed", () => {
  assert.match(
    bridgeFunction,
    /NEW\.source_project_brief_content_hash := NULL;\s+IF NEW\.source_kind IS DISTINCT FROM 'accepted_proposal' THEN\s+RETURN NEW;/,
  );
  assert.match(
    bridgeFunction,
    /FROM co_production\.project_brief_revisions AS conflicting_brief\s+WHERE conflicting_brief\.revision_number = 1\s+AND \(\s*conflicting_brief\.project_id = NEW\.project_id\s+OR conflicting_brief\.proposal_handoff_receipt_id = NEW\.source_receipt_id\s*\)/,
  );
  assert.match(
    bridgeFunction,
    /RAISE EXCEPTION USING\s+ERRCODE = '55000',\s+MESSAGE = 'production_plan_project_brief_binding_mismatch';/,
  );
  assert.match(
    bridgeFunction,
    /END IF;\s+RETURN NEW;\s+END\s+\$\$;/,
  );
  assert.doesNotMatch(bridgeFunction, /EXCEPTION\s+WHEN|COALESCE\s*\(/i);
});

test("the bridge is atomic, additive, and leaves all existing plan rows untouched", () => {
  assert.match(bridgeFunction, /pg_advisory_xact_lock/);
  assert.match(
    bridgeFunction,
    /'cco:project-brief-projection:' \|\| NEW\.project_id::text/,
  );
  assert.doesNotMatch(
    migration,
    /\b(?:INSERT INTO|UPDATE|DELETE FROM)\s+co_production\.production_plan_revisions\b/i,
  );
  assert.doesNotMatch(migration, /\bDROP\s+(?:TABLE|COLUMN|CONSTRAINT|FUNCTION)\b/i);
  assert.doesNotMatch(bridgeFunction, /ON CONFLICT|RETURN NULL/i);
  assert.ok(
    initializer.indexOf("INSERT INTO co_production.production_plan_revisions") <
      initializer.indexOf("INSERT INTO co_production.production_tasks"),
    "the BEFORE INSERT failure must abort before dependent task writes",
  );
});

test("request hashing, replay, read DTO, and public RPC grants remain unchanged", () => {
  assert.match(
    initializer,
    /'operation', 'initialize_production_plan',\s+'projectId', p_project_id,\s+'expectedPlanRevision', p_expected_plan_revision,\s+'requestId', p_request_id,\s+'plan', p_plan/,
  );
  assert.ok(
    initializer.indexOf("RETURN v_existing.result") <
      initializer.indexOf("INSERT INTO co_production.production_plan_revisions"),
    "exact request replay must return before the trigger is reached",
  );
  assert.match(readRpc, /'sourceReceiptId', v_plan\.source_receipt_id/);
  assert.doesNotMatch(
    readRpc,
    /sourceProjectBrief|source_project_brief|projectBriefRevisionId/,
  );
  assert.match(
    productionPlanAuthority,
    /CREATE OR REPLACE FUNCTION co_production\.initialize_production_plan\(\s*p_project_id uuid,\s*p_expected_plan_revision integer,\s*p_request_id uuid,\s*p_plan jsonb\s*\)/,
  );
  assert.match(
    productionPlanAuthority,
    /GRANT EXECUTE ON FUNCTION co_production\.initialize_production_plan\(uuid, integer, uuid, jsonb\)\s+TO authenticated;/,
  );
  assert.doesNotMatch(migration, /CREATE OR REPLACE FUNCTION co_production\./);
  assert.doesNotMatch(
    migration,
    /initialize_production_plan|get_project_production_plan|request_hash|CREATE OR REPLACE VIEW|ALTER FUNCTION|GRANT EXECUTE/,
  );
});
