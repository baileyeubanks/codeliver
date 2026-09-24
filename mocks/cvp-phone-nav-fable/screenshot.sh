#!/usr/bin/env bash
# Regenerate the PNG evidence for this mock with headless Chrome.
# Captures the 390×844 phone screen at 2× (780×1688 px) for states A and B.
#
#   ./mocks/cvp-phone-nav-fable/screenshot.sh            # uses google-chrome / chromium on PATH
#   CHROME=/path/to/chrome ./mocks/cvp-phone-nav-fable/screenshot.sh
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
out="$here/screenshots"
mkdir -p "$out"

chrome="${CHROME:-}"
if [[ -z "$chrome" ]]; then
  # Prefer the real binary: some machines wrap `google-chrome` with a shared
  # profile + remote-debugging port, which keeps the process alive after capture.
  for c in /opt/google/chrome/chrome /usr/lib/chromium/chromium \
           google-chrome google-chrome-stable chromium chromium-browser; do
    if [[ -x "$c" ]] || command -v "$c" >/dev/null 2>&1; then chrome="$c"; break; fi
  done
fi
if [[ -z "$chrome" ]]; then
  echo "No Chrome/Chromium found. Set CHROME=/path/to/chrome" >&2
  exit 1
fi

profile="$(mktemp -d)"
trap 'rm -rf "$profile"' EXIT

shoot() {
  local url="$1" file="$2"
  timeout 60 "$chrome" \
    --headless=new --disable-gpu --no-sandbox --hide-scrollbars \
    --no-first-run --no-default-browser-check \
    --user-data-dir="$profile" \
    --window-size=390,844 --force-device-scale-factor=2 \
    --virtual-time-budget=1500 \
    --screenshot="$out/$file" \
    "$url" >/dev/null 2>&1 || true
  [[ -s "$out/$file" ]] || { echo "capture failed: $file" >&2; exit 1; }
  echo "wrote $out/$file"
}

shoot "file://$here/index.html"               "a-default-projects-bottom-rail.png"
shoot "file://$here/index.html?state=drawer"  "b-drawer-open-deep-tools.png"
