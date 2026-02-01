const express = require('express');
const router = express.Router();
const db = require('../db/database');
const soulinsocial = require('../integrations/soulinsocial');

/**
 * GET /api/social/metrics
 * Get current social media metrics (latest date from DB, then soulinsocial, then defaults)
 */
const DEFAULT_SOCIAL_METRICS = [
    { platform: 'email', metric_type: 'subscribers', value: 2600 },
    { platform: 'linkedin', metric_type: 'followers', value: 10000 },
    { platform: 'twitter', metric_type: 'followers', value: 0 },
    { platform: 'instagram', metric_type: 'followers', value: 0 },
    { platform: 'threads', metric_type: 'followers', value: 0 },
    { platform: 'substack', metric_type: 'subscribers', value: 0 },
    { platform: 'youtube', metric_type: 'subscribers', value: 300 },
    { platform: 'brunch', metric_type: 'followers', value: 2700 }
];

router.get('/metrics', (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT platform, metric_type, value, date
            FROM social_metrics
            WHERE date = (SELECT MAX(date) FROM social_metrics)
        `).all();
        if (rows && rows.length > 0) {
            const byKey = {};
            rows.forEach(r => { byKey[(r.platform || '').toLowerCase()] = { platform: r.platform, metric_type: r.metric_type, value: r.value }; });
            const platformOrder = ['email', 'linkedin', 'twitter', 'instagram', 'threads', 'substack', 'youtube', 'brunch'];
            const merged = platformOrder.map(p => byKey[p] || { platform: p, metric_type: p === 'email' || p === 'substack' ? 'subscribers' : 'followers', value: (DEFAULT_SOCIAL_METRICS.find(d => d.platform === p) || {}).value ?? 0 });
            return res.json(merged);
        }
        let metrics = soulinsocial.getSocialMetrics();
        if (!metrics || metrics.length === 0) {
            metrics = DEFAULT_SOCIAL_METRICS.slice();
        } else {
            const byKey = {};
            (Array.isArray(metrics) ? metrics : []).forEach(m => { byKey[(m.platform || '').toLowerCase()] = m; });
            const platformOrder = ['email', 'linkedin', 'twitter', 'instagram', 'threads', 'substack', 'youtube', 'brunch'];
            metrics = platformOrder.map(p => {
                const m = byKey[p];
                return m ? { platform: m.platform, metric_type: m.metric_type || (p === 'email' || p === 'substack' ? 'subscribers' : 'followers'), value: m.value } : { platform: p, metric_type: p === 'email' || p === 'substack' ? 'subscribers' : 'followers', value: (DEFAULT_SOCIAL_METRICS.find(d => d.platform === p) || {}).value ?? 0 };
            });
        }
        res.json(metrics);
    } catch (error) {
        console.error('Error fetching social metrics:', error);
        res.status(500).json({ error: 'Failed to fetch social metrics' });
    }
});

/**
 * POST /api/social/metrics
 * Upsert social metrics for a given date (default: today)
 * Body: { date?: "YYYY-MM-DD", metrics: [ { platform, metric_type?, value } ] }
 */
router.post('/metrics', (req, res) => {
    try {
        const date = (req.body && req.body.date) || new Date().toISOString().slice(0, 10);
        const metrics = req.body && Array.isArray(req.body.metrics) ? req.body.metrics : [];
        const stmt = db.prepare(`
            INSERT INTO social_metrics (platform, metric_type, value, date)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(platform, metric_type, date) DO UPDATE SET value = excluded.value
        `);
        for (const m of metrics) {
            const platform = (m.platform || '').toLowerCase();
            const metric_type = m.metric_type || (platform === 'email' || platform === 'substack' ? 'subscribers' : 'followers');
            const value = Math.max(0, parseInt(m.value, 10) || 0);
            stmt.run(platform, metric_type, value, date);
        }
        res.json({ ok: true, date, count: metrics.length });
    } catch (error) {
        console.error('Error saving social metrics:', error);
        res.status(500).json({ error: 'Failed to save social metrics' });
    }
});

/**
 * GET /api/scheduled-posts
 * Get next 3 scheduled posts
 */
router.get('/scheduled-posts', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 3;
        const posts = soulinsocial.getScheduledPosts(limit);
        
        // Format posts for frontend
        const formattedPosts = posts.map(post => {
            const platforms = typeof post.platforms === 'string' 
                ? JSON.parse(post.platforms) 
                : post.platforms;
            
            const scheduledDate = new Date(post.scheduled_date);
            const now = new Date();
            const diffTime = scheduledDate - now;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            let dateDisplay = '';
            if (diffDays === 0) {
                dateDisplay = `Today ${scheduledDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
            } else if (diffDays === 1) {
                dateDisplay = `Tomorrow ${scheduledDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
            } else {
                dateDisplay = scheduledDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
            }
            
            return {
                center_post: post.center_post,
                platforms: platforms,
                scheduled_date: post.scheduled_date,
                date_display: dateDisplay,
                status: post.status
            };
        });
        
        res.json(formattedPosts);
    } catch (error) {
        console.error('Error fetching scheduled posts:', error);
        res.status(500).json({ error: 'Failed to fetch scheduled posts' });
    }
});

/**
 * GET /api/social/overview
 * Get social media overview: combined followers from latest metrics; posts/impressions/clicks from defaults
 */
router.get('/overview', (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT platform, metric_type, value
            FROM social_metrics
            WHERE date = (SELECT MAX(date) FROM social_metrics)
        `).all();
        let followers = 0;
        if (rows && rows.length > 0) {
            followers = rows
                .filter(r => (r.metric_type === 'followers' || r.metric_type === 'subscribers'))
                .reduce((sum, r) => sum + (r.value || 0), 0);
        }
        if (followers === 0) {
            followers = 2600 + 10000 + 0 + 0 + 0 + 0 + 300 + 2700;
        }
        res.json({
            followers,
            posts: 156,
            impressions: 342000,
            clicks: 8200
        });
    } catch (error) {
        console.error('Error fetching social overview:', error);
        res.status(500).json({ error: 'Failed to fetch social overview' });
    }
});

module.exports = router;
