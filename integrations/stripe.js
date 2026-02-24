const db = require('../db/database');

/**
 * Stripe API Integration (Optional)
 * Fetches revenue and profit data from Stripe
 * Weekly sync: Aggregates data for current month
 */
class StripeIntegration {
    constructor() {
        this.apiKey = process.env.STRIPE_SECRET_KEY;
        this.stripe = null;
        
        if (this.apiKey) {
            try {
                const Stripe = require('stripe');
                this.stripe = new Stripe(this.apiKey);
                console.log('✅ Stripe integration initialized');
            } catch (error) {
                console.log('⚠️  Stripe SDK not installed. Install with: npm install stripe');
            }
        }
    }

    /**
     * Fetch revenue for a date range
     */
    async fetchRevenue(startDate, endDate) {
        if (!this.apiKey || !this.stripe) {
            return null;
        }

        try {
            const startTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
            const endTimestamp = Math.floor(new Date(endDate).getTime() / 1000);

            // Get all successful charges/payments
            const charges = await this.stripe.charges.list({
                created: { gte: startTimestamp, lte: endTimestamp },
                limit: 100
            });

            // Also get successful payment intents
            const paymentIntents = await this.stripe.paymentIntents.list({
                created: { gte: startTimestamp, lte: endTimestamp },
                limit: 100
            });

            let totalRevenue = 0;

            // Sum up successful charges
            charges.data.forEach(charge => {
                if (charge.paid && charge.status === 'succeeded') {
                    totalRevenue += charge.amount; // Amount is in cents
                }
            });

            // Sum up successful payment intents
            paymentIntents.data.forEach(intent => {
                if (intent.status === 'succeeded') {
                    totalRevenue += intent.amount; // Amount is in cents
                }
            });

            return totalRevenue / 100; // Convert cents to dollars
        } catch (error) {
            console.error('Error fetching Stripe revenue:', error);
            return null;
        }
    }

    /**
     * Fetch expenses (refunds, fees) for a date range
     */
    async fetchExpenses(startDate, endDate) {
        if (!this.apiKey || !this.stripe) {
            return null;
        }

        try {
            const startTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
            const endTimestamp = Math.floor(new Date(endDate).getTime() / 1000);

            // Get refunds
            const refunds = await this.stripe.refunds.list({
                created: { gte: startTimestamp, lte: endTimestamp },
                limit: 100
            });

            // Get balance transactions (fees)
            const balanceTransactions = await this.stripe.balanceTransactions.list({
                created: { gte: startTimestamp, lte: endTimestamp },
                limit: 100
            });

            let totalExpenses = 0;

            // Sum refunds
            refunds.data.forEach(refund => {
                if (refund.status === 'succeeded') {
                    totalExpenses += refund.amount; // Amount is in cents
                }
            });

            // Sum fees (negative amounts in balance transactions)
            balanceTransactions.data.forEach(transaction => {
                if (transaction.type === 'charge' && transaction.fee) {
                    totalExpenses += transaction.fee; // Fee is in cents
                }
            });

            return totalExpenses / 100; // Convert cents to dollars
        } catch (error) {
            console.error('Error fetching Stripe expenses:', error);
            return null;
        }
    }

    /**
     * Sync finance data for current month (weekly sync)
     * Calculates from 1st of month to current date
     */
    async syncMonthlyFinance() {
        if (!this.apiKey || !this.stripe) {
            console.log('⚠️  Stripe API key not configured');
            return;
        }

        try {
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

            // Fetch revenue and expenses from 1st to today
            const revenue = await this.fetchRevenue(startOfMonth, today);
            const expenses = await this.fetchExpenses(startOfMonth, today);

            const todayStr = now.toISOString().split('T')[0];

            // Update or insert revenue (use today's date for monthly-to-date entry)
            if (revenue !== null) {
                // Check if entry exists for today
                const checkStmt = db.prepare(`
                    SELECT id FROM finance_entries 
                    WHERE date = ? AND type = 'revenue' AND source = 'stripe'
                `);
                const existing = checkStmt.get(todayStr);

                const sourceId = 'stripe_revenue_' + todayStr;
                if (existing) {
                    const updateStmt = db.prepare(`
                        UPDATE finance_entries SET amount = ?, is_synced = 1, source_id = ?
                        WHERE date = ? AND type = 'revenue' AND source = 'stripe'
                    `);
                    updateStmt.run(revenue, sourceId, todayStr);
                } else {
                    const stmt = db.prepare(`
                        INSERT INTO finance_entries (date, type, amount, account_type, source, is_synced, source_id)
                        VALUES (?, ?, ?, ?, ?, 1, ?)
                    `);
                    stmt.run(todayStr, 'revenue', revenue, 'business', 'stripe', sourceId);
                }
                console.log(`✅ Synced Stripe revenue (month-to-date): $${revenue.toFixed(2)}`);
            }

            // Update or insert expenses
            if (expenses !== null && expenses > 0) {
                const checkStmt = db.prepare(`
                    SELECT id FROM finance_entries 
                    WHERE date = ? AND type = 'expense' AND source = 'stripe'
                `);
                const existing = checkStmt.get(todayStr);

                const sourceId = 'stripe_expense_' + todayStr;
                if (existing) {
                    const updateStmt = db.prepare(`
                        UPDATE finance_entries SET amount = ?, is_synced = 1, source_id = ?
                        WHERE date = ? AND type = 'expense' AND source = 'stripe'
                    `);
                    updateStmt.run(expenses, sourceId, todayStr);
                } else {
                    const stmt = db.prepare(`
                        INSERT INTO finance_entries (date, type, amount, account_type, source, is_synced, source_id)
                        VALUES (?, ?, ?, ?, ?, 1, ?)
                    `);
                    stmt.run(todayStr, 'expense', expenses, 'business', 'stripe', sourceId);
                }
                console.log(`✅ Synced Stripe expenses (month-to-date): $${expenses.toFixed(2)}`);
            }

            // Calculate and update profit
            if (revenue !== null && expenses !== null) {
                const profit = revenue - expenses;
                const checkStmt = db.prepare(`
                    SELECT id FROM finance_entries 
                    WHERE date = ? AND type = 'profit' AND source = 'stripe'
                `);
                const existing = checkStmt.get(todayStr);

                const sourceId = 'stripe_profit_' + todayStr;
                if (existing) {
                    const updateStmt = db.prepare(`
                        UPDATE finance_entries SET amount = ?, is_synced = 1, source_id = ?
                        WHERE date = ? AND type = 'profit' AND source = 'stripe'
                    `);
                    updateStmt.run(profit, sourceId, todayStr);
                } else {
                    const stmt = db.prepare(`
                        INSERT INTO finance_entries (date, type, amount, account_type, source, is_synced, source_id)
                        VALUES (?, ?, ?, ?, ?, 1, ?)
                    `);
                    stmt.run(todayStr, 'profit', profit, 'business', 'stripe', sourceId);
                }
                console.log(`✅ Synced Stripe profit (month-to-date): $${profit.toFixed(2)}`);
            }
        } catch (error) {
            console.error('Error syncing Stripe finance data:', error);
        }
    }
}

module.exports = new StripeIntegration();
