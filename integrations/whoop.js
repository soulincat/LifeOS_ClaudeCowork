const db = require('../db/database');

/**
 * Whoop API Integration
 * Fetches health metrics (recovery, sleep, HRV) from Whoop API
 * Daily sync: Fetches data for yesterday
 */
class WhoopIntegration {
    constructor() {
        this.apiToken = process.env.WHOOP_API_TOKEN;
        this.baseUrl = 'https://api.prod.whoop.com/developer/v1';
    }

    /**
     * Fetch recovery data for a specific date range
     * Whoop API uses start/end timestamps
     */
    async fetchRecovery(startDate, endDate) {
        if (!this.apiToken) {
            console.log('⚠️  WHOOP_API_TOKEN not configured');
            return null;
        }

        try {
            const startTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
            const endTimestamp = Math.floor(new Date(endDate).getTime() / 1000);

            const response = await fetch(
                `${this.baseUrl}/recovery?start=${startTimestamp}&end=${endTimestamp}`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (!response.ok) {
                if (response.status === 401) {
                    console.error('⚠️  Whoop API authentication failed. Check your API token.');
                }
                throw new Error(`Whoop API error: ${response.status}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error fetching Whoop recovery:', error);
            return null;
        }
    }

    /**
     * Fetch sleep data for a specific date range
     */
    async fetchSleep(startDate, endDate) {
        if (!this.apiToken) {
            return null;
        }

        try {
            const startTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
            const endTimestamp = Math.floor(new Date(endDate).getTime() / 1000);

            const response = await fetch(
                `${this.baseUrl}/sleep?start=${startTimestamp}&end=${endTimestamp}`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`Whoop API error: ${response.status}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error fetching Whoop sleep:', error);
            return null;
        }
    }

    /**
     * Sync health metrics for yesterday (daily sync)
     */
    async syncDailyMetrics() {
        if (!this.apiToken) {
            console.log('⚠️  Whoop API token not configured, skipping sync');
            return;
        }

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);
        const endDate = new Date(yesterday);
        endDate.setHours(23, 59, 59, 999);
        const dateStr = yesterday.toISOString().split('T')[0];

        try {
            // Fetch recovery and sleep data for the full day
            const recoveryData = await this.fetchRecovery(yesterday, endDate);
            const sleepData = await this.fetchSleep(yesterday, endDate);

            if (!recoveryData && !sleepData) {
                console.log('No Whoop data available for', dateStr);
                return;
            }

            // Parse recovery data (Whoop returns array of records)
            let recovery = null;
            let hrv = null;
            
            if (recoveryData && recoveryData.records && recoveryData.records.length > 0) {
                // Get the most recent recovery record for the day
                const latestRecovery = recoveryData.records[recoveryData.records.length - 1];
                recovery = latestRecovery.score?.recovery_score || latestRecovery.recovery_score || null;
                hrv = latestRecovery.score?.hrv_milliarcseconds 
                    ? Math.round(latestRecovery.score.hrv_milliarcseconds / 1000)
                    : latestRecovery.hrv || null;
            }

            // Parse sleep data
            let sleepHours = null;
            let sleepMinutes = null;
            
            if (sleepData && sleepData.records && sleepData.records.length > 0) {
                // Sum all sleep sessions for the day
                let totalSleepMs = 0;
                sleepData.records.forEach(record => {
                    const sleepTime = record.score?.total_sleep_time_ms || record.total_sleep_time_ms || 0;
                    totalSleepMs += sleepTime;
                });
                
                if (totalSleepMs > 0) {
                    sleepHours = Math.floor(totalSleepMs / (1000 * 60 * 60));
                    sleepMinutes = Math.floor((totalSleepMs % (1000 * 60 * 60)) / (1000 * 60));
                }
            }

            // Insert or update health metrics
            const stmt = db.prepare(`
                INSERT INTO health_metrics (date, recovery, sleep_hours, sleep_minutes, hrv)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(date) DO UPDATE SET
                    recovery = excluded.recovery,
                    sleep_hours = excluded.sleep_hours,
                    sleep_minutes = excluded.sleep_minutes,
                    hrv = excluded.hrv
            `);

            stmt.run(dateStr, recovery, sleepHours, sleepMinutes, hrv);
            console.log(`✅ Synced Whoop metrics for ${dateStr} - Recovery: ${recovery}%, Sleep: ${sleepHours}h ${sleepMinutes}m`);
        } catch (error) {
            console.error('Error syncing Whoop metrics:', error);
        }
    }

    /**
     * Get latest health metrics from database
     */
    getLatestMetrics() {
        const stmt = db.prepare(`
            SELECT * FROM health_metrics 
            ORDER BY date DESC 
            LIMIT 1
        `);
        return stmt.get();
    }
}

module.exports = new WhoopIntegration();
