-- Teams table
CREATE TABLE IF NOT EXISTS teams (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teams visible to members" ON teams FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members WHERE team_members.team_id = teams.id AND team_members.user_id = auth.uid()));
CREATE POLICY "Teams creatable by authenticated" ON teams FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Teams updatable by owner" ON teams FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "Teams deletable by owner" ON teams FOR DELETE USING (owner_id = auth.uid());

-- Team members
CREATE TABLE IF NOT EXISTS team_members (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  invited_by uuid REFERENCES auth.users(id),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(team_id, user_id)
);
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members visible to team" ON team_members FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = team_members.team_id AND tm.user_id = auth.uid()));
CREATE POLICY "Members manageable by admin" ON team_members FOR ALL
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = team_members.team_id AND tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin')));

-- Team invites
CREATE TABLE IF NOT EXISTS team_invites (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'member',
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'revoked')),
  invited_by uuid REFERENCES auth.users(id),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE team_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Invites visible to team admins" ON team_invites FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members WHERE team_members.team_id = team_invites.team_id AND team_members.user_id = auth.uid() AND team_members.role IN ('owner', 'admin')));
CREATE POLICY "Invites manageable by admins" ON team_invites FOR ALL
  USING (EXISTS (SELECT 1 FROM team_members WHERE team_members.team_id = team_invites.team_id AND team_members.user_id = auth.uid() AND team_members.role IN ('owner', 'admin')));

-- Webhooks
CREATE TABLE IF NOT EXISTS webhooks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  url text NOT NULL,
  events text[] NOT NULL DEFAULT '{}',
  secret text NOT NULL,
  active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Webhooks visible to team admins" ON webhooks FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members WHERE team_members.team_id = webhooks.team_id AND team_members.user_id = auth.uid() AND team_members.role IN ('owner', 'admin')));
CREATE POLICY "Webhooks manageable by admins" ON webhooks FOR ALL
  USING (EXISTS (SELECT 1 FROM team_members WHERE team_members.team_id = webhooks.team_id AND team_members.user_id = auth.uid() AND team_members.role IN ('owner', 'admin')));

-- Webhook deliveries
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  webhook_id uuid NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  response_code int,
  delivered_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deliveries visible to team admins" ON webhook_deliveries FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM webhooks
    JOIN team_members ON team_members.team_id = webhooks.team_id
    WHERE webhooks.id = webhook_deliveries.webhook_id
    AND team_members.user_id = auth.uid()
    AND team_members.role IN ('owner', 'admin')
  ));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_invites_team ON team_invites(team_id);
CREATE INDEX IF NOT EXISTS idx_team_invites_token ON team_invites(token);
CREATE INDEX IF NOT EXISTS idx_webhooks_team ON webhooks(team_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries ON webhook_deliveries(webhook_id);
