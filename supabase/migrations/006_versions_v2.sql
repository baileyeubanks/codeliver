-- CoDeliver V2 — Migration 006: Version Control V2
-- Adds is_current, thumbnail, duration, resolution to versions + comparison sessions

-- New columns on versions
ALTER TABLE versions ADD COLUMN IF NOT EXISTS is_current boolean DEFAULT false;
ALTER TABLE versions ADD COLUMN IF NOT EXISTS thumbnail_url text;
ALTER TABLE versions ADD COLUMN IF NOT EXISTS duration_seconds float;
ALTER TABLE versions ADD COLUMN IF NOT EXISTS resolution text;

-- Comparison sessions table
CREATE TABLE IF NOT EXISTS comparison_sessions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  version_a_id uuid NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
  version_b_id uuid NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE comparison_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comparisons visible to authenticated" ON comparison_sessions FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Comparisons insertable by authenticated" ON comparison_sessions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Ensure only one current version per asset (function + trigger)
CREATE OR REPLACE FUNCTION ensure_single_current_version()
RETURNS trigger AS $$
BEGIN
  IF NEW.is_current = true THEN
    UPDATE versions SET is_current = false
    WHERE asset_id = NEW.asset_id AND id != NEW.id AND is_current = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_single_current_version ON versions;
CREATE TRIGGER trg_single_current_version
  BEFORE INSERT OR UPDATE OF is_current ON versions
  FOR EACH ROW
  WHEN (NEW.is_current = true)
  EXECUTE FUNCTION ensure_single_current_version();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_versions_current ON versions(asset_id, is_current) WHERE is_current = true;
