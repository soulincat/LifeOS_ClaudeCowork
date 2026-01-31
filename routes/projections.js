const express = require('express');
const router = express.Router();
const db = require('../db/database');

/**
 * GET /api/projections
 * Get active projection plan with streams and month-by-month values (for Projections tab)
 */
router.get('/', (req, res) => {
    try {
        const plan = db.prepare(`
            SELECT * FROM projection_plans WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1
        `).get();
        if (!plan) {
            return res.json({ plan: null, streams: [], monthValues: [] });
        }
        const starting_position = typeof plan.starting_position === 'string'
            ? (() => { try { return JSON.parse(plan.starting_position); } catch (_) { return null; } })()
            : plan.starting_position;
        const streams = db.prepare(`
            SELECT * FROM projection_streams WHERE plan_id = ? ORDER BY sort_order, id
        `).all(plan.id);
        const streamIds = streams.map(s => s.id);
        let monthValues = [];
        if (streamIds.length > 0) {
            const placeholders = streamIds.map(() => '?').join(',');
            monthValues = db.prepare(`
                SELECT * FROM projection_month_values WHERE stream_id IN (${placeholders}) ORDER BY stream_id, month
            `).all(...streamIds);
        }
        const synergy_notes = plan.synergy_notes;
        res.json({
            plan: { ...plan, starting_position, synergy_notes },
            streams,
            monthValues
        });
    } catch (error) {
        console.error('Error fetching projections:', error);
        res.status(500).json({ error: 'Failed to fetch projections' });
    }
});

/**
 * POST /api/projections
 * Save projection plan, streams, and month values (keep data intact and structural)
 * Body: { plan: { name, months, starting_position, synergy_notes }, streams: [ { id?, project_id?, stream_type, display_name, sort_order, unit } ], monthValues: [ { stream_id, month, case_type, metric_key, value, notes } ] }
 */
router.post('/', (req, res) => {
    try {
        const { plan: planInput, streams: streamsInput, monthValues: monthValuesInput } = req.body || {};
        if (!planInput || !planInput.name) {
            return res.status(400).json({ error: 'plan.name is required' });
        }

        db.exec('BEGIN');
        try {
            let planId;
            const existing = db.prepare('SELECT id FROM projection_plans WHERE is_active = 1 LIMIT 1').get();
            if (existing) {
                planId = existing.id;
                db.prepare(`
                    UPDATE projection_plans SET name = ?, months = ?, starting_position = ?, synergy_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
                `).run(
                    planInput.name,
                    planInput.months != null ? planInput.months : 12,
                    typeof planInput.starting_position === 'object' ? JSON.stringify(planInput.starting_position) : planInput.starting_position,
                    planInput.synergy_notes || null,
                    planId
                );
            } else {
                const insertPlan = db.prepare(`
                    INSERT INTO projection_plans (name, months, starting_position, synergy_notes, is_active) VALUES (?, ?, ?, ?, 1)
                `);
                insertPlan.run(
                    planInput.name,
                    planInput.months != null ? planInput.months : 12,
                    typeof planInput.starting_position === 'object' ? JSON.stringify(planInput.starting_position) : planInput.starting_position || null,
                    planInput.synergy_notes || null
                );
                planId = db.prepare('SELECT last_insert_rowid() as id').get().id;
            }

            const streamIdMap = {};
            const existingStreams = db.prepare('SELECT * FROM projection_streams WHERE plan_id = ?').all(planId);
            const keptStreamIds = new Set();

            for (const s of (streamsInput || [])) {
                const existing = existingStreams.find(e => e.stream_type === (s.stream_type || 'total') && e.display_name === (s.display_name || '—'));
                let streamId;
                if (s.id && existingStreams.some(e => e.id === s.id)) {
                    streamId = s.id;
                    db.prepare(`
                        UPDATE projection_streams SET project_id = ?, stream_type = ?, display_name = ?, sort_order = ?, unit = ? WHERE id = ?
                    `).run(s.project_id ?? null, s.stream_type || 'total', s.display_name || '—', s.sort_order ?? 0, s.unit || 'currency', streamId);
                } else if (existing) {
                    streamId = existing.id;
                    db.prepare(`
                        UPDATE projection_streams SET project_id = ?, stream_type = ?, display_name = ?, sort_order = ?, unit = ? WHERE id = ?
                    `).run(s.project_id ?? null, s.stream_type || 'total', s.display_name || '—', s.sort_order ?? 0, s.unit || 'currency', streamId);
                } else {
                    const insertStream = db.prepare(`
                        INSERT INTO projection_streams (plan_id, project_id, stream_type, display_name, sort_order, unit) VALUES (?, ?, ?, ?, ?, ?)
                    `);
                    insertStream.run(planId, s.project_id ?? null, s.stream_type || 'total', s.display_name || '—', s.sort_order ?? 0, s.unit || 'currency');
                    streamId = db.prepare('SELECT last_insert_rowid() as id').get().id;
                }
                keptStreamIds.add(streamId);
                streamIdMap[s.key != null ? s.key : s.display_name] = streamId;
            }

            for (const es of existingStreams) {
                if (!keptStreamIds.has(es.id)) {
                    db.prepare('DELETE FROM projection_month_values WHERE stream_id = ?').run(es.id);
                    db.prepare('DELETE FROM projection_streams WHERE id = ?').run(es.id);
                }
            }

            if (Array.isArray(monthValuesInput) && monthValuesInput.length > 0) {
                for (const row of monthValuesInput) {
                    const stream_id = row.stream_id != null ? row.stream_id : streamIdMap[row.stream_key];
                    if (stream_id == null) continue;
                    db.prepare(`
                        INSERT INTO projection_month_values (stream_id, month, case_type, metric_key, value, notes)
                        VALUES (?, ?, ?, ?, ?, ?)
                        ON CONFLICT(stream_id, month, case_type, metric_key) DO UPDATE SET value = excluded.value, notes = excluded.notes
                    `).run(
                        stream_id,
                        row.month,
                        row.case_type || 'realistic',
                        row.metric_key || 'primary',
                        row.value,
                        row.notes || null
                    );
                }
            }

            db.exec('COMMIT');
            res.json({ success: true, planId });
        } catch (e) {
            db.exec('ROLLBACK');
            throw e;
        }
    } catch (error) {
        console.error('Error saving projections:', error);
        res.status(500).json({ error: 'Failed to save projections: ' + (error.message || 'Unknown error') });
    }
});

/**
 * GET /api/projections/actuals?period=YYYY-MM
 * Get monthly actuals for a period (real data at end of month, for comparison)
 */
router.get('/actuals', (req, res) => {
    try {
        const period = req.query.period;
        if (!period) {
            const rows = db.prepare(`
                SELECT * FROM monthly_actuals ORDER BY period DESC, stream_type, metric_key LIMIT 200
            `).all();
            return res.json(rows);
        }
        const rows = db.prepare(`
            SELECT * FROM monthly_actuals WHERE period = ? ORDER BY stream_type, project_id, metric_key
        `).all(period);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching monthly actuals:', error);
        res.status(500).json({ error: 'Failed to fetch actuals' });
    }
});

/**
 * POST /api/projections/actuals
 * Save/upsert monthly actuals for a period (real data at end of month)
 * Body: { period: 'YYYY-MM', actuals: [ { project_id?, stream_type, metric_key, value, notes? } ] }
 */
router.post('/actuals', (req, res) => {
    try {
        const { period, actuals } = req.body || {};
        if (!period || !/^\d{4}-\d{2}$/.test(period)) {
            return res.status(400).json({ error: 'period must be YYYY-MM' });
        }
        if (!Array.isArray(actuals)) {
            return res.status(400).json({ error: 'actuals array is required' });
        }

        const getExisting = db.prepare(`
            SELECT id FROM monthly_actuals WHERE period = ? AND (project_id IS NULL AND ? IS NULL OR project_id = ?) AND stream_type = ? AND metric_key = ?
        `);
        const updateActual = db.prepare(`
            UPDATE monthly_actuals SET value = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `);
        const insertActual = db.prepare(`
            INSERT INTO monthly_actuals (period, project_id, stream_type, metric_key, value, notes) VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const a of actuals) {
            const projectId = a.project_id ?? null;
            const row = getExisting.get(period, projectId, projectId, a.stream_type || 'total', a.metric_key || 'primary');
            if (row) {
                updateActual.run(a.value, a.notes || null, row.id);
            } else {
                insertActual.run(period, projectId, a.stream_type || 'total', a.metric_key || 'primary', a.value, a.notes || null);
            }
        }
        res.json({ success: true, period });
    } catch (error) {
        console.error('Error saving monthly actuals:', error);
        res.status(500).json({ error: 'Failed to save actuals: ' + (error.message || 'Unknown error') });
    }
});

/**
 * GET /api/projections/compare?period=YYYY-MM
 * Get projection vs actual for a period (for comparison view later)
 */
router.get('/compare', (req, res) => {
    try {
        const period = req.query.period;
        if (!period) {
            return res.status(400).json({ error: 'period=YYYY-MM required' });
        }
        const [year, month] = period.split('-').map(Number);
        const monthNum = (year - 2000) * 12 + month;

        const plan = db.prepare('SELECT * FROM projection_plans WHERE is_active = 1 LIMIT 1').get();
        if (!plan) {
            return res.json({ period, projected: [], actuals: [], comparison: [] });
        }
        const streams = db.prepare('SELECT * FROM projection_streams WHERE plan_id = ? ORDER BY sort_order').all(plan.id);
        const actuals = db.prepare('SELECT * FROM monthly_actuals WHERE period = ?').all(period);

        const projected = [];
        for (const s of streams) {
            const row = db.prepare(`
                SELECT * FROM projection_month_values WHERE stream_id = ? AND month = ? AND case_type = 'realistic'
            `).get(s.id, monthNum);
            if (row) projected.push({ stream: s, value: row.value, metric_key: row.metric_key });
        }

        const comparison = [];
        for (const a of actuals) {
            const proj = projected.find(p => p.stream.stream_type === a.stream_type && p.metric_key === a.metric_key && (p.stream.project_id == null && a.project_id == null || p.stream.project_id === a.project_id));
            comparison.push({
                stream_type: a.stream_type,
                project_id: a.project_id,
                metric_key: a.metric_key,
                projected: proj ? proj.value : null,
                actual: a.value,
                variance: proj != null ? (a.value - proj.value) : null
            });
        }
        res.json({ period, projected, actuals, comparison });
    } catch (error) {
        console.error('Error fetching comparison:', error);
        res.status(500).json({ error: 'Failed to fetch comparison' });
    }
});

module.exports = router;
