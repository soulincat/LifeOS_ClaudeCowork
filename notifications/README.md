# Life OS Reminders

Desktop notifications and popups to remind you to check your dashboard and input financial data.

## Features

- **Weekly Reminder**: Shows every Monday morning (8-10 AM) to check dashboard updates
- **Monthly Reminder**: Shows at end of month (last 3 days, 9-11 AM) to input financial data

## Setup

### Option 1: macOS Native Notifications (Recommended)

Run the setup script to install automatic reminders:

```bash
cd notifications
./setup.sh
```

This will:
- Create a LaunchAgent that runs on login
- Check for reminders every hour
- Show native macOS notifications
- Automatically open the dashboard

**To uninstall:**
```bash
./uninstall.sh
```

### Option 2: Manual Testing

Test notifications manually:

```bash
# Weekly reminder
node notifications/reminder.js

# Show popup only
node notifications/show-popup.js weekly
node notifications/show-popup.js monthly
```

## How It Works

1. **LaunchAgent** (`com.lifeos.reminder.plist`) runs the reminder script every hour
2. Script checks:
   - If it's Monday morning (8-10 AM) → Weekly reminder
   - If it's end of month (last 3 days, 9-11 AM) → Monthly reminder
3. Shows macOS notification and opens dashboard/popup

## Customization

Edit `reminder.js` to customize:
- Time windows for reminders
- Notification messages
- Sound preferences
- Popup behavior

## Troubleshooting

**Notifications not showing?**
- Check if LaunchAgent is loaded: `launchctl list | grep lifeos`
- Check logs: `tail -f ~/Library/Logs/lifeos-reminder.log`
- Reload: `launchctl unload ~/Library/LaunchAgents/com.lifeos.reminder.plist && launchctl load ~/Library/LaunchAgents/com.lifeos.reminder.plist`

**Popup not opening?**
- Make sure the dashboard server is running (`npm start`)
- Check browser permissions
- Try opening manually: `open notifications/popup.html`
