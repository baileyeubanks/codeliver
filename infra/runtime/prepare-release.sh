#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/runtime-common.sh"

usage() {
  printf 'Usage: %s --source <clean-checkout> --release <release-id> --git-sha <40-char-sha>\n' "${0##*/}"
}

SOURCE_DIR=""
RELEASE_ID=""
REQUESTED_SHA=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --source) [[ $# -ge 2 ]] || fail "--source needs a value"; SOURCE_DIR="$2"; shift 2 ;;
    --release) [[ $# -ge 2 ]] || fail "--release needs a value"; RELEASE_ID="$2"; shift 2 ;;
    --git-sha) [[ $# -ge 2 ]] || fail "--git-sha needs a value"; REQUESTED_SHA="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) usage >&2; fail "unknown argument: $1" ;;
  esac
done

[[ -n "$SOURCE_DIR" && -n "$RELEASE_ID" && -n "$REQUESTED_SHA" ]] || { usage >&2; exit 2; }
[[ "$SOURCE_DIR" == /* && -d "$SOURCE_DIR" ]] || fail "source must be an absolute directory path"
validate_release_id "$RELEASE_ID"
validate_git_sha "$REQUESTED_SHA"
require_runtime_user
require_command git
require_command tar
require_pinned_node
load_runtime_env
ensure_runtime_directories

[[ "$(git -C "$SOURCE_DIR" rev-parse --is-inside-work-tree 2>/dev/null)" == "true" ]] || \
  fail "source must be a Git checkout or worktree"

[[ -z "$(git -C "$SOURCE_DIR" status --porcelain=v1 --untracked-files=all)" ]] || fail "source checkout must be clean"
SOURCE_HEAD="$(git -C "$SOURCE_DIR" rev-parse HEAD)"
[[ "$SOURCE_HEAD" == "$REQUESTED_SHA" ]] || fail "source HEAD does not match requested git SHA"

RELEASE_DIR="$(release_dir_for "$RELEASE_ID")"
STAGING_DIR="$STAGING_ROOT/$RELEASE_ID"
CACHE_DIR="$STATE_ROOT/cache/$RELEASE_ID"
[[ ! -e "$RELEASE_DIR" && ! -L "$RELEASE_DIR" ]] || fail "release already exists and will not be overwritten: $RELEASE_DIR"
[[ ! -e "$STAGING_DIR" && ! -L "$STAGING_DIR" ]] || fail "staging path already exists and will not be overwritten: $STAGING_DIR"
[[ ! -e "$CACHE_DIR" && ! -L "$CACHE_DIR" ]] || fail "cache path already exists and will not be overwritten: $CACHE_DIR"

/bin/mkdir "$STAGING_DIR"
preserve_failed_stage() {
  printf 'Release preparation failed; staged evidence is preserved at %s\n' "$STAGING_DIR" >&2
}
trap preserve_failed_stage ERR

git -C "$SOURCE_DIR" archive --format=tar "$REQUESTED_SHA" | tar -xf - -C "$STAGING_DIR"

if /usr/bin/find "$STAGING_DIR" -type f \( -name '.env' -o -name '.env.local' -o -name '.env.production' \) -print -quit | /usr/bin/grep -q .; then
  fail "archived source contains a private environment file"
fi
[[ -f "$STAGING_DIR/package.json" && -f "$STAGING_DIR/package-lock.json" ]] || fail "archived source is missing package metadata"

(
  cd "$STAGING_DIR"
  export NODE_ENV=production
  export PORT="$PRODUCTION_PORT"
  export CODELIVER_BIND_HOST="$BIND_HOST"
  export PATH="${NODE_BIN%/node}:/usr/bin:/bin:/usr/sbin:/sbin"
  "$NODE_BIN" "$NPM_CLI_JS" ci --include=dev
  "$NODE_BIN" "$NPM_CLI_JS" run build
)

[[ -s "$STAGING_DIR/.next/BUILD_ID" ]] || fail "production build did not create .next/BUILD_ID"
[[ -f "$STAGING_DIR/node_modules/next/dist/bin/next" ]] || fail "production build is missing the Next runtime"

if [[ -e "$STAGING_DIR/.next/cache" || -L "$STAGING_DIR/.next/cache" ]]; then
  [[ -d "$STAGING_DIR/.next/cache" && ! -L "$STAGING_DIR/.next/cache" ]] || fail "build cache must be a real directory before sealing"
  /bin/mv "$STAGING_DIR/.next/cache" "$CACHE_DIR"
else
  /bin/mkdir "$CACHE_DIR"
fi
/bin/ln -s "$CACHE_DIR" "$STAGING_DIR/.next/cache"

BUILT_AT="$(utc_timestamp)"
LOCK_SHA="$(/usr/bin/shasum -a 256 "$STAGING_DIR/package-lock.json" | /usr/bin/awk '{print $1}')"
printf 'release_id=%s\ngit_sha=%s\nnode_version=%s\nbuilt_at=%s\npackage_lock_sha256=%s\n' \
  "$RELEASE_ID" "$REQUESTED_SHA" "$EXPECTED_NODE_VERSION" "$BUILT_AT" "$LOCK_SHA" \
  >"$STAGING_DIR/.codeliver-release"

# Preserve executable bits while removing write access from all release-owned content.
/usr/bin/find "$STAGING_DIR" -type d -exec /bin/chmod a-w {} +
/usr/bin/find "$STAGING_DIR" -type f -exec /bin/chmod a-w {} +
/bin/mv "$STAGING_DIR" "$RELEASE_DIR"
trap - ERR

validate_release "$RELEASE_ID"
printf 'PASS: immutable release %s prepared at %s from %s. No current symlink changed.\n' \
  "$RELEASE_ID" "$RELEASE_DIR" "$REQUESTED_SHA"
