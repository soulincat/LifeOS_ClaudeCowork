# Life OS Dashboard

A personal dashboard that loads automatically when you open your laptop. Built as a local web application that displays your projects, health metrics, finances, emails, and more in a clean, organized interface.

## 🎉 New Features!

See [README-FEATURES.md](README-FEATURES.md) for a complete guide to all new features including:
- Dark mode toggle 🌙
- Add/edit todos inline ✏️
- Finance entry forms 💰
- Historical charts 📊
- Toast notifications 🔔
- Auto-launch setup 🚀

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

### 2. Setup Desktop Reminders (Optional)

To get automatic reminders for weekly updates and monthly finance input:

```bash
cd notifications
./setup.sh
```

This sets up:
- **Weekly reminder**: Every Monday morning (8-10 AM) to check dashboard updates
- **Monthly reminder**: End of month (last 3 days, 9-11 AM) to input financial data

See `notifications/README.md` for more details.

### 3. Configure Claude API (Optional but Recommended)

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

## Database & API Integration

The dashboard now uses SQLite for data persistence and supports multiple API integrations.

### Database

- **Location**: `lifeos.db` in project root
- **Type**: SQLite (file-based, no server needed)
- **Auto-initialization**: Tables are created automatically on first run
- **Seeding**: Initial data is seeded automatically if database is empty

### API Integrations

**Configured Integrations:**
- **Whoop** (Health): Daily sync for recovery, sleep, HRV
- **GitHub** (Projects): On-demand sync for commit dates
- **Soulinsocial** (Social): Reads from local project files/DB
- **Stripe** (Finance): Optional, for business revenue
- **Wise** (Finance): Optional, for personal spending

**Setup API Keys:**

Add to your `.env` file:
```bash
# Health
WHOOP_API_TOKEN=your_whoop_token

# Finance (optional)
STRIPE_SECRET_KEY=your_stripe_key
WISE_API_TOKEN=your_wise_token

# Projects
GITHUB_TOKEN=your_github_token
```

### Data Logging Frequency

- **Daily**: Health metrics (Whoop), Spending (Wise/manual), Social followers
- **Weekly**: Revenue/Profit (Stripe/manual), Social metrics snapshot
- **Monthly**: Investment, Asset (snapshots), Finance aggregation
- **Real-time**: Todos, Emails, Upcoming items, Scheduled posts, Agent conversations
- **On-demand**: Projects (GitHub commits), Finance manual entries

### API Endpoints

- `GET /api/health` - Latest health metrics
- `GET /api/health/history` - Health history (for charts)
- `POST /api/health` - Update health metrics manually
- `GET /api/finance` - Current month finance summary
- `GET /api/projects` - All projects with last updated dates
- `POST /api/projects/refresh` - Refresh project commit dates from GitHub
- `GET /api/social/metrics` - Social media metrics
- `GET /api/social/scheduled-posts` - Next 3 scheduled posts
- `GET /api/todos` - Get all todos
- `POST /api/todos` - Create todo
- `PATCH /api/todos/:id` - Update todo
- `GET /api/upcoming` - Get upcoming deadlines/meetings

## Manual Finance Input

To set up your initial finance data manually:

### Quick Setup (Recommended for first time)
```bash
npm run setup-finance
```
This guides you through entering common finance entries for the current month.

### Detailed Input (For multiple entries)
```bash
npm run input-finance
```
This allows you to add multiple finance entries with full control over dates, types, and amounts.

### Finance Types
- **Revenue**: Business income (month-to-date: 1st to today, from Stripe API)
- **Profit**: Revenue minus expenses (auto-calculated, month-to-date)
- **Expense**: Business costs (month-to-date: 1st to today, from Stripe API)
- **Spending**: Personal spending (month-to-date: 1st to today, from Wise API)
- **Investment**: Total investments (monthly snapshot)
- **Asset**: Total assets (monthly snapshot)
- **Total Net**: Net worth (monthly snapshot)

## Future Enhancements

- [x] Claude API integration for AGENT
- [x] Database setup with SQLite
- [x] API endpoints for all data
- [x] Whoop integration for health
- [x] GitHub integration for projects
- [x] Stripe/Wise integration
- [x] Auto-refresh functionality
- [x] Dark mode toggle
- [x] Historical charts/graphs
- [x] Manual finance input tools
- [ ] Email API integration (Gmail, etc.)

## License

MIT
