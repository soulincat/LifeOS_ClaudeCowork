#!/usr/bin/env node
const syncManager = require('../integrations/sync');
const type = process.argv[2] || 'daily';

(async () => {
    try {
        switch(type) {
            case 'daily':
                await syncManager.runDailySync();
                break;
            case 'weekly':
                await syncManager.runWeeklySync();
                break;
            case 'ondemand':
                await syncManager.runOnDemandSync();
                break;
            case 'monthend':
                await syncManager.runMonthEndArchive();
                break;
            case 'all':
                await syncManager.runAllSyncs();
                break;
            default:
                console.log('Unknown sync type:', type);
        }
        process.exit(0);
    } catch (error) {
        console.error('Sync error:', error);
        process.exit(1);
    }
})();
