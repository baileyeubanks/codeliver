#!/usr/bin/env bash

# Shared, M4-specific runtime contract. Production paths cannot be overridden.

RUNTIME_TEST_MODE="${CODELIVER_RUNTIME_TEST_MODE:-0}"
[[ "$RUNTIME_TEST_MODE" == "0" || "$RUNTIME_TEST_MODE" == "1" ]] || {
  printf 'codeliver-runtime: CODELIVER_RUNTIME_TEST_MODE must be 0 or 1\n' >&2
  exit 1
}

if [[ "$RUNTIME_TEST_MODE" == "1" ]]; then
  APP_ROOT="${CODELIVER_APP_ROOT:-/tmp/codeliver-runtime-test}"
  ENV_FILE="${CODELIVER_ENV_FILE:-$APP_ROOT/runtime.env}"
  NODE_BIN="${CODELIVER_NODE_BIN:-/usr/bin/false}"
  NPM_CLI_JS="${CODELIVER_NPM_CLI_JS:-$APP_ROOT/npm-cli.js}"
  EXPECTED_RUNTIME_USER="${CODELIVER_EXPECTED_RUNTIME_USER:-$(id -un)}"
  STORAGE_MOUNT="${CODELIVER_EXPECTED_STORAGE_MOUNT:-$APP_ROOT/storage}"
  STORAGE_ROOT="${CODELIVER_EXPECTED_STORAGE_ROOT:-$STORAGE_MOUNT/media-vault/co-deliver}"
else
  APP_ROOT="/Users/_mxappservice/Projects/platform/codeliver"
  ENV_FILE="/Users/_mxappservice/.config/blaze-secrets/codeliver/runtime.env"
  NODE_BIN="/Users/_mxappservice/.nvm/versions/node/v24.14.1/bin/node"
  NPM_CLI_JS="/Users/_mxappservice/.nvm/versions/node/v24.14.1/lib/node_modules/npm/bin/npm-cli.js"
  EXPECTED_RUNTIME_USER="_mxappservice"
  STORAGE_MOUNT="/Volumes/BLAZE-STORE-2"
  STORAGE_ROOT="/Volumes/BLAZE-STORE-2/media-vault/co-deliver"
fi

RELEASES_ROOT="$APP_ROOT/releases"
STAGING_ROOT="$APP_ROOT/staging"
STATE_ROOT="$APP_ROOT/state"
CONTROL_ROOT="$APP_ROOT/control"
CURRENT_LINK="$APP_ROOT/current"
PREVIOUS_LINK="$APP_ROOT/previous"
RECEIPTS_ROOT="$APP_ROOT/activation-receipts"
CANARY_LOG_ROOT="$APP_ROOT/canary-logs"
LOCKS_ROOT="$APP_ROOT/locks"
PROMOTION_LOCK="$LOCKS_ROOT/promotion.lock"

EXPECTED_NODE_VERSION="v24.14.1"
PRODUCTION_PORT="4103"
DEFAULT_CANARY_PORT="${CODELIVER_CANARY_PORT:-4413}"
BIND_HOST="127.0.0.1"
ADMIN_HOST="admin.contentco-op.com"
CLIENT_HOST="client.contentco-op.com"
LAUNCHD_LABEL="com.contentcoop.codeliver-runtime"

readonly RUNTIME_TEST_MODE APP_ROOT ENV_FILE NODE_BIN NPM_CLI_JS EXPECTED_RUNTIME_USER
readonly STORAGE_MOUNT STORAGE_ROOT RELEASES_ROOT STAGING_ROOT STATE_ROOT CONTROL_ROOT
readonly CURRENT_LINK PREVIOUS_LINK RECEIPTS_ROOT CANARY_LOG_ROOT LOCKS_ROOT PROMOTION_LOCK
readonly EXPECTED_NODE_VERSION PRODUCTION_PORT DEFAULT_CANARY_PORT BIND_HOST ADMIN_HOST CLIENT_HOST
readonly LAUNCHD_LABEL

umask 077

fail() {
  printf 'codeliver-runtime: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required"
}

validate_release_id() {
  local release_id="${1:-}"
  [[ "$release_id" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ ]] || \
    fail "release ID must contain only letters, digits, dots, underscores, and hyphens"
  [[ "$release_id" != "." && "$release_id" != ".." ]] || fail "invalid release ID"
}

validate_git_sha() {
  [[ "${1:-}" =~ ^[0-9a-f]{40}$ ]] || fail "git SHA must be 40 lowercase hexadecimal characters"
}

validate_port() {
  local port="${1:-}"
  [[ "$port" =~ ^[0-9]+$ ]] || fail "port must be numeric"
  (( 10#$port >= 1024 && 10#$port <= 65535 )) || fail "port must be between 1024 and 65535"
}

utc_timestamp() {
  /bin/date -u '+%Y%m%dT%H%M%SZ'
}

file_mode() {
  if /usr/bin/stat -f '%Lp' "$1" >/dev/null 2>&1; then
    /usr/bin/stat -f '%Lp' "$1"
  else
    /usr/bin/stat -c '%a' "$1"
  fi
}

file_owner() {
  if /usr/bin/stat -f '%Su' "$1" >/dev/null 2>&1; then
    /usr/bin/stat -f '%Su' "$1"
  else
    /usr/bin/stat -c '%U' "$1"
  fi
}

require_configured_value() {
  local variable_name="$1"
  local value="${!variable_name:-}"
  [[ -n "$value" ]] || fail "$variable_name is required in $ENV_FILE"
  case "$value" in
    your-*|replace-*|'<replace'*|'<'*'>') fail "$variable_name still contains a placeholder" ;;
  esac
}

require_exact_32_byte_key() {
  local variable_name="$1"
  "$NODE_BIN" -e '
    const name = process.argv[1];
    const value = process.env[name]?.trim() ?? "";
    let bytes;
    try {
      bytes = /^[0-9a-f]{64}$/i.test(value)
        ? Buffer.from(value, "hex")
        : Buffer.from(value, "base64url");
    } catch {
      process.exit(1);
    }
    process.exit(bytes.length === 32 ? 0 : 1);
  ' "$variable_name" >/dev/null 2>&1 || \
    fail "$variable_name must encode exactly 32 bytes"
}

require_optional_32_byte_key_list() {
  local variable_name="$1"
  "$NODE_BIN" -e '
    const name = process.argv[1];
    const raw = process.env[name]?.trim() ?? "";
    if (!raw) process.exit(0);
    for (const value of raw.split(",").map((part) => part.trim())) {
      if (!value) process.exit(1);
      let bytes;
      try {
        bytes = /^[0-9a-f]{64}$/i.test(value)
          ? Buffer.from(value, "hex")
          : Buffer.from(value, "base64url");
      } catch {
        process.exit(1);
      }
      if (bytes.length !== 32) process.exit(1);
    }
  ' "$variable_name" >/dev/null 2>&1 || \
    fail "$variable_name must contain only comma-separated 32-byte encoded keys"
}

load_runtime_env() {
  [[ -f "$ENV_FILE" && ! -L "$ENV_FILE" ]] || fail "private runtime env file is missing or is a symlink: $ENV_FILE"
  [[ "$(file_mode "$ENV_FILE")" == "600" ]] || fail "$ENV_FILE must have mode 0600"
  [[ "$(file_owner "$ENV_FILE")" == "$EXPECTED_RUNTIME_USER" ]] || \
    fail "$ENV_FILE must be owned by $EXPECTED_RUNTIME_USER"

  set -a
  # The file is a private, owner-controlled shell assignment file.
  source "$ENV_FILE"
  set +a

  [[ "${NODE_ENV:-}" == "production" ]] || fail "NODE_ENV must be production"
  [[ "${PORT:-}" == "$PRODUCTION_PORT" ]] || fail "PORT must be $PRODUCTION_PORT in the runtime env"
  [[ "${CODELIVER_BIND_HOST:-}" == "$BIND_HOST" ]] || fail "CODELIVER_BIND_HOST must be $BIND_HOST"

  [[ "${ADMIN_SITE_URL:-}" == "https://$ADMIN_HOST" ]] || fail "ADMIN_SITE_URL must use the exact admin host"
  [[ "${NEXT_PUBLIC_ADMIN_SITE_URL:-}" == "https://$ADMIN_HOST" ]] || \
    fail "NEXT_PUBLIC_ADMIN_SITE_URL must use the exact admin host"
  [[ "${CLIENT_SITE_URL:-}" == "https://$CLIENT_HOST" ]] || fail "CLIENT_SITE_URL must use the exact client host"
  [[ "${NEXT_PUBLIC_CLIENT_SITE_URL:-}" == "https://$CLIENT_HOST" ]] || \
    fail "NEXT_PUBLIC_CLIENT_SITE_URL must use the exact client host"

  require_configured_value NEXT_PUBLIC_SUPABASE_URL
  require_configured_value NEXT_PUBLIC_SUPABASE_ANON_KEY
  require_configured_value SUPABASE_URL
  require_configured_value SUPABASE_SERVICE_KEY
  [[ "${SUPABASE_DATA_SCHEMA:-}" == "co_production" ]] || \
    fail "SUPABASE_DATA_SCHEMA must be co_production"
  [[ "${NEXT_PUBLIC_SUPABASE_DATA_SCHEMA:-}" == "co_production" ]] || \
    fail "NEXT_PUBLIC_SUPABASE_DATA_SCHEMA must be co_production"

  local key_variable
  for key_variable in \
    CO_PRODUCTION_TOKEN_ENCRYPTION_KEY \
    CO_PRODUCTION_WEBHOOK_SECRET_ENCRYPTION_KEY \
    CO_PRODUCTION_ANALYTICS_HASH_KEY \
    CO_PRODUCTION_REVIEW_ADMISSION_SIGNING_KEY
  do
    require_configured_value "$key_variable"
    require_exact_32_byte_key "$key_variable"
  done
  require_optional_32_byte_key_list \
    CO_PRODUCTION_REVIEW_ADMISSION_VERIFICATION_KEYS
  [[ "${CO_PRODUCTION_REVIEW_ADMISSION_TRUSTED_IP_HEADER:-}" == "cf-connecting-ip" ]] || \
    fail "CO_PRODUCTION_REVIEW_ADMISSION_TRUSTED_IP_HEADER must be cf-connecting-ip on M4"

  [[ "${CODELIVER_STORAGE_PROVIDER:-}" == "ccnas" ]] || fail "CODELIVER_STORAGE_PROVIDER must be ccnas"
  [[ "${CODELIVER_STORAGE_WRITE_ENABLED:-}" == "1" ]] || fail "CODELIVER_STORAGE_WRITE_ENABLED must be 1"
  [[ "${CODELIVER_HEALTH_REMOTE_PROBES:-}" == "1" ]] || fail "CODELIVER_HEALTH_REMOTE_PROBES must be 1"
  [[ "${NAS_MEDIA_ROOT:-}" == "$STORAGE_ROOT" ]] || fail "NAS_MEDIA_ROOT must be $STORAGE_ROOT"

  case "${CODELIVER_REQUIRE_NOTIFICATIONS:-}" in
    0) ;;
    1) require_configured_value RESEND_API_KEY ;;
    *) fail "CODELIVER_REQUIRE_NOTIFICATIONS must be 0 or 1" ;;
  esac
}

mount_is_present() {
  if [[ "$RUNTIME_TEST_MODE" == "1" && "${CODELIVER_TEST_ASSUME_MOUNTED:-0}" == "1" ]]; then
    return 0
  fi
  [[ -x /sbin/mount ]] || return 1
  /sbin/mount | /usr/bin/awk -v target="$STORAGE_MOUNT" \
    '$2 == "on" && $3 == target { found = 1 } END { exit(found ? 0 : 1) }'
}

require_storage_ready() {
  mount_is_present || fail "$STORAGE_MOUNT is not an active mounted volume"
  [[ -d "$STORAGE_MOUNT" && ! -L "$STORAGE_MOUNT" ]] || fail "$STORAGE_MOUNT must be a real directory"
  [[ -d "$STORAGE_ROOT" && ! -L "$STORAGE_ROOT" ]] || fail "$STORAGE_ROOT is missing or is a symlink"
  [[ -r "$STORAGE_ROOT" && -w "$STORAGE_ROOT" ]] || fail "$STORAGE_ROOT must be readable and writable"
  [[ "$(file_owner "$STORAGE_ROOT")" == "$EXPECTED_RUNTIME_USER" ]] || \
    fail "$STORAGE_ROOT must be owned by $EXPECTED_RUNTIME_USER"
}

require_pinned_node() {
  [[ -x "$NODE_BIN" ]] || fail "pinned Node binary is not executable: $NODE_BIN"
  [[ -r "$NPM_CLI_JS" ]] || fail "pinned npm CLI is not readable: $NPM_CLI_JS"
  [[ "$("$NODE_BIN" --version)" == "$EXPECTED_NODE_VERSION" ]] || \
    fail "Node must report $EXPECTED_NODE_VERSION"
}

ensure_runtime_directories() {
  local directory mode
  for directory in "$APP_ROOT" "$RELEASES_ROOT" "$STAGING_ROOT" "$STATE_ROOT" "$STATE_ROOT/cache" \
    "$CONTROL_ROOT" "$RECEIPTS_ROOT" "$CANARY_LOG_ROOT" "$LOCKS_ROOT"; do
    if [[ -e "$directory" || -L "$directory" ]]; then
      [[ -d "$directory" && ! -L "$directory" ]] || fail "runtime path must be a real directory: $directory"
    fi
  done
  /bin/mkdir -p "$RELEASES_ROOT" "$STAGING_ROOT" "$STATE_ROOT/cache" "$CONTROL_ROOT" \
    "$RECEIPTS_ROOT" "$CANARY_LOG_ROOT" "$LOCKS_ROOT"
  for directory in "$APP_ROOT" "$RELEASES_ROOT" "$STAGING_ROOT" "$STATE_ROOT" "$STATE_ROOT/cache" \
    "$CONTROL_ROOT" "$RECEIPTS_ROOT" "$CANARY_LOG_ROOT" "$LOCKS_ROOT"; do
    [[ "$(file_owner "$directory")" == "$EXPECTED_RUNTIME_USER" ]] || \
      fail "runtime directory must be owned by $EXPECTED_RUNTIME_USER: $directory"
    mode="$(file_mode "$directory")"
    if (( (8#$mode & 8#022) != 0 )); then
      fail "runtime directory must not be group/world writable: $directory ($mode)"
    fi
  done
}

release_dir_for() {
  validate_release_id "$1"
  printf '%s/%s\n' "$RELEASES_ROOT" "$1"
}

manifest_value() {
  local manifest="$1"
  local key="$2"
  /usr/bin/awk -F= -v wanted="$key" '$1 == wanted { print substr($0, index($0, "=") + 1); count++ } END { if (count != 1) exit 1 }' \
    "$manifest" || fail "release manifest must contain exactly one $key entry"
}

validate_release() {
  local release_id="$1"
  local release_dir manifest manifest_release manifest_sha manifest_node package_name expected_cache
  release_dir="$(release_dir_for "$release_id")"
  manifest="$release_dir/.codeliver-release"
  expected_cache="$STATE_ROOT/cache/$release_id"

  [[ -d "$release_dir" && ! -L "$release_dir" ]] || fail "release directory is missing or is a symlink: $release_dir"
  [[ -f "$manifest" && ! -L "$manifest" ]] || fail "release manifest is missing or is a symlink"
  [[ ! -w "$release_dir" ]] || fail "sealed release root must not be writable: $release_dir"
  if /usr/bin/find "$release_dir" \( -type f -o -type d \) \
    \( -perm -u+w -o -perm -g+w -o -perm -o+w \) -print -quit | /usr/bin/grep -q .; then
    fail "sealed release contains writable code or build content: $release_dir"
  fi

  manifest_release="$(manifest_value "$manifest" release_id)"
  manifest_sha="$(manifest_value "$manifest" git_sha)"
  manifest_node="$(manifest_value "$manifest" node_version)"
  [[ "$manifest_release" == "$release_id" ]] || fail "release manifest ID does not match directory"
  validate_git_sha "$manifest_sha"
  [[ "$manifest_node" == "$EXPECTED_NODE_VERSION" ]] || fail "release was not built with $EXPECTED_NODE_VERSION"

  [[ -f "$release_dir/package.json" ]] || fail "release package.json is missing"
  [[ -f "$release_dir/package-lock.json" ]] || fail "release package-lock.json is missing"
  [[ -s "$release_dir/.next/BUILD_ID" ]] || fail "release Next build ID is missing"
  [[ -f "$release_dir/node_modules/next/dist/bin/next" ]] || fail "release Next runtime is missing"
  [[ -L "$release_dir/.next/cache" ]] || fail "release cache must be an external symlink"
  [[ "$(/usr/bin/readlink "$release_dir/.next/cache")" == "$expected_cache" ]] || fail "release cache symlink is incorrect"
  [[ -d "$expected_cache" && -w "$expected_cache" ]] || fail "external release cache must be writable"

  package_name="$("$NODE_BIN" -e 'const p=require(process.argv[1]); process.stdout.write(String(p.name || ""))' "$release_dir/package.json")"
  [[ "$package_name" == "co-deliver" ]] || fail "release package name must be co-deliver"

  if /usr/bin/find "$release_dir" -type f \( -name '.env' -o -name '.env.local' -o -name '.env.production' \) -print -quit | /usr/bin/grep -q .; then
    fail "release contains a private environment file"
  fi
}

link_release_id() {
  local link_path="$1"
  local label="$2"
  local target release_id
  if [[ ! -e "$link_path" && ! -L "$link_path" ]]; then
    printf '\n'
    return 0
  fi
  [[ -L "$link_path" ]] || fail "$label path must be a symlink"
  target="$(/usr/bin/readlink "$link_path")"
  [[ "$target" == "$RELEASES_ROOT/"* ]] || fail "$label symlink escapes the release root"
  release_id="${target#"$RELEASES_ROOT/"}"
  validate_release_id "$release_id"
  [[ "$target" == "$RELEASES_ROOT/$release_id" ]] || fail "$label symlink target is malformed"
  [[ -d "$target" ]] || fail "$label symlink target does not exist"
  printf '%s\n' "$release_id"
}

current_release_id() {
  link_release_id "$CURRENT_LINK" current
}

previous_release_id() {
  link_release_id "$PREVIOUS_LINK" previous
}

atomic_release_link() {
  local target="$1"
  local link_path="$2"
  local label="$3"
  local temporary_link
  [[ "$target" == "$RELEASES_ROOT/"* && -d "$target" ]] || fail "atomic link target must be an existing release"
  if [[ -e "$link_path" && ! -L "$link_path" ]]; then
    fail "$label path exists and is not a symlink"
  fi
  temporary_link="$APP_ROOT/.${label}-link-$(utc_timestamp)-$$"
  [[ ! -e "$temporary_link" && ! -L "$temporary_link" ]] || fail "temporary link already exists: $temporary_link"
  /bin/ln -s "$target" "$temporary_link"
  "$NODE_BIN" -e 'const fs = require("node:fs"); fs.renameSync(process.argv[1], process.argv[2]);' \
    "$temporary_link" "$link_path" || fail "atomic $label symlink replacement failed; preserved $temporary_link"
}

acquire_promotion_lock() {
  ensure_runtime_directories
  /bin/mkdir "$PROMOTION_LOCK" 2>/dev/null || fail "another promotion or rollback holds $PROMOTION_LOCK"
}

release_promotion_lock() {
  /bin/rmdir "$PROMOTION_LOCK" 2>/dev/null || fail "could not release promotion lock: $PROMOTION_LOCK"
}

write_activation_receipt() {
  local action="$1"
  local from_release="$2"
  local to_release="$3"
  local to_sha="$4"
  local recorded_at receipt
  recorded_at="$(utc_timestamp)"
  receipt="$RECEIPTS_ROOT/$recorded_at-$action-$to_release-$$.env"
  (
    set -C
    printf 'action=%s\nfrom_release=%s\nto_release=%s\nto_git_sha=%s\nrecorded_at=%s\n' \
      "$action" "$from_release" "$to_release" "$to_sha" "$recorded_at" >"$receipt"
  ) || fail "activation receipt already exists: $receipt"
  /bin/chmod 0444 "$receipt"
  printf '%s\n' "$receipt"
}

require_runtime_user() {
  if [[ "$RUNTIME_TEST_MODE" != "1" ]]; then
    [[ "$(id -un)" == "$EXPECTED_RUNTIME_USER" ]] || fail "run this command as $EXPECTED_RUNTIME_USER"
  fi
}
