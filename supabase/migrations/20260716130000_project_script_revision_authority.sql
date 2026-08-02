-- Canonical Co-Script revision authority for project pre-production.
--
-- This migration is additive, source-only, and intentionally unapplied. A
-- project has one immutable script revision stream. Effective workflow state
-- is derived only from later revisions and exact mutation receipts. Storyboards
-- and shot lists remain separate future authorities.

BEGIN;

DO $project_script_preflight$
BEGIN
  IF current_setting('server_version_num')::integer < 150000 THEN
    RAISE EXCEPTION USING
      ERRCODE = '0A000',
      MESSAGE = 'project_script_requires_postgresql_15';
  END IF;

  IF pg_catalog.to_regclass('co_production.projects') IS NULL
    OR pg_catalog.to_regclass('co_production.project_manual_origins') IS NULL
    OR pg_catalog.to_regclass('co_production.project_preproject_origins') IS NULL
    OR pg_catalog.to_regclass('co_production.project_brief_revisions') IS NULL
    OR pg_catalog.to_regclass(
      'co_production.project_preproduction_authorities'
    ) IS NULL
    OR pg_catalog.to_regclass(
      'co_production.project_preproduction_mutation_receipts'
    ) IS NULL
    OR pg_catalog.to_regclass(
      'co_production.project_preproduction_events'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'co_production_private.project_preproduction_role(uuid)'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'co_production_private.preproject_sha256(text)'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'co_production_private.preproject_safe_text(text,integer,integer)'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'co_production_private.preproject_exact_json_keys(jsonb,text[])'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'co_production_private.prevent_project_preproduction_immutable_mutation()'
    ) IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_script_requires_existing_preproduction_authorities';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_record
    WHERE constraint_record.conrelid =
      'co_production.project_brief_revisions'::pg_catalog.regclass
      AND constraint_record.conname =
        'project_brief_revisions_id_project_team_content_hash_key'
      AND constraint_record.contype = 'u'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_script_requires_project_brief_hash_authority';
  END IF;
END
$project_script_preflight$;

CREATE OR REPLACE FUNCTION
  co_production_private.project_script_content_is_valid(
    p_content jsonb
  )
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
  v_section jsonb;
  v_block jsonb;
  v_stable_id text;
  v_seen_ids text[] := ARRAY[]::text[];
  v_block_count integer := 0;
  v_normalized_text_chars bigint := 0;
BEGIN
  IF pg_catalog.jsonb_typeof(p_content) IS DISTINCT FROM 'object'
    OR pg_catalog.octet_length(p_content::text) > 524288
    OR NOT co_production_private.preproject_exact_json_keys(
      p_content,
      ARRAY[
        'schemaVersion', 'title', 'logline', 'format',
        'estimatedRuntimeSeconds', 'sections'
      ]
    )
    OR pg_catalog.jsonb_typeof(p_content -> 'schemaVersion')
      IS DISTINCT FROM 'string'
    OR p_content ->> 'schemaVersion' IS DISTINCT FROM 'cco.script-content.v1'
    OR pg_catalog.jsonb_typeof(p_content -> 'title') IS DISTINCT FROM 'string'
    OR NOT co_production_private.preproject_safe_text(
      p_content ->> 'title', 1, 240
    )
    OR p_content ->> 'title'
      IS DISTINCT FROM pg_catalog.btrim(p_content ->> 'title')
    OR p_content ->> 'title' ~ E'\r'
    OR pg_catalog.jsonb_typeof(p_content -> 'logline') NOT IN ('string', 'null')
    OR (
      pg_catalog.jsonb_typeof(p_content -> 'logline') = 'string'
      AND (
        NOT co_production_private.preproject_safe_text(
          p_content ->> 'logline', 1, 2000
        )
        OR p_content ->> 'logline'
          IS DISTINCT FROM pg_catalog.btrim(p_content ->> 'logline')
        OR p_content ->> 'logline' ~ E'\r'
      )
    )
    OR pg_catalog.jsonb_typeof(p_content -> 'format') IS DISTINCT FROM 'string'
    OR p_content ->> 'format' NOT IN (
      'commercial', 'documentary', 'interview', 'voice_over',
      'screenplay', 'outline'
    )
    OR pg_catalog.jsonb_typeof(p_content -> 'estimatedRuntimeSeconds')
      NOT IN ('number', 'null')
    OR (
      pg_catalog.jsonb_typeof(p_content -> 'estimatedRuntimeSeconds') = 'number'
      AND (
        p_content ->> 'estimatedRuntimeSeconds' !~ '^[1-9][0-9]{0,4}$'
        OR (p_content ->> 'estimatedRuntimeSeconds')::integer > 86400
      )
    )
    OR pg_catalog.jsonb_typeof(p_content -> 'sections') IS DISTINCT FROM 'array'
    OR pg_catalog.jsonb_array_length(p_content -> 'sections')
      NOT BETWEEN 1 AND 200
  THEN
    RETURN false;
  END IF;

  v_normalized_text_chars :=
    pg_catalog.char_length(pg_catalog.btrim(p_content ->> 'title'))
    + pg_catalog.char_length(
      pg_catalog.btrim(COALESCE(p_content ->> 'logline', ''))
    );

  FOR v_section IN
    SELECT section.value
    FROM pg_catalog.jsonb_array_elements(p_content -> 'sections')
      AS section(value)
  LOOP
    IF NOT co_production_private.preproject_exact_json_keys(
      v_section,
      ARRAY['id', 'heading', 'summary', 'estimatedDurationSeconds', 'blocks']
    )
      OR pg_catalog.jsonb_typeof(v_section -> 'id') IS DISTINCT FROM 'string'
      OR NOT co_production_private.preproject_safe_text(
        v_section ->> 'id', 1, 80
      )
      OR v_section ->> 'id'
        IS DISTINCT FROM pg_catalog.btrim(v_section ->> 'id')
      OR v_section ->> 'id' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$'
      OR pg_catalog.jsonb_typeof(v_section -> 'heading')
        IS DISTINCT FROM 'string'
      OR NOT co_production_private.preproject_safe_text(
        v_section ->> 'heading', 1, 240
      )
      OR v_section ->> 'heading'
        IS DISTINCT FROM pg_catalog.btrim(v_section ->> 'heading')
      OR v_section ->> 'heading' ~ E'\r'
      OR pg_catalog.jsonb_typeof(v_section -> 'summary')
        NOT IN ('string', 'null')
      OR (
        pg_catalog.jsonb_typeof(v_section -> 'summary') = 'string'
        AND (
          NOT co_production_private.preproject_safe_text(
            v_section ->> 'summary', 1, 4000
          )
          OR v_section ->> 'summary'
            IS DISTINCT FROM pg_catalog.btrim(v_section ->> 'summary')
          OR v_section ->> 'summary' ~ E'\r'
        )
      )
      OR pg_catalog.jsonb_typeof(v_section -> 'estimatedDurationSeconds')
        NOT IN ('number', 'null')
      OR (
        pg_catalog.jsonb_typeof(v_section -> 'estimatedDurationSeconds')
          = 'number'
        AND (
          v_section ->> 'estimatedDurationSeconds' !~ '^[1-9][0-9]{0,4}$'
          OR (v_section ->> 'estimatedDurationSeconds')::integer > 86400
        )
      )
      OR pg_catalog.jsonb_typeof(v_section -> 'blocks') IS DISTINCT FROM 'array'
      OR pg_catalog.jsonb_array_length(v_section -> 'blocks')
        NOT BETWEEN 1 AND 200
    THEN
      RETURN false;
    END IF;

    v_stable_id := v_section ->> 'id';
    IF v_stable_id = ANY(v_seen_ids) THEN
      RETURN false;
    END IF;
    v_seen_ids := pg_catalog.array_append(v_seen_ids, v_stable_id);
    v_normalized_text_chars := v_normalized_text_chars
      + pg_catalog.char_length(pg_catalog.btrim(v_section ->> 'heading'))
      + pg_catalog.char_length(
        pg_catalog.btrim(COALESCE(v_section ->> 'summary', ''))
      );

    FOR v_block IN
      SELECT block.value
      FROM pg_catalog.jsonb_array_elements(v_section -> 'blocks')
        AS block(value)
    LOOP
      IF NOT co_production_private.preproject_exact_json_keys(
        v_block,
        ARRAY['id', 'kind', 'text', 'speaker', 'parenthetical']
      )
        OR pg_catalog.jsonb_typeof(v_block -> 'id') IS DISTINCT FROM 'string'
        OR NOT co_production_private.preproject_safe_text(
          v_block ->> 'id', 1, 80
        )
        OR v_block ->> 'id'
          IS DISTINCT FROM pg_catalog.btrim(v_block ->> 'id')
        OR v_block ->> 'id' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$'
        OR pg_catalog.jsonb_typeof(v_block -> 'kind') IS DISTINCT FROM 'string'
        OR v_block ->> 'kind' NOT IN (
          'scene_heading', 'visual', 'action', 'dialogue', 'voice_over',
          'interview_question', 'b_roll', 'on_screen_text', 'graphic',
          'music', 'sfx', 'transition', 'note'
        )
        OR pg_catalog.jsonb_typeof(v_block -> 'text') IS DISTINCT FROM 'string'
        OR NOT co_production_private.preproject_safe_text(
          v_block ->> 'text', 1, 20000
        )
        OR v_block ->> 'text'
          IS DISTINCT FROM pg_catalog.btrim(v_block ->> 'text')
        OR v_block ->> 'text' ~ E'\r'
        OR pg_catalog.jsonb_typeof(v_block -> 'speaker')
          NOT IN ('string', 'null')
        OR (
          pg_catalog.jsonb_typeof(v_block -> 'speaker') = 'string'
          AND (
            NOT co_production_private.preproject_safe_text(
              v_block ->> 'speaker', 1, 240
            )
            OR v_block ->> 'speaker'
              IS DISTINCT FROM pg_catalog.btrim(v_block ->> 'speaker')
            OR v_block ->> 'speaker' ~ E'\r'
          )
        )
        OR pg_catalog.jsonb_typeof(v_block -> 'parenthetical')
          NOT IN ('string', 'null')
        OR (
          pg_catalog.jsonb_typeof(v_block -> 'parenthetical') = 'string'
          AND (
            NOT co_production_private.preproject_safe_text(
              v_block ->> 'parenthetical', 1, 1000
            )
            OR v_block ->> 'parenthetical'
              IS DISTINCT FROM pg_catalog.btrim(v_block ->> 'parenthetical')
            OR v_block ->> 'parenthetical' ~ E'\r'
          )
        )
      THEN
        RETURN false;
      END IF;

      v_stable_id := v_block ->> 'id';
      IF v_stable_id = ANY(v_seen_ids) THEN
        RETURN false;
      END IF;
      v_seen_ids := pg_catalog.array_append(v_seen_ids, v_stable_id);
      v_block_count := v_block_count + 1;
      IF v_block_count > 2000 THEN
        RETURN false;
      END IF;

      v_normalized_text_chars := v_normalized_text_chars
        + pg_catalog.char_length(pg_catalog.btrim(v_block ->> 'text'))
        + pg_catalog.char_length(
          pg_catalog.btrim(COALESCE(v_block ->> 'speaker', ''))
        )
        + pg_catalog.char_length(
          pg_catalog.btrim(COALESCE(v_block ->> 'parenthetical', ''))
        );

      IF v_normalized_text_chars > 200000 THEN
        RETURN false;
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_block_count BETWEEN 1 AND 2000
    AND v_normalized_text_chars <= 200000;
END
$$;

CREATE TABLE co_production.project_script_revisions (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  project_id uuid NOT NULL,
  team_id uuid,
  revision_number bigint NOT NULL CHECK (
    revision_number BETWEEN 1 AND 2147483647
  ),
  base_revision_id uuid,
  change_summary text CHECK (
    change_summary IS NULL
    OR (
      co_production_private.preproject_safe_text(change_summary, 1, 4000)
      AND change_summary = pg_catalog.btrim(change_summary)
      AND change_summary !~ E'\r'
    )
  ),
  content jsonb NOT NULL CHECK (
    co_production_private.project_script_content_is_valid(content)
  ),
  content_hash text NOT NULL CHECK (
    content_hash ~ '^sha256:[0-9a-f]{64}$'
    AND content_hash = co_production_private.preproject_sha256(content::text)
  ),
  source_kind text NOT NULL CHECK (
    source_kind IN ('accepted_proposal', 'manual')
  ),
  source_project_brief_revision_id uuid,
  source_project_brief_content_hash text CHECK (
    source_project_brief_content_hash IS NULL
    OR source_project_brief_content_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL,
  CONSTRAINT project_script_revisions_project_revision_key
    UNIQUE (project_id, revision_number),
  CONSTRAINT project_script_revisions_id_project_key
    UNIQUE (id, project_id),
  CONSTRAINT project_script_revisions_id_project_team_key
    UNIQUE (id, project_id, team_id),
  CONSTRAINT project_script_revisions_authority_fk
    FOREIGN KEY (project_id)
    REFERENCES co_production.project_preproduction_authorities(project_id)
    ON DELETE RESTRICT,
  CONSTRAINT project_script_revisions_project_team_fk
    FOREIGN KEY (project_id, team_id)
    REFERENCES co_production.projects(id, team_id)
    ON DELETE RESTRICT,
  CONSTRAINT project_script_revisions_base_shape CHECK (
    (revision_number = 1 AND base_revision_id IS NULL)
    OR (revision_number > 1 AND base_revision_id IS NOT NULL)
  ),
  CONSTRAINT project_script_revisions_base_fk
    FOREIGN KEY (base_revision_id, project_id)
    REFERENCES co_production.project_script_revisions(id, project_id)
    ON DELETE RESTRICT,
  CONSTRAINT project_script_revisions_brief_shape CHECK (
    (
      source_kind = 'manual'
      AND source_project_brief_revision_id IS NULL
      AND source_project_brief_content_hash IS NULL
    )
    OR (
      source_kind = 'accepted_proposal'
      AND team_id IS NOT NULL
      AND source_project_brief_revision_id IS NOT NULL
      AND source_project_brief_content_hash IS NOT NULL
    )
  ),
  CONSTRAINT project_script_revisions_project_brief_fk
    FOREIGN KEY (
      source_project_brief_revision_id,
      project_id,
      team_id,
      source_project_brief_content_hash
    )
    REFERENCES co_production.project_brief_revisions(
      id,
      project_id,
      team_id,
      content_hash
    )
    ON DELETE RESTRICT
);

COMMENT ON TABLE co_production.project_script_revisions IS
  'Canonical append-only Co-Script revisions. Storyboards and shot lists are separate authorities.';

ALTER TABLE co_production.project_preproduction_mutation_receipts
  ADD COLUMN script_revision_id uuid;

ALTER TABLE co_production.project_preproduction_mutation_receipts
  DROP CONSTRAINT project_preproduction_mutation_receipts_mutation_kind_check,
  DROP CONSTRAINT project_preproduction_receipts_target_shape,
  ADD CONSTRAINT project_preproduction_receipts_mutation_kind_check CHECK (
    mutation_kind IN (
      'production_plan.initialized',
      'production_plan.replanned',
      'production_task.mutated',
      'project_script.created',
      'project_script.revised',
      'project_script.submitted',
      'project_script.approved',
      'project_script.changes_requested'
    )
  ),
  ADD CONSTRAINT project_preproduction_receipts_script_fk
    FOREIGN KEY (script_revision_id, project_id)
    REFERENCES co_production.project_script_revisions(id, project_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT project_preproduction_receipts_target_shape CHECK (
    (
      mutation_kind IN ('production_plan.initialized', 'production_plan.replanned')
      AND plan_revision_id IS NOT NULL
      AND task_id IS NULL
      AND script_revision_id IS NULL
    )
    OR (
      mutation_kind = 'production_task.mutated'
      AND plan_revision_id IS NULL
      AND task_id IS NOT NULL
      AND script_revision_id IS NULL
    )
    OR (
      mutation_kind IN (
        'project_script.created',
        'project_script.revised',
        'project_script.submitted',
        'project_script.approved',
        'project_script.changes_requested'
      )
      AND plan_revision_id IS NULL
      AND task_id IS NULL
      AND script_revision_id IS NOT NULL
    )
  );

ALTER TABLE co_production.project_preproduction_events
  DROP CONSTRAINT project_preproduction_events_event_type_check,
  DROP CONSTRAINT project_preproduction_events_entity_kind_check,
  ADD CONSTRAINT project_preproduction_events_event_type_check CHECK (
    event_type IN (
      'production_plan.initialized',
      'production_plan.replanned',
      'production_task.mutated',
      'project_script.created',
      'project_script.revised',
      'project_script.submitted',
      'project_script.approved',
      'project_script.changes_requested'
    )
  ),
  ADD CONSTRAINT project_preproduction_events_entity_kind_check CHECK (
    entity_kind IN (
      'production_plan_revision',
      'production_task',
      'project_script_revision'
    )
  );

CREATE OR REPLACE FUNCTION
  co_production_private.verify_project_preproduction_receipt_hash()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_expected_hash text;
BEGIN
  IF NEW.mutation_kind IN (
    'production_plan.initialized',
    'production_plan.replanned',
    'production_task.mutated'
  ) THEN
    -- This legacy branch is byte-for-byte the original plan/task hash payload.
    v_expected_hash := co_production_private.preproject_sha256(
      pg_catalog.jsonb_build_object(
        'id', NEW.id,
        'projectId', NEW.project_id,
        'teamId', NEW.team_id,
        'mutationKind', NEW.mutation_kind,
        'planRevisionId', NEW.plan_revision_id,
        'taskId', NEW.task_id,
        'expectedEntityVersion', NEW.expected_entity_version,
        'resultingEntityVersion', NEW.resulting_entity_version,
        'authorityVersion', NEW.authority_version,
        'requestId', NEW.request_id,
        'requestHash', NEW.request_hash,
        'result', NEW.result,
        'actorId', NEW.actor_id,
        'createdAt', NEW.created_at
      )::text
    );
  ELSIF NEW.mutation_kind IN (
    'project_script.created',
    'project_script.revised',
    'project_script.submitted',
    'project_script.approved',
    'project_script.changes_requested'
  ) THEN
    v_expected_hash := co_production_private.preproject_sha256(
      pg_catalog.jsonb_build_object(
        'id', NEW.id,
        'projectId', NEW.project_id,
        'teamId', NEW.team_id,
        'mutationKind', NEW.mutation_kind,
        'planRevisionId', NEW.plan_revision_id,
        'taskId', NEW.task_id,
        'scriptRevisionId', NEW.script_revision_id,
        'expectedEntityVersion', NEW.expected_entity_version,
        'resultingEntityVersion', NEW.resulting_entity_version,
        'authorityVersion', NEW.authority_version,
        'requestId', NEW.request_id,
        'requestHash', NEW.request_hash,
        'result', NEW.result,
        'actorId', NEW.actor_id,
        'createdAt', NEW.created_at
      )::text
    );
  ELSE
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'invalid_project_preproduction_receipt_kind';
  END IF;

  IF NEW.receipt_hash IS DISTINCT FROM v_expected_hash THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'invalid_project_preproduction_receipt_hash';
  END IF;

  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION
  co_production_private.guard_project_preproduction_event_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_authority co_production.project_preproduction_authorities%ROWTYPE;
  v_receipt co_production.project_preproduction_mutation_receipts%ROWTYPE;
  v_expected_hash text;
BEGIN
  SELECT authority.*
  INTO v_authority
  FROM co_production.project_preproduction_authorities AS authority
  WHERE authority.project_id = NEW.project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'preproduction_authority_missing';
  END IF;

  SELECT receipt.*
  INTO v_receipt
  FROM co_production.project_preproduction_mutation_receipts AS receipt
  WHERE receipt.id = NEW.receipt_id
    AND receipt.project_id = NEW.project_id
    AND receipt.authority_version = NEW.authority_version;

  IF NOT FOUND
    OR NEW.authority_version IS DISTINCT FROM v_authority.authority_version + 1
    OR NEW.previous_event_hash IS DISTINCT FROM v_authority.event_head_hash
    OR NEW.event_type IS DISTINCT FROM v_receipt.mutation_kind
    OR NEW.actor_id IS DISTINCT FROM v_receipt.actor_id
    OR NEW.occurred_at IS DISTINCT FROM v_receipt.created_at
    OR (
      v_receipt.mutation_kind IN (
        'production_plan.initialized', 'production_plan.replanned'
      )
      AND (
        NEW.entity_kind IS DISTINCT FROM 'production_plan_revision'
        OR NEW.entity_id IS DISTINCT FROM v_receipt.plan_revision_id
      )
    )
    OR (
      v_receipt.mutation_kind = 'production_task.mutated'
      AND (
        NEW.entity_kind IS DISTINCT FROM 'production_task'
        OR NEW.entity_id IS DISTINCT FROM v_receipt.task_id
      )
    )
    OR (
      v_receipt.mutation_kind IN (
        'project_script.created',
        'project_script.revised',
        'project_script.submitted',
        'project_script.approved',
        'project_script.changes_requested'
      )
      AND (
        NEW.entity_kind IS DISTINCT FROM 'project_script_revision'
        OR NEW.entity_id IS DISTINCT FROM v_receipt.script_revision_id
      )
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'invalid_project_preproduction_event_chain';
  END IF;

  v_expected_hash := co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'id', NEW.id,
      'projectId', NEW.project_id,
      'teamId', NEW.team_id,
      'receiptId', NEW.receipt_id,
      'authorityVersion', NEW.authority_version,
      'eventType', NEW.event_type,
      'entityKind', NEW.entity_kind,
      'entityId', NEW.entity_id,
      'payload', NEW.payload,
      'previousEventHash', NEW.previous_event_hash,
      'actorId', NEW.actor_id,
      'occurredAt', NEW.occurred_at
    )::text
  );

  IF NEW.event_hash IS DISTINCT FROM v_expected_hash THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'invalid_project_preproduction_event_hash';
  END IF;

  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION
  co_production_private.guard_project_script_revision_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_authority_team_id uuid;
  v_latest co_production.project_script_revisions%ROWTYPE;
  v_has_accepted_origin boolean;
  v_has_manual_origin boolean;
  v_latest_brief_id uuid;
  v_latest_brief_hash text;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'cco:project-preproduction:' || NEW.project_id::text,
      0
    )
  );

  SELECT authority.team_id
  INTO v_authority_team_id
  FROM co_production.project_preproduction_authorities AS authority
  WHERE authority.project_id = NEW.project_id
  FOR UPDATE;

  IF NOT FOUND OR v_authority_team_id IS DISTINCT FROM NEW.team_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_script_authority_mismatch';
  END IF;

  SELECT revision.*
  INTO v_latest
  FROM co_production.project_script_revisions AS revision
  WHERE revision.project_id = NEW.project_id
  ORDER BY revision.revision_number DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF NEW.revision_number IS DISTINCT FROM v_latest.revision_number + 1
      OR NEW.base_revision_id IS DISTINCT FROM v_latest.id
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'project_script_lineage_mismatch';
    END IF;
  ELSIF NEW.revision_number IS DISTINCT FROM 1
    OR NEW.base_revision_id IS NOT NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'project_script_lineage_mismatch';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM co_production.project_preproject_origins AS origin
    WHERE origin.project_id = NEW.project_id
      AND origin.team_id IS NOT DISTINCT FROM NEW.team_id
      AND origin.activation_source = 'accepted_proposal'
  )
  INTO v_has_accepted_origin;

  SELECT EXISTS (
    SELECT 1
    FROM co_production.project_manual_origins AS origin
    WHERE origin.project_id = NEW.project_id
      AND origin.team_id IS NOT DISTINCT FROM NEW.team_id
      AND origin.source_kind = 'manual'
  )
  INTO v_has_manual_origin;

  IF v_has_accepted_origin = v_has_manual_origin THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_script_origin_authority_invalid';
  END IF;

  IF v_has_accepted_origin THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'cco:project-brief-projection:' || NEW.project_id::text,
        0
      )
    );

    SELECT brief.id, brief.content_hash
    INTO v_latest_brief_id, v_latest_brief_hash
    FROM co_production.project_brief_revisions AS brief
    WHERE brief.project_id = NEW.project_id
      AND brief.team_id = NEW.team_id
    ORDER BY brief.revision_number DESC
    LIMIT 1;

    IF NOT FOUND
      OR NEW.source_kind IS DISTINCT FROM 'accepted_proposal'
      OR NEW.source_project_brief_revision_id IS DISTINCT FROM v_latest_brief_id
      OR NEW.source_project_brief_content_hash IS DISTINCT FROM v_latest_brief_hash
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'project_script_project_brief_binding_mismatch';
    END IF;
  ELSIF NEW.source_kind IS DISTINCT FROM 'manual'
    OR NEW.source_project_brief_revision_id IS NOT NULL
    OR NEW.source_project_brief_content_hash IS NOT NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_script_manual_origin_binding_mismatch';
  END IF;

  RETURN NEW;
END
$$;

ALTER TABLE co_production.project_script_revisions
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.project_script_revisions
  FORCE ROW LEVEL SECURITY;

CREATE POLICY project_script_revisions_member_select
  ON co_production.project_script_revisions
  FOR SELECT TO authenticated
  USING (
    co_production_private.project_preproduction_role(project_id) IN (
      'owner', 'admin', 'producer', 'editor', 'member'
    )
  );

ALTER POLICY project_preproduction_mutation_receipts_select
  ON co_production.project_preproduction_mutation_receipts
  USING (
    (
      script_revision_id IS NULL
      AND co_production_private.project_preproduction_role(project_id)
        IS NOT NULL
    )
    OR co_production_private.project_preproduction_role(project_id) IN (
      'owner', 'admin', 'producer', 'editor', 'member'
    )
  );

ALTER POLICY project_preproduction_events_select
  ON co_production.project_preproduction_events
  USING (
    (
      entity_kind <> 'project_script_revision'
      AND co_production_private.project_preproduction_role(project_id)
        IS NOT NULL
    )
    OR co_production_private.project_preproduction_role(project_id) IN (
      'owner', 'admin', 'producer', 'editor', 'member'
    )
  );

CREATE TRIGGER project_script_revisions_lineage_guard
BEFORE INSERT ON co_production.project_script_revisions
FOR EACH ROW
EXECUTE FUNCTION
  co_production_private.guard_project_script_revision_insert();

CREATE TRIGGER project_script_revisions_immutable
BEFORE UPDATE OR DELETE ON co_production.project_script_revisions
FOR EACH ROW
EXECUTE FUNCTION
  co_production_private.prevent_project_preproduction_immutable_mutation();

CREATE OR REPLACE FUNCTION co_production.submit_project_script_revision(
  p_project_id uuid,
  p_script_revision_id uuid,
  p_expected_authority_version bigint,
  p_request_id uuid,
  p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_role text;
  v_project co_production.projects%ROWTYPE;
  v_authority co_production.project_preproduction_authorities%ROWTYPE;
  v_existing co_production.project_preproduction_mutation_receipts%ROWTYPE;
  v_revision co_production.project_script_revisions%ROWTYPE;
  v_request_payload jsonb;
  v_request_hash text;
  v_new_authority_version bigint;
  v_receipt_id uuid := pg_catalog.gen_random_uuid();
  v_event_id uuid := pg_catalog.gen_random_uuid();
  v_now timestamptz := statement_timestamp();
  v_result jsonb;
  v_receipt_hash text;
  v_event_payload jsonb;
  v_event_hash text;
BEGIN
  IF v_actor_id IS NULL
    OR p_project_id IS NULL
    OR p_script_revision_id IS NULL
    OR p_expected_authority_version IS NULL
    OR p_expected_authority_version NOT BETWEEN 0 AND 2147483646
    OR p_request_id IS NULL
    OR (
      p_note IS NOT NULL
      AND (
        NOT co_production_private.preproject_safe_text(p_note, 1, 4000)
        OR p_note IS DISTINCT FROM pg_catalog.btrim(p_note)
        OR p_note ~ E'\r'
      )
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_project_script_submission';
  END IF;

  SELECT project.*
  INTO v_project
  FROM co_production.projects AS project
  WHERE project.id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'project_script_not_found';
  END IF;

  v_role := co_production_private.project_preproduction_role(p_project_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'project_script_not_found';
  END IF;
  IF v_role NOT IN ('owner', 'admin', 'producer', 'editor') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'project_script_forbidden';
  END IF;

  v_request_payload := pg_catalog.jsonb_build_object(
    'operation', 'submit_project_script_revision',
    'projectId', p_project_id,
    'scriptRevisionId', p_script_revision_id,
    'expectedAuthorityVersion', p_expected_authority_version,
    'requestId', p_request_id,
    'note', p_note
  );
  v_request_hash := co_production_private.preproject_sha256(
    v_request_payload::text
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'cco:project-preproduction:' || p_project_id::text,
      0
    )
  );

  SELECT authority.*
  INTO v_authority
  FROM co_production.project_preproduction_authorities AS authority
  WHERE authority.project_id = p_project_id
  FOR UPDATE;

  IF NOT FOUND OR v_authority.team_id IS DISTINCT FROM v_project.team_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_script_authority_mismatch';
  END IF;

  SELECT receipt.*
  INTO v_existing
  FROM co_production.project_preproduction_mutation_receipts AS receipt
  WHERE receipt.project_id = p_project_id
    AND receipt.request_id = p_request_id;

  IF FOUND THEN
    IF v_existing.mutation_kind IS DISTINCT FROM 'project_script.submitted'
      OR v_existing.script_revision_id IS DISTINCT FROM p_script_revision_id
      OR v_existing.expected_entity_version
        IS DISTINCT FROM p_expected_authority_version
      OR v_existing.request_payload IS DISTINCT FROM v_request_payload
      OR v_existing.request_hash IS DISTINCT FROM v_request_hash
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'project_script_idempotency_conflict';
    END IF;
    RETURN v_existing.result
      || pg_catalog.jsonb_build_object('replayed', true);
  END IF;

  IF v_authority.authority_version
    IS DISTINCT FROM p_expected_authority_version
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'project_script_authority_version_conflict';
  END IF;
  IF v_authority.authority_version >= 2147483647 THEN
    RAISE EXCEPTION USING
      ERRCODE = '54000',
      MESSAGE = 'preproduction_authority_version_exhausted';
  END IF;

  SELECT revision.*
  INTO v_revision
  FROM co_production.project_script_revisions AS revision
  WHERE revision.project_id = p_project_id
  ORDER BY revision.revision_number DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND OR v_revision.id IS DISTINCT FROM p_script_revision_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'project_script_revision_conflict';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM co_production.project_preproduction_mutation_receipts AS receipt
    WHERE receipt.project_id = p_project_id
      AND receipt.script_revision_id = p_script_revision_id
      AND receipt.mutation_kind IN (
        'project_script.submitted',
        'project_script.approved',
        'project_script.changes_requested'
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_script_invalid_transition';
  END IF;

  v_new_authority_version := v_authority.authority_version + 1;
  v_result := pg_catalog.jsonb_build_object(
    'scriptRevisionId', p_script_revision_id,
    'projectId', p_project_id,
    'revisionNumber', v_revision.revision_number,
    'effectiveState', 'submitted',
    'authorityVersion', v_new_authority_version,
    'requestId', p_request_id,
    'replayed', false
  );

  v_receipt_hash := co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'id', v_receipt_id,
      'projectId', p_project_id,
      'teamId', v_project.team_id,
      'mutationKind', 'project_script.submitted',
      'planRevisionId', NULL,
      'taskId', NULL,
      'scriptRevisionId', p_script_revision_id,
      'expectedEntityVersion', p_expected_authority_version,
      'resultingEntityVersion', v_new_authority_version,
      'authorityVersion', v_new_authority_version,
      'requestId', p_request_id,
      'requestHash', v_request_hash,
      'result', v_result,
      'actorId', v_actor_id,
      'createdAt', v_now
    )::text
  );
  v_event_payload := pg_catalog.jsonb_build_object(
    'scriptRevisionId', p_script_revision_id,
    'revisionNumber', v_revision.revision_number,
    'note', p_note
  );
  v_event_hash := co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'id', v_event_id,
      'projectId', p_project_id,
      'teamId', v_project.team_id,
      'receiptId', v_receipt_id,
      'authorityVersion', v_new_authority_version,
      'eventType', 'project_script.submitted',
      'entityKind', 'project_script_revision',
      'entityId', p_script_revision_id,
      'payload', v_event_payload,
      'previousEventHash', v_authority.event_head_hash,
      'actorId', v_actor_id,
      'occurredAt', v_now
    )::text
  );

  INSERT INTO co_production.project_preproduction_mutation_receipts (
    id,
    project_id,
    team_id,
    mutation_kind,
    plan_revision_id,
    task_id,
    script_revision_id,
    expected_entity_version,
    resulting_entity_version,
    authority_version,
    request_id,
    request_payload,
    request_hash,
    result,
    receipt_hash,
    actor_id,
    created_at
  )
  VALUES (
    v_receipt_id,
    p_project_id,
    v_project.team_id,
    'project_script.submitted',
    NULL,
    NULL,
    p_script_revision_id,
    p_expected_authority_version,
    v_new_authority_version,
    v_new_authority_version,
    p_request_id,
    v_request_payload,
    v_request_hash,
    v_result,
    v_receipt_hash,
    v_actor_id,
    v_now
  );

  INSERT INTO co_production.project_preproduction_events (
    id,
    project_id,
    team_id,
    receipt_id,
    authority_version,
    event_type,
    entity_kind,
    entity_id,
    payload,
    previous_event_hash,
    event_hash,
    actor_id,
    occurred_at
  )
  VALUES (
    v_event_id,
    p_project_id,
    v_project.team_id,
    v_receipt_id,
    v_new_authority_version,
    'project_script.submitted',
    'project_script_revision',
    p_script_revision_id,
    v_event_payload,
    v_authority.event_head_hash,
    v_event_hash,
    v_actor_id,
    v_now
  );

  UPDATE co_production.project_preproduction_authorities AS authority
  SET
    authority_version = v_new_authority_version,
    event_head_hash = v_event_hash,
    updated_by = v_actor_id,
    updated_at = v_now
  WHERE authority.project_id = p_project_id
    AND authority.authority_version = v_authority.authority_version
    AND authority.event_head_hash = v_authority.event_head_hash;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'project_script_authority_version_conflict';
  END IF;

  RETURN v_result;
END
$$;

CREATE OR REPLACE FUNCTION co_production.get_project_script(
  p_project_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_role text;
  v_authority_version bigint := 0;
  v_event_head_hash text := 'sha256:' || pg_catalog.repeat('0', 64);
  v_revisions jsonb := '[]'::jsonb;
BEGIN
  IF p_project_id IS NULL OR v_actor_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'project_script_forbidden';
  END IF;

  v_role := co_production_private.project_preproduction_role(p_project_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'project_script_not_found';
  END IF;
  IF v_role NOT IN ('owner', 'admin', 'producer', 'editor', 'member') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'project_script_forbidden';
  END IF;

  SELECT authority.authority_version, authority.event_head_hash
  INTO v_authority_version, v_event_head_hash
  FROM co_production.project_preproduction_authorities AS authority
  WHERE authority.project_id = p_project_id;

  IF NOT FOUND THEN
    v_authority_version := 0;
    v_event_head_hash := 'sha256:' || pg_catalog.repeat('0', 64);
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', revision.id,
        'projectId', revision.project_id,
        'revisionNumber', revision.revision_number,
        'baseRevisionId', revision.base_revision_id,
        'effectiveState', CASE
          WHEN EXISTS (
            SELECT 1
            FROM co_production.project_script_revisions AS later_revision
            WHERE later_revision.project_id = revision.project_id
              AND later_revision.revision_number > revision.revision_number
          ) THEN 'superseded'
          WHEN latest_workflow.mutation_kind = 'project_script.approved'
            THEN 'approved'
          WHEN latest_workflow.mutation_kind = 'project_script.changes_requested'
            THEN 'changes_requested'
          WHEN latest_workflow.mutation_kind = 'project_script.submitted'
            THEN 'submitted'
          ELSE 'draft'
        END,
        'changeSummary', revision.change_summary,
        'content', revision.content,
        'contentHash', revision.content_hash,
        'sourceKind', revision.source_kind,
        'sourceProjectBriefRevisionId',
          revision.source_project_brief_revision_id,
        'sourceProjectBriefContentHash',
          revision.source_project_brief_content_hash,
        'createdBy', revision.created_by,
        'createdAt', revision.created_at
      )
      ORDER BY revision.revision_number DESC
    ),
    '[]'::jsonb
  )
  INTO v_revisions
  FROM co_production.project_script_revisions AS revision
  LEFT JOIN LATERAL (
    SELECT receipt.mutation_kind
    FROM co_production.project_preproduction_mutation_receipts AS receipt
    WHERE receipt.project_id = revision.project_id
      AND receipt.script_revision_id = revision.id
      AND receipt.mutation_kind IN (
        'project_script.submitted',
        'project_script.approved',
        'project_script.changes_requested'
      )
    ORDER BY receipt.authority_version DESC
    LIMIT 1
  ) AS latest_workflow ON true
  WHERE revision.project_id = p_project_id;

  RETURN pg_catalog.jsonb_build_object(
    'projectId', p_project_id,
    'authorityVersion', v_authority_version,
    'eventHeadHash', v_event_head_hash,
    'script', COALESCE(v_revisions -> 0, 'null'::jsonb),
    'revisions', v_revisions,
    'permissions', pg_catalog.jsonb_build_object(
      'role', v_role,
      'canAppend', v_role IN ('owner', 'admin', 'producer', 'editor'),
      'canSubmit', v_role IN ('owner', 'admin', 'producer', 'editor'),
      'canDecide', v_role IN ('owner', 'admin', 'producer')
    )
  );
END
$$;

CREATE OR REPLACE FUNCTION co_production.append_project_script_revision(
  p_project_id uuid,
  p_expected_authority_version bigint,
  p_request_id uuid,
  p_base_revision_id uuid,
  p_change_summary text,
  p_content jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_role text;
  v_project co_production.projects%ROWTYPE;
  v_authority co_production.project_preproduction_authorities%ROWTYPE;
  v_existing co_production.project_preproduction_mutation_receipts%ROWTYPE;
  v_latest co_production.project_script_revisions%ROWTYPE;
  v_revision_id uuid := pg_catalog.gen_random_uuid();
  v_revision_number bigint;
  v_new_authority_version bigint;
  v_mutation_kind text;
  v_content_hash text;
  v_source_kind text;
  v_source_brief_revision_id uuid;
  v_source_brief_content_hash text;
  v_has_accepted_origin boolean;
  v_has_manual_origin boolean;
  v_request_payload jsonb;
  v_request_hash text;
  v_receipt_id uuid := pg_catalog.gen_random_uuid();
  v_event_id uuid := pg_catalog.gen_random_uuid();
  v_now timestamptz := statement_timestamp();
  v_result jsonb;
  v_receipt_hash text;
  v_event_payload jsonb;
  v_event_hash text;
BEGIN
  IF v_actor_id IS NULL
    OR p_project_id IS NULL
    OR p_expected_authority_version IS NULL
    OR p_expected_authority_version NOT BETWEEN 0 AND 2147483646
    OR p_request_id IS NULL
    OR p_content IS NULL
    OR NOT co_production_private.project_script_content_is_valid(p_content)
    OR (
      p_change_summary IS NOT NULL
      AND (
        NOT co_production_private.preproject_safe_text(
          p_change_summary, 1, 4000
        )
        OR p_change_summary IS DISTINCT FROM pg_catalog.btrim(p_change_summary)
        OR p_change_summary ~ E'\r'
      )
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_project_script_revision';
  END IF;

  SELECT project.*
  INTO v_project
  FROM co_production.projects AS project
  WHERE project.id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'project_script_not_found';
  END IF;

  v_role := co_production_private.project_preproduction_role(p_project_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'project_script_not_found';
  END IF;
  IF v_role NOT IN ('owner', 'admin', 'producer', 'editor') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'project_script_forbidden';
  END IF;

  v_request_payload := pg_catalog.jsonb_build_object(
    'operation', 'append_project_script_revision',
    'projectId', p_project_id,
    'expectedAuthorityVersion', p_expected_authority_version,
    'requestId', p_request_id,
    'baseRevisionId', p_base_revision_id,
    'changeSummary', p_change_summary,
    'content', p_content
  );
  v_request_hash := co_production_private.preproject_sha256(
    v_request_payload::text
  );
  v_content_hash := co_production_private.preproject_sha256(p_content::text);

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'cco:project-preproduction:' || p_project_id::text,
      0
    )
  );

  INSERT INTO co_production.project_preproduction_authorities (
    project_id,
    team_id,
    authority_version,
    event_head_hash,
    created_by,
    created_at,
    updated_by,
    updated_at
  )
  VALUES (
    p_project_id,
    v_project.team_id,
    0,
    'sha256:' || pg_catalog.repeat('0', 64),
    v_actor_id,
    v_now,
    v_actor_id,
    v_now
  )
  ON CONFLICT (project_id) DO NOTHING;

  SELECT authority.*
  INTO v_authority
  FROM co_production.project_preproduction_authorities AS authority
  WHERE authority.project_id = p_project_id
  FOR UPDATE;

  IF NOT FOUND OR v_authority.team_id IS DISTINCT FROM v_project.team_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_script_authority_mismatch';
  END IF;

  SELECT receipt.*
  INTO v_existing
  FROM co_production.project_preproduction_mutation_receipts AS receipt
  WHERE receipt.project_id = p_project_id
    AND receipt.request_id = p_request_id;

  IF FOUND THEN
    IF v_existing.mutation_kind NOT IN (
      'project_script.created', 'project_script.revised'
    )
      OR v_existing.expected_entity_version
        IS DISTINCT FROM p_expected_authority_version
      OR v_existing.request_payload IS DISTINCT FROM v_request_payload
      OR v_existing.request_hash IS DISTINCT FROM v_request_hash
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'project_script_idempotency_conflict';
    END IF;
    RETURN v_existing.result
      || pg_catalog.jsonb_build_object('replayed', true);
  END IF;

  IF v_authority.authority_version
    IS DISTINCT FROM p_expected_authority_version
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'project_script_authority_version_conflict';
  END IF;
  IF v_authority.authority_version >= 2147483647 THEN
    RAISE EXCEPTION USING
      ERRCODE = '54000',
      MESSAGE = 'preproduction_authority_version_exhausted';
  END IF;

  SELECT revision.*
  INTO v_latest
  FROM co_production.project_script_revisions AS revision
  WHERE revision.project_id = p_project_id
  ORDER BY revision.revision_number DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF p_base_revision_id IS DISTINCT FROM v_latest.id THEN
      RAISE EXCEPTION USING
        ERRCODE = '40001',
        MESSAGE = 'project_script_base_revision_conflict';
    END IF;
    IF v_latest.revision_number >= 2147483647 THEN
      RAISE EXCEPTION USING
        ERRCODE = '54000',
        MESSAGE = 'project_script_revision_exhausted';
    END IF;
    v_revision_number := v_latest.revision_number + 1;
    v_mutation_kind := 'project_script.revised';
  ELSE
    IF p_base_revision_id IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '40001',
        MESSAGE = 'project_script_base_revision_conflict';
    END IF;
    v_revision_number := 1;
    v_mutation_kind := 'project_script.created';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM co_production.project_preproject_origins AS origin
    WHERE origin.project_id = p_project_id
      AND origin.team_id IS NOT DISTINCT FROM v_project.team_id
      AND origin.activation_source = 'accepted_proposal'
  )
  INTO v_has_accepted_origin;
  SELECT EXISTS (
    SELECT 1
    FROM co_production.project_manual_origins AS origin
    WHERE origin.project_id = p_project_id
      AND origin.team_id IS NOT DISTINCT FROM v_project.team_id
      AND origin.source_kind = 'manual'
  )
  INTO v_has_manual_origin;

  IF v_has_accepted_origin = v_has_manual_origin THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_script_origin_authority_invalid';
  END IF;

  IF v_has_accepted_origin THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'cco:project-brief-projection:' || p_project_id::text,
        0
      )
    );
    SELECT brief.id, brief.content_hash
    INTO v_source_brief_revision_id, v_source_brief_content_hash
    FROM co_production.project_brief_revisions AS brief
    WHERE brief.project_id = p_project_id
      AND brief.team_id = v_project.team_id
    ORDER BY brief.revision_number DESC
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'project_script_project_brief_binding_missing';
    END IF;
    v_source_kind := 'accepted_proposal';
  ELSE
    v_source_kind := 'manual';
    v_source_brief_revision_id := NULL;
    v_source_brief_content_hash := NULL;
  END IF;

  v_new_authority_version := v_authority.authority_version + 1;

  INSERT INTO co_production.project_script_revisions (
    id,
    project_id,
    team_id,
    revision_number,
    base_revision_id,
    change_summary,
    content,
    content_hash,
    source_kind,
    source_project_brief_revision_id,
    source_project_brief_content_hash,
    created_by,
    created_at
  )
  VALUES (
    v_revision_id,
    p_project_id,
    v_project.team_id,
    v_revision_number,
    p_base_revision_id,
    p_change_summary,
    p_content,
    v_content_hash,
    v_source_kind,
    v_source_brief_revision_id,
    v_source_brief_content_hash,
    v_actor_id,
    v_now
  );

  v_result := pg_catalog.jsonb_build_object(
    'scriptRevisionId', v_revision_id,
    'projectId', p_project_id,
    'revisionNumber', v_revision_number,
    'baseRevisionId', p_base_revision_id,
    'effectiveState', 'draft',
    'contentHash', v_content_hash,
    'sourceProjectBriefRevisionId', v_source_brief_revision_id,
    'sourceProjectBriefContentHash', v_source_brief_content_hash,
    'authorityVersion', v_new_authority_version,
    'requestId', p_request_id,
    'replayed', false
  );

  v_receipt_hash := co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'id', v_receipt_id,
      'projectId', p_project_id,
      'teamId', v_project.team_id,
      'mutationKind', v_mutation_kind,
      'planRevisionId', NULL,
      'taskId', NULL,
      'scriptRevisionId', v_revision_id,
      'expectedEntityVersion', p_expected_authority_version,
      'resultingEntityVersion', v_new_authority_version,
      'authorityVersion', v_new_authority_version,
      'requestId', p_request_id,
      'requestHash', v_request_hash,
      'result', v_result,
      'actorId', v_actor_id,
      'createdAt', v_now
    )::text
  );

  v_event_payload := pg_catalog.jsonb_build_object(
    'scriptRevisionId', v_revision_id,
    'revisionNumber', v_revision_number,
    'baseRevisionId', p_base_revision_id,
    'contentHash', v_content_hash,
    'changeSummary', p_change_summary,
    'sourceProjectBriefRevisionId', v_source_brief_revision_id,
    'sourceProjectBriefContentHash', v_source_brief_content_hash
  );
  v_event_hash := co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'id', v_event_id,
      'projectId', p_project_id,
      'teamId', v_project.team_id,
      'receiptId', v_receipt_id,
      'authorityVersion', v_new_authority_version,
      'eventType', v_mutation_kind,
      'entityKind', 'project_script_revision',
      'entityId', v_revision_id,
      'payload', v_event_payload,
      'previousEventHash', v_authority.event_head_hash,
      'actorId', v_actor_id,
      'occurredAt', v_now
    )::text
  );

  INSERT INTO co_production.project_preproduction_mutation_receipts (
    id,
    project_id,
    team_id,
    mutation_kind,
    plan_revision_id,
    task_id,
    script_revision_id,
    expected_entity_version,
    resulting_entity_version,
    authority_version,
    request_id,
    request_payload,
    request_hash,
    result,
    receipt_hash,
    actor_id,
    created_at
  )
  VALUES (
    v_receipt_id,
    p_project_id,
    v_project.team_id,
    v_mutation_kind,
    NULL,
    NULL,
    v_revision_id,
    p_expected_authority_version,
    v_new_authority_version,
    v_new_authority_version,
    p_request_id,
    v_request_payload,
    v_request_hash,
    v_result,
    v_receipt_hash,
    v_actor_id,
    v_now
  );

  INSERT INTO co_production.project_preproduction_events (
    id,
    project_id,
    team_id,
    receipt_id,
    authority_version,
    event_type,
    entity_kind,
    entity_id,
    payload,
    previous_event_hash,
    event_hash,
    actor_id,
    occurred_at
  )
  VALUES (
    v_event_id,
    p_project_id,
    v_project.team_id,
    v_receipt_id,
    v_new_authority_version,
    v_mutation_kind,
    'project_script_revision',
    v_revision_id,
    v_event_payload,
    v_authority.event_head_hash,
    v_event_hash,
    v_actor_id,
    v_now
  );

  UPDATE co_production.project_preproduction_authorities AS authority
  SET
    authority_version = v_new_authority_version,
    event_head_hash = v_event_hash,
    updated_by = v_actor_id,
    updated_at = v_now
  WHERE authority.project_id = p_project_id
    AND authority.authority_version = v_authority.authority_version
    AND authority.event_head_hash = v_authority.event_head_hash;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'project_script_authority_version_conflict';
  END IF;

  RETURN v_result;
END
$$;

CREATE TRIGGER project_script_revisions_no_truncate
BEFORE TRUNCATE ON co_production.project_script_revisions
FOR EACH STATEMENT
EXECUTE FUNCTION
  co_production_private.prevent_project_preproduction_immutable_mutation();

CREATE OR REPLACE FUNCTION co_production.decide_project_script_revision(
  p_project_id uuid,
  p_script_revision_id uuid,
  p_expected_authority_version bigint,
  p_request_id uuid,
  p_decision text,
  p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_role text;
  v_project co_production.projects%ROWTYPE;
  v_authority co_production.project_preproduction_authorities%ROWTYPE;
  v_existing co_production.project_preproduction_mutation_receipts%ROWTYPE;
  v_revision co_production.project_script_revisions%ROWTYPE;
  v_current_state_kind text;
  v_mutation_kind text;
  v_request_payload jsonb;
  v_request_hash text;
  v_new_authority_version bigint;
  v_receipt_id uuid := pg_catalog.gen_random_uuid();
  v_event_id uuid := pg_catalog.gen_random_uuid();
  v_now timestamptz := statement_timestamp();
  v_result jsonb;
  v_receipt_hash text;
  v_event_payload jsonb;
  v_event_hash text;
BEGIN
  IF v_actor_id IS NULL
    OR p_project_id IS NULL
    OR p_script_revision_id IS NULL
    OR p_expected_authority_version IS NULL
    OR p_expected_authority_version NOT BETWEEN 0 AND 2147483646
    OR p_request_id IS NULL
    OR p_decision IS NULL
    OR p_decision NOT IN ('approved', 'changes_requested')
    OR (
      p_note IS NOT NULL
      AND (
        NOT co_production_private.preproject_safe_text(p_note, 1, 4000)
        OR p_note IS DISTINCT FROM pg_catalog.btrim(p_note)
        OR p_note ~ E'\r'
      )
    )
    OR (p_decision = 'changes_requested' AND p_note IS NULL)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_project_script_decision';
  END IF;

  SELECT project.*
  INTO v_project
  FROM co_production.projects AS project
  WHERE project.id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'project_script_not_found';
  END IF;

  v_role := co_production_private.project_preproduction_role(p_project_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'project_script_not_found';
  END IF;
  IF v_role NOT IN ('owner', 'admin', 'producer') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'project_script_forbidden';
  END IF;

  v_mutation_kind := 'project_script.' || p_decision;
  v_request_payload := pg_catalog.jsonb_build_object(
    'operation', 'decide_project_script_revision',
    'projectId', p_project_id,
    'scriptRevisionId', p_script_revision_id,
    'expectedAuthorityVersion', p_expected_authority_version,
    'requestId', p_request_id,
    'decision', p_decision,
    'note', p_note
  );
  v_request_hash := co_production_private.preproject_sha256(
    v_request_payload::text
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'cco:project-preproduction:' || p_project_id::text,
      0
    )
  );

  SELECT authority.*
  INTO v_authority
  FROM co_production.project_preproduction_authorities AS authority
  WHERE authority.project_id = p_project_id
  FOR UPDATE;

  IF NOT FOUND OR v_authority.team_id IS DISTINCT FROM v_project.team_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_script_authority_mismatch';
  END IF;

  SELECT receipt.*
  INTO v_existing
  FROM co_production.project_preproduction_mutation_receipts AS receipt
  WHERE receipt.project_id = p_project_id
    AND receipt.request_id = p_request_id;

  IF FOUND THEN
    IF v_existing.mutation_kind IS DISTINCT FROM v_mutation_kind
      OR v_existing.script_revision_id IS DISTINCT FROM p_script_revision_id
      OR v_existing.expected_entity_version
        IS DISTINCT FROM p_expected_authority_version
      OR v_existing.request_payload IS DISTINCT FROM v_request_payload
      OR v_existing.request_hash IS DISTINCT FROM v_request_hash
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'project_script_idempotency_conflict';
    END IF;
    RETURN v_existing.result
      || pg_catalog.jsonb_build_object('replayed', true);
  END IF;

  IF v_authority.authority_version
    IS DISTINCT FROM p_expected_authority_version
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'project_script_authority_version_conflict';
  END IF;
  IF v_authority.authority_version >= 2147483647 THEN
    RAISE EXCEPTION USING
      ERRCODE = '54000',
      MESSAGE = 'preproduction_authority_version_exhausted';
  END IF;

  SELECT revision.*
  INTO v_revision
  FROM co_production.project_script_revisions AS revision
  WHERE revision.project_id = p_project_id
  ORDER BY revision.revision_number DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND OR v_revision.id IS DISTINCT FROM p_script_revision_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'project_script_revision_conflict';
  END IF;

  SELECT receipt.mutation_kind
  INTO v_current_state_kind
  FROM co_production.project_preproduction_mutation_receipts AS receipt
  WHERE receipt.project_id = p_project_id
    AND receipt.script_revision_id = p_script_revision_id
    AND receipt.mutation_kind IN (
      'project_script.submitted',
      'project_script.approved',
      'project_script.changes_requested'
    )
  ORDER BY receipt.authority_version DESC
  LIMIT 1;

  IF NOT FOUND
    OR v_current_state_kind IS DISTINCT FROM 'project_script.submitted'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_script_invalid_transition';
  END IF;

  v_new_authority_version := v_authority.authority_version + 1;
  v_result := pg_catalog.jsonb_build_object(
    'scriptRevisionId', p_script_revision_id,
    'projectId', p_project_id,
    'revisionNumber', v_revision.revision_number,
    'effectiveState', p_decision,
    'authorityVersion', v_new_authority_version,
    'requestId', p_request_id,
    'replayed', false
  );

  v_receipt_hash := co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'id', v_receipt_id,
      'projectId', p_project_id,
      'teamId', v_project.team_id,
      'mutationKind', v_mutation_kind,
      'planRevisionId', NULL,
      'taskId', NULL,
      'scriptRevisionId', p_script_revision_id,
      'expectedEntityVersion', p_expected_authority_version,
      'resultingEntityVersion', v_new_authority_version,
      'authorityVersion', v_new_authority_version,
      'requestId', p_request_id,
      'requestHash', v_request_hash,
      'result', v_result,
      'actorId', v_actor_id,
      'createdAt', v_now
    )::text
  );
  v_event_payload := pg_catalog.jsonb_build_object(
    'scriptRevisionId', p_script_revision_id,
    'revisionNumber', v_revision.revision_number,
    'decision', p_decision,
    'note', p_note
  );
  v_event_hash := co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'id', v_event_id,
      'projectId', p_project_id,
      'teamId', v_project.team_id,
      'receiptId', v_receipt_id,
      'authorityVersion', v_new_authority_version,
      'eventType', v_mutation_kind,
      'entityKind', 'project_script_revision',
      'entityId', p_script_revision_id,
      'payload', v_event_payload,
      'previousEventHash', v_authority.event_head_hash,
      'actorId', v_actor_id,
      'occurredAt', v_now
    )::text
  );

  INSERT INTO co_production.project_preproduction_mutation_receipts (
    id,
    project_id,
    team_id,
    mutation_kind,
    plan_revision_id,
    task_id,
    script_revision_id,
    expected_entity_version,
    resulting_entity_version,
    authority_version,
    request_id,
    request_payload,
    request_hash,
    result,
    receipt_hash,
    actor_id,
    created_at
  )
  VALUES (
    v_receipt_id,
    p_project_id,
    v_project.team_id,
    v_mutation_kind,
    NULL,
    NULL,
    p_script_revision_id,
    p_expected_authority_version,
    v_new_authority_version,
    v_new_authority_version,
    p_request_id,
    v_request_payload,
    v_request_hash,
    v_result,
    v_receipt_hash,
    v_actor_id,
    v_now
  );

  INSERT INTO co_production.project_preproduction_events (
    id,
    project_id,
    team_id,
    receipt_id,
    authority_version,
    event_type,
    entity_kind,
    entity_id,
    payload,
    previous_event_hash,
    event_hash,
    actor_id,
    occurred_at
  )
  VALUES (
    v_event_id,
    p_project_id,
    v_project.team_id,
    v_receipt_id,
    v_new_authority_version,
    v_mutation_kind,
    'project_script_revision',
    p_script_revision_id,
    v_event_payload,
    v_authority.event_head_hash,
    v_event_hash,
    v_actor_id,
    v_now
  );

  UPDATE co_production.project_preproduction_authorities AS authority
  SET
    authority_version = v_new_authority_version,
    event_head_hash = v_event_hash,
    updated_by = v_actor_id,
    updated_at = v_now
  WHERE authority.project_id = p_project_id
    AND authority.authority_version = v_authority.authority_version
    AND authority.event_head_hash = v_authority.event_head_hash;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'project_script_authority_version_conflict';
  END IF;

  RETURN v_result;
END
$$;

REVOKE ALL ON TABLE co_production.project_script_revisions
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.project_preproduction_mutation_receipts
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.project_preproduction_events
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION
  co_production_private.project_script_content_is_valid(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.verify_project_preproduction_receipt_hash()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.guard_project_preproduction_event_insert()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.guard_project_script_revision_insert()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION co_production.get_project_script(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production.append_project_script_revision(uuid, bigint, uuid, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production.submit_project_script_revision(uuid, uuid, bigint, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production.decide_project_script_revision(uuid, uuid, bigint, uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION co_production.get_project_script(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION
  co_production.append_project_script_revision(uuid, bigint, uuid, uuid, text, jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION
  co_production.submit_project_script_revision(uuid, uuid, bigint, uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION
  co_production.decide_project_script_revision(uuid, uuid, bigint, uuid, text, text)
  TO authenticated;

CREATE INDEX project_script_revisions_project_latest_idx
  ON co_production.project_script_revisions(project_id, revision_number DESC);
CREATE INDEX project_preproduction_receipts_script_history_idx
  ON co_production.project_preproduction_mutation_receipts(
    script_revision_id,
    authority_version DESC
  )
  WHERE script_revision_id IS NOT NULL;

COMMIT;
