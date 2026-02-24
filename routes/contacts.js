/**
 * Contacts Routes
 * Manages the personal/business contact book with labels, project links, and send metadata.
 */

const express = require('express');
const router = express.Router();
const db = require('../db/database');

/** GET /api/contacts — list all, optional ?q= search, ?label=vip, ?type=business */
router.get('/', (req, res) => {
    try {
        const { q, label, type } = req.query;
        let sql = `
            SELECT c.*, p.name AS project_name
            FROM contacts c
            LEFT JOIN projects p ON c.project_id = p.id
            WHERE 1=1
        `;
        const params = [];
        if (q) {
            sql += ` AND (c.name LIKE ? OR c.email LIKE ? OR c.phone LIKE ? OR c.relationship LIKE ?)`;
            const like = `%${q}%`;
            params.push(like, like, like, like);
        }
        if (label) { sql += ` AND c.label = ?`; params.push(label); }
        if (type)  { sql += ` AND c.type = ?`;  params.push(type); }
        sql += ` ORDER BY c.label = 'vip' DESC, c.name ASC`;
        res.json(db.prepare(sql).all(...params));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/** GET /api/contacts/:id */
router.get('/:id', (req, res) => {
    try {
        const c = db.prepare(`
            SELECT c.*, p.name AS project_name
            FROM contacts c LEFT JOIN projects p ON c.project_id = p.id
            WHERE c.id = ?
        `).get(req.params.id);
        if (!c) return res.status(404).json({ error: 'Not found' });
        res.json(c);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/** POST /api/contacts — create */
router.post('/', (req, res) => {
    try {
        const { name, email, phone, whatsapp_jid, label = 'regular', type = 'personal', project_id, relationship, notes } = req.body;
        if (!name) return res.status(400).json({ error: 'name is required' });

        // Normalise phone: strip +, spaces, dashes
        const normPhone = phone ? phone.replace(/[\s\-\+\(\)]/g, '') : null;
        // Derive JID from phone if not provided
        const jid = whatsapp_jid || (normPhone ? `${normPhone}@s.whatsapp.net` : null);

        const r = db.prepare(`
            INSERT INTO contacts (name, email, phone, whatsapp_jid, label, type, project_id, relationship, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(name, email || null, normPhone, jid, label, type, project_id || null, relationship || null, notes || null);

        res.json({ id: r.lastInsertRowid, success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/** PATCH /api/contacts/:id — update any fields */
router.patch('/:id', (req, res) => {
    try {
        const { name, email, phone, whatsapp_jid, label, type, project_id, relationship, notes } = req.body;
        const fields = [], values = [];
        if (name !== undefined)         { fields.push('name = ?');         values.push(name); }
        if (email !== undefined)        { fields.push('email = ?');        values.push(email); }
        if (phone !== undefined) {
            const p = phone ? phone.replace(/[\s\-\+\(\)]/g, '') : null;
            fields.push('phone = ?'); values.push(p);
        }
        if (whatsapp_jid !== undefined) { fields.push('whatsapp_jid = ?'); values.push(whatsapp_jid); }
        if (label !== undefined)        { fields.push('label = ?');        values.push(label); }
        if (type !== undefined)         { fields.push('type = ?');         values.push(type); }
        if (project_id !== undefined)   { fields.push('project_id = ?');   values.push(project_id || null); }
        if (relationship !== undefined) { fields.push('relationship = ?'); values.push(relationship); }
        if (notes !== undefined)        { fields.push('notes = ?');        values.push(notes); }
        if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
        values.push(req.params.id);
        db.prepare(`UPDATE contacts SET ${fields.join(', ')} WHERE id = ?`).run(...values);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/** DELETE /api/contacts/:id */
router.delete('/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM contacts WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/** POST /api/contacts/sync-whatsapp
 * Reads recent chats from WhatsApp bridge DB + LID map and upserts contacts.
 * Stores the LID-based JID in whatsapp_jid when available (more reliable for sending).
 */
router.post('/sync-whatsapp', (req, res) => {
    try {
        const path = require('path');
        const fs = require('fs');
        const Database = require('better-sqlite3');

        const waBridgeDbPath = process.env.WHATSAPP_BRIDGE_DB_PATH
            || path.join(require('os').homedir(), 'code/whatsapp-mcp/whatsapp-bridge/store/messages.db');
        const waDeviceDbPath = process.env.WHATSAPP_DEVICE_DB_PATH
            || path.join(require('os').homedir(), 'code/whatsapp-mcp/whatsapp-bridge/store/whatsapp.db');

        if (!fs.existsSync(waBridgeDbPath)) {
            return res.status(404).json({ error: 'WhatsApp bridge DB not found at ' + waBridgeDbPath });
        }

        // Load LID map: phone → LID
        const lidMap = {};
        if (fs.existsSync(waDeviceDbPath)) {
            const devDb = new Database(waDeviceDbPath, { readonly: true, fileMustExist: true });
            devDb.prepare('SELECT lid, pn FROM whatsmeow_lid_map').all().forEach(r => {
                lidMap[r.pn] = r.lid;
            });
            devDb.close();
        }

        // Load contact names from whatsmeow_contacts
        const nameMap = {}; // phone → full_name or push_name
        if (fs.existsSync(waDeviceDbPath)) {
            const devDb = new Database(waDeviceDbPath, { readonly: true, fileMustExist: true });
            devDb.prepare('SELECT their_jid, full_name, push_name, first_name FROM whatsmeow_contacts').all().forEach(r => {
                const phone = r.their_jid?.split('@')[0];
                if (phone) nameMap[phone] = r.full_name || r.push_name || r.first_name || '';
            });
            devDb.close();
        }

        const waDb = new Database(waBridgeDbPath, { readonly: true, fileMustExist: true });
        const waChats = waDb.prepare(`
            SELECT jid, name FROM chats
            WHERE jid LIKE '%@s.whatsapp.net'
              AND name IS NOT NULL AND name != '' AND length(name) > 2
            ORDER BY last_message_time DESC
            LIMIT 200
        `).all();
        waDb.close();

        // Also pull iPhone-synced contacts from whatsmeow_contacts (richer names)
        if (fs.existsSync(waDeviceDbPath)) {
            const devDb2 = new Database(waDeviceDbPath, { readonly: true, fileMustExist: true });
            devDb2.prepare(`
                SELECT their_jid as jid, COALESCE(full_name, push_name, first_name) as name
                FROM whatsmeow_contacts
                WHERE their_jid LIKE '%@s.whatsapp.net'
                  AND COALESCE(full_name, push_name, first_name) IS NOT NULL
                  AND COALESCE(full_name, push_name, first_name) != ''
            `).all().forEach(c => {
                // Merge into waChats — deduplicate by JID, prefer whatsmeow_contacts name
                const existing = waChats.find(x => x.jid === c.jid);
                if (existing) { if (c.name) existing.name = c.name; }
                else waChats.push(c);
            });
            devDb2.close();
        }

        let added = 0, updated = 0, skipped = 0;
        const insert = db.prepare(`
            INSERT INTO contacts (name, phone, whatsapp_jid, label, type)
            VALUES (?, ?, ?, 'regular', 'personal')
        `);
        const existsByJid  = db.prepare('SELECT id FROM contacts WHERE whatsapp_jid = ?');
        const existsByPhone= db.prepare('SELECT id FROM contacts WHERE phone = ?');
        const updateJid    = db.prepare('UPDATE contacts SET whatsapp_jid = ? WHERE id = ?');

        for (const chat of waChats) {
            const phone = chat.jid.split('@')[0];
            // Use name from contacts DB if richer
            const name = nameMap[phone] || chat.name;
            // Skip if name is just a phone number
            if (!name || name === phone || /^\d+$/.test(name)) { skipped++; continue; }

            // Prefer LID JID for sending, fall back to phone JID
            const lid = lidMap[phone];
            const preferredJid = lid ? `${lid}@lid` : chat.jid;

            // Check if already exists by preferred JID or phone
            if (existsByJid.get(preferredJid)) { skipped++; continue; }
            const byPhone = existsByPhone.get(phone);
            if (byPhone) {
                // Update the JID to the LID version if we have one
                if (lid) { updateJid.run(preferredJid, byPhone.id); updated++; }
                else skipped++;
                continue;
            }
            insert.run(name, phone, preferredJid);
            added++;
        }

        res.json({ added, updated, skipped, total: waChats.length, lids_known: Object.keys(lidMap).length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
