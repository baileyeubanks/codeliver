-- Atomic share-link view claims for the isolated Co-Production authority.
--
-- Callers hash the bearer token before invoking the RPC. Existing isolated
-- links remain valid because their token_hash, counters, and policy fields are
-- consumed in place. The legacy public schema is intentionally left unchanged
-- until its separately gated data migration and cutover.

BEGIN;

DO $preflight$
BEGIN
  IF pg_catalog.to_regclass('co_production.projects') IS NULL
    OR pg_catalog.to_regclass('co_production.assets') IS NULL
    OR pg_catalog.to_regclass('co_production.review_invites') IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42P01',
      MESSAGE = 'share-link claims require the isolated Co-Production authority';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attribute
    WHERE attribute.attrelid = 'co_production.review_invites'::pg_catalog.regclass
      AND attribute.attname = 'token_hash'
      AND NOT attribute.attisdropped
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attribute
    WHERE attribute.attrelid = 'co_production.review_invites'::pg_catalog.regclass
      AND attribute.attname = 'active'
      AND attribute.attnotnull
      AND NOT attribute.attisdropped
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attribute
    WHERE attribute.attrelid = 'co_production.review_invites'::pg_catalog.regclass
      AND attribute.attname = 'view_count'
      AND attribute.attnotnull
      AND NOT attribute.attisdropped
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42703',
      MESSAGE = 'review invite hash, activity, and view-count authority is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('asset_id'),
        ('version_id'),
        ('expires_at'),
        ('last_viewed_at'),
        ('max_views')
    ) AS required_column(name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute AS attribute
      WHERE attribute.attrelid =
        'co_production.review_invites'::pg_catalog.regclass
        AND attribute.attname = required_column.name
        AND NOT attribute.attisdropped
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42703',
      MESSAGE = 'review invite claim policy columns are incomplete';
  END IF;

  IF pg_catalog.to_regprocedure(
    'co_production_private.has_project_role(uuid,integer)'
  ) IS NULL OR pg_catalog.to_regprocedure(
    'co_production_private.is_staff_surface()'
  ) IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42883',
      MESSAGE = 'share-link claims require tenant and staff-surface authority helpers';
  END IF;
END
$preflight$;

CREATE TABLE co_production.share_link_view_claims (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  project_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  invite_id uuid NOT NULL,
  request_id uuid NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  resulting_view_count integer NOT NULL CHECK (resulting_view_count > 0),
  max_views_at_claim integer CHECK (
    max_views_at_claim IS NULL OR max_views_at_claim > 0
  ),
  CONSTRAINT share_link_view_claims_within_limit CHECK (
    max_views_at_claim IS NULL
    OR resulting_view_count <= max_views_at_claim
  ),
  CONSTRAINT share_link_view_claims_project_request_key
    UNIQUE (project_id, request_id),
  CONSTRAINT share_link_view_claims_asset_project_fk
    FOREIGN KEY (asset_id, project_id)
    REFERENCES co_production.assets(id, project_id)
    ON DELETE CASCADE,
  CONSTRAINT share_link_view_claims_invite_asset_fk
    FOREIGN KEY (invite_id, asset_id)
    REFERENCES co_production.review_invites(id, asset_id)
    ON DELETE CASCADE
);

CREATE INDEX share_link_view_claims_invite_claimed_idx
  ON co_production.share_link_view_claims(invite_id, claimed_at DESC);

ALTER TABLE co_production.share_link_view_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.share_link_view_claims FORCE ROW LEVEL SECURITY;

CREATE POLICY share_link_view_claims_tenant_select
  ON co_production.share_link_view_claims
  FOR SELECT
  TO authenticated
  USING (
    co_production_private.is_staff_surface()
    AND co_production_private.has_project_role(project_id, 70)
  );

CREATE OR REPLACE FUNCTION co_production.claim_share_link_view(
  p_token_hash text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $claim_share_link_view$
DECLARE
  v_invite_id uuid;
  v_asset_id uuid;
  v_version_id uuid;
  v_project_id uuid;
  v_invite_active boolean;
  v_expires_at timestamptz;
  v_current_view_count integer;
  v_max_views integer;
  v_claimed_at timestamptz;
  v_claim_id uuid;
  v_resulting_view_count integer;
  v_existing_claim_id uuid;
  v_existing_invite_id uuid;
  v_existing_claimed_at timestamptz;
  v_existing_view_count integer;
  v_existing_max_views integer;
BEGIN
  IF p_request_id IS NULL
    OR p_token_hash IS NULL
    OR p_token_hash !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_share_link_claim_request';
  END IF;

  -- The row lock serializes the policy decision, counter increment, and claim.
  SELECT
    invite.id,
    invite.asset_id,
    invite.version_id,
    asset.project_id,
    invite.active,
    invite.expires_at,
    invite.view_count,
    invite.max_views
  INTO
    v_invite_id,
    v_asset_id,
    v_version_id,
    v_project_id,
    v_invite_active,
    v_expires_at,
    v_current_view_count,
    v_max_views
  FROM co_production.review_invites AS invite
  JOIN co_production.assets AS asset
    ON asset.id = invite.asset_id
  WHERE invite.token_hash = p_token_hash
  FOR UPDATE OF invite;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'not_found',
      'replayed', false
    );
  END IF;

  -- A committed retry replays its original success even if the link has since
  -- expired, been revoked, or consumed its final allowed view.
  SELECT
    claim.id,
    claim.invite_id,
    claim.claimed_at,
    claim.resulting_view_count,
    claim.max_views_at_claim
  INTO
    v_existing_claim_id,
    v_existing_invite_id,
    v_existing_claimed_at,
    v_existing_view_count,
    v_existing_max_views
  FROM co_production.share_link_view_claims AS claim
  WHERE claim.project_id = v_project_id
    AND claim.request_id = p_request_id;

  IF FOUND THEN
    IF v_existing_invite_id IS DISTINCT FROM v_invite_id THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'share_link_claim_request_conflict';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'status', 'claimed',
      'replayed', true,
      'claim_id', v_existing_claim_id,
      'project_id', v_project_id,
      'asset_id', v_asset_id,
      'invite_id', v_invite_id,
      'version_id', v_version_id,
      'view_count', v_existing_view_count,
      'max_views', v_existing_max_views,
      'claimed_at', v_existing_claimed_at
    );
  END IF;

  -- Capture policy time only after waiting for the invite lock. A request that
  -- waited beyond expiration must not use a stale pre-lock timestamp.
  v_claimed_at := pg_catalog.clock_timestamp();

  IF NOT v_invite_active THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'revoked',
      'replayed', false
    );
  END IF;

  IF v_expires_at IS NOT NULL AND v_expires_at <= v_claimed_at THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'expired',
      'replayed', false
    );
  END IF;

  IF v_max_views IS NOT NULL AND v_current_view_count >= v_max_views THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'exhausted',
      'replayed', false,
      'view_count', v_current_view_count,
      'max_views', v_max_views
    );
  END IF;

  v_claim_id := pg_catalog.gen_random_uuid();

  BEGIN
    UPDATE co_production.review_invites AS invite
    SET
      view_count = invite.view_count + 1,
      last_viewed_at = v_claimed_at
    WHERE invite.id = v_invite_id
      AND invite.token_hash = p_token_hash
      AND invite.active
      AND (invite.expires_at IS NULL OR invite.expires_at > v_claimed_at)
      AND (invite.max_views IS NULL OR invite.view_count < invite.max_views)
    RETURNING invite.view_count, invite.max_views
    INTO v_resulting_view_count, v_max_views;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = '40001',
        MESSAGE = 'share_link_claim_state_changed';
    END IF;

    INSERT INTO co_production.share_link_view_claims (
      id,
      project_id,
      asset_id,
      invite_id,
      request_id,
      claimed_at,
      resulting_view_count,
      max_views_at_claim
    )
    VALUES (
      v_claim_id,
      v_project_id,
      v_asset_id,
      v_invite_id,
      p_request_id,
      v_claimed_at,
      v_resulting_view_count,
      v_max_views
    );
  EXCEPTION WHEN unique_violation THEN
    -- A colliding project-scoped request rolls back the nested counter update.
    -- It is either a valid concurrent replay or an idempotency binding error.
    SELECT
      claim.id,
      claim.invite_id,
      claim.claimed_at,
      claim.resulting_view_count,
      claim.max_views_at_claim
    INTO
      v_existing_claim_id,
      v_existing_invite_id,
      v_existing_claimed_at,
      v_existing_view_count,
      v_existing_max_views
    FROM co_production.share_link_view_claims AS claim
    WHERE claim.project_id = v_project_id
      AND claim.request_id = p_request_id;

    IF NOT FOUND THEN
      RAISE;
    END IF;

    IF v_existing_invite_id IS DISTINCT FROM v_invite_id THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'share_link_claim_request_conflict';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'status', 'claimed',
      'replayed', true,
      'claim_id', v_existing_claim_id,
      'project_id', v_project_id,
      'asset_id', v_asset_id,
      'invite_id', v_invite_id,
      'version_id', v_version_id,
      'view_count', v_existing_view_count,
      'max_views', v_existing_max_views,
      'claimed_at', v_existing_claimed_at
    );
  END;

  RETURN pg_catalog.jsonb_build_object(
    'status', 'claimed',
    'replayed', false,
    'claim_id', v_claim_id,
    'project_id', v_project_id,
    'asset_id', v_asset_id,
    'invite_id', v_invite_id,
    'version_id', v_version_id,
    'view_count', v_resulting_view_count,
    'max_views', v_max_views,
    'claimed_at', v_claimed_at
  );
END
$claim_share_link_view$;

REVOKE ALL ON TABLE co_production.share_link_view_claims
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT (
  id,
  project_id,
  asset_id,
  invite_id,
  claimed_at,
  resulting_view_count,
  max_views_at_claim
) ON co_production.share_link_view_claims
  TO authenticated;

REVOKE ALL ON FUNCTION co_production.claim_share_link_view(text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION co_production.claim_share_link_view(text, uuid)
  TO service_role;

COMMENT ON TABLE co_production.share_link_view_claims IS
  'Append-only successful share-link view claims. Request identity is project-scoped and bearer material is never stored.';
COMMENT ON FUNCTION co_production.claim_share_link_view(text, uuid) IS
  'Atomically claims one isolated review-link view from a SHA-256 token hash and idempotent request UUID.';

-- Executable migration invariants: fail the transaction if grants or RLS drift
-- from the contract assembled above.
DO $postflight$
DECLARE
  claims_relation pg_catalog.regclass :=
    'co_production.share_link_view_claims'::pg_catalog.regclass;
  claim_function pg_catalog.regprocedure :=
    'co_production.claim_share_link_view(text,uuid)'::pg_catalog.regprocedure;
  rls_enabled boolean;
  rls_forced boolean;
BEGIN
  SELECT relation.relrowsecurity, relation.relforcerowsecurity
  INTO rls_enabled, rls_forced
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid = claims_relation;

  IF NOT rls_enabled OR NOT rls_forced THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'share-link view claims must force row-level security';
  END IF;

  IF pg_catalog.has_table_privilege(
    'anon', claims_relation, 'SELECT'
  ) OR pg_catalog.has_table_privilege(
    'anon', claims_relation, 'INSERT'
  ) OR pg_catalog.has_table_privilege(
    'authenticated', claims_relation, 'INSERT'
  ) OR pg_catalog.has_table_privilege(
    'authenticated', claims_relation, 'UPDATE'
  ) OR pg_catalog.has_table_privilege(
    'authenticated', claims_relation, 'DELETE'
  ) OR pg_catalog.has_table_privilege(
    'authenticated', claims_relation, 'TRUNCATE'
  ) OR pg_catalog.has_table_privilege(
    'service_role', claims_relation, 'SELECT'
  ) OR pg_catalog.has_table_privilege(
    'service_role', claims_relation, 'INSERT'
  ) OR pg_catalog.has_table_privilege(
    'service_role', claims_relation, 'UPDATE'
  ) OR pg_catalog.has_table_privilege(
    'service_role', claims_relation, 'DELETE'
  ) OR pg_catalog.has_table_privilege(
    'service_role', claims_relation, 'TRUNCATE'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'share-link view claim table privileges are broader than intended';
  END IF;

  IF NOT pg_catalog.has_column_privilege(
    'authenticated', claims_relation, 'id', 'SELECT'
  ) OR pg_catalog.has_column_privilege(
    'authenticated', claims_relation, 'request_id', 'SELECT'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'share-link view claim read columns are not least privilege';
  END IF;

  IF pg_catalog.has_function_privilege(
    'anon', claim_function, 'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'authenticated', claim_function, 'EXECUTE'
  ) OR NOT pg_catalog.has_function_privilege(
    'service_role', claim_function, 'EXECUTE'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'share-link claim execution must be service-role only';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attribute
    WHERE attribute.attrelid = claims_relation
      AND attribute.attname ~ 'token'
      AND NOT attribute.attisdropped
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'share-link view claims must not persist bearer material';
  END IF;
END
$postflight$;

COMMIT;
