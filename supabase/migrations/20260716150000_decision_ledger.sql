-- Co-VideoPro — Migration: decision ledger columns

BEGIN;

ALTER TABLE co_production.decisions
  ADD COLUMN IF NOT EXISTS supersedes_id uuid REFERENCES co_production.decisions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS implementation_status text NOT NULL DEFAULT 'pending' CHECK (
    implementation_status IN ('pending','in_progress','done','wont_do')
  );

CREATE INDEX IF NOT EXISTS idx_decisions_implementation ON co_production.decisions(project_id, implementation_status);

COMMIT;
