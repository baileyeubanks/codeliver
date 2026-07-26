#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/runtime-common.sh"

[[ $# -eq 0 ]] || fail "run-current.sh accepts no arguments"
RELEASE_ID="$(current_release_id)"
[[ -n "$RELEASE_ID" ]] || fail "no current release has been selected"

exec "$SCRIPT_DIR/run-release.sh" --release "$RELEASE_ID" --port "$PRODUCTION_PORT"
