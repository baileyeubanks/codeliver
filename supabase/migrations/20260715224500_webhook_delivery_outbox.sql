-- Durable webhook queue authority. This migration records work and exposes a
-- service-role lease/settlement contract; it does not install or schedule a
-- worker and it does not make outbound network calls.

BEGIN;

CREATE OR REPLACE FUNCTION co_production_private.webhook_outbox_payload_node_count(
  p_value jsonb,
  p_depth integer DEFAULT 0
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
  v_child jsonb;
  v_total integer := 1;
BEGIN
  IF p_depth > 16 THEN
    RETURN 2001;
  END IF;
  IF pg_catalog.jsonb_typeof(p_value) = 'object' THEN
    FOR v_child IN
      SELECT entry.value
      FROM pg_catalog.jsonb_each(p_value) AS entry(key, value)
    LOOP
      v_total := v_total
        + co_production_private.webhook_outbox_payload_node_count(
          v_child,
          p_depth + 1
        );
      IF v_total > 2000 THEN RETURN v_total; END IF;
    END LOOP;
  ELSIF pg_catalog.jsonb_typeof(p_value) = 'array' THEN
    FOR v_child IN
      SELECT entry.value
      FROM pg_catalog.jsonb_array_elements(p_value) AS entry(value)
    LOOP
      v_total := v_total
        + co_production_private.webhook_outbox_payload_node_count(
          v_child,
          p_depth + 1
        );
      IF v_total > 2000 THEN RETURN v_total; END IF;
    END LOOP;
  END IF;
  RETURN v_total;
END
$$;

ALTER TABLE co_production.webhook_deliveries
  ADD COLUMN team_id uuid,
  ADD COLUMN idempotency_key text,
  ADD COLUMN payload_fingerprint text,
  ADD COLUMN status text,
  ADD COLUMN max_attempts integer,
  ADD COLUMN available_at timestamptz,
  ADD COLUMN lease_owner text,
  ADD COLUMN lease_expires_at timestamptz,
  ADD COLUMN lease_fence bigint,
  ADD COLUMN duration_ms integer,
  ADD COLUMN completed_at timestamptz,
  ADD COLUMN created_at timestamptz,
  ADD COLUMN updated_at timestamptz;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM co_production.webhook_deliveries AS delivery
    WHERE pg_catalog.jsonb_typeof(delivery.payload) IS DISTINCT FROM 'object'
      OR pg_catalog.octet_length(
        pg_catalog.convert_to(delivery.payload::text, 'UTF8')
      ) > 65536
      OR co_production_private.webhook_outbox_payload_node_count(
        delivery.payload
      ) > 2000
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'webhook_outbox_legacy_payload_requires_manual_remediation';
  END IF;
END
$$;

UPDATE co_production.webhook_deliveries AS delivery
SET team_id = webhook.team_id
FROM co_production.webhooks AS webhook
WHERE webhook.id = delivery.webhook_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM co_production.webhook_deliveries AS delivery
    WHERE delivery.team_id IS NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'webhook_outbox_legacy_team_requires_manual_remediation';
  END IF;
END
$$;

UPDATE co_production.webhook_deliveries AS delivery
SET
  event = CASE
    WHEN lower(btrim(delivery.event)) ~ '^[a-z][a-z0-9_.-]{2,79}$'
      THEN lower(btrim(delivery.event))
    ELSE 'legacy.event'
  END,
  idempotency_key = 'legacy:' || delivery.id::text,
  payload_fingerprint = co_production_private.notification_sha256(
    pg_catalog.jsonb_build_object(
      'schema_version', 'cco.webhook-outbox.v1',
      'webhook_id', delivery.webhook_id,
      'expected_team_id', delivery.team_id,
      'event', CASE
        WHEN lower(btrim(delivery.event)) ~ '^[a-z][a-z0-9_.-]{2,79}$'
          THEN lower(btrim(delivery.event))
        ELSE 'legacy.event'
      END,
      'payload', delivery.payload - 'timestamp',
      'max_attempts', pg_catalog.least(
        pg_catalog.greatest(delivery.attempt, 1),
        12
      )
    )::text
  ),
  status = CASE
    WHEN delivery.response_code BETWEEN 200 AND 299 THEN 'sent'
    ELSE 'dead'
  END,
  response_code = CASE
    WHEN delivery.response_code BETWEEN 100 AND 599 THEN delivery.response_code
    ELSE NULL
  END,
  attempt = pg_catalog.least(pg_catalog.greatest(delivery.attempt, 1), 12),
  max_attempts = pg_catalog.least(
    pg_catalog.greatest(delivery.attempt, 1),
    12
  ),
  available_at = delivery.delivered_at,
  lease_fence = pg_catalog.least(
    pg_catalog.greatest(delivery.attempt, 1),
    12
  ),
  error_code = CASE
    WHEN delivery.response_code BETWEEN 200 AND 299 THEN NULL
    WHEN lower(btrim(delivery.error_code)) ~ '^[a-z0-9][a-z0-9._:-]{0,119}$'
      THEN lower(btrim(delivery.error_code))
    ELSE 'legacy_failure'
  END,
  completed_at = delivery.delivered_at,
  created_at = delivery.delivered_at,
  updated_at = delivery.delivered_at;

UPDATE co_production.webhook_deliveries
SET delivered_at = NULL
WHERE status <> 'sent';

ALTER TABLE co_production.webhook_deliveries
  DROP CONSTRAINT IF EXISTS webhook_deliveries_attempt_check;

ALTER TABLE co_production.webhook_deliveries
  DROP CONSTRAINT IF EXISTS webhook_deliveries_webhook_id_fkey,
  ALTER COLUMN team_id SET NOT NULL;

ALTER TABLE co_production.webhooks
  ADD CONSTRAINT webhooks_id_team_key UNIQUE (id, team_id);

ALTER TABLE co_production.webhook_deliveries
  ADD CONSTRAINT webhook_deliveries_webhook_id_fkey
    FOREIGN KEY (webhook_id, team_id)
    REFERENCES co_production.webhooks(id, team_id)
    ON DELETE RESTRICT;

ALTER TABLE co_production.webhook_deliveries
  ALTER COLUMN idempotency_key SET NOT NULL,
  ALTER COLUMN payload_fingerprint SET NOT NULL,
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'queued',
  ALTER COLUMN attempt SET DEFAULT 0,
  ALTER COLUMN max_attempts SET NOT NULL,
  ALTER COLUMN max_attempts SET DEFAULT 5,
  ALTER COLUMN available_at SET NOT NULL,
  ALTER COLUMN available_at SET DEFAULT now(),
  ALTER COLUMN lease_fence SET NOT NULL,
  ALTER COLUMN lease_fence SET DEFAULT 0,
  ALTER COLUMN delivered_at DROP NOT NULL,
  ALTER COLUMN delivered_at DROP DEFAULT,
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE co_production.webhook_deliveries
  ADD CONSTRAINT webhook_deliveries_webhook_idempotency_key
    UNIQUE (webhook_id, idempotency_key),
  ADD CONSTRAINT webhook_deliveries_id_webhook_key
    UNIQUE (id, webhook_id),
  ADD CONSTRAINT webhook_deliveries_idempotency_shape CHECK (
    idempotency_key = lower(btrim(idempotency_key))
    AND idempotency_key ~ '^[a-z0-9][a-z0-9._:-]{15,199}$'
  ),
  ADD CONSTRAINT webhook_deliveries_event_shape CHECK (
    event = lower(btrim(event))
    AND event ~ '^[a-z][a-z0-9_.-]{2,79}$'
  ),
  ADD CONSTRAINT webhook_deliveries_payload_shape CHECK (
    pg_catalog.jsonb_typeof(payload) = 'object'
    AND pg_catalog.octet_length(
      pg_catalog.convert_to(payload::text, 'UTF8')
    ) <= 65536
    AND co_production_private.webhook_outbox_payload_node_count(payload) <= 2000
  ),
  ADD CONSTRAINT webhook_deliveries_fingerprint_shape CHECK (
    payload_fingerprint ~ '^sha256:[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT webhook_deliveries_status_shape CHECK (
    status IN ('queued', 'leased', 'retry', 'dead', 'sent')
  ),
  ADD CONSTRAINT webhook_deliveries_attempt_shape CHECK (
    attempt BETWEEN 0 AND max_attempts
    AND max_attempts BETWEEN 1 AND 12
    AND lease_fence >= attempt
    AND (status <> 'queued' OR attempt = 0)
    AND (status <> 'retry' OR attempt BETWEEN 1 AND max_attempts - 1)
    AND (status NOT IN ('leased', 'sent') OR attempt BETWEEN 1 AND max_attempts)
    AND (status <> 'dead' OR attempt BETWEEN 0 AND max_attempts)
  ),
  ADD CONSTRAINT webhook_deliveries_lease_shape CHECK (
    (
      status = 'leased'
      AND lease_owner IS NOT NULL
      AND length(btrim(lease_owner)) BETWEEN 1 AND 160
      AND lease_owner !~ '[[:cntrl:]]'
      AND lease_expires_at IS NOT NULL
    )
    OR (
      status <> 'leased'
      AND lease_owner IS NULL
      AND lease_expires_at IS NULL
    )
  ),
  ADD CONSTRAINT webhook_deliveries_terminal_shape CHECK (
    (
      status = 'sent'
      AND delivered_at IS NOT NULL
      AND completed_at IS NOT NULL
      AND response_code BETWEEN 200 AND 299
      AND error_code IS NULL
    )
    OR (
      status = 'dead'
      AND delivered_at IS NULL
      AND completed_at IS NOT NULL
      AND error_code IS NOT NULL
    )
    OR (
      status IN ('queued', 'leased', 'retry')
      AND delivered_at IS NULL
      AND completed_at IS NULL
    )
  ),
  ADD CONSTRAINT webhook_deliveries_response_shape CHECK (
    response_code IS NULL OR response_code BETWEEN 100 AND 599
  ),
  ADD CONSTRAINT webhook_deliveries_duration_shape CHECK (
    duration_ms IS NULL OR duration_ms >= 0
  ),
  ADD CONSTRAINT webhook_deliveries_error_shape CHECK (
    error_code IS NULL OR error_code ~ '^[a-z0-9][a-z0-9._:-]{0,119}$'
  );

CREATE TABLE co_production.webhook_delivery_events (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  delivery_id uuid NOT NULL,
  webhook_id uuid NOT NULL REFERENCES co_production.webhooks(id) ON DELETE RESTRICT,
  event_sequence bigint GENERATED ALWAYS AS IDENTITY,
  event_type text NOT NULL CHECK (
    event_type IN (
      'enqueued',
      'replayed',
      'leased',
      'lease_renewed',
      'lease_expired',
      'retry_scheduled',
      'dead_lettered',
      'sent'
    )
  ),
  attempt integer NOT NULL CHECK (attempt >= 0),
  lease_fence bigint NOT NULL CHECK (lease_fence >= 0),
  actor_ref text NOT NULL CHECK (
    length(btrim(actor_ref)) BETWEEN 1 AND 160
    AND actor_ref !~ '[[:cntrl:]]'
  ),
  response_code integer CHECK (response_code IS NULL OR response_code BETWEEN 100 AND 599),
  error_code text CHECK (
    error_code IS NULL OR error_code ~ '^[a-z0-9][a-z0-9._:-]{0,119}$'
  ),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT webhook_delivery_events_delivery_webhook_fk
    FOREIGN KEY (delivery_id, webhook_id)
    REFERENCES co_production.webhook_deliveries(id, webhook_id)
    ON DELETE RESTRICT,
  UNIQUE (delivery_id, event_sequence)
);

CREATE TABLE co_production.webhook_delivery_receipts (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  delivery_id uuid NOT NULL,
  webhook_id uuid NOT NULL,
  lease_fence bigint NOT NULL CHECK (lease_fence > 0),
  lease_owner text NOT NULL CHECK (
    lease_owner = lower(btrim(lease_owner))
    AND lease_owner ~ '^[a-z0-9][a-z0-9._:-]{0,159}$'
  ),
  request_fingerprint text NOT NULL CHECK (
    request_fingerprint ~ '^sha256:[0-9a-f]{64}$'
  ),
  outcome text NOT NULL CHECK (outcome IN ('sent', 'retry', 'dead')),
  response_code integer CHECK (
    response_code IS NULL OR response_code BETWEEN 100 AND 599
  ),
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  error_code text CHECK (
    error_code IS NULL OR error_code ~ '^[a-z0-9][a-z0-9._:-]{0,119}$'
  ),
  next_available_at timestamptz,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT webhook_delivery_receipts_delivery_webhook_fk
    FOREIGN KEY (delivery_id, webhook_id)
    REFERENCES co_production.webhook_deliveries(id, webhook_id)
    ON DELETE RESTRICT,
  CONSTRAINT webhook_delivery_receipts_one_per_fence
    UNIQUE (delivery_id, lease_fence),
  CONSTRAINT webhook_delivery_receipts_shape CHECK (
    (outcome = 'sent' AND response_code BETWEEN 200 AND 299
      AND error_code IS NULL AND next_available_at IS NULL)
    OR (outcome = 'retry' AND error_code IS NOT NULL
      AND next_available_at IS NOT NULL)
    OR (outcome = 'dead' AND error_code IS NOT NULL
      AND next_available_at IS NULL)
  )
);

INSERT INTO co_production.webhook_delivery_events (
  delivery_id,
  webhook_id,
  event_type,
  attempt,
  lease_fence,
  actor_ref,
  response_code,
  error_code,
  recorded_at
)
SELECT
  delivery.id,
  delivery.webhook_id,
  CASE WHEN delivery.status = 'sent' THEN 'sent' ELSE 'dead_lettered' END,
  delivery.attempt,
  delivery.lease_fence,
  'system:legacy-backfill',
  delivery.response_code,
  delivery.error_code,
  delivery.completed_at
FROM co_production.webhook_deliveries AS delivery;

ALTER TABLE co_production.webhook_delivery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.webhook_delivery_events FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.webhook_delivery_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.webhook_delivery_receipts FORCE ROW LEVEL SECURITY;

CREATE POLICY webhook_delivery_events_select
ON co_production.webhook_delivery_events
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM co_production.webhooks AS webhook
    WHERE webhook.id = co_production.webhook_delivery_events.webhook_id
      AND co_production_private.has_team_role(webhook.team_id, 80)
  )
);

CREATE POLICY webhook_delivery_receipts_select
ON co_production.webhook_delivery_receipts
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM co_production.webhooks AS webhook
    WHERE webhook.id = co_production.webhook_delivery_receipts.webhook_id
      AND co_production_private.has_team_role(webhook.team_id, 80)
  )
);

CREATE OR REPLACE FUNCTION co_production_private.webhook_delivery_snapshot(
  p_delivery co_production.webhook_deliveries,
  p_replayed boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'delivery_id', p_delivery.id,
    'webhook_id', p_delivery.webhook_id,
    'expected_team_id', p_delivery.team_id,
    'event', p_delivery.event,
    'idempotency_key', p_delivery.idempotency_key,
    'payload', p_delivery.payload,
    'payload_fingerprint', p_delivery.payload_fingerprint,
    'status', p_delivery.status,
    'attempt_count', p_delivery.attempt,
    'max_attempts', p_delivery.max_attempts,
    'available_at', p_delivery.available_at,
    'lease_owner', p_delivery.lease_owner,
    'lease_expires_at', p_delivery.lease_expires_at,
    'lease_fence', p_delivery.lease_fence,
    'response_code', p_delivery.response_code,
    'duration_ms', p_delivery.duration_ms,
    'error_code', p_delivery.error_code,
    'delivered_at', p_delivery.delivered_at,
    'completed_at', p_delivery.completed_at,
    'replayed', p_replayed
  )
$$;

CREATE OR REPLACE FUNCTION co_production_private.append_webhook_delivery_event(
  p_delivery co_production.webhook_deliveries,
  p_event_type text,
  p_actor_ref text,
  p_response_code integer DEFAULT NULL,
  p_error_code text DEFAULT NULL,
  p_recorded_at timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO co_production.webhook_delivery_events (
    delivery_id,
    webhook_id,
    event_type,
    attempt,
    lease_fence,
    actor_ref,
    response_code,
    error_code,
    recorded_at
  )
  VALUES (
    p_delivery.id,
    p_delivery.webhook_id,
    p_event_type,
    p_delivery.attempt,
    p_delivery.lease_fence,
    btrim(p_actor_ref),
    p_response_code,
    p_error_code,
    p_recorded_at
  );
END
$$;

CREATE OR REPLACE FUNCTION co_production_private.assert_webhook_enqueue_access(
  p_webhook_id uuid,
  p_expected_team_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_team_id uuid;
BEGIN
  SELECT webhook.team_id
  INTO v_team_id
  FROM co_production.webhooks AS webhook
  WHERE webhook.id = p_webhook_id
    AND webhook.active = true;

  IF v_team_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'webhook_outbox_target_unavailable';
  END IF;

  IF p_expected_team_id IS NULL OR v_team_id <> p_expected_team_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'webhook_outbox_team_mismatch';
  END IF;

  IF coalesce((SELECT auth.role()), '') <> 'service_role'
    AND NOT co_production_private.has_team_role(v_team_id, 80)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'webhook_outbox_forbidden';
  END IF;

  RETURN v_team_id;
END
$$;

CREATE OR REPLACE FUNCTION co_production_private.prevent_webhook_delivery_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '42501',
    MESSAGE = 'webhook_delivery_events_are_append_only';
END
$$;

CREATE TRIGGER webhook_delivery_events_no_update_delete
BEFORE UPDATE OR DELETE ON co_production.webhook_delivery_events
FOR EACH ROW
EXECUTE FUNCTION co_production_private.prevent_webhook_delivery_event_mutation();

CREATE TRIGGER webhook_delivery_events_no_truncate
BEFORE TRUNCATE ON co_production.webhook_delivery_events
FOR EACH STATEMENT
EXECUTE FUNCTION co_production_private.prevent_webhook_delivery_event_mutation();

CREATE TRIGGER webhook_delivery_receipts_no_update_delete
BEFORE UPDATE OR DELETE ON co_production.webhook_delivery_receipts
FOR EACH ROW
EXECUTE FUNCTION co_production_private.prevent_webhook_delivery_event_mutation();

CREATE TRIGGER webhook_delivery_receipts_no_truncate
BEFORE TRUNCATE ON co_production.webhook_delivery_receipts
FOR EACH STATEMENT
EXECUTE FUNCTION co_production_private.prevent_webhook_delivery_event_mutation();

CREATE OR REPLACE FUNCTION co_production_private.guard_webhook_delivery_update()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.webhook_id IS DISTINCT FROM OLD.webhook_id
    OR NEW.team_id IS DISTINCT FROM OLD.team_id
    OR NEW.event IS DISTINCT FROM OLD.event
    OR NEW.payload IS DISTINCT FROM OLD.payload
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.payload_fingerprint IS DISTINCT FROM OLD.payload_fingerprint
    OR NEW.max_attempts IS DISTINCT FROM OLD.max_attempts
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'webhook_delivery_identity_is_immutable';
  END IF;

  IF NOT (
    (OLD.status IN ('queued', 'retry') AND NEW.status IN ('leased', 'dead'))
    OR (OLD.status = 'leased' AND NEW.status IN ('leased', 'retry', 'dead', 'sent'))
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'webhook_delivery_transition_invalid';
  END IF;

  IF (
    OLD.status IN ('queued', 'retry')
    AND NEW.status = 'leased'
    AND (
      NEW.attempt <> OLD.attempt + 1
      OR NEW.lease_fence <> OLD.lease_fence + 1
    )
  ) OR (
    OLD.status = 'leased'
    AND (
      NEW.attempt <> OLD.attempt
      OR NEW.lease_fence <> OLD.lease_fence
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'webhook_delivery_fence_transition_invalid';
  END IF;

  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION co_production_private.prevent_webhook_delivery_delete()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'webhook_deliveries_cannot_be_deleted';
END
$$;

CREATE TRIGGER webhook_deliveries_guard_update
BEFORE UPDATE ON co_production.webhook_deliveries
FOR EACH ROW
EXECUTE FUNCTION co_production_private.guard_webhook_delivery_update();

CREATE TRIGGER webhook_deliveries_no_delete
BEFORE DELETE ON co_production.webhook_deliveries
FOR EACH ROW
EXECUTE FUNCTION co_production_private.prevent_webhook_delivery_delete();

CREATE TRIGGER webhook_deliveries_no_truncate
BEFORE TRUNCATE ON co_production.webhook_deliveries
FOR EACH STATEMENT
EXECUTE FUNCTION co_production_private.prevent_webhook_delivery_delete();

CREATE OR REPLACE FUNCTION co_production.enqueue_webhook_delivery(
  p_webhook_id uuid,
  p_expected_team_id uuid,
  p_event text,
  p_payload jsonb,
  p_idempotency_key text,
  p_available_at timestamptz DEFAULT now(),
  p_max_attempts integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_delivery co_production.webhook_deliveries%ROWTYPE;
  v_existing co_production.webhook_deliveries%ROWTYPE;
  v_team_id uuid;
  v_event text := lower(btrim(p_event));
  v_idempotency_key text := lower(btrim(p_idempotency_key));
  v_available_at timestamptz := coalesce(p_available_at, now());
  v_payload_fingerprint text;
  v_actor_ref text := coalesce((SELECT auth.uid())::text, 'service_role');
BEGIN
  v_team_id := co_production_private.assert_webhook_enqueue_access(
    p_webhook_id,
    p_expected_team_id
  );

  IF p_webhook_id IS NULL
    OR v_event IS NULL
    OR v_event !~ '^[a-z][a-z0-9_.-]{2,79}$'
    OR v_idempotency_key IS NULL
    OR v_idempotency_key !~ '^[a-z0-9][a-z0-9._:-]{15,199}$'
    OR pg_catalog.jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR pg_catalog.octet_length(
      pg_catalog.convert_to(p_payload::text, 'UTF8')
    ) > 65536
    OR co_production_private.webhook_outbox_payload_node_count(p_payload) > 2000
    OR p_max_attempts IS NULL
    OR p_max_attempts NOT BETWEEN 1 AND 12
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_webhook_outbox_request';
  END IF;

  v_payload_fingerprint := co_production_private.notification_sha256(
    pg_catalog.jsonb_build_object(
      'schema_version', 'cco.webhook-outbox.v1',
      'webhook_id', p_webhook_id,
      'expected_team_id', v_team_id,
      'event', v_event,
      'payload', p_payload - 'timestamp',
      'max_attempts', p_max_attempts
    )::text
  );

  SELECT delivery.*
  INTO v_existing
  FROM co_production.webhook_deliveries AS delivery
  WHERE delivery.webhook_id = p_webhook_id
    AND delivery.idempotency_key = v_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.payload_fingerprint IS DISTINCT FROM v_payload_fingerprint THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'webhook_outbox_idempotency_conflict';
    END IF;
    PERFORM co_production_private.append_webhook_delivery_event(
      v_existing,
      'replayed',
      v_actor_ref,
      v_existing.response_code,
      v_existing.error_code,
      now()
    );
    RETURN co_production_private.webhook_delivery_snapshot(v_existing, true);
  END IF;

  BEGIN
    INSERT INTO co_production.webhook_deliveries (
      webhook_id,
      team_id,
      event,
      payload,
      idempotency_key,
      payload_fingerprint,
      status,
      attempt,
      max_attempts,
      available_at,
      lease_fence,
      delivered_at,
      completed_at
    )
    VALUES (
      p_webhook_id,
      v_team_id,
      v_event,
      p_payload,
      v_idempotency_key,
      v_payload_fingerprint,
      'queued',
      0,
      p_max_attempts,
      v_available_at,
      0,
      NULL,
      NULL
    )
    RETURNING * INTO v_delivery;
  EXCEPTION WHEN unique_violation THEN
    SELECT delivery.*
    INTO v_existing
    FROM co_production.webhook_deliveries AS delivery
    WHERE delivery.webhook_id = p_webhook_id
      AND delivery.idempotency_key = v_idempotency_key;

    IF NOT FOUND
      OR v_existing.payload_fingerprint IS DISTINCT FROM v_payload_fingerprint
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'webhook_outbox_idempotency_conflict';
    END IF;
    PERFORM co_production_private.append_webhook_delivery_event(
      v_existing,
      'replayed',
      v_actor_ref,
      v_existing.response_code,
      v_existing.error_code,
      now()
    );
    RETURN co_production_private.webhook_delivery_snapshot(v_existing, true);
  END;

  PERFORM co_production_private.append_webhook_delivery_event(
    v_delivery,
    'enqueued',
    v_actor_ref,
    NULL,
    NULL,
    now()
  );

  RETURN co_production_private.webhook_delivery_snapshot(v_delivery, false);
END
$$;

CREATE OR REPLACE FUNCTION co_production.claim_webhook_deliveries(
  p_lease_owner text,
  p_limit integer DEFAULT 20,
  p_lease_seconds integer DEFAULT 60
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_delivery co_production.webhook_deliveries%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF coalesce((SELECT auth.role()), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'webhook_outbox_worker_forbidden';
  END IF;
  IF p_lease_owner IS NULL
    OR lower(btrim(p_lease_owner)) !~ '^[a-z0-9][a-z0-9._:-]{0,159}$'
    OR p_limit IS NULL
    OR p_limit NOT BETWEEN 1 AND 100
    OR p_lease_seconds IS NULL
    OR p_lease_seconds NOT BETWEEN 15 AND 900
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_webhook_outbox_claim';
  END IF;

  FOR v_delivery IN
    SELECT delivery.*
    FROM co_production.webhook_deliveries AS delivery
    WHERE delivery.status = 'leased'
      AND delivery.lease_expires_at <= v_now
    ORDER BY delivery.lease_expires_at, delivery.id
    LIMIT 100
    FOR UPDATE SKIP LOCKED
  LOOP
    IF v_delivery.attempt >= v_delivery.max_attempts THEN
      UPDATE co_production.webhook_deliveries AS delivery
      SET
        status = 'dead',
        lease_owner = NULL,
        lease_expires_at = NULL,
        error_code = 'lease_expired',
        completed_at = v_now,
        updated_at = v_now
      WHERE delivery.id = v_delivery.id
      RETURNING * INTO v_delivery;
      PERFORM co_production_private.append_webhook_delivery_event(
        v_delivery, 'dead_lettered', 'system:lease-reaper', NULL, 'lease_expired', v_now
      );
    ELSE
      UPDATE co_production.webhook_deliveries AS delivery
      SET
        status = 'retry',
        available_at = v_now,
        lease_owner = NULL,
        lease_expires_at = NULL,
        error_code = 'lease_expired',
        updated_at = v_now
      WHERE delivery.id = v_delivery.id
      RETURNING * INTO v_delivery;
      PERFORM co_production_private.append_webhook_delivery_event(
        v_delivery, 'lease_expired', 'system:lease-reaper', NULL, 'lease_expired', v_now
      );
    END IF;
  END LOOP;

  -- Reap expired leases first so an endpoint disabled while leased can be
  -- dead-lettered in this same claim cycle instead of surviving one extra poll.
  FOR v_delivery IN
    SELECT delivery.*
    FROM co_production.webhook_deliveries AS delivery
    JOIN co_production.webhooks AS webhook ON webhook.id = delivery.webhook_id
    WHERE delivery.status IN ('queued', 'retry')
      AND webhook.active = false
    ORDER BY delivery.created_at, delivery.id
    LIMIT 100
    FOR UPDATE OF delivery SKIP LOCKED
  LOOP
    UPDATE co_production.webhook_deliveries AS delivery
    SET
      status = 'dead',
      error_code = 'endpoint_deactivated',
      completed_at = v_now,
      updated_at = v_now
    WHERE delivery.id = v_delivery.id
    RETURNING * INTO v_delivery;
    PERFORM co_production_private.append_webhook_delivery_event(
      v_delivery,
      'dead_lettered',
      'system:endpoint-deactivation',
      NULL,
      'endpoint_deactivated',
      v_now
    );
  END LOOP;

  FOR v_delivery IN
    SELECT delivery.*
    FROM co_production.webhook_deliveries AS delivery
    JOIN co_production.webhooks AS webhook ON webhook.id = delivery.webhook_id
    WHERE delivery.status IN ('queued', 'retry')
      AND webhook.active = true
      AND delivery.available_at <= v_now
      AND delivery.attempt < delivery.max_attempts
    ORDER BY delivery.available_at, delivery.created_at, delivery.id
    LIMIT p_limit
    FOR UPDATE OF delivery SKIP LOCKED
  LOOP
    UPDATE co_production.webhook_deliveries AS delivery
    SET
      status = 'leased',
      attempt = delivery.attempt + 1,
      lease_owner = lower(btrim(p_lease_owner)),
      lease_expires_at = v_now + pg_catalog.make_interval(secs => p_lease_seconds),
      lease_fence = delivery.lease_fence + 1,
      response_code = NULL,
      duration_ms = NULL,
      error_code = NULL,
      updated_at = v_now
    WHERE delivery.id = v_delivery.id
    RETURNING * INTO v_delivery;

    PERFORM co_production_private.append_webhook_delivery_event(
      v_delivery, 'leased', lower(btrim(p_lease_owner)), NULL, NULL, v_now
    );
    RETURN NEXT co_production_private.webhook_delivery_snapshot(v_delivery, false);
  END LOOP;

  RETURN;
END
$$;

CREATE OR REPLACE FUNCTION co_production.renew_webhook_delivery_lease(
  p_delivery_id uuid,
  p_lease_owner text,
  p_lease_fence bigint,
  p_lease_seconds integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_delivery co_production.webhook_deliveries%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF coalesce((SELECT auth.role()), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'webhook_outbox_worker_forbidden';
  END IF;
  IF p_delivery_id IS NULL
    OR p_lease_owner IS NULL
    OR lower(btrim(p_lease_owner)) !~ '^[a-z0-9][a-z0-9._:-]{0,159}$'
    OR p_lease_fence IS NULL
    OR p_lease_fence < 1
    OR p_lease_seconds IS NULL
    OR p_lease_seconds NOT BETWEEN 15 AND 900
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_webhook_outbox_renewal';
  END IF;

  SELECT delivery.*
  INTO v_delivery
  FROM co_production.webhook_deliveries AS delivery
  WHERE delivery.id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_delivery.status <> 'leased'
    OR v_delivery.lease_owner IS DISTINCT FROM lower(btrim(p_lease_owner))
    OR v_delivery.lease_fence IS DISTINCT FROM p_lease_fence
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'webhook_outbox_stale_fence';
  END IF;
  IF v_delivery.lease_expires_at <= v_now THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'webhook_outbox_lease_expired';
  END IF;

  UPDATE co_production.webhook_deliveries AS delivery
  SET
    lease_expires_at = v_now + pg_catalog.make_interval(secs => p_lease_seconds),
    updated_at = v_now
  WHERE delivery.id = p_delivery_id
  RETURNING * INTO v_delivery;

  PERFORM co_production_private.append_webhook_delivery_event(
    v_delivery,
    'lease_renewed',
    lower(btrim(p_lease_owner)),
    NULL,
    NULL,
    v_now
  );
  RETURN co_production_private.webhook_delivery_snapshot(v_delivery, false);
END
$$;

CREATE OR REPLACE FUNCTION co_production.settle_webhook_delivery(
  p_delivery_id uuid,
  p_lease_owner text,
  p_lease_fence bigint,
  p_outcome text,
  p_response_code integer DEFAULT NULL,
  p_duration_ms integer DEFAULT NULL,
  p_error_code text DEFAULT NULL,
  p_available_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_delivery co_production.webhook_deliveries%ROWTYPE;
  v_receipt co_production.webhook_delivery_receipts%ROWTYPE;
  v_now timestamptz := now();
  v_outcome text := lower(btrim(p_outcome));
  v_error_code text := CASE WHEN p_error_code IS NULL THEN NULL ELSE lower(btrim(p_error_code)) END;
  v_request_fingerprint text;
BEGIN
  IF coalesce((SELECT auth.role()), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'webhook_outbox_worker_forbidden';
  END IF;

  IF p_delivery_id IS NULL
    OR p_lease_owner IS NULL
    OR lower(btrim(p_lease_owner)) !~ '^[a-z0-9][a-z0-9._:-]{0,159}$'
    OR p_lease_fence IS NULL
    OR p_lease_fence < 1
    OR v_outcome IS NULL
    OR v_outcome NOT IN ('sent', 'retry', 'dead')
    OR (p_response_code IS NOT NULL AND p_response_code NOT BETWEEN 100 AND 599)
    OR (p_duration_ms IS NOT NULL AND p_duration_ms < 0)
    OR (v_error_code IS NOT NULL AND v_error_code !~ '^[a-z0-9][a-z0-9._:-]{0,119}$')
    OR (
      v_outcome = 'sent'
      AND (
        p_response_code IS NULL
        OR p_response_code NOT BETWEEN 200 AND 299
        OR v_error_code IS NOT NULL
        OR p_available_at IS NOT NULL
      )
    )
    OR (v_outcome = 'retry' AND (p_available_at IS NULL OR v_error_code IS NULL))
    OR (v_outcome = 'dead' AND (v_error_code IS NULL OR p_available_at IS NOT NULL))
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_webhook_outbox_settlement';
  END IF;

  v_request_fingerprint := co_production_private.notification_sha256(
    pg_catalog.jsonb_build_object(
      'delivery_id', p_delivery_id,
      'lease_owner', lower(btrim(p_lease_owner)),
      'lease_fence', p_lease_fence,
      'outcome', v_outcome,
      'response_code', p_response_code,
      'duration_ms', p_duration_ms,
      'error_code', v_error_code,
      'available_at', p_available_at
    )::text
  );

  SELECT delivery.*
  INTO v_delivery
  FROM co_production.webhook_deliveries AS delivery
  WHERE delivery.id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'webhook_outbox_stale_fence';
  END IF;

  SELECT receipt.*
  INTO v_receipt
  FROM co_production.webhook_delivery_receipts AS receipt
  WHERE receipt.delivery_id = p_delivery_id
    AND receipt.lease_fence = p_lease_fence;

  IF FOUND THEN
    IF v_receipt.request_fingerprint IS DISTINCT FROM v_request_fingerprint THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'webhook_outbox_settlement_conflict';
    END IF;
    RETURN co_production_private.webhook_delivery_snapshot(v_delivery, true);
  END IF;

  IF v_delivery.status <> 'leased'
    OR v_delivery.lease_owner IS DISTINCT FROM lower(btrim(p_lease_owner))
    OR v_delivery.lease_fence IS DISTINCT FROM p_lease_fence
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'webhook_outbox_stale_fence';
  END IF;
  IF v_delivery.lease_expires_at <= v_now THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'webhook_outbox_lease_expired';
  END IF;
  IF (
      v_outcome = 'retry'
      AND (
        v_delivery.attempt >= v_delivery.max_attempts
        OR p_available_at <= v_now
      )
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_webhook_outbox_settlement';
  END IF;

  UPDATE co_production.webhook_deliveries AS delivery
  SET
    status = v_outcome,
    response_code = p_response_code,
    duration_ms = p_duration_ms,
    error_code = v_error_code,
    available_at = CASE WHEN v_outcome = 'retry' THEN p_available_at ELSE delivery.available_at END,
    lease_owner = NULL,
    lease_expires_at = NULL,
    delivered_at = CASE WHEN v_outcome = 'sent' THEN v_now ELSE NULL END,
    completed_at = CASE WHEN v_outcome IN ('sent', 'dead') THEN v_now ELSE NULL END,
    updated_at = v_now
  WHERE delivery.id = p_delivery_id
  RETURNING * INTO v_delivery;

  PERFORM co_production_private.append_webhook_delivery_event(
    v_delivery,
    CASE v_outcome
      WHEN 'sent' THEN 'sent'
      WHEN 'retry' THEN 'retry_scheduled'
      ELSE 'dead_lettered'
    END,
    lower(btrim(p_lease_owner)),
    p_response_code,
    v_error_code,
    v_now
  );

  INSERT INTO co_production.webhook_delivery_receipts (
    delivery_id,
    webhook_id,
    lease_fence,
    lease_owner,
    request_fingerprint,
    outcome,
    response_code,
    duration_ms,
    error_code,
    next_available_at,
    recorded_at
  ) VALUES (
    v_delivery.id,
    v_delivery.webhook_id,
    p_lease_fence,
    lower(btrim(p_lease_owner)),
    v_request_fingerprint,
    v_outcome,
    p_response_code,
    p_duration_ms,
    v_error_code,
    CASE WHEN v_outcome = 'retry' THEN p_available_at ELSE NULL END,
    v_now
  );

  RETURN co_production_private.webhook_delivery_snapshot(v_delivery, false);
END
$$;

REVOKE ALL ON TABLE
  co_production.webhook_deliveries,
  co_production.webhook_delivery_events,
  co_production.webhook_delivery_receipts
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE
  co_production.webhook_deliveries,
  co_production.webhook_delivery_events,
  co_production.webhook_delivery_receipts
TO authenticated, service_role;

REVOKE ALL ON FUNCTION co_production.enqueue_webhook_delivery(
  uuid, uuid, text, jsonb, text, timestamptz, integer
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production.claim_webhook_deliveries(
  text, integer, integer
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production.renew_webhook_delivery_lease(
  uuid, text, bigint, integer
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production.settle_webhook_delivery(
  uuid, text, bigint, text, integer, integer, text, timestamptz
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION co_production.enqueue_webhook_delivery(
  uuid, uuid, text, jsonb, text, timestamptz, integer
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION co_production.claim_webhook_deliveries(
  text, integer, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION co_production.renew_webhook_delivery_lease(
  uuid, text, bigint, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION co_production.settle_webhook_delivery(
  uuid, text, bigint, text, integer, integer, text, timestamptz
) TO service_role;

REVOKE ALL ON FUNCTION co_production_private.webhook_delivery_snapshot(
  co_production.webhook_deliveries, boolean
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.append_webhook_delivery_event(
  co_production.webhook_deliveries, text, text, integer, text, timestamptz
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.assert_webhook_enqueue_access(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.prevent_webhook_delivery_event_mutation()
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.webhook_outbox_payload_node_count(jsonb, integer)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.guard_webhook_delivery_update()
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.prevent_webhook_delivery_delete()
FROM PUBLIC, anon, authenticated, service_role;

CREATE INDEX webhook_deliveries_ready_idx
ON co_production.webhook_deliveries(available_at, created_at, id)
WHERE status IN ('queued', 'retry');

CREATE INDEX webhook_deliveries_expired_lease_idx
ON co_production.webhook_deliveries(lease_expires_at, id)
WHERE status = 'leased';

CREATE INDEX webhook_deliveries_terminal_idx
ON co_production.webhook_deliveries(webhook_id, status, updated_at DESC)
WHERE status IN ('dead', 'sent');

CREATE INDEX webhook_delivery_receipts_webhook_recorded_idx
ON co_production.webhook_delivery_receipts(webhook_id, recorded_at DESC, id);

COMMENT ON TABLE co_production.webhook_deliveries IS
  'Durable webhook queue authority. Rows are enqueued before network delivery and settled only by a fenced service-role worker.';
COMMENT ON TABLE co_production.webhook_delivery_events IS
  'Append-only webhook queue lifecycle events for retry, lease, dead-letter, and delivery observability.';
COMMENT ON TABLE co_production.webhook_delivery_receipts IS
  'Append-only fenced settlement receipts. Exact retries replay the committed result; changed retries fail closed.';

COMMIT;
