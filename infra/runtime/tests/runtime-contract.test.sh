#!/usr/bin/env bash
set -euo pipefail

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_DIR="$(cd "$TEST_DIR/.." && pwd)"
SYSTEM_NODE="$(command -v node)"
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/codeliver-runtime-test.XXXXXX")"
PIDS=""

cleanup() {
  local pid
  for pid in $PIDS; do
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill -TERM "$pid" >/dev/null 2>&1 || true
      wait "$pid" >/dev/null 2>&1 || true
    fi
  done
  /bin/chmod -R u+w "$TMP_ROOT" >/dev/null 2>&1 || true
  /bin/rm -rf "$TMP_ROOT"
}
trap cleanup EXIT INT TERM

fail_test() {
  printf 'runtime-test: %s\n' "$*" >&2
  exit 1
}

"$RUNTIME_DIR/validate-static.sh"

FAKE_NODE="$TMP_ROOT/node-v24.14.1"
{
  printf '%s\n' '#!/usr/bin/env bash'
  printf '%s\n' 'if [[ "${1:-}" == "--version" ]]; then'
  printf '%s\n' '  printf "v24.14.1\\n"'
  printf '%s\n' '  exit 0'
  printf '%s\n' 'fi'
  printf 'exec %q "$@"\n' "$SYSTEM_NODE"
} >"$FAKE_NODE"
/bin/chmod 0755 "$FAKE_NODE"
FAKE_NPM="$TMP_ROOT/npm-cli.js"
printf '%s\n' '// test-only readable npm CLI placeholder' >"$FAKE_NPM"

APP_ROOT="$TMP_ROOT/app"
STORAGE_MOUNT="$TMP_ROOT/BLAZE-STORE-2"
STORAGE_ROOT="$STORAGE_MOUNT/media-vault/co-deliver"
ENV_FILE="$TMP_ROOT/runtime.env"
/bin/mkdir -p "$STORAGE_ROOT"

write_env() {
  local path="$1"
  local media_root="$2"
  {
    printf '%s\n' 'NODE_ENV=production'
    printf '%s\n' 'PORT=4103'
    printf '%s\n' 'CODELIVER_BIND_HOST=127.0.0.1'
    printf '%s\n' 'ADMIN_SITE_URL=https://admin.contentco-op.com'
    printf '%s\n' 'NEXT_PUBLIC_ADMIN_SITE_URL=https://admin.contentco-op.com'
    printf '%s\n' 'CLIENT_SITE_URL=https://client.contentco-op.com'
    printf '%s\n' 'NEXT_PUBLIC_CLIENT_SITE_URL=https://client.contentco-op.com'
    printf '%s\n' 'NEXT_PUBLIC_SUPABASE_URL=https://example.invalid'
    printf '%s\n' 'NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key'
    printf '%s\n' 'SUPABASE_URL=https://example.invalid'
    printf '%s\n' 'SUPABASE_SERVICE_KEY=test-service-key'
    printf '%s\n' 'CODELIVER_STORAGE_PROVIDER=ccnas'
    printf '%s\n' 'CODELIVER_STORAGE_WRITE_ENABLED=1'
    printf '%s\n' 'CODELIVER_HEALTH_REMOTE_PROBES=1'
    printf 'NAS_MEDIA_ROOT=%s\n' "$media_root"
    printf '%s\n' 'CODELIVER_REQUIRE_NOTIFICATIONS=0'
    printf '%s\n' 'RESEND_API_KEY='
  } >"$path"
  /bin/chmod 0600 "$path"
}
write_env "$ENV_FILE" "$STORAGE_ROOT"

BASE_ENV=(
  "CODELIVER_RUNTIME_TEST_MODE=1"
  "CODELIVER_APP_ROOT=$APP_ROOT"
  "CODELIVER_ENV_FILE=$ENV_FILE"
  "CODELIVER_NODE_BIN=$FAKE_NODE"
  "CODELIVER_NPM_CLI_JS=$FAKE_NPM"
  "CODELIVER_EXPECTED_RUNTIME_USER=$(id -un)"
  "CODELIVER_EXPECTED_STORAGE_MOUNT=$STORAGE_MOUNT"
  "CODELIVER_EXPECTED_STORAGE_ROOT=$STORAGE_ROOT"
)

env "${BASE_ENV[@]}" CODELIVER_TEST_ASSUME_MOUNTED=1 /bin/bash -c \
  'source "$1"; load_runtime_env; require_storage_ready' _ "$RUNTIME_DIR/lib/runtime-common.sh"

if env "${BASE_ENV[@]}" /bin/bash -c \
  'source "$1"; load_runtime_env; require_storage_ready' _ "$RUNTIME_DIR/lib/runtime-common.sh" >/dev/null 2>&1; then
  fail_test "storage preflight accepted a directory that is not mounted"
fi

MISSING_ENV="$TMP_ROOT/missing-storage.env"
MISSING_ROOT="$STORAGE_MOUNT/media-vault/missing-co-deliver"
write_env "$MISSING_ENV" "$MISSING_ROOT"
if env "${BASE_ENV[@]}" CODELIVER_ENV_FILE="$MISSING_ENV" CODELIVER_EXPECTED_STORAGE_ROOT="$MISSING_ROOT" \
  CODELIVER_TEST_ASSUME_MOUNTED=1 /bin/bash -c \
  'source "$1"; load_runtime_env; require_storage_ready' _ "$RUNTIME_DIR/lib/runtime-common.sh" >/dev/null 2>&1; then
  fail_test "storage preflight accepted a missing NAS_MEDIA_ROOT"
fi

/bin/chmod 0644 "$ENV_FILE"
if env "${BASE_ENV[@]}" CODELIVER_TEST_ASSUME_MOUNTED=1 /bin/bash -c \
  'source "$1"; load_runtime_env' _ "$RUNTIME_DIR/lib/runtime-common.sh" >/dev/null 2>&1; then
  fail_test "runtime env preflight accepted mode 0644"
fi
/bin/chmod 0600 "$ENV_FILE"

PRODUCTION_ROOT="$(CODELIVER_RUNTIME_TEST_MODE=0 CODELIVER_APP_ROOT=/tmp/forbidden-override /bin/bash -c \
  'source "$1"; CODELIVER_RUNTIME_TEST_MODE=1; printf "%s|%s" "$APP_ROOT" "$RUNTIME_TEST_MODE"' _ "$RUNTIME_DIR/lib/runtime-common.sh")"
[[ "$PRODUCTION_ROOT" == "/Users/_mxappservice/Projects/platform/codeliver|0" ]] || \
  fail_test "production constants or test-mode decision accepted an environment override"

SHA_A="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
SHA_B="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
create_release_fixture() {
  local release_id="$1"
  local sha="$2"
  local release_dir="$APP_ROOT/releases/$release_id"
  local cache_dir="$APP_ROOT/state/cache/$release_id"
  /bin/mkdir -p "$release_dir/.next" "$release_dir/node_modules/next/dist/bin" "$cache_dir"
  printf '{"name":"co-deliver"}\n' >"$release_dir/package.json"
  printf '{}\n' >"$release_dir/package-lock.json"
  printf '%s\n' "build-$release_id" >"$release_dir/.next/BUILD_ID"
  printf '%s\n' '#!/usr/bin/env node' >"$release_dir/node_modules/next/dist/bin/next"
  /bin/chmod 0755 "$release_dir/node_modules/next/dist/bin/next"
  /bin/ln -s "$cache_dir" "$release_dir/.next/cache"
  printf 'release_id=%s\ngit_sha=%s\nnode_version=v24.14.1\nbuilt_at=20260715T000000Z\npackage_lock_sha256=test\n' \
    "$release_id" "$sha" >"$release_dir/.codeliver-release"
  /usr/bin/find "$release_dir" -type d -exec /bin/chmod a-w {} +
  /usr/bin/find "$release_dir" -type f -exec /bin/chmod a-w {} +
}

/bin/mkdir -p "$APP_ROOT/releases" "$APP_ROOT/state/cache"
create_release_fixture release-a "$SHA_A"
create_release_fixture release-b "$SHA_B"

SWITCH_ENV=("${BASE_ENV[@]}" "CODELIVER_TEST_CANARY_COMMAND=/usr/bin/true")
env "${SWITCH_ENV[@]}" "$RUNTIME_DIR/promote-release.sh" --release release-a --expected-current none >/dev/null
[[ "$(/usr/bin/readlink "$APP_ROOT/current")" == "$APP_ROOT/releases/release-a" ]] || fail_test "initial current link is wrong"

env "${SWITCH_ENV[@]}" "$RUNTIME_DIR/promote-release.sh" --release release-b --expected-current release-a >/dev/null
[[ "$(/usr/bin/readlink "$APP_ROOT/current")" == "$APP_ROOT/releases/release-b" ]] || fail_test "promoted current link is wrong"
[[ "$(/usr/bin/readlink "$APP_ROOT/previous")" == "$APP_ROOT/releases/release-a" ]] || fail_test "promoted previous link is wrong"

if env "${SWITCH_ENV[@]}" "$RUNTIME_DIR/promote-release.sh" --release release-a --expected-current none >/dev/null 2>&1; then
  fail_test "promotion accepted a stale expected-current value"
fi

env "${SWITCH_ENV[@]}" "$RUNTIME_DIR/rollback-release.sh" --from release-b --to release-a >/dev/null
[[ "$(/usr/bin/readlink "$APP_ROOT/current")" == "$APP_ROOT/releases/release-a" ]] || fail_test "rollback current link is wrong"
[[ "$(/usr/bin/readlink "$APP_ROOT/previous")" == "$APP_ROOT/releases/release-b" ]] || fail_test "rollback previous link is wrong"
[[ -d "$APP_ROOT/releases/release-a" && -d "$APP_ROOT/releases/release-b" ]] || fail_test "rollback did not preserve releases"
RECEIPT_COUNT="$(/usr/bin/find "$APP_ROOT/activation-receipts" -type f -name '*.env' | /usr/bin/wc -l | /usr/bin/tr -d ' ')"
[[ "$RECEIPT_COUNT" == "3" ]] || fail_test "expected three immutable activation receipts, found $RECEIPT_COUNT"

start_mock() {
  local mode="$1"
  local release="$2"
  local prefix="$TMP_ROOT/mock-$mode-$RANDOM"
  "$SYSTEM_NODE" "$TEST_DIR/mock-codeliver-health.mjs" 0 "$release" "$mode" >"$prefix.port" 2>"$prefix.err" &
  MOCK_PID=$!
  PIDS="$PIDS $MOCK_PID"
  MOCK_PORT=""
  local attempt=0
  while (( attempt < 100 )); do
    if [[ -s "$prefix.port" ]]; then
      MOCK_PORT="$(/usr/bin/sed -n '1p' "$prefix.port")"
      break
    fi
    kill -0 "$MOCK_PID" >/dev/null 2>&1 || fail_test "mock health server exited early"
    /bin/sleep 0.05
    attempt=$((attempt + 1))
  done
  [[ "$MOCK_PORT" =~ ^[0-9]+$ ]] || fail_test "mock health server did not report a port"
}

stop_mock() {
  kill -TERM "$MOCK_PID" >/dev/null 2>&1 || true
  wait "$MOCK_PID" >/dev/null 2>&1 || true
}

start_mock ready "$SHA_A"
env "${BASE_ENV[@]}" "$RUNTIME_DIR/verify-health.sh" --port "$MOCK_PORT" --expected-release "$SHA_A" >/dev/null
stop_mock

start_mock client-not-ready "$SHA_A"
if env "${BASE_ENV[@]}" "$RUNTIME_DIR/verify-health.sh" --port "$MOCK_PORT" --expected-release "$SHA_A" >/dev/null 2>&1; then
  fail_test "health verification accepted a non-ready client Host"
fi
stop_mock

TREE_RUNNER="$TMP_ROOT/process-tree-runner.sh"
TREE_CHILD_FILE="$TMP_ROOT/process-tree-child.pid"
{
  printf '%s\n' '#!/usr/bin/env bash'
  printf '%s\n' '/bin/sleep 300 &'
  printf '%s\n' 'printf "%s\\n" "$!" >"$1"'
  printf '%s\n' 'wait'
} >"$TREE_RUNNER"
/bin/chmod 0755 "$TREE_RUNNER"
"$SYSTEM_NODE" "$RUNTIME_DIR/lib/canary-supervisor.mjs" "$TREE_RUNNER" "$TREE_CHILD_FILE" \
  >"$TMP_ROOT/process-tree.out" 2>"$TMP_ROOT/process-tree.err" &
SUPERVISOR_PID=$!
PIDS="$PIDS $SUPERVISOR_PID"
attempt=0
while [[ ! -s "$TREE_CHILD_FILE" && "$attempt" -lt 100 ]]; do
  kill -0 "$SUPERVISOR_PID" >/dev/null 2>&1 || fail_test "canary supervisor exited before its child started"
  /bin/sleep 0.05
  attempt=$((attempt + 1))
done
[[ -s "$TREE_CHILD_FILE" ]] || fail_test "canary supervisor child did not report its PID"
TREE_CHILD_PID="$(/usr/bin/sed -n '1p' "$TREE_CHILD_FILE")"
kill -TERM "$SUPERVISOR_PID"
wait "$SUPERVISOR_PID" >/dev/null 2>&1 || true
attempt=0
while kill -0 "$TREE_CHILD_PID" >/dev/null 2>&1 && [[ "$attempt" -lt 100 ]]; do
  /bin/sleep 0.05
  attempt=$((attempt + 1))
done
if kill -0 "$TREE_CHILD_PID" >/dev/null 2>&1; then
  fail_test "canary supervisor left a child process running"
fi

printf 'PASS: runtime shell tests cover env permissions, mounted storage, immutable links, explicit rollback, exact Hosts, and fail-closed readiness.\n'
