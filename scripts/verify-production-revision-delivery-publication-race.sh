#!/usr/bin/env bash
# Runs one deterministic two-session publication-lock race against a disposable,
# already-migrated CCO-DB fixture. It never starts a database, applies a
# migration, or creates fixture records. Give every case a fresh unlocked asset
# and deliverable fixture because successful cases intentionally change state.
#
# Required environment (never echoed):
#   CVP_RACE_DATABASE_URL, CVP_RACE_CASE, CVP_RACE_ACTOR_ID,
#   CVP_RACE_PROJECT_ID, CVP_RACE_ASSET_ID,
#   CVP_RACE_CURRENT_VERSION_ID, CVP_RACE_CURRENT_VERSION_NUMBER,
#   CVP_RACE_DELIVERABLE_IDS
#
# Cases: revision-first, lock-first, multi-row, rollback, unsupported-isolation
# `CVP_RACE_DELIVERABLE_IDS` is one UUID for all but multi-row, which requires
# two comma-separated unlocked deliverables in the same project. The fixture
# must grant the actor editor authority and bind its current version to each
# delivery item that the harness inserts.

set -euo pipefail

required=(
  CVP_RACE_DATABASE_URL CVP_RACE_CASE CVP_RACE_ACTOR_ID CVP_RACE_PROJECT_ID
  CVP_RACE_ASSET_ID CVP_RACE_CURRENT_VERSION_ID CVP_RACE_CURRENT_VERSION_NUMBER
  CVP_RACE_DELIVERABLE_IDS
)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    printf 'missing required environment: %s\n' "$name" >&2
    exit 64
  fi
done
command -v psql >/dev/null || { printf 'psql is required for this harness\n' >&2; exit 69; }

case "$CVP_RACE_CASE" in
  revision-first|lock-first|multi-row|rollback|unsupported-isolation) ;;
  *) printf 'unsupported CVP_RACE_CASE\n' >&2; exit 64 ;;
esac

if [[ "$CVP_RACE_CASE" == "multi-row" && "$CVP_RACE_DELIVERABLE_IDS" != *,* ]]; then
  printf 'multi-row requires two comma-separated deliverable ids\n' >&2
  exit 64
fi

run_id="$(node -e 'console.log(crypto.randomUUID())')"
upload_id="$(node -e 'console.log(crypto.randomUUID())')"
expected_version="$((CVP_RACE_CURRENT_VERSION_NUMBER + 1))"
object_key="race-publication/${run_id}"
provider_version="race-${run_id}"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

psql_args=(
  "$CVP_RACE_DATABASE_URL" -X -v ON_ERROR_STOP=1 -v VERBOSITY=verbose
  -v actor_id="$CVP_RACE_ACTOR_ID" -v upload_id="$upload_id"
  -v project_id="$CVP_RACE_PROJECT_ID" -v asset_id="$CVP_RACE_ASSET_ID"
  -v current_version_id="$CVP_RACE_CURRENT_VERSION_ID"
  -v expected_version="$expected_version" -v object_key="$object_key"
  -v provider_version="$provider_version" -v deliverable_ids="$CVP_RACE_DELIVERABLE_IDS"
)

revision_sql() {
  cat <<'SQL'
SELECT * FROM co_production.attach_committed_upload_revision(
  :'actor_id'::uuid, :'upload_id'::uuid, :'asset_id'::uuid, :'project_id'::uuid,
  :'current_version_id'::uuid, :'expected_version'::integer,
  'race-revision.mp4', 'video/mp4', 1024, 'local', :'object_key',
  repeat('a', 64), :'provider_version', pg_catalog.clock_timestamp()
);
SQL
}

delivery_lock_sql() {
  cat <<'SQL'
INSERT INTO co_production.deliverable_items (deliverable_id, asset_id, version_id)
SELECT item_id::uuid, :'asset_id'::uuid, :'current_version_id'::uuid
FROM unnest(string_to_array(:'deliverable_ids', ',')) AS item_id;
UPDATE co_production.deliverables
SET locked_at = pg_catalog.clock_timestamp()
WHERE id::text = ANY(string_to_array(:'deliverable_ids', ','));
SQL
}

wait_for_marker() {
  local marker="$1" file="$2"
  for _ in {1..100}; do
    grep -q "$marker" "$file" 2>/dev/null && return 0
    sleep 0.05
  done
  cat "$file" >&2 || true
  printf 'timed out waiting for %s\n' "$marker" >&2
  return 1
}

start_session() {
  local file="$1" sql="$2"
  printf '%s\n' "$sql" | psql "${psql_args[@]}" >"$file" 2>&1 &
  SESSION_PID="$!"
}

case "$CVP_RACE_CASE" in
  revision-first)
    revision_a=$'BEGIN;\n'"$(revision_sql)"$'\nSELECT \'REVISION_GATE_HELD\';\nSELECT pg_catalog.pg_sleep(2);\nCOMMIT;'
    start_session "$work_dir/a.log" "$revision_a"
    a_pid="$SESSION_PID"
    wait_for_marker REVISION_GATE_HELD "$work_dir/a.log"
    start_session "$work_dir/b.log" $'BEGIN;\n'"$(delivery_lock_sql)"$'\nCOMMIT;'
    b_pid="$SESSION_PID"
    wait "$a_pid" && wait "$b_pid"
    grep -q 'COMMIT' "$work_dir/a.log" && grep -q 'COMMIT' "$work_dir/b.log"
    ;;
  lock-first|multi-row)
    lock_b=$'BEGIN;\n'"$(delivery_lock_sql)"$'\nSELECT \'LOCK_GATE_HELD\';\nSELECT pg_catalog.pg_sleep(2);\nCOMMIT;'
    start_session "$work_dir/b.log" "$lock_b"
    b_pid="$SESSION_PID"
    wait_for_marker LOCK_GATE_HELD "$work_dir/b.log"
    if printf 'BEGIN;\n%s\nCOMMIT;\n' "$(revision_sql)" | psql "${psql_args[@]}" >"$work_dir/a.log" 2>&1; then
      printf 'revision unexpectedly attached after delivery lock\n' >&2
      exit 1
    fi
    wait "$b_pid"
    grep -q '23514' "$work_dir/a.log"
    ;;
  rollback)
    rollback_a=$'BEGIN;\n'"$(revision_sql)"$'\nSELECT \'REVISION_GATE_HELD\';\nSELECT pg_catalog.pg_sleep(2);\nROLLBACK;'
    start_session "$work_dir/a.log" "$rollback_a"
    a_pid="$SESSION_PID"
    wait_for_marker REVISION_GATE_HELD "$work_dir/a.log"
    start_session "$work_dir/b.log" $'BEGIN;\n'"$(delivery_lock_sql)"$'\nCOMMIT;'
    b_pid="$SESSION_PID"
    wait "$a_pid" && wait "$b_pid"
    psql "${psql_args[@]}" -tAc "SELECT count(*) FROM co_production.versions WHERE source_upload_id = :'upload_id'::uuid" \
      | grep -qx '0'
    ;;
  unsupported-isolation)
    if printf 'BEGIN ISOLATION LEVEL REPEATABLE READ;\n%s\nROLLBACK;\n' "$(revision_sql)" \
      | psql "${psql_args[@]}" >"$work_dir/revision.log" 2>&1; then
      printf 'revision unexpectedly accepted REPEATABLE READ\n' >&2
      exit 1
    fi
    if printf 'BEGIN ISOLATION LEVEL REPEATABLE READ;\n%s\nROLLBACK;\n' "$(delivery_lock_sql)" \
      | psql "${psql_args[@]}" >"$work_dir/delivery.log" 2>&1; then
      printf 'delivery mutation unexpectedly accepted REPEATABLE READ\n' >&2
      exit 1
    fi
    grep -q '25000' "$work_dir/revision.log"
    grep -q '25000' "$work_dir/delivery.log"
    ;;
esac

printf 'publication race case passed: %s\n' "$CVP_RACE_CASE"
