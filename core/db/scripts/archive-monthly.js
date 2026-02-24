/**
 * Monthly Archival Job
 * Runs on the 1st of each month to create snapshots
 *
 * Creates:
 * - finance_monthly_archive: Monthly P&L summary
 * - health_monthly_archive: Monthly health metrics average
 * - social_metrics_daily: Nightly sync already maintains this
 *
 * Usage:
 *   node db/scripts/archive-monthly.js              // Archive previous month
 *   node db/scripts/archive-monthly.js --month 2025-02  // Archive specific month
 *
 * Schedule (1st of each month at 2:00 AM):
 *   0 2 1 * * cd /path/to/project && node db/scripts/archive-monthly.js >> logs/archive.log 2>&1
 */

const db = require('../database');
const { notify } = require('./notify');

function getLastMonth() {
    const today = new Date();
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    return lastMonth.toISOString().substring(0, 7); // YYYY-MM format
}

function archiveMonthlyFinance(period) {
    console.log(`[${new Date().toISOString()}] 💰 Archiving finance for ${period}...`);

    try {
        // Get all finance entries for the month
        const entries = db.prepare(`
            SELECT type, amount, source
            FROM finance_entries
            WHERE strftime('%Y-%m', date) = ?
        `).all(period);

        if (entries.length === 0) {
            console.log(`   No finance data for ${period}`);
            return;
        }

        // Calculate summary
        let totalRevenue = 0;
        let totalExpenses = 0;
        const byType = {};

        for (const entry of entries) {
            const amount = parseFloat(entry.amount) || 0;
            byType[entry.type] = (byType[entry.type] || 0) + amount;

            if (['revenue', 'passive_yield', 'asset'].includes(entry.type)) {
                totalRevenue += amount;
            } else if (['expense', 'spending', 'investment'].includes(entry.type)) {
                totalExpenses += amount;
            }
        }

        const netIncome = totalRevenue - totalExpenses;

        // Insert or update archive
        db.prepare(`
            INSERT INTO finance_monthly_archive (period, total_revenue, total_expenses, net_income, by_type, created_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(period) DO UPDATE SET
                total_revenue = excluded.total_revenue,
                total_expenses = excluded.total_expenses,
                net_income = excluded.net_income,
                by_type = excluded.by_type
        `).run(period, totalRevenue, totalExpenses, netIncome, JSON.stringify(byType));

        console.log(`✅ Finance archived: ${period} | Revenue: ${totalRevenue} | Expenses: ${totalExpenses} | Net: ${netIncome}`);

    } catch (e) {
        console.error(`❌ Error archiving finance for ${period}:`, e.message);
    }
}

function archiveMonthlyHealth(monthYear) {
    console.log(`[${new Date().toISOString()}] ❤️  Archiving health for ${monthYear}...`);

    try {
        // Get all health data for the month
        const data = db.prepare(`
            SELECT recovery, sleep_hours, hrv, strain, sleep_performance_pct
            FROM health_daily_data
            WHERE strftime('%Y-%m', date) = ?
        `).all(monthYear);

        if (data.length === 0) {
            console.log(`   No health data for ${monthYear}`);
            return;
        }

        // Calculate averages
        const avgRecovery = data.reduce((sum, d) => sum + (d.recovery || 0), 0) / data.length;
        const avgSleepHours = data.reduce((sum, d) => sum + (d.sleep_hours || 0), 0) / data.length;
        const avgHrv = Math.round(data.reduce((sum, d) => sum + (d.hrv || 0), 0) / data.length);
        const avgStrain = (data.reduce((sum, d) => sum + (d.strain || 0), 0) / data.length).toFixed(2);
        const avgSleepPerformance = Math.round(data.reduce((sum, d) => sum + (d.sleep_performance_pct || 0), 0) / data.length);

        // Insert or update archive
        db.prepare(`
            INSERT INTO health_monthly_archive (month_year, avg_recovery, avg_sleep_hours, avg_hrv, avg_strain, sleep_performance_avg, created_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(month_year) DO UPDATE SET
                avg_recovery = excluded.avg_recovery,
                avg_sleep_hours = excluded.avg_sleep_hours,
                avg_hrv = excluded.avg_hrv,
                avg_strain = excluded.avg_strain,
                sleep_performance_avg = excluded.sleep_performance_avg
        `).run(monthYear, avgRecovery, avgSleepHours, avgHrv, avgStrain, avgSleepPerformance);

        console.log(`✅ Health archived: ${monthYear} | Sleep: ${avgSleepHours.toFixed(1)}h | Recovery: ${avgRecovery.toFixed(0)}% | HRV: ${avgHrv}`);

    } catch (e) {
        console.error(`❌ Error archiving health for ${monthYear}:`, e.message);
    }
}

function runMonthlyArchive() {
    const period = process.argv[2]?.replace('--month=', '') || getLastMonth();

    console.log(`\n📦 Starting monthly archive for ${period}...\n`);

    try {
        archiveMonthlyFinance(period);
        archiveMonthlyHealth(period);
        console.log(`\n✅ Monthly archive complete\n`);
        notify('Life OS', `Monthly archive complete for ${period}`);
    } catch (e) {
        notify('Life OS', `Monthly archive failed: ${e.message}`);
        throw e;
    }
}

if (require.main === module) {
    try {
        runMonthlyArchive();
        process.exit(0);
    } catch (e) {
        process.exit(1);
    }
}

module.exports = { archiveMonthlyFinance, archiveMonthlyHealth };
