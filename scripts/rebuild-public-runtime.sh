#!/bin/zsh
set -euo pipefail

APP_DIR="/Users/baileyeubanks/Desktop/Projects/contentco-op/codeliver"
PORT="${PORT:-4103}"

cd "$APP_DIR"
npm run build

existing_pid=$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)
if [[ -n "$existing_pid" ]]; then
  echo "[co-deliver] stopping existing runtime on :$PORT"
  echo "$existing_pid" | xargs kill >/dev/null 2>&1 || true
  sleep 1
fi

echo "[co-deliver] starting fresh runtime on :$PORT"
PORT="$PORT" npm run start
