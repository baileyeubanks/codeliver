#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE="template"
CLOUDFLARED_BIN="${CLOUDFLARED_BIN:-/opt/homebrew/bin/cloudflared}"

usage() {
  cat <<'USAGE'
Usage: ./validate-config.sh [--template|--runtime] <admin|client> [config-path]

  --template  Validate a secret-free repository template (default).
  --runtime   Also require private permissions on the installed configuration
              and existing credential file. No Cloudflare request is made.
USAGE
}

fail() {
  printf 'validate-config: %s\n' "$*" >&2
  exit 1
}

if [[ $# -gt 0 && "$1" == --* ]]; then
  case "$1" in
    --template) MODE="template" ;;
    --runtime) MODE="runtime" ;;
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
  admin)
    EXPECTED_TUNNEL="5195d10d-ec77-4921-876d-496e50b406a1"
    EXPECTED_HOST="admin.contentco-op.com"
    EXPECTED_METRICS="127.0.0.1:20241"
    EXPECTED_RUNTIME_CONFIG="/etc/cloudflared/cco-codeliver-admin.yml"
    ;;
  client)
    EXPECTED_TUNNEL="d763c03a-a188-4a2d-ab9d-e9037319fedf"
    EXPECTED_HOST="client.contentco-op.com"
    EXPECTED_METRICS="127.0.0.1:20242"
    EXPECTED_RUNTIME_CONFIG="/etc/cloudflared/cco-codeliver-client.yml"
    ;;
  *) fail "profile must be admin or client" ;;
esac

if [[ $# -eq 2 ]]; then
  CONFIG="$2"
elif [[ "$MODE" == "runtime" ]]; then
  CONFIG="$EXPECTED_RUNTIME_CONFIG"
else
  CONFIG="$SCRIPT_DIR/$PROFILE/config.yml.tmpl"
fi

EXPECTED_CREDENTIALS="/etc/cloudflared/$EXPECTED_TUNNEL.json"
[[ -f "$CONFIG" ]] || fail "configuration file not found: $CONFIG"
[[ -x "$CLOUDFLARED_BIN" ]] || fail "cloudflared is not executable at $CLOUDFLARED_BIN"

if grep -Eq '^[[:space:]]*(token|token-file|credentials-contents|origincert)[[:space:]]*:' "$CONFIG"; then
  fail "inline tokens, token files, credential contents, and account certificates are forbidden"
fi
if grep -Eq -- '-----BEGIN [A-Z ]*(PRIVATE KEY|CERTIFICATE)-----|eyJ[A-Za-z0-9_-]{20,}' "$CONFIG"; then
  fail "configuration appears to contain credential material"
fi
if grep -Eq '^[[:space:]]*-[[:space:]]*hostname:[[:space:]]*.*\*' "$CONFIG"; then
  fail "wildcard hostnames are forbidden"
fi
if grep -Eq '^[[:space:]]*url[[:space:]]*:' "$CONFIG"; then
  fail "top-level URL routing is forbidden"
fi
if grep -Eq '^[[:space:]]*noTLSVerify[[:space:]]*:[[:space:]]*true' "$CONFIG"; then
  fail "TLS verification cannot be disabled"
fi
if grep -Eq '^[[:space:]]*path[[:space:]]*:' "$CONFIG"; then
  fail "path rules are outside this tunnel contract"
fi

require_count() {
  local expression="$1"
  local expected="$2"
  local description="$3"
  local actual
  actual="$(grep -Ec "$expression" "$CONFIG" || true)"
  [[ "$actual" == "$expected" ]] || fail "$description: expected $expected, found $actual"
}

require_count "^[[:space:]]*tunnel:[[:space:]]*$EXPECTED_TUNNEL[[:space:]]*$" 1 "dedicated tunnel UUID"
require_count "^[[:space:]]*credentials-file:[[:space:]]*$EXPECTED_CREDENTIALS[[:space:]]*$" 1 \
  "dedicated credential path"
require_count "^[[:space:]]*metrics:[[:space:]]*$EXPECTED_METRICS[[:space:]]*$" 1 \
  "dedicated loopback metrics binding"
require_count "^[[:space:]]*-[[:space:]]*hostname:[[:space:]]*$EXPECTED_HOST[[:space:]]*$" 1 \
  "exact hostname rule"
require_count '^[[:space:]]*-[[:space:]]*hostname:' 1 "total hostname rules"
require_count '^[[:space:]]*service:[[:space:]]*http://127\.0\.0\.1:4103[[:space:]]*$' 1 \
  "Co-Deliver origin service"
require_count "^[[:space:]]*httpHostHeader:[[:space:]]*$EXPECTED_HOST[[:space:]]*$" 1 \
  "exact origin Host header"
require_count '^[[:space:]]*httpHostHeader:' 1 "total Host header overrides"
require_count '^[[:space:]]*-[[:space:]]*service:[[:space:]]*http_status:404[[:space:]]*$' 1 \
  "terminal deny service"
require_count '^[[:space:]]*(-[[:space:]]*)?service:' 2 "total ingress services"
require_count '^[[:space:]]*connectTimeout:[[:space:]]*10s[[:space:]]*$' 1 "origin connect timeout"
require_count '^[[:space:]]*keepAliveTimeout:[[:space:]]*1m30s[[:space:]]*$' 1 "origin keepalive timeout"
require_count '^[[:space:]]*keepAliveConnections:[[:space:]]*100[[:space:]]*$' 1 \
  "origin keepalive connection count"
require_count '^[[:space:]]*tcpKeepAlive:[[:space:]]*30s[[:space:]]*$' 1 "origin TCP keepalive"

last_effective_line="$(awk '
  {
    line = $0
    sub(/[[:space:]]+#.*/, "", line)
    if (line !~ /^[[:space:]]*$/) last = line
  }
  END { print last }
' "$CONFIG")"
[[ "$last_effective_line" =~ ^[[:space:]]*-[[:space:]]service:[[:space:]]http_status:404[[:space:]]*$ ]] || \
  fail "the final effective rule must deny unmatched hostnames with http_status:404"

"$CLOUDFLARED_BIN" tunnel --config "$CONFIG" ingress validate >/dev/null

assert_rule() {
  local url="$1"
  local expected_index="$2"
  local expected_service="$3"
  local output
  output="$("$CLOUDFLARED_BIN" tunnel --config "$CONFIG" ingress rule "$url" 2>&1)" || \
    fail "cloudflared could not match $url"
  grep -Fq "Matched rule #$expected_index" <<<"$output" || \
    fail "$url did not match rule #$expected_index"
  grep -Fq "service: $expected_service" <<<"$output" || \
    fail "$url did not resolve to $expected_service"
}

assert_rule "https://$EXPECTED_HOST/api/health/live" 0 "http://127.0.0.1:4103"
assert_rule "https://unconfigured.invalid/" 1 "http_status:404"

if [[ "$MODE" == "runtime" ]]; then
  [[ -f "$EXPECTED_CREDENTIALS" ]] || fail "credential file not found: $EXPECTED_CREDENTIALS"
  [[ -r "$EXPECTED_CREDENTIALS" ]] || fail "credential file is not readable: $EXPECTED_CREDENTIALS"
  for private_file in "$CONFIG" "$EXPECTED_CREDENTIALS"; do
    file_mode="$(/usr/bin/stat -f '%Lp' "$private_file")"
    case "$file_mode" in
      400|600) ;;
      *) fail "$private_file must be mode 0600 or stricter; found $file_mode" ;;
    esac
  done
fi

printf 'PASS: %s is the valid %s %s tunnel configuration.\n' "$CONFIG" "$MODE" "$PROFILE"
