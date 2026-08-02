-- Enterprise media ingest authority only.
--
-- This migration records quota-backed upload intent, resumable progress,
-- evidence-gated processing, and a disabled publication outbox. It does not
-- write media bytes, call a provider, run a worker, issue quota, authorize a
-- worker, enable publication, or dispatch an outbox record.

BEGIN;

DO $preflight$
BEGIN
  IF pg_catalog.current_setting('server_version_num')::integer < 150000 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'media_ingest_authority_requires_postgresql_15';
  END IF;

  IF pg_catalog.to_regclass('co_production.projects') IS NULL
    OR pg_catalog.to_regclass('co_production.folders') IS NULL
    OR pg_catalog.to_regprocedure(
      'co_production_private.has_project_role(uuid,integer)'
    ) IS NULL
    OR pg_catalog.to_regprocedure('extensions.digest(bytea,text)') IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'media_ingest_authority_prerequisites_missing';
  END IF;
END
$preflight$;

CREATE TABLE co_production.media_ingest_quota_reservations (
  reservation_ref text PRIMARY KEY CHECK (
    reservation_ref = lower(btrim(reservation_ref))
    AND reservation_ref ~ '^[a-z0-9][a-z0-9._:/-]{15,199}$'
  ),
  tenant_kind text NOT NULL CHECK (tenant_kind IN ('personal', 'team')),
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL
    REFERENCES co_production.projects(id) ON DELETE RESTRICT,
  reserved_bytes bigint NOT NULL CHECK (
    reserved_bytes BETWEEN 1 AND 9007199254740991
  ),
  issued_by text NOT NULL CHECK (
    length(btrim(issued_by)) BETWEEN 1 AND 160
    AND issued_by !~ '[[:cntrl:]]'
  ),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  consumed_by_session_id uuid,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT media_ingest_quota_reservations_scope_key
    UNIQUE (reservation_ref, tenant_kind, tenant_id, project_id),
  CONSTRAINT media_ingest_quota_reservations_expiry_shape CHECK (
    expires_at > issued_at
  ),
  CONSTRAINT media_ingest_quota_reservations_consumption_shape CHECK (
    (consumed_at IS NULL) = (consumed_by_session_id IS NULL)
    AND (
      consumed_at IS NULL
      OR (
        revoked_at IS NULL
        AND consumed_at >= issued_at
        AND consumed_at < expires_at
      )
    )
  )
);

CREATE TABLE co_production.media_ingest_sessions (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  schema_version text NOT NULL DEFAULT 'cco.media-ingest-authority.v1' CHECK (
    schema_version = 'cco.media-ingest-authority.v1'
  ),
  tenant_kind text NOT NULL CHECK (tenant_kind IN ('personal', 'team')),
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL
    REFERENCES co_production.projects(id) ON DELETE RESTRICT,
  folder_id uuid,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL CHECK (
    idempotency_key = lower(btrim(idempotency_key))
    AND idempotency_key ~ '^[a-z0-9][a-z0-9._:-]{15,199}$'
  ),
  intent_fingerprint text NOT NULL CHECK (
    intent_fingerprint ~ '^sha256:[0-9a-f]{64}$'
  ),
  quota_reservation_ref text NOT NULL,
  quota_reserved_bytes bigint NOT NULL CHECK (
    quota_reserved_bytes BETWEEN 1 AND 9007199254740991
  ),
  quota_consumed_at timestamptz NOT NULL,
  source_filename text NOT NULL CHECK (
    source_filename = btrim(source_filename)
    AND length(source_filename) BETWEEN 1 AND 512
    AND source_filename !~ '[\\/]'
    AND source_filename !~ '[[:cntrl:]]'
  ),
  source_size bigint NOT NULL CHECK (
    source_size BETWEEN 1 AND 9007199254740991
  ),
  source_mime_type text NOT NULL CHECK (
    source_mime_type = lower(btrim(source_mime_type))
    AND length(source_mime_type) <= 255
    AND source_mime_type ~ '^[a-z0-9!#$&^_.+-]+/[a-z0-9!#$&^_.+-]+$'
  ),
  source_expected_sha256 text NOT NULL CHECK (
    source_expected_sha256 ~ '^[0-9a-f]{64}$'
  ),
  upload_offset bigint NOT NULL DEFAULT 0 CHECK (
    upload_offset >= 0 AND upload_offset <= source_size
  ),
  upload_completed_at timestamptz,
  state text NOT NULL DEFAULT 'receiving' CHECK (
    state IN (
      'receiving',
      'verification_pending',
      'verifying',
      'scan_pending',
      'scanning',
      'quarantined',
      'transcode_pending',
      'transcoding',
      'ready',
      'failed',
      'cancelled'
    )
  ),
  available_at timestamptz NOT NULL DEFAULT now(),
  source_observed_size bigint CHECK (
    source_observed_size IS NULL
    OR source_observed_size BETWEEN 0 AND 9007199254740991
  ),
  source_observed_sha256 text CHECK (
    source_observed_sha256 IS NULL
    OR source_observed_sha256 ~ '^[0-9a-f]{64}$'
  ),
  source_verified_at timestamptz,
  scan_state text NOT NULL DEFAULT 'blocked' CHECK (
    scan_state IN ('blocked', 'pending', 'scanning', 'clean', 'infected', 'error')
  ),
  scan_engine text CHECK (
    scan_engine IS NULL
    OR (
      scan_engine = btrim(scan_engine)
      AND length(scan_engine) BETWEEN 1 AND 160
      AND scan_engine !~ '[[:cntrl:]]'
    )
  ),
  scan_receipt_hash text CHECK (
    scan_receipt_hash IS NULL
    OR scan_receipt_hash ~ '^[0-9a-f]{64}$'
  ),
  scan_subject_sha256 text CHECK (
    scan_subject_sha256 IS NULL
    OR scan_subject_sha256 ~ '^[0-9a-f]{64}$'
  ),
  scanned_at timestamptz,
  transcode_state text NOT NULL DEFAULT 'blocked' CHECK (
    transcode_state IN ('blocked', 'pending', 'processing', 'ready', 'failed')
  ),
  transcode_receipt_hash text CHECK (
    transcode_receipt_hash IS NULL
    OR transcode_receipt_hash ~ '^[0-9a-f]{64}$'
  ),
  transcode_ready_at timestamptz,
  publication_state text NOT NULL DEFAULT 'blocked' CHECK (
    publication_state IN ('blocked', 'eligible')
  ),
  publication_enabled boolean NOT NULL DEFAULT false,
  work_stage text CHECK (
    work_stage IS NULL OR work_stage IN ('verify', 'scan', 'transcode')
  ),
  work_attempt_count integer NOT NULL DEFAULT 0 CHECK (
    work_attempt_count >= 0
  ),
  verify_attempt_count integer NOT NULL DEFAULT 0 CHECK (
    verify_attempt_count >= 0
  ),
  scan_attempt_count integer NOT NULL DEFAULT 0 CHECK (
    scan_attempt_count >= 0
  ),
  transcode_attempt_count integer NOT NULL DEFAULT 0 CHECK (
    transcode_attempt_count >= 0
  ),
  max_work_attempts integer NOT NULL DEFAULT 12 CHECK (
    max_work_attempts BETWEEN 3 AND 24
  ),
  lease_worker_id uuid,
  lease_owner text CHECK (
    lease_owner IS NULL
    OR (
      length(lease_owner) BETWEEN 1 AND 160
      AND lease_owner !~ '[[:cntrl:]]'
    )
  ),
  leased_at timestamptz,
  lease_expires_at timestamptz,
  lease_fence bigint NOT NULL DEFAULT 0 CHECK (lease_fence >= 0),
  failure_code text CHECK (
    failure_code IS NULL
    OR failure_code ~ '^[a-z0-9][a-z0-9._:-]{0,119}$'
  ),
  failed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT media_ingest_sessions_id_tenant_key
    UNIQUE (id, tenant_kind, tenant_id),
  CONSTRAINT media_ingest_sessions_tenant_idempotency_key
    UNIQUE (tenant_kind, tenant_id, idempotency_key),
  CONSTRAINT media_ingest_sessions_quota_scope_fk
    FOREIGN KEY (
      quota_reservation_ref,
      tenant_kind,
      tenant_id,
      project_id
    )
    REFERENCES co_production.media_ingest_quota_reservations (
      reservation_ref,
      tenant_kind,
      tenant_id,
      project_id
    )
    ON DELETE RESTRICT,
  CONSTRAINT media_ingest_sessions_folder_project_fk
    FOREIGN KEY (folder_id, project_id)
    REFERENCES co_production.folders(id, project_id)
    ON DELETE RESTRICT,
  CONSTRAINT media_ingest_sessions_quota_shape CHECK (
    quota_reserved_bytes >= source_size
  ),
  CONSTRAINT media_ingest_sessions_upload_completion_shape CHECK (
    (upload_offset = source_size) = (upload_completed_at IS NOT NULL)
  ),
  CONSTRAINT media_ingest_sessions_source_evidence_shape CHECK (
    (
      source_observed_size IS NULL
      AND source_observed_sha256 IS NULL
      AND source_verified_at IS NULL
    )
    OR (
      source_observed_size IS NOT NULL
      AND source_observed_sha256 IS NOT NULL
      AND (
        (
          source_verified_at IS NULL
          AND state = 'failed'
          AND (
            source_observed_size <> source_size
            OR source_observed_sha256 <> source_expected_sha256
          )
        )
        OR (
          source_verified_at IS NOT NULL
          AND source_observed_size = source_size
          AND source_observed_sha256 = source_expected_sha256
        )
      )
    )
  ),
  CONSTRAINT media_ingest_sessions_scan_evidence_shape CHECK (
    (
      scan_state IN ('blocked', 'pending', 'scanning')
      AND scan_engine IS NULL
      AND scan_receipt_hash IS NULL
      AND scan_subject_sha256 IS NULL
      AND scanned_at IS NULL
    )
    OR (
      scan_state IN ('clean', 'infected', 'error')
      AND scan_engine IS NOT NULL
      AND scan_receipt_hash IS NOT NULL
      AND scan_subject_sha256 IS NOT NULL
      AND scanned_at IS NOT NULL
      AND source_verified_at IS NOT NULL
    )
  ),
  CONSTRAINT media_ingest_sessions_clean_scan_gate CHECK (
    scan_state <> 'clean'
    OR scan_subject_sha256 = source_expected_sha256
  ),
  CONSTRAINT media_ingest_sessions_transcode_evidence_shape CHECK (
    (
      transcode_state <> 'ready'
      AND transcode_receipt_hash IS NULL
      AND transcode_ready_at IS NULL
    )
    OR (
      transcode_state = 'ready'
      AND transcode_receipt_hash IS NOT NULL
      AND transcode_ready_at IS NOT NULL
      AND scan_state = 'clean'
      AND source_verified_at IS NOT NULL
    )
  ),
  CONSTRAINT media_ingest_sessions_publication_gate CHECK (
    (
      publication_state = 'blocked'
      AND state <> 'ready'
      AND publication_enabled = false
    )
    OR (
      publication_state = 'eligible'
      AND state = 'ready'
      AND upload_offset = source_size
      AND source_verified_at IS NOT NULL
      AND source_observed_size = source_size
      AND source_observed_sha256 = source_expected_sha256
      AND scan_state = 'clean'
      AND scan_engine IS NOT NULL
      AND scan_receipt_hash IS NOT NULL
      AND scan_subject_sha256 = source_expected_sha256
      AND scanned_at IS NOT NULL
      AND transcode_state = 'ready'
      AND transcode_receipt_hash IS NOT NULL
      AND transcode_ready_at IS NOT NULL
    )
  ),
  CONSTRAINT media_ingest_sessions_lease_shape CHECK (
    (
      state IN ('verifying', 'scanning', 'transcoding')
      AND work_stage = CASE state
        WHEN 'verifying' THEN 'verify'
        WHEN 'scanning' THEN 'scan'
        WHEN 'transcoding' THEN 'transcode'
      END
      AND lease_worker_id IS NOT NULL
      AND lease_owner = 'worker:' || lease_worker_id::text
      AND leased_at IS NOT NULL
      AND lease_expires_at IS NOT NULL
      AND lease_expires_at > leased_at
    )
    OR (
      state NOT IN ('verifying', 'scanning', 'transcoding')
      AND work_stage IS NULL
      AND lease_worker_id IS NULL
      AND lease_owner IS NULL
      AND leased_at IS NULL
      AND lease_expires_at IS NULL
    )
  ),
  CONSTRAINT media_ingest_sessions_attempt_shape CHECK (
    verify_attempt_count <= max_work_attempts
    AND scan_attempt_count <= max_work_attempts
    AND transcode_attempt_count <= max_work_attempts
    AND work_attempt_count = (
      verify_attempt_count
      + scan_attempt_count
      + transcode_attempt_count
    )
    AND lease_fence = work_attempt_count
  ),
  CONSTRAINT media_ingest_sessions_state_shape CHECK (
    (
      state = 'receiving'
      AND upload_offset < source_size
      AND source_observed_size IS NULL
      AND scan_state = 'blocked'
      AND transcode_state = 'blocked'
    )
    OR (
      state IN ('verification_pending', 'verifying')
      AND upload_offset = source_size
      AND source_observed_size IS NULL
      AND scan_state = 'blocked'
      AND transcode_state = 'blocked'
    )
    OR (
      state = 'scan_pending'
      AND source_verified_at IS NOT NULL
      AND scan_state = 'pending'
      AND transcode_state = 'blocked'
    )
    OR (
      state = 'scanning'
      AND source_verified_at IS NOT NULL
      AND scan_state = 'scanning'
      AND transcode_state = 'blocked'
    )
    OR (
      state = 'quarantined'
      AND source_verified_at IS NOT NULL
      AND scan_state IN ('infected', 'error')
      AND scan_subject_sha256 = source_expected_sha256
      AND transcode_state = 'blocked'
    )
    OR (
      state = 'transcode_pending'
      AND scan_state = 'clean'
      AND transcode_state = 'pending'
    )
    OR (
      state = 'transcoding'
      AND scan_state = 'clean'
      AND transcode_state = 'processing'
    )
    OR (
      state = 'ready'
      AND scan_state = 'clean'
      AND transcode_state = 'ready'
    )
    OR state IN ('failed', 'cancelled')
  ),
  CONSTRAINT media_ingest_sessions_terminal_shape CHECK (
    (
      state = 'failed'
      AND failure_code IS NOT NULL
      AND failed_at IS NOT NULL
      AND cancelled_at IS NULL
      AND cancelled_by IS NULL
    )
    OR (
      state = 'cancelled'
      AND failure_code IS NULL
      AND failed_at IS NULL
      AND cancelled_at IS NOT NULL
      AND cancelled_by IS NOT NULL
    )
    OR (
      state NOT IN ('failed', 'cancelled')
      AND failure_code IS NULL
      AND failed_at IS NULL
      AND cancelled_at IS NULL
      AND cancelled_by IS NULL
    )
  )
);

ALTER TABLE co_production.media_ingest_quota_reservations
ADD CONSTRAINT media_ingest_quota_reservations_consumed_session_fk
FOREIGN KEY (consumed_by_session_id)
REFERENCES co_production.media_ingest_sessions(id)
ON DELETE RESTRICT;

CREATE TABLE co_production.media_ingest_worker_authorizations (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  worker_id uuid NOT NULL,
  jwt_subject uuid NOT NULL,
  tenant_kind text NOT NULL CHECK (tenant_kind IN ('personal', 'team')),
  tenant_id uuid NOT NULL,
  stage text NOT NULL CHECK (stage IN ('verify', 'scan', 'transcode')),
  enabled boolean NOT NULL DEFAULT false,
  not_before timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  authorized_by text NOT NULL CHECK (
    length(btrim(authorized_by)) BETWEEN 1 AND 160
    AND authorized_by !~ '[[:cntrl:]]'
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT media_ingest_worker_authorizations_scope_key
    UNIQUE (
      worker_id,
      jwt_subject,
      tenant_kind,
      tenant_id,
      stage
    ),
  CONSTRAINT media_ingest_worker_authorizations_window CHECK (
    expires_at IS NULL OR expires_at > not_before
  ),
  CONSTRAINT media_ingest_worker_authorizations_enabled_shape CHECK (
    NOT enabled OR revoked_at IS NULL
  )
);

CREATE TABLE co_production.media_ingest_events (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  schema_version text NOT NULL CHECK (
    schema_version = 'cco.media-ingest-authority.v1'
  ),
  tenant_kind text NOT NULL CHECK (tenant_kind IN ('personal', 'team')),
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL
    REFERENCES co_production.projects(id) ON DELETE RESTRICT,
  session_id uuid NOT NULL,
  event_sequence integer NOT NULL CHECK (event_sequence > 0),
  request_id uuid,
  event_type text NOT NULL CHECK (
    event_type = lower(btrim(event_type))
    AND event_type ~ '^[a-z][a-z0-9_.-]{2,79}$'
  ),
  from_state text,
  to_state text NOT NULL,
  upload_offset bigint NOT NULL CHECK (upload_offset >= 0),
  work_stage text CHECK (
    work_stage IS NULL OR work_stage IN ('verify', 'scan', 'transcode')
  ),
  work_attempt_count integer NOT NULL CHECK (work_attempt_count >= 0),
  verify_attempt_count integer NOT NULL CHECK (verify_attempt_count >= 0),
  scan_attempt_count integer NOT NULL CHECK (scan_attempt_count >= 0),
  transcode_attempt_count integer NOT NULL CHECK (
    transcode_attempt_count >= 0
  ),
  lease_worker_id uuid,
  lease_owner text,
  leased_at timestamptz,
  lease_expires_at timestamptz,
  lease_fence bigint NOT NULL CHECK (lease_fence >= 0),
  actor_ref text NOT NULL CHECK (
    length(btrim(actor_ref)) BETWEEN 1 AND 160
    AND actor_ref !~ '[[:cntrl:]]'
  ),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
    jsonb_typeof(detail) = 'object'
    AND pg_column_size(detail) <= 65536
  ),
  previous_event_fingerprint text NOT NULL CHECK (
    previous_event_fingerprint ~ '^sha256:[0-9a-f]{64}$'
  ),
  event_fingerprint text NOT NULL UNIQUE CHECK (
    event_fingerprint ~ '^sha256:[0-9a-f]{64}$'
  ),
  occurred_at timestamptz NOT NULL,
  CONSTRAINT media_ingest_events_session_fk
    FOREIGN KEY (session_id, tenant_kind, tenant_id)
    REFERENCES co_production.media_ingest_sessions(id, tenant_kind, tenant_id)
    ON DELETE RESTRICT,
  UNIQUE (session_id, event_sequence),
  UNIQUE (session_id, request_id)
);

CREATE TABLE co_production.media_ingest_publication_outbox (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  schema_version text NOT NULL DEFAULT 'cco.media-ingest-authority.v1' CHECK (
    schema_version = 'cco.media-ingest-authority.v1'
  ),
  tenant_kind text NOT NULL CHECK (tenant_kind IN ('personal', 'team')),
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL
    REFERENCES co_production.projects(id) ON DELETE RESTRICT,
  session_id uuid NOT NULL,
  output_digest text NOT NULL CHECK (
    output_digest ~ '^[0-9a-f]{64}$'
  ),
  request_id uuid NOT NULL,
  claim_fingerprint text NOT NULL CHECK (
    claim_fingerprint ~ '^sha256:[0-9a-f]{64}$'
  ),
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'claimed', 'published', 'failed')
  ),
  dispatch_enabled boolean NOT NULL DEFAULT false,
  claimed_by text NOT NULL CHECK (
    length(btrim(claimed_by)) BETWEEN 1 AND 160
    AND claimed_by !~ '[[:cntrl:]]'
  ),
  claimed_at timestamptz NOT NULL,
  published_at timestamptz,
  failure_code text CHECK (
    failure_code IS NULL
    OR failure_code ~ '^[a-z0-9][a-z0-9._:-]{0,119}$'
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT media_ingest_publication_outbox_session_fk
    FOREIGN KEY (session_id, tenant_kind, tenant_id)
    REFERENCES co_production.media_ingest_sessions(id, tenant_kind, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT media_ingest_publication_outbox_terminal_shape CHECK (
    (status = 'published') = (published_at IS NOT NULL)
    AND (status = 'failed') = (failure_code IS NOT NULL)
  ),
  UNIQUE (session_id, output_digest),
  UNIQUE (session_id, request_id)
);

ALTER TABLE co_production.media_ingest_quota_reservations
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.media_ingest_quota_reservations
  FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.media_ingest_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.media_ingest_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.media_ingest_worker_authorizations
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.media_ingest_worker_authorizations
  FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.media_ingest_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.media_ingest_events FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.media_ingest_publication_outbox
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.media_ingest_publication_outbox
  FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION co_production_private.media_ingest_sha256(
  p_value text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT 'sha256:' || pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(p_value, 'UTF8'), 'sha256'),
    'hex'
  )
$$;

CREATE OR REPLACE FUNCTION co_production_private.media_ingest_is_service_role()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    (SELECT auth.jwt()) ->> 'role',
    ''
  ) = 'service_role'
$$;

CREATE OR REPLACE FUNCTION co_production_private.media_ingest_current_worker_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_claim text := coalesce(
    nullif(
      pg_catalog.current_setting(
        'request.jwt.claim.media_ingest_worker_id',
        true
      ),
      ''
    ),
    (SELECT auth.jwt()) ->> 'media_ingest_worker_id'
  );
BEGIN
  IF v_claim IS NULL
    OR v_claim !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN
    RETURN NULL;
  END IF;
  RETURN lower(v_claim)::uuid;
END
$$;

CREATE OR REPLACE FUNCTION co_production_private.media_ingest_current_worker_subject()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_claim text := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
    (SELECT auth.jwt()) ->> 'sub'
  );
BEGIN
  IF v_claim IS NULL
    OR v_claim !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN
    RETURN NULL;
  END IF;
  RETURN lower(v_claim)::uuid;
END
$$;

CREATE OR REPLACE FUNCTION co_production_private.assert_media_ingest_worker_authorized(
  p_tenant_kind text,
  p_tenant_id uuid,
  p_stage text
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_worker_id uuid :=
    co_production_private.media_ingest_current_worker_id();
  v_worker_subject uuid :=
    co_production_private.media_ingest_current_worker_subject();
BEGIN
  IF NOT co_production_private.media_ingest_is_service_role()
    OR v_worker_id IS NULL
    OR v_worker_subject IS NULL
    OR p_tenant_kind NOT IN ('personal', 'team')
    OR p_tenant_id IS NULL
    OR p_stage NOT IN ('verify', 'scan', 'transcode')
    OR NOT EXISTS (
      SELECT 1
      FROM co_production.media_ingest_worker_authorizations AS worker_auth
      WHERE worker_auth.worker_id = v_worker_id
        AND worker_auth.jwt_subject = v_worker_subject
        AND worker_auth.tenant_kind = p_tenant_kind
        AND worker_auth.tenant_id = p_tenant_id
        AND worker_auth.stage = p_stage
        AND worker_auth.enabled = true
        AND worker_auth.revoked_at IS NULL
        AND worker_auth.not_before <= now()
        AND (
          worker_auth.expires_at IS NULL
          OR worker_auth.expires_at > now()
        )
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'media_ingest_worker_forbidden';
  END IF;

  RETURN v_worker_id;
END
$$;

CREATE OR REPLACE FUNCTION co_production_private.assert_media_ingest_tenant_project_access(
  p_tenant_kind text,
  p_tenant_id uuid,
  p_project_id uuid,
  p_required_rank integer
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_project co_production.projects%ROWTYPE;
BEGIN
  IF p_tenant_kind IS NULL
    OR p_tenant_kind NOT IN ('personal', 'team')
    OR p_tenant_id IS NULL
    OR p_project_id IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'media_ingest_not_found';
  END IF;

  SELECT project.*
  INTO v_project
  FROM co_production.projects AS project
  WHERE project.id = p_project_id;

  IF NOT FOUND
    OR (
      p_tenant_kind = 'personal'
      AND (
        v_project.team_id IS NOT NULL
        OR v_project.owner_id IS DISTINCT FROM p_tenant_id
      )
    )
    OR (
      p_tenant_kind = 'team'
      AND v_project.team_id IS DISTINCT FROM p_tenant_id
    )
    OR (SELECT auth.uid()) IS NULL
    OR NOT co_production_private.has_project_role(
      p_project_id,
      p_required_rank
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'media_ingest_not_found';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION co_production_private.media_ingest_intent_fingerprint(
  p_tenant_kind text,
  p_tenant_id uuid,
  p_project_id uuid,
  p_folder_id uuid,
  p_source_filename text,
  p_source_size bigint,
  p_source_mime_type text,
  p_source_expected_sha256 text,
  p_quota_reservation_ref text,
  p_max_work_attempts integer
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT co_production_private.media_ingest_sha256(
    pg_catalog.concat_ws(
      pg_catalog.chr(31),
      'cco.media-ingest-authority.v1',
      p_tenant_kind,
      p_tenant_id::text,
      p_project_id::text,
      coalesce(p_folder_id::text, ''),
      p_source_filename,
      p_source_size::text,
      p_source_mime_type,
      p_source_expected_sha256,
      p_quota_reservation_ref,
      p_max_work_attempts::text
    )
  )
$$;

CREATE OR REPLACE FUNCTION co_production_private.media_ingest_settlement_fingerprint(
  p_worker_id uuid,
  p_worker_subject uuid,
  p_stage text,
  p_outcome text,
  p_lease_fence bigint,
  p_observed_size bigint,
  p_observed_sha256 text,
  p_scan_engine text,
  p_scan_receipt_hash text,
  p_scan_subject_sha256 text,
  p_transcode_receipt_hash text,
  p_error_code text,
  p_retry_at timestamptz
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT co_production_private.media_ingest_sha256(
    jsonb_build_object(
      'schema_version', 'cco.media-ingest-settlement.v1',
      'worker_id', p_worker_id,
      'worker_subject', p_worker_subject,
      'stage', p_stage,
      'outcome', p_outcome,
      'lease_fence', p_lease_fence,
      'observed_size', p_observed_size,
      'observed_sha256', p_observed_sha256,
      'scan_engine', p_scan_engine,
      'scan_receipt_hash', p_scan_receipt_hash,
      'scan_subject_sha256', p_scan_subject_sha256,
      'transcode_receipt_hash', p_transcode_receipt_hash,
      'error_code', p_error_code,
      'retry_at', CASE
        WHEN p_retry_at IS NULL THEN NULL
        ELSE (
          extract(epoch FROM p_retry_at) * 1000000
        )::numeric
      END
    )::text
  )
$$;

CREATE OR REPLACE FUNCTION co_production_private.media_ingest_snapshot(
  p_session co_production.media_ingest_sessions,
  p_replayed boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT (
    pg_catalog.to_jsonb(p_session) - 'id'
  ) || jsonb_build_object(
    'session_id', p_session.id,
    'replayed', p_replayed
  )
$$;

CREATE OR REPLACE FUNCTION co_production_private.append_media_ingest_event(
  p_session co_production.media_ingest_sessions,
  p_request_id uuid,
  p_event_type text,
  p_from_state text,
  p_actor_ref text,
  p_detail jsonb,
  p_occurred_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_event_id uuid := pg_catalog.gen_random_uuid();
  v_sequence integer;
  v_previous text;
  v_fingerprint text;
  v_detail jsonb := coalesce(p_detail, '{}'::jsonb);
BEGIN
  SELECT event.event_sequence + 1, event.event_fingerprint
  INTO v_sequence, v_previous
  FROM co_production.media_ingest_events AS event
  WHERE event.session_id = p_session.id
  ORDER BY event.event_sequence DESC
  LIMIT 1;

  v_sequence := coalesce(v_sequence, 1);
  v_previous := coalesce(v_previous, 'sha256:' || repeat('0', 64));
  v_fingerprint := co_production_private.media_ingest_sha256(
    jsonb_build_object(
      'event_id', v_event_id,
      'schema_version', p_session.schema_version,
      'tenant_kind', p_session.tenant_kind,
      'tenant_id', p_session.tenant_id,
      'project_id', p_session.project_id,
      'session_id', p_session.id,
      'event_sequence', v_sequence,
      'request_id', p_request_id,
      'event_type', p_event_type,
      'from_state', p_from_state,
      'to_state', p_session.state,
      'upload_offset', p_session.upload_offset,
      'upload_completed_at', p_session.upload_completed_at,
      'source_observed_size', p_session.source_observed_size,
      'source_observed_sha256', p_session.source_observed_sha256,
      'source_verified_at', p_session.source_verified_at,
      'scan_state', p_session.scan_state,
      'scan_engine', p_session.scan_engine,
      'scan_receipt_hash', p_session.scan_receipt_hash,
      'scan_subject_sha256', p_session.scan_subject_sha256,
      'scanned_at', p_session.scanned_at,
      'transcode_state', p_session.transcode_state,
      'transcode_receipt_hash', p_session.transcode_receipt_hash,
      'transcode_ready_at', p_session.transcode_ready_at,
      'publication_state', p_session.publication_state,
      'publication_enabled', p_session.publication_enabled,
      'work_stage', p_session.work_stage,
      'work_attempt_count', p_session.work_attempt_count,
      'verify_attempt_count', p_session.verify_attempt_count,
      'scan_attempt_count', p_session.scan_attempt_count,
      'transcode_attempt_count', p_session.transcode_attempt_count,
      'lease_worker_id', p_session.lease_worker_id,
      'lease_owner', p_session.lease_owner,
      'leased_at', p_session.leased_at,
      'lease_expires_at', p_session.lease_expires_at,
      'lease_fence', p_session.lease_fence,
      'available_at', p_session.available_at,
      'failure_code', p_session.failure_code,
      'failed_at', p_session.failed_at,
      'cancelled_at', p_session.cancelled_at,
      'actor_ref', p_actor_ref,
      'detail', v_detail,
      'previous_event_fingerprint', v_previous,
      'occurred_at', p_occurred_at
    )::text
  );

  INSERT INTO co_production.media_ingest_events (
    id,
    schema_version,
    tenant_kind,
    tenant_id,
    project_id,
    session_id,
    event_sequence,
    request_id,
    event_type,
    from_state,
    to_state,
    upload_offset,
    work_stage,
    work_attempt_count,
    verify_attempt_count,
    scan_attempt_count,
    transcode_attempt_count,
    lease_worker_id,
    lease_owner,
    leased_at,
    lease_expires_at,
    lease_fence,
    actor_ref,
    detail,
    previous_event_fingerprint,
    event_fingerprint,
    occurred_at
  )
  VALUES (
    v_event_id,
    p_session.schema_version,
    p_session.tenant_kind,
    p_session.tenant_id,
    p_session.project_id,
    p_session.id,
    v_sequence,
    p_request_id,
    p_event_type,
    p_from_state,
    p_session.state,
    p_session.upload_offset,
    p_session.work_stage,
    p_session.work_attempt_count,
    p_session.verify_attempt_count,
    p_session.scan_attempt_count,
    p_session.transcode_attempt_count,
    p_session.lease_worker_id,
    p_session.lease_owner,
    p_session.leased_at,
    p_session.lease_expires_at,
    p_session.lease_fence,
    p_actor_ref,
    v_detail,
    v_previous,
    v_fingerprint,
    p_occurred_at
  );

  RETURN v_event_id;
END
$$;

CREATE OR REPLACE FUNCTION co_production_private.guard_media_ingest_quota_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.reservation_ref IS DISTINCT FROM OLD.reservation_ref
    OR NEW.tenant_kind IS DISTINCT FROM OLD.tenant_kind
    OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.reserved_bytes IS DISTINCT FROM OLD.reserved_bytes
    OR NEW.issued_by IS DISTINCT FROM OLD.issued_by
    OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'media_ingest_quota_reservation_is_immutable';
  END IF;

  IF OLD.consumed_at IS NULL
    AND NEW.consumed_at IS NOT NULL
    AND NEW.consumed_by_session_id IS NOT NULL
    AND NEW.revoked_at IS NULL
  THEN
    RETURN NEW;
  END IF;

  IF NEW.consumed_at IS DISTINCT FROM OLD.consumed_at
    OR NEW.consumed_by_session_id IS DISTINCT FROM OLD.consumed_by_session_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'media_ingest_quota_reservation_already_consumed';
  END IF;

  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION co_production_private.guard_media_ingest_session_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_claimed_stage text;
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.schema_version IS DISTINCT FROM OLD.schema_version
    OR NEW.tenant_kind IS DISTINCT FROM OLD.tenant_kind
    OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.folder_id IS DISTINCT FROM OLD.folder_id
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.intent_fingerprint IS DISTINCT FROM OLD.intent_fingerprint
    OR NEW.quota_reservation_ref IS DISTINCT FROM OLD.quota_reservation_ref
    OR NEW.quota_reserved_bytes IS DISTINCT FROM OLD.quota_reserved_bytes
    OR NEW.quota_consumed_at IS DISTINCT FROM OLD.quota_consumed_at
    OR NEW.source_filename IS DISTINCT FROM OLD.source_filename
    OR NEW.source_size IS DISTINCT FROM OLD.source_size
    OR NEW.source_mime_type IS DISTINCT FROM OLD.source_mime_type
    OR NEW.source_expected_sha256 IS DISTINCT FROM OLD.source_expected_sha256
    OR NEW.max_work_attempts IS DISTINCT FROM OLD.max_work_attempts
    OR NEW.publication_enabled IS DISTINCT FROM OLD.publication_enabled
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'media_ingest_intent_is_immutable';
  END IF;

  IF OLD.state IN ('ready', 'failed', 'cancelled') THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'media_ingest_terminal_state_is_immutable';
  END IF;

  IF NOT (
    (OLD.state = 'receiving' AND NEW.state IN ('receiving', 'verification_pending', 'cancelled'))
    OR (OLD.state = 'verification_pending' AND NEW.state IN ('verifying', 'cancelled'))
    OR (OLD.state = 'verifying' AND NEW.state IN ('verifying', 'verification_pending', 'scan_pending', 'failed'))
    OR (OLD.state = 'scan_pending' AND NEW.state IN ('scanning', 'cancelled'))
    OR (OLD.state = 'scanning' AND NEW.state IN ('scanning', 'scan_pending', 'quarantined', 'transcode_pending', 'failed'))
    OR (OLD.state = 'quarantined' AND NEW.state IN ('scan_pending', 'cancelled'))
    OR (OLD.state = 'transcode_pending' AND NEW.state IN ('transcoding', 'cancelled'))
    OR (OLD.state = 'transcoding' AND NEW.state IN ('transcoding', 'transcode_pending', 'ready', 'failed'))
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'invalid_media_ingest_transition';
  END IF;

  IF OLD.state IN ('verification_pending', 'scan_pending', 'transcode_pending')
    AND NEW.state IN ('verifying', 'scanning', 'transcoding')
  THEN
    v_claimed_stage := CASE OLD.state
      WHEN 'verification_pending' THEN 'verify'
      WHEN 'scan_pending' THEN 'scan'
      WHEN 'transcode_pending' THEN 'transcode'
    END;

    IF NEW.work_attempt_count <> OLD.work_attempt_count + 1
      OR NEW.lease_fence <> OLD.lease_fence + 1
      OR NEW.verify_attempt_count <> (
        OLD.verify_attempt_count
        + CASE WHEN v_claimed_stage = 'verify' THEN 1 ELSE 0 END
      )
      OR NEW.scan_attempt_count <> (
        OLD.scan_attempt_count
        + CASE WHEN v_claimed_stage = 'scan' THEN 1 ELSE 0 END
      )
      OR NEW.transcode_attempt_count <> (
        OLD.transcode_attempt_count
        + CASE WHEN v_claimed_stage = 'transcode' THEN 1 ELSE 0 END
      )
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'invalid_media_ingest_lease_fence';
    END IF;
  ELSIF NEW.work_attempt_count IS DISTINCT FROM OLD.work_attempt_count
    OR NEW.verify_attempt_count IS DISTINCT FROM OLD.verify_attempt_count
    OR NEW.scan_attempt_count IS DISTINCT FROM OLD.scan_attempt_count
    OR NEW.transcode_attempt_count IS DISTINCT FROM OLD.transcode_attempt_count
    OR NEW.lease_fence IS DISTINCT FROM OLD.lease_fence
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'invalid_media_ingest_lease_fence';
  END IF;

  IF OLD.state IN ('verifying', 'scanning', 'transcoding')
    AND NEW.state = OLD.state
    AND (
      NEW.lease_worker_id IS DISTINCT FROM OLD.lease_worker_id
      OR NEW.lease_owner IS DISTINCT FROM OLD.lease_owner
      OR NEW.leased_at IS DISTINCT FROM OLD.leased_at
      OR NEW.lease_expires_at < OLD.lease_expires_at
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'media_ingest_lease_identity_is_immutable';
  END IF;

  IF OLD.source_observed_size IS NOT NULL
    AND (
      NEW.source_observed_size IS DISTINCT FROM OLD.source_observed_size
      OR NEW.source_observed_sha256 IS DISTINCT FROM OLD.source_observed_sha256
      OR NEW.source_verified_at IS DISTINCT FROM OLD.source_verified_at
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'media_ingest_source_evidence_is_immutable';
  END IF;

  IF OLD.scanned_at IS NOT NULL
    AND NOT (
      OLD.state = 'quarantined'
      AND OLD.scan_state = 'error'
      AND NEW.state = 'scan_pending'
      AND NEW.scan_state = 'pending'
      AND NEW.scan_engine IS NULL
      AND NEW.scan_receipt_hash IS NULL
      AND NEW.scan_subject_sha256 IS NULL
      AND NEW.scanned_at IS NULL
    )
    AND (
      NEW.scan_state IS DISTINCT FROM OLD.scan_state
      OR NEW.scan_engine IS DISTINCT FROM OLD.scan_engine
      OR NEW.scan_receipt_hash IS DISTINCT FROM OLD.scan_receipt_hash
      OR NEW.scan_subject_sha256 IS DISTINCT FROM OLD.scan_subject_sha256
      OR NEW.scanned_at IS DISTINCT FROM OLD.scanned_at
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'media_ingest_scan_evidence_is_immutable';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION co_production_private.prevent_media_ingest_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'media_ingest_ledger_is_append_only';
END
$$;

CREATE TRIGGER media_ingest_quota_reservations_update_guard
BEFORE UPDATE ON co_production.media_ingest_quota_reservations
FOR EACH ROW
EXECUTE FUNCTION co_production_private.guard_media_ingest_quota_update();

CREATE TRIGGER media_ingest_quota_reservations_no_delete
BEFORE DELETE ON co_production.media_ingest_quota_reservations
FOR EACH ROW
EXECUTE FUNCTION co_production_private.prevent_media_ingest_mutation();

CREATE TRIGGER media_ingest_quota_reservations_no_truncate
BEFORE TRUNCATE ON co_production.media_ingest_quota_reservations
FOR EACH STATEMENT
EXECUTE FUNCTION co_production_private.prevent_media_ingest_mutation();

CREATE TRIGGER media_ingest_sessions_update_guard
BEFORE UPDATE ON co_production.media_ingest_sessions
FOR EACH ROW
EXECUTE FUNCTION co_production_private.guard_media_ingest_session_update();

CREATE TRIGGER media_ingest_sessions_no_delete
BEFORE DELETE ON co_production.media_ingest_sessions
FOR EACH ROW
EXECUTE FUNCTION co_production_private.prevent_media_ingest_mutation();

CREATE TRIGGER media_ingest_sessions_no_truncate
BEFORE TRUNCATE ON co_production.media_ingest_sessions
FOR EACH STATEMENT
EXECUTE FUNCTION co_production_private.prevent_media_ingest_mutation();

CREATE TRIGGER media_ingest_events_immutable
BEFORE UPDATE OR DELETE ON co_production.media_ingest_events
FOR EACH ROW
EXECUTE FUNCTION co_production_private.prevent_media_ingest_mutation();

CREATE TRIGGER media_ingest_events_no_truncate
BEFORE TRUNCATE ON co_production.media_ingest_events
FOR EACH STATEMENT
EXECUTE FUNCTION co_production_private.prevent_media_ingest_mutation();

CREATE TRIGGER media_ingest_publication_outbox_no_delete
BEFORE DELETE ON co_production.media_ingest_publication_outbox
FOR EACH ROW
EXECUTE FUNCTION co_production_private.prevent_media_ingest_mutation();

CREATE TRIGGER media_ingest_publication_outbox_no_truncate
BEFORE TRUNCATE ON co_production.media_ingest_publication_outbox
FOR EACH STATEMENT
EXECUTE FUNCTION co_production_private.prevent_media_ingest_mutation();

CREATE POLICY media_ingest_sessions_project_select
ON co_production.media_ingest_sessions
FOR SELECT
TO authenticated
USING (
  co_production_private.has_project_role(project_id, 10)
);

CREATE POLICY media_ingest_events_project_select
ON co_production.media_ingest_events
FOR SELECT
TO authenticated
USING (
  co_production_private.has_project_role(project_id, 10)
);

CREATE OR REPLACE FUNCTION co_production.create_media_ingest_session(
  p_tenant_kind text,
  p_tenant_id uuid,
  p_project_id uuid,
  p_idempotency_key text,
  p_source_filename text,
  p_source_size bigint,
  p_source_mime_type text,
  p_source_expected_sha256 text,
  p_quota_reservation_ref text,
  p_max_work_attempts integer DEFAULT 12,
  p_folder_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_session co_production.media_ingest_sessions%ROWTYPE;
  v_existing co_production.media_ingest_sessions%ROWTYPE;
  v_reservation co_production.media_ingest_quota_reservations%ROWTYPE;
  v_actor uuid := (SELECT auth.uid());
  v_tenant_kind text := lower(btrim(p_tenant_kind));
  v_idempotency_key text := lower(btrim(p_idempotency_key));
  v_source_filename text := btrim(p_source_filename);
  v_source_mime_type text := lower(btrim(p_source_mime_type));
  v_source_expected_sha256 text := lower(
    regexp_replace(btrim(p_source_expected_sha256), '^sha256:', '')
  );
  v_quota_reservation_ref text := lower(btrim(p_quota_reservation_ref));
  v_intent_fingerprint text;
  v_now timestamptz := now();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'media_ingest_auth_required';
  END IF;

  PERFORM co_production_private.assert_media_ingest_tenant_project_access(
    v_tenant_kind,
    p_tenant_id,
    p_project_id,
    60
  );

  IF v_idempotency_key !~ '^[a-z0-9][a-z0-9._:-]{15,199}$'
    OR v_source_filename IS NULL
    OR length(v_source_filename) NOT BETWEEN 1 AND 512
    OR v_source_filename ~ '[\\/]'
    OR v_source_filename ~ '[[:cntrl:]]'
    OR p_source_size IS NULL
    OR p_source_size NOT BETWEEN 1 AND 9007199254740991
    OR v_source_mime_type !~ '^[a-z0-9!#$&^_.+-]+/[a-z0-9!#$&^_.+-]+$'
    OR length(v_source_mime_type) > 255
    OR v_source_expected_sha256 !~ '^[0-9a-f]{64}$'
    OR v_quota_reservation_ref !~ '^[a-z0-9][a-z0-9._:/-]{15,199}$'
    OR p_max_work_attempts IS NULL
    OR p_max_work_attempts NOT BETWEEN 3 AND 24
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_media_ingest_intent';
  END IF;

  IF p_folder_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM co_production.folders AS folder
      WHERE folder.id = p_folder_id
        AND folder.project_id = p_project_id
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'media_ingest_not_found';
  END IF;

  v_intent_fingerprint :=
    co_production_private.media_ingest_intent_fingerprint(
      v_tenant_kind,
      p_tenant_id,
      p_project_id,
      p_folder_id,
      v_source_filename,
      p_source_size,
      v_source_mime_type,
      v_source_expected_sha256,
      v_quota_reservation_ref,
      p_max_work_attempts
    );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_tenant_kind || ':' || p_tenant_id::text || ':' || v_idempotency_key,
      0
    )
  );

  SELECT session.*
  INTO v_existing
  FROM co_production.media_ingest_sessions AS session
  WHERE session.tenant_kind = v_tenant_kind
    AND session.tenant_id = p_tenant_id
    AND session.idempotency_key = v_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.intent_fingerprint IS DISTINCT FROM v_intent_fingerprint THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'media_ingest_idempotency_conflict';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM co_production.media_ingest_quota_reservations AS reservation
      WHERE reservation.reservation_ref = v_existing.quota_reservation_ref
        AND reservation.consumed_by_session_id = v_existing.id
        AND reservation.consumed_at = v_existing.quota_consumed_at
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'media_ingest_quota_evidence_invalid';
    END IF;

    RETURN co_production_private.media_ingest_snapshot(v_existing, true);
  END IF;

  SELECT reservation.*
  INTO v_reservation
  FROM co_production.media_ingest_quota_reservations AS reservation
  WHERE reservation.reservation_ref = v_quota_reservation_ref
  FOR UPDATE;

  IF NOT FOUND
    OR v_reservation.tenant_kind IS DISTINCT FROM v_tenant_kind
    OR v_reservation.tenant_id IS DISTINCT FROM p_tenant_id
    OR v_reservation.project_id IS DISTINCT FROM p_project_id
    OR v_reservation.reserved_bytes < p_source_size
    OR v_reservation.expires_at <= v_now
    OR v_reservation.issued_at > v_now
    OR v_reservation.revoked_at IS NOT NULL
    OR v_reservation.consumed_at IS NOT NULL
    OR v_reservation.consumed_by_session_id IS NOT NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'media_ingest_quota_reservation_unavailable';
  END IF;

  INSERT INTO co_production.media_ingest_sessions (
    tenant_kind,
    tenant_id,
    project_id,
    folder_id,
    created_by,
    idempotency_key,
    intent_fingerprint,
    quota_reservation_ref,
    quota_reserved_bytes,
    quota_consumed_at,
    source_filename,
    source_size,
    source_mime_type,
    source_expected_sha256,
    max_work_attempts
  )
  VALUES (
    v_tenant_kind,
    p_tenant_id,
    p_project_id,
    p_folder_id,
    v_actor,
    v_idempotency_key,
    v_intent_fingerprint,
    v_quota_reservation_ref,
    v_reservation.reserved_bytes,
    v_now,
    v_source_filename,
    p_source_size,
    v_source_mime_type,
    v_source_expected_sha256,
    p_max_work_attempts
  )
  RETURNING * INTO v_session;

  UPDATE co_production.media_ingest_quota_reservations AS reservation
  SET
    consumed_at = v_now,
    consumed_by_session_id = v_session.id
  WHERE reservation.reservation_ref = v_reservation.reservation_ref;

  PERFORM co_production_private.append_media_ingest_event(
    v_session,
    NULL,
    'session_created',
    NULL,
    v_actor::text,
    jsonb_build_object(
      'intent_fingerprint', v_session.intent_fingerprint,
      'quota_reservation_ref', v_session.quota_reservation_ref,
      'quota_reserved_bytes', v_session.quota_reserved_bytes,
      'quota_consumed_at', v_session.quota_consumed_at,
      'source_size', v_session.source_size
    ),
    v_now
  );

  RETURN co_production_private.media_ingest_snapshot(v_session, false);
END
$$;

CREATE OR REPLACE FUNCTION co_production.record_media_ingest_progress(
  p_tenant_kind text,
  p_tenant_id uuid,
  p_session_id uuid,
  p_request_id uuid,
  p_expected_offset bigint,
  p_next_offset bigint,
  p_chunk_sha256 text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_session co_production.media_ingest_sessions%ROWTYPE;
  v_event co_production.media_ingest_events%ROWTYPE;
  v_actor uuid := (SELECT auth.uid());
  v_tenant_kind text := lower(btrim(p_tenant_kind));
  v_chunk_sha256 text := lower(
    regexp_replace(btrim(p_chunk_sha256), '^sha256:', '')
  );
  v_from_state text;
  v_event_type text;
  v_now timestamptz := now();
BEGIN
  IF v_actor IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'media_ingest_auth_required';
  END IF;

  SELECT session.*
  INTO v_session
  FROM co_production.media_ingest_sessions AS session
  WHERE session.id = p_session_id
    AND session.tenant_kind = v_tenant_kind
    AND session.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'media_ingest_not_found';
  END IF;

  PERFORM co_production_private.assert_media_ingest_tenant_project_access(
    v_session.tenant_kind,
    v_session.tenant_id,
    v_session.project_id,
    60
  );

  SELECT event.*
  INTO v_event
  FROM co_production.media_ingest_events AS event
  WHERE event.session_id = v_session.id
    AND event.request_id = p_request_id;

  IF FOUND THEN
    IF v_event.event_type NOT IN ('progress_recorded', 'upload_completed')
      OR (v_event.detail ->> 'expected_offset')::bigint
        IS DISTINCT FROM p_expected_offset
      OR (v_event.detail ->> 'next_offset')::bigint
        IS DISTINCT FROM p_next_offset
      OR v_event.detail ->> 'chunk_sha256'
        IS DISTINCT FROM v_chunk_sha256
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'media_ingest_request_conflict';
    END IF;
    RETURN co_production_private.media_ingest_snapshot(v_session, true);
  END IF;

  IF v_session.state <> 'receiving'
    OR p_expected_offset IS NULL
    OR p_next_offset IS NULL
    OR p_expected_offset <> v_session.upload_offset
    OR p_next_offset <= p_expected_offset
    OR p_next_offset > v_session.source_size
    OR v_chunk_sha256 !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'invalid_media_ingest_progress';
  END IF;

  v_from_state := v_session.state;
  v_event_type := CASE
    WHEN p_next_offset = v_session.source_size THEN 'upload_completed'
    ELSE 'progress_recorded'
  END;

  UPDATE co_production.media_ingest_sessions AS session
  SET
    upload_offset = p_next_offset,
    upload_completed_at = CASE
      WHEN p_next_offset = session.source_size THEN v_now
      ELSE NULL
    END,
    state = CASE
      WHEN p_next_offset = session.source_size THEN 'verification_pending'
      ELSE 'receiving'
    END,
    available_at = CASE
      WHEN p_next_offset = session.source_size THEN v_now
      ELSE session.available_at
    END
  WHERE session.id = v_session.id
  RETURNING * INTO v_session;

  PERFORM co_production_private.append_media_ingest_event(
    v_session,
    p_request_id,
    v_event_type,
    v_from_state,
    v_actor::text,
    jsonb_build_object(
      'expected_offset', p_expected_offset,
      'next_offset', p_next_offset,
      'chunk_sha256', v_chunk_sha256
    ),
    v_now
  );

  RETURN co_production_private.media_ingest_snapshot(v_session, false);
END
$$;

CREATE OR REPLACE FUNCTION co_production.cancel_media_ingest_session(
  p_tenant_kind text,
  p_tenant_id uuid,
  p_session_id uuid,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_session co_production.media_ingest_sessions%ROWTYPE;
  v_event co_production.media_ingest_events%ROWTYPE;
  v_actor uuid := (SELECT auth.uid());
  v_tenant_kind text := lower(btrim(p_tenant_kind));
  v_from_state text;
  v_now timestamptz := now();
BEGIN
  IF v_actor IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'media_ingest_auth_required';
  END IF;

  SELECT session.*
  INTO v_session
  FROM co_production.media_ingest_sessions AS session
  WHERE session.id = p_session_id
    AND session.tenant_kind = v_tenant_kind
    AND session.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'media_ingest_not_found';
  END IF;

  PERFORM co_production_private.assert_media_ingest_tenant_project_access(
    v_session.tenant_kind,
    v_session.tenant_id,
    v_session.project_id,
    60
  );

  SELECT event.*
  INTO v_event
  FROM co_production.media_ingest_events AS event
  WHERE event.session_id = v_session.id
    AND event.request_id = p_request_id;

  IF FOUND THEN
    IF v_event.event_type <> 'session_cancelled' THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'media_ingest_request_conflict';
    END IF;
    RETURN co_production_private.media_ingest_snapshot(v_session, true);
  END IF;

  IF v_session.state = 'cancelled' THEN
    RETURN co_production_private.media_ingest_snapshot(v_session, true);
  END IF;

  IF v_session.state NOT IN (
    'receiving',
    'verification_pending',
    'scan_pending',
    'quarantined',
    'transcode_pending'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'media_ingest_cannot_be_cancelled';
  END IF;

  v_from_state := v_session.state;
  UPDATE co_production.media_ingest_sessions AS session
  SET
    state = 'cancelled',
    cancelled_at = v_now,
    cancelled_by = v_actor,
    available_at = v_now
  WHERE session.id = v_session.id
  RETURNING * INTO v_session;

  PERFORM co_production_private.append_media_ingest_event(
    v_session,
    p_request_id,
    'session_cancelled',
    v_from_state,
    v_actor::text,
    '{}'::jsonb,
    v_now
  );

  RETURN co_production_private.media_ingest_snapshot(v_session, false);
END
$$;

CREATE OR REPLACE FUNCTION co_production.claim_media_ingest_work(
  p_tenant_kind text,
  p_tenant_id uuid,
  p_stage text,
  p_limit integer DEFAULT 10,
  p_lease_seconds integer DEFAULT 90
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_session co_production.media_ingest_sessions%ROWTYPE;
  v_tenant_kind text := lower(btrim(p_tenant_kind));
  v_stage text := lower(btrim(p_stage));
  v_now timestamptz := now();
  v_worker_id uuid;
  v_actor_ref text;
  v_from_state text;
  v_stage_attempts integer;
  v_expired_worker_id uuid;
  v_expired_owner text;
  v_expired_leased_at timestamptz;
  v_expired_at timestamptz;
  v_expired_fence bigint;
BEGIN
  IF v_tenant_kind NOT IN ('personal', 'team')
    OR p_tenant_id IS NULL
    OR v_stage NOT IN ('verify', 'scan', 'transcode')
    OR p_limit IS NULL
    OR p_limit NOT BETWEEN 1 AND 100
    OR p_lease_seconds IS NULL
    OR p_lease_seconds NOT BETWEEN 15 AND 900
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_media_ingest_claim';
  END IF;

  v_worker_id :=
    co_production_private.assert_media_ingest_worker_authorized(
      v_tenant_kind,
      p_tenant_id,
      v_stage
    );
  v_actor_ref := 'worker:' || v_worker_id::text;

  FOR v_session IN
    SELECT session.*
    FROM co_production.media_ingest_sessions AS session
    WHERE session.tenant_kind = v_tenant_kind
      AND session.tenant_id = p_tenant_id
      AND session.work_stage = v_stage
      AND session.state = CASE v_stage
        WHEN 'verify' THEN 'verifying'
        WHEN 'scan' THEN 'scanning'
        WHEN 'transcode' THEN 'transcoding'
      END
      AND session.lease_expires_at <= v_now
    ORDER BY session.lease_expires_at, session.created_at, session.id
    LIMIT 100
    FOR UPDATE SKIP LOCKED
  LOOP
    v_from_state := v_session.state;
    v_stage_attempts := CASE v_stage
      WHEN 'verify' THEN v_session.verify_attempt_count
      WHEN 'scan' THEN v_session.scan_attempt_count
      WHEN 'transcode' THEN v_session.transcode_attempt_count
    END;
    v_expired_worker_id := v_session.lease_worker_id;
    v_expired_owner := v_session.lease_owner;
    v_expired_leased_at := v_session.leased_at;
    v_expired_at := v_session.lease_expires_at;
    v_expired_fence := v_session.lease_fence;

    IF v_stage_attempts >= v_session.max_work_attempts THEN
      UPDATE co_production.media_ingest_sessions AS session
      SET
        state = 'failed',
        work_stage = NULL,
        lease_worker_id = NULL,
        lease_owner = NULL,
        leased_at = NULL,
        lease_expires_at = NULL,
        failure_code = 'lease_expired',
        failed_at = v_now,
        publication_state = 'blocked',
        transcode_state = CASE
          WHEN v_stage = 'transcode' THEN 'failed'
          ELSE session.transcode_state
        END
      WHERE session.id = v_session.id
      RETURNING * INTO v_session;

      PERFORM co_production_private.append_media_ingest_event(
        v_session,
        NULL,
        'worker_failed',
        v_from_state,
        'system:lease-reaper',
        jsonb_build_object(
          'stage', v_stage,
          'reason', 'lease_expired',
          'lease_worker_id', v_expired_worker_id,
          'lease_owner', v_expired_owner,
          'leased_at', v_expired_leased_at,
          'lease_expires_at', v_expired_at,
          'lease_fence', v_expired_fence,
          'stage_attempt_count', v_stage_attempts
        ),
        v_now
      );
    ELSE
      UPDATE co_production.media_ingest_sessions AS session
      SET
        state = CASE v_stage
          WHEN 'verify' THEN 'verification_pending'
          WHEN 'scan' THEN 'scan_pending'
          WHEN 'transcode' THEN 'transcode_pending'
        END,
        scan_state = CASE
          WHEN v_stage = 'scan' THEN 'pending'
          ELSE session.scan_state
        END,
        transcode_state = CASE
          WHEN v_stage = 'transcode' THEN 'pending'
          ELSE session.transcode_state
        END,
        work_stage = NULL,
        lease_worker_id = NULL,
        lease_owner = NULL,
        leased_at = NULL,
        lease_expires_at = NULL,
        available_at = v_now
      WHERE session.id = v_session.id
      RETURNING * INTO v_session;

      PERFORM co_production_private.append_media_ingest_event(
        v_session,
        NULL,
        'lease_expired',
        v_from_state,
        'system:lease-reaper',
        jsonb_build_object(
          'stage', v_stage,
          'lease_worker_id', v_expired_worker_id,
          'lease_owner', v_expired_owner,
          'leased_at', v_expired_leased_at,
          'lease_expires_at', v_expired_at,
          'lease_fence', v_expired_fence,
          'stage_attempt_count', v_stage_attempts
        ),
        v_now
      );
    END IF;
  END LOOP;

  FOR v_session IN
    SELECT session.*
    FROM co_production.media_ingest_sessions AS session
    WHERE session.tenant_kind = v_tenant_kind
      AND session.tenant_id = p_tenant_id
      AND session.state = CASE v_stage
        WHEN 'verify' THEN 'verification_pending'
        WHEN 'scan' THEN 'scan_pending'
        WHEN 'transcode' THEN 'transcode_pending'
      END
      AND session.available_at <= v_now
      AND CASE v_stage
        WHEN 'verify' THEN session.verify_attempt_count
        WHEN 'scan' THEN session.scan_attempt_count
        WHEN 'transcode' THEN session.transcode_attempt_count
      END < session.max_work_attempts
    ORDER BY session.available_at, session.created_at, session.id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  LOOP
    v_from_state := v_session.state;
    UPDATE co_production.media_ingest_sessions AS session
    SET
      state = CASE v_stage
        WHEN 'verify' THEN 'verifying'
        WHEN 'scan' THEN 'scanning'
        WHEN 'transcode' THEN 'transcoding'
      END,
      work_stage = v_stage,
      scan_state = CASE
        WHEN v_stage = 'scan' THEN 'scanning'
        ELSE session.scan_state
      END,
      transcode_state = CASE
        WHEN v_stage = 'transcode' THEN 'processing'
        ELSE session.transcode_state
      END,
      work_attempt_count = session.work_attempt_count + 1,
      verify_attempt_count = session.verify_attempt_count
        + CASE WHEN v_stage = 'verify' THEN 1 ELSE 0 END,
      scan_attempt_count = session.scan_attempt_count
        + CASE WHEN v_stage = 'scan' THEN 1 ELSE 0 END,
      transcode_attempt_count = session.transcode_attempt_count
        + CASE WHEN v_stage = 'transcode' THEN 1 ELSE 0 END,
      lease_fence = session.lease_fence + 1,
      lease_worker_id = v_worker_id,
      lease_owner = v_actor_ref,
      leased_at = v_now,
      lease_expires_at =
        v_now + pg_catalog.make_interval(secs => p_lease_seconds)
    WHERE session.id = v_session.id
    RETURNING * INTO v_session;

    PERFORM co_production_private.append_media_ingest_event(
      v_session,
      NULL,
      'work_claimed',
      v_from_state,
      v_actor_ref,
      jsonb_build_object(
        'stage', v_stage,
        'lease_worker_id', v_session.lease_worker_id,
        'lease_owner', v_session.lease_owner,
        'leased_at', v_session.leased_at,
        'lease_expires_at', v_session.lease_expires_at,
        'lease_fence', v_session.lease_fence,
        'stage_attempt_count', CASE v_stage
          WHEN 'verify' THEN v_session.verify_attempt_count
          WHEN 'scan' THEN v_session.scan_attempt_count
          WHEN 'transcode' THEN v_session.transcode_attempt_count
        END
      ),
      v_now
    );

    RETURN NEXT co_production_private.media_ingest_snapshot(
      v_session,
      false
    );
  END LOOP;

  RETURN;
END
$$;

CREATE OR REPLACE FUNCTION co_production.renew_media_ingest_lease(
  p_tenant_kind text,
  p_tenant_id uuid,
  p_session_id uuid,
  p_lease_fence bigint,
  p_lease_seconds integer DEFAULT 90
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_session co_production.media_ingest_sessions%ROWTYPE;
  v_tenant_kind text := lower(btrim(p_tenant_kind));
  v_now timestamptz := now();
  v_worker_id uuid;
BEGIN
  IF p_lease_fence IS NULL
    OR p_lease_fence < 1
    OR p_lease_seconds IS NULL
    OR p_lease_seconds NOT BETWEEN 15 AND 900
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_media_ingest_lease';
  END IF;

  SELECT session.*
  INTO v_session
  FROM co_production.media_ingest_sessions AS session
  WHERE session.id = p_session_id
    AND session.tenant_kind = v_tenant_kind
    AND session.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'media_ingest_not_found';
  END IF;

  IF v_session.work_stage IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'media_ingest_stale_fence';
  END IF;

  v_worker_id :=
    co_production_private.assert_media_ingest_worker_authorized(
      v_session.tenant_kind,
      v_session.tenant_id,
      v_session.work_stage
    );

  IF v_session.state NOT IN ('verifying', 'scanning', 'transcoding')
    OR v_session.lease_worker_id IS DISTINCT FROM v_worker_id
    OR v_session.lease_owner IS DISTINCT FROM
      'worker:' || v_worker_id::text
    OR v_session.lease_fence IS DISTINCT FROM p_lease_fence
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'media_ingest_stale_fence';
  END IF;

  IF v_session.lease_expires_at <= v_now THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'media_ingest_lease_expired';
  END IF;

  UPDATE co_production.media_ingest_sessions AS session
  SET lease_expires_at =
    v_now + pg_catalog.make_interval(secs => p_lease_seconds)
  WHERE session.id = v_session.id
  RETURNING * INTO v_session;

  PERFORM co_production_private.append_media_ingest_event(
    v_session,
    NULL,
    'lease_renewed',
    v_session.state,
    v_session.lease_owner,
    jsonb_build_object(
      'stage', v_session.work_stage,
      'lease_worker_id', v_session.lease_worker_id,
      'lease_owner', v_session.lease_owner,
      'leased_at', v_session.leased_at,
      'lease_expires_at', v_session.lease_expires_at,
      'lease_fence', v_session.lease_fence
    ),
    v_now
  );

  RETURN co_production_private.media_ingest_snapshot(v_session, false);
END
$$;

CREATE OR REPLACE FUNCTION co_production.settle_media_ingest_work(
  p_tenant_kind text,
  p_tenant_id uuid,
  p_session_id uuid,
  p_request_id uuid,
  p_lease_fence bigint,
  p_stage text,
  p_outcome text,
  p_observed_size bigint DEFAULT NULL,
  p_observed_sha256 text DEFAULT NULL,
  p_scan_engine text DEFAULT NULL,
  p_scan_receipt_hash text DEFAULT NULL,
  p_scan_subject_sha256 text DEFAULT NULL,
  p_transcode_receipt_hash text DEFAULT NULL,
  p_error_code text DEFAULT NULL,
  p_retry_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_session co_production.media_ingest_sessions%ROWTYPE;
  v_event co_production.media_ingest_events%ROWTYPE;
  v_tenant_kind text := lower(btrim(p_tenant_kind));
  v_stage text := lower(btrim(p_stage));
  v_outcome text := lower(btrim(p_outcome));
  v_observed_sha256 text := nullif(
    lower(regexp_replace(btrim(p_observed_sha256), '^sha256:', '')),
    ''
  );
  v_scan_engine text := nullif(btrim(p_scan_engine), '');
  v_scan_receipt_hash text := nullif(
    lower(regexp_replace(btrim(p_scan_receipt_hash), '^sha256:', '')),
    ''
  );
  v_scan_subject_sha256 text := nullif(
    lower(regexp_replace(btrim(p_scan_subject_sha256), '^sha256:', '')),
    ''
  );
  v_transcode_receipt_hash text := nullif(
    lower(regexp_replace(btrim(p_transcode_receipt_hash), '^sha256:', '')),
    ''
  );
  v_error_code text := nullif(lower(btrim(p_error_code)), '');
  v_now timestamptz := now();
  v_from_state text;
  v_event_type text;
  v_worker_id uuid;
  v_worker_subject uuid;
  v_worker_actor text;
  v_settlement_fingerprint text;
  v_lease_worker_id uuid;
  v_lease_owner text;
  v_leased_at timestamptz;
  v_lease_expires_at timestamptz;
BEGIN
  IF p_request_id IS NULL
    OR p_lease_fence IS NULL
    OR p_lease_fence < 1
    OR v_stage NOT IN ('verify', 'scan', 'transcode')
    OR (
      v_stage = 'verify'
      AND v_outcome NOT IN ('verified', 'retry', 'failed')
    )
    OR (
      v_stage = 'scan'
      AND v_outcome NOT IN (
        'clean',
        'infected',
        'scan_error',
        'retry',
        'failed'
      )
    )
    OR (
      v_stage = 'transcode'
      AND v_outcome NOT IN ('ready', 'retry', 'failed')
    )
    OR (
      v_error_code IS NOT NULL
      AND v_error_code !~ '^[a-z0-9][a-z0-9._:-]{0,119}$'
    )
    OR (
      v_outcome = 'verified'
      AND (
        p_observed_size IS NULL
        OR v_observed_sha256 IS NULL
        OR v_scan_engine IS NOT NULL
        OR v_scan_receipt_hash IS NOT NULL
        OR v_scan_subject_sha256 IS NOT NULL
        OR v_transcode_receipt_hash IS NOT NULL
      )
    )
    OR (
      v_outcome IN ('clean', 'infected', 'scan_error')
      AND (
        p_observed_size IS NOT NULL
        OR v_observed_sha256 IS NOT NULL
        OR v_scan_engine IS NULL
        OR v_scan_receipt_hash IS NULL
        OR v_scan_subject_sha256 IS NULL
        OR v_transcode_receipt_hash IS NOT NULL
      )
    )
    OR (
      v_outcome = 'ready'
      AND (
        p_observed_size IS NOT NULL
        OR v_observed_sha256 IS NOT NULL
        OR v_scan_engine IS NOT NULL
        OR v_scan_receipt_hash IS NOT NULL
        OR v_scan_subject_sha256 IS NOT NULL
        OR v_transcode_receipt_hash IS NULL
      )
    )
    OR (
      v_outcome IN ('retry', 'failed')
      AND (
        p_observed_size IS NOT NULL
        OR v_observed_sha256 IS NOT NULL
        OR v_scan_engine IS NOT NULL
        OR v_scan_receipt_hash IS NOT NULL
        OR v_scan_subject_sha256 IS NOT NULL
        OR v_transcode_receipt_hash IS NOT NULL
      )
    )
    OR (v_outcome = 'retry' AND p_retry_at IS NULL)
    OR (v_outcome <> 'retry' AND p_retry_at IS NOT NULL)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_media_ingest_settlement';
  END IF;

  IF v_outcome = 'retry' AND p_retry_at <= v_now THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'media_ingest_retry_must_be_future';
  END IF;

  v_worker_id :=
    co_production_private.assert_media_ingest_worker_authorized(
      v_tenant_kind,
      p_tenant_id,
      v_stage
    );
  v_worker_subject :=
    co_production_private.media_ingest_current_worker_subject();
  v_worker_actor := 'worker:' || v_worker_id::text;
  v_settlement_fingerprint :=
    co_production_private.media_ingest_settlement_fingerprint(
      v_worker_id,
      v_worker_subject,
      v_stage,
      v_outcome,
      p_lease_fence,
      p_observed_size,
      v_observed_sha256,
      v_scan_engine,
      v_scan_receipt_hash,
      v_scan_subject_sha256,
      v_transcode_receipt_hash,
      v_error_code,
      p_retry_at
    );

  SELECT session.*
  INTO v_session
  FROM co_production.media_ingest_sessions AS session
  WHERE session.id = p_session_id
    AND session.tenant_kind = v_tenant_kind
    AND session.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'media_ingest_not_found';
  END IF;

  SELECT event.*
  INTO v_event
  FROM co_production.media_ingest_events AS event
  WHERE event.session_id = v_session.id
    AND event.request_id = p_request_id;

  IF FOUND THEN
    IF v_event.event_type NOT LIKE 'work_%'
      OR v_event.detail ->> 'settlement_fingerprint'
        IS DISTINCT FROM v_settlement_fingerprint
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'media_ingest_request_conflict';
    END IF;
    RETURN co_production_private.media_ingest_snapshot(v_session, true);
  END IF;

  IF v_session.state IS DISTINCT FROM (
      CASE v_stage
        WHEN 'verify' THEN 'verifying'
        WHEN 'scan' THEN 'scanning'
        WHEN 'transcode' THEN 'transcoding'
      END
    )
    OR v_session.work_stage IS DISTINCT FROM v_stage
    OR v_session.lease_worker_id IS DISTINCT FROM v_worker_id
    OR v_session.lease_owner IS DISTINCT FROM v_worker_actor
    OR v_session.lease_fence IS DISTINCT FROM p_lease_fence
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'media_ingest_stale_fence';
  END IF;

  IF v_session.lease_expires_at <= v_now THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'media_ingest_lease_expired';
  END IF;

  v_from_state := v_session.state;
  v_lease_worker_id := v_session.lease_worker_id;
  v_lease_owner := v_session.lease_owner;
  v_leased_at := v_session.leased_at;
  v_lease_expires_at := v_session.lease_expires_at;

  IF v_outcome = 'retry' THEN
    IF (
      CASE v_stage
        WHEN 'verify' THEN v_session.verify_attempt_count
        WHEN 'scan' THEN v_session.scan_attempt_count
        WHEN 'transcode' THEN v_session.transcode_attempt_count
      END
    ) >= v_session.max_work_attempts
    THEN
      UPDATE co_production.media_ingest_sessions AS session
      SET
        state = 'failed',
        work_stage = NULL,
        lease_worker_id = NULL,
        lease_owner = NULL,
        leased_at = NULL,
        lease_expires_at = NULL,
        failure_code = coalesce(v_error_code, 'attempts_exhausted'),
        failed_at = v_now,
        publication_state = 'blocked',
        transcode_state = CASE
          WHEN v_stage = 'transcode' THEN 'failed'
          ELSE session.transcode_state
        END
      WHERE session.id = v_session.id
      RETURNING * INTO v_session;
      v_event_type := 'work_failed';
    ELSE
      UPDATE co_production.media_ingest_sessions AS session
      SET
        state = CASE v_stage
          WHEN 'verify' THEN 'verification_pending'
          WHEN 'scan' THEN 'scan_pending'
          WHEN 'transcode' THEN 'transcode_pending'
        END,
        scan_state = CASE
          WHEN v_stage = 'scan' THEN 'pending'
          ELSE session.scan_state
        END,
        transcode_state = CASE
          WHEN v_stage = 'transcode' THEN 'pending'
          ELSE session.transcode_state
        END,
        work_stage = NULL,
        lease_worker_id = NULL,
        lease_owner = NULL,
        leased_at = NULL,
        lease_expires_at = NULL,
        available_at = p_retry_at
      WHERE session.id = v_session.id
      RETURNING * INTO v_session;
      v_event_type := 'work_retry_scheduled';
    END IF;
  ELSIF v_outcome = 'failed' THEN
    UPDATE co_production.media_ingest_sessions AS session
    SET
      state = 'failed',
      work_stage = NULL,
      lease_worker_id = NULL,
      lease_owner = NULL,
      leased_at = NULL,
      lease_expires_at = NULL,
      failure_code = coalesce(v_error_code, 'worker_failed'),
      failed_at = v_now,
      publication_state = 'blocked',
      scan_state = CASE
        WHEN v_stage = 'scan' THEN 'blocked'
        ELSE session.scan_state
      END,
      transcode_state = CASE
        WHEN v_stage = 'transcode' THEN 'failed'
        ELSE session.transcode_state
      END
    WHERE session.id = v_session.id
    RETURNING * INTO v_session;
    v_event_type := 'work_failed';
  ELSIF v_stage = 'verify' AND v_outcome = 'verified' THEN
    IF p_observed_size NOT BETWEEN 0 AND 9007199254740991
      OR v_observed_sha256 !~ '^[0-9a-f]{64}$'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'invalid_media_ingest_source_evidence';
    END IF;

    IF p_observed_size <> v_session.source_size
      OR v_observed_sha256 IS DISTINCT FROM
        v_session.source_expected_sha256
    THEN
      UPDATE co_production.media_ingest_sessions AS session
      SET
        source_observed_size = p_observed_size,
        source_observed_sha256 = v_observed_sha256,
        state = 'failed',
        work_stage = NULL,
        lease_worker_id = NULL,
        lease_owner = NULL,
        leased_at = NULL,
        lease_expires_at = NULL,
        failure_code = CASE
          WHEN p_observed_size <> session.source_size
            THEN 'source_size_mismatch'
          ELSE 'source_checksum_mismatch'
        END,
        failed_at = v_now,
        publication_state = 'blocked'
      WHERE session.id = v_session.id
      RETURNING * INTO v_session;
      v_event_type := 'work_failed';
    ELSE
      UPDATE co_production.media_ingest_sessions AS session
      SET
        source_observed_size = p_observed_size,
        source_observed_sha256 = v_observed_sha256,
        source_verified_at = v_now,
        state = 'scan_pending',
        scan_state = 'pending',
        work_stage = NULL,
        lease_worker_id = NULL,
        lease_owner = NULL,
        leased_at = NULL,
        lease_expires_at = NULL,
        available_at = v_now
      WHERE session.id = v_session.id
      RETURNING * INTO v_session;
      v_event_type := 'work_verified';
    END IF;
  ELSIF v_stage = 'scan'
    AND v_outcome IN ('clean', 'infected', 'scan_error')
  THEN
    IF v_session.source_verified_at IS NULL
      OR length(v_scan_engine) NOT BETWEEN 1 AND 160
      OR v_scan_engine ~ '[[:cntrl:]]'
      OR v_scan_receipt_hash !~ '^[0-9a-f]{64}$'
      OR v_scan_subject_sha256 !~ '^[0-9a-f]{64}$'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'invalid_media_ingest_scan_evidence';
    END IF;

    IF v_scan_subject_sha256 IS DISTINCT FROM
      v_session.source_expected_sha256
    THEN
      UPDATE co_production.media_ingest_sessions AS session
      SET
        scan_state = 'error',
        scan_engine = v_scan_engine,
        scan_receipt_hash = v_scan_receipt_hash,
        scan_subject_sha256 = v_scan_subject_sha256,
        scanned_at = v_now,
        state = 'failed',
        work_stage = NULL,
        lease_worker_id = NULL,
        lease_owner = NULL,
        leased_at = NULL,
        lease_expires_at = NULL,
        failure_code = 'scan_subject_mismatch',
        failed_at = v_now,
        publication_state = 'blocked'
      WHERE session.id = v_session.id
      RETURNING * INTO v_session;
      v_event_type := 'work_failed';
    ELSE
      UPDATE co_production.media_ingest_sessions AS session
      SET
        scan_state = CASE v_outcome
          WHEN 'clean' THEN 'clean'
          WHEN 'infected' THEN 'infected'
          ELSE 'error'
        END,
        scan_engine = v_scan_engine,
        scan_receipt_hash = v_scan_receipt_hash,
        scan_subject_sha256 = v_scan_subject_sha256,
        scanned_at = v_now,
        state = CASE
          WHEN v_outcome = 'clean' THEN 'transcode_pending'
          ELSE 'quarantined'
        END,
        transcode_state = CASE
          WHEN v_outcome = 'clean' THEN 'pending'
          ELSE 'blocked'
        END,
        work_stage = NULL,
        lease_worker_id = NULL,
        lease_owner = NULL,
        leased_at = NULL,
        lease_expires_at = NULL,
        available_at = v_now,
        publication_state = 'blocked'
      WHERE session.id = v_session.id
      RETURNING * INTO v_session;
      v_event_type := CASE
        WHEN v_outcome = 'clean' THEN 'work_scan_clean'
        ELSE 'work_quarantined'
      END;
    END IF;
  ELSIF v_stage = 'transcode' AND v_outcome = 'ready' THEN
    IF v_session.source_verified_at IS NULL
      OR v_session.scan_state <> 'clean'
      OR v_transcode_receipt_hash !~ '^[0-9a-f]{64}$'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'media_ingest_transcode_gate_failed';
    END IF;

    UPDATE co_production.media_ingest_sessions AS session
    SET
      state = 'ready',
      transcode_state = 'ready',
      transcode_receipt_hash = v_transcode_receipt_hash,
      transcode_ready_at = v_now,
      publication_state = 'eligible',
      work_stage = NULL,
      lease_worker_id = NULL,
      lease_owner = NULL,
      leased_at = NULL,
      lease_expires_at = NULL
    WHERE session.id = v_session.id
    RETURNING * INTO v_session;
    v_event_type := 'work_ready';
  ELSE
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_media_ingest_settlement';
  END IF;

  PERFORM co_production_private.append_media_ingest_event(
    v_session,
    p_request_id,
    v_event_type,
    v_from_state,
    v_worker_actor,
    jsonb_build_object(
      'settlement_fingerprint', v_settlement_fingerprint,
      'worker_id', v_worker_id,
      'worker_subject', v_worker_subject,
      'stage', v_stage,
      'requested_outcome', v_outcome,
      'lease_worker_id', v_lease_worker_id,
      'lease_owner', v_lease_owner,
      'leased_at', v_leased_at,
      'lease_expires_at', v_lease_expires_at,
      'lease_fence', p_lease_fence,
      'observed_size', p_observed_size,
      'observed_sha256', v_observed_sha256,
      'scan_engine', v_scan_engine,
      'scan_receipt_hash', v_scan_receipt_hash,
      'scan_subject_sha256', v_scan_subject_sha256,
      'transcode_receipt_hash', v_transcode_receipt_hash,
      'error_code', v_error_code,
      'retry_at', p_retry_at
    ),
    v_now
  );

  RETURN co_production_private.media_ingest_snapshot(v_session, false);
END
$$;

CREATE OR REPLACE FUNCTION co_production.requeue_quarantined_media_ingest_scan(
  p_tenant_kind text,
  p_tenant_id uuid,
  p_session_id uuid,
  p_request_id uuid,
  p_reason_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_session co_production.media_ingest_sessions%ROWTYPE;
  v_event co_production.media_ingest_events%ROWTYPE;
  v_tenant_kind text := lower(btrim(p_tenant_kind));
  v_reason_code text := lower(btrim(p_reason_code));
  v_worker_id uuid;
  v_actor_ref text;
  v_request_fingerprint text;
  v_now timestamptz := now();
BEGIN
  IF p_request_id IS NULL
    OR v_reason_code !~ '^[a-z0-9][a-z0-9._:-]{0,119}$'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_media_ingest_requeue';
  END IF;

  v_worker_id :=
    co_production_private.assert_media_ingest_worker_authorized(
      v_tenant_kind,
      p_tenant_id,
      'scan'
    );
  v_actor_ref := 'worker:' || v_worker_id::text;
  v_request_fingerprint := co_production_private.media_ingest_sha256(
    jsonb_build_object(
      'schema_version', 'cco.media-ingest-requeue.v1',
      'worker_id', v_worker_id,
      'reason_code', v_reason_code
    )::text
  );

  SELECT session.*
  INTO v_session
  FROM co_production.media_ingest_sessions AS session
  WHERE session.id = p_session_id
    AND session.tenant_kind = v_tenant_kind
    AND session.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'media_ingest_not_found';
  END IF;

  SELECT event.*
  INTO v_event
  FROM co_production.media_ingest_events AS event
  WHERE event.session_id = v_session.id
    AND event.request_id = p_request_id;

  IF FOUND THEN
    IF v_event.event_type <> 'quarantine_requeued'
      OR v_event.detail ->> 'request_fingerprint'
        IS DISTINCT FROM v_request_fingerprint
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'media_ingest_request_conflict';
    END IF;
    RETURN co_production_private.media_ingest_snapshot(v_session, true);
  END IF;

  IF v_session.state <> 'quarantined'
    OR v_session.scan_state <> 'error'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'media_ingest_quarantine_requires_review';
  END IF;

  IF v_session.scan_attempt_count >= v_session.max_work_attempts THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'media_ingest_scan_attempts_exhausted';
  END IF;

  UPDATE co_production.media_ingest_sessions AS session
  SET
    state = 'scan_pending',
    scan_state = 'pending',
    scan_engine = NULL,
    scan_receipt_hash = NULL,
    scan_subject_sha256 = NULL,
    scanned_at = NULL,
    available_at = v_now
  WHERE session.id = v_session.id
  RETURNING * INTO v_session;

  PERFORM co_production_private.append_media_ingest_event(
    v_session,
    p_request_id,
    'quarantine_requeued',
    'quarantined',
    v_actor_ref,
    jsonb_build_object(
      'request_fingerprint', v_request_fingerprint,
      'worker_id', v_worker_id,
      'reason_code', v_reason_code
    ),
    v_now
  );

  RETURN co_production_private.media_ingest_snapshot(v_session, false);
END
$$;

CREATE OR REPLACE FUNCTION co_production.claim_media_ingest_publication(
  p_tenant_kind text,
  p_tenant_id uuid,
  p_session_id uuid,
  p_request_id uuid,
  p_output_digest text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_session co_production.media_ingest_sessions%ROWTYPE;
  v_existing co_production.media_ingest_publication_outbox%ROWTYPE;
  v_output_digest text := lower(
    regexp_replace(btrim(p_output_digest), '^sha256:', '')
  );
  v_claim_fingerprint text;
  v_actor_ref text;
  v_now timestamptz := now();
BEGIN
  IF NOT co_production_private.media_ingest_is_service_role()
    OR p_request_id IS NULL
    OR v_output_digest !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'media_ingest_publication_forbidden';
  END IF;

  v_actor_ref := 'service:media-ingest-publication';
  v_claim_fingerprint := co_production_private.media_ingest_sha256(
    jsonb_build_object(
      'schema_version', 'cco.media-ingest-publication-claim.v1',
      'session_id', p_session_id,
      'request_id', p_request_id,
      'output_digest', v_output_digest
    )::text
  );

  SELECT session.*
  INTO v_session
  FROM co_production.media_ingest_sessions AS session
  WHERE session.id = p_session_id
    AND session.tenant_kind = lower(btrim(p_tenant_kind))
    AND session.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'media_ingest_not_found';
  END IF;

  IF v_session.publication_enabled <> true
    OR v_session.publication_state <> 'eligible'
    OR v_session.state <> 'ready'
    OR v_session.transcode_state <> 'ready'
    OR v_session.transcode_receipt_hash IS DISTINCT FROM v_output_digest
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'media_ingest_publication_blocked';
  END IF;

  SELECT outbox.*
  INTO v_existing
  FROM co_production.media_ingest_publication_outbox AS outbox
  WHERE outbox.session_id = v_session.id
    AND (
      outbox.output_digest = v_output_digest
      OR outbox.request_id = p_request_id
    )
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.output_digest IS DISTINCT FROM v_output_digest
      OR v_existing.claim_fingerprint IS DISTINCT FROM v_claim_fingerprint
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'media_ingest_publication_claim_conflict';
    END IF;
    RETURN jsonb_build_object(
      'schema_version', v_existing.schema_version,
      'claim_id', v_existing.id,
      'session_id', v_existing.session_id,
      'output_digest', v_existing.output_digest,
      'status', v_existing.status,
      'dispatch_enabled', v_existing.dispatch_enabled,
      'replayed', true
    );
  END IF;

  INSERT INTO co_production.media_ingest_publication_outbox (
    tenant_kind,
    tenant_id,
    project_id,
    session_id,
    output_digest,
    request_id,
    claim_fingerprint,
    claimed_by,
    claimed_at
  )
  VALUES (
    v_session.tenant_kind,
    v_session.tenant_id,
    v_session.project_id,
    v_session.id,
    v_output_digest,
    p_request_id,
    v_claim_fingerprint,
    v_actor_ref,
    v_now
  )
  RETURNING * INTO v_existing;

  PERFORM co_production_private.append_media_ingest_event(
    v_session,
    p_request_id,
    'publication_claimed',
    v_session.state,
    v_actor_ref,
    jsonb_build_object(
      'claim_id', v_existing.id,
      'claim_fingerprint', v_existing.claim_fingerprint,
      'output_digest', v_existing.output_digest,
      'dispatch_enabled', v_existing.dispatch_enabled
    ),
    v_now
  );

  RETURN jsonb_build_object(
    'schema_version', v_existing.schema_version,
    'claim_id', v_existing.id,
    'session_id', v_existing.session_id,
    'output_digest', v_existing.output_digest,
    'status', v_existing.status,
    'dispatch_enabled', v_existing.dispatch_enabled,
    'replayed', false
  );
END
$$;

REVOKE ALL ON TABLE co_production.media_ingest_quota_reservations
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.media_ingest_sessions
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.media_ingest_worker_authorizations
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.media_ingest_events
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.media_ingest_publication_outbox
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE co_production.media_ingest_sessions TO authenticated;
GRANT SELECT ON TABLE co_production.media_ingest_events TO authenticated;

REVOKE ALL ON FUNCTION co_production.create_media_ingest_session(
  text, uuid, uuid, text, text, bigint, text, text, text, integer, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production.record_media_ingest_progress(
  text, uuid, uuid, uuid, bigint, bigint, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production.cancel_media_ingest_session(
  text, uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production.claim_media_ingest_work(
  text, uuid, text, integer, integer
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production.renew_media_ingest_lease(
  text, uuid, uuid, bigint, integer
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production.settle_media_ingest_work(
  text, uuid, uuid, uuid, bigint, text, text, bigint, text, text, text,
  text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production.requeue_quarantined_media_ingest_scan(
  text, uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production.claim_media_ingest_publication(
  text, uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION co_production.create_media_ingest_session(
  text, uuid, uuid, text, text, bigint, text, text, text, integer, uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION co_production.record_media_ingest_progress(
  text, uuid, uuid, uuid, bigint, bigint, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION co_production.cancel_media_ingest_session(
  text, uuid, uuid, uuid
) TO authenticated;

GRANT EXECUTE ON FUNCTION co_production.claim_media_ingest_work(
  text, uuid, text, integer, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION co_production.renew_media_ingest_lease(
  text, uuid, uuid, bigint, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION co_production.settle_media_ingest_work(
  text, uuid, uuid, uuid, bigint, text, text, bigint, text, text, text,
  text, text, text, timestamptz
) TO service_role;
GRANT EXECUTE ON FUNCTION co_production.requeue_quarantined_media_ingest_scan(
  text, uuid, uuid, uuid, text
) TO service_role;

REVOKE ALL ON FUNCTION co_production_private.media_ingest_sha256(text)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.media_ingest_is_service_role()
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.media_ingest_current_worker_id()
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.media_ingest_current_worker_subject()
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.assert_media_ingest_worker_authorized(
  text, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.assert_media_ingest_tenant_project_access(
  text, uuid, uuid, integer
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.media_ingest_intent_fingerprint(
  text, uuid, uuid, uuid, text, bigint, text, text, text, integer
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.media_ingest_settlement_fingerprint(
  uuid, uuid, text, text, bigint, bigint, text, text, text, text, text, text,
  timestamptz
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.media_ingest_snapshot(
  co_production.media_ingest_sessions, boolean
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.append_media_ingest_event(
  co_production.media_ingest_sessions, uuid, text, text, text, jsonb, timestamptz
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.guard_media_ingest_quota_update()
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.guard_media_ingest_session_update()
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.prevent_media_ingest_mutation()
FROM PUBLIC, anon, authenticated, service_role;

CREATE INDEX media_ingest_sessions_tenant_state_available_idx
ON co_production.media_ingest_sessions (
  tenant_kind,
  tenant_id,
  state,
  available_at,
  created_at
)
WHERE state IN (
  'verification_pending',
  'scan_pending',
  'transcode_pending'
);

CREATE INDEX media_ingest_sessions_expired_lease_idx
ON co_production.media_ingest_sessions (
  tenant_kind,
  tenant_id,
  work_stage,
  lease_expires_at,
  created_at
)
WHERE state IN ('verifying', 'scanning', 'transcoding');

CREATE INDEX media_ingest_sessions_project_created_idx
ON co_production.media_ingest_sessions (project_id, created_at DESC);

CREATE INDEX media_ingest_events_project_occurred_idx
ON co_production.media_ingest_events (project_id, occurred_at DESC);

CREATE INDEX media_ingest_worker_authorizations_lookup_idx
ON co_production.media_ingest_worker_authorizations (
  worker_id,
  jwt_subject,
  tenant_kind,
  tenant_id,
  stage
)
WHERE enabled = true AND revoked_at IS NULL;

CREATE INDEX media_ingest_publication_outbox_pending_idx
ON co_production.media_ingest_publication_outbox (created_at, id)
WHERE status = 'pending' AND dispatch_enabled = true;

DO $postflight$
DECLARE
  relation record;
  relation_names regclass[] := ARRAY[
    'co_production.media_ingest_quota_reservations'::regclass,
    'co_production.media_ingest_sessions'::regclass,
    'co_production.media_ingest_worker_authorizations'::regclass,
    'co_production.media_ingest_events'::regclass,
    'co_production.media_ingest_publication_outbox'::regclass
  ];
BEGIN
  FOR relation IN
    SELECT
      class.oid::regclass AS relation_name,
      class.relrowsecurity,
      class.relforcerowsecurity
    FROM pg_catalog.pg_class AS class
    WHERE class.oid = ANY (relation_names)
  LOOP
    IF NOT relation.relrowsecurity OR NOT relation.relforcerowsecurity THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'media_ingest_rls_postflight_failed';
    END IF;
  END LOOP;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_class AS class
    WHERE class.oid = ANY (relation_names)
      AND class.relrowsecurity
      AND class.relforcerowsecurity
  ) <> pg_catalog.array_length(relation_names, 1)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'media_ingest_rls_postflight_failed';
  END IF;

  IF pg_catalog.has_table_privilege(
      'anon',
      'co_production.media_ingest_sessions',
      'SELECT'
    )
    OR pg_catalog.has_table_privilege(
      'authenticated',
      'co_production.media_ingest_sessions',
      'INSERT,UPDATE,DELETE,TRUNCATE'
    )
    OR pg_catalog.has_table_privilege(
      'service_role',
      'co_production.media_ingest_sessions',
      'INSERT,UPDATE,DELETE,TRUNCATE'
    )
    OR pg_catalog.has_table_privilege(
      'authenticated',
      'co_production.media_ingest_quota_reservations',
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'
    )
    OR pg_catalog.has_table_privilege(
      'service_role',
      'co_production.media_ingest_worker_authorizations',
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'
    )
    OR pg_catalog.has_table_privilege(
      'service_role',
      'co_production.media_ingest_publication_outbox',
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'media_ingest_table_privilege_postflight_failed';
  END IF;

  IF NOT pg_catalog.has_table_privilege(
      'authenticated',
      'co_production.media_ingest_sessions',
      'SELECT'
    )
    OR NOT pg_catalog.has_table_privilege(
      'authenticated',
      'co_production.media_ingest_events',
      'SELECT'
    )
    OR NOT pg_catalog.has_function_privilege(
      'authenticated',
      'co_production.create_media_ingest_session(text,uuid,uuid,text,text,bigint,text,text,text,integer,uuid)',
      'EXECUTE'
    )
    OR pg_catalog.has_function_privilege(
      'authenticated',
      'co_production.claim_media_ingest_work(text,uuid,text,integer,integer)',
      'EXECUTE'
    )
    OR NOT pg_catalog.has_function_privilege(
      'service_role',
      'co_production.claim_media_ingest_work(text,uuid,text,integer,integer)',
      'EXECUTE'
    )
    OR pg_catalog.has_function_privilege(
      'service_role',
      'co_production.claim_media_ingest_publication(text,uuid,uuid,uuid,text)',
      'EXECUTE'
    )
    OR pg_catalog.has_function_privilege(
      'anon',
      'co_production.create_media_ingest_session(text,uuid,uuid,text,text,bigint,text,text,text,integer,uuid)',
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'media_ingest_function_privilege_postflight_failed';
  END IF;
END
$postflight$;

COMMIT;
