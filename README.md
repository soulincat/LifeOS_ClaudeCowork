# Life OS Dashboard

A personal command center that runs locally on your machine. Track projects, health, finances, emails, goals, and tasks — all in one place. Built with vanilla HTML/JS/CSS and Express, no build step required.

## Quick Start

```bash
# 1. Clone and install
git clone <your-repo-url> life-os
cd life-os
npm install

# 2. Configure (fill in only the integrations you want)
cp .env.example .env
cp -r config.example config

# 3. Run
npm start
# Open http://localhost:3001
```

That's it. The dashboard works immediately — integrations are all optional.

## Integrations

Connect only what you need. Leave the rest blank in `.env`.

| Integration | What it does | Required env vars |
|---|---|---|
| **Claude AI** | PA chat assistant on the dashboard | `ANTHROPIC_API_KEY` |
| **Whoop** | Daily health metrics (recovery, sleep, HRV) | `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET` |
| **Stripe** | Business revenue sync | `STRIPE_SECRET_KEY` |
| **Wise** | Personal spending sync | `WISE_API_TOKEN`, `WISE_PROFILE_ID` |
| **GitHub** | Project commit date tracking | `GITHUB_TOKEN` |
| **Gmail** | Inbox sync and email sending | `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` |
| **Telegram** | Daily briefing bot | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |
| **Apple Calendar** | Calendar events (macOS only) | None (uses native AppleScript) |
| **Apple Reminders** | Task sync (macOS only) | None (uses native AppleScript) |

## Project Structure

```
core/               Server, database, API routes
  api/              20 REST endpoint modules
  db/               SQLite schema, migrations, derived state engine
  server.js         Express entry point
dashboard/          Frontend (no build step)
  index.html        Single-page app shell
  app.js            Main controller
  styles.css        All styles (organized with section headers)
  utils.js          Shared utilities
integrations/       External service connectors
  whoop/            Health metrics
  stripe/           Business revenue
  gmail/            Email sync
  telegram/         Briefing bot
  ...
config/             Your instance config (gitignored)
config.example/     Template config (committed)
onboarding/         First-run setup wizard
scripts/            Utility scripts
```

## Key Features

- **Home panel** — Pulse strip (recovery, meetings, blockers), focus card, unified inbox
- **Projects** — Health status (green/yellow/red), milestones, dependencies, phase tracking
- **Goals** — Yearly → quarterly → monthly hierarchy with progress tracking
- **Finance** — Revenue, expenses, spending, net assets with month-over-month charts
- **Health** — WHOOP integration with recovery, sleep, HRV trends
- **Inbox** — Unified messages from Gmail, WhatsApp, with urgency scoring
- **PA Chat** — Claude-powered assistant with context about your data
- **Dark mode** — Toggle between light and dark themes

## Finance Setup

```bash
# Quick setup (first time)
npm run setup-finance

# Detailed input (multiple entries)
npm run input-finance
```

## Docker

```bash
docker-compose up
```

## Database

- **Type**: SQLite (file-based, no server needed)
- **Location**: `lifeos.db` in project root
- **Auto-initialization**: Tables created on first run
- **Migrations**: Run automatically on startup
- **Schema docs**: See `db/DB-STRUCTURE.md`

## Documentation

- [Features Guide](README-FEATURES.md)
- [Integration Setup](README-INTEGRATIONS.md)
- [Month-End Workflow](README-MONTH-END.md)
- [Database Structure](db/DB-STRUCTURE.md)
- [Deployment](DEPLOY.md)
- [Troubleshooting](TROUBLESHOOTING.md)

## License

MIT
