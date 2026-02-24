/**
 * Yearly Summary & Review Job
 * Runs on January 1st to create annual retrospective
 *
 * Creates:
 * - annual_review: Year-in-review summary
 * - Analyzes projects shipped, pivoted, killed
 * - Financial summary (income, expenses, savings)
 * - Health trends and insights
 * - Social reach growth
 *
 * Usage:
 *   node db/scripts/archive-yearly.js              // Review previous year
 *   node db/scripts/archive-yearly.js --year 2024  // Review specific year
 *
 * Schedule (Jan 1 at 4:00 AM):
 *   0 4 1 1 * cd /path/to/project && node db/scripts/archive-yearly.js >> logs/archive.log 2>&1
 */

const db = require('../database');
const { notify } = require('./notify');

function getLastYear() {
    const today = new Date();
    return today.getFullYear() - 1;
}

function createAnnualReview(year) {
    console.log(`[${new Date().toISOString()}] 📖 Creating annual review for ${year}...`);

    try {
        // Count goals completed/abandoned
        const goalStats = db.prepare(`
            SELECT
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'abandoned' THEN 1 ELSE 0 END) as abandoned
            FROM goals_archive
            WHERE strftime('%Y', archive_date) = ?
        `).get(year.toString());

        // Get successful scenarios
        const successfulScenarios = db.prepare(`
            SELECT outcome, outcome_notes, lessons_learned
            FROM scenarios_archive
            WHERE strftime('%Y', archive_date) = ?
              AND outcome = 'success'
            ORDER BY archived_at DESC
            LIMIT 10
        `).all(year.toString());

        const majorWins = successfulScenarios
            .map(s => `${s.outcome_notes || 'Success'}`)
            .join('; ');

        // Get failed scenarios
        const failedScenarios = db.prepare(`
            SELECT outcome_notes, lessons_learned
            FROM scenarios_archive
            WHERE strftime('%Y', archive_date) = ?
              AND outcome = 'failed'
            ORDER BY archived_at DESC
            LIMIT 5
        `).all(year.toString());

        const majorFailures = failedScenarios
            .map(s => `${s.outcome_notes || 'Experiment failed'}`)
            .join('; ');

        // Financial summary for the year
        const financialSummary = db.prepare(`
            SELECT
                SUM(CASE WHEN total_revenue IS NOT NULL THEN total_revenue ELSE 0 END) as total_revenue,
                SUM(CASE WHEN total_expenses IS NOT NULL THEN total_expenses ELSE 0 END) as total_expenses,
                SUM(CASE WHEN net_income IS NOT NULL THEN net_income ELSE 0 END) as net_income
            FROM finance_monthly_archive
            WHERE strftime('%Y', period) = ?
        `).get(year.toString());

        const savingsRate = financialSummary.total_revenue > 0
            ? Math.round(((financialSummary.total_revenue - financialSummary.total_expenses) / financialSummary.total_revenue) * 100)
            : 0;

        // Health summary for the year
        const healthSummary = db.prepare(`
            SELECT
                AVG(avg_recovery) as avg_recovery,
                AVG(avg_sleep_hours) as avg_sleep_hours,
                AVG(avg_hrv) as avg_hrv,
                AVG(avg_strain) as avg_strain
            FROM health_monthly_archive
            WHERE strftime('%Y', month_year) = ?
        `).get(year.toString());

        // Project status
        const projectStatus = db.prepare(`
            SELECT
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as shipped,
                SUM(CASE WHEN status = 'paused' THEN 1 ELSE 0 END) as paused,
                COUNT(*) as total_active
            FROM projects
            WHERE created_at < datetime(?, '-12 months')
        `).get(`${year}-12-31`);

        // Social growth
        const startYear = db.prepare(`
            SELECT total_reach FROM social_metrics_daily
            WHERE strftime('%Y', date) = ?
            ORDER BY date ASC
            LIMIT 1
        `).get(year.toString());

        const endYear = db.prepare(`
            SELECT total_reach FROM social_metrics_daily
            WHERE strftime('%Y', date) = ?
            ORDER BY date DESC
            LIMIT 1
        `).get(year.toString());

        const socialGrowth = startYear && endYear && startYear.total_reach > 0
            ? Math.round(((endYear.total_reach - startYear.total_reach) / startYear.total_reach) * 100)
            : 0;

        const themes = [
            savingsRate > 30 ? '💰 Strong year financially' : '📈 Working on financial growth',
            healthSummary.avg_sleep_hours >= 7 ? '😴 Prioritized sleep' : '⚠️  Need better sleep',
            successfulScenarios.length > 3 ? '🎯 Successful experiments' : '🔄 Learning mode',
            socialGrowth > 20 ? '📱 Strong social growth' : '💬 Building audience'
        ].filter(Boolean).join('; ');

        // Insert annual review
        const existingReview = db.prepare(`
            SELECT 1 FROM annual_review WHERE year = ?
        `).get(year);

        if (existingReview) {
            db.prepare(`
                UPDATE annual_review
                SET goals_completed = ?, goals_abandoned = ?, major_wins = ?,
                    major_failures = ?, themes = ?, health_notes = ?,
                    wealth_notes = ?
                WHERE year = ?
            `).run(
                goalStats.completed || 0,
                goalStats.abandoned || 0,
                majorWins || 'N/A',
                majorFailures || 'N/A',
                themes,
                `Sleep: ${(healthSummary.avg_sleep_hours || 0).toFixed(1)}h | HRV: ${Math.round(healthSummary.avg_hrv || 0)} | Recovery: ${Math.round(healthSummary.avg_recovery || 0)}%`,
                `Revenue: ${(financialSummary.total_revenue || 0).toFixed(0)} | Expenses: ${(financialSummary.total_expenses || 0).toFixed(0)} | Savings Rate: ${savingsRate}%`,
                year
            );
        } else {
            db.prepare(`
                INSERT INTO annual_review (
                    year, goals_completed, goals_abandoned, major_wins, major_failures,
                    themes, health_notes, wealth_notes, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            `).run(
                year,
                goalStats.completed || 0,
                goalStats.abandoned || 0,
                majorWins || 'N/A',
                majorFailures || 'N/A',
                themes,
                `Sleep: ${(healthSummary.avg_sleep_hours || 0).toFixed(1)}h | HRV: ${Math.round(healthSummary.avg_hrv || 0)} | Recovery: ${Math.round(healthSummary.avg_recovery || 0)}%`,
                `Revenue: ${(financialSummary.total_revenue || 0).toFixed(0)} | Expenses: ${(financialSummary.total_expenses || 0).toFixed(0)} | Savings Rate: ${savingsRate}%`
            );
        }

        console.log(`✅ Annual review created for ${year}`);
        console.log(`   Goals: ${goalStats.completed || 0} completed, ${goalStats.abandoned || 0} abandoned`);
        console.log(`   Revenue: ${(financialSummary.total_revenue || 0).toFixed(0)} | Expenses: ${(financialSummary.total_expenses || 0).toFixed(0)}`);
        console.log(`   Social Growth: +${socialGrowth}%`);
        console.log(`   Themes: ${themes}`);

    } catch (e) {
        console.error(`❌ Error creating annual review:`, e.message);
    }
}

function runYearlyArchive() {
    const year = process.argv[2]?.replace('--year=', '') || getLastYear();

    console.log(`\n📖 Starting yearly archive for ${year}...\n`);

    try {
        createAnnualReview(parseInt(year));
        console.log(`\n✅ Yearly archive complete\n`);
        notify('Life OS', `Yearly archive complete for ${year}`);
    } catch (e) {
        notify('Life OS', `Yearly archive failed: ${e.message}`);
        throw e;
    }
}

if (require.main === module) {
    try {
        runYearlyArchive();
        process.exit(0);
    } catch (e) {
        process.exit(1);
    }
}

module.exports = { createAnnualReview };
