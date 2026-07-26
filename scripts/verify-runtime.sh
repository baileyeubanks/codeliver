#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:4103}"
BUILD_DIR="${BUILD_DIR:-.next}"
AUTH_COOKIE="${AUTH_COOKIE:-}"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

pass() {
  printf 'PASS: %s\n' "$1"
}

status_for() {
  curl -sS -o "$tmp_dir/body" -D "$tmp_dir/headers" -w '%{http_code}' "$@"
}

protected_status="$(status_for "$BASE_URL/projects/ica?demo=1")"
case "$protected_status" in
  302|303|307|308) pass "demo query does not bypass production auth" ;;
  *) fail "expected protected demo query to redirect, got HTTP $protected_status" ;;
esac

session_status="$(status_for "$BASE_URL/api/auth/session")"
case "$session_status" in
  200|401|403|503) ;;
  *) fail "auth session returned HTTP $session_status" ;;
esac
grep -q 'application/json' "$tmp_dir/headers" \
  || fail "auth session did not return JSON"
grep -q '"code"\|"authenticated"' "$tmp_dir/body" \
  || fail "auth session JSON lacks a stable code/authenticated field"
pass "auth session returns structured JSON"

status_for "$BASE_URL/login" >/dev/null
grep -qi '^content-security-policy:' "$tmp_dir/headers" \
  || fail "Content-Security-Policy is missing"
grep -qi "frame-ancestors 'none'" "$tmp_dir/headers" \
  || fail "CSP frame-ancestors is missing"
grep -qi '^x-content-type-options: nosniff' "$tmp_dir/headers" \
  || fail "X-Content-Type-Options is missing"
grep -qi '^referrer-policy: strict-origin-when-cross-origin' "$tmp_dir/headers" \
  || fail "Referrer-Policy is missing"
if grep -qi '^x-powered-by:' "$tmp_dir/headers"; then
  fail "X-Powered-By is still exposed"
fi
pass "baseline security headers are present"

status_for "$BASE_URL/api/health" >/dev/null
if grep -Eqi '"(service|port|product|failedDependencies)"' "$tmp_dir/body"; then
  fail "public health response exposes runtime topology"
fi
pass "public health response is minimal"

editor_status="$(status_for "$BASE_URL/__nextjs_launch-editor?file=package.json")"
case "$editor_status" in
  2*) fail "Next.js editor endpoint returned HTTP $editor_status" ;;
esac
# The middleware 307s unknown paths to /login?next=<original-url>, which echoes
# the (harmless) endpoint name inside the login page's return-path param. That
# echo is not editor behavior — strip the return-path value before matching.
if sed -E -e 's/%2F__nextjs_launch-editor[^" <]*//g' \
  -e 's/__nextjs_launch-editor[^" <]*//g' "$tmp_dir/body" \
  | grep -Eqi 'launch.?editor|open in editor'; then
  fail "Next.js editor endpoint returned editor behavior"
fi
pass "Next.js editor endpoint has no production behavior"

rsc_status="$(status_for \
  -H 'RSC: 1' \
  -H 'Next-Router-State-Tree: %5B%22%22%5D' \
  "$BASE_URL/projects/ica")"
case "$rsc_status" in
  5*) fail "malformed RSC request returned server error HTTP $rsc_status" ;;
esac
if grep -Eqi '/Users/|[A-Za-z]:\\\\|node_modules/next/dist/.+runtime\.(dev|development)|webpack-internal:|file:' "$tmp_dir/body"; then
  fail "malformed RSC response exposes a stack or source path"
fi
pass "malformed RSC request does not expose a stack or source path"

if [[ -n "$AUTH_COOKIE" ]]; then
  missing_status="$(status_for -H "Cookie: $AUTH_COOKIE" "$BASE_URL/projects/does-not-exist")"
  [[ "$missing_status" == "404" ]] \
    || fail "authenticated missing project returned HTTP $missing_status"
  pass "authenticated missing project returns 404"
else
  printf 'SKIP: authenticated 404 check (AUTH_COOKIE is unset)\n'
fi

if [[ -d "$BUILD_DIR/static/chunks" ]] && \
  grep -R -E -q 'STRIPE_RESTRICTED_KEY|api\.stripe\.com' "$BUILD_DIR/static/chunks"; then
  fail "client chunks contain server-only Stripe implementation details"
fi
pass "client chunks exclude server-only Stripe implementation details"

login_html="$tmp_dir/login.html"
curl -fsS "$BASE_URL/login" >"$login_html" \
  || fail "could not fetch login page to inspect browser source maps"
map_count=0
while IFS= read -r script_path; do
  script_path="${script_path%%\?*}"
  map_status="$(status_for "$BASE_URL${script_path}.map")"
  case "$map_status" in
    404|410) ;;
    *) fail "browser source map ${script_path}.map returned HTTP $map_status" ;;
  esac
  map_count=$((map_count + 1))
done < <(grep -oE '/_next/static/[^"[:space:]]+\.js(\?[^"[:space:]]*)?' "$login_html" | sort -u)
(( map_count > 0 )) || fail "login page did not expose any Next.js browser scripts to verify"
pass "browser source maps are unavailable for $map_count served scripts"

printf 'Runtime verification passed for %s\n' "$BASE_URL"
