-- Health Metrics (Daily logging)
CREATE TABLE IF NOT EXISTS health_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL UNIQUE,
    recovery INTEGER,
    sleep_hours DECIMAL,
    sleep_minutes INTEGER,
    hrv INTEGER,
    cycle_phase TEXT,
    monthly_phase TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Finance Entries (Daily/Weekly/Monthly)
CREATE TABLE IF NOT EXISTS finance_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    type TEXT NOT NULL,
    amount DECIMAL NOT NULL,
    account_type TEXT,
    source TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Projects (Updated on GitHub commit; planning + revenue projections)
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Social Metrics (Daily/Weekly)
CREATE TABLE IF NOT EXISTS social_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    metric_type TEXT NOT NULL,
    value INTEGER NOT NULL,
    date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(platform, metric_type, date)
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

-- Todos (Real-time)
CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    completed BOOLEAN DEFAULT 0,
    archived BOOLEAN DEFAULT 0,
    due_date DATE,
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

-- Emails (Real-time)
CREATE TABLE IF NOT EXISTS emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject TEXT NOT NULL,
    from_email TEXT,
    from_name TEXT,
    received_at TIMESTAMP NOT NULL,
    is_urgent BOOLEAN DEFAULT 0,
    is_read BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Upcoming Items (Real-time)
CREATE TABLE IF NOT EXISTS upcoming_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    due_date TIMESTAMP NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Agent Conversations (Real-time)
CREATE TABLE IF NOT EXISTS agent_conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message TEXT NOT NULL,
    response TEXT,
    source TEXT,
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (goal_id) REFERENCES goals(id),
    FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- Scenario-project link (one row per scenario: the project this experiment belongs to) + allocation
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
CREATE INDEX IF NOT EXISTS idx_health_metrics_date ON health_metrics(date);
CREATE INDEX IF NOT EXISTS idx_finance_entries_date ON finance_entries(date);
CREATE INDEX IF NOT EXISTS idx_finance_entries_type ON finance_entries(type);
CREATE INDEX IF NOT EXISTS idx_social_metrics_date ON social_metrics(date);
CREATE INDEX IF NOT EXISTS idx_social_metrics_platform ON social_metrics(platform);
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
