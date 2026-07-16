#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PLIST="$SCRIPT_DIR/launchd/com.contentcoop.codeliver-runtime.plist"
ENV_TEMPLATE="$SCRIPT_DIR/runtime.env.example"
COMMON="$SCRIPT_DIR/lib/runtime-common.sh"

fail_static() {
  printf 'runtime-static: %s\n' "$*" >&2
  exit 1
}

require_literal() {
  local file="$1"
  local literal="$2"
  /usr/bin/grep -Fq -- "$literal" "$file" || fail_static "$file is missing required contract: $literal"
}

for required in \
  "$COMMON" \
  "$SCRIPT_DIR/lib/canary-supervisor.mjs" \
  "$ENV_TEMPLATE" \
  "$PLIST" \
  "$SCRIPT_DIR/prepare-release.sh" \
  "$SCRIPT_DIR/run-current.sh" \
  "$SCRIPT_DIR/run-release.sh" \
  "$SCRIPT_DIR/canary-release.sh" \
  "$SCRIPT_DIR/verify-health.sh" \
  "$SCRIPT_DIR/promote-release.sh" \
  "$SCRIPT_DIR/rollback-release.sh" \
  "$SCRIPT_DIR/restart-runtime.sh"
do
  [[ -f "$required" ]] || fail_static "required asset is missing: $required"
done

while IFS= read -r shell_file; do
  /bin/bash -n "$shell_file" || fail_static "shell syntax failed: $shell_file"
done < <(/usr/bin/find "$SCRIPT_DIR" -type f -name '*.sh' -print | /usr/bin/sort)

/usr/bin/plutil -lint "$PLIST" >/dev/null || fail_static "launchd plist is invalid"
plist_value() {
  /usr/bin/plutil -extract "$1" raw -o - "$PLIST" 2>/dev/null || fail_static "missing plist key: $1"
}

[[ "$(plist_value Label)" == "com.contentcoop.codeliver-runtime" ]] || fail_static "launchd label is incorrect"
[[ "$(plist_value ProgramArguments.0)" == "/Users/_mxappservice/Projects/platform/codeliver/control/run-current.sh" ]] || \
  fail_static "launchd program path is incorrect"
if /usr/bin/plutil -extract ProgramArguments.1 raw -o - "$PLIST" >/dev/null 2>&1; then
  fail_static "launchd has an unexpected second program argument"
fi
[[ "$(plist_value RunAtLoad)" == "true" ]] || fail_static "launchd RunAtLoad must be true"
[[ "$(plist_value KeepAlive)" == "true" ]] || fail_static "launchd must restart after every exit"
[[ "$(plist_value ThrottleInterval)" == "15" ]] || fail_static "launchd restart backoff must be 15 seconds"
[[ "$(plist_value ExitTimeOut)" == "45" ]] || fail_static "launchd exit timeout must be 45 seconds"
[[ "$(plist_value ProcessType)" == "Background" ]] || fail_static "launchd process type must be Background"
[[ "$(plist_value Umask)" == "63" ]] || fail_static "launchd umask must be 077"
[[ "$(plist_value EnvironmentVariables.NODE_ENV)" == "production" ]] || fail_static "launchd NODE_ENV must be production"
[[ "$(plist_value EnvironmentVariables.PORT)" == "4103" ]] || fail_static "launchd PORT must be 4103"
[[ "$(plist_value StandardOutPath)" == "/Users/_mxappservice/Library/Logs/Co-Deliver/runtime.stdout.log" ]] || \
  fail_static "launchd stdout path is incorrect"
[[ "$(plist_value StandardErrorPath)" == "/Users/_mxappservice/Library/Logs/Co-Deliver/runtime.stderr.log" ]] || \
  fail_static "launchd stderr path is incorrect"
require_literal "$PLIST" '/Users/_mxappservice/.nvm/versions/node/v24.14.1/bin:/usr/bin:/bin:/usr/sbin:/sbin'

require_literal "$COMMON" 'ENV_FILE="/Users/_mxappservice/.config/blaze-secrets/codeliver/runtime.env"'
require_literal "$COMMON" 'NODE_BIN="/Users/_mxappservice/.nvm/versions/node/v24.14.1/bin/node"'
require_literal "$COMMON" 'EXPECTED_NODE_VERSION="v24.14.1"'
require_literal "$COMMON" 'PRODUCTION_PORT="4103"'
require_literal "$COMMON" 'DEFAULT_CANARY_PORT="${CODELIVER_CANARY_PORT:-4413}"'
require_literal "$COMMON" 'BIND_HOST="127.0.0.1"'
require_literal "$COMMON" 'STORAGE_MOUNT="/Volumes/BLAZE-STORE-2"'
require_literal "$COMMON" 'STORAGE_ROOT="/Volumes/BLAZE-STORE-2/media-vault/co-deliver"'
require_literal "$COMMON" 'fs.renameSync(process.argv[1], process.argv[2])'

for exact_line in \
  'NODE_ENV=production' \
  'PORT=4103' \
  'CODELIVER_BIND_HOST=127.0.0.1' \
  'ADMIN_SITE_URL=https://admin.contentco-op.com' \
  'NEXT_PUBLIC_ADMIN_SITE_URL=https://admin.contentco-op.com' \
  'CLIENT_SITE_URL=https://client.contentco-op.com' \
  'NEXT_PUBLIC_CLIENT_SITE_URL=https://client.contentco-op.com' \
  'CODELIVER_STORAGE_PROVIDER=ccnas' \
  'CODELIVER_STORAGE_WRITE_ENABLED=1' \
  'CODELIVER_HEALTH_REMOTE_PROBES=1' \
  'NAS_MEDIA_ROOT=/Volumes/BLAZE-STORE-2/media-vault/co-deliver' \
  'CODELIVER_REQUIRE_NOTIFICATIONS=0'
do
  /usr/bin/grep -Fxq -- "$exact_line" "$ENV_TEMPLATE" || fail_static "runtime env template is missing: $exact_line"
done

if /usr/bin/grep -Eq '^(NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_KEY|RESEND_API_KEY|ANTHROPIC_API_KEY|CODELIVER_MEDIA_PIPELINE_WORKER_TOKEN|NOTIFICATION_WEBHOOK_SECRET)=.+' "$ENV_TEMPLATE"; then
  fail_static "runtime env template contains a credential-like value"
fi

require_literal "$REPO_ROOT/package.json" '"start": "next start --port ${PORT:-4103}"'
require_literal "$SCRIPT_DIR/prepare-release.sh" '"$NODE_BIN" "$NPM_CLI_JS" ci --include=dev'
require_literal "$SCRIPT_DIR/run-release.sh" 'exec "$NODE_BIN" "$NPM_CLI_JS" run start -- --hostname 127.0.0.1'
require_literal "$SCRIPT_DIR/run-release.sh" 'unset VERCEL_GIT_COMMIT_SHA'
require_literal "$SCRIPT_DIR/canary-release.sh" '"$NODE_BIN" "$SCRIPT_DIR/lib/canary-supervisor.mjs"'
require_literal "$SCRIPT_DIR/lib/canary-supervisor.mjs" 'process.kill(-child.pid, signal)'
require_literal "$COMMON" 'ADMIN_HOST="admin.contentco-op.com"'
require_literal "$COMMON" 'CLIENT_HOST="client.contentco-op.com"'
require_literal "$SCRIPT_DIR/verify-health.sh" "'untrusted.invalid'"
require_literal "$SCRIPT_DIR/verify-health.sh" "'/api/health/live'"
require_literal "$SCRIPT_DIR/verify-health.sh" "'/api/health/ready'"

ALL_INTERFACES_PATTERN='0.0.'"0.0"
if /usr/bin/grep -R -Fq -- "$ALL_INTERFACES_PATTERN" "$SCRIPT_DIR"; then
  fail_static "runtime assets must never bind or probe the all-interface address"
fi
if /usr/bin/grep -R -Fq -- '/Users/_mxappservice/.config/blaze-secrets/codeliver/runtime.env' "$PLIST"; then
  fail_static "launchd plist must not load or contain secret material"
fi
NONATOMIC_LINK_PATTERN='ln -s'"fn"
if /usr/bin/grep -R -Fq -- "$NONATOMIC_LINK_PATTERN" "$SCRIPT_DIR"; then
  fail_static "non-atomic symlink replacement is forbidden"
fi

while IFS= read -r operational_script; do
  if /usr/bin/grep -Eq '(^|[;&|[:space:]])rm([[:space:]]|$)|git[[:space:]]+(reset|clean|checkout)' "$operational_script"; then
    fail_static "destructive remove/reset behavior found in $operational_script"
  fi
done < <(/usr/bin/find "$SCRIPT_DIR" -type f -name '*.sh' ! -path "$SCRIPT_DIR/tests/*" ! -name 'validate-static.sh' -print)

printf 'PASS: M4 runtime static contract, launchd plist, loopback binding, private env template, and preservation guards.\n'
