import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "..");
const migrationPath =
  "supabase/migrations/20260716213000_project_call_sheet_authority.sql";
const migration = readFileSync(resolve(repositoryRoot, migrationPath), "utf8");
const predecessor = readFileSync(
  resolve(
    repositoryRoot,
    "supabase/migrations/20260716203000_project_production_schedule_authority.sql",
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
  "CREATE TABLE co_production.project_call_sheet_revisions (",
  "COMMENT ON TABLE co_production.project_call_sheet_revisions",
);
const approvalTable = boundedSection(
  migration,
  "CREATE TABLE co_production.project_call_sheet_approval_bindings (",
  "COMMENT ON TABLE co_production.project_call_sheet_approval_bindings",
);
const contactValidator = functionSql(
  migration,
  "co_production_private.project_call_sheet_contact_is_valid",
);
const sectionValidator = functionSql(
  migration,
  "co_production_private.project_call_sheet_section_is_valid",
);
const agendaValidator = functionSql(
  migration,
  "co_production_private.project_call_sheet_agenda_item_is_valid",
);
const validator = functionSql(
  migration,
  "co_production_private.project_call_sheet_content_is_valid",
);
const submittable = functionSql(
  migration,
  "co_production_private.project_call_sheet_content_is_submittable",
);
const sourceMatcher = functionSql(
  migration,
  "co_production_private.project_call_sheet_content_matches_schedule_day",
);
const derive = functionSql(
  migration,
  "co_production_private.derive_project_call_sheet_content",
);
const currentSource = functionSql(
  migration,
  "co_production_private.current_project_call_sheet_source",
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
  "co_production_private.guard_project_call_sheet_revision_insert",
);
const getCallSheet = functionSql(
  migration,
  "co_production.get_project_call_sheet",
);
const generate = functionSql(
  migration,
  "co_production.generate_project_call_sheet_revision",
);
const append = functionSql(
  migration,
  "co_production.append_project_call_sheet_revision",
);
const submit = functionSql(
  migration,
  "co_production.submit_project_call_sheet_revision",
);
const decide = functionSql(
  migration,
  "co_production.decide_project_call_sheet_revision",
);

const mutationKinds = [
  "project_call_sheet.generated",
  "project_call_sheet.revised",
  "project_call_sheet.submitted",
  "project_call_sheet.approved",
  "project_call_sheet.changes_requested",
] as const;

test("migration is additive, unapplied, transaction wrapped, and excludes adjacent authority", () => {
  assert.match(migration, /^-- Governed Call Sheet v1 authority/m);
  assert.match(migration, /migration is additive and unapplied/);
  assert.match(migration, /BEGIN;/);
  assert.match(migration, /COMMIT;\s*$/);
  assert.ok(migrationPath.includes("20260716213000"));
  assert.match(migration, /project_call_sheet_requires_postgresql_15/);

  for (const dependency of [
    "project_preproduction_authorities",
    "project_preproduction_mutation_receipts",
    "project_preproduction_events",
    "project_production_schedule_revisions",
    "project_production_schedule_approval_bindings",
  ]) {
    assert.match(
      migration,
      new RegExp("to_regclass\\(\\s*'co_production\\." + dependency + "'"),
    );
  }

  assert.doesNotMatch(
    migration,
    /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE\s+TABLE)\s+co_production\.(?:production_tasks|project_shot_plan_revisions|project_shot_plan_approval_bindings|project_production_schedule_revisions|project_production_schedule_approval_bindings)\b/i,
  );
  assert.doesNotMatch(
    migration,
    /\bCREATE\s+TABLE\s+co_production\.(?:crew|crew_members|locations|weather|maps|attachments|notifications|distribution|sends|calendar_writes)\b/i,
  );
  assert.doesNotMatch(
    migration,
    /\bDROP\s+(?:TABLE|SCHEMA|COLUMN|FUNCTION|TRIGGER|POLICY)\b/i,
  );
});

test("canonical content, location, contact, section, and agenda keys are exact and bounded", () => {
  assert.match(
    validator,
    /ARRAY\[\s*'schemaVersion', 'title', 'scheduleDayId', 'shootDate', 'timeZone',\s*'unitCallTime', 'location', 'contacts', 'sections', 'agenda',\s*'generalNotes'\s*\]/,
  );
  assert.match(
    validator,
    /p_content ->> 'schemaVersion' IS DISTINCT FROM 'cco\.call-sheet\.v1'/,
  );
  assert.match(validator, /octet_length\(p_content::text\) > 4194304/);
  assert.match(validator, /p_content ->> 'title', 1, 500/);
  assert.match(
    validator,
    /ARRAY\[\s*'name', 'address', 'parkingNotes', 'accessNotes', 'contactName',\s*'contactPhone'\s*\]/,
  );
  for (const locationKey of [
    "name",
    "address",
    "parkingNotes",
    "accessNotes",
    "contactName",
    "contactPhone",
  ]) {
    assert.match(
      validator,
      new RegExp("v_location -> '" + locationKey + "'"),
    );
  }

  assert.match(
    contactValidator,
    /ARRAY\[\s*'id', 'order', 'name', 'role', 'department', 'email', 'phone',\s*'callTime', 'notes'\s*\]/,
  );
  assert.match(contactValidator, /IS DISTINCT FROM p_expected_order/);
  assert.match(contactValidator, /p_contact ->> 'name', 1, 240/);
  assert.match(contactValidator, /p_contact ->> 'role', 1, 160/);
  assert.match(contactValidator, /project_production_schedule_time_is_valid/);
  assert.match(
    contactValidator,
    /\^\[\^\[:space:\]@\]\+@\[\^\[:space:\]@\]\+\\\.\[\^\[:space:\]@\]\+\$/,
  );
  assert.match(validator, /v_seen_contact_ids/);

  assert.match(
    sectionValidator,
    /ARRAY\['id', 'order', 'kind', 'title', 'body'\]/,
  );
  assert.match(
    sectionValidator,
    /'safety', 'weather', 'transport', 'meal', 'equipment', 'note'/,
  );
  assert.match(sectionValidator, /IS DISTINCT FROM p_expected_order/);
  assert.match(validator, /v_seen_section_ids/);

  assert.match(
    agendaValidator,
    /ARRAY\[\s*'scheduleItemId', 'order', 'kind', 'sourceSceneId', 'sourceShotId',\s*'label', 'startTime', 'plannedDurationMinutes'\s*\]/,
  );
  assert.match(
    agendaValidator,
    /'shot', 'setup', 'meal', 'company_move', 'break', 'note'/,
  );
  assert.match(agendaValidator, /p_item ->> 'label', 1, 1000/);
  assert.match(agendaValidator, /NOT BETWEEN 1 AND 1440/);
  assert.match(agendaValidator, /IS DISTINCT FROM p_expected_order/);
  assert.match(validator, /v_seen_schedule_item_ids/);
});

test("submission requires a named location, reachable timed contacts, and safety", () => {
  assert.match(submittable, /project_call_sheet_content_is_valid/);
  assert.match(
    submittable,
    /jsonb_typeof\(p_content #> '\{location,name\}'\)[\s\S]*?IS DISTINCT FROM 'string'/,
  );
  assert.match(
    submittable,
    /jsonb_typeof\(p_content #> '\{location,address\}'\)[\s\S]*?IS DISTINCT FROM 'string'/,
  );
  assert.match(
    submittable,
    /jsonb_array_length\(p_content -> 'contacts'\) < 1/,
  );
  assert.match(
    submittable,
    /contact_record\.value -> 'callTime'[\s\S]*?IS DISTINCT FROM 'string'/,
  );
  assert.match(
    submittable,
    /contact_record\.value -> 'email'[\s\S]*?contact_record\.value -> 'phone'/,
  );
  assert.match(
    submittable,
    /section_record\.value ->> 'kind' = 'safety'/,
  );
  assert.match(submit, /project_call_sheet_not_submittable/);
  assert.match(
    getCallSheet,
    /'canSubmit',[\s\S]*?project_call_sheet_content_is_submittable\(/,
  );
});

test("source matching pins exact day metadata and every schedule agenda field except label", () => {
  assert.match(
    sourceMatcher,
    /project_production_schedule_content_is_submittable/,
  );
  assert.match(
    sourceMatcher,
    /p_content ->> 'scheduleDayId' IS DISTINCT FROM p_schedule_day_id/,
  );
  assert.match(sourceMatcher, /p_content ->> 'shootDate'/);
  assert.match(sourceMatcher, /p_content ->> 'timeZone'/);
  assert.match(sourceMatcher, /p_content ->> 'unitCallTime'/);
  assert.match(
    sourceMatcher,
    /jsonb_array_length\(p_content -> 'agenda'\)[\s\S]*?jsonb_array_length\(v_day -> 'items'\)/,
  );
  for (const key of [
    "scheduleItemId",
    "order",
    "kind",
    "sourceSceneId",
    "sourceShotId",
    "startTime",
    "plannedDurationMinutes",
  ]) {
    assert.match(sourceMatcher, new RegExp("agenda_record\\.value ->>? '" + key));
  }
  const comparedRows = boundedSection(
    sourceMatcher,
    "      WHERE ROW(",
    "      ) IS DISTINCT FROM ROW(",
  );
  assert.doesNotMatch(comparedRows, /'label'/);
  assert.match(append, /project_call_sheet_content_matches_schedule_day/);
  assert.match(submit, /project_call_sheet_content_matches_schedule_day/);
});

test("derivation copies one exact schedule day and creates no adjacent authority", () => {
  assert.match(derive, /IMMUTABLE/);
  assert.match(derive, /STRICT/);
  assert.match(derive, /PARALLEL SAFE/);
  assert.match(derive, /p_production_schedule_content -> 'days'/);
  assert.match(derive, /item_record\.value ->> 'id'/);
  assert.match(derive, /'scheduleItemId'/);
  assert.match(derive, /'order'/);
  assert.match(derive, /'kind'/);
  assert.match(derive, /'sourceSceneId'/);
  assert.match(derive, /'sourceShotId'/);
  assert.match(
    derive,
    /WHEN item_record\.value ->> 'kind' = 'shot'[\s\S]*?THEN 'Shot ' \|\| \(item_record\.value ->> 'sourceShotId'\)/,
  );
  assert.match(derive, /ELSE item_record\.value ->> 'label'/);
  assert.match(derive, /'startTime'/);
  assert.match(derive, /'plannedDurationMinutes'/);
  assert.match(derive, /'schemaVersion', 'cco\.call-sheet\.v1'/);
  assert.match(
    derive,
    /'title', \(p_production_schedule_content ->> 'title'\)[\s\S]*?\|\| ' - ' \|\| \(v_day ->> 'date'\)/,
  );
  assert.match(derive, /'scheduleDayId', p_schedule_day_id/);
  assert.match(derive, /'shootDate', v_day ->> 'date'/);
  assert.match(derive, /'timeZone', p_production_schedule_content ->> 'timeZone'/);
  assert.match(derive, /'unitCallTime', v_day ->> 'unitCallTime'/);
  assert.match(derive, /'contacts', '\[\]'::jsonb/);
  assert.match(derive, /'sections', '\[\]'::jsonb/);
  assert.match(derive, /'generalNotes', v_day -> 'notes'/);
  assert.doesNotMatch(derive, /crew|weather|send|notification/i);
});

test("source selector binds the active approved schedule and bootstraps its lowest ordered day", () => {
  assert.match(currentSource, /current_project_production_schedule_source/);
  assert.match(
    currentSource,
    /project_production_schedule_approval_bindings AS binding/,
  );
  assert.match(
    currentSource,
    /project_production_schedule_revisions AS revision/,
  );
  assert.match(currentSource, /ORDER BY revision\.revision_number DESC/);
  assert.match(currentSource, /p_schedule_day_id IS NULL/);
  assert.match(
    currentSource,
    /ORDER BY \(day_record\.value ->> 'order'\)::integer, day_record\.position\s+LIMIT 1/,
  );
  for (const key of [
    "productionScheduleRevisionId",
    "productionScheduleRevisionNumber",
    "productionScheduleContentHash",
    "productionScheduleContent",
    "productionScheduleApprovalBindingId",
    "scheduleDayId",
    "scheduleDayContentHash",
    "scheduleDay",
  ]) {
    assert.match(currentSource, new RegExp("'" + key + "'"));
  }

  assert.match(
    getCallSheet,
    /p_schedule_day_id text DEFAULT NULL/,
  );
  assert.match(
    getCallSheet,
    /p_schedule_day_id IS NOT NULL[\s\S]*?project_call_sheet_identifier_is_valid/,
  );
  assert.match(
    getCallSheet,
    /v_selected_schedule_day_id := COALESCE\([\s\S]*?v_source ->> 'scheduleDayId',[\s\S]*?p_schedule_day_id/,
  );
  assert.match(
    getCallSheet,
    /'selectedScheduleDayId', v_selected_schedule_day_id/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION co_production\.get_project_call_sheet\(uuid, text\)/,
  );
});

test("revision and approval tables bind one immutable day to exact schedule evidence", () => {
  for (const column of [
    "schedule_day_id text NOT NULL",
    "revision_number bigint NOT NULL",
    "base_revision_id uuid",
    "revision_kind text NOT NULL",
    "derivation_version text NOT NULL",
    "content jsonb NOT NULL",
    "content_hash text NOT NULL",
    "source_production_schedule_revision_id uuid NOT NULL",
    "source_production_schedule_content_hash text NOT NULL",
    "source_production_schedule_approval_binding_id uuid NOT NULL",
    "source_schedule_day_content_hash text NOT NULL",
  ]) {
    assert.ok(revisionTable.includes(column), "missing revision column: " + column);
  }
  assert.match(
    revisionTable,
    /UNIQUE \(project_id, schedule_day_id, revision_number\)/,
  );
  assert.doesNotMatch(revisionTable, /\bstate\s+text\b/i);
  assert.match(
    revisionTable,
    /FOREIGN KEY \(\s*source_production_schedule_revision_id,\s*project_id,\s*source_production_schedule_content_hash\s*\)[\s\S]*?REFERENCES co_production\.project_production_schedule_revisions/,
  );
  assert.match(
    revisionTable,
    /FOREIGN KEY \(\s*source_production_schedule_approval_binding_id,\s*project_id,\s*source_production_schedule_revision_id,\s*source_production_schedule_content_hash\s*\)[\s\S]*?REFERENCES co_production\.project_production_schedule_approval_bindings/,
  );
  assert.match(revisionGuard, /project_call_sheet_stale_source/);
  assert.match(revisionGuard, /source_schedule_day_content_hash/);
  assert.match(revisionGuard, /derive_project_call_sheet_content/);
  assert.match(revisionGuard, /project_call_sheet_content_matches_schedule_day/);

  for (const column of [
    "call_sheet_revision_id uuid NOT NULL",
    "call_sheet_content_hash text NOT NULL",
    "schedule_day_id text NOT NULL",
    "source_production_schedule_revision_id uuid NOT NULL",
    "source_production_schedule_content_hash text NOT NULL",
    "source_production_schedule_approval_binding_id uuid NOT NULL",
    "source_schedule_day_content_hash text NOT NULL",
    "decision_receipt_id uuid NOT NULL",
    "approved_by uuid NOT NULL",
    "approved_at timestamptz NOT NULL",
  ]) {
    assert.ok(approvalTable.includes(column), "missing approval column: " + column);
  }
  assert.match(approvalTable, /UNIQUE \(call_sheet_revision_id\)/);
  assert.match(approvalTable, /UNIQUE \(decision_receipt_id\)/);
  assert.match(
    decide,
    /IF p_decision = 'approved' THEN\s+INSERT INTO co_production\.project_call_sheet_approval_bindings/,
  );
  assert.match(
    migration,
    /BEFORE UPDATE OR DELETE ON co_production\.project_call_sheet_revisions/,
  );
  assert.match(
    migration,
    /BEFORE TRUNCATE ON co_production\.project_call_sheet_revisions/,
  );
});

test("shared receipt and event extensions preserve every predecessor hash byte", () => {
  for (const kind of mutationKinds) {
    assert.match(migration, new RegExp("'" + escapeRegExp(kind) + "'"));
  }
  assert.match(migration, /ADD COLUMN call_sheet_revision_id uuid/);
  assert.match(
    migration,
    /mutation_kind IN \(\s*'project_call_sheet\.generated',[\s\S]*?'project_call_sheet\.changes_requested'[\s\S]*?call_sheet_revision_id IS NOT NULL/,
  );
  assert.match(
    eventGuard,
    /NEW\.entity_kind IS DISTINCT FROM 'project_call_sheet_revision'[\s\S]*?NEW\.entity_id IS DISTINCT FROM v_receipt\.call_sheet_revision_id/,
  );

  const predecessorReceipts = boundedSection(
    predecessorReceiptVerifier,
    "  IF NEW.mutation_kind IN (",
    "  ELSE\n",
  );
  const currentPredecessorReceipts = boundedSection(
    receiptVerifier,
    "  IF NEW.mutation_kind IN (",
    "  ELSIF NEW.mutation_kind IN (\n    'project_call_sheet.generated'",
  );
  assert.equal(currentPredecessorReceipts, predecessorReceipts);

  const predecessorEventConditions = boundedSection(
    predecessorEventGuard,
    "  IF NOT FOUND\n",
    "  THEN\n",
  );
  const currentPredecessorEventConditions = boundedSection(
    eventGuard,
    "  IF NOT FOUND\n",
    "    OR (\n      v_receipt.mutation_kind IN (\n        'project_call_sheet.generated'",
  );
  assert.equal(currentPredecessorEventConditions, predecessorEventConditions);

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

test("five RPCs use exact signatures, minimum roles, replay-before-CAS, and current source checks", () => {
  for (const signature of [
    /get_project_call_sheet\(\s*p_project_id uuid,\s*p_schedule_day_id text DEFAULT NULL/,
    /generate_project_call_sheet_revision\(\s*p_project_id uuid,\s*p_expected_authority_version bigint,\s*p_request_id uuid,\s*p_schedule_day_id text,\s*p_expected_production_schedule_revision_id uuid/,
    /append_project_call_sheet_revision\(\s*p_project_id uuid,\s*p_expected_authority_version bigint,\s*p_request_id uuid,\s*p_base_revision_id uuid,\s*p_change_summary text,\s*p_content jsonb/,
    /submit_project_call_sheet_revision\(\s*p_project_id uuid,\s*p_expected_authority_version bigint,\s*p_request_id uuid,\s*p_call_sheet_revision_id uuid,\s*p_note text/,
    /decide_project_call_sheet_revision\(\s*p_project_id uuid,\s*p_expected_authority_version bigint,\s*p_request_id uuid,\s*p_call_sheet_revision_id uuid,\s*p_decision text,\s*p_note text/,
  ]) {
    assert.match(migration, signature);
  }

  assert.match(generate, /v_role NOT IN \('owner', 'admin', 'producer'\)/);
  assert.match(append, /v_role NOT IN \('owner', 'admin', 'producer', 'editor'\)/);
  assert.match(submit, /v_role NOT IN \('owner', 'admin', 'producer', 'editor'\)/);
  assert.match(decide, /v_role NOT IN \('owner', 'admin', 'producer'\)/);
  assert.match(decide, /p_decision NOT IN \('approved', 'changes_requested'\)/);
  assert.match(decide, /p_decision = 'changes_requested' AND p_note IS NULL/);

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

  assert.match(generate, /project_call_sheet_source_already_generated/);
  assert.match(generate, /p_expected_production_schedule_revision_id/);
  assert.match(append, /project_call_sheet_stale_source/);
  assert.match(submit, /project_call_sheet_stale_source/);
  assert.match(decide, /project_call_sheet_stale_source/);
  for (const command of [generate, append, decide]) {
    assert.match(command, /- 'productionScheduleContent'/);
    assert.match(command, /- 'scheduleDay'/);
  }
});

test("read snapshot is day-scoped and exposes strict workflow permissions", () => {
  assert.match(
    getCallSheet,
    /RETURN pg_catalog\.jsonb_build_object\(\s*'projectId',[\s\S]*?'selectedScheduleDayId',[\s\S]*?'authorityVersion',[\s\S]*?'eventHeadHash',[\s\S]*?'source',[\s\S]*?'head',[\s\S]*?'revisions',[\s\S]*?'permissions'/,
  );
  assert.match(
    getCallSheet,
    /'canRead',[\s\S]*?'canGenerate',[\s\S]*?'canRevise',[\s\S]*?'canSubmit',[\s\S]*?'canDecide'/,
  );
  assert.match(
    getCallSheet,
    /revision\.schedule_day_id = v_selected_schedule_day_id/,
  );
  assert.match(getCallSheet, /'content', v_head\.content/);
  assert.match(getCallSheet, /'state', CASE latest_workflow\.mutation_kind/);
  assert.match(getCallSheet, /'isStale', v_source IS NULL OR ROW/);
  assert.match(
    getCallSheet,
    /'isActive', revision\.id IS NOT DISTINCT FROM v_active_revision_id/,
  );
  assert.match(getCallSheet, /'submissionNote'/);
  assert.match(getCallSheet, /'decisionNote'/);
  assert.match(
    getCallSheet,
    /WHEN v_source IS NULL THEN NULL\s+ELSE v_source - 'teamId'/,
  );
});

test("authority is RPC-only with no direct table writes granted", () => {
  for (const table of [
    "project_call_sheet_revisions",
    "project_call_sheet_approval_bindings",
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
    "co_production.get_project_call_sheet(uuid, text)",
    "co_production.generate_project_call_sheet_revision",
    "co_production.append_project_call_sheet_revision",
    "co_production.submit_project_call_sheet_revision",
    "co_production.decide_project_call_sheet_revision",
  ]) {
    assert.match(
      migration,
      new RegExp("GRANT EXECUTE ON FUNCTION\\s+" + escapeRegExp(signature)),
    );
  }

  for (const command of [
    currentSource,
    revisionGuard,
    getCallSheet,
    generate,
    append,
    submit,
    decide,
  ]) {
    assert.match(command, /SECURITY DEFINER/);
    assert.match(command, /SET search_path = ''/);
  }
});
