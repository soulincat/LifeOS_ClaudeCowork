const express = require('express');
const router = express.Router();
const db = require('../db/database');

const SECTIONS = ['tax_residency', 'tax_residency_history', 'companies', 'reporting_periods', 'health_insurance'];
const OPEN_SECTIONS = [...SECTIONS, 'integrations']; // sections accessible via GET/PUT without strict list

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
 */
router.get('/:section', (req, res) => {
    try {
        const { section } = req.params;
        if (!OPEN_SECTIONS.includes(section)) {
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
 * For 'integrations': body is the payload object directly (not wrapped in { payload: ... })
 */
router.put('/:section', (req, res) => {
    try {
        const { section } = req.params;
        if (!OPEN_SECTIONS.includes(section)) {
            return res.status(400).json({ error: 'Invalid section' });
        }
        // integrations section: body IS the payload
        const payload = section === 'integrations'
            ? req.body
            : (req.body && req.body.payload !== undefined ? req.body.payload : null);
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
 * POST /api/setup/apply-integrations
 * Apply stored integration keys to the running process.env (Stripe, Wise).
 */
router.post('/apply-integrations', (req, res) => {
    try {
        const row = db.prepare("SELECT payload FROM setup_sections WHERE section_key = 'integrations'").get();
        if (!row) return res.json({ applied: [] });
        const p = JSON.parse(row.payload || '{}');
        const applied = [];
        if (p.stripe_key) { process.env.STRIPE_SECRET_KEY = p.stripe_key; applied.push('stripe'); }
        if (p.wise_token) { process.env.WISE_API_TOKEN = p.wise_token; applied.push('wise_token'); }
        if (p.wise_profile_id) { process.env.WISE_PROFILE_ID = p.wise_profile_id; applied.push('wise_profile'); }
        res.json({ success: true, applied });
    } catch (error) {
        res.status(500).json({ error: error.message });
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

/**
 * POST /api/setup/test-pa
 * Test a Claude API key by making a minimal call.
 */
router.post('/test-pa', async (req, res) => {
    try {
        const { api_key } = req.body;
        if (!api_key) return res.status(400).json({ valid: false, error: 'No API key provided' });
        const { testApiKey } = require('../claude-client');
        const result = await testApiKey(api_key);
        res.json(result);
    } catch (e) {
        res.status(500).json({ valid: false, error: e.message });
    }
});

/**
 * GET /api/setup/integrations-status
 * Get status of all loaded connectors.
 */
router.get('/integrations-status', async (req, res) => {
    try {
        const registry = require('../../integrations/registry');
        const status = await registry.statusAll();
        res.json(status);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
