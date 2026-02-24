const db = require('../db/database');

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
        this.profileId = process.env.WISE_PROFILE_ID;
        this.baseUrl = 'https://api.transferwise.com';
    }

    /**
     * Get profile ID if not set
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
     * Fetch transactions for a date range
     */
    async fetchTransactions(startDate, endDate, accountId = null) {
        if (!this.apiToken) {
            return null;
        }

        try {
            const profileId = await this.getProfileId();
            if (!profileId) {
                console.log('⚠️  Could not get Wise profile ID');
                return null;
            }

            // If accountId not provided, get first account
            if (!accountId) {
                const balancesResponse = await fetch(
                    `${this.baseUrl}/v1/profiles/${profileId}/balances`,
                    {
                        headers: {
                            'Authorization': `Bearer ${this.apiToken}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );

                if (!balancesResponse.ok) {
                    throw new Error(`Wise API error: ${balancesResponse.status}`);
                }

                const balances = await balancesResponse.json();
                if (balances.length === 0) {
                    console.log('⚠️  No Wise accounts found');
                    return null;
                }
                accountId = balances[0].id;
            }

            // Fetch transactions
            const startTimestamp = new Date(startDate).getTime();
            const endTimestamp = new Date(endDate).getTime();

            const response = await fetch(
                `${this.baseUrl}/v3/profiles/${profileId}/transactions?accountId=${accountId}&intervalStart=${startTimestamp}&intervalEnd=${endTimestamp}`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`Wise API error: ${response.status}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error fetching Wise transactions:', error);
            return null;
        }
    }

    /**
     * Sync spending data (monthly sync from 1st to current date)
     */
    async syncDailySpending() {
        if (!this.apiToken) {
            console.log('⚠️  Wise API token not configured');
            return;
        }

        try {
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

            // Fetch all transactions from 1st of month to today
            const transactions = await this.fetchTransactions(startOfMonth, today);
            
            if (!transactions || !transactions.content) {
                console.log('No Wise transactions found for this month');
                return;
            }

            let totalSpending = 0;

            // Process transactions (only outgoing/debit transactions)
            transactions.content.forEach(transaction => {
                if (transaction.type === 'DEBIT' || transaction.details?.type === 'DEBIT') {
                    const amount = Math.abs(transaction.amount?.value || transaction.amount || 0);
                    totalSpending += amount;
                }
            });

            const todayStr = now.toISOString().split('T')[0];

            if (totalSpending > 0) {
                // Check if entry exists for today
                const checkStmt = db.prepare(`
                    SELECT id FROM finance_entries 
                    WHERE date = ? AND type = 'spending' AND source = 'wise'
                `);
                const existing = checkStmt.get(todayStr);

                const sourceId = 'wise_spending_' + todayStr;
                if (existing) {
                    const updateStmt = db.prepare(`
                        UPDATE finance_entries SET amount = ?, is_synced = 1, source_id = ?
                        WHERE date = ? AND type = 'spending' AND source = 'wise'
                    `);
                    updateStmt.run(totalSpending, sourceId, todayStr);
                } else {
                    const stmt = db.prepare(`
                        INSERT INTO finance_entries (date, type, amount, account_type, source, is_synced, source_id)
                        VALUES (?, ?, ?, ?, ?, 1, ?)
                    `);
                    stmt.run(todayStr, 'spending', totalSpending, 'personal', 'wise', sourceId);
                }
                console.log(`✅ Synced Wise spending (month-to-date): $${totalSpending.toFixed(2)}`);
            }
        } catch (error) {
            console.error('Error syncing Wise spending:', error);
        }
    }
}

module.exports = new WiseIntegration();
