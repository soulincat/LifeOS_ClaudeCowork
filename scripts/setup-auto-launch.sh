#!/bin/bash

# Setup Auto-Launch for Life OS Dashboard
# Uses two LaunchAgents: one keeps the server running (KeepAlive), one opens the browser after login.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$HOME/Library/Logs"

echo "Setting up auto-launch for Life OS Dashboard..."
echo ""

# Need node for the server (use full path so LaunchAgent doesn't depend on PATH)
if ! command -v node &> /dev/null; then
    echo "⚠️  Node.js not found. Please install Node.js first."
    exit 1
fi
NODE_BIN="$(command -v node)"
SERVER_JS="$PROJECT_DIR/server.js"
echo "Using Node: $NODE_BIN"
echo "Server: $SERVER_JS"
echo ""

# ---- 1) Server LaunchAgent: run node server.js with KeepAlive (starts at login, stays running) ----
SERVER_PLIST="$HOME/Library/LaunchAgents/com.lifeos.dashboard.server.plist"
cat > "$SERVER_PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.lifeos.dashboard.server</string>
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_BIN</string>
        <string>$SERVER_JS</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$PROJECT_DIR</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$LOG_DIR/lifeos-server.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/lifeos-server-error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PORT</key>
        <string>3001</string>
    </dict>
</dict>
</plist>
EOF

echo "✅ Created server LaunchAgent: $SERVER_PLIST"

# ---- 2) Open-browser script: wait for server then open URL ----
OPEN_SCRIPT="$PROJECT_DIR/scripts/open-dashboard-browser.sh"
cat > "$OPEN_SCRIPT" << 'OPENEOF'
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
OPENEOF

chmod +x "$OPEN_SCRIPT"
echo "✅ Created open-browser script: $OPEN_SCRIPT"

# ---- 3) Open-browser LaunchAgent: run script at load (one-shot) ----
OPEN_PLIST="$HOME/Library/LaunchAgents/com.lifeos.dashboard.open.plist"
cat > "$OPEN_PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.lifeos.dashboard.open</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$OPEN_SCRIPT</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$LOG_DIR/lifeos-dashboard.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/lifeos-dashboard-error.log</string>
</dict>
</plist>
EOF

echo "✅ Created open-browser LaunchAgent: $OPEN_PLIST"

# Remove old single agent if present
OLD_PLIST="$HOME/Library/LaunchAgents/com.lifeos.dashboard.plist"
if [ -f "$OLD_PLIST" ]; then
    launchctl unload "$OLD_PLIST" 2>/dev/null
    rm -f "$OLD_PLIST"
    echo "✅ Removed old LaunchAgent (com.lifeos.dashboard)"
fi

# Load both agents (unload first so we pick up the new plists)
launchctl unload "$SERVER_PLIST" 2>/dev/null
launchctl load "$SERVER_PLIST"
launchctl unload "$OPEN_PLIST" 2>/dev/null
launchctl load "$OPEN_PLIST"

echo ""
echo "✅ Auto-launch is set up."
echo ""
echo "At login:"
echo "  • Server starts automatically and stays running (KeepAlive)."
echo "  • After ~15s the browser opens to http://localhost:3001"
echo ""
echo "Logs: $LOG_DIR/lifeos-server.log and $LOG_DIR/lifeos-dashboard.log"
echo ""
echo "To disable:"
echo "  launchctl unload $SERVER_PLIST && rm $SERVER_PLIST"
echo "  launchctl unload $OPEN_PLIST && rm $OPEN_PLIST"
echo ""
