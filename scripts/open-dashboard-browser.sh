#!/bin/bash
# Wait for server to be up, then open browser (run once at login)
LOG_DIR="$HOME/Library/Logs"
echo "$(date '+%Y-%m-%d %H:%M:%S') open-dashboard: waiting for server..." >> "$LOG_DIR/lifeos-dashboard.log"
sleep 15
for i in $(seq 1 30); do
  if curl -s -o /dev/null http://localhost:3001/ 2>/dev/null; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') server up, opening browser" >> "$LOG_DIR/lifeos-dashboard.log"
    open "http://localhost:3001" 2>/dev/null || true
    exit 0
  fi
  sleep 1
done
echo "$(date '+%Y-%m-%d %H:%M:%S') server did not respond in time" >> "$LOG_DIR/lifeos-dashboard.log"
