const db = require('../../core/db/database');

/**
 * Wise API Integration (Optional)
 * Fetches spending transactions from Wise
 * Daily sync: Fetches transactions for yesterday
 * 
 * Note: Wise API requires:
 * 1. API token from https://wise.com/user/api-tokens
 * 2. Profile ID (get from /v1/profiles endpoint)
 * 3. Account ID (get from /v1/profiles/{profileId}/balances endpoint)
 */
class WiseIntegration {
    constructor() {
        this.apiToken = process.env.WISE_API_TOKEN;
        if (this.apiToken && this.apiToken.includes('your_')) this.apiToken = null;
        this.profileId = process.env.WISE_PROFILE_ID;
        if (this.profileId && this.profileId.includes('your_')) this.profileId = null;
        this.baseUrl = 'https://api.transferwise.com';
    }

    async checkStatus() {
        if (!this.apiToken) return { connected: false, error: 'No API token' };
        try {
            const profileId = await this.getProfileId();
            return { connected: !!profileId };
        } catch (e) {
            return { connected: false, error: e.message };
        }
    }

    async startBackground() {
        if (!this.apiToken) return;
        // Initial sync after 15s delay (let server finish booting)
        setTimeout(() => this.syncDailySpending().catch(e =>
            console.warn('Wise initial sync:', e.message)), 15000);
        // Repeat every 6 hours
        this._interval = setInterval(() =>
            this.syncDailySpending().catch(e =>
                console.warn('Wise sync:', e.message)), 6 * 60 * 60 * 1000);
    }

    /**
     * Get profile ID if not set — auto-detects from API
     */
    async getProfileId() {
        if (this.profileId) {
            return this.profileId;
        }

        if (!this.apiToken) {
            return null;
        }

        try {
            const response = await fetch(`${this.baseUrl}/v1/profiles`, {
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Wise API error: ${response.status}`);
            }

            const profiles = await response.json();
            if (profiles.length > 0) {
                this.profileId = profiles[0].id;
                return this.profileId;
            }
            return null;
        } catch (error) {
            console.error('Error fetching Wise profile:', error);
            return null;
        }
    }

    /**
     * Fetch transfers (outgoing payments) for a date range.
     * Uses /v1/transfers endpoint which returns completed transfers.
     */
    async fetchTransfers(startDate, endDate) {
        if (!this.apiToken) return null;

        try {
            const profileId = await this.getProfileId();
            if (!profileId) {
                console.log('⚠️  Could not get Wise profile ID');
                return null;
            }

            const start = new Date(startDate).toISOString();
            const end = new Date(endDate).toISOString();
            const url = `${this.baseUrl}/v1/transfers?profile=${profileId}&createdDateStart=${start}&createdDateEnd=${end}&limit=100`;

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${this.apiToken}` }
            });

            if (!response.ok) {
                throw new Error(`Wise transfers API error: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error fetching Wise transfers:', error);
            return null;
        }
    }

    /**
     * Get balances across all currencies (v4 API).
     */
    async fetchBalances() {
        if (!this.apiToken) return null;
        try {
            const profileId = await this.getProfileId();
            if (!profileId) return null;
            const res = await fetch(`${this.baseUrl}/v4/profiles/${profileId}/balances?types=STANDARD`, {
                headers: { 'Authorization': `Bearer ${this.apiToken}` }
            });
            if (!res.ok) return null;
            return await res.json();
        } catch (e) { return null; }
    }

    /**
     * Sync spending data (monthly transfers sum from 1st to today).
     * Uses /v1/transfers — sums sourceValue of all outgoing transfers.
     */
    async syncDailySpending() {
        if (!this.apiToken) return;

        try {
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

            const transfers = await this.fetchTransfers(startOfMonth, now);
            if (!transfers || !transfers.length) {
                console.log('No Wise transfers found for this month');
                return;
            }

            let totalSpending = 0;
            for (const t of transfers) {
                // Only count outgoing (sent) transfers
                if (t.status === 'outgoing_payment_sent' || t.status === 'funds_converted') {
                    totalSpending += (t.sourceValue || 0);
                }
            }

            const todayStr = now.toISOString().split('T')[0];

            if (totalSpending > 0) {
                const sourceId = 'wise_spending_' + todayStr;
                const existing = db.prepare(
                    "SELECT id FROM finance_entries WHERE date = ? AND type = 'spending' AND source = 'wise'"
                ).get(todayStr);

                if (existing) {
                    db.prepare(
                        "UPDATE finance_entries SET amount = ?, is_synced = 1, source_id = ? WHERE date = ? AND type = 'spending' AND source = 'wise'"
                    ).run(totalSpending, sourceId, todayStr);
                } else {
                    db.prepare(
                        "INSERT INTO finance_entries (date, type, amount, account_type, source, is_synced, source_id) VALUES (?, ?, ?, ?, ?, 1, ?)"
                    ).run(todayStr, 'spending', totalSpending, 'personal', 'wise', sourceId);
                }
                console.log(`✅ Synced Wise spending (month-to-date): $${totalSpending.toFixed(2)}`);
            }
        } catch (error) {
            console.error('Error syncing Wise spending:', error);
        }
    }
}

module.exports = new WiseIntegration();
