-- Chunk 3: Enhanced Comments System
-- Add comment_reactions table
CREATE TABLE IF NOT EXISTS comment_reactions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  comment_id uuid NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(comment_id, user_id, emoji)
);
ALTER TABLE comment_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Reactions readable by all" ON comment_reactions FOR SELECT USING (true);
CREATE POLICY "Reactions insertable by authenticated" ON comment_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Reactions deletable by creator" ON comment_reactions FOR DELETE USING (auth.uid() = user_id);

-- Add comment_attachments table
CREATE TABLE IF NOT EXISTS comment_attachments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  comment_id uuid NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_type text,
  file_size bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE comment_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Attachments readable by all" ON comment_attachments FOR SELECT USING (true);
CREATE POLICY "Attachments insertable by authenticated" ON comment_attachments FOR INSERT WITH CHECK (true);

-- Add new columns to comments
ALTER TABLE comments ADD COLUMN IF NOT EXISTS rich_body text;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS mentions text[] DEFAULT '{}';
ALTER TABLE comments ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES auth.users(id);
ALTER TABLE comments ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reactions_comment ON comment_reactions(comment_id);
CREATE INDEX IF NOT EXISTS idx_attachments_comment ON comment_attachments(comment_id);
