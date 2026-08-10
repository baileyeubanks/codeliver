-- Co-VideoPro — Migration: Locked Delivery (promise 6.4)
-- Turns co_production.deliverables into the canonical final-delivery lock
-- record: a delivered row must carry locked_at/locked_by plus the approval
-- evidence (approval_id), and its version set lives in
-- co_production.deliverable_items with checksums. Once locked, the item set
-- is immutable.
-- Conventions follow 20260716120000_project_operating_record.sql:
-- co_production schema, gen_random_uuid(), RLS enabled + forced, owner-scoped
-- SELECT policy, service-role-only writes through the API routes.

BEGIN;

ALTER TABLE co_production.deliverables
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approval_id uuid;

-- 'delivered' is only reachable through the lock command, which stamps
-- locked_at/locked_by/delivered_at in one write.
ALTER TABLE co_production.deliverables
  ADD CONSTRAINT deliverables_delivered_requires_lock
  CHECK (status <> 'delivered' OR locked_at IS NOT NULL);

CREATE TABLE IF NOT EXISTS co_production.deliverable_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deliverable_id uuid NOT NULL REFERENCES co_production.deliverables(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL,
  version_id uuid NOT NULL,
  sha256 text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deliverable_id, version_id)
);

CREATE INDEX IF NOT EXISTS idx_deliverable_items_asset
  ON co_production.deliverable_items(asset_id);
CREATE INDEX IF NOT EXISTS idx_deliverable_items_version
  ON co_production.deliverable_items(version_id);

-- A locked delivery's version set is immutable: no INSERT, UPDATE, or DELETE
-- on its items once locked_at is stamped.
CREATE OR REPLACE FUNCTION co_production.reject_locked_deliverable_item_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_id uuid := COALESCE(NEW.deliverable_id, OLD.deliverable_id);
BEGIN
  IF EXISTS (
    SELECT 1 FROM co_production.deliverables d
    WHERE d.id = parent_id AND d.locked_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'deliverable % is locked; its version set is immutable', parent_id
      USING ERRCODE = '23514';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS deliverable_items_locked_guard ON co_production.deliverable_items;
CREATE TRIGGER deliverable_items_locked_guard
  BEFORE INSERT OR UPDATE OR DELETE ON co_production.deliverable_items
  FOR EACH ROW EXECUTE FUNCTION co_production.reject_locked_deliverable_item_mutation();

-- RLS: owner-scoped reads through the parent deliverable's project; writes go
-- through the service role.
ALTER TABLE co_production.deliverable_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.deliverable_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deliverable_items_select_owner ON co_production.deliverable_items;
CREATE POLICY deliverable_items_select_owner ON co_production.deliverable_items
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM co_production.deliverables d
    JOIN co_production.projects p ON p.id = d.project_id
    WHERE d.id = deliverable_items.deliverable_id AND p.owner_id = auth.uid()
  ));

-- Privileges (mirrors 20260716120000_project_operating_record.sql): the
-- service role owns all writes; authenticated reads through the owner-scoped
-- SELECT policy above. deliverables itself was granted in the operating
-- record migration; the new columns inherit those grants.
GRANT ALL ON TABLE co_production.deliverable_items TO service_role;
GRANT SELECT ON TABLE co_production.deliverable_items TO authenticated;

COMMIT;
