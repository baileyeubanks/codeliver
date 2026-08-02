-- Require explicit production authorization before an accepted Proposal Studio
-- handoff may activate a Co-VideoPro project. The authorization contract carries
-- only gate states and opaque evidence references; commercial records stay in CCO OS.

BEGIN;

DO $proposal_activation_authorization_preflight$
BEGIN
  IF pg_catalog.to_regclass(
    'co_production.opportunity_proposal_request_receipts'
  ) IS NULL
    OR pg_catalog.to_regclass('co_production.proposal_handoff_receipts') IS NULL
    OR pg_catalog.to_regclass('co_production.project_preproject_origins') IS NULL
    OR pg_catalog.to_regclass('co_production.preproject_pipeline') IS NULL
    OR pg_catalog.to_regprocedure(
      'co_production.activate_proposal_handoff(text,text,text,jsonb,text,text)'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'co_production_private.preproject_sha256(text)'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'co_production_private.preproject_exact_json_keys(jsonb,text[])'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'co_production_private.prevent_preproject_immutable_mutation()'
    ) IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'proposal_activation_authorization_requires_handoff_and_readiness_authority';
  END IF;
END
$proposal_activation_authorization_preflight$;

-- productionAuthorization v1 mirrors the route parser exactly. Evidence IDs are
-- bounded opaque references, never amounts, invoice bodies, contract documents,
-- or payment details.
CREATE OR REPLACE FUNCTION
  co_production_private.production_authorization_v1_is_valid(
    p_authorization jsonb
  )
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
  v_subject jsonb;
  v_gate jsonb;
  v_gate_name text;
  v_gate_status text;
  v_evidence_receipt_id text;
  v_seen text[] := ARRAY[]::text[];
BEGIN
  IF pg_catalog.pg_column_size(p_authorization) > 8192
    OR pg_catalog.jsonb_typeof(p_authorization) IS DISTINCT FROM 'object'
    OR NOT co_production_private.preproject_exact_json_keys(
      p_authorization,
      ARRAY[
        'schemaVersion', 'receiptId', 'status', 'policyVersion', 'authorizedAt',
        'subject', 'gates'
      ]
    )
    OR pg_catalog.jsonb_typeof(p_authorization -> 'schemaVersion')
      IS DISTINCT FROM 'string'
    OR p_authorization ->> 'schemaVersion'
      IS DISTINCT FROM 'cco.proposal-studio.production-authorization.v1'
    OR pg_catalog.jsonb_typeof(p_authorization -> 'receiptId')
      IS DISTINCT FROM 'string'
    OR p_authorization ->> 'receiptId'
      IS DISTINCT FROM pg_catalog.btrim(p_authorization ->> 'receiptId')
    OR pg_catalog.length(p_authorization ->> 'receiptId') NOT BETWEEN 1 AND 240
    OR pg_catalog.jsonb_typeof(p_authorization -> 'status')
      IS DISTINCT FROM 'string'
    OR p_authorization ->> 'status' IS DISTINCT FROM 'authorized'
    OR pg_catalog.jsonb_typeof(p_authorization -> 'policyVersion')
      IS DISTINCT FROM 'string'
    OR p_authorization ->> 'policyVersion'
      IS DISTINCT FROM pg_catalog.btrim(p_authorization ->> 'policyVersion')
    OR pg_catalog.length(p_authorization ->> 'policyVersion') NOT BETWEEN 1 AND 240
    OR pg_catalog.jsonb_typeof(p_authorization -> 'authorizedAt')
      IS DISTINCT FROM 'string'
    OR p_authorization ->> 'authorizedAt'
      IS DISTINCT FROM pg_catalog.btrim(p_authorization ->> 'authorizedAt')
    OR pg_catalog.length(p_authorization ->> 'authorizedAt') NOT BETWEEN 1 AND 64
    OR pg_catalog.jsonb_typeof(p_authorization -> 'subject')
      IS DISTINCT FROM 'object'
    OR pg_catalog.jsonb_typeof(p_authorization -> 'gates')
      IS DISTINCT FROM 'array'
    OR pg_catalog.jsonb_array_length(p_authorization -> 'gates') <> 5
  THEN
    RETURN false;
  END IF;

  v_subject := p_authorization -> 'subject';
  IF NOT co_production_private.preproject_exact_json_keys(
      v_subject,
      ARRAY[
        'proposalRequestReceiptId', 'packageId', 'packageVersion',
        'proposalVersionId', 'proposalContentHash', 'quoteVersionId',
        'quoteContentHash', 'decisionReceiptId', 'opportunityId', 'readyBriefId',
        'readyBriefContentHash'
      ]
    )
    OR pg_catalog.jsonb_typeof(v_subject -> 'proposalRequestReceiptId')
      IS DISTINCT FROM 'string'
    OR (v_subject ->> 'proposalRequestReceiptId')
      !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR pg_catalog.jsonb_typeof(v_subject -> 'packageId') IS DISTINCT FROM 'string'
    OR v_subject ->> 'packageId'
      IS DISTINCT FROM pg_catalog.btrim(v_subject ->> 'packageId')
    OR pg_catalog.length(v_subject ->> 'packageId') NOT BETWEEN 1 AND 240
    OR pg_catalog.jsonb_typeof(v_subject -> 'packageVersion')
      IS DISTINCT FROM 'number'
    OR (v_subject ->> 'packageVersion') !~ '^[1-9][0-9]{0,9}$'
    OR pg_catalog.jsonb_typeof(v_subject -> 'proposalVersionId')
      IS DISTINCT FROM 'string'
    OR v_subject ->> 'proposalVersionId'
      IS DISTINCT FROM pg_catalog.btrim(v_subject ->> 'proposalVersionId')
    OR pg_catalog.length(v_subject ->> 'proposalVersionId') NOT BETWEEN 1 AND 240
    OR pg_catalog.jsonb_typeof(v_subject -> 'proposalContentHash')
      IS DISTINCT FROM 'string'
    OR (v_subject ->> 'proposalContentHash') !~ '^sha256:[0-9a-f]{64}$'
    OR pg_catalog.jsonb_typeof(v_subject -> 'quoteVersionId')
      IS DISTINCT FROM 'string'
    OR v_subject ->> 'quoteVersionId'
      IS DISTINCT FROM pg_catalog.btrim(v_subject ->> 'quoteVersionId')
    OR pg_catalog.length(v_subject ->> 'quoteVersionId') NOT BETWEEN 1 AND 240
    OR pg_catalog.jsonb_typeof(v_subject -> 'quoteContentHash')
      IS DISTINCT FROM 'string'
    OR (v_subject ->> 'quoteContentHash') !~ '^sha256:[0-9a-f]{64}$'
    OR pg_catalog.jsonb_typeof(v_subject -> 'decisionReceiptId')
      IS DISTINCT FROM 'string'
    OR v_subject ->> 'decisionReceiptId'
      IS DISTINCT FROM pg_catalog.btrim(v_subject ->> 'decisionReceiptId')
    OR pg_catalog.length(v_subject ->> 'decisionReceiptId') NOT BETWEEN 1 AND 240
    OR pg_catalog.jsonb_typeof(v_subject -> 'opportunityId')
      IS DISTINCT FROM 'string'
    OR (v_subject ->> 'opportunityId')
      !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR pg_catalog.jsonb_typeof(v_subject -> 'readyBriefId')
      IS DISTINCT FROM 'string'
    OR (v_subject ->> 'readyBriefId')
      !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR pg_catalog.jsonb_typeof(v_subject -> 'readyBriefContentHash')
      IS DISTINCT FROM 'string'
    OR (v_subject ->> 'readyBriefContentHash') !~ '^sha256:[0-9a-f]{64}$'
  THEN
    RETURN false;
  END IF;

  IF (v_subject ->> 'packageVersion')::bigint > 2147483647 THEN
    RETURN false;
  END IF;

  FOR v_gate IN
    SELECT entry.value
    FROM pg_catalog.jsonb_array_elements(
      p_authorization -> 'gates'
    ) AS entry(value)
  LOOP
    IF pg_catalog.jsonb_typeof(v_gate) IS DISTINCT FROM 'object'
      OR NOT co_production_private.preproject_exact_json_keys(
        v_gate,
        ARRAY['gate', 'status', 'evidenceReceiptId']
      )
      OR pg_catalog.jsonb_typeof(v_gate -> 'gate') IS DISTINCT FROM 'string'
      OR pg_catalog.jsonb_typeof(v_gate -> 'status') IS DISTINCT FROM 'string'
      OR pg_catalog.jsonb_typeof(v_gate -> 'evidenceReceiptId')
        IS DISTINCT FROM 'string'
    THEN
      RETURN false;
    END IF;

    v_gate_name := v_gate ->> 'gate';
    v_gate_status := v_gate ->> 'status';
    v_evidence_receipt_id := v_gate ->> 'evidenceReceiptId';

    IF v_gate_name NOT IN ('acceptance', 'contract', 'invoice', 'deposit', 'payment')
      OR v_gate_name = ANY(v_seen)
      OR v_evidence_receipt_id
        IS DISTINCT FROM pg_catalog.btrim(v_evidence_receipt_id)
      OR pg_catalog.length(v_evidence_receipt_id) NOT BETWEEN 1 AND 240
      OR v_gate_status NOT IN ('satisfied', 'not_required')
      OR (
        v_gate_name = 'acceptance'
        AND v_gate_status IS DISTINCT FROM 'satisfied'
      )
      OR (
        v_gate_name = 'acceptance'
        AND v_evidence_receipt_id
          IS DISTINCT FROM v_subject ->> 'decisionReceiptId'
      )
    THEN
      RETURN false;
    END IF;

    v_seen := pg_catalog.array_append(v_seen, v_gate_name);
  END LOOP;

  RETURN pg_catalog.cardinality(v_seen) = 5
    AND v_seen @> ARRAY['acceptance', 'contract', 'invoice', 'deposit', 'payment'];
END
$$;

CREATE TABLE co_production.proposal_activation_authorization_receipts (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  source_tenant_id text NOT NULL CHECK (
    source_tenant_id = pg_catalog.lower(source_tenant_id)
    AND pg_catalog.length(pg_catalog.btrim(source_tenant_id)) BETWEEN 1 AND 240
  ),
  signing_key_id text NOT NULL CHECK (
    pg_catalog.length(pg_catalog.btrim(signing_key_id)) BETWEEN 1 AND 160
  ),
  team_id uuid NOT NULL REFERENCES co_production.teams(id) ON DELETE RESTRICT,
  activation_idempotency_key text NOT NULL CHECK (
    activation_idempotency_key = pg_catalog.lower(activation_idempotency_key)
    AND pg_catalog.length(activation_idempotency_key) BETWEEN 1 AND 320
  ),
  external_authorization_receipt_id text NOT NULL CHECK (
    external_authorization_receipt_id
      = pg_catalog.btrim(external_authorization_receipt_id)
    AND pg_catalog.length(external_authorization_receipt_id) BETWEEN 1 AND 240
  ),
  authorization_policy_version text NOT NULL CHECK (
    authorization_policy_version = pg_catalog.btrim(authorization_policy_version)
    AND pg_catalog.length(authorization_policy_version) BETWEEN 1 AND 240
  ),
  authorization_authorized_at text NOT NULL CHECK (
    authorization_authorized_at = pg_catalog.btrim(authorization_authorized_at)
    AND pg_catalog.length(authorization_authorized_at) BETWEEN 1 AND 64
  ),
  proposal_request_receipt_id uuid NOT NULL UNIQUE,
  proposal_request_authority_version bigint NOT NULL CHECK (
    proposal_request_authority_version BETWEEN 1 AND 2147483647
  ),
  source_inquiry_id uuid NOT NULL,
  package_id text NOT NULL CHECK (
    package_id = pg_catalog.btrim(package_id)
    AND pg_catalog.length(package_id) BETWEEN 1 AND 240
  ),
  package_version integer NOT NULL CHECK (package_version >= 1),
  proposal_version_id text NOT NULL CHECK (
    proposal_version_id = pg_catalog.btrim(proposal_version_id)
    AND pg_catalog.length(proposal_version_id) BETWEEN 1 AND 240
  ),
  proposal_content_hash text NOT NULL CHECK (
    proposal_content_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  quote_version_id text NOT NULL CHECK (
    quote_version_id = pg_catalog.btrim(quote_version_id)
    AND pg_catalog.length(quote_version_id) BETWEEN 1 AND 240
  ),
  quote_content_hash text NOT NULL CHECK (
    quote_content_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  decision_receipt_id text NOT NULL CHECK (
    decision_receipt_id = pg_catalog.btrim(decision_receipt_id)
    AND pg_catalog.length(decision_receipt_id) BETWEEN 1 AND 240
  ),
  opportunity_id uuid NOT NULL UNIQUE,
  opportunity_authority_version bigint NOT NULL CHECK (
    opportunity_authority_version BETWEEN 1 AND 2147483647
  ),
  ready_brief_revision_id uuid NOT NULL,
  ready_brief_revision_number integer NOT NULL CHECK (
    ready_brief_revision_number >= 1
  ),
  ready_brief_content_hash text NOT NULL CHECK (
    ready_brief_content_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  proposal_handoff_receipt_id uuid NOT NULL UNIQUE,
  project_id uuid NOT NULL UNIQUE,
  outer_schema_version text NOT NULL CHECK (outer_schema_version = '2.0.0'),
  inner_schema_version text NOT NULL CHECK (inner_schema_version = '1.0.0'),
  authorization_schema_version text NOT NULL CHECK (
    authorization_schema_version
      = 'cco.proposal-studio.production-authorization.v1'
  ),
  authorization_status text NOT NULL CHECK (authorization_status = 'authorized'),
  production_authorization jsonb NOT NULL CHECK (
    co_production_private.production_authorization_v1_is_valid(
      production_authorization
    )
    AND authorization_schema_version
      = production_authorization ->> 'schemaVersion'
    AND external_authorization_receipt_id
      = production_authorization ->> 'receiptId'
    AND authorization_status = production_authorization ->> 'status'
    AND authorization_policy_version = production_authorization ->> 'policyVersion'
    AND authorization_authorized_at = production_authorization ->> 'authorizedAt'
    AND proposal_request_receipt_id::text
      = production_authorization -> 'subject' ->> 'proposalRequestReceiptId'
    AND package_id = production_authorization -> 'subject' ->> 'packageId'
    AND package_version::text
      = production_authorization -> 'subject' ->> 'packageVersion'
    AND proposal_version_id
      = production_authorization -> 'subject' ->> 'proposalVersionId'
    AND proposal_content_hash
      = production_authorization -> 'subject' ->> 'proposalContentHash'
    AND quote_version_id
      = production_authorization -> 'subject' ->> 'quoteVersionId'
    AND quote_content_hash
      = production_authorization -> 'subject' ->> 'quoteContentHash'
    AND decision_receipt_id
      = production_authorization -> 'subject' ->> 'decisionReceiptId'
    AND opportunity_id::text
      = production_authorization -> 'subject' ->> 'opportunityId'
    AND ready_brief_revision_id::text
      = production_authorization -> 'subject' ->> 'readyBriefId'
    AND ready_brief_content_hash
      = production_authorization -> 'subject' ->> 'readyBriefContentHash'
  ),
  canonical_payload_hash text NOT NULL CHECK (
    canonical_payload_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  authorization_payload_hash text NOT NULL CHECK (
    authorization_payload_hash ~ '^sha256:[0-9a-f]{64}$'
    AND authorization_payload_hash
      = co_production_private.preproject_sha256(production_authorization::text)
  ),
  receipt_hash text NOT NULL UNIQUE CHECK (
    receipt_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  result jsonb NOT NULL CHECK (
    pg_catalog.jsonb_typeof(result) = 'object'
    AND co_production_private.preproject_exact_json_keys(
      result,
      ARRAY[
        'mode', 'status', 'replayed', 'projectId',
        'proposalHandoffReceiptId', 'authorizationReceiptId',
        'productionAuthorizationReceiptId'
      ]
    )
    AND result ->> 'mode' = 'live'
    AND result ->> 'status' = 'created'
    AND result -> 'replayed' = 'false'::jsonb
    AND result ->> 'projectId' = project_id::text
    AND result ->> 'proposalHandoffReceiptId'
      = proposal_handoff_receipt_id::text
    AND result ->> 'authorizationReceiptId' = id::text
    AND result ->> 'productionAuthorizationReceiptId'
      = external_authorization_receipt_id
  ),
  created_at timestamptz NOT NULL,
  CONSTRAINT proposal_activation_authorization_receipts_id_team_project_key
    UNIQUE (id, team_id, project_id),
  CONSTRAINT proposal_activation_authorization_receipts_tenant_replay_key
    UNIQUE (source_tenant_id, activation_idempotency_key),
  CONSTRAINT proposal_activation_authorization_receipts_external_receipt_key
    UNIQUE (source_tenant_id, external_authorization_receipt_id),
  CONSTRAINT proposal_activation_authorization_receipts_binding_fk
    FOREIGN KEY (source_tenant_id, signing_key_id)
    REFERENCES co_production.proposal_integration_bindings(
      source_tenant_id,
      signing_key_id
    )
    ON DELETE RESTRICT,
  CONSTRAINT proposal_activation_authorization_receipts_request_fk
    FOREIGN KEY (
      proposal_request_receipt_id,
      team_id,
      opportunity_id,
      proposal_request_authority_version
    )
    REFERENCES co_production.opportunity_proposal_request_receipts(
      id,
      team_id,
      opportunity_id,
      resulting_authority_version
    )
    ON DELETE RESTRICT,
  CONSTRAINT proposal_activation_authorization_receipts_inquiry_fk
    FOREIGN KEY (source_inquiry_id, team_id)
    REFERENCES co_production.public_inquiries(id, team_id)
    ON DELETE RESTRICT,
  CONSTRAINT proposal_activation_authorization_receipts_opportunity_fk
    FOREIGN KEY (opportunity_id, team_id)
    REFERENCES co_production.opportunities(id, team_id)
    ON DELETE RESTRICT,
  CONSTRAINT proposal_activation_authorization_receipts_brief_fk
    FOREIGN KEY (ready_brief_revision_id, team_id, opportunity_id)
    REFERENCES co_production.creative_brief_revisions(id, team_id, opportunity_id)
    ON DELETE RESTRICT,
  CONSTRAINT proposal_activation_authorization_receipts_handoff_fk
    FOREIGN KEY (proposal_handoff_receipt_id, team_id, project_id)
    REFERENCES co_production.proposal_handoff_receipts(id, team_id, project_id)
    ON DELETE RESTRICT,
  CONSTRAINT proposal_activation_authorization_receipts_origin_fk
    FOREIGN KEY (project_id)
    REFERENCES co_production.project_preproject_origins(project_id)
    ON DELETE RESTRICT
);

ALTER TABLE co_production.proposal_activation_authorization_receipts
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.proposal_activation_authorization_receipts
  FORCE ROW LEVEL SECURITY;

CREATE POLICY proposal_activation_authorization_receipts_select
  ON co_production.proposal_activation_authorization_receipts
  FOR SELECT TO authenticated
  USING (co_production_private.has_team_role(team_id, 70));

CREATE TRIGGER proposal_activation_authorization_receipts_immutable
BEFORE UPDATE OR DELETE
ON co_production.proposal_activation_authorization_receipts
FOR EACH ROW
EXECUTE FUNCTION co_production_private.prevent_preproject_immutable_mutation();

CREATE TRIGGER proposal_activation_authorization_receipts_no_truncate
BEFORE TRUNCATE
ON co_production.proposal_activation_authorization_receipts
FOR EACH STATEMENT
EXECUTE FUNCTION co_production_private.prevent_preproject_immutable_mutation();

CREATE OR REPLACE FUNCTION co_production.activate_authorized_proposal_handoff(
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
  v_existing co_production.proposal_activation_authorization_receipts%ROWTYPE;
  v_request co_production.opportunity_proposal_request_receipts%ROWTYPE;
  v_opportunity co_production.opportunities%ROWTYPE;
  v_brief co_production.creative_brief_revisions%ROWTYPE;
  v_account co_production.crm_accounts%ROWTYPE;
  v_contact co_production.crm_contacts%ROWTYPE;
  v_handoff_receipt co_production.proposal_handoff_receipts%ROWTYPE;
  v_handoff jsonb;
  v_origin jsonb;
  v_authorization jsonb;
  v_authorization_subject jsonb;
  v_acceptance_gate jsonb;
  v_idempotency_key text;
  v_database_payload_hash text;
  v_authorization_payload_hash text;
  v_expected_receiver_proof text;
  v_external_authorization_receipt_id text;
  v_authorization_policy_version text;
  v_authorization_authorized_at text;
  v_proposal_request_receipt_id uuid;
  v_handoff_result jsonb;
  v_handoff_receipt_id uuid;
  v_project_id uuid;
  v_authorization_receipt_id uuid := pg_catalog.gen_random_uuid();
  v_receipt_hash text;
  v_result jsonb;
  v_created_at timestamptz := statement_timestamp();
BEGIN
  SELECT binding.*
  INTO v_binding
  FROM co_production.proposal_integration_bindings AS binding
  WHERE binding.source_tenant_id = pg_catalog.lower(pg_catalog.btrim(p_source_tenant_id))
    AND binding.signing_key_id = pg_catalog.btrim(p_signing_key_id)
    AND binding.active = true
    AND binding.activation_enabled = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'invalid_integration_binding';
  END IF;

  IF p_schema_version IS DISTINCT FROM '2.0.0'
    OR p_canonical_payload IS NULL
    OR pg_catalog.octet_length(p_canonical_payload) NOT BETWEEN 2 AND 524288
    OR pg_catalog.jsonb_typeof(p_attestation) IS DISTINCT FROM 'object'
    OR co_production_private.preproject_exact_json_keys(
      p_attestation,
      ARRAY['keyId', 'issuedAt', 'expiresAt', 'nonce', 'payloadHash', 'signature']
    ) IS DISTINCT FROM true
    OR p_attestation ->> 'keyId' IS DISTINCT FROM v_binding.signing_key_id
    OR coalesce(p_attestation ->> 'payloadHash', '') !~ '^sha256:[0-9a-f]{64}$'
    OR coalesce(p_receiver_proof, '') !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'invalid_proposal_activation_envelope';
  END IF;

  v_database_payload_hash := 'sha256:' || pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(p_canonical_payload, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  IF p_attestation ->> 'payloadHash' IS DISTINCT FROM v_database_payload_hash THEN
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
  IF pg_catalog.lower(p_receiver_proof) IS DISTINCT FROM v_expected_receiver_proof THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'invalid_receiver_proof';
  END IF;

  BEGIN
    v_handoff := p_canonical_payload::jsonb;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_canonical_payload';
  END;

  v_authorization := v_handoff -> 'productionAuthorization';
  IF co_production_private.production_authorization_v1_is_valid(
    v_authorization
  ) IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_production_authorization';
  END IF;

  v_authorization_subject := v_authorization -> 'subject';
  SELECT gate.value
  INTO v_acceptance_gate
  FROM pg_catalog.jsonb_array_elements(v_authorization -> 'gates') AS gate(value)
  WHERE gate.value ->> 'gate' = 'acceptance';

  v_authorization_payload_hash := co_production_private.preproject_sha256(
    v_authorization::text
  );
  v_external_authorization_receipt_id := v_authorization ->> 'receiptId';
  v_authorization_policy_version := v_authorization ->> 'policyVersion';
  v_authorization_authorized_at := v_authorization ->> 'authorizedAt';
  v_origin := v_handoff -> 'origin';
  IF pg_catalog.jsonb_typeof(v_handoff) IS DISTINCT FROM 'object'
    OR v_handoff ->> 'intent' IS DISTINCT FROM 'activate'
    OR pg_catalog.lower(v_handoff ->> 'sourceTenantId')
      IS DISTINCT FROM v_binding.source_tenant_id
    OR pg_catalog.jsonb_typeof(v_origin) IS DISTINCT FROM 'object'
    OR co_production_private.preproject_exact_json_keys(
      v_origin,
      ARRAY[
        'authority', 'inquiryId', 'accountId', 'accountAuthorityVersion',
        'primaryContactId', 'contactAuthorityVersion', 'opportunityId',
        'opportunityAuthorityVersion', 'briefRevisionId',
        'briefRevisionNumber', 'briefContentHash'
      ]
    ) IS DISTINCT FROM true
    OR v_origin ->> 'authority' IS DISTINCT FROM 'co-videopro-crm'
    OR (v_origin ->> 'inquiryId')
      !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR (v_origin ->> 'accountId')
      !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR (v_origin ->> 'primaryContactId')
      !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR (v_origin ->> 'opportunityId')
      !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR (v_origin ->> 'briefRevisionId')
      !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR (v_origin ->> 'accountAuthorityVersion') !~ '^[1-9][0-9]{0,9}$'
    OR (v_origin ->> 'contactAuthorityVersion') !~ '^[1-9][0-9]{0,9}$'
    OR (v_origin ->> 'opportunityAuthorityVersion') !~ '^[1-9][0-9]{0,9}$'
    OR (v_origin ->> 'briefRevisionNumber') !~ '^[1-9][0-9]{0,9}$'
    OR (v_origin ->> 'briefContentHash') !~ '^sha256:[0-9a-f]{64}$'
    OR v_handoff ->> 'clientId' IS DISTINCT FROM v_origin ->> 'accountId'
    OR v_handoff ->> 'opportunityId' IS DISTINCT FROM v_origin ->> 'opportunityId'
    OR v_handoff ->> 'briefId' IS DISTINCT FROM v_origin ->> 'briefRevisionId'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_activation_crm_origin';
  END IF;

  IF v_handoff ->> 'proposalRequestReceiptId'
      IS DISTINCT FROM v_authorization_subject ->> 'proposalRequestReceiptId'
    OR v_handoff ->> 'packageId'
      IS DISTINCT FROM v_authorization_subject ->> 'packageId'
    OR v_handoff -> 'packageVersion'
      IS DISTINCT FROM v_authorization_subject -> 'packageVersion'
    OR v_handoff ->> 'proposalVersionId'
      IS DISTINCT FROM v_authorization_subject ->> 'proposalVersionId'
    OR v_handoff ->> 'proposalContentHash'
      IS DISTINCT FROM v_authorization_subject ->> 'proposalContentHash'
    OR v_handoff ->> 'quoteVersionId'
      IS DISTINCT FROM v_authorization_subject ->> 'quoteVersionId'
    OR v_handoff ->> 'quoteContentHash'
      IS DISTINCT FROM v_authorization_subject ->> 'quoteContentHash'
    OR v_handoff -> 'decisionReceipt' ->> 'id'
      IS DISTINCT FROM v_authorization_subject ->> 'decisionReceiptId'
    OR v_handoff ->> 'opportunityId'
      IS DISTINCT FROM v_authorization_subject ->> 'opportunityId'
    OR v_origin ->> 'opportunityId'
      IS DISTINCT FROM v_authorization_subject ->> 'opportunityId'
    OR v_origin ->> 'briefRevisionId'
      IS DISTINCT FROM v_authorization_subject ->> 'readyBriefId'
    OR v_origin ->> 'briefContentHash'
      IS DISTINCT FROM v_authorization_subject ->> 'readyBriefContentHash'
    OR v_acceptance_gate ->> 'evidenceReceiptId'
      IS DISTINCT FROM v_authorization_subject ->> 'decisionReceiptId'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'production_authorization_binding_conflict';
  END IF;

  v_idempotency_key := pg_catalog.lower(
    pg_catalog.btrim(v_handoff ->> 'idempotencyKey')
  );
  IF v_idempotency_key IS NULL
    OR pg_catalog.length(v_idempotency_key) NOT BETWEEN 1 AND 320
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_activation_idempotency_key';
  END IF;

  v_proposal_request_receipt_id := (
    v_authorization_subject ->> 'proposalRequestReceiptId'
  )::uuid;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'cco:activate-authorized-proposal:'
        || v_binding.source_tenant_id || ':' || v_idempotency_key,
      0
    )
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'cco:production-authorization-receipt:'
        || v_binding.source_tenant_id || ':'
        || v_external_authorization_receipt_id,
      0
    )
  );

  SELECT receipt.*
  INTO v_existing
  FROM co_production.proposal_activation_authorization_receipts AS receipt
  WHERE receipt.source_tenant_id = v_binding.source_tenant_id
    AND (
      receipt.activation_idempotency_key = v_idempotency_key
      OR receipt.external_authorization_receipt_id
        = v_external_authorization_receipt_id
      OR receipt.proposal_request_receipt_id = v_proposal_request_receipt_id
      OR receipt.opportunity_id = (v_authorization_subject ->> 'opportunityId')::uuid
    )
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.signing_key_id IS DISTINCT FROM v_binding.signing_key_id
      OR v_existing.team_id IS DISTINCT FROM v_binding.team_id
      OR v_existing.activation_idempotency_key IS DISTINCT FROM v_idempotency_key
      OR v_existing.canonical_payload_hash IS DISTINCT FROM v_database_payload_hash
      OR v_existing.authorization_payload_hash
        IS DISTINCT FROM v_authorization_payload_hash
      OR v_existing.production_authorization
        IS DISTINCT FROM v_authorization
      OR v_existing.external_authorization_receipt_id
        IS DISTINCT FROM v_external_authorization_receipt_id
      OR v_existing.authorization_policy_version
        IS DISTINCT FROM v_authorization_policy_version
      OR v_existing.authorization_authorized_at
        IS DISTINCT FROM v_authorization_authorized_at
      OR v_existing.proposal_request_receipt_id
        IS DISTINCT FROM v_proposal_request_receipt_id
      OR v_existing.source_inquiry_id
        IS DISTINCT FROM (v_origin ->> 'inquiryId')::uuid
      OR v_existing.package_id
        IS DISTINCT FROM v_authorization_subject ->> 'packageId'
      OR v_existing.package_version
        IS DISTINCT FROM (v_authorization_subject ->> 'packageVersion')::integer
      OR v_existing.proposal_version_id
        IS DISTINCT FROM v_authorization_subject ->> 'proposalVersionId'
      OR v_existing.proposal_content_hash
        IS DISTINCT FROM v_authorization_subject ->> 'proposalContentHash'
      OR v_existing.quote_version_id
        IS DISTINCT FROM v_authorization_subject ->> 'quoteVersionId'
      OR v_existing.quote_content_hash
        IS DISTINCT FROM v_authorization_subject ->> 'quoteContentHash'
      OR v_existing.decision_receipt_id
        IS DISTINCT FROM v_authorization_subject ->> 'decisionReceiptId'
      OR v_existing.opportunity_id
        IS DISTINCT FROM (v_origin ->> 'opportunityId')::uuid
      OR v_existing.ready_brief_revision_id
        IS DISTINCT FROM (v_origin ->> 'briefRevisionId')::uuid
      OR v_existing.ready_brief_content_hash
        IS DISTINCT FROM v_origin ->> 'briefContentHash'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'production_authorization_binding_conflict';
    END IF;

    RETURN v_existing.result
      || pg_catalog.jsonb_build_object('replayed', true);
  END IF;

  SELECT receipt.*
  INTO v_request
  FROM co_production.opportunity_proposal_request_receipts AS receipt
  WHERE receipt.id = v_proposal_request_receipt_id;

  IF NOT FOUND
    OR v_request.team_id IS DISTINCT FROM v_binding.team_id
    OR v_request.opportunity_id IS DISTINCT FROM (v_origin ->> 'opportunityId')::uuid
    OR v_request.source_inquiry_id IS DISTINCT FROM (v_origin ->> 'inquiryId')::uuid
    OR v_request.ready_brief_revision_id
      IS DISTINCT FROM (v_origin ->> 'briefRevisionId')::uuid
    OR v_request.ready_brief_revision_number
      IS DISTINCT FROM (v_origin ->> 'briefRevisionNumber')::integer
    OR v_request.ready_brief_content_hash
      IS DISTINCT FROM v_origin ->> 'briefContentHash'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'stale_or_mismatched_activation_readiness';
  END IF;

  SELECT opportunity.*
  INTO v_opportunity
  FROM co_production.opportunities AS opportunity
  WHERE opportunity.id = (v_origin ->> 'opportunityId')::uuid
  FOR UPDATE;

  IF NOT FOUND
    OR v_opportunity.team_id IS DISTINCT FROM v_binding.team_id
    OR v_opportunity.source_inquiry_id
      IS DISTINCT FROM (v_origin ->> 'inquiryId')::uuid
    OR v_opportunity.account_id IS DISTINCT FROM (v_origin ->> 'accountId')::uuid
    OR v_opportunity.primary_contact_id
      IS DISTINCT FROM (v_origin ->> 'primaryContactId')::uuid
    OR v_opportunity.current_brief_revision_id
      IS DISTINCT FROM (v_origin ->> 'briefRevisionId')::uuid
    OR v_opportunity.authority_version
      IS DISTINCT FROM (v_origin ->> 'opportunityAuthorityVersion')::bigint
    OR v_opportunity.stage NOT IN ('proposal_requested', 'proposal_sent')
    OR v_request.resulting_authority_version > v_opportunity.authority_version
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'stale_or_mismatched_activation_readiness';
  END IF;

  SELECT brief.*
  INTO v_brief
  FROM co_production.creative_brief_revisions AS brief
  WHERE brief.id = v_opportunity.current_brief_revision_id
    AND brief.team_id = v_opportunity.team_id
    AND brief.opportunity_id = v_opportunity.id;

  IF NOT FOUND
    OR v_brief.source_inquiry_id IS DISTINCT FROM v_opportunity.source_inquiry_id
    OR v_brief.status IS DISTINCT FROM 'ready_for_proposal'
    OR v_brief.revision_number
      IS DISTINCT FROM (v_origin ->> 'briefRevisionNumber')::integer
    OR v_brief.content_hash IS DISTINCT FROM v_origin ->> 'briefContentHash'
    OR v_request.ready_brief_revision_id IS DISTINCT FROM v_brief.id
    OR v_request.ready_brief_content_hash IS DISTINCT FROM v_brief.content_hash
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'stale_or_mismatched_activation_readiness';
  END IF;

  SELECT account.*
  INTO v_account
  FROM co_production.crm_accounts AS account
  WHERE account.id = v_opportunity.account_id
    AND account.team_id = v_opportunity.team_id
  FOR SHARE;

  IF NOT FOUND
    OR v_account.source_inquiry_id IS DISTINCT FROM v_opportunity.source_inquiry_id
    OR v_account.authority_version
      IS DISTINCT FROM (v_origin ->> 'accountAuthorityVersion')::bigint
    OR v_account.lifecycle_status IS DISTINCT FROM 'active'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'stale_or_mismatched_activation_crm_origin';
  END IF;

  SELECT contact.*
  INTO v_contact
  FROM co_production.crm_contacts AS contact
  WHERE contact.id = v_opportunity.primary_contact_id
    AND contact.team_id = v_opportunity.team_id
  FOR SHARE;

  IF NOT FOUND
    OR v_contact.account_id IS DISTINCT FROM v_account.id
    OR v_contact.source_inquiry_id IS DISTINCT FROM v_opportunity.source_inquiry_id
    OR v_contact.authority_version
      IS DISTINCT FROM (v_origin ->> 'contactAuthorityVersion')::bigint
    OR v_contact.lifecycle_status IS DISTINCT FROM 'active'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'stale_or_mismatched_activation_crm_origin';
  END IF;

  -- The legacy call and the authorization insert share this caller transaction.
  -- No post-call exception handler may convert a receipt failure into success.
  v_handoff_result := co_production.activate_proposal_handoff(
    v_binding.source_tenant_id,
    v_binding.signing_key_id,
    '1.0.0',
    p_attestation,
    p_canonical_payload,
    p_receiver_proof
  );

  IF pg_catalog.jsonb_typeof(v_handoff_result) IS DISTINCT FROM 'object'
    OR coalesce(v_handoff_result ->> 'receiptId', '')
      !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR coalesce(v_handoff_result ->> 'projectId', '')
      !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'invalid_legacy_activation_result';
  END IF;

  v_handoff_receipt_id := (v_handoff_result ->> 'receiptId')::uuid;
  v_project_id := (v_handoff_result ->> 'projectId')::uuid;

  SELECT receipt.*
  INTO v_handoff_receipt
  FROM co_production.proposal_handoff_receipts AS receipt
  WHERE receipt.id = v_handoff_receipt_id
    AND receipt.project_id = v_project_id;

  IF NOT FOUND
    OR v_handoff_receipt.team_id IS DISTINCT FROM v_binding.team_id
    OR v_handoff_receipt.source_tenant_id IS DISTINCT FROM v_binding.source_tenant_id
    OR v_handoff_receipt.signing_key_id IS DISTINCT FROM v_binding.signing_key_id
    OR v_handoff_receipt.idempotency_key IS DISTINCT FROM v_idempotency_key
    OR v_handoff_receipt.schema_version IS DISTINCT FROM '1.0.0'
    OR v_handoff_receipt.database_payload_hash IS DISTINCT FROM v_database_payload_hash
    OR v_handoff_receipt.attested_payload_hash IS DISTINCT FROM v_database_payload_hash
    OR v_handoff_receipt.package_id
      IS DISTINCT FROM v_authorization_subject ->> 'packageId'
    OR v_handoff_receipt.package_version
      IS DISTINCT FROM (v_authorization_subject ->> 'packageVersion')::integer
    OR v_handoff_receipt.proposal_version_id
      IS DISTINCT FROM v_authorization_subject ->> 'proposalVersionId'
    OR v_handoff_receipt.proposal_content_hash
      IS DISTINCT FROM v_authorization_subject ->> 'proposalContentHash'
    OR v_handoff_receipt.quote_version_id
      IS DISTINCT FROM v_authorization_subject ->> 'quoteVersionId'
    OR v_handoff_receipt.quote_content_hash
      IS DISTINCT FROM v_authorization_subject ->> 'quoteContentHash'
    OR v_handoff_receipt.decision_receipt ->> 'id'
      IS DISTINCT FROM v_authorization_subject ->> 'decisionReceiptId'
    OR v_handoff_receipt.production_seed -> 'origin' IS DISTINCT FROM v_origin
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'authorization_handoff_binding_mismatch';
  END IF;

  PERFORM 1
  FROM co_production.project_preproject_origins AS origin
  WHERE origin.project_id = v_project_id
    AND origin.team_id = v_binding.team_id
    AND origin.proposal_handoff_receipt_id = v_handoff_receipt_id
    AND origin.inquiry_id = (v_origin ->> 'inquiryId')::uuid
    AND origin.account_id = (v_origin ->> 'accountId')::uuid
    AND origin.primary_contact_id = (v_origin ->> 'primaryContactId')::uuid
    AND origin.opportunity_id = (v_origin ->> 'opportunityId')::uuid
    AND origin.brief_revision_id = (v_origin ->> 'briefRevisionId')::uuid
    AND origin.brief_revision_number = (v_origin ->> 'briefRevisionNumber')::integer
    AND origin.brief_content_hash = v_origin ->> 'briefContentHash';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'authorization_handoff_origin_mismatch';
  END IF;

  v_result := pg_catalog.jsonb_build_object(
    'mode', 'live',
    'status', 'created',
    'replayed', false,
    'projectId', v_project_id,
    'proposalHandoffReceiptId', v_handoff_receipt_id,
    'authorizationReceiptId', v_authorization_receipt_id,
    'productionAuthorizationReceiptId', v_external_authorization_receipt_id
  );

  v_receipt_hash := co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'id', v_authorization_receipt_id,
      'source_tenant_id', v_binding.source_tenant_id,
      'signing_key_id', v_binding.signing_key_id,
      'team_id', v_binding.team_id,
      'activation_idempotency_key', v_idempotency_key,
      'external_authorization_receipt_id', v_external_authorization_receipt_id,
      'authorization_policy_version', v_authorization_policy_version,
      'authorization_authorized_at', v_authorization_authorized_at,
      'proposal_request_receipt_id', v_request.id,
      'source_inquiry_id', v_request.source_inquiry_id,
      'package_id', v_authorization_subject ->> 'packageId',
      'package_version', (v_authorization_subject ->> 'packageVersion')::integer,
      'proposal_version_id', v_authorization_subject ->> 'proposalVersionId',
      'proposal_content_hash', v_authorization_subject ->> 'proposalContentHash',
      'quote_version_id', v_authorization_subject ->> 'quoteVersionId',
      'quote_content_hash', v_authorization_subject ->> 'quoteContentHash',
      'decision_receipt_id', v_authorization_subject ->> 'decisionReceiptId',
      'opportunity_id', v_opportunity.id,
      'opportunity_authority_version', v_opportunity.authority_version,
      'ready_brief_revision_id', v_brief.id,
      'ready_brief_content_hash', v_brief.content_hash,
      'proposal_handoff_receipt_id', v_handoff_receipt_id,
      'project_id', v_project_id,
      'canonical_payload_hash', v_database_payload_hash,
      'authorization_payload_hash', v_authorization_payload_hash,
      'result', v_result,
      'created_at', v_created_at
    )::text
  );

  INSERT INTO co_production.proposal_activation_authorization_receipts (
    id,
    source_tenant_id,
    signing_key_id,
    team_id,
    activation_idempotency_key,
    external_authorization_receipt_id,
    authorization_policy_version,
    authorization_authorized_at,
    proposal_request_receipt_id,
    proposal_request_authority_version,
    source_inquiry_id,
    package_id,
    package_version,
    proposal_version_id,
    proposal_content_hash,
    quote_version_id,
    quote_content_hash,
    decision_receipt_id,
    opportunity_id,
    opportunity_authority_version,
    ready_brief_revision_id,
    ready_brief_revision_number,
    ready_brief_content_hash,
    proposal_handoff_receipt_id,
    project_id,
    outer_schema_version,
    inner_schema_version,
    authorization_schema_version,
    authorization_status,
    production_authorization,
    canonical_payload_hash,
    authorization_payload_hash,
    receipt_hash,
    result,
    created_at
  )
  VALUES (
    v_authorization_receipt_id,
    v_binding.source_tenant_id,
    v_binding.signing_key_id,
    v_binding.team_id,
    v_idempotency_key,
    v_external_authorization_receipt_id,
    v_authorization_policy_version,
    v_authorization_authorized_at,
    v_request.id,
    v_request.resulting_authority_version,
    v_request.source_inquiry_id,
    v_authorization_subject ->> 'packageId',
    (v_authorization_subject ->> 'packageVersion')::integer,
    v_authorization_subject ->> 'proposalVersionId',
    v_authorization_subject ->> 'proposalContentHash',
    v_authorization_subject ->> 'quoteVersionId',
    v_authorization_subject ->> 'quoteContentHash',
    v_authorization_subject ->> 'decisionReceiptId',
    v_opportunity.id,
    v_opportunity.authority_version,
    v_brief.id,
    v_brief.revision_number,
    v_brief.content_hash,
    v_handoff_receipt_id,
    v_project_id,
    '2.0.0',
    '1.0.0',
    'cco.proposal-studio.production-authorization.v1',
    'authorized',
    v_authorization,
    v_database_payload_hash,
    v_authorization_payload_hash,
    v_receipt_hash,
    v_result,
    v_created_at
  );

  RETURN v_result;
END
$$;

-- Preserve every existing pipeline column and append only receipt-backed,
-- redacted activation state. Existing brief_content_hash remains for compatibility;
-- no activation authorization hash, gate evidence, or internal payload is projected.
CREATE OR REPLACE VIEW co_production.preproject_pipeline
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
  COALESCE(opportunity.updated_at, inquiry.submitted_at) AS updated_at,
  proposal_request.id AS proposal_request_receipt_id,
  proposal_request.created_at AS proposal_requested_at,
  CASE
    WHEN activation_authorization.id IS NOT NULL AND activated_project.id IS NOT NULL
      THEN 'project_active'
    WHEN opportunity.stage IN ('proposal_requested', 'proposal_sent')
      AND activation_authorization.id IS NULL
      THEN 'awaiting_authorization'
    ELSE NULL
  END AS activation_status,
  CASE
    WHEN activation_authorization.id IS NOT NULL AND activated_project.id IS NOT NULL
      THEN activation_authorization.id
    ELSE NULL
  END AS activation_authorization_receipt_id,
  CASE
    WHEN activation_authorization.id IS NOT NULL AND activated_project.id IS NOT NULL
      THEN activated_project.id
    ELSE NULL
  END AS activated_project_id
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
LEFT JOIN co_production.opportunity_proposal_request_receipts AS proposal_request
  ON proposal_request.team_id = opportunity.team_id
  AND proposal_request.opportunity_id = opportunity.id
  AND proposal_request.source_inquiry_id = inquiry.id
  AND proposal_request.ready_brief_revision_id = brief.id
  AND proposal_request.ready_brief_content_hash = brief.content_hash
  AND proposal_request.resulting_authority_version <= opportunity.authority_version
LEFT JOIN co_production.proposal_activation_authorization_receipts
  AS activation_authorization
  ON activation_authorization.team_id = opportunity.team_id
  AND activation_authorization.opportunity_id = opportunity.id
  AND activation_authorization.proposal_request_receipt_id = proposal_request.id
  AND activation_authorization.ready_brief_revision_id = brief.id
LEFT JOIN co_production.projects AS activated_project
  ON activated_project.id = activation_authorization.project_id
  AND activated_project.team_id = activation_authorization.team_id
WHERE co_production_private.has_team_role(inquiry.team_id, 70);

REVOKE ALL ON TABLE co_production.proposal_activation_authorization_receipts
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT (
  id,
  team_id,
  proposal_request_receipt_id,
  opportunity_id,
  ready_brief_revision_id,
  proposal_handoff_receipt_id,
  project_id,
  created_at
) ON co_production.proposal_activation_authorization_receipts
  TO authenticated, service_role;

REVOKE ALL ON TABLE co_production.preproject_pipeline
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE co_production.preproject_pipeline
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION
  co_production_private.production_authorization_v1_is_valid(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION co_production.activate_proposal_handoff(
  text,
  text,
  text,
  jsonb,
  text,
  text
) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION co_production.activate_authorized_proposal_handoff(
  text,
  text,
  text,
  jsonb,
  text,
  text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION co_production.activate_authorized_proposal_handoff(
  text,
  text,
  text,
  jsonb,
  text,
  text
) TO service_role;

CREATE INDEX proposal_activation_authorization_receipts_team_created_idx
  ON co_production.proposal_activation_authorization_receipts(
    team_id,
    created_at DESC
  );

COMMIT;
