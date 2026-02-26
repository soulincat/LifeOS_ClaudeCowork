/**
 * Migration 002: Column Additions
 * Adds columns to existing tables for features added after initial schema.
 * All checks are idempotent (no-op if column already exists from schema.sql).
 */

module.exports = {
    id: '002-column-additions',
    name: 'Add columns to scenarios, scenario_projects, projects, finance, health, social, wishlist, goals, todos, uncertainties, project_tasks',

    up: (db) => {
        const addCols = (table, cols) => {
            const existing = db.prepare(`PRAGMA table_info(${table})`).all().map(r => r.name);
            for (const [name, type] of cols) {
                if (!existing.includes(name)) {
                    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
                    existing.push(name);
                }
            }
        };

        // scenarios: decision columns, SaaS model, outcome tracking
        addCols('scenarios', [
            ['pros', 'TEXT'], ['cons', 'TEXT'], ['long_term_upside', 'TEXT'],
            ['priority', 'INTEGER'], ['thesis', 'TEXT'],
            ['time_available_hrs_per_week', 'DECIMAL'],
            ['project_id', 'INTEGER REFERENCES projects(id)'],
            ['business_model', 'TEXT'], ['monthly_fee_usd', 'DECIMAL'],
            ['client_count_target', 'INTEGER'], ['client_target_months', 'INTEGER'],
            ['growth_rate_pct', 'DECIMAL'], ['marketing_fee_monthly', 'DECIMAL'],
            ['probability_pct', 'DECIMAL'], ['prelaunch_budget', 'DECIMAL'],
            ['prelaunch_weeks', 'INTEGER'],
            ['outcome', 'TEXT'], ['outcome_score', 'INTEGER'],
            ['outcome_notes', 'TEXT'], ['lessons_learned', 'TEXT'],
            ['completed_date', 'DATE'],
        ]);

        // scenario_projects: experiment per-project columns + SaaS model
        addCols('scenario_projects', [
            ['likelihood', 'TEXT'], ['tags', 'TEXT'],
            ['time_allocation_pct', 'DECIMAL'], ['budget_allocation', 'DECIMAL'],
            ['executed_hours_so_far', 'DECIMAL'], ['rev_projection', 'DECIMAL'],
            ['expected_rev_after_notes', 'TEXT'], ['exponential_growth', 'INTEGER'],
            ['model_type', 'TEXT'], ['monthly_fee_usd', 'DECIMAL'],
            ['client_target_months', 'INTEGER'], ['client_count_target', 'INTEGER'],
            ['growth_rate_pct', 'DECIMAL'], ['marketing_fee_monthly', 'DECIMAL'],
            ['probability_pct', 'DECIMAL'], ['willingness_alignment_notes', 'TEXT'],
        ]);

        // projects: revenue projections, planning, task/milestone system, KPI display, short name
        addCols('projects', [
            ['revenue_worst', 'DECIMAL'], ['revenue_base', 'DECIMAL'],
            ['revenue_lucky', 'DECIMAL'], ['hours_per_week', 'INTEGER'],
            ['budget_to_invest', 'DECIMAL'], ['months_to_results', 'INTEGER'],
            ['business_model', 'TEXT'], ['ai_assumptions', 'TEXT'],
            ['description', 'TEXT'], ['ai_analysis', 'TEXT'],
            ['status', "TEXT DEFAULT 'active'"],
            ['next_action', 'TEXT'], ['health_status', "TEXT DEFAULT 'green'"],
            ['progress_pct', 'INTEGER DEFAULT 0'], ['current_phase', 'TEXT'],
            ['phase_list', 'TEXT'], ['priority_rank', 'INTEGER DEFAULT 4'],
            ['timeline_start', 'DATE'], ['timeline_end', 'DATE'],
            ['blocks_project_ids', 'TEXT'], ['depends_on_project_ids', 'TEXT'],
            ['display_kpi_key', 'TEXT'], ['display_kpi_label', 'TEXT'],
            ['short_name', 'TEXT'],
        ]);

        // finance_entries: sync tracking
        addCols('finance_entries', [
            ['is_synced', 'INTEGER DEFAULT 0'], ['source_id', 'TEXT'],
        ]);
        db.prepare("UPDATE finance_entries SET is_synced = 1 WHERE source IN ('stripe', 'wise')").run();

        // health_metrics: sync_source, strain, sleep_performance
        addCols('health_metrics', [
            ['sync_source', 'TEXT'], ['strain', 'DECIMAL'],
            ['sleep_performance_pct', 'INTEGER'],
        ]);
        // Migrate strain values from cycle_phase column
        db.prepare(`UPDATE health_metrics SET strain = CAST(REPLACE(cycle_phase, 'Strain ', '') AS REAL), cycle_phase = NULL WHERE cycle_phase LIKE 'Strain %'`).run();

        // social_metrics: sync_source
        addCols('social_metrics', [['sync_source', 'TEXT']]);

        // wishlist_items: savings progress and purchase conditions
        addCols('wishlist_items', [
            ['saved_amount', 'DECIMAL DEFAULT 0'], ['purchase_condition', 'TEXT'],
            ['condition_type', "TEXT DEFAULT 'none'"], ['condition_value', 'DECIMAL'],
        ]);

        // goals: priority + outcome tracking
        addCols('goals', [
            ['priority', 'INTEGER DEFAULT 3'],
            ['status', "TEXT DEFAULT 'in_progress'"], ['outcome', 'TEXT'],
            ['outcome_notes', 'TEXT'], ['lessons_learned', 'TEXT'],
            ['completed_date', 'DATE'], ['project_id', 'INTEGER'],
        ]);

        // goal_uncertainties: sort_order
        addCols('goal_uncertainties', [['sort_order', 'INTEGER DEFAULT 0']]);

        // todos: sort_order + archived
        addCols('todos', [
            ['sort_order', 'INTEGER DEFAULT 0'], ['archived', 'BOOLEAN DEFAULT 0'],
        ]);

        // project_tasks: Apple Reminders sync
        addCols('project_tasks', [
            ['apple_reminder_id', 'TEXT'], ['apple_synced_at', 'TIMESTAMP'],
        ]);
    },

    down: (db) => {
        // SQLite doesn't support DROP COLUMN before 3.35.0; rollback not practical
        throw new Error('Column additions cannot be rolled back in SQLite');
    }
};
