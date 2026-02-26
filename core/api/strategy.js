const express = require('express');
const router = express.Router();
const db = require('../db/database');

/**
 * GET /api/strategy
 * Returns all projects with dependencies, goals with project links, and timeline data.
 */
router.get('/', (req, res) => {
    try {
        // Projects with phase/timeline info
        const projects = db.prepare(`
            SELECT id, name, short_name, status, current_phase, phase_list,
                   progress_pct, health_status, priority_rank,
                   depends_on_project_ids, blocks_project_ids
            FROM projects
            WHERE status IN ('active', 'paused')
            ORDER BY priority_rank ASC
        `).all();

        // Parse JSON fields
        projects.forEach(p => {
            try { p.phase_list = JSON.parse(p.phase_list || '[]'); } catch { p.phase_list = []; }
            try { p.depends_on_project_ids = JSON.parse(p.depends_on_project_ids || '[]'); } catch { p.depends_on_project_ids = []; }
            try { p.blocks_project_ids = JSON.parse(p.blocks_project_ids || '[]'); } catch { p.blocks_project_ids = []; }
        });

        // Dependencies
        const dependencies = db.prepare(`
            SELECT upstream_project_id, downstream_project_id, is_hard_block, dependency_description
            FROM project_dependencies
        `).all();

        // Goals with optional project_id
        const goals = db.prepare(`
            SELECT id, title, description, aspect, priority, status, project_id, period_type, period_label
            FROM goals
            WHERE status IS NULL OR status != 'abandoned'
            ORDER BY priority ASC, aspect ASC
        `).all();

        // Milestones with target dates (for timeline)
        const milestones = db.prepare(`
            SELECT m.id, m.project_id, m.name, m.status, m.target_date, m.weight,
                   p.short_name AS project_short_name, p.name AS project_name
            FROM project_milestones m
            JOIN projects p ON m.project_id = p.id
            WHERE p.status IN ('active', 'paused') AND m.target_date IS NOT NULL
            ORDER BY m.target_date ASC
        `).all();

        res.json({ projects, dependencies, goals, milestones });
    } catch (error) {
        console.error('Error fetching strategy data:', error);
        res.status(500).json({ error: 'Failed to fetch strategy data' });
    }
});

/**
 * PATCH /api/strategy/goal/:id
 * Link a goal to a project (set project_id)
 */
router.patch('/goal/:id', (req, res) => {
    try {
        const { project_id } = req.body;
        db.prepare('UPDATE goals SET project_id = ? WHERE id = ?').run(project_id || null, req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating goal:', error);
        res.status(500).json({ error: 'Failed to update goal' });
    }
});

module.exports = router;
