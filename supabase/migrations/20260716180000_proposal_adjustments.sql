-- Co-VideoPro — Migration: proposal adjustments (discount % / tax % on the money record)

BEGIN;

ALTER TABLE co_production.proposals
  ADD COLUMN IF NOT EXISTS discount_pct numeric NOT NULL DEFAULT 0 CHECK (discount_pct >= 0),
  ADD COLUMN IF NOT EXISTS tax_pct numeric NOT NULL DEFAULT 0 CHECK (tax_pct >= 0);

COMMIT;
