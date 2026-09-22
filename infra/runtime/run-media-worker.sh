#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/runtime-common.sh"

[[ $# -eq 0 ]] || fail "run-media-worker.sh accepts no arguments"
require_runtime_user
require_pinned_node
load_runtime_env
require_storage_ready
require_configured_value CODELIVER_MEDIA_PIPELINE_WORKER_TOKEN

export CODELIVER_WORKER_ORIGIN="http://127.0.0.1:$PRODUCTION_PORT"
export CODELIVER_WORKER_HOST="$ADMIN_HOST"
exec "$NODE_BIN" "$SCRIPT_DIR/lib/media-worker-loop.mjs"
