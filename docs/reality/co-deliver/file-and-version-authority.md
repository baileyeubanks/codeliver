# Co-Deliver File And Version Authority

Date: 2026-06-27
Status: L0 authority map.

## Upload Paths

1. `POST /api/media/upload`
   - Legacy/small-file multipart NAS upload.
   - Writes directly under `NAS_MEDIA_ROOT`.
   - Optionally inserts an `assets` row.
   - If DB insert fails, code logs the error but still returns upload success.

2. `POST /api/media/tus` and `/api/media/tus/[uploadId]`
   - Resumable upload metadata and chunks under `NAS_MEDIA_ROOT/.tus-uploads`.
   - Finalization moves the file to project folder and inserts an `assets` row.
   - May enqueue transcode work.

3. `POST /api/projects/[id]/assets`
   - Creates asset metadata.
   - Needs separate file authority review.

4. `POST /api/assets/[id]/versions`
   - Creates a `versions` row.
   - Updates `assets.file_url` to the latest version.
   - Carries unresolved comments forward.
   - Attempts to reset `approval_steps`, but current schema uses `approvals` and `approval_workflows`.

## Storage Paths

- NAS filesystem: `NAS_MEDIA_ROOT` or fallback `/volume1/media`.
- Supabase storage bucket: `deliverables`, created as public in migration 001.
- Media stream: `/api/media/stream?path=...`, requires internal auth.

## Version Authority

Current code supports `versions.version_number` and migration 006 adds `versions.is_current`, but `/api/assets/[id]/versions` does not set `is_current`. Export uses the numerically latest version, not approved version.

## P0 Gaps

- Duplicate upload paths exist and are not guarded by one canonical file gate.
- DB insert failure after file write can create orphaned NAS files.
- Public review links may reference `/api/media/stream`, but that route requires internal auth.
- Version upload resets a non-existent or stale `approval_steps` table.
- Export/download does not prove it serves the approved version.
- No checksum/hash authority was found.
- No canonical package artifact authority was found.

