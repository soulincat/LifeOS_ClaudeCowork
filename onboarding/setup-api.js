/**
 * Onboarding API Routes
 * Handles the first-run setup wizard steps.
 */

const express = require('express');
const router = express.Router();
const db = require('../core/db/database');
const config = require('../core/config');

/**
 * GET /api/onboarding/status
 * Check if onboarding is complete.
 */
router.get('/status', (req, res) => {
    res.json({ complete: config.isOnboardingComplete() });
});

/**
 * POST /api/onboarding/user
 * Step 1: Save user profile (name, timezone, currency).
 */
router.post('/user', (req, res) => {
    try {
        const { name, timezone, locale, currency, github_username } = req.body;
        const current = config.getUser();
        const updated = {
            ...current,
            name: name || current.name,
            timezone: timezone || current.timezone,
            locale: locale || current.locale,
            currency: currency || current.currency,
            github_username: github_username || current.github_username,
        };
        config.saveUser(updated);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * POST /api/onboarding/priorities
 * Step 2: Save life areas, VIP people, urgency keywords, PA style.
 */
router.post('/priorities', (req, res) => {
    try {
        const { life_areas, vip_people, urgency_keywords, pa_style } = req.body;

        // Save full priorities blob to setup_sections
        db.prepare(`
            INSERT INTO setup_sections (section_key, payload, updated_at) VALUES ('user_priorities', ?, CURRENT_TIMESTAMP)
            ON CONFLICT(section_key) DO UPDATE SET payload = excluded.payload, updated_at = CURRENT_TIMESTAMP
        `).run(JSON.stringify({ life_areas, vip_people, urgency_keywords, pa_style }));

        // Create VIP contacts for each named person
        if (Array.isArray(vip_people)) {
            const upsert = db.prepare(`
                INSERT INTO contacts (name, label, relationship, type, created_at)
                VALUES (?, 'vip', ?, 'personal', datetime('now'))
                ON CONFLICT(name, COALESCE(email,''), COALESCE(phone,'')) DO UPDATE
                SET label = 'vip', relationship = excluded.relationship
            `);
            for (const person of vip_people) {
                if (person.name && person.name.trim()) {
                    try {
                        // Simple insert — contacts table may not have a unique constraint on name alone,
                        // so just insert; duplicates are fine (user can merge later)
                        db.prepare(`INSERT INTO contacts (name, label, relationship, type, created_at) VALUES (?, 'vip', ?, 'personal', datetime('now'))`)
                            .run(person.name.trim(), person.relationship || 'other');
                    } catch (e) {
                        // If duplicate, update existing
                        db.prepare(`UPDATE contacts SET label = 'vip', relationship = ? WHERE name = ? AND label != 'blocked'`)
                            .run(person.relationship || 'other', person.name.trim());
                    }
                }
            }
        }

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * POST /api/onboarding/integrations
 * Step 3: Enable/disable integrations.
 */
router.post('/integrations', (req, res) => {
    try {
        const integrations = req.body;
        config.saveIntegrations(integrations);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * POST /api/onboarding/project
 * Step 3: Create first project.
 */
router.post('/project', (req, res) => {
    try {
        const { name, business_model, priority_rank, display_kpi_key, display_kpi_label, description } = req.body;
        if (!name) return res.status(400).json({ error: 'Project name is required' });

        const result = db.prepare(`
            INSERT INTO projects (name, business_model, priority_rank, display_kpi_key, display_kpi_label, description, status, last_updated)
            VALUES (?, ?, ?, ?, ?, ?, 'active', datetime('now'))
        `).run(
            name,
            business_model || 'saas',
            priority_rank || 1,
            display_kpi_key || null,
            display_kpi_label || null,
            description || null
        );

        res.json({ success: true, project_id: result.lastInsertRowid });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * POST /api/onboarding/pa-key
 * Step 4: Save Claude API key (BYOK).
 */
router.post('/pa-key', (req, res) => {
    try {
        const { api_key } = req.body;
        db.prepare(`
            INSERT INTO setup_sections (section_key, payload, updated_at) VALUES ('pa_config', ?, CURRENT_TIMESTAMP)
            ON CONFLICT(section_key) DO UPDATE SET payload = excluded.payload, updated_at = CURRENT_TIMESTAMP
        `).run(JSON.stringify({ anthropic_api_key: api_key || '' }));
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * POST /api/onboarding/telegram-test
 * Send a test message via Telegram bot to verify token + chat ID.
 */
router.post('/telegram-test', async (req, res) => {
    try {
        const { bot_token, chat_id } = req.body;
        if (!bot_token || !chat_id) return res.status(400).json({ error: 'bot_token and chat_id required' });

        const tgRes = await fetch(`https://api.telegram.org/bot${bot_token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id,
                text: 'LifeOS connected! You will receive alerts and briefings here.',
                parse_mode: 'HTML'
            })
        });
        const data = await tgRes.json();
        if (data.ok) {
            res.json({ success: true });
        } else {
            res.json({ success: false, error: data.description || 'Telegram API error' });
        }
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/onboarding/telegram
 * Save Telegram bot config (token + chat ID) to DB.
 */
router.post('/telegram', (req, res) => {
    try {
        const { bot_token, chat_id } = req.body;
        if (!bot_token || !chat_id) return res.status(400).json({ error: 'bot_token and chat_id required' });

        db.prepare(`
            INSERT INTO setup_sections (section_key, payload, updated_at) VALUES ('telegram_config', ?, CURRENT_TIMESTAMP)
            ON CONFLICT(section_key) DO UPDATE SET payload = excluded.payload, updated_at = CURRENT_TIMESTAMP
        `).run(JSON.stringify({ bot_token, chat_id }));

        // Also set env vars for immediate use by telegram bot
        process.env.TELEGRAM_BOT_TOKEN = bot_token;
        process.env.TELEGRAM_CHAT_ID = chat_id;

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * POST /api/onboarding/complete
 * Mark onboarding as done.
 */
router.post('/complete', (req, res) => {
    try {
        config.markOnboardingComplete();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
