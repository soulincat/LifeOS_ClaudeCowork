#!/bin/bash

# Auto-Launch Life OS Dashboard
# Sets up LaunchAgent to start server and open browser on login

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
START_SCRIPT="$PROJECT_DIR/scripts/start-dashboard.sh"

# Create start script
cat > "$START_SCRIPT" << 'EOF'
#!/bin/bash
cd PROJECT_DIR
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
sleep 3
npm start > /dev/null 2>&1 &
sleep 5
open "http://localhost:3000"
EOF

# Replace PROJECT_DIR placeholder
sed -i '' "s|PROJECT_DIR|$PROJECT_DIR|g" "$START_SCRIPT"
chmod +x "$START_SCRIPT"

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

# Load the LaunchAgent
launchctl unload "$PLIST_PATH" 2>/dev/null
launchctl load "$PLIST_PATH"

echo "✅ Auto-launch setup complete!"
echo "Dashboard will start automatically on login."
echo ""
echo "To disable: launchctl unload $PLIST_PATH && rm $PLIST_PATH"
