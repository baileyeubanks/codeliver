#!/usr/bin/env bash
set -euo pipefail

CLOUDFLARED_BIN="${CLOUDFLARED_BIN:-/opt/homebrew/bin/cloudflared}"

usage() {
  cat <<'USAGE'
Usage: ./health-check.sh <admin|client> [origin|connector|public]

  origin     Verify liveness and readiness on 127.0.0.1:4103 with the exact
             profile Host header. This is the default and is local-only.
  connector  Verify the profile's cloudflared loopback /ready and /metrics.
  public     Verify the profile HTTPS hostname after an approved DNS cutover.

Test-only overrides:
  CODELIVER_ORIGIN=http://127.0.0.1:<port>
  CLOUDFLARED_METRICS_ADDRESS=127.0.0.1:<port>
USAGE
}

fail() {
  printf 'health-check: %s\n' "$*" >&2
  exit 1
}

[[ $# -ge 1 && $# -le 2 ]] || {
  usage >&2
  exit 2
}

PROFILE="$1"
MODE="${2:-origin}"
case "$PROFILE" in
  admin)
    HOST="admin.contentco-op.com"
    DEFAULT_METRICS_ADDRESS="127.0.0.1:20241"
    ;;
  client)
    HOST="client.contentco-op.com"
    DEFAULT_METRICS_ADDRESS="127.0.0.1:20242"
    ;;
  *) fail "profile must be admin or client" ;;
esac

ORIGIN_URL="${CODELIVER_ORIGIN:-http://127.0.0.1:4103}"
METRICS_ADDRESS="${CLOUDFLARED_METRICS_ADDRESS:-$DEFAULT_METRICS_ADDRESS}"
TIMEOUT_SECONDS="${CODELIVER_HEALTH_TIMEOUT_SECONDS:-10}"

[[ "$TIMEOUT_SECONDS" =~ ^[1-9][0-9]*$ ]] || fail "timeout must be a positive integer"
[[ "$ORIGIN_URL" =~ ^http://127\.0\.0\.1:[0-9]+$ ]] || \
  fail "CODELIVER_ORIGIN must remain an HTTP loopback URL"
[[ "$METRICS_ADDRESS" =~ ^127\.0\.0\.1:[0-9]+$ ]] || \
  fail "CLOUDFLARED_METRICS_ADDRESS must remain on loopback"

command -v curl >/dev/null 2>&1 || fail "curl is required"
[[ -x /usr/bin/plutil ]] || fail "plutil is required on the macOS host"

temporary_dir="$(mktemp -d)"
trap 'rm -rf "$temporary_dir"' EXIT
request_number=0

check_json_probe() {
  local label="$1"
  local url="$2"
  local expected_probe="$3"
  local host_header="${4:-}"
  local body_file content_type response_meta status
  local -a curl_args

  request_number=$((request_number + 1))
  body_file="$temporary_dir/response-$request_number.json"
  curl_args=(
    --silent
    --show-error
    --connect-timeout "$TIMEOUT_SECONDS"
    --max-time "$TIMEOUT_SECONDS"
    --output "$body_file"
    --write-out $'%{http_code}\n%{content_type}'
    --header 'Accept: application/json'
    --header 'Cache-Control: no-cache'
  )
  if [[ -n "$host_header" ]]; then
    curl_args+=(--header "Host: $host_header")
  fi

  response_meta="$(curl "${curl_args[@]}" "$url")" || fail "$label request failed"
  status="${response_meta%%$'\n'*}"
  content_type="${response_meta#*$'\n'}"
  [[ "$status" == "200" ]] || fail "$label returned HTTP $status"
  [[ "$content_type" == "application/json"* ]] || fail "$label did not return application/json"

  service="$(/usr/bin/plutil -extract service raw -o - "$body_file" 2>/dev/null || true)"
  probe="$(/usr/bin/plutil -extract probe raw -o - "$body_file" 2>/dev/null || true)"
  probe_status="$(/usr/bin/plutil -extract status raw -o - "$body_file" 2>/dev/null || true)"
  [[ "$service" == "co-deliver" && "$probe" == "$expected_probe" ]] || \
    fail "$label response did not identify the expected Co-Deliver probe"
  if [[ "$expected_probe" == "liveness" ]]; then
    [[ "$probe_status" == "ok" ]] || fail "$label did not report status=ok"
  else
    ready="$(/usr/bin/plutil -extract ready raw -o - "$body_file" 2>/dev/null || true)"
    [[ "$ready" == "true" ]] || fail "$label did not prove required dependencies"
    [[ "$probe_status" == "healthy" || "$probe_status" == "degraded" ]] || \
      fail "$label returned an invalid readiness status"
  fi

  printf 'PASS: %s\n' "$label"
}

check_origin() {
  check_json_probe "$HOST origin liveness" "$ORIGIN_URL/api/health/live" "liveness" "$HOST"
  check_json_probe "$HOST origin readiness" "$ORIGIN_URL/api/health/ready" "readiness" "$HOST"
}

check_connector() {
  [[ -x "$CLOUDFLARED_BIN" ]] || fail "cloudflared is not executable at $CLOUDFLARED_BIN"
  "$CLOUDFLARED_BIN" tunnel --metrics "$METRICS_ADDRESS" ready >/dev/null || \
    fail "$PROFILE cloudflared connector is not ready at $METRICS_ADDRESS"
  curl --silent --show-error --fail \
    --connect-timeout "$TIMEOUT_SECONDS" \
    --max-time "$TIMEOUT_SECONDS" \
    "http://$METRICS_ADDRESS/metrics" >/dev/null || \
    fail "$PROFILE cloudflared metrics are unavailable at $METRICS_ADDRESS"
  printf 'PASS: %s cloudflared connector readiness and metrics\n' "$PROFILE"
}

check_public() {
  check_json_probe "$HOST public liveness" "https://$HOST/api/health/live" "liveness"
  check_json_probe "$HOST public readiness" "https://$HOST/api/health/ready" "readiness"
}

case "$MODE" in
  origin) check_origin ;;
  connector) check_connector ;;
  public) check_public ;;
  *)
    usage >&2
    fail "mode must be origin, connector, or public"
    ;;
esac
