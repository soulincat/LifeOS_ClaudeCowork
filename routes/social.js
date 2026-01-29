const express = require('express');
const router = express.Router();
const db = require('../db/database');
const soulinsocial = require('../integrations/soulinsocial');

/**
 * GET /api/social/metrics
 * Get current social media metrics
 */
router.get('/metrics', (req, res) => {
    try {
        // Try to get from soulinsocial first
        let metrics = soulinsocial.getSocialMetrics();
        
        // If no metrics, return defaults
        if (!metrics || metrics.length === 0) {
            metrics = [
                { platform: 'email', metric_type: 'subscribers', value: 1200 },
                { platform: 'linkedin', metric_type: 'followers', value: 8500 },
                { platform: 'twitter', metric_type: 'followers', value: 12300 },
                { platform: 'instagram', metric_type: 'followers', value: 4100 },
                { platform: 'threads', metric_type: 'followers', value: 2800 },
                { platform: 'substack', metric_type: 'subscribers', value: 890 },
                { platform: 'youtube', metric_type: 'subscribers', value: 3200 }
            ];
        }
        
        res.json(metrics);
    } catch (error) {
        console.error('Error fetching social metrics:', error);
        res.status(500).json({ error: 'Failed to fetch social metrics' });
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
 * Get social media overview (followers, posts, impressions, clicks)
 */
router.get('/overview', (req, res) => {
    try {
        // This would aggregate from social_metrics table
        // For now, return defaults
        res.json({
            followers: 24800,
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
