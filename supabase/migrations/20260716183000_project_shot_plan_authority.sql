-- Governed Shot Plan v1 authority for project pre-production.
--
-- Shot plans are immutable revisions bound to the exact latest approved script
-- and the current production-plan revision already bound to that script. This
-- migration is additive and source-only: it does not schedule work, attach
-- assets, mutate production tasks, or apply any external side effect.

BEGIN;

DO $project_shot_plan_preflight$
BEGIN
  IF current_setting('server_version_num')::integer < 150000 THEN
    RAISE EXCEPTION USING
      ERRCODE = '0A000',
      MESSAGE = 'project_shot_plan_requires_postgresql_15';
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
      'co_production.project_script_revisions'
    ) IS NULL
    OR pg_catalog.to_regclass(
      'co_production.production_plan_revisions'
    ) IS NULL
    OR pg_catalog.to_regclass(
      'co_production.production_plan_script_bindings'
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
      'co_production_private.project_script_content_is_valid(jsonb)'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'co_production_private.prevent_project_preproduction_immutable_mutation()'
    ) IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_shot_plan_requires_existing_preproduction_authorities';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_record
    WHERE constraint_record.conrelid =
      'co_production.project_script_revisions'::pg_catalog.regclass
      AND constraint_record.conname =
        'project_script_revisions_id_project_content_hash_key'
      AND constraint_record.contype = 'u'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_shot_plan_requires_exact_script_hash_authority';
  END IF;
END
$project_shot_plan_preflight$;

ALTER TABLE co_production.production_plan_revisions
  ADD CONSTRAINT production_plan_revisions_id_project_content_hash_key
  UNIQUE (id, project_id, content_hash);

ALTER TABLE co_production.production_plan_script_bindings
  ADD CONSTRAINT production_plan_script_bindings_exact_source_key
  UNIQUE (
    id,
    project_id,
    plan_revision_id,
    source_project_script_revision_id,
    source_project_script_content_hash
  );

CREATE OR REPLACE FUNCTION
  co_production_private.project_shot_plan_content_is_valid(
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
  v_scene jsonb;
  v_shot jsonb;
  v_panel jsonb;
  v_block_reference jsonb;
  v_block_id text;
  v_scene_number integer;
  v_shot_number integer;
  v_panel_number integer;
  v_total_shots integer := 0;
  v_total_panels integer := 0;
  v_seen_section_ids text[] := ARRAY[]::text[];
  v_seen_block_ids text[];
BEGIN
  IF pg_catalog.jsonb_typeof(p_content) IS DISTINCT FROM 'object'
    OR pg_catalog.octet_length(p_content::text) > 4194304
    OR NOT co_production_private.preproject_exact_json_keys(
      p_content,
      ARRAY['schemaVersion', 'title', 'scenes']
    )
    OR pg_catalog.jsonb_typeof(p_content -> 'schemaVersion')
      IS DISTINCT FROM 'string'
    OR p_content ->> 'schemaVersion' IS DISTINCT FROM 'cco.shot-plan.v1'
    OR pg_catalog.jsonb_typeof(p_content -> 'title') IS DISTINCT FROM 'string'
    OR NOT co_production_private.preproject_safe_text(
      p_content ->> 'title', 1, 240
    )
    OR p_content ->> 'title'
      IS DISTINCT FROM pg_catalog.btrim(p_content ->> 'title')
    OR p_content ->> 'title' ~ E'\r'
    OR pg_catalog.jsonb_typeof(p_content -> 'scenes') IS DISTINCT FROM 'array'
    OR pg_catalog.jsonb_array_length(p_content -> 'scenes')
      NOT BETWEEN 1 AND 200
  THEN
    RETURN false;
  END IF;

  FOR v_scene, v_scene_number IN
    SELECT scene.value, scene.position::integer
    FROM pg_catalog.jsonb_array_elements(p_content -> 'scenes')
      WITH ORDINALITY AS scene(value, position)
    ORDER BY scene.position
  LOOP
    IF NOT co_production_private.preproject_exact_json_keys(
      v_scene,
      ARRAY[
        'id', 'scriptSectionId', 'order', 'heading', 'objective',
        'estimatedDurationSeconds', 'shots'
      ]
    )
      OR pg_catalog.jsonb_typeof(v_scene -> 'id') IS DISTINCT FROM 'string'
      OR v_scene ->> 'id' IS DISTINCT FROM
        'scene-' || pg_catalog.lpad(v_scene_number::text, 3, '0')
      OR pg_catalog.jsonb_typeof(v_scene -> 'scriptSectionId')
        IS DISTINCT FROM 'string'
      OR NOT co_production_private.preproject_safe_text(
        v_scene ->> 'scriptSectionId', 1, 80
      )
      OR v_scene ->> 'scriptSectionId'
        IS DISTINCT FROM pg_catalog.btrim(v_scene ->> 'scriptSectionId')
      OR v_scene ->> 'scriptSectionId'
        !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$'
      OR pg_catalog.jsonb_typeof(v_scene -> 'order') IS DISTINCT FROM 'number'
      OR v_scene ->> 'order' !~ '^[1-9][0-9]{0,2}$'
      OR (v_scene ->> 'order')::integer IS DISTINCT FROM v_scene_number
      OR pg_catalog.jsonb_typeof(v_scene -> 'heading')
        IS DISTINCT FROM 'string'
      OR NOT co_production_private.preproject_safe_text(
        v_scene ->> 'heading', 1, 240
      )
      OR v_scene ->> 'heading'
        IS DISTINCT FROM pg_catalog.btrim(v_scene ->> 'heading')
      OR v_scene ->> 'heading' ~ E'\r'
      OR pg_catalog.jsonb_typeof(v_scene -> 'objective')
        NOT IN ('string', 'null')
      OR (
        pg_catalog.jsonb_typeof(v_scene -> 'objective') = 'string'
        AND (
          NOT co_production_private.preproject_safe_text(
            v_scene ->> 'objective', 1, 4000
          )
          OR v_scene ->> 'objective'
            IS DISTINCT FROM pg_catalog.btrim(v_scene ->> 'objective')
          OR v_scene ->> 'objective' ~ E'\r'
        )
      )
      OR pg_catalog.jsonb_typeof(v_scene -> 'estimatedDurationSeconds')
        NOT IN ('number', 'null')
      OR (
        pg_catalog.jsonb_typeof(v_scene -> 'estimatedDurationSeconds') = 'number'
        AND (
          v_scene ->> 'estimatedDurationSeconds' !~ '^[1-9][0-9]{0,4}$'
          OR (v_scene ->> 'estimatedDurationSeconds')::integer > 86400
        )
      )
      OR pg_catalog.jsonb_typeof(v_scene -> 'shots') IS DISTINCT FROM 'array'
      OR pg_catalog.jsonb_array_length(v_scene -> 'shots')
        NOT BETWEEN 1 AND 200
    THEN
      RETURN false;
    END IF;

    IF (v_scene ->> 'scriptSectionId') = ANY(v_seen_section_ids) THEN
      RETURN false;
    END IF;
    v_seen_section_ids := pg_catalog.array_append(
      v_seen_section_ids,
      v_scene ->> 'scriptSectionId'
    );

    FOR v_shot, v_shot_number IN
      SELECT shot.value, shot.position::integer
      FROM pg_catalog.jsonb_array_elements(v_scene -> 'shots')
        WITH ORDINALITY AS shot(value, position)
      ORDER BY shot.position
    LOOP
      v_total_shots := v_total_shots + 1;
      IF v_total_shots > 2000 THEN
        RETURN false;
      END IF;

      IF NOT co_production_private.preproject_exact_json_keys(
        v_shot,
        ARRAY[
          'id', 'order', 'scriptBlockIds', 'purpose', 'coverageKind',
          'framing', 'movement', 'subject', 'description', 'audioIntent',
          'estimatedDurationSeconds', 'storyboardPanels'
        ]
      )
        OR pg_catalog.jsonb_typeof(v_shot -> 'id') IS DISTINCT FROM 'string'
        OR v_shot ->> 'id' IS DISTINCT FROM
          'shot-' || pg_catalog.lpad(v_scene_number::text, 3, '0')
          || '-' || pg_catalog.lpad(v_shot_number::text, 3, '0')
        OR pg_catalog.jsonb_typeof(v_shot -> 'order') IS DISTINCT FROM 'number'
        OR v_shot ->> 'order' !~ '^[1-9][0-9]{0,2}$'
        OR (v_shot ->> 'order')::integer IS DISTINCT FROM v_shot_number
        OR pg_catalog.jsonb_typeof(v_shot -> 'scriptBlockIds')
          IS DISTINCT FROM 'array'
        OR pg_catalog.jsonb_array_length(v_shot -> 'scriptBlockIds') > 200
        OR pg_catalog.jsonb_typeof(v_shot -> 'purpose')
          IS DISTINCT FROM 'string'
        OR NOT co_production_private.preproject_safe_text(
          v_shot ->> 'purpose', 1, 4000
        )
        OR v_shot ->> 'purpose'
          IS DISTINCT FROM pg_catalog.btrim(v_shot ->> 'purpose')
        OR v_shot ->> 'purpose' ~ E'\r'
        OR pg_catalog.jsonb_typeof(v_shot -> 'coverageKind')
          IS DISTINCT FROM 'string'
        OR v_shot ->> 'coverageKind' NOT IN (
          'establishing', 'coverage', 'interview', 'b_roll', 'action',
          'graphic', 'transition', 'other'
        )
        OR pg_catalog.jsonb_typeof(v_shot -> 'framing')
          IS DISTINCT FROM 'string'
        OR v_shot ->> 'framing' NOT IN (
          'unspecified', 'extreme_wide', 'wide', 'medium',
          'medium_close_up', 'close_up', 'extreme_close_up',
          'over_shoulder', 'two_shot', 'detail', 'aerial', 'pov'
        )
        OR pg_catalog.jsonb_typeof(v_shot -> 'movement')
          IS DISTINCT FROM 'string'
        OR v_shot ->> 'movement' NOT IN (
          'unspecified', 'locked', 'pan', 'tilt', 'dolly', 'truck',
          'crane', 'gimbal', 'handheld', 'drone', 'zoom'
        )
        OR pg_catalog.jsonb_typeof(v_shot -> 'subject')
          NOT IN ('string', 'null')
        OR (
          pg_catalog.jsonb_typeof(v_shot -> 'subject') = 'string'
          AND (
            NOT co_production_private.preproject_safe_text(
              v_shot ->> 'subject', 1, 1000
            )
            OR v_shot ->> 'subject'
              IS DISTINCT FROM pg_catalog.btrim(v_shot ->> 'subject')
            OR v_shot ->> 'subject' ~ E'\r'
          )
        )
        OR pg_catalog.jsonb_typeof(v_shot -> 'description')
          IS DISTINCT FROM 'string'
        OR NOT co_production_private.preproject_safe_text(
          v_shot ->> 'description', 1, 20000
        )
        OR v_shot ->> 'description'
          IS DISTINCT FROM pg_catalog.btrim(v_shot ->> 'description')
        OR v_shot ->> 'description' ~ E'\r'
        OR pg_catalog.jsonb_typeof(v_shot -> 'audioIntent')
          NOT IN ('string', 'null')
        OR (
          pg_catalog.jsonb_typeof(v_shot -> 'audioIntent') = 'string'
          AND (
            NOT co_production_private.preproject_safe_text(
              v_shot ->> 'audioIntent', 1, 20000
            )
            OR v_shot ->> 'audioIntent'
              IS DISTINCT FROM pg_catalog.btrim(v_shot ->> 'audioIntent')
            OR v_shot ->> 'audioIntent' ~ E'\r'
          )
        )
        OR pg_catalog.jsonb_typeof(v_shot -> 'estimatedDurationSeconds')
          NOT IN ('number', 'null')
        OR (
          pg_catalog.jsonb_typeof(v_shot -> 'estimatedDurationSeconds')
            = 'number'
          AND (
            v_shot ->> 'estimatedDurationSeconds' !~ '^[1-9][0-9]{0,4}$'
            OR (v_shot ->> 'estimatedDurationSeconds')::integer > 86400
          )
        )
        OR pg_catalog.jsonb_typeof(v_shot -> 'storyboardPanels')
          IS DISTINCT FROM 'array'
        OR pg_catalog.jsonb_array_length(v_shot -> 'storyboardPanels')
          NOT BETWEEN 1 AND 50
      THEN
        RETURN false;
      END IF;

      v_seen_block_ids := ARRAY[]::text[];
      FOR v_block_reference IN
        SELECT block_reference.value
        FROM pg_catalog.jsonb_array_elements(v_shot -> 'scriptBlockIds')
          AS block_reference(value)
      LOOP
        IF pg_catalog.jsonb_typeof(v_block_reference) IS DISTINCT FROM 'string'
        THEN
          RETURN false;
        END IF;
        v_block_id := v_block_reference #>> '{}';
        IF v_block_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$'
          OR v_block_id = ANY(v_seen_block_ids)
        THEN
          RETURN false;
        END IF;
        v_seen_block_ids := pg_catalog.array_append(
          v_seen_block_ids,
          v_block_id
        );
      END LOOP;

      FOR v_panel, v_panel_number IN
        SELECT panel.value, panel.position::integer
        FROM pg_catalog.jsonb_array_elements(v_shot -> 'storyboardPanels')
          WITH ORDINALITY AS panel(value, position)
        ORDER BY panel.position
      LOOP
        v_total_panels := v_total_panels + 1;
        IF v_total_panels > 10000 THEN
          RETURN false;
        END IF;

        IF NOT co_production_private.preproject_exact_json_keys(
          v_panel,
          ARRAY[
            'id', 'order', 'visualDescription', 'assetId', 'versionId'
          ]
        )
          OR pg_catalog.jsonb_typeof(v_panel -> 'id') IS DISTINCT FROM 'string'
          OR v_panel ->> 'id' IS DISTINCT FROM
            'panel-' || pg_catalog.lpad(v_scene_number::text, 3, '0')
            || '-' || pg_catalog.lpad(v_shot_number::text, 3, '0')
            || '-' || pg_catalog.lpad(v_panel_number::text, 3, '0')
          OR pg_catalog.jsonb_typeof(v_panel -> 'order')
            IS DISTINCT FROM 'number'
          OR v_panel ->> 'order' !~ '^[1-9][0-9]{0,2}$'
          OR (v_panel ->> 'order')::integer IS DISTINCT FROM v_panel_number
          OR pg_catalog.jsonb_typeof(v_panel -> 'visualDescription')
            IS DISTINCT FROM 'string'
          OR NOT co_production_private.preproject_safe_text(
            v_panel ->> 'visualDescription', 1, 20000
          )
          OR v_panel ->> 'visualDescription'
            IS DISTINCT FROM pg_catalog.btrim(
              v_panel ->> 'visualDescription'
            )
          OR v_panel ->> 'visualDescription' ~ E'\r'
          OR pg_catalog.jsonb_typeof(v_panel -> 'assetId')
            IS DISTINCT FROM 'null'
          OR pg_catalog.jsonb_typeof(v_panel -> 'versionId')
            IS DISTINCT FROM 'null'
        THEN
          RETURN false;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN v_total_shots BETWEEN 1 AND 2000
    AND v_total_panels BETWEEN 1 AND 10000;
END
$$;

CREATE OR REPLACE FUNCTION
  co_production_private.project_shot_plan_content_matches_script(
    p_content jsonb,
    p_script_content jsonb
  )
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
  v_scene jsonb;
  v_script_section jsonb;
  v_shot jsonb;
  v_block_reference jsonb;
BEGIN
  IF NOT co_production_private.project_shot_plan_content_is_valid(p_content)
    OR NOT co_production_private.project_script_content_is_valid(
      p_script_content
    )
    OR pg_catalog.jsonb_array_length(p_content -> 'scenes') IS DISTINCT FROM
      pg_catalog.jsonb_array_length(p_script_content -> 'sections')
  THEN
    RETURN false;
  END IF;

  FOR v_scene, v_script_section IN
    SELECT scene.value, script_section.value
    FROM pg_catalog.jsonb_array_elements(p_content -> 'scenes')
      WITH ORDINALITY AS scene(value, position)
    JOIN pg_catalog.jsonb_array_elements(p_script_content -> 'sections')
      WITH ORDINALITY AS script_section(value, position)
      USING (position)
    ORDER BY scene.position
  LOOP
    IF v_scene ->> 'scriptSectionId'
      IS DISTINCT FROM v_script_section ->> 'id'
    THEN
      RETURN false;
    END IF;

    FOR v_shot IN
      SELECT shot.value
      FROM pg_catalog.jsonb_array_elements(v_scene -> 'shots') AS shot(value)
    LOOP
      FOR v_block_reference IN
        SELECT block_reference.value
        FROM pg_catalog.jsonb_array_elements(v_shot -> 'scriptBlockIds')
          AS block_reference(value)
      LOOP
        IF NOT EXISTS (
          SELECT 1
          FROM pg_catalog.jsonb_array_elements(v_script_section -> 'blocks')
            AS script_block(value)
          WHERE script_block.value ->> 'id' = v_block_reference #>> '{}'
        ) THEN
          RETURN false;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN true;
END
$$;

CREATE OR REPLACE FUNCTION
  co_production_private.derive_project_shot_plan_content(
    p_script_content jsonb
  )
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
  v_section jsonb;
  v_block jsonb;
  v_scene_number integer := 0;
  v_shot_number integer;
  v_kind text;
  v_purpose text;
  v_coverage_kind text;
  v_fallback_text text;
  v_scenes jsonb := '[]'::jsonb;
  v_shots jsonb;
BEGIN
  FOR v_section IN
    SELECT section.value
    FROM pg_catalog.jsonb_array_elements(p_script_content -> 'sections')
      WITH ORDINALITY AS section(value, position)
    ORDER BY section.position
  LOOP
    v_scene_number := v_scene_number + 1;
    v_shot_number := 0;
    v_shots := '[]'::jsonb;

    FOR v_block IN
      SELECT block.value
      FROM pg_catalog.jsonb_array_elements(v_section -> 'blocks')
        WITH ORDINALITY AS block(value, position)
      WHERE block.value ->> 'kind' IN (
        'scene_heading', 'visual', 'action', 'interview_question',
        'b_roll', 'on_screen_text', 'graphic', 'transition'
      )
      ORDER BY block.position
    LOOP
      v_shot_number := v_shot_number + 1;
      v_kind := v_block ->> 'kind';
      v_purpose := CASE v_kind
        WHEN 'scene_heading' THEN 'Establish the scripted scene.'
        WHEN 'visual' THEN 'Capture the scripted visual.'
        WHEN 'action' THEN 'Capture the scripted action.'
        WHEN 'interview_question' THEN
          'Capture the scripted interview question.'
        WHEN 'b_roll' THEN 'Capture the scripted B-roll.'
        WHEN 'on_screen_text' THEN
          'Present the scripted on-screen text.'
        WHEN 'graphic' THEN 'Present the scripted graphic.'
        WHEN 'transition' THEN 'Capture the scripted transition.'
      END;
      v_coverage_kind := CASE v_kind
        WHEN 'scene_heading' THEN 'establishing'
        WHEN 'visual' THEN 'coverage'
        WHEN 'action' THEN 'action'
        WHEN 'interview_question' THEN 'interview'
        WHEN 'b_roll' THEN 'b_roll'
        WHEN 'on_screen_text' THEN 'graphic'
        WHEN 'graphic' THEN 'graphic'
        WHEN 'transition' THEN 'transition'
      END;

      v_shots := v_shots || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'id', 'shot-' || pg_catalog.lpad(v_scene_number::text, 3, '0')
            || '-' || pg_catalog.lpad(v_shot_number::text, 3, '0'),
          'order', v_shot_number,
          'scriptBlockIds', pg_catalog.jsonb_build_array(v_block ->> 'id'),
          'purpose', v_purpose,
          'coverageKind', v_coverage_kind,
          'framing', 'unspecified',
          'movement', 'unspecified',
          'subject', NULL,
          'description', v_block ->> 'text',
          'audioIntent', CASE
            WHEN v_kind = 'interview_question' THEN v_block ->> 'text'
            ELSE NULL
          END,
          'estimatedDurationSeconds', NULL,
          'storyboardPanels', pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object(
              'id', 'panel-'
                || pg_catalog.lpad(v_scene_number::text, 3, '0')
                || '-' || pg_catalog.lpad(v_shot_number::text, 3, '0')
                || '-001',
              'order', 1,
              'visualDescription', v_block ->> 'text',
              'assetId', NULL,
              'versionId', NULL
            )
          )
        )
      );
    END LOOP;

    IF v_shot_number = 0 THEN
      v_shot_number := 1;
      v_fallback_text := 'Visual coverage is not specified.';
      IF pg_catalog.jsonb_typeof(v_section -> 'summary') = 'string' THEN
        v_fallback_text := v_fallback_text || ' Section summary: '
          || (v_section ->> 'summary');
      END IF;
      v_shots := pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'id', 'shot-' || pg_catalog.lpad(v_scene_number::text, 3, '0')
            || '-001',
          'order', 1,
          'scriptBlockIds', '[]'::jsonb,
          'purpose', 'Define visual coverage for this script section.',
          'coverageKind', 'coverage',
          'framing', 'unspecified',
          'movement', 'unspecified',
          'subject', NULL,
          'description', v_fallback_text,
          'audioIntent', NULL,
          'estimatedDurationSeconds', NULL,
          'storyboardPanels', pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object(
              'id', 'panel-'
                || pg_catalog.lpad(v_scene_number::text, 3, '0')
                || '-001-001',
              'order', 1,
              'visualDescription', v_fallback_text,
              'assetId', NULL,
              'versionId', NULL
            )
          )
        )
      );
    END IF;

    v_scenes := v_scenes || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id', 'scene-' || pg_catalog.lpad(v_scene_number::text, 3, '0'),
        'scriptSectionId', v_section ->> 'id',
        'order', v_scene_number,
        'heading', v_section ->> 'heading',
        'objective', v_section -> 'summary',
        'estimatedDurationSeconds',
          v_section -> 'estimatedDurationSeconds',
        'shots', v_shots
      )
    );
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 'cco.shot-plan.v1',
    'title', p_script_content ->> 'title',
    'scenes', v_scenes
  );
END
$$;

CREATE OR REPLACE FUNCTION
  co_production_private.current_project_shot_plan_source(
    p_project_id uuid
  )
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH latest_approved_script AS (
    SELECT revision.*
    FROM co_production.project_script_revisions AS revision
    JOIN LATERAL (
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
    ) AS latest_workflow
      ON latest_workflow.mutation_kind = 'project_script.approved'
    WHERE revision.project_id = p_project_id
    ORDER BY revision.revision_number DESC
    LIMIT 1
  ),
  current_plan AS (
    SELECT plan.*
    FROM co_production.production_plan_revisions AS plan
    WHERE plan.project_id = p_project_id
    ORDER BY plan.revision_number DESC
    LIMIT 1
  )
  SELECT pg_catalog.jsonb_build_object(
    'scriptRevisionId', script.id,
    'scriptRevisionNumber', script.revision_number,
    'scriptContentHash', script.content_hash,
    'productionPlanRevisionId', plan.id,
    'productionPlanRevisionNumber', plan.revision_number,
    'productionPlanContentHash', plan.content_hash,
    'productionPlanScriptBindingId', binding.id,
    'teamId', script.team_id
  )
  FROM latest_approved_script AS script
  JOIN current_plan AS plan
    ON plan.project_id = script.project_id
    AND plan.team_id IS NOT DISTINCT FROM script.team_id
  JOIN co_production.production_plan_script_bindings AS binding
    ON binding.project_id = plan.project_id
    AND binding.team_id IS NOT DISTINCT FROM plan.team_id
    AND binding.plan_revision_id = plan.id
    AND binding.source_project_script_revision_id = script.id
    AND binding.source_project_script_content_hash = script.content_hash
$$;

CREATE TABLE co_production.project_shot_plan_revisions (
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
    derivation_version = 'cco.shot-plan.v1'
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
    co_production_private.project_shot_plan_content_is_valid(content)
  ),
  content_hash text NOT NULL CHECK (
    content_hash ~ '^sha256:[0-9a-f]{64}$'
    AND content_hash = co_production_private.preproject_sha256(content::text)
  ),
  source_project_script_revision_id uuid NOT NULL,
  source_project_script_content_hash text NOT NULL CHECK (
    source_project_script_content_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  source_production_plan_revision_id uuid NOT NULL,
  source_production_plan_content_hash text NOT NULL CHECK (
    source_production_plan_content_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  source_production_plan_script_binding_id uuid NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL,
  CONSTRAINT project_shot_plan_revisions_project_revision_key
    UNIQUE (project_id, revision_number),
  CONSTRAINT project_shot_plan_revisions_id_project_key
    UNIQUE (id, project_id),
  CONSTRAINT project_shot_plan_revisions_id_project_content_hash_key
    UNIQUE (id, project_id, content_hash),
  CONSTRAINT project_shot_plan_revisions_exact_source_key
    UNIQUE (
      id,
      project_id,
      content_hash,
      source_project_script_revision_id,
      source_project_script_content_hash,
      source_production_plan_revision_id,
      source_production_plan_content_hash,
      source_production_plan_script_binding_id
    ),
  CONSTRAINT project_shot_plan_revisions_authority_fk
    FOREIGN KEY (project_id)
    REFERENCES co_production.project_preproduction_authorities(project_id)
    ON DELETE RESTRICT,
  CONSTRAINT project_shot_plan_revisions_project_team_fk
    FOREIGN KEY (project_id, team_id)
    REFERENCES co_production.projects(id, team_id)
    ON DELETE RESTRICT,
  CONSTRAINT project_shot_plan_revisions_lineage_shape CHECK (
    (
      revision_number = 1
      AND base_revision_id IS NULL
      AND revision_kind = 'generated'
    )
    OR (revision_number > 1 AND base_revision_id IS NOT NULL)
  ),
  CONSTRAINT project_shot_plan_revisions_base_fk
    FOREIGN KEY (base_revision_id, project_id)
    REFERENCES co_production.project_shot_plan_revisions(id, project_id)
    ON DELETE RESTRICT,
  CONSTRAINT project_shot_plan_revisions_script_fk
    FOREIGN KEY (
      source_project_script_revision_id,
      project_id,
      source_project_script_content_hash
    )
    REFERENCES co_production.project_script_revisions(
      id,
      project_id,
      content_hash
    )
    ON DELETE RESTRICT,
  CONSTRAINT project_shot_plan_revisions_plan_fk
    FOREIGN KEY (
      source_production_plan_revision_id,
      project_id,
      source_production_plan_content_hash
    )
    REFERENCES co_production.production_plan_revisions(
      id,
      project_id,
      content_hash
    )
    ON DELETE RESTRICT,
  CONSTRAINT project_shot_plan_revisions_plan_script_binding_fk
    FOREIGN KEY (
      source_production_plan_script_binding_id,
      project_id,
      source_production_plan_revision_id,
      source_project_script_revision_id,
      source_project_script_content_hash
    )
    REFERENCES co_production.production_plan_script_bindings(
      id,
      project_id,
      plan_revision_id,
      source_project_script_revision_id,
      source_project_script_content_hash
    )
    ON DELETE RESTRICT
);

COMMENT ON TABLE co_production.project_shot_plan_revisions IS
  'Immutable Governed Shot Plan v1 revisions; scheduling, releases, logs, attachments, and timeline edits are separate authorities.';

ALTER TABLE co_production.project_preproduction_mutation_receipts
  ADD COLUMN shot_plan_revision_id uuid,
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
      'project_shot_plan.changes_requested'
    )
  ),
  ADD CONSTRAINT project_preproduction_receipts_shot_plan_fk
    FOREIGN KEY (shot_plan_revision_id, project_id)
    REFERENCES co_production.project_shot_plan_revisions(id, project_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT project_preproduction_receipts_target_shape CHECK (
    (
      mutation_kind IN ('production_plan.initialized', 'production_plan.replanned')
      AND plan_revision_id IS NOT NULL
      AND task_id IS NULL
      AND script_revision_id IS NULL
      AND plan_draft_id IS NULL
      AND shot_plan_revision_id IS NULL
    )
    OR (
      mutation_kind = 'production_task.mutated'
      AND plan_revision_id IS NULL
      AND task_id IS NOT NULL
      AND script_revision_id IS NULL
      AND plan_draft_id IS NULL
      AND shot_plan_revision_id IS NULL
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
    )
    OR (
      mutation_kind = 'production_plan_draft.generated'
      AND plan_revision_id IS NULL
      AND task_id IS NULL
      AND script_revision_id IS NULL
      AND plan_draft_id IS NOT NULL
      AND shot_plan_revision_id IS NULL
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
    )
  ),
  ADD CONSTRAINT project_preproduction_receipts_exact_shot_plan_key
    UNIQUE (id, project_id, shot_plan_revision_id);

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
      'project_shot_plan.changes_requested'
    )
  ),
  ADD CONSTRAINT project_preproduction_events_entity_kind_check CHECK (
    entity_kind IN (
      'production_plan_revision',
      'production_task',
      'project_script_revision',
      'production_plan_script_draft',
      'project_shot_plan_revision'
    )
  );

CREATE TABLE co_production.project_shot_plan_approval_bindings (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  project_id uuid NOT NULL,
  team_id uuid,
  shot_plan_revision_id uuid NOT NULL,
  shot_plan_content_hash text NOT NULL CHECK (
    shot_plan_content_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  source_project_script_revision_id uuid NOT NULL,
  source_project_script_content_hash text NOT NULL CHECK (
    source_project_script_content_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  source_production_plan_revision_id uuid NOT NULL,
  source_production_plan_content_hash text NOT NULL CHECK (
    source_production_plan_content_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  source_production_plan_script_binding_id uuid NOT NULL,
  decision_receipt_id uuid NOT NULL,
  approved_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_at timestamptz NOT NULL,
  CONSTRAINT project_shot_plan_approval_bindings_revision_key
    UNIQUE (shot_plan_revision_id),
  CONSTRAINT project_shot_plan_approval_bindings_receipt_key
    UNIQUE (decision_receipt_id),
  CONSTRAINT project_shot_plan_approval_bindings_revision_fk
    FOREIGN KEY (
      shot_plan_revision_id,
      project_id,
      shot_plan_content_hash,
      source_project_script_revision_id,
      source_project_script_content_hash,
      source_production_plan_revision_id,
      source_production_plan_content_hash,
      source_production_plan_script_binding_id
    )
    REFERENCES co_production.project_shot_plan_revisions(
      id,
      project_id,
      content_hash,
      source_project_script_revision_id,
      source_project_script_content_hash,
      source_production_plan_revision_id,
      source_production_plan_content_hash,
      source_production_plan_script_binding_id
    )
    ON DELETE RESTRICT,
  CONSTRAINT project_shot_plan_approval_bindings_receipt_fk
    FOREIGN KEY (
      decision_receipt_id,
      project_id,
      shot_plan_revision_id
    )
    REFERENCES co_production.project_preproduction_mutation_receipts(
      id,
      project_id,
      shot_plan_revision_id
    )
    ON DELETE RESTRICT
);

COMMENT ON TABLE co_production.project_shot_plan_approval_bindings IS
  'Durable exact approval evidence joining a shot-plan revision to its script, production plan, plan-script binding, and decision receipt.';

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
  co_production_private.guard_project_shot_plan_revision_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_authority_team_id uuid;
  v_source jsonb;
  v_latest co_production.project_shot_plan_revisions%ROWTYPE;
  v_base co_production.project_shot_plan_revisions%ROWTYPE;
  v_script co_production.project_script_revisions%ROWTYPE;
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
      MESSAGE = 'project_shot_plan_authority_mismatch';
  END IF;

  v_source := co_production_private.current_project_shot_plan_source(
    NEW.project_id
  );
  IF v_source IS NULL
    OR NEW.team_id IS DISTINCT FROM (v_source ->> 'teamId')::uuid
    OR NEW.source_project_script_revision_id IS DISTINCT FROM
      (v_source ->> 'scriptRevisionId')::uuid
    OR NEW.source_project_script_content_hash IS DISTINCT FROM
      v_source ->> 'scriptContentHash'
    OR NEW.source_production_plan_revision_id IS DISTINCT FROM
      (v_source ->> 'productionPlanRevisionId')::uuid
    OR NEW.source_production_plan_content_hash IS DISTINCT FROM
      v_source ->> 'productionPlanContentHash'
    OR NEW.source_production_plan_script_binding_id IS DISTINCT FROM
      (v_source ->> 'productionPlanScriptBindingId')::uuid
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_shot_plan_stale_source';
  END IF;

  SELECT revision.*
  INTO v_latest
  FROM co_production.project_shot_plan_revisions AS revision
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
        MESSAGE = 'project_shot_plan_lineage_mismatch';
    END IF;
  ELSIF NEW.revision_number IS DISTINCT FROM 1
    OR NEW.base_revision_id IS NOT NULL
    OR NEW.revision_kind IS DISTINCT FROM 'generated'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'project_shot_plan_lineage_mismatch';
  END IF;

  SELECT script.*
  INTO v_script
  FROM co_production.project_script_revisions AS script
  WHERE script.id = NEW.source_project_script_revision_id
    AND script.project_id = NEW.project_id
    AND script.team_id IS NOT DISTINCT FROM NEW.team_id
    AND script.content_hash = NEW.source_project_script_content_hash;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'project_shot_plan_script_mismatch';
  END IF;

  IF NEW.revision_kind = 'generated' THEN
    IF NEW.change_summary IS NOT NULL
      OR NEW.content IS DISTINCT FROM
        co_production_private.derive_project_shot_plan_content(v_script.content)
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'project_shot_plan_derivation_mismatch';
    END IF;
  ELSE
    SELECT base.*
    INTO v_base
    FROM co_production.project_shot_plan_revisions AS base
    WHERE base.id = NEW.base_revision_id
      AND base.project_id = NEW.project_id;

    IF NOT FOUND
      OR ROW(
        NEW.source_project_script_revision_id,
        NEW.source_project_script_content_hash,
        NEW.source_production_plan_revision_id,
        NEW.source_production_plan_content_hash,
        NEW.source_production_plan_script_binding_id
      ) IS DISTINCT FROM ROW(
        v_base.source_project_script_revision_id,
        v_base.source_project_script_content_hash,
        v_base.source_production_plan_revision_id,
        v_base.source_production_plan_content_hash,
        v_base.source_production_plan_script_binding_id
      )
      OR NOT co_production_private.project_shot_plan_content_matches_script(
        NEW.content,
        v_script.content
      )
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'project_shot_plan_authored_content_mismatch';
    END IF;
  END IF;

  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION
  co_production_private.guard_project_shot_plan_approval_binding_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_revision co_production.project_shot_plan_revisions%ROWTYPE;
  v_receipt co_production.project_preproduction_mutation_receipts%ROWTYPE;
BEGIN
  SELECT revision.*
  INTO v_revision
  FROM co_production.project_shot_plan_revisions AS revision
  WHERE revision.id = NEW.shot_plan_revision_id
    AND revision.project_id = NEW.project_id;

  SELECT receipt.*
  INTO v_receipt
  FROM co_production.project_preproduction_mutation_receipts AS receipt
  WHERE receipt.id = NEW.decision_receipt_id
    AND receipt.project_id = NEW.project_id
    AND receipt.shot_plan_revision_id = NEW.shot_plan_revision_id;

  IF v_revision.id IS NULL
    OR v_receipt.id IS NULL
    OR v_receipt.mutation_kind IS DISTINCT FROM 'project_shot_plan.approved'
    OR NEW.team_id IS DISTINCT FROM v_revision.team_id
    OR NEW.shot_plan_content_hash IS DISTINCT FROM v_revision.content_hash
    OR NEW.source_project_script_revision_id IS DISTINCT FROM
      v_revision.source_project_script_revision_id
    OR NEW.source_project_script_content_hash IS DISTINCT FROM
      v_revision.source_project_script_content_hash
    OR NEW.source_production_plan_revision_id IS DISTINCT FROM
      v_revision.source_production_plan_revision_id
    OR NEW.source_production_plan_content_hash IS DISTINCT FROM
      v_revision.source_production_plan_content_hash
    OR NEW.source_production_plan_script_binding_id IS DISTINCT FROM
      v_revision.source_production_plan_script_binding_id
    OR NEW.approved_by IS DISTINCT FROM v_receipt.actor_id
    OR NEW.approved_at IS DISTINCT FROM v_receipt.created_at
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'project_shot_plan_approval_binding_mismatch';
  END IF;

  RETURN NEW;
END
$$;

ALTER TABLE co_production.project_shot_plan_revisions
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.project_shot_plan_revisions
  FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.project_shot_plan_approval_bindings
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.project_shot_plan_approval_bindings
  FORCE ROW LEVEL SECURITY;

CREATE POLICY project_shot_plan_revisions_staff_select
  ON co_production.project_shot_plan_revisions
  FOR SELECT TO authenticated
  USING (
    co_production_private.project_preproduction_role(project_id) IN (
      'owner', 'admin', 'producer', 'editor'
    )
  );

CREATE POLICY project_shot_plan_approval_bindings_staff_select
  ON co_production.project_shot_plan_approval_bindings
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
      AND co_production_private.project_preproduction_role(project_id)
        IS NOT NULL
    )
    OR (
      shot_plan_revision_id IS NULL
      AND co_production_private.project_preproduction_role(project_id) IN (
        'owner', 'admin', 'producer', 'editor', 'member'
      )
    )
    OR (
      shot_plan_revision_id IS NOT NULL
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
        'project_shot_plan_revision'
      )
      AND co_production_private.project_preproduction_role(project_id)
        IS NOT NULL
    )
    OR (
      entity_kind <> 'project_shot_plan_revision'
      AND co_production_private.project_preproduction_role(project_id) IN (
        'owner', 'admin', 'producer', 'editor', 'member'
      )
    )
    OR (
      entity_kind = 'project_shot_plan_revision'
      AND co_production_private.project_preproduction_role(project_id) IN (
        'owner', 'admin', 'producer', 'editor'
      )
    )
  );

CREATE TRIGGER project_shot_plan_revisions_lineage_guard
BEFORE INSERT ON co_production.project_shot_plan_revisions
FOR EACH ROW
EXECUTE FUNCTION
  co_production_private.guard_project_shot_plan_revision_insert();

CREATE TRIGGER project_shot_plan_revisions_immutable
BEFORE UPDATE OR DELETE ON co_production.project_shot_plan_revisions
FOR EACH ROW
EXECUTE FUNCTION
  co_production_private.prevent_project_preproduction_immutable_mutation();

CREATE TRIGGER project_shot_plan_revisions_no_truncate
BEFORE TRUNCATE ON co_production.project_shot_plan_revisions
FOR EACH STATEMENT
EXECUTE FUNCTION
  co_production_private.prevent_project_preproduction_immutable_mutation();

CREATE TRIGGER project_shot_plan_approval_bindings_guard
BEFORE INSERT ON co_production.project_shot_plan_approval_bindings
FOR EACH ROW
EXECUTE FUNCTION
  co_production_private.guard_project_shot_plan_approval_binding_insert();

CREATE TRIGGER project_shot_plan_approval_bindings_immutable
BEFORE UPDATE OR DELETE ON co_production.project_shot_plan_approval_bindings
FOR EACH ROW
EXECUTE FUNCTION
  co_production_private.prevent_project_preproduction_immutable_mutation();

CREATE TRIGGER project_shot_plan_approval_bindings_no_truncate
BEFORE TRUNCATE ON co_production.project_shot_plan_approval_bindings
FOR EACH STATEMENT
EXECUTE FUNCTION
  co_production_private.prevent_project_preproduction_immutable_mutation();

CREATE OR REPLACE FUNCTION co_production.get_project_shot_plan(
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
  v_head co_production.project_shot_plan_revisions%ROWTYPE;
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
      MESSAGE = 'project_shot_plan_forbidden';
  END IF;

  v_role := co_production_private.project_preproduction_role(p_project_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'project_shot_plan_not_found';
  END IF;
  IF v_role NOT IN ('owner', 'admin', 'producer', 'editor') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'project_shot_plan_forbidden';
  END IF;

  SELECT authority.authority_version, authority.event_head_hash
  INTO v_authority_version, v_event_head_hash
  FROM co_production.project_preproduction_authorities AS authority
  WHERE authority.project_id = p_project_id;

  IF NOT FOUND THEN
    v_authority_version := 0;
    v_event_head_hash := 'sha256:' || pg_catalog.repeat('0', 64);
  END IF;

  v_source := co_production_private.current_project_shot_plan_source(
    p_project_id
  );

  IF v_source IS NOT NULL THEN
    SELECT revision.id
    INTO v_active_revision_id
    FROM co_production.project_shot_plan_approval_bindings AS binding
    JOIN co_production.project_shot_plan_revisions AS revision
      ON revision.id = binding.shot_plan_revision_id
      AND revision.project_id = binding.project_id
    WHERE binding.project_id = p_project_id
      AND binding.source_project_script_revision_id =
        (v_source ->> 'scriptRevisionId')::uuid
      AND binding.source_project_script_content_hash =
        v_source ->> 'scriptContentHash'
      AND binding.source_production_plan_revision_id =
        (v_source ->> 'productionPlanRevisionId')::uuid
      AND binding.source_production_plan_content_hash =
        v_source ->> 'productionPlanContentHash'
      AND binding.source_production_plan_script_binding_id =
        (v_source ->> 'productionPlanScriptBindingId')::uuid
    ORDER BY revision.revision_number DESC
    LIMIT 1;

    SELECT EXISTS (
      SELECT 1
      FROM co_production.project_shot_plan_revisions AS revision
      WHERE revision.project_id = p_project_id
        AND revision.revision_kind = 'generated'
        AND revision.source_project_script_revision_id =
          (v_source ->> 'scriptRevisionId')::uuid
        AND revision.source_project_script_content_hash =
          v_source ->> 'scriptContentHash'
        AND revision.source_production_plan_revision_id =
          (v_source ->> 'productionPlanRevisionId')::uuid
        AND revision.source_production_plan_content_hash =
          v_source ->> 'productionPlanContentHash'
        AND revision.source_production_plan_script_binding_id =
          (v_source ->> 'productionPlanScriptBindingId')::uuid
    )
    INTO v_has_generated_source;
  END IF;

  SELECT revision.*
  INTO v_head
  FROM co_production.project_shot_plan_revisions AS revision
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
          'scriptRevisionId', revision.source_project_script_revision_id,
          'scriptRevisionNumber', script.revision_number,
          'scriptContentHash', revision.source_project_script_content_hash,
          'productionPlanRevisionId',
            revision.source_production_plan_revision_id,
          'productionPlanRevisionNumber', plan.revision_number,
          'productionPlanContentHash',
            revision.source_production_plan_content_hash,
          'productionPlanScriptBindingId',
            revision.source_production_plan_script_binding_id
        ),
        'workflow', pg_catalog.jsonb_build_object(
          'state', CASE latest_workflow.mutation_kind
            WHEN 'project_shot_plan.submitted' THEN 'submitted'
            WHEN 'project_shot_plan.approved' THEN 'approved'
            WHEN 'project_shot_plan.changes_requested' THEN
              'changes_requested'
            ELSE 'draft'
          END,
          'isStale', v_source IS NULL OR ROW(
            revision.source_project_script_revision_id,
            revision.source_project_script_content_hash,
            revision.source_production_plan_revision_id,
            revision.source_production_plan_content_hash,
            revision.source_production_plan_script_binding_id
          ) IS DISTINCT FROM ROW(
            (v_source ->> 'scriptRevisionId')::uuid,
            v_source ->> 'scriptContentHash',
            (v_source ->> 'productionPlanRevisionId')::uuid,
            v_source ->> 'productionPlanContentHash',
            (v_source ->> 'productionPlanScriptBindingId')::uuid
          ),
          'isActive', revision.id IS NOT DISTINCT FROM v_active_revision_id,
          'submittedBy', submission.actor_id,
          'submittedAt', submission.created_at,
          'submissionNote', submission.payload -> 'note',
          'decision', CASE decision.mutation_kind
            WHEN 'project_shot_plan.approved' THEN 'approved'
            WHEN 'project_shot_plan.changes_requested' THEN
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
  FROM co_production.project_shot_plan_revisions AS revision
  JOIN co_production.project_script_revisions AS script
    ON script.id = revision.source_project_script_revision_id
    AND script.project_id = revision.project_id
  JOIN co_production.production_plan_revisions AS plan
    ON plan.id = revision.source_production_plan_revision_id
    AND plan.project_id = revision.project_id
  LEFT JOIN LATERAL (
    SELECT receipt.mutation_kind
    FROM co_production.project_preproduction_mutation_receipts AS receipt
    WHERE receipt.project_id = revision.project_id
      AND receipt.shot_plan_revision_id = revision.id
      AND receipt.mutation_kind IN (
        'project_shot_plan.submitted',
        'project_shot_plan.approved',
        'project_shot_plan.changes_requested'
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
      AND receipt.shot_plan_revision_id = revision.id
      AND receipt.mutation_kind = 'project_shot_plan.submitted'
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
      AND receipt.shot_plan_revision_id = revision.id
      AND receipt.mutation_kind IN (
        'project_shot_plan.approved',
        'project_shot_plan.changes_requested'
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
        AND v_head_state = 'draft',
      'canDecide',
        v_role IN ('owner', 'admin', 'producer')
        AND v_head.id IS NOT NULL
        AND NOT v_head_is_stale
        AND v_head_state = 'submitted'
    )
  );
END
$$;

CREATE OR REPLACE FUNCTION co_production.generate_project_shot_plan_revision(
  p_project_id uuid,
  p_expected_authority_version bigint,
  p_request_id uuid,
  p_expected_script_revision_id uuid,
  p_expected_production_plan_revision_id uuid
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
  v_latest co_production.project_shot_plan_revisions%ROWTYPE;
  v_script co_production.project_script_revisions%ROWTYPE;
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
    OR p_expected_script_revision_id IS NULL
    OR p_expected_production_plan_revision_id IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_project_shot_plan_generation';
  END IF;

  SELECT project.*
  INTO v_project
  FROM co_production.projects AS project
  WHERE project.id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'project_shot_plan_not_found';
  END IF;

  v_role := co_production_private.project_preproduction_role(p_project_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'project_shot_plan_not_found';
  END IF;
  IF v_role NOT IN ('owner', 'admin', 'producer') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'project_shot_plan_forbidden';
  END IF;

  v_request_payload := pg_catalog.jsonb_build_object(
    'operation', 'generate_project_shot_plan_revision',
    'projectId', p_project_id,
    'expectedAuthorityVersion', p_expected_authority_version,
    'requestId', p_request_id,
    'expectedScriptRevisionId', p_expected_script_revision_id,
    'expectedProductionPlanRevisionId',
      p_expected_production_plan_revision_id,
    'derivationVersion', 'cco.shot-plan.v1'
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
      MESSAGE = 'project_shot_plan_authority_mismatch';
  END IF;

  SELECT receipt.*
  INTO v_existing
  FROM co_production.project_preproduction_mutation_receipts AS receipt
  WHERE receipt.project_id = p_project_id
    AND receipt.request_id = p_request_id;

  IF FOUND THEN
    IF v_existing.mutation_kind IS DISTINCT FROM
      'project_shot_plan.generated'
      OR v_existing.expected_entity_version IS DISTINCT FROM
        p_expected_authority_version
      OR v_existing.request_payload IS DISTINCT FROM v_request_payload
      OR v_existing.request_hash IS DISTINCT FROM v_request_hash
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'project_shot_plan_idempotency_conflict';
    END IF;
    RETURN v_existing.result
      || pg_catalog.jsonb_build_object('replayed', true);
  END IF;

  IF v_authority.authority_version IS DISTINCT FROM
    p_expected_authority_version
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'project_shot_plan_authority_version_conflict';
  END IF;
  IF v_authority.authority_version >= 2147483647 THEN
    RAISE EXCEPTION USING
      ERRCODE = '54000',
      MESSAGE = 'preproduction_authority_version_exhausted';
  END IF;

  v_source := co_production_private.current_project_shot_plan_source(
    p_project_id
  );
  IF v_source IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_shot_plan_source_unavailable';
  END IF;
  IF (v_source ->> 'scriptRevisionId')::uuid IS DISTINCT FROM
      p_expected_script_revision_id
    OR (v_source ->> 'productionPlanRevisionId')::uuid IS DISTINCT FROM
      p_expected_production_plan_revision_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'project_shot_plan_stale_source';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM co_production.project_shot_plan_revisions AS revision
    WHERE revision.project_id = p_project_id
      AND revision.revision_kind = 'generated'
      AND revision.source_project_script_revision_id =
        (v_source ->> 'scriptRevisionId')::uuid
      AND revision.source_project_script_content_hash =
        v_source ->> 'scriptContentHash'
      AND revision.source_production_plan_revision_id =
        (v_source ->> 'productionPlanRevisionId')::uuid
      AND revision.source_production_plan_content_hash =
        v_source ->> 'productionPlanContentHash'
      AND revision.source_production_plan_script_binding_id =
        (v_source ->> 'productionPlanScriptBindingId')::uuid
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'project_shot_plan_source_already_generated';
  END IF;

  SELECT revision.*
  INTO v_latest
  FROM co_production.project_shot_plan_revisions AS revision
  WHERE revision.project_id = p_project_id
  ORDER BY revision.revision_number DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF v_latest.revision_number >= 2147483647 THEN
      RAISE EXCEPTION USING
        ERRCODE = '54000',
        MESSAGE = 'project_shot_plan_revision_exhausted';
    END IF;
    v_revision_number := v_latest.revision_number + 1;
    v_base_revision_id := v_latest.id;
  ELSE
    v_revision_number := 1;
    v_base_revision_id := NULL;
  END IF;

  SELECT script.*
  INTO v_script
  FROM co_production.project_script_revisions AS script
  WHERE script.id = (v_source ->> 'scriptRevisionId')::uuid
    AND script.project_id = p_project_id
    AND script.content_hash = v_source ->> 'scriptContentHash';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_shot_plan_source_unavailable';
  END IF;

  v_content := co_production_private.derive_project_shot_plan_content(
    v_script.content
  );
  v_content_hash := co_production_private.preproject_sha256(v_content::text);
  v_new_authority_version := v_authority.authority_version + 1;

  INSERT INTO co_production.project_shot_plan_revisions (
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
    source_project_script_revision_id,
    source_project_script_content_hash,
    source_production_plan_revision_id,
    source_production_plan_content_hash,
    source_production_plan_script_binding_id,
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
    'cco.shot-plan.v1',
    NULL,
    v_content,
    v_content_hash,
    (v_source ->> 'scriptRevisionId')::uuid,
    v_source ->> 'scriptContentHash',
    (v_source ->> 'productionPlanRevisionId')::uuid,
    v_source ->> 'productionPlanContentHash',
    (v_source ->> 'productionPlanScriptBindingId')::uuid,
    v_actor_id,
    v_now
  );

  v_result := pg_catalog.jsonb_build_object(
    'shotPlanRevisionId', v_revision_id,
    'projectId', p_project_id,
    'revisionNumber', v_revision_number,
    'baseRevisionId', v_base_revision_id,
    'workflowState', 'draft',
    'source', v_source - 'teamId',
    'authorityVersion', v_new_authority_version,
    'requestId', p_request_id,
    'replayed', false
  );

  v_receipt_hash := co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'id', v_receipt_id,
      'projectId', p_project_id,
      'teamId', v_project.team_id,
      'mutationKind', 'project_shot_plan.generated',
      'planRevisionId', NULL,
      'taskId', NULL,
      'scriptRevisionId', NULL,
      'planDraftId', NULL,
      'shotPlanRevisionId', v_revision_id,
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
    'shotPlanRevisionId', v_revision_id,
    'revisionNumber', v_revision_number,
    'baseRevisionId', v_base_revision_id,
    'revisionKind', 'generated',
    'derivationVersion', 'cco.shot-plan.v1',
    'contentHash', v_content_hash,
    'source', v_source - 'teamId'
  );
  v_event_hash := co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'id', v_event_id,
      'projectId', p_project_id,
      'teamId', v_project.team_id,
      'receiptId', v_receipt_id,
      'authorityVersion', v_new_authority_version,
      'eventType', 'project_shot_plan.generated',
      'entityKind', 'project_shot_plan_revision',
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
    'project_shot_plan.generated',
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
    'project_shot_plan.generated',
    'project_shot_plan_revision',
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
      MESSAGE = 'project_shot_plan_authority_version_conflict';
  END IF;

  RETURN v_result;
END
$$;

CREATE OR REPLACE FUNCTION co_production.append_project_shot_plan_revision(
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
  v_base co_production.project_shot_plan_revisions%ROWTYPE;
  v_script co_production.project_script_revisions%ROWTYPE;
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
    OR NOT co_production_private.project_shot_plan_content_is_valid(p_content)
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
      MESSAGE = 'invalid_project_shot_plan_revision';
  END IF;

  SELECT project.*
  INTO v_project
  FROM co_production.projects AS project
  WHERE project.id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'project_shot_plan_not_found';
  END IF;

  v_role := co_production_private.project_preproduction_role(p_project_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'project_shot_plan_not_found';
  END IF;
  IF v_role NOT IN ('owner', 'admin', 'producer', 'editor') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'project_shot_plan_forbidden';
  END IF;

  v_request_payload := pg_catalog.jsonb_build_object(
    'operation', 'append_project_shot_plan_revision',
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
      MESSAGE = 'project_shot_plan_authority_mismatch';
  END IF;

  SELECT receipt.*
  INTO v_existing
  FROM co_production.project_preproduction_mutation_receipts AS receipt
  WHERE receipt.project_id = p_project_id
    AND receipt.request_id = p_request_id;

  IF FOUND THEN
    IF v_existing.mutation_kind IS DISTINCT FROM
      'project_shot_plan.revised'
      OR v_existing.expected_entity_version IS DISTINCT FROM
        p_expected_authority_version
      OR v_existing.request_payload IS DISTINCT FROM v_request_payload
      OR v_existing.request_hash IS DISTINCT FROM v_request_hash
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'project_shot_plan_idempotency_conflict';
    END IF;
    RETURN v_existing.result
      || pg_catalog.jsonb_build_object('replayed', true);
  END IF;

  IF v_authority.authority_version IS DISTINCT FROM
    p_expected_authority_version
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'project_shot_plan_authority_version_conflict';
  END IF;
  IF v_authority.authority_version >= 2147483647 THEN
    RAISE EXCEPTION USING
      ERRCODE = '54000',
      MESSAGE = 'preproduction_authority_version_exhausted';
  END IF;

  SELECT revision.*
  INTO v_base
  FROM co_production.project_shot_plan_revisions AS revision
  WHERE revision.project_id = p_project_id
  ORDER BY revision.revision_number DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND OR v_base.id IS DISTINCT FROM p_base_revision_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'project_shot_plan_base_revision_conflict';
  END IF;
  IF v_base.revision_number >= 2147483647 THEN
    RAISE EXCEPTION USING
      ERRCODE = '54000',
      MESSAGE = 'project_shot_plan_revision_exhausted';
  END IF;

  v_source := co_production_private.current_project_shot_plan_source(
    p_project_id
  );
  IF v_source IS NULL OR ROW(
    v_base.source_project_script_revision_id,
    v_base.source_project_script_content_hash,
    v_base.source_production_plan_revision_id,
    v_base.source_production_plan_content_hash,
    v_base.source_production_plan_script_binding_id
  ) IS DISTINCT FROM ROW(
    (v_source ->> 'scriptRevisionId')::uuid,
    v_source ->> 'scriptContentHash',
    (v_source ->> 'productionPlanRevisionId')::uuid,
    v_source ->> 'productionPlanContentHash',
    (v_source ->> 'productionPlanScriptBindingId')::uuid
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_shot_plan_stale_source';
  END IF;

  SELECT receipt.mutation_kind
  INTO v_current_state
  FROM co_production.project_preproduction_mutation_receipts AS receipt
  WHERE receipt.project_id = p_project_id
    AND receipt.shot_plan_revision_id = v_base.id
    AND receipt.mutation_kind IN (
      'project_shot_plan.submitted',
      'project_shot_plan.approved',
      'project_shot_plan.changes_requested'
    )
  ORDER BY receipt.authority_version DESC
  LIMIT 1;

  IF FOUND AND v_current_state = 'project_shot_plan.submitted' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_shot_plan_invalid_transition';
  END IF;

  SELECT script.*
  INTO v_script
  FROM co_production.project_script_revisions AS script
  WHERE script.id = v_base.source_project_script_revision_id
    AND script.project_id = p_project_id
    AND script.content_hash = v_base.source_project_script_content_hash;

  IF NOT FOUND
    OR NOT co_production_private.project_shot_plan_content_matches_script(
      p_content,
      v_script.content
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'project_shot_plan_authored_content_mismatch';
  END IF;

  v_revision_number := v_base.revision_number + 1;
  v_new_authority_version := v_authority.authority_version + 1;

  INSERT INTO co_production.project_shot_plan_revisions (
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
    source_project_script_revision_id,
    source_project_script_content_hash,
    source_production_plan_revision_id,
    source_production_plan_content_hash,
    source_production_plan_script_binding_id,
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
    'cco.shot-plan.v1',
    p_change_summary,
    p_content,
    v_content_hash,
    v_base.source_project_script_revision_id,
    v_base.source_project_script_content_hash,
    v_base.source_production_plan_revision_id,
    v_base.source_production_plan_content_hash,
    v_base.source_production_plan_script_binding_id,
    v_actor_id,
    v_now
  );

  v_result := pg_catalog.jsonb_build_object(
    'shotPlanRevisionId', v_revision_id,
    'projectId', p_project_id,
    'revisionNumber', v_revision_number,
    'baseRevisionId', v_base.id,
    'workflowState', 'draft',
    'source', v_source - 'teamId',
    'authorityVersion', v_new_authority_version,
    'requestId', p_request_id,
    'replayed', false
  );

  v_receipt_hash := co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'id', v_receipt_id,
      'projectId', p_project_id,
      'teamId', v_project.team_id,
      'mutationKind', 'project_shot_plan.revised',
      'planRevisionId', NULL,
      'taskId', NULL,
      'scriptRevisionId', NULL,
      'planDraftId', NULL,
      'shotPlanRevisionId', v_revision_id,
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
    'shotPlanRevisionId', v_revision_id,
    'revisionNumber', v_revision_number,
    'baseRevisionId', v_base.id,
    'revisionKind', 'authored',
    'derivationVersion', 'cco.shot-plan.v1',
    'changeSummary', p_change_summary,
    'contentHash', v_content_hash,
    'source', v_source - 'teamId'
  );
  v_event_hash := co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'id', v_event_id,
      'projectId', p_project_id,
      'teamId', v_project.team_id,
      'receiptId', v_receipt_id,
      'authorityVersion', v_new_authority_version,
      'eventType', 'project_shot_plan.revised',
      'entityKind', 'project_shot_plan_revision',
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
    'project_shot_plan.revised',
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
    'project_shot_plan.revised',
    'project_shot_plan_revision',
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
      MESSAGE = 'project_shot_plan_authority_version_conflict';
  END IF;

  RETURN v_result;
END
$$;

CREATE OR REPLACE FUNCTION co_production.submit_project_shot_plan_revision(
  p_project_id uuid,
  p_shot_plan_revision_id uuid,
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
  v_revision co_production.project_shot_plan_revisions%ROWTYPE;
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
    OR p_shot_plan_revision_id IS NULL
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
      MESSAGE = 'invalid_project_shot_plan_submission';
  END IF;

  SELECT project.*
  INTO v_project
  FROM co_production.projects AS project
  WHERE project.id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'project_shot_plan_not_found';
  END IF;

  v_role := co_production_private.project_preproduction_role(p_project_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'project_shot_plan_not_found';
  END IF;
  IF v_role NOT IN ('owner', 'admin', 'producer', 'editor') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'project_shot_plan_forbidden';
  END IF;

  v_request_payload := pg_catalog.jsonb_build_object(
    'operation', 'submit_project_shot_plan_revision',
    'projectId', p_project_id,
    'shotPlanRevisionId', p_shot_plan_revision_id,
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
      MESSAGE = 'project_shot_plan_authority_mismatch';
  END IF;

  SELECT receipt.*
  INTO v_existing
  FROM co_production.project_preproduction_mutation_receipts AS receipt
  WHERE receipt.project_id = p_project_id
    AND receipt.request_id = p_request_id;

  IF FOUND THEN
    IF v_existing.mutation_kind IS DISTINCT FROM
      'project_shot_plan.submitted'
      OR v_existing.shot_plan_revision_id IS DISTINCT FROM
        p_shot_plan_revision_id
      OR v_existing.expected_entity_version IS DISTINCT FROM
        p_expected_authority_version
      OR v_existing.request_payload IS DISTINCT FROM v_request_payload
      OR v_existing.request_hash IS DISTINCT FROM v_request_hash
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'project_shot_plan_idempotency_conflict';
    END IF;
    RETURN v_existing.result
      || pg_catalog.jsonb_build_object('replayed', true);
  END IF;

  IF v_authority.authority_version IS DISTINCT FROM
    p_expected_authority_version
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'project_shot_plan_authority_version_conflict';
  END IF;
  IF v_authority.authority_version >= 2147483647 THEN
    RAISE EXCEPTION USING
      ERRCODE = '54000',
      MESSAGE = 'preproduction_authority_version_exhausted';
  END IF;

  SELECT revision.*
  INTO v_revision
  FROM co_production.project_shot_plan_revisions AS revision
  WHERE revision.project_id = p_project_id
  ORDER BY revision.revision_number DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND OR v_revision.id IS DISTINCT FROM p_shot_plan_revision_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'project_shot_plan_revision_conflict';
  END IF;

  v_source := co_production_private.current_project_shot_plan_source(
    p_project_id
  );
  IF v_source IS NULL OR ROW(
    v_revision.source_project_script_revision_id,
    v_revision.source_project_script_content_hash,
    v_revision.source_production_plan_revision_id,
    v_revision.source_production_plan_content_hash,
    v_revision.source_production_plan_script_binding_id
  ) IS DISTINCT FROM ROW(
    (v_source ->> 'scriptRevisionId')::uuid,
    v_source ->> 'scriptContentHash',
    (v_source ->> 'productionPlanRevisionId')::uuid,
    v_source ->> 'productionPlanContentHash',
    (v_source ->> 'productionPlanScriptBindingId')::uuid
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_shot_plan_stale_source';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM co_production.project_preproduction_mutation_receipts AS receipt
    WHERE receipt.project_id = p_project_id
      AND receipt.shot_plan_revision_id = p_shot_plan_revision_id
      AND receipt.mutation_kind IN (
        'project_shot_plan.submitted',
        'project_shot_plan.approved',
        'project_shot_plan.changes_requested'
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_shot_plan_invalid_transition';
  END IF;

  v_new_authority_version := v_authority.authority_version + 1;
  v_result := pg_catalog.jsonb_build_object(
    'shotPlanRevisionId', p_shot_plan_revision_id,
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
      'mutationKind', 'project_shot_plan.submitted',
      'planRevisionId', NULL,
      'taskId', NULL,
      'scriptRevisionId', NULL,
      'planDraftId', NULL,
      'shotPlanRevisionId', p_shot_plan_revision_id,
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
    'shotPlanRevisionId', p_shot_plan_revision_id,
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
      'eventType', 'project_shot_plan.submitted',
      'entityKind', 'project_shot_plan_revision',
      'entityId', p_shot_plan_revision_id,
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
    'project_shot_plan.submitted',
    NULL,
    NULL,
    NULL,
    NULL,
    p_shot_plan_revision_id,
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
    'project_shot_plan.submitted',
    'project_shot_plan_revision',
    p_shot_plan_revision_id,
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
      MESSAGE = 'project_shot_plan_authority_version_conflict';
  END IF;

  RETURN v_result;
END
$$;

CREATE OR REPLACE FUNCTION co_production.decide_project_shot_plan_revision(
  p_project_id uuid,
  p_shot_plan_revision_id uuid,
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
  v_revision co_production.project_shot_plan_revisions%ROWTYPE;
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
    OR p_shot_plan_revision_id IS NULL
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
      MESSAGE = 'invalid_project_shot_plan_decision';
  END IF;

  SELECT project.*
  INTO v_project
  FROM co_production.projects AS project
  WHERE project.id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'project_shot_plan_not_found';
  END IF;

  v_role := co_production_private.project_preproduction_role(p_project_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'project_shot_plan_not_found';
  END IF;
  IF v_role NOT IN ('owner', 'admin', 'producer') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'project_shot_plan_forbidden';
  END IF;

  v_mutation_kind := 'project_shot_plan.' || p_decision;
  v_request_payload := pg_catalog.jsonb_build_object(
    'operation', 'decide_project_shot_plan_revision',
    'projectId', p_project_id,
    'shotPlanRevisionId', p_shot_plan_revision_id,
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
      MESSAGE = 'project_shot_plan_authority_mismatch';
  END IF;

  SELECT receipt.*
  INTO v_existing
  FROM co_production.project_preproduction_mutation_receipts AS receipt
  WHERE receipt.project_id = p_project_id
    AND receipt.request_id = p_request_id;

  IF FOUND THEN
    IF v_existing.mutation_kind IS DISTINCT FROM v_mutation_kind
      OR v_existing.shot_plan_revision_id IS DISTINCT FROM
        p_shot_plan_revision_id
      OR v_existing.expected_entity_version IS DISTINCT FROM
        p_expected_authority_version
      OR v_existing.request_payload IS DISTINCT FROM v_request_payload
      OR v_existing.request_hash IS DISTINCT FROM v_request_hash
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'project_shot_plan_idempotency_conflict';
    END IF;
    RETURN v_existing.result
      || pg_catalog.jsonb_build_object('replayed', true);
  END IF;

  IF v_authority.authority_version IS DISTINCT FROM
    p_expected_authority_version
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'project_shot_plan_authority_version_conflict';
  END IF;
  IF v_authority.authority_version >= 2147483647 THEN
    RAISE EXCEPTION USING
      ERRCODE = '54000',
      MESSAGE = 'preproduction_authority_version_exhausted';
  END IF;

  SELECT revision.*
  INTO v_revision
  FROM co_production.project_shot_plan_revisions AS revision
  WHERE revision.project_id = p_project_id
  ORDER BY revision.revision_number DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND OR v_revision.id IS DISTINCT FROM p_shot_plan_revision_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'project_shot_plan_revision_conflict';
  END IF;

  v_source := co_production_private.current_project_shot_plan_source(
    p_project_id
  );
  IF v_source IS NULL OR ROW(
    v_revision.source_project_script_revision_id,
    v_revision.source_project_script_content_hash,
    v_revision.source_production_plan_revision_id,
    v_revision.source_production_plan_content_hash,
    v_revision.source_production_plan_script_binding_id
  ) IS DISTINCT FROM ROW(
    (v_source ->> 'scriptRevisionId')::uuid,
    v_source ->> 'scriptContentHash',
    (v_source ->> 'productionPlanRevisionId')::uuid,
    v_source ->> 'productionPlanContentHash',
    (v_source ->> 'productionPlanScriptBindingId')::uuid
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_shot_plan_stale_source';
  END IF;

  SELECT receipt.mutation_kind
  INTO v_current_state
  FROM co_production.project_preproduction_mutation_receipts AS receipt
  WHERE receipt.project_id = p_project_id
    AND receipt.shot_plan_revision_id = p_shot_plan_revision_id
    AND receipt.mutation_kind IN (
      'project_shot_plan.submitted',
      'project_shot_plan.approved',
      'project_shot_plan.changes_requested'
    )
  ORDER BY receipt.authority_version DESC
  LIMIT 1;

  IF NOT FOUND
    OR v_current_state IS DISTINCT FROM 'project_shot_plan.submitted'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_shot_plan_invalid_transition';
  END IF;

  v_new_authority_version := v_authority.authority_version + 1;
  v_result := pg_catalog.jsonb_build_object(
    'shotPlanRevisionId', p_shot_plan_revision_id,
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
      'shotPlanRevisionId', p_shot_plan_revision_id,
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
    'shotPlanRevisionId', p_shot_plan_revision_id,
    'revisionNumber', v_revision.revision_number,
    'decision', p_decision,
    'note', p_note,
    'contentHash', v_revision.content_hash,
    'source', v_source - 'teamId'
  );
  v_event_hash := co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'id', v_event_id,
      'projectId', p_project_id,
      'teamId', v_project.team_id,
      'receiptId', v_receipt_id,
      'authorityVersion', v_new_authority_version,
      'eventType', v_mutation_kind,
      'entityKind', 'project_shot_plan_revision',
      'entityId', p_shot_plan_revision_id,
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
    p_shot_plan_revision_id,
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
    'project_shot_plan_revision',
    p_shot_plan_revision_id,
    v_event_payload,
    v_authority.event_head_hash,
    v_event_hash,
    v_actor_id,
    v_now
  );

  IF p_decision = 'approved' THEN
    INSERT INTO co_production.project_shot_plan_approval_bindings (
      project_id,
      team_id,
      shot_plan_revision_id,
      shot_plan_content_hash,
      source_project_script_revision_id,
      source_project_script_content_hash,
      source_production_plan_revision_id,
      source_production_plan_content_hash,
      source_production_plan_script_binding_id,
      decision_receipt_id,
      approved_by,
      approved_at
    )
    VALUES (
      p_project_id,
      v_project.team_id,
      v_revision.id,
      v_revision.content_hash,
      v_revision.source_project_script_revision_id,
      v_revision.source_project_script_content_hash,
      v_revision.source_production_plan_revision_id,
      v_revision.source_production_plan_content_hash,
      v_revision.source_production_plan_script_binding_id,
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
      MESSAGE = 'project_shot_plan_authority_version_conflict';
  END IF;

  RETURN v_result;
END
$$;

REVOKE ALL ON TABLE co_production.project_shot_plan_revisions
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.project_shot_plan_approval_bindings
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.project_preproduction_mutation_receipts
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.project_preproduction_events
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION
  co_production_private.project_shot_plan_content_is_valid(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.project_shot_plan_content_matches_script(jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.derive_project_shot_plan_content(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.current_project_shot_plan_source(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.verify_project_preproduction_receipt_hash()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.guard_project_preproduction_event_insert()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.guard_project_shot_plan_revision_insert()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.guard_project_shot_plan_approval_binding_insert()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION co_production.get_project_shot_plan(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production.generate_project_shot_plan_revision(
    uuid, bigint, uuid, uuid, uuid
  )
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production.append_project_shot_plan_revision(
    uuid, bigint, uuid, uuid, text, jsonb
  )
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production.submit_project_shot_plan_revision(
    uuid, uuid, bigint, uuid, text
  )
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production.decide_project_shot_plan_revision(
    uuid, uuid, bigint, uuid, text, text
  )
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION co_production.get_project_shot_plan(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION
  co_production.generate_project_shot_plan_revision(
    uuid, bigint, uuid, uuid, uuid
  )
  TO authenticated;
GRANT EXECUTE ON FUNCTION
  co_production.append_project_shot_plan_revision(
    uuid, bigint, uuid, uuid, text, jsonb
  )
  TO authenticated;
GRANT EXECUTE ON FUNCTION
  co_production.submit_project_shot_plan_revision(
    uuid, uuid, bigint, uuid, text
  )
  TO authenticated;
GRANT EXECUTE ON FUNCTION
  co_production.decide_project_shot_plan_revision(
    uuid, uuid, bigint, uuid, text, text
  )
  TO authenticated;

CREATE UNIQUE INDEX project_shot_plan_revisions_generated_source_key
  ON co_production.project_shot_plan_revisions(
    project_id,
    source_project_script_revision_id,
    source_project_script_content_hash,
    source_production_plan_revision_id,
    source_production_plan_content_hash,
    source_production_plan_script_binding_id
  )
  WHERE revision_kind = 'generated';

CREATE INDEX project_shot_plan_revisions_project_latest_idx
  ON co_production.project_shot_plan_revisions(
    project_id,
    revision_number DESC
  );

CREATE INDEX project_shot_plan_approval_bindings_project_approved_idx
  ON co_production.project_shot_plan_approval_bindings(
    project_id,
    approved_at DESC
  );

CREATE INDEX project_preproduction_receipts_shot_plan_history_idx
  ON co_production.project_preproduction_mutation_receipts(
    shot_plan_revision_id,
    authority_version DESC
  )
  WHERE shot_plan_revision_id IS NOT NULL;

COMMIT;
