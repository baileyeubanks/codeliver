-- Co-VideoPro — Migration: Project Operating Record
-- Adds the lifecycle entities defined in docs/COVIDEOPRO_PRODUCT_MODEL.md.
-- Conventions follow 20260715093300_fail_closed_co_production_authority.sql:
-- co_production schema, gen_random_uuid(), text+CHECK status columns whose
-- allowed values mirror lib/covideopro/transitions.ts, RLS enabled everywhere.
--
-- Writes to every table created here are service-role-only by design: all
-- mutations flow through the API routes (service client, which bypasses RLS),
-- while the authenticated role receives SELECT-only grants guarded by the
-- owner-scoped policies below. FORCE ROW LEVEL SECURITY keeps those policies
-- binding even for the table owner.

BEGIN;

-- Projects gain the lifecycle stage spine.
ALTER TABLE co_production.projects
  ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'post' CHECK (
    stage IN ('inquiry','intake','development','preproduction','production','post','review','delivery','archived')
  ),
  ADD COLUMN IF NOT EXISTS organization_id uuid,
  ADD COLUMN IF NOT EXISTS primary_contact_id uuid;

-- Workspace-scoped CRM
CREATE TABLE IF NOT EXISTS co_production.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 240),
  industry text,
  website text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS co_production.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES co_production.organizations(id) ON DELETE SET NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 240),
  email text NOT NULL CHECK (length(btrim(email)) BETWEEN 3 AND 320),
  role text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS co_production.inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  project_id uuid REFERENCES co_production.projects(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES co_production.organizations(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES co_production.contacts(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'direct',
  summary text NOT NULL DEFAULT '',
  received_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'new' CHECK (
    status IN ('new','triaged','qualified','converted','declined')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE co_production.projects DROP CONSTRAINT IF EXISTS projects_organization_fk;
ALTER TABLE co_production.projects DROP CONSTRAINT IF EXISTS projects_primary_contact_fk;
ALTER TABLE co_production.projects
  ADD CONSTRAINT projects_organization_fk
    FOREIGN KEY (organization_id) REFERENCES co_production.organizations(id) ON DELETE SET NULL,
  ADD CONSTRAINT projects_primary_contact_fk
    FOREIGN KEY (primary_contact_id) REFERENCES co_production.contacts(id) ON DELETE SET NULL;

-- Creative
CREATE TABLE IF NOT EXISTS co_production.briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES co_production.projects(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  version int NOT NULL DEFAULT 1 CHECK (version >= 1),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','approved','superseded')),
  objectives text NOT NULL DEFAULT '',
  audience text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  "references" jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof("references") = 'array'),
  deliverables_notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version)
);

CREATE TABLE IF NOT EXISTS co_production.brief_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id uuid NOT NULL REFERENCES co_production.briefs(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES co_production.projects(id) ON DELETE CASCADE,
  version int NOT NULL,
  status text NOT NULL,
  objectives text NOT NULL DEFAULT '',
  audience text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  "references" jsonb NOT NULL DEFAULT '[]'::jsonb,
  deliverables_notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brief_id, version)
);

-- Commercial
CREATE TABLE IF NOT EXISTS co_production.proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES co_production.projects(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  version int NOT NULL DEFAULT 1 CHECK (version >= 1),
  status text NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft','in_review','sent','approved','declined','superseded')
  ),
  title text NOT NULL DEFAULT '',
  narrative text NOT NULL DEFAULT '',
  estimate_lines jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(estimate_lines) = 'array'),
  valid_until date,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version)
);

CREATE TABLE IF NOT EXISTS co_production.proposal_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES co_production.proposals(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES co_production.projects(id) ON DELETE CASCADE,
  version int NOT NULL,
  status text NOT NULL,
  title text NOT NULL DEFAULT '',
  narrative text NOT NULL DEFAULT '',
  estimate_lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proposal_id, version)
);

-- Planning
CREATE TABLE IF NOT EXISTS co_production.plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES co_production.projects(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('milestone','task','production_day')),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 320),
  date date,
  assignee text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','done','blocked')),
  depends_on uuid[] NOT NULL DEFAULT '{}',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Media / Edit
CREATE TABLE IF NOT EXISTS co_production.selects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES co_production.projects(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES co_production.assets(id) ON DELETE CASCADE,
  version_id uuid REFERENCES co_production.versions(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  in_seconds double precision NOT NULL CHECK (in_seconds >= 0),
  out_seconds double precision NOT NULL,
  label text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('transcript','review','manual')),
  transcript_segment_ids text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (out_seconds > in_seconds)
);

CREATE TABLE IF NOT EXISTS co_production.sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES co_production.projects(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 240),
  version int NOT NULL DEFAULT 1 CHECK (version >= 1),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','approved','locked')),
  fps double precision NOT NULL DEFAULT 24 CHECK (fps > 0),
  created_from text NOT NULL DEFAULT 'manual' CHECK (created_from IN ('manual','transcript-assembly')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS co_production.sequence_clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES co_production.sequences(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES co_production.assets(id) ON DELETE RESTRICT,
  version_id uuid REFERENCES co_production.versions(id) ON DELETE SET NULL,
  select_id uuid REFERENCES co_production.selects(id) ON DELETE SET NULL,
  track_index int NOT NULL DEFAULT 0 CHECK (track_index >= 0),
  timeline_in_seconds double precision NOT NULL CHECK (timeline_in_seconds >= 0),
  timeline_out_seconds double precision NOT NULL,
  source_in_seconds double precision NOT NULL CHECK (source_in_seconds >= 0),
  source_out_seconds double precision NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (timeline_out_seconds > timeline_in_seconds),
  CHECK (source_out_seconds > source_in_seconds)
);

-- Review consolidation / Delivery
CREATE TABLE IF NOT EXISTS co_production.revision_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES co_production.projects(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES co_production.assets(id) ON DELETE CASCADE,
  version_id uuid REFERENCES co_production.versions(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  round int NOT NULL DEFAULT 1 CHECK (round >= 1),
  summary text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','addressed','verified')),
  comment_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS co_production.decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES co_production.projects(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  subject text NOT NULL CHECK (length(btrim(subject)) BETWEEN 1 AND 320),
  body text NOT NULL DEFAULT '',
  decided_by text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'meeting' CHECK (source IN ('review','comment','meeting','hermes')),
  comment_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS co_production.deliverables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES co_production.projects(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 240),
  spec jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_version_id uuid REFERENCES co_production.versions(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'specced' CHECK (
    status IN ('specced','encoding','qc','ready','delivered','expired')
  ),
  qc_notes text NOT NULL DEFAULT '',
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contacts_org ON co_production.contacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_owner_status ON co_production.inquiries(owner_id, status);
CREATE INDEX IF NOT EXISTS idx_briefs_project ON co_production.briefs(project_id);
CREATE INDEX IF NOT EXISTS idx_proposals_project ON co_production.proposals(project_id);
CREATE INDEX IF NOT EXISTS idx_plan_items_project ON co_production.plan_items(project_id, kind);
CREATE INDEX IF NOT EXISTS idx_selects_asset ON co_production.selects(asset_id);
CREATE INDEX IF NOT EXISTS idx_sequences_project ON co_production.sequences(project_id);
CREATE INDEX IF NOT EXISTS idx_sequence_clips_sequence ON co_production.sequence_clips(sequence_id, track_index, timeline_in_seconds);
CREATE INDEX IF NOT EXISTS idx_revision_requests_asset ON co_production.revision_requests(asset_id, round);
CREATE INDEX IF NOT EXISTS idx_decisions_project ON co_production.decisions(project_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_project ON co_production.deliverables(project_id, status);

-- RLS: enabled everywhere; project-scoped reads follow project ownership,
-- workspace-scoped reads follow the owner. Writes go through the service role.
DO $$
DECLARE
  project_scoped text[] := ARRAY[
    'briefs','brief_versions','proposals','proposal_versions','plan_items',
    'selects','sequences','revision_requests','decisions','deliverables'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY project_scoped LOOP
    EXECUTE format('ALTER TABLE co_production.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE co_production.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON co_production.%I FOR SELECT USING (EXISTS (
         SELECT 1 FROM co_production.projects p
         WHERE p.id = %I.project_id AND p.owner_id = auth.uid()
       ))',
      t || '_select_owner', t, t
    );
  END LOOP;
END $$;

ALTER TABLE co_production.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.organizations FORCE ROW LEVEL SECURITY;
CREATE POLICY organizations_select_owner ON co_production.organizations
  FOR SELECT USING (owner_id = auth.uid());

ALTER TABLE co_production.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.contacts FORCE ROW LEVEL SECURITY;
CREATE POLICY contacts_select_owner ON co_production.contacts
  FOR SELECT USING (owner_id = auth.uid());

ALTER TABLE co_production.inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.inquiries FORCE ROW LEVEL SECURITY;
CREATE POLICY inquiries_select_owner ON co_production.inquiries
  FOR SELECT USING (owner_id = auth.uid());

-- sequence_clips scope through their sequence rather than carrying project_id.
ALTER TABLE co_production.sequence_clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE co_production.sequence_clips FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sequence_clips_select_owner ON co_production.sequence_clips;
CREATE POLICY sequence_clips_select_owner ON co_production.sequence_clips FOR SELECT USING (EXISTS (
  SELECT 1 FROM co_production.sequences s
  JOIN co_production.projects p ON p.id = s.project_id
  WHERE s.id = sequence_clips.sequence_id AND p.owner_id = auth.uid()
));

-- Privileges (mirrors 20260715093300_fail_closed_co_production_authority.sql):
-- the service role owns all writes; authenticated reads through the
-- owner-scoped SELECT policies above. Without these grants every API route
-- 500s on the new tables.
GRANT ALL ON TABLE
  co_production.organizations,
  co_production.contacts,
  co_production.inquiries,
  co_production.briefs,
  co_production.brief_versions,
  co_production.proposals,
  co_production.proposal_versions,
  co_production.plan_items,
  co_production.selects,
  co_production.sequences,
  co_production.sequence_clips,
  co_production.revision_requests,
  co_production.decisions,
  co_production.deliverables
TO service_role;

GRANT SELECT ON TABLE
  co_production.organizations,
  co_production.contacts,
  co_production.inquiries,
  co_production.briefs,
  co_production.brief_versions,
  co_production.proposals,
  co_production.proposal_versions,
  co_production.plan_items,
  co_production.selects,
  co_production.sequences,
  co_production.sequence_clips,
  co_production.revision_requests,
  co_production.decisions,
  co_production.deliverables
TO authenticated;

COMMIT;
