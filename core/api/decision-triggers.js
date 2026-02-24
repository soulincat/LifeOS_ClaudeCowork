/**
 * Decision Triggers Routes
 * Metrics-based decision points surfaced on the dashboard right panel.
 */
const express = require('express');
const router = express.Router();
const db = require('../db/database');

/**
 * GET /api/decision-triggers
 * All triggers, or filtered by status/project.
 * ?dashboard=1 returns only those surfaced on dashboard within 14 days.
 */
router.get('/', (req, res) => {
    try {
        const { project_id, status, dashboard } = req.query;
        if (dashboard === '1') {
            const cutoff = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
            const rows = db.prepare(`
                SELECT dt.*, p.name as project_name FROM decision_triggers dt
                LEFT JOIN projects p ON p.id = dt.project_id
                WHERE dt.surface_on_dashboard = 1 AND dt.status = 'pending'
                AND dt.check_date <= ?
                ORDER BY dt.check_date ASC
            `).all(cutoff);
            return res.json(rows);
        }
        let query = 'SELECT dt.*, p.name as project_name FROM decision_triggers dt LEFT JOIN projects p ON p.id = dt.project_id WHERE 1=1';
        const params = [];
        if (project_id) { query += ' AND dt.project_id = ?'; params.push(project_id); }
        if (status) { query += ' AND dt.status = ?'; params.push(status); }
        query += ' ORDER BY dt.check_date ASC NULLS LAST';
        res.json(db.prepare(query).all(...params));
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch triggers' });
    }
});

/**
 * POST /api/decision-triggers
 */
router.post('/', (req, res) => {
    try {
        const { project_id, title, check_date, metric_type, metric_source, threshold,
                operator, pass_text, fail_text, surface_on_dashboard } = req.body;
        if (!title) return res.status(400).json({ error: 'title required' });
        const result = db.prepare(`
            INSERT INTO decision_triggers (project_id, title, check_date, metric_type, metric_source,
                threshold, operator, pass_text, fail_text, surface_on_dashboard)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(project_id || null, title, check_date || null, metric_type || null,
            metric_source || null, threshold || null, operator || 'greater_than',
            pass_text || null, fail_text || null, surface_on_dashboard !== false ? 1 : 0);
        res.json(db.prepare('SELECT * FROM decision_triggers WHERE id = ?').get(result.lastInsertRowid));
    } catch (error) {
        res.status(500).json({ error: 'Failed to create trigger' });
    }
});

/**
 * PATCH /api/decision-triggers/:id
 * Update trigger — including recording actual_value and evaluating against threshold.
 */
router.patch('/:id', (req, res) => {
    try {
        const trigger = db.prepare('SELECT * FROM decision_triggers WHERE id = ?').get(req.params.id);
        if (!trigger) return res.status(404).json({ error: 'Trigger not found' });

        const allowed = ['title', 'check_date', 'metric_type', 'metric_source', 'threshold',
            'operator', 'pass_text', 'fail_text', 'status', 'actual_value', 'surface_on_dashboard'];
        const updates = [];
        const values = [];
        for (const field of allowed) {
            if (req.body[field] !== undefined) {
                updates.push(`${field} = ?`);
                values.push(req.body[field]);
            }
        }

        // Auto-evaluate if actual_value is being set and threshold exists
        if (req.body.actual_value != null && trigger.threshold != null) {
            const actual = Number(req.body.actual_value);
            const thresh = Number(trigger.threshold);
            const op = req.body.operator || trigger.operator || 'greater_than';
            let passed = false;
            if (op === 'greater_than') passed = actual > thresh;
            else if (op === 'less_than') passed = actual < thresh;
            else if (op === 'equals') passed = actual === thresh;

            // Set status based on evaluation if not explicitly provided
            if (req.body.status === undefined) {
                updates.push('status = ?');
                values.push(passed ? 'passed' : 'failed');
            }
        }

        updates.push('updated_at = CURRENT_TIMESTAMP');
        if (updates.length === 1) return res.status(400).json({ error: 'No fields to update' });
        values.push(req.params.id);
        db.prepare(`UPDATE decision_triggers SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        res.json(db.prepare('SELECT * FROM decision_triggers WHERE id = ?').get(req.params.id));
    } catch (error) {
        res.status(500).json({ error: 'Failed to update trigger' });
    }
});

/**
 * DELETE /api/decision-triggers/:id
 */
router.delete('/:id', (req, res) => {
    try {
        const result = db.prepare('DELETE FROM decision_triggers WHERE id = ?').run(req.params.id);
        if (result.changes === 0) return res.status(404).json({ error: 'Trigger not found' });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete trigger' });
    }
});

module.exports = router;
