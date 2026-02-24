-- Life OS Database Schema (single source of truth)
-- Data flow: manual input (UI) + integrations (Whoop, Stripe, Wise, Soulinsocial, GitHub).
-- Do not auto-insert or overwrite data on startup; real numbers come from you or sync.
-- Relationships: goals → goal_nos, goal_uncertainties, goal_contingency_plans; projects → scenarios (project_id); projection_plans → projection_streams → projection_month_values; monthly_actuals links to projects.
-- ============================================================

-- Cycle config (single row: for auto-calculating cycle phase)
CREATE TABLE IF NOT EXISTS health_cycle_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    last_period_start DATE NOT NULL,
    period_length_days INTEGER NOT NULL DEFAULT 4,
    cycle_length_days INTEGER NOT NULL DEFAULT 31,
    follicular_days INTEGER NOT NULL DEFAULT 14,
    ovulatory_days INTEGER NOT NULL DEFAULT 2,
    pms_days INTEGER NOT NULL DEFAULT 3,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Whoop OAuth (single row: access + refresh tokens for API)
CREATE TABLE IF NOT EXISTS whoop_oauth (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at INTEGER NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Health Daily Data (Whoop sync or manual; raw metrics only)
-- This is the raw daily health data from Whoop or manual entry
CREATE TABLE IF NOT EXISTS health_daily_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL UNIQUE,
    recovery INTEGER,
    sleep_hours DECIMAL,
    sleep_minutes INTEGER,
    sleep_performance_pct INTEGER,
    hrv INTEGER,
    strain DECIMAL,
    sync_source TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Health Cycle Phases (Calculated from health_cycle_config + health_daily_data.date)
-- Derived: cycle_phase and monthly_phase are auto-calculated based on health_cycle_config
-- Regenerated daily by cron job or on-demand
CREATE TABLE IF NOT EXISTS health_cycle_phases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL UNIQUE,
    cycle_day INTEGER,
    cycle_phase TEXT,
    monthly_phase TEXT,
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Legacy: Health Metrics (for backward compatibility; will be deprecated)
-- Keeping for existing queries; use health_daily_data + health_cycle_phases instead
CREATE TABLE IF NOT EXISTS health_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL UNIQUE,
    recovery INTEGER,
    sleep_hours DECIMAL,
    sleep_minutes INTEGER,
    sleep_performance_pct INTEGER,
    hrv INTEGER,
    strain DECIMAL,
    cycle_phase TEXT,
    monthly_phase TEXT,
    sync_source TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Finance Entries (Daily/Weekly/Monthly)
-- is_synced: 1 = from Stripe/Wise (lock edit/delete in UI); source_id = external transaction id
CREATE TABLE IF NOT EXISTS finance_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    type TEXT NOT NULL,
    amount DECIMAL NOT NULL,
    account_type TEXT,
    source TEXT,
    is_synced INTEGER DEFAULT 0,
    source_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Projects (Updated on GitHub commit; planning + revenue projections)
-- status: active | paused | completed | archived (lifecycle)
-- health_status: green | yellow | red (derived, never manually set)
-- progress_pct: 0–100 (computed from milestone weights)
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    github_repo TEXT,
    last_updated DATE,
    metrics TEXT,
    revenue_worst DECIMAL,
    revenue_base DECIMAL,
    revenue_lucky DECIMAL,
    hours_per_week INTEGER,
    budget_to_invest DECIMAL,
    months_to_results INTEGER,
    business_model TEXT,
    ai_assumptions TEXT,
    status TEXT DEFAULT 'active',
    next_action TEXT,
    health_status TEXT DEFAULT 'green',
    progress_pct INTEGER DEFAULT 0,
    current_phase TEXT,
    phase_list TEXT,
    priority_rank INTEGER DEFAULT 4,
    timeline_start DATE,
    timeline_end DATE,
    blocks_project_ids TEXT,
    depends_on_project_ids TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Project Tasks (operational: day-to-day work items within a project)
CREATE TABLE IF NOT EXISTS project_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    status TEXT DEFAULT 'open',
    type TEXT DEFAULT 'deliverable',
    milestone_weight INTEGER,
    is_blocker BOOLEAN DEFAULT 0,
    blocks_task_ids TEXT,
    project_phase TEXT,
    energy_required TEXT DEFAULT 'medium',
    due_date DATE,
    contributes_to_project_ids TEXT,
    priority_within_project INTEGER DEFAULT 0,
    completed_at TIMESTAMP,
    created_via TEXT DEFAULT 'manual',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- Project Milestones (strategic checkpoints that drive the progress bar)
-- Progress reads ONLY from this table. Tasks are operational, milestones are strategic.
CREATE TABLE IF NOT EXISTS project_milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    weight INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    target_date DATE,
    completed_at TIMESTAMP,
    phase TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- Project Dependencies (cross-project blocking relationships)
CREATE TABLE IF NOT EXISTS project_dependencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    upstream_project_id INTEGER NOT NULL,
    downstream_project_id INTEGER NOT NULL,
    dependency_description TEXT,
    is_hard_block BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (upstream_project_id) REFERENCES projects(id),
    FOREIGN KEY (downstream_project_id) REFERENCES projects(id)
);

-- Decision Triggers (metrics-based decision points surfaced on dashboard)
CREATE TABLE IF NOT EXISTS decision_triggers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER,
    title TEXT NOT NULL,
    check_date DATE,
    metric_type TEXT,
    metric_source TEXT,
    threshold DECIMAL,
    operator TEXT DEFAULT 'greater_than',
    pass_text TEXT,
    fail_text TEXT,
    status TEXT DEFAULT 'pending',
    actual_value DECIMAL,
    surface_on_dashboard BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- Inbox Items (unified inbox: WhatsApp, Gmail, GCal, Telegram, Stripe, Wise)
CREATE TABLE IF NOT EXISTS inbox_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    sender_name TEXT,
    sender_id TEXT,
    preview TEXT,
    full_content TEXT,
    timestamp TIMESTAMP NOT NULL,
    is_unread BOOLEAN DEFAULT 1,
    is_dismissed BOOLEAN DEFAULT 0,
    urgency_score INTEGER DEFAULT 0,
    project_tag INTEGER,
    action_required BOOLEAN DEFAULT 0,
    raw_payload TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_tag) REFERENCES projects(id)
);

-- VIP Senders (lookup table for urgency scoring)
CREATE TABLE IF NOT EXISTS vip_senders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    relationship TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Social Metrics (Daily/Weekly)
-- Long format: used by integrations (Soulinsocial sync appends here)
CREATE TABLE IF NOT EXISTS social_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    metric_type TEXT NOT NULL,
    value INTEGER NOT NULL,
    date DATE NOT NULL,
    sync_source TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(platform, metric_type, date)
);

-- Social Metrics Daily (Pivot/wide format)
-- Daily snapshot of all platform metrics; easier for dashboards
-- Populated by nightly cron job from social_metrics long format
CREATE TABLE IF NOT EXISTS social_metrics_daily (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL UNIQUE,
    linkedin_followers INTEGER,
    linkedin_engagement_rate DECIMAL,
    email_subscribers INTEGER,
    twitter_followers INTEGER,
    instagram_followers INTEGER,
    threads_followers INTEGER,
    substack_subscribers INTEGER,
    youtube_subscribers INTEGER,
    brunch_followers INTEGER,
    total_reach INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Scheduled Posts (Real-time from soulinsocial)
CREATE TABLE IF NOT EXISTS scheduled_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    center_post TEXT NOT NULL,
    platforms TEXT NOT NULL,
    scheduled_date TIMESTAMP NOT NULL,
    status TEXT DEFAULT 'queued',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Todos (Real-time; sort_order for drag-and-drop order)
CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    completed BOOLEAN DEFAULT 0,
    archived BOOLEAN DEFAULT 0,
    due_date DATE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- Daily Todo Completions (Track completed tasks per day)
CREATE TABLE IF NOT EXISTS daily_completions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    todo_id INTEGER,
    completed_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (todo_id) REFERENCES todos(id)
);

-- Upcoming Items (manual or sync)
CREATE TABLE IF NOT EXISTS upcoming_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    due_date TIMESTAMP NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Life Goals (hierarchy: yearly -> quarterly -> monthly; aspects: health, wealth, relationships, work, art)
CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    parent_id INTEGER,
    period_type TEXT NOT NULL,
    period_label TEXT NOT NULL,
    aspect TEXT DEFAULT 'general',
    priority INTEGER DEFAULT 3,
    status TEXT DEFAULT 'in_progress',
    outcome TEXT,
    outcome_notes TEXT,
    lessons_learned TEXT,
    completed_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES goals(id)
);

-- No section: things we decided NOT to do, with why (lesson learned)
CREATE TABLE IF NOT EXISTS goal_nos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_id INTEGER,
    title TEXT NOT NULL,
    why TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (goal_id) REFERENCES goals(id)
);

-- Contingency plans A, B, C with event triggers (under No in Goals tab)
CREATE TABLE IF NOT EXISTS goal_contingency_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_key TEXT NOT NULL UNIQUE,
    plan_text TEXT,
    event_trigger TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Uncertainties: not sure about, thinking about, yet to be decided
CREATE TABLE IF NOT EXISTS goal_uncertainties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_id INTEGER,
    title TEXT NOT NULL,
    notes TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (goal_id) REFERENCES goals(id)
);

-- Wishlist (gallery/moodboard style; optional link to goal)
CREATE TABLE IF NOT EXISTS wishlist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    image_url TEXT,
    price_usd DECIMAL,
    priority INTEGER DEFAULT 3,
    sort_order INTEGER DEFAULT 0,
    goal_id INTEGER,
    saved_amount DECIMAL DEFAULT 0,
    purchase_condition TEXT,
    condition_type TEXT DEFAULT 'none',
    condition_value DECIMAL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (goal_id) REFERENCES goals(id)
);

-- Experiments (belong to a project): each runs on a thesis, time/budget for that project
CREATE TABLE IF NOT EXISTS scenarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER,
    key TEXT NOT NULL,
    name TEXT NOT NULL,
    thesis TEXT,
    description TEXT,
    goal_id INTEGER,
    premise TEXT,
    hypothesis TEXT,
    progress_notes TEXT,
    result_summary TEXT,
    revenue_worst DECIMAL,
    revenue_base DECIMAL,
    revenue_lucky DECIMAL,
    pros TEXT,
    cons TEXT,
    long_term_upside TEXT,
    priority INTEGER,
    business_model TEXT,
    budget_cap_usd DECIMAL,
    budget_cap_hours DECIMAL,
    time_available_hrs_per_week DECIMAL,
    monthly_fee_usd DECIMAL,
    client_count_target INTEGER,
    client_target_months INTEGER,
    growth_rate_pct DECIMAL,
    marketing_fee_monthly DECIMAL,
    probability_pct DECIMAL,
    prelaunch_budget DECIMAL,
    prelaunch_weeks INTEGER,
    start_date DATE,
    end_date DATE,
    test_benchmarks TEXT,
    give_up_condition TEXT,
    growth_curve_notes TEXT,
    status TEXT DEFAULT 'draft',
    outcome TEXT,
    outcome_score INTEGER,
    outcome_notes TEXT,
    lessons_learned TEXT,
    completed_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (goal_id) REFERENCES goals(id),
    FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- Scenario–project link (many-to-many; app currently uses scenarios.project_id for experiments)
CREATE TABLE IF NOT EXISTS scenario_projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scenario_id INTEGER NOT NULL,
    project_id INTEGER NOT NULL,
    focus_role TEXT,
    weight_percent INTEGER,
    likelihood TEXT,
    tags TEXT,
    time_allocation_pct DECIMAL,
    budget_allocation DECIMAL,
    executed_hours_so_far DECIMAL,
    rev_projection DECIMAL,
    expected_rev_after_notes TEXT,
    exponential_growth INTEGER DEFAULT 0,
    model_type TEXT,
    monthly_fee_usd DECIMAL,
    client_target_months INTEGER,
    client_count_target INTEGER,
    growth_rate_pct DECIMAL,
    marketing_fee_monthly DECIMAL,
    probability_pct DECIMAL,
    willingness_alignment_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (scenario_id) REFERENCES scenarios(id),
    FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- Scenario KPI goals (monthly/quarterly targets)
CREATE TABLE IF NOT EXISTS scenario_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scenario_id INTEGER NOT NULL,
    period_type TEXT NOT NULL,
    period_label TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    target_value TEXT,
    current_value TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (scenario_id) REFERENCES scenarios(id)
);

-- Scenario actuals (tracked over time)
CREATE TABLE IF NOT EXISTS scenario_actuals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scenario_id INTEGER NOT NULL,
    date DATE NOT NULL,
    metric_key TEXT NOT NULL,
    value TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (scenario_id) REFERENCES scenarios(id)
);

-- Scenario reviews (after 3-month experiment; for comparison table)
CREATE TABLE IF NOT EXISTS scenario_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scenario_id INTEGER NOT NULL,
    period_end_date DATE NOT NULL,
    result_summary TEXT,
    decision_chosen TEXT,
    reflection_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (scenario_id) REFERENCES scenarios(id)
);

-- Monthly reports (cron-triggered form data)
CREATE TABLE IF NOT EXISTS monthly_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_label TEXT NOT NULL,
    scenario_id INTEGER,
    form_data TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (scenario_id) REFERENCES scenarios(id)
);

-- Agent audit log (who changed what; optional for safety)
CREATE TABLE IF NOT EXISTS agent_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id INTEGER,
    action TEXT NOT NULL,
    source TEXT DEFAULT 'agent',
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- ARCHIVE TABLES (for completed/archived items)
-- ============================================================

-- Archive: Completed/archived projects (name not UNIQUE so same project can be re-archived)
CREATE TABLE IF NOT EXISTS projects_archive (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_id INTEGER,
    name TEXT NOT NULL,
    github_repo TEXT,
    last_updated DATE,
    metrics TEXT,
    revenue_worst DECIMAL,
    revenue_base DECIMAL,
    revenue_lucky DECIMAL,
    hours_per_week INTEGER,
    budget_to_invest DECIMAL,
    months_to_results INTEGER,
    business_model TEXT,
    ai_assumptions TEXT,
    status TEXT,
    archive_reason TEXT,
    archive_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Archive: Completed/abandoned goals
CREATE TABLE IF NOT EXISTS goals_archive (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_id INTEGER,
    title TEXT NOT NULL,
    description TEXT,
    parent_id INTEGER,
    period_type TEXT NOT NULL,
    period_label TEXT NOT NULL,
    aspect TEXT,
    priority INTEGER,
    status TEXT,
    outcome TEXT,
    outcome_notes TEXT,
    lessons_learned TEXT,
    completed_date DATE,
    archive_reason TEXT,
    archive_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Archive: Completed/abandoned scenarios
CREATE TABLE IF NOT EXISTS scenarios_archive (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_id INTEGER,
    project_id INTEGER,
    key TEXT NOT NULL,
    name TEXT NOT NULL,
    thesis TEXT,
    description TEXT,
    goal_id INTEGER,
    status TEXT DEFAULT 'draft',
    outcome TEXT,
    outcome_score INTEGER,
    outcome_notes TEXT,
    lessons_learned TEXT,
    completed_date DATE,
    result_summary TEXT,
    revenue_worst DECIMAL,
    revenue_base DECIMAL,
    revenue_lucky DECIMAL,
    start_date DATE,
    end_date DATE,
    archive_reason TEXT,
    archive_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Monthly Finance Archive (snapshot of monthly P&L)
CREATE TABLE IF NOT EXISTS finance_monthly_archive (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period TEXT NOT NULL UNIQUE,
    total_revenue DECIMAL,
    total_expenses DECIMAL,
    net_income DECIMAL,
    by_type TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Monthly Health Archive (snapshot of health metrics)
CREATE TABLE IF NOT EXISTS health_monthly_archive (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month_year TEXT NOT NULL UNIQUE,
    avg_recovery DECIMAL,
    avg_sleep_hours DECIMAL,
    avg_hrv INTEGER,
    avg_strain DECIMAL,
    sleep_performance_avg INTEGER,
    cycle_insights TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Quarterly Projections vs Actuals Review
CREATE TABLE IF NOT EXISTS projection_quarterly_review (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER,
    quarter TEXT NOT NULL,
    forecast_accuracy_pct DECIMAL,
    variance_notes TEXT,
    learnings TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plan_id) REFERENCES projection_plans(id)
);

-- Annual Review Summary
CREATE TABLE IF NOT EXISTS annual_review (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year INTEGER NOT NULL UNIQUE,
    goals_completed INTEGER,
    goals_abandoned INTEGER,
    major_wins TEXT,
    major_failures TEXT,
    themes TEXT,
    health_notes TEXT,
    wealth_notes TEXT,
    overall_assessment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- PROJECTIONS & MONTHLY ACTUALS (compare projection vs real)
-- ============================================================

-- One row per projection plan (e.g. "12-month 2026 big picture")
CREATE TABLE IF NOT EXISTS projection_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    months INTEGER NOT NULL DEFAULT 12,
    starting_position TEXT,
    synergy_notes TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Each revenue/growth stream: per project or "total" (project_id NULL)
CREATE TABLE IF NOT EXISTS projection_streams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL,
    project_id INTEGER,
    stream_type TEXT NOT NULL,
    display_name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    unit TEXT DEFAULT 'currency',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plan_id) REFERENCES projection_plans(id),
    FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- Month-by-month projected values (per stream, per case)
CREATE TABLE IF NOT EXISTS projection_month_values (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stream_id INTEGER NOT NULL,
    month INTEGER NOT NULL,
    case_type TEXT NOT NULL DEFAULT 'realistic',
    metric_key TEXT NOT NULL DEFAULT 'primary',
    value DECIMAL NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (stream_id) REFERENCES projection_streams(id),
    UNIQUE(stream_id, month, case_type, metric_key)
);

-- Real outcomes at end of each month (for comparison)
CREATE TABLE IF NOT EXISTS monthly_actuals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period TEXT NOT NULL,
    project_id INTEGER,
    stream_type TEXT NOT NULL,
    metric_key TEXT NOT NULL,
    value DECIMAL NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id),
    UNIQUE(period, project_id, stream_type, metric_key)
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_health_daily_data_date ON health_daily_data(date);
CREATE INDEX IF NOT EXISTS idx_health_cycle_phases_date ON health_cycle_phases(date);
CREATE INDEX IF NOT EXISTS idx_health_metrics_date ON health_metrics(date);
CREATE INDEX IF NOT EXISTS idx_finance_entries_date ON finance_entries(date);
CREATE INDEX IF NOT EXISTS idx_finance_entries_type ON finance_entries(type);
CREATE INDEX IF NOT EXISTS idx_social_metrics_date ON social_metrics(date);
CREATE INDEX IF NOT EXISTS idx_social_metrics_platform ON social_metrics(platform);
CREATE INDEX IF NOT EXISTS idx_social_metrics_daily_date ON social_metrics_daily(date);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_date ON scheduled_posts(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_todos_completed ON todos(completed);
CREATE INDEX IF NOT EXISTS idx_upcoming_items_due_date ON upcoming_items(due_date);
CREATE INDEX IF NOT EXISTS idx_wishlist_items_priority ON wishlist_items(priority);
CREATE INDEX IF NOT EXISTS idx_goals_period ON goals(period_type, period_label);
CREATE INDEX IF NOT EXISTS idx_goals_aspect ON goals(aspect);
CREATE INDEX IF NOT EXISTS idx_scenarios_goal ON scenarios(goal_id);
CREATE INDEX IF NOT EXISTS idx_scenario_reviews_period ON scenario_reviews(period_end_date);
CREATE INDEX IF NOT EXISTS idx_monthly_reports_period ON monthly_reports(period_label);
CREATE INDEX IF NOT EXISTS idx_projection_streams_plan ON projection_streams(plan_id);
CREATE INDEX IF NOT EXISTS idx_projection_month_values_stream ON projection_month_values(stream_id);
CREATE INDEX IF NOT EXISTS idx_monthly_actuals_period ON monthly_actuals(period);

-- Note: indexes for project_tasks, milestones, dependencies, triggers, inbox_items, projects.priority_rank
-- are created in db/database.js migration block to avoid errors on existing DBs where columns don't exist yet.

-- Archive table indexes
CREATE INDEX IF NOT EXISTS idx_projects_archive_date ON projects_archive(archive_date);
CREATE INDEX IF NOT EXISTS idx_goals_archive_date ON goals_archive(archive_date);
CREATE INDEX IF NOT EXISTS idx_scenarios_archive_date ON scenarios_archive(archive_date);
CREATE INDEX IF NOT EXISTS idx_finance_monthly_archive_period ON finance_monthly_archive(period);
CREATE INDEX IF NOT EXISTS idx_health_monthly_archive_month ON health_monthly_archive(month_year);
CREATE INDEX IF NOT EXISTS idx_annual_review_year ON annual_review(year);
