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

// ── User-configurable urgency keywords (cached per process) ──────────────────

const DEFAULT_URGENT_KEYWORDS = ['approve', 'deadline', 'confirm', 'urgent', 'asap', 'by monday', 'by tuesday', 'by wednesday', 'by thursday', 'by friday', 'by tomorrow', 'by today', 'by end of', 'invoice', 'payment', 'contract', 'overdue'];
let _cachedUrgentKeywords = null;

function getUserUrgencyKeywords() {
    if (_cachedUrgentKeywords) return _cachedUrgentKeywords;
    try {
        const row = db.prepare("SELECT payload FROM setup_sections WHERE section_key = 'user_priorities'").get();
        if (row && row.payload) {
            const prefs = JSON.parse(row.payload);
            if (Array.isArray(prefs.urgency_keywords) && prefs.urgency_keywords.length > 0) {
                _cachedUrgentKeywords = prefs.urgency_keywords.map(k => k.toLowerCase().trim()).filter(Boolean);
                return _cachedUrgentKeywords;
            }
        }
    } catch (e) { /* setup_sections may not exist yet */ }
    _cachedUrgentKeywords = DEFAULT_URGENT_KEYWORDS;
    return _cachedUrgentKeywords;
}

// ── Health Status Derivation ──────────────────────────────────────────────────
// Runs whenever a task, milestone, or dependency changes.
// RED: any blocker task is open
// YELLOW: timeline at risk (end within 7 days, progress < 80%) OR upstream hard-block is RED
// GREEN: everything else

const MAX_CASCADE_DEPTH = 10;

function deriveHealthStatus(projectId, _depth = 0, _visited = new Set()) {
    if (_depth > MAX_CASCADE_DEPTH) return null;
    if (_visited.has(projectId)) return null; // cycle guard
    _visited.add(projectId);

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
            deriveHealthStatus(dep.downstream_project_id, _depth + 1, _visited);
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

// ── Contact Lookup ────────────────────────────────────────────────────────────
// Find contact by any identifier (phone, email, whatsapp_jid)

function lookupContact(senderAddress) {
    if (!senderAddress) return null;
    const addr = String(senderAddress).trim();
    if (!addr) return null;
    return db.prepare(
        'SELECT * FROM contacts WHERE phone = ? OR email = ? OR whatsapp_jid = ? LIMIT 1'
    ).get(addr, addr, addr);
}

// ── Urgency Scoring ───────────────────────────────────────────────────────────
// Returns { score, tier, contact_id, project_id, category, blocked }
// Blocked contacts → { blocked: true } — caller should skip insert entirely

const RELATIONSHIP_BOOSTS = {
    lover: 30, bestie: 25, key_partner: 20,
    client: 15, investor: 15, co_founder: 15,
    vendor: 5, acquaintance: 0, other: 0
};

function deriveTier(score, isBlocked, isIgnored) {
    if (isBlocked) return 'blocked';
    if (isIgnored) return 'ignored';
    if (score >= 50) return 'urgent';
    if (score >= 5) return 'medium';
    return 'ignored';
}

function computeUrgencyScore(item) {
    let score = 0;
    const senderAddr = item.sender_id || item.sender_address;

    // 1. Contact reputation lookup
    const contact = lookupContact(senderAddr);
    if (contact) {
        if (contact.label === 'blocked') {
            return { score: 0, tier: 'blocked', contact_id: contact.id, project_id: contact.project_id || null, category: null, blocked: true };
        }
        if (contact.label === 'ignored') {
            return { score: 0, tier: 'ignored', contact_id: contact.id, project_id: contact.project_id || null, category: null, blocked: false };
        }
        if (contact.label === 'vip') score += 40;
        score += RELATIONSHIP_BOOSTS[contact.relationship] || 0;
        score += contact.urgency_boost || 0;
    }

    // 2. Keyword detection (+30) — uses user-configured keywords or defaults
    const text = ((item.preview || '') + ' ' + (item.full_content || '') + ' ' + (item.subject || '')).toLowerCase();
    const urgentKeywords = getUserUrgencyKeywords();
    if (urgentKeywords.some(kw => text.includes(kw))) score += 30;

    // 3. Per-project keyword matching
    let matchedProject = null;
    try {
        const allKeywords = db.prepare(`
            SELECT pk.*, p.name as project_name FROM project_keywords pk
            JOIN projects p ON p.id = pk.project_id
            WHERE p.status = 'active'
        `).all();
        for (const kw of allKeywords) {
            if (text.includes(kw.keyword.toLowerCase())) {
                score += kw.boost || 20;
                if (!matchedProject) {
                    matchedProject = { id: kw.project_id, name: kw.project_name, category: kw.category };
                }
            }
        }
    } catch (e) { /* project_keywords may not exist yet */ }

    // 4. Source-based scoring
    if (item.source === 'whatsapp') score += 10;
    if (item.source === 'gcal') {
        if (item.timestamp) {
            const eventTime = new Date(item.timestamp);
            const now = new Date();
            const hoursUntil = (eventTime - now) / (1000 * 60 * 60);
            if (hoursUntil >= 0 && hoursUntil <= 2) score += 50;
        }
    }
    if (item.source === 'stripe' || item.source === 'wise') score += 5;

    // 5. Unread and older than 6 hours → +15
    if (item.is_unread && item.timestamp) {
        const msgTime = new Date(item.timestamp);
        const now = new Date();
        const hoursOld = (now - msgTime) / (1000 * 60 * 60);
        if (hoursOld > 6) score += 15;
    }

    // 6. Newsletter/automated detection (-40)
    const automatedKeywords = ['unsubscribe', 'no-reply', 'noreply', 'newsletter', 'digest', 'weekly roundup', 'marketing'];
    if (automatedKeywords.some(kw => text.includes(kw))) score -= 40;

    // 7. Auto-assign project from contact if no keyword match
    const projectId = matchedProject?.id || (contact?.project_id) || null;
    const category = matchedProject?.category || null;

    const clampedScore = Math.max(0, Math.min(100, score));
    return {
        score: clampedScore,
        tier: deriveTier(clampedScore, false, false),
        contact_id: contact?.id || null,
        project_id: projectId,
        category,
        blocked: false
    };
}

// ── Focus Card Scoring ────────────────────────────────────────────────────────
// Queries all open tasks in current phase, scores them, returns top one

function scoreFocusCard(whoopRecovery) {
    const recovery = whoopRecovery || 70; // default moderate
    const now = new Date();
    const hour = now.getHours();

    // Single query: join tasks with their project info (instead of N+1)
    const tasks = db.prepare(`
        SELECT t.*, p.name AS project_name, p.priority_rank, p.current_phase
        FROM project_tasks t
        JOIN projects p ON t.project_id = p.id
        WHERE p.status = 'active'
          AND t.status IN ('open', 'in_progress')
          AND (t.project_phase = p.current_phase OR t.project_phase IS NULL)
    `).all();

    let bestTask = null;
    let bestScore = -Infinity;

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
        const rank = task.priority_rank || 4;
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
                score
            };
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

// ── Action Tag Detection ─────────────────────────────────────────────────────
// Detects what action a message demands from its content/subject.

const ACTION_PATTERNS = [
    { tag: 'approval',      patterns: [/\bapprov/i, /\bsign off/i, /\breview and confirm/i, /\bplease confirm/i, /\bauthori[sz]/i, /\bpermission/i] },
    { tag: 'payment',       patterns: [/\binvoice/i, /\bpayment/i, /\btransfer/i, /\bamount due/i, /\boverdue/i, /\bbalance/i, /\bremittance/i] },
    { tag: 'deadline',      patterns: [/\bdeadline/i, /\bdue by\b/i, /\bby end of day/i, /\beod\b/i, /\bdue date/i, /\bexpir/i, /\blast day/i] },
    { tag: 'meeting',       patterns: [/\bmeeting\b/i, /\bcall\b/i, /\bzoom\b/i, /\bcalendar invite/i, /\bgoogle meet/i, /\bteams call/i, /\bschedule.*call/i] },
    { tag: 'reply_needed',  patterns: [/\bplease respond/i, /\blet me know/i, /\bwhat do you think/i, /\bcan you\b/i, /\bcould you\b/i, /\bget back to/i, /\bwaiting for.*(?:reply|response|answer)/i, /\bneed your\b/i] },
    { tag: 'question',      patterns: [/\?\s*$/, /^(?:what|how|when|where|who|why|which|is there|do you|are you|have you|can i|should)\b/i] },
];

/**
 * Detect action tag from message content + subject.
 * Returns one of: 'approval', 'payment', 'deadline', 'meeting', 'reply_needed', 'question', 'fyi'
 */
function detectActionTag(content, subject) {
    const text = ((content || '') + ' ' + (subject || '')).trim();
    if (!text) return 'fyi';

    for (const { tag, patterns } of ACTION_PATTERNS) {
        if (patterns.some(p => p.test(text))) return tag;
    }
    return 'fyi';
}

function clearUrgencyKeywordCache() {
    _cachedUrgentKeywords = null;
}

module.exports = {
    deriveHealthStatus,
    deriveProgress,
    derivePhase,
    rederiveProject,
    computeUrgencyScore,
    lookupContact,
    scoreFocusCard,
    detectActionTag,
    clearUrgencyKeywordCache
};
