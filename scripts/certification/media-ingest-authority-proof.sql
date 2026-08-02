\set ON_ERROR_STOP on
\o /dev/null

CREATE OR REPLACE FUNCTION pg_temp.assert_true(
  p_condition boolean,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_condition IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'proof assertion failed: %', p_message;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_error(
  p_statement text,
  p_expected_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_message text;
BEGIN
  BEGIN
    EXECUTE p_statement;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF pg_catalog.strpos(v_message, p_expected_message) > 0 THEN
      RETURN;
    END IF;
    RAISE EXCEPTION
      'expected error containing %, got %',
      p_expected_message,
      v_message;
  END;
  RAISE EXCEPTION 'expected error containing %, got success', p_expected_message;
END
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_worker_denied()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_message text;
BEGIN
  BEGIN
    PERFORM co_production.claim_media_ingest_work(
      'team',
      '22222222-2222-4222-8222-222222222222',
      'verify',
      1,
      90
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message = 'media_ingest_worker_forbidden' THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'unexpected worker denial: %', v_message;
  END;
  RAISE EXCEPTION 'disabled worker authorization unexpectedly leased work';
END
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_changed_settlement_conflict(
  p_session_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_message text;
BEGIN
  BEGIN
    PERFORM co_production.settle_media_ingest_work(
      p_tenant_kind => 'team',
      p_tenant_id => '22222222-2222-4222-8222-222222222222',
      p_session_id => p_session_id,
      p_request_id => '79797979-7979-4979-8979-797979797979',
      p_lease_fence => 3,
      p_stage => 'verify',
      p_outcome => 'verified',
      p_observed_size => 42,
      p_observed_sha256 => repeat('d', 64)
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message = 'media_ingest_request_conflict' THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'unexpected settlement replay error: %', v_message;
  END;
  RAISE EXCEPTION 'changed settlement replay unexpectedly succeeded';
END
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_quota_failure(
  p_reservation_ref text,
  p_idempotency_key text,
  p_size bigint
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_message text;
BEGIN
  BEGIN
    PERFORM co_production.create_media_ingest_session(
      'team',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      p_idempotency_key,
      'quota-proof.mov',
      p_size,
      'video/quicktime',
      repeat('a', 64),
      p_reservation_ref,
      3,
      NULL
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message = 'media_ingest_quota_reservation_unavailable' THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'unexpected quota denial: %', v_message;
  END;
  RAISE EXCEPTION 'invalid quota reservation unexpectedly succeeded';
END
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_not_found_progress(
  p_session_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_message text;
BEGIN
  BEGIN
    PERFORM co_production.record_media_ingest_progress(
      'team',
      '22222222-2222-4222-8222-222222222222',
      p_session_id,
      '89898989-8989-4989-8989-898989898989',
      42,
      43,
      repeat('b', 64)
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message = 'media_ingest_not_found' THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'unexpected forbidden/not-found response: %', v_message;
  END;
  RAISE EXCEPTION 'forbidden progress unexpectedly succeeded';
END
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_publication_blocked(
  p_session_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_message text;
BEGIN
  BEGIN
    PERFORM co_production.claim_media_ingest_publication(
      'team',
      '22222222-2222-4222-8222-222222222222',
      p_session_id,
      '90909090-9090-4090-8090-909090909090',
      repeat('c', 64)
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message = 'media_ingest_publication_blocked' THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'unexpected publication denial: %', v_message;
  END;
  RAISE EXCEPTION 'disabled publication unexpectedly created a claim';
END
$$;

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM co_production.media_ingest_worker_authorizations
  ),
  'migration must not issue worker authorization'
);

INSERT INTO co_production.media_ingest_quota_reservations (
  reservation_ref,
  tenant_kind,
  tenant_id,
  project_id,
  reserved_bytes,
  issued_by,
  issued_at,
  expires_at
)
VALUES
  (
    'quota:proof-main-0001',
    'team',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    42,
    'proof:quota-controller',
    now() - interval '1 minute',
    now() + interval '1 hour'
  ),
  (
    'quota:proof-expired-01',
    'team',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    42,
    'proof:quota-controller',
    now() - interval '2 hours',
    now() - interval '1 hour'
  ),
  (
    'quota:proof-wrong-tenant',
    'team',
    '23232323-2323-4232-8232-232323232323',
    '33333333-3333-4333-8333-333333333333',
    42,
    'proof:quota-controller',
    now() - interval '1 minute',
    now() + interval '1 hour'
  ),
  (
    'quota:proof-wrong-project',
    'team',
    '22222222-2222-4222-8222-222222222222',
    '34343434-3434-4343-8343-343434343434',
    42,
    'proof:quota-controller',
    now() - interval '1 minute',
    now() + interval '1 hour'
  ),
  (
    'quota:proof-too-small-01',
    'team',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    41,
    'proof:quota-controller',
    now() - interval '1 minute',
    now() + interval '1 hour'
  ),
  (
    'quota:proof-folder-test',
    'team',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    42,
    'proof:quota-controller',
    now() - interval '1 minute',
    now() + interval '1 hour'
  );

SELECT pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"11111111-1111-4111-8111-111111111111"}',
  false
);
SET ROLE authenticated;

SELECT (
  co_production.create_media_ingest_session(
    'team',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    'media-proof-request-0001',
    'master.mov',
    42,
    'video/quicktime',
    repeat('a', 64),
    'quota:proof-main-0001',
    3,
    '44444444-4444-4444-8444-444444444444'
  ) ->> 'session_id'
) AS session_id
\gset

SELECT co_production.record_media_ingest_progress(
  'team',
  '22222222-2222-4222-8222-222222222222',
  :'session_id'::uuid,
  '71717171-7171-4171-8171-717171717171',
  0,
  42,
  repeat('b', 64)
);
RESET ROLE;

SELECT pg_temp.assert_true(
  (
    SELECT reservation.consumed_by_session_id = :'session_id'::uuid
      AND reservation.consumed_at IS NOT NULL
    FROM co_production.media_ingest_quota_reservations AS reservation
    WHERE reservation.reservation_ref = 'quota:proof-main-0001'
  ),
  'quota reservation was not atomically consumed'
);

SELECT pg_temp.assert_true(
  (
    SELECT session.schema_version = 'cco.media-ingest-authority.v1'
      AND session.quota_reserved_bytes = 42
      AND session.publication_enabled = false
    FROM co_production.media_ingest_sessions AS session
    WHERE session.id = :'session_id'::uuid
  ),
  'session did not persist schema, quota, and publication defaults'
);

INSERT INTO co_production.media_ingest_worker_authorizations (
  worker_id,
  jwt_subject,
  tenant_kind,
  tenant_id,
  stage,
  authorized_by
)
SELECT
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666',
  'team',
  '22222222-2222-4222-8222-222222222222',
  stage,
  'proof:worker-controller'
FROM unnest(ARRAY['verify', 'scan', 'transcode']) AS stage;

SELECT pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"service_role","sub":"66666666-6666-4666-8666-666666666666","media_ingest_worker_id":"55555555-5555-4555-8555-555555555555"}',
  false
);
SET ROLE service_role;
SELECT pg_temp.expect_worker_denied();
RESET ROLE;

UPDATE co_production.media_ingest_worker_authorizations
SET enabled = true;

SET ROLE service_role;

SELECT co_production.claim_media_ingest_work(
  'team',
  '22222222-2222-4222-8222-222222222222',
  'verify',
  1,
  90
);
SELECT (now() + interval '20 milliseconds')::text AS retry_one_at
\gset
SELECT co_production.settle_media_ingest_work(
  p_tenant_kind => 'team',
  p_tenant_id => '22222222-2222-4222-8222-222222222222',
  p_session_id => :'session_id'::uuid,
  p_request_id => '72727272-7272-4272-8272-727272727272',
  p_lease_fence => 1,
  p_stage => 'verify',
  p_outcome => 'retry',
  p_error_code => 'proof.retry.one',
  p_retry_at => :'retry_one_at'::timestamptz
);
SET TIME ZONE 'America/Chicago';
SELECT pg_temp.assert_true(
  (
    co_production.settle_media_ingest_work(
      p_tenant_kind => 'team',
      p_tenant_id => '22222222-2222-4222-8222-222222222222',
      p_session_id => :'session_id'::uuid,
      p_request_id => '72727272-7272-4272-8272-727272727272',
      p_lease_fence => 1,
      p_stage => 'verify',
      p_outcome => 'retry',
      p_error_code => 'proof.retry.one',
      p_retry_at => :'retry_one_at'::timestamptz
    ) ->> 'replayed'
  )::boolean,
  'retry settlement replay changed across session timezones'
);
SET TIME ZONE 'UTC';
SELECT pg_catalog.pg_sleep(0.03);

SELECT co_production.claim_media_ingest_work(
  'team',
  '22222222-2222-4222-8222-222222222222',
  'verify',
  1,
  90
);
SELECT co_production.settle_media_ingest_work(
  p_tenant_kind => 'team',
  p_tenant_id => '22222222-2222-4222-8222-222222222222',
  p_session_id => :'session_id'::uuid,
  p_request_id => '73737373-7373-4373-8373-737373737373',
  p_lease_fence => 2,
  p_stage => 'verify',
  p_outcome => 'retry',
  p_error_code => 'proof.retry.two',
  p_retry_at => now() + interval '20 milliseconds'
);
SELECT pg_catalog.pg_sleep(0.03);

SELECT co_production.claim_media_ingest_work(
  'team',
  '22222222-2222-4222-8222-222222222222',
  'verify',
  1,
  90
);
SELECT co_production.settle_media_ingest_work(
  p_tenant_kind => 'team',
  p_tenant_id => '22222222-2222-4222-8222-222222222222',
  p_session_id => :'session_id'::uuid,
  p_request_id => '79797979-7979-4979-8979-797979797979',
  p_lease_fence => 3,
  p_stage => 'verify',
  p_outcome => 'verified',
  p_observed_size => 42,
  p_observed_sha256 => repeat('a', 64)
);

SELECT pg_temp.assert_true(
  (
    co_production.settle_media_ingest_work(
      p_tenant_kind => 'team',
      p_tenant_id => '22222222-2222-4222-8222-222222222222',
      p_session_id => :'session_id'::uuid,
      p_request_id => '79797979-7979-4979-8979-797979797979',
      p_lease_fence => 3,
      p_stage => 'verify',
      p_outcome => 'verified',
      p_observed_size => 42,
      p_observed_sha256 => repeat('a', 64)
    ) ->> 'replayed'
  )::boolean,
  'exact settlement replay was not idempotent'
);
SELECT pg_temp.expect_changed_settlement_conflict(:'session_id'::uuid);

SELECT co_production.claim_media_ingest_work(
  'team',
  '22222222-2222-4222-8222-222222222222',
  'scan',
  1,
  90
);
SELECT co_production.settle_media_ingest_work(
  p_tenant_kind => 'team',
  p_tenant_id => '22222222-2222-4222-8222-222222222222',
  p_session_id => :'session_id'::uuid,
  p_request_id => '74747474-7474-4474-8474-747474747474',
  p_lease_fence => 4,
  p_stage => 'scan',
  p_outcome => 'clean',
  p_scan_engine => 'proof-scanner/1.0',
  p_scan_receipt_hash => repeat('b', 64),
  p_scan_subject_sha256 => repeat('a', 64)
);

SELECT co_production.claim_media_ingest_work(
  'team',
  '22222222-2222-4222-8222-222222222222',
  'transcode',
  1,
  90
);
SELECT co_production.settle_media_ingest_work(
  p_tenant_kind => 'team',
  p_tenant_id => '22222222-2222-4222-8222-222222222222',
  p_session_id => :'session_id'::uuid,
  p_request_id => '75757575-7575-4575-8575-757575757575',
  p_lease_fence => 5,
  p_stage => 'transcode',
  p_outcome => 'ready',
  p_transcode_receipt_hash => repeat('c', 64)
);
RESET ROLE;

SELECT pg_temp.assert_true(
  (
    SELECT session.state = 'ready'
      AND session.work_attempt_count = 5
      AND session.verify_attempt_count = 3
      AND session.scan_attempt_count = 1
      AND session.transcode_attempt_count = 1
      AND session.max_work_attempts = 3
      AND session.lease_fence = 5
      AND session.publication_state = 'eligible'
      AND session.publication_enabled = false
    FROM co_production.media_ingest_sessions AS session
    WHERE session.id = :'session_id'::uuid
  ),
  'per-stage attempts did not preserve later-stage budget'
);

SELECT pg_temp.assert_true(
  (
    SELECT
      event.detail ->> 'settlement_fingerprint'
        ~ '^sha256:[0-9a-f]{64}$'
      AND event.detail ->> 'observed_size' = '42'
      AND event.detail ->> 'observed_sha256' = repeat('a', 64)
      AND event.detail ->> 'lease_worker_id'
        = '55555555-5555-4555-8555-555555555555'
      AND event.detail ->> 'leased_at' IS NOT NULL
      AND event.detail ->> 'lease_expires_at' IS NOT NULL
      AND event.event_fingerprint ~ '^sha256:[0-9a-f]{64}$'
    FROM co_production.media_ingest_events AS event
    WHERE event.session_id = :'session_id'::uuid
      AND event.request_id =
        '79797979-7979-4979-8979-797979797979'
  ),
  'accepted evidence and lease facts are absent from the event chain'
);

SELECT pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"11111111-1111-4111-8111-111111111111"}',
  false
);
SET ROLE authenticated;
SELECT pg_temp.expect_quota_failure(
  'quota:proof-main-0001',
  'quota-reuse-proof-0001',
  42
);
SELECT pg_temp.expect_quota_failure(
  'quota:proof-expired-01',
  'quota-expired-proof-01',
  42
);
SELECT pg_temp.expect_quota_failure(
  'quota:proof-wrong-tenant',
  'quota-tenant-proof-0001',
  42
);
SELECT pg_temp.expect_quota_failure(
  'quota:proof-wrong-project',
  'quota-project-proof-001',
  42
);
SELECT pg_temp.expect_quota_failure(
  'quota:proof-too-small-01',
  'quota-small-proof-00001',
  42
);
RESET ROLE;

SELECT pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"12121212-1212-4121-8121-121212121212"}',
  false
);
SET ROLE authenticated;
SELECT pg_temp.expect_not_found_progress(:'session_id'::uuid);
RESET ROLE;

SELECT pg_catalog.set_config(
  'request.jwt.claims',
  '{"role":"service_role","sub":"66666666-6666-4666-8666-666666666666","media_ingest_worker_id":"55555555-5555-4555-8555-555555555555"}',
  false
);
SELECT pg_temp.expect_publication_blocked(:'session_id'::uuid);

SET ROLE service_role;
SELECT pg_temp.expect_error(
  'SELECT co_production.claim_media_ingest_publication('
    || quote_literal('team') || ', '
    || quote_literal('22222222-2222-4222-8222-222222222222')
      || '::uuid, '
    || quote_literal(:'session_id') || '::uuid, '
    || quote_literal('91919191-9191-4191-8191-919191919191')
      || '::uuid, '
    || quote_literal(repeat('c', 64)) || ')',
  'permission denied'
);
RESET ROLE;

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
  'team',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  :'session_id'::uuid,
  repeat('c', 64),
  '92929292-9292-4292-8292-929292929292',
  'sha256:' || repeat('d', 64),
  'proof:publication-controller',
  now()
);

SELECT pg_temp.assert_true(
  (
    SELECT outbox.dispatch_enabled = false
    FROM co_production.media_ingest_publication_outbox AS outbox
    WHERE outbox.session_id = :'session_id'::uuid
  ),
  'publication outbox dispatch was not disabled by default'
);

SELECT pg_temp.expect_error(
  'INSERT INTO co_production.media_ingest_publication_outbox ('
    || 'tenant_kind, tenant_id, project_id, session_id, output_digest, '
    || 'request_id, claim_fingerprint, claimed_by, claimed_at) VALUES ('
    || quote_literal('team') || ', '
    || quote_literal('22222222-2222-4222-8222-222222222222')
      || '::uuid, '
    || quote_literal('33333333-3333-4333-8333-333333333333')
      || '::uuid, '
    || quote_literal(:'session_id') || '::uuid, '
    || quote_literal(repeat('c', 64)) || ', '
    || quote_literal('93939393-9393-4393-8393-939393939393')
      || '::uuid, '
    || quote_literal('sha256:' || repeat('e', 64)) || ', '
    || quote_literal('proof:publication-controller') || ', now())',
  'duplicate key value'
);

SELECT pg_temp.expect_error(
  'DELETE FROM co_production.folders WHERE id = '
    || quote_literal('44444444-4444-4444-8444-444444444444')
      || '::uuid',
  'violates foreign key constraint'
);
SELECT pg_temp.expect_error(
  'DELETE FROM co_production.projects WHERE id = '
    || quote_literal('33333333-3333-4333-8333-333333333333')
      || '::uuid',
  'violates foreign key constraint'
);

SELECT pg_temp.assert_true(
  NOT pg_catalog.has_table_privilege(
    'authenticated',
    'co_production.media_ingest_quota_reservations',
    'INSERT'
  )
    AND NOT pg_catalog.has_table_privilege(
      'service_role',
      'co_production.media_ingest_worker_authorizations',
      'INSERT'
    )
    AND NOT pg_catalog.has_function_privilege(
      'authenticated',
      'co_production.claim_media_ingest_work(text,uuid,text,integer,integer)',
      'EXECUTE'
    )
    AND NOT pg_catalog.has_function_privilege(
      'service_role',
      'co_production.claim_media_ingest_publication(text,uuid,uuid,uuid,text)',
      'EXECUTE'
    ),
  'default-deny privilege boundary is incomplete'
);
\o
