BEGIN;

DO $$
BEGIN
  IF current_setting('server_version_num')::integer < 150000 THEN
    RAISE EXCEPTION 'PostgreSQL 15 or newer is required';
  END IF;
END
$$;

ALTER TABLE co_production.intake_forms
  ADD COLUMN max_attachment_files integer NOT NULL DEFAULT 8 CHECK (
    max_attachment_files BETWEEN 0 AND 20
  ),
  ADD COLUMN max_attachment_bytes bigint NOT NULL DEFAULT 2147483648 CHECK (
    max_attachment_bytes BETWEEN 1048576 AND 5368709120
  ),
  ADD COLUMN max_attachment_total_bytes bigint NOT NULL DEFAULT 5368709120 CHECK (
    max_attachment_total_bytes >= max_attachment_bytes
    AND max_attachment_total_bytes <= 21474836480
  ),
  ADD COLUMN attachment_rate_window_seconds integer NOT NULL DEFAULT 86400 CHECK (
    attachment_rate_window_seconds BETWEEN 900 AND 86400
  ),
  ADD COLUMN attachment_rate_max_files integer NOT NULL DEFAULT 20 CHECK (
    attachment_rate_max_files BETWEEN 1 AND 100
  ),
  ADD COLUMN attachment_rate_max_bytes bigint NOT NULL DEFAULT 10737418240 CHECK (
    attachment_rate_max_bytes BETWEEN 1048576 AND 53687091200
  );

ALTER TABLE co_production.public_inquiries
  ADD CONSTRAINT public_inquiries_id_form_team_key
  UNIQUE (id, intake_form_id, team_id);

CREATE TABLE co_production.public_inquiry_attachment_rate_limits (
  intake_form_id uuid NOT NULL,
  team_id uuid NOT NULL,
  request_fingerprint text NOT NULL CHECK (
    request_fingerprint
      ~ '^hmac-sha256:cco-public-inquiry-rate-limit:v1:[0-9a-f]{64}$'
  ),
  window_started_at timestamptz NOT NULL,
  window_seconds integer NOT NULL CHECK (window_seconds BETWEEN 900 AND 86400),
  file_limit integer NOT NULL CHECK (file_limit BETWEEN 1 AND 100),
  byte_limit bigint NOT NULL CHECK (byte_limit BETWEEN 1048576 AND 53687091200),
  reserved_files integer NOT NULL CHECK (reserved_files BETWEEN 1 AND file_limit),
  reserved_bytes bigint NOT NULL CHECK (reserved_bytes BETWEEN 1 AND byte_limit),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (intake_form_id, request_fingerprint, window_started_at),
  CONSTRAINT public_inquiry_attachment_rate_limits_form_team_fk
    FOREIGN KEY (intake_form_id, team_id)
    REFERENCES co_production.intake_forms(id, team_id)
    ON DELETE RESTRICT
);

CREATE TABLE co_production.public_inquiry_attachment_batches (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  intake_form_id uuid NOT NULL,
  team_id uuid NOT NULL,
  capability_hash text NOT NULL CHECK (capability_hash ~ '^sha256:[0-9a-f]{64}$'),
  request_fingerprint text NOT NULL CHECK (
    request_fingerprint
      ~ '^hmac-sha256:cco-public-inquiry-rate-limit:v1:[0-9a-f]{64}$'
  ),
  status text NOT NULL DEFAULT 'open' CHECK (
    status IN ('open', 'consumed', 'cancelled', 'expired')
  ),
  reserved_files integer NOT NULL DEFAULT 0 CHECK (reserved_files BETWEEN 0 AND 100),
  reserved_bytes bigint NOT NULL DEFAULT 0 CHECK (
    reserved_bytes BETWEEN 0 AND 53687091200
  ),
  consumed_inquiry_id uuid,
  manifest_hash text CHECK (
    manifest_hash IS NULL OR manifest_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  authority_version bigint NOT NULL DEFAULT 1 CHECK (authority_version = 1),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT public_inquiry_attachment_batches_id_form_team_key
    UNIQUE (id, intake_form_id, team_id),
  CONSTRAINT public_inquiry_attachment_batches_form_capability_key
    UNIQUE (intake_form_id, capability_hash),
  CONSTRAINT public_inquiry_attachment_batches_form_team_fk
    FOREIGN KEY (intake_form_id, team_id)
    REFERENCES co_production.intake_forms(id, team_id)
    ON DELETE RESTRICT,
  CONSTRAINT public_inquiry_attachment_batches_consumed_inquiry_fk
    FOREIGN KEY (consumed_inquiry_id, intake_form_id, team_id)
    REFERENCES co_production.public_inquiries(id, intake_form_id, team_id)
    ON DELETE RESTRICT,
  CONSTRAINT public_inquiry_attachment_batches_consumed_shape CHECK (
    (status = 'consumed' AND consumed_inquiry_id IS NOT NULL
      AND manifest_hash IS NOT NULL AND consumed_at IS NOT NULL)
    OR (status <> 'consumed' AND consumed_inquiry_id IS NULL
      AND manifest_hash IS NULL AND consumed_at IS NULL)
  )
);

CREATE TABLE co_production.public_inquiry_uploads (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  batch_id uuid NOT NULL,
  intake_form_id uuid NOT NULL,
  team_id uuid NOT NULL,
  upload_session_id uuid UNIQUE,
  idempotency_key text NOT NULL CHECK (
    idempotency_key = pg_catalog.lower(pg_catalog.btrim(idempotency_key))
    AND idempotency_key ~ '^[a-z0-9][a-z0-9._:-]{15,127}$'
  ),
  reservation_hash text NOT NULL CHECK (reservation_hash ~ '^sha256:[0-9a-f]{64}$'),
  filename text NOT NULL CHECK (
    co_production_private.preproject_safe_text(filename, 1, 512)
  ),
  declared_mime_type text NOT NULL CHECK (
    declared_mime_type IN (
      'video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v',
      'audio/aac', 'audio/flac', 'audio/m4a', 'audio/mp4', 'audio/mpeg',
      'audio/ogg', 'audio/wav', 'audio/x-wav', 'image/heic', 'image/heif',
      'image/jpeg', 'image/png', 'image/tiff', 'image/webp',
      'application/msword', 'application/pdf', 'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    )
  ),
  sniffed_mime_type text CHECK (
    sniffed_mime_type IS NULL OR sniffed_mime_type IN (
      'video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v',
      'audio/aac', 'audio/flac', 'audio/m4a', 'audio/mp4', 'audio/mpeg',
      'audio/ogg', 'audio/wav', 'audio/x-wav', 'image/heic', 'image/heif',
      'image/jpeg', 'image/png', 'image/tiff', 'image/webp',
      'application/msword', 'application/pdf', 'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    )
  ),
  size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 1 AND 5368709120),
  expected_sha256 text NOT NULL CHECK (expected_sha256 ~ '^[0-9a-f]{64}$'),
  computed_sha256 text CHECK (
    computed_sha256 IS NULL OR computed_sha256 ~ '^[0-9a-f]{64}$'
  ),
  upload_offset bigint NOT NULL DEFAULT 0 CHECK (
    upload_offset BETWEEN 0 AND size_bytes
  ),
  upload_state text NOT NULL DEFAULT 'authorized' CHECK (
    upload_state IN (
      'authorized', 'receiving', 'verifying', 'quarantined', 'committed',
      'rejected', 'failed', 'cancelled', 'bound'
    )
  ),
  scan_verdict text CHECK (
    scan_verdict IS NULL OR scan_verdict IN ('pending', 'clean', 'infected', 'error')
  ),
  storage_receipt_hash text CHECK (
    storage_receipt_hash IS NULL OR storage_receipt_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  bound_inquiry_id uuid,
  attachment_ordinal integer CHECK (
    attachment_ordinal IS NULL OR attachment_ordinal BETWEEN 1 AND 20
  ),
  authority_version bigint NOT NULL DEFAULT 1 CHECK (authority_version = 1),
  expires_at timestamptz NOT NULL,
  bound_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT public_inquiry_uploads_batch_idempotency_key
    UNIQUE (batch_id, idempotency_key),
  CONSTRAINT public_inquiry_uploads_form_idempotency_key
    UNIQUE (intake_form_id, idempotency_key),
  CONSTRAINT public_inquiry_uploads_batch_form_team_fk
    FOREIGN KEY (batch_id, intake_form_id, team_id)
    REFERENCES co_production.public_inquiry_attachment_batches(
      id, intake_form_id, team_id
    )
    ON DELETE RESTRICT,
  CONSTRAINT public_inquiry_uploads_bound_inquiry_fk
    FOREIGN KEY (bound_inquiry_id, intake_form_id, team_id)
    REFERENCES co_production.public_inquiries(id, intake_form_id, team_id)
    ON DELETE RESTRICT,
  CONSTRAINT public_inquiry_uploads_bound_shape CHECK (
    (upload_state = 'bound' AND bound_inquiry_id IS NOT NULL
      AND attachment_ordinal IS NOT NULL AND bound_at IS NOT NULL)
    OR (upload_state <> 'bound' AND bound_inquiry_id IS NULL
      AND attachment_ordinal IS NULL AND bound_at IS NULL)
  )
);

ALTER TABLE co_production.public_inquiry_attachment_rate_limits
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.public_inquiry_attachment_rate_limits
  FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.public_inquiry_attachment_batches
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.public_inquiry_attachment_batches
  FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.public_inquiry_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.public_inquiry_uploads FORCE ROW LEVEL SECURITY;

CREATE POLICY public_inquiry_attachment_batches_select
  ON co_production.public_inquiry_attachment_batches
  FOR SELECT TO authenticated
  USING (co_production_private.has_team_role(team_id, 70));
CREATE POLICY public_inquiry_uploads_select
  ON co_production.public_inquiry_uploads
  FOR SELECT TO authenticated
  USING (co_production_private.has_team_role(team_id, 70));

CREATE OR REPLACE FUNCTION co_production_private.guard_public_inquiry_upload_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.upload_state = 'bound'
    OR NEW.id IS DISTINCT FROM OLD.id
    OR NEW.batch_id IS DISTINCT FROM OLD.batch_id
    OR NEW.intake_form_id IS DISTINCT FROM OLD.intake_form_id
    OR NEW.team_id IS DISTINCT FROM OLD.team_id
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.reservation_hash IS DISTINCT FROM OLD.reservation_hash
    OR NEW.filename IS DISTINCT FROM OLD.filename
    OR NEW.declared_mime_type IS DISTINCT FROM OLD.declared_mime_type
    OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes
    OR NEW.expected_sha256 IS DISTINCT FROM OLD.expected_sha256
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    OR NEW.authority_version IS DISTINCT FROM OLD.authority_version
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.upload_offset < OLD.upload_offset
    OR (
      OLD.upload_session_id IS NOT NULL
      AND NEW.upload_session_id IS DISTINCT FROM OLD.upload_session_id
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'public_inquiry_upload_authority_is_immutable';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION co_production_private.guard_public_inquiry_batch_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.status <> 'open'
    OR NEW.id IS DISTINCT FROM OLD.id
    OR NEW.intake_form_id IS DISTINCT FROM OLD.intake_form_id
    OR NEW.team_id IS DISTINCT FROM OLD.team_id
    OR NEW.capability_hash IS DISTINCT FROM OLD.capability_hash
    OR NEW.request_fingerprint IS DISTINCT FROM OLD.request_fingerprint
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    OR NEW.authority_version IS DISTINCT FROM OLD.authority_version
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.reserved_files < OLD.reserved_files
    OR NEW.reserved_bytes < OLD.reserved_bytes
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'public_inquiry_attachment_batch_is_immutable';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER public_inquiry_attachment_rate_limits_no_delete
BEFORE DELETE ON co_production.public_inquiry_attachment_rate_limits
FOR EACH ROW
EXECUTE FUNCTION co_production_private.prevent_preproject_delete();
CREATE TRIGGER public_inquiry_attachment_rate_limits_no_truncate
BEFORE TRUNCATE ON co_production.public_inquiry_attachment_rate_limits
FOR EACH STATEMENT
EXECUTE FUNCTION co_production_private.prevent_preproject_delete();
CREATE TRIGGER public_inquiry_attachment_batches_guard
BEFORE UPDATE ON co_production.public_inquiry_attachment_batches
FOR EACH ROW
EXECUTE FUNCTION co_production_private.guard_public_inquiry_batch_update();
CREATE TRIGGER public_inquiry_attachment_batches_no_delete
BEFORE DELETE ON co_production.public_inquiry_attachment_batches
FOR EACH ROW
EXECUTE FUNCTION co_production_private.prevent_preproject_delete();
CREATE TRIGGER public_inquiry_attachment_batches_no_truncate
BEFORE TRUNCATE ON co_production.public_inquiry_attachment_batches
FOR EACH STATEMENT
EXECUTE FUNCTION co_production_private.prevent_preproject_delete();
CREATE TRIGGER public_inquiry_uploads_guard
BEFORE UPDATE ON co_production.public_inquiry_uploads
FOR EACH ROW
EXECUTE FUNCTION co_production_private.guard_public_inquiry_upload_update();
CREATE TRIGGER public_inquiry_uploads_no_delete
BEFORE DELETE ON co_production.public_inquiry_uploads
FOR EACH ROW
EXECUTE FUNCTION co_production_private.prevent_preproject_delete();
CREATE TRIGGER public_inquiry_uploads_no_truncate
BEFORE TRUNCATE ON co_production.public_inquiry_uploads
FOR EACH STATEMENT
EXECUTE FUNCTION co_production_private.prevent_preproject_delete();

CREATE OR REPLACE FUNCTION co_production.begin_public_inquiry_upload(
  p_form_key text,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_batch_capability_hash text,
  p_filename text,
  p_mime_type text,
  p_size_bytes bigint,
  p_expected_sha256 text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_form co_production.intake_forms%ROWTYPE;
  v_batch co_production.public_inquiry_attachment_batches%ROWTYPE;
  v_upload co_production.public_inquiry_uploads%ROWTYPE;
  v_idempotency_key text := pg_catalog.lower(pg_catalog.btrim(p_idempotency_key));
  v_filename text := pg_catalog.btrim(p_filename);
  v_mime_type text := pg_catalog.lower(pg_catalog.btrim(p_mime_type));
  v_expected_sha256 text := pg_catalog.lower(pg_catalog.btrim(p_expected_sha256));
  v_reservation_hash text;
  v_window_start timestamptz;
  v_now timestamptz := statement_timestamp();
  v_active_files integer;
  v_active_bytes bigint;
BEGIN
  IF COALESCE((SELECT auth.jwt() ->> 'role'), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'public_upload_forbidden';
  END IF;
  IF p_form_key !~ '^ifm_[0-9a-f]{64}$'
    OR v_idempotency_key !~ '^[a-z0-9][a-z0-9._:-]{15,127}$'
    OR p_request_fingerprint
      !~ '^hmac-sha256:cco-public-inquiry-rate-limit:v1:[0-9a-f]{64}$'
    OR p_batch_capability_hash !~ '^sha256:[0-9a-f]{64}$'
    OR NOT co_production_private.preproject_safe_text(v_filename, 1, 512)
    OR p_size_bytes IS NULL OR p_size_bytes < 1
    OR v_expected_sha256 !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_public_upload';
  END IF;

  SELECT form.* INTO v_form
  FROM co_production.intake_forms AS form
  WHERE form.opaque_key = p_form_key AND form.status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'public_intake_form_not_found';
  END IF;
  IF p_size_bytes > v_form.max_attachment_bytes THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'public_upload_too_large';
  END IF;

  v_reservation_hash := co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'form_key', p_form_key,
      'idempotency_key', v_idempotency_key,
      'batch_capability_hash', p_batch_capability_hash,
      'filename', v_filename,
      'mime_type', v_mime_type,
      'size_bytes', p_size_bytes,
      'expected_sha256', v_expected_sha256
    )::text
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'cco:public-upload:' || v_form.id::text || ':' || v_idempotency_key,
      0
    )
  );

  SELECT upload.* INTO v_upload
  FROM co_production.public_inquiry_uploads AS upload
  WHERE upload.intake_form_id = v_form.id
    AND upload.idempotency_key = v_idempotency_key;
  IF FOUND THEN
    SELECT batch.* INTO v_batch
    FROM co_production.public_inquiry_attachment_batches AS batch
    WHERE batch.id = v_upload.batch_id;
    IF v_batch.capability_hash IS DISTINCT FROM p_batch_capability_hash
      OR v_batch.request_fingerprint IS DISTINCT FROM p_request_fingerprint
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'public_upload_not_found';
    END IF;
    IF v_upload.reservation_hash IS DISTINCT FROM v_reservation_hash THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'public_upload_conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'authority_id', v_upload.id,
      'batch_id', v_upload.batch_id,
      'team_id', v_upload.team_id,
      'form_key', p_form_key,
      'upload_session_id', v_upload.upload_session_id,
      'filename', v_upload.filename,
      'mime_type', v_upload.declared_mime_type,
      'size_bytes', v_upload.size_bytes,
      'upload_offset', v_upload.upload_offset,
      'upload_state', v_upload.upload_state,
      'expected_sha256', v_upload.expected_sha256,
      'computed_sha256', v_upload.computed_sha256,
      'scan_verdict', v_upload.scan_verdict,
      'expires_at', v_upload.expires_at,
      'replayed', true
    );
  END IF;

  SELECT batch.* INTO v_batch
  FROM co_production.public_inquiry_attachment_batches AS batch
  WHERE batch.intake_form_id = v_form.id
    AND batch.capability_hash = p_batch_capability_hash
  FOR UPDATE;
  IF FOUND THEN
    IF v_batch.status <> 'open'
      OR v_batch.expires_at <= v_now
      OR v_batch.request_fingerprint IS DISTINCT FROM p_request_fingerprint
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'public_upload_not_found';
    END IF;
  ELSE
    INSERT INTO co_production.public_inquiry_attachment_batches (
      intake_form_id, team_id, capability_hash, request_fingerprint, expires_at
    ) VALUES (
      v_form.id, v_form.team_id, p_batch_capability_hash, p_request_fingerprint,
      v_now + interval '24 hours'
    ) RETURNING * INTO v_batch;
  END IF;

  SELECT pg_catalog.count(*)::integer, COALESCE(pg_catalog.sum(upload.size_bytes), 0)
  INTO v_active_files, v_active_bytes
  FROM co_production.public_inquiry_uploads AS upload
  WHERE upload.batch_id = v_batch.id
    AND upload.upload_state <> 'cancelled';
  IF v_active_files + 1 > v_form.max_attachment_files
    OR v_active_bytes + p_size_bytes > v_form.max_attachment_total_bytes
  THEN
    RAISE EXCEPTION USING ERRCODE = '54000', MESSAGE = 'public_upload_batch_limit';
  END IF;

  v_window_start := pg_catalog.date_bin(
    pg_catalog.make_interval(secs => v_form.attachment_rate_window_seconds),
    v_now,
    '1970-01-01 00:00:00+00'::timestamptz
  );
  INSERT INTO co_production.public_inquiry_attachment_rate_limits (
    intake_form_id, team_id, request_fingerprint, window_started_at,
    window_seconds, file_limit, byte_limit, reserved_files, reserved_bytes
  ) VALUES (
    v_form.id, v_form.team_id, p_request_fingerprint, v_window_start,
    v_form.attachment_rate_window_seconds, v_form.attachment_rate_max_files,
    v_form.attachment_rate_max_bytes, 1, p_size_bytes
  )
  ON CONFLICT (intake_form_id, request_fingerprint, window_started_at)
  DO UPDATE SET
    reserved_files = co_production.public_inquiry_attachment_rate_limits.reserved_files + 1,
    reserved_bytes = co_production.public_inquiry_attachment_rate_limits.reserved_bytes + p_size_bytes,
    updated_at = v_now
  WHERE co_production.public_inquiry_attachment_rate_limits.reserved_files + 1
      <= co_production.public_inquiry_attachment_rate_limits.file_limit
    AND co_production.public_inquiry_attachment_rate_limits.reserved_bytes + p_size_bytes
      <= co_production.public_inquiry_attachment_rate_limits.byte_limit;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'public_upload_rate_limited';
  END IF;

  UPDATE co_production.public_inquiry_attachment_batches
  SET reserved_files = reserved_files + 1,
      reserved_bytes = reserved_bytes + p_size_bytes,
      updated_at = v_now
  WHERE id = v_batch.id
  RETURNING * INTO v_batch;

  INSERT INTO co_production.public_inquiry_uploads (
    batch_id, intake_form_id, team_id, idempotency_key, reservation_hash,
    filename, declared_mime_type, size_bytes, expected_sha256, expires_at
  ) VALUES (
    v_batch.id, v_form.id, v_form.team_id, v_idempotency_key,
    v_reservation_hash, v_filename, v_mime_type, p_size_bytes,
    v_expected_sha256, v_batch.expires_at
  ) RETURNING * INTO v_upload;

  RETURN pg_catalog.jsonb_build_object(
    'authority_id', v_upload.id,
    'batch_id', v_upload.batch_id,
    'team_id', v_upload.team_id,
    'form_key', p_form_key,
    'upload_session_id', v_upload.upload_session_id,
    'filename', v_upload.filename,
    'mime_type', v_upload.declared_mime_type,
    'size_bytes', v_upload.size_bytes,
    'upload_offset', v_upload.upload_offset,
    'upload_state', v_upload.upload_state,
    'expected_sha256', v_upload.expected_sha256,
    'computed_sha256', v_upload.computed_sha256,
    'scan_verdict', v_upload.scan_verdict,
    'expires_at', v_upload.expires_at,
    'replayed', false
  );
END
$$;

CREATE OR REPLACE FUNCTION co_production.bind_public_inquiry_upload_session(
  p_authority_id uuid,
  p_batch_capability_hash text,
  p_upload_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_upload co_production.public_inquiry_uploads%ROWTYPE;
  v_form_key text;
BEGIN
  IF COALESCE((SELECT auth.jwt() ->> 'role'), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'public_upload_forbidden';
  END IF;
  SELECT upload.* INTO v_upload
  FROM co_production.public_inquiry_uploads AS upload
  JOIN co_production.public_inquiry_attachment_batches AS batch
    ON batch.id = upload.batch_id
  WHERE upload.id = p_authority_id
    AND batch.capability_hash = p_batch_capability_hash
    AND batch.status = 'open'
    AND upload.expires_at > statement_timestamp()
  FOR UPDATE OF upload;
  IF NOT FOUND OR (
    v_upload.upload_session_id IS NOT NULL
    AND v_upload.upload_session_id IS DISTINCT FROM p_upload_session_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'public_upload_not_found';
  END IF;
  SELECT form.opaque_key INTO v_form_key
  FROM co_production.intake_forms AS form
  WHERE form.id = v_upload.intake_form_id;
  UPDATE co_production.public_inquiry_uploads
  SET upload_session_id = p_upload_session_id,
      upload_state = CASE WHEN upload_state = 'authorized' THEN 'receiving' ELSE upload_state END,
      updated_at = statement_timestamp()
  WHERE id = p_authority_id
  RETURNING * INTO v_upload;
  RETURN pg_catalog.jsonb_build_object(
    'authority_id', v_upload.id, 'team_id', v_upload.team_id,
    'form_key', v_form_key, 'upload_session_id', v_upload.upload_session_id,
    'filename', v_upload.filename, 'mime_type', v_upload.declared_mime_type,
    'size_bytes', v_upload.size_bytes, 'upload_offset', v_upload.upload_offset,
    'upload_state', v_upload.upload_state, 'expected_sha256', v_upload.expected_sha256,
    'computed_sha256', v_upload.computed_sha256, 'scan_verdict', v_upload.scan_verdict,
    'expires_at', v_upload.expires_at, 'replayed', false
  );
END
$$;

CREATE OR REPLACE FUNCTION co_production.read_public_inquiry_upload_authority(
  p_upload_session_id uuid,
  p_batch_capability_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_upload co_production.public_inquiry_uploads%ROWTYPE;
  v_form_key text;
BEGIN
  IF COALESCE((SELECT auth.jwt() ->> 'role'), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'public_upload_forbidden';
  END IF;
  SELECT upload.* INTO v_upload
  FROM co_production.public_inquiry_uploads AS upload
  JOIN co_production.public_inquiry_attachment_batches AS batch
    ON batch.id = upload.batch_id
  WHERE upload.upload_session_id = p_upload_session_id
    AND batch.capability_hash = p_batch_capability_hash
    AND (upload.expires_at > statement_timestamp() OR upload.upload_state = 'bound');
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'public_upload_not_found';
  END IF;
  SELECT form.opaque_key INTO v_form_key
  FROM co_production.intake_forms AS form
  WHERE form.id = v_upload.intake_form_id;
  RETURN pg_catalog.jsonb_build_object(
    'authority_id', v_upload.id, 'team_id', v_upload.team_id,
    'form_key', v_form_key, 'upload_session_id', v_upload.upload_session_id,
    'filename', v_upload.filename, 'mime_type', v_upload.declared_mime_type,
    'size_bytes', v_upload.size_bytes, 'upload_offset', v_upload.upload_offset,
    'upload_state', v_upload.upload_state, 'expected_sha256', v_upload.expected_sha256,
    'computed_sha256', v_upload.computed_sha256, 'scan_verdict', v_upload.scan_verdict,
    'expires_at', v_upload.expires_at, 'replayed', false
  );
END
$$;

CREATE OR REPLACE FUNCTION co_production.record_public_inquiry_upload_progress(
  p_authority_id uuid,
  p_batch_capability_hash text,
  p_expected_offset bigint,
  p_next_offset bigint,
  p_upload_state text,
  p_computed_sha256 text,
  p_sniffed_mime_type text,
  p_scan_verdict text,
  p_storage_receipt_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_upload co_production.public_inquiry_uploads%ROWTYPE;
  v_form_key text;
BEGIN
  IF COALESCE((SELECT auth.jwt() ->> 'role'), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'public_upload_forbidden';
  END IF;
  SELECT upload.* INTO v_upload
  FROM co_production.public_inquiry_uploads AS upload
  JOIN co_production.public_inquiry_attachment_batches AS batch
    ON batch.id = upload.batch_id
  WHERE upload.id = p_authority_id
    AND batch.capability_hash = p_batch_capability_hash
    AND batch.status = 'open'
    AND upload.expires_at > statement_timestamp()
  FOR UPDATE OF upload;
  IF NOT FOUND OR v_upload.upload_state IN ('cancelled', 'bound') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'public_upload_not_found';
  END IF;
  IF v_upload.upload_offset IS DISTINCT FROM p_expected_offset
    OR p_next_offset < p_expected_offset OR p_next_offset > v_upload.size_bytes
    OR p_upload_state NOT IN (
      'receiving', 'verifying', 'quarantined', 'committed', 'rejected', 'failed'
    )
    OR (p_computed_sha256 IS NOT NULL AND p_computed_sha256 !~ '^[0-9a-f]{64}$')
    OR (
      p_sniffed_mime_type IS NOT NULL
      AND pg_catalog.lower(pg_catalog.btrim(p_sniffed_mime_type))
        IS DISTINCT FROM v_upload.declared_mime_type
    )
    OR (p_scan_verdict IS NOT NULL
      AND p_scan_verdict NOT IN ('pending', 'clean', 'infected', 'error'))
    OR (p_storage_receipt_hash IS NOT NULL
      AND p_storage_receipt_hash !~ '^sha256:[0-9a-f]{64}$')
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_public_upload_progress';
  END IF;
  SELECT form.opaque_key INTO v_form_key
  FROM co_production.intake_forms AS form
  WHERE form.id = v_upload.intake_form_id;
  IF p_next_offset = v_upload.size_bytes
    AND p_computed_sha256 IS DISTINCT FROM v_upload.expected_sha256
  THEN
    RAISE EXCEPTION USING ERRCODE = '22000', MESSAGE = 'public_upload_checksum_mismatch';
  END IF;
  UPDATE co_production.public_inquiry_uploads
  SET upload_offset = p_next_offset,
      upload_state = p_upload_state,
      computed_sha256 = COALESCE(p_computed_sha256, computed_sha256),
      sniffed_mime_type = COALESCE(
        pg_catalog.lower(pg_catalog.btrim(p_sniffed_mime_type)),
        sniffed_mime_type
      ),
      scan_verdict = p_scan_verdict,
      storage_receipt_hash = p_storage_receipt_hash,
      updated_at = statement_timestamp()
  WHERE id = p_authority_id
  RETURNING * INTO v_upload;
  RETURN pg_catalog.jsonb_build_object(
    'authority_id', v_upload.id, 'team_id', v_upload.team_id,
    'form_key', v_form_key, 'upload_session_id', v_upload.upload_session_id,
    'filename', v_upload.filename, 'mime_type', v_upload.declared_mime_type,
    'size_bytes', v_upload.size_bytes, 'upload_offset', v_upload.upload_offset,
    'upload_state', v_upload.upload_state, 'expected_sha256', v_upload.expected_sha256,
    'computed_sha256', v_upload.computed_sha256, 'scan_verdict', v_upload.scan_verdict,
    'expires_at', v_upload.expires_at, 'replayed', false
  );
END
$$;

CREATE OR REPLACE FUNCTION co_production.cancel_public_inquiry_upload(
  p_authority_id uuid,
  p_batch_capability_hash text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_upload_state text;
BEGIN
  IF COALESCE((SELECT auth.jwt() ->> 'role'), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'public_upload_forbidden';
  END IF;
  SELECT upload.upload_state INTO v_upload_state
  FROM co_production.public_inquiry_uploads AS upload
  JOIN co_production.public_inquiry_attachment_batches AS batch
    ON batch.id = upload.batch_id
  WHERE upload.id = p_authority_id
    AND batch.capability_hash = p_batch_capability_hash
    AND batch.status = 'open'
    AND upload.bound_inquiry_id IS NULL
  FOR UPDATE OF upload;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'public_upload_not_found';
  END IF;
  IF v_upload_state = 'cancelled' THEN
    RETURN;
  END IF;
  UPDATE co_production.public_inquiry_uploads AS upload
  SET upload_state = 'cancelled', updated_at = statement_timestamp()
  WHERE upload.id = p_authority_id
    AND upload.upload_state <> 'cancelled';
END
$$;

CREATE OR REPLACE FUNCTION co_production.submit_public_inquiry(
  p_form_key text,
  p_idempotency_key text,
  p_request_id uuid,
  p_request_fingerprint text,
  p_payload jsonb,
  p_attachment_claim jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
  v_form co_production.intake_forms%ROWTYPE;
  v_inquiry co_production.public_inquiries%ROWTYPE;
  v_batch co_production.public_inquiry_attachment_batches%ROWTYPE;
  v_upload co_production.public_inquiry_uploads%ROWTYPE;
  v_claim jsonb;
  v_attachment_ids uuid[] := ARRAY[]::uuid[];
  v_attachment_id uuid;
  v_manifest jsonb := '[]'::jsonb;
  v_manifest_hash text;
  v_capability_hash text;
  v_total_bytes bigint := 0;
  v_ordinal integer := 0;
  v_attachment_count integer;
BEGIN
  IF COALESCE((SELECT auth.jwt() ->> 'role'), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'public_inquiry_submission_forbidden';
  END IF;
  IF NOT co_production_private.preproject_exact_json_keys(
      p_attachment_claim, ARRAY['batchToken', 'attachments']
    )
    OR pg_catalog.jsonb_typeof(p_attachment_claim -> 'attachments') IS DISTINCT FROM 'array'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_attachment_claim';
  END IF;
  v_attachment_count := pg_catalog.jsonb_array_length(p_attachment_claim -> 'attachments');

  SELECT form.* INTO v_form
  FROM co_production.intake_forms AS form
  WHERE form.opaque_key = p_form_key AND form.status = 'active'
  FOR SHARE;
  IF NOT FOUND OR v_attachment_count > v_form.max_attachment_files THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_attachment_claim';
  END IF;
  IF v_attachment_count = 0 THEN
    IF pg_catalog.jsonb_typeof(p_attachment_claim -> 'batchToken') <> 'null' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_attachment_claim';
    END IF;
  ELSE
    IF (p_attachment_claim ->> 'batchToken') !~ '^iatb_[0-9a-f]{64}$' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_attachment_claim';
    END IF;
    v_capability_hash := co_production_private.preproject_sha256(
      p_attachment_claim ->> 'batchToken'
    );
  END IF;

  v_result := co_production.submit_public_inquiry(
    p_form_key, p_idempotency_key, p_request_id,
    p_request_fingerprint, p_payload
  );
  SELECT inquiry.* INTO v_inquiry
  FROM co_production.public_inquiries AS inquiry
  WHERE inquiry.intake_form_id = v_form.id
    AND inquiry.idempotency_key = pg_catalog.lower(pg_catalog.btrim(p_idempotency_key));
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'public_inquiry_not_found';
  END IF;
  IF v_attachment_count = 0 THEN
    RETURN v_result || pg_catalog.jsonb_build_object('attachment_count', 0);
  END IF;

  SELECT batch.* INTO v_batch
  FROM co_production.public_inquiry_attachment_batches AS batch
  WHERE batch.intake_form_id = v_form.id
    AND batch.team_id = v_form.team_id
    AND batch.capability_hash = v_capability_hash
    AND batch.request_fingerprint = p_request_fingerprint
  FOR UPDATE;
  IF NOT FOUND OR (
    v_batch.status = 'open' AND v_batch.expires_at <= statement_timestamp()
  ) OR v_batch.status NOT IN ('open', 'consumed') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'attachment_claim_not_found';
  END IF;

  FOR v_claim IN
    SELECT value
    FROM pg_catalog.jsonb_array_elements(p_attachment_claim -> 'attachments')
    ORDER BY value ->> 'attachmentId'
  LOOP
    IF NOT co_production_private.preproject_exact_json_keys(
        v_claim, ARRAY['attachmentId', 'contentHash']
      )
      OR (v_claim ->> 'attachmentId') !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR (v_claim ->> 'contentHash') !~ '^sha256:[0-9a-f]{64}$'
      OR (v_claim ->> 'attachmentId')::uuid = ANY(v_attachment_ids)
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_attachment_claim';
    END IF;
    v_attachment_ids := pg_catalog.array_append(
      v_attachment_ids, (v_claim ->> 'attachmentId')::uuid
    );
    SELECT upload.* INTO v_upload
    FROM co_production.public_inquiry_uploads AS upload
    WHERE upload.id = (v_claim ->> 'attachmentId')::uuid
      AND upload.batch_id = v_batch.id
      AND upload.intake_form_id = v_form.id
      AND upload.team_id = v_form.team_id
    FOR UPDATE;
    IF NOT FOUND
      OR v_upload.upload_state NOT IN ('quarantined', 'committed', 'bound')
      OR v_upload.upload_offset <> v_upload.size_bytes
      OR v_upload.computed_sha256 IS NULL
      OR 'sha256:' || v_upload.computed_sha256 IS DISTINCT FROM
        (v_claim ->> 'contentHash')
      OR v_upload.computed_sha256 IS DISTINCT FROM v_upload.expected_sha256
      OR v_upload.scan_verdict = 'infected'
      OR (v_upload.bound_inquiry_id IS NOT NULL
        AND v_upload.bound_inquiry_id IS DISTINCT FROM v_inquiry.id)
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'attachment_claim_not_found';
    END IF;
    v_ordinal := v_ordinal + 1;
    v_total_bytes := v_total_bytes + v_upload.size_bytes;
    v_manifest := v_manifest || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'attachment_id', v_upload.id,
        'ordinal', v_ordinal,
        'filename', v_upload.filename,
        'mime_type', COALESCE(v_upload.sniffed_mime_type, v_upload.declared_mime_type),
        'size_bytes', v_upload.size_bytes,
        'content_hash', 'sha256:' || v_upload.computed_sha256,
        'storage_receipt_hash', v_upload.storage_receipt_hash,
        'scan_verdict', v_upload.scan_verdict
      )
    );
  END LOOP;
  IF v_total_bytes > v_form.max_attachment_total_bytes THEN
    RAISE EXCEPTION USING ERRCODE = '54000', MESSAGE = 'attachment_claim_too_large';
  END IF;
  v_manifest_hash := co_production_private.preproject_sha256(v_manifest::text);

  IF v_batch.status = 'consumed' THEN
    IF v_batch.consumed_inquiry_id IS DISTINCT FROM v_inquiry.id
      OR v_batch.manifest_hash IS DISTINCT FROM v_manifest_hash
    THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'attachment_claim_conflict';
    END IF;
  ELSE
    v_ordinal := 0;
    FOREACH v_attachment_id IN ARRAY v_attachment_ids LOOP
      v_ordinal := v_ordinal + 1;
      UPDATE co_production.public_inquiry_uploads
      SET upload_state = 'bound', bound_inquiry_id = v_inquiry.id,
          attachment_ordinal = v_ordinal, bound_at = statement_timestamp(),
          updated_at = statement_timestamp()
      WHERE id = v_attachment_id;
    END LOOP;
    UPDATE co_production.public_inquiry_attachment_batches
    SET status = 'consumed', consumed_inquiry_id = v_inquiry.id,
        manifest_hash = v_manifest_hash, consumed_at = statement_timestamp(),
        updated_at = statement_timestamp()
    WHERE id = v_batch.id;
  END IF;
  RETURN v_result || pg_catalog.jsonb_build_object(
    'attachment_count', v_attachment_count
  );
END
$$;

REVOKE ALL ON TABLE co_production.public_inquiry_attachment_rate_limits
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.public_inquiry_attachment_batches
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.public_inquiry_uploads
  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT (
  id, intake_form_id, team_id, status, reserved_files, reserved_bytes,
  consumed_inquiry_id, manifest_hash, authority_version, expires_at,
  consumed_at, created_at, updated_at
) ON co_production.public_inquiry_attachment_batches TO authenticated;
GRANT SELECT (
  id, batch_id, intake_form_id, team_id, upload_session_id, filename,
  declared_mime_type, sniffed_mime_type, size_bytes, expected_sha256,
  computed_sha256, upload_offset, upload_state, scan_verdict,
  storage_receipt_hash, bound_inquiry_id, attachment_ordinal,
  authority_version, expires_at, bound_at, created_at, updated_at
) ON co_production.public_inquiry_uploads TO authenticated;
GRANT SELECT ON TABLE co_production.public_inquiry_attachment_batches TO service_role;
GRANT SELECT ON TABLE co_production.public_inquiry_uploads TO service_role;

REVOKE ALL ON FUNCTION co_production.begin_public_inquiry_upload(
  text, text, text, text, text, text, bigint, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION co_production.begin_public_inquiry_upload(
  text, text, text, text, text, text, bigint, text
) TO service_role;
REVOKE ALL ON FUNCTION co_production.bind_public_inquiry_upload_session(
  uuid, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION co_production.bind_public_inquiry_upload_session(
  uuid, text, uuid
) TO service_role;
REVOKE ALL ON FUNCTION co_production.read_public_inquiry_upload_authority(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION co_production.read_public_inquiry_upload_authority(uuid, text)
  TO service_role;
REVOKE ALL ON FUNCTION co_production.record_public_inquiry_upload_progress(
  uuid, text, bigint, bigint, text, text, text, text, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION co_production.record_public_inquiry_upload_progress(
  uuid, text, bigint, bigint, text, text, text, text, text
) TO service_role;
REVOKE ALL ON FUNCTION co_production.cancel_public_inquiry_upload(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION co_production.cancel_public_inquiry_upload(uuid, text)
  TO service_role;
REVOKE ALL ON FUNCTION co_production.submit_public_inquiry(
  text, text, uuid, text, jsonb, jsonb
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION co_production.submit_public_inquiry(
  text, text, uuid, text, jsonb, jsonb
) TO service_role;

REVOKE ALL ON FUNCTION co_production_private.guard_public_inquiry_upload_update()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.guard_public_inquiry_batch_update()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE INDEX public_inquiry_attachment_rate_limits_team_window_idx
  ON co_production.public_inquiry_attachment_rate_limits(
    team_id, window_started_at DESC
  );
CREATE INDEX public_inquiry_attachment_batches_team_created_idx
  ON co_production.public_inquiry_attachment_batches(team_id, created_at DESC);
CREATE INDEX public_inquiry_uploads_batch_state_idx
  ON co_production.public_inquiry_uploads(batch_id, upload_state, id);
CREATE INDEX public_inquiry_uploads_inquiry_ordinal_idx
  ON co_production.public_inquiry_uploads(bound_inquiry_id, attachment_ordinal)
  WHERE bound_inquiry_id IS NOT NULL;

COMMIT;
