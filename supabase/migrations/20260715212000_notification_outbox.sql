-- Durable notification queue authority only.
--
-- This migration does not install a worker, call a provider, or enable email,
-- SMS, or iMessage delivery. Recipient addresses are reduced to a redacted
-- display value plus a one-way fingerprint before they enter this boundary.

BEGIN;

CREATE OR REPLACE FUNCTION co_production_private.notification_outbox_payload_is_safe(
  p_value jsonb,
  p_depth integer DEFAULT 0
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
  v_child jsonb;
BEGIN
  IF p_depth > 16 THEN
    RETURN false;
  END IF;

  CASE pg_catalog.jsonb_typeof(p_value)
    WHEN 'object' THEN
      FOR v_key, v_child IN
        SELECT entry.key, entry.value
        FROM pg_catalog.jsonb_each(p_value) AS entry(key, value)
      LOOP
        IF v_key ~* '(recipient|email|phone|imessage|address|token|secret|password|authorization|cookie|url|body|message|content|text|subject|title)'
          OR v_key ~* '^(user[_-]?id|to|cc|bcc)$'
          OR NOT co_production_private.notification_outbox_payload_is_safe(
            v_child,
            p_depth + 1
          )
        THEN
          RETURN false;
        END IF;
      END LOOP;
      RETURN true;
    WHEN 'array' THEN
      FOR v_child IN
        SELECT entry.value
        FROM pg_catalog.jsonb_array_elements(p_value) AS entry(value)
      LOOP
        IF NOT co_production_private.notification_outbox_payload_is_safe(
          v_child,
          p_depth + 1
        ) THEN
          RETURN false;
        END IF;
      END LOOP;
      RETURN true;
    WHEN 'string' THEN
      RETURN (p_value #>> '{}') ~ '^(sha256:[0-9a-f]{64}|[A-Za-z0-9][A-Za-z0-9._+-]{0,119})$';
    WHEN 'number', 'boolean', 'null' THEN
      RETURN true;
    ELSE
      RETURN false;
  END CASE;
END
$$;

CREATE TABLE co_production.notification_outbox (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  tenant_kind text NOT NULL CHECK (tenant_kind IN ('personal', 'team')),
  tenant_id uuid NOT NULL,
  channel text NOT NULL CHECK (
    channel IN ('in_app', 'email', 'sms', 'imessage')
  ),
  idempotency_key text NOT NULL CHECK (
    idempotency_key = lower(btrim(idempotency_key))
    AND idempotency_key ~ '^[a-z0-9][a-z0-9._:-]{15,199}$'
  ),
  event_type text NOT NULL CHECK (
    event_type = lower(btrim(event_type))
    AND event_type ~ '^[a-z][a-z0-9_.-]{2,79}$'
  ),
  recipient_identity_hash text NOT NULL CHECK (
    recipient_identity_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  recipient_redacted text NOT NULL CHECK (
    length(btrim(recipient_redacted)) BETWEEN 6 AND 320
    AND recipient_redacted !~ '[[:cntrl:]]'
  ),
  payload jsonb NOT NULL CHECK (
    jsonb_typeof(payload) = 'object'
    AND pg_column_size(payload) <= 65536
    AND co_production_private.notification_outbox_payload_is_safe(payload)
  ),
  payload_fingerprint text NOT NULL CHECK (
    payload_fingerprint ~ '^sha256:[0-9a-f]{64}$'
  ),
  status text NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'leased', 'retry', 'dead', 'sent')
  ),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 12),
  available_at timestamptz NOT NULL DEFAULT now(),
  leased_at timestamptz,
  lease_owner text CHECK (
    lease_owner IS NULL
    OR (
      length(btrim(lease_owner)) BETWEEN 1 AND 160
      AND lease_owner !~ '[[:cntrl:]]'
    )
  ),
  lease_expires_at timestamptz,
  lease_fence bigint NOT NULL DEFAULT 0 CHECK (lease_fence >= 0),
  last_error_code text CHECK (
    last_error_code IS NULL
    OR last_error_code ~ '^[a-z0-9][a-z0-9._:-]{0,119}$'
  ),
  sent_at timestamptz,
  dead_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_outbox_id_tenant_key
    UNIQUE (id, tenant_kind, tenant_id),
  CONSTRAINT notification_outbox_tenant_channel_idempotency_key
    UNIQUE (tenant_kind, tenant_id, channel, idempotency_key),
  CONSTRAINT notification_outbox_attempt_bounds CHECK (
    attempt_count <= max_attempts
    AND lease_fence = attempt_count
    AND (status <> 'queued' OR attempt_count = 0)
    AND (status <> 'retry' OR attempt_count BETWEEN 1 AND max_attempts - 1)
    AND (status NOT IN ('leased', 'dead', 'sent') OR attempt_count BETWEEN 1 AND max_attempts)
  ),
  CONSTRAINT notification_outbox_lease_shape CHECK (
    (
      status = 'leased'
      AND leased_at IS NOT NULL
      AND lease_owner IS NOT NULL
      AND lease_expires_at IS NOT NULL
      AND lease_expires_at > leased_at
    )
    OR (
      status <> 'leased'
      AND leased_at IS NULL
      AND lease_owner IS NULL
      AND lease_expires_at IS NULL
    )
  ),
  CONSTRAINT notification_outbox_terminal_shape CHECK (
    (
      status = 'sent'
      AND sent_at IS NOT NULL
      AND dead_at IS NULL
    )
    OR (
      status = 'dead'
      AND dead_at IS NOT NULL
      AND sent_at IS NULL
    )
    OR (
      status IN ('queued', 'leased', 'retry')
      AND sent_at IS NULL
      AND dead_at IS NULL
    )
  ),
  CONSTRAINT notification_outbox_recipient_is_redacted CHECK (
    (
      channel = 'in_app'
      AND recipient_redacted ~ '^user:[0-9a-f]{8}\.\.\.[0-9a-f]{4}$'
    )
    OR (
      channel <> 'in_app'
      AND (
        recipient_redacted ~ '^[^*@[:space:]]\*{3}@[^*.@[:space:]]\*{3}(\.[^*@[:space:]]{2,63})?$'
        OR recipient_redacted ~ '^\+[1-9]\*{3}[0-9]{2}$'
      )
    )
  )
);

CREATE TABLE co_production.notification_outbox_events (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  tenant_kind text NOT NULL CHECK (tenant_kind IN ('personal', 'team')),
  tenant_id uuid NOT NULL,
  outbox_id uuid NOT NULL,
  event_sequence integer NOT NULL CHECK (event_sequence > 0),
  event_type text NOT NULL CHECK (
    event_type IN (
      'enqueued',
      'leased',
      'lease_renewed',
      'retry_scheduled',
      'dead_lettered',
      'sent'
    )
  ),
  status text NOT NULL CHECK (
    status IN ('queued', 'leased', 'retry', 'dead', 'sent')
  ),
  attempt_count integer NOT NULL CHECK (attempt_count >= 0),
  lease_fence bigint NOT NULL CHECK (lease_fence >= 0),
  available_at timestamptz,
  lease_expires_at timestamptz,
  actor_ref text NOT NULL CHECK (
    length(btrim(actor_ref)) BETWEEN 1 AND 160
    AND actor_ref !~ '[[:cntrl:]]'
  ),
  reason_code text CHECK (
    reason_code IS NULL
    OR reason_code ~ '^[a-z0-9][a-z0-9._:-]{0,119}$'
  ),
  previous_event_fingerprint text NOT NULL CHECK (
    previous_event_fingerprint ~ '^sha256:[0-9a-f]{64}$'
  ),
  event_fingerprint text NOT NULL UNIQUE CHECK (
    event_fingerprint ~ '^sha256:[0-9a-f]{64}$'
  ),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_outbox_events_job_fk
    FOREIGN KEY (outbox_id, tenant_kind, tenant_id)
    REFERENCES co_production.notification_outbox(id, tenant_kind, tenant_id)
    ON DELETE RESTRICT,
  UNIQUE (outbox_id, event_sequence)
);

CREATE TABLE co_production.notification_outbox_receipts (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  tenant_kind text NOT NULL CHECK (tenant_kind IN ('personal', 'team')),
  tenant_id uuid NOT NULL,
  outbox_id uuid NOT NULL,
  attempt_count integer NOT NULL CHECK (attempt_count > 0),
  lease_fence bigint NOT NULL CHECK (lease_fence > 0),
  lease_owner text NOT NULL CHECK (
    length(btrim(lease_owner)) BETWEEN 1 AND 160
    AND lease_owner !~ '[[:cntrl:]]'
  ),
  outcome text NOT NULL CHECK (outcome IN ('sent', 'retry', 'dead')),
  provider text CHECK (
    provider IS NULL
    OR (
      provider = lower(btrim(provider))
      AND provider ~ '^[a-z0-9][a-z0-9._:-]{0,79}$'
    )
  ),
  provider_message_id_hash text CHECK (
    provider_message_id_hash IS NULL
    OR provider_message_id_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  error_code text CHECK (
    error_code IS NULL
    OR error_code ~ '^[a-z0-9][a-z0-9._:-]{0,119}$'
  ),
  next_available_at timestamptz,
  payload_fingerprint text NOT NULL CHECK (
    payload_fingerprint ~ '^sha256:[0-9a-f]{64}$'
  ),
  receipt_fingerprint text NOT NULL UNIQUE CHECK (
    receipt_fingerprint ~ '^sha256:[0-9a-f]{64}$'
  ),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_outbox_receipts_job_fk
    FOREIGN KEY (outbox_id, tenant_kind, tenant_id)
    REFERENCES co_production.notification_outbox(id, tenant_kind, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT notification_outbox_receipts_one_per_fence
    UNIQUE (outbox_id, lease_fence),
  CONSTRAINT notification_outbox_receipt_shape CHECK (
    (outcome = 'retry' AND next_available_at IS NOT NULL AND error_code IS NOT NULL)
    OR (outcome = 'dead' AND next_available_at IS NULL AND error_code IS NOT NULL)
    OR (outcome = 'sent' AND next_available_at IS NULL AND error_code IS NULL)
  ),
  CONSTRAINT notification_outbox_provider_receipt_is_redacted CHECK (
    provider_message_id_hash IS NULL OR provider IS NOT NULL
  )
);

ALTER TABLE co_production.notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.notification_outbox FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.notification_outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.notification_outbox_events FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.notification_outbox_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.notification_outbox_receipts FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION co_production_private.notification_sha256(
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

CREATE OR REPLACE FUNCTION co_production_private.assert_notification_tenant_access(
  p_tenant_kind text,
  p_tenant_id uuid,
  p_required_rank integer
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_tenant_kind IS NULL
    OR p_tenant_kind NOT IN ('personal', 'team')
    OR p_tenant_id IS NULL
    OR (
      p_tenant_kind = 'personal'
      AND NOT EXISTS (
        SELECT 1 FROM auth.users AS app_user WHERE app_user.id = p_tenant_id
      )
    )
    OR (
      p_tenant_kind = 'team'
      AND NOT EXISTS (
        SELECT 1
        FROM co_production.teams AS team
        WHERE team.id = p_tenant_id
      )
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'notification_outbox_tenant_not_found';
  END IF;

  IF coalesce((SELECT auth.role()), '') = 'service_role' THEN
    RETURN;
  END IF;

  IF (SELECT auth.uid()) IS NULL
    OR (
      p_tenant_kind = 'personal'
      AND (SELECT auth.uid()) IS DISTINCT FROM p_tenant_id
    )
    OR (
      p_tenant_kind = 'team'
      AND NOT co_production_private.has_team_role(p_tenant_id, p_required_rank)
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'notification_outbox_tenant_forbidden';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION co_production_private.notification_outbox_snapshot(
  p_job co_production.notification_outbox,
  p_replayed boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'schema_version', 'cco.notification-outbox.v1',
    'outbox_id', p_job.id,
    'tenant_kind', p_job.tenant_kind,
    'tenant_id', p_job.tenant_id,
    'channel', p_job.channel,
    'idempotency_key', p_job.idempotency_key,
    'event_type', p_job.event_type,
    'recipient_identity_hash', p_job.recipient_identity_hash,
    'recipient_redacted', p_job.recipient_redacted,
    'payload', p_job.payload,
    'payload_fingerprint', p_job.payload_fingerprint,
    'status', p_job.status,
    'attempt_count', p_job.attempt_count,
    'max_attempts', p_job.max_attempts,
    'available_at', p_job.available_at,
    'lease_owner', p_job.lease_owner,
    'lease_expires_at', p_job.lease_expires_at,
    'lease_fence', p_job.lease_fence,
    'last_error_code', p_job.last_error_code,
    'sent_at', p_job.sent_at,
    'dead_at', p_job.dead_at,
    'replayed', p_replayed,
    'external_delivery_enabled', false
  )
$$;

CREATE OR REPLACE FUNCTION co_production_private.append_notification_outbox_event(
  p_job co_production.notification_outbox,
  p_event_type text,
  p_actor_ref text,
  p_reason_code text,
  p_occurred_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event_id uuid := pg_catalog.gen_random_uuid();
  v_sequence integer;
  v_previous text;
  v_fingerprint text;
BEGIN
  SELECT event.event_sequence + 1, event.event_fingerprint
  INTO v_sequence, v_previous
  FROM co_production.notification_outbox_events AS event
  WHERE event.outbox_id = p_job.id
  ORDER BY event.event_sequence DESC
  LIMIT 1;

  v_sequence := coalesce(v_sequence, 1);
  v_previous := coalesce(v_previous, 'sha256:' || repeat('0', 64));
  v_fingerprint := co_production_private.notification_sha256(
    jsonb_build_object(
      'event_id', v_event_id,
      'tenant_kind', p_job.tenant_kind,
      'tenant_id', p_job.tenant_id,
      'outbox_id', p_job.id,
      'event_sequence', v_sequence,
      'event_type', p_event_type,
      'status', p_job.status,
      'attempt_count', p_job.attempt_count,
      'lease_fence', p_job.lease_fence,
      'available_at', p_job.available_at,
      'lease_expires_at', p_job.lease_expires_at,
      'actor_ref', p_actor_ref,
      'reason_code', p_reason_code,
      'previous_event_fingerprint', v_previous,
      'occurred_at', p_occurred_at
    )::text
  );

  INSERT INTO co_production.notification_outbox_events (
    id,
    tenant_kind,
    tenant_id,
    outbox_id,
    event_sequence,
    event_type,
    status,
    attempt_count,
    lease_fence,
    available_at,
    lease_expires_at,
    actor_ref,
    reason_code,
    previous_event_fingerprint,
    event_fingerprint,
    occurred_at
  )
  VALUES (
    v_event_id,
    p_job.tenant_kind,
    p_job.tenant_id,
    p_job.id,
    v_sequence,
    p_event_type,
    p_job.status,
    p_job.attempt_count,
    p_job.lease_fence,
    p_job.available_at,
    p_job.lease_expires_at,
    p_actor_ref,
    p_reason_code,
    v_previous,
    v_fingerprint,
    p_occurred_at
  );

  RETURN v_event_id;
END
$$;

CREATE OR REPLACE FUNCTION co_production_private.notification_outbox_receipt_fingerprint(
  p_job co_production.notification_outbox,
  p_lease_owner text,
  p_outcome text,
  p_provider text,
  p_provider_message_id_hash text,
  p_error_code text,
  p_next_available_at timestamptz
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT co_production_private.notification_sha256(
    jsonb_build_object(
      'tenant_kind', p_job.tenant_kind,
      'tenant_id', p_job.tenant_id,
      'outbox_id', p_job.id,
      'attempt_count', p_job.attempt_count,
      'lease_fence', p_job.lease_fence,
      'lease_owner', p_lease_owner,
      'outcome', p_outcome,
      'provider', p_provider,
      'provider_message_id_hash', p_provider_message_id_hash,
      'error_code', p_error_code,
      'next_available_at', p_next_available_at,
      'payload_fingerprint', p_job.payload_fingerprint
    )::text
  )
$$;

CREATE OR REPLACE FUNCTION co_production_private.append_notification_outbox_receipt(
  p_job co_production.notification_outbox,
  p_lease_owner text,
  p_outcome text,
  p_provider text,
  p_provider_message_id_hash text,
  p_error_code text,
  p_next_available_at timestamptz,
  p_recorded_at timestamptz
)
RETURNS co_production.notification_outbox_receipts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_receipt co_production.notification_outbox_receipts%ROWTYPE;
  v_fingerprint text;
BEGIN
  v_fingerprint := co_production_private.notification_outbox_receipt_fingerprint(
    p_job,
    p_lease_owner,
    p_outcome,
    p_provider,
    p_provider_message_id_hash,
    p_error_code,
    p_next_available_at
  );

  SELECT receipt.*
  INTO v_receipt
  FROM co_production.notification_outbox_receipts AS receipt
  WHERE receipt.outbox_id = p_job.id
    AND receipt.lease_fence = p_job.lease_fence;

  IF FOUND THEN
    IF v_receipt.receipt_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'notification_outbox_receipt_conflict';
    END IF;
    RETURN v_receipt;
  END IF;

  INSERT INTO co_production.notification_outbox_receipts (
    tenant_kind,
    tenant_id,
    outbox_id,
    attempt_count,
    lease_fence,
    lease_owner,
    outcome,
    provider,
    provider_message_id_hash,
    error_code,
    next_available_at,
    payload_fingerprint,
    receipt_fingerprint,
    recorded_at
  )
  VALUES (
    p_job.tenant_kind,
    p_job.tenant_id,
    p_job.id,
    p_job.attempt_count,
    p_job.lease_fence,
    p_lease_owner,
    p_outcome,
    p_provider,
    p_provider_message_id_hash,
    p_error_code,
    p_next_available_at,
    p_job.payload_fingerprint,
    v_fingerprint,
    p_recorded_at
  )
  RETURNING * INTO v_receipt;

  RETURN v_receipt;
END
$$;

CREATE OR REPLACE FUNCTION co_production_private.guard_notification_outbox_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.tenant_kind IS DISTINCT FROM OLD.tenant_kind
    OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.channel IS DISTINCT FROM OLD.channel
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.event_type IS DISTINCT FROM OLD.event_type
    OR NEW.recipient_identity_hash IS DISTINCT FROM OLD.recipient_identity_hash
    OR NEW.recipient_redacted IS DISTINCT FROM OLD.recipient_redacted
    OR NEW.payload IS DISTINCT FROM OLD.payload
    OR NEW.payload_fingerprint IS DISTINCT FROM OLD.payload_fingerprint
    OR NEW.max_attempts IS DISTINCT FROM OLD.max_attempts
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'notification_outbox_authority_is_immutable';
  END IF;

  IF OLD.status IN ('dead', 'sent') THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'notification_outbox_terminal_state_is_immutable';
  END IF;

  IF OLD.status IN ('queued', 'retry') THEN
    IF NEW.status <> 'leased'
      OR NEW.attempt_count <> OLD.attempt_count + 1
      OR NEW.lease_fence <> OLD.lease_fence + 1
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'invalid_notification_outbox_transition';
    END IF;
  ELSIF OLD.status = 'leased' THEN
    IF NEW.status NOT IN ('leased', 'retry', 'dead', 'sent')
      OR NEW.attempt_count <> OLD.attempt_count
      OR NEW.lease_fence <> OLD.lease_fence
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'invalid_notification_outbox_transition';
    END IF;
    IF NEW.status = 'leased'
      AND NEW.lease_owner IS DISTINCT FROM OLD.lease_owner
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'notification_outbox_lease_owner_is_immutable';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION co_production_private.prevent_notification_outbox_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'notification_outbox_records_are_append_safe';
END
$$;

CREATE TRIGGER notification_outbox_update_guard
BEFORE UPDATE ON co_production.notification_outbox
FOR EACH ROW
EXECUTE FUNCTION co_production_private.guard_notification_outbox_update();

CREATE TRIGGER notification_outbox_no_delete
BEFORE DELETE ON co_production.notification_outbox
FOR EACH ROW
EXECUTE FUNCTION co_production_private.prevent_notification_outbox_delete();

CREATE TRIGGER notification_outbox_no_truncate
BEFORE TRUNCATE ON co_production.notification_outbox
FOR EACH STATEMENT
EXECUTE FUNCTION co_production_private.prevent_notification_outbox_delete();

CREATE TRIGGER notification_outbox_events_immutable
BEFORE UPDATE OR DELETE ON co_production.notification_outbox_events
FOR EACH ROW
EXECUTE FUNCTION co_production_private.prevent_notification_outbox_delete();

CREATE TRIGGER notification_outbox_events_no_truncate
BEFORE TRUNCATE ON co_production.notification_outbox_events
FOR EACH STATEMENT
EXECUTE FUNCTION co_production_private.prevent_notification_outbox_delete();

CREATE TRIGGER notification_outbox_receipts_immutable
BEFORE UPDATE OR DELETE ON co_production.notification_outbox_receipts
FOR EACH ROW
EXECUTE FUNCTION co_production_private.prevent_notification_outbox_delete();

CREATE TRIGGER notification_outbox_receipts_no_truncate
BEFORE TRUNCATE ON co_production.notification_outbox_receipts
FOR EACH STATEMENT
EXECUTE FUNCTION co_production_private.prevent_notification_outbox_delete();

CREATE OR REPLACE FUNCTION co_production.enqueue_notification_outbox(
  p_tenant_kind text,
  p_tenant_id uuid,
  p_channel text,
  p_idempotency_key text,
  p_event_type text,
  p_recipient_identity_hash text,
  p_recipient_redacted text,
  p_payload jsonb,
  p_available_at timestamptz DEFAULT now(),
  p_max_attempts integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job co_production.notification_outbox%ROWTYPE;
  v_existing co_production.notification_outbox%ROWTYPE;
  v_channel text := lower(btrim(p_channel));
  v_idempotency_key text := lower(btrim(p_idempotency_key));
  v_event_type text := lower(btrim(p_event_type));
  v_tenant_kind text := lower(btrim(p_tenant_kind));
  v_available_at timestamptz := coalesce(p_available_at, now());
  v_payload_fingerprint text;
  v_actor_ref text := coalesce((SELECT auth.uid())::text, 'service_role');
BEGIN
  PERFORM co_production_private.assert_notification_tenant_access(
    v_tenant_kind,
    p_tenant_id,
    60
  );

  IF v_tenant_kind IS NULL
    OR v_tenant_kind NOT IN ('personal', 'team')
    OR p_tenant_id IS NULL
    OR v_channel IS NULL
    OR v_channel NOT IN ('in_app', 'email', 'sms', 'imessage')
    OR v_idempotency_key IS NULL
    OR v_idempotency_key !~ '^[a-z0-9][a-z0-9._:-]{15,199}$'
    OR v_event_type IS NULL
    OR v_event_type !~ '^[a-z][a-z0-9_.-]{2,79}$'
    OR p_recipient_identity_hash IS NULL
    OR p_recipient_identity_hash !~ '^sha256:[0-9a-f]{64}$'
    OR p_recipient_redacted IS NULL
    OR length(btrim(p_recipient_redacted)) NOT BETWEEN 6 AND 320
    OR p_recipient_redacted ~ '[[:cntrl:]]'
    OR (
      v_channel = 'in_app'
      AND p_recipient_redacted !~ '^user:[0-9a-f]{8}\.\.\.[0-9a-f]{4}$'
    )
    OR (
      v_channel <> 'in_app'
      AND p_recipient_redacted !~ '^[^*@[:space:]]\*{3}@[^*.@[:space:]]\*{3}(\.[^*@[:space:]]{2,63})?$'
      AND p_recipient_redacted !~ '^\+[1-9]\*{3}[0-9]{2}$'
    )
    OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR pg_column_size(p_payload) > 65536
    OR NOT co_production_private.notification_outbox_payload_is_safe(p_payload)
    OR p_max_attempts IS NULL
    OR p_max_attempts NOT BETWEEN 1 AND 12
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_notification_outbox_request';
  END IF;

  v_payload_fingerprint := co_production_private.notification_sha256(
    jsonb_build_object(
      'schema_version', 'cco.notification-outbox.v1',
      'tenant_kind', v_tenant_kind,
      'tenant_id', p_tenant_id,
      'channel', v_channel,
      'event_type', v_event_type,
      'recipient_identity_hash', p_recipient_identity_hash,
      'recipient_redacted', p_recipient_redacted,
      'payload', p_payload,
      'max_attempts', p_max_attempts
    )::text
  );

  SELECT job.*
  INTO v_existing
  FROM co_production.notification_outbox AS job
  WHERE job.tenant_kind = v_tenant_kind
    AND job.tenant_id = p_tenant_id
    AND job.channel = v_channel
    AND job.idempotency_key = v_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.payload_fingerprint IS DISTINCT FROM v_payload_fingerprint THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'notification_outbox_idempotency_conflict';
    END IF;
    RETURN co_production_private.notification_outbox_snapshot(v_existing, true);
  END IF;

  BEGIN
    INSERT INTO co_production.notification_outbox (
      tenant_kind,
      tenant_id,
      channel,
      idempotency_key,
      event_type,
      recipient_identity_hash,
      recipient_redacted,
      payload,
      payload_fingerprint,
      available_at,
      max_attempts
    )
    VALUES (
      v_tenant_kind,
      p_tenant_id,
      v_channel,
      v_idempotency_key,
      v_event_type,
      p_recipient_identity_hash,
      p_recipient_redacted,
      p_payload,
      v_payload_fingerprint,
      v_available_at,
      p_max_attempts
    )
    RETURNING * INTO v_job;
  EXCEPTION WHEN unique_violation THEN
    SELECT job.*
    INTO v_existing
    FROM co_production.notification_outbox AS job
    WHERE job.tenant_kind = v_tenant_kind
      AND job.tenant_id = p_tenant_id
      AND job.channel = v_channel
      AND job.idempotency_key = v_idempotency_key;

    IF NOT FOUND
      OR v_existing.payload_fingerprint IS DISTINCT FROM v_payload_fingerprint
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'notification_outbox_idempotency_conflict';
    END IF;
    RETURN co_production_private.notification_outbox_snapshot(v_existing, true);
  END;

  PERFORM co_production_private.append_notification_outbox_event(
    v_job,
    'enqueued',
    v_actor_ref,
    NULL,
    now()
  );

  RETURN co_production_private.notification_outbox_snapshot(v_job, false);
END
$$;

CREATE OR REPLACE FUNCTION co_production.claim_notification_outbox(
  p_tenant_kind text,
  p_tenant_id uuid,
  p_lease_owner text,
  p_limit integer DEFAULT 20,
  p_lease_seconds integer DEFAULT 60
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job co_production.notification_outbox%ROWTYPE;
  v_now timestamptz := now();
  v_previous_lease_owner text;
  v_receipt co_production.notification_outbox_receipts%ROWTYPE;
  v_tenant_kind text := lower(btrim(p_tenant_kind));
BEGIN
  IF coalesce((SELECT auth.role()), '') <> 'service_role' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'notification_outbox_worker_forbidden';
  END IF;
  IF v_tenant_kind IS NULL
    OR v_tenant_kind NOT IN ('personal', 'team')
    OR p_tenant_id IS NULL
    OR p_lease_owner IS NULL
    OR length(btrim(p_lease_owner)) NOT BETWEEN 1 AND 160
    OR p_lease_owner ~ '[[:cntrl:]]'
    OR p_limit IS NULL
    OR p_limit NOT BETWEEN 1 AND 100
    OR p_lease_seconds IS NULL
    OR p_lease_seconds NOT BETWEEN 5 AND 900
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_notification_outbox_claim';
  END IF;

  FOR v_job IN
    SELECT job.*
    FROM co_production.notification_outbox AS job
    WHERE job.tenant_kind = v_tenant_kind
      AND job.tenant_id = p_tenant_id
      AND job.status = 'leased'
      AND job.lease_expires_at <= v_now
    ORDER BY job.lease_expires_at, job.id
    LIMIT 100
    FOR UPDATE SKIP LOCKED
  LOOP
    v_previous_lease_owner := v_job.lease_owner;
    IF v_job.attempt_count >= v_job.max_attempts THEN
      UPDATE co_production.notification_outbox AS job
      SET
        status = 'dead',
        leased_at = NULL,
        lease_owner = NULL,
        lease_expires_at = NULL,
        last_error_code = 'lease_expired',
        dead_at = v_now
      WHERE job.id = v_job.id
      RETURNING * INTO v_job;

      v_receipt := co_production_private.append_notification_outbox_receipt(
        v_job,
        v_previous_lease_owner,
        'dead',
        NULL,
        NULL,
        'lease_expired',
        NULL,
        v_now
      );
      PERFORM co_production_private.append_notification_outbox_event(
        v_job,
        'dead_lettered',
        'system:lease-reaper',
        'lease_expired',
        v_now
      );
    ELSE
      UPDATE co_production.notification_outbox AS job
      SET
        status = 'retry',
        available_at = v_now,
        leased_at = NULL,
        lease_owner = NULL,
        lease_expires_at = NULL,
        last_error_code = 'lease_expired'
      WHERE job.id = v_job.id
      RETURNING * INTO v_job;

      v_receipt := co_production_private.append_notification_outbox_receipt(
        v_job,
        v_previous_lease_owner,
        'retry',
        NULL,
        NULL,
        'lease_expired',
        v_now,
        v_now
      );
      PERFORM co_production_private.append_notification_outbox_event(
        v_job,
        'retry_scheduled',
        'system:lease-reaper',
        'lease_expired',
        v_now
      );
    END IF;
  END LOOP;

  FOR v_job IN
    SELECT job.*
    FROM co_production.notification_outbox AS job
    WHERE job.tenant_kind = v_tenant_kind
      AND job.tenant_id = p_tenant_id
      AND job.status IN ('queued', 'retry')
      AND job.available_at <= v_now
      AND job.attempt_count < job.max_attempts
    ORDER BY job.available_at, job.created_at, job.id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE co_production.notification_outbox AS job
    SET
      status = 'leased',
      attempt_count = job.attempt_count + 1,
      leased_at = v_now,
      lease_owner = btrim(p_lease_owner),
      lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
      lease_fence = job.lease_fence + 1
    WHERE job.id = v_job.id
    RETURNING * INTO v_job;

    PERFORM co_production_private.append_notification_outbox_event(
      v_job,
      'leased',
      btrim(p_lease_owner),
      NULL,
      v_now
    );
    RETURN NEXT co_production_private.notification_outbox_snapshot(v_job, false);
  END LOOP;

  RETURN;
END
$$;

CREATE OR REPLACE FUNCTION co_production.renew_notification_outbox_lease(
  p_tenant_kind text,
  p_tenant_id uuid,
  p_outbox_id uuid,
  p_lease_owner text,
  p_lease_fence bigint,
  p_lease_seconds integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job co_production.notification_outbox%ROWTYPE;
  v_now timestamptz := now();
  v_tenant_kind text := lower(btrim(p_tenant_kind));
BEGIN
  IF coalesce((SELECT auth.role()), '') <> 'service_role' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'notification_outbox_worker_forbidden';
  END IF;
  IF v_tenant_kind IS NULL
    OR v_tenant_kind NOT IN ('personal', 'team')
    OR p_tenant_id IS NULL
    OR p_lease_owner IS NULL
    OR length(btrim(p_lease_owner)) NOT BETWEEN 1 AND 160
    OR p_lease_owner ~ '[[:cntrl:]]'
    OR p_lease_fence IS NULL
    OR p_lease_fence < 1
    OR p_lease_seconds IS NULL
    OR p_lease_seconds NOT BETWEEN 5 AND 900
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_notification_outbox_lease';
  END IF;

  SELECT job.*
  INTO v_job
  FROM co_production.notification_outbox AS job
  WHERE job.id = p_outbox_id
    AND job.tenant_kind = v_tenant_kind
    AND job.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'notification_outbox_not_found';
  END IF;
  IF v_job.status <> 'leased'
    OR v_job.lease_owner IS DISTINCT FROM btrim(p_lease_owner)
    OR v_job.lease_fence IS DISTINCT FROM p_lease_fence
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'notification_outbox_stale_fence';
  END IF;
  IF v_job.lease_expires_at <= v_now THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'notification_outbox_lease_expired';
  END IF;

  UPDATE co_production.notification_outbox AS job
  SET lease_expires_at = v_now + make_interval(secs => p_lease_seconds)
  WHERE job.id = v_job.id
  RETURNING * INTO v_job;

  PERFORM co_production_private.append_notification_outbox_event(
    v_job,
    'lease_renewed',
    btrim(p_lease_owner),
    NULL,
    v_now
  );

  RETURN co_production_private.notification_outbox_snapshot(v_job, false);
END
$$;

CREATE OR REPLACE FUNCTION co_production.settle_notification_outbox_attempt(
  p_tenant_kind text,
  p_tenant_id uuid,
  p_outbox_id uuid,
  p_lease_owner text,
  p_lease_fence bigint,
  p_outcome text,
  p_retry_at timestamptz DEFAULT NULL,
  p_error_code text DEFAULT NULL,
  p_provider text DEFAULT NULL,
  p_provider_message_id_hash text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job co_production.notification_outbox%ROWTYPE;
  v_receipt co_production.notification_outbox_receipts%ROWTYPE;
  v_now timestamptz := now();
  v_outcome text := lower(btrim(p_outcome));
  v_effective_outcome text;
  v_error_code text := nullif(lower(btrim(p_error_code)), '');
  v_provider text := nullif(lower(btrim(p_provider)), '');
  v_next_available_at timestamptz;
  v_requested_fingerprint text;
  v_tenant_kind text := lower(btrim(p_tenant_kind));
BEGIN
  IF coalesce((SELECT auth.role()), '') <> 'service_role' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'notification_outbox_worker_forbidden';
  END IF;
  IF v_tenant_kind IS NULL
    OR v_tenant_kind NOT IN ('personal', 'team')
    OR p_tenant_id IS NULL
    OR p_lease_owner IS NULL
    OR length(btrim(p_lease_owner)) NOT BETWEEN 1 AND 160
    OR p_lease_owner ~ '[[:cntrl:]]'
    OR p_lease_fence IS NULL
    OR p_lease_fence < 1
    OR v_outcome IS NULL
    OR v_outcome NOT IN ('sent', 'retry', 'dead')
    OR (v_error_code IS NOT NULL AND v_error_code !~ '^[a-z0-9][a-z0-9._:-]{0,119}$')
    OR (v_provider IS NOT NULL AND v_provider !~ '^[a-z0-9][a-z0-9._:-]{0,79}$')
    OR (
      p_provider_message_id_hash IS NOT NULL
      AND p_provider_message_id_hash !~ '^sha256:[0-9a-f]{64}$'
    )
    OR (p_provider_message_id_hash IS NOT NULL AND v_provider IS NULL)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_notification_outbox_settlement';
  END IF;

  SELECT job.*
  INTO v_job
  FROM co_production.notification_outbox AS job
  WHERE job.id = p_outbox_id
    AND job.tenant_kind = v_tenant_kind
    AND job.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'notification_outbox_not_found';
  END IF;

  IF v_outcome = 'retry' AND v_job.attempt_count >= v_job.max_attempts THEN
    v_effective_outcome := 'dead';
    v_error_code := coalesce(v_error_code, 'attempts_exhausted');
    v_next_available_at := NULL;
  ELSIF v_outcome = 'retry' THEN
    IF p_retry_at IS NULL
      OR p_retry_at <= v_now
      OR p_retry_at > v_now + interval '7 days'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'invalid_notification_outbox_retry_time';
    END IF;
    v_effective_outcome := 'retry';
    v_error_code := coalesce(v_error_code, 'delivery_retry');
    v_next_available_at := p_retry_at;
  ELSIF v_outcome = 'dead' THEN
    IF p_retry_at IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'dead_notification_cannot_have_retry_time';
    END IF;
    v_effective_outcome := 'dead';
    v_error_code := coalesce(v_error_code, 'delivery_failed');
    v_next_available_at := NULL;
  ELSE
    IF p_retry_at IS NOT NULL OR v_error_code IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'sent_notification_cannot_have_failure_fields';
    END IF;
    v_effective_outcome := 'sent';
    v_next_available_at := NULL;
  END IF;

  v_requested_fingerprint :=
    co_production_private.notification_outbox_receipt_fingerprint(
      v_job,
      btrim(p_lease_owner),
      v_effective_outcome,
      v_provider,
      p_provider_message_id_hash,
      v_error_code,
      v_next_available_at
    );

  SELECT receipt.*
  INTO v_receipt
  FROM co_production.notification_outbox_receipts AS receipt
  WHERE receipt.outbox_id = v_job.id
    AND receipt.lease_fence = p_lease_fence;

  IF FOUND THEN
    IF v_receipt.receipt_fingerprint IS DISTINCT FROM v_requested_fingerprint THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'notification_outbox_receipt_conflict';
    END IF;
    RETURN co_production_private.notification_outbox_snapshot(v_job, true)
      || jsonb_build_object(
        'receipt_id', v_receipt.id,
        'receipt_replayed', true
      );
  END IF;

  IF v_job.status <> 'leased'
    OR v_job.lease_owner IS DISTINCT FROM btrim(p_lease_owner)
    OR v_job.lease_fence IS DISTINCT FROM p_lease_fence
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'notification_outbox_stale_fence';
  END IF;
  IF v_job.lease_expires_at <= v_now THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'notification_outbox_lease_expired';
  END IF;

  IF v_effective_outcome = 'sent' THEN
    UPDATE co_production.notification_outbox AS job
    SET
      status = 'sent',
      leased_at = NULL,
      lease_owner = NULL,
      lease_expires_at = NULL,
      last_error_code = NULL,
      sent_at = v_now
    WHERE job.id = v_job.id
    RETURNING * INTO v_job;
  ELSIF v_effective_outcome = 'retry' THEN
    UPDATE co_production.notification_outbox AS job
    SET
      status = 'retry',
      available_at = v_next_available_at,
      leased_at = NULL,
      lease_owner = NULL,
      lease_expires_at = NULL,
      last_error_code = v_error_code
    WHERE job.id = v_job.id
    RETURNING * INTO v_job;
  ELSE
    UPDATE co_production.notification_outbox AS job
    SET
      status = 'dead',
      leased_at = NULL,
      lease_owner = NULL,
      lease_expires_at = NULL,
      last_error_code = v_error_code,
      dead_at = v_now
    WHERE job.id = v_job.id
    RETURNING * INTO v_job;
  END IF;

  v_receipt := co_production_private.append_notification_outbox_receipt(
    v_job,
    btrim(p_lease_owner),
    v_effective_outcome,
    v_provider,
    p_provider_message_id_hash,
    v_error_code,
    v_next_available_at,
    v_now
  );

  PERFORM co_production_private.append_notification_outbox_event(
    v_job,
    CASE v_effective_outcome
      WHEN 'sent' THEN 'sent'
      WHEN 'retry' THEN 'retry_scheduled'
      ELSE 'dead_lettered'
    END,
    btrim(p_lease_owner),
    v_error_code,
    v_now
  );

  RETURN co_production_private.notification_outbox_snapshot(v_job, false)
    || jsonb_build_object(
      'receipt_id', v_receipt.id,
      'receipt_replayed', false
    );
END
$$;

REVOKE ALL ON TABLE
  co_production.notification_outbox,
  co_production.notification_outbox_events,
  co_production.notification_outbox_receipts
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION co_production.enqueue_notification_outbox(
  text, uuid, text, text, text, text, text, jsonb, timestamptz, integer
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production.claim_notification_outbox(
  text, uuid, text, integer, integer
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production.renew_notification_outbox_lease(
  text, uuid, uuid, text, bigint, integer
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production.settle_notification_outbox_attempt(
  text, uuid, uuid, text, bigint, text, timestamptz, text, text, text
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION co_production.enqueue_notification_outbox(
  text, uuid, text, text, text, text, text, jsonb, timestamptz, integer
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION co_production.claim_notification_outbox(
  text, uuid, text, integer, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION co_production.renew_notification_outbox_lease(
  text, uuid, uuid, text, bigint, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION co_production.settle_notification_outbox_attempt(
  text, uuid, uuid, text, bigint, text, timestamptz, text, text, text
) TO service_role;

REVOKE ALL ON FUNCTION co_production_private.notification_sha256(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.notification_outbox_payload_is_safe(jsonb, integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.assert_notification_tenant_access(text, uuid, integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.notification_outbox_snapshot(
  co_production.notification_outbox, boolean
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.append_notification_outbox_event(
  co_production.notification_outbox, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.notification_outbox_receipt_fingerprint(
  co_production.notification_outbox, text, text, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.append_notification_outbox_receipt(
  co_production.notification_outbox, text, text, text, text, text, timestamptz, timestamptz
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.guard_notification_outbox_update()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.prevent_notification_outbox_delete()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE INDEX notification_outbox_ready_idx
  ON co_production.notification_outbox(
    tenant_kind,
    tenant_id,
    available_at,
    created_at,
    id
  )
  WHERE status IN ('queued', 'retry');
CREATE INDEX notification_outbox_expired_lease_idx
  ON co_production.notification_outbox(
    tenant_kind,
    tenant_id,
    lease_expires_at,
    id
  )
  WHERE status = 'leased';
CREATE INDEX notification_outbox_terminal_idx
  ON co_production.notification_outbox(
    tenant_kind,
    tenant_id,
    status,
    updated_at DESC
  )
  WHERE status IN ('dead', 'sent');
CREATE INDEX notification_outbox_events_tenant_job_idx
  ON co_production.notification_outbox_events(
    tenant_kind,
    tenant_id,
    outbox_id,
    event_sequence
  );
CREATE INDEX notification_outbox_receipts_tenant_recorded_idx
  ON co_production.notification_outbox_receipts(
    tenant_kind,
    tenant_id,
    recorded_at DESC,
    outbox_id
  );

COMMENT ON TABLE co_production.notification_outbox IS
  'Queue authority only. No external notification provider is enabled by this migration.';
COMMENT ON COLUMN co_production.notification_outbox.recipient_identity_hash IS
  'One-way channel-bound recipient fingerprint; never a deliverable address.';
COMMENT ON COLUMN co_production.notification_outbox.recipient_redacted IS
  'Masked recipient display value safe for queue operations and audit surfaces.';
COMMENT ON COLUMN co_production.notification_outbox.payload IS
  'Reference-only delivery intent; recipient identity, bearer material, and plaintext message content are forbidden.';

COMMIT;
