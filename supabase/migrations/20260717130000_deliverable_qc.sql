-- Co-VideoPro — Migration: deliverable QC gates (T12)
-- qc_checks: passed gate ids on the deliverable; QC is a gate, not a suggestion.

BEGIN;

ALTER TABLE co_production.deliverables
  ADD COLUMN IF NOT EXISTS qc_checks jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMIT;
