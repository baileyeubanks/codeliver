-- Read-only, production-safe context for the Co-VideoPro project operating record.
--
-- Commercial totals, payments, client acceptance actors, receiver secrets, and
-- source artifact hashes remain outside this projection. Project RLS remains
-- authoritative through security_invoker and has_project_role.

BEGIN;

CREATE VIEW co_production.project_operating_sources
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
    WHEN jsonb_typeof(receipt.project_seed #> '{productionWindow,constraints}') = 'array'
      THEN receipt.project_seed #> '{productionWindow,constraints}'
    ELSE '[]'::jsonb
  END AS production_constraints,
  receipt.production_seed ->> 'clientId' AS client_id,
  receipt.production_seed ->> 'opportunityId' AS opportunity_id,
  receipt.production_seed ->> 'briefId' AS brief_id,
  CASE
    WHEN jsonb_typeof(receipt.production_seed -> 'scopeItemIds') = 'array'
      THEN receipt.production_seed -> 'scopeItemIds'
    ELSE '[]'::jsonb
  END AS scope_item_ids,
  CASE
    WHEN jsonb_typeof(receipt.production_seed -> 'deliverables') = 'array'
      THEN receipt.production_seed -> 'deliverables'
    ELSE '[]'::jsonb
  END AS deliverables,
  CASE
    WHEN jsonb_typeof(receipt.production_seed -> 'productionModules') = 'array'
      THEN receipt.production_seed -> 'productionModules'
    ELSE '[]'::jsonb
  END AS production_modules
FROM co_production.proposal_handoff_receipts AS receipt
WHERE co_production_private.has_project_role(receipt.project_id, 10);

REVOKE ALL ON TABLE co_production.project_operating_sources
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE co_production.project_operating_sources
TO authenticated;

COMMIT;
