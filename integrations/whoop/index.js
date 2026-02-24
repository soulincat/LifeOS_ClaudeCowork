const db = require('../../core/db/database');
const Connector = require('../connector');

/**
 * Whoop API Integration (OAuth2 + v2 API)
 * Fetches health metrics: recovery, sleep, HRV, cycle (strain)
 * Docs: https://developer.whoop.com/api
 */
class WhoopIntegration extends Connector {
    constructor(config) {
        super('whoop', config);
        this.legacyToken = process.env.WHOOP_API_TOKEN;
        this.baseUrl = 'https://api.prod.whoop.com/developer/v2';
        this.syncSchedule = 'daily';
    }

    async checkStatus() {
        const token = await this.getAccessToken();
        if (token) return { connected: true };
        return { connected: false, error: 'No token — connect via /api/health/whoop/connect' };
    }

    async sync(options = {}) {
        const days = options.days || 3;
        return this.syncLastDays(days);
    }

    async startBackground() {
        const self = this;
        const run = async () => {
            try {
                const result = await self.syncLastDays(3);
                if (result && result.synced > 0) console.log(`✅ Whoop auto-sync: ${result.synced} day(s) updated`);
            } catch (e) {
                if (!e.message?.includes('no token') && !e.message?.includes('needsReconnect')) {
                    console.log('⚠️  Whoop auto-sync skipped:', e.message);
                }
            }
        };
        run(); // immediate on boot
        this._interval = setInterval(run, 2 * 60 * 60 * 1000); // every 2 hours
    }

    async disconnect() {
        if (this._interval) clearInterval(this._interval);
        super.disconnect();
    }

    static getRequiredConfig() {
        return { env: ['WHOOP_CLIENT_ID', 'WHOOP_CLIENT_SECRET'], settings: [] };
    }

    hasStoredTokens() {
        try {
            const row = db.prepare('SELECT access_token FROM whoop_oauth WHERE id = 1').get();
            return !!(row && row.access_token);
        } catch (e) {
            return false;
        }
    }

    async getAccessToken() {
        if (this.hasStoredTokens()) {
            const token = await this._getOrRefreshOAuthToken();
            if (token) return token;
        }
        if (this.legacyToken) return this.legacyToken;
        return null;
    }

    async _getOrRefreshOAuthToken() {
        const row = db.prepare('SELECT access_token, refresh_token, expires_at FROM whoop_oauth WHERE id = 1').get();
        if (!row) return null;
        const now = Math.floor(Date.now() / 1000);
        const buffer = 300;
        if (row.expires_at > now + buffer) return row.access_token;
        if (!row.refresh_token) return row.access_token;
        const clientId = process.env.WHOOP_CLIENT_ID;
        const clientSecret = process.env.WHOOP_CLIENT_SECRET;
        if (!clientId || !clientSecret) return row.access_token;
        try {
            const body = new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: row.refresh_token,
                client_id: clientId,
                client_secret: clientSecret,
            });
            const res = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body.toString()
            });
            if (!res.ok) {
                console.error('Whoop token refresh failed:', res.status);
                return null; // Force re-auth instead of using stale token
            }
            const data = await res.json();
            const expiresAt = Math.floor(Date.now() / 1000) + (data.expires_in || 3600);
            db.prepare(`
                UPDATE whoop_oauth SET access_token = ?, refresh_token = COALESCE(?, refresh_token), expires_at = ?, updated_at = datetime('now') WHERE id = 1
            `).run(data.access_token, data.refresh_token || null, expiresAt);
            return data.access_token;
        } catch (e) {
            console.error('Whoop token refresh failed:', e);
            return row.access_token;
        }
    }

    async _apiGet(path, startDate, endDate) {
        const token = await this.getAccessToken();
        if (!token) return null;
        const start = new Date(startDate).toISOString();
        const end = new Date(endDate).toISOString();
        const url = `${this.baseUrl}${path}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&limit=25`;
        try {
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });
            if (!response.ok) throw new Error(`Whoop API ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error('Whoop API error', path, error.message);
            return null;
        }
    }

    async fetchRecovery(startDate, endDate) {
        return this._apiGet('/recovery', startDate, endDate);
    }

    async fetchSleep(startDate, endDate) {
        return this._apiGet('/activity/sleep', startDate, endDate);
    }

    async fetchCycles(startDate, endDate) {
        return this._apiGet('/cycle', startDate, endDate);
    }

    /**
     * Sync health metrics for a date range. Uses cycle_id to map recovery/sleep to calendar date.
     * Stores: recovery %, sleep (h/m), HRV (ms), cycle_phase (Strain X.X).
     */
    async syncDateRange(startDate, endDate) {
        const token = await this.getAccessToken();
        if (!token) {
            console.log('⚠️  Whoop: no token, skipping sync');
            return { synced: 0, error: 'not_connected' };
        }

        const start = new Date(startDate);
        const end = new Date(endDate);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);

        try {
            const [cycleData, recoveryData, sleepData] = await Promise.all([
                this.fetchCycles(start, end),
                this.fetchRecovery(start, end),
                this.fetchSleep(start, end)
            ]);

            // Use local date (not UTC) so e.g. a 6am wakeup in UTC+7 maps to the correct local calendar date
            const localDate = (d) => d.toLocaleDateString('en-CA'); // always YYYY-MM-DD

            // cycle_id -> { dateStr, strain }
            const cycleMap = {};
            if (cycleData && cycleData.records && cycleData.records.length > 0) {
                for (const r of cycleData.records) {
                    const startTime = r.start ? new Date(r.start) : null;
                    if (startTime) {
                        const dateStr = localDate(startTime);
                        const strain = r.score && r.score.strain != null ? r.score.strain : null;
                        cycleMap[r.id] = { dateStr, strain };
                    }
                }
            }

            // dateStr -> { recovery, hrv, sleepMs, strain }
            const byDate = {};

            if (recoveryData && recoveryData.records && recoveryData.records.length > 0) {
                for (const r of recoveryData.records) {
                    const info = cycleMap[r.cycle_id];
                    const dateStr = info ? info.dateStr : (r.created_at ? localDate(new Date(r.created_at)) : null);
                    if (!dateStr) continue;
                    if (!byDate[dateStr]) byDate[dateStr] = {};
                    const score = r.score || {};
                    if (score.recovery_score != null) byDate[dateStr].recovery = Math.round(score.recovery_score);
                    if (score.hrv_rmssd_milli != null) byDate[dateStr].hrv = Math.round(score.hrv_rmssd_milli);
                    if (info && info.strain != null) byDate[dateStr].strain = info.strain;
                }
            }

            if (sleepData && sleepData.records && sleepData.records.length > 0) {
                for (const r of sleepData.records) {
                    const info = cycleMap[r.cycle_id];
                    const dateStr = info ? info.dateStr : (r.start ? localDate(new Date(r.start)) : null);
                    if (!dateStr) continue;
                    if (!byDate[dateStr]) byDate[dateStr] = {};
                    const score = r.score || {};
                    const stage = score.stage_summary || {};
                    let totalMs = (stage.total_light_sleep_time_milli || 0) + (stage.total_slow_wave_sleep_time_milli || 0) + (stage.total_rem_sleep_time_milli || 0);
                    if (totalMs === 0 && stage.total_in_bed_time_milli != null)
                        totalMs = Math.max(0, (stage.total_in_bed_time_milli || 0) - (stage.total_awake_time_milli || 0));
                    // Keep only the longest sleep record per day (ignore naps)
                    if (totalMs > 0 && totalMs > (byDate[dateStr].sleepMs || 0)) byDate[dateStr].sleepMs = totalMs;
                    const sleepPct = score.sleep_performance_percentage ?? score.sleepPerformancePercentage;
                    if (sleepPct != null) byDate[dateStr].sleep_performance_pct = Math.round(sleepPct);
                    if (info && info.strain != null) byDate[dateStr].strain = info.strain;
                }
            }

            const stmt = db.prepare(`
                INSERT INTO health_metrics (date, recovery, sleep_hours, sleep_minutes, sleep_performance_pct, hrv, strain, cycle_phase, monthly_phase, sync_source)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'whoop')
                ON CONFLICT(date) DO UPDATE SET
                    recovery = COALESCE(excluded.recovery, recovery),
                    sleep_hours = COALESCE(excluded.sleep_hours, sleep_hours),
                    sleep_minutes = COALESCE(excluded.sleep_minutes, sleep_minutes),
                    sleep_performance_pct = COALESCE(excluded.sleep_performance_pct, sleep_performance_pct),
                    hrv = COALESCE(excluded.hrv, hrv),
                    strain = COALESCE(excluded.strain, strain),
                    cycle_phase = COALESCE(excluded.cycle_phase, cycle_phase),
                    sync_source = 'whoop'
            `);

            let synced = 0;
            for (const [dateStr, row] of Object.entries(byDate)) {
                const sleepMs = row.sleepMs || 0;
                const sleepHours = sleepMs > 0 ? Math.floor(sleepMs / (1000 * 60 * 60)) : null;
                const sleepMinutes = sleepMs > 0 ? Math.floor((sleepMs % (1000 * 60 * 60)) / (1000 * 60)) : null;
                stmt.run(
                    dateStr,
                    row.recovery ?? null,
                    sleepHours,
                    sleepMinutes,
                    row.sleep_performance_pct ?? null,
                    row.hrv ?? null,
                    row.strain ?? null,
                    null,
                    null
                );
                synced++;
            }

            if (synced > 0) console.log(`✅ Whoop synced ${synced} days (recovery, sleep, HRV, strain)`);
            return { synced };
        } catch (error) {
            console.error('Error syncing Whoop:', error);
            return { synced: 0, error: error.message };
        }
    }

    /**
     * Sync last N days (e.g. 14). Call this after connect or on "Sync WHOOP" button.
     */
    async syncLastDays(days = 14) {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - Math.max(1, days));
        return this.syncDateRange(start, end);
    }

    /**
     * Daily sync: yesterday + today (for cron/scheduled job)
     */
    async syncDailyMetrics() {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const end = new Date();
        return this.syncDateRange(yesterday, end);
    }

    getLatestMetrics() {
        const stmt = db.prepare(`
            SELECT * FROM health_metrics ORDER BY date DESC LIMIT 1
        `);
        return stmt.get();
    }
}

module.exports = new WhoopIntegration();
