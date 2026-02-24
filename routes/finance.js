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
        
        // Constants: use most recent value ever (any date) so last month's data still shows until you add new
        const constantStmt = db.prepare(`
            SELECT type, amount, date
            FROM finance_entries
            WHERE type IN ('investment', 'asset', 'total_net', 'passive_yield')
            ORDER BY date DESC
        `);
        const constantsRaw = constantStmt.all();
        const constants = {};
        constantsRaw.forEach(item => {
            if (!constants[item.type]) {
                constants[item.type] = { amount: item.amount, date: item.date };
            }
        });
        // passive_yield only if user has entered it (no default)
        
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
        
        // Calculate passive yield percentage from investment (only if both exist)
        const investment = finance.constants.investment || 0;
        const passiveYield = finance.constants.passive_yield || 0;
        if (investment > 0 && passiveYield > 0) {
            finance.constants.passive_yield_percentage = (passiveYield / investment) * 100;
        } else {
            finance.constants.passive_yield_percentage = 0;
        }
        
        // Total net = investment + asset (always computed)
        finance.constants.total_net = investment + (finance.constants.asset || 0);
        
        // Synced sources in this month (for "Synced from Stripe/Wise" badge)
        const syncedStmt = db.prepare(`
            SELECT DISTINCT source FROM finance_entries
            WHERE date >= ? AND date <= ? AND is_synced = 1 AND source IN ('stripe', 'wise')
        `);
        const syncedRows = syncedStmt.all(startDate, endDate);
        finance.synced_sources = syncedRows.map(r => r.source).filter(Boolean);
        
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
 * GET /api/finance/entries
 * List all finance_entries (raw) — to verify what's in the DB. App never deletes these.
 */
router.get('/entries', (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT id, date, type, amount, account_type, source, is_synced, source_id, created_at
            FROM finance_entries
            ORDER BY date DESC, id DESC
        `).all();
        const path = require('path');
        const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, '..', 'lifeos.db');
        res.json({
            db_path: dbPath,
            count: rows.length,
            entries: rows
        });
    } catch (error) {
        console.error('Error listing finance entries:', error);
        res.status(500).json({ error: 'Failed to list finance entries' });
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
            INSERT INTO finance_entries (date, type, amount, account_type, source, is_synced)
            VALUES (?, ?, ?, ?, ?, 0)
        `);

        stmt.run(targetDate, type, amount, account_type || 'personal', source || 'manual');
        res.json({ success: true });
    } catch (error) {
        console.error('Error adding finance entry:', error);
        res.status(500).json({ error: 'Failed to add finance entry' });
    }
});

/**
 * PATCH /api/finance/entries/:id
 * Update a finance entry. Rejects if is_synced (Stripe/Wise).
 */
router.patch('/entries/:id', (req, res) => {
    try {
        const id = req.params.id;
        const row = db.prepare('SELECT id, is_synced FROM finance_entries WHERE id = ?').get(id);
        if (!row) return res.status(404).json({ error: 'Entry not found' });
        if (row.is_synced) return res.status(403).json({ error: 'Synced entries (Stripe/Wise) cannot be edited. Add a manual entry to override.' });
        const { date, type, amount, account_type, source } = req.body;
        const updates = [];
        const values = [];
        if (date !== undefined) { updates.push('date = ?'); values.push(date); }
        if (type !== undefined) { updates.push('type = ?'); values.push(type); }
        if (amount !== undefined) { updates.push('amount = ?'); values.push(Number(amount)); }
        if (account_type !== undefined) { updates.push('account_type = ?'); values.push(account_type); }
        if (source !== undefined) { updates.push('source = ?'); values.push(source); }
        if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
        values.push(id);
        db.prepare('UPDATE finance_entries SET ' + updates.join(', ') + ' WHERE id = ?').run(...values);
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating finance entry:', error);
        res.status(500).json({ error: 'Failed to update finance entry' });
    }
});

/**
 * DELETE /api/finance/entries/:id
 * Delete a finance entry. Rejects if is_synced (Stripe/Wise).
 */
router.delete('/entries/:id', (req, res) => {
    try {
        const id = req.params.id;
        const row = db.prepare('SELECT id, is_synced FROM finance_entries WHERE id = ?').get(id);
        if (!row) return res.status(404).json({ error: 'Entry not found' });
        if (row.is_synced) return res.status(403).json({ error: 'Synced entries (Stripe/Wise) cannot be deleted.' });
        db.prepare('DELETE FROM finance_entries WHERE id = ?').run(id);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting finance entry:', error);
        res.status(500).json({ error: 'Failed to delete finance entry' });
    }
});

module.exports = router;
