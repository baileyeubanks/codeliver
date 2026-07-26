#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/runtime-common.sh"

usage() {
  printf 'Usage: %s --release <release-id> --port <port>\n' "${0##*/}"
}

RELEASE_ID=""
RUN_PORT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --release) [[ $# -ge 2 ]] || fail "--release needs a value"; RELEASE_ID="$2"; shift 2 ;;
    --port) [[ $# -ge 2 ]] || fail "--port needs a value"; RUN_PORT="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) usage >&2; fail "unknown argument: $1" ;;
  esac
done

[[ -n "$RELEASE_ID" && -n "$RUN_PORT" ]] || { usage >&2; exit 2; }
validate_release_id "$RELEASE_ID"
validate_port "$RUN_PORT"
require_runtime_user
require_pinned_node
load_runtime_env
require_storage_ready
validate_release "$RELEASE_ID"

RELEASE_DIR="$(release_dir_for "$RELEASE_ID")"
RELEASE_SHA="$(manifest_value "$RELEASE_DIR/.codeliver-release" git_sha)"

export NODE_ENV=production
export PORT="$RUN_PORT"
export CODELIVER_BIND_HOST="$BIND_HOST"
export GIT_SHA="$RELEASE_SHA"
export CODELIVER_RELEASE_ID="$RELEASE_ID"
export PATH="${NODE_BIN%/node}:/usr/bin:/bin:/usr/sbin:/sbin"
unset VERCEL_GIT_COMMIT_SHA

cd "$RELEASE_DIR"
exec "$NODE_BIN" "$NPM_CLI_JS" run start -- --hostname 127.0.0.1
