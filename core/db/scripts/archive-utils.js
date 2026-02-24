/**
 * Archive Utilities
 * Shared helper functions for archival operations
 */

const db = require('../database');

/**
 * Archive a project to projects_archive
 * @param {number} projectId - Project ID to archive
 * @param {string} reason - Why it's being archived
 * @returns {boolean} Success
 */
function archiveProject(projectId, reason = 'Manual archive') {
    try {
        const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);

        if (!project) {
            console.error(`Project ${projectId} not found`);
            return false;
        }

        const archiveDate = new Date().toISOString().substring(0, 10);
        db.prepare(`
            INSERT INTO projects_archive (
                original_id, name, github_repo, last_updated, metrics,
                revenue_worst, revenue_base, revenue_lucky, hours_per_week,
                budget_to_invest, months_to_results, business_model, ai_assumptions,
                status, archive_reason, archive_date, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            projectId, project.name, project.github_repo, project.last_updated,
            project.metrics, project.revenue_worst, project.revenue_base, project.revenue_lucky,
            project.hours_per_week, project.budget_to_invest, project.months_to_results,
            project.business_model, project.ai_assumptions, project.status, reason,
            archiveDate,
            project.created_at
        );

        // Update status to archived instead of deleting
        db.prepare('UPDATE projects SET status = ? WHERE id = ?').run('archived', projectId);

        console.log(`✅ Archived project: ${project.name}`);
        return true;

    } catch (e) {
        console.error(`❌ Error archiving project:`, e.message);
        return false;
    }
}

/**
 * Archive a goal to goals_archive
 * @param {number} goalId - Goal ID to archive
 * @param {string} reason - Why it's being archived
 * @returns {boolean} Success
 */
function archiveGoal(goalId, reason = 'Manual archive') {
    try {
        const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(goalId);

        if (!goal) {
            console.error(`Goal ${goalId} not found`);
            return false;
        }

        db.prepare(`
            INSERT INTO goals_archive (
                original_id, title, description, parent_id, period_type, period_label,
                aspect, priority, status, outcome, outcome_notes, lessons_learned,
                completed_date, archive_reason, archive_date, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
        `).run(
            goalId, goal.title, goal.description, goal.parent_id, goal.period_type,
            goal.period_label, goal.aspect, goal.priority, goal.status, goal.outcome,
            goal.outcome_notes, goal.lessons_learned, goal.completed_date, reason,
            goal.created_at
        );

        // Delete from active table
        db.prepare('DELETE FROM goals WHERE id = ?').run(goalId);

        console.log(`✅ Archived goal: ${goal.title}`);
        return true;

    } catch (e) {
        console.error(`❌ Error archiving goal:`, e.message);
        return false;
    }
}

/**
 * Archive a scenario to scenarios_archive
 * @param {number} scenarioId - Scenario ID to archive
 * @param {string} reason - Why it's being archived
 * @returns {boolean} Success
 */
function archiveScenario(scenarioId, reason = 'Manual archive') {
    try {
        const scenario = db.prepare('SELECT * FROM scenarios WHERE id = ?').get(scenarioId);

        if (!scenario) {
            console.error(`Scenario ${scenarioId} not found`);
            return false;
        }

        db.prepare(`
            INSERT INTO scenarios_archive (
                original_id, project_id, key, name, thesis, description, goal_id,
                status, outcome, outcome_score, outcome_notes, lessons_learned,
                completed_date, result_summary, revenue_worst, revenue_base, revenue_lucky,
                start_date, end_date, archive_reason, archive_date, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
        `).run(
            scenarioId, scenario.project_id, scenario.key, scenario.name, scenario.thesis,
            scenario.description, scenario.goal_id, scenario.status, scenario.outcome,
            scenario.outcome_score, scenario.outcome_notes, scenario.lessons_learned,
            scenario.completed_date, scenario.result_summary, scenario.revenue_worst,
            scenario.revenue_base, scenario.revenue_lucky, scenario.start_date,
            scenario.end_date, reason,
            scenario.created_at
        );

        // Delete from active table
        db.prepare('DELETE FROM scenarios WHERE id = ?').run(scenarioId);

        console.log(`✅ Archived scenario: ${scenario.name}`);
        return true;

    } catch (e) {
        console.error(`❌ Error archiving scenario:`, e.message);
        return false;
    }
}

/**
 * Get archive statistics
 * @returns {object} Stats about archived data
 */
function getArchiveStats() {
    try {
        return {
            projects_archived: db.prepare('SELECT COUNT(*) as count FROM projects_archive').get().count,
            goals_archived: db.prepare('SELECT COUNT(*) as count FROM goals_archive').get().count,
            scenarios_archived: db.prepare('SELECT COUNT(*) as count FROM scenarios_archive').get().count,
            finance_months_archived: db.prepare('SELECT COUNT(*) as count FROM finance_monthly_archive').get().count,
            health_months_archived: db.prepare('SELECT COUNT(*) as count FROM health_monthly_archive').get().count,
            annual_reviews: db.prepare('SELECT COUNT(*) as count FROM annual_review').get().count
        };
    } catch (e) {
        console.error('❌ Error getting archive stats:', e.message);
        return null;
    }
}

/**
 * List archived projects
 * @param {string} year - Optional year filter (YYYY)
 * @returns {array} List of archived projects
 */
function listArchivedProjects(year = null) {
    try {
        let query = 'SELECT * FROM projects_archive';
        if (year) {
            query += ` WHERE strftime('%Y', archive_date) = ?`;
            return db.prepare(query).all(year);
        }
        return db.prepare(query).all();
    } catch (e) {
        console.error('❌ Error listing archived projects:', e.message);
        return [];
    }
}

/**
 * List archived goals
 * @param {string} outcome - Optional outcome filter (success/partial/failed)
 * @returns {array} List of archived goals
 */
function listArchivedGoals(outcome = null) {
    try {
        let query = 'SELECT * FROM goals_archive';
        if (outcome) {
            query += ` WHERE outcome = ?`;
            return db.prepare(query).all(outcome);
        }
        return db.prepare(query).all();
    } catch (e) {
        console.error('❌ Error listing archived goals:', e.message);
        return [];
    }
}

/**
 * Restore an archived item back to active table
 * @param {string} table - 'projects' | 'goals' | 'scenarios'
 * @param {number} archivedId - ID from archive table
 * @returns {boolean} Success
 */
function restoreFromArchive(table, archivedId) {
    try {
        if (table === 'projects') {
            const archived = db.prepare('SELECT * FROM projects_archive WHERE id = ?').get(archivedId);
            if (!archived) return false;

            const { id, archived_at, ...data } = archived;
            db.prepare(`
                INSERT INTO projects (${Object.keys(data).join(', ')})
                VALUES (${Object.keys(data).map(() => '?').join(', ')})
            `).run(...Object.values(data));

            db.prepare('DELETE FROM projects_archive WHERE id = ?').run(archivedId);
            console.log(`✅ Restored project: ${archived.name}`);
            return true;
        }

        if (table === 'goals') {
            const archived = db.prepare('SELECT * FROM goals_archive WHERE id = ?').get(archivedId);
            if (!archived) return false;

            const { id, archived_at, archive_reason, archive_date, ...data } = archived;
            db.prepare(`
                INSERT INTO goals (${Object.keys(data).join(', ')})
                VALUES (${Object.keys(data).map(() => '?').join(', ')})
            `).run(...Object.values(data));

            db.prepare('DELETE FROM goals_archive WHERE id = ?').run(archivedId);
            console.log(`✅ Restored goal: ${archived.title}`);
            return true;
        }

        if (table === 'scenarios') {
            const archived = db.prepare('SELECT * FROM scenarios_archive WHERE id = ?').get(archivedId);
            if (!archived) return false;

            const { id, archived_at, archive_reason, archive_date, ...data } = archived;
            db.prepare(`
                INSERT INTO scenarios (${Object.keys(data).join(', ')})
                VALUES (${Object.keys(data).map(() => '?').join(', ')})
            `).run(...Object.values(data));

            db.prepare('DELETE FROM scenarios_archive WHERE id = ?').run(archivedId);
            console.log(`✅ Restored scenario: ${archived.name}`);
            return true;
        }

        return false;

    } catch (e) {
        console.error(`❌ Error restoring from archive:`, e.message);
        return false;
    }
}

module.exports = {
    archiveProject,
    archiveGoal,
    archiveScenario,
    getArchiveStats,
    listArchivedProjects,
    listArchivedGoals,
    restoreFromArchive
};

// CLI when run directly: run from project root, e.g. node db/scripts/archive-utils.js stats
if (require.main === module) {
    const args = process.argv.slice(2);
    const cmd = args[0];
    if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
        console.log(`
Archive utils – run from project root:  node db/scripts/archive-utils.js <command> [args]

  stats                      Get archive counts
  archive-project <id> [reason]   Archive a project
  archive-goal <id> [reason]      Archive a goal
  archive-scenario <id> [reason]  Archive a scenario
  list-projects [year]            List archived projects (optional year: YYYY)
  list-goals [outcome]            List archived goals (optional: success|partial|failed)
  restore <table> <id>             Restore from archive (table: projects|goals|scenarios)

Examples:
  node db/scripts/archive-utils.js stats
  node db/scripts/archive-utils.js archive-project 1 "Shipped"
  node db/scripts/archive-utils.js list-goals success
  node db/scripts/archive-utils.js restore goals 2
`);
        process.exit(0);
    }
    if (cmd === 'stats') {
        console.log(getArchiveStats());
        process.exit(0);
    }
    if (cmd === 'archive-project') {
        const id = parseInt(args[1], 10);
        const reason = args[2] || 'Manual archive';
        if (!id) { console.error('Usage: archive-project <id> [reason]'); process.exit(1); }
        process.exit(archiveProject(id, reason) ? 0 : 1);
    }
    if (cmd === 'archive-goal') {
        const id = parseInt(args[1], 10);
        const reason = args[2] || 'Manual archive';
        if (!id) { console.error('Usage: archive-goal <id> [reason]'); process.exit(1); }
        process.exit(archiveGoal(id, reason) ? 0 : 1);
    }
    if (cmd === 'archive-scenario') {
        const id = parseInt(args[1], 10);
        const reason = args[2] || 'Manual archive';
        if (!id) { console.error('Usage: archive-scenario <id> [reason]'); process.exit(1); }
        process.exit(archiveScenario(id, reason) ? 0 : 1);
    }
    if (cmd === 'list-projects') {
        const year = args[1] || null;
        console.log(listArchivedProjects(year));
        process.exit(0);
    }
    if (cmd === 'list-goals') {
        const outcome = args[1] || null;
        console.log(listArchivedGoals(outcome));
        process.exit(0);
    }
    if (cmd === 'restore') {
        const table = args[1];
        const id = parseInt(args[2], 10);
        if (!table || !id || !['projects', 'goals', 'scenarios'].includes(table)) {
            console.error('Usage: restore <projects|goals|scenarios> <archive_id>');
            process.exit(1);
        }
        process.exit(restoreFromArchive(table, id) ? 0 : 1);
    }
    console.error('Unknown command:', cmd);
    process.exit(1);
}
