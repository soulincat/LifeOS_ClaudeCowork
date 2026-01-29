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

module.exports = router;
