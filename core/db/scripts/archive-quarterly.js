/**
 * Quarterly Review & Archive Job
 * Runs at end of each quarter (Mar 31, Jun 30, Sep 30, Dec 31)
 *
 * Actions:
 * 1. Move completed/abandoned goals to goals_archive
 * 2. Move completed scenarios to scenarios_archive
 * 3. Create projection_quarterly_review (forecast vs actual analysis)
 * 4. Tag goals/scenarios with outcome if not already done
 *
 * Usage:
 *   node db/scripts/archive-quarterly.js              // Archive current quarter
 *   node db/scripts/archive-quarterly.js --quarter 2025-Q1  // Archive specific quarter
 *
 * Schedule (End of quarters at 3:00 AM):
 *   0 3 31 3,6,9,12 * cd /path/to/project && node db/scripts/archive-quarterly.js >> logs/archive.log 2>&1
 */

const db = require('../database');
const { notify } = require('./notify');

function getQuarterFromDate(date) {
    const d = new Date(date);
    const month = d.getMonth() + 1;
    const quarter = Math.ceil(month / 3);
    const year = d.getFullYear();
    return `${year}-Q${quarter}`;
}

function getCurrentQuarter() {
    return getQuarterFromDate(new Date());
}

function archiveCompletedGoals(quarter) {
    console.log(`[${new Date().toISOString()}] 🎯 Archiving completed goals from ${quarter}...`);

    try {
        // Find goals with status 'completed' or 'abandoned' that aren't archived yet
        const goalsToArchive = db.prepare(`
            SELECT id, title, description, parent_id, period_type, period_label, aspect, priority,
                   status, outcome, outcome_notes, lessons_learned, completed_date, created_at
            FROM goals
            WHERE status IN ('completed', 'abandoned')
              AND id NOT IN (SELECT original_id FROM goals_archive)
            ORDER BY completed_date DESC
        `).all();

        console.log(`   Found ${goalsToArchive.length} goals to archive`);

        for (const goal of goalsToArchive) {
            db.prepare(`
                INSERT INTO goals_archive (
                    original_id, title, description, parent_id, period_type, period_label, aspect,
                    priority, status, outcome, outcome_notes, lessons_learned, completed_date,
                    archive_reason, archive_date, created_at, archived_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            `).run(
                goal.id, goal.title, goal.description, goal.parent_id, goal.period_type,
                goal.period_label, goal.aspect, goal.priority, goal.status, goal.outcome,
                goal.outcome_notes, goal.lessons_learned, goal.completed_date,
                'Quarterly cleanup',
                new Date().toISOString().substring(0, 10),
                goal.created_at
            );

            // Delete from active table
            db.prepare('DELETE FROM goals WHERE id = ?').run(goal.id);
        }

        console.log(`✅ Archived ${goalsToArchive.length} goals`);

    } catch (e) {
        console.error(`❌ Error archiving goals:`, e.message);
    }
}

function archiveCompletedScenarios(quarter) {
    console.log(`[${new Date().toISOString()}] 🧪 Archiving completed scenarios from ${quarter}...`);

    try {
        // Find scenarios with status 'completed' or 'abandoned' that aren't archived yet
        const scenariosToArchive = db.prepare(`
            SELECT id, project_id, key, name, thesis, description, goal_id, status,
                   outcome, outcome_score, outcome_notes, lessons_learned, completed_date,
                   result_summary, revenue_worst, revenue_base, revenue_lucky,
                   start_date, end_date, created_at
            FROM scenarios
            WHERE status IN ('completed', 'abandoned')
              AND id NOT IN (SELECT original_id FROM scenarios_archive)
            ORDER BY completed_date DESC
        `).all();

        console.log(`   Found ${scenariosToArchive.length} scenarios to archive`);

        for (const scenario of scenariosToArchive) {
            db.prepare(`
                INSERT INTO scenarios_archive (
                    original_id, project_id, key, name, thesis, description, goal_id, status,
                    outcome, outcome_score, outcome_notes, lessons_learned, completed_date,
                    result_summary, revenue_worst, revenue_base, revenue_lucky,
                    start_date, end_date, archive_reason, archive_date, created_at, archived_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            `).run(
                scenario.id, scenario.project_id, scenario.key, scenario.name, scenario.thesis,
                scenario.description, scenario.goal_id, scenario.status, scenario.outcome,
                scenario.outcome_score, scenario.outcome_notes, scenario.lessons_learned,
                scenario.completed_date, scenario.result_summary, scenario.revenue_worst,
                scenario.revenue_base, scenario.revenue_lucky, scenario.start_date,
                scenario.end_date, 'Quarterly cleanup',
                new Date().toISOString().substring(0, 10),
                scenario.created_at
            );

            // Delete from active table
            db.prepare('DELETE FROM scenarios WHERE id = ?').run(scenario.id);
        }

        console.log(`✅ Archived ${scenariosToArchive.length} scenarios`);

    } catch (e) {
        console.error(`❌ Error archiving scenarios:`, e.message);
    }
}

function analyzeProjectionsVsActuals(quarter) {
    console.log(`[${new Date().toISOString()}] 📊 Analyzing projections vs actuals for ${quarter}...`);

    try {
        // Get active projection plans
        const plans = db.prepare(`
            SELECT id FROM projection_plans WHERE is_active = 1
        `).all();

        for (const plan of plans) {
            // Calculate forecast accuracy for this quarter
            const result = db.prepare(`
                SELECT
                    COUNT(DISTINCT pmv.stream_id) as forecast_count,
                    SUM(CASE WHEN ma.value IS NOT NULL THEN 1 ELSE 0 END) as actual_count,
                    AVG(CASE
                        WHEN ma.value IS NOT NULL AND pmv.value > 0
                        THEN ABS(pmv.value - ma.value) / pmv.value * 100
                        ELSE NULL
                    END) as avg_variance_pct
                FROM projection_month_values pmv
                LEFT JOIN monthly_actuals ma
                    ON pmv.stream_id = (SELECT id FROM projection_streams WHERE plan_id = ?)
                    AND pmv.value IS NOT NULL
                WHERE pmv.created_at >= datetime('now', '-3 months')
            `).get(plan.id);

            if (result.actual_count > 0) {
                const accuracy = Math.max(0, 100 - (result.avg_variance_pct || 0));

                db.prepare(`
                    INSERT OR REPLACE INTO projection_quarterly_review
                    (plan_id, quarter, forecast_accuracy_pct, created_at)
                    VALUES (?, ?, ?, datetime('now'))
                `).run(plan.id, quarter, Math.round(accuracy));
            }
        }

        console.log(`✅ Analyzed projections for ${plans.length} plans`);

    } catch (e) {
        console.error(`❌ Error analyzing projections:`, e.message);
    }
}

function runQuarterlyArchive() {
    const quarter = process.argv[2]?.replace('--quarter=', '') || getCurrentQuarter();

    console.log(`\n📊 Starting quarterly archive for ${quarter}...\n`);

    try {
        archiveCompletedGoals(quarter);
        archiveCompletedScenarios(quarter);
        analyzeProjectionsVsActuals(quarter);
        console.log(`\n✅ Quarterly archive complete\n`);
        notify('Life OS', `Quarterly archive complete for ${quarter}`);
    } catch (e) {
        notify('Life OS', `Quarterly archive failed: ${e.message}`);
        throw e;
    }
}

if (require.main === module) {
    try {
        runQuarterlyArchive();
        process.exit(0);
    } catch (e) {
        process.exit(1);
    }
}

module.exports = { archiveCompletedGoals, archiveCompletedScenarios, analyzeProjectionsVsActuals };
