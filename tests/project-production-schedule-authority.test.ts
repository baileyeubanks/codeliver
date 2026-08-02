import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "..");
const migrationPath =
  "supabase/migrations/20260716203000_project_production_schedule_authority.sql";
const migration = readFileSync(resolve(repositoryRoot, migrationPath), "utf8");
const predecessor = readFileSync(
  resolve(
    repositoryRoot,
    "supabase/migrations/20260716183000_project_shot_plan_authority.sql",
  ),
  "utf8",
);

function escapeRegExp(value: string): string {
  return value.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

function boundedSection(source: string, start: string, end: string): string {
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

const revisionTable = boundedSection(
  migration,
  "CREATE TABLE co_production.project_production_schedule_revisions (",
  "COMMENT ON TABLE co_production.project_production_schedule_revisions",
);
const approvalTable = boundedSection(
  migration,
  "CREATE TABLE co_production.project_production_schedule_approval_bindings (",
  "COMMENT ON TABLE co_production.project_production_schedule_approval_bindings",
);
const itemValidator = functionSql(
  migration,
  "co_production_private.project_production_schedule_item_is_valid",
);
const validator = functionSql(
  migration,
  "co_production_private.project_production_schedule_content_is_valid",
);
const submittable = functionSql(
  migration,
  "co_production_private.project_production_schedule_content_is_submittable",
);
const sourceMatcher = functionSql(
  migration,
  "co_production_private.project_production_schedule_content_matches_shot_plan",
);
const derive = functionSql(
  migration,
  "co_production_private.derive_project_production_schedule_content",
);
const currentSource = functionSql(
  migration,
  "co_production_private.current_project_production_schedule_source",
);
const receiptVerifier = functionSql(
  migration,
  "co_production_private.verify_project_preproduction_receipt_hash",
);
const predecessorReceiptVerifier = functionSql(
  predecessor,
  "co_production_private.verify_project_preproduction_receipt_hash",
);
const eventGuard = functionSql(
  migration,
  "co_production_private.guard_project_preproduction_event_insert",
);
const predecessorEventGuard = functionSql(
  predecessor,
  "co_production_private.guard_project_preproduction_event_insert",
);
const revisionGuard = functionSql(
  migration,
  "co_production_private.guard_project_production_schedule_revision_insert",
);
const getSchedule = functionSql(
  migration,
  "co_production.get_project_production_schedule",
);
const generate = functionSql(
  migration,
  "co_production.generate_project_production_schedule_revision",
);
const append = functionSql(
  migration,
  "co_production.append_project_production_schedule_revision",
);
const submit = functionSql(
  migration,
  "co_production.submit_project_production_schedule_revision",
);
const decide = functionSql(
  migration,
  "co_production.decide_project_production_schedule_revision",
);

const mutationKinds = [
  "project_production_schedule.generated",
  "project_production_schedule.revised",
  "project_production_schedule.submitted",
  "project_production_schedule.approved",
  "project_production_schedule.changes_requested",
] as const;

test("migration is additive, unapplied, transaction wrapped, and excludes adjacent authorities", () => {
  assert.match(migration, /^-- Governed Production Schedule v1 authority/m);
  assert.match(migration, /migration is additive and\s+-- unapplied/);
  assert.match(migration, /BEGIN;/);
  assert.match(migration, /COMMIT;\s*$/);
  assert.ok(migrationPath.includes("20260716203000"));
  assert.match(
    migration,
    /project_production_schedule_requires_postgresql_15/,
  );

  for (const dependency of [
    "project_preproduction_authorities",
    "project_preproduction_mutation_receipts",
    "project_preproduction_events",
    "project_shot_plan_revisions",
    "project_shot_plan_approval_bindings",
  ]) {
    assert.match(
      migration,
      new RegExp("to_regclass\\(\\s*'co_production\\." + dependency + "'"),
    );
  }

  assert.doesNotMatch(
    migration,
    /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE\s+TABLE)\s+co_production\.(?:production_tasks|project_shot_plan_revisions|project_shot_plan_approval_bindings)\b/i,
  );
  assert.doesNotMatch(
    migration,
    /\bCREATE\s+TABLE\s+co_production\.(?:crew|crew_members|locations|talent|equipment|permits|releases|call_sheets|weather|maps|attachments|notifications|calendar_writes)\b/i,
  );
  assert.doesNotMatch(
    migration,
    /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+co_production\.(?:assets|asset_versions|production_logs|call_sheets|locations|talent|equipment|permits|releases|attachments|notifications)\b/i,
  );
  assert.doesNotMatch(
    migration,
    /\bDROP\s+(?:TABLE|SCHEMA|COLUMN|FUNCTION|TRIGGER|POLICY)\b/i,
  );
});

test("canonical schedule and item validators enforce exact bounded shape", () => {
  assert.match(
    validator,
    /ARRAY\['schemaVersion', 'title', 'timeZone', 'days', 'unscheduled'\]/,
  );
  assert.match(
    validator,
    /p_content ->> 'schemaVersion'\s+IS DISTINCT FROM 'cco\.production-schedule\.v1'/,
  );
  assert.match(validator, /octet_length\(p_content::text\) > 4194304/);
  assert.match(validator, /p_content ->> 'title', 1, 260/);
  assert.match(
    validator,
    /jsonb_array_length\(p_content -> 'days'\)\s+NOT BETWEEN 0 AND 366/,
  );
  assert.match(
    validator,
    /ARRAY\[\s*'id', 'order', 'date', 'unitCallTime', 'notes', 'items'\s*\]/,
  );
  assert.match(
    itemValidator,
    /ARRAY\[\s*'id', 'order', 'kind', 'sourceSceneId', 'sourceShotId', 'label',\s*'notes', 'startTime', 'plannedDurationMinutes'\s*\]/,
  );
  assert.match(
    itemValidator,
    /'shot', 'setup', 'meal', 'company_move', 'break', 'note'/,
  );
  assert.match(itemValidator, /IS DISTINCT FROM p_expected_order/);
  assert.match(validator, /IS DISTINCT FROM v_day_number/);
  assert.match(validator, /v_seen_day_ids/);
  assert.match(validator, /v_seen_item_ids/);
  assert.match(validator, /v_seen_source_shot_ids/);
  assert.match(itemValidator, /NOT BETWEEN 1 AND 1440/);
  assert.match(
    itemValidator,
    /v_kind = 'shot'[\s\S]*?'sourceSceneId'[\s\S]*?'sourceShotId'[\s\S]*?'label'[\s\S]*?IS DISTINCT FROM 'null'/,
  );
  assert.match(
    itemValidator,
    /ELSIF[\s\S]*?'sourceSceneId'[\s\S]*?IS DISTINCT FROM 'null'[\s\S]*?'sourceShotId'[\s\S]*?IS DISTINCT FROM 'null'[\s\S]*?'label'[\s\S]*?IS DISTINCT FROM 'string'/,
  );
  assert.match(
    migration,
    /FROM pg_catalog\.pg_timezone_names[\s\S]*?time_zone_record\.name = p_value/,
  );
  assert.match(
    migration,
    /\^\(\[01\]\[0-9\]\|2\[0-3\]\):\[0-5\]\[0-9\]\$/,
  );
  assert.match(
    migration,
    /\^\[0-9\]\{4\}-\[0-9\]\{2\}-\[0-9\]\{2\}\$/,
  );
});

test("submittable validator requires a complete scheduled plan", () => {
  assert.match(submittable, /content_is_valid/);
  assert.match(
    submittable,
    /jsonb_typeof\(p_content -> 'timeZone'\)\s+IS DISTINCT FROM 'string'/,
  );
  assert.match(
    submittable,
    /jsonb_array_length\(p_content -> 'days'\) < 1/,
  );
  assert.match(
    submittable,
    /jsonb_array_length\(p_content -> 'unscheduled'\) <> 0/,
  );
  assert.match(
    submittable,
    /jsonb_typeof\(v_day -> 'date'\) IS DISTINCT FROM 'string'/,
  );
  assert.match(
    submittable,
    /jsonb_typeof\(v_day -> 'unitCallTime'\)[\s\S]*?IS DISTINCT FROM 'string'/,
  );
  assert.match(submittable, /\(v_day ->> 'date'\) = ANY\(v_seen_dates\)/);
  assert.match(
    submittable,
    /jsonb_typeof\(v_item -> 'startTime'\)[\s\S]*?IS DISTINCT FROM 'string'/,
  );
  assert.match(
    submittable,
    /jsonb_typeof\(v_item -> 'plannedDurationMinutes'\)[\s\S]*?IS DISTINCT FROM 'number'/,
  );
  assert.match(
    getSchedule,
    /'canSubmit',[\s\S]*?project_production_schedule_content_is_submittable\(/,
  );
  assert.match(submit, /project_production_schedule_not_submittable/);
});

test("source matching proves every approved shot exactly once and rejects foreign shots", () => {
  assert.match(sourceMatcher, /WITH source_shots AS/);
  assert.match(sourceMatcher, /schedule_shots AS/);
  assert.match(
    sourceMatcher,
    /jsonb_array_elements\(p_content -> 'days'\)[\s\S]*?jsonb_array_elements\(\s*day_record\.value -> 'items'/,
  );
  assert.match(
    sourceMatcher,
    /jsonb_array_elements\(p_content -> 'unscheduled'\)/,
  );
  assert.match(sourceMatcher, /WHERE item_record\.value ->> 'kind' = 'shot'/);
  assert.match(sourceMatcher, /EXCEPT[\s\S]*?schedule_shots/);
  assert.match(sourceMatcher, /EXCEPT[\s\S]*?source_shots/);
  assert.match(
    sourceMatcher,
    /GROUP BY schedule_shots\.scene_id, schedule_shots\.shot_id[\s\S]*?count\(\*\) <> 1/,
  );

  assert.match(currentSource, /current_project_shot_plan_source/);
  assert.match(
    currentSource,
    /project_shot_plan_approval_bindings AS binding/,
  );
  assert.match(currentSource, /project_shot_plan_revisions AS revision/);
  for (const key of [
    "shotPlanRevisionId",
    "shotPlanRevisionNumber",
    "shotPlanContentHash",
    "shotPlanContent",
    "shotPlanApprovalBindingId",
  ]) {
    assert.match(currentSource, new RegExp("'" + key + "'"));
  }
  assert.match(currentSource, /ORDER BY revision\.revision_number DESC/);
  assert.match(currentSource, /'shotPlanContent', source\.content/);
});

test("server derivation creates only deterministic unscheduled shot items with null timing", () => {
  assert.match(derive, /IMMUTABLE/);
  assert.match(derive, /STRICT/);
  assert.match(derive, /PARALLEL SAFE/);
  assert.match(derive, /p_shot_plan_content -> 'scenes'/);
  assert.match(derive, /v_scene -> 'shots'/);
  assert.match(derive, /'id', v_shot ->> 'id'/);
  assert.match(derive, /'sourceSceneId', v_scene ->> 'id'/);
  assert.match(derive, /'sourceShotId', v_shot ->> 'id'/);
  assert.match(derive, /'kind', 'shot'/);
  assert.match(
    derive,
    /'title', \(p_shot_plan_content ->> 'title'\) \|\| ' production schedule'/,
  );
  assert.match(derive, /'timeZone', NULL/);
  assert.match(derive, /'days', '\[\]'::jsonb/);
  assert.match(derive, /'unscheduled', v_unscheduled/);
  assert.match(derive, /'label', NULL/);
  assert.match(derive, /'notes', NULL/);
  assert.match(derive, /'startTime', NULL/);
  assert.match(derive, /'plannedDurationMinutes', NULL/);
  assert.doesNotMatch(derive, /estimatedDuration|runtime|screen/i);
});

test("revision and approval tables bind exact immutable shot-plan evidence", () => {
  for (const column of [
    "revision_number bigint NOT NULL",
    "base_revision_id uuid",
    "revision_kind text NOT NULL",
    "derivation_version text NOT NULL",
    "content jsonb NOT NULL",
    "content_hash text NOT NULL",
    "source_shot_plan_revision_id uuid NOT NULL",
    "source_shot_plan_content_hash text NOT NULL",
    "source_shot_plan_approval_binding_id uuid NOT NULL",
  ]) {
    assert.ok(
      revisionTable.includes(column),
      "missing revision column: " + column,
    );
  }
  assert.doesNotMatch(revisionTable, /\bstate\s+text\b/i);
  assert.match(
    revisionTable,
    /FOREIGN KEY \(\s*source_shot_plan_revision_id,\s*project_id,\s*source_shot_plan_content_hash\s*\)[\s\S]*?REFERENCES co_production\.project_shot_plan_revisions/,
  );
  assert.match(
    revisionTable,
    /FOREIGN KEY \(\s*source_shot_plan_approval_binding_id,\s*project_id,\s*source_shot_plan_revision_id,\s*source_shot_plan_content_hash\s*\)[\s\S]*?REFERENCES co_production\.project_shot_plan_approval_bindings/,
  );
  assert.match(revisionGuard, /project_production_schedule_stale_source/);
  assert.match(
    revisionGuard,
    /derive_project_production_schedule_content\(\s*v_shot_plan\.content/,
  );
  assert.match(
    revisionGuard,
    /project_production_schedule_content_matches_shot_plan\(\s*NEW\.content,\s*v_shot_plan\.content/,
  );

  for (const column of [
    "production_schedule_revision_id uuid NOT NULL",
    "production_schedule_content_hash text NOT NULL",
    "source_shot_plan_revision_id uuid NOT NULL",
    "source_shot_plan_content_hash text NOT NULL",
    "source_shot_plan_approval_binding_id uuid NOT NULL",
    "decision_receipt_id uuid NOT NULL",
    "approved_by uuid NOT NULL",
    "approved_at timestamptz NOT NULL",
  ]) {
    assert.ok(
      approvalTable.includes(column),
      "missing approval column: " + column,
    );
  }
  assert.match(approvalTable, /UNIQUE \(production_schedule_revision_id\)/);
  assert.match(approvalTable, /UNIQUE \(decision_receipt_id\)/);
  assert.match(
    decide,
    /IF p_decision = 'approved' THEN\s+INSERT INTO co_production\.project_production_schedule_approval_bindings/,
  );
  assert.match(
    migration,
    /BEFORE UPDATE OR DELETE ON co_production\.project_production_schedule_revisions/,
  );
  assert.match(
    migration,
    /BEFORE TRUNCATE ON co_production\.project_production_schedule_revisions/,
  );
});

test("shared receipt and event extensions preserve every predecessor hash byte", () => {
  for (const kind of mutationKinds) {
    assert.match(migration, new RegExp("'" + escapeRegExp(kind) + "'"));
  }
  assert.match(migration, /ADD COLUMN production_schedule_revision_id uuid/);
  assert.match(
    migration,
    /mutation_kind IN \(\s*'project_production_schedule\.generated',[\s\S]*?'project_production_schedule\.changes_requested'[\s\S]*?production_schedule_revision_id IS NOT NULL/,
  );
  assert.match(
    eventGuard,
    /NEW\.entity_kind IS DISTINCT FROM 'project_production_schedule_revision'[\s\S]*?NEW\.entity_id IS DISTINCT FROM v_receipt\.production_schedule_revision_id/,
  );

  const predecessorLegacyReceipts = boundedSection(
    predecessorReceiptVerifier,
    "  IF NEW.mutation_kind IN (",
    "  ELSE\n",
  );
  const currentLegacyReceipts = boundedSection(
    receiptVerifier,
    "  IF NEW.mutation_kind IN (",
    "  ELSIF NEW.mutation_kind IN (\n    'project_production_schedule.generated'",
  );
  assert.equal(currentLegacyReceipts, predecessorLegacyReceipts);

  const predecessorLegacyEventConditions = boundedSection(
    predecessorEventGuard,
    "  IF NOT FOUND\n",
    "  THEN\n",
  );
  const currentLegacyEventConditions = boundedSection(
    eventGuard,
    "  IF NOT FOUND\n",
    "    OR (\n      v_receipt.mutation_kind IN (\n        'project_production_schedule.generated'",
  );
  assert.equal(currentLegacyEventConditions, predecessorLegacyEventConditions);

  const predecessorEventHash = boundedSection(
    predecessorEventGuard,
    "  v_expected_hash :=",
    "  IF NEW.event_hash",
  );
  const currentEventHash = boundedSection(
    eventGuard,
    "  v_expected_hash :=",
    "  IF NEW.event_hash",
  );
  assert.equal(currentEventHash, predecessorEventHash);
});

test("five RPCs are role gated, replay before conflict, source aware, and use one CAS head", () => {
  assert.match(
    migration,
    /generate_project_production_schedule_revision\(\s*uuid, bigint, uuid, uuid\s*\)/,
  );
  assert.doesNotMatch(
    migration,
    /generate_project_production_schedule_revision\(\s*uuid, bigint, uuid, uuid, uuid\s*\)/,
  );
  assert.match(generate, /v_role NOT IN \('owner', 'admin', 'producer'\)/);
  assert.match(append, /v_role NOT IN \('owner', 'admin', 'producer', 'editor'\)/);
  assert.match(submit, /v_role NOT IN \('owner', 'admin', 'producer', 'editor'\)/);
  assert.match(decide, /v_role NOT IN \('owner', 'admin', 'producer'\)/);
  assert.match(decide, /p_decision NOT IN \('approved', 'changes_requested'\)/);
  assert.match(
    decide,
    /p_decision = 'changes_requested' AND p_note IS NULL/,
  );

  for (const command of [generate, append, submit, decide]) {
    const replayIndex = command.indexOf("RETURN v_existing.result");
    const conflictIndex = command.indexOf(
      "v_authority.authority_version IS DISTINCT FROM",
    );
    assert.ok(replayIndex >= 0, "missing exact replay");
    assert.ok(conflictIndex > replayIndex, "conflict must follow replay");
    assert.match(command, /pg_advisory_xact_lock/);
    assert.match(
      command,
      /INSERT INTO co_production\.project_preproduction_mutation_receipts/,
    );
    assert.match(
      command,
      /INSERT INTO co_production\.project_preproduction_events/,
    );
    assert.match(
      command,
      /authority_version = v_new_authority_version[\s\S]*?event_head_hash = v_event_hash/,
    );
  }

  for (const command of [generate, append, decide]) {
    assert.match(
      command,
      /'source', v_source - 'teamId' - 'shotPlanContent'/,
    );
    assert.doesNotMatch(
      command,
      /'source', v_source - 'teamId'(?! - 'shotPlanContent')/,
    );
  }

  assert.match(generate, /project_production_schedule_source_already_generated/);
  assert.match(generate, /p_expected_shot_plan_revision_id/);
  assert.match(append, /project_production_schedule_stale_source/);
  assert.match(submit, /project_production_schedule_stale_source/);
  assert.match(decide, /project_production_schedule_stale_source/);
});

test("read snapshot exposes strict permissions and highest current-source approval", () => {
  assert.match(
    getSchedule,
    /RETURN pg_catalog\.jsonb_build_object\(\s*'projectId',[\s\S]*?'authorityVersion',[\s\S]*?'eventHeadHash',[\s\S]*?'source',[\s\S]*?'head',[\s\S]*?'revisions',[\s\S]*?'permissions'/,
  );
  assert.match(
    getSchedule,
    /'canRead',[\s\S]*?'canGenerate',[\s\S]*?'canRevise',[\s\S]*?'canSubmit',[\s\S]*?'canDecide'/,
  );
  assert.match(
    getSchedule,
    /FROM co_production\.project_production_schedule_approval_bindings AS binding[\s\S]*?ORDER BY revision\.revision_number DESC\s+LIMIT 1/,
  );
  assert.match(getSchedule, /'content', v_head\.content/);
  assert.match(getSchedule, /'state', CASE latest_workflow\.mutation_kind/);
  assert.match(getSchedule, /'isStale', v_source IS NULL OR ROW/);
  assert.match(
    getSchedule,
    /'isActive', revision\.id IS NOT DISTINCT FROM v_active_revision_id/,
  );
  assert.match(getSchedule, /'submissionNote'/);
  assert.match(getSchedule, /'decisionNote'/);
  assert.match(
    getSchedule,
    /WHEN v_source IS NULL THEN NULL\s+ELSE v_source - 'teamId'/,
  );
  assert.doesNotMatch(
    getSchedule,
    /ELSE v_source - 'teamId' - 'shotPlanContent'/,
  );
});

test("authority is RPC-only and leaves no direct table write grants", () => {
  for (const table of [
    "project_production_schedule_revisions",
    "project_production_schedule_approval_bindings",
  ]) {
    assert.match(
      migration,
      new RegExp(
        "REVOKE ALL ON TABLE co_production\\." +
          table +
          "\\s+FROM PUBLIC, anon, authenticated, service_role;",
      ),
    );
    assert.doesNotMatch(
      migration,
      new RegExp("GRANT (?:INSERT|UPDATE|DELETE) ON TABLE[^;]*" + table),
    );
  }

  for (const signature of [
    "co_production.get_project_production_schedule(uuid)",
    "co_production.generate_project_production_schedule_revision",
    "co_production.append_project_production_schedule_revision",
    "co_production.submit_project_production_schedule_revision",
    "co_production.decide_project_production_schedule_revision",
  ]) {
    assert.match(
      migration,
      new RegExp(
        "GRANT EXECUTE ON FUNCTION\\s+" + escapeRegExp(signature),
      ),
    );
  }

  for (const command of [
    currentSource,
    revisionGuard,
    getSchedule,
    generate,
    append,
    submit,
    decide,
  ]) {
    assert.match(command, /SECURITY DEFINER/);
    assert.match(command, /SET search_path = ''/);
  }
});
