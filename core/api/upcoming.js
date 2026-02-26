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
 * Sync events from Apple Calendar into upcoming_items.
 * Optional body: { calendarNames: ['집', '직장'] }
 */
router.post('/sync-calendar', (req, res) => {
    try {
        const { calendarNames } = req.body || {};
        const { syncCalendarEvents } = require('../../integrations/apple/calendar-read');
        const result = syncCalendarEvents({ calendarNames });
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Calendar sync error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
