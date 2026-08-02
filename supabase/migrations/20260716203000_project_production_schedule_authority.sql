-- Governed Production Schedule v1 authority for project pre-production.
--
-- Production schedules are immutable revisions bound to the exact active
-- approved Governed Shot Plan v1 revision. This migration is additive and
-- unapplied: it creates no crew, location, talent, equipment, permit, release,
-- call-sheet, weather, map, attachment, notification, or calendar-write
-- authority and performs no production-task or shot-plan data mutation.

BEGIN;

DO $project_production_schedule_preflight$
BEGIN
  IF current_setting('server_version_num')::integer < 150000 THEN
    RAISE EXCEPTION USING
      ERRCODE = '0A000',
      MESSAGE = 'project_production_schedule_requires_postgresql_15';
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
      'co_production.project_shot_plan_revisions'
    ) IS NULL
    OR pg_catalog.to_regclass(
      'co_production.project_shot_plan_approval_bindings'
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
      'co_production_private.project_shot_plan_content_is_valid(jsonb)'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'co_production_private.current_project_shot_plan_source(uuid)'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'co_production_private.prevent_project_preproduction_immutable_mutation()'
    ) IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE =
        'project_production_schedule_requires_governed_shot_plan_authority';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_record
    WHERE constraint_record.conrelid =
      'co_production.project_shot_plan_revisions'::pg_catalog.regclass
      AND constraint_record.conname =
        'project_shot_plan_revisions_id_project_content_hash_key'
      AND constraint_record.contype = 'u'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE =
        'project_production_schedule_requires_exact_shot_plan_hash_authority';
  END IF;
END
$project_production_schedule_preflight$;

ALTER TABLE co_production.project_shot_plan_approval_bindings
  ADD CONSTRAINT project_shot_plan_approval_bindings_exact_schedule_source_key
  UNIQUE (id, project_id, shot_plan_revision_id, shot_plan_content_hash);

CREATE OR REPLACE FUNCTION
  co_production_private.project_production_schedule_date_is_valid(
    p_value text
  )
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
BEGIN
  IF p_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RETURN false;
  END IF;

  BEGIN
    RETURN p_value::date::text = p_value;
  EXCEPTION
    WHEN datetime_field_overflow OR invalid_datetime_format THEN
      RETURN false;
  END;
END
$$;

CREATE OR REPLACE FUNCTION
  co_production_private.project_production_schedule_time_is_valid(
    p_value text
  )
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT p_value ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
$$;

CREATE OR REPLACE FUNCTION
  co_production_private.project_production_schedule_time_zone_is_valid(
    p_value text
  )
RETURNS boolean
LANGUAGE sql
STABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_timezone_names AS time_zone_record
    WHERE time_zone_record.name = p_value
  )
$$;

CREATE OR REPLACE FUNCTION
  co_production_private.project_production_schedule_item_is_valid(
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
        'id', 'order', 'kind', 'sourceSceneId', 'sourceShotId', 'label',
        'notes', 'startTime', 'plannedDurationMinutes'
      ]
    )
    OR pg_catalog.jsonb_typeof(p_item -> 'id') IS DISTINCT FROM 'string'
    OR NOT co_production_private.preproject_safe_text(
      p_item ->> 'id', 1, 80
    )
    OR p_item ->> 'id' IS DISTINCT FROM pg_catalog.btrim(p_item ->> 'id')
    OR p_item ->> 'id' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$'
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
    OR pg_catalog.jsonb_typeof(p_item -> 'label')
      NOT IN ('string', 'null')
    OR pg_catalog.jsonb_typeof(p_item -> 'notes')
      NOT IN ('string', 'null')
    OR (
      pg_catalog.jsonb_typeof(p_item -> 'notes') = 'string'
      AND (
        NOT co_production_private.preproject_safe_text(
          p_item ->> 'notes', 1, 20000
        )
        OR p_item ->> 'notes'
          IS DISTINCT FROM pg_catalog.btrim(p_item ->> 'notes')
        OR p_item ->> 'notes' ~ E'\r'
      )
    )
    OR pg_catalog.jsonb_typeof(p_item -> 'startTime')
      NOT IN ('string', 'null')
    OR (
      pg_catalog.jsonb_typeof(p_item -> 'startTime') = 'string'
      AND NOT co_production_private.project_production_schedule_time_is_valid(
        p_item ->> 'startTime'
      )
    )
    OR pg_catalog.jsonb_typeof(p_item -> 'plannedDurationMinutes')
      NOT IN ('number', 'null')
    OR (
      pg_catalog.jsonb_typeof(p_item -> 'plannedDurationMinutes') = 'number'
      AND (
        p_item ->> 'plannedDurationMinutes' !~ '^[1-9][0-9]{0,3}$'
        OR (p_item ->> 'plannedDurationMinutes')::integer
          NOT BETWEEN 1 AND 1440
      )
    )
  THEN
    RETURN false;
  END IF;

  v_kind := p_item ->> 'kind';
  IF v_kind = 'shot' THEN
    IF pg_catalog.jsonb_typeof(p_item -> 'sourceSceneId')
        IS DISTINCT FROM 'string'
      OR NOT co_production_private.preproject_safe_text(
        p_item ->> 'sourceSceneId', 1, 80
      )
      OR p_item ->> 'sourceSceneId'
        IS DISTINCT FROM pg_catalog.btrim(p_item ->> 'sourceSceneId')
      OR p_item ->> 'sourceSceneId'
        !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$'
      OR pg_catalog.jsonb_typeof(p_item -> 'sourceShotId')
        IS DISTINCT FROM 'string'
      OR NOT co_production_private.preproject_safe_text(
        p_item ->> 'sourceShotId', 1, 80
      )
      OR p_item ->> 'sourceShotId'
        IS DISTINCT FROM pg_catalog.btrim(p_item ->> 'sourceShotId')
      OR p_item ->> 'sourceShotId'
        !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$'
      OR pg_catalog.jsonb_typeof(p_item -> 'label')
        IS DISTINCT FROM 'null'
    THEN
      RETURN false;
    END IF;
  ELSIF pg_catalog.jsonb_typeof(p_item -> 'sourceSceneId')
      IS DISTINCT FROM 'null'
    OR pg_catalog.jsonb_typeof(p_item -> 'sourceShotId')
      IS DISTINCT FROM 'null'
    OR pg_catalog.jsonb_typeof(p_item -> 'label')
      IS DISTINCT FROM 'string'
    OR NOT co_production_private.preproject_safe_text(
      p_item ->> 'label', 1, 1000
    )
    OR p_item ->> 'label'
      IS DISTINCT FROM pg_catalog.btrim(p_item ->> 'label')
    OR p_item ->> 'label' ~ E'\r'
  THEN
    RETURN false;
  END IF;

  RETURN true;
END
$$;

CREATE OR REPLACE FUNCTION
  co_production_private.project_production_schedule_content_is_valid(
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
  v_day jsonb;
  v_item jsonb;
  v_day_number integer;
  v_item_number integer;
  v_total_items integer := 0;
  v_seen_day_ids text[] := ARRAY[]::text[];
  v_seen_item_ids text[] := ARRAY[]::text[];
  v_seen_source_shot_ids text[] := ARRAY[]::text[];
BEGIN
  IF pg_catalog.jsonb_typeof(p_content) IS DISTINCT FROM 'object'
    OR pg_catalog.octet_length(p_content::text) > 4194304
    OR NOT co_production_private.preproject_exact_json_keys(
      p_content,
      ARRAY['schemaVersion', 'title', 'timeZone', 'days', 'unscheduled']
    )
    OR pg_catalog.jsonb_typeof(p_content -> 'schemaVersion')
      IS DISTINCT FROM 'string'
    OR p_content ->> 'schemaVersion'
      IS DISTINCT FROM 'cco.production-schedule.v1'
    OR pg_catalog.jsonb_typeof(p_content -> 'title') IS DISTINCT FROM 'string'
    OR NOT co_production_private.preproject_safe_text(
      p_content ->> 'title', 1, 260
    )
    OR p_content ->> 'title'
      IS DISTINCT FROM pg_catalog.btrim(p_content ->> 'title')
    OR p_content ->> 'title' ~ E'\r'
    OR pg_catalog.jsonb_typeof(p_content -> 'timeZone')
      NOT IN ('string', 'null')
    OR (
      pg_catalog.jsonb_typeof(p_content -> 'timeZone') = 'string'
      AND (
        NOT co_production_private.preproject_safe_text(
          p_content ->> 'timeZone', 1, 128
        )
        OR p_content ->> 'timeZone'
          IS DISTINCT FROM pg_catalog.btrim(p_content ->> 'timeZone')
        OR NOT
          co_production_private.project_production_schedule_time_zone_is_valid(
            p_content ->> 'timeZone'
          )
      )
    )
    OR pg_catalog.jsonb_typeof(p_content -> 'days') IS DISTINCT FROM 'array'
    OR pg_catalog.jsonb_array_length(p_content -> 'days')
      NOT BETWEEN 0 AND 366
    OR pg_catalog.jsonb_typeof(p_content -> 'unscheduled')
      IS DISTINCT FROM 'array'
    OR pg_catalog.jsonb_array_length(p_content -> 'unscheduled') > 10000
  THEN
    RETURN false;
  END IF;

  FOR v_day, v_day_number IN
    SELECT day_record.value, day_record.position::integer
    FROM pg_catalog.jsonb_array_elements(p_content -> 'days')
      WITH ORDINALITY AS day_record(value, position)
    ORDER BY day_record.position
  LOOP
    IF NOT co_production_private.preproject_exact_json_keys(
      v_day,
      ARRAY[
        'id', 'order', 'date', 'unitCallTime', 'notes', 'items'
      ]
    )
      OR pg_catalog.jsonb_typeof(v_day -> 'id') IS DISTINCT FROM 'string'
      OR NOT co_production_private.preproject_safe_text(
        v_day ->> 'id', 1, 80
      )
      OR v_day ->> 'id' IS DISTINCT FROM pg_catalog.btrim(v_day ->> 'id')
      OR v_day ->> 'id' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$'
      OR pg_catalog.jsonb_typeof(v_day -> 'order') IS DISTINCT FROM 'number'
      OR v_day ->> 'order' !~ '^[1-9][0-9]{0,2}$'
      OR (v_day ->> 'order')::integer IS DISTINCT FROM v_day_number
      OR pg_catalog.jsonb_typeof(v_day -> 'date')
        NOT IN ('string', 'null')
      OR (
        pg_catalog.jsonb_typeof(v_day -> 'date') = 'string'
        AND NOT
          co_production_private.project_production_schedule_date_is_valid(
            v_day ->> 'date'
          )
      )
      OR pg_catalog.jsonb_typeof(v_day -> 'unitCallTime')
        NOT IN ('string', 'null')
      OR (
        pg_catalog.jsonb_typeof(v_day -> 'unitCallTime') = 'string'
        AND NOT
          co_production_private.project_production_schedule_time_is_valid(
            v_day ->> 'unitCallTime'
          )
      )
      OR pg_catalog.jsonb_typeof(v_day -> 'notes')
        NOT IN ('string', 'null')
      OR (
        pg_catalog.jsonb_typeof(v_day -> 'notes') = 'string'
        AND (
          NOT co_production_private.preproject_safe_text(
            v_day ->> 'notes', 1, 20000
          )
          OR v_day ->> 'notes'
            IS DISTINCT FROM pg_catalog.btrim(v_day ->> 'notes')
          OR v_day ->> 'notes' ~ E'\r'
        )
      )
      OR pg_catalog.jsonb_typeof(v_day -> 'items') IS DISTINCT FROM 'array'
      OR pg_catalog.jsonb_array_length(v_day -> 'items') > 10000
      OR (v_day ->> 'id') = ANY(v_seen_day_ids)
    THEN
      RETURN false;
    END IF;

    v_seen_day_ids := pg_catalog.array_append(
      v_seen_day_ids,
      v_day ->> 'id'
    );

    FOR v_item, v_item_number IN
      SELECT item_record.value, item_record.position::integer
      FROM pg_catalog.jsonb_array_elements(v_day -> 'items')
        WITH ORDINALITY AS item_record(value, position)
      ORDER BY item_record.position
    LOOP
      v_total_items := v_total_items + 1;
      IF v_total_items > 10000
        OR NOT
          co_production_private.project_production_schedule_item_is_valid(
            v_item,
            v_item_number
          )
        OR (v_item ->> 'id') = ANY(v_seen_item_ids)
        OR (
          v_item ->> 'kind' = 'shot'
          AND (v_item ->> 'sourceShotId') = ANY(v_seen_source_shot_ids)
        )
      THEN
        RETURN false;
      END IF;
      v_seen_item_ids := pg_catalog.array_append(
        v_seen_item_ids,
        v_item ->> 'id'
      );
      IF v_item ->> 'kind' = 'shot' THEN
        v_seen_source_shot_ids := pg_catalog.array_append(
          v_seen_source_shot_ids,
          v_item ->> 'sourceShotId'
        );
      END IF;
    END LOOP;
  END LOOP;

  FOR v_item, v_item_number IN
    SELECT item_record.value, item_record.position::integer
    FROM pg_catalog.jsonb_array_elements(p_content -> 'unscheduled')
      WITH ORDINALITY AS item_record(value, position)
    ORDER BY item_record.position
  LOOP
    v_total_items := v_total_items + 1;
    IF v_total_items > 10000
      OR NOT co_production_private.project_production_schedule_item_is_valid(
        v_item,
        v_item_number
      )
      OR (v_item ->> 'id') = ANY(v_seen_item_ids)
      OR (
        v_item ->> 'kind' = 'shot'
        AND (v_item ->> 'sourceShotId') = ANY(v_seen_source_shot_ids)
      )
    THEN
      RETURN false;
    END IF;
    v_seen_item_ids := pg_catalog.array_append(
      v_seen_item_ids,
      v_item ->> 'id'
    );
    IF v_item ->> 'kind' = 'shot' THEN
      v_seen_source_shot_ids := pg_catalog.array_append(
        v_seen_source_shot_ids,
        v_item ->> 'sourceShotId'
      );
    END IF;
  END LOOP;

  RETURN true;
END
$$;

CREATE OR REPLACE FUNCTION
  co_production_private.project_production_schedule_content_is_submittable(
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
  v_day jsonb;
  v_item jsonb;
  v_seen_dates text[] := ARRAY[]::text[];
BEGIN
  IF NOT
      co_production_private.project_production_schedule_content_is_valid(
        p_content
      )
    OR pg_catalog.jsonb_typeof(p_content -> 'timeZone')
      IS DISTINCT FROM 'string'
    OR NOT
      co_production_private.project_production_schedule_time_zone_is_valid(
        p_content ->> 'timeZone'
      )
    OR pg_catalog.jsonb_array_length(p_content -> 'days') < 1
    OR pg_catalog.jsonb_array_length(p_content -> 'unscheduled') <> 0
  THEN
    RETURN false;
  END IF;

  FOR v_day IN
    SELECT day_record.value
    FROM pg_catalog.jsonb_array_elements(p_content -> 'days')
      AS day_record(value)
  LOOP
    IF pg_catalog.jsonb_typeof(v_day -> 'date') IS DISTINCT FROM 'string'
      OR pg_catalog.jsonb_typeof(v_day -> 'unitCallTime')
        IS DISTINCT FROM 'string'
      OR (v_day ->> 'date') = ANY(v_seen_dates)
    THEN
      RETURN false;
    END IF;
    v_seen_dates := pg_catalog.array_append(v_seen_dates, v_day ->> 'date');

    FOR v_item IN
      SELECT item_record.value
      FROM pg_catalog.jsonb_array_elements(v_day -> 'items')
        AS item_record(value)
    LOOP
      IF pg_catalog.jsonb_typeof(v_item -> 'startTime')
          IS DISTINCT FROM 'string'
        OR pg_catalog.jsonb_typeof(v_item -> 'plannedDurationMinutes')
          IS DISTINCT FROM 'number'
      THEN
        RETURN false;
      END IF;
    END LOOP;
  END LOOP;

  RETURN true;
END
$$;

CREATE OR REPLACE FUNCTION
  co_production_private.project_production_schedule_content_matches_shot_plan(
    p_content jsonb,
    p_shot_plan_content jsonb
  )
RETURNS boolean
LANGUAGE plpgsql
STABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
  v_matches boolean;
BEGIN
  IF NOT
      co_production_private.project_production_schedule_content_is_valid(
        p_content
      )
    OR NOT co_production_private.project_shot_plan_content_is_valid(
      p_shot_plan_content
    )
  THEN
    RETURN false;
  END IF;

  WITH source_shots AS (
    SELECT
      scene_record.value ->> 'id' AS scene_id,
      shot_record.value ->> 'id' AS shot_id
    FROM pg_catalog.jsonb_array_elements(p_shot_plan_content -> 'scenes')
      AS scene_record(value)
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
      scene_record.value -> 'shots'
    ) AS shot_record(value)
  ),
  schedule_shots AS (
    SELECT
      item_record.value ->> 'sourceSceneId' AS scene_id,
      item_record.value ->> 'sourceShotId' AS shot_id
    FROM pg_catalog.jsonb_array_elements(p_content -> 'days')
      AS day_record(value)
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
      day_record.value -> 'items'
    ) AS item_record(value)
    WHERE item_record.value ->> 'kind' = 'shot'
    UNION ALL
    SELECT
      item_record.value ->> 'sourceSceneId' AS scene_id,
      item_record.value ->> 'sourceShotId' AS shot_id
    FROM pg_catalog.jsonb_array_elements(p_content -> 'unscheduled')
      AS item_record(value)
    WHERE item_record.value ->> 'kind' = 'shot'
  )
  SELECT
    (SELECT pg_catalog.count(*) FROM source_shots)
      = (SELECT pg_catalog.count(*) FROM schedule_shots)
    AND NOT EXISTS (
      (SELECT source_shots.scene_id, source_shots.shot_id FROM source_shots)
      EXCEPT
      (SELECT schedule_shots.scene_id, schedule_shots.shot_id
       FROM schedule_shots)
    )
    AND NOT EXISTS (
      (SELECT schedule_shots.scene_id, schedule_shots.shot_id
       FROM schedule_shots)
      EXCEPT
      (SELECT source_shots.scene_id, source_shots.shot_id FROM source_shots)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM schedule_shots
      GROUP BY schedule_shots.scene_id, schedule_shots.shot_id
      HAVING pg_catalog.count(*) <> 1
    )
  INTO v_matches;

  RETURN v_matches;
END
$$;

CREATE OR REPLACE FUNCTION
  co_production_private.derive_project_production_schedule_content(
    p_shot_plan_content jsonb
  )
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
  v_scene jsonb;
  v_shot jsonb;
  v_order integer := 0;
  v_unscheduled jsonb := '[]'::jsonb;
BEGIN
  FOR v_scene IN
    SELECT scene_record.value
    FROM pg_catalog.jsonb_array_elements(p_shot_plan_content -> 'scenes')
      WITH ORDINALITY AS scene_record(value, position)
    ORDER BY scene_record.position
  LOOP
    FOR v_shot IN
      SELECT shot_record.value
      FROM pg_catalog.jsonb_array_elements(v_scene -> 'shots')
        WITH ORDINALITY AS shot_record(value, position)
      ORDER BY shot_record.position
    LOOP
      v_order := v_order + 1;
      v_unscheduled := v_unscheduled || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'id', v_shot ->> 'id',
          'order', v_order,
          'kind', 'shot',
          'sourceSceneId', v_scene ->> 'id',
          'sourceShotId', v_shot ->> 'id',
          'label', NULL,
          'notes', NULL,
          'startTime', NULL,
          'plannedDurationMinutes', NULL
        )
      );
    END LOOP;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 'cco.production-schedule.v1',
    'title', (p_shot_plan_content ->> 'title') || ' production schedule',
    'timeZone', NULL,
    'days', '[]'::jsonb,
    'unscheduled', v_unscheduled
  );
END
$$;

CREATE OR REPLACE FUNCTION
  co_production_private.current_project_production_schedule_source(
    p_project_id uuid
  )
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH current_shot_plan_source AS (
    SELECT co_production_private.current_project_shot_plan_source(
      p_project_id
    ) AS source
  ),
  active_shot_plan AS (
    SELECT
      revision.*,
      binding.id AS approval_binding_id
    FROM current_shot_plan_source AS current_source
    JOIN co_production.project_shot_plan_approval_bindings AS binding
      ON current_source.source IS NOT NULL
      AND binding.project_id = p_project_id
      AND binding.source_project_script_revision_id =
        (current_source.source ->> 'scriptRevisionId')::uuid
      AND binding.source_project_script_content_hash =
        current_source.source ->> 'scriptContentHash'
      AND binding.source_production_plan_revision_id =
        (current_source.source ->> 'productionPlanRevisionId')::uuid
      AND binding.source_production_plan_content_hash =
        current_source.source ->> 'productionPlanContentHash'
      AND binding.source_production_plan_script_binding_id =
        (current_source.source ->> 'productionPlanScriptBindingId')::uuid
    JOIN co_production.project_shot_plan_revisions AS revision
      ON revision.id = binding.shot_plan_revision_id
      AND revision.project_id = binding.project_id
      AND revision.content_hash = binding.shot_plan_content_hash
    ORDER BY revision.revision_number DESC
    LIMIT 1
  )
  SELECT pg_catalog.jsonb_build_object(
    'shotPlanRevisionId', source.id,
    'shotPlanRevisionNumber', source.revision_number,
    'shotPlanContentHash', source.content_hash,
    'shotPlanContent', source.content,
    'shotPlanApprovalBindingId', source.approval_binding_id,
    'teamId', source.team_id
  )
  FROM active_shot_plan AS source
$$;

CREATE TABLE co_production.project_production_schedule_revisions (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  project_id uuid NOT NULL,
  team_id uuid,
  revision_number bigint NOT NULL CHECK (
    revision_number BETWEEN 1 AND 2147483647
  ),
  base_revision_id uuid,
  revision_kind text NOT NULL CHECK (
    revision_kind IN ('generated', 'authored')
  ),
  derivation_version text NOT NULL CHECK (
    derivation_version = 'cco.production-schedule.v1'
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
    co_production_private.project_production_schedule_content_is_valid(content)
  ),
  content_hash text NOT NULL CHECK (
    content_hash ~ '^sha256:[0-9a-f]{64}$'
    AND content_hash = co_production_private.preproject_sha256(content::text)
  ),
  source_shot_plan_revision_id uuid NOT NULL,
  source_shot_plan_content_hash text NOT NULL CHECK (
    source_shot_plan_content_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  source_shot_plan_approval_binding_id uuid NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL,
  CONSTRAINT project_production_schedule_revisions_project_revision_key
    UNIQUE (project_id, revision_number),
  CONSTRAINT project_production_schedule_revisions_id_project_key
    UNIQUE (id, project_id),
  CONSTRAINT project_production_schedule_revisions_id_project_content_hash_key
    UNIQUE (id, project_id, content_hash),
  CONSTRAINT project_production_schedule_revisions_exact_source_key
    UNIQUE (
      id,
      project_id,
      content_hash,
      source_shot_plan_revision_id,
      source_shot_plan_content_hash,
      source_shot_plan_approval_binding_id
    ),
  CONSTRAINT project_production_schedule_revisions_authority_fk
    FOREIGN KEY (project_id)
    REFERENCES co_production.project_preproduction_authorities(project_id)
    ON DELETE RESTRICT,
  CONSTRAINT project_production_schedule_revisions_project_team_fk
    FOREIGN KEY (project_id, team_id)
    REFERENCES co_production.projects(id, team_id)
    ON DELETE RESTRICT,
  CONSTRAINT project_production_schedule_revisions_lineage_shape CHECK (
    (
      revision_number = 1
      AND base_revision_id IS NULL
      AND revision_kind = 'generated'
    )
    OR (revision_number > 1 AND base_revision_id IS NOT NULL)
  ),
  CONSTRAINT project_production_schedule_revisions_base_fk
    FOREIGN KEY (base_revision_id, project_id)
    REFERENCES co_production.project_production_schedule_revisions(
      id,
      project_id
    )
    ON DELETE RESTRICT,
  CONSTRAINT project_production_schedule_revisions_shot_plan_fk
    FOREIGN KEY (
      source_shot_plan_revision_id,
      project_id,
      source_shot_plan_content_hash
    )
    REFERENCES co_production.project_shot_plan_revisions(
      id,
      project_id,
      content_hash
    )
    ON DELETE RESTRICT,
  CONSTRAINT project_production_schedule_revisions_shot_plan_approval_fk
    FOREIGN KEY (
      source_shot_plan_approval_binding_id,
      project_id,
      source_shot_plan_revision_id,
      source_shot_plan_content_hash
    )
    REFERENCES co_production.project_shot_plan_approval_bindings(
      id,
      project_id,
      shot_plan_revision_id,
      shot_plan_content_hash
    )
    ON DELETE RESTRICT
);

COMMENT ON TABLE co_production.project_production_schedule_revisions IS
  'Immutable Governed Production Schedule v1 revisions bound to the exact active approved shot plan; adjacent production authorities remain separate.';

ALTER TABLE co_production.project_preproduction_mutation_receipts
  ADD COLUMN production_schedule_revision_id uuid,
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
      'project_production_schedule.changes_requested'
    )
  ),
  ADD CONSTRAINT project_preproduction_receipts_production_schedule_fk
    FOREIGN KEY (production_schedule_revision_id, project_id)
    REFERENCES co_production.project_production_schedule_revisions(
      id,
      project_id
    )
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
    )
    OR (
      mutation_kind = 'production_task.mutated'
      AND plan_revision_id IS NULL
      AND task_id IS NOT NULL
      AND script_revision_id IS NULL
      AND plan_draft_id IS NULL
      AND shot_plan_revision_id IS NULL
      AND production_schedule_revision_id IS NULL
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
    )
    OR (
      mutation_kind = 'production_plan_draft.generated'
      AND plan_revision_id IS NULL
      AND task_id IS NULL
      AND script_revision_id IS NULL
      AND plan_draft_id IS NOT NULL
      AND shot_plan_revision_id IS NULL
      AND production_schedule_revision_id IS NULL
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
    )
  ),
  ADD CONSTRAINT project_preproduction_receipts_exact_production_schedule_key
    UNIQUE (id, project_id, production_schedule_revision_id);

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
      'project_production_schedule.changes_requested'
    )
  ),
  ADD CONSTRAINT project_preproduction_events_entity_kind_check CHECK (
    entity_kind IN (
      'production_plan_revision',
      'production_task',
      'project_script_revision',
      'production_plan_script_draft',
      'project_shot_plan_revision',
      'project_production_schedule_revision'
    )
  );

CREATE TABLE co_production.project_production_schedule_approval_bindings (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  project_id uuid NOT NULL,
  team_id uuid,
  production_schedule_revision_id uuid NOT NULL,
  production_schedule_content_hash text NOT NULL CHECK (
    production_schedule_content_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  source_shot_plan_revision_id uuid NOT NULL,
  source_shot_plan_content_hash text NOT NULL CHECK (
    source_shot_plan_content_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  source_shot_plan_approval_binding_id uuid NOT NULL,
  decision_receipt_id uuid NOT NULL,
  approved_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_at timestamptz NOT NULL,
  CONSTRAINT project_production_schedule_approval_bindings_revision_key
    UNIQUE (production_schedule_revision_id),
  CONSTRAINT project_production_schedule_approval_bindings_receipt_key
    UNIQUE (decision_receipt_id),
  CONSTRAINT project_production_schedule_approval_bindings_revision_fk
    FOREIGN KEY (
      production_schedule_revision_id,
      project_id,
      production_schedule_content_hash,
      source_shot_plan_revision_id,
      source_shot_plan_content_hash,
      source_shot_plan_approval_binding_id
    )
    REFERENCES co_production.project_production_schedule_revisions(
      id,
      project_id,
      content_hash,
      source_shot_plan_revision_id,
      source_shot_plan_content_hash,
      source_shot_plan_approval_binding_id
    )
    ON DELETE RESTRICT,
  CONSTRAINT project_production_schedule_approval_bindings_receipt_fk
    FOREIGN KEY (
      decision_receipt_id,
      project_id,
      production_schedule_revision_id
    )
    REFERENCES co_production.project_preproduction_mutation_receipts(
      id,
      project_id,
      production_schedule_revision_id
    )
    ON DELETE RESTRICT
);

COMMENT ON TABLE co_production.project_production_schedule_approval_bindings IS
  'Durable exact approval evidence joining a production-schedule revision to its active approved shot-plan revision, content hash, approval binding, and decision receipt.';

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
  co_production_private.guard_project_production_schedule_revision_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_authority_team_id uuid;
  v_source jsonb;
  v_latest co_production.project_production_schedule_revisions%ROWTYPE;
  v_base co_production.project_production_schedule_revisions%ROWTYPE;
  v_shot_plan co_production.project_shot_plan_revisions%ROWTYPE;
  v_shot_plan_binding
    co_production.project_shot_plan_approval_bindings%ROWTYPE;
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
      MESSAGE = 'project_production_schedule_authority_mismatch';
  END IF;

  v_source :=
    co_production_private.current_project_production_schedule_source(
      NEW.project_id
    );
  IF v_source IS NULL
    OR NEW.team_id IS DISTINCT FROM (v_source ->> 'teamId')::uuid
    OR NEW.source_shot_plan_revision_id IS DISTINCT FROM
      (v_source ->> 'shotPlanRevisionId')::uuid
    OR NEW.source_shot_plan_content_hash IS DISTINCT FROM
      v_source ->> 'shotPlanContentHash'
    OR NEW.source_shot_plan_approval_binding_id IS DISTINCT FROM
      (v_source ->> 'shotPlanApprovalBindingId')::uuid
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_production_schedule_stale_source';
  END IF;

  SELECT revision.*
  INTO v_latest
  FROM co_production.project_production_schedule_revisions AS revision
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
        MESSAGE = 'project_production_schedule_lineage_mismatch';
    END IF;
  ELSIF NEW.revision_number IS DISTINCT FROM 1
    OR NEW.base_revision_id IS NOT NULL
    OR NEW.revision_kind IS DISTINCT FROM 'generated'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'project_production_schedule_lineage_mismatch';
  END IF;

  SELECT revision.*
  INTO v_shot_plan
  FROM co_production.project_shot_plan_revisions AS revision
  WHERE revision.id = NEW.source_shot_plan_revision_id
    AND revision.project_id = NEW.project_id
    AND revision.team_id IS NOT DISTINCT FROM NEW.team_id
    AND revision.content_hash = NEW.source_shot_plan_content_hash;

  SELECT binding.*
  INTO v_shot_plan_binding
  FROM co_production.project_shot_plan_approval_bindings AS binding
  WHERE binding.id = NEW.source_shot_plan_approval_binding_id
    AND binding.project_id = NEW.project_id
    AND binding.team_id IS NOT DISTINCT FROM NEW.team_id
    AND binding.shot_plan_revision_id = NEW.source_shot_plan_revision_id
    AND binding.shot_plan_content_hash = NEW.source_shot_plan_content_hash;

  IF v_shot_plan.id IS NULL OR v_shot_plan_binding.id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'project_production_schedule_shot_plan_mismatch';
  END IF;

  IF NEW.revision_kind = 'generated' THEN
    IF NEW.change_summary IS NOT NULL
      OR NEW.content IS DISTINCT FROM
        co_production_private.derive_project_production_schedule_content(
          v_shot_plan.content
        )
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'project_production_schedule_derivation_mismatch';
    END IF;
  ELSE
    SELECT base.*
    INTO v_base
    FROM co_production.project_production_schedule_revisions AS base
    WHERE base.id = NEW.base_revision_id
      AND base.project_id = NEW.project_id;

    IF NOT FOUND
      OR ROW(
        NEW.source_shot_plan_revision_id,
        NEW.source_shot_plan_content_hash,
        NEW.source_shot_plan_approval_binding_id
      ) IS DISTINCT FROM ROW(
        v_base.source_shot_plan_revision_id,
        v_base.source_shot_plan_content_hash,
        v_base.source_shot_plan_approval_binding_id
      )
      OR NOT co_production_private.project_production_schedule_content_matches_shot_plan(
          NEW.content,
          v_shot_plan.content
        )
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'project_production_schedule_authored_content_mismatch';
    END IF;
  END IF;

  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION
  co_production_private.guard_project_production_schedule_approval_binding_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_revision co_production.project_production_schedule_revisions%ROWTYPE;
  v_receipt co_production.project_preproduction_mutation_receipts%ROWTYPE;
BEGIN
  SELECT revision.*
  INTO v_revision
  FROM co_production.project_production_schedule_revisions AS revision
  WHERE revision.id = NEW.production_schedule_revision_id
    AND revision.project_id = NEW.project_id;

  SELECT receipt.*
  INTO v_receipt
  FROM co_production.project_preproduction_mutation_receipts AS receipt
  WHERE receipt.id = NEW.decision_receipt_id
    AND receipt.project_id = NEW.project_id
    AND receipt.production_schedule_revision_id =
      NEW.production_schedule_revision_id;

  IF v_revision.id IS NULL
    OR v_receipt.id IS NULL
    OR v_receipt.mutation_kind IS DISTINCT FROM
      'project_production_schedule.approved'
    OR NEW.team_id IS DISTINCT FROM v_revision.team_id
    OR NEW.production_schedule_content_hash IS DISTINCT FROM
      v_revision.content_hash
    OR NEW.source_shot_plan_revision_id IS DISTINCT FROM
      v_revision.source_shot_plan_revision_id
    OR NEW.source_shot_plan_content_hash IS DISTINCT FROM
      v_revision.source_shot_plan_content_hash
    OR NEW.source_shot_plan_approval_binding_id IS DISTINCT FROM
      v_revision.source_shot_plan_approval_binding_id
    OR NEW.approved_by IS DISTINCT FROM v_receipt.actor_id
    OR NEW.approved_at IS DISTINCT FROM v_receipt.created_at
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'project_production_schedule_approval_binding_mismatch';
  END IF;

  RETURN NEW;
END
$$;

ALTER TABLE co_production.project_production_schedule_revisions
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.project_production_schedule_revisions
  FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.project_production_schedule_approval_bindings
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.project_production_schedule_approval_bindings
  FORCE ROW LEVEL SECURITY;

CREATE POLICY project_production_schedule_revisions_staff_select
  ON co_production.project_production_schedule_revisions
  FOR SELECT TO authenticated
  USING (
    co_production_private.project_preproduction_role(project_id) IN (
      'owner', 'admin', 'producer', 'editor'
    )
  );

CREATE POLICY project_production_schedule_approval_bindings_staff_select
  ON co_production.project_production_schedule_approval_bindings
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
      AND co_production_private.project_preproduction_role(project_id)
        IS NOT NULL
    )
    OR (
      shot_plan_revision_id IS NULL
      AND production_schedule_revision_id IS NULL
      AND co_production_private.project_preproduction_role(project_id) IN (
        'owner', 'admin', 'producer', 'editor', 'member'
      )
    )
    OR (
      (
        shot_plan_revision_id IS NOT NULL
        OR production_schedule_revision_id IS NOT NULL
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
        'project_production_schedule_revision'
      )
      AND co_production_private.project_preproduction_role(project_id)
        IS NOT NULL
    )
    OR (
      entity_kind NOT IN (
        'project_shot_plan_revision',
        'project_production_schedule_revision'
      )
      AND co_production_private.project_preproduction_role(project_id) IN (
        'owner', 'admin', 'producer', 'editor', 'member'
      )
    )
    OR (
      entity_kind IN (
        'project_shot_plan_revision',
        'project_production_schedule_revision'
      )
      AND co_production_private.project_preproduction_role(project_id) IN (
        'owner', 'admin', 'producer', 'editor'
      )
    )
  );

CREATE TRIGGER project_production_schedule_revisions_lineage_guard
BEFORE INSERT ON co_production.project_production_schedule_revisions
FOR EACH ROW
EXECUTE FUNCTION
  co_production_private.guard_project_production_schedule_revision_insert();

CREATE TRIGGER project_production_schedule_revisions_immutable
BEFORE UPDATE OR DELETE ON co_production.project_production_schedule_revisions
FOR EACH ROW
EXECUTE FUNCTION
  co_production_private.prevent_project_preproduction_immutable_mutation();

CREATE TRIGGER project_production_schedule_revisions_no_truncate
BEFORE TRUNCATE ON co_production.project_production_schedule_revisions
FOR EACH STATEMENT
EXECUTE FUNCTION
  co_production_private.prevent_project_preproduction_immutable_mutation();

CREATE TRIGGER project_production_schedule_approval_bindings_guard
BEFORE INSERT ON co_production.project_production_schedule_approval_bindings
FOR EACH ROW
EXECUTE FUNCTION
  co_production_private.guard_project_production_schedule_approval_binding_insert();

CREATE TRIGGER project_production_schedule_approval_bindings_immutable
BEFORE UPDATE OR DELETE ON co_production.project_production_schedule_approval_bindings
FOR EACH ROW
EXECUTE FUNCTION
  co_production_private.prevent_project_preproduction_immutable_mutation();

CREATE TRIGGER project_production_schedule_approval_bindings_no_truncate
BEFORE TRUNCATE ON co_production.project_production_schedule_approval_bindings
FOR EACH STATEMENT
EXECUTE FUNCTION
  co_production_private.prevent_project_preproduction_immutable_mutation();

CREATE OR REPLACE FUNCTION co_production.get_project_production_schedule(
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
  v_source jsonb;
  v_head co_production.project_production_schedule_revisions%ROWTYPE;
  v_active_revision_id uuid;
  v_revisions jsonb := '[]'::jsonb;
  v_head_json jsonb := 'null'::jsonb;
  v_head_state text;
  v_head_is_stale boolean := true;
  v_has_generated_source boolean := false;
BEGIN
  IF p_project_id IS NULL OR v_actor_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'project_production_schedule_forbidden';
  END IF;

  v_role := co_production_private.project_preproduction_role(p_project_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'project_production_schedule_not_found';
  END IF;
  IF v_role NOT IN ('owner', 'admin', 'producer', 'editor') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'project_production_schedule_forbidden';
  END IF;

  SELECT authority.authority_version, authority.event_head_hash
  INTO v_authority_version, v_event_head_hash
  FROM co_production.project_preproduction_authorities AS authority
  WHERE authority.project_id = p_project_id;

  IF NOT FOUND THEN
    v_authority_version := 0;
    v_event_head_hash := 'sha256:' || pg_catalog.repeat('0', 64);
  END IF;

  v_source :=
    co_production_private.current_project_production_schedule_source(
      p_project_id
    );

  IF v_source IS NOT NULL THEN
    SELECT revision.id
    INTO v_active_revision_id
    FROM co_production.project_production_schedule_approval_bindings AS binding
    JOIN co_production.project_production_schedule_revisions AS revision
      ON revision.id = binding.production_schedule_revision_id
      AND revision.project_id = binding.project_id
    WHERE binding.project_id = p_project_id
      AND binding.source_shot_plan_revision_id =
        (v_source ->> 'shotPlanRevisionId')::uuid
      AND binding.source_shot_plan_content_hash =
        v_source ->> 'shotPlanContentHash'
      AND binding.source_shot_plan_approval_binding_id =
        (v_source ->> 'shotPlanApprovalBindingId')::uuid
    ORDER BY revision.revision_number DESC
    LIMIT 1;

    SELECT EXISTS (
      SELECT 1
      FROM co_production.project_production_schedule_revisions AS revision
      WHERE revision.project_id = p_project_id
        AND revision.revision_kind = 'generated'
        AND revision.source_shot_plan_revision_id =
          (v_source ->> 'shotPlanRevisionId')::uuid
        AND revision.source_shot_plan_content_hash =
          v_source ->> 'shotPlanContentHash'
        AND revision.source_shot_plan_approval_binding_id =
          (v_source ->> 'shotPlanApprovalBindingId')::uuid
    )
    INTO v_has_generated_source;
  END IF;

  SELECT revision.*
  INTO v_head
  FROM co_production.project_production_schedule_revisions AS revision
  WHERE revision.project_id = p_project_id
  ORDER BY revision.revision_number DESC
  LIMIT 1;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', revision.id,
        'projectId', revision.project_id,
        'revisionNumber', revision.revision_number,
        'baseRevisionId', revision.base_revision_id,
        'revisionKind', revision.revision_kind,
        'derivationVersion', revision.derivation_version,
        'title', revision.content ->> 'title',
        'changeSummary', revision.change_summary,
        'contentHash', revision.content_hash,
        'source', pg_catalog.jsonb_build_object(
          'shotPlanRevisionId', revision.source_shot_plan_revision_id,
          'shotPlanRevisionNumber', shot_plan.revision_number,
          'shotPlanContentHash', revision.source_shot_plan_content_hash,
          'shotPlanApprovalBindingId',
            revision.source_shot_plan_approval_binding_id
        ),
        'workflow', pg_catalog.jsonb_build_object(
          'state', CASE latest_workflow.mutation_kind
            WHEN 'project_production_schedule.submitted' THEN 'submitted'
            WHEN 'project_production_schedule.approved' THEN 'approved'
            WHEN 'project_production_schedule.changes_requested' THEN
              'changes_requested'
            ELSE 'draft'
          END,
          'isStale', v_source IS NULL OR ROW(
            revision.source_shot_plan_revision_id,
            revision.source_shot_plan_content_hash,
            revision.source_shot_plan_approval_binding_id
          ) IS DISTINCT FROM ROW(
            (v_source ->> 'shotPlanRevisionId')::uuid,
            v_source ->> 'shotPlanContentHash',
            (v_source ->> 'shotPlanApprovalBindingId')::uuid
          ),
          'isActive', revision.id IS NOT DISTINCT FROM v_active_revision_id,
          'submittedBy', submission.actor_id,
          'submittedAt', submission.created_at,
          'submissionNote', submission.payload -> 'note',
          'decision', CASE decision.mutation_kind
            WHEN 'project_production_schedule.approved' THEN 'approved'
            WHEN 'project_production_schedule.changes_requested' THEN
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
  FROM co_production.project_production_schedule_revisions AS revision
  JOIN co_production.project_shot_plan_revisions AS shot_plan
    ON shot_plan.id = revision.source_shot_plan_revision_id
    AND shot_plan.project_id = revision.project_id
    AND shot_plan.content_hash = revision.source_shot_plan_content_hash
  LEFT JOIN LATERAL (
    SELECT receipt.mutation_kind
    FROM co_production.project_preproduction_mutation_receipts AS receipt
    WHERE receipt.project_id = revision.project_id
      AND receipt.production_schedule_revision_id = revision.id
      AND receipt.mutation_kind IN (
        'project_production_schedule.submitted',
        'project_production_schedule.approved',
        'project_production_schedule.changes_requested'
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
      AND receipt.production_schedule_revision_id = revision.id
      AND receipt.mutation_kind =
        'project_production_schedule.submitted'
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
      AND receipt.production_schedule_revision_id = revision.id
      AND receipt.mutation_kind IN (
        'project_production_schedule.approved',
        'project_production_schedule.changes_requested'
      )
    ORDER BY receipt.authority_version DESC
    LIMIT 1
  ) AS decision ON true
  WHERE revision.project_id = p_project_id;

  IF v_head.id IS NOT NULL THEN
    v_head_json := (v_revisions -> 0)
      || pg_catalog.jsonb_build_object('content', v_head.content);
    v_head_state := v_head_json #>> '{workflow,state}';
    v_head_is_stale := (v_head_json #>> '{workflow,isStale}')::boolean;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'projectId', p_project_id,
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
        AND co_production_private.project_production_schedule_content_is_submittable(
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

CREATE OR REPLACE FUNCTION
  co_production.generate_project_production_schedule_revision(
    p_project_id uuid,
    p_expected_authority_version bigint,
    p_request_id uuid,
    p_expected_shot_plan_revision_id uuid
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
  v_latest co_production.project_production_schedule_revisions%ROWTYPE;
  v_shot_plan co_production.project_shot_plan_revisions%ROWTYPE;
  v_source jsonb;
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
    OR p_expected_shot_plan_revision_id IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_project_production_schedule_generation';
  END IF;

  SELECT project.*
  INTO v_project
  FROM co_production.projects AS project
  WHERE project.id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'project_production_schedule_not_found';
  END IF;

  v_role := co_production_private.project_preproduction_role(p_project_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'project_production_schedule_not_found';
  END IF;
  IF v_role NOT IN ('owner', 'admin', 'producer') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'project_production_schedule_forbidden';
  END IF;

  v_request_payload := pg_catalog.jsonb_build_object(
    'operation', 'generate_project_production_schedule_revision',
    'projectId', p_project_id,
    'expectedAuthorityVersion', p_expected_authority_version,
    'requestId', p_request_id,
    'expectedShotPlanRevisionId', p_expected_shot_plan_revision_id,
    'derivationVersion', 'cco.production-schedule.v1'
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
      MESSAGE = 'project_production_schedule_authority_mismatch';
  END IF;

  SELECT receipt.*
  INTO v_existing
  FROM co_production.project_preproduction_mutation_receipts AS receipt
  WHERE receipt.project_id = p_project_id
    AND receipt.request_id = p_request_id;

  IF FOUND THEN
    IF v_existing.mutation_kind IS DISTINCT FROM
      'project_production_schedule.generated'
      OR v_existing.expected_entity_version IS DISTINCT FROM
        p_expected_authority_version
      OR v_existing.request_payload IS DISTINCT FROM v_request_payload
      OR v_existing.request_hash IS DISTINCT FROM v_request_hash
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'project_production_schedule_idempotency_conflict';
    END IF;
    RETURN v_existing.result
      || pg_catalog.jsonb_build_object('replayed', true);
  END IF;

  IF v_authority.authority_version IS DISTINCT FROM
    p_expected_authority_version
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'project_production_schedule_authority_version_conflict';
  END IF;
  IF v_authority.authority_version >= 2147483647 THEN
    RAISE EXCEPTION USING
      ERRCODE = '54000',
      MESSAGE = 'preproduction_authority_version_exhausted';
  END IF;

  v_source :=
    co_production_private.current_project_production_schedule_source(
      p_project_id
    );
  IF v_source IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_production_schedule_source_unavailable';
  END IF;
  IF (v_source ->> 'shotPlanRevisionId')::uuid IS DISTINCT FROM
    p_expected_shot_plan_revision_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'project_production_schedule_stale_source';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM co_production.project_production_schedule_revisions AS revision
    WHERE revision.project_id = p_project_id
      AND revision.revision_kind = 'generated'
      AND revision.source_shot_plan_revision_id =
        (v_source ->> 'shotPlanRevisionId')::uuid
      AND revision.source_shot_plan_content_hash =
        v_source ->> 'shotPlanContentHash'
      AND revision.source_shot_plan_approval_binding_id =
        (v_source ->> 'shotPlanApprovalBindingId')::uuid
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'project_production_schedule_source_already_generated';
  END IF;

  SELECT revision.*
  INTO v_latest
  FROM co_production.project_production_schedule_revisions AS revision
  WHERE revision.project_id = p_project_id
  ORDER BY revision.revision_number DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF v_latest.revision_number >= 2147483647 THEN
      RAISE EXCEPTION USING
        ERRCODE = '54000',
        MESSAGE = 'project_production_schedule_revision_exhausted';
    END IF;
    v_revision_number := v_latest.revision_number + 1;
    v_base_revision_id := v_latest.id;
  ELSE
    v_revision_number := 1;
    v_base_revision_id := NULL;
  END IF;

  SELECT revision.*
  INTO v_shot_plan
  FROM co_production.project_shot_plan_revisions AS revision
  WHERE revision.id = (v_source ->> 'shotPlanRevisionId')::uuid
    AND revision.project_id = p_project_id
    AND revision.content_hash = v_source ->> 'shotPlanContentHash';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_production_schedule_source_unavailable';
  END IF;

  v_content :=
    co_production_private.derive_project_production_schedule_content(
      v_shot_plan.content
    );
  v_content_hash := co_production_private.preproject_sha256(v_content::text);
  v_new_authority_version := v_authority.authority_version + 1;

  INSERT INTO co_production.project_production_schedule_revisions (
    id,
    project_id,
    team_id,
    revision_number,
    base_revision_id,
    revision_kind,
    derivation_version,
    change_summary,
    content,
    content_hash,
    source_shot_plan_revision_id,
    source_shot_plan_content_hash,
    source_shot_plan_approval_binding_id,
    created_by,
    created_at
  )
  VALUES (
    v_revision_id,
    p_project_id,
    v_project.team_id,
    v_revision_number,
    v_base_revision_id,
    'generated',
    'cco.production-schedule.v1',
    NULL,
    v_content,
    v_content_hash,
    (v_source ->> 'shotPlanRevisionId')::uuid,
    v_source ->> 'shotPlanContentHash',
    (v_source ->> 'shotPlanApprovalBindingId')::uuid,
    v_actor_id,
    v_now
  );

  v_result := pg_catalog.jsonb_build_object(
    'productionScheduleRevisionId', v_revision_id,
    'projectId', p_project_id,
    'revisionNumber', v_revision_number,
    'baseRevisionId', v_base_revision_id,
    'workflowState', 'draft',
    'source', v_source - 'teamId' - 'shotPlanContent',
    'authorityVersion', v_new_authority_version,
    'requestId', p_request_id,
    'replayed', false
  );

  v_receipt_hash := co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'id', v_receipt_id,
      'projectId', p_project_id,
      'teamId', v_project.team_id,
      'mutationKind', 'project_production_schedule.generated',
      'planRevisionId', NULL,
      'taskId', NULL,
      'scriptRevisionId', NULL,
      'planDraftId', NULL,
      'shotPlanRevisionId', NULL,
      'productionScheduleRevisionId', v_revision_id,
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
    'productionScheduleRevisionId', v_revision_id,
    'revisionNumber', v_revision_number,
    'baseRevisionId', v_base_revision_id,
    'revisionKind', 'generated',
    'derivationVersion', 'cco.production-schedule.v1',
    'contentHash', v_content_hash,
    'source', v_source - 'teamId' - 'shotPlanContent'
  );
  v_event_hash := co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'id', v_event_id,
      'projectId', p_project_id,
      'teamId', v_project.team_id,
      'receiptId', v_receipt_id,
      'authorityVersion', v_new_authority_version,
      'eventType', 'project_production_schedule.generated',
      'entityKind', 'project_production_schedule_revision',
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
    'project_production_schedule.generated',
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
    'project_production_schedule.generated',
    'project_production_schedule_revision',
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
      MESSAGE = 'project_production_schedule_authority_version_conflict';
  END IF;

  RETURN v_result;
END
$$;

CREATE OR REPLACE FUNCTION co_production.append_project_production_schedule_revision(
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
  v_base co_production.project_production_schedule_revisions%ROWTYPE;
  v_shot_plan co_production.project_shot_plan_revisions%ROWTYPE;
  v_source jsonb;
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
    OR NOT co_production_private.project_production_schedule_content_is_valid(p_content)
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
      MESSAGE = 'invalid_project_production_schedule_revision';
  END IF;

  SELECT project.*
  INTO v_project
  FROM co_production.projects AS project
  WHERE project.id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'project_production_schedule_not_found';
  END IF;

  v_role := co_production_private.project_preproduction_role(p_project_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'project_production_schedule_not_found';
  END IF;
  IF v_role NOT IN ('owner', 'admin', 'producer', 'editor') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'project_production_schedule_forbidden';
  END IF;

  v_request_payload := pg_catalog.jsonb_build_object(
    'operation', 'append_project_production_schedule_revision',
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
      MESSAGE = 'project_production_schedule_authority_mismatch';
  END IF;

  SELECT receipt.*
  INTO v_existing
  FROM co_production.project_preproduction_mutation_receipts AS receipt
  WHERE receipt.project_id = p_project_id
    AND receipt.request_id = p_request_id;

  IF FOUND THEN
    IF v_existing.mutation_kind IS DISTINCT FROM
      'project_production_schedule.revised'
      OR v_existing.expected_entity_version IS DISTINCT FROM
        p_expected_authority_version
      OR v_existing.request_payload IS DISTINCT FROM v_request_payload
      OR v_existing.request_hash IS DISTINCT FROM v_request_hash
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'project_production_schedule_idempotency_conflict';
    END IF;
    RETURN v_existing.result
      || pg_catalog.jsonb_build_object('replayed', true);
  END IF;

  IF v_authority.authority_version IS DISTINCT FROM
    p_expected_authority_version
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'project_production_schedule_authority_version_conflict';
  END IF;
  IF v_authority.authority_version >= 2147483647 THEN
    RAISE EXCEPTION USING
      ERRCODE = '54000',
      MESSAGE = 'preproduction_authority_version_exhausted';
  END IF;

  SELECT revision.*
  INTO v_base
  FROM co_production.project_production_schedule_revisions AS revision
  WHERE revision.project_id = p_project_id
  ORDER BY revision.revision_number DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND OR v_base.id IS DISTINCT FROM p_base_revision_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'project_production_schedule_base_revision_conflict';
  END IF;
  IF v_base.revision_number >= 2147483647 THEN
    RAISE EXCEPTION USING
      ERRCODE = '54000',
      MESSAGE = 'project_production_schedule_revision_exhausted';
  END IF;

  v_source := co_production_private.current_project_production_schedule_source(
    p_project_id
  );
  IF v_source IS NULL OR ROW(
    v_base.source_shot_plan_revision_id,
    v_base.source_shot_plan_content_hash,
    v_base.source_shot_plan_approval_binding_id
  ) IS DISTINCT FROM ROW(
    (v_source ->> 'shotPlanRevisionId')::uuid,
    v_source ->> 'shotPlanContentHash',
    (v_source ->> 'shotPlanApprovalBindingId')::uuid
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_production_schedule_stale_source';
  END IF;

  SELECT receipt.mutation_kind
  INTO v_current_state
  FROM co_production.project_preproduction_mutation_receipts AS receipt
  WHERE receipt.project_id = p_project_id
    AND receipt.production_schedule_revision_id = v_base.id
    AND receipt.mutation_kind IN (
      'project_production_schedule.submitted',
      'project_production_schedule.approved',
      'project_production_schedule.changes_requested'
    )
  ORDER BY receipt.authority_version DESC
  LIMIT 1;

  IF FOUND AND v_current_state = 'project_production_schedule.submitted' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_production_schedule_invalid_transition';
  END IF;

  SELECT shot_plan.*
  INTO v_shot_plan
  FROM co_production.project_shot_plan_revisions AS shot_plan
  WHERE shot_plan.id = v_base.source_shot_plan_revision_id
    AND shot_plan.project_id = p_project_id
    AND shot_plan.content_hash = v_base.source_shot_plan_content_hash;

  IF NOT FOUND
    OR NOT co_production_private.project_production_schedule_content_matches_shot_plan(
        p_content,
        v_shot_plan.content
      )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'project_production_schedule_authored_content_mismatch';
  END IF;

  v_revision_number := v_base.revision_number + 1;
  v_new_authority_version := v_authority.authority_version + 1;

  INSERT INTO co_production.project_production_schedule_revisions (
    id,
    project_id,
    team_id,
    revision_number,
    base_revision_id,
    revision_kind,
    derivation_version,
    change_summary,
    content,
    content_hash,
    source_shot_plan_revision_id,
    source_shot_plan_content_hash,
    source_shot_plan_approval_binding_id,
    created_by,
    created_at
  )
  VALUES (
    v_revision_id,
    p_project_id,
    v_project.team_id,
    v_revision_number,
    v_base.id,
    'authored',
    'cco.production-schedule.v1',
    p_change_summary,
    p_content,
    v_content_hash,
    v_base.source_shot_plan_revision_id,
    v_base.source_shot_plan_content_hash,
    v_base.source_shot_plan_approval_binding_id,
    v_actor_id,
    v_now
  );

  v_result := pg_catalog.jsonb_build_object(
    'productionScheduleRevisionId', v_revision_id,
    'projectId', p_project_id,
    'revisionNumber', v_revision_number,
    'baseRevisionId', v_base.id,
    'workflowState', 'draft',
    'source', v_source - 'teamId' - 'shotPlanContent',
    'authorityVersion', v_new_authority_version,
    'requestId', p_request_id,
    'replayed', false
  );

  v_receipt_hash := co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'id', v_receipt_id,
      'projectId', p_project_id,
      'teamId', v_project.team_id,
      'mutationKind', 'project_production_schedule.revised',
      'planRevisionId', NULL,
      'taskId', NULL,
      'scriptRevisionId', NULL,
      'planDraftId', NULL,
      'shotPlanRevisionId', NULL,
      'productionScheduleRevisionId', v_revision_id,
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
    'productionScheduleRevisionId', v_revision_id,
    'revisionNumber', v_revision_number,
    'baseRevisionId', v_base.id,
    'revisionKind', 'authored',
    'derivationVersion', 'cco.production-schedule.v1',
    'changeSummary', p_change_summary,
    'contentHash', v_content_hash,
    'source', v_source - 'teamId' - 'shotPlanContent'
  );
  v_event_hash := co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'id', v_event_id,
      'projectId', p_project_id,
      'teamId', v_project.team_id,
      'receiptId', v_receipt_id,
      'authorityVersion', v_new_authority_version,
      'eventType', 'project_production_schedule.revised',
      'entityKind', 'project_production_schedule_revision',
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
    'project_production_schedule.revised',
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
    'project_production_schedule.revised',
    'project_production_schedule_revision',
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
      MESSAGE = 'project_production_schedule_authority_version_conflict';
  END IF;

  RETURN v_result;
END
$$;

CREATE OR REPLACE FUNCTION co_production.submit_project_production_schedule_revision(
  p_project_id uuid,
  p_production_schedule_revision_id uuid,
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
  v_revision co_production.project_production_schedule_revisions%ROWTYPE;
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
    OR p_production_schedule_revision_id IS NULL
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
      MESSAGE = 'invalid_project_production_schedule_submission';
  END IF;

  SELECT project.*
  INTO v_project
  FROM co_production.projects AS project
  WHERE project.id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'project_production_schedule_not_found';
  END IF;

  v_role := co_production_private.project_preproduction_role(p_project_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'project_production_schedule_not_found';
  END IF;
  IF v_role NOT IN ('owner', 'admin', 'producer', 'editor') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'project_production_schedule_forbidden';
  END IF;

  v_request_payload := pg_catalog.jsonb_build_object(
    'operation', 'submit_project_production_schedule_revision',
    'projectId', p_project_id,
    'productionScheduleRevisionId', p_production_schedule_revision_id,
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
      MESSAGE = 'project_production_schedule_authority_mismatch';
  END IF;

  SELECT receipt.*
  INTO v_existing
  FROM co_production.project_preproduction_mutation_receipts AS receipt
  WHERE receipt.project_id = p_project_id
    AND receipt.request_id = p_request_id;

  IF FOUND THEN
    IF v_existing.mutation_kind IS DISTINCT FROM
      'project_production_schedule.submitted'
      OR v_existing.production_schedule_revision_id IS DISTINCT FROM
        p_production_schedule_revision_id
      OR v_existing.expected_entity_version IS DISTINCT FROM
        p_expected_authority_version
      OR v_existing.request_payload IS DISTINCT FROM v_request_payload
      OR v_existing.request_hash IS DISTINCT FROM v_request_hash
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'project_production_schedule_idempotency_conflict';
    END IF;
    RETURN v_existing.result
      || pg_catalog.jsonb_build_object('replayed', true);
  END IF;

  IF v_authority.authority_version IS DISTINCT FROM
    p_expected_authority_version
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'project_production_schedule_authority_version_conflict';
  END IF;
  IF v_authority.authority_version >= 2147483647 THEN
    RAISE EXCEPTION USING
      ERRCODE = '54000',
      MESSAGE = 'preproduction_authority_version_exhausted';
  END IF;

  SELECT revision.*
  INTO v_revision
  FROM co_production.project_production_schedule_revisions AS revision
  WHERE revision.project_id = p_project_id
  ORDER BY revision.revision_number DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND OR v_revision.id IS DISTINCT FROM p_production_schedule_revision_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'project_production_schedule_revision_conflict';
  END IF;

  v_source := co_production_private.current_project_production_schedule_source(
    p_project_id
  );
  IF v_source IS NULL OR ROW(
    v_revision.source_shot_plan_revision_id,
    v_revision.source_shot_plan_content_hash,
    v_revision.source_shot_plan_approval_binding_id
  ) IS DISTINCT FROM ROW(
    (v_source ->> 'shotPlanRevisionId')::uuid,
    v_source ->> 'shotPlanContentHash',
    (v_source ->> 'shotPlanApprovalBindingId')::uuid
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_production_schedule_stale_source';
  END IF;

  IF NOT co_production_private.project_production_schedule_content_is_submittable(
    v_revision.content
  )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'project_production_schedule_not_submittable';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM co_production.project_preproduction_mutation_receipts AS receipt
    WHERE receipt.project_id = p_project_id
      AND receipt.production_schedule_revision_id = p_production_schedule_revision_id
      AND receipt.mutation_kind IN (
        'project_production_schedule.submitted',
        'project_production_schedule.approved',
        'project_production_schedule.changes_requested'
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_production_schedule_invalid_transition';
  END IF;

  v_new_authority_version := v_authority.authority_version + 1;
  v_result := pg_catalog.jsonb_build_object(
    'productionScheduleRevisionId', p_production_schedule_revision_id,
    'projectId', p_project_id,
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
      'mutationKind', 'project_production_schedule.submitted',
      'planRevisionId', NULL,
      'taskId', NULL,
      'scriptRevisionId', NULL,
      'planDraftId', NULL,
      'shotPlanRevisionId', NULL,
      'productionScheduleRevisionId', p_production_schedule_revision_id,
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
    'productionScheduleRevisionId', p_production_schedule_revision_id,
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
      'eventType', 'project_production_schedule.submitted',
      'entityKind', 'project_production_schedule_revision',
      'entityId', p_production_schedule_revision_id,
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
    'project_production_schedule.submitted',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    p_production_schedule_revision_id,
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
    'project_production_schedule.submitted',
    'project_production_schedule_revision',
    p_production_schedule_revision_id,
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
      MESSAGE = 'project_production_schedule_authority_version_conflict';
  END IF;

  RETURN v_result;
END
$$;

CREATE OR REPLACE FUNCTION co_production.decide_project_production_schedule_revision(
  p_project_id uuid,
  p_production_schedule_revision_id uuid,
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
  v_revision co_production.project_production_schedule_revisions%ROWTYPE;
  v_source jsonb;
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
    OR p_production_schedule_revision_id IS NULL
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
      MESSAGE = 'invalid_project_production_schedule_decision';
  END IF;

  SELECT project.*
  INTO v_project
  FROM co_production.projects AS project
  WHERE project.id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'project_production_schedule_not_found';
  END IF;

  v_role := co_production_private.project_preproduction_role(p_project_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'project_production_schedule_not_found';
  END IF;
  IF v_role NOT IN ('owner', 'admin', 'producer') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'project_production_schedule_forbidden';
  END IF;

  v_mutation_kind := 'project_production_schedule.' || p_decision;
  v_request_payload := pg_catalog.jsonb_build_object(
    'operation', 'decide_project_production_schedule_revision',
    'projectId', p_project_id,
    'productionScheduleRevisionId', p_production_schedule_revision_id,
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
      MESSAGE = 'project_production_schedule_authority_mismatch';
  END IF;

  SELECT receipt.*
  INTO v_existing
  FROM co_production.project_preproduction_mutation_receipts AS receipt
  WHERE receipt.project_id = p_project_id
    AND receipt.request_id = p_request_id;

  IF FOUND THEN
    IF v_existing.mutation_kind IS DISTINCT FROM v_mutation_kind
      OR v_existing.production_schedule_revision_id IS DISTINCT FROM
        p_production_schedule_revision_id
      OR v_existing.expected_entity_version IS DISTINCT FROM
        p_expected_authority_version
      OR v_existing.request_payload IS DISTINCT FROM v_request_payload
      OR v_existing.request_hash IS DISTINCT FROM v_request_hash
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'project_production_schedule_idempotency_conflict';
    END IF;
    RETURN v_existing.result
      || pg_catalog.jsonb_build_object('replayed', true);
  END IF;

  IF v_authority.authority_version IS DISTINCT FROM
    p_expected_authority_version
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'project_production_schedule_authority_version_conflict';
  END IF;
  IF v_authority.authority_version >= 2147483647 THEN
    RAISE EXCEPTION USING
      ERRCODE = '54000',
      MESSAGE = 'preproduction_authority_version_exhausted';
  END IF;

  SELECT revision.*
  INTO v_revision
  FROM co_production.project_production_schedule_revisions AS revision
  WHERE revision.project_id = p_project_id
  ORDER BY revision.revision_number DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND OR v_revision.id IS DISTINCT FROM p_production_schedule_revision_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'project_production_schedule_revision_conflict';
  END IF;

  v_source := co_production_private.current_project_production_schedule_source(
    p_project_id
  );
  IF v_source IS NULL OR ROW(
    v_revision.source_shot_plan_revision_id,
    v_revision.source_shot_plan_content_hash,
    v_revision.source_shot_plan_approval_binding_id
  ) IS DISTINCT FROM ROW(
    (v_source ->> 'shotPlanRevisionId')::uuid,
    v_source ->> 'shotPlanContentHash',
    (v_source ->> 'shotPlanApprovalBindingId')::uuid
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_production_schedule_stale_source';
  END IF;

  SELECT receipt.mutation_kind
  INTO v_current_state
  FROM co_production.project_preproduction_mutation_receipts AS receipt
  WHERE receipt.project_id = p_project_id
    AND receipt.production_schedule_revision_id = p_production_schedule_revision_id
    AND receipt.mutation_kind IN (
      'project_production_schedule.submitted',
      'project_production_schedule.approved',
      'project_production_schedule.changes_requested'
    )
  ORDER BY receipt.authority_version DESC
  LIMIT 1;

  IF NOT FOUND
    OR v_current_state IS DISTINCT FROM 'project_production_schedule.submitted'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_production_schedule_invalid_transition';
  END IF;

  v_new_authority_version := v_authority.authority_version + 1;
  v_result := pg_catalog.jsonb_build_object(
    'productionScheduleRevisionId', p_production_schedule_revision_id,
    'projectId', p_project_id,
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
      'productionScheduleRevisionId', p_production_schedule_revision_id,
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
    'productionScheduleRevisionId', p_production_schedule_revision_id,
    'revisionNumber', v_revision.revision_number,
    'decision', p_decision,
    'note', p_note,
    'contentHash', v_revision.content_hash,
    'source', v_source - 'teamId' - 'shotPlanContent'
  );
  v_event_hash := co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'id', v_event_id,
      'projectId', p_project_id,
      'teamId', v_project.team_id,
      'receiptId', v_receipt_id,
      'authorityVersion', v_new_authority_version,
      'eventType', v_mutation_kind,
      'entityKind', 'project_production_schedule_revision',
      'entityId', p_production_schedule_revision_id,
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
    p_production_schedule_revision_id,
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
    'project_production_schedule_revision',
    p_production_schedule_revision_id,
    v_event_payload,
    v_authority.event_head_hash,
    v_event_hash,
    v_actor_id,
    v_now
  );

  IF p_decision = 'approved' THEN
    INSERT INTO co_production.project_production_schedule_approval_bindings (
      project_id,
      team_id,
      production_schedule_revision_id,
      production_schedule_content_hash,
      source_shot_plan_revision_id,
      source_shot_plan_content_hash,
      source_shot_plan_approval_binding_id,
      decision_receipt_id,
      approved_by,
      approved_at
    )
    VALUES (
      p_project_id,
      v_project.team_id,
      v_revision.id,
      v_revision.content_hash,
      v_revision.source_shot_plan_revision_id,
      v_revision.source_shot_plan_content_hash,
      v_revision.source_shot_plan_approval_binding_id,
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
      MESSAGE = 'project_production_schedule_authority_version_conflict';
  END IF;

  RETURN v_result;
END
$$;

REVOKE ALL ON TABLE co_production.project_production_schedule_revisions
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.project_production_schedule_approval_bindings
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.project_preproduction_mutation_receipts
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.project_preproduction_events
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION
  co_production_private.project_production_schedule_date_is_valid(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.project_production_schedule_time_is_valid(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.project_production_schedule_time_zone_is_valid(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.project_production_schedule_item_is_valid(jsonb, integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.project_production_schedule_content_is_valid(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.project_production_schedule_content_is_submittable(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.project_production_schedule_content_matches_shot_plan(jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.derive_project_production_schedule_content(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.current_project_production_schedule_source(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.verify_project_preproduction_receipt_hash()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.guard_project_preproduction_event_insert()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.guard_project_production_schedule_revision_insert()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.guard_project_production_schedule_approval_binding_insert()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION co_production.get_project_production_schedule(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production.generate_project_production_schedule_revision(
    uuid, bigint, uuid, uuid
  )
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production.append_project_production_schedule_revision(
    uuid, bigint, uuid, uuid, text, jsonb
  )
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production.submit_project_production_schedule_revision(
    uuid, uuid, bigint, uuid, text
  )
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production.decide_project_production_schedule_revision(
    uuid, uuid, bigint, uuid, text, text
  )
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION co_production.get_project_production_schedule(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION
  co_production.generate_project_production_schedule_revision(
    uuid, bigint, uuid, uuid
  )
  TO authenticated;
GRANT EXECUTE ON FUNCTION
  co_production.append_project_production_schedule_revision(
    uuid, bigint, uuid, uuid, text, jsonb
  )
  TO authenticated;
GRANT EXECUTE ON FUNCTION
  co_production.submit_project_production_schedule_revision(
    uuid, uuid, bigint, uuid, text
  )
  TO authenticated;
GRANT EXECUTE ON FUNCTION
  co_production.decide_project_production_schedule_revision(
    uuid, uuid, bigint, uuid, text, text
  )
  TO authenticated;

CREATE UNIQUE INDEX project_production_schedule_revisions_generated_source_key
  ON co_production.project_production_schedule_revisions(
    project_id,
    source_shot_plan_revision_id,
    source_shot_plan_content_hash,
    source_shot_plan_approval_binding_id
  )
  WHERE revision_kind = 'generated';

CREATE INDEX project_production_schedule_revisions_project_latest_idx
  ON co_production.project_production_schedule_revisions(
    project_id,
    revision_number DESC
  );

CREATE INDEX project_production_schedule_approval_bindings_project_approved_idx
  ON co_production.project_production_schedule_approval_bindings(
    project_id,
    approved_at DESC
  );

CREATE INDEX project_preproduction_receipts_production_schedule_history_idx
  ON co_production.project_preproduction_mutation_receipts(
    production_schedule_revision_id,
    authority_version DESC
  )
  WHERE production_schedule_revision_id IS NOT NULL;

COMMIT;
