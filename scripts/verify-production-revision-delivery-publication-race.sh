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
# CVP_RACE_DELIVERABLE_IDS is one UUID for all but multi-row, which requires
# two comma-separated unlocked deliverables in the same project. The fixture
# must grant the actor editor authority and bind its current version to each
# delivery item that the harness inserts.
# The disposable test role also needs ordinary pg_locks/pg_stat_activity
# visibility for its own psql sessions; the harness refuses to claim a race
# pass until it observes the contender waiting on an advisory lock.

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
holder_app="cvp-race-${run_id}-holder"
contender_app="cvp-race-${run_id}-contender"
if (( ${#holder_app} > 63 || ${#contender_app} > 63 )); then
  printf 'race session application name exceeds PostgreSQL NAMEDATALEN\n' >&2
  exit 70
fi
work_dir="$(mktemp -d)"
gate_in="$work_dir/gate.in"
gate_pid=""
holder_pid=""
contender_pid=""

action_cleanup() {
  # Only terminate processes this harness started; it deliberately never
  # deletes fixture data because callers provide the disposable fixture.
  exec 3>&- 2>/dev/null || true
  for pid in "$contender_pid" "$holder_pid" "$gate_pid"; do
    [[ -n "$pid" ]] && kill "$pid" 2>/dev/null || true
  done
  rm -rf "$work_dir"
}
trap action_cleanup EXIT INT TERM

psql_args=(
  "$CVP_RACE_DATABASE_URL" -X -v ON_ERROR_STOP=1 -v VERBOSITY=verbose
  -v actor_id="$CVP_RACE_ACTOR_ID" -v upload_id="$upload_id"
  -v project_id="$CVP_RACE_PROJECT_ID" -v asset_id="$CVP_RACE_ASSET_ID"
  -v current_version_id="$CVP_RACE_CURRENT_VERSION_ID"
  -v expected_version="$expected_version" -v object_key="$object_key"
  -v provider_version="$provider_version" -v deliverable_ids="$CVP_RACE_DELIVERABLE_IDS"
  -v run_id="$run_id"
  -v holder_app="$holder_app"
  -v contender_app="$contender_app"
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
  for _ in {1..200}; do
    grep -q "$marker" "$file" 2>/dev/null && return 0
    sleep 0.025
  done
  cat "$file" >&2 || true
  printf 'timed out waiting for %s\n' "$marker" >&2
  return 1
}

assert_not_passed() {
  local file="$1"
  if grep -q CONTENDER_GATE_PASSED "$file" 2>/dev/null; then
    cat "$file" >&2 || true
    printf 'contender passed the publication gate before holder release\n' >&2
    exit 1
  fi
}

start_session() {
  local label="$1" file="$2" sql="$3"
  local app_name
  case "$label" in
    holder) app_name="$holder_app" ;;
    contender) app_name="$contender_app" ;;
    *) printf 'unsupported race session label: %s\n' "$label" >&2; return 64 ;;
  esac
  printf '%s\n' "$sql" | PGAPPNAME="$app_name" psql "${psql_args[@]}" >"$file" 2>&1 &
  SESSION_PID="$!"
}

wait_for_contender_block() {
  for _ in {1..200}; do
    if contender_waits_on_holder | grep -qx 't'; then
      return 0
    fi
    sleep 0.025
  done
  cat "$work_dir/contender.log" >&2 || true
  printf 'contender never waited on the publication advisory lock\n' >&2
  return 1
}

contender_waits_on_holder() {
  # The holder owns the shared publication mutex before it waits on the
  # controller-only release gate. Therefore a contender blocked by this holder
  # cannot be waiting on the release gate; it is waiting on the publication
  # mutex the guarded statement acquired first.
  psql "${psql_args[@]}" -tA <<'SQL'
SELECT EXISTS (
  SELECT 1
  FROM pg_catalog.pg_locks AS lock
  JOIN pg_catalog.pg_stat_activity AS activity USING (pid)
  WHERE activity.application_name = :'contender_app'
    AND lock.locktype = 'advisory'
    AND lock.granted = false
    AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_stat_activity AS holder
      WHERE holder.application_name = :'holder_app'
        AND holder.pid = ANY(pg_catalog.pg_blocking_pids(activity.pid))
    )
);
SQL
}

start_controller_gate() {
  mkfifo "$gate_in"
  psql "${psql_args[@]}" <"$gate_in" >"$work_dir/gate.log" 2>&1 &
  gate_pid="$!"
  exec 3>"$gate_in"
  cat >&3 <<'SQL'
BEGIN;
SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('co_production.delivery-publication-harness:' || :'run_id', 0)
);
\echo CONTROLLER_GATE_HELD
SQL
  wait_for_marker CONTROLLER_GATE_HELD "$work_dir/gate.log"
}

release_holder() {
  printf 'COMMIT;\n' >&3
  exec 3>&-
  wait "$gate_pid"
  gate_pid=""
  wait "$holder_pid"
  holder_pid=""
}

holder_sql() {
  local action="$1"
  cat <<SQL
BEGIN;
${action}
\\echo HOLDER_READY
SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('co_production.delivery-publication-harness:' || :'run_id', 0)
);
COMMIT;
SQL
}

rollback_holder_sql() {
  cat <<SQL
BEGIN;
$(revision_sql)
\\echo HOLDER_READY
SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('co_production.delivery-publication-harness:' || :'run_id', 0)
);
ROLLBACK;
SQL
}

contender_sql() {
  local action="$1"
  cat <<SQL
BEGIN;
\\echo CONTENDER_ATTEMPTED
${action}
\\echo CONTENDER_GATE_PASSED
COMMIT;
SQL
}

locked_delivery_count() {
  psql "${psql_args[@]}" -tA <<'SQL'
SELECT count(*)
FROM co_production.deliverables
WHERE id::text = ANY(string_to_array(:'deliverable_ids', ','))
  AND locked_at IS NOT NULL;
SQL
}

source_upload_count() {
  psql "${psql_args[@]}" -tA <<'SQL'
SELECT count(*)
FROM co_production.versions
WHERE source_upload_id = :'upload_id'::uuid;
SQL
}

case "$CVP_RACE_CASE" in
  revision-first)
    start_controller_gate
    start_session holder "$work_dir/holder.log" "$(holder_sql "$(revision_sql)")"
    holder_pid="$SESSION_PID"
    wait_for_marker HOLDER_READY "$work_dir/holder.log"
    start_session contender "$work_dir/contender.log" "$(contender_sql "$(delivery_lock_sql)")"
    contender_pid="$SESSION_PID"
    wait_for_marker CONTENDER_ATTEMPTED "$work_dir/contender.log"
    wait_for_contender_block
    assert_not_passed "$work_dir/contender.log"
    release_holder
    wait "$contender_pid"
    contender_pid=""
    grep -q CONTENDER_GATE_PASSED "$work_dir/contender.log"
    source_upload_count | grep -qx '1'
    locked_delivery_count | grep -qx '1'
    ;;
  lock-first|multi-row)
    start_controller_gate
    start_session holder "$work_dir/holder.log" "$(holder_sql "$(delivery_lock_sql)")"
    holder_pid="$SESSION_PID"
    wait_for_marker HOLDER_READY "$work_dir/holder.log"
    start_session contender "$work_dir/contender.log" "$(contender_sql "$(revision_sql)")"
    contender_pid="$SESSION_PID"
    wait_for_marker CONTENDER_ATTEMPTED "$work_dir/contender.log"
    wait_for_contender_block
    assert_not_passed "$work_dir/contender.log"
    release_holder
    if wait "$contender_pid"; then
      printf 'revision unexpectedly attached after delivery lock\n' >&2
      exit 1
    fi
    contender_pid=""
    grep -q '23514' "$work_dir/contender.log"
    ! grep -q CONTENDER_GATE_PASSED "$work_dir/contender.log"
    source_upload_count | grep -qx '0'
    expected_locked=1
    [[ "$CVP_RACE_CASE" == "multi-row" ]] && expected_locked=2
    locked_delivery_count | grep -qx "$expected_locked"
    ;;
  rollback)
    start_controller_gate
    start_session holder "$work_dir/holder.log" "$(rollback_holder_sql)"
    holder_pid="$SESSION_PID"
    wait_for_marker HOLDER_READY "$work_dir/holder.log"
    start_session contender "$work_dir/contender.log" "$(contender_sql "$(delivery_lock_sql)")"
    contender_pid="$SESSION_PID"
    wait_for_marker CONTENDER_ATTEMPTED "$work_dir/contender.log"
    wait_for_contender_block
    assert_not_passed "$work_dir/contender.log"
    release_holder
    wait "$contender_pid"
    contender_pid=""
    grep -q CONTENDER_GATE_PASSED "$work_dir/contender.log"
    source_upload_count | grep -qx '0'
    locked_delivery_count | grep -qx '1'
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
