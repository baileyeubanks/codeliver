-- Isolate comment attachments from the public deliverables bucket.
INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'comment-attachments',
  'comment-attachments',
  false,
  26214400,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE comment_attachments
  ADD COLUMN IF NOT EXISTS storage_bucket text,
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS uploaded_by uuid REFERENCES auth.users(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_comment_attachments_storage_object
  ON comment_attachments(storage_bucket, storage_path)
  WHERE storage_bucket IS NOT NULL AND storage_path IS NOT NULL;

-- Replace the original globally-readable metadata policies with project ownership.
DROP POLICY IF EXISTS "Attachments readable by all" ON comment_attachments;
DROP POLICY IF EXISTS "Attachments insertable by authenticated" ON comment_attachments;
DROP POLICY IF EXISTS "Project owners read comment attachments" ON comment_attachments;
DROP POLICY IF EXISTS "Project owners insert comment attachments" ON comment_attachments;

CREATE POLICY "Project owners read comment attachments"
  ON comment_attachments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM comments
      JOIN assets ON assets.id = comments.asset_id
      JOIN projects ON projects.id = assets.project_id
      WHERE comments.id = comment_attachments.comment_id
        AND projects.owner_id = auth.uid()
    )
  );

CREATE POLICY "Project owners insert comment attachments"
  ON comment_attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND storage_bucket = 'comment-attachments'
    AND EXISTS (
      SELECT 1
      FROM comments
      JOIN assets ON assets.id = comments.asset_id
      JOIN projects ON projects.id = assets.project_id
      WHERE comments.id = comment_attachments.comment_id
        AND projects.owner_id = auth.uid()
        AND split_part(storage_path, '/', 1) = projects.owner_id::text
        AND split_part(storage_path, '/', 2) = projects.id::text
        AND split_part(storage_path, '/', 3) = assets.id::text
        AND split_part(storage_path, '/', 4) = comments.id::text
        AND split_part(storage_path, '/', 5) <> ''
        AND split_part(storage_path, '/', 6) = ''
    )
  );

-- Direct object access is also limited to the owner encoded in the four-folder scope.
DROP POLICY IF EXISTS "Project owners read private comment objects" ON storage.objects;
DROP POLICY IF EXISTS "Project owners upload private comment objects" ON storage.objects;

CREATE POLICY "Project owners read private comment objects"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'comment-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (storage.foldername(name))[4] IS NOT NULL
    AND (storage.foldername(name))[5] IS NULL
    AND EXISTS (
      SELECT 1
      FROM comments
      JOIN assets ON assets.id = comments.asset_id
      JOIN projects ON projects.id = assets.project_id
      WHERE comments.id::text = (storage.foldername(name))[4]
        AND assets.id::text = (storage.foldername(name))[3]
        AND projects.id::text = (storage.foldername(name))[2]
        AND projects.owner_id = auth.uid()
    )
  );

CREATE POLICY "Project owners upload private comment objects"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'comment-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (storage.foldername(name))[4] IS NOT NULL
    AND (storage.foldername(name))[5] IS NULL
    AND EXISTS (
      SELECT 1
      FROM comments
      JOIN assets ON assets.id = comments.asset_id
      JOIN projects ON projects.id = assets.project_id
      WHERE comments.id::text = (storage.foldername(name))[4]
        AND assets.id::text = (storage.foldername(name))[3]
        AND projects.id::text = (storage.foldername(name))[2]
        AND projects.owner_id = auth.uid()
    )
  );
