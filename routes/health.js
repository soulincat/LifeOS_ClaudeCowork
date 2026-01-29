const express = require('express');
const router = express.Router();
const db = require('../db/database');
const whoop = require('../integrations/whoop');

/**
 * GET /api/health
 * Get latest health metrics
 */
router.get('/', (req, res) => {
    try {
        const metrics = whoop.getLatestMetrics();
        
        if (!metrics) {
            // Return default/placeholder data if no metrics found
            return res.json({
                recovery: 82,
                sleep_hours: 7,
                sleep_minutes: 24,
                hrv: 64,
                cycle_phase: 'Luteal Phase (low energy)',
                monthly_phase: 'Late-stage recovery'
            });
        }

        res.json({
            recovery: metrics.recovery,
            sleep_hours: metrics.sleep_hours,
            sleep_minutes: metrics.sleep_minutes,
            hrv: metrics.hrv,
            cycle_phase: metrics.cycle_phase || 'Luteal Phase (low energy)',
            monthly_phase: metrics.monthly_phase || 'Late-stage recovery',
            date: metrics.date
        });
    } catch (error) {
        console.error('Error fetching health metrics:', error);
        res.status(500).json({ error: 'Failed to fetch health metrics' });
    }
});

/**
 * GET /api/health/history
 * Get health metrics history for charts
 */
router.get('/history', (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const stmt = db.prepare(`
            SELECT date, recovery, sleep_hours, sleep_minutes, hrv
            FROM health_metrics
            WHERE date >= date('now', '-' || ? || ' days')
            ORDER BY date DESC
        `);
        
        const history = stmt.all(days);
        res.json(history);
    } catch (error) {
        console.error('Error fetching health history:', error);
        res.status(500).json({ error: 'Failed to fetch health history' });
    }
});

/**
 * POST /api/health
 * Update health metrics (manual entry)
 */
router.post('/', (req, res) => {
    try {
        const { date, recovery, sleep_hours, sleep_minutes, hrv, cycle_phase, monthly_phase } = req.body;
        const targetDate = date || new Date().toISOString().split('T')[0];

        const stmt = db.prepare(`
            INSERT INTO health_metrics (date, recovery, sleep_hours, sleep_minutes, hrv, cycle_phase, monthly_phase)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(date) DO UPDATE SET
                recovery = excluded.recovery,
                sleep_hours = excluded.sleep_hours,
                sleep_minutes = excluded.sleep_minutes,
                hrv = excluded.hrv,
                cycle_phase = excluded.cycle_phase,
                monthly_phase = excluded.monthly_phase
        `);

        stmt.run(targetDate, recovery, sleep_hours, sleep_minutes, hrv, cycle_phase, monthly_phase);
        res.json({ success: true, date: targetDate });
    } catch (error) {
        console.error('Error updating health metrics:', error);
        res.status(500).json({ error: 'Failed to update health metrics' });
    }
});

module.exports = router;
