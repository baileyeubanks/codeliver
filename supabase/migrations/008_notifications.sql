-- ── Chunk 8: Notifications + Real-time ──────────────────────────

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  data jsonb DEFAULT '{}',
  read boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own notifications" ON notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Notifications insertable" ON notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "Users update own notifications" ON notifications FOR UPDATE USING (auth.uid() = user_id);

-- Notification preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  email_enabled boolean DEFAULT true,
  email_frequency text DEFAULT 'instant' CHECK (email_frequency IN ('instant', 'daily', 'weekly', 'off')),
  in_app_enabled boolean DEFAULT true,
  PRIMARY KEY (user_id, event_type)
);
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own preferences" ON notification_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users manage own preferences" ON notification_preferences FOR ALL USING (auth.uid() = user_id);

-- Presence table (ephemeral)
CREATE TABLE IF NOT EXISTS presence (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  user_name text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, asset_id)
);
ALTER TABLE presence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Presence readable" ON presence FOR SELECT USING (true);
CREATE POLICY "Presence writable" ON presence FOR ALL USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read, created_at);
CREATE INDEX IF NOT EXISTS idx_presence_asset ON presence(asset_id);
