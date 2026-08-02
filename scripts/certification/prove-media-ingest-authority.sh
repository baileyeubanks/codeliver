#!/usr/bin/env bash
set -euo pipefail

repository_root="$(
  cd "$(dirname "$0")/../.."
  pwd
)"
container_name="cco-media-ingest-proof-$$"

cleanup() {
  docker rm --force "${container_name}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run \
  --detach \
  --name "${container_name}" \
  --env POSTGRES_PASSWORD=postgres \
  --mount "type=bind,source=${repository_root},target=/workspace,readonly" \
  postgres:15 \
  >/dev/null

ready=false
for _ in $(seq 1 120); do
  if docker logs "${container_name}" 2>&1 \
      | grep --fixed-strings --quiet \
        "PostgreSQL init process complete; ready for start up." \
    && docker exec "${container_name}" \
      pg_isready --username postgres >/dev/null 2>&1
  then
    ready=true
    break
  fi
  sleep 0.25
done

if [[ "${ready}" != "true" ]]; then
  docker logs "${container_name}" >&2
  printf '%s\n' "PostgreSQL 15 proof container did not become ready" >&2
  exit 1
fi

docker exec "${container_name}" \
  psql --username postgres --dbname postgres --set ON_ERROR_STOP=1 \
  --file /workspace/scripts/certification/media-ingest-authority-fixture.sql

docker exec "${container_name}" \
  psql --username postgres --dbname postgres --set ON_ERROR_STOP=1 \
  --file /workspace/supabase/migrations/20260715220000_media_ingest_authority.sql

docker exec "${container_name}" \
  psql --username postgres --dbname postgres --set ON_ERROR_STOP=1 \
  --file /workspace/scripts/certification/media-ingest-authority-proof.sql

printf '%s\n' "PostgreSQL 15 media ingest authority proof: PASS"
