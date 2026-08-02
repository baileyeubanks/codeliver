-- An approval link is a capability for exactly one approval step. Email-only
-- matching is not sufficient when the same person appears in multiple steps.

BEGIN;

LOCK TABLE public.approvals IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.review_invites IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE co_production.approvals IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE co_production.review_invites IN SHARE ROW EXCLUSIVE MODE;

DO $public_review_invite_approval_keys$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.approvals'::regclass
      AND conname = 'approvals_id_asset_version_key'
  ) THEN
    ALTER TABLE public.approvals
      ADD CONSTRAINT approvals_id_asset_version_key
      UNIQUE (id, asset_id, version_id);
  END IF;
END
$public_review_invite_approval_keys$;

ALTER TABLE public.review_invites
  DROP CONSTRAINT IF EXISTS review_invites_approval_asset_version_fk;
ALTER TABLE public.review_invites
  ADD CONSTRAINT review_invites_approval_asset_version_fk
  FOREIGN KEY (approval_id, asset_id, version_id)
  REFERENCES public.approvals(id, asset_id, version_id)
  ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.enforce_review_invite_approval_binding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $public_review_invite_approval_binding$
DECLARE
  approval_email text;
  approval_status text;
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.approval_id IS NOT NULL
    AND NEW.approval_id IS DISTINCT FROM OLD.approval_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'review_invites.approval_id is immutable after link creation.';
  END IF;

  IF NEW.approval_id IS NULL THEN
    IF NEW.permissions = 'approve'
      AND (TG_OP = 'INSERT' OR OLD.permissions IS DISTINCT FROM 'approve')
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'Approval links must bind to exactly one approval step.';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.permissions <> 'approve' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Only approval links may carry an approval step binding.';
  END IF;

  SELECT approval.assignee_email, approval.status
  INTO approval_email, approval_status
  FROM public.approvals AS approval
  WHERE approval.id = NEW.approval_id
    AND approval.asset_id = NEW.asset_id
    AND approval.version_id = NEW.version_id;

  IF NOT FOUND
    OR NEW.reviewer_email IS NULL
    OR pg_catalog.lower(pg_catalog.btrim(approval_email))
      <> pg_catalog.lower(pg_catalog.btrim(NEW.reviewer_email))
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Approval link recipient must match its exact approval assignee.';
  END IF;

  IF TG_OP = 'INSERT' AND approval_status <> 'pending' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Approval links can only be created for pending approval steps.';
  END IF;

  RETURN NEW;
END
$public_review_invite_approval_binding$;

REVOKE ALL ON FUNCTION public.enforce_review_invite_approval_binding()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_review_invite_approval_binding()
  TO service_role;

DROP TRIGGER IF EXISTS review_invites_approval_binding
  ON public.review_invites;
CREATE TRIGGER review_invites_approval_binding
  BEFORE INSERT OR UPDATE OF approval_id, permissions, reviewer_email, asset_id, version_id
  ON public.review_invites
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_review_invite_approval_binding();

DO $co_production_review_invite_approval_keys$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'co_production.approvals'::regclass
      AND conname = 'co_production_approvals_id_asset_version_key'
  ) THEN
    ALTER TABLE co_production.approvals
      ADD CONSTRAINT co_production_approvals_id_asset_version_key
      UNIQUE (id, asset_id, version_id);
  END IF;
END
$co_production_review_invite_approval_keys$;

ALTER TABLE co_production.review_invites
  DROP CONSTRAINT IF EXISTS review_invites_approval_asset_version_fk;
ALTER TABLE co_production.review_invites
  ADD CONSTRAINT review_invites_approval_asset_version_fk
  FOREIGN KEY (approval_id, asset_id, version_id)
  REFERENCES co_production.approvals(id, asset_id, version_id)
  ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION co_production_private.enforce_review_invite_approval_binding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $co_production_review_invite_approval_binding$
DECLARE
  approval_email text;
  approval_status text;
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.approval_id IS NOT NULL
    AND NEW.approval_id IS DISTINCT FROM OLD.approval_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'co_production.review_invites.approval_id is immutable after link creation.';
  END IF;

  IF NEW.approval_id IS NULL THEN
    IF NEW.permissions = 'approve'
      AND (TG_OP = 'INSERT' OR OLD.permissions IS DISTINCT FROM 'approve')
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'Approval links must bind to exactly one approval step.';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.permissions <> 'approve' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Only approval links may carry an approval step binding.';
  END IF;

  SELECT approval.assignee_email, approval.status
  INTO approval_email, approval_status
  FROM co_production.approvals AS approval
  WHERE approval.id = NEW.approval_id
    AND approval.asset_id = NEW.asset_id
    AND approval.version_id = NEW.version_id;

  IF NOT FOUND
    OR NEW.reviewer_email IS NULL
    OR pg_catalog.lower(pg_catalog.btrim(approval_email))
      <> pg_catalog.lower(pg_catalog.btrim(NEW.reviewer_email))
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Approval link recipient must match its exact approval assignee.';
  END IF;

  IF TG_OP = 'INSERT' AND approval_status <> 'pending' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Approval links can only be created for pending approval steps.';
  END IF;

  RETURN NEW;
END
$co_production_review_invite_approval_binding$;

REVOKE ALL ON FUNCTION co_production_private.enforce_review_invite_approval_binding()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION co_production_private.enforce_review_invite_approval_binding()
  TO service_role;

DROP TRIGGER IF EXISTS review_invites_approval_binding
  ON co_production.review_invites;
CREATE TRIGGER review_invites_approval_binding
  BEFORE INSERT OR UPDATE OF approval_id, permissions, reviewer_email, asset_id, version_id
  ON co_production.review_invites
  FOR EACH ROW
  EXECUTE FUNCTION co_production_private.enforce_review_invite_approval_binding();

COMMIT;
