#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
APP_DIR="${SCRIPT_DIR:h}"
PORT="${PORT:-4103}"

if [[ ! "$PORT" =~ '^[0-9]+$' ]] || (( PORT < 1 || PORT > 65535 )); then
  echo "[co-deliver] invalid PORT: $PORT" >&2
  exit 1
fi

required_file="$APP_DIR/package.json"
if [[ ! -f "$required_file" ]]; then
  echo "[co-deliver] invalid project root: missing $required_file" >&2
  exit 1
fi

required_file="$APP_DIR/next.config.ts"
if [[ ! -f "$required_file" ]]; then
  echo "[co-deliver] invalid project root: missing $required_file" >&2
  exit 1
fi

required_directory="$APP_DIR/app"
if [[ ! -d "$required_directory" ]]; then
  echo "[co-deliver] invalid project root: missing $required_directory" >&2
  exit 1
fi

cd "$APP_DIR"
npm ci
npm run build

listener_output="$(lsof -nP -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
listener_pids=()
if [[ -n "$listener_output" ]]; then
  listener_pids=("${(@f)listener_output}")
fi
if (( ${#listener_pids[@]} > 1 )); then
  echo "[co-deliver] refusing to replace :$PORT: multiple listeners detected (${(j:,:)listener_pids})" >&2
  exit 1
fi

if (( ${#listener_pids[@]} == 1 )); then
  existing_pid="$listener_pids[1]"
  process_cwd="$(lsof -a -p "$existing_pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1)"
  process_command="$(ps -p "$existing_pid" -o command= 2>/dev/null || true)"

  if [[ "$process_cwd" != "$APP_DIR" ]] || {
    [[ "$process_command" != *"next dev"* ]] &&
    [[ "$process_command" != *"next start"* ]] &&
    [[ "$process_command" != *"next-server"* ]]
  }; then
    echo "[co-deliver] refusing to stop unverified listener PID $existing_pid on :$PORT" >&2
    echo "[co-deliver] expected cwd $APP_DIR and a Next dev/start listener command" >&2
    exit 1
  fi

  current_listener="$(lsof -nP -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ "$current_listener" != "$existing_pid" ]]; then
    echo "[co-deliver] refusing to stop PID $existing_pid: listener changed during validation" >&2
    exit 1
  fi

  echo "[co-deliver] stopping verified app-owned Next runtime PID $existing_pid on :$PORT"
  kill -TERM "$existing_pid"
  for _ in {1..20}; do
    if ! kill -0 "$existing_pid" 2>/dev/null; then
      break
    fi
    sleep 1
  done
  if kill -0 "$existing_pid" 2>/dev/null; then
    echo "[co-deliver] verified runtime PID $existing_pid did not exit after SIGTERM; refusing to force kill" >&2
    exit 1
  fi

  replacement_listener="$(lsof -nP -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$replacement_listener" ]]; then
    echo "[co-deliver] refusing to start: :$PORT was reclaimed after the verified runtime stopped" >&2
    exit 1
  fi
fi

echo "[co-deliver] starting fresh runtime on :$PORT"
PORT="$PORT" exec npm run start
