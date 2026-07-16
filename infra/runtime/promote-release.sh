#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/runtime-common.sh"

usage() {
  printf 'Usage: %s --release <release-id> --expected-current <release-id|none> [--canary-port <port>]\n' "${0##*/}"
}

RELEASE_ID=""
EXPECTED_CURRENT=""
CANARY_PORT="$DEFAULT_CANARY_PORT"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --release) [[ $# -ge 2 ]] || fail "--release needs a value"; RELEASE_ID="$2"; shift 2 ;;
    --expected-current) [[ $# -ge 2 ]] || fail "--expected-current needs a value"; EXPECTED_CURRENT="$2"; shift 2 ;;
    --canary-port) [[ $# -ge 2 ]] || fail "--canary-port needs a value"; CANARY_PORT="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) usage >&2; fail "unknown argument: $1" ;;
  esac
done

[[ -n "$RELEASE_ID" && -n "$EXPECTED_CURRENT" ]] || { usage >&2; exit 2; }
validate_release_id "$RELEASE_ID"
if [[ "$EXPECTED_CURRENT" != "none" ]]; then
  validate_release_id "$EXPECTED_CURRENT"
fi
validate_port "$CANARY_PORT"
[[ "$CANARY_PORT" != "$PRODUCTION_PORT" ]] || fail "canary port must differ from production port"
require_runtime_user
require_pinned_node
ensure_runtime_directories
validate_release "$RELEASE_ID"

observed_current="$(current_release_id)"
observed_current="${observed_current:-none}"
[[ "$observed_current" == "$EXPECTED_CURRENT" ]] || \
  fail "current release is $observed_current, not expected $EXPECTED_CURRENT"
[[ "$observed_current" != "$RELEASE_ID" ]] || fail "release $RELEASE_ID is already current"
if [[ "$observed_current" != "none" ]]; then
  validate_release "$observed_current"
fi

if [[ "$RUNTIME_TEST_MODE" == "1" && -n "${CODELIVER_TEST_CANARY_COMMAND:-}" ]]; then
  "$CODELIVER_TEST_CANARY_COMMAND" --release "$RELEASE_ID" --port "$CANARY_PORT"
else
  "$SCRIPT_DIR/canary-release.sh" --release "$RELEASE_ID" --port "$CANARY_PORT"
fi

LOCK_HELD=0
release_lock_on_exit() {
  if [[ "$LOCK_HELD" == "1" ]]; then
    /bin/rmdir "$PROMOTION_LOCK" 2>/dev/null || true
  fi
}
trap release_lock_on_exit EXIT INT TERM
acquire_promotion_lock
LOCK_HELD=1

observed_current="$(current_release_id)"
observed_current="${observed_current:-none}"
[[ "$observed_current" == "$EXPECTED_CURRENT" ]] || \
  fail "current release changed during canary: now $observed_current"

if [[ "$observed_current" != "none" ]]; then
  atomic_release_link "$(release_dir_for "$observed_current")" "$PREVIOUS_LINK" previous
fi
atomic_release_link "$(release_dir_for "$RELEASE_ID")" "$CURRENT_LINK" current

RELEASE_DIR="$(release_dir_for "$RELEASE_ID")"
RELEASE_SHA="$(manifest_value "$RELEASE_DIR/.codeliver-release" git_sha)"
RECEIPT="$(write_activation_receipt promotion "$observed_current" "$RELEASE_ID" "$RELEASE_SHA")"
release_promotion_lock
LOCK_HELD=0
trap - EXIT INT TERM

printf 'PASS: current now selects %s atomically; releases are preserved. Receipt: %s\n' "$RELEASE_ID" "$RECEIPT"
printf 'The launchd service was not changed. Run restart-runtime.sh in a separately approved live-service step.\n'
