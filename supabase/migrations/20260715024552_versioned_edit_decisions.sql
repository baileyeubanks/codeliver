-- Bind review links, comments, and edit decisions to an immutable media version.
-- External reviewers never access edit_decisions through the Data API; token
-- authorization stays in the server routes that use the service role.

-- Legacy assets predate first-class versions. Create a v1 baseline so every
-- durable review action can point at the exact media artifact it describes.
INSERT INTO versions (
  asset_id,
  version_number,
  file_url,
  file_size,
  uploaded_by,
  is_current,
  thumbnail_url,
  duration_seconds
)
SELECT
  assets.id,
  1,
  assets.file_url,
  assets.file_size,
  NULL,
  true,
  assets.thumbnail_url,
  assets.duration_seconds
FROM assets
WHERE assets.file_url IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM versions
    WHERE versions.asset_id = assets.id
  );

WITH latest_versions AS (
  SELECT DISTINCT ON (asset_id) id, asset_id
  FROM versions
  ORDER BY asset_id, is_current DESC, version_number DESC, created_at DESC
)
UPDATE versions
SET is_current = true
FROM latest_versions
WHERE versions.id = latest_versions.id
  AND NOT EXISTS (
    SELECT 1
    FROM versions current_version
    WHERE current_version.asset_id = latest_versions.asset_id
      AND current_version.is_current = true
  );

ALTER TABLE review_invites
  ADD COLUMN IF NOT EXISTS version_id uuid REFERENCES versions(id) ON DELETE CASCADE;

UPDATE review_invites
SET version_id = (
  SELECT versions.id
  FROM versions
  WHERE versions.asset_id = review_invites.asset_id
  ORDER BY versions.is_current DESC, versions.version_number DESC, versions.created_at DESC
  LIMIT 1
)
WHERE review_invites.version_id IS NULL;

ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS version_id uuid REFERENCES versions(id) ON DELETE SET NULL;

ALTER TABLE versions
  ADD CONSTRAINT versions_id_asset_unique UNIQUE (id, asset_id);

ALTER TABLE review_invites
  ADD CONSTRAINT review_invites_version_asset_fkey
  FOREIGN KEY (version_id, asset_id)
  REFERENCES versions(id, asset_id)
  ON DELETE CASCADE;

UPDATE comments
SET version_id = review_invites.version_id
FROM review_invites
WHERE comments.review_invite_id = review_invites.id
  AND comments.version_id IS NULL
  AND review_invites.version_id IS NOT NULL;

UPDATE comments
SET version_id = (
  SELECT versions.id
  FROM versions
  WHERE versions.asset_id = comments.asset_id
  ORDER BY versions.is_current DESC, versions.version_number DESC, versions.created_at DESC
  LIMIT 1
)
WHERE comments.version_id IS NULL;

-- Public review access is authorized by token-aware server routes. The legacy
-- broad Data API policies exposed invite rows and allowed arbitrary inserts.
DROP POLICY IF EXISTS "Invites public by token" ON review_invites;
DROP POLICY IF EXISTS "Comments insertable by anyone" ON comments;
DROP POLICY IF EXISTS "Annotations public read" ON annotations;
DROP POLICY IF EXISTS "Activity insertable" ON activity_log;
DROP POLICY IF EXISTS "Analytics insertable by anyone" ON share_analytics;

REVOKE ALL ON TABLE review_invites FROM anon;
REVOKE ALL ON TABLE comments FROM anon;
REVOKE ALL ON TABLE annotations FROM anon;
REVOKE ALL ON TABLE activity_log FROM anon;
REVOKE ALL ON TABLE share_analytics FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE review_invites TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE comments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE annotations TO authenticated;
GRANT SELECT, INSERT ON TABLE activity_log TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE share_analytics TO authenticated;

GRANT ALL ON TABLE review_invites TO service_role;
GRANT ALL ON TABLE comments TO service_role;
GRANT ALL ON TABLE annotations TO service_role;
GRANT ALL ON TABLE activity_log TO service_role;
GRANT ALL ON TABLE share_analytics TO service_role;

CREATE TABLE IF NOT EXISTS edit_decisions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
  review_invite_id uuid REFERENCES review_invites(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name text NOT NULL DEFAULT 'Unknown reviewer',
  decision_type text NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'proposed',
  start_seconds double precision NOT NULL,
  end_seconds double precision,
  label text,
  confidence double precision,
  client_request_id uuid NOT NULL DEFAULT uuid_generate_v4(),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT edit_decisions_type_check CHECK (
    decision_type IN (
      'cut',
      'trim',
      'mute',
      'lift',
      'ripple_delete',
      'remove_silence',
      'remove_filler',
      'replace'
    )
  ),
  CONSTRAINT edit_decisions_source_check CHECK (
    source IN ('keyboard', 'manual', 'transcript_ai', 'silence_scan', 'filler_scan', 'import')
  ),
  CONSTRAINT edit_decisions_status_check CHECK (
    status IN ('proposed', 'accepted', 'rejected', 'applied')
  ),
  CONSTRAINT edit_decisions_start_check CHECK (
    start_seconds >= 0 AND start_seconds <= 604800
  ),
  CONSTRAINT edit_decisions_range_check CHECK (
    end_seconds IS NULL OR (
      end_seconds >= start_seconds
      AND end_seconds <= 604800
    )
  ),
  CONSTRAINT edit_decisions_confidence_check CHECK (
    confidence IS NULL OR (confidence >= 0 AND confidence <= 1)
  ),
  CONSTRAINT edit_decisions_request_unique UNIQUE (version_id, client_request_id)
);

ALTER TABLE edit_decisions
  ADD CONSTRAINT edit_decisions_version_asset_fkey
  FOREIGN KEY (version_id, asset_id)
  REFERENCES versions(id, asset_id)
  ON DELETE CASCADE;

ALTER TABLE edit_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Edit decisions visible to project owner"
ON edit_decisions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM assets
    JOIN projects ON projects.id = assets.project_id
    WHERE assets.id = edit_decisions.asset_id
      AND projects.owner_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Edit decisions insertable by project owner"
ON edit_decisions
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1
    FROM assets
    JOIN projects ON projects.id = assets.project_id
    WHERE assets.id = edit_decisions.asset_id
      AND projects.owner_id = (SELECT auth.uid())
  )
  AND EXISTS (
    SELECT 1
    FROM versions
    WHERE versions.id = edit_decisions.version_id
      AND versions.asset_id = edit_decisions.asset_id
  )
);

CREATE POLICY "Edit decisions updatable by project owner"
ON edit_decisions
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM assets
    JOIN projects ON projects.id = assets.project_id
    WHERE assets.id = edit_decisions.asset_id
      AND projects.owner_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM assets
    JOIN projects ON projects.id = assets.project_id
    WHERE assets.id = edit_decisions.asset_id
      AND projects.owner_id = (SELECT auth.uid())
  )
  AND EXISTS (
    SELECT 1
    FROM versions
    WHERE versions.id = edit_decisions.version_id
      AND versions.asset_id = edit_decisions.asset_id
  )
);

CREATE POLICY "Edit decisions deletable by project owner"
ON edit_decisions
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM assets
    JOIN projects ON projects.id = assets.project_id
    WHERE assets.id = edit_decisions.asset_id
      AND projects.owner_id = (SELECT auth.uid())
  )
);

REVOKE ALL ON TABLE edit_decisions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE edit_decisions TO authenticated;
GRANT ALL ON TABLE edit_decisions TO service_role;

CREATE INDEX IF NOT EXISTS idx_review_invites_version
  ON review_invites(version_id);
CREATE INDEX IF NOT EXISTS idx_comments_version_created
  ON comments(version_id, created_at);
CREATE INDEX IF NOT EXISTS idx_edit_decisions_version_time
  ON edit_decisions(version_id, start_seconds, created_at);
CREATE INDEX IF NOT EXISTS idx_edit_decisions_asset_status
  ON edit_decisions(asset_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_edit_decisions_review_invite
  ON edit_decisions(review_invite_id)
  WHERE review_invite_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_edit_decisions_updated ON edit_decisions;
CREATE TRIGGER trg_edit_decisions_updated
  BEFORE UPDATE ON edit_decisions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
