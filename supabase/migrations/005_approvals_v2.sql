-- Approval workflows table
CREATE TABLE IF NOT EXISTS approval_workflows (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'sequential' CHECK (mode IN ('sequential', 'parallel')),
  created_by uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE approval_workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workflows visible to project owner" ON approval_workflows FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM assets JOIN projects ON projects.id = assets.project_id
    WHERE assets.id = approval_workflows.asset_id AND projects.owner_id = auth.uid()
  ));

CREATE POLICY "Workflows insertable by project owner" ON approval_workflows FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM assets JOIN projects ON projects.id = assets.project_id
    WHERE assets.id = approval_workflows.asset_id AND projects.owner_id = auth.uid()
  ));

CREATE POLICY "Workflows updatable by project owner" ON approval_workflows FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM assets JOIN projects ON projects.id = assets.project_id
    WHERE assets.id = approval_workflows.asset_id AND projects.owner_id = auth.uid()
  ));

CREATE POLICY "Workflows deletable by project owner" ON approval_workflows FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM assets JOIN projects ON projects.id = assets.project_id
    WHERE assets.id = approval_workflows.asset_id AND projects.owner_id = auth.uid()
  ));

-- Add workflow_id to existing approvals table
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS workflow_id uuid REFERENCES approval_workflows(id) ON DELETE CASCADE;

-- Approval history tracking
CREATE TABLE IF NOT EXISTS approval_history (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  approval_id uuid NOT NULL REFERENCES approvals(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  changed_by uuid REFERENCES auth.users(id),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE approval_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "History visible to project owner" ON approval_history FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM approvals
    JOIN assets ON assets.id = approvals.asset_id
    JOIN projects ON projects.id = assets.project_id
    WHERE approvals.id = approval_history.approval_id AND projects.owner_id = auth.uid()
  ));

CREATE POLICY "History insertable" ON approval_history FOR INSERT WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workflows_asset ON approval_workflows(asset_id);
CREATE INDEX IF NOT EXISTS idx_approvals_workflow ON approvals(workflow_id);
CREATE INDEX IF NOT EXISTS idx_approval_history ON approval_history(approval_id);

-- Updated_at trigger
CREATE TRIGGER trg_workflows_updated BEFORE UPDATE ON approval_workflows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
