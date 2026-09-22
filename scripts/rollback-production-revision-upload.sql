BEGIN;

DO $rollback_guard$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM co_production.versions
    WHERE previous_version_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'revision upload rollback refused because immutable revision lineage exists';
  END IF;
END
$rollback_guard$;

DROP TRIGGER IF EXISTS deliverable_items_a_publication_guard
  ON co_production.deliverable_items;
DROP TRIGGER IF EXISTS deliverables_a_publication_guard
  ON co_production.deliverables;

DROP FUNCTION IF EXISTS co_production.revision_upload_capability();
DROP FUNCTION IF EXISTS co_production.attach_committed_upload_revision(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
  text,
  text,
  bigint,
  text,
  text,
  text,
  text,
  timestamptz
);
DROP FUNCTION IF EXISTS co_production.guard_delivery_publication_statement();
DROP FUNCTION IF EXISTS co_production.acquire_delivery_publication_lock();

DROP INDEX IF EXISTS co_production.versions_previous_version_idx;
ALTER TABLE co_production.versions
  DROP COLUMN IF EXISTS previous_version_id;

COMMIT;
