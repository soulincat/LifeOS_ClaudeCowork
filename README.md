# Life OS Dashboard

A personal dashboard that loads automatically when you open your laptop. Built as a local web application that displays your projects, health metrics, finances, emails, and more in a clean, organized interface.

## Features

- **AI Notepad**: Morning log for thoughts, tasks, and ideas
- **GitHub Activity**: Code contribution calendar
- **Project Cards**: Visual overview of your projects with metrics
- **Social Media**: Track followers, posts, impressions, and scheduled content
- **Finance Dashboard**: Quick view of revenue, profit, and outstanding payments
- **Health Metrics**: Recovery, sleep, HRV, and cycle tracking
- **Email Summary**: Important emails at a glance
- **Task List**: Today's tasks overview

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Run Locally

```bash
npm start
```

The dashboard will be available at `http://localhost:3000`

### 3. Open Directly in Browser (No Server)

You can also open `index.html` directly in your browser - it works as a standalone file!

## Auto-Load on macOS Startup

To make the dashboard open automatically when you open your laptop:

### Option 1: Using Automator (Recommended)

1. Open **Automator** (Applications > Automator)
2. Create a new **Application**
3. Add action: **Run Shell Script**
4. Paste this script:

```bash
sleep 5
open -a "Google Chrome" "http://localhost:3000"
# OR for Safari:
# open -a "Safari" "http://localhost:3000"
```

5. Save as "Life OS" in Applications folder
6. Go to **System Settings > General > Login Items**
7. Click **+** and add the "Life OS" app

**Note**: Make sure the server is running (`npm start`) before setting this up, or use the file:// method below.

### Option 2: Direct File Opening

1. Open **Automator**
2. Create a new **Application**
3. Add action: **Run Shell Script**
4. Paste this script (update the path):

```bash
sleep 5
open -a "Google Chrome" "/Users/cat/code/LifeOS_ClaudeCowork/index.html"
# OR for Safari:
# open -a "Safari" "/Users/cat/code/LifeOS_ClaudeCowork/index.html"
```

5. Save as "Life OS" in Applications folder
6. Add to Login Items as described above

### Option 3: Using launchd (Advanced)

Create a plist file at `~/Library/LaunchAgents/com.lifeos.dashboard.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.lifeos.dashboard</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/open</string>
        <string>-a</string>
        <string>Google Chrome</string>
        <string>http://localhost:3000</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
```

Then load it:
```bash
launchctl load ~/Library/LaunchAgents/com.lifeos.dashboard.plist
```

## Customization

- Edit `styles.css` to change colors, fonts, and layout
- Modify `app.js` to add interactivity and API integrations
- Update `index.html` to add or remove dashboard sections
- Replace placeholder data with real API calls or data sources

## Future Enhancements

- [ ] Claude API integration for AI Notepad
- [ ] Real GitHub API for contribution calendar
- [ ] Email API integration (Gmail, etc.)
- [ ] Health tracker API integration
- [ ] Finance API integration
- [ ] Data persistence (localStorage or database)
- [ ] Auto-refresh functionality
- [ ] Dark mode toggle

## License

MIT
