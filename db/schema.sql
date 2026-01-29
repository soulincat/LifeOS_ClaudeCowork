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

-- Projects (Updated on GitHub commit)
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    github_repo TEXT,
    last_updated DATE,
    metrics TEXT,
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

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_health_metrics_date ON health_metrics(date);
CREATE INDEX IF NOT EXISTS idx_finance_entries_date ON finance_entries(date);
CREATE INDEX IF NOT EXISTS idx_finance_entries_type ON finance_entries(type);
CREATE INDEX IF NOT EXISTS idx_social_metrics_date ON social_metrics(date);
CREATE INDEX IF NOT EXISTS idx_social_metrics_platform ON social_metrics(platform);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_date ON scheduled_posts(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_todos_completed ON todos(completed);
CREATE INDEX IF NOT EXISTS idx_upcoming_items_due_date ON upcoming_items(due_date);
