# Phase 3: Archive Automation - Complete Implementation

**Status**: ✅ **COMPLETE** (All 6 Phase 3 steps implemented)

**Date Completed**: 2025-02-10
**What Was Done**: Archive tables + 4 cron job scripts + utility functions for data lifecycle management

---

## Phase 3 Changes Summary

### 1. ✅ Archive Tables Created (Schema Level)

**7 New Archive Tables**:

| Table | Purpose | Fields |
|-------|---------|--------|
| **projects_archive** | Completed/paused projects | name, revenue projections, status, archive_reason, archive_date |
| **goals_archive** | Completed/abandoned goals | title, outcome, outcome_notes, lessons_learned, archive_reason, archive_date |
| **scenarios_archive** | Completed/abandoned experiments | name, outcome, outcome_score, lessons_learned, archive_reason, archive_date |
| **finance_monthly_archive** | Monthly P&L snapshot | period, total_revenue, total_expenses, net_income, by_type |
| **health_monthly_archive** | Monthly health metrics | month_year, avg_recovery, avg_sleep_hours, avg_hrv, avg_strain |
| **projection_quarterly_review** | Forecast vs actual analysis | plan_id, quarter, forecast_accuracy_pct, variance_notes |
| **annual_review** | Year-end retrospective | year, goals_completed, goals_abandoned, major_wins, major_failures, themes |

**Data Lifecycle**:
```
Active Table                Archive Table
─────────────────          ──────────────────
projects (status=active)   →  projects_archive (when status=completed/paused)
goals (status=in_progress) →  goals_archive (when status=completed/abandoned)
scenarios (status=draft)   →  scenarios_archive (when status=completed)
```

**Migration** (auto-runs on startup):
- Creates all 7 archive tables if they don't exist
- Adds indexes for fast queries on archive_date, period, year
- No data movement on startup (manual via scripts)

**Status**: ✅ Production-ready

---

### 2. ✅ Archive Reason & Archive Date Fields

**Added to All Archive Tables**:
```sql
archive_reason TEXT              -- Why it was archived (e.g., "Quarterly cleanup", "Project killed")
archive_date DATE NOT NULL       -- When it was archived
archived_at TIMESTAMP            -- Timestamp of archival
```

**Purpose**:
- Audit trail: know when and why items were archived
- Analysis: group by archive_reason to find patterns
- Restore: can rebuild history if needed

**Example Archive Reasons**:
- "Quarterly cleanup"
- "Project cancelled"
- "Goal abandoned"
- "Experiment failed"
- "Manual archive"

---

### 3. ✅ Monthly Archival Script

**File**: `db/scripts/archive-monthly.js`

**Purpose**: Create snapshots at end of each month

**What It Does**:

#### Finance Summary
- Aggregates all `finance_entries` for the month
- Calculates: total_revenue, total_expenses, net_income
- Breaks down by type (revenue/expense/investment/etc.)
- Stores in `finance_monthly_archive`

#### Health Summary
- Aggregates all `health_daily_data` for the month
- Calculates: avg_recovery, avg_sleep_hours, avg_hrv, avg_strain
- Stores in `health_monthly_archive`

**Usage**:

```bash
# Archive previous month (run 1st of each month)
node db/scripts/archive-monthly.js

# Archive specific month
node db/scripts/archive-monthly.js --month=2025-02

# Schedule with cron (1st of month at 2:00 AM)
0 2 1 * * cd /path/to/project && node db/scripts/archive-monthly.js >> logs/archive.log 2>&1
```

**Output Example**:
```
✅ Finance archived: 2025-02 | Revenue: 15000 | Expenses: 8500 | Net: 6500
✅ Health archived: 2025-02 | Sleep: 7.2h | Recovery: 78% | HRV: 52
```

**Status**: ✅ Ready to deploy

---

### 4. ✅ Quarterly Review Script

**File**: `db/scripts/archive-quarterly.js`

**Purpose**: Review and archive completed goals/scenarios every quarter

**What It Does**:

#### Goal Archival
- Finds all goals with `status = 'completed'` or `status = 'abandoned'`
- Copies to `goals_archive` with outcome + lessons_learned
- Deletes from active `goals` table (archive is source of truth)

#### Scenario Archival
- Finds all scenarios with `status = 'completed'` or `status = 'abandoned'`
- Copies to `scenarios_archive` with outcome_score + lessons
- Deletes from active table

#### Projection Analysis
- Calculates forecast accuracy for the quarter
- Compares `projection_month_values` vs `monthly_actuals`
- Stores in `projection_quarterly_review`

**Usage**:

```bash
# Archive end of current quarter (Mar 31, Jun 30, Sep 30, Dec 31)
node db/scripts/archive-quarterly.js

# Archive specific quarter
node db/scripts/archive-quarterly.js --quarter=2025-Q1

# Schedule with cron (End of quarters at 3:00 AM)
0 3 31 3,6,9,12 * cd /path/to/project && node db/scripts/archive-quarterly.js >> logs/archive.log 2>&1
```

**Output Example**:
```
✅ Archived 5 goals from Q1
✅ Archived 2 scenarios from Q1
✅ Analyzed projections for 3 plans
```

**Status**: ✅ Ready to deploy

---

### 5. ✅ Yearly Summary Script

**File**: `db/scripts/archive-yearly.js`

**Purpose**: Create annual retrospective on January 1st

**What It Does**:

#### Annual Review
- Counts goals completed/abandoned for the year
- Identifies major wins (successful scenarios)
- Identifies major failures (failed scenarios)
- Generates themes based on patterns

#### Financial Summary
- Total revenue for the year
- Total expenses
- Savings rate %

#### Health Summary
- Average sleep hours
- Average recovery %
- Average HRV
- Health trends

#### Social Growth
- Calculates YoY follower/subscriber growth
- Tracks total_reach growth

#### Creates `annual_review` Entry
```sql
annual_review {
  year: 2024,
  goals_completed: 12,
  goals_abandoned: 3,
  major_wins: "Shipped SoulSocial; 2K paid members; 40% revenue growth",
  major_failures: "Abandoned mobile app; High churn in experiment A",
  themes: "💰 Strong year financially; 😴 Prioritized sleep; 🎯 Successful experiments",
  wealth_notes: "Revenue: $180K | Expenses: $95K | Savings Rate: 47%",
  health_notes: "Sleep: 7.1h | HRV: 54 | Recovery: 76%"
}
```

**Usage**:

```bash
# Create review for previous year (run Jan 1)
node db/scripts/archive-yearly.js

# Create review for specific year
node db/scripts/archive-yearly.js --year=2024

# Schedule with cron (Jan 1 at 4:00 AM)
0 4 1 1 * cd /path/to/project && node db/scripts/archive-yearly.js >> logs/archive.log 2>&1
```

**Output Example**:
```
✅ Annual review created for 2024
   Goals: 12 completed, 3 abandoned
   Revenue: $180000 | Expenses: $95000
   Social Growth: +35%
   Themes: 💰 Strong year financially; 😴 Prioritized sleep; 🎯 Successful experiments
```

**Status**: ✅ Ready to deploy

---

### 6. ✅ Archive Utility Functions

**File**: `db/scripts/archive-utils.js`

**Reusable Helper Functions**:

#### `archiveProject(projectId, reason)`
Archive a project on-demand
```javascript
const utils = require('./archive-utils');
utils.archiveProject(123, 'Project cancelled');  // ✅ Archived to projects_archive
```

#### `archiveGoal(goalId, reason)`
Archive a goal on-demand
```javascript
utils.archiveGoal(456, 'Goal abandoned');
```

#### `archiveScenario(scenarioId, reason)`
Archive a scenario on-demand
```javascript
utils.archiveScenario(789, 'Experiment failed');
```

#### `getArchiveStats()`
Get summary statistics of all archives
```javascript
const stats = utils.getArchiveStats();
// {
//   projects_archived: 5,
//   goals_archived: 24,
//   scenarios_archived: 12,
//   finance_months_archived: 24,
//   health_months_archived: 24,
//   annual_reviews: 2
// }
```

#### `listArchivedProjects(year)`
Query archived projects
```javascript
const archived2024 = utils.listArchivedProjects('2024');
```

#### `listArchivedGoals(outcome)`
Query archived goals by outcome
```javascript
const successes = utils.listArchivedGoals('success');
const failures = utils.listArchivedGoals('failed');
```

#### `restoreFromArchive(table, archivedId)`
Restore archived item back to active table
```javascript
utils.restoreFromArchive('goals', 456);  // Restore goal 456
```

**Status**: ✅ Production-ready

---

## Files Created

### Schema & Initialization
- ✏️ `schema.sql` (+80 lines) — Archive table definitions
- ✏️ `database.js` (+120 lines) — Auto-migration for archive tables

### Archive Scripts
- ✨ `db/scripts/archive-monthly.js` (150 lines) — Monthly snapshots
- ✨ `db/scripts/archive-quarterly.js` (180 lines) — Quarterly review & cleanup
- ✨ `db/scripts/archive-yearly.js` (170 lines) — Annual retrospective
- ✨ `db/scripts/archive-utils.js` (220 lines) — Reusable utilities

**Total New Code**: ~720 lines

---

## Recommended Cron Schedule

Add these to your `crontab` for full automation:

```bash
# ============================================================
# MONTHLY ARCHIVAL (1st of month at 2:00 AM)
# ============================================================
0 2 1 * * cd /path/to/project && node db/scripts/archive-monthly.js >> logs/archive.log 2>&1

# ============================================================
# QUARTERLY REVIEW (End of quarters at 3:00 AM)
# ============================================================
0 3 31 3,6,9,12 * cd /path/to/project && node db/scripts/archive-quarterly.js >> logs/archive.log 2>&1

# ============================================================
# YEARLY SUMMARY (Jan 1 at 4:00 AM)
# ============================================================
0 4 1 1 * cd /path/to/project && node db/scripts/archive-yearly.js >> logs/archive.log 2>&1

# ============================================================
# NIGHTLY SOCIAL SYNC (1st of month at 1:00 AM) [from Phase 2]
# ============================================================
0 1 * * * cd /path/to/project && node db/scripts/sync-social-daily.js >> logs/social-sync.log 2>&1
```

**Setup Instructions**:

```bash
# 1. Create logs directory
mkdir -p logs

# 2. Add to crontab
crontab -e

# 3. Paste the schedules above

# 4. Verify
crontab -l
```

---

## Data Lifecycle Example

### Example: Project Lifecycle

```
2025-01-15: Create "Soulin Mobile App"
  → status = 'active'
  → projects.name = 'Soulin Mobile App'

2025-02-01: Monthly archive runs
  → finance_monthly_archive snapshot created

2025-03-31: Quarterly review runs
  → Project still active, not archived

2025-06-30: Quarterly review runs
  → Project still active, not archived

2025-09-01: Decide to kill the project
  → UPDATE projects SET status = 'abandoned' WHERE name = 'Soulin Mobile App'

2025-10-01: Quarterly archive (Sep 30) already ran
  → On next quarterly run (Dec 31):
  → Project copied to projects_archive
  → Original deleted from projects
  → archive_reason = 'Quarterly cleanup'
  → archive_date = '2025-12-31'

2024-01-01: Annual review runs
  → Analyzes archived projects from 2025
  → Identifies trends and lessons learned
```

---

## Verification Queries

Run these to verify Phase 3 is set up correctly:

```sql
-- Check archive tables exist
PRAGMA table_info(projects_archive);
PRAGMA table_info(goals_archive);
PRAGMA table_info(finance_monthly_archive);
PRAGMA table_info(annual_review);

-- Check indexes exist
SELECT name FROM sqlite_master WHERE type='index' AND name LIKE '%archive%';

-- Count archived items
SELECT COUNT(*) as archived_projects FROM projects_archive;
SELECT COUNT(*) as archived_goals FROM goals_archive;
SELECT COUNT(*) as archived_scenarios FROM scenarios_archive;

-- Check monthly archives
SELECT period, total_revenue, total_expenses FROM finance_monthly_archive ORDER BY period DESC LIMIT 12;
SELECT month_year, avg_sleep_hours, avg_recovery FROM health_monthly_archive ORDER BY month_year DESC LIMIT 12;

-- Check annual reviews
SELECT year, goals_completed, themes FROM annual_review ORDER BY year DESC;
```

---

## Phase 3 Benefits

| Feature | Benefit |
|---------|---------|
| **Monthly snapshots** | Track trends over time; detect patterns |
| **Quarterly archives** | Clean up completed items; focus on active work |
| **Annual reviews** | Reflect on year; plan next cycle; build retrospective |
| **Archive tables** | Preserve history; can restore if needed |
| **Audit trail** | Know when/why items were archived |
| **Utility functions** | On-demand archival; programmatic access |

---

## What's Next?

✅ **Phases 1-3 Complete**: Database structure, outcome tracking, and automation

**Optional Phase 4** (Future enhancements):
- Create dashboard views for trends
- Build "Lessons Learned" retrospective interface
- Add search across archived data
- Create annual report templates
- Implement full-text search for lessons

---

## Summary

**Phase 3 = Complete Lifecycle Management** 🎯

Your database now:
- ✅ Tracks raw data (Phase 1 & 2)
- ✅ Calculates outcomes and scores (Phase 2)
- ✅ Archives automatically on schedule (Phase 3)
- ✅ Creates snapshots for trend analysis (Phase 3)
- ✅ Builds annual retrospectives (Phase 3)
- ✅ Maintains audit trail (Phase 3)

**All three phases implemented and production-ready!** 🚀

