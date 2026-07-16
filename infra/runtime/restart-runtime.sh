#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/runtime-common.sh"

[[ $# -eq 0 ]] || fail "restart-runtime.sh accepts no arguments"
require_runtime_user
require_pinned_node
load_runtime_env
require_storage_ready

RELEASE_ID="$(current_release_id)"
[[ -n "$RELEASE_ID" ]] || fail "no current release is selected"
validate_release "$RELEASE_ID"
RELEASE_DIR="$(release_dir_for "$RELEASE_ID")"
RELEASE_SHA="$(manifest_value "$RELEASE_DIR/.codeliver-release" git_sha)"
LAUNCH_DOMAIN="gui/$(id -u)"

/bin/launchctl print "$LAUNCH_DOMAIN/$LAUNCHD_LABEL" >/dev/null 2>&1 || \
  fail "$LAUNCHD_LABEL is not loaded in $LAUNCH_DOMAIN"
/bin/launchctl kickstart -k "$LAUNCH_DOMAIN/$LAUNCHD_LABEL"

if ! "$SCRIPT_DIR/verify-health.sh" --port "$PRODUCTION_PORT" --expected-release "$RELEASE_SHA" --attempts 30 --delay 1; then
  PREVIOUS_ID="$(previous_release_id)"
  printf 'Runtime verification failed after restart. No automatic rollback was attempted.\n' >&2
  if [[ -n "$PREVIOUS_ID" ]]; then
    printf 'Explicit rollback selection: %s/rollback-release.sh --from %s --to %s\n' \
      "$SCRIPT_DIR" "$RELEASE_ID" "$PREVIOUS_ID" >&2
  fi
  exit 1
fi

printf 'PASS: %s restarted and release %s is ready on loopback port %s.\n' \
  "$LAUNCHD_LABEL" "$RELEASE_ID" "$PRODUCTION_PORT"
