const express = require('express');
const router = express.Router();
const syncManager = require('../../integrations/sync');
const monthEnd = require('../../integrations/month-end');

/**
 * POST /api/sync/daily
 * Trigger daily sync (health, spending)
 */
router.post('/daily', async (req, res) => {
    try {
        await syncManager.runDailySync();
        res.json({ success: true, message: 'Daily sync completed' });
    } catch (error) {
        console.error('Error running daily sync:', error);
        res.status(500).json({ error: 'Failed to run daily sync' });
    }
});

/**
 * POST /api/sync/weekly
 * Trigger weekly sync (revenue, profit, social)
 */
router.post('/weekly', async (req, res) => {
    try {
        await syncManager.runWeeklySync();
        res.json({ success: true, message: 'Weekly sync completed' });
    } catch (error) {
        console.error('Error running weekly sync:', error);
        res.status(500).json({ error: 'Failed to run weekly sync' });
    }
});

/**
 * POST /api/sync/ondemand
 * Trigger on-demand sync (projects, posts)
 */
router.post('/ondemand', async (req, res) => {
    try {
        await syncManager.runOnDemandSync();
        res.json({ success: true, message: 'On-demand sync completed' });
    } catch (error) {
        console.error('Error running on-demand sync:', error);
        res.status(500).json({ error: 'Failed to run on-demand sync' });
    }
});

/**
 * POST /api/sync/all
 * Trigger all syncs
 */
router.post('/all', async (req, res) => {
    try {
        await syncManager.runAllSyncs();
        res.json({ success: true, message: 'All syncs completed' });
    } catch (error) {
        console.error('Error running all syncs:', error);
        res.status(500).json({ error: 'Failed to run syncs' });
    }
});

/**
 * POST /api/sync/month-end
 * Manually trigger month-end archive
 */
router.post('/month-end', async (req, res) => {
    try {
        const count = await monthEnd.archiveMonthEnd();
        res.json({ success: true, message: 'Month-end archive completed', entriesArchived: count });
    } catch (error) {
        console.error('Error archiving month-end:', error);
        res.status(500).json({ error: 'Failed to archive month-end totals' });
    }
});

module.exports = router;
