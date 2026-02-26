/**
 * Home Panel Routes
 * Aggregated endpoints for the home dashboard panel.
 * Focus card, weekly milestones, VIP senders, pulse strip data.
 */
const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { scoreFocusCard } = require('../db/derived-state');

// ── Weather cache (refreshed every 30 min) ──────────────────────────────────
let _weatherCache = { data: null, ts: 0 };

async function fetchWeather() {
    const now = Date.now();
    if (_weatherCache.data && now - _weatherCache.ts < 30 * 60 * 1000) return _weatherCache.data;
    try {
        const https = require('https');
        const data = await new Promise((resolve, reject) => {
            const req = https.get('https://wttr.in/?format=j1', { timeout: 5000 }, res => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
                });
            });
            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        });
        const cur = data.current_condition?.[0] || {};
        const result = {
            temp_c: parseInt(cur.temp_C, 10),
            desc: (cur.weatherDesc?.[0]?.value || '').toLowerCase(),
            humidity: parseInt(cur.humidity, 10),
            feelslike_c: parseInt(cur.FeelsLikeC, 10),
            wind_kmph: parseInt(cur.windspeedKmph, 10),
        };
        _weatherCache = { data: result, ts: now };
        return result;
    } catch (e) {
        return null;
    }
}

async function buildContextLine(recovery) {
    const weather = await fetchWeather();
    const parts = [];

    // Weather part
    if (weather) {
        parts.push(`${weather.temp_c}°C ${weather.desc}`);
        const d = weather.desc;
        const t = weather.temp_c;
        if (d.includes('rain') || d.includes('drizzle') || d.includes('shower'))
            parts.push('bring an umbrella');
        else if (d.includes('snow') || d.includes('blizzard') || t <= -5)
            parts.push('bundle up');
        else if (t >= 33)
            parts.push('stay hydrated');
        else if (t <= 5)
            parts.push('dress warm');
        else if ((d.includes('sunny') || d.includes('clear')) && t >= 15)
            parts.push('nice day outside');
    }

    // Recovery-based nudge
    if (recovery != null) {
        if (recovery < 33) parts.push('take it easy today');
        else if (recovery < 50) parts.push('pace yourself');
        else if (recovery >= 80) parts.push('high energy — tackle the hard stuff');
    }

    return parts.length ? parts.join(' · ') : null;
}

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
router.get('/pulse', async (req, res) => {
    try {
        const today = new Date().toISOString().slice(0, 10);
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

        // Ensure WHOOP data is fresh before reading
        try {
            const whoop = require('../../integrations/whoop');
            await whoop.ensureFresh(120);
        } catch (e) { /* non-blocking */ }

        // Recovery
        let recovery = null;
        try {
            const h = db.prepare('SELECT recovery FROM health_metrics ORDER BY date DESC LIMIT 1').get();
            if (h) recovery = h.recovery;
        } catch (e) { /* */ }

        // Unread count — conversation-level (distinct senders for WA + raw for email)
        let unread = 0;
        try {
            const email = db.prepare("SELECT COUNT(*) as c FROM messages WHERE status = 'pending' AND source IN ('gmail','outlook')").get();
            const waConvos = db.prepare("SELECT COUNT(DISTINCT sender_address) as c FROM messages WHERE status = 'pending' AND source = 'whatsapp'").get();
            unread = (email?.c || 0) + (waConvos?.c || 0);
        } catch (e) { /* */ }
        try {
            const r = db.prepare('SELECT COUNT(*) as c FROM inbox_items WHERE is_unread = 1 AND is_dismissed = 0').get();
            if (r.c > unread) unread = r.c;
        } catch (e) { /* */ }

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

        // Context line: weather + recovery-based one-liner
        let context_line = null;
        try {
            context_line = await buildContextLine(recovery);
        } catch (e) { /* non-blocking */ }

        res.json({ recovery, unread, meetings, context_line });
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

// ── VIP Senders (redirects to contacts for new system, keeps backward compat) ─

/**
 * GET /api/home/vip-senders — now returns VIP contacts
 */
router.get('/vip-senders', (req, res) => {
    try {
        const vipContacts = db.prepare(
            "SELECT id, name, phone AS sender_id, relationship, created_at FROM contacts WHERE label = 'vip' ORDER BY name ASC"
        ).all();
        res.json(vipContacts);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch VIP senders' });
    }
});

/**
 * POST /api/home/vip-senders — upserts into contacts with label='vip' + backward compat
 */
router.post('/vip-senders', (req, res) => {
    try {
        const { sender_id, name, relationship } = req.body;
        if (!sender_id || !name) return res.status(400).json({ error: 'sender_id and name required' });

        // Upsert into contacts
        const existing = db.prepare(
            'SELECT id FROM contacts WHERE phone = ? OR email = ? OR whatsapp_jid = ?'
        ).get(sender_id, sender_id, sender_id);
        if (existing) {
            db.prepare("UPDATE contacts SET label = 'vip', relationship = COALESCE(?, relationship) WHERE id = ?")
                .run(relationship, existing.id);
        } else {
            db.prepare("INSERT INTO contacts (name, phone, label, relationship) VALUES (?, ?, 'vip', ?)")
                .run(name, sender_id, relationship || null);
        }

        // Backward compat: also write to vip_senders
        try {
            db.prepare(`
                INSERT INTO vip_senders (sender_id, name, relationship) VALUES (?, ?, ?)
                ON CONFLICT(sender_id) DO UPDATE SET name = excluded.name, relationship = excluded.relationship
            `).run(sender_id, name, relationship || null);
        } catch (e) { /* table may not exist in fresh installs */ }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add VIP sender' });
    }
});

/**
 * DELETE /api/home/vip-senders/:id
 */
router.delete('/vip-senders/:id', (req, res) => {
    try {
        // id now refers to contacts.id
        db.prepare("UPDATE contacts SET label = 'regular' WHERE id = ?").run(req.params.id);
        // Also try cleaning vip_senders if entry exists
        try {
            const c = db.prepare('SELECT phone FROM contacts WHERE id = ?').get(req.params.id);
            if (c) db.prepare('DELETE FROM vip_senders WHERE sender_id = ?').run(c.phone);
        } catch (e) { /* */ }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete VIP sender' });
    }
});

// ── Cross-Project Urgent Feed ────────────────────────────────────────────────

/**
 * GET /api/home/urgent-feed — all urgent messages across projects
 */
router.get('/urgent-feed', (req, res) => {
    try {
        const msgs = db.prepare(`
            SELECT m.*, p.name AS project_name, c.name AS contact_name, c.label AS contact_label
            FROM messages m
            LEFT JOIN projects p ON m.project_id = p.id
            LEFT JOIN contacts c ON m.contact_id = c.id
            WHERE m.priority_tier = 'urgent' AND m.status IN ('pending','approved')
            ORDER BY m.urgency_score DESC, m.received_at DESC
            LIMIT 20
        `).all();
        res.json(msgs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch urgent feed' });
    }
});

module.exports = router;
