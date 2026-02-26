/**
 * Migration 007: Priority System
 * Extends contacts with urgency_boost/priority_tier.
 * Creates project_keywords table.
 * Extends messages + inbox_items with priority tier, project, contact, category.
 * Migrates VIP senders into contacts. Backfills priority tiers.
 */

module.exports = {
    id: '007-priority-system',
    name: 'Add priority system: contact tiers, project keywords, message categorization',

    up: (db) => {
        const addCols = (table, cols) => {
            const existing = db.prepare(`PRAGMA table_info(${table})`).all().map(r => r.name);
            for (const [name, type] of cols) {
                if (!existing.includes(name)) {
                    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
                }
            }
        };

        // Extend contacts with urgency_boost + priority_tier + sender lookup indexes
        addCols('contacts', [
            ['urgency_boost', 'INTEGER DEFAULT 0'],
            ['priority_tier', "TEXT DEFAULT 'medium'"],
        ]);
        db.exec('CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_contacts_whatsapp_jid ON contacts(whatsapp_jid)');

        // Project keywords for per-project urgency/category
        db.exec(`
            CREATE TABLE IF NOT EXISTS project_keywords (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                keyword TEXT NOT NULL,
                category TEXT DEFAULT 'general',
                boost INTEGER DEFAULT 20,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id),
                UNIQUE(project_id, keyword)
            );
            CREATE INDEX IF NOT EXISTS idx_project_keywords_project ON project_keywords(project_id);
        `);

        // Extend messages with priority tier, project, contact, category, action_tag
        addCols('messages', [
            ['project_id', 'INTEGER REFERENCES projects(id)'],
            ['contact_id', 'INTEGER REFERENCES contacts(id)'],
            ['category', 'TEXT'],
            ['priority_tier', "TEXT DEFAULT 'medium'"],
            ['action_tag', 'TEXT'],
        ]);
        db.exec('CREATE INDEX IF NOT EXISTS idx_messages_priority_tier ON messages(priority_tier)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_messages_project_id ON messages(project_id)');

        // Backfill action_tag on existing messages
        try {
            const needsTag = db.prepare("SELECT COUNT(*) as c FROM messages WHERE action_tag IS NULL OR action_tag = ''").get();
            if (needsTag.c > 0) {
                const { detectActionTag } = require('../derived-state');
                const toFill = db.prepare("SELECT id, preview, subject FROM messages WHERE action_tag IS NULL OR action_tag = ''").all();
                const upd = db.prepare('UPDATE messages SET action_tag = ? WHERE id = ?');
                const fillMany = db.transaction((rows) => {
                    for (const r of rows) upd.run(detectActionTag(r.preview, r.subject), r.id);
                });
                fillMany(toFill);
                console.log(`  Backfilled action_tag on ${toFill.length} messages`);
            }
        } catch (e) { console.warn('  action_tag backfill skipped:', e.message); }

        // Extend inbox_items with priority tier, contact, category
        addCols('inbox_items', [
            ['priority_tier', "TEXT DEFAULT 'medium'"],
            ['contact_id', 'INTEGER REFERENCES contacts(id)'],
            ['category', 'TEXT'],
        ]);

        // Copy VIP senders into contacts (one-time)
        db.exec('CREATE TABLE IF NOT EXISTS _schema_migrations (version TEXT PRIMARY KEY)');
        const vipDone = db.prepare('SELECT 1 FROM _schema_migrations WHERE version = ?').get('vip_to_contacts');
        if (!vipDone) {
            try {
                const vips = db.prepare('SELECT * FROM vip_senders').all();
                for (const vip of vips) {
                    const existing = db.prepare(
                        'SELECT id FROM contacts WHERE phone = ? OR email = ? OR whatsapp_jid = ?'
                    ).get(vip.sender_id, vip.sender_id, vip.sender_id);
                    if (existing) {
                        db.prepare("UPDATE contacts SET label = 'vip', relationship = COALESCE(relationship, ?) WHERE id = ?")
                            .run(vip.relationship, existing.id);
                    } else {
                        db.prepare("INSERT INTO contacts (name, phone, label, relationship) VALUES (?, ?, 'vip', ?)")
                            .run(vip.name, vip.sender_id, vip.relationship);
                    }
                }
            } catch (e) { /* vip_senders may not exist */ }
            db.prepare('INSERT INTO _schema_migrations (version) VALUES (?)').run('vip_to_contacts');
        }

        // Backfill priority_tier on existing messages (SQL-only)
        const backfillDone = db.prepare('SELECT 1 FROM _schema_migrations WHERE version = ?').get('backfill_message_tiers');
        if (!backfillDone) {
            // Link messages to contacts by sender_address
            db.exec(`
                UPDATE messages SET contact_id = (
                    SELECT c.id FROM contacts c
                    WHERE c.phone = messages.sender_address
                       OR c.email = messages.sender_address
                       OR c.whatsapp_jid = messages.sender_address
                    LIMIT 1
                ) WHERE contact_id IS NULL
            `);
            // Set tiers based on urgency_score + contact label
            db.exec(`UPDATE messages SET priority_tier = 'urgent' WHERE urgency_score >= 4`);
            db.exec(`UPDATE messages SET priority_tier = 'ignored' WHERE urgency_score <= 1`);
            db.exec(`
                UPDATE messages SET priority_tier = 'ignored'
                WHERE contact_id IN (SELECT id FROM contacts WHERE label IN ('blocked','ignored'))
            `);
            db.exec(`
                UPDATE messages SET priority_tier = 'urgent'
                WHERE contact_id IN (SELECT id FROM contacts WHERE label = 'vip')
                  AND urgency_score >= 3
            `);
            db.prepare('INSERT INTO _schema_migrations (version) VALUES (?)').run('backfill_message_tiers');
            console.log('  Backfilled priority tiers on existing messages');
        }
    },

    down: (db) => {
        db.exec('DROP TABLE IF EXISTS project_keywords');
    }
};
