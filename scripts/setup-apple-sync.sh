#!/bin/bash

# Setup Apple Sync + Notifications for Life OS
# Installs two LaunchAgents:
#   1. com.lifeos.apple-notify  — runs every hour (notifications + Reminders/Calendar sync)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
NOTIFY_SCRIPT="$PROJECT_DIR/notifications/apple-notify.js"

echo "Setting up Life OS Apple sync & notifications..."
echo ""

# Check Node.js
NODE_PATH=$(which node)
if [ -z "$NODE_PATH" ]; then
    echo "❌ Node.js not found. Please install Node.js first."
    exit 1
fi
echo "✅ Node.js found at: $NODE_PATH"

# Grant Automation permission hint
echo ""
echo "⚠️  IMPORTANT: The first time this runs, macOS will ask for permission:"
echo "   • 'Terminal' wants to control 'Reminders' — click Allow"
echo "   • 'Terminal' wants to control 'Calendar' — click Allow"
echo "   Or go to: System Settings → Privacy & Security → Automation"
echo ""

# ── LaunchAgent: hourly Apple sync + notifications ──────────────────────────
PLIST_PATH="$HOME/Library/LaunchAgents/com.lifeos.apple-notify.plist"

cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.lifeos.apple-notify</string>
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_PATH</string>
        <string>$NOTIFY_SCRIPT</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin</string>
    </dict>
    <key>StartInterval</key>
    <integer>3600</integer>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$HOME/Library/Logs/lifeos-apple-notify.log</string>
    <key>StandardErrorPath</key>
    <string>$HOME/Library/Logs/lifeos-apple-notify-error.log</string>
</dict>
</plist>
EOF

launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"
echo "✅ Hourly Apple sync + notifications installed"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Apple sync setup complete!"
echo ""
echo "What happens now:"
echo "  • Every hour: todos synced to Apple Reminders (Life OS list)"
echo "  • Every hour: upcoming items synced to Apple Calendar (Life OS calendar)"
echo "  • Notifications for events starting within 60 minutes"
echo "  • Morning digest (7-9 AM) for today's schedule"
echo "  • Overdue todo reminders"
echo ""
echo "Google Calendar:"
echo "  If you have Google Calendar configured in Calendar.app (System Settings"
echo "  → Internet Accounts), events in the 'Life OS' calendar will sync there"
echo "  automatically — no extra setup needed."
echo ""
echo "To run immediately: node $NOTIFY_SCRIPT"
echo "To uninstall: launchctl unload $PLIST_PATH && rm $PLIST_PATH"
echo "Logs: tail -f ~/Library/Logs/lifeos-apple-notify.log"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
