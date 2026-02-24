#!/bin/bash
set -e
PROJECT_DIR="/Users/cat/code/LifeOS_ClaudeCowork"
LOG_DIR="/Users/cat/Library/Logs"
export PATH="/opt/homebrew/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

cd "$PROJECT_DIR"
echo "$(date '+%Y-%m-%d %H:%M:%S') start-dashboard: starting" >> "$LOG_DIR/lifeos-dashboard.log"

# Give login/GUI a moment to be ready
sleep 5

# Start server in background (nohup so it survives script exit)
nohup npm start >> "$LOG_DIR/lifeos-server.log" 2>&1 &
SERVER_PID=$!
echo "$(date '+%Y-%m-%d %H:%M:%S') server pid $SERVER_PID" >> "$LOG_DIR/lifeos-dashboard.log"

# Wait for port 3001 to respond (up to 30s)
for i in $(seq 1 30); do
  if curl -s -o /dev/null http://localhost:3001/ 2>/dev/null; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') server up after $i s" >> "$LOG_DIR/lifeos-dashboard.log"
    break
  fi
  sleep 1
done

# Extra delay so browser opens after Dock is ready
sleep 8

# Open browser on macOS
open "http://localhost:3001" 2>/dev/null || true
echo "$(date '+%Y-%m-%d %H:%M:%S') opened browser" >> "$LOG_DIR/lifeos-dashboard.log"
