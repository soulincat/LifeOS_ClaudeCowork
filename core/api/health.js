const express = require('express');
const router = express.Router();
const db = require('../db/database');
const whoop = require('../../integrations/whoop');

/**
 * Compute cycle phase for a date from health_cycle_config.
 * Phases: Period (1–period_length), Follicular (next follicular_days), Ovulatory (next ovulatory_days), PMS (last pms_days), Luteal (rest).
 */
function getCyclePhaseForDate(dateStr, config) {
    if (!config || !dateStr) return null;
    const start = new Date(config.last_period_start + 'T12:00:00Z');
    const date = new Date(dateStr + 'T12:00:00Z');
    const daysSince = Math.round((date - start) / (24 * 60 * 60 * 1000));
    const cycleLen = config.cycle_length_days;
    const dayInCycle = ((daysSince % cycleLen) + cycleLen) % cycleLen + 1;

    const periodEnd = config.period_length_days;
    const follicularEnd = periodEnd + config.follicular_days;
    const ovulatoryEnd = follicularEnd + config.ovulatory_days;
    const pmsStart = cycleLen - config.pms_days + 1;

    if (dayInCycle <= periodEnd) return 'Period';
    if (dayInCycle <= follicularEnd) return 'Follicular - feel OK';
    if (dayInCycle <= ovulatoryEnd) return 'Ovulatory - horny';
    if (dayInCycle >= pmsStart) return 'PMS - depression';
    return 'Luteal - feel OK';
}

function getCycleConfig() {
    return db.prepare('SELECT * FROM health_cycle_config WHERE id = 1').get();
}

const WHOOP_AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const WHOOP_SCOPES = 'read:recovery read:cycles read:sleep read:profile read:body_measurement offline';

/**
 * GET /api/health/whoop/connect
 * Redirect user to WHOOP to authorize; after approval, WHOOP redirects to callback with ?code=...
 */
router.get('/whoop/connect', (req, res) => {
    const clientId = process.env.WHOOP_CLIENT_ID;
    const redirectUri = process.env.WHOOP_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/health/whoop/callback`;
    if (!clientId) {
        return res.status(500).json({ error: 'WHOOP OAuth not configured. Set WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET in .env' });
    }
    const state = Math.random().toString(36).slice(2);
    const url = new URL(WHOOP_AUTH_URL);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', WHOOP_SCOPES);
    url.searchParams.set('state', state);
    res.redirect(302, url.toString());
});

/**
 * GET /api/health/whoop/callback
 * WHOOP redirects here with ?code=...&state=...; exchange code for tokens and store.
 */
router.get('/whoop/callback', async (req, res) => {
    const { code, error } = req.query;
    const clientId = process.env.WHOOP_CLIENT_ID;
    const clientSecret = process.env.WHOOP_CLIENT_SECRET;
    const redirectUri = process.env.WHOOP_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/health/whoop/callback`;

    if (error) {
        return res.redirect(`/?whoop_error=${encodeURIComponent(error)}`);
    }
    if (!code || !clientId || !clientSecret) {
        return res.redirect('/?whoop_error=missing_code_or_config');
    }

    try {
        const body = new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            client_id: clientId,
            client_secret: clientSecret
        });
        const tokenRes = await fetch(WHOOP_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString()
        });
        if (!tokenRes.ok) {
            const errText = await tokenRes.text();
            console.error('WHOOP token exchange failed:', tokenRes.status, errText);
            return res.redirect(`/?whoop_error=token_exchange_failed`);
        }
        const data = await tokenRes.json();
        const expiresAt = Math.floor(Date.now() / 1000) + (data.expires_in || 3600);
        const stmt = db.prepare(`
            INSERT INTO whoop_oauth (id, access_token, refresh_token, expires_at, updated_at)
            VALUES (1, ?, ?, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE SET
                access_token = excluded.access_token,
                refresh_token = COALESCE(excluded.refresh_token, whoop_oauth.refresh_token),
                expires_at = excluded.expires_at,
                updated_at = datetime('now')
        `);
        stmt.run(data.access_token, data.refresh_token || null, expiresAt);
        res.redirect('/?whoop_connected=1');
    } catch (e) {
        console.error('WHOOP callback error:', e);
        res.redirect(`/?whoop_error=${encodeURIComponent(e.message)}`);
    }
});

/**
 * GET /api/health/whoop/status
 * Returns whether WHOOP is connected (OAuth or legacy token).
 */
router.get('/whoop/status', (req, res) => {
    const hasOAuth = whoop.hasStoredTokens();
    const hasLegacyToken = !!process.env.WHOOP_API_TOKEN;
    res.json({
        connected: hasOAuth || hasLegacyToken,
        method: hasOAuth ? 'oauth' : (hasLegacyToken ? 'token' : null),
        needsReconnect: !!whoop._needsReconnect
    });
});

/**
 * POST /api/health/whoop/sync
 * Pull recovery, sleep, HRV, cycle (strain) from WHOOP for last N days. ?days=14 default.
 */
router.post('/whoop/sync', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 14;
        const result = await whoop.syncLastDays(days);
        if (result.error === 'not_connected') {
            return res.status(401).json({ success: false, needsReconnect: true, error: 'WHOOP token expired — reconnect to refresh' });
        }
        res.json({ success: true, synced: result.synced, error: result.error || null });
    } catch (error) {
        console.error('WHOOP sync error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/health
 * Get latest health metrics. cycle_phase is auto-computed from health_cycle_config when config exists.
 */
router.get('/', async (req, res) => {
    try {
        // Ensure WHOOP data is fresh (triggers sync + token refresh if stale)
        try { await whoop.ensureFresh(120); } catch (e) { /* non-blocking */ }
        const metrics = whoop.getLatestMetrics();
        
        if (!metrics) {
            return res.json({
                recovery: null,
                sleep_hours: null,
                sleep_minutes: null,
                sleep_performance_pct: null,
                hrv: null,
                strain: null,
                cycle_phase: null,
                monthly_phase: null,
                date: null,
                sync_source: null
            });
        }

        const cycleConfig = getCycleConfig();
        const todayStr = new Date().toISOString().split('T')[0];
        const cycle_phase = cycleConfig
            ? getCyclePhaseForDate(todayStr, cycleConfig)
            : metrics.cycle_phase;

        res.json({
            recovery: metrics.recovery,
            sleep_hours: metrics.sleep_hours,
            sleep_minutes: metrics.sleep_minutes,
            sleep_performance_pct: metrics.sleep_performance_pct,
            hrv: metrics.hrv,
            strain: metrics.strain,
            cycle_phase: cycleConfig ? (cycle_phase ?? null) : metrics.cycle_phase,
            monthly_phase: metrics.monthly_phase,
            date: metrics.date,
            sync_source: metrics.sync_source || null,
            needsReconnect: !!whoop._needsReconnect
        });
    } catch (error) {
        console.error('Error fetching health metrics:', error);
        res.status(500).json({ error: 'Failed to fetch health metrics' });
    }
});

/**
 * GET /api/health/cycle-config
 * Get cycle config (last period start, lengths).
 */
router.get('/cycle-config', (req, res) => {
    try {
        const row = getCycleConfig();
        if (!row) return res.json(null);
        res.json({
            last_period_start: row.last_period_start,
            period_length_days: row.period_length_days,
            cycle_length_days: row.cycle_length_days,
            follicular_days: row.follicular_days,
            ovulatory_days: row.ovulatory_days,
            pms_days: row.pms_days,
            updated_at: row.updated_at
        });
    } catch (error) {
        console.error('Error fetching cycle config:', error);
        res.status(500).json({ error: 'Failed to fetch cycle config' });
    }
});

/**
 * PUT /api/health/cycle-config
 * Save cycle config. Body: { last_period_start, period_length_days?, cycle_length_days?, follicular_days?, ovulatory_days?, pms_days? }
 */
router.put('/cycle-config', (req, res) => {
    try {
        const { last_period_start, period_length_days, cycle_length_days, follicular_days, ovulatory_days, pms_days } = req.body;
        if (!last_period_start) return res.status(400).json({ error: 'last_period_start required' });
        const existing = getCycleConfig();
        const period = period_length_days != null ? period_length_days : (existing ? existing.period_length_days : 4);
        const cycle = cycle_length_days != null ? cycle_length_days : (existing ? existing.cycle_length_days : 31);
        const follicular = follicular_days != null ? follicular_days : (existing ? existing.follicular_days : 14);
        const ovulatory = ovulatory_days != null ? ovulatory_days : (existing ? existing.ovulatory_days : 2);
        const pms = pms_days != null ? pms_days : (existing ? existing.pms_days : 3);

        db.prepare(`
            INSERT INTO health_cycle_config (id, last_period_start, period_length_days, cycle_length_days, follicular_days, ovulatory_days, pms_days, updated_at)
            VALUES (1, ?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE SET
                last_period_start = excluded.last_period_start,
                period_length_days = excluded.period_length_days,
                cycle_length_days = excluded.cycle_length_days,
                follicular_days = excluded.follicular_days,
                ovulatory_days = excluded.ovulatory_days,
                pms_days = excluded.pms_days,
                updated_at = datetime('now')
        `).run(last_period_start, period, cycle, follicular, ovulatory, pms);
        res.json({ success: true });
    } catch (error) {
        console.error('Error saving cycle config:', error);
        res.status(500).json({ error: 'Failed to save cycle config' });
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
 * PATCH /api/health/cycle
 * Update cycle_phase (and optionally monthly_phase) for the latest health row. Body: { cycle_phase: "...", monthly_phase: "..." }
 */
router.patch('/cycle', (req, res) => {
    try {
        const { cycle_phase, monthly_phase } = req.body;
        const row = db.prepare('SELECT date FROM health_metrics ORDER BY date DESC LIMIT 1').get();
        if (!row) return res.status(404).json({ error: 'No health metrics yet' });
        if (cycle_phase !== undefined) {
            db.prepare('UPDATE health_metrics SET cycle_phase = ? WHERE date = ?').run(cycle_phase === '' ? null : cycle_phase, row.date);
        }
        if (monthly_phase !== undefined) {
            db.prepare('UPDATE health_metrics SET monthly_phase = ? WHERE date = ?').run(monthly_phase === '' ? null : monthly_phase, row.date);
        }
        res.json({ success: true, date: row.date });
    } catch (error) {
        console.error('Error updating cycle:', error);
        res.status(500).json({ error: 'Failed to update cycle' });
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
            INSERT INTO health_metrics (date, recovery, sleep_hours, sleep_minutes, hrv, cycle_phase, monthly_phase, sync_source)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'manual')
            ON CONFLICT(date) DO UPDATE SET
                recovery = excluded.recovery,
                sleep_hours = excluded.sleep_hours,
                sleep_minutes = excluded.sleep_minutes,
                hrv = excluded.hrv,
                cycle_phase = excluded.cycle_phase,
                monthly_phase = excluded.monthly_phase,
                sync_source = 'manual'
        `);

        stmt.run(targetDate, recovery, sleep_hours, sleep_minutes, hrv, cycle_phase, monthly_phase);
        res.json({ success: true, date: targetDate });
    } catch (error) {
        console.error('Error updating health metrics:', error);
        res.status(500).json({ error: 'Failed to update health metrics' });
    }
});

module.exports = router;
