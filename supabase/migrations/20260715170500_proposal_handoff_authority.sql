-- Signed CCO Proposal Studio -> Co-VideoPro project activation.
--
-- This migration is additive and targets only the isolated co_production
-- schema. No integration binding is seeded here, and the HTTP gateway keeps
-- activation disabled unless both the application and database gates are on.

BEGIN;

CREATE TABLE co_production.proposal_integration_bindings (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  source_tenant_id text NOT NULL CHECK (
    length(btrim(source_tenant_id)) BETWEEN 1 AND 240
    AND source_tenant_id = lower(source_tenant_id)
  ),
  signing_key_id text NOT NULL CHECK (length(btrim(signing_key_id)) BETWEEN 1 AND 160),
  public_key_pem text NOT NULL CHECK (
    public_key_pem LIKE '-----BEGIN PUBLIC KEY-----%'
    AND length(public_key_pem) <= 4096
  ),
  team_id uuid NOT NULL REFERENCES co_production.teams(id) ON DELETE RESTRICT,
  project_owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT false,
  activation_enabled boolean NOT NULL DEFAULT false,
  receiver_hmac_secret bytea NOT NULL CHECK (
    octet_length(receiver_hmac_secret) = 32
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_tenant_id, signing_key_id)
);

ALTER TABLE co_production.proposal_integration_bindings ENABLE ROW LEVEL SECURITY;

CREATE VIEW co_production.proposal_integration_public_keys
WITH (security_barrier = true)
AS
SELECT
  binding.source_tenant_id,
  binding.signing_key_id,
  binding.public_key_pem,
  binding.active
FROM co_production.proposal_integration_bindings AS binding;

CREATE TABLE co_production.proposal_handoff_receipts (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  source_tenant_id text NOT NULL,
  signing_key_id text NOT NULL,
  team_id uuid NOT NULL REFERENCES co_production.teams(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL UNIQUE REFERENCES co_production.projects(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL CHECK (
    idempotency_key = lower(idempotency_key)
    AND length(idempotency_key) BETWEEN 1 AND 320
  ),
  attested_payload_hash text NOT NULL CHECK (
    attested_payload_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  database_payload_hash text NOT NULL CHECK (
    database_payload_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  schema_version text NOT NULL CHECK (schema_version = '1.0.0'),
  package_id text NOT NULL CHECK (length(btrim(package_id)) BETWEEN 1 AND 240),
  package_version integer NOT NULL CHECK (package_version > 0),
  proposal_version_id text NOT NULL CHECK (length(btrim(proposal_version_id)) BETWEEN 1 AND 240),
  proposal_content_hash text NOT NULL CHECK (
    proposal_content_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  quote_version_id text NOT NULL CHECK (length(btrim(quote_version_id)) BETWEEN 1 AND 240),
  quote_content_hash text NOT NULL CHECK (
    quote_content_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  display_number text NOT NULL CHECK (length(btrim(display_number)) BETWEEN 1 AND 80),
  approval_receipt_ids text[] NOT NULL CHECK (cardinality(approval_receipt_ids) > 0),
  decision_receipt jsonb NOT NULL CHECK (
    jsonb_typeof(decision_receipt) = 'object'
    AND decision_receipt ->> 'decision' = 'accepted'
  ),
  project_seed jsonb NOT NULL CHECK (jsonb_typeof(project_seed) = 'object'),
  production_seed jsonb NOT NULL CHECK (jsonb_typeof(production_seed) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (source_tenant_id, signing_key_id)
    REFERENCES co_production.proposal_integration_bindings(source_tenant_id, signing_key_id)
    ON DELETE RESTRICT,
  UNIQUE (source_tenant_id, idempotency_key),
  UNIQUE (source_tenant_id, package_id, package_version),
  UNIQUE (source_tenant_id, proposal_version_id),
  UNIQUE (source_tenant_id, quote_version_id)
);

ALTER TABLE co_production.proposal_handoff_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY proposal_handoff_receipts_select
  ON co_production.proposal_handoff_receipts
  FOR SELECT TO authenticated
  USING (co_production_private.has_project_role(project_id, 10));

CREATE OR REPLACE FUNCTION co_production_private.prevent_proposal_handoff_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'proposal_handoff_receipts are immutable';
END
$$;

CREATE TRIGGER proposal_handoff_receipts_immutable
BEFORE UPDATE OR DELETE ON co_production.proposal_handoff_receipts
FOR EACH ROW
EXECUTE FUNCTION co_production_private.prevent_proposal_handoff_mutation();

CREATE TRIGGER proposal_handoff_receipts_no_truncate
BEFORE TRUNCATE ON co_production.proposal_handoff_receipts
FOR EACH STATEMENT
EXECUTE FUNCTION co_production_private.prevent_proposal_handoff_mutation();

CREATE VIEW co_production.proposal_handoff_receipt_summaries
WITH (security_barrier = true, security_invoker = true)
AS
SELECT
  receipt.id,
  receipt.team_id,
  receipt.project_id,
  receipt.idempotency_key,
  receipt.attested_payload_hash AS payload_hash,
  receipt.package_id,
  receipt.package_version,
  receipt.proposal_version_id,
  receipt.quote_version_id,
  receipt.display_number,
  receipt.created_at
FROM co_production.proposal_handoff_receipts AS receipt
WHERE co_production_private.has_project_role(receipt.project_id, 10);

CREATE OR REPLACE FUNCTION co_production.activate_proposal_handoff(
  p_source_tenant_id text,
  p_signing_key_id text,
  p_schema_version text,
  p_attestation jsonb,
  p_canonical_payload text,
  p_receiver_proof text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_binding co_production.proposal_integration_bindings%ROWTYPE;
  v_existing co_production.proposal_handoff_receipts%ROWTYPE;
  v_project_id uuid;
  v_receipt_id uuid;
  v_idempotency_key text;
  v_expected_key text;
  v_variant text;
  v_project_title text;
  v_project_description text;
  v_attested_payload_hash text;
  v_database_payload_hash text;
  v_expected_receiver_proof text;
  v_start_date date;
  v_due_date date;
  v_artifact jsonb;
  p_handoff jsonb;
BEGIN
  SELECT binding.*
  INTO v_binding
  FROM co_production.proposal_integration_bindings AS binding
  WHERE binding.source_tenant_id = lower(btrim(p_source_tenant_id))
    AND binding.signing_key_id = btrim(p_signing_key_id)
    AND binding.active = true
    AND binding.activation_enabled = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'invalid_integration_binding';
  END IF;

  IF p_schema_version IS DISTINCT FROM '1.0.0'
    OR jsonb_typeof(p_attestation) IS DISTINCT FROM 'object'
    OR p_attestation ->> 'keyId' IS DISTINCT FROM v_binding.signing_key_id
    OR coalesce(p_attestation ->> 'payloadHash', '') !~ '^sha256:[0-9a-f]{64}$'
    OR coalesce(p_receiver_proof, '') !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'invalid_receiver_authority';
  END IF;

  v_database_payload_hash := 'sha256:' || pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(p_canonical_payload, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  v_attested_payload_hash := lower(p_attestation ->> 'payloadHash');
  IF v_database_payload_hash IS DISTINCT FROM v_attested_payload_hash THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'attestation_payload_mismatch';
  END IF;

  v_expected_receiver_proof := pg_catalog.encode(
    extensions.hmac(
      pg_catalog.convert_to(p_canonical_payload, 'UTF8'),
      v_binding.receiver_hmac_secret,
      'sha256'
    ),
    'hex'
  );
  IF lower(p_receiver_proof) IS DISTINCT FROM v_expected_receiver_proof THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'invalid_receiver_proof';
  END IF;

  BEGIN
    p_handoff := p_canonical_payload::jsonb;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_canonical_payload';
  END;

  IF NOT EXISTS (
    SELECT 1
    FROM co_production.teams AS team
    WHERE team.id = v_binding.team_id
      AND (
        team.owner_id = v_binding.project_owner_id
        OR EXISTS (
          SELECT 1
          FROM co_production.team_members AS member
          WHERE member.team_id = team.id
            AND member.user_id = v_binding.project_owner_id
            AND co_production_private.role_rank(member.role) >= 70
        )
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'invalid_integration_project_owner';
  END IF;

  IF jsonb_typeof(p_handoff) IS DISTINCT FROM 'object'
    OR p_handoff ->> 'intent' IS DISTINCT FROM 'activate'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_proposal_handoff';
  END IF;

  IF lower(p_handoff ->> 'sourceTenantId') IS DISTINCT FROM v_binding.source_tenant_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'cross_tenant_handoff_forbidden';
  END IF;

  IF p_handoff::text ~* '"(totalCents|currency|lineItems|quantity|unitPriceCents|lineTotalCents|subtotalCents|adjustmentTotalCents|preTaxTotalCents|taxCents|adjustments|depositMilestones|rateCardVersionId|internalUnitCostCents|internalCostCents|grossMarginCents|grossMarginBasisPoints|sourceDeclaredTotalCents|budget_cents|value_cents|invoice|payment|deposit|charge|stripe)"[[:space:]]*:' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'commercial_field_forbidden';
  END IF;

  IF coalesce(p_handoff ->> 'packageId', '') = ''
    OR coalesce(p_handoff ->> 'proposalVersionId', '') = ''
    OR coalesce(p_handoff ->> 'proposalContentHash', '') !~ '^sha256:[0-9a-f]{64}$'
    OR coalesce(p_handoff ->> 'quoteVersionId', '') = ''
    OR coalesce(p_handoff ->> 'quoteContentHash', '') !~ '^sha256:[0-9a-f]{64}$'
    OR coalesce(p_handoff ->> 'displayNumber', '') = ''
    OR jsonb_typeof(p_handoff -> 'approvalReceiptIds') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_handoff -> 'approvalReceiptIds') < 1
    OR jsonb_typeof(p_handoff -> 'decisionReceipt') IS DISTINCT FROM 'object'
    OR p_handoff -> 'decisionReceipt' ->> 'decision' IS DISTINCT FROM 'accepted'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'incomplete_commercial_authority';
  END IF;

  IF jsonb_typeof(p_handoff -> 'scopeItemIds') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_handoff -> 'scopeItemIds') < 1
    OR jsonb_typeof(p_handoff -> 'deliverables') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_handoff -> 'deliverables') < 1
    OR p_handoff -> 'productionModules'
      IS DISTINCT FROM '["Co-Script", "Co-Edit", "Co-Deliver"]'::jsonb
    OR jsonb_typeof(p_handoff -> 'artifactRefs') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_handoff -> 'artifactRefs') < 1
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'incomplete_production_seed';
  END IF;

  FOR v_artifact IN
    SELECT value FROM jsonb_array_elements(p_handoff -> 'artifactRefs')
  LOOP
    IF v_artifact ->> 'classification' IS DISTINCT FROM 'production_safe'
      OR v_artifact ->> 'kind' NOT IN (
        'production_manifest', 'brief', 'evidence_register', 'source'
      )
      OR coalesce(v_artifact ->> 'sha256', '') !~ '^[0-9a-f]{64}$'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'unsafe_production_artifact';
    END IF;
  END LOOP;

  IF jsonb_typeof(p_handoff -> 'project') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_handoff -> 'project' -> 'productionWindow') IS DISTINCT FROM 'object'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'missing_production_window';
  END IF;

  BEGIN
    v_start_date := (p_handoff -> 'project' -> 'productionWindow' ->> 'startDate')::date;
    v_due_date := (p_handoff -> 'project' -> 'productionWindow' ->> 'dueDate')::date;
  EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_production_window';
  END;

  IF v_due_date < v_start_date
    OR jsonb_typeof(p_handoff -> 'project' -> 'productionWindow' -> 'constraints')
      IS DISTINCT FROM 'array'
    OR jsonb_array_length(
      p_handoff -> 'project' -> 'productionWindow' -> 'constraints'
    ) < 1
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_production_window';
  END IF;

  v_project_title := btrim(p_handoff -> 'project' ->> 'title');
  v_project_description := nullif(btrim(p_handoff -> 'project' ->> 'description'), '');
  IF v_project_title IS NULL OR length(v_project_title) NOT BETWEEN 1 AND 240 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_project_title';
  END IF;
  IF v_project_description IS NOT NULL AND length(v_project_description) > 10000 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_project_description';
  END IF;

  v_idempotency_key := lower(btrim(p_handoff ->> 'idempotencyKey'));
  v_variant := (
    pg_catalog.regexp_match(
      upper(p_handoff ->> 'displayNumber'),
      '^[A-Z0-9]+-([A-Z][A-Z0-9]{0,2})(-R[1-9][0-9]*)?$'
    )
  )[1];
  IF v_variant IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_display_number';
  END IF;
  v_expected_key := lower(pg_catalog.format(
    'cco:%s:v%s:%s',
    p_handoff ->> 'packageId',
    (p_handoff ->> 'packageVersion')::integer,
    v_variant
  ));
  IF v_idempotency_key IS DISTINCT FROM v_expected_key THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'idempotency_binding_mismatch';
  END IF;

  SELECT receipt.*
  INTO v_existing
  FROM co_production.proposal_handoff_receipts AS receipt
  WHERE receipt.source_tenant_id = v_binding.source_tenant_id
    AND (
      receipt.idempotency_key = v_idempotency_key
      OR (
        receipt.package_id = p_handoff ->> 'packageId'
        AND receipt.package_version = (p_handoff ->> 'packageVersion')::integer
      )
      OR receipt.proposal_version_id = p_handoff ->> 'proposalVersionId'
      OR receipt.quote_version_id = p_handoff ->> 'quoteVersionId'
    )
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.database_payload_hash IS DISTINCT FROM v_database_payload_hash
      OR v_existing.attested_payload_hash IS DISTINCT FROM v_attested_payload_hash
      OR v_existing.idempotency_key IS DISTINCT FROM v_idempotency_key
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'idempotency_payload_conflict';
    END IF;

    RETURN jsonb_build_object(
      'mode', 'live',
      'status', 'created',
      'replayed', true,
      'receiptId', v_existing.id,
      'projectId', v_existing.project_id,
      'idempotencyKey', v_existing.idempotency_key,
      'payloadHash', v_existing.attested_payload_hash,
      'target', 'Co-VideoPro',
      'commercialAuthority', 'CCO_OS',
      'commercialReference', jsonb_build_object(
        'packageId', v_existing.package_id,
        'packageVersion', v_existing.package_version,
        'proposalVersionId', v_existing.proposal_version_id,
        'quoteVersionId', v_existing.quote_version_id,
        'displayNumber', v_existing.display_number,
        'decisionReceiptId', v_existing.decision_receipt ->> 'id'
      )
    );
  END IF;

  BEGIN
    INSERT INTO co_production.projects (
      team_id,
      owner_id,
      name,
      description,
      status
    )
    VALUES (
      v_binding.team_id,
      v_binding.project_owner_id,
      v_project_title,
      v_project_description,
      'active'
    )
    RETURNING id INTO v_project_id;

    INSERT INTO co_production.proposal_handoff_receipts (
      source_tenant_id,
      signing_key_id,
      team_id,
      project_id,
      idempotency_key,
      attested_payload_hash,
      database_payload_hash,
      schema_version,
      package_id,
      package_version,
      proposal_version_id,
      proposal_content_hash,
      quote_version_id,
      quote_content_hash,
      display_number,
      approval_receipt_ids,
      decision_receipt,
      project_seed,
      production_seed
    )
    VALUES (
      v_binding.source_tenant_id,
      v_binding.signing_key_id,
      v_binding.team_id,
      v_project_id,
      v_idempotency_key,
      v_attested_payload_hash,
      v_database_payload_hash,
      p_schema_version,
      p_handoff ->> 'packageId',
      (p_handoff ->> 'packageVersion')::integer,
      p_handoff ->> 'proposalVersionId',
      lower(p_handoff ->> 'proposalContentHash'),
      p_handoff ->> 'quoteVersionId',
      lower(p_handoff ->> 'quoteContentHash'),
      upper(p_handoff ->> 'displayNumber'),
      ARRAY(
        SELECT jsonb_array_elements_text(p_handoff -> 'approvalReceiptIds')
      ),
      p_handoff -> 'decisionReceipt',
      p_handoff -> 'project',
      jsonb_build_object(
        'clientId', p_handoff ->> 'clientId',
        'opportunityId', p_handoff ->> 'opportunityId',
        'briefId', p_handoff ->> 'briefId',
        'origin', p_handoff -> 'origin',
        'scopeItemIds', p_handoff -> 'scopeItemIds',
        'deliverables', p_handoff -> 'deliverables',
        'productionModules', p_handoff -> 'productionModules',
        'artifactRefs', p_handoff -> 'artifactRefs',
        'coCreditBudget', p_handoff -> 'coCreditBudget'
      )
    )
    RETURNING id INTO v_receipt_id;

    INSERT INTO co_production.activity_log (
      project_id,
      actor_id,
      actor_name,
      action,
      details
    )
    VALUES (
      v_project_id,
      NULL,
      'CCO OS proposal integration:' || v_binding.signing_key_id,
      'proposal_handoff_activated',
      jsonb_build_object(
        'proposal_handoff_receipt_id', v_receipt_id,
        'source_tenant_id', v_binding.source_tenant_id,
        'signing_key_id', v_binding.signing_key_id,
        'package_id', p_handoff ->> 'packageId',
        'proposal_version_id', p_handoff ->> 'proposalVersionId',
        'quote_version_id', p_handoff ->> 'quoteVersionId',
        'display_number', upper(p_handoff ->> 'displayNumber'),
        'decision_receipt_id', p_handoff -> 'decisionReceipt' ->> 'id',
        'payload_hash', v_attested_payload_hash
      )
    );
  EXCEPTION WHEN unique_violation THEN
    SELECT receipt.*
    INTO v_existing
    FROM co_production.proposal_handoff_receipts AS receipt
    WHERE receipt.source_tenant_id = v_binding.source_tenant_id
      AND (
        receipt.idempotency_key = v_idempotency_key
        OR (
          receipt.package_id = p_handoff ->> 'packageId'
          AND receipt.package_version = (p_handoff ->> 'packageVersion')::integer
        )
        OR receipt.proposal_version_id = p_handoff ->> 'proposalVersionId'
        OR receipt.quote_version_id = p_handoff ->> 'quoteVersionId'
      )
    LIMIT 1;

    IF NOT FOUND
      OR v_existing.database_payload_hash IS DISTINCT FROM v_database_payload_hash
      OR v_existing.attested_payload_hash IS DISTINCT FROM v_attested_payload_hash
      OR v_existing.idempotency_key IS DISTINCT FROM v_idempotency_key
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'idempotency_payload_conflict';
    END IF;

    RETURN jsonb_build_object(
      'mode', 'live',
      'status', 'created',
      'replayed', true,
      'receiptId', v_existing.id,
      'projectId', v_existing.project_id,
      'idempotencyKey', v_existing.idempotency_key,
      'payloadHash', v_existing.attested_payload_hash,
      'target', 'Co-VideoPro',
      'commercialAuthority', 'CCO_OS',
      'commercialReference', jsonb_build_object(
        'packageId', v_existing.package_id,
        'packageVersion', v_existing.package_version,
        'proposalVersionId', v_existing.proposal_version_id,
        'quoteVersionId', v_existing.quote_version_id,
        'displayNumber', v_existing.display_number,
        'decisionReceiptId', v_existing.decision_receipt ->> 'id'
      )
    );
  END;

  RETURN jsonb_build_object(
    'mode', 'live',
    'status', 'created',
    'replayed', false,
    'receiptId', v_receipt_id,
    'projectId', v_project_id,
    'idempotencyKey', v_idempotency_key,
    'payloadHash', v_attested_payload_hash,
    'target', 'Co-VideoPro',
    'commercialAuthority', 'CCO_OS',
    'commercialReference', jsonb_build_object(
      'packageId', p_handoff ->> 'packageId',
      'packageVersion', (p_handoff ->> 'packageVersion')::integer,
      'proposalVersionId', p_handoff ->> 'proposalVersionId',
      'quoteVersionId', p_handoff ->> 'quoteVersionId',
      'displayNumber', upper(p_handoff ->> 'displayNumber'),
      'decisionReceiptId', p_handoff -> 'decisionReceipt' ->> 'id'
    )
  );
END
$$;

REVOKE ALL ON TABLE co_production.proposal_integration_bindings
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON TABLE co_production.proposal_integration_public_keys
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE co_production.proposal_integration_public_keys
  TO service_role;

REVOKE ALL ON TABLE co_production.proposal_handoff_receipts
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT (
  id,
  team_id,
  project_id,
  idempotency_key,
  attested_payload_hash,
  package_id,
  package_version,
  proposal_version_id,
  quote_version_id,
  display_number,
  created_at
) ON co_production.proposal_handoff_receipts
  TO authenticated, service_role;

REVOKE ALL ON TABLE co_production.proposal_handoff_receipt_summaries
  FROM PUBLIC, anon;
GRANT SELECT ON TABLE co_production.proposal_handoff_receipt_summaries
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION co_production.activate_proposal_handoff(text, text, text, jsonb, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION co_production.activate_proposal_handoff(text, text, text, jsonb, text, text)
  TO service_role;

REVOKE ALL ON FUNCTION co_production_private.prevent_proposal_handoff_mutation()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE INDEX proposal_integration_bindings_team_idx
  ON co_production.proposal_integration_bindings(team_id, active);
CREATE INDEX proposal_handoff_receipts_team_created_idx
  ON co_production.proposal_handoff_receipts(team_id, created_at DESC);
CREATE INDEX proposal_handoff_receipts_quote_idx
  ON co_production.proposal_handoff_receipts(source_tenant_id, quote_version_id);

COMMIT;
