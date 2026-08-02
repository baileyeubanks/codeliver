-- Durable Co-Credit paid-compute settlement authority.
--
-- This authority reserves and settles Co-Units only. It stores no plaintext
-- payment instrument data, mutates no payment or invoice relation, performs no
-- network request, and emits no certification proof artifact.

BEGIN;

DO $preflight$
DECLARE
  server_version_num integer := current_setting('server_version_num')::integer;
  worker_attestor_is_privileged boolean;
  expected_owner_oid oid;
BEGIN
  IF server_version_num < 150000 THEN
    RAISE EXCEPTION 'PostgreSQL 15 or newer is required';
  END IF;

  IF pg_catalog.to_regnamespace('co_production') IS NULL
    OR pg_catalog.to_regnamespace('co_production_private') IS NULL
    OR pg_catalog.to_regclass('co_production.teams') IS NULL
    OR pg_catalog.to_regclass('co_production.projects') IS NULL
    OR pg_catalog.to_regprocedure(
      'co_production_private.has_team_role(uuid,integer)'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'co_production_private.has_project_role(uuid,integer)'
    ) IS NULL
    OR pg_catalog.to_regprocedure('extensions.digest(bytea,text)') IS NULL
    OR pg_catalog.to_regprocedure('extensions.hmac(bytea,bytea,text)') IS NULL
  THEN
    RAISE EXCEPTION
      'Co-Production projects, teams, role helpers, and pgcrypto must be installed first';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles AS role
    WHERE role.rolname = current_user
      AND (role.rolsuper OR role.rolbypassrls)
  ) THEN
    RAISE EXCEPTION
      'Co-Credit SECURITY DEFINER owner must be superuser or BYPASSRLS for FORCE RLS writes';
  END IF;

  SELECT role.oid
  INTO STRICT expected_owner_oid
  FROM pg_catalog.pg_roles AS role
  WHERE role.rolname = current_user;

  IF pg_catalog.to_regrole('co_credit_worker_attestor') IS NULL THEN
    RAISE EXCEPTION
      'Dedicated co_credit_worker_attestor role must be provisioned first';
  END IF;

  SELECT
    role.rolsuper
    OR role.rolbypassrls
    OR role.rolcreaterole
    OR role.rolcreatedb
    OR role.rolreplication
  INTO worker_attestor_is_privileged
  FROM pg_catalog.pg_roles AS role
  WHERE role.rolname = 'co_credit_worker_attestor';

  IF worker_attestor_is_privileged
    OR pg_catalog.pg_has_role(
      'service_role',
      'co_credit_worker_attestor',
      'MEMBER'
    )
    OR pg_catalog.pg_has_role(
      'authenticated',
      'co_credit_worker_attestor',
      'MEMBER'
    )
    OR pg_catalog.pg_has_role(
      'anon',
      'co_credit_worker_attestor',
      'MEMBER'
    )
    OR pg_catalog.pg_has_role(
      'co_credit_worker_attestor',
      'service_role',
      'MEMBER'
    )
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_roles AS privileged_role
      WHERE (
        privileged_role.rolsuper
        OR privileged_role.rolbypassrls
        OR privileged_role.rolcreaterole
        OR privileged_role.rolcreatedb
        OR privileged_role.rolreplication
        OR privileged_role.oid = expected_owner_oid
      )
        AND pg_catalog.pg_has_role(
          'co_credit_worker_attestor',
          privileged_role.oid,
          'MEMBER'
        )
    )
    OR EXISTS (
      SELECT 1
      FROM (
        SELECT relation.relowner AS owner_oid
        FROM pg_catalog.pg_class AS relation
        WHERE relation.relnamespace IN (
          'co_production'::pg_catalog.regnamespace,
          'co_production_private'::pg_catalog.regnamespace
        )
          AND relation.relname LIKE 'co_credit_%'
        UNION
        SELECT routine.proowner
        FROM pg_catalog.pg_proc AS routine
        WHERE routine.pronamespace IN (
          'co_production'::pg_catalog.regnamespace,
          'co_production_private'::pg_catalog.regnamespace
        )
          AND routine.proname LIKE '%co_credit%'
      ) AS object_owner
      WHERE pg_catalog.pg_has_role(
        'co_credit_worker_attestor',
        object_owner.owner_oid,
        'MEMBER'
      )
    )
  THEN
    RAISE EXCEPTION
      'co_credit_worker_attestor must be unprivileged and isolated from API roles';
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION co_production_private.co_credit_sha256(
  p_value jsonb
)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT 'sha256:' || pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(p_value::text, 'UTF8'), 'sha256'),
    'hex'
  )
$$;

CREATE OR REPLACE FUNCTION co_production_private.co_credit_epoch_microseconds(
  p_value timestamptz
)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT (pg_catalog.extract(epoch FROM p_value) * 1000000)::bigint
$$;

CREATE OR REPLACE FUNCTION co_production_private.co_credit_hash_is_valid(
  p_value text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT p_value ~ '^sha256:[0-9a-f]{64}$'
$$;

CREATE OR REPLACE FUNCTION co_production_private.co_credit_hmac_is_valid(
  p_value text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT p_value ~ '^hmac-sha256:[0-9a-f]{64}$'
$$;

CREATE OR REPLACE FUNCTION
  co_production_private.co_credit_constant_time_bytea_equal(
    p_left bytea,
    p_right bytea
  )
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
  v_difference integer;
  v_index integer;
BEGIN
  IF pg_catalog.octet_length(p_left) <> 32
    OR pg_catalog.octet_length(p_right) <> 32
  THEN
    RETURN false;
  END IF;

  v_difference := 0;
  FOR v_index IN 0..31 LOOP
    v_difference := v_difference | (
      pg_catalog.get_byte(p_left, v_index)
      # pg_catalog.get_byte(p_right, v_index)
    );
  END LOOP;
  RETURN v_difference = 0;
END
$$;

CREATE OR REPLACE FUNCTION co_production_private.co_credit_identifier_is_valid(
  p_value text,
  p_maximum_length integer DEFAULT 240
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT
    p_maximum_length BETWEEN 1 AND 240
    AND pg_catalog.length(p_value) BETWEEN 1 AND p_maximum_length
    AND p_value = pg_catalog.btrim(p_value)
    AND p_value ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]*$'
$$;

CREATE OR REPLACE FUNCTION co_production_private.co_credit_actor_principal()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_jwt_role text := pg_catalog.nullif((SELECT auth.role()), '');
  v_principal text;
BEGIN
  v_principal := CASE
    WHEN v_user_id IS NOT NULL AND v_jwt_role IS NOT NULL THEN
      'auth_user:' || v_user_id::text || ':jwt_role:' || v_jwt_role
    WHEN v_user_id IS NOT NULL THEN 'auth_user:' || v_user_id::text
    WHEN v_jwt_role IS NOT NULL THEN 'jwt_role:' || v_jwt_role
    ELSE 'db_session:' || session_user::text
  END;

  IF NOT co_production_private.co_credit_identifier_is_valid(
    v_principal,
    240
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'co_credit_actor_principal_invalid';
  END IF;

  RETURN v_principal;
END
$$;

CREATE OR REPLACE FUNCTION
  co_production_private.lock_co_credit_commercial_authority()
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pg_catalog.pg_advisory_xact_lock(20260716033003::bigint)
$$;

CREATE OR REPLACE FUNCTION
  co_production_private.co_credit_decimal_digit_to_ascii(
    p_character text
  )
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
  v_codepoint integer;
  v_zero_codepoint integer;
BEGIN
  IF pg_catalog.char_length(p_character) <> 1 THEN
    RETURN NULL;
  END IF;

  v_codepoint := pg_catalog.ascii(p_character);
  IF v_codepoint BETWEEN 48 AND 57 THEN
    RETURN p_character;
  END IF;

  FOREACH v_zero_codepoint IN ARRAY ARRAY[
    1632, 1776, 1984, 2406, 2534, 2662, 2790, 2918, 3046, 3174,
    3302, 3430, 3558, 3664, 3792, 3872, 4160, 4240, 6112, 6160,
    6470, 6608, 6784, 6800, 6992, 7088, 7232, 7248, 42528, 43216,
    43264, 43472, 43504, 43600, 44016, 65296
  ] LOOP
    IF v_codepoint BETWEEN v_zero_codepoint AND v_zero_codepoint + 9 THEN
      RETURN pg_catalog.chr(48 + v_codepoint - v_zero_codepoint);
    END IF;
  END LOOP;

  RETURN NULL;
END
$$;

CREATE OR REPLACE FUNCTION
  co_production_private.co_credit_pan_separator_is_allowed(
    p_character text
  )
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT pg_catalog.char_length(p_character) = 1
    AND p_character !~ '^[[:alnum:]]$'
$$;

CREATE OR REPLACE FUNCTION
  co_production_private.co_credit_pan_is_valid(p_digits text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
  v_length integer := pg_catalog.char_length(p_digits);
  v_index integer;
  v_digit integer;
  v_sum integer := 0;
  v_first_digit text;
  v_has_variation boolean := false;
BEGIN
  IF p_digits !~ '^[0-9]{13,19}$' THEN
    RETURN false;
  END IF;

  v_first_digit := pg_catalog.substring(p_digits FROM 1 FOR 1);
  IF v_first_digit = '0' THEN
    RETURN false;
  END IF;

  FOR v_index IN REVERSE v_length..1 LOOP
    v_digit := pg_catalog.ascii(
      pg_catalog.substring(p_digits FROM v_index FOR 1)
    ) - 48;
    v_has_variation := v_has_variation OR
      pg_catalog.substring(p_digits FROM v_index FOR 1) <> v_first_digit;

    IF (v_length - v_index) % 2 = 1 THEN
      v_digit := v_digit * 2;
      IF v_digit > 9 THEN
        v_digit := v_digit - 9;
      END IF;
    END IF;
    v_sum := v_sum + v_digit;
  END LOOP;

  RETURN v_has_variation AND v_sum % 10 = 0;
END
$$;

CREATE OR REPLACE FUNCTION
  co_production_private.co_credit_text_contains_pan(p_text text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
  v_character text;
  v_digit text;
  v_digits text := '';
  v_candidate_length integer;
  v_index integer;
BEGIN
  FOR v_index IN 1..pg_catalog.char_length(p_text) LOOP
    v_character := pg_catalog.substring(p_text FROM v_index FOR 1);
    v_digit := co_production_private.co_credit_decimal_digit_to_ascii(
      v_character
    );

    IF v_digit IS NOT NULL THEN
      v_digits := pg_catalog.right(v_digits || v_digit, 19);
      IF pg_catalog.char_length(v_digits) >= 13 THEN
        FOR v_candidate_length IN 13..
          pg_catalog.char_length(v_digits)
        LOOP
          IF co_production_private.co_credit_pan_is_valid(
            pg_catalog.right(v_digits, v_candidate_length)
          ) THEN
            RETURN true;
          END IF;
        END LOOP;
      END IF;
    ELSIF co_production_private.co_credit_pan_separator_is_allowed(
      v_character
    ) THEN
      NULL;
    ELSE
      v_digits := '';
    END IF;
  END LOOP;

  RETURN false;
END
$$;

CREATE OR REPLACE FUNCTION
  co_production_private.co_credit_decimal_fragment(p_text text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
  v_character text;
  v_digit text;
  v_fragment text := '';
  v_index integer;
BEGIN
  FOR v_index IN 1..pg_catalog.char_length(p_text) LOOP
    v_character := pg_catalog.substring(p_text FROM v_index FOR 1);
    v_digit := co_production_private.co_credit_decimal_digit_to_ascii(
      v_character
    );
    IF v_digit IS NOT NULL THEN
      v_fragment := v_fragment || v_digit;
    ELSIF co_production_private.co_credit_pan_separator_is_allowed(
      v_character
    ) THEN
      NULL;
    ELSE
      RETURN '';
    END IF;
  END LOOP;
  RETURN v_fragment;
END
$$;

CREATE OR REPLACE FUNCTION
  co_production_private.co_credit_json_digit_fragments(p_value jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
  v_child jsonb;
  v_fragment text;
  v_key text;
  v_result text := '';
BEGIN
  CASE pg_catalog.jsonb_typeof(p_value)
    WHEN 'object' THEN
      FOR v_key, v_child IN
        SELECT entry.key, entry.value
        FROM pg_catalog.jsonb_each(p_value) AS entry(key, value)
      LOOP
        v_fragment := co_production_private.co_credit_decimal_fragment(v_key);
        IF v_fragment <> '' THEN
          v_result := v_result || '-' || v_fragment;
        END IF;
        v_fragment :=
          co_production_private.co_credit_json_digit_fragments(v_child);
        IF v_fragment <> '' THEN
          v_result := v_result || '-' || v_fragment;
        END IF;
      END LOOP;
    WHEN 'array' THEN
      FOR v_child IN
        SELECT item.value
        FROM pg_catalog.jsonb_array_elements(p_value) AS item(value)
      LOOP
        v_fragment :=
          co_production_private.co_credit_json_digit_fragments(v_child);
        IF v_fragment <> '' THEN
          v_result := v_result || '-' || v_fragment;
        END IF;
      END LOOP;
    WHEN 'string', 'number' THEN
      RETURN co_production_private.co_credit_decimal_fragment(
        p_value #>> '{}'
      );
    ELSE
      NULL;
  END CASE;
  RETURN v_result;
END
$$;

DO $co_credit_pan_guard_vectors$
DECLARE
  v_rejected text;
  v_allowed text;
BEGIN
  FOREACH v_rejected IN ARRAY ARRAY[
    '4242 4242 4242 4242',
    '4242-4242-4242-4242',
    '4242.4242.4242.4242',
    '4242/4242/4242/4242',
    '4242_4242_4242_4242',
    U&'4242\00A04242\00A04242\00A04242',
    U&'4242\20144242\20144242\20144242',
    U&'4242\200B4242\200B4242\200B4242',
    U&'\FF14\FF12\FF14\FF12\FF14\FF12\FF14\FF12\FF14\FF12\FF14\FF12\FF14\FF12\FF14\FF12',
    U&'\0664\0662\0664\0662\0664\0662\0664\0662\0664\0662\0664\0662\0664\0662\0664\0662',
    'evidence: 4242..4242///4242___4242',
    '0-4242-4242-4242-4242',
    '4242-4242-4242-4242-0000'
  ] LOOP
    IF co_production_private.co_credit_text_contains_pan(v_rejected)
      IS NOT TRUE
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'co_credit_pan_guard_rejection_vector_failed';
    END IF;
  END LOOP;

  FOREACH v_allowed IN ARRAY ARRAY[
    'release 2026/07/15 revision 42',
    'model-v2_20260715',
    '4242 4242 4242 4241',
    'job_1234_5678_9012'
  ] LOOP
    IF co_production_private.co_credit_text_contains_pan(v_allowed)
      IS NOT FALSE
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'co_credit_pan_guard_allow_vector_failed';
    END IF;
  END LOOP;

END
$co_credit_pan_guard_vectors$;

CREATE OR REPLACE FUNCTION co_production_private.co_credit_commercial_json_is_safe(
  p_value jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
  v_key text;
  v_normalized_key text;
  v_child jsonb;
  v_text text;
BEGIN
  IF co_production_private.co_credit_text_contains_pan(
    co_production_private.co_credit_json_digit_fragments(p_value)
  ) THEN
    RETURN false;
  END IF;

  CASE pg_catalog.jsonb_typeof(p_value)
    WHEN 'object' THEN
      FOR v_key, v_child IN
        SELECT entry.key, entry.value
        FROM pg_catalog.jsonb_each(p_value) AS entry(key, value)
      LOOP
        v_normalized_key := pg_catalog.regexp_replace(
          pg_catalog.lower(v_key),
          '[^a-z0-9]',
          '',
          'g'
        );
        IF co_production_private.co_credit_text_contains_pan(v_key)
          OR v_normalized_key IN (
          'card',
          'cardnumber',
          'cardpan',
          'pannumber',
          'cardholder',
          'cardholdername',
          'creditcard',
          'debitcard',
          'cardtoken',
          'bankaccount',
          'accountnumber',
          'primaryaccountnumber',
          'bankroutingnumber',
          'routingnumber',
          'iban',
          'swift',
          'bic',
          'ach',
          'paymentmethod',
          'paymenttoken',
          'paymentmethodsecret',
          'paymentsecret',
          'clientsecret',
          'secretkey',
          'privatekey',
          'accesskey',
          'cardexpiry',
          'cardexpiration',
          'expirationdate',
          'expirydate',
          'expmonth',
          'expyear',
          'securitycode',
          'verificationcode',
          'cardverificationcode',
          'cardverificationvalue',
          'cvc',
          'cvv',
          'pan'
        )
          OR co_production_private.co_credit_commercial_json_is_safe(v_child)
            IS NOT TRUE
        THEN
          RETURN false;
        END IF;
      END LOOP;
    WHEN 'array' THEN
      FOR v_child IN
        SELECT item.value
        FROM pg_catalog.jsonb_array_elements(p_value) AS item(value)
      LOOP
        IF co_production_private.co_credit_commercial_json_is_safe(v_child)
          IS NOT TRUE
        THEN
          RETURN false;
        END IF;
      END LOOP;
    WHEN 'string' THEN
      v_text := p_value #>> '{}';
      IF v_text ~*
          '(^|[^A-Za-z0-9])(?:sk|rk|pk)_live_[A-Za-z0-9]+([^A-Za-z0-9]|$)'
        OR co_production_private.co_credit_text_contains_pan(v_text)
      THEN
        RETURN false;
      END IF;
    WHEN 'number' THEN
      IF co_production_private.co_credit_text_contains_pan(p_value #>> '{}') THEN
        RETURN false;
      END IF;
    ELSE
      NULL;
  END CASE;

  RETURN true;
END
$$;

DO $co_credit_pan_json_vectors$
BEGIN
  IF co_production_private.co_credit_commercial_json_is_safe(
    pg_catalog.to_jsonb(4242424242424242::numeric)
  ) IS NOT FALSE OR
    co_production_private.co_credit_commercial_json_is_safe(
      pg_catalog.jsonb_build_object(
        'nativeUsage',
        pg_catalog.jsonb_build_object(
          'transcoded_media_milliseconds',
          4242424242424242::numeric
        )
      )
    ) IS NOT FALSE OR
    co_production_private.co_credit_commercial_json_is_safe(
      pg_catalog.jsonb_build_object(
        'parts',
        pg_catalog.jsonb_build_array('4242', '4242', '4242', '4242')
      )
    ) IS NOT FALSE OR
    co_production_private.co_credit_commercial_json_is_safe(
      pg_catalog.jsonb_build_object(
        'nativeUsage',
        pg_catalog.jsonb_build_object('4242-4242-4242-4242', true)
      )
    ) IS NOT FALSE OR
    co_production_private.co_credit_commercial_json_is_safe(
      pg_catalog.jsonb_build_object('durationMilliseconds', 60000)
    ) IS NOT TRUE OR
    co_production_private.co_credit_commercial_json_is_safe(
      pg_catalog.jsonb_build_object('shot_4242', true)
    ) IS NOT TRUE OR
    co_production_private.co_credit_commercial_json_is_safe(
      pg_catalog.jsonb_build_object(
        'dimensions',
        pg_catalog.jsonb_build_array(1920, 1080, 30)
      )
    ) IS NOT TRUE
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'co_credit_pan_guard_numeric_vector_failed';
  END IF;
END
$co_credit_pan_json_vectors$;

CREATE OR REPLACE FUNCTION co_production_private.require_co_credit_service_role()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF pg_catalog.coalesce((SELECT auth.role()), '') <> 'service_role' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'co_credit_service_role_required';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION
  co_production_private.require_co_credit_worker_attestor_role()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF pg_catalog.coalesce((SELECT auth.role()), '') <>
      'co_credit_worker_attestor'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'co_credit_worker_attestor_role_required';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION co_production_private.reject_co_credit_mutation()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'co_credit_history_is_immutable';
END
$$;

CREATE OR REPLACE FUNCTION co_production_private.reject_co_credit_truncate()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'co_credit_history_is_append_only';
END
$$;

-- The authority owner identity and worker HMAC keys are deliberately outside
-- the API schema. No API or worker role receives table access to either rowset.
CREATE TABLE co_production_private.co_credit_authority_metadata (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  expected_owner_oid oid NOT NULL,
  expected_owner_name name NOT NULL,
  migration_version text NOT NULL CHECK (
    migration_version = '20260716033000'
  ),
  actor_principal text NOT NULL CHECK (
    co_production_private.co_credit_identifier_is_valid(actor_principal, 240)
  ),
  created_at timestamptz NOT NULL,
  integrity_sha256 text NOT NULL UNIQUE CHECK (
    co_production_private.co_credit_hash_is_valid(integrity_sha256)
  ),
  CHECK (
    integrity_sha256 = co_production_private.co_credit_sha256(
      pg_catalog.jsonb_build_object(
        'schemaVersion', 'co-credit-authority-metadata.v1',
        'expectedOwnerOid', expected_owner_oid,
        'expectedOwnerName', expected_owner_name,
        'migrationVersion', migration_version,
        'actorPrincipal', actor_principal,
        'createdAtEpochMicros',
          co_production_private.co_credit_epoch_microseconds(created_at)
      )
    )
  )
);

INSERT INTO co_production_private.co_credit_authority_metadata (
  expected_owner_oid,
  expected_owner_name,
  migration_version,
  actor_principal,
  created_at,
  integrity_sha256
)
SELECT
  role.oid,
  role.rolname,
  '20260716033000',
  'authority_owner:' || role.rolname,
  captured.captured_at,
  co_production_private.co_credit_sha256(
    pg_catalog.jsonb_build_object(
      'schemaVersion', 'co-credit-authority-metadata.v1',
      'expectedOwnerOid', role.oid,
      'expectedOwnerName', role.rolname,
      'migrationVersion', '20260716033000',
      'actorPrincipal', 'authority_owner:' || role.rolname,
      'createdAtEpochMicros',
        co_production_private.co_credit_epoch_microseconds(
          captured.captured_at
        )
    )
  )
FROM pg_catalog.pg_roles AS role
CROSS JOIN LATERAL (
  SELECT pg_catalog.clock_timestamp() AS captured_at
) AS captured
WHERE role.rolname = current_user;

CREATE TABLE co_production_private.co_credit_worker_signing_keys (
  worker_key_id uuid PRIMARY KEY,
  worker_principal text NOT NULL CHECK (
    co_production_private.co_credit_identifier_is_valid(
      worker_principal,
      200
    )
  ),
  hmac_secret bytea NOT NULL CHECK (
    pg_catalog.octet_length(hmac_secret) BETWEEN 32 AND 128
  ),
  key_fingerprint_sha256 text NOT NULL UNIQUE CHECK (
    key_fingerprint_sha256 = 'sha256:' || pg_catalog.encode(
      extensions.digest(hmac_secret, 'sha256'),
      'hex'
    )
  ),
  not_before timestamptz NOT NULL,
  not_after timestamptz NOT NULL,
  provisioned_by text NOT NULL CHECK (
    co_production_private.co_credit_identifier_is_valid(provisioned_by, 240)
  ),
  provisioned_at timestamptz NOT NULL,
  integrity_sha256 text NOT NULL UNIQUE CHECK (
    co_production_private.co_credit_hash_is_valid(integrity_sha256)
  ),
  CHECK (not_after > not_before),
  CHECK (
    integrity_sha256 = co_production_private.co_credit_sha256(
      pg_catalog.jsonb_build_object(
        'schemaVersion', 'co-credit-worker-signing-key.v1',
        'workerKeyId', worker_key_id,
        'workerPrincipal', worker_principal,
        'keyFingerprintSha256', key_fingerprint_sha256,
        'notBeforeEpochMicros',
          co_production_private.co_credit_epoch_microseconds(not_before),
        'notAfterEpochMicros',
          co_production_private.co_credit_epoch_microseconds(not_after),
        'provisionedBy', provisioned_by,
        'provisionedAtEpochMicros',
          co_production_private.co_credit_epoch_microseconds(provisioned_at)
      )
    )
  ),
  UNIQUE (worker_key_id, worker_principal, key_fingerprint_sha256)
);

CREATE OR REPLACE FUNCTION
  co_production_private.assert_co_credit_operation_authority(
    p_routine_name text
  )
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_expected_owner oid;
  v_expected_owner_name name;
  v_routine pg_catalog.regprocedure;
  v_table pg_catalog.regclass;
  v_object_name text;
  v_role_name text;
  v_owner oid;
  v_security_definer boolean;
  v_routine_acl_is_explicit boolean;
  v_allowed_execute_role_name name;
  v_allowed_execute_grantee oid;
  v_expected_non_owner_acl_count bigint;
  v_non_owner_acl_count bigint;
  v_invalid_non_owner_acl_count bigint;
  v_rls_enabled boolean;
  v_rls_forced boolean;
BEGIN
  SELECT metadata.expected_owner_oid, metadata.expected_owner_name
  INTO STRICT v_expected_owner, v_expected_owner_name
  FROM co_production_private.co_credit_authority_metadata AS metadata
  WHERE metadata.singleton;

  IF current_user::text IS DISTINCT FROM v_expected_owner_name::text
    OR current_setting('transaction_isolation') <> 'read committed'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'co_credit_operation_authority_context_invalid';
  END IF;

  v_routine := pg_catalog.to_regprocedure(p_routine_name);
  IF v_routine IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'co_credit_operation_authority_routine_missing';
  END IF;

  SELECT
    routine.proowner,
    routine.prosecdef,
    routine.proacl IS NOT NULL
  INTO STRICT
    v_owner,
    v_security_definer,
    v_routine_acl_is_explicit
  FROM pg_catalog.pg_proc AS routine
  WHERE routine.oid = v_routine;

  IF v_owner IS DISTINCT FROM v_expected_owner OR NOT v_security_definer THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'co_credit_operation_authority_owner_drift';
  END IF;

  IF p_routine_name IN (
    'co_production.approve_co_credit_rate_catalog(text,timestamptz,jsonb,text,text)',
    'co_production.approve_co_credit_pricing_terms(text,timestamptz,uuid,text,bigint,jsonb,text,text)',
    'co_production_private.provision_co_credit_worker_signing_key(uuid,text,bytea,timestamptz,timestamptz)',
    'co_production_private.append_co_credit_ledger_event(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,bigint,bigint,uuid,text,text,uuid,text,text,text,jsonb)',
    'co_production_private.save_co_credit_idempotency(uuid,uuid,uuid,text,text,text,text,text,uuid)'
  ) THEN
    v_allowed_execute_role_name := NULL;
  ELSIF p_routine_name IN (
    'co_production.approve_and_activate_co_credit_commercial_bundle(text,timestamptz,jsonb,text,text,timestamptz,text,bigint,jsonb,text,timestamptz)',
    'co_production.grant_co_credit_budget(uuid,uuid,text,uuid,text,timestamptz,timestamptz,bigint,bigint,bigint,text[],text,text)',
    'co_production.record_co_credit_entitlement_state(uuid,text,text[],text,boolean)',
    'co_production.reserve_co_credit(uuid,uuid,uuid,text,jsonb,text,timestamptz,uuid,uuid)',
    'co_production.issue_co_credit_worker_execution_lease(uuid,uuid,uuid,uuid,uuid,uuid,text,text,integer,timestamptz)',
    'co_production.settle_co_credit(uuid,uuid,uuid,uuid,uuid,text,text)',
    'co_production.release_co_credit(uuid,uuid,uuid,uuid,text,text)',
    'co_production.reap_expired_co_credit_reservations(uuid,integer)',
    'co_production.reverse_or_dispute_co_credit_settlement(uuid,uuid,uuid,uuid,text,text,text)'
  ) THEN
    v_allowed_execute_role_name := 'service_role';
  ELSIF p_routine_name =
      'co_production.record_co_credit_worker_execution_attestation(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,text,timestamptz,text,jsonb)'
  THEN
    v_allowed_execute_role_name := 'co_credit_worker_attestor';
  ELSE
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'co_credit_operation_authority_routine_class_invalid';
  END IF;

  IF v_allowed_execute_role_name IS NULL THEN
    v_allowed_execute_grantee := NULL;
    v_expected_non_owner_acl_count := 0;
  ELSE
    SELECT role.oid
    INTO v_allowed_execute_grantee
    FROM pg_catalog.pg_roles AS role
    WHERE role.rolname = v_allowed_execute_role_name;

    IF v_allowed_execute_grantee IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'co_credit_operation_authority_function_acl_drift';
    END IF;
    v_expected_non_owner_acl_count := 1;
  END IF;

  -- The pinned owner keeps implicit EXECUTE even without an owner ACL item.
  -- Every explicit non-owner item must be the class's one direct, non-grantable
  -- EXECUTE privilege, granted by that owner.
  SELECT
    pg_catalog.count(*) FILTER (
      WHERE acl.grantee <> v_expected_owner
    ),
    pg_catalog.count(*) FILTER (
      WHERE acl.grantee <> v_expected_owner
        AND (
          acl.grantee = 0::oid
          OR v_allowed_execute_grantee IS NULL
          OR acl.grantee IS DISTINCT FROM v_allowed_execute_grantee
          OR acl.grantor IS DISTINCT FROM v_expected_owner
          OR acl.privilege_type IS DISTINCT FROM 'EXECUTE'
          OR acl.is_grantable
        )
    )
  INTO STRICT v_non_owner_acl_count, v_invalid_non_owner_acl_count
  FROM pg_catalog.pg_proc AS routine
  CROSS JOIN LATERAL pg_catalog.aclexplode(routine.proacl) AS acl
  WHERE routine.oid = v_routine;

  IF NOT v_routine_acl_is_explicit
    OR v_non_owner_acl_count <> v_expected_non_owner_acl_count
    OR v_invalid_non_owner_acl_count <> 0
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'co_credit_operation_authority_function_acl_drift';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles AS role
    WHERE (
      role.rolsuper
      OR role.rolbypassrls
      OR role.rolcreaterole
      OR role.rolcreatedb
      OR role.rolreplication
    )
      AND pg_catalog.pg_has_role(
        'co_credit_worker_attestor',
        role.oid,
        'MEMBER'
      )
  ) OR pg_catalog.pg_has_role(
    'co_credit_worker_attestor',
    v_expected_owner,
    'MEMBER'
  ) OR EXISTS (
    SELECT 1
    FROM (
      SELECT relation.relowner AS owner_oid
      FROM pg_catalog.pg_class AS relation
      WHERE relation.relnamespace IN (
        'co_production'::pg_catalog.regnamespace,
        'co_production_private'::pg_catalog.regnamespace
      )
        AND relation.relname LIKE 'co_credit_%'
      UNION
      SELECT routine.proowner
      FROM pg_catalog.pg_proc AS routine
      WHERE routine.pronamespace IN (
        'co_production'::pg_catalog.regnamespace,
        'co_production_private'::pg_catalog.regnamespace
      )
        AND routine.proname LIKE '%co_credit%'
    ) AS object_owner
    WHERE pg_catalog.pg_has_role(
      'co_credit_worker_attestor',
      object_owner.owner_oid,
      'MEMBER'
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'co_credit_worker_attestor_privilege_drift';
  END IF;

  FOREACH v_object_name IN ARRAY ARRAY[
    'co_production.co_credit_rate_catalog_snapshots',
    'co_production.co_credit_pricing_terms_snapshots',
    'co_production.co_credit_commercial_bundle_activations',
    'co_production.co_credit_budget_grants',
    'co_production.co_credit_entitlement_states',
    'co_production.co_credit_operation_executions',
    'co_production.co_credit_quotes',
    'co_production.co_credit_reservations',
    'co_production.co_credit_worker_execution_leases',
    'co_production.co_credit_worker_execution_bindings',
    'co_production.co_credit_worker_execution_attestations',
    'co_production.co_credit_terminal_receipts',
    'co_production.co_credit_idempotency_rows',
    'co_production.co_credit_ledger_events',
    'co_production_private.co_credit_authority_metadata',
    'co_production_private.co_credit_worker_signing_keys'
  ] LOOP
    v_table := pg_catalog.to_regclass(v_object_name);
    IF v_table IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'co_credit_operation_authority_table_missing';
    END IF;

    SELECT
      relation.relowner,
      relation.relrowsecurity,
      relation.relforcerowsecurity
    INTO STRICT v_owner, v_rls_enabled, v_rls_forced
    FROM pg_catalog.pg_class AS relation
    WHERE relation.oid = v_table;

    IF v_owner IS DISTINCT FROM v_expected_owner
      OR NOT v_rls_enabled
      OR NOT v_rls_forced
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'co_credit_operation_authority_rls_drift';
    END IF;

    FOREACH v_role_name IN ARRAY ARRAY[
      'anon',
      'authenticated',
      'service_role',
      'co_credit_worker_attestor'
    ] LOOP
      IF pg_catalog.has_table_privilege(v_role_name, v_table, 'INSERT')
        OR pg_catalog.has_table_privilege(v_role_name, v_table, 'UPDATE')
        OR pg_catalog.has_table_privilege(v_role_name, v_table, 'DELETE')
        OR pg_catalog.has_table_privilege(v_role_name, v_table, 'TRUNCATE')
      THEN
        RAISE EXCEPTION USING
          ERRCODE = '42501',
          MESSAGE = 'co_credit_operation_authority_acl_drift';
      END IF;
    END LOOP;
  END LOOP;

  IF pg_catalog.has_table_privilege(
      'service_role',
      'co_production_private.co_credit_worker_signing_keys',
      'SELECT'
    )
    OR pg_catalog.has_table_privilege(
      'co_credit_worker_attestor',
      'co_production_private.co_credit_worker_signing_keys',
      'SELECT'
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'co_credit_worker_signing_key_acl_drift';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION
  co_production_private.provision_co_credit_worker_signing_key(
    p_worker_key_id uuid,
    p_worker_principal text,
    p_hmac_secret bytea,
    p_not_before timestamptz,
    p_not_after timestamptz
  )
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_metadata co_production_private.co_credit_authority_metadata%ROWTYPE;
  v_now timestamptz;
  v_fingerprint text;
  v_integrity text;
BEGIN
  SELECT metadata.*
  INTO STRICT v_metadata
  FROM co_production_private.co_credit_authority_metadata AS metadata
  WHERE metadata.singleton;

  IF session_user::text IS DISTINCT FROM v_metadata.expected_owner_name::text
    OR current_user::text IS DISTINCT FROM v_metadata.expected_owner_name::text
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'co_credit_authority_owner_required';
  END IF;

  PERFORM co_production_private.assert_co_credit_operation_authority(
    'co_production_private.provision_co_credit_worker_signing_key(uuid,text,bytea,timestamptz,timestamptz)'
  );
  v_now := pg_catalog.clock_timestamp();

  IF p_worker_key_id IS NULL
    OR co_production_private.co_credit_identifier_is_valid(
      p_worker_principal,
      200
    ) IS NOT TRUE
    OR p_hmac_secret IS NULL
    OR pg_catalog.octet_length(p_hmac_secret) NOT BETWEEN 32 AND 128
    OR p_not_before IS NULL
    OR p_not_after IS NULL
    OR p_not_after <= p_not_before
    OR p_not_after <= v_now
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'co_credit_worker_signing_key_invalid';
  END IF;

  v_fingerprint := 'sha256:' || pg_catalog.encode(
    extensions.digest(p_hmac_secret, 'sha256'),
    'hex'
  );
  v_integrity := co_production_private.co_credit_sha256(
    pg_catalog.jsonb_build_object(
      'schemaVersion', 'co-credit-worker-signing-key.v1',
      'workerKeyId', p_worker_key_id,
      'workerPrincipal', p_worker_principal,
      'keyFingerprintSha256', v_fingerprint,
      'notBeforeEpochMicros',
        co_production_private.co_credit_epoch_microseconds(p_not_before),
      'notAfterEpochMicros',
        co_production_private.co_credit_epoch_microseconds(p_not_after),
      'provisionedBy', 'authority_owner:' || v_metadata.expected_owner_name,
      'provisionedAtEpochMicros',
        co_production_private.co_credit_epoch_microseconds(v_now)
    )
  );

  INSERT INTO co_production_private.co_credit_worker_signing_keys (
    worker_key_id,
    worker_principal,
    hmac_secret,
    key_fingerprint_sha256,
    not_before,
    not_after,
    provisioned_by,
    provisioned_at,
    integrity_sha256
  ) VALUES (
    p_worker_key_id,
    p_worker_principal,
    p_hmac_secret,
    v_fingerprint,
    p_not_before,
    p_not_after,
    'authority_owner:' || v_metadata.expected_owner_name,
    v_now,
    v_integrity
  );

  RETURN pg_catalog.jsonb_build_object(
    'workerKeyId', p_worker_key_id,
    'workerPrincipal', p_worker_principal,
    'keyFingerprintSha256', v_fingerprint,
    'notBeforeEpochMicros',
      co_production_private.co_credit_epoch_microseconds(p_not_before),
    'notAfterEpochMicros',
      co_production_private.co_credit_epoch_microseconds(p_not_after)
  );
END
$$;

CREATE TABLE co_production.co_credit_rate_catalog_snapshots (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  catalog_version text NOT NULL UNIQUE CHECK (
    co_production_private.co_credit_identifier_is_valid(catalog_version, 160)
  ),
  status text NOT NULL DEFAULT 'approved' CHECK (status = 'approved'),
  effective_at timestamptz NOT NULL,
  catalog jsonb NOT NULL CHECK (
    pg_catalog.jsonb_typeof(catalog) = 'object'
    AND pg_catalog.pg_column_size(catalog) <= 262144
    AND co_production_private.co_credit_commercial_json_is_safe(catalog)
  ),
  catalog_sha256 text NOT NULL UNIQUE CHECK (
    co_production_private.co_credit_hash_is_valid(catalog_sha256)
  ),
  predecessor_catalog_sha256 text REFERENCES
    co_production.co_credit_rate_catalog_snapshots(catalog_sha256)
    ON DELETE RESTRICT,
  approved_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_principal text NOT NULL CHECK (
    co_production_private.co_credit_identifier_is_valid(actor_principal, 240)
  ),
  approved_at timestamptz NOT NULL DEFAULT now(),
  integrity_sha256 text NOT NULL UNIQUE CHECK (
    co_production_private.co_credit_hash_is_valid(integrity_sha256)
  ),
  payment_mutation text NOT NULL DEFAULT 'none' CHECK (payment_mutation = 'none'),
  UNIQUE NULLS NOT DISTINCT (predecessor_catalog_sha256),
  UNIQUE (id, catalog_version, catalog_sha256),
  CHECK (predecessor_catalog_sha256 IS DISTINCT FROM catalog_sha256),
  CHECK (
    catalog_sha256 = co_production_private.co_credit_sha256(catalog)
  ),
  CHECK (
    integrity_sha256 = co_production_private.co_credit_sha256(
      pg_catalog.jsonb_build_object(
        'schemaVersion', 'co-credit-rate-catalog.v1',
        'catalogVersion', catalog_version,
        'status', status,
        'effectiveAtEpochMicros',
          co_production_private.co_credit_epoch_microseconds(effective_at),
        'catalogSha256', catalog_sha256,
        'predecessorCatalogSha256', predecessor_catalog_sha256,
        'approvedBy', approved_by,
        'actorPrincipal', actor_principal,
        'approvedAtEpochMicros',
          co_production_private.co_credit_epoch_microseconds(approved_at),
        'paymentMutation', payment_mutation
      )
    )
  )
);

CREATE TABLE co_production.co_credit_pricing_terms_snapshots (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  pricing_version text NOT NULL UNIQUE CHECK (
    co_production_private.co_credit_identifier_is_valid(pricing_version, 160)
  ),
  status text NOT NULL DEFAULT 'approved' CHECK (status = 'approved'),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  effective_at timestamptz NOT NULL,
  overage_micros_per_co_unit bigint NOT NULL CHECK (
    overage_micros_per_co_unit > 0
  ),
  terms jsonb NOT NULL CHECK (
    pg_catalog.jsonb_typeof(terms) = 'object'
    AND pg_catalog.pg_column_size(terms) <= 65536
    AND co_production_private.co_credit_commercial_json_is_safe(terms)
  ),
  terms_sha256 text NOT NULL UNIQUE CHECK (
    co_production_private.co_credit_hash_is_valid(terms_sha256)
  ),
  predecessor_terms_sha256 text REFERENCES
    co_production.co_credit_pricing_terms_snapshots(terms_sha256)
    ON DELETE RESTRICT,
  rate_catalog_id uuid NOT NULL,
  rate_catalog_version text NOT NULL,
  rate_catalog_sha256 text NOT NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_principal text NOT NULL CHECK (
    co_production_private.co_credit_identifier_is_valid(actor_principal, 240)
  ),
  approved_at timestamptz NOT NULL DEFAULT now(),
  integrity_sha256 text NOT NULL UNIQUE CHECK (
    co_production_private.co_credit_hash_is_valid(integrity_sha256)
  ),
  payment_mutation text NOT NULL DEFAULT 'none' CHECK (payment_mutation = 'none'),
  UNIQUE NULLS NOT DISTINCT (predecessor_terms_sha256),
  UNIQUE (id, pricing_version, terms_sha256),
  FOREIGN KEY (rate_catalog_id, rate_catalog_version, rate_catalog_sha256)
    REFERENCES co_production.co_credit_rate_catalog_snapshots(
      id,
      catalog_version,
      catalog_sha256
    )
    ON DELETE RESTRICT,
  CHECK (predecessor_terms_sha256 IS DISTINCT FROM terms_sha256),
  CHECK (terms_sha256 = co_production_private.co_credit_sha256(terms)),
  CHECK (
    integrity_sha256 = co_production_private.co_credit_sha256(
      pg_catalog.jsonb_build_object(
        'schemaVersion', 'co-credit-pricing-terms.v1',
        'pricingVersion', pricing_version,
        'status', status,
        'currency', currency,
        'effectiveAtEpochMicros',
          co_production_private.co_credit_epoch_microseconds(effective_at),
        'overageMicrosPerCoUnit', overage_micros_per_co_unit,
        'termsSha256', terms_sha256,
        'predecessorTermsSha256', predecessor_terms_sha256,
        'rateCatalogId', rate_catalog_id,
        'rateCatalogVersion', rate_catalog_version,
        'rateCatalogSha256', rate_catalog_sha256,
        'approvedBy', approved_by,
        'actorPrincipal', actor_principal,
        'approvedAtEpochMicros',
          co_production_private.co_credit_epoch_microseconds(approved_at),
        'paymentMutation', payment_mutation
      )
    )
  )
);

CREATE TABLE co_production.co_credit_commercial_bundle_activations (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  activation_sequence bigint NOT NULL UNIQUE CHECK (activation_sequence > 0),
  effective_at timestamptz NOT NULL,
  rate_catalog_id uuid NOT NULL,
  rate_catalog_version text NOT NULL,
  rate_catalog_sha256 text NOT NULL,
  pricing_terms_id uuid NOT NULL,
  pricing_version text NOT NULL,
  pricing_terms_sha256 text NOT NULL,
  predecessor_activation_sha256 text REFERENCES
    co_production.co_credit_commercial_bundle_activations(activation_sha256)
    ON DELETE RESTRICT,
  activated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_principal text NOT NULL CHECK (
    co_production_private.co_credit_identifier_is_valid(actor_principal, 240)
  ),
  activated_at timestamptz NOT NULL DEFAULT now(),
  activation_sha256 text NOT NULL UNIQUE CHECK (
    co_production_private.co_credit_hash_is_valid(activation_sha256)
  ),
  payment_mutation text NOT NULL DEFAULT 'none' CHECK (payment_mutation = 'none'),
  UNIQUE NULLS NOT DISTINCT (predecessor_activation_sha256),
  UNIQUE (id, activation_sequence, activation_sha256),
  UNIQUE (rate_catalog_id, pricing_terms_id),
  FOREIGN KEY (rate_catalog_id, rate_catalog_version, rate_catalog_sha256)
    REFERENCES co_production.co_credit_rate_catalog_snapshots(
      id,
      catalog_version,
      catalog_sha256
    )
    ON DELETE RESTRICT,
  FOREIGN KEY (pricing_terms_id, pricing_version, pricing_terms_sha256)
    REFERENCES co_production.co_credit_pricing_terms_snapshots(
      id,
      pricing_version,
      terms_sha256
    )
    ON DELETE RESTRICT,
  CHECK (predecessor_activation_sha256 IS DISTINCT FROM activation_sha256),
  CHECK (
    activation_sha256 = co_production_private.co_credit_sha256(
      pg_catalog.jsonb_build_object(
        'schemaVersion', 'co-credit-commercial-activation.v1',
        'activationSequence', activation_sequence,
        'effectiveAtEpochMicros',
          co_production_private.co_credit_epoch_microseconds(effective_at),
        'rateCatalogId', rate_catalog_id,
        'rateCatalogVersion', rate_catalog_version,
        'rateCatalogSha256', rate_catalog_sha256,
        'pricingTermsId', pricing_terms_id,
        'pricingVersion', pricing_version,
        'pricingTermsSha256', pricing_terms_sha256,
        'predecessorActivationSha256', predecessor_activation_sha256,
        'activatedBy', activated_by,
        'actorPrincipal', actor_principal,
        'activatedAtEpochMicros',
          co_production_private.co_credit_epoch_microseconds(activated_at),
        'paymentMutation', payment_mutation
      )
    )
  )
);

CREATE TABLE co_production.co_credit_budget_grants (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES co_production.teams(id) ON DELETE RESTRICT,
  project_id uuid REFERENCES co_production.projects(id) ON DELETE RESTRICT,
  budget_scope text NOT NULL CHECK (budget_scope IN ('tenant', 'project')),
  budget_period_key uuid NOT NULL,
  revision_sequence bigint NOT NULL CHECK (revision_sequence > 0),
  grant_version text NOT NULL CHECK (
    co_production_private.co_credit_identifier_is_valid(grant_version, 160)
  ),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  included_co_units bigint NOT NULL CHECK (included_co_units >= 0),
  effective_limit_co_units bigint NOT NULL CHECK (
    effective_limit_co_units >= included_co_units
  ),
  maximum_reservation_co_units bigint NOT NULL CHECK (
    maximum_reservation_co_units > 0
    AND maximum_reservation_co_units <= effective_limit_co_units
  ),
  grant_sha256 text NOT NULL UNIQUE CHECK (
    co_production_private.co_credit_hash_is_valid(grant_sha256)
  ),
  predecessor_grant_sha256 text REFERENCES
    co_production.co_credit_budget_grants(grant_sha256)
    ON DELETE RESTRICT,
  configured_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_principal text NOT NULL CHECK (
    co_production_private.co_credit_identifier_is_valid(actor_principal, 240)
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  integrity_sha256 text NOT NULL UNIQUE CHECK (
    co_production_private.co_credit_hash_is_valid(integrity_sha256)
  ),
  payment_mutation text NOT NULL DEFAULT 'none' CHECK (payment_mutation = 'none'),
  UNIQUE NULLS NOT DISTINCT (
    team_id,
    budget_scope,
    project_id,
    budget_period_key,
    grant_version
  ),
  UNIQUE NULLS NOT DISTINCT (
    team_id,
    budget_scope,
    project_id,
    budget_period_key,
    revision_sequence
  ),
  UNIQUE NULLS NOT DISTINCT (
    team_id,
    budget_scope,
    project_id,
    budget_period_key,
    predecessor_grant_sha256
  ),
  UNIQUE (id, budget_period_key, team_id, project_id, grant_sha256),
  UNIQUE (id, budget_period_key, grant_sha256),
  UNIQUE (id, budget_period_key),
  UNIQUE (id, grant_sha256),
  CHECK (period_end > period_start),
  CHECK (
    (budget_scope = 'tenant' AND project_id IS NULL)
    OR (budget_scope = 'project' AND project_id IS NOT NULL)
  ),
  CHECK (predecessor_grant_sha256 IS DISTINCT FROM grant_sha256),
  CHECK (
    grant_sha256 = co_production_private.co_credit_sha256(
      pg_catalog.jsonb_build_object(
        'schemaVersion', 'co-credit-budget-grant.v2',
        'teamId', team_id,
        'projectId', project_id,
        'budgetScope', budget_scope,
        'budgetPeriodKey', budget_period_key,
        'revisionSequence', revision_sequence,
        'grantVersion', grant_version,
        'periodStartEpochMicros',
          co_production_private.co_credit_epoch_microseconds(period_start),
        'periodEndEpochMicros',
          co_production_private.co_credit_epoch_microseconds(period_end),
        'includedCoUnits', included_co_units,
        'effectiveLimitCoUnits', effective_limit_co_units,
        'maximumReservationCoUnits', maximum_reservation_co_units,
        'predecessorGrantSha256', predecessor_grant_sha256,
        'actorPrincipal', actor_principal,
        'paymentMutation', payment_mutation
      )
    )
  ),
  CHECK (
    integrity_sha256 = co_production_private.co_credit_sha256(
      pg_catalog.jsonb_build_object(
        'grantSha256', grant_sha256,
        'configuredBy', configured_by,
        'createdAtEpochMicros',
          co_production_private.co_credit_epoch_microseconds(created_at)
      )
    )
  )
);

CREATE TABLE co_production.co_credit_entitlement_states (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  budget_grant_id uuid NOT NULL,
  budget_grant_sha256 text NOT NULL,
  budget_period_key uuid NOT NULL,
  team_id uuid NOT NULL,
  project_id uuid,
  entitlement_sequence bigint NOT NULL CHECK (entitlement_sequence > 0),
  entitlement_status text NOT NULL CHECK (
    entitlement_status IN ('active', 'suspended', 'revoked')
  ),
  allowed_operations text[] NOT NULL CHECK (
    cardinality(allowed_operations) BETWEEN 1 AND 64
    AND pg_catalog.array_position(allowed_operations, NULL) IS NULL
  ),
  settlement_grandfathered boolean NOT NULL DEFAULT false,
  reason_code text NOT NULL CHECK (
    co_production_private.co_credit_identifier_is_valid(reason_code, 160)
  ),
  entitlement_sha256 text NOT NULL UNIQUE CHECK (
    co_production_private.co_credit_hash_is_valid(entitlement_sha256)
  ),
  predecessor_entitlement_sha256 text REFERENCES
    co_production.co_credit_entitlement_states(entitlement_sha256)
    ON DELETE RESTRICT,
  recorded_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_principal text NOT NULL CHECK (
    co_production_private.co_credit_identifier_is_valid(actor_principal, 240)
  ),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  payment_mutation text NOT NULL DEFAULT 'none' CHECK (payment_mutation = 'none'),
  UNIQUE (budget_grant_id, entitlement_sequence),
  UNIQUE (budget_grant_id, entitlement_sha256),
  FOREIGN KEY (budget_grant_id, budget_period_key, budget_grant_sha256)
    REFERENCES co_production.co_credit_budget_grants(
      id,
      budget_period_key,
      grant_sha256
    )
    ON DELETE RESTRICT,
  CHECK (predecessor_entitlement_sha256 IS DISTINCT FROM entitlement_sha256),
  CHECK (
    NOT settlement_grandfathered OR entitlement_status = 'active'
  ),
  CHECK (
    entitlement_sha256 = co_production_private.co_credit_sha256(
      pg_catalog.jsonb_build_object(
        'schemaVersion', 'co-credit-entitlement-state.v1',
        'budgetGrantId', budget_grant_id,
        'budgetGrantSha256', budget_grant_sha256,
        'budgetPeriodKey', budget_period_key,
        'teamId', team_id,
        'projectId', project_id,
        'entitlementSequence', entitlement_sequence,
        'entitlementStatus', entitlement_status,
        'allowedOperations', pg_catalog.to_jsonb(allowed_operations),
        'settlementGrandfathered', settlement_grandfathered,
        'reasonCode', reason_code,
        'predecessorEntitlementSha256', predecessor_entitlement_sha256,
        'recordedBy', recorded_by,
        'actorPrincipal', actor_principal,
        'recordedAtEpochMicros',
          co_production_private.co_credit_epoch_microseconds(recorded_at),
        'paymentMutation', payment_mutation
      )
    )
  )
);

CREATE TABLE co_production.co_credit_operation_executions (
  operation_execution_id uuid PRIMARY KEY,
  team_id uuid NOT NULL REFERENCES co_production.teams(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL REFERENCES co_production.projects(id) ON DELETE RESTRICT,
  operation text NOT NULL CHECK (
    co_production_private.co_credit_identifier_is_valid(operation, 120)
  ),
  execution_request_sha256 text NOT NULL CHECK (
    co_production_private.co_credit_hash_is_valid(execution_request_sha256)
  ),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_principal text NOT NULL CHECK (
    co_production_private.co_credit_identifier_is_valid(actor_principal, 240)
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  integrity_sha256 text NOT NULL UNIQUE CHECK (
    co_production_private.co_credit_hash_is_valid(integrity_sha256)
  ),
  payment_mutation text NOT NULL DEFAULT 'none' CHECK (payment_mutation = 'none'),
  UNIQUE (operation_execution_id, team_id, project_id, operation),
  CHECK (
    integrity_sha256 = co_production_private.co_credit_sha256(
      pg_catalog.jsonb_build_object(
        'schemaVersion', 'co-credit-operation-execution.v1',
        'operationExecutionId', operation_execution_id,
        'teamId', team_id,
        'projectId', project_id,
        'operation', operation,
        'executionRequestSha256', execution_request_sha256,
        'actorUserId', actor_user_id,
        'actorPrincipal', actor_principal,
        'createdAtEpochMicros',
          co_production_private.co_credit_epoch_microseconds(created_at),
        'paymentMutation', payment_mutation
      )
    )
  )
);

CREATE TABLE co_production.co_credit_quotes (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  operation_execution_id uuid NOT NULL UNIQUE,
  team_id uuid NOT NULL,
  project_id uuid NOT NULL,
  operation text NOT NULL,
  native_usage_ceiling jsonb NOT NULL CHECK (
    pg_catalog.jsonb_typeof(native_usage_ceiling) = 'object'
    AND pg_catalog.pg_column_size(native_usage_ceiling) <= 8192
  ),
  minimum_co_units bigint NOT NULL CHECK (minimum_co_units >= 0),
  likely_co_units bigint NOT NULL CHECK (likely_co_units >= minimum_co_units),
  maximum_co_units bigint NOT NULL CHECK (maximum_co_units >= likely_co_units),
  rate_catalog_id uuid NOT NULL,
  rate_catalog_version text NOT NULL,
  rate_catalog_sha256 text NOT NULL,
  pricing_terms_id uuid NOT NULL,
  pricing_version text NOT NULL,
  pricing_terms_sha256 text NOT NULL,
  tenant_budget_grant_id uuid NOT NULL,
  tenant_budget_grant_sha256 text NOT NULL,
  tenant_budget_period_key uuid NOT NULL,
  project_budget_grant_id uuid NOT NULL,
  project_budget_grant_sha256 text NOT NULL,
  project_budget_period_key uuid NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_principal text NOT NULL CHECK (
    co_production_private.co_credit_identifier_is_valid(actor_principal, 240)
  ),
  request_sha256 text NOT NULL CHECK (
    co_production_private.co_credit_hash_is_valid(request_sha256)
  ),
  quoted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  integrity_sha256 text NOT NULL UNIQUE CHECK (
    co_production_private.co_credit_hash_is_valid(integrity_sha256)
  ),
  payment_mutation text NOT NULL DEFAULT 'none' CHECK (payment_mutation = 'none'),
  UNIQUE (id, operation_execution_id, team_id, project_id, operation),
  FOREIGN KEY (operation_execution_id, team_id, project_id, operation)
    REFERENCES co_production.co_credit_operation_executions(
      operation_execution_id,
      team_id,
      project_id,
      operation
    )
    ON DELETE RESTRICT,
  FOREIGN KEY (pricing_terms_id, pricing_version, pricing_terms_sha256)
    REFERENCES co_production.co_credit_pricing_terms_snapshots(
      id,
      pricing_version,
      terms_sha256
    )
    ON DELETE RESTRICT,
  FOREIGN KEY (rate_catalog_id, rate_catalog_version, rate_catalog_sha256)
    REFERENCES co_production.co_credit_rate_catalog_snapshots(
      id,
      catalog_version,
      catalog_sha256
    )
    ON DELETE RESTRICT,
  FOREIGN KEY (
    tenant_budget_grant_id,
    tenant_budget_period_key,
    tenant_budget_grant_sha256
  ) REFERENCES co_production.co_credit_budget_grants(
    id,
    budget_period_key,
    grant_sha256
  ) ON DELETE RESTRICT,
  FOREIGN KEY (
    project_budget_grant_id,
    project_budget_period_key,
    project_budget_grant_sha256
  ) REFERENCES co_production.co_credit_budget_grants(
    id,
    budget_period_key,
    grant_sha256
  ) ON DELETE RESTRICT,
  CHECK (expires_at > quoted_at),
  CHECK (
    integrity_sha256 = co_production_private.co_credit_sha256(
      pg_catalog.jsonb_build_object(
        'schemaVersion', 'co-credit-quote.v1',
        'operationExecutionId', operation_execution_id,
        'teamId', team_id,
        'projectId', project_id,
        'operation', operation,
        'nativeUsageCeiling', native_usage_ceiling,
        'minimumCoUnits', minimum_co_units,
        'likelyCoUnits', likely_co_units,
        'maximumCoUnits', maximum_co_units,
        'rateCatalogId', rate_catalog_id,
        'rateCatalogVersion', rate_catalog_version,
        'rateCatalogSha256', rate_catalog_sha256,
        'pricingTermsId', pricing_terms_id,
        'pricingVersion', pricing_version,
        'pricingTermsSha256', pricing_terms_sha256,
        'tenantBudgetGrantId', tenant_budget_grant_id,
        'tenantBudgetGrantSha256', tenant_budget_grant_sha256,
        'tenantBudgetPeriodKey', tenant_budget_period_key,
        'projectBudgetGrantId', project_budget_grant_id,
        'projectBudgetGrantSha256', project_budget_grant_sha256,
        'projectBudgetPeriodKey', project_budget_period_key,
        'actorUserId', actor_user_id,
        'actorPrincipal', actor_principal,
        'requestSha256', request_sha256,
        'quotedAtEpochMicros',
          co_production_private.co_credit_epoch_microseconds(quoted_at),
        'expiresAtEpochMicros',
          co_production_private.co_credit_epoch_microseconds(expires_at),
        'paymentMutation', payment_mutation
      )
    )
  )
);

CREATE TABLE co_production.co_credit_reservations (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  quote_id uuid NOT NULL UNIQUE,
  operation_execution_id uuid NOT NULL UNIQUE,
  team_id uuid NOT NULL,
  project_id uuid NOT NULL,
  operation text NOT NULL,
  reserved_co_units bigint NOT NULL CHECK (reserved_co_units > 0),
  rate_catalog_id uuid NOT NULL,
  rate_catalog_version text NOT NULL,
  rate_catalog_sha256 text NOT NULL,
  pricing_terms_id uuid NOT NULL,
  pricing_version text NOT NULL,
  pricing_terms_sha256 text NOT NULL,
  tenant_budget_grant_id uuid NOT NULL,
  tenant_budget_grant_sha256 text NOT NULL,
  tenant_budget_period_key uuid NOT NULL,
  project_budget_grant_id uuid NOT NULL,
  project_budget_grant_sha256 text NOT NULL,
  project_budget_period_key uuid NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_principal text NOT NULL CHECK (
    co_production_private.co_credit_identifier_is_valid(actor_principal, 240)
  ),
  reservation_request_sha256 text NOT NULL CHECK (
    co_production_private.co_credit_hash_is_valid(reservation_request_sha256)
  ),
  reserved_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  integrity_sha256 text NOT NULL UNIQUE CHECK (
    co_production_private.co_credit_hash_is_valid(integrity_sha256)
  ),
  payment_mutation text NOT NULL DEFAULT 'none' CHECK (payment_mutation = 'none'),
  UNIQUE (id, operation_execution_id, team_id, project_id, operation),
  FOREIGN KEY (
    quote_id,
    operation_execution_id,
    team_id,
    project_id,
    operation
  ) REFERENCES co_production.co_credit_quotes(
    id,
    operation_execution_id,
    team_id,
    project_id,
    operation
  )
    ON DELETE RESTRICT,
  FOREIGN KEY (rate_catalog_id, rate_catalog_version, rate_catalog_sha256)
    REFERENCES co_production.co_credit_rate_catalog_snapshots(
      id,
      catalog_version,
      catalog_sha256
    )
    ON DELETE RESTRICT,
  FOREIGN KEY (pricing_terms_id, pricing_version, pricing_terms_sha256)
    REFERENCES co_production.co_credit_pricing_terms_snapshots(
      id,
      pricing_version,
      terms_sha256
    )
    ON DELETE RESTRICT,
  FOREIGN KEY (
    tenant_budget_grant_id,
    tenant_budget_period_key,
    tenant_budget_grant_sha256
  ) REFERENCES co_production.co_credit_budget_grants(
    id,
    budget_period_key,
    grant_sha256
  )
    ON DELETE RESTRICT,
  FOREIGN KEY (
    project_budget_grant_id,
    project_budget_period_key,
    project_budget_grant_sha256
  ) REFERENCES co_production.co_credit_budget_grants(
    id,
    budget_period_key,
    grant_sha256
  )
    ON DELETE RESTRICT,
  CHECK (expires_at > reserved_at),
  CHECK (
    integrity_sha256 = co_production_private.co_credit_sha256(
      pg_catalog.jsonb_build_object(
        'schemaVersion', 'co-credit-reservation.v1',
        'quoteId', quote_id,
        'operationExecutionId', operation_execution_id,
        'teamId', team_id,
        'projectId', project_id,
        'operation', operation,
        'reservedCoUnits', reserved_co_units,
        'rateCatalogId', rate_catalog_id,
        'rateCatalogVersion', rate_catalog_version,
        'rateCatalogSha256', rate_catalog_sha256,
        'pricingTermsId', pricing_terms_id,
        'pricingVersion', pricing_version,
        'pricingTermsSha256', pricing_terms_sha256,
        'tenantBudgetGrantId', tenant_budget_grant_id,
        'tenantBudgetGrantSha256', tenant_budget_grant_sha256,
        'tenantBudgetPeriodKey', tenant_budget_period_key,
        'projectBudgetGrantId', project_budget_grant_id,
        'projectBudgetGrantSha256', project_budget_grant_sha256,
        'projectBudgetPeriodKey', project_budget_period_key,
        'actorUserId', actor_user_id,
        'actorPrincipal', actor_principal,
        'reservationRequestSha256', reservation_request_sha256,
        'reservedAtEpochMicros',
          co_production_private.co_credit_epoch_microseconds(reserved_at),
        'expiresAtEpochMicros',
          co_production_private.co_credit_epoch_microseconds(expires_at),
        'paymentMutation', payment_mutation
      )
    )
  )
);

CREATE TABLE co_production.co_credit_worker_execution_leases (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  reservation_id uuid NOT NULL,
  operation_execution_id uuid NOT NULL,
  team_id uuid NOT NULL,
  project_id uuid NOT NULL,
  operation text NOT NULL,
  lease_sequence bigint NOT NULL CHECK (lease_sequence > 0),
  lease_token_sha256 text NOT NULL UNIQUE CHECK (
    co_production_private.co_credit_hash_is_valid(lease_token_sha256)
  ),
  issued_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_principal text NOT NULL CHECK (
    co_production_private.co_credit_identifier_is_valid(actor_principal, 240)
  ),
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  integrity_sha256 text NOT NULL UNIQUE CHECK (
    co_production_private.co_credit_hash_is_valid(integrity_sha256)
  ),
  payment_mutation text NOT NULL DEFAULT 'none' CHECK (payment_mutation = 'none'),
  UNIQUE (operation_execution_id, lease_sequence),
  UNIQUE (
    id,
    reservation_id,
    operation_execution_id,
    team_id,
    project_id,
    operation,
    lease_sequence,
    lease_token_sha256
  ),
  FOREIGN KEY (
    reservation_id,
    operation_execution_id,
    team_id,
    project_id,
    operation
  ) REFERENCES co_production.co_credit_reservations(
    id,
    operation_execution_id,
    team_id,
    project_id,
    operation
  )
    ON DELETE RESTRICT,
  CHECK (expires_at > issued_at),
  CHECK (
    integrity_sha256 = co_production_private.co_credit_sha256(
      pg_catalog.jsonb_build_object(
        'schemaVersion', 'co-credit-worker-lease.v1',
        'reservationId', reservation_id,
        'operationExecutionId', operation_execution_id,
        'teamId', team_id,
        'projectId', project_id,
        'operation', operation,
        'leaseSequence', lease_sequence,
        'leaseTokenSha256', lease_token_sha256,
        'issuedBy', issued_by,
        'actorPrincipal', actor_principal,
        'issuedAtEpochMicros',
          co_production_private.co_credit_epoch_microseconds(issued_at),
        'expiresAtEpochMicros',
          co_production_private.co_credit_epoch_microseconds(expires_at),
        'paymentMutation', payment_mutation
      )
    )
  )
);

CREATE TABLE co_production.co_credit_worker_execution_bindings (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  worker_execution_id uuid NOT NULL UNIQUE,
  worker_key_id uuid NOT NULL,
  worker_principal text NOT NULL CHECK (
    co_production_private.co_credit_identifier_is_valid(worker_principal, 200)
  ),
  worker_key_fingerprint_sha256 text NOT NULL CHECK (
    co_production_private.co_credit_hash_is_valid(
      worker_key_fingerprint_sha256
    )
  ),
  worker_lease_id uuid NOT NULL UNIQUE,
  reservation_id uuid NOT NULL,
  operation_execution_id uuid NOT NULL,
  team_id uuid NOT NULL,
  project_id uuid NOT NULL,
  operation text NOT NULL,
  lease_sequence bigint NOT NULL CHECK (lease_sequence > 0),
  lease_token_sha256 text NOT NULL CHECK (
    co_production_private.co_credit_hash_is_valid(lease_token_sha256)
  ),
  source_sha256 text NOT NULL CHECK (
    co_production_private.co_credit_hash_is_valid(source_sha256)
  ),
  pipeline_job_id text NOT NULL CHECK (
    co_production_private.co_credit_identifier_is_valid(pipeline_job_id, 200)
  ),
  pipeline_attempt integer NOT NULL CHECK (pipeline_attempt > 0),
  registered_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_principal text NOT NULL CHECK (
    co_production_private.co_credit_identifier_is_valid(actor_principal, 240)
  ),
  registered_at timestamptz NOT NULL,
  integrity_sha256 text NOT NULL UNIQUE CHECK (
    co_production_private.co_credit_hash_is_valid(integrity_sha256)
  ),
  payment_mutation text NOT NULL DEFAULT 'none' CHECK (payment_mutation = 'none'),
  UNIQUE (
    id,
    worker_execution_id,
    worker_key_id,
    worker_principal,
    worker_key_fingerprint_sha256,
    worker_lease_id,
    reservation_id,
    operation_execution_id,
    team_id,
    project_id,
    operation,
    lease_sequence,
    lease_token_sha256,
    source_sha256,
    pipeline_job_id,
    pipeline_attempt
  ),
  FOREIGN KEY (
    worker_key_id,
    worker_principal,
    worker_key_fingerprint_sha256
  )
    REFERENCES co_production_private.co_credit_worker_signing_keys(
      worker_key_id,
      worker_principal,
      key_fingerprint_sha256
    )
    ON DELETE RESTRICT,
  FOREIGN KEY (
    worker_lease_id,
    reservation_id,
    operation_execution_id,
    team_id,
    project_id,
    operation,
    lease_sequence,
    lease_token_sha256
  ) REFERENCES co_production.co_credit_worker_execution_leases(
    id,
    reservation_id,
    operation_execution_id,
    team_id,
    project_id,
    operation,
    lease_sequence,
    lease_token_sha256
  )
    ON DELETE RESTRICT,
  CHECK (
    integrity_sha256 = co_production_private.co_credit_sha256(
      pg_catalog.jsonb_build_object(
        'schemaVersion', 'co-credit-worker-execution-binding.v1',
        'workerExecutionId', worker_execution_id,
        'workerKeyId', worker_key_id,
        'workerPrincipal', worker_principal,
        'workerKeyFingerprintSha256', worker_key_fingerprint_sha256,
        'workerLeaseId', worker_lease_id,
        'reservationId', reservation_id,
        'operationExecutionId', operation_execution_id,
        'teamId', team_id,
        'projectId', project_id,
        'operation', operation,
        'leaseSequence', lease_sequence,
        'leaseTokenSha256', lease_token_sha256,
        'sourceSha256', source_sha256,
        'pipelineJobId', pipeline_job_id,
        'pipelineAttempt', pipeline_attempt,
        'registeredBy', registered_by,
        'actorPrincipal', actor_principal,
        'registeredAtEpochMicros',
          co_production_private.co_credit_epoch_microseconds(registered_at),
        'paymentMutation', payment_mutation
      )
    )
  )
);

CREATE TABLE co_production.co_credit_worker_execution_attestations (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  worker_binding_id uuid NOT NULL UNIQUE,
  worker_execution_id uuid NOT NULL UNIQUE,
  worker_key_id uuid NOT NULL,
  worker_principal text NOT NULL CHECK (
    co_production_private.co_credit_identifier_is_valid(worker_principal, 200)
  ),
  worker_key_fingerprint_sha256 text NOT NULL CHECK (
    co_production_private.co_credit_hash_is_valid(
      worker_key_fingerprint_sha256
    )
  ),
  worker_lease_id uuid NOT NULL UNIQUE,
  reservation_id uuid NOT NULL,
  operation_execution_id uuid NOT NULL UNIQUE,
  team_id uuid NOT NULL,
  project_id uuid NOT NULL,
  operation text NOT NULL,
  settlement_outcome text NOT NULL CHECK (
    settlement_outcome IN (
      'succeeded',
      'failed',
      'duplicate',
      'unusable_output',
      'safety_rejected',
      'cache_hit',
      'platform_retry'
    )
  ),
  lease_sequence bigint NOT NULL CHECK (lease_sequence > 0),
  lease_token_sha256 text NOT NULL CHECK (
    co_production_private.co_credit_hash_is_valid(lease_token_sha256)
  ),
  source_sha256 text NOT NULL CHECK (
    co_production_private.co_credit_hash_is_valid(source_sha256)
  ),
  pipeline_job_id text NOT NULL CHECK (
    co_production_private.co_credit_identifier_is_valid(pipeline_job_id, 200)
  ),
  pipeline_attempt integer NOT NULL CHECK (pipeline_attempt > 0),
  output_receipt_sha256 text NOT NULL UNIQUE CHECK (
    co_production_private.co_credit_hash_is_valid(output_receipt_sha256)
  ),
  worker_evidence jsonb NOT NULL CHECK (
    pg_catalog.jsonb_typeof(worker_evidence) = 'object'
    AND pg_catalog.pg_column_size(worker_evidence) <= 32768
    AND co_production_private.co_credit_commercial_json_is_safe(worker_evidence)
  ),
  worker_evidence_sha256 text NOT NULL UNIQUE CHECK (
    co_production_private.co_credit_hash_is_valid(worker_evidence_sha256)
    AND worker_evidence_sha256 =
      co_production_private.co_credit_sha256(worker_evidence)
  ),
  signed_payload_sha256 text NOT NULL UNIQUE CHECK (
    co_production_private.co_credit_hash_is_valid(signed_payload_sha256)
  ),
  signature_hmac_sha256 text NOT NULL UNIQUE CHECK (
    co_production_private.co_credit_hmac_is_valid(signature_hmac_sha256)
  ),
  attested_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_principal text NOT NULL CHECK (
    actor_principal = 'worker:' || worker_principal
    AND co_production_private.co_credit_identifier_is_valid(
      actor_principal,
      240
    )
  ),
  attested_at timestamptz NOT NULL,
  integrity_sha256 text NOT NULL UNIQUE CHECK (
    co_production_private.co_credit_hash_is_valid(integrity_sha256)
  ),
  payment_mutation text NOT NULL DEFAULT 'none' CHECK (payment_mutation = 'none'),
  UNIQUE (
    id,
    reservation_id,
    operation_execution_id,
    team_id,
    project_id,
    operation,
    worker_evidence_sha256,
    output_receipt_sha256,
    settlement_outcome
  ),
  FOREIGN KEY (
    worker_binding_id,
    worker_execution_id,
    worker_key_id,
    worker_principal,
    worker_key_fingerprint_sha256,
    worker_lease_id,
    reservation_id,
    operation_execution_id,
    team_id,
    project_id,
    operation,
    lease_sequence,
    lease_token_sha256,
    source_sha256,
    pipeline_job_id,
    pipeline_attempt
  ) REFERENCES co_production.co_credit_worker_execution_bindings(
    id,
    worker_execution_id,
    worker_key_id,
    worker_principal,
    worker_key_fingerprint_sha256,
    worker_lease_id,
    reservation_id,
    operation_execution_id,
    team_id,
    project_id,
    operation,
    lease_sequence,
    lease_token_sha256,
    source_sha256,
    pipeline_job_id,
    pipeline_attempt
  )
    ON DELETE RESTRICT,
  FOREIGN KEY (
    worker_lease_id,
    reservation_id,
    operation_execution_id,
    team_id,
    project_id,
    operation,
    lease_sequence,
    lease_token_sha256
  ) REFERENCES co_production.co_credit_worker_execution_leases(
    id,
    reservation_id,
    operation_execution_id,
    team_id,
    project_id,
    operation,
    lease_sequence,
    lease_token_sha256
  )
    ON DELETE RESTRICT,
  CHECK (
    source_sha256 IS NOT DISTINCT FROM worker_evidence ->> 'sourceSha256'
  ),
  CHECK (
    pipeline_job_id IS NOT DISTINCT FROM worker_evidence ->> 'pipelineJobId'
  ),
  CHECK (
    pipeline_attempt::text IS NOT DISTINCT FROM
      worker_evidence ->> 'pipelineAttempt'
  ),
  CHECK (
    output_receipt_sha256 IS NOT DISTINCT FROM
      worker_evidence ->> 'outputReceiptSha256'
  ),
  CHECK (
    settlement_outcome IS NOT DISTINCT FROM
      worker_evidence ->> 'settlementOutcome'
  ),
  CHECK (
    integrity_sha256 = co_production_private.co_credit_sha256(
      pg_catalog.jsonb_build_object(
        'schemaVersion', 'co-credit-worker-attestation.v2',
        'workerBindingId', worker_binding_id,
        'workerExecutionId', worker_execution_id,
        'workerKeyId', worker_key_id,
        'workerPrincipal', worker_principal,
        'workerKeyFingerprintSha256', worker_key_fingerprint_sha256,
        'workerLeaseId', worker_lease_id,
        'reservationId', reservation_id,
        'operationExecutionId', operation_execution_id,
        'teamId', team_id,
        'projectId', project_id,
        'operation', operation,
        'settlementOutcome', settlement_outcome,
        'leaseSequence', lease_sequence,
        'leaseTokenSha256', lease_token_sha256,
        'sourceSha256', source_sha256,
        'pipelineJobId', pipeline_job_id,
        'pipelineAttempt', pipeline_attempt,
        'outputReceiptSha256', output_receipt_sha256,
        'workerEvidenceSha256', worker_evidence_sha256,
        'signedPayloadSha256', signed_payload_sha256,
        'signatureHmacSha256', signature_hmac_sha256,
        'attestedBy', attested_by,
        'actorPrincipal', actor_principal,
        'attestedAtEpochMicros',
          co_production_private.co_credit_epoch_microseconds(attested_at),
        'paymentMutation', payment_mutation
      )
    )
  )
);

CREATE TABLE co_production.co_credit_terminal_receipts (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  reservation_id uuid NOT NULL,
  settlement_receipt_id uuid,
  operation_execution_id uuid NOT NULL,
  team_id uuid NOT NULL,
  project_id uuid NOT NULL,
  operation text NOT NULL,
  receipt_kind text NOT NULL CHECK (
    receipt_kind IN ('settled', 'released', 'reversed', 'disputed')
  ),
  outcome text NOT NULL CHECK (
    outcome IN (
      'succeeded',
      'failed',
      'duplicate',
      'unusable_output',
      'safety_rejected',
      'cache_hit',
      'platform_retry',
      'released',
      'reversed',
      'disputed'
    )
  ),
  reserved_co_units bigint NOT NULL CHECK (reserved_co_units >= 0),
  committed_co_units bigint NOT NULL CHECK (committed_co_units >= 0),
  released_co_units bigint NOT NULL CHECK (released_co_units >= 0),
  compensated_co_units bigint NOT NULL CHECK (compensated_co_units >= 0),
  source_sha256 text,
  pipeline_job_id text,
  pipeline_attempt integer,
  output_receipt_sha256 text,
  duration_milliseconds bigint,
  native_usage jsonb,
  worker_attestation_id uuid,
  provider_name text,
  provider_model text,
  provider_rate_evidence_sha256 text,
  provider_receipt_sha256 text,
  worker_evidence_sha256 text,
  worker_evidence jsonb CHECK (
    worker_evidence IS NULL
    OR (
      pg_catalog.jsonb_typeof(worker_evidence) = 'object'
      AND pg_catalog.pg_column_size(worker_evidence) <= 32768
      AND co_production_private.co_credit_commercial_json_is_safe(
        worker_evidence
      )
    )
  ),
  reason_code text CHECK (
    reason_code IS NULL
    OR co_production_private.co_credit_identifier_is_valid(reason_code, 160)
  ),
  rate_catalog_id uuid NOT NULL,
  rate_catalog_version text NOT NULL,
  rate_catalog_sha256 text NOT NULL,
  pricing_terms_id uuid NOT NULL,
  pricing_version text NOT NULL,
  pricing_terms_sha256 text NOT NULL,
  tenant_budget_grant_id uuid NOT NULL,
  tenant_budget_grant_sha256 text NOT NULL,
  tenant_budget_period_key uuid NOT NULL,
  project_budget_grant_id uuid NOT NULL,
  project_budget_grant_sha256 text NOT NULL,
  project_budget_period_key uuid NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_principal text NOT NULL CHECK (
    co_production_private.co_credit_identifier_is_valid(actor_principal, 240)
  ),
  idempotency_key text NOT NULL CHECK (
    co_production_private.co_credit_identifier_is_valid(idempotency_key, 240)
  ),
  request_sha256 text NOT NULL CHECK (
    co_production_private.co_credit_hash_is_valid(request_sha256)
  ),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  integrity_sha256 text NOT NULL UNIQUE CHECK (
    co_production_private.co_credit_hash_is_valid(integrity_sha256)
  ),
  payment_mutation text NOT NULL DEFAULT 'none' CHECK (payment_mutation = 'none'),
  UNIQUE (id, operation_execution_id, team_id, project_id, operation),
  FOREIGN KEY (
    reservation_id,
    operation_execution_id,
    team_id,
    project_id,
    operation
  ) REFERENCES co_production.co_credit_reservations(
    id,
    operation_execution_id,
    team_id,
    project_id,
    operation
  )
    ON DELETE RESTRICT,
  FOREIGN KEY (
    settlement_receipt_id,
    operation_execution_id,
    team_id,
    project_id,
    operation
  ) REFERENCES co_production.co_credit_terminal_receipts(
    id,
    operation_execution_id,
    team_id,
    project_id,
    operation
  )
    ON DELETE RESTRICT,
  FOREIGN KEY (
    worker_attestation_id,
    reservation_id,
    operation_execution_id,
    team_id,
    project_id,
    operation,
    worker_evidence_sha256,
    output_receipt_sha256,
    outcome
  ) REFERENCES co_production.co_credit_worker_execution_attestations(
    id,
    reservation_id,
    operation_execution_id,
    team_id,
    project_id,
    operation,
    worker_evidence_sha256,
    output_receipt_sha256,
    settlement_outcome
  )
    ON DELETE RESTRICT,
  FOREIGN KEY (rate_catalog_id, rate_catalog_version, rate_catalog_sha256)
    REFERENCES co_production.co_credit_rate_catalog_snapshots(
      id,
      catalog_version,
      catalog_sha256
    )
    ON DELETE RESTRICT,
  FOREIGN KEY (pricing_terms_id, pricing_version, pricing_terms_sha256)
    REFERENCES co_production.co_credit_pricing_terms_snapshots(
      id,
      pricing_version,
      terms_sha256
    )
    ON DELETE RESTRICT,
  FOREIGN KEY (
    tenant_budget_grant_id,
    tenant_budget_period_key,
    tenant_budget_grant_sha256
  ) REFERENCES co_production.co_credit_budget_grants(
    id,
    budget_period_key,
    grant_sha256
  )
    ON DELETE RESTRICT,
  FOREIGN KEY (
    project_budget_grant_id,
    project_budget_period_key,
    project_budget_grant_sha256
  ) REFERENCES co_production.co_credit_budget_grants(
    id,
    budget_period_key,
    grant_sha256
  )
    ON DELETE RESTRICT,
  CHECK (committed_co_units + released_co_units = reserved_co_units),
  CHECK (
    (receipt_kind IN ('settled', 'released') AND settlement_receipt_id IS NULL)
    OR (receipt_kind IN ('reversed', 'disputed') AND settlement_receipt_id IS NOT NULL)
  ),
  CHECK (receipt_kind = 'settled' OR reason_code IS NOT NULL),
  CHECK (
    (receipt_kind = 'settled'
      AND worker_attestation_id IS NOT NULL
      AND worker_evidence IS NOT NULL
      AND worker_evidence_sha256 IS NOT NULL
      AND output_receipt_sha256 IS NOT NULL
      AND co_production_private.co_credit_hash_is_valid(
        output_receipt_sha256
      ))
    OR (receipt_kind <> 'settled'
      AND worker_attestation_id IS NULL
      AND worker_evidence IS NULL
      AND worker_evidence_sha256 IS NULL)
  ),
  CHECK (
    worker_evidence_sha256 IS NULL
    OR (
      co_production_private.co_credit_hash_is_valid(worker_evidence_sha256)
      AND worker_evidence_sha256 =
        co_production_private.co_credit_sha256(worker_evidence)
    )
  ),
  CHECK (
    receipt_kind <> 'settled'
    OR (
      source_sha256 IS NOT DISTINCT FROM
        worker_evidence ->> 'sourceSha256'
      AND pipeline_job_id IS NOT DISTINCT FROM
        worker_evidence ->> 'pipelineJobId'
      AND pipeline_attempt::numeric IS NOT DISTINCT FROM
        (worker_evidence ->> 'pipelineAttempt')::numeric
      AND output_receipt_sha256 IS NOT DISTINCT FROM
        worker_evidence ->> 'outputReceiptSha256'
      AND duration_milliseconds::numeric IS NOT DISTINCT FROM
        (worker_evidence ->> 'durationMilliseconds')::numeric
      AND native_usage IS NOT DISTINCT FROM worker_evidence -> 'nativeUsage'
      AND provider_name IS NOT DISTINCT FROM worker_evidence ->> 'provider'
      AND provider_model IS NOT DISTINCT FROM worker_evidence ->> 'model'
      AND provider_rate_evidence_sha256 IS NOT DISTINCT FROM
        worker_evidence ->> 'providerRateEvidenceSha256'
      AND provider_receipt_sha256 IS NOT DISTINCT FROM
        worker_evidence ->> 'providerReceiptSha256'
    )
  ),
  CHECK (
    (provider_name IS NULL
      AND provider_model IS NULL
      AND provider_rate_evidence_sha256 IS NULL
      AND provider_receipt_sha256 IS NULL)
    OR (
      provider_name IS NOT NULL
      AND provider_model IS NOT NULL
      AND provider_rate_evidence_sha256 IS NOT NULL
      AND provider_receipt_sha256 IS NOT NULL
      AND co_production_private.co_credit_identifier_is_valid(
        provider_name,
        120
      )
      AND co_production_private.co_credit_identifier_is_valid(
        provider_model,
        160
      )
      AND co_production_private.co_credit_hash_is_valid(
        provider_rate_evidence_sha256
      )
      AND co_production_private.co_credit_hash_is_valid(
        provider_receipt_sha256
      )
    )
  ),
  CHECK (
    receipt_kind <> 'settled'
    OR operation <> 'new_transcode'
    OR (
      source_sha256 IS NOT NULL
      AND co_production_private.co_credit_hash_is_valid(source_sha256)
      AND pipeline_job_id IS NOT NULL
      AND co_production_private.co_credit_identifier_is_valid(
        pipeline_job_id,
        200
      )
      AND pipeline_attempt IS NOT NULL
      AND pipeline_attempt > 0
      AND output_receipt_sha256 IS NOT NULL
      AND co_production_private.co_credit_hash_is_valid(
        output_receipt_sha256
      )
      AND duration_milliseconds IS NOT NULL
      AND duration_milliseconds >= 0
      AND native_usage IS NOT NULL
      AND pg_catalog.jsonb_typeof(native_usage) = 'object'
      AND native_usage ? 'transcoded_media_milliseconds'
      AND pg_catalog.jsonb_typeof(
        native_usage -> 'transcoded_media_milliseconds'
      ) = 'number'
      AND (native_usage ->> 'transcoded_media_milliseconds')::numeric
        = duration_milliseconds::numeric
    )
  ),
  CHECK (
    compensated_co_units = CASE
      WHEN receipt_kind IN ('reversed', 'disputed') THEN committed_co_units
      ELSE 0
    END
  ),
  CHECK (
    integrity_sha256 = co_production_private.co_credit_sha256(
      pg_catalog.jsonb_build_object(
        'schemaVersion', 'co-credit-terminal-receipt.v1',
        'reservationId', reservation_id,
        'settlementReceiptId', settlement_receipt_id,
        'operationExecutionId', operation_execution_id,
        'teamId', team_id,
        'projectId', project_id,
        'operation', operation,
        'receiptKind', receipt_kind,
        'outcome', outcome,
        'reservedCoUnits', reserved_co_units,
        'committedCoUnits', committed_co_units,
        'releasedCoUnits', released_co_units,
        'compensatedCoUnits', compensated_co_units,
        'workerAttestationId', worker_attestation_id,
        'workerEvidenceSha256', worker_evidence_sha256,
        'reasonCode', reason_code,
        'rateCatalogId', rate_catalog_id,
        'rateCatalogVersion', rate_catalog_version,
        'rateCatalogSha256', rate_catalog_sha256,
        'pricingTermsId', pricing_terms_id,
        'pricingVersion', pricing_version,
        'pricingTermsSha256', pricing_terms_sha256,
        'tenantBudgetGrantId', tenant_budget_grant_id,
        'tenantBudgetGrantSha256', tenant_budget_grant_sha256,
        'tenantBudgetPeriodKey', tenant_budget_period_key,
        'projectBudgetGrantId', project_budget_grant_id,
        'projectBudgetGrantSha256', project_budget_grant_sha256,
        'projectBudgetPeriodKey', project_budget_period_key,
        'actorUserId', actor_user_id,
        'actorPrincipal', actor_principal,
        'idempotencyKey', idempotency_key,
        'requestSha256', request_sha256,
        'occurredAtEpochMicros',
          co_production_private.co_credit_epoch_microseconds(occurred_at),
        'paymentMutation', payment_mutation
      )
    )
  )
);

CREATE UNIQUE INDEX co_credit_one_terminal_outcome_per_reservation
  ON co_production.co_credit_terminal_receipts(reservation_id)
  WHERE receipt_kind IN ('settled', 'released');

CREATE UNIQUE INDEX co_credit_one_compensation_per_settlement
  ON co_production.co_credit_terminal_receipts(settlement_receipt_id)
  WHERE receipt_kind IN ('reversed', 'disputed');

CREATE TABLE co_production.co_credit_idempotency_rows (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  team_id uuid NOT NULL,
  project_id uuid NOT NULL,
  operation_execution_id uuid NOT NULL,
  operation text NOT NULL,
  action text NOT NULL CHECK (
    action IN ('reserve', 'settle', 'release', 'reverse_or_dispute')
  ),
  idempotency_key text NOT NULL CHECK (
    co_production_private.co_credit_identifier_is_valid(idempotency_key, 240)
  ),
  request_sha256 text NOT NULL CHECK (
    co_production_private.co_credit_hash_is_valid(request_sha256)
  ),
  resource_type text NOT NULL CHECK (
    resource_type IN ('reservation', 'receipt')
  ),
  resource_id uuid NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_principal text NOT NULL CHECK (
    co_production_private.co_credit_identifier_is_valid(actor_principal, 240)
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  integrity_sha256 text NOT NULL UNIQUE CHECK (
    co_production_private.co_credit_hash_is_valid(integrity_sha256)
  ),
  payment_mutation text NOT NULL DEFAULT 'none' CHECK (payment_mutation = 'none'),
  UNIQUE (team_id, action, idempotency_key),
  FOREIGN KEY (operation_execution_id, team_id, project_id, operation)
    REFERENCES co_production.co_credit_operation_executions(
      operation_execution_id,
      team_id,
      project_id,
      operation
    )
    ON DELETE RESTRICT,
  CHECK (
    integrity_sha256 = co_production_private.co_credit_sha256(
      pg_catalog.jsonb_build_object(
        'schemaVersion', 'co-credit-idempotency.v1',
        'teamId', team_id,
        'projectId', project_id,
        'operationExecutionId', operation_execution_id,
        'operation', operation,
        'action', action,
        'idempotencyKey', idempotency_key,
        'requestSha256', request_sha256,
        'resourceType', resource_type,
        'resourceId', resource_id,
        'actorUserId', actor_user_id,
        'actorPrincipal', actor_principal,
        'createdAtEpochMicros',
          co_production_private.co_credit_epoch_microseconds(created_at),
        'paymentMutation', payment_mutation
      )
    )
  )
);

CREATE TABLE co_production.co_credit_ledger_events (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  team_id uuid NOT NULL,
  project_id uuid NOT NULL,
  operation_execution_id uuid NOT NULL,
  operation text NOT NULL,
  quote_id uuid NOT NULL,
  reservation_id uuid NOT NULL,
  receipt_id uuid,
  tenant_budget_grant_id uuid NOT NULL,
  tenant_budget_period_key uuid NOT NULL,
  project_budget_grant_id uuid NOT NULL,
  project_budget_period_key uuid NOT NULL,
  event_sequence bigint NOT NULL CHECK (event_sequence > 0),
  event_kind text NOT NULL CHECK (
    event_kind IN (
      'quote_issued',
      'reservation_hold',
      'settlement_debit',
      'reservation_release',
      'reversal_credit',
      'dispute_credit'
    )
  ),
  reserved_delta_co_units bigint NOT NULL,
  committed_delta_co_units bigint NOT NULL,
  rate_catalog_id uuid NOT NULL,
  rate_catalog_version text NOT NULL,
  rate_catalog_sha256 text NOT NULL,
  pricing_terms_id uuid NOT NULL,
  pricing_version text NOT NULL,
  pricing_terms_sha256 text NOT NULL,
  idempotency_key text,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_principal text NOT NULL CHECK (
    co_production_private.co_credit_identifier_is_valid(actor_principal, 240)
  ),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
    pg_catalog.jsonb_typeof(metadata) = 'object'
    AND pg_catalog.pg_column_size(metadata) <= 16384
  ),
  previous_event_sequence bigint,
  previous_event_sha256 text,
  event_sha256 text NOT NULL UNIQUE CHECK (
    co_production_private.co_credit_hash_is_valid(event_sha256)
  ),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  payment_mutation text NOT NULL DEFAULT 'none' CHECK (payment_mutation = 'none'),
  UNIQUE (team_id, event_sequence),
  UNIQUE (team_id, event_sequence, event_sha256),
  FOREIGN KEY (operation_execution_id, team_id, project_id, operation)
    REFERENCES co_production.co_credit_operation_executions(
      operation_execution_id,
      team_id,
      project_id,
      operation
    )
    ON DELETE RESTRICT,
  FOREIGN KEY (
    quote_id,
    operation_execution_id,
    team_id,
    project_id,
    operation
  ) REFERENCES co_production.co_credit_quotes(
    id,
    operation_execution_id,
    team_id,
    project_id,
    operation
  )
    ON DELETE RESTRICT,
  FOREIGN KEY (
    reservation_id,
    operation_execution_id,
    team_id,
    project_id,
    operation
  ) REFERENCES co_production.co_credit_reservations(
    id,
    operation_execution_id,
    team_id,
    project_id,
    operation
  )
    ON DELETE RESTRICT,
  FOREIGN KEY (
    receipt_id,
    operation_execution_id,
    team_id,
    project_id,
    operation
  ) REFERENCES co_production.co_credit_terminal_receipts(
    id,
    operation_execution_id,
    team_id,
    project_id,
    operation
  )
    ON DELETE RESTRICT,
  FOREIGN KEY (tenant_budget_grant_id, tenant_budget_period_key)
    REFERENCES co_production.co_credit_budget_grants(id, budget_period_key)
    ON DELETE RESTRICT,
  FOREIGN KEY (project_budget_grant_id, project_budget_period_key)
    REFERENCES co_production.co_credit_budget_grants(id, budget_period_key)
    ON DELETE RESTRICT,
  FOREIGN KEY (rate_catalog_id, rate_catalog_version, rate_catalog_sha256)
    REFERENCES co_production.co_credit_rate_catalog_snapshots(
      id,
      catalog_version,
      catalog_sha256
    )
    ON DELETE RESTRICT,
  FOREIGN KEY (pricing_terms_id, pricing_version, pricing_terms_sha256)
    REFERENCES co_production.co_credit_pricing_terms_snapshots(
      id,
      pricing_version,
      terms_sha256
    )
    ON DELETE RESTRICT,
  CHECK (
    (event_sequence = 1
      AND previous_event_sequence IS NULL
      AND previous_event_sha256 IS NULL)
    OR (event_sequence > 1
      AND previous_event_sequence = event_sequence - 1
      AND co_production_private.co_credit_hash_is_valid(previous_event_sha256))
  ),
  FOREIGN KEY (team_id, previous_event_sequence, previous_event_sha256)
    REFERENCES co_production.co_credit_ledger_events(
      team_id,
      event_sequence,
      event_sha256
    )
    ON DELETE RESTRICT,
  CHECK (
    (event_kind = 'quote_issued'
      AND reserved_delta_co_units = 0
      AND committed_delta_co_units = 0)
    OR (event_kind = 'reservation_hold'
      AND reserved_delta_co_units > 0
      AND committed_delta_co_units = 0)
    OR (event_kind = 'settlement_debit'
      AND reserved_delta_co_units < 0
      AND committed_delta_co_units >= 0)
    OR (event_kind = 'reservation_release'
      AND reserved_delta_co_units < 0
      AND committed_delta_co_units = 0)
    OR (event_kind IN ('reversal_credit', 'dispute_credit')
      AND reserved_delta_co_units = 0
      AND committed_delta_co_units < 0)
  ),
  CHECK (
    event_sha256 = co_production_private.co_credit_sha256(
      pg_catalog.jsonb_build_object(
        'schemaVersion', 'co-credit-ledger-event.v1',
        'teamId', team_id,
        'projectId', project_id,
        'operationExecutionId', operation_execution_id,
        'operation', operation,
        'quoteId', quote_id,
        'reservationId', reservation_id,
        'receiptId', receipt_id,
        'tenantBudgetGrantId', tenant_budget_grant_id,
        'tenantBudgetPeriodKey', tenant_budget_period_key,
        'projectBudgetGrantId', project_budget_grant_id,
        'projectBudgetPeriodKey', project_budget_period_key,
        'eventSequence', event_sequence,
        'eventKind', event_kind,
        'reservedDeltaCoUnits', reserved_delta_co_units,
        'committedDeltaCoUnits', committed_delta_co_units,
        'rateCatalogId', rate_catalog_id,
        'rateCatalogVersion', rate_catalog_version,
        'rateCatalogSha256', rate_catalog_sha256,
        'pricingTermsId', pricing_terms_id,
        'pricingVersion', pricing_version,
        'pricingTermsSha256', pricing_terms_sha256,
        'idempotencyKey', idempotency_key,
        'actorUserId', actor_user_id,
        'actorPrincipal', actor_principal,
        'metadata', metadata,
        'previousEventSequence', previous_event_sequence,
        'previousEventSha256', previous_event_sha256,
        'occurredAtEpochMicros',
          co_production_private.co_credit_epoch_microseconds(occurred_at),
        'paymentMutation', payment_mutation
      )
    )
  )
);

CREATE UNIQUE INDEX co_credit_at_most_one_customer_debit_per_execution
  ON co_production.co_credit_ledger_events(operation_execution_id)
  WHERE event_kind = 'settlement_debit';

CREATE INDEX co_credit_ledger_tenant_budget_balance_idx
  ON co_production.co_credit_ledger_events(
    team_id,
    tenant_budget_period_key,
    event_sequence
  );

CREATE INDEX co_credit_ledger_project_budget_balance_idx
  ON co_production.co_credit_ledger_events(
    team_id,
    project_id,
    project_budget_period_key,
    event_sequence
  );

CREATE OR REPLACE FUNCTION
  co_production_private.guard_co_credit_commercial_activation_insert()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_previous co_production.co_credit_commercial_bundle_activations%ROWTYPE;
BEGIN
  PERFORM co_production_private.lock_co_credit_commercial_authority();

  SELECT activation.*
  INTO v_previous
  FROM co_production.co_credit_commercial_bundle_activations AS activation
  ORDER BY activation.activation_sequence DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF NEW.activation_sequence <> v_previous.activation_sequence + 1
      OR NEW.predecessor_activation_sha256 IS DISTINCT FROM
        v_previous.activation_sha256
      OR NEW.effective_at < v_previous.effective_at
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'co_credit_commercial_activation_not_linear';
    END IF;
  ELSIF NEW.activation_sequence <> 1
    OR NEW.predecessor_activation_sha256 IS NOT NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'co_credit_commercial_activation_root_invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM co_production.co_credit_pricing_terms_snapshots AS pricing
    WHERE pricing.id = NEW.pricing_terms_id
      AND pricing.pricing_version = NEW.pricing_version
      AND pricing.terms_sha256 = NEW.pricing_terms_sha256
      AND pricing.rate_catalog_id = NEW.rate_catalog_id
      AND pricing.rate_catalog_version = NEW.rate_catalog_version
      AND pricing.rate_catalog_sha256 = NEW.rate_catalog_sha256
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'co_credit_commercial_activation_pair_invalid';
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER co_credit_commercial_activation_guard_insert
  BEFORE INSERT ON co_production.co_credit_commercial_bundle_activations
  FOR EACH ROW EXECUTE FUNCTION
    co_production_private.guard_co_credit_commercial_activation_insert();

CREATE OR REPLACE FUNCTION co_production_private.lock_co_credit_budget_scope(
  p_team_id uuid,
  p_project_id uuid,
  p_budget_scope text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_budget_scope NOT IN ('tenant', 'project')
    OR (p_budget_scope = 'tenant' AND p_project_id IS NOT NULL)
    OR (p_budget_scope = 'project' AND p_project_id IS NULL)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'co_credit_budget_scope_invalid';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_team_id::text || ':' || p_budget_scope || ':'
        || pg_catalog.coalesce(p_project_id::text, 'tenant'),
      20260716033002
    )
  );
END
$$;

CREATE OR REPLACE FUNCTION
  co_production_private.lock_co_credit_lifecycle_scope(
    p_team_id uuid,
    p_project_id uuid,
    p_operation_execution_id uuid
  )
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_team_id IS NULL
    OR p_project_id IS NULL
    OR p_operation_execution_id IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'co_credit_lifecycle_scope_invalid';
  END IF;

  -- Universal lifecycle order: tenant budget scope, project budget scope,
  -- then operation execution. No lifecycle path may acquire these in reverse.
  PERFORM co_production_private.lock_co_credit_budget_scope(
    p_team_id,
    NULL,
    'tenant'
  );
  PERFORM co_production_private.lock_co_credit_budget_scope(
    p_team_id,
    p_project_id,
    'project'
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_operation_execution_id::text,
      20260716033001
    )
  );
END
$$;

CREATE OR REPLACE FUNCTION co_production_private.guard_co_credit_budget_grant_insert()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_authoritative_team_id uuid;
  v_predecessor co_production.co_credit_budget_grants%ROWTYPE;
  v_head co_production.co_credit_budget_grants%ROWTYPE;
  v_head_count bigint;
BEGIN
  PERFORM co_production_private.lock_co_credit_budget_scope(
    NEW.team_id,
    NEW.project_id,
    NEW.budget_scope
  );

  IF NEW.budget_scope = 'project' THEN
    SELECT project.team_id
    INTO v_authoritative_team_id
    FROM co_production.projects AS project
    WHERE project.id = NEW.project_id
    FOR SHARE;

    IF v_authoritative_team_id IS NULL
      OR v_authoritative_team_id IS DISTINCT FROM NEW.team_id
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'co_credit_cross_tenant_scope_denied';
    END IF;
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_head_count
  FROM co_production.co_credit_budget_grants AS grant_row
  WHERE grant_row.team_id = NEW.team_id
    AND grant_row.budget_scope = NEW.budget_scope
    AND grant_row.project_id IS NOT DISTINCT FROM NEW.project_id
    AND grant_row.budget_period_key = NEW.budget_period_key
    AND NOT EXISTS (
      SELECT 1
      FROM co_production.co_credit_budget_grants AS successor
      WHERE successor.team_id = grant_row.team_id
        AND successor.budget_scope = grant_row.budget_scope
        AND successor.project_id IS NOT DISTINCT FROM grant_row.project_id
        AND successor.budget_period_key = grant_row.budget_period_key
        AND successor.predecessor_grant_sha256 = grant_row.grant_sha256
    );

  IF v_head_count > 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'co_credit_budget_multiple_heads';
  END IF;

  SELECT grant_row.*
  INTO v_head
  FROM co_production.co_credit_budget_grants AS grant_row
  WHERE grant_row.team_id = NEW.team_id
    AND grant_row.budget_scope = NEW.budget_scope
    AND grant_row.project_id IS NOT DISTINCT FROM NEW.project_id
    AND grant_row.budget_period_key = NEW.budget_period_key
    AND NOT EXISTS (
      SELECT 1
      FROM co_production.co_credit_budget_grants AS successor
      WHERE successor.team_id = grant_row.team_id
        AND successor.budget_scope = grant_row.budget_scope
        AND successor.project_id IS NOT DISTINCT FROM grant_row.project_id
        AND successor.budget_period_key = grant_row.budget_period_key
        AND successor.predecessor_grant_sha256 = grant_row.grant_sha256
    )
  FOR UPDATE;

  IF FOUND THEN
    IF v_head.period_start IS DISTINCT FROM NEW.period_start
      OR v_head.period_end IS DISTINCT FROM NEW.period_end
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'co_credit_budget_period_identity_mismatch';
    END IF;
    IF NEW.predecessor_grant_sha256 IS DISTINCT FROM v_head.grant_sha256
      OR NEW.revision_sequence <> v_head.revision_sequence + 1
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'co_credit_budget_predecessor_not_head';
    END IF;
  ELSIF NEW.predecessor_grant_sha256 IS NOT NULL
    OR NEW.revision_sequence <> 1
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'co_credit_budget_initial_predecessor_forbidden';
  END IF;

  IF NEW.predecessor_grant_sha256 IS NOT NULL THEN
    SELECT grant_row.*
    INTO STRICT v_predecessor
    FROM co_production.co_credit_budget_grants AS grant_row
    WHERE grant_row.grant_sha256 = NEW.predecessor_grant_sha256
    FOR SHARE;

    IF v_predecessor.team_id IS DISTINCT FROM NEW.team_id
      OR v_predecessor.budget_scope IS DISTINCT FROM NEW.budget_scope
      OR v_predecessor.project_id IS DISTINCT FROM NEW.project_id
      OR v_predecessor.budget_period_key IS DISTINCT FROM NEW.budget_period_key
      OR v_predecessor.period_start IS DISTINCT FROM NEW.period_start
      OR v_predecessor.period_end IS DISTINCT FROM NEW.period_end
      OR v_predecessor.revision_sequence + 1 <> NEW.revision_sequence
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'co_credit_budget_predecessor_scope_mismatch';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM co_production.co_credit_budget_grants AS existing
    WHERE existing.team_id = NEW.team_id
      AND existing.budget_scope = NEW.budget_scope
      AND existing.project_id IS NOT DISTINCT FROM NEW.project_id
      AND existing.budget_period_key <> NEW.budget_period_key
      AND pg_catalog.tstzrange(
        existing.period_start,
        existing.period_end,
        '[)'
      ) && pg_catalog.tstzrange(NEW.period_start, NEW.period_end, '[)')
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23P01',
      MESSAGE = 'co_credit_budget_period_overlap';
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER co_credit_budget_grants_guard_insert
  BEFORE INSERT ON co_production.co_credit_budget_grants
  FOR EACH ROW EXECUTE FUNCTION
    co_production_private.guard_co_credit_budget_grant_insert();

CREATE OR REPLACE FUNCTION co_production_private.co_credit_calculate_units(
  p_catalog jsonb,
  p_operation text,
  p_native_usage jsonb
)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
  v_rate jsonb;
  v_dimension text;
  v_quantity numeric;
  v_block_size numeric;
  v_base_co_units numeric;
  v_co_units_per_block numeric;
  v_result numeric;
BEGIN
  v_rate := p_catalog #> ARRAY['rates', p_operation];
  IF pg_catalog.jsonb_typeof(v_rate) <> 'object'
    OR v_rate ->> 'meterClass' IS DISTINCT FROM 'paid_compute'
    OR NOT v_rate ?& ARRAY[
      'meterClass',
      'dimension',
      'blockSize',
      'baseCoUnits',
      'coUnitsPerBlock'
    ]
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'co_credit_paid_compute_rate_missing';
  END IF;

  v_dimension := v_rate ->> 'dimension';
  IF NOT co_production_private.co_credit_identifier_is_valid(v_dimension, 120)
    OR pg_catalog.jsonb_typeof(p_native_usage) <> 'object'
    OR NOT p_native_usage ? v_dimension
    OR p_native_usage - ARRAY[v_dimension] IS DISTINCT FROM '{}'::jsonb
    OR pg_catalog.jsonb_typeof(p_native_usage -> v_dimension) <> 'number'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'co_credit_native_usage_invalid';
  END IF;

  BEGIN
    v_quantity := (p_native_usage ->> v_dimension)::numeric;
    v_block_size := (v_rate ->> 'blockSize')::numeric;
    v_base_co_units := (v_rate ->> 'baseCoUnits')::numeric;
    v_co_units_per_block := (v_rate ->> 'coUnitsPerBlock')::numeric;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'co_credit_rate_numeric_invalid';
  END;

  IF v_quantity < 0
    OR v_block_size <= 0
    OR v_base_co_units < 0
    OR v_co_units_per_block < 0
    OR v_base_co_units <> pg_catalog.trunc(v_base_co_units)
    OR v_co_units_per_block <> pg_catalog.trunc(v_co_units_per_block)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'co_credit_rate_bounds_invalid';
  END IF;

  v_result := v_base_co_units
    + pg_catalog.ceil(v_quantity / v_block_size) * v_co_units_per_block;

  IF v_result <= 0
    OR v_result > 9223372036854775807::numeric
    OR v_result <> pg_catalog.trunc(v_result)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22003',
      MESSAGE = 'co_credit_calculation_overflow';
  END IF;

  RETURN v_result::bigint;
END
$$;

CREATE OR REPLACE FUNCTION co_production_private.append_co_credit_ledger_event(
  p_team_id uuid,
  p_project_id uuid,
  p_operation_execution_id uuid,
  p_operation text,
  p_quote_id uuid,
  p_reservation_id uuid,
  p_receipt_id uuid,
  p_tenant_budget_grant_id uuid,
  p_tenant_budget_period_key uuid,
  p_project_budget_grant_id uuid,
  p_project_budget_period_key uuid,
  p_event_kind text,
  p_reserved_delta_co_units bigint,
  p_committed_delta_co_units bigint,
  p_rate_catalog_id uuid,
  p_rate_catalog_version text,
  p_rate_catalog_sha256 text,
  p_pricing_terms_id uuid,
  p_pricing_version text,
  p_pricing_terms_sha256 text,
  p_idempotency_key text,
  p_metadata jsonb
)
RETURNS co_production.co_credit_ledger_events
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_previous co_production.co_credit_ledger_events%ROWTYPE;
  v_sequence bigint;
  v_actor_user_id uuid := (SELECT auth.uid());
  v_actor_principal text :=
    co_production_private.co_credit_actor_principal();
  v_occurred_at timestamptz;
  v_event_sha256 text;
  v_event co_production.co_credit_ledger_events%ROWTYPE;
BEGIN
  PERFORM co_production_private.require_co_credit_service_role();
  PERFORM co_production_private.assert_co_credit_operation_authority(
    'co_production_private.append_co_credit_ledger_event(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,bigint,bigint,uuid,text,text,uuid,text,text,text,jsonb)'
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_team_id::text, 20260716033000)
  );

  SELECT event.*
  INTO v_previous
  FROM co_production.co_credit_ledger_events AS event
  WHERE event.team_id = p_team_id
  ORDER BY event.event_sequence DESC
  LIMIT 1
  FOR UPDATE;

  v_occurred_at := pg_catalog.clock_timestamp();
  v_sequence := pg_catalog.coalesce(v_previous.event_sequence, 0) + 1;
  v_event_sha256 := co_production_private.co_credit_sha256(
    pg_catalog.jsonb_build_object(
      'schemaVersion', 'co-credit-ledger-event.v1',
      'teamId', p_team_id,
      'projectId', p_project_id,
      'operationExecutionId', p_operation_execution_id,
      'operation', p_operation,
      'quoteId', p_quote_id,
      'reservationId', p_reservation_id,
      'receiptId', p_receipt_id,
      'tenantBudgetGrantId', p_tenant_budget_grant_id,
      'tenantBudgetPeriodKey', p_tenant_budget_period_key,
      'projectBudgetGrantId', p_project_budget_grant_id,
      'projectBudgetPeriodKey', p_project_budget_period_key,
      'eventSequence', v_sequence,
      'eventKind', p_event_kind,
      'reservedDeltaCoUnits', p_reserved_delta_co_units,
      'committedDeltaCoUnits', p_committed_delta_co_units,
      'rateCatalogId', p_rate_catalog_id,
      'rateCatalogVersion', p_rate_catalog_version,
      'rateCatalogSha256', p_rate_catalog_sha256,
      'pricingTermsId', p_pricing_terms_id,
      'pricingVersion', p_pricing_version,
      'pricingTermsSha256', p_pricing_terms_sha256,
      'idempotencyKey', p_idempotency_key,
      'actorUserId', v_actor_user_id,
      'actorPrincipal', v_actor_principal,
      'metadata', pg_catalog.coalesce(p_metadata, '{}'::jsonb),
      'previousEventSequence', v_previous.event_sequence,
      'previousEventSha256', v_previous.event_sha256,
      'occurredAtEpochMicros',
        co_production_private.co_credit_epoch_microseconds(v_occurred_at),
      'paymentMutation', 'none'
    )
  );

  INSERT INTO co_production.co_credit_ledger_events (
    team_id,
    project_id,
    operation_execution_id,
    operation,
    quote_id,
    reservation_id,
    receipt_id,
    tenant_budget_grant_id,
    tenant_budget_period_key,
    project_budget_grant_id,
    project_budget_period_key,
    event_sequence,
    event_kind,
    reserved_delta_co_units,
    committed_delta_co_units,
    rate_catalog_id,
    rate_catalog_version,
    rate_catalog_sha256,
    pricing_terms_id,
    pricing_version,
    pricing_terms_sha256,
    idempotency_key,
    actor_user_id,
    actor_principal,
    metadata,
    previous_event_sequence,
    previous_event_sha256,
    event_sha256,
    occurred_at
  ) VALUES (
    p_team_id,
    p_project_id,
    p_operation_execution_id,
    p_operation,
    p_quote_id,
    p_reservation_id,
    p_receipt_id,
    p_tenant_budget_grant_id,
    p_tenant_budget_period_key,
    p_project_budget_grant_id,
    p_project_budget_period_key,
    v_sequence,
    p_event_kind,
    p_reserved_delta_co_units,
    p_committed_delta_co_units,
    p_rate_catalog_id,
    p_rate_catalog_version,
    p_rate_catalog_sha256,
    p_pricing_terms_id,
    p_pricing_version,
    p_pricing_terms_sha256,
    p_idempotency_key,
    v_actor_user_id,
    v_actor_principal,
    pg_catalog.coalesce(p_metadata, '{}'::jsonb),
    v_previous.event_sequence,
    v_previous.event_sha256,
    v_event_sha256,
    v_occurred_at
  )
  RETURNING * INTO v_event;

  RETURN v_event;
END
$$;

CREATE OR REPLACE FUNCTION co_production_private.save_co_credit_idempotency(
  p_team_id uuid,
  p_project_id uuid,
  p_operation_execution_id uuid,
  p_operation text,
  p_action text,
  p_idempotency_key text,
  p_request_fingerprint_sha256 text,
  p_resource_type text,
  p_resource_id uuid
)
RETURNS co_production.co_credit_idempotency_rows
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_user_id uuid := (SELECT auth.uid());
  v_actor_principal text :=
    co_production_private.co_credit_actor_principal();
  v_created_at timestamptz;
  v_integrity_sha256 text;
  v_row co_production.co_credit_idempotency_rows%ROWTYPE;
BEGIN
  PERFORM co_production_private.require_co_credit_service_role();
  PERFORM co_production_private.assert_co_credit_operation_authority(
    'co_production_private.save_co_credit_idempotency(uuid,uuid,uuid,text,text,text,text,text,uuid)'
  );

  v_created_at := pg_catalog.clock_timestamp();
  v_integrity_sha256 := co_production_private.co_credit_sha256(
    pg_catalog.jsonb_build_object(
      'schemaVersion', 'co-credit-idempotency.v1',
      'teamId', p_team_id,
      'projectId', p_project_id,
      'operationExecutionId', p_operation_execution_id,
      'operation', p_operation,
      'action', p_action,
      'idempotencyKey', p_idempotency_key,
      'requestSha256', p_request_fingerprint_sha256,
      'resourceType', p_resource_type,
      'resourceId', p_resource_id,
      'actorUserId', v_actor_user_id,
      'actorPrincipal', v_actor_principal,
      'createdAtEpochMicros',
        co_production_private.co_credit_epoch_microseconds(v_created_at),
      'paymentMutation', 'none'
    )
  );

  INSERT INTO co_production.co_credit_idempotency_rows (
    team_id,
    project_id,
    operation_execution_id,
    operation,
    action,
    idempotency_key,
    request_sha256,
    resource_type,
    resource_id,
    actor_user_id,
    actor_principal,
    created_at,
    integrity_sha256
  ) VALUES (
    p_team_id,
    p_project_id,
    p_operation_execution_id,
    p_operation,
    p_action,
    p_idempotency_key,
    p_request_fingerprint_sha256,
    p_resource_type,
    p_resource_id,
    v_actor_user_id,
    v_actor_principal,
    v_created_at,
    v_integrity_sha256
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END
$$;

CREATE OR REPLACE FUNCTION co_production.approve_co_credit_rate_catalog(
  p_catalog_version text,
  p_effective_at timestamptz,
  p_catalog jsonb,
  p_catalog_sha256 text,
  p_predecessor_catalog_sha256 text DEFAULT NULL
)
RETURNS co_production.co_credit_rate_catalog_snapshots
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid := pg_catalog.gen_random_uuid();
  v_approved_by uuid := (SELECT auth.uid());
  v_actor_principal text :=
    co_production_private.co_credit_actor_principal();
  v_approved_at timestamptz;
  v_integrity_sha256 text;
  v_previous co_production.co_credit_rate_catalog_snapshots%ROWTYPE;
  v_catalog co_production.co_credit_rate_catalog_snapshots%ROWTYPE;
BEGIN
  PERFORM co_production_private.require_co_credit_service_role();
  PERFORM co_production_private.assert_co_credit_operation_authority(
    'co_production.approve_co_credit_rate_catalog(text,timestamptz,jsonb,text,text)'
  );

  IF p_effective_at IS NULL
    OR NOT co_production_private.co_credit_identifier_is_valid(
      p_catalog_version,
      160
    )
    OR pg_catalog.jsonb_typeof(p_catalog) <> 'object'
    OR pg_catalog.pg_column_size(p_catalog) > 262144
    OR p_catalog_sha256 IS DISTINCT FROM
      co_production_private.co_credit_sha256(p_catalog)
    OR pg_catalog.jsonb_typeof(p_catalog #> ARRAY['rates']) <> 'object'
    OR co_production_private.co_credit_commercial_json_is_safe(p_catalog)
      IS NOT TRUE
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'co_credit_catalog_integrity_invalid';
  END IF;

  PERFORM co_production_private.lock_co_credit_commercial_authority();
  v_approved_at := pg_catalog.clock_timestamp();

  SELECT catalog.*
  INTO v_previous
  FROM co_production.co_credit_rate_catalog_snapshots AS catalog
  WHERE NOT EXISTS (
    SELECT 1
    FROM co_production.co_credit_rate_catalog_snapshots AS successor
    WHERE successor.predecessor_catalog_sha256 = catalog.catalog_sha256
  )
  FOR UPDATE;

  IF FOUND AND p_predecessor_catalog_sha256 IS DISTINCT FROM
      v_previous.catalog_sha256
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'co_credit_catalog_predecessor_not_head';
  ELSIF NOT FOUND AND p_predecessor_catalog_sha256 IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'co_credit_catalog_root_predecessor_forbidden';
  END IF;

  v_integrity_sha256 := co_production_private.co_credit_sha256(
    pg_catalog.jsonb_build_object(
      'schemaVersion', 'co-credit-rate-catalog.v1',
      'catalogVersion', p_catalog_version,
      'status', 'approved',
      'effectiveAtEpochMicros',
        co_production_private.co_credit_epoch_microseconds(p_effective_at),
      'catalogSha256', p_catalog_sha256,
      'predecessorCatalogSha256', p_predecessor_catalog_sha256,
      'approvedBy', v_approved_by,
      'actorPrincipal', v_actor_principal,
      'approvedAtEpochMicros',
        co_production_private.co_credit_epoch_microseconds(v_approved_at),
      'paymentMutation', 'none'
    )
  );

  INSERT INTO co_production.co_credit_rate_catalog_snapshots (
    id,
    catalog_version,
    effective_at,
    catalog,
    catalog_sha256,
    predecessor_catalog_sha256,
    approved_by,
    actor_principal,
    approved_at,
    integrity_sha256
  ) VALUES (
    v_id,
    p_catalog_version,
    p_effective_at,
    p_catalog,
    p_catalog_sha256,
    p_predecessor_catalog_sha256,
    v_approved_by,
    v_actor_principal,
    v_approved_at,
    v_integrity_sha256
  )
  RETURNING * INTO v_catalog;

  RETURN v_catalog;
END
$$;

CREATE OR REPLACE FUNCTION co_production.approve_co_credit_pricing_terms(
  p_pricing_version text,
  p_effective_at timestamptz,
  p_rate_catalog_id uuid,
  p_currency text,
  p_overage_micros_per_co_unit bigint,
  p_terms jsonb,
  p_terms_sha256 text,
  p_predecessor_terms_sha256 text DEFAULT NULL
)
RETURNS co_production.co_credit_pricing_terms_snapshots
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_catalog co_production.co_credit_rate_catalog_snapshots%ROWTYPE;
  v_id uuid := pg_catalog.gen_random_uuid();
  v_approved_by uuid := (SELECT auth.uid());
  v_actor_principal text :=
    co_production_private.co_credit_actor_principal();
  v_approved_at timestamptz;
  v_integrity_sha256 text;
  v_previous co_production.co_credit_pricing_terms_snapshots%ROWTYPE;
  v_terms co_production.co_credit_pricing_terms_snapshots%ROWTYPE;
BEGIN
  PERFORM co_production_private.require_co_credit_service_role();
  PERFORM co_production_private.assert_co_credit_operation_authority(
    'co_production.approve_co_credit_pricing_terms(text,timestamptz,uuid,text,bigint,jsonb,text,text)'
  );

  PERFORM co_production_private.lock_co_credit_commercial_authority();
  v_approved_at := pg_catalog.clock_timestamp();

  SELECT catalog.*
  INTO STRICT v_catalog
  FROM co_production.co_credit_rate_catalog_snapshots AS catalog
  WHERE catalog.id = p_rate_catalog_id
    AND catalog.status = 'approved'
  FOR SHARE;

  IF p_currency <> 'USD'
    OR p_effective_at IS NULL
    OR NOT co_production_private.co_credit_identifier_is_valid(
      p_pricing_version,
      160
    )
    OR p_effective_at < v_catalog.effective_at
    OR p_overage_micros_per_co_unit IS NULL
    OR p_overage_micros_per_co_unit <= 0
    OR pg_catalog.jsonb_typeof(p_terms) <> 'object'
    OR pg_catalog.pg_column_size(p_terms) > 65536
    OR p_terms_sha256 IS DISTINCT FROM
      co_production_private.co_credit_sha256(p_terms)
    OR co_production_private.co_credit_commercial_json_is_safe(p_terms)
      IS NOT TRUE
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'co_credit_pricing_terms_integrity_invalid';
  END IF;

  SELECT pricing.*
  INTO v_previous
  FROM co_production.co_credit_pricing_terms_snapshots AS pricing
  WHERE NOT EXISTS (
    SELECT 1
    FROM co_production.co_credit_pricing_terms_snapshots AS successor
    WHERE successor.predecessor_terms_sha256 = pricing.terms_sha256
  )
  FOR UPDATE;

  IF FOUND AND p_predecessor_terms_sha256 IS DISTINCT FROM
      v_previous.terms_sha256
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'co_credit_pricing_predecessor_not_head';
  ELSIF NOT FOUND AND p_predecessor_terms_sha256 IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'co_credit_pricing_root_predecessor_forbidden';
  END IF;

  v_integrity_sha256 := co_production_private.co_credit_sha256(
    pg_catalog.jsonb_build_object(
      'schemaVersion', 'co-credit-pricing-terms.v1',
      'pricingVersion', p_pricing_version,
      'status', 'approved',
      'currency', p_currency,
      'effectiveAtEpochMicros',
        co_production_private.co_credit_epoch_microseconds(p_effective_at),
      'overageMicrosPerCoUnit', p_overage_micros_per_co_unit,
      'termsSha256', p_terms_sha256,
      'predecessorTermsSha256', p_predecessor_terms_sha256,
      'rateCatalogId', v_catalog.id,
      'rateCatalogVersion', v_catalog.catalog_version,
      'rateCatalogSha256', v_catalog.catalog_sha256,
      'approvedBy', v_approved_by,
      'actorPrincipal', v_actor_principal,
      'approvedAtEpochMicros',
        co_production_private.co_credit_epoch_microseconds(v_approved_at),
      'paymentMutation', 'none'
    )
  );

  INSERT INTO co_production.co_credit_pricing_terms_snapshots (
    id,
    pricing_version,
    effective_at,
    currency,
    overage_micros_per_co_unit,
    terms,
    terms_sha256,
    predecessor_terms_sha256,
    rate_catalog_id,
    rate_catalog_version,
    rate_catalog_sha256,
    approved_by,
    actor_principal,
    approved_at,
    integrity_sha256
  ) VALUES (
    v_id,
    p_pricing_version,
    p_effective_at,
    p_currency,
    p_overage_micros_per_co_unit,
    p_terms,
    p_terms_sha256,
    p_predecessor_terms_sha256,
    v_catalog.id,
    v_catalog.catalog_version,
    v_catalog.catalog_sha256,
    v_approved_by,
    v_actor_principal,
    v_approved_at,
    v_integrity_sha256
  )
  RETURNING * INTO v_terms;

  RETURN v_terms;
END
$$;

-- Catalog and pricing become selectable only through this serialized bundle
-- activation. The component writers remain private implementation details.
CREATE OR REPLACE FUNCTION
  co_production.approve_and_activate_co_credit_commercial_bundle(
    p_catalog_version text,
    p_catalog_effective_at timestamptz,
    p_catalog jsonb,
    p_catalog_sha256 text,
    p_pricing_version text,
    p_pricing_effective_at timestamptz,
    p_currency text,
    p_overage_micros_per_co_unit bigint,
    p_terms jsonb,
    p_terms_sha256 text,
    p_activation_effective_at timestamptz
  )
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_previous_catalog_sha256 text;
  v_previous_terms_sha256 text;
  v_previous_activation
    co_production.co_credit_commercial_bundle_activations%ROWTYPE;
  v_catalog co_production.co_credit_rate_catalog_snapshots%ROWTYPE;
  v_pricing co_production.co_credit_pricing_terms_snapshots%ROWTYPE;
  v_activation
    co_production.co_credit_commercial_bundle_activations%ROWTYPE;
  v_activation_sequence bigint;
  v_activated_by uuid := (SELECT auth.uid());
  v_actor_principal text :=
    co_production_private.co_credit_actor_principal();
  v_activated_at timestamptz;
  v_activation_sha256 text;
BEGIN
  PERFORM co_production_private.require_co_credit_service_role();
  PERFORM co_production_private.assert_co_credit_operation_authority(
    'co_production.approve_and_activate_co_credit_commercial_bundle(text,timestamptz,jsonb,text,text,timestamptz,text,bigint,jsonb,text,timestamptz)'
  );

  IF p_activation_effective_at IS NULL
    OR p_activation_effective_at < p_catalog_effective_at
    OR p_activation_effective_at < p_pricing_effective_at
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'co_credit_commercial_activation_effective_at_invalid';
  END IF;

  PERFORM co_production_private.lock_co_credit_commercial_authority();

  SELECT catalog.catalog_sha256
  INTO v_previous_catalog_sha256
  FROM co_production.co_credit_rate_catalog_snapshots AS catalog
  WHERE NOT EXISTS (
    SELECT 1
    FROM co_production.co_credit_rate_catalog_snapshots AS successor
    WHERE successor.predecessor_catalog_sha256 = catalog.catalog_sha256
  )
  FOR UPDATE;

  SELECT pricing.terms_sha256
  INTO v_previous_terms_sha256
  FROM co_production.co_credit_pricing_terms_snapshots AS pricing
  WHERE NOT EXISTS (
    SELECT 1
    FROM co_production.co_credit_pricing_terms_snapshots AS successor
    WHERE successor.predecessor_terms_sha256 = pricing.terms_sha256
  )
  FOR UPDATE;

  SELECT activation.*
  INTO v_previous_activation
  FROM co_production.co_credit_commercial_bundle_activations AS activation
  ORDER BY activation.activation_sequence DESC
  LIMIT 1
  FOR UPDATE;

  SELECT approved.*
  INTO STRICT v_catalog
  FROM co_production.approve_co_credit_rate_catalog(
    p_catalog_version,
    p_catalog_effective_at,
    p_catalog,
    p_catalog_sha256,
    v_previous_catalog_sha256
  ) AS approved;

  SELECT approved.*
  INTO STRICT v_pricing
  FROM co_production.approve_co_credit_pricing_terms(
    p_pricing_version,
    p_pricing_effective_at,
    v_catalog.id,
    p_currency,
    p_overage_micros_per_co_unit,
    p_terms,
    p_terms_sha256,
    v_previous_terms_sha256
  ) AS approved;

  -- Capture wall clock after the commercial lock and component approvals.
  v_activated_at := pg_catalog.clock_timestamp();
  v_activation_sequence :=
    pg_catalog.coalesce(v_previous_activation.activation_sequence, 0) + 1;
  v_activation_sha256 := co_production_private.co_credit_sha256(
    pg_catalog.jsonb_build_object(
      'schemaVersion', 'co-credit-commercial-activation.v1',
      'activationSequence', v_activation_sequence,
      'effectiveAtEpochMicros',
        co_production_private.co_credit_epoch_microseconds(
          p_activation_effective_at
        ),
      'rateCatalogId', v_catalog.id,
      'rateCatalogVersion', v_catalog.catalog_version,
      'rateCatalogSha256', v_catalog.catalog_sha256,
      'pricingTermsId', v_pricing.id,
      'pricingVersion', v_pricing.pricing_version,
      'pricingTermsSha256', v_pricing.terms_sha256,
      'predecessorActivationSha256',
        v_previous_activation.activation_sha256,
      'activatedBy', v_activated_by,
      'actorPrincipal', v_actor_principal,
      'activatedAtEpochMicros',
        co_production_private.co_credit_epoch_microseconds(v_activated_at),
      'paymentMutation', 'none'
    )
  );

  INSERT INTO co_production.co_credit_commercial_bundle_activations (
    activation_sequence,
    effective_at,
    rate_catalog_id,
    rate_catalog_version,
    rate_catalog_sha256,
    pricing_terms_id,
    pricing_version,
    pricing_terms_sha256,
    predecessor_activation_sha256,
    activated_by,
    actor_principal,
    activated_at,
    activation_sha256
  ) VALUES (
    v_activation_sequence,
    p_activation_effective_at,
    v_catalog.id,
    v_catalog.catalog_version,
    v_catalog.catalog_sha256,
    v_pricing.id,
    v_pricing.pricing_version,
    v_pricing.terms_sha256,
    v_previous_activation.activation_sha256,
    v_activated_by,
    v_actor_principal,
    v_activated_at,
    v_activation_sha256
  )
  RETURNING * INTO v_activation;

  RETURN pg_catalog.jsonb_build_object(
    'commercialBundleActivation', pg_catalog.to_jsonb(v_activation),
    'rateCatalogSnapshot', pg_catalog.to_jsonb(v_catalog),
    'pricingTermsSnapshot', pg_catalog.to_jsonb(v_pricing),
    'paymentMutation', 'none'
  );
END
$$;

CREATE OR REPLACE FUNCTION co_production.grant_co_credit_budget(
  p_team_id uuid,
  p_project_id uuid,
  p_budget_scope text,
  p_budget_period_key uuid,
  p_grant_version text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_included_co_units bigint,
  p_effective_limit_co_units bigint,
  p_maximum_reservation_co_units bigint,
  p_allowed_operations text[],
  p_entitlement_status text DEFAULT 'active',
  p_predecessor_grant_sha256 text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_authoritative_team_id uuid;
  v_actor_id uuid := (SELECT auth.uid());
  v_actor_principal text :=
    co_production_private.co_credit_actor_principal();
  v_grant_id uuid := pg_catalog.gen_random_uuid();
  v_grant_created_at timestamptz;
  v_current_head co_production.co_credit_budget_grants%ROWTYPE;
  v_revision_sequence bigint;
  v_predecessor_grant_sha256 text;
  v_grant_sha256 text;
  v_grant_integrity_sha256 text;
  v_entitlement_id uuid := pg_catalog.gen_random_uuid();
  v_entitlement_sha256 text;
BEGIN
  PERFORM co_production_private.require_co_credit_service_role();
  PERFORM co_production_private.assert_co_credit_operation_authority(
    'co_production.grant_co_credit_budget(uuid,uuid,text,uuid,text,timestamptz,timestamptz,bigint,bigint,bigint,text[],text,text)'
  );

  IF p_budget_period_key IS NULL
    OR p_period_start IS NULL
    OR p_period_end IS NULL
    OR p_period_end <= p_period_start
    OR NOT co_production_private.co_credit_identifier_is_valid(
      p_grant_version,
      160
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'co_credit_budget_request_invalid';
  END IF;

  IF p_budget_scope = 'project' THEN
    SELECT project.team_id
    INTO v_authoritative_team_id
    FROM co_production.projects AS project
    WHERE project.id = p_project_id
    FOR SHARE;

    IF v_authoritative_team_id IS NULL
      OR v_authoritative_team_id IS DISTINCT FROM p_team_id
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'co_credit_cross_tenant_scope_denied';
    END IF;
  ELSIF p_budget_scope = 'tenant' THEN
    IF p_project_id IS NOT NULL
      OR NOT EXISTS (
        SELECT 1 FROM co_production.teams AS team WHERE team.id = p_team_id
      )
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'co_credit_cross_tenant_scope_denied';
    END IF;
  ELSE
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'co_credit_budget_scope_invalid';
  END IF;

  PERFORM co_production_private.lock_co_credit_budget_scope(
    p_team_id,
    p_project_id,
    p_budget_scope
  );

  v_grant_created_at := pg_catalog.clock_timestamp();

  SELECT grant_row.*
  INTO v_current_head
  FROM co_production.co_credit_budget_grants AS grant_row
  WHERE grant_row.team_id = p_team_id
    AND grant_row.budget_scope = p_budget_scope
    AND grant_row.project_id IS NOT DISTINCT FROM p_project_id
    AND grant_row.budget_period_key = p_budget_period_key
    AND NOT EXISTS (
      SELECT 1
      FROM co_production.co_credit_budget_grants AS successor
      WHERE successor.team_id = grant_row.team_id
        AND successor.budget_scope = grant_row.budget_scope
        AND successor.project_id IS NOT DISTINCT FROM grant_row.project_id
        AND successor.budget_period_key = grant_row.budget_period_key
        AND successor.predecessor_grant_sha256 = grant_row.grant_sha256
    )
  FOR UPDATE;

  IF FOUND THEN
    IF p_predecessor_grant_sha256 IS DISTINCT FROM
        v_current_head.grant_sha256
      OR v_current_head.period_start IS DISTINCT FROM p_period_start
      OR v_current_head.period_end IS DISTINCT FROM p_period_end
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'co_credit_budget_expected_head_mismatch';
    END IF;
    v_revision_sequence := v_current_head.revision_sequence + 1;
    v_predecessor_grant_sha256 := v_current_head.grant_sha256;
  ELSE
    IF p_predecessor_grant_sha256 IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'co_credit_budget_initial_predecessor_forbidden';
    END IF;
    v_revision_sequence := 1;
    v_predecessor_grant_sha256 := NULL;
  END IF;

  v_grant_sha256 := co_production_private.co_credit_sha256(
    pg_catalog.jsonb_build_object(
      'schemaVersion', 'co-credit-budget-grant.v2',
      'teamId', p_team_id,
      'projectId', p_project_id,
      'budgetScope', p_budget_scope,
      'budgetPeriodKey', p_budget_period_key,
      'revisionSequence', v_revision_sequence,
      'grantVersion', p_grant_version,
      'periodStartEpochMicros',
        co_production_private.co_credit_epoch_microseconds(p_period_start),
      'periodEndEpochMicros',
        co_production_private.co_credit_epoch_microseconds(p_period_end),
      'includedCoUnits', p_included_co_units,
      'effectiveLimitCoUnits', p_effective_limit_co_units,
      'maximumReservationCoUnits', p_maximum_reservation_co_units,
      'predecessorGrantSha256', v_predecessor_grant_sha256,
      'actorPrincipal', v_actor_principal,
      'paymentMutation', 'none'
    )
  );
  v_grant_integrity_sha256 := co_production_private.co_credit_sha256(
    pg_catalog.jsonb_build_object(
      'grantSha256', v_grant_sha256,
      'configuredBy', v_actor_id,
      'createdAtEpochMicros',
        co_production_private.co_credit_epoch_microseconds(v_grant_created_at)
    )
  );

  INSERT INTO co_production.co_credit_budget_grants (
    id,
    team_id,
    project_id,
    budget_scope,
    budget_period_key,
    revision_sequence,
    grant_version,
    period_start,
    period_end,
    included_co_units,
    effective_limit_co_units,
    maximum_reservation_co_units,
    predecessor_grant_sha256,
    grant_sha256,
    configured_by,
    actor_principal,
    created_at,
    integrity_sha256
  ) VALUES (
    v_grant_id,
    p_team_id,
    p_project_id,
    p_budget_scope,
    p_budget_period_key,
    v_revision_sequence,
    p_grant_version,
    p_period_start,
    p_period_end,
    p_included_co_units,
    p_effective_limit_co_units,
    p_maximum_reservation_co_units,
    v_predecessor_grant_sha256,
    v_grant_sha256,
    v_actor_id,
    v_actor_principal,
    v_grant_created_at,
    v_grant_integrity_sha256
  );

  v_entitlement_sha256 := co_production_private.co_credit_sha256(
    pg_catalog.jsonb_build_object(
      'schemaVersion', 'co-credit-entitlement-state.v1',
      'budgetGrantId', v_grant_id,
      'budgetGrantSha256', v_grant_sha256,
      'budgetPeriodKey', p_budget_period_key,
      'teamId', p_team_id,
      'projectId', p_project_id,
      'entitlementSequence', 1,
      'entitlementStatus', p_entitlement_status,
      'allowedOperations', pg_catalog.to_jsonb(p_allowed_operations),
      'settlementGrandfathered', false,
      'reasonCode', 'budget_granted',
      'predecessorEntitlementSha256', NULL,
      'recordedBy', v_actor_id,
      'actorPrincipal', v_actor_principal,
      'recordedAtEpochMicros',
        co_production_private.co_credit_epoch_microseconds(
          v_grant_created_at
        ),
      'paymentMutation', 'none'
    )
  );

  INSERT INTO co_production.co_credit_entitlement_states (
    id,
    budget_grant_id,
    budget_grant_sha256,
    budget_period_key,
    team_id,
    project_id,
    entitlement_sequence,
    entitlement_status,
    allowed_operations,
    settlement_grandfathered,
    reason_code,
    entitlement_sha256,
    recorded_by,
    actor_principal,
    recorded_at
  ) VALUES (
    v_entitlement_id,
    v_grant_id,
    v_grant_sha256,
    p_budget_period_key,
    p_team_id,
    p_project_id,
    1,
    p_entitlement_status,
    p_allowed_operations,
    false,
    'budget_granted',
    v_entitlement_sha256,
    v_actor_id,
    v_actor_principal,
    v_grant_created_at
  );

  RETURN pg_catalog.jsonb_build_object(
    'budgetGrantId', v_grant_id,
    'budgetGrantSha256', v_grant_sha256,
    'budgetPeriodKey', p_budget_period_key,
    'revisionSequence', v_revision_sequence,
    'entitlementStateId', v_entitlement_id,
    'entitlementSha256', v_entitlement_sha256,
    'paymentMutation', 'none'
  );
END
$$;

CREATE OR REPLACE FUNCTION co_production.record_co_credit_entitlement_state(
  p_budget_grant_id uuid,
  p_entitlement_status text,
  p_allowed_operations text[],
  p_reason_code text,
  p_settlement_grandfathered boolean DEFAULT false
)
RETURNS co_production.co_credit_entitlement_states
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_grant co_production.co_credit_budget_grants%ROWTYPE;
  v_previous co_production.co_credit_entitlement_states%ROWTYPE;
  v_sequence bigint;
  v_recorded_by uuid := (SELECT auth.uid());
  v_actor_principal text :=
    co_production_private.co_credit_actor_principal();
  v_recorded_at timestamptz;
  v_sha256 text;
  v_state co_production.co_credit_entitlement_states%ROWTYPE;
BEGIN
  PERFORM co_production_private.require_co_credit_service_role();
  PERFORM co_production_private.assert_co_credit_operation_authority(
    'co_production.record_co_credit_entitlement_state(uuid,text,text[],text,boolean)'
  );

  IF p_entitlement_status NOT IN ('active', 'suspended', 'revoked')
    OR p_allowed_operations IS NULL
    OR pg_catalog.cardinality(p_allowed_operations) NOT BETWEEN 1 AND 64
    OR pg_catalog.array_position(p_allowed_operations, NULL) IS NOT NULL
    OR p_settlement_grandfathered IS NULL
    OR (
      p_settlement_grandfathered
      AND p_entitlement_status <> 'active'
    )
    OR NOT co_production_private.co_credit_identifier_is_valid(
      p_reason_code,
      160
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'co_credit_entitlement_state_invalid';
  END IF;

  SELECT grant_row.*
  INTO STRICT v_grant
  FROM co_production.co_credit_budget_grants AS grant_row
  WHERE grant_row.id = p_budget_grant_id;

  -- Entitlement changes take the same budget-scope prefix as lifecycle work.
  PERFORM co_production_private.lock_co_credit_budget_scope(
    v_grant.team_id,
    NULL,
    'tenant'
  );
  IF v_grant.budget_scope = 'project' THEN
    PERFORM co_production_private.lock_co_credit_budget_scope(
      v_grant.team_id,
      v_grant.project_id,
      'project'
    );
  END IF;

  SELECT grant_row.*
  INTO STRICT v_grant
  FROM co_production.co_credit_budget_grants AS grant_row
  WHERE grant_row.id = p_budget_grant_id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM co_production.co_credit_budget_grants AS successor
    WHERE successor.team_id = v_grant.team_id
      AND successor.budget_scope = v_grant.budget_scope
      AND successor.project_id IS NOT DISTINCT FROM v_grant.project_id
      AND successor.budget_period_key = v_grant.budget_period_key
      AND successor.predecessor_grant_sha256 = v_grant.grant_sha256
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'co_credit_entitlement_requires_budget_head';
  END IF;

  v_recorded_at := pg_catalog.clock_timestamp();

  SELECT state.*
  INTO v_previous
  FROM co_production.co_credit_entitlement_states AS state
  WHERE state.budget_grant_id = v_grant.id
  ORDER BY state.entitlement_sequence DESC
  LIMIT 1
  FOR UPDATE;

  v_sequence := pg_catalog.coalesce(v_previous.entitlement_sequence, 0) + 1;
  v_sha256 := co_production_private.co_credit_sha256(
    pg_catalog.jsonb_build_object(
      'schemaVersion', 'co-credit-entitlement-state.v1',
      'budgetGrantId', v_grant.id,
      'budgetGrantSha256', v_grant.grant_sha256,
      'budgetPeriodKey', v_grant.budget_period_key,
      'teamId', v_grant.team_id,
      'projectId', v_grant.project_id,
      'entitlementSequence', v_sequence,
      'entitlementStatus', p_entitlement_status,
      'allowedOperations', pg_catalog.to_jsonb(p_allowed_operations),
      'settlementGrandfathered', p_settlement_grandfathered,
      'reasonCode', p_reason_code,
      'predecessorEntitlementSha256', v_previous.entitlement_sha256,
      'recordedBy', v_recorded_by,
      'actorPrincipal', v_actor_principal,
      'recordedAtEpochMicros',
        co_production_private.co_credit_epoch_microseconds(v_recorded_at),
      'paymentMutation', 'none'
    )
  );

  INSERT INTO co_production.co_credit_entitlement_states (
    budget_grant_id,
    budget_grant_sha256,
    budget_period_key,
    team_id,
    project_id,
    entitlement_sequence,
    entitlement_status,
    allowed_operations,
    settlement_grandfathered,
    reason_code,
    predecessor_entitlement_sha256,
    entitlement_sha256,
    recorded_by,
    actor_principal,
    recorded_at
  ) VALUES (
    v_grant.id,
    v_grant.grant_sha256,
    v_grant.budget_period_key,
    v_grant.team_id,
    v_grant.project_id,
    v_sequence,
    p_entitlement_status,
    p_allowed_operations,
    p_settlement_grandfathered,
    p_reason_code,
    v_previous.entitlement_sha256,
    v_sha256,
    v_recorded_by,
    v_actor_principal,
    v_recorded_at
  )
  RETURNING * INTO v_state;

  RETURN v_state;
END
$$;

-- Reserve creates the quote and hold in one database transaction. The exact
-- catalog, pricing terms, and both grant snapshots are copied onto both rows.
CREATE OR REPLACE FUNCTION co_production.reserve_co_credit(
  p_team_id uuid,
  p_project_id uuid,
  p_operation_execution_id uuid,
  p_operation text,
  p_native_usage_ceiling jsonb,
  p_idempotency_key text,
  p_expires_at timestamptz,
  p_expected_rate_catalog_id uuid DEFAULT NULL,
  p_expected_pricing_terms_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_authoritative_team_id uuid;
  v_existing_idempotency co_production.co_credit_idempotency_rows%ROWTYPE;
  v_existing_execution co_production.co_credit_operation_executions%ROWTYPE;
  v_existing_reservation co_production.co_credit_reservations%ROWTYPE;
  v_existing_quote co_production.co_credit_quotes%ROWTYPE;
  v_activation
    co_production.co_credit_commercial_bundle_activations%ROWTYPE;
  v_catalog co_production.co_credit_rate_catalog_snapshots%ROWTYPE;
  v_pricing co_production.co_credit_pricing_terms_snapshots%ROWTYPE;
  v_tenant_grant co_production.co_credit_budget_grants%ROWTYPE;
  v_project_grant co_production.co_credit_budget_grants%ROWTYPE;
  v_tenant_entitlement co_production.co_credit_entitlement_states%ROWTYPE;
  v_project_entitlement co_production.co_credit_entitlement_states%ROWTYPE;
  v_tenant_reserved bigint;
  v_tenant_committed bigint;
  v_project_reserved bigint;
  v_project_committed bigint;
  v_maximum_co_units bigint;
  v_now timestamptz;
  v_actor_user_id uuid := (SELECT auth.uid());
  v_actor_principal text :=
    co_production_private.co_credit_actor_principal();
  v_execution_integrity text;
  v_quote co_production.co_credit_quotes%ROWTYPE;
  v_reservation co_production.co_credit_reservations%ROWTYPE;
  v_quote_integrity text;
  v_reservation_integrity text;
  v_request_fingerprint text;
BEGIN
  PERFORM co_production_private.require_co_credit_service_role();
  PERFORM co_production_private.assert_co_credit_operation_authority(
    'co_production.reserve_co_credit(uuid,uuid,uuid,text,jsonb,text,timestamptz,uuid,uuid)'
  );

  IF p_team_id IS NULL
    OR p_project_id IS NULL
    OR p_operation IS NULL
    OR p_native_usage_ceiling IS NULL
    OR p_idempotency_key IS NULL
    OR p_operation_execution_id IS NULL
    OR p_expires_at IS NULL
    OR NOT co_production_private.co_credit_identifier_is_valid(p_operation, 120)
    OR pg_catalog.jsonb_typeof(p_native_usage_ceiling) <> 'object'
    OR pg_catalog.pg_column_size(p_native_usage_ceiling) > 8192
    OR NOT co_production_private.co_credit_identifier_is_valid(
      p_idempotency_key,
      240
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'co_credit_reservation_request_invalid';
  END IF;

  v_request_fingerprint := co_production_private.co_credit_sha256(
    pg_catalog.jsonb_build_object(
      'schemaVersion', 'co-credit-reserve-request.v1',
      'teamId', p_team_id,
      'projectId', p_project_id,
      'operationExecutionId', p_operation_execution_id,
      'operation', p_operation,
      'nativeUsageCeiling', p_native_usage_ceiling,
      'expiresAtEpochMicros',
        co_production_private.co_credit_epoch_microseconds(p_expires_at),
      'expectedRateCatalogId', p_expected_rate_catalog_id,
      'expectedPricingTermsId', p_expected_pricing_terms_id
    )
  );

  SELECT project.team_id
  INTO v_authoritative_team_id
  FROM co_production.projects AS project
  WHERE project.id = p_project_id
  FOR SHARE;

  IF v_authoritative_team_id IS NULL
    OR v_authoritative_team_id IS DISTINCT FROM p_team_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'co_credit_cross_tenant_scope_denied';
  END IF;

  PERFORM co_production_private.lock_co_credit_lifecycle_scope(
    p_team_id,
    p_project_id,
    p_operation_execution_id
  );

  SELECT idempotency.*
  INTO v_existing_idempotency
  FROM co_production.co_credit_idempotency_rows AS idempotency
  WHERE idempotency.team_id = p_team_id
    AND idempotency.action = 'reserve'
    AND idempotency.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing_idempotency.request_sha256 IS DISTINCT FROM
        v_request_fingerprint
      OR v_existing_idempotency.project_id IS DISTINCT FROM p_project_id
      OR v_existing_idempotency.operation_execution_id IS DISTINCT FROM
        p_operation_execution_id
      OR v_existing_idempotency.operation IS DISTINCT FROM p_operation
      OR v_existing_idempotency.resource_type <> 'reservation'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'co_credit_idempotency_conflict';
    END IF;

    SELECT reservation.*
    INTO STRICT v_existing_reservation
    FROM co_production.co_credit_reservations AS reservation
    WHERE reservation.id = v_existing_idempotency.resource_id;

    SELECT quote.*
    INTO STRICT v_existing_quote
    FROM co_production.co_credit_quotes AS quote
    WHERE quote.id = v_existing_reservation.quote_id;

    IF v_existing_reservation.team_id IS DISTINCT FROM p_team_id
      OR v_existing_reservation.operation IS DISTINCT FROM p_operation
      OR v_existing_reservation.project_id IS DISTINCT FROM p_project_id
      OR v_existing_reservation.operation_execution_id IS DISTINCT FROM
        p_operation_execution_id
      OR v_existing_reservation.reservation_request_sha256 IS DISTINCT FROM
        v_request_fingerprint
      OR v_existing_reservation.expires_at IS DISTINCT FROM p_expires_at
      OR v_existing_quote.native_usage_ceiling IS DISTINCT FROM
        p_native_usage_ceiling
      OR (
        p_expected_rate_catalog_id IS NOT NULL
        AND v_existing_quote.rate_catalog_id IS DISTINCT FROM
          p_expected_rate_catalog_id
      )
      OR (
        p_expected_pricing_terms_id IS NOT NULL
        AND v_existing_quote.pricing_terms_id IS DISTINCT FROM
          p_expected_pricing_terms_id
      )
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'co_credit_reservation_replay_material_conflict';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'reservation', pg_catalog.to_jsonb(v_existing_reservation),
      'replayed', true,
      'paymentMutation', 'none'
    );
  END IF;

  SELECT execution.*
  INTO v_existing_execution
  FROM co_production.co_credit_operation_executions AS execution
  WHERE execution.operation_execution_id = p_operation_execution_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing_execution.team_id IS DISTINCT FROM p_team_id
      OR v_existing_execution.project_id IS DISTINCT FROM p_project_id
      OR v_existing_execution.operation IS DISTINCT FROM p_operation
      OR v_existing_execution.execution_request_sha256 IS DISTINCT FROM
        v_request_fingerprint
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'co_credit_operation_execution_conflict';
    END IF;

    SELECT reservation.*
    INTO STRICT v_existing_reservation
    FROM co_production.co_credit_reservations AS reservation
    WHERE reservation.operation_execution_id = p_operation_execution_id;

    SELECT quote.*
    INTO STRICT v_existing_quote
    FROM co_production.co_credit_quotes AS quote
    WHERE quote.id = v_existing_reservation.quote_id;

    IF v_existing_reservation.reservation_request_sha256 IS DISTINCT FROM
        v_request_fingerprint
      OR v_existing_reservation.expires_at IS DISTINCT FROM p_expires_at
      OR v_existing_quote.native_usage_ceiling IS DISTINCT FROM
        p_native_usage_ceiling
      OR (
        p_expected_rate_catalog_id IS NOT NULL
        AND v_existing_quote.rate_catalog_id IS DISTINCT FROM
          p_expected_rate_catalog_id
      )
      OR (
        p_expected_pricing_terms_id IS NOT NULL
        AND v_existing_quote.pricing_terms_id IS DISTINCT FROM
          p_expected_pricing_terms_id
      )
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'co_credit_reservation_replay_material_conflict';
    END IF;

    PERFORM co_production_private.save_co_credit_idempotency(
      p_team_id,
      p_project_id,
      p_operation_execution_id,
      p_operation,
      'reserve',
      p_idempotency_key,
      v_request_fingerprint,
      'reservation',
      v_existing_reservation.id
    );

    RETURN pg_catalog.jsonb_build_object(
      'reservation', pg_catalog.to_jsonb(v_existing_reservation),
      'replayed', true,
      'paymentMutation', 'none'
    );
  END IF;

  -- Exact committed replays return above without consulting mutable expiry or
  -- commercial state. New work acquires only its target lifecycle locks before
  -- serializing the approved catalog/pricing pair.
  PERFORM co_production_private.lock_co_credit_commercial_authority();
  v_now := pg_catalog.clock_timestamp();

  IF p_expires_at <= v_now
    OR p_expires_at > v_now + interval '24 hours'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'co_credit_reservation_expiry_invalid';
  END IF;

  SELECT activation.*
  INTO STRICT v_activation
  FROM co_production.co_credit_commercial_bundle_activations AS activation
  WHERE activation.effective_at <= v_now
  ORDER BY
    activation.effective_at DESC,
    activation.activation_sequence DESC
  LIMIT 1
  FOR SHARE;

  SELECT catalog.*
  INTO STRICT v_catalog
  FROM co_production.co_credit_rate_catalog_snapshots AS catalog
  WHERE catalog.id = v_activation.rate_catalog_id
    AND catalog.catalog_version = v_activation.rate_catalog_version
    AND catalog.catalog_sha256 = v_activation.rate_catalog_sha256
    AND catalog.status = 'approved'
  FOR SHARE;

  IF p_expected_rate_catalog_id IS NOT NULL
    AND v_catalog.id IS DISTINCT FROM p_expected_rate_catalog_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'co_credit_expected_catalog_is_stale';
  END IF;

  SELECT pricing.*
  INTO STRICT v_pricing
  FROM co_production.co_credit_pricing_terms_snapshots AS pricing
  WHERE pricing.id = v_activation.pricing_terms_id
    AND pricing.pricing_version = v_activation.pricing_version
    AND pricing.terms_sha256 = v_activation.pricing_terms_sha256
    AND pricing.status = 'approved'
    AND pricing.rate_catalog_id = v_catalog.id
    AND pricing.rate_catalog_version = v_catalog.catalog_version
    AND pricing.rate_catalog_sha256 = v_catalog.catalog_sha256
  FOR SHARE;

  IF p_expected_pricing_terms_id IS NOT NULL
    AND v_pricing.id IS DISTINCT FROM p_expected_pricing_terms_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'co_credit_expected_pricing_is_stale';
  END IF;

  SELECT grant_row.*
  INTO STRICT v_tenant_grant
  FROM co_production.co_credit_budget_grants AS grant_row
  WHERE grant_row.team_id = p_team_id
    AND grant_row.budget_scope = 'tenant'
    AND grant_row.project_id IS NULL
    AND grant_row.period_start <= v_now
    AND grant_row.period_end > v_now
    AND NOT EXISTS (
      SELECT 1
      FROM co_production.co_credit_budget_grants AS successor
      WHERE successor.team_id = grant_row.team_id
        AND successor.budget_scope = grant_row.budget_scope
        AND successor.project_id IS NOT DISTINCT FROM grant_row.project_id
        AND successor.budget_period_key = grant_row.budget_period_key
        AND successor.predecessor_grant_sha256 = grant_row.grant_sha256
    )
  FOR UPDATE;

  SELECT grant_row.*
  INTO STRICT v_project_grant
  FROM co_production.co_credit_budget_grants AS grant_row
  WHERE grant_row.team_id = p_team_id
    AND grant_row.project_id = p_project_id
    AND grant_row.budget_scope = 'project'
    AND grant_row.period_start <= v_now
    AND grant_row.period_end > v_now
    AND NOT EXISTS (
      SELECT 1
      FROM co_production.co_credit_budget_grants AS successor
      WHERE successor.team_id = grant_row.team_id
        AND successor.budget_scope = grant_row.budget_scope
        AND successor.project_id IS NOT DISTINCT FROM grant_row.project_id
        AND successor.budget_period_key = grant_row.budget_period_key
        AND successor.predecessor_grant_sha256 = grant_row.grant_sha256
    )
  FOR UPDATE;

  SELECT state.*
  INTO STRICT v_tenant_entitlement
  FROM co_production.co_credit_entitlement_states AS state
  WHERE state.budget_grant_id = v_tenant_grant.id
  ORDER BY state.entitlement_sequence DESC
  LIMIT 1
  FOR SHARE;

  SELECT state.*
  INTO STRICT v_project_entitlement
  FROM co_production.co_credit_entitlement_states AS state
  WHERE state.budget_grant_id = v_project_grant.id
  ORDER BY state.entitlement_sequence DESC
  LIMIT 1
  FOR SHARE;

  IF v_tenant_entitlement.entitlement_status <> 'active'
    OR v_project_entitlement.entitlement_status <> 'active'
    OR NOT p_operation = ANY(v_tenant_entitlement.allowed_operations)
    OR NOT p_operation = ANY(v_project_entitlement.allowed_operations)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'co_credit_entitlement_denied';
  END IF;

  v_maximum_co_units := co_production_private.co_credit_calculate_units(
    v_catalog.catalog,
    p_operation,
    p_native_usage_ceiling
  );

  IF v_maximum_co_units > v_tenant_grant.maximum_reservation_co_units
    OR v_maximum_co_units > v_project_grant.maximum_reservation_co_units
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22003',
      MESSAGE = 'co_credit_reservation_entitlement_limit';
  END IF;

  SELECT
    pg_catalog.coalesce(pg_catalog.sum(
      CASE
        WHEN event.event_kind = 'reservation_hold'
          AND balance_reservation.expires_at <= v_now
          AND NOT EXISTS (
            SELECT 1
            FROM co_production.co_credit_terminal_receipts AS terminal
            WHERE terminal.reservation_id = balance_reservation.id
              AND terminal.receipt_kind IN ('settled', 'released')
          )
        THEN 0
        ELSE event.reserved_delta_co_units
      END
    ), 0),
    pg_catalog.coalesce(pg_catalog.sum(event.committed_delta_co_units), 0)
  INTO v_tenant_reserved, v_tenant_committed
  FROM co_production.co_credit_ledger_events AS event
  JOIN co_production.co_credit_reservations AS balance_reservation
    ON balance_reservation.id = event.reservation_id
  WHERE event.team_id = p_team_id
    AND event.tenant_budget_period_key = v_tenant_grant.budget_period_key;

  SELECT
    pg_catalog.coalesce(pg_catalog.sum(
      CASE
        WHEN event.event_kind = 'reservation_hold'
          AND balance_reservation.expires_at <= v_now
          AND NOT EXISTS (
            SELECT 1
            FROM co_production.co_credit_terminal_receipts AS terminal
            WHERE terminal.reservation_id = balance_reservation.id
              AND terminal.receipt_kind IN ('settled', 'released')
          )
        THEN 0
        ELSE event.reserved_delta_co_units
      END
    ), 0),
    pg_catalog.coalesce(pg_catalog.sum(event.committed_delta_co_units), 0)
  INTO v_project_reserved, v_project_committed
  FROM co_production.co_credit_ledger_events AS event
  JOIN co_production.co_credit_reservations AS balance_reservation
    ON balance_reservation.id = event.reservation_id
  WHERE event.team_id = p_team_id
    AND event.project_id = p_project_id
    AND event.project_budget_period_key = v_project_grant.budget_period_key;

  IF v_tenant_reserved < 0
    OR v_tenant_committed < 0
    OR v_project_reserved < 0
    OR v_project_committed < 0
    OR v_tenant_reserved + v_tenant_committed + v_maximum_co_units
      > v_tenant_grant.effective_limit_co_units
    OR v_project_reserved + v_project_committed + v_maximum_co_units
      > v_project_grant.effective_limit_co_units
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22003',
      MESSAGE = 'co_credit_budget_cap_exceeded';
  END IF;

  -- Recheck wall clock and the active bundle immediately before mutation. An
  -- already-registered future activation can become effective in a long tx.
  v_now := pg_catalog.clock_timestamp();
  IF NOT EXISTS (
    SELECT 1
    FROM co_production.co_credit_commercial_bundle_activations AS active
    WHERE active.activation_sha256 = v_activation.activation_sha256
      AND active.activation_sequence = (
        SELECT candidate.activation_sequence
        FROM co_production.co_credit_commercial_bundle_activations AS candidate
        WHERE candidate.effective_at <= v_now
        ORDER BY
          candidate.effective_at DESC,
          candidate.activation_sequence DESC
        LIMIT 1
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'co_credit_commercial_activation_advanced_retry';
  END IF;

  IF p_expires_at <= v_now
    OR p_expires_at > v_now + interval '24 hours'
    OR v_tenant_grant.period_start > v_now
    OR v_tenant_grant.period_end <= v_now
    OR v_project_grant.period_start > v_now
    OR v_project_grant.period_end <= v_now
    OR p_expires_at > v_tenant_grant.period_end
    OR p_expires_at > v_project_grant.period_end
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'co_credit_reservation_expiry_invalid';
  END IF;

  v_execution_integrity := co_production_private.co_credit_sha256(
    pg_catalog.jsonb_build_object(
      'schemaVersion', 'co-credit-operation-execution.v1',
      'operationExecutionId', p_operation_execution_id,
      'teamId', p_team_id,
      'projectId', p_project_id,
      'operation', p_operation,
      'executionRequestSha256', v_request_fingerprint,
      'actorUserId', v_actor_user_id,
      'actorPrincipal', v_actor_principal,
      'createdAtEpochMicros',
        co_production_private.co_credit_epoch_microseconds(v_now),
      'paymentMutation', 'none'
    )
  );

  INSERT INTO co_production.co_credit_operation_executions (
    operation_execution_id,
    team_id,
    project_id,
    operation,
    execution_request_sha256,
    actor_user_id,
    actor_principal,
    created_at,
    integrity_sha256
  ) VALUES (
    p_operation_execution_id,
    p_team_id,
    p_project_id,
    p_operation,
    v_request_fingerprint,
    v_actor_user_id,
    v_actor_principal,
    v_now,
    v_execution_integrity
  );

  v_quote.id := pg_catalog.gen_random_uuid();
  v_quote.operation_execution_id := p_operation_execution_id;
  v_quote.team_id := p_team_id;
  v_quote.project_id := p_project_id;
  v_quote.operation := p_operation;
  v_quote.native_usage_ceiling := p_native_usage_ceiling;
  v_quote.minimum_co_units := v_maximum_co_units;
  v_quote.likely_co_units := v_maximum_co_units;
  v_quote.maximum_co_units := v_maximum_co_units;
  v_quote.rate_catalog_id := v_catalog.id;
  v_quote.rate_catalog_version := v_catalog.catalog_version;
  v_quote.rate_catalog_sha256 := v_catalog.catalog_sha256;
  v_quote.pricing_terms_id := v_pricing.id;
  v_quote.pricing_version := v_pricing.pricing_version;
  v_quote.pricing_terms_sha256 := v_pricing.terms_sha256;
  v_quote.tenant_budget_grant_id := v_tenant_grant.id;
  v_quote.tenant_budget_grant_sha256 := v_tenant_grant.grant_sha256;
  v_quote.tenant_budget_period_key := v_tenant_grant.budget_period_key;
  v_quote.project_budget_grant_id := v_project_grant.id;
  v_quote.project_budget_grant_sha256 := v_project_grant.grant_sha256;
  v_quote.project_budget_period_key := v_project_grant.budget_period_key;
  v_quote.actor_user_id := v_actor_user_id;
  v_quote.actor_principal := v_actor_principal;
  v_quote.request_sha256 := v_request_fingerprint;
  v_quote.quoted_at := v_now;
  v_quote.expires_at := p_expires_at;
  v_quote.payment_mutation := 'none';
  v_quote_integrity := co_production_private.co_credit_sha256(
    pg_catalog.jsonb_build_object(
      'schemaVersion', 'co-credit-quote.v1',
      'operationExecutionId', v_quote.operation_execution_id,
      'teamId', v_quote.team_id,
      'projectId', v_quote.project_id,
      'operation', v_quote.operation,
      'nativeUsageCeiling', v_quote.native_usage_ceiling,
      'minimumCoUnits', v_quote.minimum_co_units,
      'likelyCoUnits', v_quote.likely_co_units,
      'maximumCoUnits', v_quote.maximum_co_units,
      'rateCatalogId', v_quote.rate_catalog_id,
      'rateCatalogVersion', v_quote.rate_catalog_version,
      'rateCatalogSha256', v_quote.rate_catalog_sha256,
      'pricingTermsId', v_quote.pricing_terms_id,
      'pricingVersion', v_quote.pricing_version,
      'pricingTermsSha256', v_quote.pricing_terms_sha256,
      'tenantBudgetGrantId', v_quote.tenant_budget_grant_id,
      'tenantBudgetGrantSha256', v_quote.tenant_budget_grant_sha256,
      'tenantBudgetPeriodKey', v_quote.tenant_budget_period_key,
      'projectBudgetGrantId', v_quote.project_budget_grant_id,
      'projectBudgetGrantSha256', v_quote.project_budget_grant_sha256,
      'projectBudgetPeriodKey', v_quote.project_budget_period_key,
      'actorUserId', v_quote.actor_user_id,
      'actorPrincipal', v_quote.actor_principal,
      'requestSha256', v_quote.request_sha256,
      'quotedAtEpochMicros',
        co_production_private.co_credit_epoch_microseconds(v_quote.quoted_at),
      'expiresAtEpochMicros',
        co_production_private.co_credit_epoch_microseconds(v_quote.expires_at),
      'paymentMutation', 'none'
    )
  );

  INSERT INTO co_production.co_credit_quotes (
    id,
    operation_execution_id,
    team_id,
    project_id,
    operation,
    native_usage_ceiling,
    minimum_co_units,
    likely_co_units,
    maximum_co_units,
    rate_catalog_id,
    rate_catalog_version,
    rate_catalog_sha256,
    pricing_terms_id,
    pricing_version,
    pricing_terms_sha256,
    tenant_budget_grant_id,
    tenant_budget_grant_sha256,
    tenant_budget_period_key,
    project_budget_grant_id,
    project_budget_grant_sha256,
    project_budget_period_key,
    actor_user_id,
    actor_principal,
    request_sha256,
    quoted_at,
    expires_at,
    integrity_sha256
  ) VALUES (
    v_quote.id,
    v_quote.operation_execution_id,
    v_quote.team_id,
    v_quote.project_id,
    v_quote.operation,
    v_quote.native_usage_ceiling,
    v_quote.minimum_co_units,
    v_quote.likely_co_units,
    v_quote.maximum_co_units,
    v_quote.rate_catalog_id,
    v_quote.rate_catalog_version,
    v_quote.rate_catalog_sha256,
    v_quote.pricing_terms_id,
    v_quote.pricing_version,
    v_quote.pricing_terms_sha256,
    v_quote.tenant_budget_grant_id,
    v_quote.tenant_budget_grant_sha256,
    v_quote.tenant_budget_period_key,
    v_quote.project_budget_grant_id,
    v_quote.project_budget_grant_sha256,
    v_quote.project_budget_period_key,
    v_quote.actor_user_id,
    v_quote.actor_principal,
    v_quote.request_sha256,
    v_quote.quoted_at,
    v_quote.expires_at,
    v_quote_integrity
  )
  RETURNING * INTO v_quote;

  v_reservation.id := pg_catalog.gen_random_uuid();
  v_reservation.quote_id := v_quote.id;
  v_reservation.operation_execution_id := p_operation_execution_id;
  v_reservation.team_id := p_team_id;
  v_reservation.project_id := p_project_id;
  v_reservation.operation := p_operation;
  v_reservation.reserved_co_units := v_maximum_co_units;
  v_reservation.rate_catalog_id := v_catalog.id;
  v_reservation.rate_catalog_version := v_catalog.catalog_version;
  v_reservation.rate_catalog_sha256 := v_catalog.catalog_sha256;
  v_reservation.pricing_terms_id := v_pricing.id;
  v_reservation.pricing_version := v_pricing.pricing_version;
  v_reservation.pricing_terms_sha256 := v_pricing.terms_sha256;
  v_reservation.tenant_budget_grant_id := v_tenant_grant.id;
  v_reservation.tenant_budget_grant_sha256 := v_tenant_grant.grant_sha256;
  v_reservation.tenant_budget_period_key := v_tenant_grant.budget_period_key;
  v_reservation.project_budget_grant_id := v_project_grant.id;
  v_reservation.project_budget_grant_sha256 := v_project_grant.grant_sha256;
  v_reservation.project_budget_period_key := v_project_grant.budget_period_key;
  v_reservation.actor_user_id := v_actor_user_id;
  v_reservation.actor_principal := v_actor_principal;
  v_reservation.reservation_request_sha256 := v_request_fingerprint;
  v_reservation.reserved_at := v_now;
  v_reservation.expires_at := p_expires_at;
  v_reservation.payment_mutation := 'none';
  v_reservation_integrity := co_production_private.co_credit_sha256(
    pg_catalog.jsonb_build_object(
      'schemaVersion', 'co-credit-reservation.v1',
      'quoteId', v_reservation.quote_id,
      'operationExecutionId', v_reservation.operation_execution_id,
      'teamId', v_reservation.team_id,
      'projectId', v_reservation.project_id,
      'operation', v_reservation.operation,
      'reservedCoUnits', v_reservation.reserved_co_units,
      'rateCatalogId', v_reservation.rate_catalog_id,
      'rateCatalogVersion', v_reservation.rate_catalog_version,
      'rateCatalogSha256', v_reservation.rate_catalog_sha256,
      'pricingTermsId', v_reservation.pricing_terms_id,
      'pricingVersion', v_reservation.pricing_version,
      'pricingTermsSha256', v_reservation.pricing_terms_sha256,
      'tenantBudgetGrantId', v_reservation.tenant_budget_grant_id,
      'tenantBudgetGrantSha256', v_reservation.tenant_budget_grant_sha256,
      'tenantBudgetPeriodKey', v_reservation.tenant_budget_period_key,
      'projectBudgetGrantId', v_reservation.project_budget_grant_id,
      'projectBudgetGrantSha256', v_reservation.project_budget_grant_sha256,
      'projectBudgetPeriodKey', v_reservation.project_budget_period_key,
      'actorUserId', v_reservation.actor_user_id,
      'actorPrincipal', v_reservation.actor_principal,
      'reservationRequestSha256', v_reservation.reservation_request_sha256,
      'reservedAtEpochMicros',
        co_production_private.co_credit_epoch_microseconds(
          v_reservation.reserved_at
        ),
      'expiresAtEpochMicros',
        co_production_private.co_credit_epoch_microseconds(
          v_reservation.expires_at
        ),
      'paymentMutation', 'none'
    )
  );

  INSERT INTO co_production.co_credit_reservations (
    id,
    quote_id,
    operation_execution_id,
    team_id,
    project_id,
    operation,
    reserved_co_units,
    rate_catalog_id,
    rate_catalog_version,
    rate_catalog_sha256,
    pricing_terms_id,
    pricing_version,
    pricing_terms_sha256,
    tenant_budget_grant_id,
    tenant_budget_grant_sha256,
    tenant_budget_period_key,
    project_budget_grant_id,
    project_budget_grant_sha256,
    project_budget_period_key,
    actor_user_id,
    actor_principal,
    reservation_request_sha256,
    reserved_at,
    expires_at,
    integrity_sha256
  ) VALUES (
    v_reservation.id,
    v_reservation.quote_id,
    v_reservation.operation_execution_id,
    v_reservation.team_id,
    v_reservation.project_id,
    v_reservation.operation,
    v_reservation.reserved_co_units,
    v_reservation.rate_catalog_id,
    v_reservation.rate_catalog_version,
    v_reservation.rate_catalog_sha256,
    v_reservation.pricing_terms_id,
    v_reservation.pricing_version,
    v_reservation.pricing_terms_sha256,
    v_reservation.tenant_budget_grant_id,
    v_reservation.tenant_budget_grant_sha256,
    v_reservation.tenant_budget_period_key,
    v_reservation.project_budget_grant_id,
    v_reservation.project_budget_grant_sha256,
    v_reservation.project_budget_period_key,
    v_reservation.actor_user_id,
    v_reservation.actor_principal,
    v_reservation.reservation_request_sha256,
    v_reservation.reserved_at,
    v_reservation.expires_at,
    v_reservation_integrity
  )
  RETURNING * INTO v_reservation;

  PERFORM co_production_private.append_co_credit_ledger_event(
    p_team_id,
    p_project_id,
    p_operation_execution_id,
    p_operation,
    v_quote.id,
    v_reservation.id,
    NULL,
    v_tenant_grant.id,
    v_tenant_grant.budget_period_key,
    v_project_grant.id,
    v_project_grant.budget_period_key,
    'quote_issued',
    0,
    0,
    v_catalog.id,
    v_catalog.catalog_version,
    v_catalog.catalog_sha256,
    v_pricing.id,
    v_pricing.pricing_version,
    v_pricing.terms_sha256,
    p_idempotency_key,
    pg_catalog.jsonb_build_object('maximumCoUnits', v_maximum_co_units)
  );

  PERFORM co_production_private.append_co_credit_ledger_event(
    p_team_id,
    p_project_id,
    p_operation_execution_id,
    p_operation,
    v_quote.id,
    v_reservation.id,
    NULL,
    v_tenant_grant.id,
    v_tenant_grant.budget_period_key,
    v_project_grant.id,
    v_project_grant.budget_period_key,
    'reservation_hold',
    v_maximum_co_units,
    0,
    v_catalog.id,
    v_catalog.catalog_version,
    v_catalog.catalog_sha256,
    v_pricing.id,
    v_pricing.pricing_version,
    v_pricing.terms_sha256,
    p_idempotency_key,
    pg_catalog.jsonb_build_object(
      'expiresAtEpochMicros',
      co_production_private.co_credit_epoch_microseconds(p_expires_at)
    )
  );

  PERFORM co_production_private.save_co_credit_idempotency(
    p_team_id,
    p_project_id,
    p_operation_execution_id,
    p_operation,
    'reserve',
    p_idempotency_key,
    v_request_fingerprint,
    'reservation',
    v_reservation.id
  );

  RETURN pg_catalog.jsonb_build_object(
    'quote', pg_catalog.to_jsonb(v_quote),
    'reservation', pg_catalog.to_jsonb(v_reservation),
    'replayed', false,
    'paymentMutation', 'none'
  );
END
$$;

CREATE OR REPLACE FUNCTION co_production.issue_co_credit_worker_execution_lease(
  p_team_id uuid,
  p_project_id uuid,
  p_operation_execution_id uuid,
  p_reservation_id uuid,
  p_worker_execution_id uuid,
  p_worker_key_id uuid,
  p_source_sha256 text,
  p_pipeline_job_id text,
  p_pipeline_attempt integer,
  p_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_authoritative_team_id uuid;
  v_reservation co_production.co_credit_reservations%ROWTYPE;
  v_previous co_production.co_credit_worker_execution_leases%ROWTYPE;
  v_lease co_production.co_credit_worker_execution_leases%ROWTYPE;
  v_binding co_production.co_credit_worker_execution_bindings%ROWTYPE;
  v_worker_key
    co_production_private.co_credit_worker_signing_keys%ROWTYPE;
  v_lease_token text := pg_catalog.gen_random_uuid()::text;
  v_lease_token_sha256 text;
  v_sequence bigint;
  v_issued_by uuid := (SELECT auth.uid());
  v_actor_principal text :=
    co_production_private.co_credit_actor_principal();
  v_issued_at timestamptz;
  v_integrity_sha256 text;
  v_binding_integrity_sha256 text;
BEGIN
  PERFORM co_production_private.require_co_credit_service_role();
  PERFORM co_production_private.assert_co_credit_operation_authority(
    'co_production.issue_co_credit_worker_execution_lease(uuid,uuid,uuid,uuid,uuid,uuid,text,text,integer,timestamptz)'
  );

  IF p_team_id IS NULL
    OR p_project_id IS NULL
    OR p_operation_execution_id IS NULL
    OR p_reservation_id IS NULL
    OR p_worker_execution_id IS NULL
    OR p_worker_key_id IS NULL
    OR co_production_private.co_credit_hash_is_valid(p_source_sha256)
      IS NOT TRUE
    OR co_production_private.co_credit_identifier_is_valid(
      p_pipeline_job_id,
      200
    ) IS NOT TRUE
    OR p_pipeline_attempt IS NULL
    OR p_pipeline_attempt <= 0
    OR p_expires_at IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'co_credit_worker_lease_request_invalid';
  END IF;

  SELECT project.team_id
  INTO v_authoritative_team_id
  FROM co_production.projects AS project
  WHERE project.id = p_project_id
  FOR SHARE;

  IF v_authoritative_team_id IS NULL
    OR v_authoritative_team_id IS DISTINCT FROM p_team_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'co_credit_cross_tenant_scope_denied';
  END IF;

  PERFORM co_production_private.lock_co_credit_lifecycle_scope(
    p_team_id,
    p_project_id,
    p_operation_execution_id
  );

  SELECT reservation.*
  INTO STRICT v_reservation
  FROM co_production.co_credit_reservations AS reservation
  WHERE reservation.id = p_reservation_id
    AND reservation.operation_execution_id = p_operation_execution_id
    AND reservation.team_id = p_team_id
    AND reservation.project_id = p_project_id
  FOR UPDATE;

  SELECT signing_key.*
  INTO STRICT v_worker_key
  FROM co_production_private.co_credit_worker_signing_keys AS signing_key
  WHERE signing_key.worker_key_id = p_worker_key_id
  FOR SHARE;

  v_issued_at := pg_catalog.clock_timestamp();

  IF v_reservation.expires_at <= v_issued_at
    OR p_expires_at <= v_issued_at
    OR p_expires_at > v_issued_at + interval '1 hour'
    OR p_expires_at > v_reservation.expires_at
    OR v_worker_key.not_before > v_issued_at
    OR v_worker_key.not_after <= v_issued_at
    OR EXISTS (
      SELECT 1
      FROM co_production.co_credit_terminal_receipts AS receipt
      WHERE receipt.reservation_id = v_reservation.id
        AND receipt.receipt_kind IN ('settled', 'released')
    )
    OR EXISTS (
      SELECT 1
      FROM co_production.co_credit_worker_execution_attestations AS attestation
      WHERE attestation.reservation_id = v_reservation.id
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'co_credit_worker_lease_not_issuable';
  END IF;

  SELECT lease.*
  INTO v_previous
  FROM co_production.co_credit_worker_execution_leases AS lease
  WHERE lease.operation_execution_id = p_operation_execution_id
    AND NOT EXISTS (
      SELECT 1
      FROM co_production.co_credit_worker_execution_leases AS newer
      WHERE newer.operation_execution_id = lease.operation_execution_id
        AND newer.lease_sequence > lease.lease_sequence
    )
  FOR UPDATE;

  v_sequence := pg_catalog.coalesce(v_previous.lease_sequence, 0) + 1;
  v_lease_token_sha256 := co_production_private.co_credit_sha256(
    pg_catalog.to_jsonb(v_lease_token)
  );

  -- Recheck wall clock immediately before writing the lease and pre-work
  -- binding. The source/job identity is fixed before the token is returned.
  v_issued_at := pg_catalog.clock_timestamp();
  IF v_reservation.expires_at <= v_issued_at
    OR p_expires_at <= v_issued_at
    OR p_expires_at > v_issued_at + interval '1 hour'
    OR p_expires_at > v_reservation.expires_at
    OR v_worker_key.not_before > v_issued_at
    OR v_worker_key.not_after <= v_issued_at
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'co_credit_worker_lease_clock_recheck_failed';
  END IF;

  v_integrity_sha256 := co_production_private.co_credit_sha256(
    pg_catalog.jsonb_build_object(
      'schemaVersion', 'co-credit-worker-lease.v1',
      'reservationId', v_reservation.id,
      'operationExecutionId', v_reservation.operation_execution_id,
      'teamId', v_reservation.team_id,
      'projectId', v_reservation.project_id,
      'operation', v_reservation.operation,
      'leaseSequence', v_sequence,
      'leaseTokenSha256', v_lease_token_sha256,
      'issuedBy', v_issued_by,
      'actorPrincipal', v_actor_principal,
      'issuedAtEpochMicros',
        co_production_private.co_credit_epoch_microseconds(v_issued_at),
      'expiresAtEpochMicros',
        co_production_private.co_credit_epoch_microseconds(p_expires_at),
      'paymentMutation', 'none'
    )
  );

  INSERT INTO co_production.co_credit_worker_execution_leases (
    reservation_id,
    operation_execution_id,
    team_id,
    project_id,
    operation,
    lease_sequence,
    lease_token_sha256,
    issued_by,
    actor_principal,
    issued_at,
    expires_at,
    integrity_sha256
  ) VALUES (
    v_reservation.id,
    v_reservation.operation_execution_id,
    v_reservation.team_id,
    v_reservation.project_id,
    v_reservation.operation,
    v_sequence,
    v_lease_token_sha256,
    v_issued_by,
    v_actor_principal,
    v_issued_at,
    p_expires_at,
    v_integrity_sha256
  )
  RETURNING * INTO v_lease;

  v_binding_integrity_sha256 := co_production_private.co_credit_sha256(
    pg_catalog.jsonb_build_object(
      'schemaVersion', 'co-credit-worker-execution-binding.v1',
      'workerExecutionId', p_worker_execution_id,
      'workerKeyId', v_worker_key.worker_key_id,
      'workerPrincipal', v_worker_key.worker_principal,
      'workerKeyFingerprintSha256',
        v_worker_key.key_fingerprint_sha256,
      'workerLeaseId', v_lease.id,
      'reservationId', v_reservation.id,
      'operationExecutionId', v_reservation.operation_execution_id,
      'teamId', v_reservation.team_id,
      'projectId', v_reservation.project_id,
      'operation', v_reservation.operation,
      'leaseSequence', v_sequence,
      'leaseTokenSha256', v_lease_token_sha256,
      'sourceSha256', p_source_sha256,
      'pipelineJobId', p_pipeline_job_id,
      'pipelineAttempt', p_pipeline_attempt,
      'registeredBy', v_issued_by,
      'actorPrincipal', v_actor_principal,
      'registeredAtEpochMicros',
        co_production_private.co_credit_epoch_microseconds(v_issued_at),
      'paymentMutation', 'none'
    )
  );

  INSERT INTO co_production.co_credit_worker_execution_bindings (
    worker_execution_id,
    worker_key_id,
    worker_principal,
    worker_key_fingerprint_sha256,
    worker_lease_id,
    reservation_id,
    operation_execution_id,
    team_id,
    project_id,
    operation,
    lease_sequence,
    lease_token_sha256,
    source_sha256,
    pipeline_job_id,
    pipeline_attempt,
    registered_by,
    actor_principal,
    registered_at,
    integrity_sha256
  ) VALUES (
    p_worker_execution_id,
    v_worker_key.worker_key_id,
    v_worker_key.worker_principal,
    v_worker_key.key_fingerprint_sha256,
    v_lease.id,
    v_reservation.id,
    v_reservation.operation_execution_id,
    v_reservation.team_id,
    v_reservation.project_id,
    v_reservation.operation,
    v_sequence,
    v_lease_token_sha256,
    p_source_sha256,
    p_pipeline_job_id,
    p_pipeline_attempt,
    v_issued_by,
    v_actor_principal,
    v_issued_at,
    v_binding_integrity_sha256
  )
  RETURNING * INTO v_binding;

  RETURN pg_catalog.jsonb_build_object(
    'workerLease', pg_catalog.to_jsonb(v_lease),
    'workerExecutionBinding', pg_catalog.to_jsonb(v_binding),
    'leaseToken', v_lease_token,
    'paymentMutation', 'none'
  );
END
$$;

CREATE OR REPLACE FUNCTION
  co_production.record_co_credit_worker_execution_attestation(
    p_team_id uuid,
    p_project_id uuid,
    p_operation_execution_id uuid,
    p_reservation_id uuid,
    p_worker_binding_id uuid,
    p_worker_execution_id uuid,
    p_worker_lease_id uuid,
    p_lease_sequence bigint,
    p_lease_token text,
    p_attested_at timestamptz,
    p_signature_hmac_sha256 text,
    p_worker_evidence jsonb
  )
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_authoritative_team_id uuid;
  v_reservation co_production.co_credit_reservations%ROWTYPE;
  v_lease co_production.co_credit_worker_execution_leases%ROWTYPE;
  v_binding co_production.co_credit_worker_execution_bindings%ROWTYPE;
  v_worker_key
    co_production_private.co_credit_worker_signing_keys%ROWTYPE;
  v_existing
    co_production.co_credit_worker_execution_attestations%ROWTYPE;
  v_attestation
    co_production.co_credit_worker_execution_attestations%ROWTYPE;
  v_lease_token_sha256 text;
  v_evidence_sha256 text;
  v_output_receipt_sha256 text;
  v_settlement_outcome text;
  v_pipeline_attempt integer;
  v_duration_milliseconds bigint;
  v_native_usage jsonb;
  v_signed_payload jsonb;
  v_signed_payload_sha256 text;
  v_expected_hmac bytea;
  v_provided_hmac bytea;
  v_now timestamptz;
  v_attested_by uuid := (SELECT auth.uid());
  v_actor_principal text;
  v_integrity_sha256 text;
BEGIN
  PERFORM co_production_private.require_co_credit_worker_attestor_role();
  PERFORM co_production_private.assert_co_credit_operation_authority(
    'co_production.record_co_credit_worker_execution_attestation(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,text,timestamptz,text,jsonb)'
  );

  IF p_team_id IS NULL
    OR p_project_id IS NULL
    OR p_operation_execution_id IS NULL
    OR p_reservation_id IS NULL
    OR p_worker_binding_id IS NULL
    OR p_worker_execution_id IS NULL
    OR p_worker_lease_id IS NULL
    OR p_lease_sequence IS NULL
    OR p_lease_sequence <= 0
    OR p_lease_token IS NULL
    OR co_production_private.co_credit_identifier_is_valid(
      p_lease_token,
      80
    ) IS NOT TRUE
    OR p_attested_at IS NULL
    OR co_production_private.co_credit_hmac_is_valid(
      p_signature_hmac_sha256
    ) IS NOT TRUE
    OR p_worker_evidence IS NULL
    OR pg_catalog.jsonb_typeof(p_worker_evidence) <> 'object'
    OR pg_catalog.pg_column_size(p_worker_evidence) > 32768
    OR co_production_private.co_credit_commercial_json_is_safe(
      p_worker_evidence
    ) IS NOT TRUE
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'co_credit_worker_attestation_request_invalid';
  END IF;

  v_settlement_outcome := p_worker_evidence ->> 'settlementOutcome';
  IF v_settlement_outcome IS NULL
    OR v_settlement_outcome NOT IN (
      'succeeded',
      'failed',
      'duplicate',
      'unusable_output',
      'safety_rejected',
      'cache_hit',
      'platform_retry'
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'co_credit_worker_attested_outcome_invalid';
  END IF;

  SELECT project.team_id
  INTO v_authoritative_team_id
  FROM co_production.projects AS project
  WHERE project.id = p_project_id
  FOR SHARE;

  IF v_authoritative_team_id IS NULL
    OR v_authoritative_team_id IS DISTINCT FROM p_team_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'co_credit_cross_tenant_scope_denied';
  END IF;

  PERFORM co_production_private.lock_co_credit_lifecycle_scope(
    p_team_id,
    p_project_id,
    p_operation_execution_id
  );

  SELECT reservation.*
  INTO STRICT v_reservation
  FROM co_production.co_credit_reservations AS reservation
  WHERE reservation.id = p_reservation_id
    AND reservation.operation_execution_id = p_operation_execution_id
    AND reservation.team_id = p_team_id
    AND reservation.project_id = p_project_id
  FOR UPDATE;

  v_lease_token_sha256 := co_production_private.co_credit_sha256(
    pg_catalog.to_jsonb(p_lease_token)
  );

  SELECT lease.*
  INTO STRICT v_lease
  FROM co_production.co_credit_worker_execution_leases AS lease
  WHERE lease.id = p_worker_lease_id
    AND lease.reservation_id = p_reservation_id
    AND lease.operation_execution_id = p_operation_execution_id
    AND lease.team_id = p_team_id
    AND lease.project_id = p_project_id
    AND lease.operation = v_reservation.operation
    AND lease.lease_sequence = p_lease_sequence
    AND lease.lease_token_sha256 = v_lease_token_sha256
  FOR UPDATE;

  SELECT binding.*
  INTO STRICT v_binding
  FROM co_production.co_credit_worker_execution_bindings AS binding
  WHERE binding.id = p_worker_binding_id
    AND binding.worker_execution_id = p_worker_execution_id
    AND binding.worker_lease_id = p_worker_lease_id
    AND binding.reservation_id = p_reservation_id
    AND binding.operation_execution_id = p_operation_execution_id
    AND binding.team_id = p_team_id
    AND binding.project_id = p_project_id
    AND binding.operation = v_reservation.operation
    AND binding.lease_sequence = p_lease_sequence
    AND binding.lease_token_sha256 = v_lease_token_sha256
  FOR UPDATE;

  SELECT signing_key.*
  INTO STRICT v_worker_key
  FROM co_production_private.co_credit_worker_signing_keys AS signing_key
  WHERE signing_key.worker_key_id = v_binding.worker_key_id
    AND signing_key.worker_principal = v_binding.worker_principal
    AND signing_key.key_fingerprint_sha256 =
      v_binding.worker_key_fingerprint_sha256
  FOR SHARE;

  -- The shared database role transports the request, but the immutable row is
  -- individually attributed to the owner-provisioned worker principal whose
  -- exact key, execution binding, and fenced lease authenticate the evidence.
  v_actor_principal := 'worker:' || v_binding.worker_principal;

  IF v_reservation.operation = 'new_transcode' THEN
    IF NOT p_worker_evidence ?& ARRAY[
      'sourceSha256',
      'pipelineJobId',
      'pipelineAttempt',
      'outputReceiptSha256',
      'durationMilliseconds',
      'nativeUsage',
      'settlementOutcome'
    ]
      OR p_worker_evidence - ARRAY[
        'sourceSha256',
        'pipelineJobId',
        'pipelineAttempt',
        'outputReceiptSha256',
        'durationMilliseconds',
        'nativeUsage',
        'settlementOutcome',
        'provider',
        'model',
        'providerRateEvidenceSha256',
        'providerReceiptSha256'
      ] IS DISTINCT FROM '{}'::jsonb
      OR co_production_private.co_credit_hash_is_valid(
        p_worker_evidence ->> 'sourceSha256'
      ) IS NOT TRUE
      OR co_production_private.co_credit_identifier_is_valid(
        p_worker_evidence ->> 'pipelineJobId',
        200
      ) IS NOT TRUE
      OR co_production_private.co_credit_hash_is_valid(
        p_worker_evidence ->> 'outputReceiptSha256'
      ) IS NOT TRUE
      OR pg_catalog.jsonb_typeof(p_worker_evidence -> 'pipelineAttempt')
        <> 'number'
      OR pg_catalog.jsonb_typeof(p_worker_evidence -> 'durationMilliseconds')
        <> 'number'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'co_credit_trusted_worker_evidence_required';
    END IF;

    BEGIN
      v_pipeline_attempt := (p_worker_evidence ->> 'pipelineAttempt')::integer;
      v_duration_milliseconds :=
        (p_worker_evidence ->> 'durationMilliseconds')::bigint;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'co_credit_trusted_worker_evidence_invalid';
    END;

    v_native_usage := p_worker_evidence -> 'nativeUsage';
    IF v_pipeline_attempt <= 0
      OR v_duration_milliseconds < 0
      OR pg_catalog.jsonb_typeof(v_native_usage) <> 'object'
      OR NOT v_native_usage ? 'transcoded_media_milliseconds'
      OR v_native_usage - ARRAY['transcoded_media_milliseconds']
        IS DISTINCT FROM '{}'::jsonb
      OR pg_catalog.jsonb_typeof(
        v_native_usage -> 'transcoded_media_milliseconds'
      ) <> 'number'
      OR (v_native_usage ->> 'transcoded_media_milliseconds')::numeric
        IS DISTINCT FROM v_duration_milliseconds::numeric
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'co_credit_transcode_native_usage_mismatch';
    END IF;
  ELSE
    IF NOT p_worker_evidence ? 'nativeUsage'
      OR pg_catalog.jsonb_typeof(p_worker_evidence -> 'nativeUsage')
        <> 'object'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'co_credit_trusted_worker_evidence_required';
    END IF;
  END IF;

  IF p_worker_evidence ?| ARRAY[
    'provider',
    'model',
    'providerRateEvidenceSha256',
    'providerReceiptSha256'
  ] AND (
    NOT p_worker_evidence ?& ARRAY[
      'provider',
      'model',
      'providerRateEvidenceSha256',
      'providerReceiptSha256'
    ]
    OR co_production_private.co_credit_identifier_is_valid(
      p_worker_evidence ->> 'provider',
      120
    ) IS NOT TRUE
    OR co_production_private.co_credit_identifier_is_valid(
      p_worker_evidence ->> 'model',
      160
    ) IS NOT TRUE
    OR co_production_private.co_credit_hash_is_valid(
      p_worker_evidence ->> 'providerRateEvidenceSha256'
    ) IS NOT TRUE
    OR co_production_private.co_credit_hash_is_valid(
      p_worker_evidence ->> 'providerReceiptSha256'
    ) IS NOT TRUE
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'co_credit_provider_evidence_incomplete';
  END IF;

  v_evidence_sha256 := co_production_private.co_credit_sha256(
    p_worker_evidence
  );
  v_output_receipt_sha256 := p_worker_evidence ->> 'outputReceiptSha256';

  IF co_production_private.co_credit_hash_is_valid(
    v_output_receipt_sha256
  ) IS NOT TRUE THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'co_credit_output_receipt_binding_required';
  END IF;

  IF p_worker_evidence ->> 'sourceSha256' IS DISTINCT FROM
      v_binding.source_sha256
    OR p_worker_evidence ->> 'pipelineJobId' IS DISTINCT FROM
      v_binding.pipeline_job_id
    OR p_worker_evidence ->> 'pipelineAttempt' IS DISTINCT FROM
      v_binding.pipeline_attempt::text
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'co_credit_worker_preregistration_binding_mismatch';
  END IF;

  v_signed_payload := pg_catalog.jsonb_build_object(
    'schemaVersion', 'co-credit-worker-receipt-signature.v1',
    'workerBindingId', v_binding.id,
    'workerExecutionId', v_binding.worker_execution_id,
    'workerKeyId', v_binding.worker_key_id,
    'workerPrincipal', v_binding.worker_principal,
    'workerKeyFingerprintSha256',
      v_binding.worker_key_fingerprint_sha256,
    'workerLeaseId', v_binding.worker_lease_id,
    'reservationId', v_binding.reservation_id,
    'operationExecutionId', v_binding.operation_execution_id,
    'teamId', v_binding.team_id,
    'projectId', v_binding.project_id,
    'operation', v_binding.operation,
    'leaseSequence', v_binding.lease_sequence,
    'leaseTokenSha256', v_binding.lease_token_sha256,
    'sourceSha256', v_binding.source_sha256,
    'pipelineJobId', v_binding.pipeline_job_id,
    'pipelineAttempt', v_binding.pipeline_attempt,
    'outputReceiptSha256', v_output_receipt_sha256,
    'durationMilliseconds',
      p_worker_evidence -> 'durationMilliseconds',
    'nativeUsage', p_worker_evidence -> 'nativeUsage',
    'settlementOutcome', v_settlement_outcome,
    'provider', p_worker_evidence -> 'provider',
    'model', p_worker_evidence -> 'model',
    'providerRateEvidenceSha256',
      p_worker_evidence -> 'providerRateEvidenceSha256',
    'providerReceiptSha256',
      p_worker_evidence -> 'providerReceiptSha256',
    'workerEvidenceSha256', v_evidence_sha256,
    'attestedAtEpochMicros',
      co_production_private.co_credit_epoch_microseconds(p_attested_at)
  );
  v_signed_payload_sha256 :=
    co_production_private.co_credit_sha256(v_signed_payload);

  -- The SQL-built payload, not a caller-provided payload hash, is HMACed before
  -- replay lookup. This prevents an unauthenticated caller from probing an
  -- existing receipt while allowing an exact authenticated replay to survive
  -- later lease expiry or terminal-state transitions.
  v_expected_hmac := extensions.hmac(
    pg_catalog.convert_to(v_signed_payload::text, 'UTF8'),
    v_worker_key.hmac_secret,
    'sha256'
  );
  v_provided_hmac := pg_catalog.decode(
    pg_catalog.substring(p_signature_hmac_sha256 FROM 13),
    'hex'
  );
  IF co_production_private.co_credit_constant_time_bytea_equal(
    v_expected_hmac,
    v_provided_hmac
  ) IS NOT TRUE THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'co_credit_worker_attestation_signature_invalid';
  END IF;

  SELECT attestation.*
  INTO v_existing
  FROM co_production.co_credit_worker_execution_attestations AS attestation
  WHERE attestation.worker_execution_id = p_worker_execution_id
    OR attestation.worker_lease_id = p_worker_lease_id
  ORDER BY attestation.attested_at, attestation.id
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.worker_binding_id IS DISTINCT FROM p_worker_binding_id
      OR v_existing.worker_execution_id IS DISTINCT FROM p_worker_execution_id
      OR v_existing.worker_key_id IS DISTINCT FROM v_binding.worker_key_id
      OR v_existing.worker_principal IS DISTINCT FROM
        v_binding.worker_principal
      OR v_existing.worker_key_fingerprint_sha256 IS DISTINCT FROM
        v_binding.worker_key_fingerprint_sha256
      OR v_existing.worker_lease_id IS DISTINCT FROM p_worker_lease_id
      OR v_existing.reservation_id IS DISTINCT FROM p_reservation_id
      OR v_existing.operation_execution_id IS DISTINCT FROM
        p_operation_execution_id
      OR v_existing.team_id IS DISTINCT FROM p_team_id
      OR v_existing.project_id IS DISTINCT FROM p_project_id
      OR v_existing.lease_sequence IS DISTINCT FROM p_lease_sequence
      OR v_existing.lease_token_sha256 IS DISTINCT FROM v_lease_token_sha256
      OR v_existing.worker_evidence_sha256 IS DISTINCT FROM v_evidence_sha256
      OR v_existing.output_receipt_sha256 IS DISTINCT FROM
        v_output_receipt_sha256
      OR v_existing.settlement_outcome IS DISTINCT FROM v_settlement_outcome
      OR v_existing.signed_payload_sha256 IS DISTINCT FROM
        v_signed_payload_sha256
      OR v_existing.signature_hmac_sha256 IS DISTINCT FROM
        p_signature_hmac_sha256
      OR v_existing.attested_at IS DISTINCT FROM p_attested_at
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'co_credit_worker_attestation_replay_conflict';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'workerAttestation', pg_catalog.to_jsonb(v_existing),
      'replayed', true,
      'paymentMutation', 'none'
    );
  END IF;

  -- Only a new attestation is subject to current lease, key, reservation, and
  -- terminal-state gates. The lifecycle lock serializes these checks with lease
  -- issuance, settlement, and release for this exact operation.
  v_now := pg_catalog.clock_timestamp();
  IF v_reservation.expires_at <= v_now
    OR v_lease.expires_at <= v_now
    OR v_worker_key.not_before > p_attested_at
    OR v_worker_key.not_after <= p_attested_at
    OR v_worker_key.not_before > v_now
    OR v_worker_key.not_after <= v_now
    OR p_attested_at < v_binding.registered_at
    OR p_attested_at < v_lease.issued_at
    OR p_attested_at < v_now - interval '5 minutes'
    OR p_attested_at > v_now + interval '30 seconds'
    OR EXISTS (
      SELECT 1
      FROM co_production.co_credit_worker_execution_leases AS newer
      WHERE newer.operation_execution_id = p_operation_execution_id
        AND newer.lease_sequence > v_lease.lease_sequence
    )
    OR EXISTS (
      SELECT 1
      FROM co_production.co_credit_terminal_receipts AS receipt
      WHERE receipt.reservation_id = v_reservation.id
        AND receipt.receipt_kind IN ('settled', 'released')
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'co_credit_worker_lease_fence_invalid';
  END IF;

  v_integrity_sha256 := co_production_private.co_credit_sha256(
    pg_catalog.jsonb_build_object(
      'schemaVersion', 'co-credit-worker-attestation.v2',
      'workerBindingId', p_worker_binding_id,
      'workerExecutionId', p_worker_execution_id,
      'workerKeyId', v_binding.worker_key_id,
      'workerPrincipal', v_binding.worker_principal,
      'workerKeyFingerprintSha256',
        v_binding.worker_key_fingerprint_sha256,
      'workerLeaseId', p_worker_lease_id,
      'reservationId', p_reservation_id,
      'operationExecutionId', p_operation_execution_id,
      'teamId', p_team_id,
      'projectId', p_project_id,
      'operation', v_reservation.operation,
      'settlementOutcome', v_settlement_outcome,
      'leaseSequence', p_lease_sequence,
      'leaseTokenSha256', v_lease_token_sha256,
      'sourceSha256', v_binding.source_sha256,
      'pipelineJobId', v_binding.pipeline_job_id,
      'pipelineAttempt', v_binding.pipeline_attempt,
      'outputReceiptSha256', v_output_receipt_sha256,
      'workerEvidenceSha256', v_evidence_sha256,
      'signedPayloadSha256', v_signed_payload_sha256,
      'signatureHmacSha256', p_signature_hmac_sha256,
      'attestedBy', v_attested_by,
      'actorPrincipal', v_actor_principal,
      'attestedAtEpochMicros',
        co_production_private.co_credit_epoch_microseconds(p_attested_at),
      'paymentMutation', 'none'
    )
  );

  v_now := pg_catalog.clock_timestamp();
  IF v_reservation.expires_at <= v_now
    OR v_lease.expires_at <= v_now
    OR v_worker_key.not_before > v_now
    OR v_worker_key.not_after <= v_now
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'co_credit_worker_attestation_mutation_recheck_failed';
  END IF;

  INSERT INTO co_production.co_credit_worker_execution_attestations (
    worker_binding_id,
    worker_execution_id,
    worker_key_id,
    worker_principal,
    worker_key_fingerprint_sha256,
    worker_lease_id,
    reservation_id,
    operation_execution_id,
    team_id,
    project_id,
    operation,
    settlement_outcome,
    lease_sequence,
    lease_token_sha256,
    source_sha256,
    pipeline_job_id,
    pipeline_attempt,
    output_receipt_sha256,
    worker_evidence,
    worker_evidence_sha256,
    signed_payload_sha256,
    signature_hmac_sha256,
    attested_by,
    actor_principal,
    attested_at,
    integrity_sha256
  ) VALUES (
    p_worker_binding_id,
    p_worker_execution_id,
    v_binding.worker_key_id,
    v_binding.worker_principal,
    v_binding.worker_key_fingerprint_sha256,
    p_worker_lease_id,
    p_reservation_id,
    p_operation_execution_id,
    p_team_id,
    p_project_id,
    v_reservation.operation,
    v_settlement_outcome,
    p_lease_sequence,
    v_lease_token_sha256,
    v_binding.source_sha256,
    v_binding.pipeline_job_id,
    v_binding.pipeline_attempt,
    v_output_receipt_sha256,
    p_worker_evidence,
    v_evidence_sha256,
    v_signed_payload_sha256,
    p_signature_hmac_sha256,
    v_attested_by,
    v_actor_principal,
    p_attested_at,
    v_integrity_sha256
  )
  RETURNING * INTO v_attestation;

  RETURN pg_catalog.jsonb_build_object(
    'workerAttestation', pg_catalog.to_jsonb(v_attestation),
    'replayed', false,
    'paymentMutation', 'none'
  );
END
$$;

CREATE OR REPLACE FUNCTION co_production.settle_co_credit(
  p_team_id uuid,
  p_project_id uuid,
  p_operation_execution_id uuid,
  p_reservation_id uuid,
  p_worker_attestation_id uuid,
  p_outcome text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_authoritative_team_id uuid;
  v_idempotency co_production.co_credit_idempotency_rows%ROWTYPE;
  v_reservation co_production.co_credit_reservations%ROWTYPE;
  v_quote co_production.co_credit_quotes%ROWTYPE;
  v_attestation
    co_production.co_credit_worker_execution_attestations%ROWTYPE;
  v_worker_lease co_production.co_credit_worker_execution_leases%ROWTYPE;
  v_worker_binding
    co_production.co_credit_worker_execution_bindings%ROWTYPE;
  v_worker_key
    co_production_private.co_credit_worker_signing_keys%ROWTYPE;
  v_catalog co_production.co_credit_rate_catalog_snapshots%ROWTYPE;
  v_pricing co_production.co_credit_pricing_terms_snapshots%ROWTYPE;
  v_tenant_grant co_production.co_credit_budget_grants%ROWTYPE;
  v_project_grant co_production.co_credit_budget_grants%ROWTYPE;
  v_current_tenant_grant co_production.co_credit_budget_grants%ROWTYPE;
  v_current_project_grant co_production.co_credit_budget_grants%ROWTYPE;
  v_current_tenant_entitlement
    co_production.co_credit_entitlement_states%ROWTYPE;
  v_current_project_entitlement
    co_production.co_credit_entitlement_states%ROWTYPE;
  v_existing_receipt co_production.co_credit_terminal_receipts%ROWTYPE;
  v_receipt co_production.co_credit_terminal_receipts%ROWTYPE;
  v_now timestamptz;
  v_signed_payload jsonb;
  v_expected_hmac bytea;
  v_provided_hmac bytea;
  v_evidence_sha256 text;
  v_worker_evidence jsonb;
  v_native_usage jsonb;
  v_duration_milliseconds bigint;
  v_pipeline_attempt integer;
  v_committed_co_units bigint;
  v_released_co_units bigint;
  v_tenant_reserved bigint;
  v_tenant_committed bigint;
  v_project_reserved bigint;
  v_project_committed bigint;
  v_integrity_sha256 text;
  v_request_fingerprint text;
  v_actor_user_id uuid := (SELECT auth.uid());
  v_actor_principal text :=
    co_production_private.co_credit_actor_principal();
BEGIN
  PERFORM co_production_private.require_co_credit_service_role();
  PERFORM co_production_private.assert_co_credit_operation_authority(
    'co_production.settle_co_credit(uuid,uuid,uuid,uuid,uuid,text,text)'
  );

  IF p_team_id IS NULL
    OR p_project_id IS NULL
    OR p_operation_execution_id IS NULL
    OR p_reservation_id IS NULL
    OR p_worker_attestation_id IS NULL
    OR p_idempotency_key IS NULL
    OR p_outcome IS NULL
    OR NOT co_production_private.co_credit_identifier_is_valid(
      p_idempotency_key,
      240
    )
    OR p_outcome NOT IN (
      'succeeded',
      'failed',
      'duplicate',
      'unusable_output',
      'safety_rejected',
      'cache_hit',
      'platform_retry'
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'co_credit_settlement_request_invalid';
  END IF;

  SELECT project.team_id
  INTO v_authoritative_team_id
  FROM co_production.projects AS project
  WHERE project.id = p_project_id
  FOR SHARE;

  IF v_authoritative_team_id IS NULL
    OR v_authoritative_team_id IS DISTINCT FROM p_team_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'co_credit_cross_tenant_scope_denied';
  END IF;

  PERFORM co_production_private.lock_co_credit_lifecycle_scope(
    p_team_id,
    p_project_id,
    p_operation_execution_id
  );
  v_now := pg_catalog.clock_timestamp();

  SELECT reservation.*
  INTO STRICT v_reservation
  FROM co_production.co_credit_reservations AS reservation
  WHERE reservation.id = p_reservation_id
  FOR UPDATE;

  IF v_reservation.team_id IS DISTINCT FROM p_team_id
    OR v_reservation.project_id IS DISTINCT FROM p_project_id
    OR v_reservation.operation_execution_id IS DISTINCT FROM
      p_operation_execution_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'co_credit_cross_tenant_scope_denied';
  END IF;

  SELECT attestation.*
  INTO STRICT v_attestation
  FROM co_production.co_credit_worker_execution_attestations AS attestation
  WHERE attestation.id = p_worker_attestation_id
    AND attestation.reservation_id = v_reservation.id
    AND attestation.operation_execution_id =
      v_reservation.operation_execution_id
    AND attestation.team_id = v_reservation.team_id
    AND attestation.project_id = v_reservation.project_id
    AND attestation.operation = v_reservation.operation
  FOR SHARE;

  IF v_attestation.settlement_outcome IS DISTINCT FROM p_outcome THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'co_credit_worker_attested_outcome_mismatch';
  END IF;

  SELECT lease.*
  INTO STRICT v_worker_lease
  FROM co_production.co_credit_worker_execution_leases AS lease
  WHERE lease.id = v_attestation.worker_lease_id
    AND lease.reservation_id = v_attestation.reservation_id
    AND lease.operation_execution_id = v_attestation.operation_execution_id
    AND lease.team_id = v_attestation.team_id
    AND lease.project_id = v_attestation.project_id
    AND lease.operation = v_attestation.operation
    AND lease.lease_sequence = v_attestation.lease_sequence
    AND lease.lease_token_sha256 = v_attestation.lease_token_sha256
    AND NOT EXISTS (
      SELECT 1
      FROM co_production.co_credit_worker_execution_leases AS newer
      WHERE newer.operation_execution_id = lease.operation_execution_id
        AND newer.lease_sequence > lease.lease_sequence
    )
  FOR SHARE;

  SELECT binding.*
  INTO STRICT v_worker_binding
  FROM co_production.co_credit_worker_execution_bindings AS binding
  WHERE binding.id = v_attestation.worker_binding_id
    AND binding.worker_execution_id = v_attestation.worker_execution_id
    AND binding.worker_key_id = v_attestation.worker_key_id
    AND binding.worker_principal = v_attestation.worker_principal
    AND binding.worker_key_fingerprint_sha256 =
      v_attestation.worker_key_fingerprint_sha256
    AND binding.worker_lease_id = v_attestation.worker_lease_id
    AND binding.reservation_id = v_attestation.reservation_id
    AND binding.operation_execution_id =
      v_attestation.operation_execution_id
    AND binding.team_id = v_attestation.team_id
    AND binding.project_id = v_attestation.project_id
    AND binding.operation = v_attestation.operation
    AND binding.lease_sequence = v_attestation.lease_sequence
    AND binding.lease_token_sha256 = v_attestation.lease_token_sha256
    AND binding.source_sha256 = v_attestation.source_sha256
    AND binding.pipeline_job_id = v_attestation.pipeline_job_id
    AND binding.pipeline_attempt = v_attestation.pipeline_attempt
  FOR SHARE;

  SELECT signing_key.*
  INTO STRICT v_worker_key
  FROM co_production_private.co_credit_worker_signing_keys AS signing_key
  WHERE signing_key.worker_key_id = v_attestation.worker_key_id
    AND signing_key.worker_principal = v_attestation.worker_principal
    AND signing_key.key_fingerprint_sha256 =
      v_attestation.worker_key_fingerprint_sha256
  FOR SHARE;

  v_signed_payload := pg_catalog.jsonb_build_object(
    'schemaVersion', 'co-credit-worker-receipt-signature.v1',
    'workerBindingId', v_attestation.worker_binding_id,
    'workerExecutionId', v_attestation.worker_execution_id,
    'workerKeyId', v_attestation.worker_key_id,
    'workerPrincipal', v_attestation.worker_principal,
    'workerKeyFingerprintSha256',
      v_attestation.worker_key_fingerprint_sha256,
    'workerLeaseId', v_attestation.worker_lease_id,
    'reservationId', v_attestation.reservation_id,
    'operationExecutionId', v_attestation.operation_execution_id,
    'teamId', v_attestation.team_id,
    'projectId', v_attestation.project_id,
    'operation', v_attestation.operation,
    'leaseSequence', v_attestation.lease_sequence,
    'leaseTokenSha256', v_attestation.lease_token_sha256,
    'sourceSha256', v_attestation.source_sha256,
    'pipelineJobId', v_attestation.pipeline_job_id,
    'pipelineAttempt', v_attestation.pipeline_attempt,
    'outputReceiptSha256', v_attestation.output_receipt_sha256,
    'durationMilliseconds',
      v_attestation.worker_evidence -> 'durationMilliseconds',
    'nativeUsage', v_attestation.worker_evidence -> 'nativeUsage',
    'settlementOutcome', v_attestation.settlement_outcome,
    'provider', v_attestation.worker_evidence -> 'provider',
    'model', v_attestation.worker_evidence -> 'model',
    'providerRateEvidenceSha256',
      v_attestation.worker_evidence -> 'providerRateEvidenceSha256',
    'providerReceiptSha256',
      v_attestation.worker_evidence -> 'providerReceiptSha256',
    'workerEvidenceSha256', v_attestation.worker_evidence_sha256,
    'attestedAtEpochMicros',
      co_production_private.co_credit_epoch_microseconds(
        v_attestation.attested_at
      )
  );
  v_expected_hmac := extensions.hmac(
    pg_catalog.convert_to(v_signed_payload::text, 'UTF8'),
    v_worker_key.hmac_secret,
    'sha256'
  );
  v_provided_hmac := pg_catalog.decode(
    pg_catalog.substring(v_attestation.signature_hmac_sha256 FROM 13),
    'hex'
  );

  IF co_production_private.co_credit_sha256(v_signed_payload) IS DISTINCT FROM
      v_attestation.signed_payload_sha256
    OR co_production_private.co_credit_constant_time_bytea_equal(
      v_expected_hmac,
      v_provided_hmac
    ) IS NOT TRUE
    OR v_attestation.attested_at < v_worker_lease.issued_at
    OR v_attestation.attested_at >= v_worker_lease.expires_at
    OR v_attestation.attested_at < v_worker_key.not_before
    OR v_attestation.attested_at >= v_worker_key.not_after
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'co_credit_registered_worker_signature_invalid';
  END IF;

  v_worker_evidence := v_attestation.worker_evidence;
  v_evidence_sha256 := v_attestation.worker_evidence_sha256;
  v_request_fingerprint := co_production_private.co_credit_sha256(
    pg_catalog.jsonb_build_object(
      'schemaVersion', 'co-credit-settle-request.v1',
      'teamId', p_team_id,
      'projectId', p_project_id,
      'operationExecutionId', p_operation_execution_id,
      'reservationId', p_reservation_id,
      'workerAttestationId', p_worker_attestation_id,
      'outcome', p_outcome,
      'workerEvidenceSha256', v_evidence_sha256
    )
  );

  SELECT idempotency.*
  INTO v_idempotency
  FROM co_production.co_credit_idempotency_rows AS idempotency
  WHERE idempotency.team_id = p_team_id
    AND idempotency.action = 'settle'
    AND idempotency.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_idempotency.request_sha256 IS DISTINCT FROM v_request_fingerprint
      OR v_idempotency.project_id IS DISTINCT FROM p_project_id
      OR v_idempotency.operation_execution_id IS DISTINCT FROM
        p_operation_execution_id
      OR v_idempotency.resource_type <> 'receipt'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'co_credit_idempotency_conflict';
    END IF;

    SELECT receipt.*
    INTO STRICT v_existing_receipt
    FROM co_production.co_credit_terminal_receipts AS receipt
    WHERE receipt.id = v_idempotency.resource_id;

    IF v_existing_receipt.team_id IS DISTINCT FROM p_team_id
      OR v_existing_receipt.project_id IS DISTINCT FROM p_project_id
      OR v_existing_receipt.operation_execution_id IS DISTINCT FROM
        p_operation_execution_id
      OR v_existing_receipt.reservation_id IS DISTINCT FROM p_reservation_id
      OR v_existing_receipt.receipt_kind <> 'settled'
      OR v_existing_receipt.outcome IS DISTINCT FROM p_outcome
      OR v_existing_receipt.worker_attestation_id IS DISTINCT FROM
        p_worker_attestation_id
      OR v_existing_receipt.worker_evidence_sha256 IS DISTINCT FROM
        v_evidence_sha256
      OR v_existing_receipt.request_sha256 IS DISTINCT FROM
        v_request_fingerprint
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'co_credit_settlement_replay_material_conflict';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'receipt', pg_catalog.to_jsonb(v_existing_receipt),
      'replayed', true,
      'paymentMutation', 'none'
    );
  END IF;

  SELECT quote.*
  INTO STRICT v_quote
  FROM co_production.co_credit_quotes AS quote
  WHERE quote.id = v_reservation.quote_id
    AND quote.operation_execution_id = v_reservation.operation_execution_id
    AND quote.team_id = v_reservation.team_id
    AND quote.project_id = v_reservation.project_id
  FOR SHARE;

  SELECT catalog.*
  INTO STRICT v_catalog
  FROM co_production.co_credit_rate_catalog_snapshots AS catalog
  WHERE catalog.id = v_reservation.rate_catalog_id
    AND catalog.catalog_version = v_reservation.rate_catalog_version
    AND catalog.catalog_sha256 = v_reservation.rate_catalog_sha256
    AND catalog.id = v_quote.rate_catalog_id
    AND catalog.catalog_version = v_quote.rate_catalog_version
    AND catalog.catalog_sha256 = v_quote.rate_catalog_sha256
  FOR SHARE;

  SELECT pricing.*
  INTO STRICT v_pricing
  FROM co_production.co_credit_pricing_terms_snapshots AS pricing
  WHERE pricing.id = v_reservation.pricing_terms_id
    AND pricing.pricing_version = v_reservation.pricing_version
    AND pricing.terms_sha256 = v_reservation.pricing_terms_sha256
    AND pricing.rate_catalog_id = v_catalog.id
    AND pricing.rate_catalog_version = v_catalog.catalog_version
    AND pricing.rate_catalog_sha256 = v_catalog.catalog_sha256
  FOR SHARE;

  SELECT grant_row.*
  INTO STRICT v_tenant_grant
  FROM co_production.co_credit_budget_grants AS grant_row
  WHERE grant_row.id = v_reservation.tenant_budget_grant_id
    AND grant_row.team_id = p_team_id
    AND grant_row.project_id IS NULL
    AND grant_row.budget_period_key =
      v_reservation.tenant_budget_period_key
    AND grant_row.grant_sha256 = v_reservation.tenant_budget_grant_sha256
  FOR UPDATE;

  SELECT grant_row.*
  INTO STRICT v_project_grant
  FROM co_production.co_credit_budget_grants AS grant_row
  WHERE grant_row.id = v_reservation.project_budget_grant_id
    AND grant_row.team_id = p_team_id
    AND grant_row.project_id = p_project_id
    AND grant_row.budget_period_key =
      v_reservation.project_budget_period_key
    AND grant_row.grant_sha256 = v_reservation.project_budget_grant_sha256
  FOR UPDATE;

  SELECT receipt.*
  INTO v_existing_receipt
  FROM co_production.co_credit_terminal_receipts AS receipt
  WHERE receipt.reservation_id = v_reservation.id
    AND receipt.receipt_kind IN ('settled', 'released')
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing_receipt.receipt_kind = 'settled'
      AND v_existing_receipt.outcome IS NOT DISTINCT FROM p_outcome
      AND v_existing_receipt.request_sha256 = v_request_fingerprint
      AND v_existing_receipt.worker_attestation_id = p_worker_attestation_id
      AND v_existing_receipt.worker_evidence_sha256 = v_evidence_sha256
    THEN
      PERFORM co_production_private.save_co_credit_idempotency(
        p_team_id,
        p_project_id,
        p_operation_execution_id,
        v_reservation.operation,
        'settle',
        p_idempotency_key,
        v_request_fingerprint,
        'receipt',
        v_existing_receipt.id
      );
      RETURN pg_catalog.jsonb_build_object(
        'receipt', pg_catalog.to_jsonb(v_existing_receipt),
        'replayed', true,
        'paymentMutation', 'none'
      );
    END IF;
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'co_credit_reservation_already_terminal';
  END IF;

  IF v_reservation.expires_at <= v_now THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'co_credit_reservation_expired';
  END IF;

  -- A reservation pins its commercial snapshots, but authorization is checked
  -- against the latest revision of each stable budget period at debit time.
  SELECT grant_row.*
  INTO STRICT v_current_tenant_grant
  FROM co_production.co_credit_budget_grants AS grant_row
  WHERE grant_row.team_id = p_team_id
    AND grant_row.budget_scope = 'tenant'
    AND grant_row.project_id IS NULL
    AND grant_row.budget_period_key =
      v_reservation.tenant_budget_period_key
    AND NOT EXISTS (
      SELECT 1
      FROM co_production.co_credit_budget_grants AS successor
      WHERE successor.team_id = grant_row.team_id
        AND successor.budget_scope = grant_row.budget_scope
        AND successor.project_id IS NOT DISTINCT FROM grant_row.project_id
        AND successor.budget_period_key = grant_row.budget_period_key
        AND successor.predecessor_grant_sha256 = grant_row.grant_sha256
    )
  FOR UPDATE;

  SELECT grant_row.*
  INTO STRICT v_current_project_grant
  FROM co_production.co_credit_budget_grants AS grant_row
  WHERE grant_row.team_id = p_team_id
    AND grant_row.budget_scope = 'project'
    AND grant_row.project_id = p_project_id
    AND grant_row.budget_period_key =
      v_reservation.project_budget_period_key
    AND NOT EXISTS (
      SELECT 1
      FROM co_production.co_credit_budget_grants AS successor
      WHERE successor.team_id = grant_row.team_id
        AND successor.budget_scope = grant_row.budget_scope
        AND successor.project_id IS NOT DISTINCT FROM grant_row.project_id
        AND successor.budget_period_key = grant_row.budget_period_key
        AND successor.predecessor_grant_sha256 = grant_row.grant_sha256
    )
  FOR UPDATE;

  SELECT state.*
  INTO STRICT v_current_tenant_entitlement
  FROM co_production.co_credit_entitlement_states AS state
  WHERE state.budget_grant_id = v_current_tenant_grant.id
  ORDER BY state.entitlement_sequence DESC
  LIMIT 1
  FOR SHARE;

  SELECT state.*
  INTO STRICT v_current_project_entitlement
  FROM co_production.co_credit_entitlement_states AS state
  WHERE state.budget_grant_id = v_current_project_grant.id
  ORDER BY state.entitlement_sequence DESC
  LIMIT 1
  FOR SHARE;

  IF v_current_tenant_entitlement.entitlement_status <> 'active'
    OR v_current_project_entitlement.entitlement_status <> 'active'
    OR (
      NOT v_reservation.operation = ANY(
        v_current_tenant_entitlement.allowed_operations
      )
      AND NOT v_current_tenant_entitlement.settlement_grandfathered
    )
    OR (
      NOT v_reservation.operation = ANY(
        v_current_project_entitlement.allowed_operations
      )
      AND NOT v_current_project_entitlement.settlement_grandfathered
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'co_credit_settlement_entitlement_denied';
  END IF;

  IF p_outcome NOT IN (
    'succeeded',
    'failed',
    'duplicate',
    'unusable_output',
    'safety_rejected',
    'cache_hit',
    'platform_retry'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'co_credit_settlement_outcome_invalid';
  END IF;

  IF v_worker_evidence IS NULL
    OR pg_catalog.jsonb_typeof(v_worker_evidence) <> 'object'
    OR pg_catalog.pg_column_size(v_worker_evidence) > 32768
    OR co_production_private.co_credit_commercial_json_is_safe(
      v_worker_evidence
    ) IS NOT TRUE
    OR co_production_private.co_credit_sha256(v_worker_evidence)
      IS DISTINCT FROM v_evidence_sha256
    OR v_worker_evidence ->> 'outputReceiptSha256' IS DISTINCT FROM
      v_attestation.output_receipt_sha256
    OR v_worker_evidence ->> 'settlementOutcome' IS DISTINCT FROM p_outcome
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'co_credit_registered_worker_attestation_invalid';
  END IF;

  IF v_reservation.operation = 'new_transcode' THEN
    IF NOT v_worker_evidence ?& ARRAY[
        'sourceSha256',
        'pipelineJobId',
        'pipelineAttempt',
        'outputReceiptSha256',
        'durationMilliseconds',
        'nativeUsage',
        'settlementOutcome'
      ]
      OR v_worker_evidence - ARRAY[
        'sourceSha256',
        'pipelineJobId',
        'pipelineAttempt',
        'outputReceiptSha256',
        'durationMilliseconds',
        'nativeUsage',
        'settlementOutcome',
        'provider',
        'model',
        'providerRateEvidenceSha256',
        'providerReceiptSha256'
      ] IS DISTINCT FROM '{}'::jsonb
      OR co_production_private.co_credit_hash_is_valid(
        v_worker_evidence ->> 'sourceSha256'
      ) IS NOT TRUE
      OR co_production_private.co_credit_identifier_is_valid(
        v_worker_evidence ->> 'pipelineJobId',
        200
      ) IS NOT TRUE
      OR co_production_private.co_credit_hash_is_valid(
        v_worker_evidence ->> 'outputReceiptSha256'
      ) IS NOT TRUE
      OR pg_catalog.jsonb_typeof(v_worker_evidence -> 'pipelineAttempt')
        <> 'number'
      OR pg_catalog.jsonb_typeof(v_worker_evidence -> 'durationMilliseconds')
        <> 'number'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'co_credit_trusted_worker_evidence_required';
    END IF;

    BEGIN
      v_pipeline_attempt := (v_worker_evidence ->> 'pipelineAttempt')::integer;
      v_duration_milliseconds :=
        (v_worker_evidence ->> 'durationMilliseconds')::bigint;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'co_credit_trusted_worker_evidence_invalid';
    END;

    v_native_usage := v_worker_evidence -> 'nativeUsage';
    IF v_pipeline_attempt <= 0
      OR v_duration_milliseconds < 0
      OR pg_catalog.jsonb_typeof(v_native_usage) <> 'object'
      OR NOT v_native_usage ? 'transcoded_media_milliseconds'
      OR v_native_usage - ARRAY['transcoded_media_milliseconds']
        IS DISTINCT FROM '{}'::jsonb
      OR pg_catalog.jsonb_typeof(
        v_native_usage -> 'transcoded_media_milliseconds'
      ) <> 'number'
      OR (v_native_usage ->> 'transcoded_media_milliseconds')::numeric
        IS DISTINCT FROM v_duration_milliseconds::numeric
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'co_credit_transcode_native_usage_mismatch';
    END IF;

    IF v_worker_evidence ?| ARRAY[
      'provider',
      'model',
      'providerRateEvidenceSha256',
      'providerReceiptSha256'
    ] THEN
      IF NOT v_worker_evidence ?& ARRAY[
        'provider',
        'model',
        'providerRateEvidenceSha256',
        'providerReceiptSha256'
      ]
        OR co_production_private.co_credit_identifier_is_valid(
          v_worker_evidence ->> 'provider',
          120
        ) IS NOT TRUE
        OR co_production_private.co_credit_identifier_is_valid(
          v_worker_evidence ->> 'model',
          160
        ) IS NOT TRUE
        OR co_production_private.co_credit_hash_is_valid(
          v_worker_evidence ->> 'providerRateEvidenceSha256'
        ) IS NOT TRUE
        OR co_production_private.co_credit_hash_is_valid(
          v_worker_evidence ->> 'providerReceiptSha256'
        ) IS NOT TRUE
      THEN
        RAISE EXCEPTION USING
          ERRCODE = '22023',
          MESSAGE = 'co_credit_provider_evidence_incomplete';
      END IF;
    END IF;
  ELSE
    IF NOT v_worker_evidence ? 'nativeUsage'
      OR pg_catalog.jsonb_typeof(v_worker_evidence -> 'nativeUsage')
        <> 'object'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'co_credit_trusted_worker_evidence_required';
    END IF;
    v_native_usage := v_worker_evidence -> 'nativeUsage';
  END IF;

  v_committed_co_units := CASE
    WHEN p_outcome = 'succeeded' THEN
      co_production_private.co_credit_calculate_units(
        v_catalog.catalog,
        v_reservation.operation,
        v_native_usage
      )
    ELSE 0
  END;

  IF v_committed_co_units > v_reservation.reserved_co_units THEN
    RAISE EXCEPTION USING
      ERRCODE = '22003',
      MESSAGE = 'co_credit_settlement_exceeds_reservation';
  END IF;
  v_released_co_units :=
    v_reservation.reserved_co_units - v_committed_co_units;

  SELECT
    pg_catalog.coalesce(pg_catalog.sum(
      CASE
        WHEN event.event_kind = 'reservation_hold'
          AND balance_reservation.expires_at <= v_now
          AND NOT EXISTS (
            SELECT 1
            FROM co_production.co_credit_terminal_receipts AS terminal
            WHERE terminal.reservation_id = balance_reservation.id
              AND terminal.receipt_kind IN ('settled', 'released')
          )
        THEN 0
        ELSE event.reserved_delta_co_units
      END
    ), 0),
    pg_catalog.coalesce(pg_catalog.sum(event.committed_delta_co_units), 0)
  INTO v_tenant_reserved, v_tenant_committed
  FROM co_production.co_credit_ledger_events AS event
  JOIN co_production.co_credit_reservations AS balance_reservation
    ON balance_reservation.id = event.reservation_id
  WHERE event.team_id = p_team_id
    AND event.tenant_budget_period_key =
    v_reservation.tenant_budget_period_key;

  SELECT
    pg_catalog.coalesce(pg_catalog.sum(
      CASE
        WHEN event.event_kind = 'reservation_hold'
          AND balance_reservation.expires_at <= v_now
          AND NOT EXISTS (
            SELECT 1
            FROM co_production.co_credit_terminal_receipts AS terminal
            WHERE terminal.reservation_id = balance_reservation.id
              AND terminal.receipt_kind IN ('settled', 'released')
          )
        THEN 0
        ELSE event.reserved_delta_co_units
      END
    ), 0),
    pg_catalog.coalesce(pg_catalog.sum(event.committed_delta_co_units), 0)
  INTO v_project_reserved, v_project_committed
  FROM co_production.co_credit_ledger_events AS event
  JOIN co_production.co_credit_reservations AS balance_reservation
    ON balance_reservation.id = event.reservation_id
  WHERE event.team_id = p_team_id
    AND event.project_id = p_project_id
    AND event.project_budget_period_key =
    v_reservation.project_budget_period_key;

  IF v_tenant_reserved < v_reservation.reserved_co_units
    OR v_project_reserved < v_reservation.reserved_co_units
    OR v_tenant_reserved - v_reservation.reserved_co_units
      + v_tenant_committed + v_committed_co_units
      > v_current_tenant_grant.effective_limit_co_units
    OR v_project_reserved - v_reservation.reserved_co_units
      + v_project_committed + v_committed_co_units
      > v_current_project_grant.effective_limit_co_units
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22003',
      MESSAGE = 'co_credit_budget_cap_exceeded';
  END IF;

  v_now := pg_catalog.clock_timestamp();
  IF v_reservation.expires_at <= v_now
    OR v_tenant_grant.period_end <= v_now
    OR v_project_grant.period_end <= v_now
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'co_credit_settlement_clock_recheck_failed';
  END IF;

  v_receipt.id := pg_catalog.gen_random_uuid();
  v_receipt.reservation_id := v_reservation.id;
  v_receipt.operation_execution_id := p_operation_execution_id;
  v_receipt.team_id := p_team_id;
  v_receipt.project_id := p_project_id;
  v_receipt.operation := v_reservation.operation;
  v_receipt.receipt_kind := 'settled';
  v_receipt.outcome := p_outcome;
  v_receipt.reserved_co_units := v_reservation.reserved_co_units;
  v_receipt.committed_co_units := v_committed_co_units;
  v_receipt.released_co_units := v_released_co_units;
  v_receipt.compensated_co_units := 0;
  v_receipt.source_sha256 := v_worker_evidence ->> 'sourceSha256';
  v_receipt.pipeline_job_id := v_worker_evidence ->> 'pipelineJobId';
  v_receipt.pipeline_attempt := v_pipeline_attempt;
  v_receipt.output_receipt_sha256 :=
    v_worker_evidence ->> 'outputReceiptSha256';
  v_receipt.duration_milliseconds := v_duration_milliseconds;
  v_receipt.native_usage := v_native_usage;
  v_receipt.worker_attestation_id := v_attestation.id;
  v_receipt.provider_name := v_worker_evidence ->> 'provider';
  v_receipt.provider_model := v_worker_evidence ->> 'model';
  v_receipt.provider_rate_evidence_sha256 :=
    v_worker_evidence ->> 'providerRateEvidenceSha256';
  v_receipt.provider_receipt_sha256 :=
    v_worker_evidence ->> 'providerReceiptSha256';
  v_receipt.worker_evidence_sha256 := v_evidence_sha256;
  v_receipt.worker_evidence := v_worker_evidence;
  v_receipt.reason_code := CASE
    WHEN p_outcome = 'succeeded' THEN NULL
    ELSE 'non_billable_' || p_outcome
  END;
  v_receipt.rate_catalog_id := v_catalog.id;
  v_receipt.rate_catalog_version := v_catalog.catalog_version;
  v_receipt.rate_catalog_sha256 := v_catalog.catalog_sha256;
  v_receipt.pricing_terms_id := v_pricing.id;
  v_receipt.pricing_version := v_pricing.pricing_version;
  v_receipt.pricing_terms_sha256 := v_pricing.terms_sha256;
  v_receipt.tenant_budget_grant_id := v_tenant_grant.id;
  v_receipt.tenant_budget_grant_sha256 := v_tenant_grant.grant_sha256;
  v_receipt.tenant_budget_period_key := v_tenant_grant.budget_period_key;
  v_receipt.project_budget_grant_id := v_project_grant.id;
  v_receipt.project_budget_grant_sha256 := v_project_grant.grant_sha256;
  v_receipt.project_budget_period_key := v_project_grant.budget_period_key;
  v_receipt.actor_user_id := v_actor_user_id;
  v_receipt.actor_principal := v_actor_principal;
  v_receipt.idempotency_key := p_idempotency_key;
  v_receipt.request_sha256 := v_request_fingerprint;
  v_receipt.occurred_at := v_now;
  v_receipt.payment_mutation := 'none';
  v_integrity_sha256 := co_production_private.co_credit_sha256(
    pg_catalog.jsonb_build_object(
      'schemaVersion', 'co-credit-terminal-receipt.v1',
      'reservationId', v_receipt.reservation_id,
      'settlementReceiptId', NULL,
      'operationExecutionId', v_receipt.operation_execution_id,
      'teamId', v_receipt.team_id,
      'projectId', v_receipt.project_id,
      'operation', v_receipt.operation,
      'receiptKind', v_receipt.receipt_kind,
      'outcome', v_receipt.outcome,
      'reservedCoUnits', v_receipt.reserved_co_units,
      'committedCoUnits', v_receipt.committed_co_units,
      'releasedCoUnits', v_receipt.released_co_units,
      'compensatedCoUnits', 0,
      'workerAttestationId', v_receipt.worker_attestation_id,
      'workerEvidenceSha256', v_receipt.worker_evidence_sha256,
      'reasonCode', v_receipt.reason_code,
      'rateCatalogId', v_receipt.rate_catalog_id,
      'rateCatalogVersion', v_receipt.rate_catalog_version,
      'rateCatalogSha256', v_receipt.rate_catalog_sha256,
      'pricingTermsId', v_receipt.pricing_terms_id,
      'pricingVersion', v_receipt.pricing_version,
      'pricingTermsSha256', v_receipt.pricing_terms_sha256,
      'tenantBudgetGrantId', v_receipt.tenant_budget_grant_id,
      'tenantBudgetGrantSha256', v_receipt.tenant_budget_grant_sha256,
      'tenantBudgetPeriodKey', v_receipt.tenant_budget_period_key,
      'projectBudgetGrantId', v_receipt.project_budget_grant_id,
      'projectBudgetGrantSha256', v_receipt.project_budget_grant_sha256,
      'projectBudgetPeriodKey', v_receipt.project_budget_period_key,
      'actorUserId', v_receipt.actor_user_id,
      'actorPrincipal', v_receipt.actor_principal,
      'idempotencyKey', v_receipt.idempotency_key,
      'requestSha256', v_receipt.request_sha256,
      'occurredAtEpochMicros',
        co_production_private.co_credit_epoch_microseconds(
          v_receipt.occurred_at
        ),
      'paymentMutation', 'none'
    )
  );

  INSERT INTO co_production.co_credit_terminal_receipts (
    id,
    reservation_id,
    operation_execution_id,
    team_id,
    project_id,
    operation,
    receipt_kind,
    outcome,
    reserved_co_units,
    committed_co_units,
    released_co_units,
    compensated_co_units,
    source_sha256,
    pipeline_job_id,
    pipeline_attempt,
    output_receipt_sha256,
    duration_milliseconds,
    native_usage,
    worker_attestation_id,
    provider_name,
    provider_model,
    provider_rate_evidence_sha256,
    provider_receipt_sha256,
    worker_evidence_sha256,
    worker_evidence,
    reason_code,
    rate_catalog_id,
    rate_catalog_version,
    rate_catalog_sha256,
    pricing_terms_id,
    pricing_version,
    pricing_terms_sha256,
    tenant_budget_grant_id,
    tenant_budget_grant_sha256,
    tenant_budget_period_key,
    project_budget_grant_id,
    project_budget_grant_sha256,
    project_budget_period_key,
    actor_user_id,
    actor_principal,
    idempotency_key,
    request_sha256,
    occurred_at,
    integrity_sha256
  ) VALUES (
    v_receipt.id,
    v_receipt.reservation_id,
    v_receipt.operation_execution_id,
    v_receipt.team_id,
    v_receipt.project_id,
    v_receipt.operation,
    v_receipt.receipt_kind,
    v_receipt.outcome,
    v_receipt.reserved_co_units,
    v_receipt.committed_co_units,
    v_receipt.released_co_units,
    v_receipt.compensated_co_units,
    v_receipt.source_sha256,
    v_receipt.pipeline_job_id,
    v_receipt.pipeline_attempt,
    v_receipt.output_receipt_sha256,
    v_receipt.duration_milliseconds,
    v_receipt.native_usage,
    v_receipt.worker_attestation_id,
    v_receipt.provider_name,
    v_receipt.provider_model,
    v_receipt.provider_rate_evidence_sha256,
    v_receipt.provider_receipt_sha256,
    v_receipt.worker_evidence_sha256,
    v_receipt.worker_evidence,
    v_receipt.reason_code,
    v_receipt.rate_catalog_id,
    v_receipt.rate_catalog_version,
    v_receipt.rate_catalog_sha256,
    v_receipt.pricing_terms_id,
    v_receipt.pricing_version,
    v_receipt.pricing_terms_sha256,
    v_receipt.tenant_budget_grant_id,
    v_receipt.tenant_budget_grant_sha256,
    v_receipt.tenant_budget_period_key,
    v_receipt.project_budget_grant_id,
    v_receipt.project_budget_grant_sha256,
    v_receipt.project_budget_period_key,
    v_receipt.actor_user_id,
    v_receipt.actor_principal,
    v_receipt.idempotency_key,
    v_receipt.request_sha256,
    v_receipt.occurred_at,
    v_integrity_sha256
  )
  RETURNING * INTO v_receipt;

  PERFORM co_production_private.append_co_credit_ledger_event(
    p_team_id,
    p_project_id,
    p_operation_execution_id,
    v_reservation.operation,
    v_quote.id,
    v_reservation.id,
    v_receipt.id,
    v_tenant_grant.id,
    v_tenant_grant.budget_period_key,
    v_project_grant.id,
    v_project_grant.budget_period_key,
    'settlement_debit',
    -v_reservation.reserved_co_units,
    v_committed_co_units,
    v_catalog.id,
    v_catalog.catalog_version,
    v_catalog.catalog_sha256,
    v_pricing.id,
    v_pricing.pricing_version,
    v_pricing.terms_sha256,
    p_idempotency_key,
    pg_catalog.jsonb_build_object(
      'outcome', p_outcome,
      'workerEvidenceSha256', v_evidence_sha256,
      'releasedCoUnits', v_released_co_units
    )
  );

  PERFORM co_production_private.save_co_credit_idempotency(
    p_team_id,
    p_project_id,
    p_operation_execution_id,
    v_reservation.operation,
    'settle',
    p_idempotency_key,
    v_request_fingerprint,
    'receipt',
    v_receipt.id
  );

  RETURN pg_catalog.jsonb_build_object(
    'receipt', pg_catalog.to_jsonb(v_receipt),
    'replayed', false,
    'paymentMutation', 'none'
  );
END
$$;

CREATE OR REPLACE FUNCTION co_production.release_co_credit(
  p_team_id uuid,
  p_project_id uuid,
  p_operation_execution_id uuid,
  p_reservation_id uuid,
  p_reason_code text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_authoritative_team_id uuid;
  v_idempotency co_production.co_credit_idempotency_rows%ROWTYPE;
  v_reservation co_production.co_credit_reservations%ROWTYPE;
  v_existing_receipt co_production.co_credit_terminal_receipts%ROWTYPE;
  v_receipt co_production.co_credit_terminal_receipts%ROWTYPE;
  v_tenant_grant co_production.co_credit_budget_grants%ROWTYPE;
  v_project_grant co_production.co_credit_budget_grants%ROWTYPE;
  v_now timestamptz;
  v_request_fingerprint text;
  v_integrity_sha256 text;
  v_actor_user_id uuid := (SELECT auth.uid());
  v_actor_principal text :=
    co_production_private.co_credit_actor_principal();
BEGIN
  PERFORM co_production_private.require_co_credit_service_role();
  PERFORM co_production_private.assert_co_credit_operation_authority(
    'co_production.release_co_credit(uuid,uuid,uuid,uuid,text,text)'
  );

  IF p_team_id IS NULL
    OR p_project_id IS NULL
    OR p_operation_execution_id IS NULL
    OR p_reservation_id IS NULL
    OR p_reason_code IS NULL
    OR p_idempotency_key IS NULL
    OR NOT co_production_private.co_credit_identifier_is_valid(
      p_reason_code,
      160
    )
    OR NOT co_production_private.co_credit_identifier_is_valid(
      p_idempotency_key,
      240
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'co_credit_release_request_invalid';
  END IF;

  v_request_fingerprint := co_production_private.co_credit_sha256(
    pg_catalog.jsonb_build_object(
      'schemaVersion', 'co-credit-release-request.v1',
      'teamId', p_team_id,
      'projectId', p_project_id,
      'operationExecutionId', p_operation_execution_id,
      'reservationId', p_reservation_id,
      'reasonCode', p_reason_code
    )
  );

  SELECT project.team_id
  INTO v_authoritative_team_id
  FROM co_production.projects AS project
  WHERE project.id = p_project_id
  FOR SHARE;

  IF v_authoritative_team_id IS NULL
    OR v_authoritative_team_id IS DISTINCT FROM p_team_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'co_credit_cross_tenant_scope_denied';
  END IF;

  PERFORM co_production_private.lock_co_credit_lifecycle_scope(
    p_team_id,
    p_project_id,
    p_operation_execution_id
  );

  SELECT idempotency.*
  INTO v_idempotency
  FROM co_production.co_credit_idempotency_rows AS idempotency
  WHERE idempotency.team_id = p_team_id
    AND idempotency.action = 'release'
    AND idempotency.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_idempotency.request_sha256 IS DISTINCT FROM v_request_fingerprint
      OR v_idempotency.project_id IS DISTINCT FROM p_project_id
      OR v_idempotency.operation_execution_id IS DISTINCT FROM
        p_operation_execution_id
      OR v_idempotency.resource_type <> 'receipt'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'co_credit_idempotency_conflict';
    END IF;
    SELECT receipt.*
    INTO STRICT v_existing_receipt
    FROM co_production.co_credit_terminal_receipts AS receipt
    WHERE receipt.id = v_idempotency.resource_id;
    IF v_existing_receipt.team_id IS DISTINCT FROM p_team_id
      OR v_existing_receipt.project_id IS DISTINCT FROM p_project_id
      OR v_existing_receipt.operation_execution_id IS DISTINCT FROM
        p_operation_execution_id
      OR v_existing_receipt.receipt_kind <> 'released'
      OR v_existing_receipt.reservation_id IS DISTINCT FROM p_reservation_id
      OR v_existing_receipt.reason_code IS DISTINCT FROM p_reason_code
      OR v_existing_receipt.request_sha256 IS DISTINCT FROM
        v_request_fingerprint
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'co_credit_idempotency_conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'receipt', pg_catalog.to_jsonb(v_existing_receipt),
      'replayed', true,
      'paymentMutation', 'none'
    );
  END IF;

  SELECT reservation.*
  INTO STRICT v_reservation
  FROM co_production.co_credit_reservations AS reservation
  WHERE reservation.id = p_reservation_id
  FOR UPDATE;

  IF v_reservation.team_id IS DISTINCT FROM p_team_id
    OR v_reservation.project_id IS DISTINCT FROM p_project_id
    OR v_reservation.operation_execution_id IS DISTINCT FROM
      p_operation_execution_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'co_credit_cross_tenant_scope_denied';
  END IF;

  SELECT grant_row.*
  INTO STRICT v_tenant_grant
  FROM co_production.co_credit_budget_grants AS grant_row
  WHERE grant_row.id = v_reservation.tenant_budget_grant_id
    AND grant_row.budget_period_key =
      v_reservation.tenant_budget_period_key
    AND grant_row.team_id = p_team_id
    AND grant_row.project_id IS NULL
    AND grant_row.grant_sha256 = v_reservation.tenant_budget_grant_sha256
  FOR UPDATE;

  SELECT grant_row.*
  INTO STRICT v_project_grant
  FROM co_production.co_credit_budget_grants AS grant_row
  WHERE grant_row.id = v_reservation.project_budget_grant_id
    AND grant_row.budget_period_key =
      v_reservation.project_budget_period_key
    AND grant_row.team_id = p_team_id
    AND grant_row.project_id = p_project_id
    AND grant_row.grant_sha256 = v_reservation.project_budget_grant_sha256
  FOR UPDATE;

  SELECT receipt.*
  INTO v_existing_receipt
  FROM co_production.co_credit_terminal_receipts AS receipt
  WHERE receipt.reservation_id = v_reservation.id
    AND receipt.receipt_kind IN ('settled', 'released')
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing_receipt.receipt_kind = 'released'
      AND v_existing_receipt.reason_code = p_reason_code
      AND v_existing_receipt.request_sha256 = v_request_fingerprint
    THEN
      PERFORM co_production_private.save_co_credit_idempotency(
        p_team_id,
        p_project_id,
        p_operation_execution_id,
        v_reservation.operation,
        'release',
        p_idempotency_key,
        v_request_fingerprint,
        'receipt',
        v_existing_receipt.id
      );
      RETURN pg_catalog.jsonb_build_object(
        'receipt', pg_catalog.to_jsonb(v_existing_receipt),
        'replayed', true,
        'paymentMutation', 'none'
      );
    END IF;
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'co_credit_reservation_already_terminal';
  END IF;

  v_now := pg_catalog.clock_timestamp();

  v_receipt.id := pg_catalog.gen_random_uuid();
  v_receipt.reservation_id := v_reservation.id;
  v_receipt.operation_execution_id := p_operation_execution_id;
  v_receipt.team_id := p_team_id;
  v_receipt.project_id := p_project_id;
  v_receipt.operation := v_reservation.operation;
  v_receipt.receipt_kind := 'released';
  v_receipt.outcome := 'released';
  v_receipt.reserved_co_units := v_reservation.reserved_co_units;
  v_receipt.committed_co_units := 0;
  v_receipt.released_co_units := v_reservation.reserved_co_units;
  v_receipt.compensated_co_units := 0;
  v_receipt.reason_code := p_reason_code;
  v_receipt.rate_catalog_id := v_reservation.rate_catalog_id;
  v_receipt.rate_catalog_version := v_reservation.rate_catalog_version;
  v_receipt.rate_catalog_sha256 := v_reservation.rate_catalog_sha256;
  v_receipt.pricing_terms_id := v_reservation.pricing_terms_id;
  v_receipt.pricing_version := v_reservation.pricing_version;
  v_receipt.pricing_terms_sha256 := v_reservation.pricing_terms_sha256;
  v_receipt.tenant_budget_grant_id := v_tenant_grant.id;
  v_receipt.tenant_budget_grant_sha256 := v_tenant_grant.grant_sha256;
  v_receipt.tenant_budget_period_key := v_tenant_grant.budget_period_key;
  v_receipt.project_budget_grant_id := v_project_grant.id;
  v_receipt.project_budget_grant_sha256 := v_project_grant.grant_sha256;
  v_receipt.project_budget_period_key := v_project_grant.budget_period_key;
  v_receipt.actor_user_id := v_actor_user_id;
  v_receipt.actor_principal := v_actor_principal;
  v_receipt.idempotency_key := p_idempotency_key;
  v_receipt.request_sha256 := v_request_fingerprint;
  v_receipt.occurred_at := v_now;
  v_receipt.payment_mutation := 'none';
  v_integrity_sha256 := co_production_private.co_credit_sha256(
    pg_catalog.jsonb_build_object(
      'schemaVersion', 'co-credit-terminal-receipt.v1',
      'reservationId', v_receipt.reservation_id,
      'settlementReceiptId', NULL,
      'operationExecutionId', v_receipt.operation_execution_id,
      'teamId', v_receipt.team_id,
      'projectId', v_receipt.project_id,
      'operation', v_receipt.operation,
      'receiptKind', 'released',
      'outcome', 'released',
      'reservedCoUnits', v_receipt.reserved_co_units,
      'committedCoUnits', 0,
      'releasedCoUnits', v_receipt.released_co_units,
      'compensatedCoUnits', 0,
      'workerAttestationId', NULL,
      'workerEvidenceSha256', NULL,
      'reasonCode', v_receipt.reason_code,
      'rateCatalogId', v_receipt.rate_catalog_id,
      'rateCatalogVersion', v_receipt.rate_catalog_version,
      'rateCatalogSha256', v_receipt.rate_catalog_sha256,
      'pricingTermsId', v_receipt.pricing_terms_id,
      'pricingVersion', v_receipt.pricing_version,
      'pricingTermsSha256', v_receipt.pricing_terms_sha256,
      'tenantBudgetGrantId', v_receipt.tenant_budget_grant_id,
      'tenantBudgetGrantSha256', v_receipt.tenant_budget_grant_sha256,
      'tenantBudgetPeriodKey', v_receipt.tenant_budget_period_key,
      'projectBudgetGrantId', v_receipt.project_budget_grant_id,
      'projectBudgetGrantSha256', v_receipt.project_budget_grant_sha256,
      'projectBudgetPeriodKey', v_receipt.project_budget_period_key,
      'actorUserId', v_receipt.actor_user_id,
      'actorPrincipal', v_receipt.actor_principal,
      'idempotencyKey', v_receipt.idempotency_key,
      'requestSha256', v_receipt.request_sha256,
      'occurredAtEpochMicros',
        co_production_private.co_credit_epoch_microseconds(
          v_receipt.occurred_at
        ),
      'paymentMutation', 'none'
    )
  );

  INSERT INTO co_production.co_credit_terminal_receipts (
    id,
    reservation_id,
    operation_execution_id,
    team_id,
    project_id,
    operation,
    receipt_kind,
    outcome,
    reserved_co_units,
    committed_co_units,
    released_co_units,
    compensated_co_units,
    reason_code,
    rate_catalog_id,
    rate_catalog_version,
    rate_catalog_sha256,
    pricing_terms_id,
    pricing_version,
    pricing_terms_sha256,
    tenant_budget_grant_id,
    tenant_budget_grant_sha256,
    tenant_budget_period_key,
    project_budget_grant_id,
    project_budget_grant_sha256,
    project_budget_period_key,
    actor_user_id,
    actor_principal,
    idempotency_key,
    request_sha256,
    occurred_at,
    integrity_sha256
  ) VALUES (
    v_receipt.id,
    v_receipt.reservation_id,
    v_receipt.operation_execution_id,
    v_receipt.team_id,
    v_receipt.project_id,
    v_receipt.operation,
    'released',
    'released',
    v_receipt.reserved_co_units,
    0,
    v_receipt.released_co_units,
    0,
    v_receipt.reason_code,
    v_receipt.rate_catalog_id,
    v_receipt.rate_catalog_version,
    v_receipt.rate_catalog_sha256,
    v_receipt.pricing_terms_id,
    v_receipt.pricing_version,
    v_receipt.pricing_terms_sha256,
    v_receipt.tenant_budget_grant_id,
    v_receipt.tenant_budget_grant_sha256,
    v_receipt.tenant_budget_period_key,
    v_receipt.project_budget_grant_id,
    v_receipt.project_budget_grant_sha256,
    v_receipt.project_budget_period_key,
    v_receipt.actor_user_id,
    v_receipt.actor_principal,
    v_receipt.idempotency_key,
    v_receipt.request_sha256,
    v_receipt.occurred_at,
    v_integrity_sha256
  )
  RETURNING * INTO v_receipt;

  PERFORM co_production_private.append_co_credit_ledger_event(
    p_team_id,
    p_project_id,
    p_operation_execution_id,
    v_reservation.operation,
    v_reservation.quote_id,
    v_reservation.id,
    v_receipt.id,
    v_tenant_grant.id,
    v_tenant_grant.budget_period_key,
    v_project_grant.id,
    v_project_grant.budget_period_key,
    'reservation_release',
    -v_reservation.reserved_co_units,
    0,
    v_reservation.rate_catalog_id,
    v_reservation.rate_catalog_version,
    v_reservation.rate_catalog_sha256,
    v_reservation.pricing_terms_id,
    v_reservation.pricing_version,
    v_reservation.pricing_terms_sha256,
    p_idempotency_key,
    pg_catalog.jsonb_build_object('reasonCode', p_reason_code)
  );

  PERFORM co_production_private.save_co_credit_idempotency(
    p_team_id,
    p_project_id,
    p_operation_execution_id,
    v_reservation.operation,
    'release',
    p_idempotency_key,
    v_request_fingerprint,
    'receipt',
    v_receipt.id
  );

  RETURN pg_catalog.jsonb_build_object(
    'receipt', pg_catalog.to_jsonb(v_receipt),
    'replayed', false,
    'paymentMutation', 'none'
  );
END
$$;

CREATE OR REPLACE FUNCTION
  co_production.reap_expired_co_credit_reservations(
    p_team_id uuid,
    p_limit integer DEFAULT 256
  )
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_candidate record;
  v_reaped_count integer := 0;
  v_remaining_count bigint;
  v_now timestamptz;
BEGIN
  PERFORM co_production_private.require_co_credit_service_role();
  PERFORM co_production_private.assert_co_credit_operation_authority(
    'co_production.reap_expired_co_credit_reservations(uuid,integer)'
  );

  IF p_team_id IS NULL
    OR p_limit IS NULL
    OR p_limit NOT BETWEEN 1 AND 1000
    OR NOT EXISTS (
      SELECT 1
      FROM co_production.teams AS team
      WHERE team.id = p_team_id
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'co_credit_expiry_reaper_request_invalid';
  END IF;

  -- The reaper owns only the tenant prefix while enumerating. Each nested
  -- release then takes project and operation locks in universal order; no
  -- transaction can hold an operation lock while waiting for this team lock.
  PERFORM co_production_private.lock_co_credit_budget_scope(
    p_team_id,
    NULL,
    'tenant'
  );
  v_now := pg_catalog.clock_timestamp();

  FOR v_candidate IN
    SELECT
      reservation.id,
      reservation.project_id,
      reservation.operation_execution_id
    FROM co_production.co_credit_reservations AS reservation
    WHERE reservation.team_id = p_team_id
      AND reservation.expires_at <= v_now
      AND NOT EXISTS (
        SELECT 1
        FROM co_production.co_credit_terminal_receipts AS receipt
        WHERE receipt.reservation_id = reservation.id
          AND receipt.receipt_kind IN ('settled', 'released')
      )
    ORDER BY reservation.expires_at, reservation.id
    LIMIT p_limit
  LOOP
    BEGIN
      PERFORM co_production.release_co_credit(
        p_team_id,
        v_candidate.project_id,
        v_candidate.operation_execution_id,
        v_candidate.id,
        'reservation_expired',
        'expiry-reaper:' || v_candidate.id::text
      );
      v_reaped_count := v_reaped_count + 1;
    EXCEPTION WHEN unique_violation THEN
      -- Suppress only a race that actually produced a terminal outcome.
      IF NOT EXISTS (
        SELECT 1
        FROM co_production.co_credit_terminal_receipts AS receipt
        WHERE receipt.reservation_id = v_candidate.id
          AND receipt.receipt_kind IN ('settled', 'released')
      ) THEN
        RAISE;
      END IF;
    END;
  END LOOP;

  v_now := pg_catalog.clock_timestamp();
  SELECT pg_catalog.count(*)
  INTO v_remaining_count
  FROM co_production.co_credit_reservations AS reservation
  WHERE reservation.team_id = p_team_id
    AND reservation.expires_at <= v_now
    AND NOT EXISTS (
      SELECT 1
      FROM co_production.co_credit_terminal_receipts AS receipt
      WHERE receipt.reservation_id = reservation.id
        AND receipt.receipt_kind IN ('settled', 'released')
    );

  RETURN pg_catalog.jsonb_build_object(
    'reapedCount', v_reaped_count,
    'remainingExpiredCount', v_remaining_count,
    'paymentMutation', 'none'
  );
END
$$;

CREATE OR REPLACE FUNCTION co_production.reverse_or_dispute_co_credit_settlement(
  p_team_id uuid,
  p_project_id uuid,
  p_operation_execution_id uuid,
  p_settlement_receipt_id uuid,
  p_action text,
  p_reason_code text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_authoritative_team_id uuid;
  v_idempotency co_production.co_credit_idempotency_rows%ROWTYPE;
  v_settlement co_production.co_credit_terminal_receipts%ROWTYPE;
  v_reservation co_production.co_credit_reservations%ROWTYPE;
  v_existing_compensation co_production.co_credit_terminal_receipts%ROWTYPE;
  v_receipt co_production.co_credit_terminal_receipts%ROWTYPE;
  v_tenant_grant co_production.co_credit_budget_grants%ROWTYPE;
  v_project_grant co_production.co_credit_budget_grants%ROWTYPE;
  v_now timestamptz;
  v_request_fingerprint text;
  v_integrity_sha256 text;
  v_actor_user_id uuid := (SELECT auth.uid());
  v_actor_principal text :=
    co_production_private.co_credit_actor_principal();
BEGIN
  PERFORM co_production_private.require_co_credit_service_role();
  PERFORM co_production_private.assert_co_credit_operation_authority(
    'co_production.reverse_or_dispute_co_credit_settlement(uuid,uuid,uuid,uuid,text,text,text)'
  );

  IF p_team_id IS NULL
    OR p_project_id IS NULL
    OR p_operation_execution_id IS NULL
    OR p_settlement_receipt_id IS NULL
    OR p_action IS NULL
    OR p_reason_code IS NULL
    OR p_idempotency_key IS NULL
    OR p_action NOT IN ('reversed', 'disputed')
    OR NOT co_production_private.co_credit_identifier_is_valid(
      p_reason_code,
      160
    )
    OR NOT co_production_private.co_credit_identifier_is_valid(
      p_idempotency_key,
      240
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'co_credit_compensation_request_invalid';
  END IF;

  v_request_fingerprint := co_production_private.co_credit_sha256(
    pg_catalog.jsonb_build_object(
      'schemaVersion', 'co-credit-compensation-request.v1',
      'teamId', p_team_id,
      'projectId', p_project_id,
      'operationExecutionId', p_operation_execution_id,
      'settlementReceiptId', p_settlement_receipt_id,
      'action', p_action,
      'reasonCode', p_reason_code
    )
  );

  SELECT project.team_id
  INTO v_authoritative_team_id
  FROM co_production.projects AS project
  WHERE project.id = p_project_id
  FOR SHARE;

  IF v_authoritative_team_id IS NULL
    OR v_authoritative_team_id IS DISTINCT FROM p_team_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'co_credit_cross_tenant_scope_denied';
  END IF;

  PERFORM co_production_private.lock_co_credit_lifecycle_scope(
    p_team_id,
    p_project_id,
    p_operation_execution_id
  );

  SELECT idempotency.*
  INTO v_idempotency
  FROM co_production.co_credit_idempotency_rows AS idempotency
  WHERE idempotency.team_id = p_team_id
    AND idempotency.action = 'reverse_or_dispute'
    AND idempotency.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_idempotency.request_sha256 IS DISTINCT FROM v_request_fingerprint
      OR v_idempotency.project_id IS DISTINCT FROM p_project_id
      OR v_idempotency.operation_execution_id IS DISTINCT FROM
        p_operation_execution_id
      OR v_idempotency.resource_type <> 'receipt'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'co_credit_idempotency_conflict';
    END IF;
    SELECT receipt.*
    INTO STRICT v_existing_compensation
    FROM co_production.co_credit_terminal_receipts AS receipt
    WHERE receipt.id = v_idempotency.resource_id;
    IF v_existing_compensation.team_id IS DISTINCT FROM p_team_id
      OR v_existing_compensation.project_id IS DISTINCT FROM p_project_id
      OR v_existing_compensation.operation_execution_id IS DISTINCT FROM
        p_operation_execution_id
      OR v_existing_compensation.receipt_kind IS DISTINCT FROM p_action
      OR v_existing_compensation.settlement_receipt_id IS DISTINCT FROM
        p_settlement_receipt_id
      OR v_existing_compensation.reason_code IS DISTINCT FROM p_reason_code
      OR v_existing_compensation.request_sha256 IS DISTINCT FROM
        v_request_fingerprint
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'co_credit_idempotency_conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'receipt', pg_catalog.to_jsonb(v_existing_compensation),
      'replayed', true,
      'paymentMutation', 'none'
    );
  END IF;

  SELECT receipt.*
  INTO STRICT v_settlement
  FROM co_production.co_credit_terminal_receipts AS receipt
  WHERE receipt.id = p_settlement_receipt_id
    AND receipt.receipt_kind = 'settled'
  FOR UPDATE;

  SELECT reservation.*
  INTO STRICT v_reservation
  FROM co_production.co_credit_reservations AS reservation
  WHERE reservation.id = v_settlement.reservation_id
  FOR UPDATE;

  IF v_settlement.team_id IS DISTINCT FROM p_team_id
    OR v_settlement.project_id IS DISTINCT FROM p_project_id
    OR v_settlement.operation_execution_id IS DISTINCT FROM
      p_operation_execution_id
    OR v_reservation.team_id IS DISTINCT FROM p_team_id
    OR v_reservation.project_id IS DISTINCT FROM p_project_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'co_credit_cross_tenant_scope_denied';
  END IF;

  SELECT grant_row.*
  INTO STRICT v_tenant_grant
  FROM co_production.co_credit_budget_grants AS grant_row
  WHERE grant_row.id = v_settlement.tenant_budget_grant_id
    AND grant_row.budget_period_key =
      v_settlement.tenant_budget_period_key
    AND grant_row.team_id = p_team_id
    AND grant_row.project_id IS NULL
    AND grant_row.grant_sha256 = v_settlement.tenant_budget_grant_sha256
  FOR UPDATE;

  SELECT grant_row.*
  INTO STRICT v_project_grant
  FROM co_production.co_credit_budget_grants AS grant_row
  WHERE grant_row.id = v_settlement.project_budget_grant_id
    AND grant_row.budget_period_key =
      v_settlement.project_budget_period_key
    AND grant_row.team_id = p_team_id
    AND grant_row.project_id = p_project_id
    AND grant_row.grant_sha256 = v_settlement.project_budget_grant_sha256
  FOR UPDATE;

  SELECT receipt.*
  INTO v_existing_compensation
  FROM co_production.co_credit_terminal_receipts AS receipt
  WHERE receipt.settlement_receipt_id = v_settlement.id
    AND receipt.receipt_kind IN ('reversed', 'disputed')
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing_compensation.receipt_kind = p_action
      AND v_existing_compensation.reason_code = p_reason_code
      AND v_existing_compensation.request_sha256 = v_request_fingerprint
    THEN
      PERFORM co_production_private.save_co_credit_idempotency(
        p_team_id,
        p_project_id,
        p_operation_execution_id,
        v_settlement.operation,
        'reverse_or_dispute',
        p_idempotency_key,
        v_request_fingerprint,
        'receipt',
        v_existing_compensation.id
      );
      RETURN pg_catalog.jsonb_build_object(
        'receipt', pg_catalog.to_jsonb(v_existing_compensation),
        'replayed', true,
        'paymentMutation', 'none'
      );
    END IF;
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'co_credit_settlement_already_compensated';
  END IF;

  IF v_settlement.committed_co_units <= 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'co_credit_zero_debit_cannot_be_compensated';
  END IF;

  v_now := pg_catalog.clock_timestamp();

  v_receipt.id := pg_catalog.gen_random_uuid();
  v_receipt.reservation_id := v_reservation.id;
  v_receipt.settlement_receipt_id := v_settlement.id;
  v_receipt.operation_execution_id := p_operation_execution_id;
  v_receipt.team_id := p_team_id;
  v_receipt.project_id := p_project_id;
  v_receipt.operation := v_settlement.operation;
  v_receipt.receipt_kind := p_action;
  v_receipt.outcome := p_action;
  v_receipt.reserved_co_units := v_settlement.reserved_co_units;
  v_receipt.committed_co_units := v_settlement.committed_co_units;
  v_receipt.released_co_units := v_settlement.released_co_units;
  v_receipt.compensated_co_units := v_settlement.committed_co_units;
  v_receipt.reason_code := p_reason_code;
  v_receipt.rate_catalog_id := v_settlement.rate_catalog_id;
  v_receipt.rate_catalog_version := v_settlement.rate_catalog_version;
  v_receipt.rate_catalog_sha256 := v_settlement.rate_catalog_sha256;
  v_receipt.pricing_terms_id := v_settlement.pricing_terms_id;
  v_receipt.pricing_version := v_settlement.pricing_version;
  v_receipt.pricing_terms_sha256 := v_settlement.pricing_terms_sha256;
  v_receipt.tenant_budget_grant_id := v_tenant_grant.id;
  v_receipt.tenant_budget_grant_sha256 := v_tenant_grant.grant_sha256;
  v_receipt.tenant_budget_period_key := v_tenant_grant.budget_period_key;
  v_receipt.project_budget_grant_id := v_project_grant.id;
  v_receipt.project_budget_grant_sha256 := v_project_grant.grant_sha256;
  v_receipt.project_budget_period_key := v_project_grant.budget_period_key;
  v_receipt.actor_user_id := v_actor_user_id;
  v_receipt.actor_principal := v_actor_principal;
  v_receipt.idempotency_key := p_idempotency_key;
  v_receipt.request_sha256 := v_request_fingerprint;
  v_receipt.occurred_at := v_now;
  v_receipt.payment_mutation := 'none';
  v_integrity_sha256 := co_production_private.co_credit_sha256(
    pg_catalog.jsonb_build_object(
      'schemaVersion', 'co-credit-terminal-receipt.v1',
      'reservationId', v_receipt.reservation_id,
      'settlementReceiptId', v_receipt.settlement_receipt_id,
      'operationExecutionId', v_receipt.operation_execution_id,
      'teamId', v_receipt.team_id,
      'projectId', v_receipt.project_id,
      'operation', v_receipt.operation,
      'receiptKind', v_receipt.receipt_kind,
      'outcome', v_receipt.outcome,
      'reservedCoUnits', v_receipt.reserved_co_units,
      'committedCoUnits', v_receipt.committed_co_units,
      'releasedCoUnits', v_receipt.released_co_units,
      'compensatedCoUnits', v_receipt.compensated_co_units,
      'workerAttestationId', NULL,
      'workerEvidenceSha256', NULL,
      'reasonCode', v_receipt.reason_code,
      'rateCatalogId', v_receipt.rate_catalog_id,
      'rateCatalogVersion', v_receipt.rate_catalog_version,
      'rateCatalogSha256', v_receipt.rate_catalog_sha256,
      'pricingTermsId', v_receipt.pricing_terms_id,
      'pricingVersion', v_receipt.pricing_version,
      'pricingTermsSha256', v_receipt.pricing_terms_sha256,
      'tenantBudgetGrantId', v_receipt.tenant_budget_grant_id,
      'tenantBudgetGrantSha256', v_receipt.tenant_budget_grant_sha256,
      'tenantBudgetPeriodKey', v_receipt.tenant_budget_period_key,
      'projectBudgetGrantId', v_receipt.project_budget_grant_id,
      'projectBudgetGrantSha256', v_receipt.project_budget_grant_sha256,
      'projectBudgetPeriodKey', v_receipt.project_budget_period_key,
      'actorUserId', v_receipt.actor_user_id,
      'actorPrincipal', v_receipt.actor_principal,
      'idempotencyKey', v_receipt.idempotency_key,
      'requestSha256', v_receipt.request_sha256,
      'occurredAtEpochMicros',
        co_production_private.co_credit_epoch_microseconds(
          v_receipt.occurred_at
        ),
      'paymentMutation', 'none'
    )
  );

  INSERT INTO co_production.co_credit_terminal_receipts (
    id,
    reservation_id,
    settlement_receipt_id,
    operation_execution_id,
    team_id,
    project_id,
    operation,
    receipt_kind,
    outcome,
    reserved_co_units,
    committed_co_units,
    released_co_units,
    compensated_co_units,
    reason_code,
    rate_catalog_id,
    rate_catalog_version,
    rate_catalog_sha256,
    pricing_terms_id,
    pricing_version,
    pricing_terms_sha256,
    tenant_budget_grant_id,
    tenant_budget_grant_sha256,
    tenant_budget_period_key,
    project_budget_grant_id,
    project_budget_grant_sha256,
    project_budget_period_key,
    actor_user_id,
    actor_principal,
    idempotency_key,
    request_sha256,
    occurred_at,
    integrity_sha256
  ) VALUES (
    v_receipt.id,
    v_receipt.reservation_id,
    v_receipt.settlement_receipt_id,
    v_receipt.operation_execution_id,
    v_receipt.team_id,
    v_receipt.project_id,
    v_receipt.operation,
    v_receipt.receipt_kind,
    v_receipt.outcome,
    v_receipt.reserved_co_units,
    v_receipt.committed_co_units,
    v_receipt.released_co_units,
    v_receipt.compensated_co_units,
    v_receipt.reason_code,
    v_receipt.rate_catalog_id,
    v_receipt.rate_catalog_version,
    v_receipt.rate_catalog_sha256,
    v_receipt.pricing_terms_id,
    v_receipt.pricing_version,
    v_receipt.pricing_terms_sha256,
    v_receipt.tenant_budget_grant_id,
    v_receipt.tenant_budget_grant_sha256,
    v_receipt.tenant_budget_period_key,
    v_receipt.project_budget_grant_id,
    v_receipt.project_budget_grant_sha256,
    v_receipt.project_budget_period_key,
    v_receipt.actor_user_id,
    v_receipt.actor_principal,
    v_receipt.idempotency_key,
    v_receipt.request_sha256,
    v_receipt.occurred_at,
    v_integrity_sha256
  )
  RETURNING * INTO v_receipt;

  PERFORM co_production_private.append_co_credit_ledger_event(
    p_team_id,
    p_project_id,
    p_operation_execution_id,
    v_reservation.operation,
    v_reservation.quote_id,
    v_reservation.id,
    v_receipt.id,
    v_tenant_grant.id,
    v_tenant_grant.budget_period_key,
    v_project_grant.id,
    v_project_grant.budget_period_key,
    CASE WHEN p_action = 'reversed'
      THEN 'reversal_credit'
      ELSE 'dispute_credit'
    END,
    0,
    -v_settlement.committed_co_units,
    v_settlement.rate_catalog_id,
    v_settlement.rate_catalog_version,
    v_settlement.rate_catalog_sha256,
    v_settlement.pricing_terms_id,
    v_settlement.pricing_version,
    v_settlement.pricing_terms_sha256,
    p_idempotency_key,
    pg_catalog.jsonb_build_object(
      'settlementReceiptId', v_settlement.id,
      'reasonCode', p_reason_code
    )
  );

  PERFORM co_production_private.save_co_credit_idempotency(
    p_team_id,
    p_project_id,
    p_operation_execution_id,
    v_settlement.operation,
    'reverse_or_dispute',
    p_idempotency_key,
    v_request_fingerprint,
    'receipt',
    v_receipt.id
  );

  RETURN pg_catalog.jsonb_build_object(
    'receipt', pg_catalog.to_jsonb(v_receipt),
    'replayed', false,
    'paymentMutation', 'none'
  );
END
$$;

CREATE OR REPLACE FUNCTION co_production.read_co_credit_settlement_audit(
  p_team_id uuid,
  p_project_id uuid,
  p_operation_execution_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_authoritative_team_id uuid;
  v_execution co_production.co_credit_operation_executions%ROWTYPE;
  v_quote co_production.co_credit_quotes%ROWTYPE;
  v_reservation co_production.co_credit_reservations%ROWTYPE;
  v_activation
    co_production.co_credit_commercial_bundle_activations%ROWTYPE;
  v_catalog co_production.co_credit_rate_catalog_snapshots%ROWTYPE;
  v_pricing co_production.co_credit_pricing_terms_snapshots%ROWTYPE;
  v_tenant_grant co_production.co_credit_budget_grants%ROWTYPE;
  v_project_grant co_production.co_credit_budget_grants%ROWTYPE;
  v_ledger_head jsonb;
BEGIN
  SELECT project.team_id
  INTO v_authoritative_team_id
  FROM co_production.projects AS project
  WHERE project.id = p_project_id;

  IF v_authoritative_team_id IS NULL
    OR v_authoritative_team_id IS DISTINCT FROM p_team_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'co_credit_cross_tenant_scope_denied';
  END IF;

  IF pg_catalog.coalesce((SELECT auth.role()), '') <> 'authenticated'
    OR (SELECT auth.uid()) IS NULL
    OR NOT co_production_private.has_team_role(p_team_id, 80)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'co_credit_audit_read_denied';
  END IF;

  SELECT execution.*
  INTO STRICT v_execution
  FROM co_production.co_credit_operation_executions AS execution
  WHERE execution.operation_execution_id = p_operation_execution_id
    AND execution.team_id = p_team_id
    AND execution.project_id = p_project_id;

  SELECT quote.*
  INTO STRICT v_quote
  FROM co_production.co_credit_quotes AS quote
  WHERE quote.operation_execution_id = v_execution.operation_execution_id
    AND quote.team_id = v_execution.team_id
    AND quote.project_id = v_execution.project_id
    AND quote.operation = v_execution.operation;

  SELECT reservation.*
  INTO STRICT v_reservation
  FROM co_production.co_credit_reservations AS reservation
  WHERE reservation.operation_execution_id = v_execution.operation_execution_id
    AND reservation.quote_id = v_quote.id
    AND reservation.team_id = v_execution.team_id
    AND reservation.project_id = v_execution.project_id
    AND reservation.operation = v_execution.operation;

  SELECT catalog.* INTO STRICT v_catalog
  FROM co_production.co_credit_rate_catalog_snapshots AS catalog
  WHERE catalog.id = v_reservation.rate_catalog_id
    AND catalog.catalog_version = v_reservation.rate_catalog_version
    AND catalog.catalog_sha256 = v_reservation.rate_catalog_sha256;

  SELECT pricing.* INTO STRICT v_pricing
  FROM co_production.co_credit_pricing_terms_snapshots AS pricing
  WHERE pricing.id = v_reservation.pricing_terms_id
    AND pricing.pricing_version = v_reservation.pricing_version
    AND pricing.terms_sha256 = v_reservation.pricing_terms_sha256
    AND pricing.rate_catalog_id = v_catalog.id
    AND pricing.rate_catalog_version = v_catalog.catalog_version
    AND pricing.rate_catalog_sha256 = v_catalog.catalog_sha256;

  SELECT activation.* INTO STRICT v_activation
  FROM co_production.co_credit_commercial_bundle_activations AS activation
  WHERE activation.rate_catalog_id = v_catalog.id
    AND activation.rate_catalog_version = v_catalog.catalog_version
    AND activation.rate_catalog_sha256 = v_catalog.catalog_sha256
    AND activation.pricing_terms_id = v_pricing.id
    AND activation.pricing_version = v_pricing.pricing_version
    AND activation.pricing_terms_sha256 = v_pricing.terms_sha256;

  SELECT grant_row.* INTO STRICT v_tenant_grant
  FROM co_production.co_credit_budget_grants AS grant_row
  WHERE grant_row.id = v_reservation.tenant_budget_grant_id
    AND grant_row.grant_sha256 = v_reservation.tenant_budget_grant_sha256
    AND grant_row.budget_period_key =
      v_reservation.tenant_budget_period_key
    AND grant_row.team_id = p_team_id
    AND grant_row.budget_scope = 'tenant'
    AND grant_row.project_id IS NULL;

  SELECT grant_row.* INTO STRICT v_project_grant
  FROM co_production.co_credit_budget_grants AS grant_row
  WHERE grant_row.id = v_reservation.project_budget_grant_id
    AND grant_row.grant_sha256 = v_reservation.project_budget_grant_sha256
    AND grant_row.budget_period_key =
      v_reservation.project_budget_period_key
    AND grant_row.team_id = p_team_id
    AND grant_row.budget_scope = 'project'
    AND grant_row.project_id = p_project_id;

  SELECT pg_catalog.jsonb_build_object(
    'eventSequence', event.event_sequence,
    'eventSha256', event.event_sha256,
    'previousEventSequence', event.previous_event_sequence,
    'previousEventSha256', event.previous_event_sha256
  )
  INTO v_ledger_head
  FROM co_production.co_credit_ledger_events AS event
  WHERE event.team_id = p_team_id
  ORDER BY event.event_sequence DESC
  LIMIT 1;

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 'co-credit-settlement-audit.v1',
    'authoritativeScope', pg_catalog.jsonb_build_object(
      'teamId', p_team_id,
      'projectId', p_project_id
    ),
    'operationExecution', pg_catalog.to_jsonb(v_execution),
    'quote', pg_catalog.to_jsonb(v_quote),
    'reservation', pg_catalog.to_jsonb(v_reservation),
    'commercialBundleActivation', pg_catalog.to_jsonb(v_activation),
    'rateCatalogSnapshot', pg_catalog.to_jsonb(v_catalog),
    'pricingTermsSnapshot', pg_catalog.to_jsonb(v_pricing),
    'budgetPeriodKeys', pg_catalog.jsonb_build_object(
      'tenant', v_reservation.tenant_budget_period_key,
      'project', v_reservation.project_budget_period_key
    ),
    'budgetGrantReferences', pg_catalog.jsonb_build_object(
      'tenant', pg_catalog.to_jsonb(v_tenant_grant),
      'project', pg_catalog.to_jsonb(v_project_grant)
    ),
    'budgetGrantRevisions', pg_catalog.jsonb_build_object(
      'tenant', (
        SELECT pg_catalog.coalesce(
          pg_catalog.jsonb_agg(pg_catalog.to_jsonb(grant_row)
            ORDER BY grant_row.revision_sequence),
          '[]'::jsonb
        )
        FROM co_production.co_credit_budget_grants AS grant_row
        WHERE grant_row.team_id = p_team_id
          AND grant_row.budget_scope = 'tenant'
          AND grant_row.project_id IS NULL
          AND grant_row.budget_period_key =
            v_reservation.tenant_budget_period_key
      ),
      'project', (
        SELECT pg_catalog.coalesce(
          pg_catalog.jsonb_agg(pg_catalog.to_jsonb(grant_row)
            ORDER BY grant_row.revision_sequence),
          '[]'::jsonb
        )
        FROM co_production.co_credit_budget_grants AS grant_row
        WHERE grant_row.team_id = p_team_id
          AND grant_row.budget_scope = 'project'
          AND grant_row.project_id = p_project_id
          AND grant_row.budget_period_key =
            v_reservation.project_budget_period_key
      )
    ),
    'entitlementStates', pg_catalog.jsonb_build_object(
      'tenant', (
        SELECT pg_catalog.coalesce(
          pg_catalog.jsonb_agg(pg_catalog.to_jsonb(state)
            ORDER BY state.entitlement_sequence),
          '[]'::jsonb
        )
        FROM co_production.co_credit_entitlement_states AS state
        WHERE state.team_id = p_team_id
          AND state.project_id IS NULL
          AND state.budget_period_key =
            v_reservation.tenant_budget_period_key
      ),
      'project', (
        SELECT pg_catalog.coalesce(
          pg_catalog.jsonb_agg(pg_catalog.to_jsonb(state)
            ORDER BY state.entitlement_sequence),
          '[]'::jsonb
        )
        FROM co_production.co_credit_entitlement_states AS state
        WHERE state.team_id = p_team_id
          AND state.project_id = p_project_id
          AND state.budget_period_key =
            v_reservation.project_budget_period_key
      )
    ),
    'terminalReceipts', (
      SELECT pg_catalog.coalesce(
        pg_catalog.jsonb_agg(pg_catalog.to_jsonb(receipt)
          ORDER BY receipt.occurred_at, receipt.id),
        '[]'::jsonb
      )
      FROM co_production.co_credit_terminal_receipts AS receipt
      WHERE receipt.operation_execution_id = p_operation_execution_id
        AND receipt.team_id = p_team_id
        AND receipt.project_id = p_project_id
    ),
    'workerExecutionLeases', (
      SELECT pg_catalog.coalesce(
        pg_catalog.jsonb_agg(pg_catalog.to_jsonb(lease)
          ORDER BY lease.lease_sequence, lease.id),
        '[]'::jsonb
      )
      FROM co_production.co_credit_worker_execution_leases AS lease
      WHERE lease.operation_execution_id = p_operation_execution_id
        AND lease.team_id = p_team_id
        AND lease.project_id = p_project_id
    ),
    'workerExecutionBindings', (
      SELECT pg_catalog.coalesce(
        pg_catalog.jsonb_agg(pg_catalog.to_jsonb(binding)
          ORDER BY binding.registered_at, binding.id),
        '[]'::jsonb
      )
      FROM co_production.co_credit_worker_execution_bindings AS binding
      WHERE binding.operation_execution_id = p_operation_execution_id
        AND binding.team_id = p_team_id
        AND binding.project_id = p_project_id
    ),
    'workerExecutionAttestations', (
      SELECT pg_catalog.coalesce(
        pg_catalog.jsonb_agg(pg_catalog.to_jsonb(attestation)
          ORDER BY attestation.attested_at, attestation.id),
        '[]'::jsonb
      )
      FROM co_production.co_credit_worker_execution_attestations AS attestation
      WHERE attestation.operation_execution_id = p_operation_execution_id
        AND attestation.team_id = p_team_id
        AND attestation.project_id = p_project_id
    ),
    'idempotencyRows', (
      SELECT pg_catalog.coalesce(
        pg_catalog.jsonb_agg(pg_catalog.to_jsonb(idempotency)
          ORDER BY idempotency.created_at, idempotency.id),
        '[]'::jsonb
      )
      FROM co_production.co_credit_idempotency_rows AS idempotency
      WHERE idempotency.operation_execution_id = p_operation_execution_id
        AND idempotency.team_id = p_team_id
        AND idempotency.project_id = p_project_id
    ),
    'ledgerEvents', (
      SELECT pg_catalog.coalesce(
        pg_catalog.jsonb_agg(pg_catalog.to_jsonb(event)
          ORDER BY event.event_sequence),
        '[]'::jsonb
      )
      FROM co_production.co_credit_ledger_events AS event
      WHERE event.operation_execution_id = p_operation_execution_id
        AND event.team_id = p_team_id
        AND event.project_id = p_project_id
    ),
    'ledgerHead', v_ledger_head,
    'paymentMutation', 'none'
  );
END
$$;

ALTER TABLE co_production.co_credit_rate_catalog_snapshots
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.co_credit_rate_catalog_snapshots
  FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.co_credit_pricing_terms_snapshots
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.co_credit_pricing_terms_snapshots
  FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.co_credit_commercial_bundle_activations
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.co_credit_commercial_bundle_activations
  FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.co_credit_budget_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.co_credit_budget_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.co_credit_entitlement_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.co_credit_entitlement_states FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.co_credit_operation_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.co_credit_operation_executions FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.co_credit_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.co_credit_quotes FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.co_credit_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.co_credit_reservations FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.co_credit_worker_execution_leases
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.co_credit_worker_execution_leases
  FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.co_credit_worker_execution_bindings
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.co_credit_worker_execution_bindings
  FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.co_credit_worker_execution_attestations
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.co_credit_worker_execution_attestations
  FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.co_credit_terminal_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.co_credit_terminal_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.co_credit_idempotency_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.co_credit_idempotency_rows FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.co_credit_ledger_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.co_credit_ledger_events FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production_private.co_credit_authority_metadata
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production_private.co_credit_authority_metadata
  FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production_private.co_credit_worker_signing_keys
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production_private.co_credit_worker_signing_keys
  FORCE ROW LEVEL SECURITY;

-- FORCE RLS makes the SECURITY DEFINER owner part of the write boundary. Fail
-- the migration unless every commercial table and definer has the one audited,
-- BYPASSRLS-capable migration owner and every table is already FORCE protected.
DO $authority_preflight$
DECLARE
  v_expected_owner oid;
  v_expected_owner_name name;
  v_current_owner oid;
  v_expected_owner_can_bypass boolean;
  v_object_name text;
  v_authority_table pg_catalog.regclass;
  v_authority_function pg_catalog.regprocedure;
  v_actual_owner oid;
  v_rls_enabled boolean;
  v_rls_forced boolean;
  v_security_definer boolean;
BEGIN
  SELECT
    metadata.expected_owner_oid,
    metadata.expected_owner_name,
    role.rolsuper OR role.rolbypassrls
  INTO STRICT
    v_expected_owner,
    v_expected_owner_name,
    v_expected_owner_can_bypass
  FROM co_production_private.co_credit_authority_metadata AS metadata
  JOIN pg_catalog.pg_roles AS role
    ON role.oid = metadata.expected_owner_oid
   AND role.rolname = metadata.expected_owner_name
  WHERE metadata.singleton;

  SELECT role.oid
  INTO STRICT v_current_owner
  FROM pg_catalog.pg_roles AS role
  WHERE role.rolname = current_user;

  IF NOT v_expected_owner_can_bypass
    OR v_current_owner IS DISTINCT FROM v_expected_owner
    OR current_user::text IS DISTINCT FROM v_expected_owner_name::text
    OR current_user IN ('service_role', 'co_credit_worker_attestor')
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_roles AS role
      WHERE (
        role.rolsuper
        OR role.rolbypassrls
        OR role.rolcreaterole
        OR role.rolcreatedb
        OR role.rolreplication
        OR role.oid = v_expected_owner
      )
        AND pg_catalog.pg_has_role(
          'co_credit_worker_attestor',
          role.oid,
          'MEMBER'
        )
    )
    OR EXISTS (
      SELECT 1
      FROM (
        SELECT relation.relowner AS owner_oid
        FROM pg_catalog.pg_class AS relation
        WHERE relation.relnamespace IN (
          'co_production'::pg_catalog.regnamespace,
          'co_production_private'::pg_catalog.regnamespace
        )
          AND relation.relname LIKE 'co_credit_%'
        UNION
        SELECT routine.proowner
        FROM pg_catalog.pg_proc AS routine
        WHERE routine.pronamespace IN (
          'co_production'::pg_catalog.regnamespace,
          'co_production_private'::pg_catalog.regnamespace
        )
          AND routine.proname LIKE '%co_credit%'
      ) AS object_owner
      WHERE pg_catalog.pg_has_role(
        'co_credit_worker_attestor',
        object_owner.owner_oid,
        'MEMBER'
      )
    )
  THEN
    RAISE EXCEPTION
      'co_credit_force_rls_owner_contract_invalid';
  END IF;

  FOREACH v_object_name IN ARRAY ARRAY[
    'co_production.co_credit_rate_catalog_snapshots',
    'co_production.co_credit_pricing_terms_snapshots',
    'co_production.co_credit_commercial_bundle_activations',
    'co_production.co_credit_budget_grants',
    'co_production.co_credit_entitlement_states',
    'co_production.co_credit_operation_executions',
    'co_production.co_credit_quotes',
    'co_production.co_credit_reservations',
    'co_production.co_credit_worker_execution_leases',
    'co_production.co_credit_worker_execution_bindings',
    'co_production.co_credit_worker_execution_attestations',
    'co_production.co_credit_terminal_receipts',
    'co_production.co_credit_idempotency_rows',
    'co_production.co_credit_ledger_events',
    'co_production_private.co_credit_authority_metadata',
    'co_production_private.co_credit_worker_signing_keys'
  ]
  LOOP
    v_authority_table := pg_catalog.to_regclass(v_object_name);
    IF v_authority_table IS NULL THEN
      RAISE EXCEPTION
        'co_credit_force_rls_table_missing: %', v_object_name;
    END IF;

    SELECT
      relation.relowner,
      relation.relrowsecurity,
      relation.relforcerowsecurity
    INTO STRICT v_actual_owner, v_rls_enabled, v_rls_forced
    FROM pg_catalog.pg_class AS relation
    WHERE relation.oid = v_authority_table;

    IF v_actual_owner IS DISTINCT FROM v_expected_owner
      OR NOT v_rls_enabled
      OR NOT v_rls_forced
    THEN
      RAISE EXCEPTION
        'co_credit_force_rls_table_contract_invalid: %', v_object_name;
    END IF;
  END LOOP;

  FOREACH v_object_name IN ARRAY ARRAY[
    'co_production_private.lock_co_credit_commercial_authority()',
    'co_production_private.reject_co_credit_mutation()',
    'co_production_private.reject_co_credit_truncate()',
    'co_production_private.guard_co_credit_commercial_activation_insert()',
    'co_production_private.lock_co_credit_budget_scope(uuid,uuid,text)',
    'co_production_private.lock_co_credit_lifecycle_scope(uuid,uuid,uuid)',
    'co_production_private.guard_co_credit_budget_grant_insert()',
    'co_production_private.assert_co_credit_operation_authority(text)',
    'co_production_private.provision_co_credit_worker_signing_key(uuid,text,bytea,timestamptz,timestamptz)',
    'co_production_private.append_co_credit_ledger_event(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,bigint,bigint,uuid,text,text,uuid,text,text,text,jsonb)',
    'co_production_private.save_co_credit_idempotency(uuid,uuid,uuid,text,text,text,text,text,uuid)',
    'co_production.approve_co_credit_rate_catalog(text,timestamptz,jsonb,text,text)',
    'co_production.approve_co_credit_pricing_terms(text,timestamptz,uuid,text,bigint,jsonb,text,text)',
    'co_production.approve_and_activate_co_credit_commercial_bundle(text,timestamptz,jsonb,text,text,timestamptz,text,bigint,jsonb,text,timestamptz)',
    'co_production.grant_co_credit_budget(uuid,uuid,text,uuid,text,timestamptz,timestamptz,bigint,bigint,bigint,text[],text,text)',
    'co_production.record_co_credit_entitlement_state(uuid,text,text[],text,boolean)',
    'co_production.reserve_co_credit(uuid,uuid,uuid,text,jsonb,text,timestamptz,uuid,uuid)',
    'co_production.issue_co_credit_worker_execution_lease(uuid,uuid,uuid,uuid,uuid,uuid,text,text,integer,timestamptz)',
    'co_production.record_co_credit_worker_execution_attestation(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,text,timestamptz,text,jsonb)',
    'co_production.settle_co_credit(uuid,uuid,uuid,uuid,uuid,text,text)',
    'co_production.release_co_credit(uuid,uuid,uuid,uuid,text,text)',
    'co_production.reap_expired_co_credit_reservations(uuid,integer)',
    'co_production.reverse_or_dispute_co_credit_settlement(uuid,uuid,uuid,uuid,text,text,text)',
    'co_production.read_co_credit_settlement_audit(uuid,uuid,uuid)'
  ]
  LOOP
    v_authority_function := pg_catalog.to_regprocedure(v_object_name);
    IF v_authority_function IS NULL THEN
      RAISE EXCEPTION
        'co_credit_security_definer_missing: %', v_object_name;
    END IF;

    SELECT routine.proowner, routine.prosecdef
    INTO STRICT v_actual_owner, v_security_definer
    FROM pg_catalog.pg_proc AS routine
    WHERE routine.oid = v_authority_function;

    IF v_actual_owner IS DISTINCT FROM v_expected_owner
      OR NOT v_security_definer
    THEN
      RAISE EXCEPTION
        'co_credit_security_definer_owner_contract_invalid: %', v_object_name;
    END IF;
  END LOOP;
END
$authority_preflight$;

CREATE POLICY co_credit_rate_catalog_service_select
  ON co_production.co_credit_rate_catalog_snapshots
  FOR SELECT TO service_role USING (true);
CREATE POLICY co_credit_pricing_terms_service_select
  ON co_production.co_credit_pricing_terms_snapshots
  FOR SELECT TO service_role USING (true);
CREATE POLICY co_credit_commercial_activations_service_select
  ON co_production.co_credit_commercial_bundle_activations
  FOR SELECT TO service_role USING (true);

CREATE POLICY co_credit_budget_grants_select
  ON co_production.co_credit_budget_grants
  FOR SELECT TO authenticated
  USING (co_production_private.has_team_role(team_id, 80));
CREATE POLICY co_credit_entitlement_states_select
  ON co_production.co_credit_entitlement_states
  FOR SELECT TO authenticated
  USING (co_production_private.has_team_role(team_id, 80));
CREATE POLICY co_credit_operation_executions_select
  ON co_production.co_credit_operation_executions
  FOR SELECT TO authenticated
  USING (co_production_private.has_project_role(project_id, 80));
CREATE POLICY co_credit_quotes_select
  ON co_production.co_credit_quotes
  FOR SELECT TO authenticated
  USING (co_production_private.has_project_role(project_id, 80));
CREATE POLICY co_credit_reservations_select
  ON co_production.co_credit_reservations
  FOR SELECT TO authenticated
  USING (co_production_private.has_project_role(project_id, 80));
CREATE POLICY co_credit_terminal_receipts_select
  ON co_production.co_credit_terminal_receipts
  FOR SELECT TO authenticated
  USING (co_production_private.has_project_role(project_id, 80));
CREATE POLICY co_credit_idempotency_rows_select
  ON co_production.co_credit_idempotency_rows
  FOR SELECT TO authenticated
  USING (co_production_private.has_project_role(project_id, 80));
CREATE POLICY co_credit_ledger_events_select
  ON co_production.co_credit_ledger_events
  FOR SELECT TO authenticated
  USING (co_production_private.has_project_role(project_id, 80));

CREATE POLICY co_credit_budget_grants_service_select
  ON co_production.co_credit_budget_grants
  FOR SELECT TO service_role USING (true);
CREATE POLICY co_credit_entitlement_states_service_select
  ON co_production.co_credit_entitlement_states
  FOR SELECT TO service_role USING (true);
CREATE POLICY co_credit_operation_executions_service_select
  ON co_production.co_credit_operation_executions
  FOR SELECT TO service_role USING (true);
CREATE POLICY co_credit_quotes_service_select
  ON co_production.co_credit_quotes
  FOR SELECT TO service_role USING (true);
CREATE POLICY co_credit_reservations_service_select
  ON co_production.co_credit_reservations
  FOR SELECT TO service_role USING (true);
CREATE POLICY co_credit_worker_leases_service_select
  ON co_production.co_credit_worker_execution_leases
  FOR SELECT TO service_role USING (true);
CREATE POLICY co_credit_worker_bindings_service_select
  ON co_production.co_credit_worker_execution_bindings
  FOR SELECT TO service_role USING (true);
CREATE POLICY co_credit_worker_attestations_service_select
  ON co_production.co_credit_worker_execution_attestations
  FOR SELECT TO service_role USING (true);
CREATE POLICY co_credit_terminal_receipts_service_select
  ON co_production.co_credit_terminal_receipts
  FOR SELECT TO service_role USING (true);
CREATE POLICY co_credit_idempotency_rows_service_select
  ON co_production.co_credit_idempotency_rows
  FOR SELECT TO service_role USING (true);
CREATE POLICY co_credit_ledger_events_service_select
  ON co_production.co_credit_ledger_events
  FOR SELECT TO service_role USING (true);

DO $triggers$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'co_credit_rate_catalog_snapshots',
    'co_credit_pricing_terms_snapshots',
    'co_credit_commercial_bundle_activations',
    'co_credit_budget_grants',
    'co_credit_entitlement_states',
    'co_credit_operation_executions',
    'co_credit_quotes',
    'co_credit_reservations',
    'co_credit_worker_execution_leases',
    'co_credit_worker_execution_bindings',
    'co_credit_worker_execution_attestations',
    'co_credit_terminal_receipts',
    'co_credit_idempotency_rows',
    'co_credit_ledger_events'
  ]
  LOOP
    EXECUTE pg_catalog.format(
      'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON co_production.%I '
      || 'FOR EACH ROW EXECUTE FUNCTION '
      || 'co_production_private.reject_co_credit_mutation()',
      table_name || '_co_credit_immutable',
      table_name
    );
    EXECUTE pg_catalog.format(
      'CREATE TRIGGER %I BEFORE TRUNCATE ON co_production.%I '
      || 'FOR EACH STATEMENT EXECUTE FUNCTION '
      || 'co_production_private.reject_co_credit_truncate()',
      table_name || '_co_credit_no_truncate',
      table_name
    );
  END LOOP;
END
$triggers$;

CREATE TRIGGER co_credit_authority_metadata_immutable
  BEFORE UPDATE OR DELETE
  ON co_production_private.co_credit_authority_metadata
  FOR EACH ROW EXECUTE FUNCTION
    co_production_private.reject_co_credit_mutation();
CREATE TRIGGER co_credit_authority_metadata_no_truncate
  BEFORE TRUNCATE
  ON co_production_private.co_credit_authority_metadata
  FOR EACH STATEMENT EXECUTE FUNCTION
    co_production_private.reject_co_credit_truncate();
CREATE TRIGGER co_credit_worker_signing_keys_immutable
  BEFORE UPDATE OR DELETE
  ON co_production_private.co_credit_worker_signing_keys
  FOR EACH ROW EXECUTE FUNCTION
    co_production_private.reject_co_credit_mutation();
CREATE TRIGGER co_credit_worker_signing_keys_no_truncate
  BEFORE TRUNCATE
  ON co_production_private.co_credit_worker_signing_keys
  FOR EACH STATEMENT EXECUTE FUNCTION
    co_production_private.reject_co_credit_truncate();

REVOKE ALL ON TABLE
  co_production.co_credit_rate_catalog_snapshots,
  co_production.co_credit_pricing_terms_snapshots,
  co_production.co_credit_commercial_bundle_activations,
  co_production.co_credit_budget_grants,
  co_production.co_credit_entitlement_states,
  co_production.co_credit_operation_executions,
  co_production.co_credit_quotes,
  co_production.co_credit_reservations,
  co_production.co_credit_worker_execution_leases,
  co_production.co_credit_worker_execution_bindings,
  co_production.co_credit_worker_execution_attestations,
  co_production.co_credit_terminal_receipts,
  co_production.co_credit_idempotency_rows,
  co_production.co_credit_ledger_events
FROM PUBLIC, anon, authenticated, service_role, co_credit_worker_attestor;

REVOKE ALL ON TABLE
  co_production_private.co_credit_authority_metadata,
  co_production_private.co_credit_worker_signing_keys
FROM PUBLIC, anon, authenticated, service_role, co_credit_worker_attestor;

GRANT SELECT ON TABLE
  co_production.co_credit_budget_grants,
  co_production.co_credit_entitlement_states,
  co_production.co_credit_operation_executions,
  co_production.co_credit_quotes,
  co_production.co_credit_reservations,
  co_production.co_credit_terminal_receipts,
  co_production.co_credit_idempotency_rows,
  co_production.co_credit_ledger_events
TO authenticated;

GRANT SELECT ON TABLE
  co_production.co_credit_rate_catalog_snapshots,
  co_production.co_credit_pricing_terms_snapshots,
  co_production.co_credit_commercial_bundle_activations,
  co_production.co_credit_budget_grants,
  co_production.co_credit_entitlement_states,
  co_production.co_credit_operation_executions,
  co_production.co_credit_quotes,
  co_production.co_credit_reservations,
  co_production.co_credit_worker_execution_leases,
  co_production.co_credit_worker_execution_bindings,
  co_production.co_credit_worker_execution_attestations,
  co_production.co_credit_terminal_receipts,
  co_production.co_credit_idempotency_rows,
  co_production.co_credit_ledger_events
TO service_role;

REVOKE ALL ON FUNCTION co_production.approve_co_credit_rate_catalog(
  text, timestamptz, jsonb, text, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production.approve_co_credit_pricing_terms(
  text, timestamptz, uuid, text, bigint, jsonb, text, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production.approve_and_activate_co_credit_commercial_bundle(
    text, timestamptz, jsonb, text, text, timestamptz, text, bigint, jsonb,
    text, timestamptz
  ) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production.grant_co_credit_budget(
  uuid, uuid, text, uuid, text, timestamptz, timestamptz, bigint, bigint,
  bigint, text[], text, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production.record_co_credit_entitlement_state(
  uuid, text, text[], text, boolean
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production.reserve_co_credit(
  uuid, uuid, uuid, text, jsonb, text, timestamptz, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production.issue_co_credit_worker_execution_lease(
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, integer, timestamptz
) FROM PUBLIC, anon, authenticated, service_role, co_credit_worker_attestor;
REVOKE ALL ON FUNCTION
  co_production.record_co_credit_worker_execution_attestation(
    uuid, uuid, uuid, uuid, uuid, uuid, uuid, bigint, text, timestamptz,
    text, jsonb
  ) FROM PUBLIC, anon, authenticated, service_role, co_credit_worker_attestor;
REVOKE ALL ON FUNCTION co_production.settle_co_credit(
  uuid, uuid, uuid, uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production.release_co_credit(
  uuid, uuid, uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production.reap_expired_co_credit_reservations(
  uuid, integer
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production.reverse_or_dispute_co_credit_settlement(
  uuid, uuid, uuid, uuid, text, text, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production.read_co_credit_settlement_audit(
  uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  co_production.approve_and_activate_co_credit_commercial_bundle(
    text, timestamptz, jsonb, text, text, timestamptz, text, bigint, jsonb,
    text, timestamptz
  ) TO service_role;
GRANT EXECUTE ON FUNCTION co_production.grant_co_credit_budget(
  uuid, uuid, text, uuid, text, timestamptz, timestamptz, bigint, bigint,
  bigint, text[], text, text
) TO service_role;
GRANT EXECUTE ON FUNCTION co_production.record_co_credit_entitlement_state(
  uuid, text, text[], text, boolean
) TO service_role;
GRANT EXECUTE ON FUNCTION co_production.reserve_co_credit(
  uuid, uuid, uuid, text, jsonb, text, timestamptz, uuid, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION co_production.issue_co_credit_worker_execution_lease(
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, integer, timestamptz
) TO service_role;
GRANT USAGE ON SCHEMA co_production TO co_credit_worker_attestor;
GRANT EXECUTE ON FUNCTION
  co_production.record_co_credit_worker_execution_attestation(
    uuid, uuid, uuid, uuid, uuid, uuid, uuid, bigint, text, timestamptz,
    text, jsonb
  ) TO co_credit_worker_attestor;
GRANT EXECUTE ON FUNCTION co_production.settle_co_credit(
  uuid, uuid, uuid, uuid, uuid, text, text
) TO service_role;
GRANT EXECUTE ON FUNCTION co_production.release_co_credit(
  uuid, uuid, uuid, uuid, text, text
) TO service_role;
GRANT EXECUTE ON FUNCTION co_production.reap_expired_co_credit_reservations(
  uuid, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION co_production.reverse_or_dispute_co_credit_settlement(
  uuid, uuid, uuid, uuid, text, text, text
) TO service_role;
GRANT EXECUTE ON FUNCTION co_production.read_co_credit_settlement_audit(
  uuid, uuid, uuid
) TO authenticated;

REVOKE ALL ON FUNCTION co_production_private.co_credit_sha256(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.co_credit_epoch_microseconds(timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.co_credit_hash_is_valid(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.co_credit_hmac_is_valid(text)
  FROM PUBLIC, anon, authenticated, service_role, co_credit_worker_attestor;
REVOKE ALL ON FUNCTION
  co_production_private.co_credit_constant_time_bytea_equal(bytea,bytea)
  FROM PUBLIC, anon, authenticated, service_role, co_credit_worker_attestor;
REVOKE ALL ON FUNCTION co_production_private.co_credit_identifier_is_valid(
  text, integer
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.co_credit_actor_principal()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.lock_co_credit_commercial_authority()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.co_credit_decimal_digit_to_ascii(text)
  FROM PUBLIC, anon, authenticated, service_role,
    co_credit_worker_attestor;
REVOKE ALL ON FUNCTION
  co_production_private.co_credit_pan_separator_is_allowed(text)
  FROM PUBLIC, anon, authenticated, service_role,
    co_credit_worker_attestor;
REVOKE ALL ON FUNCTION
  co_production_private.co_credit_pan_is_valid(text)
  FROM PUBLIC, anon, authenticated, service_role,
    co_credit_worker_attestor;
REVOKE ALL ON FUNCTION
  co_production_private.co_credit_text_contains_pan(text)
  FROM PUBLIC, anon, authenticated, service_role,
    co_credit_worker_attestor;
REVOKE ALL ON FUNCTION
  co_production_private.co_credit_decimal_fragment(text)
  FROM PUBLIC, anon, authenticated, service_role,
    co_credit_worker_attestor;
REVOKE ALL ON FUNCTION
  co_production_private.co_credit_json_digit_fragments(jsonb)
  FROM PUBLIC, anon, authenticated, service_role,
    co_credit_worker_attestor;
REVOKE ALL ON FUNCTION co_production_private.co_credit_commercial_json_is_safe(
  jsonb
) FROM PUBLIC, anon, authenticated, service_role, co_credit_worker_attestor;
REVOKE ALL ON FUNCTION co_production_private.require_co_credit_service_role()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.require_co_credit_worker_attestor_role()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.reject_co_credit_mutation()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.reject_co_credit_truncate()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.lock_co_credit_budget_scope(
  uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.lock_co_credit_lifecycle_scope(
  uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role, co_credit_worker_attestor;
REVOKE ALL ON FUNCTION
  co_production_private.assert_co_credit_operation_authority(text)
  FROM PUBLIC, anon, authenticated, service_role, co_credit_worker_attestor;
REVOKE ALL ON FUNCTION
  co_production_private.provision_co_credit_worker_signing_key(
    uuid, text, bytea, timestamptz, timestamptz
  ) FROM PUBLIC, anon, authenticated, service_role,
    co_credit_worker_attestor;
REVOKE ALL ON FUNCTION
  co_production_private.guard_co_credit_budget_grant_insert()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.guard_co_credit_commercial_activation_insert()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.co_credit_calculate_units(
  jsonb, text, jsonb
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.append_co_credit_ledger_event(
  uuid, uuid, uuid, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text,
  bigint, bigint, uuid, text, text, uuid, text, text, text, jsonb
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.save_co_credit_idempotency(
  uuid, uuid, uuid, text, text, text, text, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE co_production.co_credit_ledger_events IS
  'Append-only Co-Unit accounting. It performs no payment mutation.';
COMMENT ON FUNCTION
  co_production.approve_and_activate_co_credit_commercial_bundle(
    text, timestamptz, jsonb, text, text, timestamptz, text, bigint, jsonb,
    text, timestamptz
  ) IS
  'Service-only atomic catalog and pricing approval/activation authority.';
COMMENT ON FUNCTION co_production.reserve_co_credit(
  uuid, uuid, uuid, text, jsonb, text, timestamptz, uuid, uuid
) IS
  'Service-only reservation; PostgreSQL computes its canonical request fingerprint internally.';
COMMENT ON FUNCTION co_production.settle_co_credit(
  uuid, uuid, uuid, uuid, uuid, text, text
) IS
  'Service-only settlement from a fenced registered worker attestation; PostgreSQL computes the request fingerprint and uses reservation-pinned commercial snapshots.';
COMMENT ON FUNCTION co_production.issue_co_credit_worker_execution_lease(
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, integer, timestamptz
) IS
  'Service-only atomic issuance of a sequence-fenced lease and immutable pre-work source/job/key binding.';
COMMENT ON FUNCTION
  co_production.record_co_credit_worker_execution_attestation(
    uuid, uuid, uuid, uuid, uuid, uuid, uuid, bigint, text, timestamptz,
    text, jsonb
  ) IS
  'Worker-attestor-only detached HMAC receipt verification; service_role cannot read signing keys or execute this RPC.';
COMMENT ON FUNCTION co_production.release_co_credit(
  uuid, uuid, uuid, uuid, text, text
) IS
  'Service-only release with an internally computed canonical request fingerprint.';
COMMENT ON FUNCTION co_production.reap_expired_co_credit_reservations(
  uuid, integer
) IS
  'Service-only transactional release of expired reservation holds.';
COMMENT ON FUNCTION co_production.reverse_or_dispute_co_credit_settlement(
  uuid, uuid, uuid, uuid, text, text, text
) IS
  'Service-only compensation with an internally computed canonical request fingerprint.';
COMMENT ON FUNCTION co_production.read_co_credit_settlement_audit(
  uuid, uuid, uuid
) IS
  'Team-admin audit export; not a certification proof artifact.';

COMMIT;
