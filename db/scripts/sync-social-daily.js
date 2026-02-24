/**
 * Sync social_metrics_daily nightly
 * Updates today's snapshot in social_metrics_daily from latest social_metrics entries
 *
 * Schedule this as a cron job (e.g., daily at 1:00 AM):
 *   0 1 * * * cd /path/to/project && node db/scripts/sync-social-daily.js >> logs/social-sync.log 2>&1
 *
 * Usage:
 *   node db/scripts/sync-social-daily.js              // Sync today's metrics
 *   node db/scripts/sync-social-daily.js --date 2025-02-09  // Sync specific date
 */

const db = require('../database');
const fs = require('fs');
const path = require('path');

function getTodayDate() {
    const today = new Date();
    return today.toISOString().split('T')[0];
}

function syncSocialMetricsDaily(targetDate = null) {
    const date = targetDate || getTodayDate();

    console.log(`[${new Date().toISOString()}] 📊 Syncing social metrics for ${date}...`);

    try {
        // Get all metrics for this date
        const metrics = db.prepare(`
            SELECT platform, metric_type, value
            FROM social_metrics
            WHERE date = ?
            ORDER BY platform, metric_type
        `).all(date);

        if (metrics.length === 0) {
            console.log(`   No metrics found for ${date}. Skipping.`);
            return;
        }

        // Build object from metrics
        const dayData = {
            date,
            linkedin_followers: null,
            linkedin_engagement_rate: null,
            email_subscribers: null,
            twitter_followers: null,
            instagram_followers: null,
            threads_followers: null,
            substack_subscribers: null,
            youtube_subscribers: null,
            brunch_followers: null,
            total_reach: 0
        };

        // Map metrics to columns
        for (const metric of metrics) {
            const col = mapMetricToColumn(metric.platform, metric.metric_type);
            if (col) {
                dayData[col] = metric.value;
            }
        }

        // Calculate total_reach
        dayData.total_reach = [
            dayData.linkedin_followers,
            dayData.email_subscribers,
            dayData.twitter_followers,
            dayData.instagram_followers,
            dayData.threads_followers,
            dayData.substack_subscribers,
            dayData.youtube_subscribers,
            dayData.brunch_followers
        ].reduce((sum, val) => sum + (val || 0), 0);

        // Upsert into social_metrics_daily
        db.prepare(`
            INSERT INTO social_metrics_daily (
                date, linkedin_followers, linkedin_engagement_rate,
                email_subscribers, twitter_followers, instagram_followers,
                threads_followers, substack_subscribers, youtube_subscribers,
                brunch_followers, total_reach, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            ON CONFLICT(date) DO UPDATE SET
                linkedin_followers = excluded.linkedin_followers,
                linkedin_engagement_rate = excluded.linkedin_engagement_rate,
                email_subscribers = excluded.email_subscribers,
                twitter_followers = excluded.twitter_followers,
                instagram_followers = excluded.instagram_followers,
                threads_followers = excluded.threads_followers,
                substack_subscribers = excluded.substack_subscribers,
                youtube_subscribers = excluded.youtube_subscribers,
                brunch_followers = excluded.brunch_followers,
                total_reach = excluded.total_reach,
                updated_at = datetime('now')
        `).run(
            dayData.date,
            dayData.linkedin_followers,
            dayData.linkedin_engagement_rate,
            dayData.email_subscribers,
            dayData.twitter_followers,
            dayData.instagram_followers,
            dayData.threads_followers,
            dayData.substack_subscribers,
            dayData.youtube_subscribers,
            dayData.brunch_followers,
            dayData.total_reach
        );

        console.log(`✅ Synced ${date}: ${metrics.length} metrics, total_reach: ${dayData.total_reach}`);

    } catch (e) {
        console.error(`❌ Error syncing social metrics for ${date}:`, e.message);
        // Don't exit with error for cron jobs; just log
    }
}

function mapMetricToColumn(platform, metricType) {
    const key = `${platform}_${metricType}`.toLowerCase();

    const mapping = {
        'linkedin_followers': 'linkedin_followers',
        'linkedin_engagement': 'linkedin_engagement_rate',
        'linkedin_engagement_rate': 'linkedin_engagement_rate',
        'email_subscribers': 'email_subscribers',
        'twitter_followers': 'twitter_followers',
        'instagram_followers': 'instagram_followers',
        'threads_followers': 'threads_followers',
        'substack_subscribers': 'substack_subscribers',
        'youtube_subscribers': 'youtube_subscribers',
        'brunch_followers': 'brunch_followers'
    };

    return mapping[key] || null;
}

// Parse command line args (--date=YYYY-MM-DD or --date YYYY-MM-DD)
const args = process.argv.slice(2);
const dateIdx = args.findIndex(arg => arg === '--date' || arg.startsWith('--date='));
const dateArg = dateIdx >= 0 ? (args[dateIdx].includes('=') ? args[dateIdx].split('=')[1] : args[dateIdx + 1]) : null;

syncSocialMetricsDaily(dateArg);

if (require.main === module) {
    process.exit(0);
}

module.exports = { syncSocialMetricsDaily, mapMetricToColumn };
