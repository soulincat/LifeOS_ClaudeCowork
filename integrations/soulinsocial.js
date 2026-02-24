const db = require('../db/database');

const SOULIN_BASE = process.env.SOULIN_SOCIAL_URL || 'http://localhost:3000';

/**
 * Soulinsocial Integration
 * Fetches data from Soulin Social's /api/summary/* endpoints via HTTP.
 * Falls back to LifeOS cached data when Soulin Social is offline.
 */
class SoulinsocialIntegration {
    /**
     * Check if Soulin Social API is reachable
     */
    async healthCheck() {
        try {
            const res = await fetch(`${SOULIN_BASE}/api/summary/health`, { signal: AbortSignal.timeout(3000) });
            if (!res.ok) return false;
            const data = await res.json();
            return data.status === 'ok';
        } catch {
            return false;
        }
    }

    /**
     * Get per-project summary (followers, posts, engagement) for all projects
     */
    async getProjectsSummary() {
        try {
            const res = await fetch(`${SOULIN_BASE}/api/summary/projects`, { signal: AbortSignal.timeout(5000) });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            return data.projects || [];
        } catch (error) {
            console.log('Soulin Social API unavailable:', error.message);
            return [];
        }
    }

    /**
     * Get social metrics.
     * Returns array of {platform, metric_type, value, date} from LifeOS cache.
     * Cache is updated by syncSocialMetrics() on schedule.
     */
    getSocialMetrics() {
        const stmt = db.prepare(`
            SELECT platform, metric_type, value, date
            FROM social_metrics
            WHERE date = (SELECT MAX(date) FROM social_metrics)
        `);
        return stmt.all();
    }

    /**
     * Get scheduled posts from LifeOS cache.
     * Returns array of {center_post, platforms, scheduled_date, status}.
     * Cache is updated by syncSocialMetrics() on schedule.
     */
    getScheduledPosts(limit = 3) {
        const stmt = db.prepare(`
            SELECT center_post, platforms, scheduled_date, status
            FROM scheduled_posts
            WHERE status = 'queued'
            ORDER BY scheduled_date ASC
            LIMIT ?
        `);
        return stmt.all(limit);
    }

    /**
     * Sync social metrics + scheduled posts from Soulin Social API into LifeOS cache.
     * Called by integrations/sync.js on schedule.
     */
    async syncSocialMetrics() {
        try {
            const res = await fetch(`${SOULIN_BASE}/api/summary/projects`, { signal: AbortSignal.timeout(5000) });
            if (!res.ok) {
                console.log('Soulin Social sync: API returned', res.status);
                return;
            }
            const data = await res.json();
            const projects = data.projects || [];

            const today = new Date().toISOString().slice(0, 10);
            const metricsStmt = db.prepare(`
                INSERT INTO social_metrics (platform, metric_type, value, date)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(platform, metric_type, date) DO UPDATE SET value = excluded.value
            `);

            // Aggregate follower counts across all projects
            const platformTotals = {};
            for (const project of projects) {
                const followers = project.followers || {};
                for (const [platform, count] of Object.entries(followers)) {
                    if (platform === 'total') continue;
                    platformTotals[platform] = (platformTotals[platform] || 0) + count;
                }
            }

            for (const [platform, count] of Object.entries(platformTotals)) {
                const metricType = (platform === 'substack' || platform === 'email') ? 'subscribers' : 'followers';
                metricsStmt.run(platform, metricType, count, today);
            }

            console.log(`Soulin Social sync: updated metrics for ${Object.keys(platformTotals).length} platforms`);

            // Sync scheduled posts
            await this._syncScheduledPosts(projects);

        } catch (error) {
            console.log('Soulin Social sync error:', error.message);
        }
    }

    /**
     * Fetch and cache scheduled posts from Soulin Social
     */
    async _syncScheduledPosts(projects) {
        const stmt = db.prepare(`
            INSERT INTO scheduled_posts (center_post, platforms, scheduled_date, status)
            VALUES (?, ?, ?, ?)
            ON CONFLICT DO NOTHING
        `);

        for (const project of (projects || [])) {
            try {
                const detailRes = await fetch(
                    `${SOULIN_BASE}/api/summary/project/${project.client_id}`,
                    { signal: AbortSignal.timeout(5000) }
                );
                if (!detailRes.ok) continue;
                const detail = await detailRes.json();

                for (const sched of (detail.upcoming_scheduled || [])) {
                    stmt.run(
                        sched.post_id || 'Scheduled post',
                        JSON.stringify([sched.platform]),
                        sched.scheduled_for,
                        'queued'
                    );
                }
            } catch (error) {
                console.log(`Soulin Social sync (${project.client_id}) error:`, error.message);
            }
        }
    }
}

module.exports = new SoulinsocialIntegration();
