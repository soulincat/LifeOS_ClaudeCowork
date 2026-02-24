# Life OS Dashboard - API Integrations Guide

## 🔌 Available Integrations

### 1. **Stripe API** 💳
**Purpose**: Automatically sync business revenue, profit, and expenses

**Setup**:
1. Get your Stripe Secret Key from [Stripe Dashboard](https://dashboard.stripe.com/apikeys)
2. Add to `.env`:
   ```bash
   STRIPE_SECRET_KEY=sk_live_...
   ```

**What it syncs**:
- **Revenue**: Successful charges and payment intents (month-to-date: 1st to today)
- **Expenses**: Refunds and transaction fees (month-to-date: 1st to today)
- **Profit**: Revenue minus expenses (auto-calculated, month-to-date)
- **Frequency**: Weekly (runs Monday mornings, updates month-to-date totals)

**API Endpoint**: `POST /api/sync/weekly`

---

### 2. **Wise API** 🌍
**Purpose**: Automatically sync personal spending transactions

**Setup**:
1. Get API token from [Wise API Tokens](https://wise.com/user/api-tokens)
2. Get your Profile ID:
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" \
        https://api.transferwise.com/v1/profiles
   ```
3. Add to `.env`:
   ```bash
   WISE_API_TOKEN=your_token_here
   WISE_PROFILE_ID=your_profile_id_here
   ```

**What it syncs**:
- **Spending**: Monthly debit transactions (month-to-date: 1st to today)
- **Frequency**: Daily (runs at 8 AM, updates month-to-date total)

**API Endpoint**: `POST /api/sync/daily`

---

### 3. **Whoop API** 💪
**Purpose**: Automatically sync health metrics (recovery, sleep, HRV) from your WHOOP device.

**Setup (OAuth – recommended)**:
1. Register an app at [WHOOP for Developers](https://developer.whoop.com/) to get **Client ID** and **Client Secret**.
2. Set **Redirect URI** in the WHOOP developer portal to:  
   `http://localhost:3001/api/health/whoop/callback` (use your app’s port if different).
3. Add to `.env`:
   ```bash
   WHOOP_CLIENT_ID=your_client_id
   WHOOP_CLIENT_SECRET=your_client_secret
   # Optional if not 3001:
   # WHOOP_REDIRECT_URI=http://localhost:3001/api/health/whoop/callback
   ```
4. In the dashboard, open the **Health** section and click **Connect WHOOP**. Sign in with WHOOP and approve; you’ll be redirected back and tokens are stored for sync.

**Legacy (static token)**  
If you still have a token from the older portal, you can set `WHOOP_API_TOKEN=...` in `.env`; OAuth takes precedence if configured.

**What it syncs**:
- **Recovery**: Daily recovery score (%)
- **Sleep**: Total sleep hours and minutes
- **HRV**: Heart rate variability (ms)
- **Frequency**: Daily (runs at 8 AM via sync job)

**API**: [WHOOP API](https://developer.whoop.com/api) (OAuth2 + v2 endpoints).  
**Endpoints**: `GET /api/health/whoop/connect` (start OAuth), `GET /api/health/whoop/status` (connection status), `POST /api/sync/daily` (runs Whoop sync).

---

### 4. **GitHub API** 🐙
**Purpose**: Fetch project commit dates and update last modified dates

**Setup**:
1. Create a GitHub Personal Access Token:
   - Go to [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)
   - Generate token with `repo` scope
2. Add to `.env`:
   ```bash
   GITHUB_TOKEN=ghp_...
   ```

**What it syncs**:
- **Project Updates**: Last commit date for each project
- **Frequency**: On-demand (when you click refresh or call API)

**API Endpoint**: `POST /api/projects/refresh` or `POST /api/sync/ondemand`

---

### 5. **Soulinsocial Integration** 📱
**Purpose**: Read scheduled posts and social metrics from local project

**Setup**:
- No API keys needed
- Reads from local project at: `/Users/cat/code/soulin_social_bot`
- Looks for database file: `data.db` or reads from files

**What it syncs**:
- **Scheduled Posts**: Next 3 scheduled posts
- **Social Metrics**: Follower/subscriber counts
- **Frequency**: Real-time (when dashboard loads)

**API Endpoint**: `GET /api/social/scheduled-posts`

---

## 🔄 Sync Jobs

### Automatic Syncs

Set up automatic background syncs:

```bash
cd scripts
./setup-sync-jobs.sh
```

This creates LaunchAgents that run:
- **Daily Sync** (8 AM): Whoop health metrics, Wise spending
- **Weekly Sync** (Monday 9 AM): Stripe revenue/profit, social metrics

### Manual Syncs

Trigger syncs manually via API:

```bash
# Daily sync (health, spending)
curl -X POST http://localhost:3000/api/sync/daily

# Weekly sync (revenue, profit, social)
curl -X POST http://localhost:3000/api/sync/weekly

# On-demand sync (projects, posts)
curl -X POST http://localhost:3000/api/sync/ondemand

# All syncs
curl -X POST http://localhost:3000/api/sync/all

# Month-end archive (manual trigger)
curl -X POST http://localhost:3000/api/sync/month-end
```

Or use the refresh button (↻) in the dashboard UI.

---

## 📊 Data Flow

```
Daily (8 AM):
  Whoop API → health_metrics (recovery, sleep, HRV) [yesterday's data]
  Wise API → finance_entries (spending) [month-to-date: 1st to today]

Weekly (Monday 9 AM):
  Stripe API → finance_entries (revenue, expense, profit) [month-to-date: 1st to today]
  Soulinsocial → social_metrics, scheduled_posts

Month-End (Last day, 11:59 PM):
  Archive final monthly totals → finance_entries [marked with _month_end suffix]
  Saves: Revenue, Expense, Profit, Spending, Investment, Asset, Total Net

On-Demand:
  GitHub API → projects.last_updated
  Soulinsocial → scheduled_posts

Monthly Snapshots (manual input):
  Investment, Asset, Total Net → finance_entries [snapshot values]
```

**Note**: 
- Monthly totals (Revenue, Expense, Profit, Spending) are calculated from the 1st of the month to the current date
- The API updates these totals daily/weekly, replacing the previous day's entry with the updated month-to-date total
- **Month-End Archive**: On the last day of each month at 11:59 PM, final monthly totals are automatically saved as archived entries (marked with `_month_end` suffix)
- Archived month-end values are used for historical charts and reports
- Current month still shows live month-to-date totals

---

## 🛠️ Troubleshooting

### Stripe Integration
**Issue**: No data syncing
- Check API key is correct (starts with `sk_live_` or `sk_test_`)
- Verify you have transactions in the date range
- Check logs: `tail -f ~/Library/Logs/lifeos-sync-weekly.log`

### Wise Integration
**Issue**: "Could not get Wise profile ID"
- Make sure `WISE_PROFILE_ID` is set in `.env`
- Or let it auto-detect (requires valid API token)
- Check API token has correct permissions

### Whoop Integration
**Issue**: "Authentication failed"
- Verify API token is correct
- Check token hasn't expired
- Whoop API may require OAuth flow (check their docs)

### GitHub Integration
**Issue**: "API error: 401"
- Token might be expired or invalid
- Ensure token has `repo` scope
- Try using `Bearer` instead of `token` prefix (already fixed in code)

### Sync Jobs Not Running
**Issue**: Syncs not executing automatically
- Check LaunchAgents are loaded: `launchctl list | grep lifeos`
- Check logs: `tail -f ~/Library/Logs/lifeos-sync-*.log`
- Reload: `launchctl unload ~/Library/LaunchAgents/com.lifeos.sync.*.plist && launchctl load ~/Library/LaunchAgents/com.lifeos.sync.*.plist`

---

## 🔐 Security Notes

- **Never commit `.env` file** - It contains sensitive API keys
- **Use environment-specific keys** - Test keys for development, live keys for production
- **Rotate keys regularly** - Especially if exposed or compromised
- **Limit API token scopes** - Only grant necessary permissions

---

## 📝 Integration Status

| Integration | Status | Auto-Sync | Manual Sync |
|------------|--------|-----------|-------------|
| Stripe | ✅ Implemented | ✅ Weekly | ✅ Yes |
| Wise | ✅ Implemented | ✅ Daily | ✅ Yes |
| Whoop | ✅ Implemented | ✅ Daily | ✅ Yes |
| GitHub | ✅ Implemented | ❌ On-demand | ✅ Yes |
| Soulinsocial | ✅ Implemented | ✅ Real-time | ✅ Yes |

---

## 🚀 Next Steps

1. Add API keys to `.env` file
2. Test integrations manually: `POST /api/sync/all`
3. Set up automatic syncs: `./scripts/setup-sync-jobs.sh`
4. Monitor logs to ensure syncs are working
5. Adjust sync schedules as needed
