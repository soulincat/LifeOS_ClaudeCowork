const express = require('express');
const router = express.Router();
const db = require('../db/database');

/**
 * GET /api/upcoming
 * Get upcoming deadlines and meetings
 */
router.get('/', (req, res) => {
    try {
        const stmt = db.prepare(`
            SELECT * FROM upcoming_items
            WHERE due_date >= datetime('now')
            ORDER BY due_date ASC
            LIMIT 10
        `);
        const items = stmt.all();
        res.json(items);
    } catch (error) {
        console.error('Error fetching upcoming items:', error);
        res.status(500).json({ error: 'Failed to fetch upcoming items' });
    }
});

/**
 * POST /api/upcoming
 * Add an upcoming item
 */
router.post('/', (req, res) => {
    try {
        const { title, type, due_date, description } = req.body;
        
        const stmt = db.prepare(`
            INSERT INTO upcoming_items (title, type, due_date, description)
            VALUES (?, ?, ?, ?)
        `);
        
        const result = stmt.run(title, type, due_date, description || null);
        res.json({ id: result.lastInsertRowid, success: true });
    } catch (error) {
        console.error('Error adding upcoming item:', error);
        res.status(500).json({ error: 'Failed to add upcoming item' });
    }
});

/**
 * PATCH /api/upcoming/:id
 * Update an upcoming item (e.g. reschedule)
 */
router.patch('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { due_date, title, description, type } = req.body;
        const fields = [];
        const values = [];
        if (due_date !== undefined) { fields.push('due_date = ?'); values.push(due_date); }
        if (title !== undefined) { fields.push('title = ?'); values.push(title); }
        if (description !== undefined) { fields.push('description = ?'); values.push(description); }
        if (type !== undefined) { fields.push('type = ?'); values.push(type); }
        if (fields.length === 0) return res.status(400).json({ error: 'Nothing to update' });
        values.push(id);
        db.prepare(`UPDATE upcoming_items SET ${fields.join(', ')} WHERE id = ?`).run(...values);
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating upcoming item:', error);
        res.status(500).json({ error: 'Failed to update upcoming item' });
    }
});

/**
 * DELETE /api/upcoming/:id
 * Delete an upcoming item
 */
router.delete('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const stmt = db.prepare('DELETE FROM upcoming_items WHERE id = ?');
        stmt.run(id);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting upcoming item:', error);
        res.status(500).json({ error: 'Failed to delete upcoming item' });
    }
});

/**
 * POST /api/upcoming/sync-calendar
 * Sync events into upcoming_items.
 * Tries Google Calendar API first (fast), falls back to Apple Calendar (AppleScript).
 * Optional body: { calendarNames: ['집', '직장'], calendarIds: ['primary'] }
 */
router.post('/sync-calendar', async (req, res) => {
    try {
        const { calendarNames, calendarIds } = req.body || {};
        const results = [];

        // 1. Try Google Calendar API (fast, async)
        try {
            const gcal = require('../../integrations/google-calendar');
            if (gcal.hasCalendarScope()) {
                const gResult = await gcal.syncGoogleCalendar({ calendarIds });
                results.push({ source: 'google', ...gResult });
            }
        } catch (e) {
            results.push({ source: 'google', synced: 0, error: e.message });
        }

        // 2. Apple Calendar (slow, sync — only if Google didn't provide events)
        const googleSynced = results.find(r => r.source === 'google')?.synced || 0;
        if (googleSynced === 0) {
            try {
                const { syncCalendarEvents } = require('../../integrations/apple/calendar-read');
                const aResult = syncCalendarEvents({ calendarNames });
                results.push({ source: 'apple', ...aResult });
            } catch (e) {
                results.push({ source: 'apple', synced: 0, error: e.message });
            }
        }

        const totalSynced = results.reduce((s, r) => s + (r.synced || 0), 0);
        res.json({ success: true, synced: totalSynced, details: results });
    } catch (error) {
        console.error('Calendar sync error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/upcoming/calendars
 * List available Google Calendar calendars.
 */
router.get('/calendars', async (req, res) => {
    try {
        const gcal = require('../../integrations/google-calendar');
        if (!gcal.hasCalendarScope()) {
            return res.json({ calendars: [], needsAuth: true });
        }
        const calendars = await gcal.listCalendars();
        res.json({ calendars });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
