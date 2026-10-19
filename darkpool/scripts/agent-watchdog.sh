#!/usr/bin/env bash
# DARKPOOL agent watchdog — keeps the agent running, restarts on exit.
# This is a workaround for sandbox environments that reap background processes.
# In production, systemd handles this via Restart=on-failure.

set -u

MAIN_URL="${MAIN_URL:-https://x1n9x8z10cm1-d.space-z.ai}"
AGENT_DIR="/home/z/my-project/worker-agent"
LOG_FILE="${AGENT_LOG:-/tmp/agent.log}"
PID_FILE="/tmp/darkpool-agent.pid"

echo "[watchdog] starting DARKPOOL agent watchdog"
echo "[watchdog] MAIN_URL=$MAIN_URL"
echo "[watchdog] LOG_FILE=$LOG_FILE"

restart_count=0
max_restarts=100

while [[ $restart_count -lt $max_restarts ]]; do
  # Check if agent is already running
  EXISTING_PID=$(pgrep -f "src/agent.ts" | head -1 || true)
  if [[ -n "$EXISTING_PID" ]]; then
    # Already running — wait and recheck
    sleep 5
    continue
  fi

  restart_count=$((restart_count + 1))
  echo "[watchdog] starting agent (attempt $restart_count) at $(date -Iseconds)"

  cd "$AGENT_DIR"
  setsid env MAIN_URL="$MAIN_URL" bun src/agent.ts >> "$LOG_FILE" 2>&1 < /dev/null &
  AGENT_PID=$!
  echo "$AGENT_PID" > "$PID_FILE"
  disown

  # Wait briefly to confirm it started
  sleep 3
  if kill -0 "$AGENT_PID" 2>/dev/null; then
    echo "[watchdog] agent started (pid=$AGENT_PID)"
  else
    echo "[watchdog] agent exited immediately — check $LOG_FILE"
  fi

  # Wait before retrying (in case it dies)
  sleep 5
done

echo "[watchdog] reached max restarts ($max_restarts), exiting"
