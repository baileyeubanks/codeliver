#!/usr/bin/env bash
set -euo pipefail

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$TEST_DIR/.." && pwd)"

fail() {
  printf 'config.test: %s\n' "$*" >&2
  exit 1
}

for command in curl node plutil; do
  command -v "$command" >/dev/null 2>&1 || fail "$command is required"
done
[[ -x /opt/homebrew/bin/cloudflared ]] || fail "/opt/homebrew/bin/cloudflared is required"

temporary_dir="$(mktemp -d)"
server_pid=""
cleanup() {
  if [[ -n "$server_pid" ]]; then
    kill "$server_pid" >/dev/null 2>&1 || true
    wait "$server_pid" 2>/dev/null || true
  fi
  rm -rf "$temporary_dir"
}
trap cleanup EXIT

for profile in admin client; do
  "$ROOT/validate-runtime.sh" "$profile" static
done

admin_config="$ROOT/admin/config.yml.tmpl"
client_config="$ROOT/client/config.yml.tmpl"
grep -Fq '5195d10d-ec77-4921-876d-496e50b406a1' "$admin_config" || \
  fail "admin tunnel ID is missing"
grep -Fq 'd763c03a-a188-4a2d-ab9d-e9037319fedf' "$client_config" || \
  fail "client tunnel ID is missing"
if grep -Fq 'client.contentco-op.com' "$admin_config"; then
  fail "admin configuration contains the client hostname"
fi
if grep -Fq 'admin.contentco-op.com' "$client_config"; then
  fail "client configuration contains the admin hostname"
fi

wildcard="$temporary_dir/wildcard.yml"
sed 's/admin\.contentco-op\.com/\*.contentco-op.com/g' "$admin_config" >"$wildcard"
if "$ROOT/validate-config.sh" --template admin "$wildcard" >/dev/null 2>&1; then
  fail "validator accepted a wildcard hostname"
fi

wrong_origin="$temporary_dir/wrong-origin.yml"
sed 's#http://127\.0\.0\.1:4103#http://127.0.0.1:3000#' "$client_config" >"$wrong_origin"
if "$ROOT/validate-config.sh" --template client "$wrong_origin" >/dev/null 2>&1; then
  fail "validator accepted the wrong Co-Deliver origin"
fi

wrong_host_header="$temporary_dir/wrong-host-header.yml"
sed 's/httpHostHeader: client\.contentco-op\.com/httpHostHeader: admin.contentco-op.com/' \
  "$client_config" >"$wrong_host_header"
if "$ROOT/validate-config.sh" --template client "$wrong_host_header" >/dev/null 2>&1; then
  fail "validator accepted the wrong origin Host header"
fi

forwarding_fallback="$temporary_dir/forwarding-fallback.yml"
sed 's#http_status:404#http://127.0.0.1:4103#' "$admin_config" >"$forwarding_fallback"
if "$ROOT/validate-config.sh" --template admin "$forwarding_fallback" >/dev/null 2>&1; then
  fail "validator accepted a forwarding catch-all rule"
fi

wrong_launchd_config="$temporary_dir/wrong-launchd-config.plist"
sed 's/cco-codeliver-admin\.yml/cco-codeliver-client.yml/' \
  "$ROOT/launchd/com.contentcoop.codeliver-admin.cloudflared.plist" >"$wrong_launchd_config"
if "$ROOT/validate-launchd.sh" --template admin "$wrong_launchd_config" >/dev/null 2>&1; then
  fail "launchd validator accepted the wrong profile config"
fi

if find "$ROOT" -type f \( -name '*.json' -o -name '*.pem' -o -name '*.token' \) -print -quit | grep -q .; then
  fail "credential-shaped files exist in infra/cloudflare"
fi

port_file="$temporary_dir/mock-port"
PORT_FILE="$port_file" node "$TEST_DIR/mock-health-server.mjs" &
server_pid=$!
for _ in $(seq 1 100); do
  [[ -s "$port_file" ]] && break
  sleep 0.05
done
[[ -s "$port_file" ]] || fail "mock health server did not start"
port="$(tr -d '[:space:]' <"$port_file")"

for profile in admin client; do
  CODELIVER_ORIGIN="http://127.0.0.1:$port" "$ROOT/health-check.sh" "$profile" origin
  CLOUDFLARED_METRICS_ADDRESS="127.0.0.1:$port" "$ROOT/health-check.sh" "$profile" connector
done

printf 'PASS: separate tunnel config, launchd, fail-closed, and health-check tests.\n'
