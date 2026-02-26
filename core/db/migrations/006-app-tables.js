/**
 * Migration 006: Application Tables
 * Creates PA context/drafts, contacts, setup_sections, messages/send_queue.
 * Adds Apple sync columns to todos + upcoming_items.
 */

module.exports = {
    id: '006-app-tables',
    name: 'Create PA, contacts, setup, messages tables; Apple sync columns',

    up: (db) => {
        // Apple sync tracking on todos + upcoming_items
        const addCols = (table, cols) => {
            const existing = db.prepare(`PRAGMA table_info(${table})`).all().map(r => r.name);
            for (const [name, type] of cols) {
                if (!existing.includes(name)) {
                    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
                }
            }
        };
        addCols('todos', [['apple_reminder_id', 'TEXT'], ['apple_synced_at', 'TIMESTAMP']]);
        addCols('upcoming_items', [['apple_event_id', 'TEXT'], ['apple_synced_at', 'TIMESTAMP']]);

        // PA context memory + email drafts
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

        // Contacts book
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

        // Setup sections (key-value config store)
        db.exec(`
            CREATE TABLE IF NOT EXISTS setup_sections (
                section_key TEXT PRIMARY KEY,
                payload TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Communications inbox
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
    },

    down: (db) => {
        db.exec(`
            DROP TABLE IF EXISTS message_send_queue;
            DROP TABLE IF EXISTS messages;
            DROP TABLE IF EXISTS setup_sections;
            DROP TABLE IF EXISTS contacts;
            DROP TABLE IF EXISTS pa_drafts;
            DROP TABLE IF EXISTS pa_context;
        `);
    }
};
