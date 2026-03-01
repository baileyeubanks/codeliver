-- CoDeliver V2 — Migration 002: Foundation
-- Adds annotations table, annotation_type enum, frame_number to comments

-- Annotation type enum
DO $$ BEGIN
  CREATE TYPE annotation_type AS ENUM ('pin', 'rectangle', 'freehand', 'arrow', 'text');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Annotations table
CREATE TABLE IF NOT EXISTS annotations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  comment_id uuid REFERENCES comments(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  version_id uuid REFERENCES versions(id) ON DELETE SET NULL,
  type annotation_type NOT NULL,
  data jsonb NOT NULL DEFAULT '{}',
  frame_number int,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Annotations visible to project owner" ON annotations FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM assets JOIN projects ON projects.id = assets.project_id
    WHERE assets.id = annotations.asset_id AND projects.owner_id = auth.uid()
  ));

CREATE POLICY "Annotations insertable by authenticated" ON annotations FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Annotations deletable by creator" ON annotations FOR DELETE
  USING (created_by = auth.uid());

-- Add frame_number to comments
ALTER TABLE comments ADD COLUMN IF NOT EXISTS frame_number int;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_annotations_comment ON annotations(comment_id);
CREATE INDEX IF NOT EXISTS idx_annotations_asset ON annotations(asset_id);
CREATE INDEX IF NOT EXISTS idx_annotations_frame ON annotations(asset_id, frame_number);
CREATE INDEX IF NOT EXISTS idx_comments_frame ON comments(asset_id, frame_number);
