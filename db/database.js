const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'lifeos.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    try { fs.mkdirSync(dbDir, { recursive: true }); } catch (e) { /* ignore */ }
}
const db = new Database(dbPath);

// Backup existing DB on startup (so you can restore if something wipes it)
try {
    if (fs.existsSync(dbPath)) {
        const stat = fs.statSync(dbPath);
        if (stat.size > 1000) {
            fs.copyFileSync(dbPath, dbPath + '.backup');
            const backupsDir = path.join(__dirname, 'backups');
            if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
            fs.copyFileSync(dbPath, path.join(backupsDir, 'lifeos.db.latest.backup'));
        }
    }
} catch (e) { /* ignore */ }

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables if they don't exist
const schemaPath = path.join(__dirname, 'schema.sql');
if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schema);
    // Migrate existing scenarios table: add decision columns if missing
    try {
        const cols = db.prepare("PRAGMA table_info(scenarios)").all().map(r => r.name);
        const add = (name, type) => { if (!cols.includes(name)) { db.exec("ALTER TABLE scenarios ADD COLUMN " + name + " " + type); cols.push(name); } };
        add('pros', 'TEXT');
        add('cons', 'TEXT');
        add('long_term_upside', 'TEXT');
        add('priority', 'INTEGER');
        add('thesis', 'TEXT');
        add('time_available_hrs_per_week', 'DECIMAL');
        add('project_id', 'INTEGER REFERENCES projects(id)');
        add('business_model', 'TEXT');
        add('monthly_fee_usd', 'DECIMAL');
        add('client_count_target', 'INTEGER');
        add('client_target_months', 'INTEGER');
        add('growth_rate_pct', 'DECIMAL');
        add('marketing_fee_monthly', 'DECIMAL');
        add('probability_pct', 'DECIMAL');
        add('prelaunch_budget', 'DECIMAL');
        add('prelaunch_weeks', 'INTEGER');
    } catch (e) { /* table may not exist yet */ }
    // Migrate scenario_projects: add experiment per-project columns + SaaS model
    try {
        const spCols = db.prepare("PRAGMA table_info(scenario_projects)").all().map(r => r.name);
        const addSp = (name, type) => { if (!spCols.includes(name)) { db.exec("ALTER TABLE scenario_projects ADD COLUMN " + name + " " + type); spCols.push(name); } };
        addSp('likelihood', 'TEXT');
        addSp('tags', 'TEXT');
        addSp('time_allocation_pct', 'DECIMAL');
        addSp('budget_allocation', 'DECIMAL');
        addSp('executed_hours_so_far', 'DECIMAL');
        addSp('rev_projection', 'DECIMAL');
        addSp('expected_rev_after_notes', 'TEXT');
        addSp('exponential_growth', 'INTEGER');
        addSp('model_type', 'TEXT');
        addSp('monthly_fee_usd', 'DECIMAL');
        addSp('client_target_months', 'INTEGER');
        addSp('client_count_target', 'INTEGER');
        addSp('growth_rate_pct', 'DECIMAL');
        addSp('marketing_fee_monthly', 'DECIMAL');
        addSp('probability_pct', 'DECIMAL');
        addSp('willingness_alignment_notes', 'TEXT');
    } catch (e) { /* */ }
    // Migrate projects: add default revenue projections (Worst/Base/Best per project) + planning fields
    try {
        const pCols = db.prepare("PRAGMA table_info(projects)").all().map(r => r.name);
        const addP = (name, type) => { if (!pCols.includes(name)) { db.exec("ALTER TABLE projects ADD COLUMN " + name + " " + type); pCols.push(name); } };
        addP('revenue_worst', 'DECIMAL');
        addP('revenue_base', 'DECIMAL');
        addP('revenue_lucky', 'DECIMAL');
        addP('hours_per_week', 'INTEGER');
        addP('budget_to_invest', 'DECIMAL');
        addP('months_to_results', 'INTEGER');
        addP('business_model', 'TEXT');
        addP('ai_assumptions', 'TEXT');
        addP('description', 'TEXT');
        addP('ai_analysis', 'TEXT');
    } catch (e) { /* */ }
    // Migrate wishlist_items: add savings progress and purchase conditions
    try {
        const wlCols = db.prepare("PRAGMA table_info(wishlist_items)").all().map(r => r.name);
        const addWl = (name, type) => { if (!wlCols.includes(name)) { db.exec("ALTER TABLE wishlist_items ADD COLUMN " + name + " " + type); wlCols.push(name); } };
        addWl('saved_amount', 'DECIMAL DEFAULT 0');
        addWl('purchase_condition', 'TEXT');
        addWl('condition_type', 'TEXT DEFAULT \'none\'');
        addWl('condition_value', 'DECIMAL');
    } catch (e) { /* */ }
    // Migrate goals: add priority (1 = highest)
    try {
        const gCols = db.prepare("PRAGMA table_info(goals)").all().map(r => r.name);
        if (!gCols.includes('priority')) db.exec('ALTER TABLE goals ADD COLUMN priority INTEGER DEFAULT 3');
    } catch (e) { /* */ }
    // Migrate goal_uncertainties: add sort_order for drag reorder
    try {
        const uCols = db.prepare("PRAGMA table_info(goal_uncertainties)").all().map(r => r.name);
        if (!uCols.includes('sort_order')) db.exec('ALTER TABLE goal_uncertainties ADD COLUMN sort_order INTEGER DEFAULT 0');
    } catch (e) { /* */ }
    // Ensure projection & monthly actuals tables exist (structural save for projections vs real comparison)
    try {
        db.exec(`
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
        `);
    } catch (e) { /* */ }
} else {
    createTables();
}

function createTables() {
    // Health metrics table
    db.exec(`
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
        )
    `);

    // Finance entries table
    db.exec(`
        CREATE TABLE IF NOT EXISTS finance_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date DATE NOT NULL,
            type TEXT NOT NULL,
            amount DECIMAL NOT NULL,
            account_type TEXT,
            source TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Projects table
    db.exec(`
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            github_repo TEXT,
            last_updated DATE,
            metrics TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Social metrics table
    db.exec(`
        CREATE TABLE IF NOT EXISTS social_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            platform TEXT NOT NULL,
            metric_type TEXT NOT NULL,
            value INTEGER NOT NULL,
            date DATE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(platform, metric_type, date)
        )
    `);

    // Scheduled posts table
    db.exec(`
        CREATE TABLE IF NOT EXISTS scheduled_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            center_post TEXT NOT NULL,
            platforms TEXT NOT NULL,
            scheduled_date TIMESTAMP NOT NULL,
            status TEXT DEFAULT 'queued',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Todos table
    db.exec(`
        CREATE TABLE IF NOT EXISTS todos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL,
            completed BOOLEAN DEFAULT 0,
            due_date DATE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP
        )
    `);

    // Emails table
    db.exec(`
        CREATE TABLE IF NOT EXISTS emails (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subject TEXT NOT NULL,
            from_email TEXT,
            from_name TEXT,
            received_at TIMESTAMP NOT NULL,
            is_urgent BOOLEAN DEFAULT 0,
            is_read BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Upcoming items table
    db.exec(`
        CREATE TABLE IF NOT EXISTS upcoming_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            type TEXT NOT NULL,
            due_date TIMESTAMP NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Agent conversations table
    db.exec(`
        CREATE TABLE IF NOT EXISTS agent_conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message TEXT NOT NULL,
            response TEXT,
            source TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Always upsert today's social metrics so API returns correct numbers (overwrites any old seed data)
    try {
        const today = new Date().toISOString().slice(0, 10);
        const socialStmt = db.prepare(`
            INSERT INTO social_metrics (platform, metric_type, value, date)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(platform, metric_type, date) DO UPDATE SET value = excluded.value
        `);
        const defaults = [
            ['email', 'subscribers', 2600], ['linkedin', 'followers', 10000], ['twitter', 'followers', 0],
            ['instagram', 'followers', 0], ['threads', 'followers', 0], ['substack', 'subscribers', 0],
            ['youtube', 'subscribers', 300], ['brunch', 'followers', 2700]
        ];
        for (const [platform, metric_type, value] of defaults) {
            socialStmt.run(platform, metric_type, value, today);
        }
    } catch (e) { /* ignore */ }

    // Your numbers: insert investment 45K & asset 233K when missing (so they show on load)
    try {
        const today = new Date().toISOString().slice(0, 10);
        const stmt = db.prepare(`
            INSERT INTO finance_entries (date, type, amount, account_type, source)
            VALUES (?, ?, ?, ?, ?)
        `);
        if (!db.prepare("SELECT 1 FROM finance_entries WHERE type = 'investment' LIMIT 1").get()) {
            stmt.run(today, 'investment', 45000, 'personal', 'manual');
        }
        if (!db.prepare("SELECT 1 FROM finance_entries WHERE type = 'asset' LIMIT 1").get()) {
            stmt.run(today, 'asset', 233000, 'personal', 'manual');
        }
    } catch (e) { /* ignore */ }

    console.log('✅ Database tables created');
}

db.path = dbPath;
module.exports = db;
