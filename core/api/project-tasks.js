/**
 * Project Tasks & Milestones Routes
 * CRUD for tasks, milestones, dependencies within projects.
 * All writes trigger derived state recalculation.
 */
const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { rederiveProject, deriveProgress, derivePhase } = require('../db/derived-state');

// ── TASKS ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/project-tasks/:projectId
 * Get tasks for a project, optionally filtered by phase/status.
 */
router.get('/:projectId', (req, res) => {
    try {
        const { projectId } = req.params;
        const { phase, status, limit = 50 } = req.query;
        let query = 'SELECT * FROM project_tasks WHERE project_id = ?';
        const params = [projectId];
        if (phase) { query += ' AND project_phase = ?'; params.push(phase); }
        if (status) { query += ' AND status = ?'; params.push(status); }
        query += ' ORDER BY priority_within_project ASC, created_at ASC LIMIT ?';
        params.push(Number(limit));
        res.json(db.prepare(query).all(...params));
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch tasks' });
    }
});

/**
 * POST /api/project-tasks/:projectId
 * Add a task to a project. Triggers health rederivation.
 */
router.post('/:projectId', (req, res) => {
    try {
        const { projectId } = req.params;
        const { text, type, is_blocker, blocks_task_ids, project_phase, energy_required,
                due_date, contributes_to_project_ids, priority_within_project, created_via } = req.body;
        if (!text) return res.status(400).json({ error: 'text is required' });

        const result = db.prepare(`
            INSERT INTO project_tasks (project_id, text, type, is_blocker, blocks_task_ids, project_phase,
                energy_required, due_date, contributes_to_project_ids, priority_within_project, created_via)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            projectId, text, type || 'deliverable', is_blocker ? 1 : 0,
            blocks_task_ids ? JSON.stringify(blocks_task_ids) : null,
            project_phase || null, energy_required || 'medium', due_date || null,
            contributes_to_project_ids ? JSON.stringify(contributes_to_project_ids) : null,
            priority_within_project || 0, created_via || 'manual'
        );

        rederiveProject(Number(projectId));
        const task = db.prepare('SELECT * FROM project_tasks WHERE id = ?').get(result.lastInsertRowid);
        res.json(task);
    } catch (error) {
        console.error('Error adding task:', error);
        res.status(500).json({ error: 'Failed to add task' });
    }
});

/**
 * PATCH /api/project-tasks/task/:taskId
 * Update a task. Triggers rederivation.
 */
router.patch('/task/:taskId', (req, res) => {
    try {
        const { taskId } = req.params;
        const task = db.prepare('SELECT * FROM project_tasks WHERE id = ?').get(taskId);
        if (!task) return res.status(404).json({ error: 'Task not found' });

        const allowed = ['text', 'status', 'type', 'is_blocker', 'blocks_task_ids', 'project_phase',
            'energy_required', 'due_date', 'contributes_to_project_ids', 'priority_within_project'];
        const updates = [];
        const values = [];
        for (const field of allowed) {
            if (req.body[field] !== undefined) {
                updates.push(`${field} = ?`);
                if (field === 'blocks_task_ids' || field === 'contributes_to_project_ids') {
                    values.push(req.body[field] ? JSON.stringify(req.body[field]) : null);
                } else if (field === 'is_blocker') {
                    values.push(req.body[field] ? 1 : 0);
                } else {
                    values.push(req.body[field]);
                }
            }
        }

        // Auto-set completed_at when marking done
        if (req.body.status === 'done' && task.status !== 'done') {
            updates.push('completed_at = CURRENT_TIMESTAMP');
        } else if (req.body.status && req.body.status !== 'done' && task.status === 'done') {
            updates.push('completed_at = NULL');
        }

        if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
        values.push(taskId);
        db.prepare(`UPDATE project_tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values);

        // Rederive for this project + any cross-project contributions
        rederiveProject(task.project_id);
        if (task.contributes_to_project_ids) {
            try {
                const others = JSON.parse(task.contributes_to_project_ids);
                if (Array.isArray(others)) others.forEach(id => rederiveProject(id));
            } catch (e) { /* */ }
        }

        res.json(db.prepare('SELECT * FROM project_tasks WHERE id = ?').get(taskId));
    } catch (error) {
        console.error('Error updating task:', error);
        res.status(500).json({ error: 'Failed to update task' });
    }
});

/**
 * DELETE /api/project-tasks/task/:taskId
 */
router.delete('/task/:taskId', (req, res) => {
    try {
        const task = db.prepare('SELECT project_id FROM project_tasks WHERE id = ?').get(req.params.taskId);
        if (!task) return res.status(404).json({ error: 'Task not found' });
        db.prepare('DELETE FROM project_tasks WHERE id = ?').run(req.params.taskId);
        rederiveProject(task.project_id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete task' });
    }
});

// ── MILESTONES ────────────────────────────────────────────────────────────────

/**
 * GET /api/project-tasks/:projectId/milestones
 */
router.get('/:projectId/milestones', (req, res) => {
    try {
        const milestones = db.prepare(`
            SELECT * FROM project_milestones WHERE project_id = ?
            ORDER BY phase ASC, target_date ASC NULLS LAST
        `).all(req.params.projectId);
        res.json(milestones);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch milestones' });
    }
});

/**
 * POST /api/project-tasks/:projectId/milestones
 */
router.post('/:projectId/milestones', (req, res) => {
    try {
        const { projectId } = req.params;
        const { name, weight, target_date, phase } = req.body;
        if (!name || weight == null) return res.status(400).json({ error: 'name and weight required' });

        const result = db.prepare(`
            INSERT INTO project_milestones (project_id, name, weight, target_date, phase)
            VALUES (?, ?, ?, ?, ?)
        `).run(projectId, name, weight, target_date || null, phase || null);

        deriveProgress(Number(projectId));
        derivePhase(Number(projectId));
        res.json(db.prepare('SELECT * FROM project_milestones WHERE id = ?').get(result.lastInsertRowid));
    } catch (error) {
        console.error('Error adding milestone:', error);
        res.status(500).json({ error: 'Failed to add milestone' });
    }
});

/**
 * PATCH /api/project-tasks/milestone/:milestoneId
 */
router.patch('/milestone/:milestoneId', (req, res) => {
    try {
        const ms = db.prepare('SELECT * FROM project_milestones WHERE id = ?').get(req.params.milestoneId);
        if (!ms) return res.status(404).json({ error: 'Milestone not found' });

        const allowed = ['name', 'weight', 'status', 'target_date', 'phase'];
        const updates = [];
        const values = [];
        for (const field of allowed) {
            if (req.body[field] !== undefined) {
                updates.push(`${field} = ?`);
                values.push(req.body[field]);
            }
        }
        // Auto-set completed_at
        if (req.body.status === 'complete' && ms.status !== 'complete') {
            updates.push('completed_at = CURRENT_TIMESTAMP');
        } else if (req.body.status && req.body.status !== 'complete' && ms.status === 'complete') {
            updates.push('completed_at = NULL');
        }

        if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
        values.push(req.params.milestoneId);
        db.prepare(`UPDATE project_milestones SET ${updates.join(', ')} WHERE id = ?`).run(...values);

        // Rederive progress + phase + health
        rederiveProject(ms.project_id);

        res.json(db.prepare('SELECT * FROM project_milestones WHERE id = ?').get(req.params.milestoneId));
    } catch (error) {
        console.error('Error updating milestone:', error);
        res.status(500).json({ error: 'Failed to update milestone' });
    }
});

/**
 * DELETE /api/project-tasks/milestone/:milestoneId
 */
router.delete('/milestone/:milestoneId', (req, res) => {
    try {
        const ms = db.prepare('SELECT project_id FROM project_milestones WHERE id = ?').get(req.params.milestoneId);
        if (!ms) return res.status(404).json({ error: 'Milestone not found' });
        db.prepare('DELETE FROM project_milestones WHERE id = ?').run(req.params.milestoneId);
        rederiveProject(ms.project_id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete milestone' });
    }
});

// ── DEPENDENCIES ──────────────────────────────────────────────────────────────

/**
 * GET /api/project-tasks/dependencies/all
 */
router.get('/dependencies/all', (req, res) => {
    try {
        const deps = db.prepare(`
            SELECT d.*,
                up.name as upstream_name, up.health_status as upstream_health,
                down.name as downstream_name
            FROM project_dependencies d
            JOIN projects up ON up.id = d.upstream_project_id
            JOIN projects down ON down.id = d.downstream_project_id
            ORDER BY d.created_at DESC
        `).all();
        res.json(deps);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch dependencies' });
    }
});

/**
 * POST /api/project-tasks/dependencies
 */
router.post('/dependencies', (req, res) => {
    try {
        const { upstream_project_id, downstream_project_id, dependency_description, is_hard_block } = req.body;
        if (!upstream_project_id || !downstream_project_id) {
            return res.status(400).json({ error: 'upstream and downstream project IDs required' });
        }
        const result = db.prepare(`
            INSERT INTO project_dependencies (upstream_project_id, downstream_project_id, dependency_description, is_hard_block)
            VALUES (?, ?, ?, ?)
        `).run(upstream_project_id, downstream_project_id, dependency_description || null, is_hard_block ? 1 : 0);

        // Rederive health for downstream project
        rederiveProject(downstream_project_id);

        res.json(db.prepare('SELECT * FROM project_dependencies WHERE id = ?').get(result.lastInsertRowid));
    } catch (error) {
        res.status(500).json({ error: 'Failed to add dependency' });
    }
});

/**
 * DELETE /api/project-tasks/dependencies/:id
 */
router.delete('/dependencies/:id', (req, res) => {
    try {
        const dep = db.prepare('SELECT downstream_project_id FROM project_dependencies WHERE id = ?').get(req.params.id);
        if (!dep) return res.status(404).json({ error: 'Dependency not found' });
        db.prepare('DELETE FROM project_dependencies WHERE id = ?').run(req.params.id);
        rederiveProject(dep.downstream_project_id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete dependency' });
    }
});

module.exports = router;
