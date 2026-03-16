-- Co-Deliver auth/data contract hardening
-- Makes external review comments explicit and durable without overloading reviews.id.

ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS review_invite_id uuid REFERENCES review_invites(id) ON DELETE SET NULL;

ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'internal';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'comments_visibility_check'
  ) THEN
    ALTER TABLE comments
      ADD CONSTRAINT comments_visibility_check
      CHECK (visibility IN ('internal', 'external'));
  END IF;
END $$;

-- Backfill any drifted environments where external comments were stored against review_id.
UPDATE comments
SET
  review_invite_id = review_id,
  visibility = 'external'
WHERE review_id IS NOT NULL
  AND review_invite_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM review_invites
    WHERE review_invites.id = comments.review_id
  );

UPDATE comments
SET visibility = 'external'
WHERE review_invite_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comments_review_invite ON comments(review_invite_id);
CREATE INDEX IF NOT EXISTS idx_comments_asset_visibility ON comments(asset_id, visibility, created_at);
