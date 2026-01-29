#!/bin/bash

# Setup Sync Jobs for Life OS Dashboard
# Creates LaunchAgents for daily and weekly syncs

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Setting up sync jobs for Life OS Dashboard..."
echo ""

# Check if node is available
if ! command -v node &> /dev/null; then
    echo "⚠️  Node.js not found. Please install Node.js first."
    exit 1
fi

# Create sync script
SYNC_SCRIPT="$PROJECT_DIR/scripts/run-sync.js"
cat > "$SYNC_SCRIPT" << EOF
#!/usr/bin/env node
const syncManager = require('../integrations/sync');
const type = process.argv[2] || 'daily';

(async () => {
    try {
        switch(type) {
            case 'daily':
                await syncManager.runDailySync();
                break;
            case 'weekly':
                await syncManager.runWeeklySync();
                break;
            case 'ondemand':
                await syncManager.runOnDemandSync();
                break;
            case 'monthend':
                await syncManager.runMonthEndArchive();
                break;
            case 'all':
                await syncManager.runAllSyncs();
                break;
            default:
                console.log('Unknown sync type:', type);
        }
        process.exit(0);
    } catch (error) {
        console.error('Sync error:', error);
        process.exit(1);
    }
})();
EOF

chmod +x "$SYNC_SCRIPT"
echo "✅ Created sync script: $SYNC_SCRIPT"

# Create daily sync LaunchAgent
DAILY_PLIST="$HOME/Library/LaunchAgents/com.lifeos.sync.daily.plist"
cat > "$DAILY_PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.lifeos.sync.daily</string>
    <key>ProgramArguments</key>
    <array>
        <string>NODE_PATH</string>
        <string>$SYNC_SCRIPT</string>
        <string>daily</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>8</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>$HOME/Library/Logs/lifeos-sync-daily.log</string>
    <key>StandardErrorPath</key>
    <string>$HOME/Library/Logs/lifeos-sync-daily-error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
</dict>
</plist>
EOF

# Create weekly sync LaunchAgent (runs Monday mornings)
WEEKLY_PLIST="$HOME/Library/LaunchAgents/com.lifeos.sync.weekly.plist"
cat > "$WEEKLY_PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.lifeos.sync.weekly</string>
    <key>ProgramArguments</key>
    <array>
        <string>NODE_PATH</string>
        <string>$SYNC_SCRIPT</string>
        <string>weekly</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Weekday</key>
        <integer>1</integer>
        <key>Hour</key>
        <integer>9</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>$HOME/Library/Logs/lifeos-sync-weekly.log</string>
    <key>StandardErrorPath</key>
    <string>$HOME/Library/Logs/lifeos-sync-weekly-error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
</dict>
</plist>
EOF

# Create month-end archive LaunchAgent (runs on last day of month at 11:59 PM)
MONTHEND_PLIST="$HOME/Library/LaunchAgents/com.lifeos.sync.monthend.plist"
cat > "$MONTHEND_PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.lifeos.sync.monthend</string>
    <key>ProgramArguments</key>
    <array>
        <string>NODE_PATH</string>
        <string>$SYNC_SCRIPT</string>
        <string>monthend</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Day</key>
        <integer>-1</integer>
        <key>Hour</key>
        <integer>23</integer>
        <key>Minute</key>
        <integer>59</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>$HOME/Library/Logs/lifeos-sync-monthend.log</string>
    <key>StandardErrorPath</key>
    <string>$HOME/Library/Logs/lifeos-sync-monthend-error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
</dict>
</plist>
EOF

# Get node path
NODE_PATH=$(which node)
if [ -z "$NODE_PATH" ]; then
    echo "⚠️  Node.js not found in PATH. Please install Node.js first."
    exit 1
fi

# Update plists with correct node path
sed -i '' "s|NODE_PATH|$NODE_PATH|g" "$DAILY_PLIST"
sed -i '' "s|NODE_PATH|$NODE_PATH|g" "$WEEKLY_PLIST"
sed -i '' "s|NODE_PATH|$NODE_PATH|g" "$MONTHEND_PLIST"

# Load LaunchAgents
launchctl unload "$DAILY_PLIST" 2>/dev/null
launchctl load "$DAILY_PLIST"

launchctl unload "$WEEKLY_PLIST" 2>/dev/null
launchctl load "$WEEKLY_PLIST"

launchctl unload "$MONTHEND_PLIST" 2>/dev/null
launchctl load "$MONTHEND_PLIST"

echo "✅ Created daily sync LaunchAgent: $DAILY_PLIST"
echo "✅ Created weekly sync LaunchAgent: $WEEKLY_PLIST"
echo "✅ Created month-end archive LaunchAgent: $MONTHEND_PLIST"
echo ""
echo "Sync jobs will run:"
echo "  - Daily sync: Every day at 8:00 AM (health, spending)"
echo "  - Weekly sync: Every Monday at 9:00 AM (revenue, profit, social)"
echo "  - Month-end archive: Last day of month at 11:59 PM (final monthly totals)"
echo ""
echo "To disable sync jobs:"
echo "  launchctl unload $DAILY_PLIST && rm $DAILY_PLIST"
echo "  launchctl unload $WEEKLY_PLIST && rm $WEEKLY_PLIST"
echo "  launchctl unload $MONTHEND_PLIST && rm $MONTHEND_PLIST"
echo ""
