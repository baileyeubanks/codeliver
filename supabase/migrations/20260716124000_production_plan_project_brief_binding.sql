-- Bind new accepted-proposal production plans to the immutable project brief
-- without changing the public initialization contract or backfilling old plans.

BEGIN;

ALTER TABLE co_production.project_brief_revisions
  ADD CONSTRAINT project_brief_revisions_id_project_team_content_hash_key
  UNIQUE (id, project_id, team_id, content_hash);

ALTER TABLE co_production.production_plan_revisions
  ADD COLUMN source_project_brief_revision_id uuid,
  ADD COLUMN source_project_brief_content_hash text,
  ADD CONSTRAINT production_plan_revisions_project_brief_shape CHECK (
    (
      source_project_brief_revision_id IS NULL
      AND source_project_brief_content_hash IS NULL
    )
    OR (
      source_kind = 'accepted_proposal'
      AND source_project_brief_revision_id IS NOT NULL
      AND source_project_brief_content_hash IS NOT NULL
    )
  ),
  ADD CONSTRAINT production_plan_revisions_project_brief_fk
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
    ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION
  co_production_private.bind_production_plan_project_brief()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_project_brief_revision_id uuid;
  v_project_brief_content_hash text;
BEGIN
  -- These values are always derived from immutable project authority.
  NEW.source_project_brief_revision_id := NULL;
  NEW.source_project_brief_content_hash := NULL;

  IF NEW.source_kind IS DISTINCT FROM 'accepted_proposal' THEN
    RETURN NEW;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'cco:project-brief-projection:' || NEW.project_id::text,
      0
    )
  );

  SELECT brief.id, brief.content_hash
  INTO v_project_brief_revision_id, v_project_brief_content_hash
  FROM co_production.project_brief_revisions AS brief
  WHERE brief.revision_number = 1
    AND brief.project_id = NEW.project_id
    AND brief.team_id = NEW.team_id
    AND brief.proposal_handoff_receipt_id = NEW.source_receipt_id;

  IF FOUND THEN
    NEW.source_project_brief_revision_id := v_project_brief_revision_id;
    NEW.source_project_brief_content_hash := v_project_brief_content_hash;
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM co_production.project_brief_revisions AS conflicting_brief
    WHERE conflicting_brief.revision_number = 1
      AND (
        conflicting_brief.project_id = NEW.project_id
        OR conflicting_brief.proposal_handoff_receipt_id = NEW.source_receipt_id
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'production_plan_project_brief_binding_mismatch';
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER production_plan_revisions_bind_project_brief
BEFORE INSERT ON co_production.production_plan_revisions
FOR EACH ROW
EXECUTE FUNCTION
  co_production_private.bind_production_plan_project_brief();

REVOKE ALL ON FUNCTION
  co_production_private.bind_production_plan_project_brief()
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
