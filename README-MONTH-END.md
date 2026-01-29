# Month-End Archive System

## Overview

The month-end archive system automatically saves final monthly totals at the end of each month. This ensures you have permanent records of your monthly financial performance.

## How It Works

### Automatic Archiving

**When**: Last day of each month at 11:59 PM  
**What**: Saves final monthly totals for:
- Revenue (month-to-date total)
- Expense (month-to-date total)
- Profit (month-to-date total)
- Spending (month-to-date total)
- Investment (latest snapshot)
- Asset (latest snapshot)
- Total Net (latest snapshot)

**How**: Entries are saved with `_month_end` suffix in the `source` field to distinguish them from regular entries.

### Current Month vs. Archived Months

- **Current Month**: Shows live month-to-date totals (updated daily/weekly)
- **Past Months**: Uses archived month-end values for accurate historical data

## Setup

The month-end archive is automatically set up when you run:

```bash
cd scripts
./setup-sync-jobs.sh
```

This creates a LaunchAgent that runs on the last day of each month.

## Manual Archive

You can manually trigger a month-end archive:

```bash
# Via API
curl -X POST http://localhost:3000/api/sync/month-end

# Or via script
node scripts/run-sync.js monthend
```

## Database Structure

Archived entries are stored in the same `finance_entries` table with:
- `date`: Last day of the month (e.g., `2025-01-31`)
- `source`: Original source + `_month_end` suffix (e.g., `stripe_month_end`, `wise_month_end`, `manual_month_end`)
- `amount`: Final monthly total

## Querying Archived Data

The finance API automatically:
- Uses archived values for past months (in history endpoint)
- Uses live month-to-date values for current month
- Excludes archived entries when calculating current month totals

## Example

**January 2025**:
- Daily entries: `2025-01-15` (revenue: $5,000), `2025-01-20` (revenue: $8,000), `2025-01-25` (revenue: $12,000)
- Month-end archive: `2025-01-31` (revenue: $12,000, source: `stripe_month_end`)

**February 2025**:
- Current month shows: Live month-to-date totals
- January history shows: $12,000 (from archived entry)

## Troubleshooting

**Archive didn't run?**
- Check logs: `tail -f ~/Library/Logs/lifeos-sync-monthend.log`
- Verify LaunchAgent: `launchctl list | grep monthend`
- Manually trigger: `curl -X POST http://localhost:3000/api/sync/month-end`

**Duplicate entries?**
- The system checks if a month is already archived before creating new entries
- If duplicates exist, you can manually clean them up

**Want to re-archive a month?**
- Delete existing `_month_end` entries for that month
- Run manual archive: `curl -X POST http://localhost:3000/api/sync/month-end`
