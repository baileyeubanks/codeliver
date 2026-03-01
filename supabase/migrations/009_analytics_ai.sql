-- Chunk 9: Analytics + AI tables

-- Transcriptions table
CREATE TABLE IF NOT EXISTS transcriptions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  version_id uuid REFERENCES versions(id) ON DELETE SET NULL,
  segments jsonb NOT NULL DEFAULT '[]',
  language text DEFAULT 'en',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE transcriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Transcriptions visible to project owner" ON transcriptions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM assets JOIN projects ON projects.id = assets.project_id
    WHERE assets.id = transcriptions.asset_id AND projects.owner_id = auth.uid()
  ));
CREATE POLICY "Transcriptions insertable" ON transcriptions FOR INSERT WITH CHECK (true);
CREATE POLICY "Transcriptions updatable" ON transcriptions FOR UPDATE USING (true);

-- Brand checks table
CREATE TABLE IF NOT EXISTS brand_checks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  results jsonb NOT NULL DEFAULT '{}',
  score int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE brand_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Brand checks visible to project owner" ON brand_checks FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM assets JOIN projects ON projects.id = assets.project_id
    WHERE assets.id = brand_checks.asset_id AND projects.owner_id = auth.uid()
  ));
CREATE POLICY "Brand checks insertable" ON brand_checks FOR INSERT WITH CHECK (true);

-- Analytics cache
CREATE TABLE IF NOT EXISTS project_analytics_cache (
  project_id uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{}',
  computed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE project_analytics_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cache visible to project owner" ON project_analytics_cache FOR SELECT
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = project_analytics_cache.project_id AND projects.owner_id = auth.uid()));
CREATE POLICY "Cache writable" ON project_analytics_cache FOR ALL USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_transcriptions_asset ON transcriptions(asset_id);
CREATE INDEX IF NOT EXISTS idx_brand_checks_asset ON brand_checks(asset_id);
