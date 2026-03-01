-- Folders table
CREATE TABLE IF NOT EXISTS folders (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES folders(id) ON DELETE SET NULL,
  name text NOT NULL,
  position int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Folders visible to project owner" ON folders FOR SELECT
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = folders.project_id AND projects.owner_id = auth.uid()));
CREATE POLICY "Folders manageable by project owner" ON folders FOR ALL
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = folders.project_id AND projects.owner_id = auth.uid()));

-- Add folder_id to assets
ALTER TABLE assets ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES folders(id) ON DELETE SET NULL;

-- Tags table
CREATE TABLE IF NOT EXISTS tags (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#3b82f6',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tags visible to project owner" ON tags FOR SELECT
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = tags.project_id AND projects.owner_id = auth.uid()));
CREATE POLICY "Tags manageable by project owner" ON tags FOR ALL
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = tags.project_id AND projects.owner_id = auth.uid()));

-- Asset-Tag junction
CREATE TABLE IF NOT EXISTS asset_tags (
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (asset_id, tag_id)
);
ALTER TABLE asset_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Asset tags readable" ON asset_tags FOR SELECT USING (true);
CREATE POLICY "Asset tags insertable" ON asset_tags FOR INSERT WITH CHECK (true);
CREATE POLICY "Asset tags deletable" ON asset_tags FOR DELETE USING (true);

-- Soft delete for assets
ALTER TABLE assets ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS position int DEFAULT 0;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_folders_project ON folders(project_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_assets_folder ON assets(folder_id);
CREATE INDEX IF NOT EXISTS idx_tags_project ON tags(project_id);
CREATE INDEX IF NOT EXISTS idx_assets_deleted ON assets(deleted_at) WHERE deleted_at IS NOT NULL;
