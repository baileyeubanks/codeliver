-- Hermes orchestration proposal and audit authority only.
--
-- This migration stores verified, reference-only notification proposals and
-- immutable human decisions. It does not render message content, resolve raw
-- recipient addresses, enqueue delivery work, call a provider, or perform HTTP.

BEGIN;

DO $preflight$
DECLARE
  server_version_num integer := current_setting('server_version_num')::integer;
BEGIN
  IF server_version_num < 150000 THEN
    RAISE EXCEPTION 'PostgreSQL 15 or newer is required';
  END IF;

  IF pg_catalog.to_regnamespace('co_production') IS NULL
    OR pg_catalog.to_regnamespace('co_production_private') IS NULL
    OR pg_catalog.to_regprocedure(
      'co_production_private.has_team_role(uuid,integer)'
    ) IS NULL
  THEN
    RAISE EXCEPTION 'Co-Production tenant authority must be installed first';
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION co_production_private.hermes_sha256(
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

CREATE OR REPLACE FUNCTION co_production_private.hermes_identifier_is_safe(
  p_value text,
  p_maximum_length integer DEFAULT 200
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
    AND length(p_value) BETWEEN 1 AND p_maximum_length
    AND p_value = btrim(p_value)
    AND p_value ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]*$'
$$;

CREATE OR REPLACE FUNCTION co_production_private.hermes_contact_id_is_safe(
  p_value text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT
    length(p_value) BETWEEN 3 AND 160
    AND p_value = btrim(p_value)
    AND (
      p_value ~ '^contact[-_:][A-Za-z0-9][A-Za-z0-9._:-]{1,150}$'
      OR p_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
$$;

CREATE OR REPLACE FUNCTION co_production_private.hermes_contact_ids_are_safe(
  p_values text[]
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT
    cardinality(p_values) BETWEEN 1 AND 50
    AND pg_catalog.array_position(p_values, NULL) IS NULL
    AND (
      SELECT pg_catalog.count(*) = pg_catalog.count(DISTINCT item.value)
        AND pg_catalog.bool_and(
          co_production_private.hermes_contact_id_is_safe(item.value)
        )
      FROM pg_catalog.unnest(p_values) AS item(value)
    )
$$;

CREATE OR REPLACE FUNCTION co_production_private.hermes_channels_are_safe(
  p_values text[],
  p_allow_private_imessage boolean DEFAULT false,
  p_allow_empty boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT
    cardinality(p_values) BETWEEN CASE WHEN p_allow_empty THEN 0 ELSE 1 END AND 4
    AND pg_catalog.array_position(p_values, NULL) IS NULL
    AND p_values <@ CASE
      WHEN p_allow_private_imessage
        THEN ARRAY['in_app', 'email', 'sms', 'imessage']::text[]
      ELSE ARRAY['in_app', 'email', 'sms']::text[]
    END
    AND (
      SELECT pg_catalog.count(*) = pg_catalog.count(DISTINCT item.value)
      FROM pg_catalog.unnest(p_values) AS item(value)
    )
$$;

CREATE OR REPLACE FUNCTION co_production_private.hermes_orchestration_payload_is_safe(
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
  v_source jsonb;
  v_template jsonb;
  v_schedule jsonb;
  v_contact_ids text[];
  v_channels text[];
  v_not_before_text text;
  v_expires_at_text text;
  v_not_before timestamptz;
  v_expires_at timestamptz;
  v_revision bigint;
  v_class text;
BEGIN
  IF pg_catalog.jsonb_typeof(p_payload) <> 'object'
    OR pg_catalog.pg_column_size(p_payload) > 24576
    OR NOT p_payload ?& ARRAY[
      'orchestrationMode',
      'communicationClass',
      'tenantId',
      'sourceRecord',
      'eventType',
      'template',
      'recipientContactIds',
      'candidateChannels',
      'purpose',
      'requestedSchedule',
      'idempotencyKey',
      'correlationId',
      'humanApprovalRequired',
      'audience'
    ]
    OR p_payload - ARRAY[
      'orchestrationMode',
      'communicationClass',
      'tenantId',
      'sourceRecord',
      'eventType',
      'template',
      'recipientContactIds',
      'candidateChannels',
      'purpose',
      'requestedSchedule',
      'idempotencyKey',
      'correlationId',
      'humanApprovalRequired',
      'audience'
    ] IS DISTINCT FROM '{}'::jsonb
    OR p_payload ->> 'orchestrationMode' IS DISTINCT FROM 'proposal_only'
    OR p_payload -> 'humanApprovalRequired' IS DISTINCT FROM 'true'::jsonb
    OR pg_catalog.jsonb_typeof(p_payload -> 'communicationClass') <> 'string'
    OR pg_catalog.jsonb_typeof(p_payload -> 'tenantId') <> 'string'
    OR pg_catalog.jsonb_typeof(p_payload -> 'eventType') <> 'string'
    OR pg_catalog.jsonb_typeof(p_payload -> 'purpose') <> 'string'
    OR pg_catalog.jsonb_typeof(p_payload -> 'idempotencyKey') <> 'string'
    OR pg_catalog.jsonb_typeof(p_payload -> 'correlationId') <> 'string'
    OR pg_catalog.jsonb_typeof(p_payload -> 'audience') <> 'string'
    OR (p_payload ->> 'tenantId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR co_production_private.hermes_identifier_is_safe(
      p_payload ->> 'idempotencyKey',
      240
    ) IS NOT TRUE
    OR co_production_private.hermes_identifier_is_safe(
      p_payload ->> 'correlationId',
      240
    ) IS NOT TRUE
  THEN
    RETURN false;
  END IF;

  v_source := p_payload -> 'sourceRecord';
  v_template := p_payload -> 'template';
  v_schedule := p_payload -> 'requestedSchedule';

  IF pg_catalog.jsonb_typeof(v_source) <> 'object'
    OR NOT v_source ?& ARRAY['kind', 'id']
    OR v_source - ARRAY['kind', 'id'] IS DISTINCT FROM '{}'::jsonb
    OR pg_catalog.jsonb_typeof(v_source -> 'kind') <> 'string'
    OR pg_catalog.jsonb_typeof(v_source -> 'id') <> 'string'
    OR v_source ->> 'kind' NOT IN (
      'project',
      'production_task',
      'deliverable',
      'asset',
      'review',
      'approval',
      'comment',
      'export',
      'operator_command'
    )
    OR co_production_private.hermes_identifier_is_safe(
      v_source ->> 'id',
      200
    ) IS NOT TRUE
    OR pg_catalog.jsonb_typeof(v_template) <> 'object'
    OR NOT v_template ?& ARRAY['id', 'revision']
    OR v_template - ARRAY['id', 'revision'] IS DISTINCT FROM '{}'::jsonb
    OR pg_catalog.jsonb_typeof(v_template -> 'id') <> 'string'
    OR co_production_private.hermes_identifier_is_safe(
      v_template ->> 'id',
      200
    ) IS NOT TRUE
    OR pg_catalog.jsonb_typeof(v_template -> 'revision') <> 'number'
    OR (v_template ->> 'revision') !~ '^[0-9]+$'
    OR pg_catalog.jsonb_typeof(v_schedule) <> 'object'
    OR NOT v_schedule ?& ARRAY['notBefore', 'expiresAt']
    OR v_schedule - ARRAY['notBefore', 'expiresAt'] IS DISTINCT FROM '{}'::jsonb
    OR pg_catalog.jsonb_typeof(v_schedule -> 'notBefore') <> 'string'
    OR pg_catalog.jsonb_typeof(v_schedule -> 'expiresAt') <> 'string'
  THEN
    RETURN false;
  END IF;

  BEGIN
    v_revision := (v_template ->> 'revision')::bigint;
    IF v_revision NOT BETWEEN 1 AND 1000000 THEN
      RETURN false;
    END IF;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RETURN false;
  END;

  IF pg_catalog.jsonb_typeof(p_payload -> 'recipientContactIds') <> 'array'
    OR pg_catalog.jsonb_typeof(p_payload -> 'candidateChannels') <> 'array'
  THEN
    RETURN false;
  END IF;

  BEGIN
    SELECT pg_catalog.array_agg(item.value #>> '{}' ORDER BY item.ordinality)
    INTO v_contact_ids
    FROM pg_catalog.jsonb_array_elements(
      p_payload -> 'recipientContactIds'
    ) WITH ORDINALITY AS item(value, ordinality)
    WHERE pg_catalog.jsonb_typeof(item.value) = 'string';

    SELECT pg_catalog.array_agg(item.value #>> '{}' ORDER BY item.ordinality)
    INTO v_channels
    FROM pg_catalog.jsonb_array_elements(
      p_payload -> 'candidateChannels'
    ) WITH ORDINALITY AS item(value, ordinality)
    WHERE pg_catalog.jsonb_typeof(item.value) = 'string';
  EXCEPTION WHEN data_exception THEN
    RETURN false;
  END;

  IF cardinality(v_contact_ids) IS DISTINCT FROM
      pg_catalog.jsonb_array_length(p_payload -> 'recipientContactIds')
    OR cardinality(v_channels) IS DISTINCT FROM
      pg_catalog.jsonb_array_length(p_payload -> 'candidateChannels')
    OR co_production_private.hermes_contact_ids_are_safe(v_contact_ids)
      IS NOT TRUE
  THEN
    RETURN false;
  END IF;

  v_not_before_text := v_schedule ->> 'notBefore';
  v_expires_at_text := v_schedule ->> 'expiresAt';
  IF v_not_before_text !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
    OR v_expires_at_text !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
  THEN
    RETURN false;
  END IF;

  BEGIN
    v_not_before := v_not_before_text::timestamptz;
    v_expires_at := v_expires_at_text::timestamptz;
  EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
    RETURN false;
  END;

  IF pg_catalog.to_char(
      v_not_before AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ) IS DISTINCT FROM v_not_before_text
    OR pg_catalog.to_char(
      v_expires_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ) IS DISTINCT FROM v_expires_at_text
    OR v_expires_at <= v_not_before
    OR v_expires_at - v_not_before > interval '7 days'
    OR p_payload ->> 'purpose' NOT IN ('transactional', 'operational')
  THEN
    RETURN false;
  END IF;

  v_class := p_payload ->> 'communicationClass';
  IF v_class = 'notification' THEN
    RETURN coalesce(
      p_payload ->> 'audience' IN ('customer', 'crew')
      AND v_source ->> 'kind' <> 'operator_command'
      AND p_payload ->> 'eventType' IN (
        'project_invitation',
        'project_status_changed',
        'crew_assignment',
        'schedule_changed',
        'deadline_reminder',
        'asset_uploaded',
        'review_requested',
        'review_reminder',
        'comment_added',
        'approval_requested',
        'approval_recorded',
        'deliverable_ready',
        'delivery_completed'
      )
      AND co_production_private.hermes_channels_are_safe(
        v_channels,
        false,
        false
      ),
      false
    );
  END IF;

  IF v_class = 'private_operator_imessage_command_response' THEN
    RETURN coalesce(
      p_payload ->> 'audience' = 'operator'
      AND p_payload ->> 'purpose' = 'operational'
      AND v_source ->> 'kind' = 'operator_command'
      AND p_payload ->> 'eventType' = 'operator_command_response'
      AND cardinality(v_contact_ids) = 1
      AND v_channels = ARRAY['imessage']::text[],
      false
    );
  END IF;

  RETURN false;
END
$$;

CREATE TABLE co_production.hermes_signing_keys (
  key_id text PRIMARY KEY CHECK (
    co_production_private.hermes_identifier_is_safe(key_id, 160)
  ),
  team_id uuid NOT NULL REFERENCES co_production.teams(id) ON DELETE RESTRICT,
  algorithm text NOT NULL DEFAULT 'Ed25519' CHECK (algorithm = 'Ed25519'),
  public_key_pem text NOT NULL CHECK (
    public_key_pem ~ E'^-----BEGIN PUBLIC KEY-----\\nMCowBQYDK2VwAyEA[A-Za-z0-9+/]{43}=\\n-----END PUBLIC KEY-----\\n?$'
  ),
  status text NOT NULL CHECK (status IN ('active', 'revoked')),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  revocation_reason_code text CHECK (
    revocation_reason_code IS NULL
    OR (
      revocation_reason_code = lower(btrim(revocation_reason_code))
      AND revocation_reason_code ~ '^[a-z0-9][a-z0-9._:-]{1,119}$'
    )
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hermes_signing_keys_key_team_key UNIQUE (key_id, team_id),
  CONSTRAINT hermes_signing_keys_validity CHECK (valid_until > valid_from),
  CONSTRAINT hermes_signing_keys_status_shape CHECK (
    (
      status = 'active'
      AND revoked_at IS NULL
      AND revoked_by IS NULL
      AND revocation_reason_code IS NULL
    )
    OR (
      status = 'revoked'
      AND revoked_at IS NOT NULL
      AND revocation_reason_code IS NOT NULL
    )
  )
);

CREATE TABLE co_production.hermes_attestation_nonce_claims (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  team_id uuid NOT NULL,
  key_id text NOT NULL,
  nonce_hash text NOT NULL CHECK (nonce_hash ~ '^sha256:[0-9a-f]{64}$'),
  signature_hash text NOT NULL CHECK (
    signature_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  payload_hash text NOT NULL CHECK (
    payload_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  attestation_issued_at timestamptz NOT NULL,
  attestation_expires_at timestamptz NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hermes_attestation_nonce_claims_key_fk
    FOREIGN KEY (key_id, team_id)
    REFERENCES co_production.hermes_signing_keys(key_id, team_id)
    ON DELETE RESTRICT,
  CONSTRAINT hermes_attestation_nonce_claims_id_team_key
    UNIQUE (id, team_id),
  CONSTRAINT hermes_attestation_nonce_claims_replay_key
    UNIQUE (key_id, nonce_hash),
  CONSTRAINT hermes_attestation_nonce_claims_window CHECK (
    attestation_expires_at > attestation_issued_at
    AND attestation_expires_at - attestation_issued_at <= interval '10 minutes'
  )
);

CREATE TABLE co_production.hermes_orchestration_proposals (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES co_production.teams(id) ON DELETE RESTRICT,
  signing_key_id text NOT NULL,
  initial_nonce_claim_id uuid NOT NULL,
  communication_class text NOT NULL CHECK (
    communication_class IN (
      'notification',
      'private_operator_imessage_command_response'
    )
  ),
  idempotency_key text NOT NULL CHECK (
    co_production_private.hermes_identifier_is_safe(idempotency_key, 240)
  ),
  correlation_id text NOT NULL CHECK (
    co_production_private.hermes_identifier_is_safe(correlation_id, 240)
  ),
  source_record_kind text NOT NULL CHECK (
    source_record_kind IN (
      'project',
      'production_task',
      'deliverable',
      'asset',
      'review',
      'approval',
      'comment',
      'export',
      'operator_command'
    )
  ),
  source_record_id text NOT NULL CHECK (
    co_production_private.hermes_identifier_is_safe(source_record_id, 200)
  ),
  event_type text NOT NULL CHECK (
    event_type IN (
      'project_invitation',
      'project_status_changed',
      'crew_assignment',
      'schedule_changed',
      'deadline_reminder',
      'asset_uploaded',
      'review_requested',
      'review_reminder',
      'comment_added',
      'approval_requested',
      'approval_recorded',
      'deliverable_ready',
      'delivery_completed',
      'operator_command_response'
    )
  ),
  template_id text NOT NULL CHECK (
    co_production_private.hermes_identifier_is_safe(template_id, 200)
  ),
  template_revision integer NOT NULL CHECK (
    template_revision BETWEEN 1 AND 1000000
  ),
  requested_not_before timestamptz NOT NULL,
  requested_expires_at timestamptz NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^sha256:[0-9a-f]{64}$'),
  payload_storage_hash text NOT NULL CHECK (
    payload_storage_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  payload jsonb NOT NULL CHECK (
    co_production_private.hermes_orchestration_payload_is_safe(payload)
  ),
  human_approval_required boolean NOT NULL DEFAULT true CHECK (
    human_approval_required
  ),
  status text NOT NULL DEFAULT 'pending_human_approval' CHECK (
    status = 'pending_human_approval'
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hermes_orchestration_proposals_id_team_key UNIQUE (id, team_id),
  CONSTRAINT hermes_orchestration_proposals_idempotency_key
    UNIQUE (team_id, idempotency_key),
  CONSTRAINT hermes_orchestration_proposals_signing_key_fk
    FOREIGN KEY (signing_key_id, team_id)
    REFERENCES co_production.hermes_signing_keys(key_id, team_id)
    ON DELETE RESTRICT,
  CONSTRAINT hermes_orchestration_proposals_nonce_claim_fk
    FOREIGN KEY (initial_nonce_claim_id, team_id)
    REFERENCES co_production.hermes_attestation_nonce_claims(id, team_id)
    ON DELETE RESTRICT,
  CONSTRAINT hermes_orchestration_proposals_schedule CHECK (
    requested_expires_at > requested_not_before
    AND requested_expires_at - requested_not_before <= interval '7 days'
  ),
  CONSTRAINT hermes_orchestration_proposals_payload_storage_hash CHECK (
    payload_storage_hash =
      co_production_private.hermes_sha256(payload::text)
  ),
  CONSTRAINT hermes_orchestration_proposals_payload_binding CHECK (
    payload ->> 'tenantId' = team_id::text
    AND payload ->> 'communicationClass' = communication_class
    AND payload ->> 'idempotencyKey' = idempotency_key
    AND payload ->> 'correlationId' = correlation_id
    AND payload -> 'sourceRecord' ->> 'kind' = source_record_kind
    AND payload -> 'sourceRecord' ->> 'id' = source_record_id
    AND payload ->> 'eventType' = event_type
    AND payload -> 'template' ->> 'id' = template_id
    AND (payload -> 'template' ->> 'revision')::integer = template_revision
    AND (payload -> 'requestedSchedule' ->> 'notBefore')::timestamptz =
      requested_not_before
    AND (payload -> 'requestedSchedule' ->> 'expiresAt')::timestamptz =
      requested_expires_at
    AND payload ->> 'orchestrationMode' = 'proposal_only'
    AND payload -> 'humanApprovalRequired' = 'true'::jsonb
  )
);

CREATE TABLE co_production.hermes_notification_proposals (
  proposal_id uuid PRIMARY KEY,
  team_id uuid NOT NULL,
  audience text NOT NULL CHECK (audience IN ('customer', 'crew')),
  purpose text NOT NULL CHECK (purpose IN ('transactional', 'operational')),
  recipient_contact_ids text[] NOT NULL CHECK (
    co_production_private.hermes_contact_ids_are_safe(recipient_contact_ids)
  ),
  candidate_channels text[] NOT NULL CHECK (
    co_production_private.hermes_channels_are_safe(
      candidate_channels,
      false,
      false
    )
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hermes_notification_proposals_proposal_fk
    FOREIGN KEY (proposal_id, team_id)
    REFERENCES co_production.hermes_orchestration_proposals(id, team_id)
    ON DELETE RESTRICT
);

CREATE TABLE co_production.hermes_private_operator_command_responses (
  proposal_id uuid PRIMARY KEY,
  team_id uuid NOT NULL,
  operator_contact_id text NOT NULL CHECK (
    co_production_private.hermes_contact_id_is_safe(operator_contact_id)
  ),
  audience text NOT NULL DEFAULT 'operator' CHECK (audience = 'operator'),
  purpose text NOT NULL DEFAULT 'operational' CHECK (purpose = 'operational'),
  private_channel text NOT NULL DEFAULT 'imessage' CHECK (
    private_channel = 'imessage'
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hermes_private_operator_command_responses_proposal_fk
    FOREIGN KEY (proposal_id, team_id)
    REFERENCES co_production.hermes_orchestration_proposals(id, team_id)
    ON DELETE RESTRICT
);

CREATE TABLE co_production.hermes_orchestration_proposal_decisions (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  proposal_id uuid NOT NULL,
  team_id uuid NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^sha256:[0-9a-f]{64}$'),
  decision text NOT NULL CHECK (decision IN ('approve', 'reject')),
  reason_code text NOT NULL CHECK (
    reason_code = lower(btrim(reason_code))
    AND reason_code ~ '^[a-z0-9][a-z0-9._:-]{1,119}$'
  ),
  selected_channels text[] NOT NULL CHECK (
    co_production_private.hermes_channels_are_safe(
      selected_channels,
      true,
      true
    )
  ),
  decided_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  decided_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hermes_orchestration_proposal_decisions_one_per_proposal
    UNIQUE (proposal_id),
  CONSTRAINT hermes_orchestration_proposal_decisions_id_proposal_team_key
    UNIQUE (id, proposal_id, team_id),
  CONSTRAINT hermes_orchestration_proposal_decisions_proposal_fk
    FOREIGN KEY (proposal_id, team_id)
    REFERENCES co_production.hermes_orchestration_proposals(id, team_id)
    ON DELETE RESTRICT,
  CONSTRAINT hermes_orchestration_proposal_decisions_shape CHECK (
    (decision = 'approve' AND cardinality(selected_channels) BETWEEN 1 AND 4)
    OR (decision = 'reject' AND cardinality(selected_channels) = 0)
  )
);

CREATE TABLE co_production.hermes_orchestration_proposal_events (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  proposal_id uuid NOT NULL,
  team_id uuid NOT NULL,
  event_sequence integer NOT NULL CHECK (event_sequence > 0),
  event_type text NOT NULL CHECK (
    event_type IN (
      'proposal_recorded',
      'proposal_replayed',
      'human_approved',
      'human_rejected'
    )
  ),
  actor_kind text NOT NULL CHECK (actor_kind IN ('hermes', 'human')),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  nonce_claim_id uuid,
  decision_id uuid,
  reason_code text CHECK (
    reason_code IS NULL
    OR (
      reason_code = lower(btrim(reason_code))
      AND reason_code ~ '^[a-z0-9][a-z0-9._:-]{1,119}$'
    )
  ),
  selected_channels text[] NOT NULL DEFAULT '{}'::text[] CHECK (
    co_production_private.hermes_channels_are_safe(
      selected_channels,
      true,
      true
    )
  ),
  previous_event_fingerprint text NOT NULL CHECK (
    previous_event_fingerprint ~ '^sha256:[0-9a-f]{64}$'
  ),
  event_fingerprint text NOT NULL UNIQUE CHECK (
    event_fingerprint ~ '^sha256:[0-9a-f]{64}$'
  ),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hermes_orchestration_proposal_events_sequence_key
    UNIQUE (proposal_id, event_sequence),
  CONSTRAINT hermes_orchestration_proposal_events_proposal_fk
    FOREIGN KEY (proposal_id, team_id)
    REFERENCES co_production.hermes_orchestration_proposals(id, team_id)
    ON DELETE RESTRICT,
  CONSTRAINT hermes_orchestration_proposal_events_nonce_fk
    FOREIGN KEY (nonce_claim_id, team_id)
    REFERENCES co_production.hermes_attestation_nonce_claims(id, team_id)
    ON DELETE RESTRICT,
  CONSTRAINT hermes_orchestration_proposal_events_decision_fk
    FOREIGN KEY (decision_id, proposal_id, team_id)
    REFERENCES co_production.hermes_orchestration_proposal_decisions(
      id,
      proposal_id,
      team_id
    )
    ON DELETE RESTRICT,
  CONSTRAINT hermes_orchestration_proposal_events_actor_shape CHECK (
    (
      event_type IN ('proposal_recorded', 'proposal_replayed')
      AND actor_kind = 'hermes'
      AND actor_user_id IS NULL
      AND nonce_claim_id IS NOT NULL
      AND decision_id IS NULL
      AND reason_code IS NULL
      AND cardinality(selected_channels) = 0
    )
    OR (
      event_type = 'human_approved'
      AND actor_kind = 'human'
      AND actor_user_id IS NOT NULL
      AND nonce_claim_id IS NULL
      AND decision_id IS NOT NULL
      AND reason_code IS NOT NULL
      AND cardinality(selected_channels) BETWEEN 1 AND 4
    )
    OR (
      event_type = 'human_rejected'
      AND actor_kind = 'human'
      AND actor_user_id IS NOT NULL
      AND nonce_claim_id IS NULL
      AND decision_id IS NOT NULL
      AND reason_code IS NOT NULL
      AND cardinality(selected_channels) = 0
    )
  )
);

ALTER TABLE co_production.hermes_signing_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.hermes_signing_keys FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.hermes_attestation_nonce_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.hermes_attestation_nonce_claims FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.hermes_orchestration_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.hermes_orchestration_proposals FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.hermes_notification_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.hermes_notification_proposals FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.hermes_private_operator_command_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.hermes_private_operator_command_responses FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.hermes_orchestration_proposal_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.hermes_orchestration_proposal_decisions FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.hermes_orchestration_proposal_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.hermes_orchestration_proposal_events FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION co_production_private.reject_hermes_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'hermes_orchestration_history_is_immutable';
END
$$;

CREATE OR REPLACE FUNCTION co_production_private.guard_hermes_signing_key_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'hermes_signing_key_mutation_forbidden';
  END IF;

  IF OLD.status <> 'active'
    OR NEW.status <> 'revoked'
    OR NEW.key_id IS DISTINCT FROM OLD.key_id
    OR NEW.team_id IS DISTINCT FROM OLD.team_id
    OR NEW.algorithm IS DISTINCT FROM OLD.algorithm
    OR NEW.public_key_pem IS DISTINCT FROM OLD.public_key_pem
    OR NEW.valid_from IS DISTINCT FROM OLD.valid_from
    OR NEW.valid_until IS DISTINCT FROM OLD.valid_until
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.revoked_at IS NULL
    OR NEW.revocation_reason_code IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'hermes_signing_key_mutation_forbidden';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER hermes_signing_keys_guard
  BEFORE UPDATE OR DELETE ON co_production.hermes_signing_keys
  FOR EACH ROW EXECUTE FUNCTION
    co_production_private.guard_hermes_signing_key_mutation();
CREATE TRIGGER hermes_signing_keys_no_truncate
  BEFORE TRUNCATE ON co_production.hermes_signing_keys
  FOR EACH STATEMENT EXECUTE FUNCTION
    co_production_private.reject_hermes_history_mutation();

CREATE TRIGGER hermes_attestation_nonce_claims_immutable
  BEFORE UPDATE OR DELETE ON co_production.hermes_attestation_nonce_claims
  FOR EACH ROW EXECUTE FUNCTION
    co_production_private.reject_hermes_history_mutation();
CREATE TRIGGER hermes_attestation_nonce_claims_no_truncate
  BEFORE TRUNCATE ON co_production.hermes_attestation_nonce_claims
  FOR EACH STATEMENT EXECUTE FUNCTION
    co_production_private.reject_hermes_history_mutation();
CREATE TRIGGER hermes_orchestration_proposals_immutable
  BEFORE UPDATE OR DELETE ON co_production.hermes_orchestration_proposals
  FOR EACH ROW EXECUTE FUNCTION
    co_production_private.reject_hermes_history_mutation();
CREATE TRIGGER hermes_orchestration_proposals_no_truncate
  BEFORE TRUNCATE ON co_production.hermes_orchestration_proposals
  FOR EACH STATEMENT EXECUTE FUNCTION
    co_production_private.reject_hermes_history_mutation();
CREATE TRIGGER hermes_notification_proposals_immutable
  BEFORE UPDATE OR DELETE ON co_production.hermes_notification_proposals
  FOR EACH ROW EXECUTE FUNCTION
    co_production_private.reject_hermes_history_mutation();
CREATE TRIGGER hermes_notification_proposals_no_truncate
  BEFORE TRUNCATE ON co_production.hermes_notification_proposals
  FOR EACH STATEMENT EXECUTE FUNCTION
    co_production_private.reject_hermes_history_mutation();
CREATE TRIGGER hermes_private_operator_command_responses_immutable
  BEFORE UPDATE OR DELETE ON co_production.hermes_private_operator_command_responses
  FOR EACH ROW EXECUTE FUNCTION
    co_production_private.reject_hermes_history_mutation();
CREATE TRIGGER hermes_private_operator_command_responses_no_truncate
  BEFORE TRUNCATE ON co_production.hermes_private_operator_command_responses
  FOR EACH STATEMENT EXECUTE FUNCTION
    co_production_private.reject_hermes_history_mutation();
CREATE TRIGGER hermes_orchestration_proposal_decisions_immutable
  BEFORE UPDATE OR DELETE ON co_production.hermes_orchestration_proposal_decisions
  FOR EACH ROW EXECUTE FUNCTION
    co_production_private.reject_hermes_history_mutation();
CREATE TRIGGER hermes_orchestration_proposal_decisions_no_truncate
  BEFORE TRUNCATE ON co_production.hermes_orchestration_proposal_decisions
  FOR EACH STATEMENT EXECUTE FUNCTION
    co_production_private.reject_hermes_history_mutation();
CREATE TRIGGER hermes_orchestration_proposal_events_immutable
  BEFORE UPDATE OR DELETE ON co_production.hermes_orchestration_proposal_events
  FOR EACH ROW EXECUTE FUNCTION
    co_production_private.reject_hermes_history_mutation();
CREATE TRIGGER hermes_orchestration_proposal_events_no_truncate
  BEFORE TRUNCATE ON co_production.hermes_orchestration_proposal_events
  FOR EACH STATEMENT EXECUTE FUNCTION
    co_production_private.reject_hermes_history_mutation();

CREATE POLICY hermes_signing_keys_select
  ON co_production.hermes_signing_keys
  FOR SELECT TO authenticated
  USING (co_production_private.has_team_role(team_id, 10));
CREATE POLICY hermes_attestation_nonce_claims_select
  ON co_production.hermes_attestation_nonce_claims
  FOR SELECT TO authenticated
  USING (co_production_private.has_team_role(team_id, 10));
CREATE POLICY hermes_orchestration_proposals_select
  ON co_production.hermes_orchestration_proposals
  FOR SELECT TO authenticated
  USING (co_production_private.has_team_role(team_id, 10));
CREATE POLICY hermes_notification_proposals_select
  ON co_production.hermes_notification_proposals
  FOR SELECT TO authenticated
  USING (co_production_private.has_team_role(team_id, 10));
CREATE POLICY hermes_private_operator_command_responses_select
  ON co_production.hermes_private_operator_command_responses
  FOR SELECT TO authenticated
  USING (co_production_private.has_team_role(team_id, 10));
CREATE POLICY hermes_orchestration_proposal_decisions_select
  ON co_production.hermes_orchestration_proposal_decisions
  FOR SELECT TO authenticated
  USING (co_production_private.has_team_role(team_id, 10));
CREATE POLICY hermes_orchestration_proposal_events_select
  ON co_production.hermes_orchestration_proposal_events
  FOR SELECT TO authenticated
  USING (co_production_private.has_team_role(team_id, 10));

CREATE OR REPLACE FUNCTION co_production_private.hermes_proposal_snapshot(
  p_proposal co_production.hermes_orchestration_proposals,
  p_replayed boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'proposal_id', p_proposal.id,
    'status', coalesce(
      (
        SELECT CASE decision.decision
          WHEN 'approve' THEN 'approved'
          ELSE 'rejected'
        END
        FROM co_production.hermes_orchestration_proposal_decisions AS decision
        WHERE decision.proposal_id = p_proposal.id
      ),
      p_proposal.status
    ),
    'replayed', p_replayed
  )
$$;

CREATE OR REPLACE FUNCTION co_production_private.append_hermes_proposal_event(
  p_proposal_id uuid,
  p_team_id uuid,
  p_event_type text,
  p_actor_user_id uuid,
  p_nonce_claim_id uuid,
  p_decision_id uuid,
  p_reason_code text,
  p_selected_channels text[],
  p_occurred_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event_id uuid := pg_catalog.gen_random_uuid();
  v_event_sequence integer;
  v_previous_event_fingerprint text;
  v_event_fingerprint text;
  v_actor_kind text;
BEGIN
  SELECT
    event.event_sequence + 1,
    event.event_fingerprint
  INTO v_event_sequence, v_previous_event_fingerprint
  FROM co_production.hermes_orchestration_proposal_events AS event
  WHERE event.proposal_id = p_proposal_id
  ORDER BY event.event_sequence DESC
  LIMIT 1;

  v_event_sequence := coalesce(v_event_sequence, 1);
  v_previous_event_fingerprint := coalesce(
    v_previous_event_fingerprint,
    'sha256:' || repeat('0', 64)
  );
  v_actor_kind := CASE
    WHEN p_event_type IN ('proposal_recorded', 'proposal_replayed')
      THEN 'hermes'
    ELSE 'human'
  END;
  v_event_fingerprint := co_production_private.hermes_sha256(
    concat_ws(
      '|',
      p_proposal_id::text,
      p_team_id::text,
      v_event_sequence::text,
      p_event_type,
      v_actor_kind,
      coalesce(p_actor_user_id::text, ''),
      coalesce(p_nonce_claim_id::text, ''),
      coalesce(p_decision_id::text, ''),
      coalesce(p_reason_code, ''),
      array_to_string(coalesce(p_selected_channels, '{}'::text[]), ','),
      v_previous_event_fingerprint,
      p_occurred_at::text
    )
  );

  INSERT INTO co_production.hermes_orchestration_proposal_events (
    id,
    proposal_id,
    team_id,
    event_sequence,
    event_type,
    actor_kind,
    actor_user_id,
    nonce_claim_id,
    decision_id,
    reason_code,
    selected_channels,
    previous_event_fingerprint,
    event_fingerprint,
    occurred_at
  ) VALUES (
    v_event_id,
    p_proposal_id,
    p_team_id,
    v_event_sequence,
    p_event_type,
    v_actor_kind,
    p_actor_user_id,
    p_nonce_claim_id,
    p_decision_id,
    p_reason_code,
    coalesce(p_selected_channels, '{}'::text[]),
    v_previous_event_fingerprint,
    v_event_fingerprint,
    p_occurred_at
  );

  RETURN v_event_id;
END
$$;

CREATE OR REPLACE FUNCTION co_production.get_active_hermes_signing_key(
  p_key_id text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key co_production.hermes_signing_keys%ROWTYPE;
BEGIN
  IF coalesce((SELECT auth.role()), '') <> 'service_role' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'hermes_signing_key_lookup_forbidden';
  END IF;
  IF p_key_id IS NULL
    OR NOT co_production_private.hermes_identifier_is_safe(p_key_id, 160)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_hermes_signing_key_id';
  END IF;

  SELECT key.*
  INTO v_key
  FROM co_production.hermes_signing_keys AS key
  WHERE key.key_id = p_key_id
    AND key.algorithm = 'Ed25519'
    AND key.status = 'active'
    AND key.revoked_at IS NULL
    AND key.valid_from <= now()
    AND key.valid_until > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'hermes_signing_key_inactive_or_unknown';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'key_id', v_key.key_id,
    'public_key_pem', v_key.public_key_pem,
    'valid_from', v_key.valid_from,
    'valid_until', v_key.valid_until
  );
END
$$;

CREATE OR REPLACE FUNCTION co_production.record_hermes_orchestration_proposal(
  p_key_id text,
  p_nonce_hash text,
  p_signature_hash text,
  p_attestation_issued_at timestamptz,
  p_attestation_expires_at timestamptz,
  p_payload_hash text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := now();
  v_key co_production.hermes_signing_keys%ROWTYPE;
  v_team_id uuid;
  v_nonce_claim_id uuid;
  v_payload_storage_hash text;
  v_idempotency_key text;
  v_communication_class text;
  v_contact_ids text[];
  v_candidate_channels text[];
  v_proposal co_production.hermes_orchestration_proposals%ROWTYPE;
BEGIN
  IF coalesce((SELECT auth.role()), '') <> 'service_role' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'hermes_proposal_record_forbidden';
  END IF;
  IF p_key_id IS NULL
    OR NOT co_production_private.hermes_identifier_is_safe(p_key_id, 160)
    OR p_nonce_hash IS NULL
    OR p_signature_hash IS NULL
    OR p_payload_hash IS NULL
    OR p_payload IS NULL
    OR p_nonce_hash !~ '^sha256:[0-9a-f]{64}$'
    OR p_signature_hash !~ '^sha256:[0-9a-f]{64}$'
    OR p_payload_hash !~ '^sha256:[0-9a-f]{64}$'
    OR p_attestation_issued_at IS NULL
    OR p_attestation_expires_at IS NULL
    OR p_attestation_issued_at > v_now + interval '30 seconds'
    OR v_now - p_attestation_issued_at > interval '5 minutes'
    OR p_attestation_expires_at <= v_now
    OR p_attestation_expires_at <= p_attestation_issued_at
    OR p_attestation_expires_at - p_attestation_issued_at > interval '10 minutes'
    OR NOT co_production_private.hermes_orchestration_payload_is_safe(p_payload)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_hermes_orchestration_proposal';
  END IF;

  BEGIN
    v_team_id := (p_payload ->> 'tenantId')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_hermes_tenant_id';
  END;

  SELECT key.*
  INTO v_key
  FROM co_production.hermes_signing_keys AS key
  WHERE key.key_id = p_key_id
    AND key.team_id = v_team_id
    AND key.algorithm = 'Ed25519'
    AND key.status = 'active'
    AND key.revoked_at IS NULL
    AND key.valid_from <= p_attestation_issued_at
    AND key.valid_until >= p_attestation_expires_at
    AND key.valid_from <= v_now
    AND key.valid_until > v_now
  FOR SHARE;

  IF NOT FOUND
    OR NOT EXISTS (
      SELECT 1
      FROM co_production.teams AS team
      WHERE team.id = v_team_id
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'hermes_signing_key_or_tenant_not_found';
  END IF;

  IF (p_payload -> 'requestedSchedule' ->> 'notBefore')::timestamptz
      < p_attestation_issued_at - interval '30 seconds'
    OR (p_payload -> 'requestedSchedule' ->> 'notBefore')::timestamptz
      - p_attestation_issued_at > interval '90 days'
    OR (p_payload -> 'requestedSchedule' ->> 'expiresAt')::timestamptz <= v_now
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_hermes_requested_schedule';
  END IF;

  v_payload_storage_hash :=
    co_production_private.hermes_sha256(p_payload::text);
  v_idempotency_key := p_payload ->> 'idempotencyKey';
  v_communication_class := p_payload ->> 'communicationClass';

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_team_id::text || ':' || v_idempotency_key,
      0
    )
  );

  BEGIN
    INSERT INTO co_production.hermes_attestation_nonce_claims (
      team_id,
      key_id,
      nonce_hash,
      signature_hash,
      payload_hash,
      attestation_issued_at,
      attestation_expires_at,
      claimed_at
    ) VALUES (
      v_team_id,
      p_key_id,
      p_nonce_hash,
      p_signature_hash,
      p_payload_hash,
      p_attestation_issued_at,
      p_attestation_expires_at,
      v_now
    )
    RETURNING id INTO v_nonce_claim_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'hermes_attestation_replay';
  END;

  SELECT proposal.*
  INTO v_proposal
  FROM co_production.hermes_orchestration_proposals AS proposal
  WHERE proposal.team_id = v_team_id
    AND proposal.idempotency_key = v_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_proposal.payload_hash IS DISTINCT FROM p_payload_hash
      OR v_proposal.payload_storage_hash IS DISTINCT FROM v_payload_storage_hash
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'hermes_proposal_idempotency_conflict';
    END IF;

    PERFORM co_production_private.append_hermes_proposal_event(
      v_proposal.id,
      v_proposal.team_id,
      'proposal_replayed',
      NULL,
      v_nonce_claim_id,
      NULL,
      NULL,
      '{}'::text[],
      v_now
    );
    RETURN co_production_private.hermes_proposal_snapshot(v_proposal, true);
  END IF;

  INSERT INTO co_production.hermes_orchestration_proposals (
    team_id,
    signing_key_id,
    initial_nonce_claim_id,
    communication_class,
    idempotency_key,
    correlation_id,
    source_record_kind,
    source_record_id,
    event_type,
    template_id,
    template_revision,
    requested_not_before,
    requested_expires_at,
    payload_hash,
    payload_storage_hash,
    payload
  ) VALUES (
    v_team_id,
    p_key_id,
    v_nonce_claim_id,
    v_communication_class,
    v_idempotency_key,
    p_payload ->> 'correlationId',
    p_payload -> 'sourceRecord' ->> 'kind',
    p_payload -> 'sourceRecord' ->> 'id',
    p_payload ->> 'eventType',
    p_payload -> 'template' ->> 'id',
    (p_payload -> 'template' ->> 'revision')::integer,
    (p_payload -> 'requestedSchedule' ->> 'notBefore')::timestamptz,
    (p_payload -> 'requestedSchedule' ->> 'expiresAt')::timestamptz,
    p_payload_hash,
    v_payload_storage_hash,
    p_payload
  )
  RETURNING * INTO v_proposal;

  SELECT pg_catalog.array_agg(item.value #>> '{}' ORDER BY item.ordinality)
  INTO v_contact_ids
  FROM pg_catalog.jsonb_array_elements(
    p_payload -> 'recipientContactIds'
  ) WITH ORDINALITY AS item(value, ordinality);

  SELECT pg_catalog.array_agg(item.value #>> '{}' ORDER BY item.ordinality)
  INTO v_candidate_channels
  FROM pg_catalog.jsonb_array_elements(
    p_payload -> 'candidateChannels'
  ) WITH ORDINALITY AS item(value, ordinality);

  IF v_communication_class = 'notification' THEN
    INSERT INTO co_production.hermes_notification_proposals (
      proposal_id,
      team_id,
      audience,
      purpose,
      recipient_contact_ids,
      candidate_channels
    ) VALUES (
      v_proposal.id,
      v_team_id,
      p_payload ->> 'audience',
      p_payload ->> 'purpose',
      v_contact_ids,
      v_candidate_channels
    );
  ELSE
    INSERT INTO co_production.hermes_private_operator_command_responses (
      proposal_id,
      team_id,
      operator_contact_id
    ) VALUES (
      v_proposal.id,
      v_team_id,
      v_contact_ids[1]
    );
  END IF;

  PERFORM co_production_private.append_hermes_proposal_event(
    v_proposal.id,
    v_team_id,
    'proposal_recorded',
    NULL,
    v_nonce_claim_id,
    NULL,
    NULL,
    '{}'::text[],
    v_now
  );

  RETURN co_production_private.hermes_proposal_snapshot(v_proposal, false);
END
$$;

CREATE OR REPLACE FUNCTION co_production.decide_hermes_orchestration_proposal(
  p_proposal_id uuid,
  p_expected_payload_hash text,
  p_decision text,
  p_reason_code text,
  p_selected_channels text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_now timestamptz := now();
  v_proposal co_production.hermes_orchestration_proposals%ROWTYPE;
  v_decision co_production.hermes_orchestration_proposal_decisions%ROWTYPE;
  v_candidate_channels text[];
  v_selected_channels text[];
  v_reason_code text;
  v_decision_value text;
BEGIN
  v_decision_value := lower(btrim(p_decision));
  v_reason_code := lower(btrim(p_reason_code));

  IF coalesce((SELECT auth.role()), '') <> 'authenticated'
    OR v_actor IS NULL
    OR coalesce(
      auth.jwt() -> 'app_metadata' ->> 'content_coop_role',
      ''
    ) <> 'staff'
    OR p_proposal_id IS NULL
    OR p_expected_payload_hash IS NULL
    OR p_decision IS NULL
    OR p_reason_code IS NULL
    OR p_expected_payload_hash !~ '^sha256:[0-9a-f]{64}$'
    OR v_decision_value NOT IN ('approve', 'reject')
    OR v_reason_code !~ '^[a-z0-9][a-z0-9._:-]{1,119}$'
    OR p_selected_channels IS NULL
    OR NOT co_production_private.hermes_channels_are_safe(
      p_selected_channels,
      true,
      true
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_hermes_human_decision';
  END IF;

  SELECT proposal.*
  INTO v_proposal
  FROM co_production.hermes_orchestration_proposals AS proposal
  WHERE proposal.id = p_proposal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'hermes_proposal_not_found';
  END IF;
  IF NOT co_production_private.has_team_role(v_proposal.team_id, 80) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'hermes_human_decision_forbidden';
  END IF;
  IF v_proposal.payload_hash IS DISTINCT FROM p_expected_payload_hash THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'hermes_proposal_payload_hash_conflict';
  END IF;

  IF v_proposal.communication_class = 'notification' THEN
    SELECT detail.candidate_channels
    INTO v_candidate_channels
    FROM co_production.hermes_notification_proposals AS detail
    WHERE detail.proposal_id = v_proposal.id;
  ELSE
    SELECT ARRAY[detail.private_channel]::text[]
    INTO v_candidate_channels
    FROM co_production.hermes_private_operator_command_responses AS detail
    WHERE detail.proposal_id = v_proposal.id;
  END IF;

  SELECT coalesce(pg_catalog.array_agg(channel ORDER BY channel), '{}'::text[])
  INTO v_selected_channels
  FROM pg_catalog.unnest(p_selected_channels) AS item(channel);

  IF v_candidate_channels IS NULL
    OR v_selected_channels IS NULL
    OR NOT v_selected_channels <@ v_candidate_channels
    OR (
      v_decision_value = 'approve'
      AND cardinality(v_selected_channels) = 0
    )
    OR (
      v_decision_value = 'reject'
      AND cardinality(v_selected_channels) <> 0
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_hermes_selected_channels_or_expired_proposal';
  END IF;

  SELECT decision.*
  INTO v_decision
  FROM co_production.hermes_orchestration_proposal_decisions AS decision
  WHERE decision.proposal_id = v_proposal.id;

  IF FOUND THEN
    IF v_decision.payload_hash IS DISTINCT FROM p_expected_payload_hash
      OR v_decision.decision IS DISTINCT FROM v_decision_value
      OR v_decision.reason_code IS DISTINCT FROM v_reason_code
      OR v_decision.selected_channels IS DISTINCT FROM v_selected_channels
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'hermes_human_decision_conflict';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'proposal_id', v_proposal.id,
      'decision_id', v_decision.id,
      'status', CASE v_decision.decision
        WHEN 'approve' THEN 'approved'
        ELSE 'rejected'
      END,
      'replayed', true
    );
  END IF;

  IF v_decision_value = 'approve'
    AND v_proposal.requested_expires_at <= v_now
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'hermes_proposal_expired';
  END IF;

  INSERT INTO co_production.hermes_orchestration_proposal_decisions (
    proposal_id,
    team_id,
    payload_hash,
    decision,
    reason_code,
    selected_channels,
    decided_by,
    decided_at
  ) VALUES (
    v_proposal.id,
    v_proposal.team_id,
    p_expected_payload_hash,
    v_decision_value,
    v_reason_code,
    v_selected_channels,
    v_actor,
    v_now
  )
  RETURNING * INTO v_decision;

  PERFORM co_production_private.append_hermes_proposal_event(
    v_proposal.id,
    v_proposal.team_id,
    CASE v_decision_value
      WHEN 'approve' THEN 'human_approved'
      ELSE 'human_rejected'
    END,
    v_actor,
    NULL,
    v_decision.id,
    v_reason_code,
    v_selected_channels,
    v_now
  );

  RETURN pg_catalog.jsonb_build_object(
    'proposal_id', v_proposal.id,
    'decision_id', v_decision.id,
    'status', CASE v_decision.decision
      WHEN 'approve' THEN 'approved'
      ELSE 'rejected'
    END,
    'replayed', false
  );
END
$$;

REVOKE ALL ON TABLE co_production.hermes_signing_keys
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.hermes_attestation_nonce_claims
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.hermes_orchestration_proposals
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.hermes_notification_proposals
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.hermes_private_operator_command_responses
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.hermes_orchestration_proposal_decisions
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.hermes_orchestration_proposal_events
  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE co_production.hermes_signing_keys TO authenticated;
GRANT SELECT ON TABLE co_production.hermes_attestation_nonce_claims TO authenticated;
GRANT SELECT ON TABLE co_production.hermes_orchestration_proposals TO authenticated;
GRANT SELECT ON TABLE co_production.hermes_notification_proposals TO authenticated;
GRANT SELECT ON TABLE co_production.hermes_private_operator_command_responses TO authenticated;
GRANT SELECT ON TABLE co_production.hermes_orchestration_proposal_decisions TO authenticated;
GRANT SELECT ON TABLE co_production.hermes_orchestration_proposal_events TO authenticated;

REVOKE ALL ON FUNCTION co_production.get_active_hermes_signing_key(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production.record_hermes_orchestration_proposal(
  text, text, text, timestamptz, timestamptz, text, jsonb
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production.decide_hermes_orchestration_proposal(
  uuid, text, text, text, text[]
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION co_production.get_active_hermes_signing_key(text)
  TO service_role;
GRANT EXECUTE ON FUNCTION co_production.record_hermes_orchestration_proposal(
  text, text, text, timestamptz, timestamptz, text, jsonb
) TO service_role;
GRANT EXECUTE ON FUNCTION co_production.decide_hermes_orchestration_proposal(
  uuid, text, text, text, text[]
) TO authenticated;

REVOKE ALL ON FUNCTION co_production_private.hermes_sha256(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.hermes_identifier_is_safe(text, integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.hermes_contact_id_is_safe(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.hermes_contact_ids_are_safe(text[])
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.hermes_channels_are_safe(text[], boolean, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.hermes_orchestration_payload_is_safe(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.reject_hermes_history_mutation()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.guard_hermes_signing_key_mutation()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.hermes_proposal_snapshot(
  co_production.hermes_orchestration_proposals, boolean
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.append_hermes_proposal_event(
  uuid, uuid, text, uuid, uuid, uuid, text, text[], timestamptz
) FROM PUBLIC, anon, authenticated, service_role;

CREATE INDEX hermes_signing_keys_team_status_idx
  ON co_production.hermes_signing_keys(team_id, status, valid_until);
CREATE INDEX hermes_nonce_claims_team_claimed_idx
  ON co_production.hermes_attestation_nonce_claims(team_id, claimed_at DESC);
CREATE INDEX hermes_proposals_team_created_idx
  ON co_production.hermes_orchestration_proposals(team_id, created_at DESC, id);
CREATE INDEX hermes_proposals_source_idx
  ON co_production.hermes_orchestration_proposals(
    team_id,
    source_record_kind,
    source_record_id,
    created_at DESC
  );
CREATE INDEX hermes_events_team_proposal_idx
  ON co_production.hermes_orchestration_proposal_events(
    team_id,
    proposal_id,
    event_sequence
  );

COMMENT ON TABLE co_production.hermes_signing_keys IS
  'Ed25519 public verification keys only. No private keys or credentials.';
COMMENT ON TABLE co_production.hermes_orchestration_proposals IS
  'Reference-only Hermes proposals awaiting an immutable human decision.';
COMMENT ON TABLE co_production.hermes_notification_proposals IS
  'Customer and crew notification proposal references; no rendered content or raw destination.';
COMMENT ON TABLE co_production.hermes_private_operator_command_responses IS
  'Structurally isolated private operator iMessage command-response proposal references.';

COMMIT;
