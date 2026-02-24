/**
 * Populate social_metrics_daily from social_metrics long format
 * Run this once to backfill existing data, then use as scheduled job
 *
 * Usage:
 *   node db/scripts/populate-social-daily.js              // Populate missing dates
 *   node db/scripts/populate-social-daily.js --force      // Recalculate all dates
 *   node db/scripts/populate-social-daily.js --date 2025-02-09  // Populate specific date
 */

const db = require('../database');

const PLATFORMS = ['linkedin', 'email', 'twitter', 'instagram', 'threads', 'substack', 'youtube', 'brunch'];

function populateDailySnapshot(targetDate = null) {
    console.log('📊 Populating social_metrics_daily...');

    try {
        // Get all unique dates from social_metrics, or use target date
        let dates;
        if (targetDate) {
            dates = [targetDate];
        } else {
            dates = db.prepare(`
                SELECT DISTINCT date FROM social_metrics
                ORDER BY date DESC
            `).all().map(r => r.date);
        }

        console.log(`Found ${dates.length} dates to process`);

        for (const date of dates) {
            // Get all metrics for this date
            const metrics = db.prepare(`
                SELECT platform, metric_type, value
                FROM social_metrics
                WHERE date = ?
                ORDER BY platform, metric_type
            `).all(date);

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

            // Calculate total_reach (sum of all followers/subscribers)
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
        }

        const count = db.prepare('SELECT COUNT(*) as count FROM social_metrics_daily').get();
        console.log(`✅ Successfully populated social_metrics_daily`);
        console.log(`   Total snapshots: ${count.count}`);

    } catch (e) {
        console.error('❌ Error populating social_metrics_daily:', e.message);
        process.exit(1);
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

// Parse command line args
const args = process.argv.slice(2);
const forceRecalculate = args.includes('--force');
const dateIdx = args.findIndex(arg => arg === '--date' || arg.startsWith('--date='));
let dateArg = dateIdx >= 0 ? (args[dateIdx].includes('=') ? args[dateIdx].split('=')[1] : args[dateIdx + 1]) : null;

if (forceRecalculate) {
    console.log('🔄 Force recalculating all dates...');
    db.prepare('DELETE FROM social_metrics_daily').run();
    populateDailySnapshot();
} else if (dateArg) {
    console.log(`🔄 Populating specific date: ${dateArg}`);
    populateDailySnapshot(dateArg);
} else {
    populateDailySnapshot();
}

if (require.main === module) {
    process.exit(0);
}

module.exports = { populateDailySnapshot, mapMetricToColumn };
