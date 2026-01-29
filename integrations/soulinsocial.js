const db = require('../db/database');
const fs = require('fs');
const path = require('path');

/**
 * Soulinsocial Integration
 * Reads data from local soulinsocial project
 * Since API is not ready yet, reads from local files/DB
 */
class SoulinsocialIntegration {
    constructor() {
        // Try to find soulinsocial project
        this.soulinsocialPath = path.join(__dirname, '..', '..', 'soulin_social_bot');
        this.soulinsocialDbPath = path.join(this.soulinsocialPath, 'data.db');
    }

    /**
     * Check if soulinsocial project exists
     */
    projectExists() {
        return fs.existsSync(this.soulinsocialPath);
    }

    /**
     * Read scheduled posts from soulinsocial
     * Tries to read from DB first, then falls back to files
     */
    getScheduledPosts(limit = 3) {
        // Try to read from soulinsocial DB if it exists
        if (fs.existsSync(this.soulinsocialDbPath)) {
            try {
                const SoulinsocialDb = require('better-sqlite3');
                const soulinsocialDb = new SoulinsocialDb(this.soulinsocialDbPath);
                
                const stmt = soulinsocialDb.prepare(`
                    SELECT center_post, platforms, scheduled_date, status
                    FROM posts
                    WHERE status = 'queued'
                    ORDER BY scheduled_date ASC
                    LIMIT ?
                `);
                
                const posts = stmt.all(limit);
                soulinsocialDb.close();
                
                // Sync to our database
                this.syncScheduledPosts(posts);
                
                return posts;
            } catch (error) {
                console.log('Could not read from soulinsocial DB:', error.message);
            }
        }

        // Fallback: Read from our own database (if previously synced)
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
     * Sync scheduled posts to our database
     */
    syncScheduledPosts(posts) {
        const stmt = db.prepare(`
            INSERT INTO scheduled_posts (center_post, platforms, scheduled_date, status)
            VALUES (?, ?, ?, ?)
            ON CONFLICT DO NOTHING
        `);

        posts.forEach(post => {
            const platforms = typeof post.platforms === 'string' 
                ? post.platforms 
                : JSON.stringify(post.platforms);
            stmt.run(
                post.center_post || post.title || post.content,
                platforms,
                post.scheduled_date,
                post.status || 'queued'
            );
        });
    }

    /**
     * Get social metrics from soulinsocial
     */
    getSocialMetrics() {
        // Try to read from soulinsocial DB
        if (fs.existsSync(this.soulinsocialDbPath)) {
            try {
                const SoulinsocialDb = require('better-sqlite3');
                const soulinsocialDb = new SoulinsocialDb(this.soulinsocialDbPath);
                
                // This would depend on soulinsocial's schema
                // Placeholder for now
                soulinsocialDb.close();
            } catch (error) {
                console.log('Could not read social metrics from soulinsocial:', error.message);
            }
        }

        // Fallback: Get latest from our database
        const stmt = db.prepare(`
            SELECT platform, metric_type, value, date
            FROM social_metrics
            WHERE date = (SELECT MAX(date) FROM social_metrics)
        `);
        
        return stmt.all();
    }

    /**
     * Sync social metrics (daily)
     */
    syncSocialMetrics() {
        if (!this.projectExists()) {
            console.log('⚠️  Soulinsocial project not found at:', this.soulinsocialPath);
            return;
        }

        // Placeholder - will be implemented when soulinsocial API is ready
        console.log('Soulinsocial sync: Reading from local project');
    }
}

module.exports = new SoulinsocialIntegration();
