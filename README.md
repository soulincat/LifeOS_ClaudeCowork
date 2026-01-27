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

### 2. Configure Claude API (Optional but Recommended)

To enable the AGENT chat functionality:

1. Get your API key from [Anthropic Console](https://console.anthropic.com/)
2. Create a `.env` file in the project root:
   ```bash
   cp .env.example .env
   ```
3. Add your API key to `.env`:
   ```
   ANTHROPIC_API_KEY=your_api_key_here
   ```

### 3. Run Locally

```bash
npm start
```

The dashboard will be available at `http://localhost:3000`

**Note**: Without the API key, the AGENT will show a placeholder message. The dashboard still works for everything else!

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

## AGENT Integration

The AGENT chat box connects to Claude via the Anthropic API. There are three ways to connect:

### Option 1: Claude API (Current Implementation) ✅
- Uses Anthropic's official API
- Requires `ANTHROPIC_API_KEY` in `.env`
- Works immediately once configured
- **Recommended for most users**

### Option 2: Claude Cowork Local Endpoint
If Claude Cowork exposes a local API endpoint, you can modify `server.js` to connect to it instead:
```javascript
// In server.js, replace the Claude API call with:
const coworkResponse = await fetch('http://localhost:PORT/api/chat', {
    method: 'POST',
    body: JSON.stringify({ message })
});
```

### Option 3: MCP Bridge (Advanced)
Set up an MCP (Model Context Protocol) server to bridge Claude Cowork to your dashboard. This requires:
- Configuring an MCP server
- Setting up a local bridge endpoint
- More complex but allows deeper integration

## Future Enhancements

- [x] Claude API integration for AGENT
- [ ] Real GitHub API for contribution calendar
- [ ] Email API integration (Gmail, etc.)
- [ ] Health tracker API integration
- [ ] Finance API integration
- [ ] Scheduled posts API integration
- [ ] Data persistence (localStorage or database)
- [ ] Auto-refresh functionality
- [ ] Dark mode toggle
- [ ] Claude Cowork direct integration

## License

MIT
