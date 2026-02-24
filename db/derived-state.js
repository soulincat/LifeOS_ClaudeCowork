/**
 * Derived State Engine
 * Reactive computations that run on data change, not on schedule.
 * - Health status derivation (red/yellow/green)
 * - Progress percentage from milestones
 * - Phase advancement
 * - Urgency scoring for inbox items
 * - Focus Card scoring
 */

const db = require('./database');

// ── Health Status Derivation ──────────────────────────────────────────────────
// Runs whenever a task, milestone, or dependency changes.
// RED: any blocker task is open
// YELLOW: timeline at risk (end within 7 days, progress < 80%) OR upstream hard-block is RED
// GREEN: everything else

function deriveHealthStatus(projectId) {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    if (!project) return null;

    let status = 'green';

    // Check for open blocker tasks
    const openBlockers = db.prepare(`
        SELECT COUNT(*) as count FROM project_tasks
        WHERE project_id = ? AND is_blocker = 1 AND status IN ('open', 'blocked')
    `).get(projectId);
    if (openBlockers.count > 0) {
        status = 'red';
    }

    if (status !== 'red') {
        // Check timeline risk: end date within 7 days and progress < 80%
        if (project.timeline_end) {
            const endDate = new Date(project.timeline_end);
            const now = new Date();
            const daysUntilEnd = (endDate - now) / (1000 * 60 * 60 * 24);
            if (daysUntilEnd <= 7 && (project.progress_pct || 0) < 80) {
                status = 'yellow';
            }
        }

        // Check upstream hard-block dependencies
        if (status === 'green') {
            const hardBlocks = db.prepare(`
                SELECT p.health_status FROM project_dependencies d
                JOIN projects p ON p.id = d.upstream_project_id
                WHERE d.downstream_project_id = ? AND d.is_hard_block = 1
            `).all(projectId);
            for (const dep of hardBlocks) {
                if (dep.health_status === 'red') {
                    status = 'yellow';
                    break;
                }
            }
        }
    }

    // Write back if changed
    if (project.health_status !== status) {
        db.prepare('UPDATE projects SET health_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(status, projectId);

        // Cascade: re-derive health for all downstream projects
        const downstream = db.prepare(`
            SELECT downstream_project_id FROM project_dependencies
            WHERE upstream_project_id = ?
        `).all(projectId);
        for (const dep of downstream) {
            deriveHealthStatus(dep.downstream_project_id);
        }
    }

    return status;
}

// ── Progress Percentage ───────────────────────────────────────────────────────
// progress_pct = SUM(weight WHERE complete) / SUM(all weights) * 100

function deriveProgress(projectId) {
    const result = db.prepare(`
        SELECT
            COALESCE(SUM(CASE WHEN status = 'complete' THEN weight ELSE 0 END), 0) as completed_weight,
            COALESCE(SUM(weight), 0) as total_weight
        FROM project_milestones
        WHERE project_id = ?
    `).get(projectId);

    const pct = result.total_weight > 0
        ? Math.round((result.completed_weight / result.total_weight) * 100)
        : 0;

    db.prepare('UPDATE projects SET progress_pct = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(pct, projectId);

    return pct;
}

// ── Phase Advancement ─────────────────────────────────────────────────────────
// When all milestones for the current phase are complete, advance to next phase.

function derivePhase(projectId) {
    const project = db.prepare('SELECT current_phase, phase_list FROM projects WHERE id = ?').get(projectId);
    if (!project || !project.phase_list) return null;

    let phases;
    try { phases = JSON.parse(project.phase_list); } catch (e) { return null; }
    if (!Array.isArray(phases) || phases.length === 0) return null;

    const currentPhase = project.current_phase || phases[0];
    const currentIdx = phases.indexOf(currentPhase);
    if (currentIdx === -1) return currentPhase;

    // Check if all milestones for current phase are complete
    const pending = db.prepare(`
        SELECT COUNT(*) as count FROM project_milestones
        WHERE project_id = ? AND phase = ? AND status != 'complete'
    `).get(projectId, currentPhase);

    const total = db.prepare(`
        SELECT COUNT(*) as count FROM project_milestones
        WHERE project_id = ? AND phase = ?
    `).get(projectId, currentPhase);

    // Only advance if there ARE milestones for this phase and ALL are complete
    if (total.count > 0 && pending.count === 0 && currentIdx < phases.length - 1) {
        const nextPhase = phases[currentIdx + 1];
        db.prepare('UPDATE projects SET current_phase = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(nextPhase, projectId);
        return nextPhase;
    }

    // Ensure current_phase is set if it wasn't
    if (!project.current_phase) {
        db.prepare('UPDATE projects SET current_phase = ? WHERE id = ?')
            .run(phases[0], projectId);
    }

    return project.current_phase || phases[0];
}

// ── Combined: run all derivations for a project ───────────────────────────────
function rederiveProject(projectId) {
    deriveProgress(projectId);
    derivePhase(projectId);
    deriveHealthStatus(projectId);
}

// ── Urgency Scoring ───────────────────────────────────────────────────────────
// Five components summed on inbox item insert

function computeUrgencyScore(item) {
    let score = 0;

    // VIP sender check (+40)
    if (item.sender_id) {
        const vip = db.prepare('SELECT 1 FROM vip_senders WHERE sender_id = ?').get(item.sender_id);
        if (vip) score += 40;
    }

    // Keyword detection (+30)
    const text = ((item.preview || '') + ' ' + (item.full_content || '')).toLowerCase();
    const urgentKeywords = ['approve', 'deadline', 'confirm', 'urgent', 'asap', 'by monday', 'by tuesday', 'by wednesday', 'by thursday', 'by friday', 'by tomorrow', 'by today', 'by end of'];
    if (urgentKeywords.some(kw => text.includes(kw))) score += 30;

    // Source-based scoring
    if (item.source === 'whatsapp') score += 10;
    if (item.source === 'gcal') {
        // Calendar event within 2 hours → +50
        if (item.timestamp) {
            const eventTime = new Date(item.timestamp);
            const now = new Date();
            const hoursUntil = (eventTime - now) / (1000 * 60 * 60);
            if (hoursUntil >= 0 && hoursUntil <= 2) score += 50;
        }
    }
    if (item.source === 'stripe' || item.source === 'wise') score += 5;

    // Unread and older than 6 hours → +15
    if (item.is_unread && item.timestamp) {
        const msgTime = new Date(item.timestamp);
        const now = new Date();
        const hoursOld = (now - msgTime) / (1000 * 60 * 60);
        if (hoursOld > 6) score += 15;
    }

    // Newsletter/automated detection (-40)
    const automatedKeywords = ['unsubscribe', 'no-reply', 'noreply', 'newsletter', 'digest', 'weekly roundup', 'marketing'];
    if (automatedKeywords.some(kw => text.includes(kw))) score -= 40;

    return Math.max(0, Math.min(100, score));
}

// ── Focus Card Scoring ────────────────────────────────────────────────────────
// Queries all open tasks in current phase, scores them, returns top one

function scoreFocusCard(whoopRecovery) {
    const recovery = whoopRecovery || 70; // default moderate
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const hour = now.getHours();

    // Get all active projects with their current phase
    const projects = db.prepare(`
        SELECT id, name, current_phase, priority_rank FROM projects
        WHERE status = 'active' ORDER BY priority_rank ASC
    `).all();

    let bestTask = null;
    let bestScore = -Infinity;

    for (const project of projects) {
        const tasks = db.prepare(`
            SELECT * FROM project_tasks
            WHERE project_id = ? AND status IN ('open', 'in_progress')
            AND (project_phase = ? OR project_phase IS NULL)
        `).all(project.id, project.current_phase);

        for (const task of tasks) {
            let score = 0;

            // Time pressure
            if (task.due_date) {
                const dueDate = new Date(task.due_date);
                const daysUntil = (dueDate - now) / (1000 * 60 * 60 * 24);
                if (daysUntil <= 0) score += 50;
                else if (daysUntil <= 3) score += 30;
                else if (daysUntil <= 7) score += 15;
            }

            // Blocking coefficient
            if (task.is_blocker) score += 40;
            if (task.blocks_task_ids) {
                try {
                    const blocked = JSON.parse(task.blocks_task_ids);
                    if (Array.isArray(blocked) && blocked.length > 0) score += 20;
                } catch (e) { /* */ }
            }

            // Project strategic weight multiplier
            const rank = project.priority_rank || 4;
            const multiplier = rank === 1 ? 1.8 : rank === 2 ? 1.5 : rank === 3 ? 1.2 : 1.0;
            score *= multiplier;

            // Energy match
            if (task.energy_required === 'high') {
                if (recovery < 60) score -= 30;
                else if (recovery >= 80) score += 15;
            }

            // Time of day
            if (task.type === 'deep_work' && hour < 12) score += 20;
            if (task.type === 'communication' && hour >= 13 && hour <= 16) score += 20;
            if (task.type === 'admin' && hour > 16) score += 15;

            if (score > bestScore) {
                bestScore = score;
                bestTask = {
                    ...task,
                    project_name: project.name,
                    project_priority: project.priority_rank,
                    score
                };
            }
        }
    }

    // Calendar override: if any event within 90 minutes, surface prep task
    try {
        const ninetyMinLater = new Date(now.getTime() + 90 * 60 * 1000).toISOString();
        const upcomingEvent = db.prepare(`
            SELECT * FROM upcoming_items
            WHERE type IN ('meeting', 'call', 'event')
            AND due_date >= ? AND due_date <= ?
            ORDER BY due_date ASC LIMIT 1
        `).get(now.toISOString(), ninetyMinLater);

        if (upcomingEvent) {
            return {
                task: null,
                override: 'calendar',
                event: upcomingEvent,
                text: `Prep for: ${upcomingEvent.title}`,
                description: upcomingEvent.description || '',
                meta: `Starts at ${new Date(upcomingEvent.due_date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
                project_name: null,
                score: 999
            };
        }
    } catch (e) { /* */ }

    if (!bestTask) return null;

    return {
        task: bestTask,
        text: bestTask.text,
        description: '',
        meta: bestTask.due_date ? `Due ${bestTask.due_date}` : (bestTask.is_blocker ? 'Blocker' : ''),
        project_name: bestTask.project_name,
        project_priority: bestTask.project_priority,
        score: bestScore
    };
}

module.exports = {
    deriveHealthStatus,
    deriveProgress,
    derivePhase,
    rederiveProject,
    computeUrgencyScore,
    scoreFocusCard
};
