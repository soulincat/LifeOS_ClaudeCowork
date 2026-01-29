#!/bin/bash

# Setup Auto-Launch for Life OS Dashboard

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Setting up auto-launch for Life OS Dashboard..."
echo ""

# Check if node is available
if ! command -v node &> /dev/null; then
    echo "⚠️  Node.js not found. Please install Node.js first."
    exit 1
fi

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo "⚠️  npm not found. Please install npm first."
    exit 1
fi

# Create start script
START_SCRIPT="$PROJECT_DIR/scripts/start-dashboard.sh"
cat > "$START_SCRIPT" << EOF
#!/bin/bash
cd "$PROJECT_DIR"
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:\$PATH"

# Wait for network
sleep 3

# Start server in background
npm start > "$HOME/Library/Logs/lifeos-server.log" 2>&1 &

# Wait for server to start
sleep 5

# Open browser
open "http://localhost:3000"
EOF

chmod +x "$START_SCRIPT"
echo "✅ Created start script: $START_SCRIPT"

# Create LaunchAgent plist
PLIST_PATH="$HOME/Library/LaunchAgents/com.lifeos.dashboard.plist"

cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.lifeos.dashboard</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$START_SCRIPT</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$HOME/Library/Logs/lifeos-dashboard.log</string>
    <key>StandardErrorPath</key>
    <string>$HOME/Library/Logs/lifeos-dashboard-error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
</dict>
</plist>
EOF

echo "✅ Created LaunchAgent plist: $PLIST_PATH"

# Load the LaunchAgent
launchctl unload "$PLIST_PATH" 2>/dev/null
launchctl load "$PLIST_PATH"

echo "✅ LaunchAgent loaded successfully!"
echo ""
echo "Dashboard will now:"
echo "  - Start automatically on login"
echo "  - Open browser to http://localhost:3000"
echo ""
echo "To disable auto-launch:"
echo "  launchctl unload $PLIST_PATH && rm $PLIST_PATH"
echo ""
