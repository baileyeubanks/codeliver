-- Approval is review evidence for one immutable media version. Do not reset
-- historical steps when a newer cut is uploaded; create a fresh review round.

BEGIN;

LOCK TABLE public.versions IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.approval_workflows IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.approvals IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.approval_workflows
  ADD COLUMN IF NOT EXISTS version_id uuid;
ALTER TABLE public.approvals
  ADD COLUMN IF NOT EXISTS version_id uuid;

WITH latest_versions AS (
  SELECT DISTINCT ON (version.asset_id)
    version.asset_id,
    version.id AS version_id
  FROM public.versions AS version
  ORDER BY
    version.asset_id,
    (version.is_current IS TRUE) DESC,
    version.version_number DESC,
    version.created_at DESC,
    version.id DESC
)
UPDATE public.approval_workflows AS workflow
SET version_id = latest_versions.version_id
FROM latest_versions
WHERE workflow.version_id IS NULL
  AND workflow.asset_id = latest_versions.asset_id;

WITH latest_versions AS (
  SELECT DISTINCT ON (version.asset_id)
    version.asset_id,
    version.id AS version_id
  FROM public.versions AS version
  ORDER BY
    version.asset_id,
    (version.is_current IS TRUE) DESC,
    version.version_number DESC,
    version.created_at DESC,
    version.id DESC
)
UPDATE public.approvals AS approval
SET version_id = latest_versions.version_id
FROM latest_versions
WHERE approval.version_id IS NULL
  AND approval.asset_id = latest_versions.asset_id;

DO $public_approval_round_version_guard$
DECLARE
  unresolved_workflows bigint;
  unresolved_steps bigint;
BEGIN
  SELECT count(*)
  INTO unresolved_workflows
  FROM public.approval_workflows
  WHERE version_id IS NULL;

  SELECT count(*)
  INTO unresolved_steps
  FROM public.approvals
  WHERE version_id IS NULL;

  IF unresolved_workflows > 0 OR unresolved_steps > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23502',
      MESSAGE = format(
        'Cannot bind approval authority to a media version: %s workflow(s) and %s step(s) have no matching version.',
        unresolved_workflows,
        unresolved_steps
      ),
      HINT = 'Create a media version for every affected asset, then rerun this migration.';
  END IF;
END
$public_approval_round_version_guard$;

ALTER TABLE public.approval_workflows
  ALTER COLUMN version_id SET NOT NULL;
ALTER TABLE public.approvals
  ALTER COLUMN version_id SET NOT NULL;

DO $public_approval_round_unique_keys$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.versions'::regclass
      AND conname = 'versions_id_asset_key'
  ) THEN
    ALTER TABLE public.versions
      ADD CONSTRAINT versions_id_asset_key UNIQUE (id, asset_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.approval_workflows'::regclass
      AND conname = 'approval_workflows_id_asset_version_key'
  ) THEN
    ALTER TABLE public.approval_workflows
      ADD CONSTRAINT approval_workflows_id_asset_version_key
      UNIQUE (id, asset_id, version_id);
  END IF;
END
$public_approval_round_unique_keys$;

ALTER TABLE public.approval_workflows
  DROP CONSTRAINT IF EXISTS approval_workflows_version_asset_fk;
ALTER TABLE public.approval_workflows
  ADD CONSTRAINT approval_workflows_version_asset_fk
  FOREIGN KEY (version_id, asset_id)
  REFERENCES public.versions(id, asset_id)
  ON DELETE RESTRICT;

ALTER TABLE public.approvals
  DROP CONSTRAINT IF EXISTS approvals_version_asset_fk;
ALTER TABLE public.approvals
  ADD CONSTRAINT approvals_version_asset_fk
  FOREIGN KEY (version_id, asset_id)
  REFERENCES public.versions(id, asset_id)
  ON DELETE RESTRICT;

ALTER TABLE public.approvals
  DROP CONSTRAINT IF EXISTS approvals_workflow_asset_version_fk;
ALTER TABLE public.approvals
  ADD CONSTRAINT approvals_workflow_asset_version_fk
  FOREIGN KEY (workflow_id, asset_id, version_id)
  REFERENCES public.approval_workflows(id, asset_id, version_id)
  ON DELETE CASCADE;

ALTER TABLE public.approval_workflows
  DROP CONSTRAINT IF EXISTS approval_workflows_status_check;
ALTER TABLE public.approval_workflows
  ADD CONSTRAINT approval_workflows_status_check
  CHECK (status IN ('active', 'completed', 'cancelled', 'superseded'));

CREATE UNIQUE INDEX IF NOT EXISTS approval_workflows_one_active_round_per_version_idx
  ON public.approval_workflows(asset_id, version_id)
  WHERE status = 'active';

-- Legacy direct approval rows are promoted into an explicit per-version
-- workflow before the relationship becomes mandatory.
INSERT INTO public.approval_workflows (
  asset_id,
  version_id,
  mode,
  status
)
SELECT
  approval.asset_id,
  approval.version_id,
  'sequential',
  'active'
FROM public.approvals AS approval
WHERE approval.workflow_id IS NULL
GROUP BY approval.asset_id, approval.version_id
ON CONFLICT (asset_id, version_id) WHERE status = 'active'
DO NOTHING;

UPDATE public.approvals AS approval
SET workflow_id = workflow.id
FROM public.approval_workflows AS workflow
WHERE approval.workflow_id IS NULL
  AND workflow.asset_id = approval.asset_id
  AND workflow.version_id = approval.version_id
  AND workflow.status = 'active';

DO $public_approval_round_workflow_guard$
DECLARE
  unbound_steps bigint;
BEGIN
  SELECT count(*)
  INTO unbound_steps
  FROM public.approvals
  WHERE workflow_id IS NULL;

  IF unbound_steps > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23502',
      MESSAGE = format(
        'Cannot enforce version-scoped approval rounds: %s approval step(s) remain without a workflow.',
        unbound_steps
      );
  END IF;
END
$public_approval_round_workflow_guard$;

ALTER TABLE public.approvals
  ALTER COLUMN workflow_id SET NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_approval_round_version_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $public_approval_round_version_immutable$
BEGIN
  IF NEW.version_id IS DISTINCT FROM OLD.version_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Approval workflow and step version_id values are immutable after creation.';
  END IF;

  RETURN NEW;
END
$public_approval_round_version_immutable$;

REVOKE ALL ON FUNCTION public.enforce_approval_round_version_immutable()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_approval_round_version_immutable()
  TO service_role;

DROP TRIGGER IF EXISTS approval_workflows_version_immutable
  ON public.approval_workflows;
CREATE TRIGGER approval_workflows_version_immutable
  BEFORE UPDATE OF version_id ON public.approval_workflows
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_approval_round_version_immutable();

DROP TRIGGER IF EXISTS approvals_version_immutable
  ON public.approvals;
CREATE TRIGGER approvals_version_immutable
  BEFORE UPDATE OF version_id ON public.approvals
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_approval_round_version_immutable();

LOCK TABLE co_production.versions IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE co_production.approval_workflows IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE co_production.approvals IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE co_production.approval_workflows
  ADD COLUMN IF NOT EXISTS version_id uuid;
ALTER TABLE co_production.approvals
  ADD COLUMN IF NOT EXISTS version_id uuid;

WITH latest_versions AS (
  SELECT DISTINCT ON (version.asset_id)
    version.asset_id,
    version.id AS version_id
  FROM co_production.versions AS version
  ORDER BY
    version.asset_id,
    (version.is_current IS TRUE) DESC,
    version.version_number DESC,
    version.created_at DESC,
    version.id DESC
)
UPDATE co_production.approval_workflows AS workflow
SET version_id = latest_versions.version_id
FROM latest_versions
WHERE workflow.version_id IS NULL
  AND workflow.asset_id = latest_versions.asset_id;

WITH latest_versions AS (
  SELECT DISTINCT ON (version.asset_id)
    version.asset_id,
    version.id AS version_id
  FROM co_production.versions AS version
  ORDER BY
    version.asset_id,
    (version.is_current IS TRUE) DESC,
    version.version_number DESC,
    version.created_at DESC,
    version.id DESC
)
UPDATE co_production.approvals AS approval
SET version_id = latest_versions.version_id
FROM latest_versions
WHERE approval.version_id IS NULL
  AND approval.asset_id = latest_versions.asset_id;

DO $co_production_approval_round_version_guard$
DECLARE
  unresolved_workflows bigint;
  unresolved_steps bigint;
BEGIN
  SELECT count(*)
  INTO unresolved_workflows
  FROM co_production.approval_workflows
  WHERE version_id IS NULL;

  SELECT count(*)
  INTO unresolved_steps
  FROM co_production.approvals
  WHERE version_id IS NULL;

  IF unresolved_workflows > 0 OR unresolved_steps > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23502',
      MESSAGE = format(
        'Cannot bind co_production approval authority to a media version: %s workflow(s) and %s step(s) have no matching version.',
        unresolved_workflows,
        unresolved_steps
      );
  END IF;
END
$co_production_approval_round_version_guard$;

ALTER TABLE co_production.approval_workflows
  ALTER COLUMN version_id SET NOT NULL;
ALTER TABLE co_production.approvals
  ALTER COLUMN version_id SET NOT NULL;

DO $co_production_approval_round_unique_keys$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'co_production.versions'::regclass
      AND conname = 'co_production_versions_id_asset_key'
  ) THEN
    ALTER TABLE co_production.versions
      ADD CONSTRAINT co_production_versions_id_asset_key UNIQUE (id, asset_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'co_production.approval_workflows'::regclass
      AND conname = 'approval_workflows_id_asset_version_key'
  ) THEN
    ALTER TABLE co_production.approval_workflows
      ADD CONSTRAINT approval_workflows_id_asset_version_key
      UNIQUE (id, asset_id, version_id);
  END IF;
END
$co_production_approval_round_unique_keys$;

ALTER TABLE co_production.approval_workflows
  DROP CONSTRAINT IF EXISTS approval_workflows_version_asset_fk;
ALTER TABLE co_production.approval_workflows
  ADD CONSTRAINT approval_workflows_version_asset_fk
  FOREIGN KEY (version_id, asset_id)
  REFERENCES co_production.versions(id, asset_id)
  ON DELETE RESTRICT;

ALTER TABLE co_production.approvals
  DROP CONSTRAINT IF EXISTS approvals_version_asset_fk;
ALTER TABLE co_production.approvals
  ADD CONSTRAINT approvals_version_asset_fk
  FOREIGN KEY (version_id, asset_id)
  REFERENCES co_production.versions(id, asset_id)
  ON DELETE RESTRICT;

ALTER TABLE co_production.approvals
  DROP CONSTRAINT IF EXISTS approvals_workflow_asset_version_fk;
ALTER TABLE co_production.approvals
  ADD CONSTRAINT approvals_workflow_asset_version_fk
  FOREIGN KEY (workflow_id, asset_id, version_id)
  REFERENCES co_production.approval_workflows(id, asset_id, version_id)
  ON DELETE CASCADE;

ALTER TABLE co_production.approval_workflows
  DROP CONSTRAINT IF EXISTS approval_workflows_status_check;
ALTER TABLE co_production.approval_workflows
  ADD CONSTRAINT approval_workflows_status_check
  CHECK (status IN ('active', 'completed', 'cancelled', 'superseded'));

CREATE UNIQUE INDEX IF NOT EXISTS co_production_approval_workflows_one_active_round_per_version_idx
  ON co_production.approval_workflows(asset_id, version_id)
  WHERE status = 'active';

INSERT INTO co_production.approval_workflows (
  asset_id,
  version_id,
  mode,
  status
)
SELECT
  approval.asset_id,
  approval.version_id,
  'sequential',
  'active'
FROM co_production.approvals AS approval
WHERE approval.workflow_id IS NULL
GROUP BY approval.asset_id, approval.version_id
ON CONFLICT (asset_id, version_id) WHERE status = 'active'
DO NOTHING;

UPDATE co_production.approvals AS approval
SET workflow_id = workflow.id
FROM co_production.approval_workflows AS workflow
WHERE approval.workflow_id IS NULL
  AND workflow.asset_id = approval.asset_id
  AND workflow.version_id = approval.version_id
  AND workflow.status = 'active';

DO $co_production_approval_round_workflow_guard$
DECLARE
  unbound_steps bigint;
BEGIN
  SELECT count(*)
  INTO unbound_steps
  FROM co_production.approvals
  WHERE workflow_id IS NULL;

  IF unbound_steps > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23502',
      MESSAGE = format(
        'Cannot enforce co_production version-scoped approval rounds: %s approval step(s) remain without a workflow.',
        unbound_steps
      );
  END IF;
END
$co_production_approval_round_workflow_guard$;

ALTER TABLE co_production.approvals
  ALTER COLUMN workflow_id SET NOT NULL;

CREATE OR REPLACE FUNCTION co_production_private.enforce_approval_round_version_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $co_production_approval_round_version_immutable$
BEGIN
  IF NEW.version_id IS DISTINCT FROM OLD.version_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Approval workflow and step version_id values are immutable after creation.';
  END IF;

  RETURN NEW;
END
$co_production_approval_round_version_immutable$;

REVOKE ALL ON FUNCTION co_production_private.enforce_approval_round_version_immutable()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION co_production_private.enforce_approval_round_version_immutable()
  TO service_role;

DROP TRIGGER IF EXISTS approval_workflows_version_immutable
  ON co_production.approval_workflows;
CREATE TRIGGER approval_workflows_version_immutable
  BEFORE UPDATE OF version_id ON co_production.approval_workflows
  FOR EACH ROW
  EXECUTE FUNCTION co_production_private.enforce_approval_round_version_immutable();

DROP TRIGGER IF EXISTS approvals_version_immutable
  ON co_production.approvals;
CREATE TRIGGER approvals_version_immutable
  BEFORE UPDATE OF version_id ON co_production.approvals
  FOR EACH ROW
  EXECUTE FUNCTION co_production_private.enforce_approval_round_version_immutable();

CREATE OR REPLACE FUNCTION co_production.create_asset_version(
  target_asset_id uuid,
  new_file_url text,
  new_file_size bigint DEFAULT NULL,
  new_notes text DEFAULT NULL,
  new_thumbnail_url text DEFAULT NULL,
  new_duration_seconds double precision DEFAULT NULL,
  new_resolution text DEFAULT NULL
)
RETURNS co_production.versions
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $create_asset_version$
DECLARE
  actor_user_id uuid := (SELECT auth.uid());
  actor_display_name text := NULLIF(
    pg_catalog.btrim((SELECT auth.jwt()) ->> 'email'),
    ''
  );
  locked_asset co_production.assets%ROWTYPE;
  previous_version_id uuid;
  previous_version_number integer;
  next_version_number integer;
  approval_count bigint;
  previous_step_count bigint := 0;
  cloned_step_count bigint := 0;
  previous_workflow_mode text;
  created_workflow_id uuid;
  created_version co_production.versions%ROWTYPE;
  normalized_notes text := NULLIF(pg_catalog.btrim(new_notes), '');
BEGIN
  IF actor_user_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '28000',
      MESSAGE = 'An authenticated actor is required to create an asset version.';
  END IF;

  IF new_file_url IS NULL OR pg_catalog.btrim(new_file_url) = '' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'new_file_url must be a non-empty media reference.';
  END IF;

  IF pg_catalog.char_length(new_file_url) > 8192 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'new_file_url exceeds the 8192 character limit.';
  END IF;

  IF new_thumbnail_url IS NOT NULL AND (
    pg_catalog.btrim(new_thumbnail_url) = ''
    OR pg_catalog.char_length(new_thumbnail_url) > 8192
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'new_thumbnail_url must be a non-empty media reference of at most 8192 characters.';
  END IF;

  IF new_file_size IS NOT NULL AND new_file_size < 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'new_file_size must be non-negative.';
  END IF;

  IF new_duration_seconds IS NOT NULL AND (
    new_duration_seconds < 0 OR new_duration_seconds > 604800
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'new_duration_seconds must be finite and between 0 and 604800.';
  END IF;

  IF new_notes IS NOT NULL AND pg_catalog.char_length(new_notes) > 2000 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'new_notes exceeds the 2000 character limit.';
  END IF;

  IF new_resolution IS NOT NULL AND pg_catalog.char_length(new_resolution) > 64 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'new_resolution exceeds the 64 character limit.';
  END IF;

  SELECT asset.*
  INTO locked_asset
  FROM co_production.assets AS asset
  WHERE asset.id = target_asset_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Asset is unavailable or the actor lacks access.';
  END IF;

  SELECT pg_catalog.count(*)
  INTO approval_count
  FROM co_production.approvals AS approval
  WHERE approval.asset_id = target_asset_id;

  IF approval_count > 0 AND NOT co_production_private.has_asset_role(
    target_asset_id,
    70
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Producer authority is required to start a new approval round.';
  END IF;

  SELECT version.id, version.version_number
  INTO previous_version_id, previous_version_number
  FROM co_production.versions AS version
  WHERE version.asset_id = target_asset_id
  ORDER BY version.version_number DESC
  LIMIT 1;

  next_version_number := COALESCE(previous_version_number, 0) + 1;

  SELECT pg_catalog.count(*)
  INTO previous_step_count
  FROM co_production.approvals AS approval
  WHERE approval.asset_id = target_asset_id
    AND approval.version_id = previous_version_id;

  SELECT workflow.mode
  INTO previous_workflow_mode
  FROM co_production.approval_workflows AS workflow
  WHERE workflow.asset_id = target_asset_id
    AND workflow.version_id = previous_version_id
    AND workflow.status = 'active'
  ORDER BY workflow.updated_at DESC, workflow.created_at DESC, workflow.id DESC
  LIMIT 1
  FOR UPDATE;

  UPDATE co_production.versions AS version
  SET
    is_current = false,
    updated_at = pg_catalog.now()
  WHERE version.asset_id = target_asset_id
    AND version.is_current;

  INSERT INTO co_production.versions (
    asset_id,
    version_number,
    file_url,
    file_size,
    notes,
    uploaded_by,
    is_current,
    thumbnail_url,
    duration_seconds,
    resolution
  ) VALUES (
    target_asset_id,
    next_version_number,
    new_file_url,
    new_file_size,
    normalized_notes,
    actor_user_id,
    true,
    new_thumbnail_url,
    new_duration_seconds,
    new_resolution
  )
  RETURNING * INTO created_version;

  UPDATE co_production.assets AS asset
  SET
    file_url = new_file_url,
    file_size = new_file_size,
    duration_seconds = COALESCE(
      new_duration_seconds,
      locked_asset.duration_seconds
    ),
    status = 'in_review',
    updated_at = pg_catalog.now()
  WHERE asset.id = target_asset_id;

  -- Comment threads stay on their source version. A carry-forward command must
  -- preserve root/reply structure and provenance explicitly; this transaction
  -- never makes a silent partial copy.
  IF previous_workflow_mode IS NOT NULL OR previous_step_count > 0 THEN
    UPDATE co_production.approval_workflows AS workflow
    SET
      status = 'superseded',
      updated_at = pg_catalog.now()
    WHERE workflow.asset_id = target_asset_id
      AND workflow.version_id = previous_version_id
      AND workflow.status = 'active';

    INSERT INTO co_production.approval_workflows (
      asset_id,
      version_id,
      mode,
      created_by,
      status
    ) VALUES (
      target_asset_id,
      created_version.id,
      COALESCE(previous_workflow_mode, 'sequential'),
      actor_user_id,
      'active'
    )
    RETURNING id INTO created_workflow_id;

    IF previous_step_count > 0 THEN
      INSERT INTO co_production.approvals (
        asset_id,
        version_id,
        workflow_id,
        step_order,
        role_label,
        assignee_email,
        assignee_id,
        status
      )
      SELECT
        target_asset_id,
        created_version.id,
        created_workflow_id,
        approval.step_order,
        approval.role_label,
        approval.assignee_email,
        approval.assignee_id,
        'pending'
      FROM co_production.approvals AS approval
      WHERE approval.asset_id = target_asset_id
        AND approval.version_id = previous_version_id
      ORDER BY approval.step_order, approval.created_at, approval.id;

      GET DIAGNOSTICS cloned_step_count = ROW_COUNT;
      IF cloned_step_count <> previous_step_count THEN
        RAISE EXCEPTION USING
          ERRCODE = '42501',
          MESSAGE = 'RLS prevented one or more approval steps from being cloned into the new version round.';
      END IF;
    END IF;
  END IF;

  INSERT INTO co_production.activity_log (
    asset_id,
    actor_id,
    actor_name,
    action,
    details
  ) VALUES
    (
      target_asset_id,
      actor_user_id,
      COALESCE(actor_display_name, actor_user_id::text),
      'uploaded_version',
      pg_catalog.jsonb_build_object(
        'version_id', created_version.id,
        'version_number', next_version_number,
        'notes', normalized_notes
      )
    ),
    (
      target_asset_id,
      actor_user_id,
      COALESCE(actor_display_name, actor_user_id::text),
      'review_round_started',
      pg_catalog.jsonb_build_object(
        'previous_version_id', previous_version_id,
        'version_id', created_version.id,
        'version_number', next_version_number,
        'cloned_approval_steps', cloned_step_count,
        'comments_retained_on_previous_version', true
      )
    );

  RETURN created_version;
END
$create_asset_version$;

COMMIT;
