const express = require('express');
const router = express.Router();
const db = require('../db/database');

const SECTIONS = ['tax_residency', 'tax_residency_history', 'companies', 'reporting_periods', 'health_insurance'];

function parsePayload(row) {
    if (!row || row.payload == null) return null;
    try {
        return typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
    } catch (_) {
        return null;
    }
}

/**
 * GET /api/setup
 * Get all setup sections (tax residency, companies, reporting periods)
 */
router.get('/', (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT section_key, payload, updated_at FROM setup_sections WHERE section_key IN (${SECTIONS.map(() => '?').join(',')})
        `).all(...SECTIONS);
        const out = {};
        SECTIONS.forEach(k => { out[k] = null; });
        rows.forEach(r => {
            out[r.section_key] = parsePayload(r);
        });
        res.json(out);
    } catch (error) {
        console.error('Error fetching setup:', error);
        res.status(500).json({ error: 'Failed to fetch setup' });
    }
});

/**
 * GET /api/setup/:section
 * Get one section (tax_residency | tax_residency_history | companies | reporting_periods)
 */
router.get('/:section', (req, res) => {
    try {
        const { section } = req.params;
        if (!SECTIONS.includes(section)) {
            return res.status(400).json({ error: 'Invalid section' });
        }
        const row = db.prepare('SELECT payload, updated_at FROM setup_sections WHERE section_key = ?').get(section);
        const payload = row ? parsePayload(row) : null;
        res.json({ section, payload, updated_at: row ? row.updated_at : null });
    } catch (error) {
        console.error('Error fetching setup section:', error);
        res.status(500).json({ error: 'Failed to fetch setup' });
    }
});

/**
 * PUT /api/setup/:section
 * Save one section. Body: { payload: any }
 */
router.put('/:section', (req, res) => {
    try {
        const { section } = req.params;
        if (!SECTIONS.includes(section)) {
            return res.status(400).json({ error: 'Invalid section' });
        }
        const payload = req.body && req.body.payload !== undefined ? req.body.payload : null;
        const json = payload !== null ? JSON.stringify(payload) : null;
        db.prepare(`
            INSERT INTO setup_sections (section_key, payload, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(section_key) DO UPDATE SET payload = excluded.payload, updated_at = CURRENT_TIMESTAMP
        `).run(section, json);
        res.json({ success: true, section });
    } catch (error) {
        console.error('Error saving setup:', error);
        res.status(500).json({ error: 'Failed to save setup' });
    }
});

/**
 * POST /api/setup
 * Save multiple sections. Body: { tax_residency?: {}, tax_residency_history?: [], companies?: [], reporting_periods?: [] }
 */
router.post('/', (req, res) => {
    try {
        const body = req.body || {};
        for (const key of SECTIONS) {
            if (body[key] !== undefined) {
                const json = JSON.stringify(body[key]);
                db.prepare(`
                    INSERT INTO setup_sections (section_key, payload, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(section_key) DO UPDATE SET payload = excluded.payload, updated_at = CURRENT_TIMESTAMP
                `).run(key, json);
            }
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Error saving setup:', error);
        res.status(500).json({ error: 'Failed to save setup' });
    }
});

module.exports = router;
