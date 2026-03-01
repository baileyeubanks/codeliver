-- CoDeliver V2 — Migration 004: Enhanced Sharing
-- Adds watermark, download, view tracking columns to review_invites + share_analytics table

-- New columns on review_invites
ALTER TABLE review_invites ADD COLUMN IF NOT EXISTS watermark_enabled boolean DEFAULT false;
ALTER TABLE review_invites ADD COLUMN IF NOT EXISTS watermark_text text;
ALTER TABLE review_invites ADD COLUMN IF NOT EXISTS download_enabled boolean DEFAULT true;
ALTER TABLE review_invites ADD COLUMN IF NOT EXISTS view_count int DEFAULT 0;
ALTER TABLE review_invites ADD COLUMN IF NOT EXISTS last_viewed_at timestamptz;
ALTER TABLE review_invites ADD COLUMN IF NOT EXISTS max_views int;

-- Share analytics table
CREATE TABLE IF NOT EXISTS share_analytics (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  invite_id uuid NOT NULL REFERENCES review_invites(id) ON DELETE CASCADE,
  viewer_ip_hash text,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  duration_seconds int DEFAULT 0,
  actions jsonb DEFAULT '{}'
);

ALTER TABLE share_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Analytics visible to invite creator" ON share_analytics FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM review_invites ri
    JOIN assets a ON a.id = ri.asset_id
    JOIN projects p ON p.id = a.project_id
    WHERE ri.id = share_analytics.invite_id AND p.owner_id = auth.uid()
  ));

CREATE POLICY "Analytics insertable by anyone" ON share_analytics FOR INSERT
  WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_share_analytics_invite ON share_analytics(invite_id);
CREATE INDEX IF NOT EXISTS idx_share_analytics_viewed ON share_analytics(viewed_at);
CREATE INDEX IF NOT EXISTS idx_review_invites_views ON review_invites(view_count);
