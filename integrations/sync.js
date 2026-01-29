/**
 * Sync Job Manager
 * Handles scheduled syncs for all integrations
 */

const whoop = require('./whoop');
const stripe = require('./stripe');
const wise = require('./wise');
const github = require('./github');
const soulinsocial = require('./soulinsocial');
const monthEnd = require('./month-end');

class SyncManager {
    constructor() {
        this.isRunning = false;
    }

    /**
     * Run daily syncs (health, spending)
     * Spending is synced monthly (from 1st to current date)
     */
    async runDailySync() {
        if (this.isRunning) {
            console.log('Sync already running, skipping...');
            return;
        }

        this.isRunning = true;
        console.log('🔄 Starting daily sync...');

        try {
            // Sync Whoop health metrics (yesterday's data)
            await whoop.syncDailyMetrics();

            // Sync Wise spending (month-to-date: 1st to today)
            await wise.syncDailySpending();

            console.log('✅ Daily sync completed');
        } catch (error) {
            console.error('❌ Error during daily sync:', error);
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Run weekly syncs (revenue, profit, social metrics)
     * Revenue/Expense/Profit are synced monthly (from 1st to current date)
     */
    async runWeeklySync() {
        if (this.isRunning) {
            console.log('Sync already running, skipping...');
            return;
        }

        this.isRunning = true;
        console.log('🔄 Starting weekly sync...');

        try {
            // Sync Stripe finance data (month-to-date: 1st to today)
            await stripe.syncMonthlyFinance();

            // Sync social metrics from soulinsocial
            await soulinsocial.syncSocialMetrics();

            // Check if we need to archive month-end totals
            await monthEnd.autoArchive();

            console.log('✅ Weekly sync completed');
        } catch (error) {
            console.error('❌ Error during weekly sync:', error);
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Run on-demand syncs (projects, scheduled posts)
     */
    async runOnDemandSync() {
        if (this.isRunning) {
            console.log('Sync already running, skipping...');
            return;
        }

        this.isRunning = true;
        console.log('🔄 Starting on-demand sync...');

        try {
            // Refresh GitHub project commit dates
            await github.refreshAllProjects();

            // Sync scheduled posts from soulinsocial
            await soulinsocial.getScheduledPosts(10); // Get more to sync

            console.log('✅ On-demand sync completed');
        } catch (error) {
            console.error('❌ Error during on-demand sync:', error);
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Run all syncs
     */
    async runAllSyncs() {
        await this.runDailySync();
        await this.runWeeklySync();
        await this.runOnDemandSync();
    }

    /**
     * Run month-end archive
     */
    async runMonthEndArchive() {
        if (this.isRunning) {
            console.log('Sync already running, skipping...');
            return;
        }

        this.isRunning = true;
        console.log('🔄 Starting month-end archive...');

        try {
            await monthEnd.archiveMonthEnd();
            console.log('✅ Month-end archive completed');
        } catch (error) {
            console.error('❌ Error during month-end archive:', error);
        } finally {
            this.isRunning = false;
        }
    }
}

module.exports = new SyncManager();
