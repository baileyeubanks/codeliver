-- Service role bypass for all new tables
-- (Supabase service role already bypasses RLS by default)
-- This migration ensures public access for shared review pages

-- Allow review_invites to be read by token (public access for external reviewers)
-- This policy already exists from 001 but let's ensure it's present
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Invites public by token' AND tablename = 'review_invites'
  ) THEN
    CREATE POLICY "Invites public by token" ON review_invites FOR SELECT USING (true);
  END IF;
END $$;

-- Allow comments to be inserted by external reviewers (via share token validation in API)
-- This policy already exists from 001

-- Annotations readable by anyone (for shared reviews)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Annotations public read' AND tablename = 'annotations'
  ) THEN
    CREATE POLICY "Annotations public read" ON annotations FOR SELECT USING (true);
  END IF;
END $$;

-- Share analytics insertable by anyone (for tracking)
-- Already covered in 004
