/**
 * Project Keywords Routes
 * Per-project keyword sets for urgency scoring and auto-categorization.
 */

const express = require('express');
const router = express.Router();
const db = require('../db/database');

/** GET /api/project-keywords/:projectId — list keywords for a project */
router.get('/:projectId', (req, res) => {
    try {
        const rows = db.prepare(
            'SELECT * FROM project_keywords WHERE project_id = ? ORDER BY category, keyword'
        ).all(req.params.projectId);
        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/** POST /api/project-keywords/:projectId — add keyword */
router.post('/:projectId', (req, res) => {
    try {
        const { keyword, category, boost } = req.body;
        if (!keyword) return res.status(400).json({ error: 'keyword required' });
        const result = db.prepare(`
            INSERT INTO project_keywords (project_id, keyword, category, boost)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(project_id, keyword) DO UPDATE SET
                category = excluded.category, boost = excluded.boost
        `).run(req.params.projectId, keyword.toLowerCase().trim(), category || 'general', boost || 20);
        res.json({ success: true, id: result.lastInsertRowid });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/** DELETE /api/project-keywords/:id — remove keyword */
router.delete('/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM project_keywords WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
