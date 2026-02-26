/**
 * Migration 003: Project System Tables
 * Creates project_tasks, milestones, dependencies, decision_triggers,
 * inbox_items, vip_senders + performance indexes.
 */

module.exports = {
    id: '003-project-system',
    name: 'Create project tasks, milestones, dependencies, triggers, inbox, VIP tables',

    up: (db) => {
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
    },

    down: (db) => {
        db.exec(`
            DROP TABLE IF EXISTS vip_senders;
            DROP TABLE IF EXISTS inbox_items;
            DROP TABLE IF EXISTS decision_triggers;
            DROP TABLE IF EXISTS project_dependencies;
            DROP TABLE IF EXISTS project_milestones;
            DROP TABLE IF EXISTS project_tasks;
        `);
    }
};
