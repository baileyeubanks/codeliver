-- Promote a qualified opportunity into Proposal Studio through one immutable,
-- replay-safe authority transition. This migration does not create projects,
-- send proposals, calculate pricing, or activate accepted handoffs.

BEGIN;

DO $preflight$
BEGIN
  IF pg_catalog.to_regclass('co_production.opportunities') IS NULL
    OR pg_catalog.to_regclass('co_production.creative_brief_revisions') IS NULL
    OR pg_catalog.to_regclass('co_production.proposal_handoff_receipts') IS NULL
    OR pg_catalog.to_regprocedure(
      'co_production_private.preproject_sha256(text)'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'co_production_private.preproject_exact_json_keys(jsonb,text[])'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'co_production_private.has_team_role(uuid,integer)'
    ) IS NULL
  THEN
    RAISE EXCEPTION
      'Pre-project CRM and proposal handoff authorities must be installed first';
  END IF;
END
$preflight$;

CREATE TABLE co_production.opportunity_proposal_request_receipts (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES co_production.teams(id) ON DELETE RESTRICT,
  opportunity_id uuid NOT NULL,
  source_inquiry_id uuid NOT NULL,
  request_id uuid NOT NULL,
  request_payload jsonb NOT NULL CHECK (
    pg_catalog.jsonb_typeof(request_payload) = 'object'
    AND co_production_private.preproject_exact_json_keys(
      request_payload,
      ARRAY[
        'operation', 'team_id', 'opportunity_id', 'expected_authority_version',
        'request_id', 'source_brief_revision_id', 'source_brief_content_hash'
      ]
    )
    AND request_payload ->> 'operation' = 'opportunity.request_proposal'
  ),
  request_hash text NOT NULL CHECK (
    request_hash ~ '^sha256:[0-9a-f]{64}$'
    AND request_hash = co_production_private.preproject_sha256(request_payload::text)
  ),
  from_stage text NOT NULL CHECK (
    from_stage IN ('qualification', 'discovery', 'briefing')
  ),
  to_stage text NOT NULL CHECK (to_stage = 'proposal_requested'),
  expected_authority_version bigint NOT NULL CHECK (
    expected_authority_version BETWEEN 1 AND 2147483646
  ),
  resulting_authority_version bigint NOT NULL CHECK (
    resulting_authority_version = expected_authority_version + 1
  ),
  source_brief_revision_id uuid NOT NULL,
  source_brief_revision_number integer NOT NULL CHECK (
    source_brief_revision_number >= 1
  ),
  source_brief_content_hash text NOT NULL CHECK (
    source_brief_content_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  ready_brief_revision_id uuid NOT NULL,
  ready_brief_revision_number integer NOT NULL CHECK (
    ready_brief_revision_number = source_brief_revision_number + 1
  ),
  ready_brief_content_hash text NOT NULL CHECK (
    ready_brief_content_hash = source_brief_content_hash
  ),
  result jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(result) = 'object'),
  receipt_hash text NOT NULL UNIQUE CHECK (
    receipt_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL,
  CONSTRAINT opportunity_proposal_request_receipts_id_authority_key
    UNIQUE (id, team_id, opportunity_id, resulting_authority_version),
  CONSTRAINT opportunity_proposal_request_receipts_team_request_key
    UNIQUE (team_id, request_id),
  CONSTRAINT opportunity_proposal_request_receipts_version_key
    UNIQUE (opportunity_id, resulting_authority_version),
  CONSTRAINT opportunity_proposal_request_receipts_ready_brief_key
    UNIQUE (opportunity_id, ready_brief_revision_id),
  CONSTRAINT opportunity_proposal_request_receipts_opportunity_team_fk
    FOREIGN KEY (opportunity_id, team_id)
    REFERENCES co_production.opportunities(id, team_id)
    ON DELETE RESTRICT,
  CONSTRAINT opportunity_proposal_request_receipts_inquiry_team_fk
    FOREIGN KEY (source_inquiry_id, team_id)
    REFERENCES co_production.public_inquiries(id, team_id)
    ON DELETE RESTRICT,
  CONSTRAINT opportunity_proposal_request_receipts_source_brief_fk
    FOREIGN KEY (source_brief_revision_id, team_id, opportunity_id)
    REFERENCES co_production.creative_brief_revisions(id, team_id, opportunity_id)
    ON DELETE RESTRICT,
  CONSTRAINT opportunity_proposal_request_receipts_ready_brief_fk
    FOREIGN KEY (ready_brief_revision_id, team_id, opportunity_id)
    REFERENCES co_production.creative_brief_revisions(id, team_id, opportunity_id)
    ON DELETE RESTRICT
);

CREATE TABLE co_production.opportunity_proposal_request_events (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  team_id uuid NOT NULL,
  opportunity_id uuid NOT NULL,
  receipt_id uuid NOT NULL UNIQUE,
  event_sequence integer NOT NULL CHECK (event_sequence >= 1),
  event_type text NOT NULL CHECK (
    event_type = 'opportunity.proposal_requested'
  ),
  from_stage text NOT NULL CHECK (
    from_stage IN ('qualification', 'discovery', 'briefing')
  ),
  to_stage text NOT NULL CHECK (to_stage = 'proposal_requested'),
  from_authority_version bigint NOT NULL CHECK (from_authority_version >= 1),
  to_authority_version bigint NOT NULL CHECK (
    to_authority_version = from_authority_version + 1
  ),
  ready_brief_revision_id uuid NOT NULL,
  ready_brief_content_hash text NOT NULL CHECK (
    ready_brief_content_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  previous_event_hash text NOT NULL CHECK (
    previous_event_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  event_hash text NOT NULL UNIQUE CHECK (event_hash ~ '^sha256:[0-9a-f]{64}$'),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL,
  CONSTRAINT opportunity_proposal_request_events_sequence_key
    UNIQUE (opportunity_id, event_sequence),
  CONSTRAINT opportunity_proposal_request_events_opportunity_team_fk
    FOREIGN KEY (opportunity_id, team_id)
    REFERENCES co_production.opportunities(id, team_id)
    ON DELETE RESTRICT,
  CONSTRAINT opportunity_proposal_request_events_receipt_fk
    FOREIGN KEY (
      receipt_id,
      team_id,
      opportunity_id,
      to_authority_version
    )
    REFERENCES co_production.opportunity_proposal_request_receipts(
      id,
      team_id,
      opportunity_id,
      resulting_authority_version
    )
    ON DELETE RESTRICT,
  CONSTRAINT opportunity_proposal_request_events_ready_brief_fk
    FOREIGN KEY (ready_brief_revision_id, team_id, opportunity_id)
    REFERENCES co_production.creative_brief_revisions(id, team_id, opportunity_id)
    ON DELETE RESTRICT
);

ALTER TABLE co_production.opportunity_proposal_request_receipts
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.opportunity_proposal_request_receipts
  FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.opportunity_proposal_request_events
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.opportunity_proposal_request_events
  FORCE ROW LEVEL SECURITY;

CREATE POLICY opportunity_proposal_request_receipts_select
  ON co_production.opportunity_proposal_request_receipts
  FOR SELECT TO authenticated
  USING (co_production_private.has_team_role(team_id, 70));

CREATE POLICY opportunity_proposal_request_events_select
  ON co_production.opportunity_proposal_request_events
  FOR SELECT TO authenticated
  USING (co_production_private.has_team_role(team_id, 70));

CREATE TRIGGER opportunity_proposal_request_receipts_immutable
BEFORE UPDATE OR DELETE ON co_production.opportunity_proposal_request_receipts
FOR EACH ROW
EXECUTE FUNCTION co_production_private.prevent_preproject_immutable_mutation();

CREATE TRIGGER opportunity_proposal_request_receipts_no_truncate
BEFORE TRUNCATE ON co_production.opportunity_proposal_request_receipts
FOR EACH STATEMENT
EXECUTE FUNCTION co_production_private.prevent_preproject_immutable_mutation();

CREATE TRIGGER opportunity_proposal_request_events_immutable
BEFORE UPDATE OR DELETE ON co_production.opportunity_proposal_request_events
FOR EACH ROW
EXECUTE FUNCTION co_production_private.prevent_preproject_immutable_mutation();

CREATE TRIGGER opportunity_proposal_request_events_no_truncate
BEFORE TRUNCATE ON co_production.opportunity_proposal_request_events
FOR EACH STATEMENT
EXECUTE FUNCTION co_production_private.prevent_preproject_immutable_mutation();

CREATE OR REPLACE FUNCTION co_production.request_opportunity_proposal(
  p_opportunity_id uuid,
  p_expected_version bigint,
  p_request_id uuid,
  p_source_brief_revision_id uuid,
  p_source_brief_content_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_opportunity co_production.opportunities%ROWTYPE;
  v_source_brief co_production.creative_brief_revisions%ROWTYPE;
  v_existing co_production.opportunity_proposal_request_receipts%ROWTYPE;
  v_request_payload jsonb;
  v_request_hash text;
  v_ready_brief_id uuid := pg_catalog.gen_random_uuid();
  v_ready_brief_revision_number integer;
  v_resulting_version bigint;
  v_receipt_id uuid := pg_catalog.gen_random_uuid();
  v_receipt_hash text;
  v_event_id uuid := pg_catalog.gen_random_uuid();
  v_event_sequence integer;
  v_previous_event_hash text;
  v_event_hash text;
  v_result jsonb;
  v_now timestamptz := statement_timestamp();
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'crm_proposal_forbidden';
  END IF;

  IF p_opportunity_id IS NULL
    OR p_expected_version IS NULL
    OR p_expected_version < 1
    OR p_expected_version > 2147483646
    OR p_request_id IS NULL
    OR p_source_brief_revision_id IS NULL
    OR p_source_brief_content_hash IS NULL
    OR p_source_brief_content_hash !~ '^sha256:[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_crm_proposal_request';
  END IF;

  SELECT opportunity.*
  INTO v_opportunity
  FROM co_production.opportunities AS opportunity
  WHERE opportunity.id = p_opportunity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'crm_proposal_not_found';
  END IF;
  IF NOT co_production_private.has_team_role(v_opportunity.team_id, 70) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'crm_proposal_not_found';
  END IF;

  v_request_payload := pg_catalog.jsonb_build_object(
    'operation', 'opportunity.request_proposal',
    'team_id', v_opportunity.team_id,
    'opportunity_id', p_opportunity_id,
    'expected_authority_version', p_expected_version,
    'request_id', p_request_id,
    'source_brief_revision_id', p_source_brief_revision_id,
    'source_brief_content_hash', p_source_brief_content_hash
  );
  v_request_hash := co_production_private.preproject_sha256(
    v_request_payload::text
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'cco:request-opportunity-proposal:'
        || v_opportunity.team_id::text || ':' || p_request_id::text,
      0
    )
  );

  SELECT receipt.*
  INTO v_existing
  FROM co_production.opportunity_proposal_request_receipts AS receipt
  WHERE receipt.team_id = v_opportunity.team_id
    AND receipt.request_id = p_request_id;

  IF FOUND THEN
    IF v_existing.opportunity_id IS DISTINCT FROM p_opportunity_id
      OR v_existing.expected_authority_version IS DISTINCT FROM p_expected_version
      OR v_existing.source_brief_revision_id
        IS DISTINCT FROM p_source_brief_revision_id
      OR v_existing.source_brief_content_hash
        IS DISTINCT FROM p_source_brief_content_hash
      OR v_existing.request_hash IS DISTINCT FROM v_request_hash
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'crm_proposal_idempotency_conflict';
    END IF;
    RETURN v_existing.result || pg_catalog.jsonb_build_object('replayed', true);
  END IF;

  IF v_opportunity.authority_version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'crm_proposal_version_conflict';
  END IF;
  IF v_opportunity.stage NOT IN ('qualification', 'discovery', 'briefing') THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'crm_proposal_invalid_transition';
  END IF;
  IF v_opportunity.current_brief_revision_id
      IS DISTINCT FROM p_source_brief_revision_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'crm_proposal_brief_conflict';
  END IF;

  SELECT brief.*
  INTO v_source_brief
  FROM co_production.creative_brief_revisions AS brief
  WHERE brief.id = p_source_brief_revision_id
    AND brief.team_id = v_opportunity.team_id
    AND brief.opportunity_id = v_opportunity.id;

  IF NOT FOUND
    OR v_source_brief.status IS DISTINCT FROM 'draft'
    OR v_source_brief.content_hash IS DISTINCT FROM p_source_brief_content_hash
    OR v_source_brief.source_inquiry_id
      IS DISTINCT FROM v_opportunity.source_inquiry_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'crm_proposal_brief_conflict';
  END IF;

  SELECT COALESCE(pg_catalog.max(brief.revision_number), 0) + 1
  INTO v_ready_brief_revision_number
  FROM co_production.creative_brief_revisions AS brief
  WHERE brief.opportunity_id = v_opportunity.id;

  IF v_ready_brief_revision_number
      IS DISTINCT FROM v_source_brief.revision_number + 1
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'crm_proposal_brief_conflict';
  END IF;

  v_resulting_version := p_expected_version + 1;

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
    v_ready_brief_id,
    v_source_brief.team_id,
    v_source_brief.opportunity_id,
    v_source_brief.source_inquiry_id,
    v_ready_brief_revision_number,
    'ready_for_proposal',
    v_source_brief.title,
    v_source_brief.objectives,
    v_source_brief.audiences,
    v_source_brief.key_messages,
    v_source_brief.requested_deliverables,
    v_source_brief.constraints,
    v_source_brief."references",
    v_source_brief.success_criteria,
    v_source_brief.content,
    v_source_brief.content_hash,
    v_actor_id,
    v_now
  );

  UPDATE co_production.opportunities
  SET
    current_brief_revision_id = v_ready_brief_id,
    stage = 'proposal_requested',
    authority_version = v_resulting_version,
    updated_at = v_now
  WHERE id = v_opportunity.id
    AND team_id = v_opportunity.team_id
    AND authority_version = p_expected_version
    AND current_brief_revision_id = p_source_brief_revision_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'crm_proposal_version_conflict';
  END IF;

  v_result := pg_catalog.jsonb_build_object(
    'proposal_request_receipt_id', v_receipt_id,
    'opportunity_id', v_opportunity.id,
    'source_inquiry_id', v_opportunity.source_inquiry_id,
    'source_brief_revision_id', v_source_brief.id,
    'source_brief_revision_number', v_source_brief.revision_number,
    'ready_brief_revision_id', v_ready_brief_id,
    'ready_brief_revision_number', v_ready_brief_revision_number,
    'brief_content_hash', v_source_brief.content_hash,
    'from_stage', v_opportunity.stage,
    'stage', 'proposal_requested',
    'authority_version', v_resulting_version,
    'request_id', p_request_id,
    'requested_at', v_now,
    'replayed', false
  );

  v_receipt_hash := co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'id', v_receipt_id,
      'team_id', v_opportunity.team_id,
      'opportunity_id', v_opportunity.id,
      'source_inquiry_id', v_opportunity.source_inquiry_id,
      'request_payload', v_request_payload,
      'request_hash', v_request_hash,
      'from_stage', v_opportunity.stage,
      'to_stage', 'proposal_requested',
      'expected_authority_version', p_expected_version,
      'resulting_authority_version', v_resulting_version,
      'source_brief_revision_id', v_source_brief.id,
      'ready_brief_revision_id', v_ready_brief_id,
      'result', v_result,
      'actor_id', v_actor_id,
      'created_at', v_now
    )::text
  );

  INSERT INTO co_production.opportunity_proposal_request_receipts (
    id,
    team_id,
    opportunity_id,
    source_inquiry_id,
    request_id,
    request_payload,
    request_hash,
    from_stage,
    to_stage,
    expected_authority_version,
    resulting_authority_version,
    source_brief_revision_id,
    source_brief_revision_number,
    source_brief_content_hash,
    ready_brief_revision_id,
    ready_brief_revision_number,
    ready_brief_content_hash,
    result,
    receipt_hash,
    actor_id,
    created_at
  )
  VALUES (
    v_receipt_id,
    v_opportunity.team_id,
    v_opportunity.id,
    v_opportunity.source_inquiry_id,
    p_request_id,
    v_request_payload,
    v_request_hash,
    v_opportunity.stage,
    'proposal_requested',
    p_expected_version,
    v_resulting_version,
    v_source_brief.id,
    v_source_brief.revision_number,
    v_source_brief.content_hash,
    v_ready_brief_id,
    v_ready_brief_revision_number,
    v_source_brief.content_hash,
    v_result,
    v_receipt_hash,
    v_actor_id,
    v_now
  );

  SELECT
    COALESCE(pg_catalog.max(event.event_sequence), 0) + 1,
    COALESCE(
      (pg_catalog.array_agg(
        event.event_hash ORDER BY event.event_sequence DESC
      ))[1],
      'sha256:' || pg_catalog.repeat('0', 64)
    )
  INTO v_event_sequence, v_previous_event_hash
  FROM co_production.opportunity_proposal_request_events AS event
  WHERE event.opportunity_id = v_opportunity.id;

  v_event_hash := co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'id', v_event_id,
      'team_id', v_opportunity.team_id,
      'opportunity_id', v_opportunity.id,
      'receipt_id', v_receipt_id,
      'event_sequence', v_event_sequence,
      'event_type', 'opportunity.proposal_requested',
      'from_stage', v_opportunity.stage,
      'to_stage', 'proposal_requested',
      'from_authority_version', p_expected_version,
      'to_authority_version', v_resulting_version,
      'ready_brief_revision_id', v_ready_brief_id,
      'ready_brief_content_hash', v_source_brief.content_hash,
      'previous_event_hash', v_previous_event_hash,
      'actor_id', v_actor_id,
      'occurred_at', v_now
    )::text
  );

  INSERT INTO co_production.opportunity_proposal_request_events (
    id,
    team_id,
    opportunity_id,
    receipt_id,
    event_sequence,
    event_type,
    from_stage,
    to_stage,
    from_authority_version,
    to_authority_version,
    ready_brief_revision_id,
    ready_brief_content_hash,
    previous_event_hash,
    event_hash,
    actor_id,
    occurred_at
  )
  VALUES (
    v_event_id,
    v_opportunity.team_id,
    v_opportunity.id,
    v_receipt_id,
    v_event_sequence,
    'opportunity.proposal_requested',
    v_opportunity.stage,
    'proposal_requested',
    p_expected_version,
    v_resulting_version,
    v_ready_brief_id,
    v_source_brief.content_hash,
    v_previous_event_hash,
    v_event_hash,
    v_actor_id,
    v_now
  );

  RETURN v_result;
END
$$;

CREATE VIEW co_production.proposal_studio_ready_context
WITH (security_barrier = true, security_invoker = true)
AS
SELECT
  opportunity.team_id,
  opportunity.id AS opportunity_id,
  opportunity.name AS opportunity_name,
  opportunity.stage AS opportunity_stage,
  opportunity.probability_basis_points,
  opportunity.expected_close_date,
  opportunity.authority_version AS opportunity_authority_version,
  opportunity.updated_at AS opportunity_updated_at,
  account.id AS account_id,
  account.display_name AS account_display_name,
  account.legal_name AS account_legal_name,
  account.website AS account_website,
  account.lifecycle_status AS account_lifecycle_status,
  account.authority_version AS account_authority_version,
  contact.id AS contact_id,
  contact.name AS contact_name,
  contact.title AS contact_title,
  contact.email AS contact_email,
  contact.phone AS contact_phone,
  contact.stakeholder_role AS contact_stakeholder_role,
  contact.authority_version AS contact_authority_version,
  brief.id AS brief_revision_id,
  brief.revision_number AS brief_revision_number,
  brief.status AS brief_status,
  brief.title AS brief_title,
  brief.objectives AS brief_objectives,
  brief.audiences AS brief_audiences,
  brief.key_messages AS brief_key_messages,
  brief.requested_deliverables AS brief_requested_deliverables,
  brief.constraints AS brief_constraints,
  brief."references" AS brief_references,
  brief.success_criteria AS brief_success_criteria,
  brief.content_hash AS brief_content_hash,
  brief.created_at AS brief_created_at,
  inquiry.id AS inquiry_id,
  inquiry.submitted_at AS inquiry_submitted_at,
  inquiry.project_title AS inquiry_project_title,
  inquiry.goals AS inquiry_goals,
  inquiry.audiences AS inquiry_audiences,
  inquiry.requested_deliverables AS inquiry_requested_deliverables,
  inquiry.reference_urls AS inquiry_reference_urls,
  inquiry.constraints AS inquiry_constraints,
  inquiry.notes AS inquiry_notes,
  inquiry.desired_start_date AS inquiry_desired_start_date,
  inquiry.due_date AS inquiry_due_date,
  inquiry.timeline_flexibility AS inquiry_timeline_flexibility,
  inquiry.budget_band AS inquiry_budget_band,
  receipt.id AS proposal_request_receipt_id,
  receipt.created_at AS proposal_requested_at
FROM co_production.opportunities AS opportunity
JOIN co_production.crm_accounts AS account
  ON account.id = opportunity.account_id
  AND account.team_id = opportunity.team_id
  AND account.source_inquiry_id = opportunity.source_inquiry_id
JOIN co_production.crm_contacts AS contact
  ON contact.id = opportunity.primary_contact_id
  AND contact.team_id = opportunity.team_id
  AND contact.account_id = opportunity.account_id
  AND contact.source_inquiry_id = opportunity.source_inquiry_id
JOIN co_production.creative_brief_revisions AS brief
  ON brief.id = opportunity.current_brief_revision_id
  AND brief.team_id = opportunity.team_id
  AND brief.opportunity_id = opportunity.id
  AND brief.source_inquiry_id = opportunity.source_inquiry_id
JOIN co_production.public_inquiries AS inquiry
  ON inquiry.id = opportunity.source_inquiry_id
  AND inquiry.team_id = opportunity.team_id
JOIN co_production.opportunity_proposal_request_receipts AS receipt
  ON receipt.team_id = opportunity.team_id
  AND receipt.opportunity_id = opportunity.id
  AND receipt.source_inquiry_id = opportunity.source_inquiry_id
  AND receipt.ready_brief_revision_id = opportunity.current_brief_revision_id
  AND receipt.ready_brief_content_hash = brief.content_hash
  AND receipt.resulting_authority_version <= opportunity.authority_version
WHERE opportunity.stage IN ('proposal_requested', 'proposal_sent')
  AND brief.status = 'ready_for_proposal'
  AND account.lifecycle_status = 'active'
  AND contact.lifecycle_status = 'active'
  AND co_production_private.has_team_role(opportunity.team_id, 70);

CREATE OR REPLACE FUNCTION
  co_production_private.require_ready_internal_proposal_origin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_origin jsonb := NEW.production_seed -> 'origin';
BEGIN
  IF v_origin IS NULL OR pg_catalog.jsonb_typeof(v_origin) = 'null' THEN
    RETURN NEW;
  END IF;
  IF pg_catalog.jsonb_typeof(v_origin) <> 'object'
    OR v_origin ->> 'authority' IS DISTINCT FROM 'co-videopro-crm'
  THEN
    RETURN NEW;
  END IF;
  IF (v_origin ->> 'opportunityId')
      !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR (v_origin ->> 'briefRevisionId')
      !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR (v_origin ->> 'opportunityAuthorityVersion') !~ '^[1-9][0-9]{0,9}$'
    OR (v_origin ->> 'briefContentHash') !~ '^sha256:[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'stale_or_mismatched_preproject_origin';
  END IF;

  PERFORM 1
  FROM co_production.opportunities AS opportunity
  JOIN co_production.creative_brief_revisions AS brief
    ON brief.id = opportunity.current_brief_revision_id
    AND brief.team_id = opportunity.team_id
    AND brief.opportunity_id = opportunity.id
  JOIN co_production.opportunity_proposal_request_receipts AS receipt
    ON receipt.team_id = opportunity.team_id
    AND receipt.opportunity_id = opportunity.id
    AND receipt.ready_brief_revision_id = brief.id
    AND receipt.ready_brief_content_hash = brief.content_hash
    AND receipt.resulting_authority_version <= opportunity.authority_version
  WHERE opportunity.id = (v_origin ->> 'opportunityId')::uuid
    AND opportunity.team_id = NEW.team_id
    AND opportunity.stage IN ('proposal_requested', 'proposal_sent')
    AND opportunity.authority_version
      = (v_origin ->> 'opportunityAuthorityVersion')::bigint
    AND brief.id = (v_origin ->> 'briefRevisionId')::uuid
    AND brief.status = 'ready_for_proposal'
    AND brief.content_hash = v_origin ->> 'briefContentHash';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'stale_or_mismatched_preproject_origin';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER proposal_handoff_require_ready_internal_origin
BEFORE INSERT ON co_production.proposal_handoff_receipts
FOR EACH ROW
EXECUTE FUNCTION co_production_private.require_ready_internal_proposal_origin();

REVOKE ALL ON TABLE co_production.opportunity_proposal_request_receipts
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.opportunity_proposal_request_events
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.proposal_studio_ready_context
  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE co_production.opportunity_proposal_request_receipts
  TO authenticated, service_role;
GRANT SELECT ON TABLE co_production.opportunity_proposal_request_events
  TO authenticated, service_role;
GRANT SELECT ON TABLE co_production.proposal_studio_ready_context
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION co_production.request_opportunity_proposal(
  uuid,
  bigint,
  uuid,
  uuid,
  text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION co_production.request_opportunity_proposal(
  uuid,
  bigint,
  uuid,
  uuid,
  text
) TO authenticated;

REVOKE ALL ON FUNCTION
  co_production_private.require_ready_internal_proposal_origin()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE INDEX opportunity_proposal_request_receipts_team_created_idx
  ON co_production.opportunity_proposal_request_receipts(
    team_id,
    created_at DESC
  );
CREATE INDEX opportunity_proposal_request_events_team_occurred_idx
  ON co_production.opportunity_proposal_request_events(
    team_id,
    occurred_at DESC
  );

COMMIT;
