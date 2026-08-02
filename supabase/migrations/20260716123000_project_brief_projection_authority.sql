-- Materialize the authorized, production-safe creative brief as immutable
-- project authority. Existing and unlinked projects are intentionally not
-- backfilled: only a new activation authorization receipt can create revision 1.

BEGIN;

DO $project_brief_projection_preflight$
BEGIN
  IF pg_catalog.to_regclass('co_production.creative_brief_revisions') IS NULL
    OR pg_catalog.to_regclass(
      'co_production.opportunity_proposal_request_receipts'
    ) IS NULL
    OR pg_catalog.to_regclass('co_production.proposal_handoff_receipts') IS NULL
    OR pg_catalog.to_regclass(
      'co_production.proposal_activation_authorization_receipts'
    ) IS NULL
    OR pg_catalog.to_regclass('co_production.project_preproject_origins') IS NULL
    OR pg_catalog.to_regclass(
      'co_production.project_preproduction_authorities'
    ) IS NULL
    OR pg_catalog.to_regclass('co_production.project_operating_sources') IS NULL
    OR pg_catalog.to_regprocedure(
      'co_production_private.preproject_safe_text(text,integer,integer)'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'co_production_private.preproject_text_array_is_valid(jsonb,integer,integer,integer,boolean)'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'co_production_private.preproject_exact_json_keys(jsonb,text[])'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'co_production_private.preproject_sha256(text)'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'co_production_private.prevent_preproject_immutable_mutation()'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'co_production_private.has_project_role(uuid,integer)'
    ) IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_brief_projection_requires_authorized_preproduction_chain';
  END IF;
END
$project_brief_projection_preflight$;

CREATE OR REPLACE FUNCTION co_production_private.project_brief_content_is_valid(
  p_title text,
  p_objectives text[],
  p_audiences text[],
  p_key_messages text[],
  p_requested_deliverables text[],
  p_constraints text[],
  p_references text[],
  p_success_criteria text[],
  p_content jsonb,
  p_content_hash text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT co_production_private.preproject_safe_text(p_title, 1, 240)
    AND co_production_private.preproject_text_array_is_valid(
      pg_catalog.to_jsonb(p_objectives), 1, 20, 1000
    )
    AND co_production_private.preproject_text_array_is_valid(
      pg_catalog.to_jsonb(p_audiences), 0, 20, 500
    )
    AND co_production_private.preproject_text_array_is_valid(
      pg_catalog.to_jsonb(p_key_messages), 0, 20, 1000
    )
    AND co_production_private.preproject_text_array_is_valid(
      pg_catalog.to_jsonb(p_requested_deliverables), 0, 32, 500
    )
    AND co_production_private.preproject_text_array_is_valid(
      pg_catalog.to_jsonb(p_constraints), 0, 24, 1000
    )
    AND co_production_private.preproject_text_array_is_valid(
      pg_catalog.to_jsonb(p_references), 0, 12, 2048, true
    )
    AND co_production_private.preproject_text_array_is_valid(
      pg_catalog.to_jsonb(p_success_criteria), 0, 20, 1000
    )
    AND pg_catalog.jsonb_typeof(p_content) = 'object'
    AND pg_catalog.pg_column_size(p_content) <= 65536
    AND co_production_private.preproject_exact_json_keys(
      p_content,
      ARRAY[
        'title', 'objectives', 'audiences', 'keyMessages',
        'requestedDeliverables', 'constraints', 'references', 'successCriteria'
      ]
    )
    AND p_content = pg_catalog.jsonb_build_object(
      'title', p_title,
      'objectives', pg_catalog.to_jsonb(p_objectives),
      'audiences', pg_catalog.to_jsonb(p_audiences),
      'keyMessages', pg_catalog.to_jsonb(p_key_messages),
      'requestedDeliverables', pg_catalog.to_jsonb(p_requested_deliverables),
      'constraints', pg_catalog.to_jsonb(p_constraints),
      'references', pg_catalog.to_jsonb(p_references),
      'successCriteria', pg_catalog.to_jsonb(p_success_criteria)
    )
    AND p_content_hash ~ '^sha256:[0-9a-f]{64}$'
    AND p_content_hash
      = co_production_private.preproject_sha256(p_content::text)
$$;

CREATE TABLE co_production.project_brief_revisions (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  project_id uuid NOT NULL,
  team_id uuid NOT NULL,
  revision_number integer NOT NULL DEFAULT 1 CHECK (revision_number = 1),
  opportunity_id uuid NOT NULL,
  source_brief_revision_id uuid NOT NULL,
  source_brief_revision_number integer NOT NULL CHECK (
    source_brief_revision_number >= 1
  ),
  proposal_request_receipt_id uuid NOT NULL,
  proposal_request_authority_version bigint NOT NULL CHECK (
    proposal_request_authority_version BETWEEN 1 AND 2147483647
  ),
  proposal_handoff_receipt_id uuid NOT NULL,
  proposal_activation_authorization_receipt_id uuid NOT NULL,
  title text NOT NULL,
  objectives text[] NOT NULL,
  audiences text[] NOT NULL,
  key_messages text[] NOT NULL,
  requested_deliverables text[] NOT NULL,
  constraints text[] NOT NULL,
  "references" text[] NOT NULL,
  success_criteria text[] NOT NULL,
  content jsonb NOT NULL,
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT project_brief_revisions_content_check CHECK (
    co_production_private.project_brief_content_is_valid(
      title,
      objectives,
      audiences,
      key_messages,
      requested_deliverables,
      constraints,
      "references",
      success_criteria,
      content,
      content_hash
    )
  ),
  CONSTRAINT project_brief_revisions_id_project_team_key
    UNIQUE (id, project_id, team_id),
  CONSTRAINT project_brief_revisions_project_revision_key
    UNIQUE (project_id, revision_number),
  CONSTRAINT project_brief_revisions_request_key
    UNIQUE (proposal_request_receipt_id),
  CONSTRAINT project_brief_revisions_handoff_key
    UNIQUE (proposal_handoff_receipt_id),
  CONSTRAINT project_brief_revisions_authorization_key
    UNIQUE (proposal_activation_authorization_receipt_id),
  CONSTRAINT project_brief_revisions_project_team_fk
    FOREIGN KEY (project_id, team_id)
    REFERENCES co_production.projects(id, team_id)
    ON DELETE RESTRICT,
  CONSTRAINT project_brief_revisions_source_brief_fk
    FOREIGN KEY (source_brief_revision_id, team_id, opportunity_id)
    REFERENCES co_production.creative_brief_revisions(
      id,
      team_id,
      opportunity_id
    )
    ON DELETE RESTRICT,
  CONSTRAINT project_brief_revisions_proposal_request_fk
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
  CONSTRAINT project_brief_revisions_handoff_fk
    FOREIGN KEY (proposal_handoff_receipt_id, team_id, project_id)
    REFERENCES co_production.proposal_handoff_receipts(id, team_id, project_id)
    ON DELETE RESTRICT,
  CONSTRAINT project_brief_revisions_activation_authorization_fk
    FOREIGN KEY (
      proposal_activation_authorization_receipt_id,
      team_id,
      project_id
    )
    REFERENCES co_production.proposal_activation_authorization_receipts(
      id,
      team_id,
      project_id
    )
    ON DELETE RESTRICT
);

ALTER TABLE co_production.project_brief_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.project_brief_revisions FORCE ROW LEVEL SECURITY;

CREATE POLICY project_brief_revisions_internal_select
  ON co_production.project_brief_revisions
  FOR SELECT TO authenticated
  USING (co_production_private.has_project_role(project_id, 50));

CREATE TRIGGER project_brief_revisions_immutable
BEFORE UPDATE OR DELETE ON co_production.project_brief_revisions
FOR EACH ROW
EXECUTE FUNCTION co_production_private.prevent_preproject_immutable_mutation();

CREATE TRIGGER project_brief_revisions_no_truncate
BEFORE TRUNCATE ON co_production.project_brief_revisions
FOR EACH STATEMENT
EXECUTE FUNCTION co_production_private.prevent_preproject_immutable_mutation();

CREATE OR REPLACE FUNCTION
  co_production_private.project_brief_from_activation_authorization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_source_brief co_production.creative_brief_revisions%ROWTYPE;
  v_existing co_production.project_brief_revisions%ROWTYPE;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'cco:project-brief-projection:' || NEW.project_id::text,
      0
    )
  );

  SELECT brief.*
  INTO v_source_brief
  FROM co_production.creative_brief_revisions AS brief
  JOIN co_production.opportunity_proposal_request_receipts AS request_receipt
    ON request_receipt.id = NEW.proposal_request_receipt_id
    AND request_receipt.team_id = NEW.team_id
    AND request_receipt.opportunity_id = NEW.opportunity_id
    AND request_receipt.resulting_authority_version
      = NEW.proposal_request_authority_version
    AND request_receipt.ready_brief_revision_id = brief.id
    AND request_receipt.ready_brief_revision_number = brief.revision_number
    AND request_receipt.ready_brief_content_hash = brief.content_hash
  JOIN co_production.proposal_handoff_receipts AS handoff_receipt
    ON handoff_receipt.id = NEW.proposal_handoff_receipt_id
    AND handoff_receipt.team_id = NEW.team_id
    AND handoff_receipt.project_id = NEW.project_id
  JOIN co_production.project_preproject_origins AS project_origin
    ON project_origin.project_id = NEW.project_id
    AND project_origin.team_id = NEW.team_id
    AND project_origin.proposal_handoff_receipt_id
      = NEW.proposal_handoff_receipt_id
    AND project_origin.opportunity_id = NEW.opportunity_id
    AND project_origin.brief_revision_id = brief.id
    AND project_origin.brief_revision_number = brief.revision_number
    AND project_origin.brief_content_hash = brief.content_hash
  WHERE brief.id = NEW.ready_brief_revision_id
    AND brief.team_id = NEW.team_id
    AND brief.opportunity_id = NEW.opportunity_id
    AND brief.revision_number = NEW.ready_brief_revision_number
    AND brief.content_hash = NEW.ready_brief_content_hash
    AND brief.status = 'ready_for_proposal';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'project_brief_projection_binding_mismatch';
  END IF;

  IF NOT co_production_private.project_brief_content_is_valid(
    v_source_brief.title,
    v_source_brief.objectives,
    v_source_brief.audiences,
    v_source_brief.key_messages,
    v_source_brief.requested_deliverables,
    v_source_brief.constraints,
    v_source_brief."references",
    v_source_brief.success_criteria,
    v_source_brief.content,
    v_source_brief.content_hash
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'project_brief_projection_content_mismatch';
  END IF;

  SELECT projection.*
  INTO v_existing
  FROM co_production.project_brief_revisions AS projection
  WHERE projection.project_id = NEW.project_id
    OR projection.proposal_request_receipt_id
      = NEW.proposal_request_receipt_id
    OR projection.proposal_handoff_receipt_id
      = NEW.proposal_handoff_receipt_id
    OR projection.proposal_activation_authorization_receipt_id = NEW.id
  ORDER BY projection.id
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF EXISTS (
      SELECT 1
      FROM co_production.project_brief_revisions AS conflicting_projection
      WHERE (
        conflicting_projection.project_id = NEW.project_id
        OR conflicting_projection.proposal_request_receipt_id
          = NEW.proposal_request_receipt_id
        OR conflicting_projection.proposal_handoff_receipt_id
          = NEW.proposal_handoff_receipt_id
        OR conflicting_projection.proposal_activation_authorization_receipt_id
          = NEW.id
      )
        AND conflicting_projection.id <> v_existing.id
    )
      OR v_existing.project_id IS DISTINCT FROM NEW.project_id
      OR v_existing.team_id IS DISTINCT FROM NEW.team_id
      OR v_existing.revision_number IS DISTINCT FROM 1
      OR v_existing.opportunity_id IS DISTINCT FROM NEW.opportunity_id
      OR v_existing.source_brief_revision_id
        IS DISTINCT FROM v_source_brief.id
      OR v_existing.source_brief_revision_number
        IS DISTINCT FROM v_source_brief.revision_number
      OR v_existing.proposal_request_receipt_id
        IS DISTINCT FROM NEW.proposal_request_receipt_id
      OR v_existing.proposal_request_authority_version
        IS DISTINCT FROM NEW.proposal_request_authority_version
      OR v_existing.proposal_handoff_receipt_id
        IS DISTINCT FROM NEW.proposal_handoff_receipt_id
      OR v_existing.proposal_activation_authorization_receipt_id
        IS DISTINCT FROM NEW.id
      OR v_existing.title IS DISTINCT FROM v_source_brief.title
      OR v_existing.objectives IS DISTINCT FROM v_source_brief.objectives
      OR v_existing.audiences IS DISTINCT FROM v_source_brief.audiences
      OR v_existing.key_messages IS DISTINCT FROM v_source_brief.key_messages
      OR v_existing.requested_deliverables
        IS DISTINCT FROM v_source_brief.requested_deliverables
      OR v_existing.constraints IS DISTINCT FROM v_source_brief.constraints
      OR v_existing."references" IS DISTINCT FROM v_source_brief."references"
      OR v_existing.success_criteria
        IS DISTINCT FROM v_source_brief.success_criteria
      OR v_existing.content IS DISTINCT FROM v_source_brief.content
      OR v_existing.content_hash IS DISTINCT FROM v_source_brief.content_hash
      OR v_existing.created_at IS DISTINCT FROM NEW.created_at
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'project_brief_projection_conflict';
    END IF;

    RETURN NEW;
  END IF;

  INSERT INTO co_production.project_brief_revisions (
    id,
    project_id,
    team_id,
    revision_number,
    opportunity_id,
    source_brief_revision_id,
    source_brief_revision_number,
    proposal_request_receipt_id,
    proposal_request_authority_version,
    proposal_handoff_receipt_id,
    proposal_activation_authorization_receipt_id,
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
    created_at
  )
  VALUES (
    pg_catalog.gen_random_uuid(),
    NEW.project_id,
    NEW.team_id,
    1,
    NEW.opportunity_id,
    v_source_brief.id,
    v_source_brief.revision_number,
    NEW.proposal_request_receipt_id,
    NEW.proposal_request_authority_version,
    NEW.proposal_handoff_receipt_id,
    NEW.id,
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
    NEW.created_at
  );

  RETURN NEW;
END
$$;

CREATE TRIGGER proposal_activation_authorization_project_brief
AFTER INSERT ON co_production.proposal_activation_authorization_receipts
FOR EACH ROW
EXECUTE FUNCTION
  co_production_private.project_brief_from_activation_authorization();

-- security_invoker views require the caller to hold privileges on every source
-- column. Keep raw project_seed and production_seed ungranted, and expose only
-- the established production-safe fields through this project-role-checked API.
CREATE OR REPLACE FUNCTION
  co_production_private.project_operating_source_safe_payload(
    p_receipt_id uuid,
    p_project_id uuid
  )
RETURNS TABLE (
  production_start_date text,
  production_due_date text,
  production_constraints jsonb,
  client_id text,
  opportunity_id text,
  brief_id text,
  scope_item_ids jsonb,
  deliverables jsonb,
  production_modules jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
ROWS 1
SET search_path = ''
AS $$
  SELECT
    receipt.project_seed #>> '{productionWindow,startDate}',
    receipt.project_seed #>> '{productionWindow,dueDate}',
    CASE
      WHEN pg_catalog.jsonb_typeof(
        receipt.project_seed #> '{productionWindow,constraints}'
      ) = 'array'
        THEN receipt.project_seed #> '{productionWindow,constraints}'
      ELSE '[]'::jsonb
    END,
    receipt.production_seed ->> 'clientId',
    receipt.production_seed ->> 'opportunityId',
    receipt.production_seed ->> 'briefId',
    CASE
      WHEN pg_catalog.jsonb_typeof(receipt.production_seed -> 'scopeItemIds')
        = 'array'
        THEN receipt.production_seed -> 'scopeItemIds'
      ELSE '[]'::jsonb
    END,
    CASE
      WHEN pg_catalog.jsonb_typeof(receipt.production_seed -> 'deliverables')
        = 'array'
        THEN receipt.production_seed -> 'deliverables'
      ELSE '[]'::jsonb
    END,
    CASE
      WHEN pg_catalog.jsonb_typeof(receipt.production_seed -> 'productionModules')
        = 'array'
        THEN receipt.production_seed -> 'productionModules'
      ELSE '[]'::jsonb
    END
  FROM co_production.proposal_handoff_receipts AS receipt
  WHERE receipt.id = p_receipt_id
    AND receipt.project_id = p_project_id
    AND co_production_private.has_project_role(receipt.project_id, 10)
$$;

-- Preserve every origin-aware operating-source column in place. The appended
-- brief columns stay NULL for rank-10 reviewers/viewers because the LEFT JOIN
-- admits project brief rows only at the internal-contributor rank of 50.
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
  safe_payload.production_start_date,
  safe_payload.production_due_date,
  safe_payload.production_constraints,
  COALESCE(origin.account_id::text, safe_payload.client_id) AS client_id,
  COALESCE(origin.opportunity_id::text, safe_payload.opportunity_id)
    AS opportunity_id,
  COALESCE(origin.brief_revision_id::text, safe_payload.brief_id) AS brief_id,
  safe_payload.scope_item_ids,
  safe_payload.deliverables,
  safe_payload.production_modules,
  origin.project_id IS NOT NULL AS preproject_origin_linked,
  origin.inquiry_id::text AS source_inquiry_id,
  origin.primary_contact_id::text AS primary_contact_id,
  origin.brief_content_hash AS canonical_brief_content_hash,
  origin.opportunity_authority_version,
  origin.link_hash AS preproject_origin_link_hash,
  project_brief.id AS project_brief_revision_id,
  project_brief.revision_number AS project_brief_revision_number,
  project_brief.source_brief_revision_id AS source_creative_brief_revision_id,
  project_brief.title AS project_brief_title,
  project_brief.objectives AS project_brief_objectives,
  project_brief.audiences AS project_brief_audiences,
  project_brief.key_messages AS project_brief_key_messages,
  project_brief.requested_deliverables
    AS project_brief_requested_deliverables,
  project_brief.constraints AS project_brief_constraints,
  project_brief."references" AS project_brief_references,
  project_brief.success_criteria AS project_brief_success_criteria,
  project_brief.content AS project_brief_content,
  project_brief.content_hash AS project_brief_content_hash,
  project_brief.created_at AS project_brief_created_at,
  project_brief.proposal_request_receipt_id
    AS source_proposal_request_receipt_id,
  project_brief.proposal_activation_authorization_receipt_id
    AS source_activation_authorization_receipt_id
FROM co_production.proposal_handoff_receipts AS receipt
LEFT JOIN LATERAL co_production_private.project_operating_source_safe_payload(
  receipt.id,
  receipt.project_id
) AS safe_payload ON true
LEFT JOIN co_production.project_preproject_origins AS origin
  ON origin.proposal_handoff_receipt_id = receipt.id
  AND origin.team_id = receipt.team_id
LEFT JOIN co_production.project_brief_revisions AS project_brief
  ON project_brief.project_id = receipt.project_id
  AND project_brief.team_id = receipt.team_id
  AND project_brief.proposal_handoff_receipt_id = receipt.id
  AND co_production_private.has_project_role(project_brief.project_id, 50)
WHERE co_production_private.has_project_role(receipt.project_id, 10);

REVOKE ALL ON TABLE co_production.project_brief_revisions
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE co_production.project_operating_sources
  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE co_production.project_brief_revisions TO authenticated;
GRANT SELECT ON TABLE co_production.project_operating_sources TO authenticated;

REVOKE ALL ON FUNCTION
  co_production_private.project_operating_source_safe_payload(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  co_production_private.project_operating_source_safe_payload(uuid, uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION
  co_production_private.project_brief_content_is_valid(
    text,
    text[],
    text[],
    text[],
    text[],
    text[],
    text[],
    text[],
    jsonb,
    text
  )
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION
  co_production_private.project_brief_from_activation_authorization()
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
