const express = require('express');
const router = express.Router();
const db = require('../db/database');

router.get('/', (req, res) => {
    try {
        const { period_type, aspect, parent_id, withDetail } = req.query;
        let sql = 'SELECT * FROM goals WHERE 1=1';
        const params = [];
        if (period_type) { sql += ' AND period_type = ?'; params.push(period_type); }
        if (aspect) { sql += ' AND aspect = ?'; params.push(aspect); }
        if (parent_id !== undefined) { sql += ' AND parent_id IS ' + (parent_id === '' || parent_id === 'null' ? 'NULL' : '?'); if (parent_id !== '' && parent_id !== 'null') params.push(parent_id); }
        sql += ' ORDER BY period_label DESC, COALESCE(priority, 3) ASC, created_at DESC';
        const goals = db.prepare(sql).all(...params);
        if (withDetail === '1' || withDetail === 'true') {
            const withNosAndUncertainties = goals.map(g => {
                const nos = db.prepare('SELECT * FROM goal_nos WHERE goal_id = ? ORDER BY created_at DESC').all(g.id);
                const uncertainties = db.prepare('SELECT * FROM goal_uncertainties WHERE goal_id = ? ORDER BY COALESCE(sort_order, 999) ASC, created_at DESC').all(g.id);
                return { ...g, nos, uncertainties };
            });
            return res.json(withNosAndUncertainties);
        }
        res.json(goals);
    } catch (error) {
        console.error('Error fetching goals:', error);
        res.status(500).json({ error: 'Failed to fetch goals' });
    }
});

router.get('/nos-and-uncertainties', (req, res) => {
    try {
        const nos = db.prepare('SELECT * FROM goal_nos ORDER BY created_at DESC').all();
        const uncertainties = db.prepare('SELECT * FROM goal_uncertainties ORDER BY COALESCE(sort_order, 999) ASC, created_at DESC').all();
        res.json({ nos, uncertainties });
    } catch (error) {
        console.error('Error fetching nos/uncertainties:', error);
        res.status(500).json({ error: 'Failed to fetch' });
    }
});

router.get('/:id', (req, res) => {
    try {
        const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(req.params.id);
        if (!goal) return res.status(404).json({ error: 'Goal not found' });
        const nos = db.prepare('SELECT * FROM goal_nos WHERE goal_id = ? ORDER BY created_at DESC').all(goal.id);
        const uncertainties = db.prepare('SELECT * FROM goal_uncertainties WHERE goal_id = ? ORDER BY COALESCE(sort_order, 999) ASC, created_at DESC').all(goal.id);
        const scenarios = db.prepare('SELECT * FROM scenarios WHERE goal_id = ?').all(goal.id);
        res.json({ ...goal, nos, uncertainties, scenarios });
    } catch (error) {
        console.error('Error fetching goal:', error);
        res.status(500).json({ error: 'Failed to fetch goal' });
    }
});

router.post('/', (req, res) => {
    try {
        const { title, description, parent_id, period_type, period_label, aspect, priority } = req.body;
        const stmt = db.prepare(`
            INSERT INTO goals (title, description, parent_id, period_type, period_label, aspect, priority)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        const result = stmt.run(title || 'Untitled', description || null, parent_id || null, period_type || 'yearly', period_label || new Date().getFullYear().toString(), aspect || 'general', priority != null ? Number(priority) : 3);
        const row = db.prepare('SELECT * FROM goals WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json(row);
    } catch (error) {
        console.error('Error adding goal:', error);
        res.status(500).json({ error: 'Failed to add goal' });
    }
});

router.patch('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, parent_id, period_type, period_label, aspect, priority } = req.body;
        const updates = [];
        const values = [];
        if (title !== undefined) { updates.push('title = ?'); values.push(title); }
        if (description !== undefined) { updates.push('description = ?'); values.push(description); }
        if (parent_id !== undefined) { updates.push('parent_id = ?'); values.push(parent_id || null); }
        if (period_type !== undefined) { updates.push('period_type = ?'); values.push(period_type); }
        if (period_label !== undefined) { updates.push('period_label = ?'); values.push(period_label); }
        if (aspect !== undefined) { updates.push('aspect = ?'); values.push(aspect); }
        if (priority !== undefined) { updates.push('priority = ?'); values.push(Number(priority)); }
        if (updates.length > 0) {
            updates.push('updated_at = CURRENT_TIMESTAMP');
            values.push(id);
            db.prepare(`UPDATE goals SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        }
        const row = db.prepare('SELECT * FROM goals WHERE id = ?').get(id);
        res.json(row);
    } catch (error) {
        console.error('Error updating goal:', error);
        res.status(500).json({ error: 'Failed to update goal' });
    }
});

router.delete('/:id', (req, res) => {
    try {
        const { id } = req.params;
        db.prepare('DELETE FROM goal_nos WHERE goal_id = ?').run(id);
        db.prepare('DELETE FROM goal_uncertainties WHERE goal_id = ?').run(id);
        db.prepare('UPDATE scenarios SET goal_id = NULL WHERE goal_id = ?').run(id);
        db.prepare('DELETE FROM goals WHERE id = ?').run(id);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting goal:', error);
        res.status(500).json({ error: 'Failed to delete goal' });
    }
});

router.post('/nos', (req, res) => {
    try {
        const { goal_id, title, why } = req.body;
        const stmt = db.prepare('INSERT INTO goal_nos (goal_id, title, why) VALUES (?, ?, ?)');
        const result = stmt.run(goal_id || null, title || 'No', why || '');
        const row = db.prepare('SELECT * FROM goal_nos WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json(row);
    } catch (error) {
        console.error('Error adding goal no:', error);
        res.status(500).json({ error: 'Failed to add goal no' });
    }
});

router.post('/:id/nos', (req, res) => {
    try {
        const { id } = req.params;
        const { title, why } = req.body;
        const stmt = db.prepare('INSERT INTO goal_nos (goal_id, title, why) VALUES (?, ?, ?)');
        const result = stmt.run(id, title || 'No', why || '');
        const row = db.prepare('SELECT * FROM goal_nos WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json(row);
    } catch (error) {
        console.error('Error adding goal no:', error);
        res.status(500).json({ error: 'Failed to add goal no' });
    }
});

router.patch('/nos/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { title, why } = req.body;
        const updates = [];
        const values = [];
        if (title !== undefined) { updates.push('title = ?'); values.push(title); }
        if (why !== undefined) { updates.push('why = ?'); values.push(why); }
        if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
        values.push(id);
        db.prepare('UPDATE goal_nos SET ' + updates.join(', ') + ' WHERE id = ?').run(...values);
        const row = db.prepare('SELECT * FROM goal_nos WHERE id = ?').get(id);
        res.json(row || {});
    } catch (error) {
        console.error('Error updating goal no:', error);
        res.status(500).json({ error: 'Failed to update goal no' });
    }
});

router.delete('/nos/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM goal_nos WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting goal no:', error);
        res.status(500).json({ error: 'Failed to delete goal no' });
    }
});

router.delete('/:goalId/nos/:noId', (req, res) => {
    try {
        db.prepare('DELETE FROM goal_nos WHERE id = ? AND goal_id = ?').run(req.params.noId, req.params.goalId);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting goal no:', error);
        res.status(500).json({ error: 'Failed to delete goal no' });
    }
});

router.post('/uncertainties', (req, res) => {
    try {
        const { goal_id, title, notes } = req.body;
        const stmt = db.prepare('INSERT INTO goal_uncertainties (goal_id, title, notes) VALUES (?, ?, ?)');
        const result = stmt.run(goal_id || null, title || 'Maybe', notes || '');
        const row = db.prepare('SELECT * FROM goal_uncertainties WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json(row);
    } catch (error) {
        console.error('Error adding uncertainty:', error);
        res.status(500).json({ error: 'Failed to add uncertainty' });
    }
});

router.post('/:id/uncertainties', (req, res) => {
    try {
        const { id } = req.params;
        const { title, notes } = req.body;
        const stmt = db.prepare('INSERT INTO goal_uncertainties (goal_id, title, notes) VALUES (?, ?, ?)');
        const result = stmt.run(id, title || 'Uncertainty', notes || '');
        const row = db.prepare('SELECT * FROM goal_uncertainties WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json(row);
    } catch (error) {
        console.error('Error adding uncertainty:', error);
        res.status(500).json({ error: 'Failed to add uncertainty' });
    }
});

router.patch('/uncertainties/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { title, notes, sort_order } = req.body;
        const updates = [];
        const values = [];
        if (title !== undefined) { updates.push('title = ?'); values.push(title); }
        if (notes !== undefined) { updates.push('notes = ?'); values.push(notes); }
        if (sort_order !== undefined) { updates.push('sort_order = ?'); values.push(Number(sort_order)); }
        if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
        values.push(id);
        db.prepare('UPDATE goal_uncertainties SET ' + updates.join(', ') + ' WHERE id = ?').run(...values);
        const row = db.prepare('SELECT * FROM goal_uncertainties WHERE id = ?').get(id);
        res.json(row || {});
    } catch (error) {
        console.error('Error updating uncertainty:', error);
        res.status(500).json({ error: 'Failed to update uncertainty' });
    }
});

router.post('/uncertainties/reorder', (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array required' });
        const stmt = db.prepare('UPDATE goal_uncertainties SET sort_order = ? WHERE id = ?');
        ids.forEach((id, index) => { stmt.run(index, id); });
        res.json({ success: true });
    } catch (error) {
        console.error('Error reordering uncertainties:', error);
        res.status(500).json({ error: 'Failed to reorder' });
    }
});

router.delete('/uncertainties/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM goal_uncertainties WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting uncertainty:', error);
        res.status(500).json({ error: 'Failed to delete uncertainty' });
    }
});

router.delete('/:goalId/uncertainties/:uId', (req, res) => {
    try {
        db.prepare('DELETE FROM goal_uncertainties WHERE id = ? AND goal_id = ?').run(req.params.uId, req.params.goalId);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting uncertainty:', error);
        res.status(500).json({ error: 'Failed to delete uncertainty' });
    }
});

module.exports = router;
