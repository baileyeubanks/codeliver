#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/runtime-common.sh"

usage() {
  printf 'Usage: %s --port <port> --expected-release <40-char-sha> [--attempts <count>] [--delay <seconds>]\n' "${0##*/}"
}

CHECK_PORT=""
EXPECTED_RELEASE=""
ATTEMPTS=1
DELAY_SECONDS=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) [[ $# -ge 2 ]] || fail "--port needs a value"; CHECK_PORT="$2"; shift 2 ;;
    --expected-release) [[ $# -ge 2 ]] || fail "--expected-release needs a value"; EXPECTED_RELEASE="$2"; shift 2 ;;
    --attempts) [[ $# -ge 2 ]] || fail "--attempts needs a value"; ATTEMPTS="$2"; shift 2 ;;
    --delay) [[ $# -ge 2 ]] || fail "--delay needs a value"; DELAY_SECONDS="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) usage >&2; fail "unknown argument: $1" ;;
  esac
done

[[ -n "$CHECK_PORT" && -n "$EXPECTED_RELEASE" ]] || { usage >&2; exit 2; }
validate_port "$CHECK_PORT"
validate_git_sha "$EXPECTED_RELEASE"
[[ "$ATTEMPTS" =~ ^[1-9][0-9]*$ ]] || fail "attempts must be a positive integer"
[[ "$DELAY_SECONDS" =~ ^[0-9]+$ ]] || fail "delay must be a non-negative integer"
require_command curl
require_pinned_node

RESPONSE_BODY=""
RESPONSE_STATUS=""
RESPONSE_CONTENT_TYPE=""

request_json() {
  local host="$1"
  local path="$2"
  local raw meta
  raw="$(curl --silent --show-error --noproxy '*' --connect-timeout 2 --max-time 5 \
    --header 'Accept: application/json' \
    --header 'Cache-Control: no-cache' \
    --header "Host: $host" \
    --write-out $'\n__CODELIVER_META__%{http_code}|%{content_type}' \
    "http://127.0.0.1:$CHECK_PORT$path")" || return 1
  meta="${raw##*$'\n'}"
  [[ "$meta" == __CODELIVER_META__*'|'* ]] || return 1
  RESPONSE_BODY="${raw%$'\n'*}"
  meta="${meta#__CODELIVER_META__}"
  RESPONSE_STATUS="${meta%%|*}"
  RESPONSE_CONTENT_TYPE="${meta#*|}"
  [[ "$RESPONSE_CONTENT_TYPE" == application/json* ]] || return 1
}

validate_probe_body() {
  local expected_probe="$1"
  printf '%s' "$RESPONSE_BODY" | "$NODE_BIN" -e '
    const fs = require("node:fs");
    const [probe, release] = process.argv.slice(1);
    let body;
    try { body = JSON.parse(fs.readFileSync(0, "utf8")); } catch { process.exit(2); }
    if (!body || body.service !== "co-deliver" || body.probe !== probe) process.exit(3);
    if (probe === "liveness") {
      if (body.status !== "ok" || body.release !== release) process.exit(4);
    } else if (probe === "readiness") {
      if (body.ready !== true || !["healthy", "degraded"].includes(body.status)) process.exit(5);
    } else {
      process.exit(6);
    }
  ' "$expected_probe" "$EXPECTED_RELEASE"
}

check_host() {
  local host="$1"
  request_json "$host" '/api/health/live' || { printf 'health: %s liveness request failed\n' "$host" >&2; return 1; }
  [[ "$RESPONSE_STATUS" == "200" ]] || { printf 'health: %s liveness returned HTTP %s\n' "$host" "$RESPONSE_STATUS" >&2; return 1; }
  validate_probe_body liveness || { printf 'health: %s liveness body failed contract\n' "$host" >&2; return 1; }

  request_json "$host" '/api/health/ready' || { printf 'health: %s readiness request failed\n' "$host" >&2; return 1; }
  [[ "$RESPONSE_STATUS" == "200" ]] || { printf 'health: %s readiness returned HTTP %s\n' "$host" "$RESPONSE_STATUS" >&2; return 1; }
  validate_probe_body readiness || { printf 'health: %s readiness body failed contract\n' "$host" >&2; return 1; }
}

check_rejected_host() {
  request_json 'untrusted.invalid' '/api/health/live' || { printf 'health: rejected-host request failed\n' >&2; return 1; }
  [[ "$RESPONSE_STATUS" == "403" ]] || { printf 'health: untrusted Host returned HTTP %s, expected 403\n' "$RESPONSE_STATUS" >&2; return 1; }
  printf '%s' "$RESPONSE_BODY" | "$NODE_BIN" -e '
    const fs = require("node:fs");
    let body;
    try { body = JSON.parse(fs.readFileSync(0, "utf8")); } catch { process.exit(2); }
    if (!body || body.code !== "HOST_FORBIDDEN") process.exit(3);
  ' || { printf 'health: untrusted Host body failed contract\n' >&2; return 1; }
}

verify_once() {
  check_host "$ADMIN_HOST" || return 1
  check_host "$CLIENT_HOST" || return 1
  check_rejected_host || return 1
}

attempt=1
while (( attempt <= ATTEMPTS )); do
  if verify_once; then
    printf 'PASS: Co-Deliver %s is ready on 127.0.0.1:%s for %s and %s; untrusted Host is rejected.\n' \
      "$EXPECTED_RELEASE" "$CHECK_PORT" "$ADMIN_HOST" "$CLIENT_HOST"
    exit 0
  fi
  if (( attempt < ATTEMPTS )); then
    /bin/sleep "$DELAY_SECONDS"
  fi
  attempt=$((attempt + 1))
done

fail "health contract did not pass after $ATTEMPTS attempt(s)"
