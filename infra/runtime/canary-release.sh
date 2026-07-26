#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/runtime-common.sh"

usage() {
  printf 'Usage: %s --release <release-id> [--port <port>]\n' "${0##*/}"
}

RELEASE_ID=""
CANARY_PORT="$DEFAULT_CANARY_PORT"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --release) [[ $# -ge 2 ]] || fail "--release needs a value"; RELEASE_ID="$2"; shift 2 ;;
    --port) [[ $# -ge 2 ]] || fail "--port needs a value"; CANARY_PORT="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) usage >&2; fail "unknown argument: $1" ;;
  esac
done

[[ -n "$RELEASE_ID" ]] || { usage >&2; exit 2; }
validate_release_id "$RELEASE_ID"
validate_port "$CANARY_PORT"
[[ "$CANARY_PORT" != "$PRODUCTION_PORT" ]] || fail "canary port must differ from production port $PRODUCTION_PORT"
require_runtime_user
require_pinned_node
load_runtime_env
require_storage_ready
validate_release "$RELEASE_ID"
ensure_runtime_directories
require_command lsof

if lsof -nP -iTCP:"$CANARY_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  fail "canary port $CANARY_PORT is already in use"
fi

RELEASE_DIR="$(release_dir_for "$RELEASE_ID")"
RELEASE_SHA="$(manifest_value "$RELEASE_DIR/.codeliver-release" git_sha)"
LOG_PREFIX="$CANARY_LOG_ROOT/$(utc_timestamp)-$RELEASE_ID-$CANARY_PORT-$$"
CANARY_PID=""

stop_canary() {
  if [[ -n "$CANARY_PID" ]] && kill -0 "$CANARY_PID" >/dev/null 2>&1; then
    kill -TERM "$CANARY_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "$CANARY_PID" ]]; then
    wait "$CANARY_PID" >/dev/null 2>&1 || true
  fi
}
trap stop_canary EXIT INT TERM

"$NODE_BIN" "$SCRIPT_DIR/lib/canary-supervisor.mjs" \
  "$SCRIPT_DIR/run-release.sh" --release "$RELEASE_ID" --port "$CANARY_PORT" \
  >"$LOG_PREFIX.stdout.log" 2>"$LOG_PREFIX.stderr.log" &
CANARY_PID=$!

if ! "$SCRIPT_DIR/verify-health.sh" --port "$CANARY_PORT" --expected-release "$RELEASE_SHA" --attempts 30 --delay 1; then
  printf 'Canary logs preserved at %s.stdout.log and %s.stderr.log\n' "$LOG_PREFIX" "$LOG_PREFIX" >&2
  exit 1
fi

stop_canary
CANARY_PID=""
trap - EXIT INT TERM
printf 'PASS: release %s passed the loopback canary on port %s; logs preserved at %s.*.log\n' \
  "$RELEASE_ID" "$CANARY_PORT" "$LOG_PREFIX"
