/**
 * Inbox Routes (unified inbox_items table)
 * Separate from the existing messages table which handles email/WA triage.
 * This is the new internal inbox for the home panel.
 */
const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { computeUrgencyScore } = require('../db/derived-state');

/**
 * GET /api/inbox
 * Fetch inbox items. Defaults to non-dismissed, sorted by urgency.
 * ?source=whatsapp  ?unread_only=1  ?limit=20
 */
router.get('/', (req, res) => {
    try {
        const { source, unread_only, limit = 20 } = req.query;
        let query = 'SELECT * FROM inbox_items WHERE is_dismissed = 0';
        const params = [];
        if (source) { query += ' AND source = ?'; params.push(source); }
        if (unread_only === '1') { query += ' AND is_unread = 1'; }
        query += ' ORDER BY urgency_score DESC, timestamp DESC LIMIT ?';
        params.push(Number(limit));
        res.json(db.prepare(query).all(...params));
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch inbox' });
    }
});

/**
 * GET /api/inbox/counts
 * Unread count total and per source.
 */
router.get('/counts', (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT source, COUNT(*) as count FROM inbox_items
            WHERE is_unread = 1 AND is_dismissed = 0
            GROUP BY source
        `).all();
        const counts = { total: 0 };
        for (const row of rows) {
            counts[row.source] = row.count;
            counts.total += row.count;
        }
        res.json(counts);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch counts' });
    }
});

/**
 * POST /api/inbox
 * Insert an inbox item. Urgency score is computed automatically.
 */
router.post('/', (req, res) => {
    try {
        const { source, sender_name, sender_id, preview, full_content, timestamp,
                project_tag, action_required, raw_payload } = req.body;
        if (!source || !timestamp) return res.status(400).json({ error: 'source and timestamp required' });

        const item = { source, sender_name, sender_id, preview, full_content, timestamp,
            is_unread: true, project_tag, action_required };
        const scoring = computeUrgencyScore(item);

        // Blocked contacts → skip insert entirely
        if (scoring.blocked) {
            return res.json({ skipped: true, reason: 'blocked_sender' });
        }

        const result = db.prepare(`
            INSERT INTO inbox_items (source, sender_name, sender_id, preview, full_content, timestamp,
                urgency_score, project_tag, action_required, raw_payload,
                priority_tier, contact_id, category)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(source, sender_name || null, sender_id || null, preview ? preview.slice(0, 150) : null,
            full_content || null, timestamp, scoring.score, project_tag || scoring.project_id || null,
            action_required ? 1 : 0, raw_payload ? JSON.stringify(raw_payload) : null,
            scoring.tier, scoring.contact_id, scoring.category);

        res.json({ ...db.prepare('SELECT * FROM inbox_items WHERE id = ?').get(result.lastInsertRowid) });
    } catch (error) {
        console.error('Error inserting inbox item:', error);
        res.status(500).json({ error: 'Failed to insert inbox item' });
    }
});

/**
 * PATCH /api/inbox/:id
 * Mark read, dismiss, tag project, etc.
 */
router.patch('/:id', (req, res) => {
    try {
        const item = db.prepare('SELECT id FROM inbox_items WHERE id = ?').get(req.params.id);
        if (!item) return res.status(404).json({ error: 'Item not found' });

        const allowed = ['is_unread', 'is_dismissed', 'project_tag', 'action_required'];
        const updates = [];
        const values = [];
        for (const field of allowed) {
            if (req.body[field] !== undefined) {
                updates.push(`${field} = ?`);
                values.push(typeof req.body[field] === 'boolean' ? (req.body[field] ? 1 : 0) : req.body[field]);
            }
        }
        if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
        values.push(req.params.id);
        db.prepare(`UPDATE inbox_items SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        res.json(db.prepare('SELECT * FROM inbox_items WHERE id = ?').get(req.params.id));
    } catch (error) {
        res.status(500).json({ error: 'Failed to update inbox item' });
    }
});

/**
 * DELETE /api/inbox/:id  (soft dismiss)
 */
router.delete('/:id', (req, res) => {
    try {
        const result = db.prepare('UPDATE inbox_items SET is_dismissed = 1 WHERE id = ?').run(req.params.id);
        if (result.changes === 0) return res.status(404).json({ error: 'Item not found' });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to dismiss item' });
    }
});

module.exports = router;
