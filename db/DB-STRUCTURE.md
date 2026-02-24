# Database structure and write rules

**Single place for:** full schema overview, where DBs/backups live, and which data can be overwritten vs protected.

---

## 1. Where the DB and backups live

| What | Path | When it’s updated |
|------|------|-------------------|
| **Live DB** | Project root: `lifeos.db` (or `DATABASE_PATH` in `.env`) | Every app write. Server logs `Using database: <path>` on start. |
| **Backup (root)** | `lifeos.db.backup` | Every server start (if `lifeos.db` exists and size > 1KB). |
| **Backup (latest)** | `db/backups/lifeos.db.latest.backup` | Every server start. |
| **Timestamped backups** | `db/backups/lifeos.db.YYYYMMDD-HHMMSS.backup` | When you run the backup command (see below). |

To **restore** from a backup: stop the server, then e.g.  
`cp lifeos.db.backup lifeos.db` or  
`cp db/backups/lifeos.db.latest.backup lifeos.db`

To **create a timestamped backup**:
```bash
cp lifeos.db "db/backups/lifeos.db.$(date +%Y%m%d-%H%M%S).backup"
```

`db/backups/` is in `.gitignore`; backup files are not committed.

---

## 2. Full DB structure (all tables)

Source of truth for DDL: **`db/schema.sql`**. This section is a readable overview.

### Core data

| Table | Key columns | Purpose |
|-------|-------------|---------|
| **health_metrics** | date (UNIQUE), recovery, sleep_hours, sleep_minutes, hrv, cycle_phase, monthly_phase | One row per day. Whoop sync or manual. |
| **finance_entries** | date, type, amount, account_type, source | One row per entry. Types: revenue, expense, profit, spending, investment, passive_yield, asset, total_net. Manual or Stripe/Wise/month-end. |
| **projects** | name (UNIQUE), github_repo, last_updated, metrics (JSON), revenue_worst/base/lucky, hours_per_week, … | Projects/cards. GitHub updates last_updated; metrics from manual or Soulinsocial. |
| **social_metrics** | platform, metric_type, value, date | One value per (platform, metric_type, date). Soulinsocial sync or manual. |
| **scheduled_posts** | center_post, platforms, scheduled_date, status | From Soulinsocial sync or manual. |
| **todos** | text, completed, archived, due_date | Manual only. |
| **daily_completions** | todo_id, completed_date | Tracks which todos were done on which day. Manual. |
| **upcoming_items** | title, type, due_date, description | Deadlines/meetings/calls. Manual. |
| **agent_conversations** | message, response, source | Agent chat history. App append-only. |

### Goals and experiments

| Table | Key columns | Purpose |
|-------|-------------|---------|
| **goals** | title, parent_id, period_type, period_label, aspect, priority | Hierarchy: yearly → quarterly → monthly. Manual. |
| **goal_nos** | goal_id, title, why | “No” list per goal. Manual. |
| **goal_contingency_plans** | plan_key (a/b/c), plan_text, event_trigger | Plan A/B/C. Manual. |
| **goal_uncertainties** | goal_id, title, notes, sort_order | “Maybe” list. Manual. |
| **wishlist_items** | name, image_url, price_usd, priority, goal_id, saved_amount, purchase_condition, … | Manual. |
| **scenarios** | project_id, key, name, thesis, revenue_*, status, … | Experiments linked to a project (project_id). Manual. |
| **scenario_projects** | scenario_id, project_id, … | Many-to-many link; app currently uses scenarios.project_id. |
| **scenario_goals** | scenario_id, period_type, period_label, metric_name, target_value | KPI targets per scenario. Manual. |
| **scenario_actuals** | scenario_id, date, metric_key, value | Tracked actuals. Manual. |
| **scenario_reviews** | scenario_id, period_end_date, result_summary, decision_chosen | Post-experiment reviews. Manual. |
| **monthly_reports** | period_label, scenario_id, form_data | Cron/form data. Manual. |

### Projections vs actuals

| Table | Key columns | Purpose |
|-------|-------------|---------|
| **projection_plans** | name, months, starting_position, is_active | e.g. “12-month 2026 plan”. Manual. |
| **projection_streams** | plan_id, project_id, stream_type, display_name | Streams per plan. Manual. |
| **projection_month_values** | stream_id, month, case_type, metric_key, value | Month-by-month projected values. Manual. |
| **monthly_actuals** | period, project_id, stream_type, metric_key, value | Real outcomes per month (compare to projection). Manual or month-end. |

### System

| Table | Key columns | Purpose |
|-------|-------------|---------|
| **agent_audit_log** | entity_type, entity_id, action, source, details | Optional audit trail (currently unused). |

### Relationships (short)

- **goals** → goal_nos, goal_uncertainties (goal_id); goal_contingency_plans is global (plan_key a/b/c).
- **projects** → scenarios (project_id); scenarios → scenario_goals, scenario_actuals, scenario_reviews.
- **projection_plans** → projection_streams → projection_month_values; monthly_actuals references projects.
- **todos** → daily_completions (todo_id).

---

## 3. Write rules: what can be overwritten vs protected

Use this to avoid overwriting data by mistake.

### Never overwritten by app or sync (manual / UI only)

These are **only** written by you (UI or manual scripts). No integration or startup code should overwrite or delete them.

| Table | Rule | Notes |
|-------|------|--------|
| **todos** | Append/update/delete only via UI (or explicit script). | Never auto-seeded unless LIFEOS_SEED_IF_EMPTY=1. |
| **daily_completions** | Manual only. | |
| **upcoming_items** | Manual only. | |
| **goals** | Manual only. | |
| **goal_nos** | Manual only. | |
| **goal_uncertainties** | Manual only. | |
| **goal_contingency_plans** | Manual only. | |
| **wishlist_items** | Manual only. | |
| **scenarios** | Manual only. | |
| **scenario_goals** | Manual only. | |
| **scenario_actuals** | Manual only. | |
| **scenario_reviews** | Manual only. | |
| **monthly_reports** | Manual only. | |
| **projection_plans** | Manual only. | |
| **projection_streams** | Manual only. | |
| **projection_month_values** | Manual only. | |
| **monthly_actuals** | Manual only (or month-end archive script). | |
| **agent_conversations** | Append-only (new messages). | No overwrite of existing rows. |
| **agent_audit_log** | Append-only (if used). | |

### Can be upserted by integrations (by date/key)

Sync or month-end may **insert or update** rows keyed by date (or equivalent). Your manual rows for the same date can be overwritten by sync.

| Table | Who writes | Key | Overwrite behavior |
|-------|------------|-----|---------------------|
| **health_metrics** | Whoop sync | date (UNIQUE) | Upsert per day: sync overwrites that day’s row. |
| **finance_entries** | Stripe, Wise, month-end | date + type + source | Sync adds/updates rows for given date+type+source (e.g. today’s revenue from Stripe). |
| **social_metrics** | Soulinsocial sync | (platform, metric_type, date) | Upsert per platform/metric/date: sync overwrites that triple. |
| **scheduled_posts** | Soulinsocial sync | — | Sync can insert new posts; usually not key-based overwrite of existing. |
| **projects** | GitHub sync | name (UNIQUE) | Sync updates last_updated (and optionally metrics); does not delete. |

### Never run on a DB with real data (dev only)

These **overwrite** data; use only on a copy or dev DB:

- **`scripts/fill-dummy-data.js`** — overwrites social_metrics (today), adds finance_entries, updates projects.metrics.
- **`scripts/revert-dashboard-data.js`** — overwrites social_metrics (LinkedIn) and projects.metrics.

Do **not** run them on your main `lifeos.db` if you care about current numbers.

---

## 4. Quick reference: where is each table written?

| Table | Manual (UI) | Whoop | Stripe | Wise | Soulinsocial | GitHub | Month-end |
|-------|-------------|-------|--------|------|--------------|--------|-----------|
| health_metrics | ✓ | ✓ upsert | | | | | |
| finance_entries | ✓ | | ✓ upsert | ✓ upsert | | | ✓ append |
| projects | ✓ | | | | | ✓ last_updated | |
| social_metrics | ✓ | | | | ✓ upsert | | |
| scheduled_posts | ✓ | | | | ✓ insert | | |
| todos | ✓ | | | | | | |
| upcoming_items | ✓ | | | | | | |
| goals, goal_*, wishlist, scenarios, projection_*, monthly_actuals | ✓ | | | | | | |
| agent_conversations | append | | | | | | |

---

For restore steps and backup commands, see **DATA-FILES.md** in the project root.
