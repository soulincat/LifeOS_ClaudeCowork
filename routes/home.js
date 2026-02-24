/**
 * Home Panel Routes
 * Aggregated endpoints for the home dashboard panel.
 * Focus card, weekly milestones, VIP senders, pulse strip data.
 */
const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { scoreFocusCard } = require('../db/derived-state');

/**
 * GET /api/home/focus
 * Returns the Focus Card — the single most important task right now.
 * Uses Whoop recovery if available, falls back to 70.
 */
router.get('/focus', (req, res) => {
    try {
        let recovery = 70;
        try {
            const health = db.prepare('SELECT recovery FROM health_metrics ORDER BY date DESC LIMIT 1').get();
            if (health && health.recovery) recovery = health.recovery;
        } catch (e) { /* */ }

        const focus = scoreFocusCard(recovery);
        if (!focus) return res.json({ empty: true, text: 'No open tasks', description: '', meta: '' });

        // Generate "why this matters" via a lightweight description
        // (The spec says Claude API call, but we'll provide context for the frontend to call if needed)
        res.json({
            text: focus.text,
            description: focus.description || '',
            meta: focus.meta || '',
            project_name: focus.project_name,
            project_priority: focus.project_priority,
            score: focus.score,
            override: focus.override || null,
            event: focus.event || null,
            task_id: focus.task ? focus.task.id : null,
            task: focus.task || null
        });
    } catch (error) {
        console.error('Focus card error:', error);
        res.status(500).json({ error: 'Failed to compute focus card' });
    }
});

/**
 * GET /api/home/pulse
 * Pulse strip data: recovery, unread count, meetings today, top blocker.
 */
router.get('/pulse', (req, res) => {
    try {
        const today = new Date().toISOString().slice(0, 10);
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

        // Recovery
        let recovery = null;
        try {
            const h = db.prepare('SELECT recovery FROM health_metrics ORDER BY date DESC LIMIT 1').get();
            if (h) recovery = h.recovery;
        } catch (e) { /* */ }

        // Unread count — try inbox_items first, fall back to messages table
        let unread = 0;
        try {
            const r = db.prepare('SELECT COUNT(*) as c FROM inbox_items WHERE is_unread = 1 AND is_dismissed = 0').get();
            unread = r.c;
        } catch (e) {
            try {
                const r = db.prepare("SELECT COUNT(*) as c FROM messages WHERE status = 'pending'").get();
                unread = r.c;
            } catch (e2) { /* */ }
        }

        // Meetings today
        let meetings = 0;
        try {
            const r = db.prepare(`
                SELECT COUNT(*) as c FROM upcoming_items
                WHERE type IN ('meeting', 'call', 'event')
                AND due_date >= ? AND due_date < ?
            `).get(today, tomorrow);
            meetings = r.c;
        } catch (e) { /* */ }

        // Top blocker: any open blocker task across active projects
        let blocker = null;
        try {
            const b = db.prepare(`
                SELECT t.text, p.name as project_name FROM project_tasks t
                JOIN projects p ON p.id = t.project_id
                WHERE t.is_blocker = 1 AND t.status IN ('open', 'blocked') AND p.status = 'active'
                ORDER BY p.priority_rank ASC LIMIT 1
            `).get();
            if (b) blocker = `${b.project_name}: ${b.text}`;
        } catch (e) { /* */ }

        res.json({ recovery, unread, meetings, blocker });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch pulse data' });
    }
});

/**
 * GET /api/home/weekly-milestones
 * Milestones within next 7 days + today's calendar events, chronologically.
 */
router.get('/weekly-milestones', (req, res) => {
    try {
        const today = new Date().toISOString().slice(0, 10);
        const sevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

        const milestones = db.prepare(`
            SELECT m.*, p.name as project_name, p.priority_rank
            FROM project_milestones m
            JOIN projects p ON p.id = m.project_id
            WHERE m.target_date >= ? AND m.target_date <= ?
            ORDER BY m.target_date ASC
        `).all(today, sevenDays);

        const todayEvents = db.prepare(`
            SELECT * FROM upcoming_items
            WHERE due_date >= ? AND due_date < ?
            ORDER BY due_date ASC
        `).all(today, new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10) + 'T23:59:59');

        // Merge and sort chronologically
        const combined = [
            ...milestones.map(m => ({
                type: 'milestone', name: m.name, project_name: m.project_name,
                date: m.target_date, status: m.status, id: m.id,
                completed_at: m.completed_at, priority_rank: m.priority_rank
            })),
            ...todayEvents.map(e => ({
                type: e.type || 'event', name: e.title, project_name: null,
                date: e.due_date, status: 'active', id: e.id,
                description: e.description
            }))
        ].sort((a, b) => new Date(a.date) - new Date(b.date));

        res.json(combined);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch weekly milestones' });
    }
});

/**
 * GET /api/home/projects-expanded
 * Project cards with current phase tasks, health, progress, next action.
 * This is the primary project data endpoint for the home panel.
 */
router.get('/projects-expanded', (req, res) => {
    try {
        const projects = db.prepare(`
            SELECT * FROM projects WHERE status = 'active'
            ORDER BY priority_rank ASC, name ASC
        `).all();

        const result = projects.map(p => {
            // Current phase tasks (cap at 7 + count of more)
            const tasks = db.prepare(`
                SELECT * FROM project_tasks
                WHERE project_id = ? AND status != 'cancelled'
                AND (project_phase = ? OR project_phase IS NULL)
                ORDER BY
                    CASE WHEN status = 'done' THEN 1 ELSE 0 END ASC,
                    priority_within_project ASC,
                    created_at ASC
                LIMIT 8
            `).all(p.id, p.current_phase);

            const totalTasks = db.prepare(`
                SELECT COUNT(*) as c FROM project_tasks
                WHERE project_id = ? AND status != 'cancelled'
                AND (project_phase = ? OR project_phase IS NULL)
            `).get(p.id, p.current_phase);

            // Next phase horizon milestone
            let horizonMilestone = null;
            if (p.phase_list) {
                try {
                    const phases = JSON.parse(p.phase_list);
                    const currentIdx = phases.indexOf(p.current_phase);
                    if (currentIdx >= 0 && currentIdx < phases.length - 1) {
                        const nextPhase = phases[currentIdx + 1];
                        horizonMilestone = db.prepare(`
                            SELECT name, phase FROM project_milestones
                            WHERE project_id = ? AND phase = ? AND status = 'pending'
                            ORDER BY target_date ASC NULLS LAST LIMIT 1
                        `).get(p.id, nextPhase);
                    }
                } catch (e) { /* */ }
            }

            // Active blockers
            const blockers = db.prepare(`
                SELECT text FROM project_tasks
                WHERE project_id = ? AND is_blocker = 1 AND status IN ('open', 'blocked')
            `).all(p.id);

            // Dependency warnings
            const depWarnings = db.prepare(`
                SELECT d.dependency_description, up.name as upstream_name, up.health_status
                FROM project_dependencies d
                JOIN projects up ON up.id = d.upstream_project_id
                WHERE d.downstream_project_id = ? AND d.is_hard_block = 1 AND up.health_status = 'red'
            `).all(p.id);

            return {
                ...p,
                phase_list: p.phase_list ? JSON.parse(p.phase_list) : [],
                metrics: typeof p.metrics === 'string' ? (() => { try { return JSON.parse(p.metrics); } catch (e) { return null; } })() : p.metrics,
                tasks: tasks.slice(0, 7),
                total_task_count: totalTasks.c,
                more_tasks: Math.max(0, totalTasks.c - 7),
                horizon_milestone: horizonMilestone,
                blockers: blockers.map(b => b.text),
                dependency_warnings: depWarnings
            };
        });

        res.json(result);
    } catch (error) {
        console.error('Error fetching expanded projects:', error);
        res.status(500).json({ error: 'Failed to fetch projects' });
    }
});

// ── VIP Senders ───────────────────────────────────────────────────────────────

/**
 * GET /api/home/vip-senders
 */
router.get('/vip-senders', (req, res) => {
    try {
        res.json(db.prepare('SELECT * FROM vip_senders ORDER BY name ASC').all());
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch VIP senders' });
    }
});

/**
 * POST /api/home/vip-senders
 */
router.post('/vip-senders', (req, res) => {
    try {
        const { sender_id, name, relationship } = req.body;
        if (!sender_id || !name) return res.status(400).json({ error: 'sender_id and name required' });
        const result = db.prepare(`
            INSERT INTO vip_senders (sender_id, name, relationship) VALUES (?, ?, ?)
            ON CONFLICT(sender_id) DO UPDATE SET name = excluded.name, relationship = excluded.relationship
        `).run(sender_id, name, relationship || null);
        res.json({ success: true, id: result.lastInsertRowid });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add VIP sender' });
    }
});

/**
 * DELETE /api/home/vip-senders/:id
 */
router.delete('/vip-senders/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM vip_senders WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete VIP sender' });
    }
});

module.exports = router;
