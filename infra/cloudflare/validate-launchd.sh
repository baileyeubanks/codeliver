#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE="template"

usage() {
  cat <<'USAGE'
Usage: ./validate-launchd.sh [--template|--installed] <admin|client> [plist-path]

  --template   Validate the repository launch daemon (default).
  --installed  Also require root ownership and non-writable group/world mode.
USAGE
}

fail() {
  printf 'validate-launchd: %s\n' "$*" >&2
  exit 1
}

if [[ $# -gt 0 && "$1" == --* ]]; then
  case "$1" in
    --template) MODE="template" ;;
    --installed) MODE="installed" ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      usage >&2
      fail "unknown option: $1"
      ;;
  esac
  shift
fi

[[ $# -ge 1 && $# -le 2 ]] || {
  usage >&2
  exit 2
}

PROFILE="$1"
case "$PROFILE" in
  admin) ;;
  client) ;;
  *) fail "profile must be admin or client" ;;
esac

LABEL="com.contentcoop.codeliver-$PROFILE.cloudflared"
CONFIG_PATH="/etc/cloudflared/cco-codeliver-$PROFILE.yml"
PLIST_NAME="$LABEL.plist"
if [[ $# -eq 2 ]]; then
  PLIST="$2"
elif [[ "$MODE" == "installed" ]]; then
  PLIST="/Library/LaunchDaemons/$PLIST_NAME"
else
  PLIST="$SCRIPT_DIR/launchd/$PLIST_NAME"
fi

[[ -f "$PLIST" ]] || fail "property list not found: $PLIST"
command -v plutil >/dev/null 2>&1 || fail "plutil is required on the macOS host"
plutil -lint "$PLIST" >/dev/null

plist_value() {
  plutil -extract "$1" raw -o - "$PLIST" 2>/dev/null || fail "missing or invalid plist key: $1"
}

[[ "$(plist_value Label)" == "$LABEL" ]] || fail "launchd label does not match $PROFILE"
[[ "$(plist_value ProgramArguments.0)" == "/opt/homebrew/bin/cloudflared" ]] || \
  fail "launchd must use the Apple Silicon Homebrew cloudflared binary"
[[ "$(plist_value ProgramArguments.1)" == "tunnel" ]] || fail "ProgramArguments[1] must be tunnel"
[[ "$(plist_value ProgramArguments.2)" == "--config" ]] || fail "ProgramArguments[2] must be --config"
[[ "$(plist_value ProgramArguments.3)" == "$CONFIG_PATH" ]] || fail "launchd config path is incorrect"
[[ "$(plist_value ProgramArguments.4)" == "run" ]] || fail "ProgramArguments[4] must be run"
if plutil -extract ProgramArguments.5 raw -o - "$PLIST" >/dev/null 2>&1; then
  fail "unexpected launchd program argument after run"
fi
[[ "$(plist_value RunAtLoad)" == "true" ]] || fail "RunAtLoad must be true"
[[ "$(plist_value KeepAlive)" == "true" ]] || fail "KeepAlive must be true"
[[ "$(plist_value ProcessType)" == "Background" ]] || fail "ProcessType must be Background"
[[ "$(plist_value ThrottleInterval)" == "5" ]] || fail "ThrottleInterval must be 5 seconds"
[[ "$(plist_value ExitTimeOut)" == "45" ]] || fail "ExitTimeOut must be 45 seconds"
[[ "$(plist_value Umask)" == "63" ]] || fail "Umask must be 077 (decimal 63)"
[[ "$(plist_value StandardOutPath)" == "/Library/Logs/$LABEL.out.log" ]] || \
  fail "stdout log path is incorrect"
[[ "$(plist_value StandardErrorPath)" == "/Library/Logs/$LABEL.err.log" ]] || \
  fail "stderr log path is incorrect"

if grep -Eqi -- '(--token|token-file|credentials-contents|cert\.pem)' "$PLIST"; then
  fail "launchd plist must not contain tokens or account credentials"
fi

if [[ "$MODE" == "installed" ]]; then
  owner_uid="$(/usr/bin/stat -f '%u' "$PLIST")"
  file_mode="$(/usr/bin/stat -f '%Lp' "$PLIST")"
  [[ "$owner_uid" == "0" ]] || fail "$PLIST must be owned by root"
  if (( (8#$file_mode & 8#022) != 0 )); then
    fail "$PLIST must not be group/world writable; found $file_mode"
  fi
fi

printf 'PASS: %s is the valid %s %s launch daemon.\n' "$PLIST" "$MODE" "$PROFILE"
