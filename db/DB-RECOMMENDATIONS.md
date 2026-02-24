# LifeOS Database - Strategic Recommendations
## Editability, Structure & Logging Framework

---

## SECTION 1: EDITABLE DATA (What You Should Change)

### ✅ **Freely Editable (Real-time, no restrictions)**

| Table | Why | Editing Pattern | Risk Level |
|-------|-----|-----------------|-----------|
| **todos** | Daily execution changes; constantly added/removed/reordered | Drag-drop, check/uncheck, archive | LOW |
| **daily_completions** | Track what you actually did today | Manual logging as you complete | LOW |
| **upcoming_items** | Meetings/deadlines change; need to add/reschedule | CRUD operations | LOW |
| **agent_conversations** | Chat history; good to keep but append-only | Append new messages; never edit old | LOW |
| **wishlist_items** | Items, prices, priorities change as interests shift | Full CRUD; priorities update frequently | LOW |

**Recommendation**: These should have **full UI editing** with real-time sync. No validation needed beyond basic data types. Think of them as "working memory."

---

### ⚠️ **Conditionally Editable (With Care)**

| Table | What to Edit | What NOT to Edit | Why | Recommendation |
|-------|--------------|------------------|-----|-----------------|
| **health_metrics** | Manual entries only (if Whoop didn't sync); recovery/cycle notes | Dates with Whoop data; sleep from Whoop | Whoop is source of truth; manual rows are exceptions | Allow edit UI BUT show warning: "This conflicts with Whoop sync" |
| **finance_entries** | Manual entries; notes/category | Stripe/Wise rows (date+source combo) | Risk of double-counting or losing integration data | Add a "source" badge; disable editing for integrated entries |
| **projects** | Name, description, hours_per_week, business_model, assumptions | last_updated (GitHub controls this) | Metadata changes are fine; don't touch sync timestamps | Allow most edits; lock last_updated to GitHub only |
| **social_metrics** | Manual entries (if Soulinsocial didn't sync) | Soulinsocial rows (platform+date combos) | Soulinsocial is sync source | Show "Synced from Soulinsocial" badge; allow override with warning |
| **scheduled_posts** | Notes, description | Status (should auto-update on publish) | Status is managed by Soulinsocial | Allow edits pre-publication; lock post_date once published |

**Recommendation**: Add **visual indicators** (badges, read-only fields, confirmation dialogs) to distinguish integrated vs manual data. Don't prevent editing, but make conflicts visible.

---

### 🔴 **Should NOT Be Directly Editable (Controlled Entry Only)**

| Table | Why | How to Handle | Alternative |
|-------|-----|---------------|-------------|
| **health_cycle_config** | Singleton; changing this breaks cycle phase calculations for entire history | Not editable via regular UI | Special "settings" page with ONE edit dialog per config; requires "I understand this will recalculate everything" confirmation |
| **whoop_oauth** | Credentials; direct editing = security risk | Not visible in UI | OAuth re-auth flow only; never show tokens |
| **agent_audit_log** | Append-only audit trail; editing = defeating the purpose | Not editable | System append-only; no delete/edit permissions |

**Recommendation**: These should be **immutable from the UI**. Access via special admin/settings pages only.

---

## SECTION 2: BETTER STRUCTURED DATA (Reorganize These)

### 🔧 **health_metrics** → Split into Two Tables

**Problem**: Mixing daily data (sleep, recovery) with configuration (cycle_phase calculation).

**Current Structure**:
```
health_metrics: date, recovery, sleep_hours, sleep_minutes, hrv, strain, cycle_phase, monthly_phase
```

**Better Structure**:
```sql
-- Raw daily data (synced from Whoop or manual)
health_daily_data
  id, date (UNIQUE), recovery, sleep_hours, sleep_minutes, hrv, strain, sleep_performance_pct, created_at

-- Calculated/enriched phase data (derived from health_cycle_config + health_daily_data.date)
health_cycle_phases
  id, date (UNIQUE), cycle_phase, cycle_day, monthly_phase, created_at
  (auto-calculated via trigger or monthly batch job based on health_cycle_config.last_period_start)
```

**Why**: Separates "raw metrics" from "derived state." Cycle phases should auto-calculate, not be stored.

**Action**: Create a monthly job that recalculates cycle phases for all past dates based on config.

---

### 🔧 **finance_entries** → Add Source Tracking

**Problem**: No clear distinction between manual, Stripe, Wise, month-end. Mixing cause data loss.

**Current**:
```
finance_entries: date, type, amount, account_type, source, created_at
```

**Better**:
```sql
-- Keep as is, but add strict source validation
finance_entries: date, type, amount, account_type, source, is_synced, source_id (e.g., Stripe transaction ID), created_at, updated_at

-- Add index for (date, source, type) to prevent duplicate inserts
CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_unique ON finance_entries(date, type, source, account_type);
```

**Why**: Prevents duplicate entries from integrations. Lock rows with `is_synced=true` from direct editing.

**Action**: Add `is_synced` boolean; hide/lock UI edits for synced rows; show "Synced from Stripe on 2025-02-08" badge.

---

### 🔧 **projects** → Add Status & Lifecycle Tracking

**Problem**: No indication if a project is active, paused, archived, completed.

**Current**:
```
projects: name, github_repo, last_updated, metrics, revenue_worst/base/lucky, ...
```

**Better**:
```sql
projects:
  id, name, status (active/paused/completed/archived), github_repo, last_updated,
  metrics, revenue_worst/base/lucky, hours_per_week,
  started_date, paused_date, completed_date, archived_date,
  primary_contact, current_focus, health_score (1-10),
  created_at, updated_at

-- Archive table for completed/archived projects
projects_archive: (same columns as projects, plus archive_reason, archive_date)
```

**Why**: You need to know project health at a glance. Archive old projects rather than deleting.

**Action**: Add `status` dropdown (active/paused/completed/archived). Move archived projects to `projects_archive` on status change.

---

### 🔧 **social_metrics** → Pivot for Easier Queries

**Problem**: Currently stored in long format (one row per platform/metric/date). Hard to compare across platforms.

**Current Structure**:
```
social_metrics: platform, metric_type, value, date
(e.g., LinkedIn/followers/10000/2025-02-09, email/subscribers/2600/2025-02-09)
```

**Better Structure** (keep both):
```sql
-- Keep the long format for integrations (Soulinsocial appends here)
social_metrics_long: id, platform, metric_type, value, date, source (soulinsocial/manual), created_at

-- Add a rollup table for daily snapshots (easier for dashboards)
social_metrics_daily:
  date (UNIQUE),
  linkedin_followers, linkedin_engagement, email_subscribers, youtube_subs,
  twitter_followers, instagram_followers, threads_followers, brunch_followers,
  created_at

-- Populate daily rollup via nightly cron job
```

**Why**: Dashboards query `social_metrics_daily` (1 row/date); archives query `social_metrics_long` (history).

**Action**: Create nightly batch job to populate `social_metrics_daily` from `social_metrics_long`.

---

### 🔧 **goals / scenarios** → Add Outcome Tracking

**Problem**: Goals and scenarios are created but no structured way to track if they succeeded/failed.

**Current**:
```
goals: title, parent_id, period_type, period_label, aspect, priority, created_at, updated_at
scenarios: project_id, name, thesis, status (draft/active/completed), result_summary
```

**Better**:
```sql
goals:
  id, title, parent_id, period_type, period_label, aspect, priority,
  status (in_progress/completed/abandoned/paused),
  outcome (success/partial/failed), -- add this
  outcome_notes, lessons_learned,
  completed_date, created_at, updated_at

scenarios:
  id, project_id, key, name, thesis, status (draft/active/completed/abandoned),
  outcome (success/partial/failed), -- add this
  outcome_score (1-10), -- quantify success
  result_summary, lessons_learned, -- separate from result_summary
  start_date, end_date, completed_date,
  created_at, updated_at
```

**Why**: You need to close loops. Track success/failure to learn patterns over time.

**Action**: Quarterly review: update `outcome` and `outcome_notes`. Archive completed goals quarterly.

---

## SECTION 3: DATA THAT SHOULD NOT BE EDITABLE (Read-Only or System-Only)

| Table | Field(s) | Why | Access |
|-------|-----------|-----|--------|
| **goals, scenarios, wishlist_items** | `created_at` | Audit trail; when was this created | System-generated; read-only |
| **goals, scenarios, projects** | `updated_at` | Track when last changed | System-generated; updated on any edit |
| **health_metrics** | `id` (when Whoop-synced) | Primary key; prevent data corruption | System auto-increment |
| **finance_entries** | `source_id` (Stripe/Wise ID) | Links back to external system; editing breaks reconciliation | System-generated; read-only |
| **projects** | `last_updated` (GitHub-synced) | GitHub controls this; manual override = wrong data | GitHub sync only; read-only in UI |
| **social_metrics** | Row entries with source=soulinsocial | Soulinsocial manages these; manual edit = data mismatch | Read-only until synced data expires (30 days?) |
| **scheduled_posts** | `status` (once published) | Soulinsocial controls publication status | Read-only after `status != 'queued'` |
| **agent_audit_log** | All fields | Audit log is immutable by definition | Append-only; no edits/deletes |

**Recommendation**: Mark read-only fields in UI (grey out, lock icon). Show "Last synced 2025-02-08 from Whoop" timestamp.

---

## SECTION 4: LOGGING CADENCE (What to Archive & Snapshot Monthly/Quarterly/Yearly)

### 📅 **Monthly Logging (End of Month)**

| What | How | Why | Table |
|------|-----|-----|-------|
| **Finance Summary** | Auto-archive all `finance_entries` for the month + compute monthly P&L | Reconciliation; prevent accidental overwrites | Create `monthly_finance_archive`: period, total_revenue, total_expenses, net, details |
| **Social Metrics Snapshot** | Capture current values from all platforms as point-in-time snapshot | Track growth trends; see which platforms are growing | Populate `social_metrics_daily` from last day of month |
| **Project Status** | Log each project's current metrics, revenue projection, health score | Trend over time; see which projects accelerate/decelerate | Create `project_monthly_log`: project_id, month, metrics_snapshot (JSON), health_score, revenue_projection |
| **Todos Completion Rate** | Count completed vs total todos for the month | Productivity trend | Create `todo_monthly_stats`: month, completed_count, total_count, avg_completion_rate |
| **Health Summary** | Monthly average of sleep, recovery, HRV; cycle phase trend | Health patterns | Create `health_monthly_summary`: month, avg_sleep, avg_recovery, avg_hrv, avg_strain, cycle_insights |
| **Goals Progress** | Snapshot of goal status, progress notes, updated priorities | Track goal migration | Create `goals_monthly_checkpoint`: month, goal_id, status, progress_pct, priority, notes |

**Script**: Create `scripts/archive-monthly.js` to run on first day of month (cron job):
```bash
0 1 1 * * node db/scripts/archive-monthly.js
```

---

### 📊 **Quarterly Logging (End of Q1, Q2, Q3, Q4)**

| What | How | Why | Table |
|------|-----|-----|-------|
| **Scenario Reviews** | Formalize scenario outcome: success/partial/failed; capture lessons | Experimentation discipline; learn what works | `scenario_reviews`: scenario_id, period_end_date, outcome, decision_chosen, lessons_learned |
| **Goals Completion** | Mark goals complete/abandoned; extract lessons; archive | Close the loop; build retrospective | `goals_archive`: goal_id, period_label, outcome, outcome_notes, lessons_learned, completed_date |
| **Project Quarterly Review** | Capture project health, revenue vs projection, team, next quarter focus | Business rhythm; align with planning cycle | `project_quarterly_log`: project_id, quarter, revenue_actual, revenue_projected, health_score, next_focus |
| **Financial Summary** | Net worth, savings rate, debt status, investment returns | Personal finance tracking | `financial_quarterly_summary`: quarter, net_worth, savings_rate, asset_breakdown (JSON) |
| **Projection vs Actuals** | Reconcile `projection_month_values` vs `monthly_actuals` for the quarter | Learn forecasting accuracy; improve next cycle | `projection_vs_actuals_review`: plan_id, quarter, forecast_accuracy_pct, variance_notes |

**Script**: Create `scripts/archive-quarterly.js`:
```bash
0 1 1 1,4,7,10 * node db/scripts/archive-quarterly.js
```

---

### 📈 **Yearly Logging (End of Year)**

| What | How | Why | Table |
|------|-----|-----|-------|
| **Annual Review** | Year-end assessment: goals achieved, lessons, wins, failures, themes | Reflect on growth; set next year's direction | `annual_review`: year, goals_completed, goals_abandoned, major_wins, major_failures, themes, health_notes, wealth_notes |
| **Yearly Goals** | Archive completed yearly goals; assess cascading to Q1 next year | Goal hierarchy continuity | Move to `goals_archive` with outcome |
| **Project Retrospective** | Which projects shipped, which pivoted, which died, revenue trajectory | Portfolio reflection | `project_yearly_summary`: year, projects_shipped, projects_pivoted, projects_killed, total_revenue, growth_rate |
| **Health Year in Review** | Average health metrics, patterns, cycle insights, fitness/sleep trends | Health trajectory | `health_yearly_summary`: year, avg_sleep, avg_recovery, avg_hrv, patterns_notes |
| **Financial Year in Review** | Total revenue, expenses, net, savings, investments, asset growth | Tax prep + reflection | `financial_yearly_summary`: year, total_revenue, total_expenses, net_income, savings_rate, investments, asset_growth_pct |
| **Social Growth** | Followers/subscribers across all platforms YoY | Personal brand growth | `social_yearly_summary`: year, platform_summary (JSON): {linkedin_followers, email_subscribers, ...}, total_reach |

**Script**: Create `scripts/archive-yearly.js` (run Jan 1):
```bash
0 1 1 1 * node db/scripts/archive-yearly.js
```

---

## SECTION 5: EDITING PERMISSION MATRIX

### By Table: Who Can Edit? When? How?

```
┌─────────────────────────┬────────┬─────────────┬──────────────────────────┐
│ Table                   │ Editor │ When?       │ How?                     │
├─────────────────────────┼────────┼─────────────┼──────────────────────────┤
│ todos                   │ You    │ Anytime     │ Full CRUD via UI         │
│ daily_completions       │ You    │ Anytime     │ Log as you complete      │
│ upcoming_items          │ You    │ Anytime     │ Full CRUD via UI         │
│ agent_conversations     │ App    │ Auto        │ Append-only              │
│ wishlist_items          │ You    │ Anytime     │ Full CRUD via UI         │
├─────────────────────────┼────────┼─────────────┼──────────────────────────┤
│ health_metrics (manual) │ You    │ Anytime     │ Edit form (warn if Whoop)│
│ health_metrics (Whoop)  │ Whoop  │ Daily sync  │ System upsert only       │
│ finance_entries (manual)│ You    │ Anytime     │ Edit form; lock synced   │
│ finance_entries (Stripe)│ Stripe │ Daily sync  │ System upsert only       │
│ social_metrics (manual) │ You    │ Anytime     │ Edit form; lock synced   │
│ social_metrics (Soul)   │ Soul   │ Daily sync  │ System upsert only       │
│ projects (metadata)     │ You    │ Anytime     │ Edit description, model  │
│ projects (last_updated) │ GitHub │ On commit   │ System update only       │
├─────────────────────────┼────────┼─────────────┼──────────────────────────┤
│ goals                   │ You    │ Quarterly   │ Mostly read; update      │
│ scenarios               │ You    │ Monthly     │ quarterly review         │
│ goal_contingency_plans  │ You    │ Rarely      │ Edit on-demand only      │
│ health_cycle_config     │ You    │ Rarely      │ Settings dialog w/ warning
│ whoop_oauth             │ OAuth  │ On reauth   │ System only              │
│ agent_audit_log         │ App    │ Auto        │ Append-only, no deletes  │
└─────────────────────────┴────────┴─────────────┴──────────────────────────┘
```

---

## SECTION 6: PROPOSED DATA FLOW DIAGRAM

```
MANUAL INPUT (Real-time)
  ├─ todos ──────────────────────┐
  ├─ daily_completions          │
  ├─ upcoming_items              │
  ├─ wishlist_items              │
  ├─ health_metrics (manual)     │
  ├─ finance_entries (manual)    │
  ├─ goals                       │
  └─ scenarios                   │
                                 │
INTEGRATIONS (Daily/Real-time)   │
  ├─ Whoop → health_metrics      │
  ├─ Stripe → finance_entries    │
  ├─ Wise → finance_entries      │
  └─ Soulinsocial → social_metrics, scheduled_posts
                                 │
                                 ▼
                      ┌─────────────────────┐
                      │   LIVE DATABASE     │
                      │   (lifeos.db)       │
                      └─────────────────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
              DAILY           MONTHLY       QUARTERLY
           DASHBOARD       ARCHIVE JOB    ARCHIVE JOB
              (UI)       (end of month)  (end of Q)
                               │            │
                               ▼            ▼
                      monthly_finance_   scenario_reviews
                      archive            goal_archive
                      social_metrics_    projection_vs_
                      daily              actuals_review
                      etc.

YEARLY (Jan 1)
    ├─ annual_review
    ├─ project_yearly_summary
    ├─ financial_yearly_summary
    └─ health_yearly_summary
```

---

## SECTION 7: IMPLEMENTATION PRIORITY

### Phase 1: Immediate (This Week)
1. ✅ Add `status` field to `projects` (active/paused/completed/archived)
2. ✅ Add `is_synced` boolean to `finance_entries` + lock synced rows in UI
3. ✅ Add "source" badges to health_metrics, finance_entries, social_metrics (show Whoop/Stripe/Soulinsocial)
4. ✅ Create `monthly_reports` table to capture form submissions as quarterly checkpoints

### Phase 2: This Month
1. ⚙️ Split `health_metrics` → `health_daily_data` + `health_cycle_phases` (with auto-calculation)
2. ⚙️ Add `outcome` + `outcome_notes` to goals and scenarios
3. ⚙️ Create `social_metrics_daily` pivot table for dashboard queries
4. ⚙️ Add `health_cycle_config` settings UI (with "I understand" confirmation)

### Phase 3: Next Month
1. 📋 Create archive tables: `projects_archive`, `goals_archive`, `scenarios_archive`
2. 📋 Build monthly archival script (`scripts/archive-monthly.js`)
3. 📋 Build quarterly review script (`scripts/archive-quarterly.js`)
4. 📋 Build yearly review script (`scripts/archive-yearly.js`)

### Phase 4: Ongoing
1. 📊 Schedule cron jobs for monthly/quarterly/yearly archives
2. 📊 Add dashboard views for trend analysis (monthly, quarterly, yearly)
3. 📊 Add "Lessons Learned" retrospective view

---

## SECTION 8: QUICK REFERENCE: What to Edit, What NOT to Edit

### ✅ **Safe to Edit Anytime (Daily Workflow)**
- todos, daily_completions, upcoming_items, wishlist_items
- Manual finance/health entries (if not Whoop/Stripe)
- Project descriptions and metadata (not last_updated)

### ⚠️ **Edit with Care (Show Warnings)**
- health_metrics (if also syncing from Whoop)
- finance_entries (if also syncing from Stripe/Wise)
- social_metrics (if also syncing from Soulinsocial)

### 🔴 **Do NOT Edit (System/Integration Only)**
- health_cycle_config (special settings page only)
- whoop_oauth (OAuth flow only)
- agent_audit_log (append-only)
- created_at, updated_at, source IDs, GitHub last_updated

### 📅 **Review & Log Quarterly (Don't Edit Frequently)**
- goals (quarterly review of outcome)
- scenarios (quarterly review of results)
- projects (quarterly health check)

### 📊 **Archive Automatically (Monthly/Quarterly/Yearly)**
- Monthly: Finance summary, social snapshot, todo stats
- Quarterly: Scenario reviews, goals status, project reviews
- Yearly: Annual review, yearly summaries

---

**Next Step**: Pick Phase 1 items and I can help you implement them! 🚀
