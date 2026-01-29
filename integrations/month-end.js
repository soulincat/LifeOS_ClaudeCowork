/**
 * Month-End Archive Manager
 * Saves final monthly totals at the end of each month
 */

const db = require('../db/database');

class MonthEndManager {
    /**
     * Archive month-end totals
     * Saves final values for Revenue, Expense, Profit, Spending
     */
    async archiveMonthEnd() {
        const now = new Date();
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0); // Last day of previous month
        
        const monthStr = lastMonth.toISOString().slice(0, 7); // YYYY-MM
        const startDate = `${monthStr}-01`;
        const endDate = lastMonthEnd.toISOString().split('T')[0];

        console.log(`📊 Archiving month-end totals for ${monthStr}...`);

        try {
            // Check if already archived
            const checkStmt = db.prepare(`
                SELECT COUNT(*) as count FROM finance_entries
                WHERE date = ? AND type IN ('revenue', 'expense', 'profit', 'spending')
                AND source LIKE '%_month_end'
            `);
            const archived = checkStmt.get(endDate);

            if (archived.count > 0) {
                console.log(`⚠️  Month-end totals for ${monthStr} already archived`);
                return;
            }

            // Get month-to-date totals (from 1st to last day of month)
            // Use the most recent entry for each type (which contains month-to-date total)
            const totalsStmt = db.prepare(`
                SELECT type, amount as total, date
                FROM finance_entries
                WHERE date >= ? AND date <= ?
                AND type IN ('revenue', 'expense', 'profit', 'spending')
                AND source NOT LIKE '%_month_end'
                ORDER BY date DESC
            `);

            const totalsRaw = totalsStmt.all(startDate, endDate);
            
            // Get the most recent entry for each type (contains month-to-date total)
            const totals = [];
            const seenTypes = {};
            totalsRaw.forEach(item => {
                if (!seenTypes[item.type]) {
                    totals.push({ type: item.type, total: item.total });
                    seenTypes[item.type] = true;
                }
            });

            // Get latest snapshots (Investment, Asset, Total Net)
            const snapshotsStmt = db.prepare(`
                SELECT type, amount, date
                FROM finance_entries
                WHERE type IN ('investment', 'asset', 'total_net')
                AND date >= ? AND date <= ?
                ORDER BY date DESC
            `);

            const snapshotsRaw = snapshotsStmt.all(startDate, endDate);

            // Get the most recent snapshot for each type
            const snapshots = {};
            snapshotsRaw.forEach(item => {
                if (!snapshots[item.type] || new Date(item.date) > new Date(snapshots[item.type].date)) {
                    snapshots[item.type] = { amount: item.amount, date: item.date };
                }
            });

            // Save month-end totals
            const insertStmt = db.prepare(`
                INSERT INTO finance_entries (date, type, amount, account_type, source)
                VALUES (?, ?, ?, ?, ?)
            `);

            let archivedCount = 0;

            // Archive monthly totals
            totals.forEach(item => {
                const accountType = item.type === 'spending' ? 'personal' : 'business';
                insertStmt.run(
                    endDate,
                    item.type,
                    item.total,
                    accountType,
                    `${item.type === 'spending' ? 'wise' : 'stripe'}_month_end`
                );
                archivedCount++;
                console.log(`  ✅ Archived ${item.type}: $${item.total.toFixed(2)}`);
            });

            // Archive snapshots
            Object.keys(snapshots).forEach(type => {
                insertStmt.run(
                    endDate,
                    type,
                    snapshots[type].amount,
                    'personal',
                    'manual_month_end'
                );
                archivedCount++;
                console.log(`  ✅ Archived ${type}: $${snapshots[type].amount.toFixed(2)}`);
            });

            console.log(`✅ Month-end archive completed: ${archivedCount} entries saved for ${monthStr}`);
            return archivedCount;
        } catch (error) {
            console.error('❌ Error archiving month-end totals:', error);
            throw error;
        }
    }

    /**
     * Check if we should archive (run on last day of month)
     */
    shouldArchive() {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Archive if tomorrow is the 1st of next month (i.e., today is last day of month)
        return tomorrow.getDate() === 1;
    }

    /**
     * Auto-archive if it's the end of the month
     */
    async autoArchive() {
        if (this.shouldArchive()) {
            await this.archiveMonthEnd();
        }
    }
}

module.exports = new MonthEndManager();
