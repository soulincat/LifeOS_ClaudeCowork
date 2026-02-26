/**
 * Migration 005: Archive Tables
 * Creates archive tables for projects, goals, scenarios, finance, health,
 * projections, and annual reviews. Includes projects_archive no-unique fix.
 */

module.exports = {
    id: '005-archive-tables',
    name: 'Create archive tables for completed/historical data',

    up: (db) => {
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
            );
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
        `);

        // Drop UNIQUE constraint on projects_archive.name (allow re-archiving same project)
        db.exec('CREATE TABLE IF NOT EXISTS _schema_migrations (version TEXT PRIMARY KEY)');
        const done = db.prepare('SELECT 1 FROM _schema_migrations WHERE version = ?').get('projects_archive_no_unique');
        if (!done) {
            // Check if the table has a UNIQUE constraint on name by checking the SQL
            const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='projects_archive'").get();
            if (tableInfo && tableInfo.sql && tableInfo.sql.includes('UNIQUE')) {
                db.exec(`
                    CREATE TABLE projects_archive_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        original_id INTEGER,
                        name TEXT NOT NULL,
                        github_repo TEXT, last_updated DATE, metrics TEXT,
                        revenue_worst DECIMAL, revenue_base DECIMAL, revenue_lucky DECIMAL,
                        hours_per_week INTEGER, budget_to_invest DECIMAL, months_to_results INTEGER,
                        business_model TEXT, ai_assumptions TEXT, status TEXT,
                        archive_reason TEXT, archive_date DATE NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `);
                db.exec('INSERT INTO projects_archive_new SELECT * FROM projects_archive');
                db.exec('DROP TABLE projects_archive');
                db.exec('ALTER TABLE projects_archive_new RENAME TO projects_archive');
            }
            db.exec('CREATE INDEX IF NOT EXISTS idx_projects_archive_date ON projects_archive(archive_date)');
            db.prepare('INSERT INTO _schema_migrations (version) VALUES (?)').run('projects_archive_no_unique');
        }
    },

    down: (db) => {
        db.exec(`
            DROP TABLE IF EXISTS annual_review;
            DROP TABLE IF EXISTS projection_quarterly_review;
            DROP TABLE IF EXISTS health_monthly_archive;
            DROP TABLE IF EXISTS finance_monthly_archive;
            DROP TABLE IF EXISTS scenarios_archive;
            DROP TABLE IF EXISTS goals_archive;
            DROP TABLE IF EXISTS projects_archive;
        `);
    }
};
