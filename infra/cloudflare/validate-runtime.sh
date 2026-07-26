#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'USAGE'
Usage: ./validate-runtime.sh <admin|client> [static|preflight|running]

  static     Validate repository config and launchd artifacts only (default).
  preflight  Validate installed config/credential permissions, local Co-Deliver
             health, and the repository launchd artifact. No connector starts.
  running    Add installed launchd ownership, launchctl state, and local
             connector readiness checks. No Cloudflare control-plane write.
USAGE
}

fail() {
  printf 'validate-runtime: %s\n' "$*" >&2
  exit 1
}

[[ $# -ge 1 && $# -le 2 ]] || {
  usage >&2
  exit 2
}

PROFILE="$1"
MODE="${2:-static}"
case "$PROFILE" in
  admin|client) ;;
  *) fail "profile must be admin or client" ;;
esac
case "$MODE" in
  static|preflight|running) ;;
  *) fail "mode must be static, preflight, or running" ;;
esac

LABEL="com.contentcoop.codeliver-$PROFILE.cloudflared"

if [[ "$MODE" == "static" ]]; then
  "$SCRIPT_DIR/validate-config.sh" --template "$PROFILE"
  "$SCRIPT_DIR/validate-launchd.sh" --template "$PROFILE"
  printf 'PASS: %s static deployment artifacts\n' "$PROFILE"
  exit 0
fi

[[ -x /opt/homebrew/bin/cloudflared ]] || fail "/opt/homebrew/bin/cloudflared is not executable"
"$SCRIPT_DIR/validate-config.sh" --runtime "$PROFILE"
"$SCRIPT_DIR/validate-launchd.sh" --template "$PROFILE"
"$SCRIPT_DIR/health-check.sh" "$PROFILE" origin

if [[ "$MODE" == "running" ]]; then
  "$SCRIPT_DIR/validate-launchd.sh" --installed "$PROFILE"
  launchctl print "system/$LABEL" >/dev/null || fail "$LABEL is not loaded in the system domain"
  "$SCRIPT_DIR/health-check.sh" "$PROFILE" connector
fi

printf 'PASS: %s %s local runtime validation\n' "$PROFILE" "$MODE"
