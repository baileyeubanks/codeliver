#!/usr/bin/env bash
set -euo pipefail

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_DIR="$(cd "$TEST_DIR/.." && pwd)"
COMMON="$RUNTIME_DIR/lib/runtime-common.sh"

fail_test() {
  printf 'm2-failover-test: %s\n' "$*" >&2
  exit 1
}

PROFILE_VALUES="$(
  CODELIVER_RUNTIME_PROFILE=m2-failover \
  CODELIVER_APP_ROOT=/tmp/forbidden \
  CODELIVER_ENV_FILE=/tmp/forbidden.env \
  CODELIVER_EXPECTED_STORAGE_MOUNT=/tmp/forbidden-storage \
  /bin/bash -c '
    source "$1"
    printf "%s|%s|%s|%s|%s|%s|%s|%s|%s" \
      "$RUNTIME_PROFILE" "$APP_ROOT" "$ENV_FILE" "$EXPECTED_RUNTIME_USER" \
      "$STORAGE_MOUNT" "$STORAGE_ROOT" "$ADMIN_HOST" "$CLIENT_HOST" "$LAUNCHD_LABEL"
  ' _ "$COMMON"
)"

EXPECTED_VALUES='m2-failover|/Users/baileyeubanks/.local/share/codeliver-failover|/Users/baileyeubanks/.config/codeliver-failover/runtime.env|baileyeubanks|/Volumes/CC_NAS|/Volumes/CC_NAS/cvp-runtime/co-videopro|co-videopro.com|client.contentco-op.com|com.contentcoop.codeliver-failover'
[[ "$PROFILE_VALUES" == "$EXPECTED_VALUES" ]] || \
  fail_test "M2 failover constants are wrong or environment-overridable: $PROFILE_VALUES"

if CODELIVER_RUNTIME_PROFILE=unsupported /bin/bash -c 'source "$1"' _ "$COMMON" >/dev/null 2>&1; then
  fail_test "unsupported runtime profile was accepted"
fi

ENV_TEMPLATE="$RUNTIME_DIR/runtime.m2-failover.env.example"
[[ -f "$ENV_TEMPLATE" ]] || fail_test "M2 failover runtime env template is missing"
for expected in \
  'ADMIN_SITE_URL=https://co-videopro.com' \
  'NEXT_PUBLIC_ADMIN_SITE_URL=https://co-videopro.com' \
  'CLIENT_SITE_URL=https://client.contentco-op.com' \
  'NEXT_PUBLIC_CLIENT_SITE_URL=https://client.contentco-op.com' \
  'NAS_MEDIA_ROOT=/Volumes/CC_NAS/cvp-runtime/co-videopro' \
  'CODELIVER_CLAMSCAN_PATH=/opt/homebrew/bin/clamscan' \
  'FFMPEG_PATH=/opt/homebrew/bin/ffmpeg' \
  'FFPROBE_PATH=/opt/homebrew/bin/ffprobe'
do
  /usr/bin/grep -Fqx "$expected" "$ENV_TEMPLATE" || fail_test "template missing $expected"
done
if /usr/bin/grep -Eq '^(NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_KEY|CO_PRODUCTION_TOKEN_ENCRYPTION_KEY|CO_PRODUCTION_WEBHOOK_SECRET_ENCRYPTION_KEY|CO_PRODUCTION_ANALYTICS_HASH_KEY|CO_PRODUCTION_REVIEW_ADMISSION_SIGNING_KEY|CODELIVER_MEDIA_PIPELINE_WORKER_TOKEN)=.+' "$ENV_TEMPLATE"; then
  fail_test "M2 failover template contains a secret value"
fi

APP_PLIST="$RUNTIME_DIR/launchd/com.contentcoop.codeliver-failover.plist"
TUNNEL_PLIST="$RUNTIME_DIR/launchd/com.contentcoop.codeliver-failover-cloudflared.plist"
WORKER_PLIST="$RUNTIME_DIR/launchd/com.contentcoop.codeliver-failover-worker.plist"
TUNNEL_CONFIG="$RUNTIME_DIR/cloudflare/m2-failover.yml.tmpl"
WORKER_RUNNER="$RUNTIME_DIR/run-media-worker.sh"
WORKER_LOOP="$RUNTIME_DIR/lib/media-worker-loop.mjs"
for artifact in "$APP_PLIST" "$TUNNEL_PLIST" "$WORKER_PLIST" "$TUNNEL_CONFIG" "$WORKER_RUNNER" "$WORKER_LOOP"; do
  [[ -f "$artifact" ]] || fail_test "missing deployment artifact: $artifact"
done
/usr/bin/plutil -lint "$APP_PLIST" >/dev/null || fail_test "application plist is invalid"
/usr/bin/plutil -lint "$TUNNEL_PLIST" >/dev/null || fail_test "tunnel plist is invalid"
/usr/bin/plutil -lint "$WORKER_PLIST" >/dev/null || fail_test "worker plist is invalid"

/usr/bin/grep -Fq '<key>CODELIVER_RUNTIME_PROFILE</key>' "$APP_PLIST" || \
  fail_test "application plist does not set the runtime profile"
/usr/bin/grep -Fq '<string>m2-failover</string>' "$APP_PLIST" || \
  fail_test "application plist does not select m2-failover"
/usr/bin/grep -Fq '<string>/Users/baileyeubanks/.local/share/codeliver-failover/control/run-current.sh</string>' "$APP_PLIST" || \
  fail_test "application plist does not call the failover control plane"

for expected in \
  'tunnel: 5930eff7-9474-4427-826a-83e129c804e0' \
  'credentials-file: /Users/baileyeubanks/.config/codeliver-failover/cloudflared-credentials.json' \
  'hostname: co-videopro.com' \
  'hostname: client.contentco-op.com' \
  'service: http://127.0.0.1:4103' \
  'httpHostHeader: co-videopro.com' \
  'service: http_status:404'
do
  /usr/bin/grep -Fq "$expected" "$TUNNEL_CONFIG" || fail_test "tunnel template missing $expected"
done
if /usr/bin/grep -Eqi '(token:|token-file:|credentials-contents:|-----BEGIN|eyJ[A-Za-z0-9_-]{20,})' "$TUNNEL_CONFIG" "$APP_PLIST" "$TUNNEL_PLIST"; then
  fail_test "deployment artifacts contain inline credential material"
fi

/usr/bin/grep -Fq '<string>/Users/baileyeubanks/.local/share/codeliver-failover/control/run-media-worker.sh</string>' "$WORKER_PLIST" || \
  fail_test "worker plist does not call the supervised worker runner"
/usr/bin/grep -Fq 'CODELIVER_MEDIA_PIPELINE_WORKER_TOKEN' "$WORKER_RUNNER" || \
  fail_test "worker runner does not require the private token"
/usr/bin/grep -Fq 'recoverAndRunNext' "$WORKER_LOOP" || \
  fail_test "worker loop does not identify its recover-and-run-next contract"
/usr/bin/grep -Fq 'x-codeliver-media-worker-token' "$WORKER_LOOP" || \
  fail_test "worker loop does not authenticate to the private endpoint"

printf 'PASS: M2 CVP failover profile and deployment artifacts satisfy the fixed contract.\n'
