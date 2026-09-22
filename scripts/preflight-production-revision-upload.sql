BEGIN TRANSACTION READ ONLY;

SELECT
  current_setting('server_version') AS server_version,
  current_database() AS database_name,
  current_setting('pgrst.db_schemas', true) AS pgrst_db_schemas,
  to_regnamespace('co_production') IS NOT NULL AS schema_present,
  has_schema_privilege(
    'service_role',
    to_regnamespace('co_production'),
    'USAGE'
  ) AS service_schema_usage,
  to_regclass('co_production.assets') IS NOT NULL AS assets_present,
  to_regclass('co_production.versions') IS NOT NULL AS versions_present,
  to_regclass('co_production.deliverables') IS NOT NULL AS deliverables_present,
  to_regclass('co_production.deliverable_items') IS NOT NULL
    AS deliverable_items_present,
  has_table_privilege(
    'service_role',
    'co_production.versions',
    'SELECT,INSERT,UPDATE'
  ) AS service_versions_authority,
  has_table_privilege(
    'service_role',
    'co_production.assets',
    'SELECT,UPDATE'
  ) AS service_assets_authority,
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'co_production'
      AND table_name = 'versions'
      AND column_name = 'source_upload_id'
  ) AS source_upload_present,
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'co_production'
      AND table_name = 'versions'
      AND column_name = 'storage_provider_version_id'
  ) AS provider_version_present,
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'co_production'
      AND table_name = 'assets'
      AND column_name = 'metadata'
      AND is_nullable = 'NO'
  ) AS asset_metadata_not_null,
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'co_production'
      AND table_name = 'versions'
      AND column_name = 'previous_version_id'
  ) AS revision_migration_present,
  EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'co_production'
      AND indexname = 'versions_source_upload_unique_idx'
  ) AS source_upload_unique,
  EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'co_production'
      AND indexname = 'versions_storage_object_unique_idx'
  ) AS storage_object_unique,
  to_regprocedure(
    'co_production.attach_committed_upload_revision(uuid,uuid,uuid,uuid,uuid,integer,text,text,bigint,text,text,text,text,timestamp with time zone)'
  ) IS NOT NULL AS revision_rpc_present,
  to_regprocedure('co_production.revision_upload_capability()') IS NOT NULL
    AS capability_rpc_present;

COMMIT;
