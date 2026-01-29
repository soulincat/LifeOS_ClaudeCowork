const express = require('express');
const router = express.Router();
const db = require('../db/database');

/**
 * GET /api/finance
 * Get current month finance summary
 * Monthly totals are calculated from 1st of month to current date
 */
router.get('/', (req, res) => {
    try {
        const now = new Date();
        const month = req.query.month || now.toISOString().slice(0, 7); // YYYY-MM format
        const [year, monthNum] = month.split('-');
        
        // Calculate date range: 1st of month to today (or end of month if querying past month)
        const startDate = `${year}-${monthNum}-01`;
        const endDate = month === now.toISOString().slice(0, 7) 
            ? now.toISOString().split('T')[0]  // Current month: up to today
            : `${year}-${monthNum}-${new Date(parseInt(year), parseInt(monthNum), 0).getDate()}`; // Past month: end of month
        
        // Get monthly aggregates (from 1st to current date)
        // For month-to-date totals, we need the most recent entry for each type
        // SQLite doesn't support window functions in older versions, so use a simpler approach
        const monthlyStmt = db.prepare(`
            SELECT type, amount, date, id
            FROM finance_entries
            WHERE date >= ? AND date <= ?
            AND type IN ('revenue', 'profit', 'expense', 'spending')
            AND source NOT LIKE '%_month_end'
            ORDER BY type, date DESC, id DESC
        `);
        
        const monthlyRaw = monthlyStmt.all(startDate, endDate);
        
        // Get the first (most recent) entry for each type
        const monthly = [];
        const seenTypes = {};
        monthlyRaw.forEach(item => {
            if (!seenTypes[item.type]) {
                monthly.push({ type: item.type, total: item.amount });
                seenTypes[item.type] = true;
            }
        });
        
        // Get constant values (latest snapshot for current month, or most recent)
        const constantStmt = db.prepare(`
            SELECT type, amount, date
            FROM finance_entries
            WHERE type IN ('investment', 'asset', 'total_net', 'passive_yield')
            AND date >= ?
            ORDER BY date DESC
        `);
        
        const constantsRaw = constantStmt.all(startDate);
        
        // Get the most recent value for each constant type
        const constants = {};
        constantsRaw.forEach(item => {
            if (!constants[item.type] || new Date(item.date) > new Date(constants[item.type].date)) {
                constants[item.type] = { amount: item.amount, date: item.date };
            }
        });
        
        // If no passive_yield entry, use default 2735 USD
        // Also check if there's a passive_yield entry outside the current month
        if (!constants['passive_yield']) {
            const passiveYieldStmt = db.prepare(`
                SELECT type, amount, date
                FROM finance_entries
                WHERE type = 'passive_yield'
                ORDER BY date DESC
                LIMIT 1
            `);
            const passiveYieldEntry = passiveYieldStmt.get();
            if (passiveYieldEntry) {
                constants['passive_yield'] = { amount: passiveYieldEntry.amount, date: passiveYieldEntry.date };
            } else {
                constants['passive_yield'] = { amount: 2735, date: endDate };
            }
        }
        
        // Format response
        const finance = {
            monthly: {},
            constants: {},
            period: {
                start: startDate,
                end: endDate
            }
        };
        
        // Convert array to object - use latest entry per type (month-to-date total)
        monthly.forEach(item => {
            const amount = Number(item.total);
            // Include 0 values, only skip null/undefined/NaN
            if (amount !== null && amount !== undefined && !isNaN(amount)) {
                finance.monthly[item.type] = amount;
            } else {
                // If no valid amount, set to 0
                finance.monthly[item.type] = 0;
            }
        });
        
        // Ensure all types are present (even if 0)
        ['revenue', 'profit', 'expense', 'spending'].forEach(type => {
            if (finance.monthly[type] === undefined) {
                finance.monthly[type] = 0;
            }
        });
        
        // Debug logging
        console.log(`Finance API: Found ${monthly.length} types, returning:`, JSON.stringify(finance.monthly));
        
        // Convert constants object to simple values
        Object.keys(constants).forEach(type => {
            const amount = Number(constants[type].amount);
            if (!isNaN(amount)) {
                finance.constants[type] = amount;
            }
        });
        
        // Ensure passive_yield is set (use default if not in database)
        if (!finance.constants.passive_yield) {
            finance.constants.passive_yield = 2735;
        }
        
        // Calculate passive yield percentage from investment
        const investment = finance.constants.investment || 0;
        const passiveYield = finance.constants.passive_yield || 2735;
        if (investment > 0 && passiveYield > 0) {
            finance.constants.passive_yield_percentage = (passiveYield / investment) * 100;
        } else {
            finance.constants.passive_yield_percentage = 0;
        }
        
        res.json(finance);
    } catch (error) {
        console.error('Error fetching finance data:', error);
        res.status(500).json({ error: 'Failed to fetch finance data' });
    }
});

/**
 * GET /api/finance/history
 * Get finance history
 * Uses month-end archived values when available, otherwise calculates from entries
 */
router.get('/history', (req, res) => {
    try {
        const months = parseInt(req.query.months) || 12;
        
        // Get month-end archived values first (final monthly totals)
        const monthEndStmt = db.prepare(`
            SELECT strftime('%Y-%m', date) as month, type, amount as total
            FROM finance_entries
            WHERE date >= date('now', '-' || ? || ' months')
            AND source LIKE '%_month_end'
            ORDER BY date DESC
        `);
        
        const monthEndData = monthEndStmt.all(months);
        
        // Group by month and type
        const historyMap = {};
        monthEndData.forEach(item => {
            const key = `${item.month}_${item.type}`;
            if (!historyMap[key]) {
                historyMap[key] = { month: item.month, type: item.type, total: item.total };
            }
        });
        
        // For months without archived data, calculate from entries
        const calculateStmt = db.prepare(`
            SELECT strftime('%Y-%m', date) as month, type, SUM(amount) as total
            FROM finance_entries
            WHERE date >= date('now', '-' || ? || ' months')
            AND source NOT LIKE '%_month_end'
            GROUP BY month, type
        `);
        
        const calculatedData = calculateStmt.all(months);
        
        // Fill in missing months with calculated values
        calculatedData.forEach(item => {
            const key = `${item.month}_${item.type}`;
            if (!historyMap[key]) {
                historyMap[key] = { month: item.month, type: item.type, total: item.total };
            }
        });
        
        // Convert to array and sort
        const history = Object.values(historyMap).sort((a, b) => {
            if (a.month !== b.month) {
                return b.month.localeCompare(a.month);
            }
            return a.type.localeCompare(b.type);
        });
        
        res.json(history);
    } catch (error) {
        console.error('Error fetching finance history:', error);
        res.status(500).json({ error: 'Failed to fetch finance history' });
    }
});

/**
 * POST /api/finance
 * Add finance entry (manual input)
 */
router.post('/', (req, res) => {
    try {
        const { date, type, amount, account_type, source } = req.body;
        const targetDate = date || new Date().toISOString().split('T')[0];

        const stmt = db.prepare(`
            INSERT INTO finance_entries (date, type, amount, account_type, source)
            VALUES (?, ?, ?, ?, ?)
        `);

        stmt.run(targetDate, type, amount, account_type || 'personal', source || 'manual');
        res.json({ success: true });
    } catch (error) {
        console.error('Error adding finance entry:', error);
        res.status(500).json({ error: 'Failed to add finance entry' });
    }
});

module.exports = router;
