-- Atomic managed share authority.
--
-- This migration creates review links, immutable share receipts, and durable
-- email outbox records in one database transaction. It does not install a
-- worker, call a provider, or enable SMS/iMessage delivery.

BEGIN;

CREATE TABLE co_production.share_manifest_receipts (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  tenant_kind text NOT NULL CHECK (tenant_kind IN ('personal', 'team')),
  tenant_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  manifest_id text NOT NULL CHECK (
    manifest_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
  ),
  manifest_fingerprint text NOT NULL CHECK (
    manifest_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  activity_log_receipt_id uuid NOT NULL
    REFERENCES co_production.activity_log(id) ON DELETE RESTRICT,
  link_count integer NOT NULL CHECK (link_count BETWEEN 1 AND 20),
  notification_count integer NOT NULL CHECK (
    notification_count BETWEEN 0 AND 20
  ),
  rate_limit_remaining integer NOT NULL CHECK (
    rate_limit_remaining BETWEEN 0 AND 100
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT share_manifest_receipts_id_tenant_key
    UNIQUE (id, tenant_kind, tenant_id),
  CONSTRAINT share_manifest_receipts_actor_manifest_key
    UNIQUE (tenant_kind, tenant_id, actor_id, manifest_id)
);

CREATE TABLE co_production.share_manifest_receipt_items (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  receipt_id uuid NOT NULL
    REFERENCES co_production.share_manifest_receipts(id) ON DELETE RESTRICT,
  item_order integer NOT NULL CHECK (item_order BETWEEN 0 AND 19),
  invite_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  version_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT share_manifest_receipt_items_receipt_order_key
    UNIQUE (receipt_id, item_order),
  CONSTRAINT share_manifest_receipt_items_receipt_invite_key
    UNIQUE (receipt_id, invite_id),
  CONSTRAINT share_manifest_receipt_items_invite_asset_fk
    FOREIGN KEY (invite_id, asset_id)
    REFERENCES co_production.review_invites(id, asset_id)
    ON DELETE RESTRICT,
  CONSTRAINT share_manifest_receipt_items_version_asset_fk
    FOREIGN KEY (version_id, asset_id)
    REFERENCES co_production.versions(id, asset_id)
    ON DELETE RESTRICT
);

CREATE TABLE co_production.share_manifest_notification_receipts (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  receipt_id uuid NOT NULL,
  tenant_kind text NOT NULL CHECK (tenant_kind IN ('personal', 'team')),
  tenant_id uuid NOT NULL,
  notification_order integer NOT NULL CHECK (
    notification_order BETWEEN 0 AND 19
  ),
  channel text NOT NULL CHECK (channel = 'email'),
  scope_fingerprint text NOT NULL CHECK (
    scope_fingerprint ~ '^sha256:[0-9a-f]{64}$'
  ),
  status text NOT NULL CHECK (status IN ('queued', 'suppressed')),
  outbox_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT share_manifest_notification_receipts_receipt_fk
    FOREIGN KEY (receipt_id, tenant_kind, tenant_id)
    REFERENCES co_production.share_manifest_receipts(id, tenant_kind, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT share_manifest_notification_receipts_outbox_fk
    FOREIGN KEY (outbox_id, tenant_kind, tenant_id)
    REFERENCES co_production.notification_outbox(id, tenant_kind, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT share_manifest_notification_receipts_order_key
    UNIQUE (receipt_id, notification_order),
  CONSTRAINT share_manifest_notification_receipts_shape CHECK (
    (status = 'queued' AND outbox_id IS NOT NULL)
    OR (status = 'suppressed' AND outbox_id IS NULL)
  )
);

CREATE TABLE co_production.share_manifest_notification_items (
  notification_receipt_id uuid NOT NULL
    REFERENCES co_production.share_manifest_notification_receipts(id)
    ON DELETE RESTRICT,
  receipt_item_id uuid NOT NULL
    REFERENCES co_production.share_manifest_receipt_items(id)
    ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_receipt_id, receipt_item_id)
);

ALTER TABLE co_production.share_manifest_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.share_manifest_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.share_manifest_receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.share_manifest_receipt_items FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.share_manifest_notification_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.share_manifest_notification_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.share_manifest_notification_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.share_manifest_notification_items FORCE ROW LEVEL SECURITY;

CREATE POLICY share_manifest_receipts_select
ON co_production.share_manifest_receipts
FOR SELECT TO authenticated
USING (actor_id = (SELECT auth.uid()));

CREATE POLICY share_manifest_receipt_items_select
ON co_production.share_manifest_receipt_items
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM co_production.share_manifest_receipts AS receipt
    WHERE receipt.id = co_production.share_manifest_receipt_items.receipt_id
      AND receipt.actor_id = (SELECT auth.uid())
  )
);

CREATE POLICY share_manifest_notification_receipts_select
ON co_production.share_manifest_notification_receipts
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM co_production.share_manifest_receipts AS receipt
    WHERE receipt.id = co_production.share_manifest_notification_receipts.receipt_id
      AND receipt.actor_id = (SELECT auth.uid())
  )
);

CREATE POLICY share_manifest_notification_items_select
ON co_production.share_manifest_notification_items
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM co_production.share_manifest_notification_receipts AS notification
    JOIN co_production.share_manifest_receipts AS receipt
      ON receipt.id = notification.receipt_id
    WHERE notification.id =
      co_production.share_manifest_notification_items.notification_receipt_id
      AND receipt.actor_id = (SELECT auth.uid())
  )
);

CREATE OR REPLACE FUNCTION co_production_private.prevent_share_authority_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'share_manifest_authority_is_immutable';
END
$$;

CREATE TRIGGER share_manifest_receipts_immutable
BEFORE UPDATE OR DELETE ON co_production.share_manifest_receipts
FOR EACH ROW EXECUTE FUNCTION co_production_private.prevent_share_authority_mutation();
CREATE TRIGGER share_manifest_receipts_no_truncate
BEFORE TRUNCATE ON co_production.share_manifest_receipts
FOR EACH STATEMENT EXECUTE FUNCTION co_production_private.prevent_share_authority_mutation();

CREATE TRIGGER share_manifest_receipt_items_immutable
BEFORE UPDATE OR DELETE ON co_production.share_manifest_receipt_items
FOR EACH ROW EXECUTE FUNCTION co_production_private.prevent_share_authority_mutation();
CREATE TRIGGER share_manifest_receipt_items_no_truncate
BEFORE TRUNCATE ON co_production.share_manifest_receipt_items
FOR EACH STATEMENT EXECUTE FUNCTION co_production_private.prevent_share_authority_mutation();

CREATE TRIGGER share_manifest_notification_receipts_immutable
BEFORE UPDATE OR DELETE ON co_production.share_manifest_notification_receipts
FOR EACH ROW EXECUTE FUNCTION co_production_private.prevent_share_authority_mutation();
CREATE TRIGGER share_manifest_notification_receipts_no_truncate
BEFORE TRUNCATE ON co_production.share_manifest_notification_receipts
FOR EACH STATEMENT EXECUTE FUNCTION co_production_private.prevent_share_authority_mutation();

CREATE TRIGGER share_manifest_notification_items_immutable
BEFORE UPDATE OR DELETE ON co_production.share_manifest_notification_items
FOR EACH ROW EXECUTE FUNCTION co_production_private.prevent_share_authority_mutation();
CREATE TRIGGER share_manifest_notification_items_no_truncate
BEFORE TRUNCATE ON co_production.share_manifest_notification_items
FOR EACH STATEMENT EXECUTE FUNCTION co_production_private.prevent_share_authority_mutation();

CREATE OR REPLACE FUNCTION co_production_private.share_manifest_transaction_snapshot(
  p_receipt co_production.share_manifest_receipts,
  p_replayed boolean
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'replayed', p_replayed,
    'receipt_id', p_receipt.id,
    'manifest_id', p_receipt.manifest_id,
    'manifest_fingerprint', p_receipt.manifest_fingerprint,
    'invite_ids', COALESCE(
      (
        SELECT pg_catalog.jsonb_agg(item.invite_id ORDER BY item.item_order)
        FROM co_production.share_manifest_receipt_items AS item
        WHERE item.receipt_id = p_receipt.id
      ),
      '[]'::jsonb
    ),
    'notifications', COALESCE(
      (
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'channel', notification.channel,
            'scope_fingerprint', notification.scope_fingerprint,
            'status', notification.status,
            'outbox_id', notification.outbox_id,
            'replayed', p_replayed
          )
          ORDER BY notification.notification_order
        )
        FROM co_production.share_manifest_notification_receipts AS notification
        WHERE notification.receipt_id = p_receipt.id
      ),
      '[]'::jsonb
    ),
    'rate_limit_remaining', p_receipt.rate_limit_remaining,
    'created_at', p_receipt.created_at
  )
$$;

CREATE OR REPLACE FUNCTION co_production.create_share_manifest_with_outbox(
  p_manifest_id text,
  p_manifest_fingerprint text,
  p_tenant_kind text,
  p_tenant_id uuid,
  p_items jsonb,
  p_notification_intents jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $create_share_manifest_with_outbox$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_actor_name text := COALESCE(
    NULLIF(pg_catalog.btrim((SELECT auth.jwt()) ->> 'email'), ''),
    v_actor_id::text
  );
  v_tenant_kind text := pg_catalog.lower(pg_catalog.btrim(p_tenant_kind));
  v_tenant_key text;
  v_existing co_production.share_manifest_receipts%ROWTYPE;
  v_receipt co_production.share_manifest_receipts%ROWTYPE;
  v_receipt_id uuid := pg_catalog.gen_random_uuid();
  v_activity_receipt_id uuid;
  v_item jsonb;
  v_item_ordinal bigint;
  v_item_order integer;
  v_asset_id uuid;
  v_version_id uuid;
  v_project_id uuid;
  v_project_team_id uuid;
  v_project_owner_id uuid;
  v_expected_tenant_kind text;
  v_expected_tenant_id uuid;
  v_invite_id uuid;
  v_reviewer_email text;
  v_share_intent text;
  v_policy_template_id text;
  v_permissions text;
  v_approval_id uuid;
  v_expires_at timestamptz;
  v_retention_until timestamptz;
  v_max_expiry_days integer;
  v_invite_ids uuid[] := '{}'::uuid[];
  v_asset_ids uuid[] := '{}'::uuid[];
  v_version_ids uuid[] := '{}'::uuid[];
  v_project_ids uuid[] := '{}'::uuid[];
  v_reviewer_emails text[] := '{}'::text[];
  v_pair_keys text[] := '{}'::text[];
  v_links_in_window integer;
  v_rate_remaining integer;
  v_notification jsonb;
  v_notification_ordinal bigint;
  v_notification_order integer;
  v_notification_item_index integer;
  v_notification_indexes integer[];
  v_notification_email text;
  v_notification_identity_hash text;
  v_expected_identity_hash text;
  v_suppression_hash text;
  v_scope_fingerprint text;
  v_scope_items jsonb;
  v_payload jsonb;
  v_outbox jsonb;
  v_outbox_id uuid;
  v_notification_receipt_id uuid;
  v_notification_status text;
  v_notification_count integer;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '28000',
      MESSAGE = 'share_manifest_authenticated_actor_required';
  END IF;

  IF p_manifest_id IS NULL
    OR p_manifest_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
    OR p_manifest_fingerprint IS NULL
    OR p_manifest_fingerprint !~ '^[0-9a-f]{64}$'
    OR v_tenant_kind NOT IN ('personal', 'team')
    OR p_tenant_id IS NULL
    OR pg_catalog.jsonb_typeof(p_items) IS DISTINCT FROM 'array'
    OR pg_catalog.jsonb_array_length(p_items) NOT BETWEEN 1 AND 20
    OR pg_catalog.jsonb_typeof(p_notification_intents) IS DISTINCT FROM 'array'
    OR pg_catalog.jsonb_array_length(p_notification_intents) > 20
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_share_manifest_transaction_request';
  END IF;

  v_tenant_key := v_tenant_kind || ':' || p_tenant_id::text;
  v_notification_count := pg_catalog.jsonb_array_length(p_notification_intents);

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'share-manifest:' || v_tenant_key || ':' || v_actor_id::text || ':' || p_manifest_id,
      0
    )
  );

  SELECT receipt.*
  INTO v_existing
  FROM co_production.share_manifest_receipts AS receipt
  WHERE receipt.tenant_kind = v_tenant_kind
    AND receipt.tenant_id = p_tenant_id
    AND receipt.actor_id = v_actor_id
    AND receipt.manifest_id = p_manifest_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.manifest_fingerprint IS DISTINCT FROM p_manifest_fingerprint THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'share_manifest_idempotency_conflict';
    END IF;
    RETURN co_production_private.share_manifest_transaction_snapshot(
      v_existing,
      true
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM co_production.activity_log AS activity
    WHERE activity.actor_id = v_actor_id
      AND activity.action = 'share_manifest_created'
      AND activity.details @> pg_catalog.jsonb_build_object(
        'manifest_id',
        p_manifest_id
      )
      AND NOT activity.details ? 'atomic_write_contract'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'share_manifest_legacy_receipt_conflict';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('share-rate:' || v_actor_id::text, 0)
  );

  SELECT COALESCE(
    SUM(
      CASE
        WHEN activity.details ->> 'link_count' ~ '^[0-9]{1,3}$'
        THEN (activity.details ->> 'link_count')::integer
        ELSE 0
      END
    ),
    0
  )::integer
  INTO v_links_in_window
  FROM co_production.activity_log AS activity
  WHERE activity.actor_id = v_actor_id
    AND activity.action = 'share_manifest_created'
    AND activity.created_at >= now() - interval '10 minutes';

  IF v_links_in_window + pg_catalog.jsonb_array_length(p_items) > 100 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'share_manifest_rate_limited';
  END IF;
  v_rate_remaining := 100 - v_links_in_window - pg_catalog.jsonb_array_length(p_items);

  FOR v_item, v_item_ordinal IN
    SELECT entry.value, entry.ordinality
    FROM pg_catalog.jsonb_array_elements(p_items)
      WITH ORDINALITY AS entry(value, ordinality)
  LOOP
    v_item_order := v_item_ordinal::integer - 1;
    IF pg_catalog.jsonb_typeof(v_item) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'invalid_share_manifest_item';
    END IF;

    v_asset_id := NULLIF(v_item ->> 'asset_id', '')::uuid;
    v_version_id := NULLIF(v_item ->> 'version_id', '')::uuid;
    v_reviewer_email := NULLIF(
      pg_catalog.lower(pg_catalog.btrim(v_item ->> 'reviewer_email')),
      ''
    );
    v_share_intent := pg_catalog.lower(pg_catalog.btrim(v_item ->> 'share_intent'));
    v_policy_template_id := pg_catalog.lower(
      pg_catalog.btrim(v_item ->> 'policy_template_id')
    );
    v_permissions := pg_catalog.lower(pg_catalog.btrim(v_item ->> 'permissions'));
    v_approval_id := NULLIF(v_item ->> 'approval_id', '')::uuid;
    v_expires_at := NULLIF(v_item ->> 'expires_at', '')::timestamptz;
    v_retention_until := NULLIF(v_item ->> 'retention_until', '')::timestamptz;

    IF v_asset_id IS NULL
      OR v_version_id IS NULL
      OR v_share_intent NOT IN (
        'internal_review',
        'client_review',
        'approval_needed',
        'final_delivery'
      )
      OR v_policy_template_id NOT IN (
        'standard-review',
        'approval-route',
        'final-delivery',
        'regulated-review'
      )
      OR v_permissions NOT IN ('view', 'comment', 'approve')
      OR v_item ->> 'token_hash' IS NULL
      OR v_item ->> 'token_hash' !~ '^[0-9a-f]{64}$'
      OR v_item ->> 'token_ciphertext' IS NULL
      OR v_item ->> 'token_ciphertext' NOT LIKE 'v1.%'
      OR pg_catalog.char_length(v_item ->> 'token_ciphertext') > 2048
      OR (
        v_item ->> 'password_hash' IS NOT NULL
        AND (
          v_item ->> 'password_hash' NOT LIKE 'scrypt$v1$%'
          OR pg_catalog.char_length(v_item ->> 'password_hash') > 512
        )
      )
      OR (
        v_item ->> 'reviewer_name' IS NOT NULL
        AND pg_catalog.char_length(v_item ->> 'reviewer_name') > 120
      )
      OR (
        v_reviewer_email IS NOT NULL
        AND (
          pg_catalog.char_length(v_reviewer_email) > 254
          OR v_reviewer_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
        )
      )
      OR (
        v_item ->> 'watermark_text' IS NOT NULL
        AND pg_catalog.char_length(v_item ->> 'watermark_text') > 500
      )
      OR v_item ->> 'version_number' IS NULL
      OR v_item ->> 'version_number' !~ '^[1-9][0-9]{0,8}$'
      OR pg_catalog.jsonb_typeof(v_item -> 'watermark_enabled') IS DISTINCT FROM 'boolean'
      OR pg_catalog.jsonb_typeof(v_item -> 'download_enabled') IS DISTINCT FROM 'boolean'
      OR v_expires_at IS NULL
      OR v_expires_at <= now()
      OR v_retention_until IS NULL
      OR v_retention_until <= now()
      OR v_retention_until > now() + interval '10 years'
      OR (
        v_item -> 'max_views' IS NOT NULL
        AND pg_catalog.jsonb_typeof(v_item -> 'max_views') <> 'null'
        AND (
          pg_catalog.jsonb_typeof(v_item -> 'max_views') <> 'number'
          OR (v_item ->> 'max_views')::integer NOT BETWEEN 1 AND 10000
        )
      )
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'invalid_share_manifest_item';
    END IF;

    v_max_expiry_days := CASE v_policy_template_id
      WHEN 'standard-review' THEN 30
      WHEN 'approval-route' THEN 14
      WHEN 'final-delivery' THEN 30
      WHEN 'regulated-review' THEN 7
    END;
    IF v_expires_at > now() + pg_catalog.make_interval(days => v_max_expiry_days)
      OR (v_policy_template_id = 'approval-route' AND v_share_intent <> 'approval_needed')
      OR (v_policy_template_id = 'final-delivery' AND v_share_intent <> 'final_delivery')
      OR (
        v_policy_template_id = 'standard-review'
        AND v_share_intent NOT IN ('internal_review', 'client_review')
      )
      OR (
        v_policy_template_id = 'regulated-review'
        AND v_share_intent NOT IN ('internal_review', 'client_review', 'final_delivery')
      )
      OR (
        v_policy_template_id = 'standard-review'
        AND v_permissions NOT IN ('view', 'comment')
      )
      OR (v_policy_template_id = 'approval-route' AND v_permissions <> 'approve')
      OR (v_policy_template_id = 'final-delivery' AND v_permissions <> 'view')
      OR (
        v_policy_template_id = 'regulated-review'
        AND v_permissions NOT IN ('view', 'comment')
      )
      OR (v_share_intent = 'approval_needed' AND v_permissions <> 'approve')
      OR (v_share_intent = 'approval_needed' AND (v_item ->> 'download_enabled')::boolean)
      OR (v_policy_template_id = 'regulated-review' AND NOT (v_item ->> 'watermark_enabled')::boolean)
      OR (v_policy_template_id = 'regulated-review' AND (v_item ->> 'download_enabled')::boolean)
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'share_manifest_policy_violation';
    END IF;

    IF (v_asset_id::text || ':' || v_version_id::text) = ANY(v_pair_keys) THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'share_manifest_items_must_be_unique';
    END IF;
    v_pair_keys := pg_catalog.array_append(
      v_pair_keys,
      v_asset_id::text || ':' || v_version_id::text
    );

    SELECT asset.project_id, project.team_id, project.owner_id
    INTO v_project_id, v_project_team_id, v_project_owner_id
    FROM co_production.assets AS asset
    JOIN co_production.projects AS project ON project.id = asset.project_id
    WHERE asset.id = v_asset_id
      AND co_production_private.has_asset_role(asset.id, 70)
    FOR UPDATE OF asset;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'share_manifest_asset_unavailable';
    END IF;

    v_expected_tenant_kind := CASE
      WHEN v_project_team_id IS NULL THEN 'personal'
      ELSE 'team'
    END;
    v_expected_tenant_id := COALESCE(v_project_team_id, v_project_owner_id);
    IF v_expected_tenant_kind <> v_tenant_kind
      OR v_expected_tenant_id <> p_tenant_id
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'share_manifest_tenant_mismatch';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM co_production.versions AS version
      WHERE version.id = v_version_id
        AND version.asset_id = v_asset_id
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23503',
        MESSAGE = 'share_manifest_version_mismatch';
    END IF;

    IF v_share_intent = 'approval_needed' AND (
      v_approval_id IS NULL
      OR v_reviewer_email IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM co_production.approvals AS approval
        WHERE approval.id = v_approval_id
          AND approval.asset_id = v_asset_id
          AND approval.status = 'pending'
          AND pg_catalog.lower(pg_catalog.btrim(approval.assignee_email)) = v_reviewer_email
      )
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23503',
        MESSAGE = 'share_manifest_approval_assignment_conflict';
    END IF;

    INSERT INTO co_production.review_invites (
      asset_id,
      version_id,
      approval_id,
      token_hash,
      token_ciphertext,
      password_hash,
      reviewer_name,
      reviewer_email,
      permissions,
      expires_at,
      created_by,
      watermark_enabled,
      watermark_text,
      download_enabled,
      max_views
    ) VALUES (
      v_asset_id,
      v_version_id,
      v_approval_id,
      v_item ->> 'token_hash',
      v_item ->> 'token_ciphertext',
      NULLIF(v_item ->> 'password_hash', ''),
      NULLIF(pg_catalog.btrim(v_item ->> 'reviewer_name'), ''),
      v_reviewer_email,
      v_permissions,
      v_expires_at,
      v_actor_id,
      (v_item ->> 'watermark_enabled')::boolean,
      NULLIF(v_item ->> 'watermark_text', ''),
      (v_item ->> 'download_enabled')::boolean,
      NULLIF(v_item ->> 'max_views', '')::integer
    )
    RETURNING id INTO v_invite_id;

    INSERT INTO co_production.activity_log (
      project_id,
      asset_id,
      actor_id,
      actor_name,
      action,
      details
    ) VALUES (
      v_project_id,
      v_asset_id,
      v_actor_id,
      v_actor_name,
      'share_link_created',
      pg_catalog.jsonb_build_object(
        'manifest_id', p_manifest_id,
        'atomic_share_receipt_id', v_receipt_id,
        'invite_id', v_invite_id,
        'asset_id', v_asset_id,
        'version_id', v_version_id,
        'version_number', (v_item ->> 'version_number')::integer,
        'share_intent', v_share_intent,
        'policy_template_id', v_policy_template_id,
        'permissions', v_permissions,
        'download_enabled', (v_item ->> 'download_enabled')::boolean,
        'watermark_enabled', (v_item ->> 'watermark_enabled')::boolean,
        'password_protected', v_item ->> 'password_hash' IS NOT NULL,
        'expires_at', v_expires_at,
        'approval_id', v_approval_id,
        'retention_class', 'share_authority',
        'retain_until', v_retention_until
      )
    );

    v_invite_ids := pg_catalog.array_append(v_invite_ids, v_invite_id);
    v_asset_ids := pg_catalog.array_append(v_asset_ids, v_asset_id);
    v_version_ids := pg_catalog.array_append(v_version_ids, v_version_id);
    v_reviewer_emails := pg_catalog.array_append(v_reviewer_emails, v_reviewer_email);
    IF NOT v_project_id = ANY(v_project_ids) THEN
      v_project_ids := pg_catalog.array_append(v_project_ids, v_project_id);
    END IF;
  END LOOP;

  INSERT INTO co_production.activity_log (
    project_id,
    asset_id,
    actor_id,
    actor_name,
    action,
    details
  ) VALUES (
    v_project_ids[1],
    CASE WHEN pg_catalog.array_length(v_asset_ids, 1) = 1 THEN v_asset_ids[1] ELSE NULL END,
    v_actor_id,
    v_actor_name,
    'share_manifest_created',
    pg_catalog.jsonb_build_object(
      'tenant_id', v_tenant_key,
      'manifest_id', p_manifest_id,
      'manifest_fingerprint', p_manifest_fingerprint,
      'atomic_write_contract', 'co_production.share-manifest-outbox.v1',
      'share_manifest_receipt_id', v_receipt_id,
      'link_count', pg_catalog.array_length(v_invite_ids, 1),
      'notification_count', v_notification_count,
      'project_ids', pg_catalog.to_jsonb(v_project_ids),
      'retention_class', 'share_manifest',
      'retain_until', (
        SELECT pg_catalog.max((item ->> 'retention_until')::timestamptz)
        FROM pg_catalog.jsonb_array_elements(p_items) AS item
      )
    )
  )
  RETURNING id INTO v_activity_receipt_id;

  INSERT INTO co_production.share_manifest_receipts (
    id,
    tenant_kind,
    tenant_id,
    actor_id,
    manifest_id,
    manifest_fingerprint,
    activity_log_receipt_id,
    link_count,
    notification_count,
    rate_limit_remaining
  ) VALUES (
    v_receipt_id,
    v_tenant_kind,
    p_tenant_id,
    v_actor_id,
    p_manifest_id,
    p_manifest_fingerprint,
    v_activity_receipt_id,
    pg_catalog.array_length(v_invite_ids, 1),
    v_notification_count,
    v_rate_remaining
  )
  RETURNING * INTO v_receipt;

  FOR v_item_order IN 0..pg_catalog.array_length(v_invite_ids, 1) - 1 LOOP
    INSERT INTO co_production.share_manifest_receipt_items (
      receipt_id,
      item_order,
      invite_id,
      asset_id,
      version_id
    ) VALUES (
      v_receipt_id,
      v_item_order,
      v_invite_ids[v_item_order + 1],
      v_asset_ids[v_item_order + 1],
      v_version_ids[v_item_order + 1]
    );
  END LOOP;

  FOR v_notification, v_notification_ordinal IN
    SELECT entry.value, entry.ordinality
    FROM pg_catalog.jsonb_array_elements(p_notification_intents)
      WITH ORDINALITY AS entry(value, ordinality)
  LOOP
    v_notification_order := v_notification_ordinal::integer - 1;
    IF pg_catalog.jsonb_typeof(v_notification) IS DISTINCT FROM 'object'
      OR pg_catalog.lower(pg_catalog.btrim(v_notification ->> 'channel')) <> 'email'
      OR v_notification ->> 'idempotency_key' IS NULL
      OR v_notification ->> 'idempotency_key' !~ '^[a-z0-9][a-z0-9._:-]{15,199}$'
      OR v_notification ->> 'event_type' IS NULL
      OR v_notification ->> 'event_type' !~ '^[a-z][a-z0-9_.-]{2,79}$'
      OR v_notification ->> 'recipient_identity_hash' IS NULL
      OR v_notification ->> 'recipient_identity_hash' !~ '^sha256:[0-9a-f]{64}$'
      OR v_notification ->> 'recipient_redacted' IS NULL
      OR v_notification ->> 'max_attempts' IS NULL
      OR pg_catalog.jsonb_typeof(v_notification -> 'payload') IS DISTINCT FROM 'object'
      OR NOT co_production_private.notification_outbox_payload_is_safe(
        v_notification -> 'payload'
      )
      OR pg_catalog.jsonb_typeof(v_notification -> 'item_indexes') IS DISTINCT FROM 'array'
      OR pg_catalog.jsonb_array_length(v_notification -> 'item_indexes') NOT BETWEEN 1 AND 20
      OR (v_notification ->> 'max_attempts')::integer NOT BETWEEN 1 AND 12
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'invalid_share_notification_intent';
    END IF;

    v_notification_indexes := '{}'::integer[];
    v_notification_email := NULL;
    FOR v_notification_item_index IN
      SELECT (entry.value #>> '{}')::integer
      FROM pg_catalog.jsonb_array_elements(
        v_notification -> 'item_indexes'
      ) AS entry(value)
    LOOP
      IF v_notification_item_index < 0
        OR v_notification_item_index >= pg_catalog.array_length(v_invite_ids, 1)
        OR v_notification_item_index = ANY(v_notification_indexes)
      THEN
        RAISE EXCEPTION USING
          ERRCODE = '22023',
          MESSAGE = 'invalid_share_notification_item_scope';
      END IF;
      v_notification_indexes := pg_catalog.array_append(
        v_notification_indexes,
        v_notification_item_index
      );
      IF v_reviewer_emails[v_notification_item_index + 1] IS NULL
        OR (
          v_notification_email IS NOT NULL
          AND v_notification_email <> v_reviewer_emails[v_notification_item_index + 1]
        )
      THEN
        RAISE EXCEPTION USING
          ERRCODE = '22023',
          MESSAGE = 'share_notification_recipient_scope_mismatch';
      END IF;
      v_notification_email := v_reviewer_emails[v_notification_item_index + 1];
    END LOOP;

    v_notification_identity_hash := v_notification ->> 'recipient_identity_hash';
    v_expected_identity_hash := 'sha256:' || pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to('email', 'UTF8')
          || pg_catalog.decode('00', 'hex')
          || pg_catalog.convert_to(v_notification_email, 'UTF8'),
        'sha256'
      ),
      'hex'
    );
    IF v_notification_identity_hash <> v_expected_identity_hash THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'share_notification_recipient_hash_mismatch';
    END IF;

    SELECT pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'asset_id', v_asset_ids[scope.item_index + 1],
        'version_id', v_version_ids[scope.item_index + 1]
      )
      ORDER BY
        v_asset_ids[scope.item_index + 1]::text,
        v_version_ids[scope.item_index + 1]::text
    )
    INTO v_scope_items
    FROM pg_catalog.unnest(v_notification_indexes) AS scope(item_index);

    v_scope_fingerprint := co_production_private.notification_sha256(
      pg_catalog.jsonb_build_object(
        'channel', 'email',
        'recipient_identity_hash', v_notification_identity_hash,
        'items', v_scope_items
      )::text
    );
    v_suppression_hash := pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to('email:' || v_notification_email, 'UTF8'),
        'sha256'
      ),
      'hex'
    );
    v_payload := (v_notification -> 'payload') || pg_catalog.jsonb_build_object(
      'authority_kind', 'share_manifest_created',
      'authority_id', v_receipt_id,
      'authority_scope_fingerprint', v_scope_fingerprint
    );

    IF EXISTS (
      SELECT 1
      FROM co_production.activity_log AS activity
      WHERE activity.action = 'notification_recipient_suppressed'
        AND activity.details @> pg_catalog.jsonb_build_object(
          'tenant_id', v_tenant_key,
          'channel', 'email',
          'recipient_hash', v_suppression_hash
        )
    ) THEN
      v_notification_status := 'suppressed';
      v_outbox_id := NULL;
    ELSE
      v_outbox := co_production.enqueue_notification_outbox(
        v_tenant_kind,
        p_tenant_id,
        'email',
        v_notification ->> 'idempotency_key',
        v_notification ->> 'event_type',
        v_notification_identity_hash,
        v_notification ->> 'recipient_redacted',
        v_payload,
        now(),
        (v_notification ->> 'max_attempts')::integer
      );
      v_notification_status := 'queued';
      v_outbox_id := NULLIF(v_outbox ->> 'outbox_id', '')::uuid;
      IF v_outbox_id IS NULL THEN
        RAISE EXCEPTION USING
          ERRCODE = '55000',
          MESSAGE = 'share_notification_outbox_response_invalid';
      END IF;
    END IF;

    INSERT INTO co_production.share_manifest_notification_receipts (
      receipt_id,
      tenant_kind,
      tenant_id,
      notification_order,
      channel,
      scope_fingerprint,
      status,
      outbox_id
    ) VALUES (
      v_receipt_id,
      v_tenant_kind,
      p_tenant_id,
      v_notification_order,
      'email',
      v_scope_fingerprint,
      v_notification_status,
      v_outbox_id
    )
    RETURNING id INTO v_notification_receipt_id;

    FOR v_notification_item_index IN
      SELECT pg_catalog.unnest(v_notification_indexes)
    LOOP
      INSERT INTO co_production.share_manifest_notification_items (
        notification_receipt_id,
        receipt_item_id
      )
      SELECT v_notification_receipt_id, item.id
      FROM co_production.share_manifest_receipt_items AS item
      WHERE item.receipt_id = v_receipt_id
        AND item.item_order = v_notification_item_index;
    END LOOP;

  END LOOP;

  RETURN co_production_private.share_manifest_transaction_snapshot(
    v_receipt,
    false
  );
END
$create_share_manifest_with_outbox$;

REVOKE ALL ON TABLE
  co_production.share_manifest_receipts,
  co_production.share_manifest_receipt_items,
  co_production.share_manifest_notification_receipts,
  co_production.share_manifest_notification_items
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE
  co_production.share_manifest_receipts,
  co_production.share_manifest_receipt_items,
  co_production.share_manifest_notification_receipts,
  co_production.share_manifest_notification_items
TO authenticated;

REVOKE ALL ON FUNCTION co_production.create_share_manifest_with_outbox(
  text, text, text, uuid, jsonb, jsonb
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION co_production.create_share_manifest_with_outbox(
  text, text, text, uuid, jsonb, jsonb
) TO authenticated;

REVOKE ALL ON FUNCTION co_production_private.share_manifest_transaction_snapshot(
  co_production.share_manifest_receipts, boolean
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION co_production_private.prevent_share_authority_mutation()
FROM PUBLIC, anon, authenticated, service_role;

CREATE INDEX share_manifest_receipts_actor_created_idx
  ON co_production.share_manifest_receipts(actor_id, created_at DESC);
CREATE INDEX share_manifest_receipt_items_asset_version_idx
  ON co_production.share_manifest_receipt_items(asset_id, version_id, receipt_id);
CREATE INDEX share_manifest_notification_receipts_outbox_idx
  ON co_production.share_manifest_notification_receipts(outbox_id)
  WHERE outbox_id IS NOT NULL;

COMMENT ON TABLE co_production.share_manifest_receipts IS
  'Immutable idempotency and audit authority for atomically created managed share manifests.';
COMMENT ON FUNCTION co_production.create_share_manifest_with_outbox(
  text, text, text, uuid, jsonb, jsonb
) IS
  'Creates managed review links, audit authority, and queued email intents in one transaction. No provider delivery occurs.';

COMMIT;
