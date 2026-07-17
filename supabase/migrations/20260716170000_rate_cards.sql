-- Co-VideoPro — Migration: versioned rate cards (Line Producer pricing authority)

BEGIN;

CREATE TABLE IF NOT EXISTS co_production.rate_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 240),
  version int NOT NULL DEFAULT 1 CHECK (version >= 1),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS co_production.rate_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_card_id uuid NOT NULL REFERENCES co_production.rate_cards(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  code text NOT NULL CHECK (code ~ '^[a-z0-9-]+$'),
  category text NOT NULL CHECK (category IN ('crew','equipment','travel','post','deliverable','other')),
  description text NOT NULL DEFAULT '',
  unit text NOT NULL CHECK (unit IN ('day','half_day','hour','flat','each')),
  unit_rate_cents bigint NOT NULL CHECK (unit_rate_cents >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rate_card_id, code)
);

CREATE INDEX IF NOT EXISTS idx_rate_items_card ON co_production.rate_items(rate_card_id, active);

ALTER TABLE co_production.rate_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.rate_cards FORCE ROW LEVEL SECURITY;
GRANT ALL ON co_production.rate_cards TO service_role;
GRANT SELECT ON co_production.rate_cards TO authenticated;
CREATE POLICY rate_cards_select_owner ON co_production.rate_cards FOR SELECT TO authenticated USING (owner_id = auth.uid());

ALTER TABLE co_production.rate_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.rate_items FORCE ROW LEVEL SECURITY;
GRANT ALL ON co_production.rate_items TO service_role;
GRANT SELECT ON co_production.rate_items TO authenticated;
CREATE POLICY rate_items_select_owner ON co_production.rate_items FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM co_production.rate_cards c WHERE c.id = rate_items.rate_card_id AND c.owner_id = auth.uid()
));

COMMIT;
