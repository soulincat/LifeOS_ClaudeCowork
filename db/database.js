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
        // Phase 2: Add outcome tracking (outcome, outcome_score, outcome_notes, lessons_learned, completed_date)
        add('outcome', 'TEXT');
        add('outcome_score', 'INTEGER');
        add('outcome_notes', 'TEXT');
        add('lessons_learned', 'TEXT');
        add('completed_date', 'DATE');
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
        addP('status', "TEXT DEFAULT 'active'");
        // New project columns for task/milestone system
        addP('next_action', 'TEXT');
        addP('health_status', "TEXT DEFAULT 'green'");
        addP('progress_pct', 'INTEGER DEFAULT 0');
        addP('current_phase', 'TEXT');
        addP('phase_list', 'TEXT');
        addP('priority_rank', 'INTEGER DEFAULT 4');
        addP('timeline_start', 'DATE');
        addP('timeline_end', 'DATE');
        addP('blocks_project_ids', 'TEXT');
        addP('depends_on_project_ids', 'TEXT');
    } catch (e) { /* */ }

    // Migrate: Create project_tasks, project_milestones, project_dependencies, decision_triggers, inbox_items, vip_senders
    try {
        db.exec(`
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
            CREATE TABLE IF NOT EXISTS vip_senders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sender_id TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                relationship TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_project_tasks_project ON project_tasks(project_id);
            CREATE INDEX IF NOT EXISTS idx_project_tasks_status ON project_tasks(status);
            CREATE INDEX IF NOT EXISTS idx_project_tasks_phase ON project_tasks(project_phase);
            CREATE INDEX IF NOT EXISTS idx_project_milestones_project ON project_milestones(project_id);
            CREATE INDEX IF NOT EXISTS idx_project_milestones_status ON project_milestones(status);
            CREATE INDEX IF NOT EXISTS idx_project_dependencies_upstream ON project_dependencies(upstream_project_id);
            CREATE INDEX IF NOT EXISTS idx_project_dependencies_downstream ON project_dependencies(downstream_project_id);
            CREATE INDEX IF NOT EXISTS idx_decision_triggers_project ON decision_triggers(project_id);
            CREATE INDEX IF NOT EXISTS idx_decision_triggers_status ON decision_triggers(status);
            CREATE INDEX IF NOT EXISTS idx_decision_triggers_check_date ON decision_triggers(check_date);
            CREATE INDEX IF NOT EXISTS idx_inbox_items_source ON inbox_items(source);
            CREATE INDEX IF NOT EXISTS idx_inbox_items_urgency ON inbox_items(urgency_score DESC);
            CREATE INDEX IF NOT EXISTS idx_inbox_items_timestamp ON inbox_items(timestamp DESC);
            CREATE INDEX IF NOT EXISTS idx_inbox_items_unread ON inbox_items(is_unread);
            CREATE INDEX IF NOT EXISTS idx_projects_priority_rank ON projects(priority_rank);
        `);
    } catch (e) { /* tables may already exist */ }

    // Migrate finance_entries: add is_synced, source_id (Phase 1: lock synced rows)
    try {
        const feCols = db.prepare("PRAGMA table_info(finance_entries)").all().map(r => r.name);
        if (!feCols.includes('is_synced')) db.exec('ALTER TABLE finance_entries ADD COLUMN is_synced INTEGER DEFAULT 0');
        if (!feCols.includes('source_id')) db.exec('ALTER TABLE finance_entries ADD COLUMN source_id TEXT');
        db.prepare("UPDATE finance_entries SET is_synced = 1 WHERE source IN ('stripe', 'wise')").run();
    } catch (e) { /* */ }
    // Migrate health_metrics: add sync_source (Phase 1: "Synced from Whoop" badge)
    try {
        const hmCols = db.prepare("PRAGMA table_info(health_metrics)").all().map(r => r.name);
        if (!hmCols.includes('sync_source')) db.exec('ALTER TABLE health_metrics ADD COLUMN sync_source TEXT');
    } catch (e) { /* */ }
    // Phase 2: Create social_metrics_daily pivot table for dashboard queries
    try {
        db.exec(`
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
            )
        `);
        db.exec('CREATE INDEX IF NOT EXISTS idx_social_metrics_daily_date ON social_metrics_daily(date)');
    } catch (e) { /* */ }
    // Add sync_source to social_metrics (long format)
    try {
        const smCols = db.prepare("PRAGMA table_info(social_metrics)").all().map(r => r.name);
        if (!smCols.includes('sync_source')) db.exec('ALTER TABLE social_metrics ADD COLUMN sync_source TEXT');
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
    // Phase 2: Add outcome tracking to goals (status, outcome, outcome_notes, lessons_learned, completed_date)
    try {
        const gCols = db.prepare("PRAGMA table_info(goals)").all().map(r => r.name);
        const addG = (name, type) => { if (!gCols.includes(name)) { db.exec("ALTER TABLE goals ADD COLUMN " + name + " " + type); gCols.push(name); } };
        addG('status', "TEXT DEFAULT 'in_progress'");
        addG('outcome', 'TEXT');
        addG('outcome_notes', 'TEXT');
        addG('lessons_learned', 'TEXT');
        addG('completed_date', 'DATE');
    } catch (e) { /* */ }
    // Migrate goal_uncertainties: add sort_order for drag reorder
    try {
        const uCols = db.prepare("PRAGMA table_info(goal_uncertainties)").all().map(r => r.name);
        if (!uCols.includes('sort_order')) db.exec('ALTER TABLE goal_uncertainties ADD COLUMN sort_order INTEGER DEFAULT 0');
    } catch (e) { /* */ }
    // Migrate todos: add sort_order for drag-and-drop, archived if missing
    try {
        const tCols = db.prepare("PRAGMA table_info(todos)").all().map(r => r.name);
        if (!tCols.includes('sort_order')) db.exec('ALTER TABLE todos ADD COLUMN sort_order INTEGER DEFAULT 0');
        if (!tCols.includes('archived')) db.exec('ALTER TABLE todos ADD COLUMN archived BOOLEAN DEFAULT 0');
    } catch (e) { /* */ }
    // Migrate health_metrics: add strain, sleep_performance_pct
    try {
        const hmCols = db.prepare("PRAGMA table_info(health_metrics)").all().map(r => r.name);
        if (!hmCols.includes('strain')) db.exec('ALTER TABLE health_metrics ADD COLUMN strain DECIMAL');
        if (!hmCols.includes('sleep_performance_pct')) db.exec('ALTER TABLE health_metrics ADD COLUMN sleep_performance_pct INTEGER');
        db.prepare(`UPDATE health_metrics SET strain = CAST(REPLACE(cycle_phase, 'Strain ', '') AS REAL), cycle_phase = NULL WHERE cycle_phase LIKE 'Strain %'`).run();
    } catch (e) { /* */ }
    // Phase 2: Split health_metrics into health_daily_data + health_cycle_phases
    try {
        // Create new tables if they don't exist
        db.exec(`
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
            )
        `);
        db.exec(`
            CREATE TABLE IF NOT EXISTS health_cycle_phases (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date DATE NOT NULL UNIQUE,
                cycle_day INTEGER,
                cycle_phase TEXT,
                monthly_phase TEXT,
                calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        // Migrate existing data from health_metrics to health_daily_data (one-time)
        const dailyCount = db.prepare('SELECT COUNT(*) as count FROM health_daily_data').get();
        if (dailyCount.count === 0) {
            db.prepare(`
                INSERT INTO health_daily_data (date, recovery, sleep_hours, sleep_minutes, sleep_performance_pct, hrv, strain, sync_source, created_at)
                SELECT date, recovery, sleep_hours, sleep_minutes, sleep_performance_pct, hrv, strain, sync_source, created_at
                FROM health_metrics
                WHERE date IS NOT NULL
            `).run();
            db.prepare(`
                INSERT INTO health_cycle_phases (date, cycle_phase, monthly_phase, calculated_at)
                SELECT date, cycle_phase, monthly_phase, created_at
                FROM health_metrics
                WHERE date IS NOT NULL AND (cycle_phase IS NOT NULL OR monthly_phase IS NOT NULL)
            `).run();
        }
    } catch (e) { /* */ }
    // Health cycle config (for auto cycle phase)
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS health_cycle_config (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                last_period_start DATE NOT NULL,
                period_length_days INTEGER NOT NULL DEFAULT 4,
                cycle_length_days INTEGER NOT NULL DEFAULT 31,
                follicular_days INTEGER NOT NULL DEFAULT 14,
                ovulatory_days INTEGER NOT NULL DEFAULT 2,
                pms_days INTEGER NOT NULL DEFAULT 3,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        const hasConfig = db.prepare('SELECT 1 FROM health_cycle_config WHERE id = 1').get();
        if (!hasConfig) {
            db.prepare(`
                INSERT INTO health_cycle_config (id, last_period_start, period_length_days, cycle_length_days, follicular_days, ovulatory_days, pms_days)
                VALUES (1, '2026-02-04', 4, 31, 14, 2, 3)
            `).run();
        }
    } catch (e) { /* */ }
    // Whoop OAuth table (for API token storage)
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS whoop_oauth (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                access_token TEXT NOT NULL,
                refresh_token TEXT,
                expires_at INTEGER NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
    } catch (e) { /* */ }
    // Phase 3: Create archive tables for completed/archived data
    try {
        db.exec(`
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
            )
        `);
        db.exec(`
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
            )
        `);
        db.exec(`
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
            )
        `);
        db.exec(`
            CREATE TABLE IF NOT EXISTS finance_monthly_archive (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                period TEXT NOT NULL UNIQUE,
                total_revenue DECIMAL,
                total_expenses DECIMAL,
                net_income DECIMAL,
                by_type TEXT,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        db.exec(`
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
            )
        `);
        db.exec(`
            CREATE TABLE IF NOT EXISTS projection_quarterly_review (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                plan_id INTEGER,
                quarter TEXT NOT NULL,
                forecast_accuracy_pct DECIMAL,
                variance_notes TEXT,
                learnings TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (plan_id) REFERENCES projection_plans(id)
            )
        `);
        db.exec(`
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
            )
        `);
        // One-time migration: drop UNIQUE on projects_archive.name so same project can be re-archived
        try {
            const hasTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='projects_archive'").get();
            if (!hasTable) { /* skip: table created later by schema or createTables */ }
            else {
                db.exec(`CREATE TABLE IF NOT EXISTS _schema_migrations (version TEXT PRIMARY KEY)`);
                const done = db.prepare('SELECT 1 FROM _schema_migrations WHERE version = ?').get('projects_archive_no_unique');
                if (!done) {
                    db.exec(`
                    CREATE TABLE projects_archive_new (
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
                    )
                `);
                db.exec(`INSERT INTO projects_archive_new SELECT * FROM projects_archive`);
                db.exec(`DROP TABLE projects_archive`);
                db.exec(`ALTER TABLE projects_archive_new RENAME TO projects_archive`);
                db.exec(`CREATE INDEX IF NOT EXISTS idx_projects_archive_date ON projects_archive(archive_date)`);
                    db.prepare('INSERT INTO _schema_migrations (version) VALUES (?)').run('projects_archive_no_unique');
                }
            }
        } catch (e) { /* migration may fail if table empty or already migrated */ }
    } catch (e) { /* */ }
    // projection_plans, projection_streams, projection_month_values, monthly_actuals: defined in schema.sql (single source of truth)

    // Migrate: Apple sync tracking columns on todos + upcoming_items
    try {
        const todoCols = db.prepare("PRAGMA table_info(todos)").all().map(r => r.name);
        if (!todoCols.includes('apple_reminder_id')) db.exec("ALTER TABLE todos ADD COLUMN apple_reminder_id TEXT");
        if (!todoCols.includes('apple_synced_at')) db.exec("ALTER TABLE todos ADD COLUMN apple_synced_at TIMESTAMP");
    } catch (e) { /* */ }
    try {
        const upCols = db.prepare("PRAGMA table_info(upcoming_items)").all().map(r => r.name);
        if (!upCols.includes('apple_event_id')) db.exec("ALTER TABLE upcoming_items ADD COLUMN apple_event_id TEXT");
        if (!upCols.includes('apple_synced_at')) db.exec("ALTER TABLE upcoming_items ADD COLUMN apple_synced_at TIMESTAMP");
    } catch (e) { /* */ }

    // Migrate: PA tables (context memory + email drafts)
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS pa_context (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key TEXT NOT NULL UNIQUE,
                value TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS pa_drafts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                subject TEXT,
                to_email TEXT,
                body TEXT NOT NULL,
                context_note TEXT,
                status TEXT DEFAULT 'draft',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_pa_drafts_status ON pa_drafts(status);
        `);
    } catch (e) { /* */ }

    // Migrate: contacts book
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS contacts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT,
                phone TEXT,
                whatsapp_jid TEXT,
                label TEXT DEFAULT 'regular',
                type TEXT DEFAULT 'personal',
                project_id INTEGER,
                relationship TEXT,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name);
            CREATE INDEX IF NOT EXISTS idx_contacts_label ON contacts(label);
        `);
    } catch (e) { /* */ }

    // Migrate: communications inbox (messages + send queue)
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source TEXT NOT NULL,
                external_id TEXT,
                sender_name TEXT,
                sender_address TEXT,
                subject TEXT,
                preview TEXT,
                received_at TIMESTAMP NOT NULL,
                urgency_score INTEGER DEFAULT 3,
                ai_summary TEXT,
                ai_suggested_reply TEXT,
                status TEXT DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(source, external_id)
            );
            CREATE TABLE IF NOT EXISTS message_send_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id INTEGER NOT NULL REFERENCES messages(id),
                reply_text TEXT NOT NULL,
                approved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                sent_at TIMESTAMP,
                send_status TEXT DEFAULT 'queued',
                error_text TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
            CREATE INDEX IF NOT EXISTS idx_messages_source ON messages(source);
            CREATE INDEX IF NOT EXISTS idx_messages_received ON messages(received_at DESC);
            CREATE INDEX IF NOT EXISTS idx_message_send_queue_status ON message_send_queue(send_status);
        `);
    } catch (e) { /* */ }
} else {
    createTables();
}

function createTables() {
    // Health daily data table (raw metrics from Whoop or manual)
    db.exec(`
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
        )
    `);

    // Health cycle phases table (calculated from health_cycle_config)
    db.exec(`
        CREATE TABLE IF NOT EXISTS health_cycle_phases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date DATE NOT NULL UNIQUE,
            cycle_day INTEGER,
            cycle_phase TEXT,
            monthly_phase TEXT,
            calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Health metrics table (legacy, for backward compatibility)
    db.exec(`
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
            is_synced INTEGER DEFAULT 0,
            source_id TEXT,
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
            status TEXT DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Social metrics table (long format)
    db.exec(`
        CREATE TABLE IF NOT EXISTS social_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            platform TEXT NOT NULL,
            metric_type TEXT NOT NULL,
            value INTEGER NOT NULL,
            date DATE NOT NULL,
            sync_source TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(platform, metric_type, date)
        )
    `);

    // Social metrics daily table (wide format for dashboards)
    db.exec(`
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

    // Phase 3: Archive tables
    db.exec(`
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
        )
    `);

    db.exec(`
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
        )
    `);

    db.exec(`
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
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS finance_monthly_archive (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            period TEXT NOT NULL UNIQUE,
            total_revenue DECIMAL,
            total_expenses DECIMAL,
            net_income DECIMAL,
            by_type TEXT,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.exec(`
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
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS projection_quarterly_review (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id INTEGER,
            quarter TEXT NOT NULL,
            forecast_accuracy_pct DECIMAL,
            variance_notes TEXT,
            learnings TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (plan_id) REFERENCES projection_plans(id)
        )
    `);

    db.exec(`
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
        )
    `);

    // No automatic data injection: real numbers come from manual input or integrations (Stripe, Wise, Whoop, Soulinsocial, etc.)
    console.log('✅ Database tables created');
}

db.path = dbPath;
module.exports = db;
