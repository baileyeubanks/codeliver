#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/runtime-common.sh"

usage() {
  printf 'Usage: %s --from <current-release-id> --to <previous-release-id> [--canary-port <port>]\n' "${0##*/}"
}

FROM_RELEASE=""
TO_RELEASE=""
CANARY_PORT="$DEFAULT_CANARY_PORT"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --from) [[ $# -ge 2 ]] || fail "--from needs a value"; FROM_RELEASE="$2"; shift 2 ;;
    --to) [[ $# -ge 2 ]] || fail "--to needs a value"; TO_RELEASE="$2"; shift 2 ;;
    --canary-port) [[ $# -ge 2 ]] || fail "--canary-port needs a value"; CANARY_PORT="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) usage >&2; fail "unknown argument: $1" ;;
  esac
done

[[ -n "$FROM_RELEASE" && -n "$TO_RELEASE" ]] || { usage >&2; exit 2; }
validate_release_id "$FROM_RELEASE"
validate_release_id "$TO_RELEASE"
[[ "$FROM_RELEASE" != "$TO_RELEASE" ]] || fail "rollback source and target must differ"
validate_port "$CANARY_PORT"
[[ "$CANARY_PORT" != "$PRODUCTION_PORT" ]] || fail "canary port must differ from production port"
require_runtime_user
require_pinned_node
ensure_runtime_directories
validate_release "$FROM_RELEASE"
validate_release "$TO_RELEASE"

observed_current="$(current_release_id)"
observed_previous="$(previous_release_id)"
[[ "$observed_current" == "$FROM_RELEASE" ]] || fail "current release is $observed_current, not explicit --from $FROM_RELEASE"
[[ "$observed_previous" == "$TO_RELEASE" ]] || fail "previous release is $observed_previous, not explicit --to $TO_RELEASE"

if [[ "$RUNTIME_TEST_MODE" == "1" && -n "${CODELIVER_TEST_CANARY_COMMAND:-}" ]]; then
  "$CODELIVER_TEST_CANARY_COMMAND" --release "$TO_RELEASE" --port "$CANARY_PORT"
else
  "$SCRIPT_DIR/canary-release.sh" --release "$TO_RELEASE" --port "$CANARY_PORT"
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

[[ "$(current_release_id)" == "$FROM_RELEASE" ]] || fail "current release changed during rollback canary"
[[ "$(previous_release_id)" == "$TO_RELEASE" ]] || fail "previous release changed during rollback canary"

atomic_release_link "$(release_dir_for "$FROM_RELEASE")" "$PREVIOUS_LINK" previous
atomic_release_link "$(release_dir_for "$TO_RELEASE")" "$CURRENT_LINK" current

TO_DIR="$(release_dir_for "$TO_RELEASE")"
TO_SHA="$(manifest_value "$TO_DIR/.codeliver-release" git_sha)"
RECEIPT="$(write_activation_receipt rollback "$FROM_RELEASE" "$TO_RELEASE" "$TO_SHA")"
release_promotion_lock
LOCK_HELD=0
trap - EXIT INT TERM

printf 'PASS: current rolled back atomically from %s to %s; both releases are preserved. Receipt: %s\n' \
  "$FROM_RELEASE" "$TO_RELEASE" "$RECEIPT"
printf 'The launchd service was not changed. Run restart-runtime.sh in a separately approved live-service step.\n'
