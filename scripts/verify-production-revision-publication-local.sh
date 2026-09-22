#!/usr/bin/env bash
# Qualifies the production revision migration against a pristine disposable
# PostgreSQL database. The caller starts/stops the database and supplies two
# connection URLs out of band: an admin URL and a login whose current_user is
# exactly service_role. This script never prints either URL.

set -euo pipefail

required=(CVP_LOCAL_ADMIN_DATABASE_URL CVP_LOCAL_SERVICE_DATABASE_URL)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    printf 'missing required environment: %s\n' "$name" >&2
    exit 64
  fi
done
command -v psql >/dev/null || { printf 'psql is required\n' >&2; exit 69; }
command -v node >/dev/null || { printf 'node is required\n' >&2; exit 69; }

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
migration="$repo_root/supabase/migrations/20260922055310_attach_committed_upload_revision.sql"
race_harness="$repo_root/scripts/verify-production-revision-delivery-publication-race.sh"

[[ -f "$migration" && -x "$race_harness" ]] || {
  printf 'revision migration or race harness is unavailable\n' >&2
  exit 66
}

service_identity="$(
  psql "$CVP_LOCAL_SERVICE_DATABASE_URL" -X -tA -v ON_ERROR_STOP=1 \
    <<< 'SELECT current_user;'
)"
if [[ "$service_identity" != "service_role" ]]; then
  printf 'service database URL must authenticate as service_role\n' >&2
  exit 65
fi

# Minimum canonical catalog needed by the migration and race harness. The
# target must be disposable and pristine; CREATE failures are intentional.
psql "$CVP_LOCAL_ADMIN_DATABASE_URL" -X -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END
$roles$;

CREATE SCHEMA extensions;
CREATE SCHEMA co_production_private;
CREATE SCHEMA co_production;
CREATE FUNCTION extensions.gen_random_uuid()
RETURNS uuid LANGUAGE sql VOLATILE
AS $$ SELECT pg_catalog.gen_random_uuid() $$;
CREATE FUNCTION co_production_private.role_rank(text)
RETURNS integer LANGUAGE sql IMMUTABLE STRICT
AS $$
  SELECT CASE $1
    WHEN 'owner' THEN 100 WHEN 'admin' THEN 80 WHEN 'editor' THEN 60
    WHEN 'reviewer' THEN 40 WHEN 'viewer' THEN 20 ELSE 0
  END
$$;

CREATE TABLE co_production.teams (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL
);
CREATE TABLE co_production.team_members (
  team_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL
);
CREATE TABLE co_production.projects (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  team_id uuid
);
CREATE TABLE co_production.project_members (
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL,
  expires_at timestamptz
);
CREATE TABLE co_production.assets (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  deleted_at timestamptz,
  file_url text,
  nas_path text,
  file_size bigint,
  thumbnail_url text,
  proxy_url text,
  duration_seconds numeric,
  status text NOT NULL DEFAULT 'in_review',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE co_production.versions (
  id uuid PRIMARY KEY,
  asset_id uuid NOT NULL REFERENCES co_production.assets(id),
  version_number integer NOT NULL,
  file_url text NOT NULL,
  file_size bigint,
  uploaded_by uuid,
  is_current boolean NOT NULL DEFAULT false,
  source_upload_id uuid,
  storage_provider text,
  storage_object_key text,
  storage_sha256 text,
  storage_provider_version_id text,
  storage_committed_at timestamptz,
  original_filename text,
  mime_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, version_number)
);
CREATE UNIQUE INDEX versions_source_upload_unique_idx
  ON co_production.versions(source_upload_id)
  WHERE source_upload_id IS NOT NULL;
CREATE UNIQUE INDEX versions_storage_object_unique_idx
  ON co_production.versions(storage_provider, storage_object_key)
  WHERE storage_provider IS NOT NULL AND storage_object_key IS NOT NULL;
CREATE TABLE co_production.deliverables (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  locked_at timestamptz
);
CREATE TABLE co_production.deliverable_items (
  deliverable_id uuid NOT NULL REFERENCES co_production.deliverables(id),
  asset_id uuid NOT NULL REFERENCES co_production.assets(id),
  version_id uuid NOT NULL REFERENCES co_production.versions(id),
  PRIMARY KEY (deliverable_id, asset_id)
);

GRANT USAGE ON SCHEMA co_production, co_production_private, extensions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA co_production TO service_role;
GRANT EXECUTE ON FUNCTION co_production_private.role_rank(text) TO service_role;
SQL

psql "$CVP_LOCAL_ADMIN_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f "$migration" >/dev/null

capability="$(
  psql "$CVP_LOCAL_SERVICE_DATABASE_URL" -X -tA -v ON_ERROR_STOP=1 \
    <<< 'SELECT co_production.revision_upload_capability();'
)"
[[ "$capability" == "t" ]] || {
  printf 'revision upload capability probe did not pass as service_role\n' >&2
  exit 1
}

for case_name in \
  revision-first lock-first multi-row rollback unsupported-isolation; do
  actor_id="$(node -e 'console.log(crypto.randomUUID())')"
  project_id="$(node -e 'console.log(crypto.randomUUID())')"
  asset_id="$(node -e 'console.log(crypto.randomUUID())')"
  current_version_id="$(node -e 'console.log(crypto.randomUUID())')"
  deliverable_one="$(node -e 'console.log(crypto.randomUUID())')"
  deliverable_two="$(node -e 'console.log(crypto.randomUUID())')"
  deliverable_ids="$deliverable_one"
  [[ "$case_name" == "multi-row" ]] && \
    deliverable_ids="$deliverable_one,$deliverable_two"

  psql "$CVP_LOCAL_ADMIN_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
    -v actor_id="$actor_id" -v project_id="$project_id" \
    -v asset_id="$asset_id" -v current_version_id="$current_version_id" \
    -v deliverable_one="$deliverable_one" \
    -v deliverable_two="$deliverable_two" >/dev/null <<'SQL'
INSERT INTO co_production.projects (id, owner_id)
VALUES (:'project_id'::uuid, :'actor_id'::uuid);
INSERT INTO co_production.assets (id, project_id, file_url, file_size, status)
VALUES (
  :'asset_id'::uuid,
  :'project_id'::uuid,
  '/api/media/versions/' || :'current_version_id',
  512,
  'in_review'
);
INSERT INTO co_production.versions (
  id, asset_id, version_number, file_url, file_size, uploaded_by, is_current,
  source_upload_id, storage_provider, storage_object_key, storage_sha256,
  storage_provider_version_id, storage_committed_at, original_filename,
  mime_type
) VALUES (
  :'current_version_id'::uuid,
  :'asset_id'::uuid,
  1,
  '/api/media/versions/' || :'current_version_id',
  512,
  :'actor_id'::uuid,
  true,
  pg_catalog.gen_random_uuid(),
  'local',
  'fixture/' || :'current_version_id',
  repeat('b', 64),
  'fixture-v1',
  pg_catalog.clock_timestamp(),
  'fixture-v1.mp4',
  'video/mp4'
);
INSERT INTO co_production.deliverables (id, project_id)
VALUES
  (:'deliverable_one'::uuid, :'project_id'::uuid),
  (:'deliverable_two'::uuid, :'project_id'::uuid);
SQL

  CVP_RACE_DATABASE_URL="$CVP_LOCAL_SERVICE_DATABASE_URL" \
  CVP_RACE_CASE="$case_name" \
  CVP_RACE_ACTOR_ID="$actor_id" \
  CVP_RACE_PROJECT_ID="$project_id" \
  CVP_RACE_ASSET_ID="$asset_id" \
  CVP_RACE_CURRENT_VERSION_ID="$current_version_id" \
  CVP_RACE_CURRENT_VERSION_NUMBER=1 \
  CVP_RACE_DELIVERABLE_IDS="$deliverable_ids" \
    "$race_harness"
done

printf 'local production revision publication qualification passed\n'
