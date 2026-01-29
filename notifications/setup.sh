#!/bin/bash

# Setup Life OS Reminders
# This script sets up automatic reminders on macOS

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
REMINDER_SCRIPT="$SCRIPT_DIR/reminder.js"

# Make reminder script executable
chmod +x "$REMINDER_SCRIPT"

echo "Setting up Life OS reminders..."
echo ""

# Create LaunchAgent plist for login reminder
PLIST_PATH="$HOME/Library/LaunchAgents/com.lifeos.reminder.plist"

cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.lifeos.reminder</string>
    <key>ProgramArguments</key>
    <array>
        <string>NODE_PATH</string>
        <string>$REMINDER_SCRIPT</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>StartInterval</key>
    <integer>3600</integer>
    <key>StandardOutPath</key>
    <string>$HOME/Library/Logs/lifeos-reminder.log</string>
    <key>StandardErrorPath</key>
    <string>$HOME/Library/Logs/lifeos-reminder-error.log</string>
</dict>
</plist>
EOF

echo "✅ Created LaunchAgent plist at: $PLIST_PATH"
echo ""

# Check if node is available
NODE_PATH=$(which node)
if [ -z "$NODE_PATH" ]; then
    echo "⚠️  Node.js not found in PATH. Please install Node.js first."
    exit 1
fi

# Update plist with correct node path
sed -i '' "s|NODE_PATH|$NODE_PATH|g" "$PLIST_PATH"

# Load the LaunchAgent
launchctl unload "$PLIST_PATH" 2>/dev/null
launchctl load "$PLIST_PATH"

echo "✅ LaunchAgent loaded successfully!"
echo ""
echo "Reminders will now run:"
echo "  - Every Monday morning (or when laptop opens on Monday)"
echo "  - End of month (last 3 days) for finance input"
echo ""
echo "To uninstall, run: launchctl unload $PLIST_PATH && rm $PLIST_PATH"
echo ""
