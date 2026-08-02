-- Canonical pre-project intake and CRM authority for Co-Production.
--
-- This migration is additive and intentionally unapplied. Public intake reaches
-- one service-role RPC. Authenticated producers qualify an inquiry through one
-- transaction. Neither boundary creates projects or invokes outbound delivery.

BEGIN;

DO $preproject_preflight$
BEGIN
  IF current_setting('server_version_num')::integer < 150000 THEN
    RAISE EXCEPTION USING
      ERRCODE = '0A000',
      MESSAGE = 'preproject_crm_requires_postgresql_15';
  END IF;

  IF pg_catalog.to_regprocedure(
    'co_production_private.has_team_role(uuid,integer)'
  ) IS NULL
    OR pg_catalog.to_regprocedure(
      'co_production_private.role_rank(text)'
    ) IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'preproject_crm_requires_team_authority';
  END IF;
END
$preproject_preflight$;

CREATE OR REPLACE FUNCTION co_production_private.preproject_sha256(
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

CREATE OR REPLACE FUNCTION co_production_private.preproject_safe_text(
  p_value text,
  p_min_length integer,
  p_max_length integer
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT pg_catalog.length(pg_catalog.btrim(p_value))
      BETWEEN p_min_length AND p_max_length
    AND pg_catalog.regexp_replace(p_value, E'[\n\t]', '', 'g') !~ '[[:cntrl:]]'
$$;

CREATE OR REPLACE FUNCTION co_production_private.preproject_exact_json_keys(
  p_value jsonb,
  p_keys text[]
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT pg_catalog.jsonb_typeof(p_value) = 'object'
    AND p_value ?& p_keys
    AND p_value - p_keys = '{}'::jsonb
$$;

CREATE OR REPLACE FUNCTION co_production_private.preproject_https_url_is_valid(
  p_value text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT co_production_private.preproject_safe_text(p_value, 8, 2048)
    AND p_value ~ '^https://[^[:space:]#]+$'
    AND p_value !~ '^https://[^/]*@'
$$;

CREATE OR REPLACE FUNCTION co_production_private.preproject_iso_date_is_valid(
  p_value text
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
BEGIN
  IF p_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RETURN false;
  END IF;

  PERFORM pg_catalog.make_date(
    pg_catalog.substr(p_value, 1, 4)::integer,
    pg_catalog.substr(p_value, 6, 2)::integer,
    pg_catalog.substr(p_value, 9, 2)::integer
  );
  RETURN true;
EXCEPTION WHEN datetime_field_overflow THEN
  RETURN false;
END
$$;

CREATE OR REPLACE FUNCTION co_production_private.preproject_text_array_is_valid(
  p_value jsonb,
  p_min_items integer,
  p_max_items integer,
  p_item_max_length integer,
  p_https_only boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
  v_item jsonb;
  v_text text;
  v_seen text[] := ARRAY[]::text[];
BEGIN
  IF pg_catalog.jsonb_typeof(p_value) IS DISTINCT FROM 'array'
    OR pg_catalog.jsonb_array_length(p_value) NOT BETWEEN p_min_items AND p_max_items
  THEN
    RETURN false;
  END IF;

  FOR v_item IN
    SELECT entry.value
    FROM pg_catalog.jsonb_array_elements(p_value) AS entry(value)
  LOOP
    IF pg_catalog.jsonb_typeof(v_item) IS DISTINCT FROM 'string' THEN
      RETURN false;
    END IF;
    v_text := pg_catalog.btrim(v_item #>> '{}');
    IF NOT co_production_private.preproject_safe_text(v_text, 1, p_item_max_length)
      OR (
        p_https_only
        AND NOT co_production_private.preproject_https_url_is_valid(v_text)
      )
      OR pg_catalog.lower(v_text) = ANY(v_seen)
    THEN
      RETURN false;
    END IF;
    v_seen := pg_catalog.array_append(v_seen, pg_catalog.lower(v_text));
  END LOOP;

  RETURN true;
END
$$;

CREATE OR REPLACE FUNCTION co_production_private.public_inquiry_payload_is_valid(
  p_payload jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
  v_contact jsonb;
  v_company jsonb;
  v_project jsonb;
  v_timeline jsonb;
  v_budget jsonb;
  v_consent jsonb;
  v_start_date date;
  v_due_date date;
BEGIN
  IF pg_column_size(p_payload) > 16384
    OR NOT co_production_private.preproject_exact_json_keys(
      p_payload,
      ARRAY[
        'schemaVersion', 'formKey', 'idempotencyKey', 'contact', 'company',
        'project', 'timeline', 'budgetSignal', 'consent'
      ]
    )
    OR p_payload ->> 'schemaVersion' IS DISTINCT FROM 'cco.public-inquiry.v1'
    OR pg_catalog.jsonb_typeof(p_payload -> 'formKey') IS DISTINCT FROM 'string'
    OR (p_payload ->> 'formKey') !~ '^ifm_[0-9a-f]{64}$'
    OR pg_catalog.jsonb_typeof(p_payload -> 'idempotencyKey') IS DISTINCT FROM 'string'
    OR (p_payload ->> 'idempotencyKey') !~ '^[a-z0-9][a-z0-9._:-]{15,127}$'
  THEN
    RETURN false;
  END IF;

  v_contact := p_payload -> 'contact';
  IF NOT co_production_private.preproject_exact_json_keys(
    v_contact,
    ARRAY['name', 'email', 'phone']
  )
    OR pg_catalog.jsonb_typeof(v_contact -> 'name') IS DISTINCT FROM 'string'
    OR NOT co_production_private.preproject_safe_text(v_contact ->> 'name', 1, 240)
    OR pg_catalog.jsonb_typeof(v_contact -> 'email') IS DISTINCT FROM 'string'
    OR NOT co_production_private.preproject_safe_text(v_contact ->> 'email', 3, 254)
    OR (v_contact ->> 'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR (
      pg_catalog.jsonb_typeof(v_contact -> 'phone') IS DISTINCT FROM 'null'
      AND (
        pg_catalog.jsonb_typeof(v_contact -> 'phone') IS DISTINCT FROM 'string'
        OR (v_contact ->> 'phone') !~ '^\+[1-9][0-9]{7,14}$'
      )
    )
  THEN
    RETURN false;
  END IF;

  v_company := p_payload -> 'company';
  IF NOT co_production_private.preproject_exact_json_keys(
    v_company,
    ARRAY['name', 'website']
  )
    OR pg_catalog.jsonb_typeof(v_company -> 'name') IS DISTINCT FROM 'string'
    OR NOT co_production_private.preproject_safe_text(v_company ->> 'name', 1, 240)
    OR (
      pg_catalog.jsonb_typeof(v_company -> 'website') IS DISTINCT FROM 'null'
      AND (
        pg_catalog.jsonb_typeof(v_company -> 'website') IS DISTINCT FROM 'string'
        OR NOT co_production_private.preproject_https_url_is_valid(
          v_company ->> 'website'
        )
      )
    )
  THEN
    RETURN false;
  END IF;

  v_project := p_payload -> 'project';
  IF NOT co_production_private.preproject_exact_json_keys(
    v_project,
    ARRAY[
      'title', 'goals', 'audiences', 'requestedDeliverables', 'references',
      'constraints', 'notes'
    ]
  )
    OR pg_catalog.jsonb_typeof(v_project -> 'title') IS DISTINCT FROM 'string'
    OR NOT co_production_private.preproject_safe_text(v_project ->> 'title', 1, 240)
    OR NOT co_production_private.preproject_text_array_is_valid(
      v_project -> 'goals', 1, 12, 1000
    )
    OR NOT co_production_private.preproject_text_array_is_valid(
      v_project -> 'audiences', 0, 12, 500
    )
    OR NOT co_production_private.preproject_text_array_is_valid(
      v_project -> 'requestedDeliverables', 0, 24, 500
    )
    OR NOT co_production_private.preproject_text_array_is_valid(
      v_project -> 'references', 0, 12, 2048, true
    )
    OR NOT co_production_private.preproject_text_array_is_valid(
      v_project -> 'constraints', 0, 20, 1000
    )
    OR (
      pg_catalog.jsonb_typeof(v_project -> 'notes') IS DISTINCT FROM 'null'
      AND (
        pg_catalog.jsonb_typeof(v_project -> 'notes') IS DISTINCT FROM 'string'
        OR NOT co_production_private.preproject_safe_text(
          v_project ->> 'notes', 1, 4000
        )
      )
    )
  THEN
    RETURN false;
  END IF;

  v_timeline := p_payload -> 'timeline';
  IF NOT co_production_private.preproject_exact_json_keys(
    v_timeline,
    ARRAY['desiredStartDate', 'dueDate', 'flexibility']
  )
    OR (
      pg_catalog.jsonb_typeof(v_timeline -> 'desiredStartDate') IS DISTINCT FROM 'null'
      AND (
        pg_catalog.jsonb_typeof(v_timeline -> 'desiredStartDate') IS DISTINCT FROM 'string'
        OR NOT co_production_private.preproject_iso_date_is_valid(
          v_timeline ->> 'desiredStartDate'
        )
      )
    )
    OR (
      pg_catalog.jsonb_typeof(v_timeline -> 'dueDate') IS DISTINCT FROM 'null'
      AND (
        pg_catalog.jsonb_typeof(v_timeline -> 'dueDate') IS DISTINCT FROM 'string'
        OR NOT co_production_private.preproject_iso_date_is_valid(
          v_timeline ->> 'dueDate'
        )
      )
    )
    OR pg_catalog.jsonb_typeof(v_timeline -> 'flexibility') IS DISTINCT FROM 'string'
    OR (v_timeline ->> 'flexibility') NOT IN (
      'fixed', 'somewhat_flexible', 'flexible', 'unknown'
    )
  THEN
    RETURN false;
  END IF;

  IF pg_catalog.jsonb_typeof(v_timeline -> 'desiredStartDate') = 'string' THEN
    v_start_date := (v_timeline ->> 'desiredStartDate')::date;
  END IF;
  IF pg_catalog.jsonb_typeof(v_timeline -> 'dueDate') = 'string' THEN
    v_due_date := (v_timeline ->> 'dueDate')::date;
  END IF;
  IF v_start_date IS NOT NULL AND v_due_date IS NOT NULL AND v_due_date < v_start_date THEN
    RETURN false;
  END IF;

  v_budget := p_payload -> 'budgetSignal';
  IF NOT co_production_private.preproject_exact_json_keys(
    v_budget,
    ARRAY['source', 'authority', 'band']
  )
    OR v_budget ->> 'source' IS DISTINCT FROM 'client_reported'
    OR v_budget ->> 'authority' IS DISTINCT FROM 'non_authoritative'
    OR (v_budget ->> 'band') NOT IN (
      'unknown', 'under_10k', '10k_25k', '25k_50k', '50k_100k', 'over_100k'
    )
  THEN
    RETURN false;
  END IF;

  v_consent := p_payload -> 'consent';
  IF NOT co_production_private.preproject_exact_json_keys(
    v_consent,
    ARRAY[
      'privacyAccepted', 'policyVersion', 'marketingEmailOptIn',
      'operationalSmsOptIn', 'operationalImessageOptIn'
    ]
  )
    OR v_consent -> 'privacyAccepted' IS DISTINCT FROM 'true'::jsonb
    OR pg_catalog.jsonb_typeof(v_consent -> 'policyVersion') IS DISTINCT FROM 'string'
    OR (v_consent ->> 'policyVersion') !~ '^[a-z0-9][a-z0-9._:-]{2,79}$'
    OR pg_catalog.jsonb_typeof(v_consent -> 'marketingEmailOptIn')
      IS DISTINCT FROM 'boolean'
    OR pg_catalog.jsonb_typeof(v_consent -> 'operationalSmsOptIn')
      IS DISTINCT FROM 'boolean'
    OR pg_catalog.jsonb_typeof(v_consent -> 'operationalImessageOptIn')
      IS DISTINCT FROM 'boolean'
    OR (
      pg_catalog.jsonb_typeof(v_contact -> 'phone') = 'null'
      AND (
        (v_consent ->> 'operationalSmsOptIn')::boolean
        OR (v_consent ->> 'operationalImessageOptIn')::boolean
      )
    )
  THEN
    RETURN false;
  END IF;

  RETURN true;
END
$$;

CREATE OR REPLACE FUNCTION co_production_private.qualification_payload_is_valid(
  p_payload jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
  v_account jsonb;
  v_contact jsonb;
  v_opportunity jsonb;
  v_brief jsonb;
BEGIN
  IF pg_column_size(p_payload) > 65536
    OR NOT co_production_private.preproject_exact_json_keys(
      p_payload,
      ARRAY['expectedVersion', 'requestId', 'account', 'contact', 'opportunity', 'brief']
    )
    OR pg_catalog.jsonb_typeof(p_payload -> 'expectedVersion') IS DISTINCT FROM 'number'
    OR (p_payload ->> 'expectedVersion') !~ '^[1-9][0-9]{0,9}$'
    OR (p_payload ->> 'expectedVersion')::bigint > 2147483647
    OR pg_catalog.jsonb_typeof(p_payload -> 'requestId') IS DISTINCT FROM 'string'
    OR (p_payload ->> 'requestId')
      !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN
    RETURN false;
  END IF;

  v_account := p_payload -> 'account';
  IF NOT co_production_private.preproject_exact_json_keys(
    v_account,
    ARRAY['displayName', 'legalName', 'website']
  )
    OR pg_catalog.jsonb_typeof(v_account -> 'displayName') IS DISTINCT FROM 'string'
    OR NOT co_production_private.preproject_safe_text(
      v_account ->> 'displayName', 1, 240
    )
    OR (
      pg_catalog.jsonb_typeof(v_account -> 'legalName') IS DISTINCT FROM 'null'
      AND (
        pg_catalog.jsonb_typeof(v_account -> 'legalName') IS DISTINCT FROM 'string'
        OR NOT co_production_private.preproject_safe_text(
          v_account ->> 'legalName', 1, 240
        )
      )
    )
    OR (
      pg_catalog.jsonb_typeof(v_account -> 'website') IS DISTINCT FROM 'null'
      AND (
        pg_catalog.jsonb_typeof(v_account -> 'website') IS DISTINCT FROM 'string'
        OR NOT co_production_private.preproject_https_url_is_valid(
          v_account ->> 'website'
        )
      )
    )
  THEN
    RETURN false;
  END IF;

  v_contact := p_payload -> 'contact';
  IF NOT co_production_private.preproject_exact_json_keys(
    v_contact,
    ARRAY['name', 'email', 'phone', 'title']
  )
    OR pg_catalog.jsonb_typeof(v_contact -> 'name') IS DISTINCT FROM 'string'
    OR NOT co_production_private.preproject_safe_text(v_contact ->> 'name', 1, 240)
    OR pg_catalog.jsonb_typeof(v_contact -> 'email') IS DISTINCT FROM 'string'
    OR NOT co_production_private.preproject_safe_text(v_contact ->> 'email', 3, 254)
    OR (v_contact ->> 'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR (
      pg_catalog.jsonb_typeof(v_contact -> 'phone') IS DISTINCT FROM 'null'
      AND (
        pg_catalog.jsonb_typeof(v_contact -> 'phone') IS DISTINCT FROM 'string'
        OR (v_contact ->> 'phone') !~ '^\+[1-9][0-9]{7,14}$'
      )
    )
    OR (
      pg_catalog.jsonb_typeof(v_contact -> 'title') IS DISTINCT FROM 'null'
      AND (
        pg_catalog.jsonb_typeof(v_contact -> 'title') IS DISTINCT FROM 'string'
        OR NOT co_production_private.preproject_safe_text(
          v_contact ->> 'title', 1, 160
        )
      )
    )
  THEN
    RETURN false;
  END IF;

  v_opportunity := p_payload -> 'opportunity';
  IF NOT co_production_private.preproject_exact_json_keys(
    v_opportunity,
    ARRAY['name', 'ownerId', 'probabilityBasisPoints', 'expectedCloseDate']
  )
    OR pg_catalog.jsonb_typeof(v_opportunity -> 'name') IS DISTINCT FROM 'string'
    OR NOT co_production_private.preproject_safe_text(
      v_opportunity ->> 'name', 1, 240
    )
    OR (
      pg_catalog.jsonb_typeof(v_opportunity -> 'ownerId') IS DISTINCT FROM 'null'
      AND (
        pg_catalog.jsonb_typeof(v_opportunity -> 'ownerId') IS DISTINCT FROM 'string'
        OR (v_opportunity ->> 'ownerId')
          !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )
    )
    OR pg_catalog.jsonb_typeof(v_opportunity -> 'probabilityBasisPoints')
      IS DISTINCT FROM 'number'
    OR (v_opportunity ->> 'probabilityBasisPoints') !~ '^[0-9]{1,5}$'
    OR (v_opportunity ->> 'probabilityBasisPoints')::integer > 10000
    OR (
      pg_catalog.jsonb_typeof(v_opportunity -> 'expectedCloseDate')
        IS DISTINCT FROM 'null'
      AND (
        pg_catalog.jsonb_typeof(v_opportunity -> 'expectedCloseDate')
          IS DISTINCT FROM 'string'
        OR NOT co_production_private.preproject_iso_date_is_valid(
          v_opportunity ->> 'expectedCloseDate'
        )
      )
    )
  THEN
    RETURN false;
  END IF;

  v_brief := p_payload -> 'brief';
  IF NOT co_production_private.preproject_exact_json_keys(
    v_brief,
    ARRAY[
      'title', 'objectives', 'audiences', 'keyMessages', 'requestedDeliverables',
      'constraints', 'references', 'successCriteria'
    ]
  )
    OR pg_catalog.jsonb_typeof(v_brief -> 'title') IS DISTINCT FROM 'string'
    OR NOT co_production_private.preproject_safe_text(v_brief ->> 'title', 1, 240)
    OR NOT co_production_private.preproject_text_array_is_valid(
      v_brief -> 'objectives', 1, 20, 1000
    )
    OR NOT co_production_private.preproject_text_array_is_valid(
      v_brief -> 'audiences', 0, 20, 500
    )
    OR NOT co_production_private.preproject_text_array_is_valid(
      v_brief -> 'keyMessages', 0, 20, 1000
    )
    OR NOT co_production_private.preproject_text_array_is_valid(
      v_brief -> 'requestedDeliverables', 0, 32, 500
    )
    OR NOT co_production_private.preproject_text_array_is_valid(
      v_brief -> 'constraints', 0, 24, 1000
    )
    OR NOT co_production_private.preproject_text_array_is_valid(
      v_brief -> 'references', 0, 12, 2048, true
    )
    OR NOT co_production_private.preproject_text_array_is_valid(
      v_brief -> 'successCriteria', 0, 20, 1000
    )
  THEN
    RETURN false;
  END IF;

  RETURN true;
END
$$;

CREATE TABLE co_production.intake_forms (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES co_production.teams(id) ON DELETE RESTRICT,
  opaque_key text NOT NULL DEFAULT (
    'ifm_'
    || pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '')
    || pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '')
  ) CHECK (opaque_key ~ '^ifm_[0-9a-f]{64}$'),
  name text NOT NULL CHECK (
    co_production_private.preproject_safe_text(name, 1, 160)
  ),
  success_message text CHECK (
    success_message IS NULL
    OR co_production_private.preproject_safe_text(success_message, 1, 500)
  ),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  rate_limit_window_seconds integer NOT NULL DEFAULT 900 CHECK (
    rate_limit_window_seconds BETWEEN 60 AND 86400
  ),
  rate_limit_max_submissions integer NOT NULL DEFAULT 5 CHECK (
    rate_limit_max_submissions BETWEEN 1 AND 1000
  ),
  authority_version bigint NOT NULL DEFAULT 1 CHECK (authority_version = 1),
  creation_request_id uuid NOT NULL,
  creation_request_hash text NOT NULL CHECK (
    creation_request_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intake_forms_id_team_key UNIQUE (id, team_id),
  CONSTRAINT intake_forms_opaque_key_key UNIQUE (opaque_key),
  CONSTRAINT intake_forms_team_creation_request_key
    UNIQUE (team_id, creation_request_id)
);

CREATE TABLE co_production.public_inquiry_rate_limits (
  intake_form_id uuid NOT NULL,
  team_id uuid NOT NULL,
  request_fingerprint text NOT NULL CHECK (
    request_fingerprint
      ~ '^hmac-sha256:cco-public-inquiry-rate-limit:v1:[0-9a-f]{64}$'
  ),
  window_started_at timestamptz NOT NULL,
  window_seconds integer NOT NULL CHECK (window_seconds BETWEEN 60 AND 86400),
  request_limit integer NOT NULL CHECK (request_limit BETWEEN 1 AND 1000),
  request_count integer NOT NULL CHECK (request_count BETWEEN 1 AND request_limit),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (intake_form_id, request_fingerprint, window_started_at),
  CONSTRAINT public_inquiry_rate_limits_form_team_fk
    FOREIGN KEY (intake_form_id, team_id)
    REFERENCES co_production.intake_forms(id, team_id)
    ON DELETE RESTRICT
);

CREATE TABLE co_production.public_inquiries (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  intake_form_id uuid NOT NULL,
  team_id uuid NOT NULL,
  request_id uuid NOT NULL,
  idempotency_key text NOT NULL CHECK (
    idempotency_key = pg_catalog.lower(pg_catalog.btrim(idempotency_key))
    AND idempotency_key ~ '^[a-z0-9][a-z0-9._:-]{15,127}$'
  ),
  payload jsonb NOT NULL CHECK (
    co_production_private.public_inquiry_payload_is_valid(payload)
  ),
  payload_hash text NOT NULL CHECK (
    payload_hash ~ '^sha256:[0-9a-f]{64}$'
    AND payload_hash = co_production_private.preproject_sha256(payload::text)
  ),
  request_fingerprint text NOT NULL CHECK (
    request_fingerprint
      ~ '^hmac-sha256:cco-public-inquiry-rate-limit:v1:[0-9a-f]{64}$'
  ),
  rate_limit_window_started_at timestamptz NOT NULL,
  contact_name text NOT NULL CHECK (
    co_production_private.preproject_safe_text(contact_name, 1, 240)
  ),
  contact_email text NOT NULL CHECK (
    contact_email = pg_catalog.lower(contact_email)
    AND co_production_private.preproject_safe_text(contact_email, 3, 254)
  ),
  contact_phone text CHECK (
    contact_phone IS NULL OR contact_phone ~ '^\+[1-9][0-9]{7,14}$'
  ),
  company_name text NOT NULL CHECK (
    co_production_private.preproject_safe_text(company_name, 1, 240)
  ),
  company_website text CHECK (
    company_website IS NULL
    OR co_production_private.preproject_https_url_is_valid(company_website)
  ),
  project_title text NOT NULL CHECK (
    co_production_private.preproject_safe_text(project_title, 1, 240)
  ),
  goals text[] NOT NULL CHECK (
    pg_catalog.cardinality(goals) BETWEEN 1 AND 12
    AND pg_catalog.array_position(goals, NULL) IS NULL
  ),
  audiences text[] NOT NULL CHECK (
    pg_catalog.cardinality(audiences) BETWEEN 0 AND 12
    AND pg_catalog.array_position(audiences, NULL) IS NULL
  ),
  requested_deliverables text[] NOT NULL CHECK (
    pg_catalog.cardinality(requested_deliverables) BETWEEN 0 AND 24
    AND pg_catalog.array_position(requested_deliverables, NULL) IS NULL
  ),
  reference_urls text[] NOT NULL CHECK (
    pg_catalog.cardinality(reference_urls) BETWEEN 0 AND 12
    AND pg_catalog.array_position(reference_urls, NULL) IS NULL
  ),
  constraints text[] NOT NULL CHECK (
    pg_catalog.cardinality(constraints) BETWEEN 0 AND 20
    AND pg_catalog.array_position(constraints, NULL) IS NULL
  ),
  notes text CHECK (
    notes IS NULL OR co_production_private.preproject_safe_text(notes, 1, 4000)
  ),
  desired_start_date date,
  due_date date,
  timeline_flexibility text NOT NULL CHECK (
    timeline_flexibility IN ('fixed', 'somewhat_flexible', 'flexible', 'unknown')
  ),
  budget_band text NOT NULL CHECK (
    budget_band IN (
      'unknown', 'under_10k', '10k_25k', '25k_50k', '50k_100k', 'over_100k'
    )
  ),
  privacy_accepted boolean NOT NULL CHECK (privacy_accepted),
  consent_policy_version text NOT NULL CHECK (
    consent_policy_version ~ '^[a-z0-9][a-z0-9._:-]{2,79}$'
  ),
  marketing_email_opt_in boolean NOT NULL,
  operational_sms_opt_in boolean NOT NULL,
  operational_imessage_opt_in boolean NOT NULL,
  consent_recorded_at timestamptz NOT NULL,
  authority_version bigint NOT NULL DEFAULT 1 CHECK (authority_version = 1),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT public_inquiries_id_team_key UNIQUE (id, team_id),
  CONSTRAINT public_inquiries_team_request_key UNIQUE (team_id, request_id),
  CONSTRAINT public_inquiries_form_idempotency_key
    UNIQUE (intake_form_id, idempotency_key),
  CONSTRAINT public_inquiries_date_order CHECK (
    desired_start_date IS NULL OR due_date IS NULL OR due_date >= desired_start_date
  ),
  CONSTRAINT public_inquiries_phone_consent_shape CHECK (
    contact_phone IS NOT NULL
    OR (NOT operational_sms_opt_in AND NOT operational_imessage_opt_in)
  ),
  CONSTRAINT public_inquiries_form_team_fk
    FOREIGN KEY (intake_form_id, team_id)
    REFERENCES co_production.intake_forms(id, team_id)
    ON DELETE RESTRICT,
  CONSTRAINT public_inquiries_rate_limit_evidence_fk
    FOREIGN KEY (
      intake_form_id,
      request_fingerprint,
      rate_limit_window_started_at
    )
    REFERENCES co_production.public_inquiry_rate_limits(
      intake_form_id,
      request_fingerprint,
      window_started_at
    )
    ON DELETE RESTRICT
);

CREATE TABLE co_production.crm_accounts (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES co_production.teams(id) ON DELETE RESTRICT,
  source_inquiry_id uuid NOT NULL,
  display_name text NOT NULL CHECK (
    co_production_private.preproject_safe_text(display_name, 1, 240)
  ),
  legal_name text CHECK (
    legal_name IS NULL
    OR co_production_private.preproject_safe_text(legal_name, 1, 240)
  ),
  website text CHECK (
    website IS NULL OR co_production_private.preproject_https_url_is_valid(website)
  ),
  lifecycle_status text NOT NULL DEFAULT 'active' CHECK (
    lifecycle_status IN ('active', 'archived')
  ),
  authority_version bigint NOT NULL DEFAULT 1 CHECK (authority_version = 1),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_accounts_id_team_key UNIQUE (id, team_id),
  CONSTRAINT crm_accounts_source_inquiry_key UNIQUE (team_id, source_inquiry_id),
  CONSTRAINT crm_accounts_source_inquiry_fk
    FOREIGN KEY (source_inquiry_id, team_id)
    REFERENCES co_production.public_inquiries(id, team_id)
    ON DELETE RESTRICT
);

CREATE TABLE co_production.crm_contacts (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES co_production.teams(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL,
  source_inquiry_id uuid NOT NULL,
  name text NOT NULL CHECK (
    co_production_private.preproject_safe_text(name, 1, 240)
  ),
  title text CHECK (
    title IS NULL OR co_production_private.preproject_safe_text(title, 1, 160)
  ),
  email text NOT NULL CHECK (
    email = pg_catalog.lower(email)
    AND co_production_private.preproject_safe_text(email, 3, 254)
  ),
  phone text CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$'),
  stakeholder_role text NOT NULL DEFAULT 'primary_contact' CHECK (
    stakeholder_role = 'primary_contact'
  ),
  marketing_email_consent_status text NOT NULL CHECK (
    marketing_email_consent_status IN ('granted', 'denied')
  ),
  marketing_email_consent_address text NOT NULL,
  operational_sms_consent_status text NOT NULL CHECK (
    operational_sms_consent_status IN ('granted', 'denied')
  ),
  operational_sms_consent_address text,
  operational_imessage_consent_status text NOT NULL CHECK (
    operational_imessage_consent_status IN ('granted', 'denied')
  ),
  operational_imessage_consent_address text,
  consent_policy_version text NOT NULL CHECK (
    consent_policy_version ~ '^[a-z0-9][a-z0-9._:-]{2,79}$'
  ),
  consent_recorded_at timestamptz NOT NULL,
  consent_source text NOT NULL CHECK (consent_source = 'public_inquiry'),
  lifecycle_status text NOT NULL DEFAULT 'active' CHECK (
    lifecycle_status IN ('active', 'archived')
  ),
  authority_version bigint NOT NULL DEFAULT 1 CHECK (authority_version = 1),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_contacts_id_team_key UNIQUE (id, team_id),
  CONSTRAINT crm_contacts_source_inquiry_key UNIQUE (team_id, source_inquiry_id),
  CONSTRAINT crm_contacts_account_team_fk
    FOREIGN KEY (account_id, team_id)
    REFERENCES co_production.crm_accounts(id, team_id)
    ON DELETE RESTRICT,
  CONSTRAINT crm_contacts_source_inquiry_fk
    FOREIGN KEY (source_inquiry_id, team_id)
    REFERENCES co_production.public_inquiries(id, team_id)
    ON DELETE RESTRICT,
  CONSTRAINT crm_contacts_sms_consent_shape CHECK (
    operational_sms_consent_status = 'denied'
    OR operational_sms_consent_address IS NOT NULL
  ),
  CONSTRAINT crm_contacts_imessage_consent_shape CHECK (
    operational_imessage_consent_status = 'denied'
    OR operational_imessage_consent_address IS NOT NULL
  )
);

CREATE TABLE co_production.opportunities (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES co_production.teams(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL,
  primary_contact_id uuid NOT NULL,
  source_inquiry_id uuid NOT NULL,
  current_brief_revision_id uuid,
  name text NOT NULL CHECK (
    co_production_private.preproject_safe_text(name, 1, 240)
  ),
  stage text NOT NULL DEFAULT 'qualification' CHECK (
    stage IN (
      'qualification', 'discovery', 'briefing', 'proposal_requested',
      'proposal_sent', 'won', 'lost', 'on_hold'
    )
  ),
  probability_basis_points integer NOT NULL CHECK (
    probability_basis_points BETWEEN 0 AND 10000
  ),
  expected_close_date date,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  authority_version bigint NOT NULL DEFAULT 1 CHECK (authority_version = 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT opportunities_id_team_key UNIQUE (id, team_id),
  CONSTRAINT opportunities_source_inquiry_key UNIQUE (team_id, source_inquiry_id),
  CONSTRAINT opportunities_account_team_fk
    FOREIGN KEY (account_id, team_id)
    REFERENCES co_production.crm_accounts(id, team_id)
    ON DELETE RESTRICT,
  CONSTRAINT opportunities_contact_team_fk
    FOREIGN KEY (primary_contact_id, team_id)
    REFERENCES co_production.crm_contacts(id, team_id)
    ON DELETE RESTRICT,
  CONSTRAINT opportunities_source_inquiry_fk
    FOREIGN KEY (source_inquiry_id, team_id)
    REFERENCES co_production.public_inquiries(id, team_id)
    ON DELETE RESTRICT
);

CREATE TABLE co_production.creative_brief_revisions (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES co_production.teams(id) ON DELETE RESTRICT,
  opportunity_id uuid NOT NULL,
  source_inquiry_id uuid NOT NULL,
  revision_number integer NOT NULL CHECK (revision_number > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'ready_for_proposal', 'superseded')
  ),
  title text NOT NULL CHECK (
    co_production_private.preproject_safe_text(title, 1, 240)
  ),
  objectives text[] NOT NULL,
  audiences text[] NOT NULL,
  key_messages text[] NOT NULL,
  requested_deliverables text[] NOT NULL,
  constraints text[] NOT NULL,
  "references" text[] NOT NULL,
  success_criteria text[] NOT NULL,
  content jsonb NOT NULL CHECK (
    pg_catalog.jsonb_typeof(content) = 'object'
    AND pg_column_size(content) <= 65536
  ),
  content_hash text NOT NULL CHECK (content_hash ~ '^sha256:[0-9a-f]{64}$'),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT creative_brief_revisions_id_authority_key
    UNIQUE (id, team_id, opportunity_id),
  CONSTRAINT creative_brief_revisions_opportunity_revision_key
    UNIQUE (opportunity_id, revision_number),
  CONSTRAINT creative_brief_revisions_opportunity_team_fk
    FOREIGN KEY (opportunity_id, team_id)
    REFERENCES co_production.opportunities(id, team_id)
    ON DELETE RESTRICT,
  CONSTRAINT creative_brief_revisions_source_inquiry_fk
    FOREIGN KEY (source_inquiry_id, team_id)
    REFERENCES co_production.public_inquiries(id, team_id)
    ON DELETE RESTRICT
);

ALTER TABLE co_production.opportunities
  ADD CONSTRAINT opportunities_current_brief_authority_fk
  FOREIGN KEY (current_brief_revision_id, team_id, id)
  REFERENCES co_production.creative_brief_revisions(id, team_id, opportunity_id)
  ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE co_production.crm_mutation_receipts (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES co_production.teams(id) ON DELETE RESTRICT,
  inquiry_id uuid NOT NULL,
  mutation_type text NOT NULL CHECK (mutation_type = 'inquiry.qualified'),
  expected_version bigint NOT NULL CHECK (expected_version >= 1),
  mutation_version bigint NOT NULL CHECK (
    mutation_version = expected_version + 1
  ),
  request_id uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^sha256:[0-9a-f]{64}$'),
  result jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(result) = 'object'),
  receipt_hash text NOT NULL UNIQUE CHECK (
    receipt_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_mutation_receipts_id_authority_key
    UNIQUE (id, team_id, inquiry_id, mutation_version),
  CONSTRAINT crm_mutation_receipts_team_request_key UNIQUE (team_id, request_id),
  CONSTRAINT crm_mutation_receipts_inquiry_version_key
    UNIQUE (inquiry_id, mutation_version),
  CONSTRAINT crm_mutation_receipts_inquiry_team_fk
    FOREIGN KEY (inquiry_id, team_id)
    REFERENCES co_production.public_inquiries(id, team_id)
    ON DELETE RESTRICT
);

CREATE TABLE co_production.crm_mutation_events (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES co_production.teams(id) ON DELETE RESTRICT,
  inquiry_id uuid NOT NULL,
  receipt_id uuid NOT NULL,
  mutation_version bigint NOT NULL CHECK (mutation_version > 0),
  event_sequence integer NOT NULL CHECK (event_sequence > 0),
  event_type text NOT NULL CHECK (event_type = 'inquiry.qualified'),
  payload jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(payload) = 'object'),
  event_hash text NOT NULL UNIQUE CHECK (event_hash ~ '^sha256:[0-9a-f]{64}$'),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_mutation_events_receipt_sequence_key
    UNIQUE (receipt_id, event_sequence),
  CONSTRAINT crm_mutation_events_receipt_authority_fk
    FOREIGN KEY (receipt_id, team_id, inquiry_id, mutation_version)
    REFERENCES co_production.crm_mutation_receipts(
      id,
      team_id,
      inquiry_id,
      mutation_version
    )
    ON DELETE RESTRICT
);

ALTER TABLE co_production.intake_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.intake_forms FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.public_inquiry_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.public_inquiry_rate_limits FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.public_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.public_inquiries FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.crm_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.crm_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.crm_contacts FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.opportunities FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.creative_brief_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.creative_brief_revisions FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.crm_mutation_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.crm_mutation_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.crm_mutation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.crm_mutation_events FORCE ROW LEVEL SECURITY;

CREATE POLICY intake_forms_select
  ON co_production.intake_forms
  FOR SELECT TO authenticated
  USING (co_production_private.has_team_role(team_id, 70));
CREATE POLICY public_inquiries_select
  ON co_production.public_inquiries
  FOR SELECT TO authenticated
  USING (co_production_private.has_team_role(team_id, 70));
CREATE POLICY crm_accounts_select
  ON co_production.crm_accounts
  FOR SELECT TO authenticated
  USING (co_production_private.has_team_role(team_id, 70));
CREATE POLICY crm_contacts_select
  ON co_production.crm_contacts
  FOR SELECT TO authenticated
  USING (co_production_private.has_team_role(team_id, 70));
CREATE POLICY opportunities_select
  ON co_production.opportunities
  FOR SELECT TO authenticated
  USING (co_production_private.has_team_role(team_id, 70));
CREATE POLICY creative_brief_revisions_select
  ON co_production.creative_brief_revisions
  FOR SELECT TO authenticated
  USING (co_production_private.has_team_role(team_id, 70));
CREATE POLICY crm_mutation_receipts_select
  ON co_production.crm_mutation_receipts
  FOR SELECT TO authenticated
  USING (co_production_private.has_team_role(team_id, 70));
CREATE POLICY crm_mutation_events_select
  ON co_production.crm_mutation_events
  FOR SELECT TO authenticated
  USING (co_production_private.has_team_role(team_id, 70));

CREATE OR REPLACE FUNCTION co_production_private.prevent_preproject_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'preproject_records_cannot_be_deleted';
END
$$;

CREATE OR REPLACE FUNCTION co_production_private.prevent_preproject_immutable_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'preproject_record_is_immutable';
END
$$;

CREATE OR REPLACE FUNCTION co_production_private.verify_creative_brief_content_hash()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.content_hash IS DISTINCT FROM
    co_production_private.preproject_sha256(NEW.content::text)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'creative_brief_content_hash_mismatch';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER intake_forms_no_delete
BEFORE DELETE ON co_production.intake_forms
FOR EACH ROW EXECUTE FUNCTION co_production_private.prevent_preproject_delete();
CREATE TRIGGER intake_forms_no_truncate
BEFORE TRUNCATE ON co_production.intake_forms
FOR EACH STATEMENT EXECUTE FUNCTION co_production_private.prevent_preproject_delete();
CREATE TRIGGER public_inquiry_rate_limits_no_delete
BEFORE DELETE ON co_production.public_inquiry_rate_limits
FOR EACH ROW EXECUTE FUNCTION co_production_private.prevent_preproject_delete();
CREATE TRIGGER public_inquiry_rate_limits_no_truncate
BEFORE TRUNCATE ON co_production.public_inquiry_rate_limits
FOR EACH STATEMENT EXECUTE FUNCTION co_production_private.prevent_preproject_delete();

CREATE TRIGGER public_inquiries_immutable
BEFORE UPDATE OR DELETE ON co_production.public_inquiries
FOR EACH ROW
EXECUTE FUNCTION co_production_private.prevent_preproject_immutable_mutation();
CREATE TRIGGER public_inquiries_no_truncate
BEFORE TRUNCATE ON co_production.public_inquiries
FOR EACH STATEMENT
EXECUTE FUNCTION co_production_private.prevent_preproject_immutable_mutation();

CREATE TRIGGER crm_accounts_no_delete
BEFORE DELETE ON co_production.crm_accounts
FOR EACH ROW EXECUTE FUNCTION co_production_private.prevent_preproject_delete();
CREATE TRIGGER crm_accounts_no_truncate
BEFORE TRUNCATE ON co_production.crm_accounts
FOR EACH STATEMENT EXECUTE FUNCTION co_production_private.prevent_preproject_delete();
CREATE TRIGGER crm_contacts_no_delete
BEFORE DELETE ON co_production.crm_contacts
FOR EACH ROW EXECUTE FUNCTION co_production_private.prevent_preproject_delete();
CREATE TRIGGER crm_contacts_no_truncate
BEFORE TRUNCATE ON co_production.crm_contacts
FOR EACH STATEMENT EXECUTE FUNCTION co_production_private.prevent_preproject_delete();
CREATE TRIGGER opportunities_no_delete
BEFORE DELETE ON co_production.opportunities
FOR EACH ROW EXECUTE FUNCTION co_production_private.prevent_preproject_delete();
CREATE TRIGGER opportunities_no_truncate
BEFORE TRUNCATE ON co_production.opportunities
FOR EACH STATEMENT EXECUTE FUNCTION co_production_private.prevent_preproject_delete();

CREATE TRIGGER creative_brief_revisions_verify_hash
BEFORE INSERT ON co_production.creative_brief_revisions
FOR EACH ROW
EXECUTE FUNCTION co_production_private.verify_creative_brief_content_hash();
CREATE TRIGGER creative_brief_revisions_immutable
BEFORE UPDATE OR DELETE ON co_production.creative_brief_revisions
FOR EACH ROW
EXECUTE FUNCTION co_production_private.prevent_preproject_immutable_mutation();
CREATE TRIGGER creative_brief_revisions_no_truncate
BEFORE TRUNCATE ON co_production.creative_brief_revisions
FOR EACH STATEMENT
EXECUTE FUNCTION co_production_private.prevent_preproject_immutable_mutation();

CREATE TRIGGER crm_mutation_receipts_immutable
BEFORE UPDATE OR DELETE ON co_production.crm_mutation_receipts
FOR EACH ROW
EXECUTE FUNCTION co_production_private.prevent_preproject_immutable_mutation();
CREATE TRIGGER crm_mutation_receipts_no_truncate
BEFORE TRUNCATE ON co_production.crm_mutation_receipts
FOR EACH STATEMENT
EXECUTE FUNCTION co_production_private.prevent_preproject_immutable_mutation();
CREATE TRIGGER crm_mutation_events_immutable
BEFORE UPDATE OR DELETE ON co_production.crm_mutation_events
FOR EACH ROW
EXECUTE FUNCTION co_production_private.prevent_preproject_immutable_mutation();
CREATE TRIGGER crm_mutation_events_no_truncate
BEFORE TRUNCATE ON co_production.crm_mutation_events
FOR EACH STATEMENT
EXECUTE FUNCTION co_production_private.prevent_preproject_immutable_mutation();

CREATE OR REPLACE FUNCTION co_production.create_public_intake_form(
  p_team_id uuid,
  p_name text,
  p_success_message text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_name text := pg_catalog.btrim(p_name);
  v_success_message text := NULLIF(pg_catalog.btrim(p_success_message), '');
  v_request_hash text;
  v_existing co_production.intake_forms%ROWTYPE;
  v_form co_production.intake_forms%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL
    OR NOT co_production_private.has_team_role(p_team_id, 70)
  THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crm_forbidden';
  END IF;

  IF p_team_id IS NULL
    OR p_request_id IS NULL
    OR p_name IS NULL
    OR NOT co_production_private.preproject_safe_text(v_name, 1, 160)
    OR (
      v_success_message IS NOT NULL
      AND NOT co_production_private.preproject_safe_text(v_success_message, 1, 500)
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_crm_intake_form';
  END IF;

  v_request_hash := co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'team_id', p_team_id,
      'name', v_name,
      'success_message', v_success_message,
      'request_id', p_request_id
    )::text
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'cco:create-intake-form:' || p_team_id::text || ':' || p_request_id::text,
      0
    )
  );

  SELECT form.*
  INTO v_existing
  FROM co_production.intake_forms AS form
  WHERE form.team_id = p_team_id
    AND form.creation_request_id = p_request_id;

  IF FOUND THEN
    IF v_existing.creation_request_hash IS DISTINCT FROM v_request_hash THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'crm_idempotency_conflict';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'form_id', v_existing.id,
      'team_id', v_existing.team_id,
      'form_key', v_existing.opaque_key,
      'name', v_existing.name,
      'status', v_existing.status,
      'success_message', v_existing.success_message,
      'authority_version', v_existing.authority_version,
      'request_id', v_existing.creation_request_id,
      'created_at', v_existing.created_at,
      'replayed', true
    );
  END IF;

  INSERT INTO co_production.intake_forms (
    team_id,
    name,
    success_message,
    status,
    authority_version,
    creation_request_id,
    creation_request_hash,
    created_by
  )
  VALUES (
    p_team_id,
    v_name,
    v_success_message,
    'active',
    1,
    p_request_id,
    v_request_hash,
    v_actor_id
  )
  RETURNING * INTO v_form;

  RETURN pg_catalog.jsonb_build_object(
    'form_id', v_form.id,
    'team_id', v_form.team_id,
    'form_key', v_form.opaque_key,
    'name', v_form.name,
    'status', v_form.status,
    'success_message', v_form.success_message,
    'authority_version', v_form.authority_version,
    'request_id', v_form.creation_request_id,
    'created_at', v_form.created_at,
    'replayed', false
  );
END
$$;

CREATE OR REPLACE FUNCTION co_production.submit_public_inquiry(
  p_form_key text,
  p_idempotency_key text,
  p_request_id uuid,
  p_request_fingerprint text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_form co_production.intake_forms%ROWTYPE;
  v_existing co_production.public_inquiries%ROWTYPE;
  v_payload_hash text;
  v_idempotency_key text := pg_catalog.lower(pg_catalog.btrim(p_idempotency_key));
  v_now timestamptz := statement_timestamp();
  v_window_start timestamptz;
  v_request_count integer;
  v_inquiry_id uuid := pg_catalog.gen_random_uuid();
BEGIN
  IF COALESCE((SELECT auth.jwt() ->> 'role'), '') <> 'service_role' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'public_inquiry_submission_forbidden';
  END IF;

  IF p_form_key IS NULL
    OR p_form_key !~ '^ifm_[0-9a-f]{64}$'
    OR v_idempotency_key IS NULL
    OR v_idempotency_key !~ '^[a-z0-9][a-z0-9._:-]{15,127}$'
    OR p_request_id IS NULL
    OR p_request_fingerprint IS NULL
    OR p_request_fingerprint
      !~ '^hmac-sha256:cco-public-inquiry-rate-limit:v1:[0-9a-f]{64}$'
    OR NOT co_production_private.public_inquiry_payload_is_valid(p_payload)
    OR p_payload ->> 'formKey' IS DISTINCT FROM p_form_key
    OR p_payload ->> 'idempotencyKey' IS DISTINCT FROM v_idempotency_key
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_public_inquiry';
  END IF;
  v_payload_hash := co_production_private.preproject_sha256(p_payload::text);

  SELECT form.*
  INTO v_form
  FROM co_production.intake_forms AS form
  WHERE form.opaque_key = p_form_key
    AND form.status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'public_intake_form_not_found';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'cco:public-inquiry:' || v_form.id::text || ':' || v_idempotency_key,
      0
    )
  );

  SELECT inquiry.*
  INTO v_existing
  FROM co_production.public_inquiries AS inquiry
  WHERE inquiry.intake_form_id = v_form.id
    AND inquiry.idempotency_key = v_idempotency_key;

  IF FOUND THEN
    IF v_existing.payload_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'public_inquiry_idempotency_conflict';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'status', 'received',
      'request_id', v_existing.request_id,
      'replayed', true
    );
  END IF;

  v_window_start := pg_catalog.date_bin(
    pg_catalog.make_interval(secs => v_form.rate_limit_window_seconds),
    v_now,
    '1970-01-01 00:00:00+00'::timestamptz
  );

  INSERT INTO co_production.public_inquiry_rate_limits (
    intake_form_id,
    team_id,
    request_fingerprint,
    window_started_at,
    window_seconds,
    request_limit,
    request_count,
    created_at,
    updated_at
  )
  VALUES (
    v_form.id,
    v_form.team_id,
    p_request_fingerprint,
    v_window_start,
    v_form.rate_limit_window_seconds,
    v_form.rate_limit_max_submissions,
    1,
    v_now,
    v_now
  )
  ON CONFLICT (intake_form_id, request_fingerprint, window_started_at)
  DO UPDATE SET
    request_count = co_production.public_inquiry_rate_limits.request_count + 1,
    updated_at = v_now
  WHERE co_production.public_inquiry_rate_limits.request_count
    < co_production.public_inquiry_rate_limits.request_limit
  RETURNING request_count INTO v_request_count;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'public_inquiry_rate_limited';
  END IF;

  INSERT INTO co_production.public_inquiries (
    id,
    intake_form_id,
    team_id,
    request_id,
    idempotency_key,
    payload,
    payload_hash,
    request_fingerprint,
    rate_limit_window_started_at,
    contact_name,
    contact_email,
    contact_phone,
    company_name,
    company_website,
    project_title,
    goals,
    audiences,
    requested_deliverables,
    reference_urls,
    constraints,
    notes,
    desired_start_date,
    due_date,
    timeline_flexibility,
    budget_band,
    privacy_accepted,
    consent_policy_version,
    marketing_email_opt_in,
    operational_sms_opt_in,
    operational_imessage_opt_in,
    consent_recorded_at,
    authority_version,
    submitted_at
  )
  VALUES (
    v_inquiry_id,
    v_form.id,
    v_form.team_id,
    p_request_id,
    v_idempotency_key,
    p_payload,
    v_payload_hash,
    p_request_fingerprint,
    v_window_start,
    p_payload #>> '{contact,name}',
    p_payload #>> '{contact,email}',
    p_payload #>> '{contact,phone}',
    p_payload #>> '{company,name}',
    p_payload #>> '{company,website}',
    p_payload #>> '{project,title}',
    ARRAY(SELECT pg_catalog.jsonb_array_elements_text(p_payload #> '{project,goals}')),
    ARRAY(SELECT pg_catalog.jsonb_array_elements_text(p_payload #> '{project,audiences}')),
    ARRAY(
      SELECT pg_catalog.jsonb_array_elements_text(
        p_payload #> '{project,requestedDeliverables}'
      )
    ),
    ARRAY(
      SELECT pg_catalog.jsonb_array_elements_text(p_payload #> '{project,references}')
    ),
    ARRAY(
      SELECT pg_catalog.jsonb_array_elements_text(p_payload #> '{project,constraints}')
    ),
    p_payload #>> '{project,notes}',
    (p_payload #>> '{timeline,desiredStartDate}')::date,
    (p_payload #>> '{timeline,dueDate}')::date,
    p_payload #>> '{timeline,flexibility}',
    p_payload #>> '{budgetSignal,band}',
    (p_payload #>> '{consent,privacyAccepted}')::boolean,
    p_payload #>> '{consent,policyVersion}',
    (p_payload #>> '{consent,marketingEmailOptIn}')::boolean,
    (p_payload #>> '{consent,operationalSmsOptIn}')::boolean,
    (p_payload #>> '{consent,operationalImessageOptIn}')::boolean,
    v_now,
    1,
    v_now
  );

  RETURN pg_catalog.jsonb_build_object(
    'status', 'received',
    'request_id', p_request_id,
    'replayed', false
  );
END
$$;

CREATE OR REPLACE FUNCTION co_production.qualify_inquiry(
  p_inquiry_id uuid,
  p_expected_version bigint,
  p_request_id uuid,
  p_qualification jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_inquiry co_production.public_inquiries%ROWTYPE;
  v_existing co_production.crm_mutation_receipts%ROWTYPE;
  v_current_version bigint;
  v_mutation_version bigint;
  v_request_hash text;
  v_owner_id uuid;
  v_now timestamptz := statement_timestamp();
  v_account_id uuid := pg_catalog.gen_random_uuid();
  v_contact_id uuid := pg_catalog.gen_random_uuid();
  v_opportunity_id uuid := pg_catalog.gen_random_uuid();
  v_brief_revision_id uuid := pg_catalog.gen_random_uuid();
  v_receipt_id uuid := pg_catalog.gen_random_uuid();
  v_event_id uuid := pg_catalog.gen_random_uuid();
  v_brief jsonb;
  v_brief_hash text;
  v_result jsonb;
  v_receipt_hash text;
  v_event_payload jsonb;
  v_event_hash text;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crm_forbidden';
  END IF;

  IF p_inquiry_id IS NULL
    OR p_expected_version IS NULL
    OR p_expected_version < 1
    OR p_request_id IS NULL
    OR NOT co_production_private.qualification_payload_is_valid(p_qualification)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_crm_qualification';
  END IF;

  IF (p_qualification ->> 'expectedVersion')::bigint
      IS DISTINCT FROM p_expected_version
    OR (p_qualification ->> 'requestId')::uuid IS DISTINCT FROM p_request_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_crm_qualification';
  END IF;

  SELECT inquiry.*
  INTO v_inquiry
  FROM co_production.public_inquiries AS inquiry
  WHERE inquiry.id = p_inquiry_id
  FOR UPDATE;

  IF NOT FOUND
    OR NOT co_production_private.has_team_role(v_inquiry.team_id, 70)
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'crm_not_found';
  END IF;

  v_request_hash := co_production_private.preproject_sha256(p_qualification::text);
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'cco:qualify-inquiry:' || v_inquiry.team_id::text || ':' || p_request_id::text,
      0
    )
  );

  SELECT receipt.*
  INTO v_existing
  FROM co_production.crm_mutation_receipts AS receipt
  WHERE receipt.team_id = v_inquiry.team_id
    AND receipt.request_id = p_request_id;

  IF FOUND THEN
    IF v_existing.inquiry_id IS DISTINCT FROM v_inquiry.id
      OR v_existing.expected_version IS DISTINCT FROM p_expected_version
      OR v_existing.request_hash IS DISTINCT FROM v_request_hash
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'crm_idempotency_conflict';
    END IF;
    RETURN v_existing.result || pg_catalog.jsonb_build_object('replayed', true);
  END IF;

  SELECT COALESCE(
    pg_catalog.max(receipt.mutation_version),
    v_inquiry.authority_version
  )
  INTO v_current_version
  FROM co_production.crm_mutation_receipts AS receipt
  WHERE receipt.inquiry_id = v_inquiry.id;

  IF v_current_version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'crm_version_conflict';
  END IF;
  v_mutation_version := v_current_version + 1;

  v_owner_id := COALESCE(
    (p_qualification #>> '{opportunity,ownerId}')::uuid,
    v_actor_id
  );
  IF NOT EXISTS (
    SELECT 1
    FROM co_production.teams AS team
    WHERE team.id = v_inquiry.team_id
      AND (
        team.owner_id = v_owner_id
        OR EXISTS (
          SELECT 1
          FROM co_production.team_members AS member
          WHERE member.team_id = team.id
            AND member.user_id = v_owner_id
            AND co_production_private.role_rank(member.role) >= 10
        )
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_crm_qualification';
  END IF;

  INSERT INTO co_production.crm_accounts (
    id,
    team_id,
    source_inquiry_id,
    display_name,
    legal_name,
    website,
    lifecycle_status,
    authority_version,
    created_by,
    created_at,
    updated_at
  )
  VALUES (
    v_account_id,
    v_inquiry.team_id,
    v_inquiry.id,
    p_qualification #>> '{account,displayName}',
    p_qualification #>> '{account,legalName}',
    p_qualification #>> '{account,website}',
    'active',
    1,
    v_actor_id,
    v_now,
    v_now
  );

  INSERT INTO co_production.crm_contacts (
    id,
    team_id,
    account_id,
    source_inquiry_id,
    name,
    title,
    email,
    phone,
    stakeholder_role,
    marketing_email_consent_status,
    marketing_email_consent_address,
    operational_sms_consent_status,
    operational_sms_consent_address,
    operational_imessage_consent_status,
    operational_imessage_consent_address,
    consent_policy_version,
    consent_recorded_at,
    consent_source,
    lifecycle_status,
    authority_version,
    created_by,
    created_at,
    updated_at
  )
  VALUES (
    v_contact_id,
    v_inquiry.team_id,
    v_account_id,
    v_inquiry.id,
    p_qualification #>> '{contact,name}',
    p_qualification #>> '{contact,title}',
    p_qualification #>> '{contact,email}',
    p_qualification #>> '{contact,phone}',
    'primary_contact',
    CASE WHEN v_inquiry.marketing_email_opt_in THEN 'granted' ELSE 'denied' END,
    v_inquiry.contact_email,
    CASE WHEN v_inquiry.operational_sms_opt_in THEN 'granted' ELSE 'denied' END,
    v_inquiry.contact_phone,
    CASE WHEN v_inquiry.operational_imessage_opt_in THEN 'granted' ELSE 'denied' END,
    v_inquiry.contact_phone,
    v_inquiry.consent_policy_version,
    v_inquiry.consent_recorded_at,
    'public_inquiry',
    'active',
    1,
    v_actor_id,
    v_now,
    v_now
  );

  INSERT INTO co_production.opportunities (
    id,
    team_id,
    account_id,
    primary_contact_id,
    source_inquiry_id,
    current_brief_revision_id,
    name,
    stage,
    probability_basis_points,
    expected_close_date,
    owner_id,
    authority_version,
    created_at,
    updated_at
  )
  VALUES (
    v_opportunity_id,
    v_inquiry.team_id,
    v_account_id,
    v_contact_id,
    v_inquiry.id,
    NULL,
    p_qualification #>> '{opportunity,name}',
    'qualification',
    (p_qualification #>> '{opportunity,probabilityBasisPoints}')::integer,
    (p_qualification #>> '{opportunity,expectedCloseDate}')::date,
    v_owner_id,
    1,
    v_now,
    v_now
  );

  v_brief := p_qualification -> 'brief';
  v_brief_hash := co_production_private.preproject_sha256(v_brief::text);
  INSERT INTO co_production.creative_brief_revisions (
    id,
    team_id,
    opportunity_id,
    source_inquiry_id,
    revision_number,
    status,
    title,
    objectives,
    audiences,
    key_messages,
    requested_deliverables,
    constraints,
    "references",
    success_criteria,
    content,
    content_hash,
    created_by,
    created_at
  )
  VALUES (
    v_brief_revision_id,
    v_inquiry.team_id,
    v_opportunity_id,
    v_inquiry.id,
    1,
    'draft',
    v_brief ->> 'title',
    ARRAY(SELECT pg_catalog.jsonb_array_elements_text(v_brief -> 'objectives')),
    ARRAY(SELECT pg_catalog.jsonb_array_elements_text(v_brief -> 'audiences')),
    ARRAY(SELECT pg_catalog.jsonb_array_elements_text(v_brief -> 'keyMessages')),
    ARRAY(
      SELECT pg_catalog.jsonb_array_elements_text(v_brief -> 'requestedDeliverables')
    ),
    ARRAY(SELECT pg_catalog.jsonb_array_elements_text(v_brief -> 'constraints')),
    ARRAY(SELECT pg_catalog.jsonb_array_elements_text(v_brief -> 'references')),
    ARRAY(SELECT pg_catalog.jsonb_array_elements_text(v_brief -> 'successCriteria')),
    v_brief,
    v_brief_hash,
    v_actor_id,
    v_now
  );

  UPDATE co_production.opportunities
  SET current_brief_revision_id = v_brief_revision_id
  WHERE id = v_opportunity_id
    AND team_id = v_inquiry.team_id;

  v_result := pg_catalog.jsonb_build_object(
    'mutation_receipt_id', v_receipt_id,
    'inquiry_id', v_inquiry.id,
    'account_id', v_account_id,
    'contact_id', v_contact_id,
    'opportunity_id', v_opportunity_id,
    'creative_brief_revision_id', v_brief_revision_id,
    'brief_revision_number', 1,
    'brief_content_hash', v_brief_hash,
    'mutation_version', v_mutation_version,
    'request_id', p_request_id,
    'replayed', false
  );
  v_receipt_hash := co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'id', v_receipt_id,
      'team_id', v_inquiry.team_id,
      'inquiry_id', v_inquiry.id,
      'mutation_type', 'inquiry.qualified',
      'expected_version', p_expected_version,
      'mutation_version', v_mutation_version,
      'request_id', p_request_id,
      'request_hash', v_request_hash,
      'result', v_result,
      'actor_id', v_actor_id,
      'created_at', v_now
    )::text
  );

  INSERT INTO co_production.crm_mutation_receipts (
    id,
    team_id,
    inquiry_id,
    mutation_type,
    expected_version,
    mutation_version,
    request_id,
    request_hash,
    result,
    receipt_hash,
    actor_id,
    created_at
  )
  VALUES (
    v_receipt_id,
    v_inquiry.team_id,
    v_inquiry.id,
    'inquiry.qualified',
    p_expected_version,
    v_mutation_version,
    p_request_id,
    v_request_hash,
    v_result,
    v_receipt_hash,
    v_actor_id,
    v_now
  );

  v_event_payload := pg_catalog.jsonb_build_object(
    'account_id', v_account_id,
    'contact_id', v_contact_id,
    'opportunity_id', v_opportunity_id,
    'creative_brief_revision_id', v_brief_revision_id,
    'brief_content_hash', v_brief_hash
  );
  v_event_hash := co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'id', v_event_id,
      'receipt_id', v_receipt_id,
      'team_id', v_inquiry.team_id,
      'inquiry_id', v_inquiry.id,
      'mutation_version', v_mutation_version,
      'event_sequence', 1,
      'event_type', 'inquiry.qualified',
      'payload', v_event_payload,
      'actor_id', v_actor_id,
      'occurred_at', v_now
    )::text
  );

  INSERT INTO co_production.crm_mutation_events (
    id,
    team_id,
    inquiry_id,
    receipt_id,
    mutation_version,
    event_sequence,
    event_type,
    payload,
    event_hash,
    actor_id,
    occurred_at
  )
  VALUES (
    v_event_id,
    v_inquiry.team_id,
    v_inquiry.id,
    v_receipt_id,
    v_mutation_version,
    1,
    'inquiry.qualified',
    v_event_payload,
    v_event_hash,
    v_actor_id,
    v_now
  );

  RETURN v_result;
END
$$;

CREATE VIEW co_production.preproject_pipeline
WITH (security_barrier = true, security_invoker = true)
AS
SELECT
  inquiry.team_id,
  inquiry.id AS cursor_id,
  inquiry.id AS inquiry_id,
  inquiry.submitted_at AS inquiry_submitted_at,
  opportunity.id AS opportunity_id,
  COALESCE(opportunity.name, inquiry.project_title) AS opportunity_name,
  COALESCE(opportunity.stage, 'inquiry') AS stage,
  opportunity.probability_basis_points,
  opportunity.expected_close_date,
  opportunity.owner_id,
  COALESCE(
    opportunity.authority_version,
    inquiry.authority_version
  ) AS authority_version,
  account.id AS account_id,
  COALESCE(account.display_name, inquiry.company_name) AS account_name,
  contact.id AS primary_contact_id,
  COALESCE(contact.name, inquiry.contact_name) AS contact_name,
  brief.id AS brief_revision_id,
  brief.revision_number AS brief_revision_number,
  brief.status AS brief_status,
  brief.content_hash AS brief_content_hash,
  COALESCE(opportunity.updated_at, inquiry.submitted_at) AS updated_at
FROM co_production.public_inquiries AS inquiry
LEFT JOIN co_production.opportunities AS opportunity
  ON opportunity.source_inquiry_id = inquiry.id
  AND opportunity.team_id = inquiry.team_id
LEFT JOIN co_production.crm_accounts AS account
  ON account.id = opportunity.account_id
  AND account.team_id = opportunity.team_id
LEFT JOIN co_production.crm_contacts AS contact
  ON contact.id = opportunity.primary_contact_id
  AND contact.team_id = opportunity.team_id
LEFT JOIN co_production.creative_brief_revisions AS brief
  ON brief.id = opportunity.current_brief_revision_id
  AND brief.team_id = opportunity.team_id
  AND brief.opportunity_id = opportunity.id
WHERE co_production_private.has_team_role(inquiry.team_id, 70);

REVOKE ALL ON TABLE co_production.intake_forms
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.public_inquiry_rate_limits
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.public_inquiries
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.crm_accounts
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.crm_contacts
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.opportunities
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.creative_brief_revisions
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.crm_mutation_receipts
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.crm_mutation_events
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.preproject_pipeline
  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT (
  id,
  team_id,
  name,
  status,
  success_message,
  rate_limit_window_seconds,
  rate_limit_max_submissions,
  authority_version,
  created_at,
  updated_at
) ON co_production.intake_forms TO authenticated;
GRANT SELECT ON TABLE co_production.intake_forms TO service_role;

GRANT SELECT (
  id,
  intake_form_id,
  team_id,
  request_id,
  contact_name,
  contact_email,
  contact_phone,
  company_name,
  company_website,
  project_title,
  goals,
  audiences,
  requested_deliverables,
  reference_urls,
  constraints,
  notes,
  desired_start_date,
  due_date,
  timeline_flexibility,
  budget_band,
  privacy_accepted,
  consent_policy_version,
  marketing_email_opt_in,
  operational_sms_opt_in,
  operational_imessage_opt_in,
  consent_recorded_at,
  authority_version,
  submitted_at
) ON co_production.public_inquiries TO authenticated;
GRANT SELECT ON TABLE co_production.public_inquiries TO service_role;

GRANT SELECT ON TABLE co_production.crm_accounts TO authenticated, service_role;
GRANT SELECT ON TABLE co_production.crm_contacts TO authenticated, service_role;
GRANT SELECT ON TABLE co_production.opportunities TO authenticated, service_role;
GRANT SELECT ON TABLE co_production.creative_brief_revisions
  TO authenticated, service_role;
GRANT SELECT ON TABLE co_production.crm_mutation_receipts
  TO authenticated, service_role;
GRANT SELECT ON TABLE co_production.crm_mutation_events
  TO authenticated, service_role;
GRANT SELECT ON TABLE co_production.preproject_pipeline
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION co_production.create_public_intake_form(uuid, text, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION co_production.create_public_intake_form(uuid, text, text, uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION co_production.submit_public_inquiry(text, text, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION co_production.submit_public_inquiry(text, text, uuid, text, jsonb)
  TO service_role;

REVOKE ALL ON FUNCTION co_production.qualify_inquiry(uuid, bigint, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION co_production.qualify_inquiry(uuid, bigint, uuid, jsonb)
  TO authenticated;

REVOKE ALL ON FUNCTION co_production_private.preproject_sha256(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.preproject_safe_text(text, integer, integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.preproject_exact_json_keys(jsonb, text[])
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.preproject_https_url_is_valid(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.preproject_iso_date_is_valid(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.preproject_text_array_is_valid(
  jsonb,
  integer,
  integer,
  integer,
  boolean
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.public_inquiry_payload_is_valid(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.qualification_payload_is_valid(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.prevent_preproject_delete()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.prevent_preproject_immutable_mutation()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.verify_creative_brief_content_hash()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE INDEX intake_forms_team_created_idx
  ON co_production.intake_forms(team_id, created_at DESC);
CREATE INDEX public_inquiries_team_submitted_idx
  ON co_production.public_inquiries(team_id, submitted_at DESC, id DESC);
CREATE INDEX crm_accounts_team_name_idx
  ON co_production.crm_accounts(team_id, display_name);
CREATE INDEX crm_contacts_team_email_idx
  ON co_production.crm_contacts(team_id, email);
CREATE INDEX opportunities_team_stage_updated_idx
  ON co_production.opportunities(team_id, stage, updated_at DESC, id DESC);
CREATE INDEX creative_brief_revisions_team_created_idx
  ON co_production.creative_brief_revisions(team_id, created_at DESC);
CREATE INDEX crm_mutation_events_inquiry_version_idx
  ON co_production.crm_mutation_events(inquiry_id, mutation_version, event_sequence);

COMMIT;
