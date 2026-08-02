import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "..");
const migrationPath =
  "supabase/migrations/20260716183000_project_shot_plan_authority.sql";
const migration = readFileSync(resolve(repositoryRoot, migrationPath), "utf8");
const predecessor = readFileSync(
  resolve(
    repositoryRoot,
    "supabase/migrations/20260716131000_production_plan_project_script_binding.sql",
  ),
  "utf8",
);

function escapeRegExp(value: string): string {
  return value.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

function boundedSection(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing section start: ${start}`);
  assert.notEqual(endIndex, -1, `missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
}

function functionSql(source: string, qualifiedName: string): string {
  const match = new RegExp(
    "CREATE OR REPLACE FUNCTION\\s+" +
      escapeRegExp(qualifiedName) +
      "\\s*\\(",
  ).exec(source);
  assert.ok(match?.index !== undefined, `missing function ${qualifiedName}`);
  const end = source.indexOf("\n$$;", match.index);
  assert.notEqual(end, -1, `unterminated function ${qualifiedName}`);
  return source.slice(match.index, end + 4);
}

const revisionTable = boundedSection(
  migration,
  "CREATE TABLE co_production.project_shot_plan_revisions (",
  "COMMENT ON TABLE co_production.project_shot_plan_revisions",
);
const approvalTable = boundedSection(
  migration,
  "CREATE TABLE co_production.project_shot_plan_approval_bindings (",
  "COMMENT ON TABLE co_production.project_shot_plan_approval_bindings",
);
const validator = functionSql(
  migration,
  "co_production_private.project_shot_plan_content_is_valid",
);
const sourceMatcher = functionSql(
  migration,
  "co_production_private.project_shot_plan_content_matches_script",
);
const derive = functionSql(
  migration,
  "co_production_private.derive_project_shot_plan_content",
);
const currentSource = functionSql(
  migration,
  "co_production_private.current_project_shot_plan_source",
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
  "co_production_private.guard_project_shot_plan_revision_insert",
);
const getShotPlan = functionSql(
  migration,
  "co_production.get_project_shot_plan",
);
const generate = functionSql(
  migration,
  "co_production.generate_project_shot_plan_revision",
);
const append = functionSql(
  migration,
  "co_production.append_project_shot_plan_revision",
);
const submit = functionSql(
  migration,
  "co_production.submit_project_shot_plan_revision",
);
const decide = functionSql(
  migration,
  "co_production.decide_project_shot_plan_revision",
);

const mutationKinds = [
  "project_shot_plan.generated",
  "project_shot_plan.revised",
  "project_shot_plan.submitted",
  "project_shot_plan.approved",
  "project_shot_plan.changes_requested",
] as const;

test("migration is additive, transaction wrapped, and explicitly excludes adjacent production authorities", () => {
  assert.match(migration, /^-- Governed Shot Plan v1 authority/m);
  assert.match(migration, /additive and source-only/);
  assert.match(
    migration,
    /does not schedule work, attach\s+-- assets, mutate production tasks/i,
  );
  assert.match(migration, /BEGIN;/);
  assert.match(migration, /COMMIT;\s*$/);
  assert.ok(migrationPath.includes("20260716183000"));
  assert.match(migration, /project_shot_plan_requires_postgresql_15/);

  for (const dependency of [
    "project_preproduction_authorities",
    "project_preproduction_mutation_receipts",
    "project_preproduction_events",
    "project_script_revisions",
    "production_plan_revisions",
    "production_plan_script_bindings",
  ]) {
    assert.match(
      migration,
      new RegExp(`to_regclass\\(\\s*'co_production\\.${dependency}'`),
    );
  }

  assert.doesNotMatch(
    migration,
    /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE\s+TABLE)\s+co_production\.production_tasks\b/i,
  );
  assert.doesNotMatch(
    migration,
    /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+co_production\.(?:assets|asset_versions|production_logs|call_sheets|locations|talent|releases)\b/i,
  );
  assert.doesNotMatch(
    migration,
    /\bDROP\s+(?:TABLE|SCHEMA|COLUMN|FUNCTION|TRIGGER|POLICY)\b/i,
  );
});

test("canonical content validator is exact, bounded, stable-ID governed, and attachment closed", () => {
  assert.match(
    validator,
    /ARRAY\['schemaVersion', 'title', 'scenes'\]/,
  );
  assert.match(
    validator,
    /p_content ->> 'schemaVersion' IS DISTINCT FROM 'cco\.shot-plan\.v1'/,
  );
  assert.match(validator, /octet_length\(p_content::text\) > 4194304/);
  assert.match(
    validator,
    /jsonb_array_length\(p_content -> 'scenes'\)\s+NOT BETWEEN 1 AND 200/,
  );
  assert.match(
    validator,
    /ARRAY\[\s*'id', 'scriptSectionId', 'order', 'heading', 'objective',\s*'estimatedDurationSeconds', 'shots'\s*\]/,
  );
  assert.match(
    validator,
    /ARRAY\[\s*'id', 'order', 'scriptBlockIds', 'purpose', 'coverageKind',\s*'framing', 'movement', 'subject', 'description', 'audioIntent',\s*'estimatedDurationSeconds', 'storyboardPanels'\s*\]/,
  );
  assert.match(
    validator,
    /ARRAY\[\s*'id', 'order', 'visualDescription', 'assetId', 'versionId'\s*\]/,
  );
  assert.match(validator, /'scene-' \|\| pg_catalog\.lpad/);
  assert.match(validator, /'shot-' \|\| pg_catalog\.lpad/);
  assert.match(validator, /'panel-' \|\| pg_catalog\.lpad/);
  assert.match(validator, /v_total_shots > 2000/);
  assert.match(validator, /v_total_panels > 10000/);

  for (const coverageKind of [
    "establishing",
    "coverage",
    "interview",
    "b_roll",
    "action",
    "graphic",
    "transition",
    "other",
  ]) {
    assert.match(validator, new RegExp(`'${coverageKind}'`));
  }
  for (const framing of [
    "unspecified",
    "extreme_wide",
    "wide",
    "medium",
    "medium_close_up",
    "close_up",
    "extreme_close_up",
    "over_shoulder",
    "two_shot",
    "detail",
    "aerial",
    "pov",
  ]) {
    assert.match(validator, new RegExp(`'${framing}'`));
  }
  for (const movement of [
    "locked",
    "pan",
    "tilt",
    "dolly",
    "truck",
    "crane",
    "gimbal",
    "handheld",
    "drone",
    "zoom",
  ]) {
    assert.match(validator, new RegExp(`'${movement}'`));
  }
  assert.match(
    validator,
    /jsonb_typeof\(v_panel -> 'assetId'\)\s+IS DISTINCT FROM 'null'/,
  );
  assert.match(
    validator,
    /jsonb_typeof\(v_panel -> 'versionId'\)\s+IS DISTINCT FROM 'null'/,
  );
  assert.match(
    sourceMatcher,
    /jsonb_array_length\(p_content -> 'scenes'\) IS DISTINCT FROM\s+pg_catalog\.jsonb_array_length\(p_script_content -> 'sections'\)/,
  );
  assert.match(
    sourceMatcher,
    /script_block\.value ->> 'id' = v_block_reference #>> '\{\}'/,
  );
});

test("server derivation maps only eligible script blocks and uses conservative null defaults", () => {
  assert.match(derive, /IMMUTABLE/);
  assert.match(derive, /STRICT/);
  assert.match(derive, /PARALLEL SAFE/);
  assert.match(
    derive,
    /WHERE block\.value ->> 'kind' IN \(\s*'scene_heading', 'visual', 'action', 'interview_question',\s*'b_roll', 'on_screen_text', 'graphic', 'transition'\s*\)/,
  );
  for (const [kind, coverage] of [
    ["scene_heading", "establishing"],
    ["visual", "coverage"],
    ["action", "action"],
    ["interview_question", "interview"],
    ["b_roll", "b_roll"],
    ["on_screen_text", "graphic"],
    ["graphic", "graphic"],
    ["transition", "transition"],
  ]) {
    assert.match(
      derive,
      new RegExp(`WHEN '${kind}' THEN '${coverage}'`),
    );
  }
  assert.match(derive, /'framing', 'unspecified'/);
  assert.match(derive, /'movement', 'unspecified'/);
  assert.match(derive, /'subject', NULL/);
  assert.match(
    derive,
    /WHEN v_kind = 'interview_question' THEN v_block ->> 'text'\s+ELSE NULL/,
  );
  assert.match(derive, /'estimatedDurationSeconds', NULL/);
  assert.match(derive, /'assetId', NULL/);
  assert.match(derive, /'versionId', NULL/);
  assert.match(derive, /v_block ->> 'text'/);
  assert.match(derive, /Visual coverage is not specified\./);
  assert.match(derive, /Section summary: /);
  assert.match(derive, /'scriptBlockIds', '\[\]'::jsonb/);
  assert.doesNotMatch(
    derive,
    /(?:location|talent|person|equipment|lens|captured media)/i,
  );
});

test("revisions and approvals carry exact immutable script-plan binding evidence", () => {
  for (const column of [
    "revision_number bigint NOT NULL",
    "base_revision_id uuid",
    "revision_kind text NOT NULL",
    "derivation_version text NOT NULL",
    "content jsonb NOT NULL",
    "content_hash text NOT NULL",
    "source_project_script_revision_id uuid NOT NULL",
    "source_project_script_content_hash text NOT NULL",
    "source_production_plan_revision_id uuid NOT NULL",
    "source_production_plan_content_hash text NOT NULL",
    "source_production_plan_script_binding_id uuid NOT NULL",
  ]) {
    assert.ok(revisionTable.includes(column), `missing revision column: ${column}`);
  }
  assert.match(
    revisionTable,
    /FOREIGN KEY \(\s*source_project_script_revision_id,\s*project_id,\s*source_project_script_content_hash\s*\)[\s\S]*?REFERENCES co_production\.project_script_revisions/,
  );
  assert.match(
    revisionTable,
    /FOREIGN KEY \(\s*source_production_plan_revision_id,\s*project_id,\s*source_production_plan_content_hash\s*\)[\s\S]*?REFERENCES co_production\.production_plan_revisions/,
  );
  assert.match(
    revisionTable,
    /FOREIGN KEY \(\s*source_production_plan_script_binding_id,\s*project_id,\s*source_production_plan_revision_id,\s*source_project_script_revision_id,\s*source_project_script_content_hash\s*\)/,
  );
  assert.match(revisionGuard, /project_shot_plan_stale_source/);
  assert.match(
    revisionGuard,
    /NEW\.content IS DISTINCT FROM\s*co_production_private\.derive_project_shot_plan_content/,
  );
  assert.match(
    revisionGuard,
    /project_shot_plan_content_matches_script\(\s*NEW\.content,\s*v_script\.content/,
  );
  assert.match(
    migration,
    /BEFORE UPDATE OR DELETE ON co_production\.project_shot_plan_revisions/,
  );
  assert.match(
    migration,
    /BEFORE TRUNCATE ON co_production\.project_shot_plan_revisions/,
  );

  for (const column of [
    "shot_plan_revision_id uuid NOT NULL",
    "shot_plan_content_hash text NOT NULL",
    "source_project_script_revision_id uuid NOT NULL",
    "source_project_script_content_hash text NOT NULL",
    "source_production_plan_revision_id uuid NOT NULL",
    "source_production_plan_content_hash text NOT NULL",
    "source_production_plan_script_binding_id uuid NOT NULL",
    "decision_receipt_id uuid NOT NULL",
    "approved_by uuid NOT NULL",
    "approved_at timestamptz NOT NULL",
  ]) {
    assert.ok(approvalTable.includes(column), `missing approval column: ${column}`);
  }
  assert.match(approvalTable, /UNIQUE \(shot_plan_revision_id\)/);
  assert.match(approvalTable, /UNIQUE \(decision_receipt_id\)/);
  assert.match(
    decide,
    /IF p_decision = 'approved' THEN\s+INSERT INTO co_production\.project_shot_plan_approval_bindings/,
  );
});

test("current source is exactly the latest approved script plus current plan binding", () => {
  assert.match(
    currentSource,
    /latest_workflow\.mutation_kind = 'project_script\.approved'/,
  );
  assert.match(
    currentSource,
    /ORDER BY revision\.revision_number DESC\s+LIMIT 1/,
  );
  assert.match(
    currentSource,
    /ORDER BY plan\.revision_number DESC\s+LIMIT 1/,
  );
  assert.match(
    currentSource,
    /binding\.plan_revision_id = plan\.id[\s\S]*?binding\.source_project_script_revision_id = script\.id[\s\S]*?binding\.source_project_script_content_hash = script\.content_hash/,
  );
  for (const key of [
    "scriptRevisionId",
    "scriptRevisionNumber",
    "scriptContentHash",
    "productionPlanRevisionId",
    "productionPlanRevisionNumber",
    "productionPlanContentHash",
    "productionPlanScriptBindingId",
  ]) {
    assert.match(currentSource, new RegExp(`'${key}'`));
  }
});

test("shared receipt and event chain adds shot-plan targets without changing legacy hash bytes", () => {
  for (const kind of mutationKinds) {
    assert.match(migration, new RegExp(`'${escapeRegExp(kind)}'`));
  }
  assert.match(migration, /ADD COLUMN shot_plan_revision_id uuid/);
  assert.match(
    migration,
    /mutation_kind IN \(\s*'project_shot_plan\.generated',[\s\S]*?'project_shot_plan\.changes_requested'[\s\S]*?shot_plan_revision_id IS NOT NULL/,
  );
  assert.match(
    eventGuard,
    /NEW\.entity_kind IS DISTINCT FROM 'project_shot_plan_revision'[\s\S]*?NEW\.entity_id IS DISTINCT FROM v_receipt\.shot_plan_revision_id/,
  );

  const predecessorLegacyReceipts = boundedSection(
    predecessorReceiptVerifier,
    "  IF NEW.mutation_kind IN (",
    "  ELSE\n",
  );
  const currentLegacyReceipts = boundedSection(
    receiptVerifier,
    "  IF NEW.mutation_kind IN (",
    "  ELSIF NEW.mutation_kind IN (\n    'project_shot_plan.generated'",
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
    "    OR (\n      v_receipt.mutation_kind IN (\n        'project_shot_plan.generated'",
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

test("five RPCs are role gated, replay before conflict, source aware, and share one authority head", () => {
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

  assert.match(generate, /project_shot_plan_source_already_generated/);
  assert.match(append, /project_shot_plan_stale_source/);
  assert.match(submit, /project_shot_plan_stale_source/);
  assert.match(decide, /project_shot_plan_stale_source/);
  assert.match(
    append,
    /v_base\.source_project_script_revision_id[\s\S]*?v_base\.source_production_plan_script_binding_id/,
  );
});

test("read snapshot is strict, exposes full head and metadata, and selects the highest current-source approval", () => {
  assert.match(
    getShotPlan,
    /RETURN pg_catalog\.jsonb_build_object\(\s*'projectId',[\s\S]*?'authorityVersion',[\s\S]*?'eventHeadHash',[\s\S]*?'source',[\s\S]*?'head',[\s\S]*?'revisions',[\s\S]*?'permissions'/,
  );
  assert.match(
    getShotPlan,
    /'canGenerate',[\s\S]*?'canRevise',[\s\S]*?'canSubmit',[\s\S]*?'canDecide'/,
  );
  assert.match(
    getShotPlan,
    /FROM co_production\.project_shot_plan_approval_bindings AS binding[\s\S]*?ORDER BY revision\.revision_number DESC\s+LIMIT 1/,
  );
  assert.match(getShotPlan, /'content', v_head\.content/);
  assert.match(getShotPlan, /'state', CASE latest_workflow\.mutation_kind/);
  assert.match(getShotPlan, /'isStale', v_source IS NULL OR ROW/);
  assert.match(
    getShotPlan,
    /'isActive', revision\.id IS NOT DISTINCT FROM v_active_revision_id/,
  );
  assert.match(getShotPlan, /'submissionNote'/);
  assert.match(getShotPlan, /'decisionNote'/);
});

test("authority is RPC-only and leaves no direct table write grants", () => {
  for (const table of [
    "project_shot_plan_revisions",
    "project_shot_plan_approval_bindings",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `REVOKE ALL ON TABLE co_production\\.${table}\\s+` +
          "FROM PUBLIC, anon, authenticated, service_role;",
      ),
    );
    assert.doesNotMatch(
      migration,
      new RegExp(`GRANT (?:INSERT|UPDATE|DELETE) ON TABLE[^;]*${table}`),
    );
  }

  for (const signature of [
    "co_production.get_project_shot_plan(uuid)",
    "co_production.generate_project_shot_plan_revision",
    "co_production.append_project_shot_plan_revision",
    "co_production.submit_project_shot_plan_revision",
    "co_production.decide_project_shot_plan_revision",
  ]) {
    assert.match(migration, new RegExp(`GRANT EXECUTE ON FUNCTION\\s+${escapeRegExp(signature)}`));
  }
  assert.match(
    migration,
    /project_shot_plan_revisions_staff_select[\s\S]*?'owner', 'admin', 'producer', 'editor'/,
  );
  assert.match(
    migration,
    /project_shot_plan_approval_bindings_staff_select[\s\S]*?'owner', 'admin', 'producer', 'editor'/,
  );

  const securityDefiners = [
    currentSource,
    revisionGuard,
    getShotPlan,
    generate,
    append,
    submit,
    decide,
  ];
  for (const command of securityDefiners) {
    assert.match(command, /SECURITY DEFINER/);
    assert.match(command, /SET search_path = ''/);
  }
});
