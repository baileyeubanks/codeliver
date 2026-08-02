BEGIN;

DO $$
BEGIN
  IF pg_catalog.to_regclass('co_production.review_invites') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42P01',
      MESSAGE = 'co_production.review_invites must exist before client principal binding';
  END IF;
END
$$;

ALTER TABLE co_production.review_invites
  ADD COLUMN IF NOT EXISTS reviewer_user_id uuid
  REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS review_invites_reviewer_principal_idx
  ON co_production.review_invites(reviewer_user_id, active, created_at DESC)
  WHERE reviewer_user_id IS NOT NULL;

COMMENT ON COLUMN co_production.review_invites.reviewer_user_id IS
  'Verified client principal bound server-side from the confirmed reviewer email. This column does not grant direct Data API access.';

CREATE OR REPLACE FUNCTION co_production_private.is_staff_surface()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (SELECT auth.uid()) IS NOT NULL
    AND coalesce(auth.jwt() -> 'app_metadata' ->> 'content_coop_role', '') = 'staff'
$$;

CREATE OR REPLACE FUNCTION co_production_private.has_active_surface_identity()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT co_production_private.is_staff_surface()
$$;

REVOKE ALL ON FUNCTION co_production_private.is_staff_surface()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION co_production_private.is_staff_surface()
  TO authenticated, service_role;

-- Client identities use explicit server-owned DTO routes. This restrictive
-- policy prevents their authenticated JWT from reusing staff/team RLS grants
-- through the Supabase Data API.
DO $$
DECLARE
  relation record;
BEGIN
  FOR relation IN
    SELECT schemaname, tablename
    FROM pg_catalog.pg_tables
    WHERE schemaname = 'co_production'
  LOOP
    EXECUTE pg_catalog.format(
      'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
      relation.schemaname,
      relation.tablename
    );
    EXECUTE pg_catalog.format(
      'DROP POLICY IF EXISTS co_videopro_staff_surface_boundary ON %I.%I',
      relation.schemaname,
      relation.tablename
    );
    EXECUTE pg_catalog.format(
      'CREATE POLICY co_videopro_staff_surface_boundary ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated USING (co_production_private.is_staff_surface()) WITH CHECK (co_production_private.is_staff_surface())',
      relation.schemaname,
      relation.tablename
    );
  END LOOP;
END
$$;

COMMIT;
