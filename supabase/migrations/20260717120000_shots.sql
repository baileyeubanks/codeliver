-- Co-VideoPro — Migration: shot list (T5)
-- shots: one row per shot-list line, owned by a production day.
-- GRANTs from the start (M1 lesson); writes service-role-only, SELECT via RLS.

BEGIN;

CREATE TABLE IF NOT EXISTS co_production.shots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES co_production.projects(id) ON DELETE CASCADE,
  production_day_id uuid NOT NULL REFERENCES co_production.production_days(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  scene text NOT NULL DEFAULT '',
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 500),
  size text NOT NULL DEFAULT 'other' CHECK (size IN ('wide','medium','close','insert','aerial','other')),
  priority text NOT NULL DEFAULT 'nice' CHECK (priority IN ('must','nice')),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','covered','dropped')),
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shots_day ON co_production.shots(production_day_id, status);
CREATE INDEX IF NOT EXISTS idx_shots_project ON co_production.shots(project_id);

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['shots'] LOOP
    EXECUTE format('ALTER TABLE co_production.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE co_production.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT ALL ON co_production.%I TO service_role', t);
    EXECUTE format('GRANT SELECT ON co_production.%I TO authenticated', t);
    EXECUTE format(
      'CREATE POLICY %I ON co_production.%I FOR SELECT TO authenticated USING (EXISTS (
         SELECT 1 FROM co_production.projects p
         WHERE p.id = %I.project_id AND p.owner_id = auth.uid()
       ))',
      t || '_select_owner', t, t
    );
  END LOOP;
END $$;

COMMIT;
