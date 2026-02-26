/**
 * Migration 004: Health Data Restructure
 * Splits health_metrics into health_daily_data + health_cycle_phases.
 * Creates health_cycle_config and whoop_oauth tables.
 * Migrates existing data (one-time).
 */

module.exports = {
    id: '004-health-restructure',
    name: 'Split health_metrics into daily data + cycle phases, add cycle config + Whoop OAuth',

    up: (db) => {
        // social_metrics_daily pivot table
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

        // health_daily_data + health_cycle_phases
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

        // One-time data migration from health_metrics
        const dailyCount = db.prepare('SELECT COUNT(*) as count FROM health_daily_data').get();
        if (dailyCount.count === 0) {
            try {
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
            } catch (e) { /* health_metrics may be empty */ }
        }

        // health_cycle_config (single row)
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

        // whoop_oauth (single row)
        db.exec(`
            CREATE TABLE IF NOT EXISTS whoop_oauth (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                access_token TEXT NOT NULL,
                refresh_token TEXT,
                expires_at INTEGER NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
    },

    down: (db) => {
        // Data migration is one-way; health_metrics still exists as legacy
        db.exec('DROP TABLE IF EXISTS whoop_oauth');
        db.exec('DROP TABLE IF EXISTS health_cycle_config');
        db.exec('DROP TABLE IF EXISTS health_cycle_phases');
        db.exec('DROP TABLE IF EXISTS health_daily_data');
        db.exec('DROP TABLE IF EXISTS social_metrics_daily');
    }
};
