-- Keep every review link bound to one immutable media version.

BEGIN;

LOCK TABLE public.review_invites IN SHARE ROW EXCLUSIVE MODE;

WITH latest_asset_versions AS (
  SELECT DISTINCT ON (asset_version.asset_id)
    asset_version.asset_id,
    asset_version.id AS version_id
  FROM public.versions AS asset_version
  ORDER BY
    asset_version.asset_id,
    (asset_version.is_current IS TRUE) DESC,
    asset_version.version_number DESC,
    asset_version.created_at DESC,
    asset_version.id DESC
)
UPDATE public.review_invites AS review_invite
SET version_id = latest_asset_version.version_id
FROM latest_asset_versions AS latest_asset_version
WHERE review_invite.version_id IS NULL
  AND latest_asset_version.asset_id = review_invite.asset_id;

DO $public_review_invite_version_guard$
DECLARE
  unresolved_count bigint;
BEGIN
  SELECT count(*)
  INTO unresolved_count
  FROM public.review_invites AS review_invite
  WHERE review_invite.version_id IS NULL;

  IF unresolved_count > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23502',
      MESSAGE = format(
        'Cannot enforce public.review_invites.version_id: %s review invite(s) have no matching public.versions row.',
        unresolved_count
      ),
      HINT = 'Create an asset version for every affected invite asset, then rerun this migration.';
  END IF;
END
$public_review_invite_version_guard$;

ALTER TABLE public.review_invites
  ALTER COLUMN version_id SET NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_review_invite_version_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $review_invite_version_immutable$
BEGIN
  IF NEW.version_id IS DISTINCT FROM OLD.version_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'public.review_invites.version_id is immutable after link creation.';
  END IF;

  RETURN NEW;
END
$review_invite_version_immutable$;

REVOKE ALL ON FUNCTION public.enforce_review_invite_version_immutable()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_review_invite_version_immutable()
  TO service_role;

DROP TRIGGER IF EXISTS review_invites_version_immutable
  ON public.review_invites;
CREATE TRIGGER review_invites_version_immutable
  BEFORE UPDATE OF version_id ON public.review_invites
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_review_invite_version_immutable();

DO $co_production_review_invite_version_guard$
DECLARE
  invite_relation regclass := pg_catalog.to_regclass('co_production.review_invites');
  unresolved_count bigint;
BEGIN
  IF invite_relation IS NOT NULL THEN
    EXECUTE 'LOCK TABLE co_production.review_invites IN SHARE ROW EXCLUSIVE MODE';

    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute AS attribute
      WHERE attribute.attrelid = invite_relation
        AND attribute.attname = 'version_id'
        AND NOT attribute.attisdropped
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '42703',
        MESSAGE = 'co_production.review_invites exists without the required version_id column.';
    END IF;

    EXECUTE
      'SELECT count(*) FROM co_production.review_invites WHERE version_id IS NULL'
      INTO unresolved_count;

    IF unresolved_count > 0 THEN
      RAISE EXCEPTION USING
        ERRCODE = '23502',
        MESSAGE = format(
          'Cannot enforce co_production.review_invites.version_id: %s review invite(s) are unbound.',
          unresolved_count
        );
    END IF;

    EXECUTE
      'ALTER TABLE co_production.review_invites ALTER COLUMN version_id SET NOT NULL';

    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute AS attribute
      WHERE attribute.attrelid = invite_relation
        AND attribute.attname = 'version_id'
        AND attribute.attnotnull
        AND NOT attribute.attisdropped
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23502',
        MESSAGE = 'co_production.review_invites.version_id did not retain its NOT NULL constraint.';
    END IF;

    EXECUTE $create_co_production_version_guard$
      CREATE OR REPLACE FUNCTION co_production_private.enforce_review_invite_version_immutable()
      RETURNS trigger
      LANGUAGE plpgsql
      SET search_path = ''
      AS $review_invite_version_immutable$
      BEGIN
        IF NEW.version_id IS DISTINCT FROM OLD.version_id THEN
          RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'co_production.review_invites.version_id is immutable after link creation.';
        END IF;

        RETURN NEW;
      END
      $review_invite_version_immutable$
    $create_co_production_version_guard$;

    EXECUTE
      'REVOKE ALL ON FUNCTION co_production_private.enforce_review_invite_version_immutable() FROM PUBLIC, anon, authenticated';
    EXECUTE
      'GRANT EXECUTE ON FUNCTION co_production_private.enforce_review_invite_version_immutable() TO service_role';

    EXECUTE
      'DROP TRIGGER IF EXISTS review_invites_version_immutable ON co_production.review_invites';
    EXECUTE $create_co_production_version_trigger$
      CREATE TRIGGER review_invites_version_immutable
        BEFORE UPDATE OF version_id ON co_production.review_invites
        FOR EACH ROW
        EXECUTE FUNCTION co_production_private.enforce_review_invite_version_immutable()
    $create_co_production_version_trigger$;
  END IF;
END
$co_production_review_invite_version_guard$;

COMMIT;
