-- Co-VideoPro — Migration: production entities (El Paso doctrine, Part 7 spec)
-- production_days, crew_members, locations, releases, call_sheets.
-- Includes GRANTs from the start (M1 lesson: tables without them 500 in prod).
-- Writes are service-role-only by design; authenticated users get SELECT via RLS.

BEGIN;

CREATE TABLE IF NOT EXISTS co_production.production_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES co_production.projects(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  date date NOT NULL,
  call time,
  wrap time,
  type text NOT NULL DEFAULT 'principal' CHECK (type IN ('scout','principal','contingency')),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','in_progress','wrapped','cancelled')),
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS co_production.crew_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES co_production.projects(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 240),
  role text NOT NULL DEFAULT '',
  rate_basis text NOT NULL DEFAULT 'day' CHECK (rate_basis IN ('day','half_day','flat','hourly')),
  days numeric NOT NULL DEFAULT 1 CHECK (days >= 0),
  contact text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS co_production.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES co_production.projects(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 240),
  address text,
  contact text,
  access_window text,
  cleared_to_film text[] NOT NULL DEFAULT '{}',
  restricted text[] NOT NULL DEFAULT '{}',
  agreement_status text NOT NULL DEFAULT 'none' CHECK (agreement_status IN ('none','drafted','sent','signed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS co_production.releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES co_production.projects(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  person_name text NOT NULL CHECK (length(btrim(person_name)) BETWEEN 1 AND 240),
  type text NOT NULL CHECK (type IN ('appearance','location')),
  status text NOT NULL DEFAULT 'unsent' CHECK (status IN ('unsent','sent','signed')),
  signed_at timestamptz,
  file_url text,
  language text NOT NULL DEFAULT 'en',
  production_day_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS co_production.call_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES co_production.projects(id) ON DELETE CASCADE,
  production_day_id uuid NOT NULL REFERENCES co_production.production_days(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  version int NOT NULL DEFAULT 1 CHECK (version >= 1),
  generated_at timestamptz NOT NULL DEFAULT now(),
  pdf_url text,
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (production_day_id, version)
);

CREATE INDEX IF NOT EXISTS idx_production_days_project ON co_production.production_days(project_id, date);
CREATE INDEX IF NOT EXISTS idx_crew_members_project ON co_production.crew_members(project_id);
CREATE INDEX IF NOT EXISTS idx_locations_project ON co_production.locations(project_id);
CREATE INDEX IF NOT EXISTS idx_releases_project ON co_production.releases(project_id, status);
CREATE INDEX IF NOT EXISTS idx_call_sheets_day ON co_production.call_sheets(production_day_id, version);

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['production_days','crew_members','locations','releases','call_sheets'] LOOP
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
