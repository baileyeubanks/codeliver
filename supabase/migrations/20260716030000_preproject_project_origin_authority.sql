-- Bind an accepted Proposal Studio handoff back to its canonical Co-VideoPro
-- inquiry, CRM account, contact, opportunity, and creative brief revision.
--
-- External proposal packages without an explicit Co-VideoPro CRM origin remain
-- valid but visibly unlinked. An asserted internal origin fails closed unless
-- every tenant, version, relationship, and brief hash still matches.

BEGIN;

DO $preflight$
BEGIN
  IF pg_catalog.to_regclass('co_production.proposal_handoff_receipts') IS NULL
    OR pg_catalog.to_regclass('co_production.public_inquiries') IS NULL
    OR pg_catalog.to_regclass('co_production.crm_accounts') IS NULL
    OR pg_catalog.to_regclass('co_production.crm_contacts') IS NULL
    OR pg_catalog.to_regclass('co_production.opportunities') IS NULL
    OR pg_catalog.to_regclass('co_production.creative_brief_revisions') IS NULL
  THEN
    RAISE EXCEPTION 'Proposal handoff and pre-project CRM authorities must be installed first';
  END IF;
END
$preflight$;

ALTER TABLE co_production.opportunities
  DROP CONSTRAINT IF EXISTS opportunities_authority_version_check;
ALTER TABLE co_production.opportunities
  ADD CONSTRAINT opportunities_authority_version_positive
  CHECK (authority_version BETWEEN 1 AND 2147483647);

ALTER TABLE co_production.proposal_handoff_receipts
  ADD CONSTRAINT proposal_handoff_receipts_id_team_project_unique
  UNIQUE (id, team_id, project_id);

CREATE TABLE co_production.project_preproject_origins (
  project_id uuid PRIMARY KEY,
  team_id uuid NOT NULL,
  proposal_handoff_receipt_id uuid NOT NULL UNIQUE,
  inquiry_id uuid NOT NULL,
  account_id uuid NOT NULL,
  account_authority_version bigint NOT NULL CHECK (account_authority_version >= 1),
  primary_contact_id uuid NOT NULL,
  contact_authority_version bigint NOT NULL CHECK (contact_authority_version >= 1),
  opportunity_id uuid NOT NULL UNIQUE,
  opportunity_authority_version bigint NOT NULL CHECK (
    opportunity_authority_version >= 2
  ),
  brief_revision_id uuid NOT NULL,
  brief_revision_number integer NOT NULL CHECK (brief_revision_number >= 1),
  brief_content_hash text NOT NULL CHECK (
    brief_content_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  activation_source text NOT NULL DEFAULT 'accepted_proposal' CHECK (
    activation_source = 'accepted_proposal'
  ),
  origin_context_hash text NOT NULL CHECK (
    origin_context_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  link_hash text NOT NULL UNIQUE CHECK (link_hash ~ '^sha256:[0-9a-f]{64}$'),
  linked_at timestamptz NOT NULL,
  CONSTRAINT project_preproject_origins_project_team_fk
    FOREIGN KEY (project_id, team_id)
    REFERENCES co_production.projects(id, team_id)
    ON DELETE RESTRICT,
  CONSTRAINT project_preproject_origins_receipt_team_fk
    FOREIGN KEY (proposal_handoff_receipt_id, team_id, project_id)
    REFERENCES co_production.proposal_handoff_receipts(id, team_id, project_id)
    ON DELETE RESTRICT,
  CONSTRAINT project_preproject_origins_inquiry_team_fk
    FOREIGN KEY (inquiry_id, team_id)
    REFERENCES co_production.public_inquiries(id, team_id)
    ON DELETE RESTRICT,
  CONSTRAINT project_preproject_origins_account_team_fk
    FOREIGN KEY (account_id, team_id)
    REFERENCES co_production.crm_accounts(id, team_id)
    ON DELETE RESTRICT,
  CONSTRAINT project_preproject_origins_contact_team_fk
    FOREIGN KEY (primary_contact_id, team_id)
    REFERENCES co_production.crm_contacts(id, team_id)
    ON DELETE RESTRICT,
  CONSTRAINT project_preproject_origins_opportunity_team_fk
    FOREIGN KEY (opportunity_id, team_id)
    REFERENCES co_production.opportunities(id, team_id)
    ON DELETE RESTRICT,
  CONSTRAINT project_preproject_origins_brief_authority_fk
    FOREIGN KEY (brief_revision_id, team_id, opportunity_id)
    REFERENCES co_production.creative_brief_revisions(id, team_id, opportunity_id)
    ON DELETE RESTRICT
);

CREATE TABLE co_production.opportunity_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  team_id uuid NOT NULL,
  opportunity_id uuid NOT NULL,
  event_sequence integer NOT NULL CHECK (event_sequence >= 1),
  event_type text NOT NULL CHECK (event_type = 'accepted_proposal_activated'),
  from_stage text NOT NULL CHECK (
    from_stage IN (
      'qualification', 'discovery', 'briefing', 'proposal_requested',
      'proposal_sent', 'on_hold'
    )
  ),
  to_stage text NOT NULL CHECK (to_stage = 'won'),
  from_authority_version bigint NOT NULL CHECK (from_authority_version >= 1),
  to_authority_version bigint NOT NULL CHECK (
    to_authority_version = from_authority_version + 1
  ),
  project_id uuid NOT NULL,
  proposal_handoff_receipt_id uuid NOT NULL UNIQUE,
  brief_revision_id uuid NOT NULL,
  brief_content_hash text NOT NULL CHECK (
    brief_content_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  actor_kind text NOT NULL CHECK (actor_kind = 'proposal_integration'),
  previous_event_hash text NOT NULL CHECK (
    previous_event_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  event_hash text NOT NULL UNIQUE CHECK (event_hash ~ '^sha256:[0-9a-f]{64}$'),
  occurred_at timestamptz NOT NULL,
  CONSTRAINT opportunity_lifecycle_events_sequence_key
    UNIQUE (opportunity_id, event_sequence),
  CONSTRAINT opportunity_lifecycle_events_opportunity_team_fk
    FOREIGN KEY (opportunity_id, team_id)
    REFERENCES co_production.opportunities(id, team_id)
    ON DELETE RESTRICT,
  CONSTRAINT opportunity_lifecycle_events_project_team_fk
    FOREIGN KEY (project_id, team_id)
    REFERENCES co_production.projects(id, team_id)
    ON DELETE RESTRICT,
  CONSTRAINT opportunity_lifecycle_events_origin_fk
    FOREIGN KEY (project_id)
    REFERENCES co_production.project_preproject_origins(project_id)
    ON DELETE RESTRICT,
  CONSTRAINT opportunity_lifecycle_events_receipt_team_fk
    FOREIGN KEY (proposal_handoff_receipt_id, team_id, project_id)
    REFERENCES co_production.proposal_handoff_receipts(id, team_id, project_id)
    ON DELETE RESTRICT,
  CONSTRAINT opportunity_lifecycle_events_brief_authority_fk
    FOREIGN KEY (brief_revision_id, team_id, opportunity_id)
    REFERENCES co_production.creative_brief_revisions(id, team_id, opportunity_id)
    ON DELETE RESTRICT
);

ALTER TABLE co_production.project_preproject_origins ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.project_preproject_origins FORCE ROW LEVEL SECURITY;
ALTER TABLE co_production.opportunity_lifecycle_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.opportunity_lifecycle_events FORCE ROW LEVEL SECURITY;

CREATE POLICY project_preproject_origins_select
  ON co_production.project_preproject_origins
  FOR SELECT TO authenticated
  USING (co_production_private.has_project_role(project_id, 10));

CREATE POLICY opportunity_lifecycle_events_select
  ON co_production.opportunity_lifecycle_events
  FOR SELECT TO authenticated
  USING (
    co_production_private.has_team_role(team_id, 70)
    OR co_production_private.has_project_role(project_id, 70)
  );

CREATE TRIGGER project_preproject_origins_immutable
BEFORE UPDATE OR DELETE ON co_production.project_preproject_origins
FOR EACH ROW
EXECUTE FUNCTION co_production_private.prevent_preproject_immutable_mutation();

CREATE TRIGGER project_preproject_origins_no_truncate
BEFORE TRUNCATE ON co_production.project_preproject_origins
FOR EACH STATEMENT
EXECUTE FUNCTION co_production_private.prevent_preproject_immutable_mutation();

CREATE TRIGGER opportunity_lifecycle_events_immutable
BEFORE UPDATE OR DELETE ON co_production.opportunity_lifecycle_events
FOR EACH ROW
EXECUTE FUNCTION co_production_private.prevent_preproject_immutable_mutation();

CREATE TRIGGER opportunity_lifecycle_events_no_truncate
BEFORE TRUNCATE ON co_production.opportunity_lifecycle_events
FOR EACH STATEMENT
EXECUTE FUNCTION co_production_private.prevent_preproject_immutable_mutation();

CREATE OR REPLACE FUNCTION co_production_private.link_preproject_origin_on_handoff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_origin jsonb := NEW.production_seed -> 'origin';
  v_opportunity record;
  v_inquiry_id uuid;
  v_account_id uuid;
  v_contact_id uuid;
  v_opportunity_id uuid;
  v_brief_id uuid;
  v_from_stage text;
  v_from_version bigint;
  v_to_version bigint;
  v_event_sequence integer;
  v_previous_event_hash text;
  v_event_id uuid := pg_catalog.gen_random_uuid();
  v_origin_context_hash text;
  v_link_hash text;
  v_event_hash text;
  v_occurred_at timestamptz := NEW.created_at;
BEGIN
  IF v_origin IS NULL OR pg_catalog.jsonb_typeof(v_origin) = 'null' THEN
    RETURN NEW;
  END IF;

  IF pg_catalog.jsonb_typeof(v_origin) <> 'object'
    OR NOT co_production_private.preproject_exact_json_keys(
      v_origin,
      ARRAY[
        'authority', 'inquiryId', 'accountId', 'accountAuthorityVersion',
        'primaryContactId', 'contactAuthorityVersion', 'opportunityId',
        'opportunityAuthorityVersion', 'briefRevisionId',
        'briefRevisionNumber', 'briefContentHash'
      ]
    )
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
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_internal_preproject_origin';
  END IF;

  v_inquiry_id := (v_origin ->> 'inquiryId')::uuid;
  v_account_id := (v_origin ->> 'accountId')::uuid;
  v_contact_id := (v_origin ->> 'primaryContactId')::uuid;
  v_opportunity_id := (v_origin ->> 'opportunityId')::uuid;
  v_brief_id := (v_origin ->> 'briefRevisionId')::uuid;

  IF NEW.production_seed ->> 'clientId' IS DISTINCT FROM v_account_id::text
    OR NEW.production_seed ->> 'opportunityId' IS DISTINCT FROM v_opportunity_id::text
    OR NEW.production_seed ->> 'briefId' IS DISTINCT FROM v_brief_id::text
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'preproject_origin_reference_mismatch';
  END IF;

  SELECT
    opportunity.stage,
    opportunity.authority_version,
    account.authority_version AS account_authority_version,
    contact.authority_version AS contact_authority_version,
    brief.revision_number AS brief_revision_number,
    brief.content_hash AS brief_content_hash,
    inquiry.payload_hash AS inquiry_payload_hash
  INTO v_opportunity
  FROM co_production.opportunities AS opportunity
  JOIN co_production.crm_accounts AS account
    ON account.id = opportunity.account_id
    AND account.team_id = opportunity.team_id
  JOIN co_production.crm_contacts AS contact
    ON contact.id = opportunity.primary_contact_id
    AND contact.team_id = opportunity.team_id
    AND contact.account_id = account.id
  JOIN co_production.creative_brief_revisions AS brief
    ON brief.id = opportunity.current_brief_revision_id
    AND brief.team_id = opportunity.team_id
    AND brief.opportunity_id = opportunity.id
  JOIN co_production.public_inquiries AS inquiry
    ON inquiry.id = opportunity.source_inquiry_id
    AND inquiry.team_id = opportunity.team_id
    AND brief.source_inquiry_id = inquiry.id
    AND account.source_inquiry_id = inquiry.id
    AND contact.source_inquiry_id = inquiry.id
  WHERE opportunity.id = v_opportunity_id
    AND opportunity.team_id = NEW.team_id
    AND account.id = v_account_id
    AND contact.id = v_contact_id
    AND inquiry.id = v_inquiry_id
    AND brief.id = v_brief_id
  FOR UPDATE OF opportunity;

  IF NOT FOUND
    OR v_opportunity.stage IN ('won', 'lost')
    OR v_opportunity.account_authority_version
      IS DISTINCT FROM (v_origin ->> 'accountAuthorityVersion')::bigint
    OR v_opportunity.contact_authority_version
      IS DISTINCT FROM (v_origin ->> 'contactAuthorityVersion')::bigint
    OR v_opportunity.authority_version
      IS DISTINCT FROM (v_origin ->> 'opportunityAuthorityVersion')::bigint
    OR v_opportunity.brief_revision_number
      IS DISTINCT FROM (v_origin ->> 'briefRevisionNumber')::integer
    OR v_opportunity.brief_content_hash
      IS DISTINCT FROM (v_origin ->> 'briefContentHash')
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'stale_or_mismatched_preproject_origin';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(
      NEW.production_seed -> 'artifactRefs'
    ) AS artifact(value)
    WHERE artifact.value ->> 'kind' = 'brief'
      AND artifact.value ->> 'artifactId' = v_brief_id::text
      AND 'sha256:' || lower(artifact.value ->> 'sha256')
        = v_opportunity.brief_content_hash
      AND artifact.value ->> 'classification' = 'production_safe'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'canonical_brief_evidence_missing';
  END IF;

  v_from_stage := v_opportunity.stage;
  v_from_version := v_opportunity.authority_version;
  v_to_version := v_from_version + 1;
  SELECT
    COALESCE(max(event.event_sequence), 0) + 1,
    COALESCE(
      (array_agg(event.event_hash ORDER BY event.event_sequence DESC))[1],
      'sha256:' || repeat('0', 64)
    )
  INTO v_event_sequence, v_previous_event_hash
  FROM co_production.opportunity_lifecycle_events AS event
  WHERE event.opportunity_id = v_opportunity_id;

  v_origin_context_hash := co_production_private.preproject_sha256(v_origin::text);
  v_link_hash := co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'project_id', NEW.project_id,
      'team_id', NEW.team_id,
      'proposal_handoff_receipt_id', NEW.id,
      'inquiry_id', v_inquiry_id,
      'account_id', v_account_id,
      'primary_contact_id', v_contact_id,
      'opportunity_id', v_opportunity_id,
      'brief_revision_id', v_brief_id,
      'brief_content_hash', v_opportunity.brief_content_hash,
      'origin_context_hash', v_origin_context_hash,
      'linked_at', v_occurred_at
    )::text
  );

  INSERT INTO co_production.project_preproject_origins (
    project_id,
    team_id,
    proposal_handoff_receipt_id,
    inquiry_id,
    account_id,
    account_authority_version,
    primary_contact_id,
    contact_authority_version,
    opportunity_id,
    opportunity_authority_version,
    brief_revision_id,
    brief_revision_number,
    brief_content_hash,
    activation_source,
    origin_context_hash,
    link_hash,
    linked_at
  )
  VALUES (
    NEW.project_id,
    NEW.team_id,
    NEW.id,
    v_inquiry_id,
    v_account_id,
    v_opportunity.account_authority_version,
    v_contact_id,
    v_opportunity.contact_authority_version,
    v_opportunity_id,
    v_to_version,
    v_brief_id,
    v_opportunity.brief_revision_number,
    v_opportunity.brief_content_hash,
    'accepted_proposal',
    v_origin_context_hash,
    v_link_hash,
    v_occurred_at
  );

  UPDATE co_production.opportunities
  SET
    stage = 'won',
    authority_version = v_to_version,
    updated_at = v_occurred_at
  WHERE id = v_opportunity_id
    AND team_id = NEW.team_id
    AND authority_version = v_from_version;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'preproject_origin_version_conflict';
  END IF;

  v_event_hash := co_production_private.preproject_sha256(
    pg_catalog.jsonb_build_object(
      'id', v_event_id,
      'team_id', NEW.team_id,
      'opportunity_id', v_opportunity_id,
      'event_sequence', v_event_sequence,
      'event_type', 'accepted_proposal_activated',
      'from_stage', v_from_stage,
      'to_stage', 'won',
      'from_authority_version', v_from_version,
      'to_authority_version', v_to_version,
      'project_id', NEW.project_id,
      'proposal_handoff_receipt_id', NEW.id,
      'brief_revision_id', v_brief_id,
      'brief_content_hash', v_opportunity.brief_content_hash,
      'actor_kind', 'proposal_integration',
      'previous_event_hash', v_previous_event_hash,
      'occurred_at', v_occurred_at
    )::text
  );

  INSERT INTO co_production.opportunity_lifecycle_events (
    id,
    team_id,
    opportunity_id,
    event_sequence,
    event_type,
    from_stage,
    to_stage,
    from_authority_version,
    to_authority_version,
    project_id,
    proposal_handoff_receipt_id,
    brief_revision_id,
    brief_content_hash,
    actor_kind,
    previous_event_hash,
    event_hash,
    occurred_at
  )
  VALUES (
    v_event_id,
    NEW.team_id,
    v_opportunity_id,
    v_event_sequence,
    'accepted_proposal_activated',
    v_from_stage,
    'won',
    v_from_version,
    v_to_version,
    NEW.project_id,
    NEW.id,
    v_brief_id,
    v_opportunity.brief_content_hash,
    'proposal_integration',
    v_previous_event_hash,
    v_event_hash,
    v_occurred_at
  );

  RETURN NEW;
END
$$;

CREATE TRIGGER proposal_handoff_link_preproject_origin
AFTER INSERT ON co_production.proposal_handoff_receipts
FOR EACH ROW
EXECUTE FUNCTION co_production_private.link_preproject_origin_on_handoff();

CREATE OR REPLACE VIEW co_production.project_operating_sources
WITH (security_barrier = true, security_invoker = true)
AS
SELECT
  receipt.id AS receipt_id,
  receipt.team_id,
  receipt.project_id,
  receipt.display_number,
  receipt.package_id,
  receipt.package_version,
  receipt.proposal_version_id,
  receipt.quote_version_id,
  receipt.created_at AS activated_at,
  receipt.project_seed #>> '{productionWindow,startDate}' AS production_start_date,
  receipt.project_seed #>> '{productionWindow,dueDate}' AS production_due_date,
  CASE
    WHEN pg_catalog.jsonb_typeof(
      receipt.project_seed #> '{productionWindow,constraints}'
    ) = 'array'
      THEN receipt.project_seed #> '{productionWindow,constraints}'
    ELSE '[]'::jsonb
  END AS production_constraints,
  COALESCE(origin.account_id::text, receipt.production_seed ->> 'clientId')
    AS client_id,
  COALESCE(origin.opportunity_id::text, receipt.production_seed ->> 'opportunityId')
    AS opportunity_id,
  COALESCE(origin.brief_revision_id::text, receipt.production_seed ->> 'briefId')
    AS brief_id,
  CASE
    WHEN pg_catalog.jsonb_typeof(receipt.production_seed -> 'scopeItemIds') = 'array'
      THEN receipt.production_seed -> 'scopeItemIds'
    ELSE '[]'::jsonb
  END AS scope_item_ids,
  CASE
    WHEN pg_catalog.jsonb_typeof(receipt.production_seed -> 'deliverables') = 'array'
      THEN receipt.production_seed -> 'deliverables'
    ELSE '[]'::jsonb
  END AS deliverables,
  CASE
    WHEN pg_catalog.jsonb_typeof(receipt.production_seed -> 'productionModules') = 'array'
      THEN receipt.production_seed -> 'productionModules'
    ELSE '[]'::jsonb
  END AS production_modules,
  origin.project_id IS NOT NULL AS preproject_origin_linked,
  origin.inquiry_id::text AS source_inquiry_id,
  origin.primary_contact_id::text AS primary_contact_id,
  origin.brief_content_hash AS canonical_brief_content_hash,
  origin.opportunity_authority_version,
  origin.link_hash AS preproject_origin_link_hash
FROM co_production.proposal_handoff_receipts AS receipt
LEFT JOIN co_production.project_preproject_origins AS origin
  ON origin.proposal_handoff_receipt_id = receipt.id
  AND origin.team_id = receipt.team_id
WHERE co_production_private.has_project_role(receipt.project_id, 10);

REVOKE ALL ON TABLE co_production.project_preproject_origins
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.opportunity_lifecycle_events
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.project_operating_sources
  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE co_production.project_preproject_origins TO authenticated;
GRANT SELECT ON TABLE co_production.opportunity_lifecycle_events TO authenticated;
GRANT SELECT ON TABLE co_production.project_operating_sources TO authenticated;

REVOKE ALL ON FUNCTION co_production_private.link_preproject_origin_on_handoff()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE INDEX project_preproject_origins_team_idx
  ON co_production.project_preproject_origins(team_id, linked_at DESC);
CREATE INDEX opportunity_lifecycle_events_team_idx
  ON co_production.opportunity_lifecycle_events(team_id, occurred_at DESC);

COMMIT;
