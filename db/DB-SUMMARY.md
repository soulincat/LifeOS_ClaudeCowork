# LifeOS Database - Complete Structure Reference

## Overview
This is a **personal life operating system** database that tracks health, finance, projects, goals, and productivity across multiple integrations (Whoop, Stripe, Wise, Soulinsocial, GitHub).

**Database File**: `lifeos.db` (SQLite)
**Database Driver**: `better-sqlite3` (Node.js)
**Schema Source**: `db/schema.sql` (single source of truth)

---

## Core Tables (Manual Input + Integrations)

### 1. **health_metrics**
Daily health tracking from Whoop or manual entry.
- **Key Column**: `date` (UNIQUE - one row per day)
- **Key Fields**: `recovery`, `sleep_hours`, `sleep_minutes`, `sleep_performance_pct`, `hrv`, `strain`, `cycle_phase`, `monthly_phase`
- **Updated By**: Whoop sync (upsert per date) or manual UI
- **Protection Level**: Can be overwritten by Whoop sync

### 2. **finance_entries**
Income, expenses, and asset tracking.
- **Key Columns**: `date`, `type`, `amount`, `account_type`, `source`
- **Types**: revenue, expense, profit, spending, investment, passive_yield, asset, total_net
- **Updated By**: Stripe, Wise (upsert per date+type+source), month-end archive, or manual
- **Protection Level**: Can be overwritten by integrations

### 3. **projects**
Active projects/products you're building.
- **Key Column**: `name` (UNIQUE)
- **Key Fields**: `github_repo`, `last_updated`, `metrics` (JSON), `revenue_worst/base/lucky`, `hours_per_week`, `budget_to_invest`, `months_to_results`, `business_model`, `ai_assumptions`
- **Updated By**: GitHub sync (updates `last_updated`), manual metrics input, or Soulinsocial
- **Protection Level**: Not deleted by sync; only updated

### 4. **social_metrics**
Platform engagement metrics (LinkedIn, Twitter, Instagram, Email, etc.).
- **Key Columns**: `platform`, `metric_type`, `value`, `date`
- **Unique Constraint**: (platform, metric_type, date)
- **Updated By**: Soulinsocial sync (upsert per platform/metric/date) or manual
- **Protection Level**: Can be overwritten by Soulinsocial sync

### 5. **scheduled_posts**
Posts queued for publishing.
- **Key Fields**: `center_post`, `platforms` (JSON array), `scheduled_date`, `status` (queued/published)
- **Updated By**: Soulinsocial sync (insert new posts), manual
- **Protection Level**: Generally append-only

### 6. **todos**
Daily task list.
- **Key Fields**: `text`, `completed`, `archived`, `due_date`, `sort_order` (for drag-and-drop), `completed_at`
- **Updated By**: Manual UI only (never auto-seeded unless `LIFEOS_SEED_IF_EMPTY=1`)
- **Protection Level**: Protected - manual only

### 7. **daily_completions**
Tracks which todos were completed on which days (for historical view).
- **Key Columns**: `todo_id`, `completed_date`
- **Updated By**: Manual only
- **Protection Level**: Protected - append-only

### 8. **upcoming_items**
Deadlines, meetings, calls.
- **Key Fields**: `title`, `type` (deadline/call/meeting), `due_date`, `description`
- **Updated By**: Manual only
- **Protection Level**: Protected - manual only

### 9. **agent_conversations**
Chat history with AI agents.
- **Key Fields**: `message`, `response`, `source`
- **Updated By**: App append-only (no overwrites)
- **Protection Level**: Protected - append-only

---

## Goals & Planning Tables

### 10. **goals** (Hierarchical)
Life goals organized in hierarchy: Yearly → Quarterly → Monthly
- **Key Columns**: `title`, `parent_id`, `period_type` (yearly/quarterly/monthly), `period_label` (e.g., "Q1 2025")
- **Aspects**: health, wealth, relationships, work, art, general
- **Key Fields**: `priority` (1=highest), `description`
- **Updated By**: Manual only
- **Protection Level**: Protected - manual only

### 11. **goal_nos**
"No" list for each goal (what we decided NOT to do + why).
- **Foreign Key**: `goal_id` → goals
- **Key Fields**: `title`, `why` (lesson learned)
- **Updated By**: Manual only
- **Protection Level**: Protected - manual only

### 12. **goal_contingency_plans**
Plan A, B, C with event triggers.
- **Key Column**: `plan_key` (UNIQUE: a/b/c)
- **Key Fields**: `plan_text`, `event_trigger`
- **Updated By**: Manual only
- **Protection Level**: Protected - manual only

### 13. **goal_uncertainties**
"Maybe" list - things unsure about or yet to decide.
- **Foreign Key**: `goal_id` → goals
- **Key Fields**: `title`, `notes`, `sort_order`
- **Updated By**: Manual only
- **Protection Level**: Protected - manual only

---

## Experiments & Scenarios

### 14. **scenarios** (Experiments per project)
A/B tests and business experiments linked to projects.
- **Foreign Keys**: `project_id` → projects, `goal_id` → goals
- **Key Fields**: `key`, `name`, `thesis`, `description`, `hypothesis`, `premise`, `status` (draft/active/completed)
- **Business Model Fields**: `business_model`, `monthly_fee_usd`, `client_count_target`, `growth_rate_pct`, `marketing_fee_monthly`
- **Planning Fields**: `budget_cap_usd`, `budget_cap_hours`, `time_available_hrs_per_week`, `start_date`, `end_date`, `probability_pct`
- **Analysis Fields**: `pros`, `cons`, `long_term_upside`, `progress_notes`, `result_summary`
- **Updated By**: Manual only
- **Protection Level**: Protected - manual only

### 15. **scenario_projects** (Many-to-Many)
Link scenarios to multiple projects (currently app uses `scenarios.project_id`).
- **Foreign Keys**: `scenario_id`, `project_id`
- **Key Fields**: `focus_role`, `weight_percent`, `likelihood`, `tags`, `time_allocation_pct`, `budget_allocation`, `executed_hours_so_far`, `rev_projection`
- **Updated By**: Manual only
- **Protection Level**: Protected - manual only

### 16. **scenario_goals**
KPI targets for each scenario (monthly/quarterly).
- **Foreign Key**: `scenario_id` → scenarios
- **Key Fields**: `period_type`, `period_label`, `metric_name`, `target_value`, `current_value`
- **Updated By**: Manual only
- **Protection Level**: Protected - manual only

### 17. **scenario_actuals**
Tracked actuals over time (compare to targets).
- **Foreign Key**: `scenario_id` → scenarios
- **Key Fields**: `date`, `metric_key`, `value`
- **Updated By**: Manual only
- **Protection Level**: Protected - manual only

### 18. **scenario_reviews**
Post-experiment reviews after 3 months.
- **Foreign Key**: `scenario_id` → scenarios
- **Key Fields**: `period_end_date`, `result_summary`, `decision_chosen`, `reflection_notes`
- **Updated By**: Manual only
- **Protection Level**: Protected - manual only

### 19. **wishlist_items**
Gallery/moodboard style items with savings tracking.
- **Foreign Key**: `goal_id` → goals (optional)
- **Key Fields**: `name`, `image_url`, `price_usd`, `priority`, `saved_amount`, `purchase_condition`, `condition_type` (none/goal_achieved/date_based)
- **Updated By**: Manual only
- **Protection Level**: Protected - manual only

---

## Projections vs Actuals

### 20. **projection_plans**
Projection blueprints (e.g., "12-month 2026 plan").
- **Key Fields**: `name`, `months` (duration), `starting_position`, `synergy_notes`, `is_active`
- **Updated By**: Manual only
- **Protection Level**: Protected - manual only

### 21. **projection_streams**
Revenue/growth streams per plan.
- **Foreign Keys**: `plan_id` → projection_plans, `project_id` → projects (can be NULL for "total")
- **Key Fields**: `stream_type` (e.g., revenue, subscribers), `display_name`, `sort_order`, `unit` (currency/units)
- **Updated By**: Manual only
- **Protection Level**: Protected - manual only

### 22. **projection_month_values**
Month-by-month projected values per stream.
- **Foreign Key**: `stream_id` → projection_streams
- **Unique Constraint**: (stream_id, month, case_type, metric_key)
- **Key Fields**: `month` (1-12), `case_type` (worst/realistic/best), `metric_key`, `value`, `notes`
- **Updated By**: Manual only
- **Protection Level**: Protected - manual only

### 23. **monthly_actuals**
Real outcomes per month (compare to projection).
- **Foreign Key**: `project_id` → projects
- **Unique Constraint**: (period, project_id, stream_type, metric_key)
- **Key Fields**: `period` (e.g., "2025-01"), `stream_type`, `metric_key`, `value`, `notes`
- **Updated By**: Manual or month-end archive script
- **Protection Level**: Can be written by month-end automation

---

## System Tables

### 24. **monthly_reports**
Cron-triggered or manual form data snapshots.
- **Foreign Key**: `scenario_id` → scenarios
- **Key Fields**: `period_label`, `form_data` (JSON)
- **Updated By**: Manual or cron
- **Protection Level**: Protected - manual only

### 25. **agent_audit_log** (Optional)
Optional audit trail for who changed what.
- **Key Fields**: `entity_type`, `entity_id`, `action`, `source`, `details`
- **Currently**: Unused but available
- **Protection Level**: Append-only if used

### 26. **health_cycle_config** (Singleton)
Menstrual cycle configuration for auto-calculating cycle phase.
- **Single Row**: `id = 1` (enforced by CHECK constraint)
- **Key Fields**: `last_period_start`, `period_length_days`, `cycle_length_days`, `follicular_days`, `ovulatory_days`, `pms_days`
- **Default Config**: Last period 2026-02-04, 31-day cycle
- **Updated By**: Manual configuration
- **Protection Level**: Protected - singleton

### 27. **whoop_oauth** (Singleton)
Whoop API credentials for syncing.
- **Single Row**: `id = 1`
- **Key Fields**: `access_token`, `refresh_token`, `expires_at`
- **Updated By**: OAuth flow or manual refresh
- **Protection Level**: Protected - sensitive credentials

---

## Write Rules Summary

### ✅ **Manual Only** (Can NOT be auto-overwritten)
- **goals**, goal_nos, goal_uncertainties, goal_contingency_plans
- **todos**, daily_completions, upcoming_items
- **wishlist_items**, scenarios, scenario_projects, scenario_goals, scenario_actuals, scenario_reviews
- **projection_plans**, projection_streams, projection_month_values
- **monthly_reports**, agent_conversations (append-only)

### ⚠️ **Can Be Upserted by Integrations** (May overwrite manual entries for same date/key)
- **health_metrics** → Whoop sync (by date)
- **finance_entries** → Stripe/Wise (by date+type+source), month-end archive
- **social_metrics** → Soulinsocial (by platform+metric+date)
- **projects** → GitHub (updates last_updated only, doesn't delete)
- **scheduled_posts** → Soulinsocial (insert new, rarely overwrites existing)

### 🚫 **Dev-Only Scripts** (Never run on real data)
- `scripts/fill-dummy-data.js` — Overwrites social_metrics, adds finance, updates projects
- `scripts/revert-dashboard-data.js` — Overwrites social_metrics (LinkedIn) and projects.metrics

---

## Database Backups

### Automatic Backups
| When | Location | Purpose |
|------|----------|---------|
| Every server start | `lifeos.db.backup` | Quick restore |
| Every server start | `db/backups/lifeos.db.latest.backup` | Latest backup |

### Manual Timestamp Backups
```bash
cp lifeos.db "db/backups/lifeos.db.$(date +%Y%m%d-%H%M%S).backup"
```

### Restore from Backup
```bash
# Stop server first
cp db/backups/lifeos.db.latest.backup lifeos.db
# Restart server
```

---

## Key Relationships (ERD)
```
goals
  ├─ goal_nos (goal_id)
  ├─ goal_uncertainties (goal_id)
  ├─ goal_contingency_plans (global, not FK)
  └─ wishlist_items (goal_id, optional)

projects
  ├─ scenarios (project_id)
  │   ├─ scenario_projects (scenario_id) [many-to-many back to projects]
  │   ├─ scenario_goals (scenario_id)
  │   ├─ scenario_actuals (scenario_id)
  │   ├─ scenario_reviews (scenario_id)
  │   └─ monthly_reports (scenario_id)
  └─ projection_streams (project_id, in a projection_plan)
      └─ projection_month_values (stream_id)

todos (1:many) daily_completions (todo_id)

projection_plans → projection_streams → projection_month_values

monthly_actuals (project_id) → projects
```

---

## Development & Initialization

### On App Startup
1. `database.js` loads or creates SQLite DB
2. Backs up existing DB (if > 1KB)
3. Runs `schema.sql` to create/migrate tables
4. Runs auto-migrations for new columns (backwards compatible)
5. Initializes singletons: `health_cycle_config`, `whoop_oauth`

### Seeding (Optional)
```bash
node db/seed.js
```
- Only seeds todos if table is empty (safe)
- Seeds projects, social_metrics, scheduled_posts, upcoming_items
- Does NOT seed finance (manual only)

---

## Environment Variables
- `DATABASE_PATH` — Override default `lifeos.db` location (default: project root)
- `LIFEOS_SEED_IF_EMPTY=1` — Auto-seed todos on startup (optional)

---

## Example Queries

### Get today's health metrics
```sql
SELECT * FROM health_metrics WHERE date = date('now');
```

### Get all active projects
```sql
SELECT * FROM projects WHERE name IS NOT NULL ORDER BY last_updated DESC;
```

### Get Q1 2025 goals with priorities
```sql
SELECT * FROM goals
WHERE period_label = 'Q1 2025'
ORDER BY priority ASC;
```

### Get scenario actuals vs targets
```sql
SELECT
  s.name,
  sg.metric_name,
  sg.target_value,
  sa.value as actual_value,
  sa.date
FROM scenarios s
JOIN scenario_goals sg ON s.id = sg.scenario_id
LEFT JOIN scenario_actuals sa ON s.id = sa.scenario_id AND sg.metric_name = sa.metric_key
WHERE s.status = 'active'
ORDER BY sa.date DESC;
```

### Get pending todos
```sql
SELECT * FROM todos WHERE completed = 0 AND archived = 0 ORDER BY sort_order;
```

### Compare projection vs actuals (monthly)
```sql
SELECT
  pp.name as plan,
  ps.display_name as stream,
  pmv.month,
  pmv.case_type,
  pmv.value as projected,
  ma.value as actual
FROM projection_plans pp
JOIN projection_streams ps ON pp.id = ps.plan_id
JOIN projection_month_values pmv ON ps.id = pmv.stream_id
LEFT JOIN monthly_actuals ma ON ps.project_id = ma.project_id AND pmv.month = CAST(SUBSTR(ma.period, 6, 2) AS INTEGER)
WHERE pp.is_active = 1
ORDER BY pp.id, ps.sort_order, pmv.month;
```

---

## Performance Indexes
All critical lookup columns are indexed for fast queries:
- `health_metrics(date)`, `finance_entries(date)`, `social_metrics(date)`
- `finance_entries(type)`
- `social_metrics(platform)`
- `scheduled_posts(scheduled_date)`
- `todos(completed)`, `goals(period_type, period_label)`, etc.

---

**Last Updated**: 2025-02-09
**Your Database**: LifeOS (Personal Life Operating System)
