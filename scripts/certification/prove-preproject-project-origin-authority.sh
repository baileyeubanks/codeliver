#!/usr/bin/env bash
set -euo pipefail

repository_root="$(
  cd "$(dirname "$0")/../.."
  pwd
)"
container_name="cco-preproject-origin-proof-$$"

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
  -c wal_level=logical \
  >/dev/null

ready=false
for _ in $(seq 1 160); do
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
  printf '%s\n' "PostgreSQL 15 pre-project proof container did not become ready" >&2
  exit 1
fi

docker exec "${container_name}" \
  psql --username postgres --dbname postgres --set ON_ERROR_STOP=1 \
  --file /workspace/scripts/certification/preproject-project-origin-authority-fixture.sql \
  >/dev/null

for migration in \
  20260715093300_fail_closed_co_production_authority.sql \
  20260715170500_proposal_handoff_authority.sql \
  20260715183000_identity_governance_authority.sql \
  20260716002000_project_operating_source_projection.sql \
  20260716020000_preproject_crm_authority.sql \
  20260716030000_preproject_project_origin_authority.sql
do
  docker exec "${container_name}" \
    psql --username postgres --dbname postgres --set ON_ERROR_STOP=1 \
    --file "/workspace/supabase/migrations/${migration}" \
    >/dev/null
done

docker exec "${container_name}" \
  psql --username postgres --dbname postgres --set ON_ERROR_STOP=1 \
  --file /workspace/scripts/certification/preproject-project-origin-authority-proof.sql \
  >/dev/null

printf '%s\n' "PostgreSQL 15 pre-project project-origin authority proof: PASS"
