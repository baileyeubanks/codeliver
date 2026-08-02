-- Governed Call Sheet v1 authority for project pre-production.
--
-- Call sheets are immutable revisions bound to the exact active approved
-- Governed Production Schedule v1 revision and exactly one schedule day. This
-- migration is additive and unapplied: it creates no crew, location, weather,
-- map, attachment, notification, distribution, send, or calendar-write
-- authority and performs no production-task, shot-plan, or schedule mutation.

BEGIN;

DO $project_call_sheet_preflight$
BEGIN
  IF current_setting('server_version_num')::integer < 150000 THEN
    RAISE EXCEPTION USING
      ERRCODE = '0A000',
      MESSAGE = 'project_call_sheet_requires_postgresql_15';
  END IF;

  IF pg_catalog.to_regclass('co_production.projects') IS NULL
    OR pg_catalog.to_regclass(
      'co_production.project_preproduction_authorities'
    ) IS NULL
    OR pg_catalog.to_regclass(
      'co_production.project_preproduction_mutation_receipts'
    ) IS NULL
    OR pg_catalog.to_regclass(
      'co_production.project_preproduction_events'
    ) IS NULL
    OR pg_catalog.to_regclass(
      'co_production.project_production_schedule_revisions'
    ) IS NULL
    OR pg_catalog.to_regclass(
      'co_production.project_production_schedule_approval_bindings'
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
      'co_production_private.project_production_schedule_content_is_valid(jsonb)'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'co_production_private.project_production_schedule_content_is_submittable(jsonb)'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'co_production_private.project_production_schedule_date_is_valid(text)'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'co_production_private.project_production_schedule_time_is_valid(text)'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'co_production_private.project_production_schedule_time_zone_is_valid(text)'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'co_production_private.current_project_production_schedule_source(uuid)'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'co_production_private.prevent_project_preproduction_immutable_mutation()'
    ) IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE =
        'project_call_sheet_requires_governed_production_schedule_authority';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_record
    WHERE constraint_record.conrelid =
      'co_production.project_production_schedule_revisions'::pg_catalog.regclass
      AND constraint_record.conname =
        'project_production_schedule_revisions_id_project_content_hash_key'
      AND constraint_record.contype = 'u'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE =
        'project_call_sheet_requires_exact_production_schedule_hash_authority';
  END IF;
END
$project_call_sheet_preflight$;

ALTER TABLE co_production.project_production_schedule_approval_bindings
  ADD CONSTRAINT project_production_schedule_bindings_exact_call_sheet_source_key
  UNIQUE (
    id,
    project_id,
    production_schedule_revision_id,
    production_schedule_content_hash
  );

CREATE OR REPLACE FUNCTION
  co_production_private.project_call_sheet_identifier_is_valid(
    p_value text
  )
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT co_production_private.preproject_safe_text(p_value, 1, 80)
    AND p_value = pg_catalog.btrim(p_value)
    AND p_value ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$'
$$;

CREATE OR REPLACE FUNCTION
  co_production_private.project_call_sheet_nullable_text_is_valid(
    p_value jsonb,
    p_min_length integer,
    p_max_length integer,
    p_allow_newlines boolean
  )
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT CASE pg_catalog.jsonb_typeof(p_value)
    WHEN 'null' THEN true
    WHEN 'string' THEN
      p_min_length BETWEEN 1 AND p_max_length
      AND co_production_private.preproject_safe_text(
        p_value #>> '{}',
        p_min_length,
        p_max_length
      )
      AND p_value #>> '{}' = pg_catalog.btrim(p_value #>> '{}')
      AND p_value #>> '{}' !~ E'\r'
      AND (p_allow_newlines OR p_value #>> '{}' !~ E'\n')
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION
  co_production_private.project_call_sheet_contact_is_valid(
    p_contact jsonb,
    p_expected_order integer
  )
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
BEGIN
  IF pg_catalog.jsonb_typeof(p_contact) IS DISTINCT FROM 'object'
    OR NOT co_production_private.preproject_exact_json_keys(
      p_contact,
      ARRAY[
        'id', 'order', 'name', 'role', 'department', 'email', 'phone',
        'callTime', 'notes'
      ]
    )
    OR pg_catalog.jsonb_typeof(p_contact -> 'id') IS DISTINCT FROM 'string'
    OR NOT co_production_private.project_call_sheet_identifier_is_valid(
      p_contact ->> 'id'
    )
    OR pg_catalog.jsonb_typeof(p_contact -> 'order') IS DISTINCT FROM 'number'
    OR p_contact ->> 'order' !~ '^[1-9][0-9]{0,3}$'
    OR (p_contact ->> 'order')::integer NOT BETWEEN 1 AND 1000
    OR (p_contact ->> 'order')::integer IS DISTINCT FROM p_expected_order
    OR pg_catalog.jsonb_typeof(p_contact -> 'name') IS DISTINCT FROM 'string'
    OR NOT co_production_private.preproject_safe_text(
      p_contact ->> 'name', 1, 240
    )
    OR p_contact ->> 'name' IS DISTINCT FROM
      pg_catalog.btrim(p_contact ->> 'name')
    OR p_contact ->> 'name' ~ E'[\r\n]'
    OR pg_catalog.jsonb_typeof(p_contact -> 'role') IS DISTINCT FROM 'string'
    OR NOT co_production_private.preproject_safe_text(
      p_contact ->> 'role', 1, 160
    )
    OR p_contact ->> 'role' IS DISTINCT FROM
      pg_catalog.btrim(p_contact ->> 'role')
    OR p_contact ->> 'role' ~ E'[\r\n]'
    OR NOT co_production_private.project_call_sheet_nullable_text_is_valid(
      p_contact -> 'department', 1, 160, false
    )
    OR NOT co_production_private.project_call_sheet_nullable_text_is_valid(
      p_contact -> 'email', 3, 254, false
    )
    OR (
      pg_catalog.jsonb_typeof(p_contact -> 'email') = 'string'
      AND p_contact ->> 'email'
        !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
    OR NOT co_production_private.project_call_sheet_nullable_text_is_valid(
      p_contact -> 'phone', 1, 100, false
    )
    OR pg_catalog.jsonb_typeof(p_contact -> 'callTime')
      NOT IN ('string', 'null')
    OR (
      pg_catalog.jsonb_typeof(p_contact -> 'callTime') = 'string'
      AND NOT
        co_production_private.project_production_schedule_time_is_valid(
          p_contact ->> 'callTime'
        )
    )
    OR NOT co_production_private.project_call_sheet_nullable_text_is_valid(
      p_contact -> 'notes', 1, 4000, true
    )
  THEN
    RETURN false;
  END IF;

  RETURN true;
END
$$;

CREATE OR REPLACE FUNCTION co_production.generate_project_call_sheet_revision(
  p_project_id uuid,
  p_expected_authority_version bigint,
  p_request_id uuid,
  p_schedule_day_id text,
  p_expected_production_schedule_revision_id uuid
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
  v_latest record;
  v_schedule co_production.project_production_schedule_revisions%ROWTYPE;
  v_source jsonb;
  v_source_summary jsonb;
  v_revision_id uuid := pg_catalog.gen_random_uuid();
  v_revision_number bigint;
  v_base_revision_id uuid;
  v_new_authority_version bigint;
  v_content jsonb;
  v_content_hash text;
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
    OR p_schedule_day_id IS NULL
    OR NOT co_production_private.project_call_sheet_identifier_is_valid(
      p_schedule_day_id
    )
    OR p_expected_production_schedule_revision_id IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_project_call_sheet_generation';
  END IF;

  SELECT project.*
  INTO v_project
  FROM co_production.projects AS project
  WHERE project.id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'project_call_sheet_not_found';
  END IF;

  v_role := co_production_private.project_preproduction_role(p_project_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'project_call_sheet_not_found';
  END IF;
  IF v_role NOT IN ('owner', 'admin', 'producer') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'project_call_sheet_forbidden';
  END IF;

  v_request_payload := pg_catalog.jsonb_build_object(
    'operation', 'generate_project_call_sheet_revision',
    'projectId', p_project_id,
    'expectedAuthorityVersion', p_expected_authority_version,
    'requestId', p_request_id,
    'scheduleDayId', p_schedule_day_id,
    'expectedProductionScheduleRevisionId',
      p_expected_production_schedule_revision_id,
    'derivationVersion', 'cco.call-sheet.v1'
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
      MESSAGE = 'project_call_sheet_authority_mismatch';
  END IF;

  SELECT receipt.*
  INTO v_existing
  FROM co_production.project_preproduction_mutation_receipts AS receipt
  WHERE receipt.project_id = p_project_id
    AND receipt.request_id = p_request_id;

  IF FOUND THEN
    IF v_existing.mutation_kind IS DISTINCT FROM 'project_call_sheet.generated'
      OR v_existing.expected_entity_version IS DISTINCT FROM
        p_expected_authority_version
      OR v_existing.request_payload IS DISTINCT FROM v_request_payload
      OR v_existing.request_hash IS DISTINCT FROM v_request_hash
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'project_call_sheet_idempotency_conflict';
    END IF;
    RETURN v_existing.result
      || pg_catalog.jsonb_build_object('replayed', true);
  END IF;

  IF v_authority.authority_version IS DISTINCT FROM
    p_expected_authority_version
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'project_call_sheet_authority_version_conflict';
  END IF;
  IF v_authority.authority_version >= 2147483647 THEN
    RAISE EXCEPTION USING
      ERRCODE = '54000',
      MESSAGE = 'preproduction_authority_version_exhausted';
  END IF;

  v_source := co_production_private.current_project_call_sheet_source(
    p_project_id,
    p_schedule_day_id
  );
  IF v_source IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_call_sheet_source_unavailable';
  END IF;
  IF (v_source ->> 'productionScheduleRevisionId')::uuid IS DISTINCT FROM
    p_expected_production_schedule_revision_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'project_call_sheet_stale_source';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM co_production.project_call_sheet_revisions AS revision
    WHERE revision.project_id = p_project_id
      AND revision.schedule_day_id = p_schedule_day_id
      AND revision.revision_kind = 'generated'
      AND revision.source_production_schedule_revision_id =
        (v_source ->> 'productionScheduleRevisionId')::uuid
      AND revision.source_production_schedule_content_hash =
        v_source ->> 'productionScheduleContentHash'
      AND revision.source_production_schedule_approval_binding_id =
        (v_source ->> 'productionScheduleApprovalBindingId')::uuid
      AND revision.source_schedule_day_content_hash =
        v_source ->> 'scheduleDayContentHash'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'project_call_sheet_source_already_generated';
  END IF;

  SELECT revision.*
  INTO v_latest
  FROM co_production.project_call_sheet_revisions AS revision
  WHERE revision.project_id = p_project_id
    AND revision.schedule_day_id = p_schedule_day_id
  ORDER BY revision.revision_number DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF v_latest.revision_number >= 2147483647 THEN
      RAISE EXCEPTION USING
        ERRCODE = '54000',
        MESSAGE = 'project_call_sheet_revision_exhausted';
    END IF;
    v_revision_number := v_latest.revision_number + 1;
    v_base_revision_id := v_latest.id;
  ELSE
    v_revision_number := 1;
    v_base_revision_id := NULL;
  END IF;

  SELECT revision.*
  INTO v_schedule
  FROM co_production.project_production_schedule_revisions AS revision
  WHERE revision.id = (v_source ->> 'productionScheduleRevisionId')::uuid
    AND revision.project_id = p_project_id
    AND revision.content_hash = v_source ->> 'productionScheduleContentHash';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_call_sheet_source_unavailable';
  END IF;

  v_content := co_production_private.derive_project_call_sheet_content(
    v_schedule.content,
    p_schedule_day_id
  );
  v_content_hash := co_production_private.preproject_sha256(v_content::text);
  v_new_authority_version := v_authority.authority_version + 1;
  v_source_summary := v_source
    - 'teamId'
    - 'productionScheduleContent'
    - 'scheduleDay';

  INSERT INTO co_production.project_call_sheet_revisions (
    id,
    project_id,
    team_id,
    schedule_day_id,
    revision_number,
    base_revision_id,
    revision_kind,
    derivation_version,
    change_summary,
    content,
    content_hash,
    source_production_schedule_revision_id,
    source_production_schedule_content_hash,
    source_production_schedule_approval_binding_id,
    source_schedule_day_content_hash,
    created_by,
    created_at
  )
  VALUES (
    v_revision_id,
    p_project_id,
    v_project.team_id,
    p_schedule_day_id,
    v_revision_number,
    v_base_revision_id,
    'generated',
    'cco.call-sheet.v1',
    NULL,
    v_content,
    v_content_hash,
    (v_source ->> 'productionScheduleRevisionId')::uuid,
    v_source ->> 'productionScheduleContentHash',
    (v_source ->> 'productionScheduleApprovalBindingId')::uuid,
    v_source ->> 'scheduleDayContentHash',
    v_actor_id,
    v_now
  );

  v_result := pg_catalog.jsonb_build_object(
    'callSheetRevisionId', v_revision_id,
    'projectId', p_project_id,
    'scheduleDayId', p_schedule_day_id,
    'revisionNumber', v_revision_number,
    'baseRevisionId', v_base_revision_id,
    'workflowState', 'draft',
    'source', v_source_summary,
    'authorityVersion', v_new_authority_version,
    'requestId', p_request_id,
    'replayed', false
  );

  v_receipt_hash := co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'id', v_receipt_id,
      'projectId', p_project_id,
      'teamId', v_project.team_id,
      'mutationKind', 'project_call_sheet.generated',
      'planRevisionId', NULL,
      'taskId', NULL,
      'scriptRevisionId', NULL,
      'planDraftId', NULL,
      'shotPlanRevisionId', NULL,
      'productionScheduleRevisionId', NULL,
      'callSheetRevisionId', v_revision_id,
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
    'callSheetRevisionId', v_revision_id,
    'scheduleDayId', p_schedule_day_id,
    'revisionNumber', v_revision_number,
    'baseRevisionId', v_base_revision_id,
    'revisionKind', 'generated',
    'derivationVersion', 'cco.call-sheet.v1',
    'contentHash', v_content_hash,
    'source', v_source_summary
  );
  v_event_hash := co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'id', v_event_id,
      'projectId', p_project_id,
      'teamId', v_project.team_id,
      'receiptId', v_receipt_id,
      'authorityVersion', v_new_authority_version,
      'eventType', 'project_call_sheet.generated',
      'entityKind', 'project_call_sheet_revision',
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
    plan_draft_id,
    shot_plan_revision_id,
    production_schedule_revision_id,
    call_sheet_revision_id,
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
    'project_call_sheet.generated',
    NULL,
    NULL,
    NULL,
    NULL,
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
    'project_call_sheet.generated',
    'project_call_sheet_revision',
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
      MESSAGE = 'project_call_sheet_authority_version_conflict';
  END IF;

  RETURN v_result;
END
$$;

CREATE OR REPLACE FUNCTION
  co_production_private.project_call_sheet_section_is_valid(
    p_section jsonb,
    p_expected_order integer
  )
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
BEGIN
  IF pg_catalog.jsonb_typeof(p_section) IS DISTINCT FROM 'object'
    OR NOT co_production_private.preproject_exact_json_keys(
      p_section,
      ARRAY['id', 'order', 'kind', 'title', 'body']
    )
    OR pg_catalog.jsonb_typeof(p_section -> 'id') IS DISTINCT FROM 'string'
    OR NOT co_production_private.project_call_sheet_identifier_is_valid(
      p_section ->> 'id'
    )
    OR pg_catalog.jsonb_typeof(p_section -> 'order') IS DISTINCT FROM 'number'
    OR p_section ->> 'order' !~ '^[1-9][0-9]{0,3}$'
    OR (p_section ->> 'order')::integer NOT BETWEEN 1 AND 1000
    OR (p_section ->> 'order')::integer IS DISTINCT FROM p_expected_order
    OR pg_catalog.jsonb_typeof(p_section -> 'kind') IS DISTINCT FROM 'string'
    OR p_section ->> 'kind' NOT IN (
      'safety', 'weather', 'transport', 'meal', 'equipment', 'note'
    )
    OR pg_catalog.jsonb_typeof(p_section -> 'title') IS DISTINCT FROM 'string'
    OR NOT co_production_private.preproject_safe_text(
      p_section ->> 'title', 1, 500
    )
    OR p_section ->> 'title' IS DISTINCT FROM
      pg_catalog.btrim(p_section ->> 'title')
    OR p_section ->> 'title' ~ E'[\r\n]'
    OR pg_catalog.jsonb_typeof(p_section -> 'body') IS DISTINCT FROM 'string'
    OR NOT co_production_private.preproject_safe_text(
      p_section ->> 'body', 1, 20000
    )
    OR p_section ->> 'body' IS DISTINCT FROM
      pg_catalog.btrim(p_section ->> 'body')
    OR p_section ->> 'body' ~ E'\r'
  THEN
    RETURN false;
  END IF;

  RETURN true;
END
$$;

CREATE OR REPLACE FUNCTION
  co_production_private.project_call_sheet_agenda_item_is_valid(
    p_item jsonb,
    p_expected_order integer
  )
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
  v_kind text;
BEGIN
  IF pg_catalog.jsonb_typeof(p_item) IS DISTINCT FROM 'object'
    OR NOT co_production_private.preproject_exact_json_keys(
      p_item,
      ARRAY[
        'scheduleItemId', 'order', 'kind', 'sourceSceneId', 'sourceShotId',
        'label', 'startTime', 'plannedDurationMinutes'
      ]
    )
    OR pg_catalog.jsonb_typeof(p_item -> 'scheduleItemId')
      IS DISTINCT FROM 'string'
    OR NOT co_production_private.project_call_sheet_identifier_is_valid(
      p_item ->> 'scheduleItemId'
    )
    OR pg_catalog.jsonb_typeof(p_item -> 'order') IS DISTINCT FROM 'number'
    OR p_item ->> 'order' !~ '^[1-9][0-9]{0,4}$'
    OR (p_item ->> 'order')::integer NOT BETWEEN 1 AND 10000
    OR (p_item ->> 'order')::integer IS DISTINCT FROM p_expected_order
    OR pg_catalog.jsonb_typeof(p_item -> 'kind') IS DISTINCT FROM 'string'
    OR p_item ->> 'kind' NOT IN (
      'shot', 'setup', 'meal', 'company_move', 'break', 'note'
    )
    OR pg_catalog.jsonb_typeof(p_item -> 'sourceSceneId')
      NOT IN ('string', 'null')
    OR pg_catalog.jsonb_typeof(p_item -> 'sourceShotId')
      NOT IN ('string', 'null')
    OR pg_catalog.jsonb_typeof(p_item -> 'label') IS DISTINCT FROM 'string'
    OR NOT co_production_private.preproject_safe_text(
      p_item ->> 'label', 1, 1000
    )
    OR p_item ->> 'label' IS DISTINCT FROM
      pg_catalog.btrim(p_item ->> 'label')
    OR p_item ->> 'label' ~ E'[\r\n]'
    OR pg_catalog.jsonb_typeof(p_item -> 'startTime')
      IS DISTINCT FROM 'string'
    OR NOT co_production_private.project_production_schedule_time_is_valid(
      p_item ->> 'startTime'
    )
    OR pg_catalog.jsonb_typeof(p_item -> 'plannedDurationMinutes')
      IS DISTINCT FROM 'number'
    OR p_item ->> 'plannedDurationMinutes' !~ '^[1-9][0-9]{0,3}$'
    OR (p_item ->> 'plannedDurationMinutes')::integer
      NOT BETWEEN 1 AND 1440
  THEN
    RETURN false;
  END IF;

  v_kind := p_item ->> 'kind';
  IF v_kind = 'shot' THEN
    IF pg_catalog.jsonb_typeof(p_item -> 'sourceSceneId')
        IS DISTINCT FROM 'string'
      OR NOT co_production_private.project_call_sheet_identifier_is_valid(
        p_item ->> 'sourceSceneId'
      )
      OR pg_catalog.jsonb_typeof(p_item -> 'sourceShotId')
        IS DISTINCT FROM 'string'
      OR NOT co_production_private.project_call_sheet_identifier_is_valid(
        p_item ->> 'sourceShotId'
      )
    THEN
      RETURN false;
    END IF;
  ELSIF pg_catalog.jsonb_typeof(p_item -> 'sourceSceneId')
      IS DISTINCT FROM 'null'
    OR pg_catalog.jsonb_typeof(p_item -> 'sourceShotId')
      IS DISTINCT FROM 'null'
  THEN
    RETURN false;
  END IF;

  RETURN true;
END
$$;

CREATE OR REPLACE FUNCTION
  co_production_private.project_call_sheet_content_is_valid(
    p_content jsonb
  )
RETURNS boolean
LANGUAGE plpgsql
STABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
  v_location jsonb;
  v_contact jsonb;
  v_section jsonb;
  v_item jsonb;
  v_position integer;
  v_seen_contact_ids text[] := ARRAY[]::text[];
  v_seen_section_ids text[] := ARRAY[]::text[];
  v_seen_schedule_item_ids text[] := ARRAY[]::text[];
BEGIN
  IF pg_catalog.jsonb_typeof(p_content) IS DISTINCT FROM 'object'
    OR pg_catalog.octet_length(p_content::text) > 4194304
    OR NOT co_production_private.preproject_exact_json_keys(
      p_content,
      ARRAY[
        'schemaVersion', 'title', 'scheduleDayId', 'shootDate', 'timeZone',
        'unitCallTime', 'location', 'contacts', 'sections', 'agenda',
        'generalNotes'
      ]
    )
    OR pg_catalog.jsonb_typeof(p_content -> 'schemaVersion')
      IS DISTINCT FROM 'string'
    OR p_content ->> 'schemaVersion' IS DISTINCT FROM 'cco.call-sheet.v1'
    OR pg_catalog.jsonb_typeof(p_content -> 'title') IS DISTINCT FROM 'string'
    OR NOT co_production_private.preproject_safe_text(
      p_content ->> 'title', 1, 500
    )
    OR p_content ->> 'title' IS DISTINCT FROM
      pg_catalog.btrim(p_content ->> 'title')
    OR p_content ->> 'title' ~ E'[\r\n]'
    OR pg_catalog.jsonb_typeof(p_content -> 'scheduleDayId')
      IS DISTINCT FROM 'string'
    OR NOT co_production_private.project_call_sheet_identifier_is_valid(
      p_content ->> 'scheduleDayId'
    )
    OR pg_catalog.jsonb_typeof(p_content -> 'shootDate')
      IS DISTINCT FROM 'string'
    OR NOT co_production_private.project_production_schedule_date_is_valid(
      p_content ->> 'shootDate'
    )
    OR pg_catalog.jsonb_typeof(p_content -> 'timeZone')
      IS DISTINCT FROM 'string'
    OR NOT
      co_production_private.project_production_schedule_time_zone_is_valid(
        p_content ->> 'timeZone'
      )
    OR pg_catalog.jsonb_typeof(p_content -> 'unitCallTime')
      IS DISTINCT FROM 'string'
    OR NOT co_production_private.project_production_schedule_time_is_valid(
      p_content ->> 'unitCallTime'
    )
    OR pg_catalog.jsonb_typeof(p_content -> 'location')
      IS DISTINCT FROM 'object'
    OR pg_catalog.jsonb_typeof(p_content -> 'contacts') IS DISTINCT FROM 'array'
    OR pg_catalog.jsonb_array_length(p_content -> 'contacts') > 1000
    OR pg_catalog.jsonb_typeof(p_content -> 'sections') IS DISTINCT FROM 'array'
    OR pg_catalog.jsonb_array_length(p_content -> 'sections') > 1000
    OR pg_catalog.jsonb_typeof(p_content -> 'agenda') IS DISTINCT FROM 'array'
    OR pg_catalog.jsonb_array_length(p_content -> 'agenda') > 10000
    OR NOT co_production_private.project_call_sheet_nullable_text_is_valid(
      p_content -> 'generalNotes', 1, 20000, true
    )
  THEN
    RETURN false;
  END IF;

  v_location := p_content -> 'location';
  IF NOT co_production_private.preproject_exact_json_keys(
      v_location,
      ARRAY[
        'name', 'address', 'parkingNotes', 'accessNotes', 'contactName',
        'contactPhone'
      ]
    )
    OR NOT co_production_private.project_call_sheet_nullable_text_is_valid(
      v_location -> 'name', 1, 500, false
    )
    OR NOT co_production_private.project_call_sheet_nullable_text_is_valid(
      v_location -> 'address', 1, 2000, true
    )
    OR NOT co_production_private.project_call_sheet_nullable_text_is_valid(
      v_location -> 'parkingNotes', 1, 10000, true
    )
    OR NOT co_production_private.project_call_sheet_nullable_text_is_valid(
      v_location -> 'accessNotes', 1, 10000, true
    )
    OR NOT co_production_private.project_call_sheet_nullable_text_is_valid(
      v_location -> 'contactName', 1, 240, false
    )
    OR NOT co_production_private.project_call_sheet_nullable_text_is_valid(
      v_location -> 'contactPhone', 1, 100, false
    )
  THEN
    RETURN false;
  END IF;

  FOR v_contact, v_position IN
    SELECT contact_record.value, contact_record.position::integer
    FROM pg_catalog.jsonb_array_elements(p_content -> 'contacts')
      WITH ORDINALITY AS contact_record(value, position)
    ORDER BY contact_record.position
  LOOP
    IF NOT co_production_private.project_call_sheet_contact_is_valid(
        v_contact,
        v_position
      )
      OR (v_contact ->> 'id') = ANY(v_seen_contact_ids)
    THEN
      RETURN false;
    END IF;
    v_seen_contact_ids := pg_catalog.array_append(
      v_seen_contact_ids,
      v_contact ->> 'id'
    );
  END LOOP;

  FOR v_section, v_position IN
    SELECT section_record.value, section_record.position::integer
    FROM pg_catalog.jsonb_array_elements(p_content -> 'sections')
      WITH ORDINALITY AS section_record(value, position)
    ORDER BY section_record.position
  LOOP
    IF NOT co_production_private.project_call_sheet_section_is_valid(
        v_section,
        v_position
      )
      OR (v_section ->> 'id') = ANY(v_seen_section_ids)
    THEN
      RETURN false;
    END IF;
    v_seen_section_ids := pg_catalog.array_append(
      v_seen_section_ids,
      v_section ->> 'id'
    );
  END LOOP;

  FOR v_item, v_position IN
    SELECT item_record.value, item_record.position::integer
    FROM pg_catalog.jsonb_array_elements(p_content -> 'agenda')
      WITH ORDINALITY AS item_record(value, position)
    ORDER BY item_record.position
  LOOP
    IF NOT co_production_private.project_call_sheet_agenda_item_is_valid(
        v_item,
        v_position
      )
      OR (v_item ->> 'scheduleItemId') = ANY(v_seen_schedule_item_ids)
    THEN
      RETURN false;
    END IF;
    v_seen_schedule_item_ids := pg_catalog.array_append(
      v_seen_schedule_item_ids,
      v_item ->> 'scheduleItemId'
    );
  END LOOP;

  RETURN true;
END
$$;

CREATE OR REPLACE FUNCTION
  co_production_private.project_call_sheet_content_is_submittable(
    p_content jsonb
  )
RETURNS boolean
LANGUAGE plpgsql
STABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
BEGIN
  IF NOT co_production_private.project_call_sheet_content_is_valid(p_content)
    OR pg_catalog.jsonb_typeof(p_content #> '{location,name}')
      IS DISTINCT FROM 'string'
    OR pg_catalog.jsonb_typeof(p_content #> '{location,address}')
      IS DISTINCT FROM 'string'
    OR pg_catalog.jsonb_array_length(p_content -> 'contacts') < 1
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_array_elements(p_content -> 'contacts')
        AS contact_record(value)
      WHERE pg_catalog.jsonb_typeof(contact_record.value -> 'callTime')
          IS DISTINCT FROM 'string'
        OR (
          pg_catalog.jsonb_typeof(contact_record.value -> 'email')
            IS DISTINCT FROM 'string'
          AND pg_catalog.jsonb_typeof(contact_record.value -> 'phone')
            IS DISTINCT FROM 'string'
        )
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_array_elements(p_content -> 'sections')
        AS section_record(value)
      WHERE section_record.value ->> 'kind' = 'safety'
    )
  THEN
    RETURN false;
  END IF;

  RETURN true;
END
$$;

CREATE OR REPLACE FUNCTION
  co_production_private.project_call_sheet_content_matches_schedule_day(
    p_content jsonb,
    p_production_schedule_content jsonb,
    p_schedule_day_id text
  )
RETURNS boolean
LANGUAGE plpgsql
STABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
  v_day jsonb;
BEGIN
  IF NOT co_production_private.project_call_sheet_content_is_valid(p_content)
    OR NOT
      co_production_private.project_production_schedule_content_is_submittable(
        p_production_schedule_content
      )
    OR NOT co_production_private.project_call_sheet_identifier_is_valid(
      p_schedule_day_id
    )
  THEN
    RETURN false;
  END IF;

  SELECT day_record.value
  INTO v_day
  FROM pg_catalog.jsonb_array_elements(
    p_production_schedule_content -> 'days'
  ) AS day_record(value)
  WHERE day_record.value ->> 'id' = p_schedule_day_id;

  IF NOT FOUND
    OR p_content ->> 'scheduleDayId' IS DISTINCT FROM p_schedule_day_id
    OR p_content ->> 'shootDate' IS DISTINCT FROM v_day ->> 'date'
    OR p_content ->> 'timeZone' IS DISTINCT FROM
      p_production_schedule_content ->> 'timeZone'
    OR p_content ->> 'unitCallTime' IS DISTINCT FROM
      v_day ->> 'unitCallTime'
    OR pg_catalog.jsonb_array_length(p_content -> 'agenda') IS DISTINCT FROM
      pg_catalog.jsonb_array_length(v_day -> 'items')
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_array_elements(p_content -> 'agenda')
        WITH ORDINALITY AS agenda_record(value, position)
      JOIN pg_catalog.jsonb_array_elements(v_day -> 'items')
        WITH ORDINALITY AS item_record(value, position)
        USING (position)
      WHERE ROW(
        agenda_record.value ->> 'scheduleItemId',
        agenda_record.value -> 'order',
        agenda_record.value ->> 'kind',
        agenda_record.value -> 'sourceSceneId',
        agenda_record.value -> 'sourceShotId',
        agenda_record.value -> 'startTime',
        agenda_record.value -> 'plannedDurationMinutes'
      ) IS DISTINCT FROM ROW(
        item_record.value ->> 'id',
        item_record.value -> 'order',
        item_record.value ->> 'kind',
        item_record.value -> 'sourceSceneId',
        item_record.value -> 'sourceShotId',
        item_record.value -> 'startTime',
        item_record.value -> 'plannedDurationMinutes'
      )
    )
  THEN
    RETURN false;
  END IF;

  RETURN true;
END
$$;

CREATE OR REPLACE FUNCTION
  co_production_private.derive_project_call_sheet_content(
    p_production_schedule_content jsonb,
    p_schedule_day_id text
  )
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
  v_day jsonb;
  v_agenda jsonb;
BEGIN
  SELECT day_record.value
  INTO v_day
  FROM pg_catalog.jsonb_array_elements(
    p_production_schedule_content -> 'days'
  ) AS day_record(value)
  WHERE day_record.value ->> 'id' = p_schedule_day_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'project_call_sheet_schedule_day_not_found';
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'scheduleItemId', item_record.value ->> 'id',
        'order', item_record.value -> 'order',
        'kind', item_record.value ->> 'kind',
        'sourceSceneId', item_record.value -> 'sourceSceneId',
        'sourceShotId', item_record.value -> 'sourceShotId',
        'label', CASE
          WHEN item_record.value ->> 'kind' = 'shot'
          THEN 'Shot ' || (item_record.value ->> 'sourceShotId')
          ELSE item_record.value ->> 'label'
        END,
        'startTime', item_record.value -> 'startTime',
        'plannedDurationMinutes',
          item_record.value -> 'plannedDurationMinutes'
      )
      ORDER BY item_record.position
    ),
    '[]'::jsonb
  )
  INTO v_agenda
  FROM pg_catalog.jsonb_array_elements(v_day -> 'items')
    WITH ORDINALITY AS item_record(value, position);

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 'cco.call-sheet.v1',
    'title', (p_production_schedule_content ->> 'title')
      || ' - ' || (v_day ->> 'date'),
    'scheduleDayId', p_schedule_day_id,
    'shootDate', v_day ->> 'date',
    'timeZone', p_production_schedule_content ->> 'timeZone',
    'unitCallTime', v_day ->> 'unitCallTime',
    'location', pg_catalog.jsonb_build_object(
      'name', NULL,
      'address', NULL,
      'parkingNotes', NULL,
      'accessNotes', NULL,
      'contactName', NULL,
      'contactPhone', NULL
    ),
    'contacts', '[]'::jsonb,
    'sections', '[]'::jsonb,
    'agenda', v_agenda,
    'generalNotes', v_day -> 'notes'
  );
END
$$;

CREATE OR REPLACE FUNCTION
  co_production_private.current_project_call_sheet_source(
    p_project_id uuid,
    p_schedule_day_id text
  )
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH current_schedule_upstream AS (
    SELECT co_production_private.current_project_production_schedule_source(
      p_project_id
    ) AS source
  ),
  active_schedule AS (
    SELECT
      revision.*,
      binding.id AS approval_binding_id
    FROM current_schedule_upstream AS current_source
    JOIN co_production.project_production_schedule_approval_bindings AS binding
      ON current_source.source IS NOT NULL
      AND binding.project_id = p_project_id
      AND binding.source_shot_plan_revision_id =
        (current_source.source ->> 'shotPlanRevisionId')::uuid
      AND binding.source_shot_plan_content_hash =
        current_source.source ->> 'shotPlanContentHash'
      AND binding.source_shot_plan_approval_binding_id =
        (current_source.source ->> 'shotPlanApprovalBindingId')::uuid
    JOIN co_production.project_production_schedule_revisions AS revision
      ON revision.id = binding.production_schedule_revision_id
      AND revision.project_id = binding.project_id
      AND revision.content_hash = binding.production_schedule_content_hash
    ORDER BY revision.revision_number DESC
    LIMIT 1
  ),
  selected_day AS (
    SELECT
      schedule_source.*,
      day_record.value AS schedule_day
    FROM active_schedule AS schedule_source
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
      schedule_source.content -> 'days'
    ) WITH ORDINALITY AS day_record(value, position)
    WHERE p_schedule_day_id IS NULL
      OR day_record.value ->> 'id' = p_schedule_day_id
    ORDER BY (day_record.value ->> 'order')::integer, day_record.position
    LIMIT 1
  )
  SELECT pg_catalog.jsonb_build_object(
    'productionScheduleRevisionId', source.id,
    'productionScheduleRevisionNumber', source.revision_number,
    'productionScheduleContentHash', source.content_hash,
    'productionScheduleContent', source.content,
    'productionScheduleApprovalBindingId', source.approval_binding_id,
    'scheduleDayId', source.schedule_day ->> 'id',
    'scheduleDayContentHash',
      co_production_private.preproject_sha256(source.schedule_day::text),
    'scheduleDay', source.schedule_day,
    'teamId', source.team_id
  )
  FROM selected_day AS source
$$;

CREATE TABLE co_production.project_call_sheet_revisions (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  project_id uuid NOT NULL,
  team_id uuid,
  schedule_day_id text NOT NULL CHECK (
    co_production_private.project_call_sheet_identifier_is_valid(
      schedule_day_id
    )
  ),
  revision_number bigint NOT NULL CHECK (
    revision_number BETWEEN 1 AND 2147483647
  ),
  base_revision_id uuid,
  revision_kind text NOT NULL CHECK (
    revision_kind IN ('generated', 'authored')
  ),
  derivation_version text NOT NULL CHECK (
    derivation_version = 'cco.call-sheet.v1'
  ),
  change_summary text CHECK (
    change_summary IS NULL
    OR (
      co_production_private.preproject_safe_text(change_summary, 1, 4000)
      AND change_summary = pg_catalog.btrim(change_summary)
      AND change_summary !~ E'\r'
    )
  ),
  content jsonb NOT NULL CHECK (
    co_production_private.project_call_sheet_content_is_valid(content)
    AND content ->> 'scheduleDayId' = schedule_day_id
  ),
  content_hash text NOT NULL CHECK (
    content_hash ~ '^sha256:[0-9a-f]{64}$'
    AND content_hash = co_production_private.preproject_sha256(content::text)
  ),
  source_production_schedule_revision_id uuid NOT NULL,
  source_production_schedule_content_hash text NOT NULL CHECK (
    source_production_schedule_content_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  source_production_schedule_approval_binding_id uuid NOT NULL,
  source_schedule_day_content_hash text NOT NULL CHECK (
    source_schedule_day_content_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL,
  CONSTRAINT project_call_sheet_revisions_project_day_revision_key
    UNIQUE (project_id, schedule_day_id, revision_number),
  CONSTRAINT project_call_sheet_revisions_id_project_key
    UNIQUE (id, project_id),
  CONSTRAINT project_call_sheet_revisions_id_project_day_key
    UNIQUE (id, project_id, schedule_day_id),
  CONSTRAINT project_call_sheet_revisions_id_project_content_hash_key
    UNIQUE (id, project_id, content_hash),
  CONSTRAINT project_call_sheet_revisions_exact_source_key
    UNIQUE (
      id,
      project_id,
      content_hash,
      schedule_day_id,
      source_production_schedule_revision_id,
      source_production_schedule_content_hash,
      source_production_schedule_approval_binding_id,
      source_schedule_day_content_hash
    ),
  CONSTRAINT project_call_sheet_revisions_authority_fk
    FOREIGN KEY (project_id)
    REFERENCES co_production.project_preproduction_authorities(project_id)
    ON DELETE RESTRICT,
  CONSTRAINT project_call_sheet_revisions_project_team_fk
    FOREIGN KEY (project_id, team_id)
    REFERENCES co_production.projects(id, team_id)
    ON DELETE RESTRICT,
  CONSTRAINT project_call_sheet_revisions_lineage_shape CHECK (
    (
      revision_number = 1
      AND base_revision_id IS NULL
      AND revision_kind = 'generated'
    )
    OR (revision_number > 1 AND base_revision_id IS NOT NULL)
  ),
  CONSTRAINT project_call_sheet_revisions_base_fk
    FOREIGN KEY (base_revision_id, project_id, schedule_day_id)
    REFERENCES co_production.project_call_sheet_revisions(
      id,
      project_id,
      schedule_day_id
    )
    ON DELETE RESTRICT,
  CONSTRAINT project_call_sheet_revisions_schedule_fk
    FOREIGN KEY (
      source_production_schedule_revision_id,
      project_id,
      source_production_schedule_content_hash
    )
    REFERENCES co_production.project_production_schedule_revisions(
      id,
      project_id,
      content_hash
    )
    ON DELETE RESTRICT,
  CONSTRAINT project_call_sheet_revisions_schedule_approval_fk
    FOREIGN KEY (
      source_production_schedule_approval_binding_id,
      project_id,
      source_production_schedule_revision_id,
      source_production_schedule_content_hash
    )
    REFERENCES co_production.project_production_schedule_approval_bindings(
      id,
      project_id,
      production_schedule_revision_id,
      production_schedule_content_hash
    )
    ON DELETE RESTRICT
);

COMMENT ON TABLE co_production.project_call_sheet_revisions IS
  'Immutable Governed Call Sheet v1 revisions bound to one exact day of the active approved production schedule; no crew, location, weather, or send authority is created.';

ALTER TABLE co_production.project_preproduction_mutation_receipts
  ADD COLUMN call_sheet_revision_id uuid,
  DROP CONSTRAINT project_preproduction_receipts_mutation_kind_check,
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
      'project_script.changes_requested',
      'production_plan_draft.generated',
      'project_shot_plan.generated',
      'project_shot_plan.revised',
      'project_shot_plan.submitted',
      'project_shot_plan.approved',
      'project_shot_plan.changes_requested',
      'project_production_schedule.generated',
      'project_production_schedule.revised',
      'project_production_schedule.submitted',
      'project_production_schedule.approved',
      'project_production_schedule.changes_requested',
      'project_call_sheet.generated',
      'project_call_sheet.revised',
      'project_call_sheet.submitted',
      'project_call_sheet.approved',
      'project_call_sheet.changes_requested'
    )
  ),
  ADD CONSTRAINT project_preproduction_receipts_call_sheet_fk
    FOREIGN KEY (call_sheet_revision_id, project_id)
    REFERENCES co_production.project_call_sheet_revisions(id, project_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT project_preproduction_receipts_target_shape CHECK (
    (
      mutation_kind IN ('production_plan.initialized', 'production_plan.replanned')
      AND plan_revision_id IS NOT NULL
      AND task_id IS NULL
      AND script_revision_id IS NULL
      AND plan_draft_id IS NULL
      AND shot_plan_revision_id IS NULL
      AND production_schedule_revision_id IS NULL
      AND call_sheet_revision_id IS NULL
    )
    OR (
      mutation_kind = 'production_task.mutated'
      AND plan_revision_id IS NULL
      AND task_id IS NOT NULL
      AND script_revision_id IS NULL
      AND plan_draft_id IS NULL
      AND shot_plan_revision_id IS NULL
      AND production_schedule_revision_id IS NULL
      AND call_sheet_revision_id IS NULL
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
      AND plan_draft_id IS NULL
      AND shot_plan_revision_id IS NULL
      AND production_schedule_revision_id IS NULL
      AND call_sheet_revision_id IS NULL
    )
    OR (
      mutation_kind = 'production_plan_draft.generated'
      AND plan_revision_id IS NULL
      AND task_id IS NULL
      AND script_revision_id IS NULL
      AND plan_draft_id IS NOT NULL
      AND shot_plan_revision_id IS NULL
      AND production_schedule_revision_id IS NULL
      AND call_sheet_revision_id IS NULL
    )
    OR (
      mutation_kind IN (
        'project_shot_plan.generated',
        'project_shot_plan.revised',
        'project_shot_plan.submitted',
        'project_shot_plan.approved',
        'project_shot_plan.changes_requested'
      )
      AND plan_revision_id IS NULL
      AND task_id IS NULL
      AND script_revision_id IS NULL
      AND plan_draft_id IS NULL
      AND shot_plan_revision_id IS NOT NULL
      AND production_schedule_revision_id IS NULL
      AND call_sheet_revision_id IS NULL
    )
    OR (
      mutation_kind IN (
        'project_production_schedule.generated',
        'project_production_schedule.revised',
        'project_production_schedule.submitted',
        'project_production_schedule.approved',
        'project_production_schedule.changes_requested'
      )
      AND plan_revision_id IS NULL
      AND task_id IS NULL
      AND script_revision_id IS NULL
      AND plan_draft_id IS NULL
      AND shot_plan_revision_id IS NULL
      AND production_schedule_revision_id IS NOT NULL
      AND call_sheet_revision_id IS NULL
    )
    OR (
      mutation_kind IN (
        'project_call_sheet.generated',
        'project_call_sheet.revised',
        'project_call_sheet.submitted',
        'project_call_sheet.approved',
        'project_call_sheet.changes_requested'
      )
      AND plan_revision_id IS NULL
      AND task_id IS NULL
      AND script_revision_id IS NULL
      AND plan_draft_id IS NULL
      AND shot_plan_revision_id IS NULL
      AND production_schedule_revision_id IS NULL
      AND call_sheet_revision_id IS NOT NULL
    )
  ),
  ADD CONSTRAINT project_preproduction_receipts_exact_call_sheet_key
    UNIQUE (id, project_id, call_sheet_revision_id);

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
      'project_script.changes_requested',
      'production_plan_draft.generated',
      'project_shot_plan.generated',
      'project_shot_plan.revised',
      'project_shot_plan.submitted',
      'project_shot_plan.approved',
      'project_shot_plan.changes_requested',
      'project_production_schedule.generated',
      'project_production_schedule.revised',
      'project_production_schedule.submitted',
      'project_production_schedule.approved',
      'project_production_schedule.changes_requested',
      'project_call_sheet.generated',
      'project_call_sheet.revised',
      'project_call_sheet.submitted',
      'project_call_sheet.approved',
      'project_call_sheet.changes_requested'
    )
  ),
  ADD CONSTRAINT project_preproduction_events_entity_kind_check CHECK (
    entity_kind IN (
      'production_plan_revision',
      'production_task',
      'project_script_revision',
      'production_plan_script_draft',
      'project_shot_plan_revision',
      'project_production_schedule_revision',
      'project_call_sheet_revision'
    )
  );

CREATE TABLE co_production.project_call_sheet_approval_bindings (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  project_id uuid NOT NULL,
  team_id uuid,
  call_sheet_revision_id uuid NOT NULL,
  call_sheet_content_hash text NOT NULL CHECK (
    call_sheet_content_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  schedule_day_id text NOT NULL CHECK (
    co_production_private.project_call_sheet_identifier_is_valid(
      schedule_day_id
    )
  ),
  source_production_schedule_revision_id uuid NOT NULL,
  source_production_schedule_content_hash text NOT NULL CHECK (
    source_production_schedule_content_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  source_production_schedule_approval_binding_id uuid NOT NULL,
  source_schedule_day_content_hash text NOT NULL CHECK (
    source_schedule_day_content_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  decision_receipt_id uuid NOT NULL,
  approved_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_at timestamptz NOT NULL,
  CONSTRAINT project_call_sheet_approval_bindings_revision_key
    UNIQUE (call_sheet_revision_id),
  CONSTRAINT project_call_sheet_approval_bindings_receipt_key
    UNIQUE (decision_receipt_id),
  CONSTRAINT project_call_sheet_approval_bindings_revision_fk
    FOREIGN KEY (
      call_sheet_revision_id,
      project_id,
      call_sheet_content_hash,
      schedule_day_id,
      source_production_schedule_revision_id,
      source_production_schedule_content_hash,
      source_production_schedule_approval_binding_id,
      source_schedule_day_content_hash
    )
    REFERENCES co_production.project_call_sheet_revisions(
      id,
      project_id,
      content_hash,
      schedule_day_id,
      source_production_schedule_revision_id,
      source_production_schedule_content_hash,
      source_production_schedule_approval_binding_id,
      source_schedule_day_content_hash
    )
    ON DELETE RESTRICT,
  CONSTRAINT project_call_sheet_approval_bindings_receipt_fk
    FOREIGN KEY (decision_receipt_id, project_id, call_sheet_revision_id)
    REFERENCES co_production.project_preproduction_mutation_receipts(
      id,
      project_id,
      call_sheet_revision_id
    )
    ON DELETE RESTRICT
);

COMMENT ON TABLE co_production.project_call_sheet_approval_bindings IS
  'Durable exact approval evidence joining a call-sheet revision to one approved production-schedule revision, content hash, approval binding, selected day hash, and decision receipt.';

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
  ELSIF NEW.mutation_kind = 'production_plan_draft.generated' THEN
    v_expected_hash := co_production_private.preproject_sha256(
      pg_catalog.jsonb_build_object(
        'id', NEW.id,
        'projectId', NEW.project_id,
        'teamId', NEW.team_id,
        'mutationKind', NEW.mutation_kind,
        'planRevisionId', NEW.plan_revision_id,
        'taskId', NEW.task_id,
        'scriptRevisionId', NEW.script_revision_id,
        'planDraftId', NEW.plan_draft_id,
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
    'project_shot_plan.generated',
    'project_shot_plan.revised',
    'project_shot_plan.submitted',
    'project_shot_plan.approved',
    'project_shot_plan.changes_requested'
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
        'planDraftId', NEW.plan_draft_id,
        'shotPlanRevisionId', NEW.shot_plan_revision_id,
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
    'project_production_schedule.generated',
    'project_production_schedule.revised',
    'project_production_schedule.submitted',
    'project_production_schedule.approved',
    'project_production_schedule.changes_requested'
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
        'planDraftId', NEW.plan_draft_id,
        'shotPlanRevisionId', NEW.shot_plan_revision_id,
        'productionScheduleRevisionId', NEW.production_schedule_revision_id,
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
    'project_call_sheet.generated',
    'project_call_sheet.revised',
    'project_call_sheet.submitted',
    'project_call_sheet.approved',
    'project_call_sheet.changes_requested'
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
        'planDraftId', NEW.plan_draft_id,
        'shotPlanRevisionId', NEW.shot_plan_revision_id,
        'productionScheduleRevisionId', NEW.production_schedule_revision_id,
        'callSheetRevisionId', NEW.call_sheet_revision_id,
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
    OR (
      v_receipt.mutation_kind = 'production_plan_draft.generated'
      AND (
        NEW.entity_kind IS DISTINCT FROM 'production_plan_script_draft'
        OR NEW.entity_id IS DISTINCT FROM v_receipt.plan_draft_id
      )
    )
    OR (
      v_receipt.mutation_kind IN (
        'project_shot_plan.generated',
        'project_shot_plan.revised',
        'project_shot_plan.submitted',
        'project_shot_plan.approved',
        'project_shot_plan.changes_requested'
      )
      AND (
        NEW.entity_kind IS DISTINCT FROM 'project_shot_plan_revision'
        OR NEW.entity_id IS DISTINCT FROM v_receipt.shot_plan_revision_id
      )
    )
    OR (
      v_receipt.mutation_kind IN (
        'project_production_schedule.generated',
        'project_production_schedule.revised',
        'project_production_schedule.submitted',
        'project_production_schedule.approved',
        'project_production_schedule.changes_requested'
      )
      AND (
        NEW.entity_kind IS DISTINCT FROM 'project_production_schedule_revision'
        OR NEW.entity_id IS DISTINCT FROM v_receipt.production_schedule_revision_id
      )
    )
    OR (
      v_receipt.mutation_kind IN (
        'project_call_sheet.generated',
        'project_call_sheet.revised',
        'project_call_sheet.submitted',
        'project_call_sheet.approved',
        'project_call_sheet.changes_requested'
      )
      AND (
        NEW.entity_kind IS DISTINCT FROM 'project_call_sheet_revision'
        OR NEW.entity_id IS DISTINCT FROM v_receipt.call_sheet_revision_id
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
  co_production_private.guard_project_call_sheet_revision_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_authority_team_id uuid;
  v_source jsonb;
  v_latest co_production.project_call_sheet_revisions%ROWTYPE;
  v_base co_production.project_call_sheet_revisions%ROWTYPE;
  v_schedule co_production.project_production_schedule_revisions%ROWTYPE;
  v_schedule_binding
    co_production.project_production_schedule_approval_bindings%ROWTYPE;
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

  IF NOT FOUND
    OR v_authority_team_id IS DISTINCT FROM NEW.team_id
    OR NEW.created_by IS DISTINCT FROM (SELECT auth.uid())
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_call_sheet_authority_mismatch';
  END IF;

  v_source := co_production_private.current_project_call_sheet_source(
    NEW.project_id,
    NEW.schedule_day_id
  );
  IF v_source IS NULL
    OR NEW.team_id IS DISTINCT FROM (v_source ->> 'teamId')::uuid
    OR NEW.source_production_schedule_revision_id IS DISTINCT FROM
      (v_source ->> 'productionScheduleRevisionId')::uuid
    OR NEW.source_production_schedule_content_hash IS DISTINCT FROM
      v_source ->> 'productionScheduleContentHash'
    OR NEW.source_production_schedule_approval_binding_id IS DISTINCT FROM
      (v_source ->> 'productionScheduleApprovalBindingId')::uuid
    OR NEW.source_schedule_day_content_hash IS DISTINCT FROM
      v_source ->> 'scheduleDayContentHash'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_call_sheet_stale_source';
  END IF;

  SELECT revision.*
  INTO v_latest
  FROM co_production.project_call_sheet_revisions AS revision
  WHERE revision.project_id = NEW.project_id
    AND revision.schedule_day_id = NEW.schedule_day_id
  ORDER BY revision.revision_number DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF NEW.revision_number IS DISTINCT FROM v_latest.revision_number + 1
      OR NEW.base_revision_id IS DISTINCT FROM v_latest.id
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'project_call_sheet_lineage_mismatch';
    END IF;
  ELSIF NEW.revision_number IS DISTINCT FROM 1
    OR NEW.base_revision_id IS NOT NULL
    OR NEW.revision_kind IS DISTINCT FROM 'generated'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'project_call_sheet_lineage_mismatch';
  END IF;

  SELECT revision.*
  INTO v_schedule
  FROM co_production.project_production_schedule_revisions AS revision
  WHERE revision.id = NEW.source_production_schedule_revision_id
    AND revision.project_id = NEW.project_id
    AND revision.team_id IS NOT DISTINCT FROM NEW.team_id
    AND revision.content_hash = NEW.source_production_schedule_content_hash;

  SELECT binding.*
  INTO v_schedule_binding
  FROM co_production.project_production_schedule_approval_bindings AS binding
  WHERE binding.id = NEW.source_production_schedule_approval_binding_id
    AND binding.project_id = NEW.project_id
    AND binding.team_id IS NOT DISTINCT FROM NEW.team_id
    AND binding.production_schedule_revision_id =
      NEW.source_production_schedule_revision_id
    AND binding.production_schedule_content_hash =
      NEW.source_production_schedule_content_hash;

  IF v_schedule.id IS NULL
    OR v_schedule_binding.id IS NULL
    OR NEW.source_schedule_day_content_hash IS DISTINCT FROM
      co_production_private.preproject_sha256(
        (v_source -> 'scheduleDay')::text
      )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'project_call_sheet_schedule_source_mismatch';
  END IF;

  IF NEW.revision_kind = 'generated' THEN
    IF NEW.change_summary IS NOT NULL
      OR NEW.content IS DISTINCT FROM
        co_production_private.derive_project_call_sheet_content(
          v_schedule.content,
          NEW.schedule_day_id
        )
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'project_call_sheet_derivation_mismatch';
    END IF;
  ELSE
    SELECT base.*
    INTO v_base
    FROM co_production.project_call_sheet_revisions AS base
    WHERE base.id = NEW.base_revision_id
      AND base.project_id = NEW.project_id
      AND base.schedule_day_id = NEW.schedule_day_id;

    IF NOT FOUND
      OR ROW(
        NEW.source_production_schedule_revision_id,
        NEW.source_production_schedule_content_hash,
        NEW.source_production_schedule_approval_binding_id,
        NEW.source_schedule_day_content_hash
      ) IS DISTINCT FROM ROW(
        v_base.source_production_schedule_revision_id,
        v_base.source_production_schedule_content_hash,
        v_base.source_production_schedule_approval_binding_id,
        v_base.source_schedule_day_content_hash
      )
      OR NOT
        co_production_private.project_call_sheet_content_matches_schedule_day(
          NEW.content,
          v_schedule.content,
          NEW.schedule_day_id
        )
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'project_call_sheet_authored_content_mismatch';
    END IF;
  END IF;

  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION
  co_production_private.guard_project_call_sheet_approval_binding_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_revision co_production.project_call_sheet_revisions%ROWTYPE;
  v_receipt co_production.project_preproduction_mutation_receipts%ROWTYPE;
BEGIN
  SELECT revision.*
  INTO v_revision
  FROM co_production.project_call_sheet_revisions AS revision
  WHERE revision.id = NEW.call_sheet_revision_id
    AND revision.project_id = NEW.project_id;

  SELECT receipt.*
  INTO v_receipt
  FROM co_production.project_preproduction_mutation_receipts AS receipt
  WHERE receipt.id = NEW.decision_receipt_id
    AND receipt.project_id = NEW.project_id
    AND receipt.call_sheet_revision_id = NEW.call_sheet_revision_id;

  IF v_revision.id IS NULL
    OR v_receipt.id IS NULL
    OR v_receipt.mutation_kind IS DISTINCT FROM 'project_call_sheet.approved'
    OR NEW.team_id IS DISTINCT FROM v_revision.team_id
    OR NEW.call_sheet_content_hash IS DISTINCT FROM v_revision.content_hash
    OR NEW.schedule_day_id IS DISTINCT FROM v_revision.schedule_day_id
    OR NEW.source_production_schedule_revision_id IS DISTINCT FROM
      v_revision.source_production_schedule_revision_id
    OR NEW.source_production_schedule_content_hash IS DISTINCT FROM
      v_revision.source_production_schedule_content_hash
    OR NEW.source_production_schedule_approval_binding_id IS DISTINCT FROM
      v_revision.source_production_schedule_approval_binding_id
    OR NEW.source_schedule_day_content_hash IS DISTINCT FROM
      v_revision.source_schedule_day_content_hash
    OR NEW.approved_by IS DISTINCT FROM v_receipt.actor_id
    OR NEW.approved_at IS DISTINCT FROM v_receipt.created_at
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'project_call_sheet_approval_binding_mismatch';
  END IF;

  RETURN NEW;
END
$$;

ALTER TABLE co_production.project_call_sheet_revisions
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.project_call_sheet_revisions
  FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.project_call_sheet_approval_bindings
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.project_call_sheet_approval_bindings
  FORCE ROW LEVEL SECURITY;

CREATE POLICY project_call_sheet_revisions_staff_select
  ON co_production.project_call_sheet_revisions
  FOR SELECT TO authenticated
  USING (
    co_production_private.project_preproduction_role(project_id) IN (
      'owner', 'admin', 'producer', 'editor'
    )
  );

CREATE POLICY project_call_sheet_approval_bindings_staff_select
  ON co_production.project_call_sheet_approval_bindings
  FOR SELECT TO authenticated
  USING (
    co_production_private.project_preproduction_role(project_id) IN (
      'owner', 'admin', 'producer', 'editor'
    )
  );

ALTER POLICY project_preproduction_mutation_receipts_select
  ON co_production.project_preproduction_mutation_receipts
  USING (
    (
      script_revision_id IS NULL
      AND plan_draft_id IS NULL
      AND shot_plan_revision_id IS NULL
      AND production_schedule_revision_id IS NULL
      AND call_sheet_revision_id IS NULL
      AND co_production_private.project_preproduction_role(project_id)
        IS NOT NULL
    )
    OR (
      shot_plan_revision_id IS NULL
      AND production_schedule_revision_id IS NULL
      AND call_sheet_revision_id IS NULL
      AND co_production_private.project_preproduction_role(project_id) IN (
        'owner', 'admin', 'producer', 'editor', 'member'
      )
    )
    OR (
      (
        shot_plan_revision_id IS NOT NULL
        OR production_schedule_revision_id IS NOT NULL
        OR call_sheet_revision_id IS NOT NULL
      )
      AND co_production_private.project_preproduction_role(project_id) IN (
        'owner', 'admin', 'producer', 'editor'
      )
    )
  );

ALTER POLICY project_preproduction_events_select
  ON co_production.project_preproduction_events
  USING (
    (
      entity_kind NOT IN (
        'project_script_revision',
        'production_plan_script_draft',
        'project_shot_plan_revision',
        'project_production_schedule_revision',
        'project_call_sheet_revision'
      )
      AND co_production_private.project_preproduction_role(project_id)
        IS NOT NULL
    )
    OR (
      entity_kind NOT IN (
        'project_shot_plan_revision',
        'project_production_schedule_revision',
        'project_call_sheet_revision'
      )
      AND co_production_private.project_preproduction_role(project_id) IN (
        'owner', 'admin', 'producer', 'editor', 'member'
      )
    )
    OR (
      entity_kind IN (
        'project_shot_plan_revision',
        'project_production_schedule_revision',
        'project_call_sheet_revision'
      )
      AND co_production_private.project_preproduction_role(project_id) IN (
        'owner', 'admin', 'producer', 'editor'
      )
    )
  );

CREATE TRIGGER project_call_sheet_revisions_lineage_guard
BEFORE INSERT ON co_production.project_call_sheet_revisions
FOR EACH ROW
EXECUTE FUNCTION
  co_production_private.guard_project_call_sheet_revision_insert();

CREATE TRIGGER project_call_sheet_revisions_immutable
BEFORE UPDATE OR DELETE ON co_production.project_call_sheet_revisions
FOR EACH ROW
EXECUTE FUNCTION
  co_production_private.prevent_project_preproduction_immutable_mutation();

CREATE TRIGGER project_call_sheet_revisions_no_truncate
BEFORE TRUNCATE ON co_production.project_call_sheet_revisions
FOR EACH STATEMENT
EXECUTE FUNCTION
  co_production_private.prevent_project_preproduction_immutable_mutation();

CREATE TRIGGER project_call_sheet_approval_bindings_guard
BEFORE INSERT ON co_production.project_call_sheet_approval_bindings
FOR EACH ROW
EXECUTE FUNCTION
  co_production_private.guard_project_call_sheet_approval_binding_insert();

CREATE TRIGGER project_call_sheet_approval_bindings_immutable
BEFORE UPDATE OR DELETE ON co_production.project_call_sheet_approval_bindings
FOR EACH ROW
EXECUTE FUNCTION
  co_production_private.prevent_project_preproduction_immutable_mutation();

CREATE TRIGGER project_call_sheet_approval_bindings_no_truncate
BEFORE TRUNCATE ON co_production.project_call_sheet_approval_bindings
FOR EACH STATEMENT
EXECUTE FUNCTION
  co_production_private.prevent_project_preproduction_immutable_mutation();

CREATE OR REPLACE FUNCTION co_production.get_project_call_sheet(
  p_project_id uuid,
  p_schedule_day_id text DEFAULT NULL
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
  v_source jsonb;
  v_selected_schedule_day_id text;
  v_head co_production.project_call_sheet_revisions%ROWTYPE;
  v_active_revision_id uuid;
  v_revisions jsonb := '[]'::jsonb;
  v_head_json jsonb := 'null'::jsonb;
  v_head_state text;
  v_head_is_stale boolean := true;
  v_has_generated_source boolean := false;
BEGIN
  IF v_actor_id IS NULL OR p_project_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'project_call_sheet_forbidden';
  END IF;
  IF p_schedule_day_id IS NOT NULL
    AND NOT co_production_private.project_call_sheet_identifier_is_valid(
      p_schedule_day_id
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_project_call_sheet_schedule_day';
  END IF;

  v_role := co_production_private.project_preproduction_role(p_project_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'project_call_sheet_not_found';
  END IF;
  IF v_role NOT IN ('owner', 'admin', 'producer', 'editor') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'project_call_sheet_forbidden';
  END IF;

  SELECT authority.authority_version, authority.event_head_hash
  INTO v_authority_version, v_event_head_hash
  FROM co_production.project_preproduction_authorities AS authority
  WHERE authority.project_id = p_project_id;

  IF NOT FOUND THEN
    v_authority_version := 0;
    v_event_head_hash := 'sha256:' || pg_catalog.repeat('0', 64);
  END IF;

  v_source := co_production_private.current_project_call_sheet_source(
    p_project_id,
    p_schedule_day_id
  );
  v_selected_schedule_day_id := COALESCE(
    v_source ->> 'scheduleDayId',
    p_schedule_day_id
  );

  IF v_source IS NOT NULL THEN
    SELECT revision.id
    INTO v_active_revision_id
    FROM co_production.project_call_sheet_approval_bindings AS binding
    JOIN co_production.project_call_sheet_revisions AS revision
      ON revision.id = binding.call_sheet_revision_id
      AND revision.project_id = binding.project_id
      AND revision.schedule_day_id = binding.schedule_day_id
    WHERE binding.project_id = p_project_id
      AND binding.schedule_day_id = v_selected_schedule_day_id
      AND binding.source_production_schedule_revision_id =
        (v_source ->> 'productionScheduleRevisionId')::uuid
      AND binding.source_production_schedule_content_hash =
        v_source ->> 'productionScheduleContentHash'
      AND binding.source_production_schedule_approval_binding_id =
        (v_source ->> 'productionScheduleApprovalBindingId')::uuid
      AND binding.source_schedule_day_content_hash =
        v_source ->> 'scheduleDayContentHash'
    ORDER BY revision.revision_number DESC
    LIMIT 1;

    SELECT EXISTS (
      SELECT 1
      FROM co_production.project_call_sheet_revisions AS revision
      WHERE revision.project_id = p_project_id
        AND revision.schedule_day_id = v_selected_schedule_day_id
        AND revision.revision_kind = 'generated'
        AND revision.source_production_schedule_revision_id =
          (v_source ->> 'productionScheduleRevisionId')::uuid
        AND revision.source_production_schedule_content_hash =
          v_source ->> 'productionScheduleContentHash'
        AND revision.source_production_schedule_approval_binding_id =
          (v_source ->> 'productionScheduleApprovalBindingId')::uuid
        AND revision.source_schedule_day_content_hash =
          v_source ->> 'scheduleDayContentHash'
    )
    INTO v_has_generated_source;
  END IF;

  SELECT revision.*
  INTO v_head
  FROM co_production.project_call_sheet_revisions AS revision
  WHERE revision.project_id = p_project_id
    AND revision.schedule_day_id = v_selected_schedule_day_id
  ORDER BY revision.revision_number DESC
  LIMIT 1;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', revision.id,
        'projectId', revision.project_id,
        'scheduleDayId', revision.schedule_day_id,
        'revisionNumber', revision.revision_number,
        'baseRevisionId', revision.base_revision_id,
        'revisionKind', revision.revision_kind,
        'derivationVersion', revision.derivation_version,
        'title', revision.content ->> 'title',
        'changeSummary', revision.change_summary,
        'contentHash', revision.content_hash,
        'source', pg_catalog.jsonb_build_object(
          'productionScheduleRevisionId',
            revision.source_production_schedule_revision_id,
          'productionScheduleRevisionNumber', schedule.revision_number,
          'productionScheduleContentHash',
            revision.source_production_schedule_content_hash,
          'productionScheduleApprovalBindingId',
            revision.source_production_schedule_approval_binding_id,
          'scheduleDayId', revision.schedule_day_id,
          'scheduleDayContentHash',
            revision.source_schedule_day_content_hash
        ),
        'workflow', pg_catalog.jsonb_build_object(
          'state', CASE latest_workflow.mutation_kind
            WHEN 'project_call_sheet.submitted' THEN 'submitted'
            WHEN 'project_call_sheet.approved' THEN 'approved'
            WHEN 'project_call_sheet.changes_requested' THEN
              'changes_requested'
            ELSE 'draft'
          END,
          'isStale', v_source IS NULL OR ROW(
            revision.source_production_schedule_revision_id,
            revision.source_production_schedule_content_hash,
            revision.source_production_schedule_approval_binding_id,
            revision.source_schedule_day_content_hash
          ) IS DISTINCT FROM ROW(
            (v_source ->> 'productionScheduleRevisionId')::uuid,
            v_source ->> 'productionScheduleContentHash',
            (v_source ->> 'productionScheduleApprovalBindingId')::uuid,
            v_source ->> 'scheduleDayContentHash'
          ),
          'isActive', revision.id IS NOT DISTINCT FROM v_active_revision_id,
          'submittedBy', submission.actor_id,
          'submittedAt', submission.created_at,
          'submissionNote', submission.payload -> 'note',
          'decision', CASE decision.mutation_kind
            WHEN 'project_call_sheet.approved' THEN 'approved'
            WHEN 'project_call_sheet.changes_requested' THEN
              'changes_requested'
            ELSE NULL
          END,
          'decidedBy', decision.actor_id,
          'decidedAt', decision.created_at,
          'decisionNote', decision.payload -> 'note'
        ),
        'createdBy', revision.created_by,
        'createdAt', revision.created_at
      )
      ORDER BY revision.revision_number DESC
    ),
    '[]'::jsonb
  )
  INTO v_revisions
  FROM co_production.project_call_sheet_revisions AS revision
  JOIN co_production.project_production_schedule_revisions AS schedule
    ON schedule.id = revision.source_production_schedule_revision_id
    AND schedule.project_id = revision.project_id
    AND schedule.content_hash =
      revision.source_production_schedule_content_hash
  LEFT JOIN LATERAL (
    SELECT receipt.mutation_kind
    FROM co_production.project_preproduction_mutation_receipts AS receipt
    WHERE receipt.project_id = revision.project_id
      AND receipt.call_sheet_revision_id = revision.id
      AND receipt.mutation_kind IN (
        'project_call_sheet.submitted',
        'project_call_sheet.approved',
        'project_call_sheet.changes_requested'
      )
    ORDER BY receipt.authority_version DESC
    LIMIT 1
  ) AS latest_workflow ON true
  LEFT JOIN LATERAL (
    SELECT receipt.actor_id, receipt.created_at, event_record.payload
    FROM co_production.project_preproduction_mutation_receipts AS receipt
    JOIN co_production.project_preproduction_events AS event_record
      ON event_record.receipt_id = receipt.id
      AND event_record.project_id = receipt.project_id
      AND event_record.authority_version = receipt.authority_version
    WHERE receipt.project_id = revision.project_id
      AND receipt.call_sheet_revision_id = revision.id
      AND receipt.mutation_kind = 'project_call_sheet.submitted'
    ORDER BY receipt.authority_version DESC
    LIMIT 1
  ) AS submission ON true
  LEFT JOIN LATERAL (
    SELECT
      receipt.mutation_kind,
      receipt.actor_id,
      receipt.created_at,
      event_record.payload
    FROM co_production.project_preproduction_mutation_receipts AS receipt
    JOIN co_production.project_preproduction_events AS event_record
      ON event_record.receipt_id = receipt.id
      AND event_record.project_id = receipt.project_id
      AND event_record.authority_version = receipt.authority_version
    WHERE receipt.project_id = revision.project_id
      AND receipt.call_sheet_revision_id = revision.id
      AND receipt.mutation_kind IN (
        'project_call_sheet.approved',
        'project_call_sheet.changes_requested'
      )
    ORDER BY receipt.authority_version DESC
    LIMIT 1
  ) AS decision ON true
  WHERE revision.project_id = p_project_id
    AND revision.schedule_day_id = v_selected_schedule_day_id;

  IF v_head.id IS NOT NULL THEN
    v_head_json := (v_revisions -> 0)
      || pg_catalog.jsonb_build_object('content', v_head.content);
    v_head_state := v_head_json #>> '{workflow,state}';
    v_head_is_stale := (v_head_json #>> '{workflow,isStale}')::boolean;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'projectId', p_project_id,
    'selectedScheduleDayId', v_selected_schedule_day_id,
    'authorityVersion', v_authority_version,
    'eventHeadHash', v_event_head_hash,
    'source', CASE
      WHEN v_source IS NULL THEN NULL
      ELSE v_source - 'teamId'
    END,
    'head', v_head_json,
    'revisions', v_revisions,
    'permissions', pg_catalog.jsonb_build_object(
      'canRead', true,
      'canGenerate',
        v_role IN ('owner', 'admin', 'producer')
        AND v_source IS NOT NULL
        AND NOT v_has_generated_source,
      'canRevise',
        v_role IN ('owner', 'admin', 'producer', 'editor')
        AND v_head.id IS NOT NULL
        AND NOT v_head_is_stale
        AND v_head_state <> 'submitted',
      'canSubmit',
        v_role IN ('owner', 'admin', 'producer', 'editor')
        AND v_head.id IS NOT NULL
        AND NOT v_head_is_stale
        AND v_head_state = 'draft'
        AND co_production_private.project_call_sheet_content_is_submittable(
          v_head.content
        ),
      'canDecide',
        v_role IN ('owner', 'admin', 'producer')
        AND v_head.id IS NOT NULL
        AND NOT v_head_is_stale
        AND v_head_state = 'submitted'
    )
  );
END
$$;

CREATE OR REPLACE FUNCTION co_production.append_project_call_sheet_revision(
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
  v_base co_production.project_call_sheet_revisions%ROWTYPE;
  v_latest co_production.project_call_sheet_revisions%ROWTYPE;
  v_schedule co_production.project_production_schedule_revisions%ROWTYPE;
  v_source jsonb;
  v_source_summary jsonb;
  v_current_state text;
  v_revision_id uuid := pg_catalog.gen_random_uuid();
  v_revision_number bigint;
  v_new_authority_version bigint;
  v_content_hash text;
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
    OR p_base_revision_id IS NULL
    OR p_content IS NULL
    OR NOT co_production_private.project_call_sheet_content_is_valid(p_content)
    OR (
      p_change_summary IS NOT NULL
      AND (
        NOT co_production_private.preproject_safe_text(
          p_change_summary, 1, 4000
        )
        OR p_change_summary IS DISTINCT FROM
          pg_catalog.btrim(p_change_summary)
        OR p_change_summary ~ E'\r'
      )
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_project_call_sheet_revision';
  END IF;

  SELECT project.*
  INTO v_project
  FROM co_production.projects AS project
  WHERE project.id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'project_call_sheet_not_found';
  END IF;

  v_role := co_production_private.project_preproduction_role(p_project_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'project_call_sheet_not_found';
  END IF;
  IF v_role NOT IN ('owner', 'admin', 'producer', 'editor') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'project_call_sheet_forbidden';
  END IF;

  v_request_payload := pg_catalog.jsonb_build_object(
    'operation', 'append_project_call_sheet_revision',
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

  SELECT authority.*
  INTO v_authority
  FROM co_production.project_preproduction_authorities AS authority
  WHERE authority.project_id = p_project_id
  FOR UPDATE;

  IF NOT FOUND OR v_authority.team_id IS DISTINCT FROM v_project.team_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_call_sheet_authority_mismatch';
  END IF;

  SELECT receipt.*
  INTO v_existing
  FROM co_production.project_preproduction_mutation_receipts AS receipt
  WHERE receipt.project_id = p_project_id
    AND receipt.request_id = p_request_id;

  IF FOUND THEN
    IF v_existing.mutation_kind IS DISTINCT FROM 'project_call_sheet.revised'
      OR v_existing.expected_entity_version IS DISTINCT FROM
        p_expected_authority_version
      OR v_existing.request_payload IS DISTINCT FROM v_request_payload
      OR v_existing.request_hash IS DISTINCT FROM v_request_hash
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'project_call_sheet_idempotency_conflict';
    END IF;
    RETURN v_existing.result
      || pg_catalog.jsonb_build_object('replayed', true);
  END IF;

  IF v_authority.authority_version IS DISTINCT FROM
    p_expected_authority_version
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'project_call_sheet_authority_version_conflict';
  END IF;
  IF v_authority.authority_version >= 2147483647 THEN
    RAISE EXCEPTION USING
      ERRCODE = '54000',
      MESSAGE = 'preproduction_authority_version_exhausted';
  END IF;

  SELECT revision.*
  INTO v_base
  FROM co_production.project_call_sheet_revisions AS revision
  WHERE revision.project_id = p_project_id
    AND revision.id = p_base_revision_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'project_call_sheet_base_revision_conflict';
  END IF;

  SELECT revision.*
  INTO v_latest
  FROM co_production.project_call_sheet_revisions AS revision
  WHERE revision.project_id = p_project_id
    AND revision.schedule_day_id = v_base.schedule_day_id
  ORDER BY revision.revision_number DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND OR v_latest.id IS DISTINCT FROM v_base.id THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'project_call_sheet_base_revision_conflict';
  END IF;
  IF v_base.revision_number >= 2147483647 THEN
    RAISE EXCEPTION USING
      ERRCODE = '54000',
      MESSAGE = 'project_call_sheet_revision_exhausted';
  END IF;

  v_source := co_production_private.current_project_call_sheet_source(
    p_project_id,
    v_base.schedule_day_id
  );
  IF v_source IS NULL OR ROW(
    v_base.source_production_schedule_revision_id,
    v_base.source_production_schedule_content_hash,
    v_base.source_production_schedule_approval_binding_id,
    v_base.source_schedule_day_content_hash
  ) IS DISTINCT FROM ROW(
    (v_source ->> 'productionScheduleRevisionId')::uuid,
    v_source ->> 'productionScheduleContentHash',
    (v_source ->> 'productionScheduleApprovalBindingId')::uuid,
    v_source ->> 'scheduleDayContentHash'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_call_sheet_stale_source';
  END IF;

  SELECT receipt.mutation_kind
  INTO v_current_state
  FROM co_production.project_preproduction_mutation_receipts AS receipt
  WHERE receipt.project_id = p_project_id
    AND receipt.call_sheet_revision_id = v_base.id
    AND receipt.mutation_kind IN (
      'project_call_sheet.submitted',
      'project_call_sheet.approved',
      'project_call_sheet.changes_requested'
    )
  ORDER BY receipt.authority_version DESC
  LIMIT 1;

  IF FOUND AND v_current_state = 'project_call_sheet.submitted' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_call_sheet_invalid_transition';
  END IF;

  SELECT schedule.*
  INTO v_schedule
  FROM co_production.project_production_schedule_revisions AS schedule
  WHERE schedule.id = v_base.source_production_schedule_revision_id
    AND schedule.project_id = p_project_id
    AND schedule.content_hash =
      v_base.source_production_schedule_content_hash;

  IF NOT FOUND
    OR NOT
      co_production_private.project_call_sheet_content_matches_schedule_day(
        p_content,
        v_schedule.content,
        v_base.schedule_day_id
      )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'project_call_sheet_authored_content_mismatch';
  END IF;

  v_revision_number := v_base.revision_number + 1;
  v_new_authority_version := v_authority.authority_version + 1;
  v_source_summary := v_source
    - 'teamId'
    - 'productionScheduleContent'
    - 'scheduleDay';

  INSERT INTO co_production.project_call_sheet_revisions (
    id,
    project_id,
    team_id,
    schedule_day_id,
    revision_number,
    base_revision_id,
    revision_kind,
    derivation_version,
    change_summary,
    content,
    content_hash,
    source_production_schedule_revision_id,
    source_production_schedule_content_hash,
    source_production_schedule_approval_binding_id,
    source_schedule_day_content_hash,
    created_by,
    created_at
  )
  VALUES (
    v_revision_id,
    p_project_id,
    v_project.team_id,
    v_base.schedule_day_id,
    v_revision_number,
    v_base.id,
    'authored',
    'cco.call-sheet.v1',
    p_change_summary,
    p_content,
    v_content_hash,
    v_base.source_production_schedule_revision_id,
    v_base.source_production_schedule_content_hash,
    v_base.source_production_schedule_approval_binding_id,
    v_base.source_schedule_day_content_hash,
    v_actor_id,
    v_now
  );

  v_result := pg_catalog.jsonb_build_object(
    'callSheetRevisionId', v_revision_id,
    'projectId', p_project_id,
    'scheduleDayId', v_base.schedule_day_id,
    'revisionNumber', v_revision_number,
    'baseRevisionId', v_base.id,
    'workflowState', 'draft',
    'source', v_source_summary,
    'authorityVersion', v_new_authority_version,
    'requestId', p_request_id,
    'replayed', false
  );

  v_receipt_hash := co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'id', v_receipt_id,
      'projectId', p_project_id,
      'teamId', v_project.team_id,
      'mutationKind', 'project_call_sheet.revised',
      'planRevisionId', NULL,
      'taskId', NULL,
      'scriptRevisionId', NULL,
      'planDraftId', NULL,
      'shotPlanRevisionId', NULL,
      'productionScheduleRevisionId', NULL,
      'callSheetRevisionId', v_revision_id,
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
    'callSheetRevisionId', v_revision_id,
    'scheduleDayId', v_base.schedule_day_id,
    'revisionNumber', v_revision_number,
    'baseRevisionId', v_base.id,
    'revisionKind', 'authored',
    'derivationVersion', 'cco.call-sheet.v1',
    'changeSummary', p_change_summary,
    'contentHash', v_content_hash,
    'source', v_source_summary
  );
  v_event_hash := co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'id', v_event_id,
      'projectId', p_project_id,
      'teamId', v_project.team_id,
      'receiptId', v_receipt_id,
      'authorityVersion', v_new_authority_version,
      'eventType', 'project_call_sheet.revised',
      'entityKind', 'project_call_sheet_revision',
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
    plan_draft_id,
    shot_plan_revision_id,
    production_schedule_revision_id,
    call_sheet_revision_id,
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
    'project_call_sheet.revised',
    NULL,
    NULL,
    NULL,
    NULL,
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
    'project_call_sheet.revised',
    'project_call_sheet_revision',
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
      MESSAGE = 'project_call_sheet_authority_version_conflict';
  END IF;

  RETURN v_result;
END
$$;

CREATE OR REPLACE FUNCTION co_production.submit_project_call_sheet_revision(
  p_project_id uuid,
  p_expected_authority_version bigint,
  p_request_id uuid,
  p_call_sheet_revision_id uuid,
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
  v_revision co_production.project_call_sheet_revisions%ROWTYPE;
  v_latest co_production.project_call_sheet_revisions%ROWTYPE;
  v_source jsonb;
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
    OR p_expected_authority_version IS NULL
    OR p_expected_authority_version NOT BETWEEN 0 AND 2147483646
    OR p_request_id IS NULL
    OR p_call_sheet_revision_id IS NULL
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
      MESSAGE = 'invalid_project_call_sheet_submission';
  END IF;

  SELECT project.*
  INTO v_project
  FROM co_production.projects AS project
  WHERE project.id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'project_call_sheet_not_found';
  END IF;

  v_role := co_production_private.project_preproduction_role(p_project_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'project_call_sheet_not_found';
  END IF;
  IF v_role NOT IN ('owner', 'admin', 'producer', 'editor') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'project_call_sheet_forbidden';
  END IF;

  v_request_payload := pg_catalog.jsonb_build_object(
    'operation', 'submit_project_call_sheet_revision',
    'projectId', p_project_id,
    'expectedAuthorityVersion', p_expected_authority_version,
    'requestId', p_request_id,
    'callSheetRevisionId', p_call_sheet_revision_id,
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
      MESSAGE = 'project_call_sheet_authority_mismatch';
  END IF;

  SELECT receipt.*
  INTO v_existing
  FROM co_production.project_preproduction_mutation_receipts AS receipt
  WHERE receipt.project_id = p_project_id
    AND receipt.request_id = p_request_id;

  IF FOUND THEN
    IF v_existing.mutation_kind IS DISTINCT FROM
      'project_call_sheet.submitted'
      OR v_existing.call_sheet_revision_id IS DISTINCT FROM
        p_call_sheet_revision_id
      OR v_existing.expected_entity_version IS DISTINCT FROM
        p_expected_authority_version
      OR v_existing.request_payload IS DISTINCT FROM v_request_payload
      OR v_existing.request_hash IS DISTINCT FROM v_request_hash
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'project_call_sheet_idempotency_conflict';
    END IF;
    RETURN v_existing.result
      || pg_catalog.jsonb_build_object('replayed', true);
  END IF;

  IF v_authority.authority_version IS DISTINCT FROM
    p_expected_authority_version
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'project_call_sheet_authority_version_conflict';
  END IF;
  IF v_authority.authority_version >= 2147483647 THEN
    RAISE EXCEPTION USING
      ERRCODE = '54000',
      MESSAGE = 'preproduction_authority_version_exhausted';
  END IF;

  SELECT revision.*
  INTO v_revision
  FROM co_production.project_call_sheet_revisions AS revision
  WHERE revision.project_id = p_project_id
    AND revision.id = p_call_sheet_revision_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'project_call_sheet_revision_conflict';
  END IF;

  SELECT revision.*
  INTO v_latest
  FROM co_production.project_call_sheet_revisions AS revision
  WHERE revision.project_id = p_project_id
    AND revision.schedule_day_id = v_revision.schedule_day_id
  ORDER BY revision.revision_number DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND OR v_latest.id IS DISTINCT FROM v_revision.id THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'project_call_sheet_revision_conflict';
  END IF;

  v_source := co_production_private.current_project_call_sheet_source(
    p_project_id,
    v_revision.schedule_day_id
  );
  IF v_source IS NULL OR ROW(
    v_revision.source_production_schedule_revision_id,
    v_revision.source_production_schedule_content_hash,
    v_revision.source_production_schedule_approval_binding_id,
    v_revision.source_schedule_day_content_hash
  ) IS DISTINCT FROM ROW(
    (v_source ->> 'productionScheduleRevisionId')::uuid,
    v_source ->> 'productionScheduleContentHash',
    (v_source ->> 'productionScheduleApprovalBindingId')::uuid,
    v_source ->> 'scheduleDayContentHash'
  ) OR NOT
    co_production_private.project_call_sheet_content_matches_schedule_day(
      v_revision.content,
      v_source -> 'productionScheduleContent',
      v_revision.schedule_day_id
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_call_sheet_stale_source';
  END IF;

  IF NOT co_production_private.project_call_sheet_content_is_submittable(
    v_revision.content
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'project_call_sheet_not_submittable';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM co_production.project_preproduction_mutation_receipts AS receipt
    WHERE receipt.project_id = p_project_id
      AND receipt.call_sheet_revision_id = p_call_sheet_revision_id
      AND receipt.mutation_kind IN (
        'project_call_sheet.submitted',
        'project_call_sheet.approved',
        'project_call_sheet.changes_requested'
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_call_sheet_invalid_transition';
  END IF;

  v_new_authority_version := v_authority.authority_version + 1;
  v_result := pg_catalog.jsonb_build_object(
    'callSheetRevisionId', p_call_sheet_revision_id,
    'projectId', p_project_id,
    'scheduleDayId', v_revision.schedule_day_id,
    'revisionNumber', v_revision.revision_number,
    'workflowState', 'submitted',
    'authorityVersion', v_new_authority_version,
    'requestId', p_request_id,
    'replayed', false
  );

  v_receipt_hash := co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'id', v_receipt_id,
      'projectId', p_project_id,
      'teamId', v_project.team_id,
      'mutationKind', 'project_call_sheet.submitted',
      'planRevisionId', NULL,
      'taskId', NULL,
      'scriptRevisionId', NULL,
      'planDraftId', NULL,
      'shotPlanRevisionId', NULL,
      'productionScheduleRevisionId', NULL,
      'callSheetRevisionId', p_call_sheet_revision_id,
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
    'callSheetRevisionId', p_call_sheet_revision_id,
    'scheduleDayId', v_revision.schedule_day_id,
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
      'eventType', 'project_call_sheet.submitted',
      'entityKind', 'project_call_sheet_revision',
      'entityId', p_call_sheet_revision_id,
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
    plan_draft_id,
    shot_plan_revision_id,
    production_schedule_revision_id,
    call_sheet_revision_id,
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
    'project_call_sheet.submitted',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    p_call_sheet_revision_id,
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
    'project_call_sheet.submitted',
    'project_call_sheet_revision',
    p_call_sheet_revision_id,
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
      MESSAGE = 'project_call_sheet_authority_version_conflict';
  END IF;

  RETURN v_result;
END
$$;

CREATE OR REPLACE FUNCTION co_production.decide_project_call_sheet_revision(
  p_project_id uuid,
  p_expected_authority_version bigint,
  p_request_id uuid,
  p_call_sheet_revision_id uuid,
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
  v_revision co_production.project_call_sheet_revisions%ROWTYPE;
  v_latest co_production.project_call_sheet_revisions%ROWTYPE;
  v_source jsonb;
  v_source_summary jsonb;
  v_current_state text;
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
    OR p_expected_authority_version IS NULL
    OR p_expected_authority_version NOT BETWEEN 0 AND 2147483646
    OR p_request_id IS NULL
    OR p_call_sheet_revision_id IS NULL
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
      MESSAGE = 'invalid_project_call_sheet_decision';
  END IF;

  SELECT project.*
  INTO v_project
  FROM co_production.projects AS project
  WHERE project.id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'project_call_sheet_not_found';
  END IF;

  v_role := co_production_private.project_preproduction_role(p_project_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'project_call_sheet_not_found';
  END IF;
  IF v_role NOT IN ('owner', 'admin', 'producer') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'project_call_sheet_forbidden';
  END IF;

  v_mutation_kind := 'project_call_sheet.' || p_decision;
  v_request_payload := pg_catalog.jsonb_build_object(
    'operation', 'decide_project_call_sheet_revision',
    'projectId', p_project_id,
    'expectedAuthorityVersion', p_expected_authority_version,
    'requestId', p_request_id,
    'callSheetRevisionId', p_call_sheet_revision_id,
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
      MESSAGE = 'project_call_sheet_authority_mismatch';
  END IF;

  SELECT receipt.*
  INTO v_existing
  FROM co_production.project_preproduction_mutation_receipts AS receipt
  WHERE receipt.project_id = p_project_id
    AND receipt.request_id = p_request_id;

  IF FOUND THEN
    IF v_existing.mutation_kind IS DISTINCT FROM v_mutation_kind
      OR v_existing.call_sheet_revision_id IS DISTINCT FROM
        p_call_sheet_revision_id
      OR v_existing.expected_entity_version IS DISTINCT FROM
        p_expected_authority_version
      OR v_existing.request_payload IS DISTINCT FROM v_request_payload
      OR v_existing.request_hash IS DISTINCT FROM v_request_hash
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'project_call_sheet_idempotency_conflict';
    END IF;
    RETURN v_existing.result
      || pg_catalog.jsonb_build_object('replayed', true);
  END IF;

  IF v_authority.authority_version IS DISTINCT FROM
    p_expected_authority_version
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'project_call_sheet_authority_version_conflict';
  END IF;
  IF v_authority.authority_version >= 2147483647 THEN
    RAISE EXCEPTION USING
      ERRCODE = '54000',
      MESSAGE = 'preproduction_authority_version_exhausted';
  END IF;

  SELECT revision.*
  INTO v_revision
  FROM co_production.project_call_sheet_revisions AS revision
  WHERE revision.project_id = p_project_id
    AND revision.id = p_call_sheet_revision_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'project_call_sheet_revision_conflict';
  END IF;

  SELECT revision.*
  INTO v_latest
  FROM co_production.project_call_sheet_revisions AS revision
  WHERE revision.project_id = p_project_id
    AND revision.schedule_day_id = v_revision.schedule_day_id
  ORDER BY revision.revision_number DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND OR v_latest.id IS DISTINCT FROM v_revision.id THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'project_call_sheet_revision_conflict';
  END IF;

  v_source := co_production_private.current_project_call_sheet_source(
    p_project_id,
    v_revision.schedule_day_id
  );
  IF v_source IS NULL OR ROW(
    v_revision.source_production_schedule_revision_id,
    v_revision.source_production_schedule_content_hash,
    v_revision.source_production_schedule_approval_binding_id,
    v_revision.source_schedule_day_content_hash
  ) IS DISTINCT FROM ROW(
    (v_source ->> 'productionScheduleRevisionId')::uuid,
    v_source ->> 'productionScheduleContentHash',
    (v_source ->> 'productionScheduleApprovalBindingId')::uuid,
    v_source ->> 'scheduleDayContentHash'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_call_sheet_stale_source';
  END IF;

  SELECT receipt.mutation_kind
  INTO v_current_state
  FROM co_production.project_preproduction_mutation_receipts AS receipt
  WHERE receipt.project_id = p_project_id
    AND receipt.call_sheet_revision_id = p_call_sheet_revision_id
    AND receipt.mutation_kind IN (
      'project_call_sheet.submitted',
      'project_call_sheet.approved',
      'project_call_sheet.changes_requested'
    )
  ORDER BY receipt.authority_version DESC
  LIMIT 1;

  IF NOT FOUND
    OR v_current_state IS DISTINCT FROM 'project_call_sheet.submitted'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_call_sheet_invalid_transition';
  END IF;

  v_new_authority_version := v_authority.authority_version + 1;
  v_source_summary := v_source
    - 'teamId'
    - 'productionScheduleContent'
    - 'scheduleDay';
  v_result := pg_catalog.jsonb_build_object(
    'callSheetRevisionId', p_call_sheet_revision_id,
    'projectId', p_project_id,
    'scheduleDayId', v_revision.schedule_day_id,
    'revisionNumber', v_revision.revision_number,
    'workflowState', p_decision,
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
      'scriptRevisionId', NULL,
      'planDraftId', NULL,
      'shotPlanRevisionId', NULL,
      'productionScheduleRevisionId', NULL,
      'callSheetRevisionId', p_call_sheet_revision_id,
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
    'callSheetRevisionId', p_call_sheet_revision_id,
    'scheduleDayId', v_revision.schedule_day_id,
    'revisionNumber', v_revision.revision_number,
    'decision', p_decision,
    'note', p_note,
    'contentHash', v_revision.content_hash,
    'source', v_source_summary
  );
  v_event_hash := co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'id', v_event_id,
      'projectId', p_project_id,
      'teamId', v_project.team_id,
      'receiptId', v_receipt_id,
      'authorityVersion', v_new_authority_version,
      'eventType', v_mutation_kind,
      'entityKind', 'project_call_sheet_revision',
      'entityId', p_call_sheet_revision_id,
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
    plan_draft_id,
    shot_plan_revision_id,
    production_schedule_revision_id,
    call_sheet_revision_id,
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
    NULL,
    NULL,
    NULL,
    NULL,
    p_call_sheet_revision_id,
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
    'project_call_sheet_revision',
    p_call_sheet_revision_id,
    v_event_payload,
    v_authority.event_head_hash,
    v_event_hash,
    v_actor_id,
    v_now
  );

  IF p_decision = 'approved' THEN
    INSERT INTO co_production.project_call_sheet_approval_bindings (
      project_id,
      team_id,
      call_sheet_revision_id,
      call_sheet_content_hash,
      schedule_day_id,
      source_production_schedule_revision_id,
      source_production_schedule_content_hash,
      source_production_schedule_approval_binding_id,
      source_schedule_day_content_hash,
      decision_receipt_id,
      approved_by,
      approved_at
    )
    VALUES (
      p_project_id,
      v_project.team_id,
      v_revision.id,
      v_revision.content_hash,
      v_revision.schedule_day_id,
      v_revision.source_production_schedule_revision_id,
      v_revision.source_production_schedule_content_hash,
      v_revision.source_production_schedule_approval_binding_id,
      v_revision.source_schedule_day_content_hash,
      v_receipt_id,
      v_actor_id,
      v_now
    );
  END IF;

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
      MESSAGE = 'project_call_sheet_authority_version_conflict';
  END IF;

  RETURN v_result;
END
$$;

REVOKE ALL ON TABLE co_production.project_call_sheet_revisions
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.project_call_sheet_approval_bindings
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.project_preproduction_mutation_receipts
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.project_preproduction_events
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION
  co_production_private.project_call_sheet_identifier_is_valid(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.project_call_sheet_nullable_text_is_valid(
    jsonb, integer, integer, boolean
  )
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.project_call_sheet_contact_is_valid(jsonb, integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.project_call_sheet_section_is_valid(jsonb, integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.project_call_sheet_agenda_item_is_valid(jsonb, integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.project_call_sheet_content_is_valid(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.project_call_sheet_content_is_submittable(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.project_call_sheet_content_matches_schedule_day(
    jsonb, jsonb, text
  )
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.derive_project_call_sheet_content(jsonb, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.current_project_call_sheet_source(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.verify_project_preproduction_receipt_hash()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.guard_project_preproduction_event_insert()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.guard_project_call_sheet_revision_insert()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.guard_project_call_sheet_approval_binding_insert()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION co_production.get_project_call_sheet(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production.generate_project_call_sheet_revision(
    uuid, bigint, uuid, text, uuid
  )
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production.append_project_call_sheet_revision(
    uuid, bigint, uuid, uuid, text, jsonb
  )
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production.submit_project_call_sheet_revision(
    uuid, bigint, uuid, uuid, text
  )
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production.decide_project_call_sheet_revision(
    uuid, bigint, uuid, uuid, text, text
  )
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION co_production.get_project_call_sheet(uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION
  co_production.generate_project_call_sheet_revision(
    uuid, bigint, uuid, text, uuid
  )
  TO authenticated;
GRANT EXECUTE ON FUNCTION
  co_production.append_project_call_sheet_revision(
    uuid, bigint, uuid, uuid, text, jsonb
  )
  TO authenticated;
GRANT EXECUTE ON FUNCTION
  co_production.submit_project_call_sheet_revision(
    uuid, bigint, uuid, uuid, text
  )
  TO authenticated;
GRANT EXECUTE ON FUNCTION
  co_production.decide_project_call_sheet_revision(
    uuid, bigint, uuid, uuid, text, text
  )
  TO authenticated;

CREATE UNIQUE INDEX project_call_sheet_revisions_generated_source_key
  ON co_production.project_call_sheet_revisions(
    project_id,
    schedule_day_id,
    source_production_schedule_revision_id,
    source_production_schedule_content_hash,
    source_production_schedule_approval_binding_id,
    source_schedule_day_content_hash
  )
  WHERE revision_kind = 'generated';

CREATE INDEX project_call_sheet_revisions_project_day_latest_idx
  ON co_production.project_call_sheet_revisions(
    project_id,
    schedule_day_id,
    revision_number DESC
  );

CREATE INDEX project_call_sheet_approval_bindings_project_day_approved_idx
  ON co_production.project_call_sheet_approval_bindings(
    project_id,
    schedule_day_id,
    approved_at DESC
  );

CREATE INDEX project_preproduction_receipts_call_sheet_history_idx
  ON co_production.project_preproduction_mutation_receipts(
    call_sheet_revision_id,
    authority_version DESC
  )
  WHERE call_sheet_revision_id IS NOT NULL;

COMMIT;
