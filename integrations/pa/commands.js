/**
 * PA Command Executor
 * Parses and executes structured commands issued by the PA (Claude).
 * Commands appear in the agent response as:
 *   COMMAND: command_name
 *   {"key": "value", ...}
 */

const db = require('../../core/db/database');

/**
 * Parse all COMMAND blocks from a Claude response string.
 * @param {string} text
 * @returns {Array<{command: string, params: object}>}
 */
function parseCommands(text) {
    if (!text) return [];
    const results = [];
    // Match: COMMAND: name\n{...json...}
    const regex = /COMMAND:\s*(\w+)\s*\n([\s\S]*?)(?=\nCOMMAND:|\n---|\n\n[A-Z]|$)/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
        const command = match[1].trim();
        const rawJson = match[2].trim();
        try {
            // Find the first complete JSON object in the block
            const jsonStart = rawJson.indexOf('{');
            const jsonEnd = rawJson.lastIndexOf('}');
            if (jsonStart !== -1 && jsonEnd !== -1) {
                const params = JSON.parse(rawJson.slice(jsonStart, jsonEnd + 1));
                results.push({ command, params });
            }
        } catch (e) {
            // If JSON is malformed, skip this command silently
        }
    }
    return results;
}

/**
 * Execute a single PA command against the database / API.
 * @param {string} command
 * @param {object} params
 * @returns {string} result description
 */
async function executeCommand(command, params) {
    const port = process.env.PORT || 3001;
    const base = `http://localhost:${port}`;

    try {
        switch (command) {
            case 'add_todo': {
                const body = { text: params.text };
                if (params.due_date) body.due_date = params.due_date;
                const res = await fetch(`${base}/api/todos`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                const data = await res.json();
                return res.ok ? `Todo added: "${params.text}"` : `Failed to add todo: ${data.error || 'unknown error'}`;
            }

            case 'add_upcoming': {
                const res = await fetch(`${base}/api/upcoming`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: params.title,
                        type: params.type || 'meeting',
                        due_date: params.due_date,
                        description: params.description || ''
                    })
                });
                const data = await res.json();
                return res.ok ? `Upcoming item added: "${params.title}" on ${params.due_date}` : `Failed: ${data.error || 'unknown'}`;
            }

            case 'reschedule_item': {
                const res = await fetch(`${base}/api/upcoming/${params.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ due_date: params.due_date })
                });
                return res.ok ? `Rescheduled item ${params.id} to ${params.due_date}` : 'Failed to reschedule';
            }

            case 'complete_todo': {
                const res = await fetch(`${base}/api/todos/${params.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ completed: true })
                });
                return res.ok ? `Todo ${params.id} marked complete` : 'Failed to complete todo';
            }

            case 'draft_email': {
                const stmt = db.prepare(`
                    INSERT INTO pa_drafts (subject, to_email, body, context_note, status)
                    VALUES (?, ?, ?, ?, 'draft')
                `);
                const result = stmt.run(
                    params.subject || '',
                    params.to_email || '',
                    params.body || '',
                    params.context_note || ''
                );
                return `Email draft saved (id: ${result.lastInsertRowid}) — subject: "${params.subject}"`;
            }

            case 'schedule_meeting': {
                // Add upcoming item + create email draft
                const upcomingRes = await fetch(`${base}/api/upcoming`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: params.title,
                        type: 'meeting',
                        due_date: params.due_date,
                        description: params.description || ''
                    })
                });
                const upcomingData = await upcomingRes.json();

                let draftResult = '';
                if (params.draft_subject && params.draft_body) {
                    const stmt = db.prepare(`
                        INSERT INTO pa_drafts (subject, to_email, body, context_note, status)
                        VALUES (?, ?, ?, ?, 'draft')
                    `);
                    stmt.run(params.draft_subject, params.to_email || '', params.draft_body, `Meeting: ${params.title}`);
                    draftResult = ' + email draft created';
                }

                return upcomingRes.ok
                    ? `Meeting scheduled: "${params.title}" on ${params.due_date}${draftResult}`
                    : `Failed to schedule meeting: ${upcomingData.error || 'unknown'}`;
            }

            case 'add_pa_note': {
                db.prepare(`
                    INSERT INTO pa_context (key, value, updated_at)
                    VALUES (?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
                `).run(params.key, params.value);
                return `PA note saved: ${params.key}`;
            }

            case 'add_project_task': {
                // params: project_id OR project_name, text, type?, due_date?, is_blocker?, energy_required?
                let projectId = params.project_id;
                if (!projectId && params.project_name) {
                    const p = db.prepare('SELECT id FROM projects WHERE name LIKE ? LIMIT 1').get(`%${params.project_name}%`);
                    if (p) projectId = p.id;
                }
                if (!projectId) return 'Failed: could not find project';
                const project = db.prepare('SELECT current_phase FROM projects WHERE id = ?').get(projectId);
                db.prepare(`
                    INSERT INTO project_tasks (project_id, text, type, is_blocker, energy_required, due_date, project_phase, created_via)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'pa_chat')
                `).run(projectId, params.text, params.type || 'deliverable', params.is_blocker ? 1 : 0,
                    params.energy_required || 'medium', params.due_date || null, project ? project.current_phase : null);
                try { require('../../core/db/derived-state').rederiveProject(projectId); } catch (e) { /* */ }
                return `Task added to project ${projectId}: "${params.text}"`;
            }

            case 'complete_project_task': {
                // params: task_id OR text (fuzzy match)
                let task;
                if (params.task_id) {
                    task = db.prepare('SELECT * FROM project_tasks WHERE id = ?').get(params.task_id);
                } else if (params.text) {
                    task = db.prepare("SELECT * FROM project_tasks WHERE text LIKE ? AND status != 'done' LIMIT 1").get(`%${params.text}%`);
                }
                if (!task) return 'Failed: task not found';
                db.prepare("UPDATE project_tasks SET status = 'done', completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(task.id);
                try { require('../../core/db/derived-state').rederiveProject(task.project_id); } catch (e) { /* */ }
                return `Task marked done: "${task.text}"`;
            }

            case 'update_next_action': {
                // params: project_id OR project_name, next_action
                let projectId = params.project_id;
                if (!projectId && params.project_name) {
                    const p = db.prepare('SELECT id FROM projects WHERE name LIKE ? LIMIT 1').get(`%${params.project_name}%`);
                    if (p) projectId = p.id;
                }
                if (!projectId) return 'Failed: could not find project';
                db.prepare('UPDATE projects SET next_action = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                    .run(params.next_action, projectId);
                return `Next action updated for project ${projectId}: "${params.next_action}"`;
            }

            case 'update_trigger': {
                // params: trigger_id OR title (fuzzy), actual_value
                let trigger;
                if (params.trigger_id) {
                    trigger = db.prepare('SELECT * FROM decision_triggers WHERE id = ?').get(params.trigger_id);
                } else if (params.title) {
                    trigger = db.prepare("SELECT * FROM decision_triggers WHERE title LIKE ? AND status = 'pending' LIMIT 1").get(`%${params.title}%`);
                }
                if (!trigger) return 'Failed: trigger not found';
                const actual = Number(params.actual_value);
                const thresh = Number(trigger.threshold);
                const op = trigger.operator || 'greater_than';
                let passed = false;
                if (op === 'greater_than') passed = actual > thresh;
                else if (op === 'less_than') passed = actual < thresh;
                else if (op === 'equals') passed = actual === thresh;
                db.prepare('UPDATE decision_triggers SET actual_value = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                    .run(actual, passed ? 'passed' : 'failed', trigger.id);
                return `Trigger "${trigger.title}" evaluated: actual ${actual} ${op} ${thresh} → ${passed ? 'PASSED' : 'FAILED'}`;
            }

            case 'add_inbox_item': {
                // params: source, sender_name?, sender_id?, preview, timestamp?
                const ts = params.timestamp || new Date().toISOString();
                const item = { source: params.source || 'manual', sender_name: params.sender_name, sender_id: params.sender_id, preview: params.preview, timestamp: ts, is_unread: true };
                let scoring = { score: 0, tier: 'medium', contact_id: null, project_id: null, category: null, blocked: false };
                try { scoring = require('../../core/db/derived-state').computeUrgencyScore(item); } catch (e) { /* */ }
                if (scoring.blocked) return `Skipped: sender is blocked`;
                db.prepare(`
                    INSERT INTO inbox_items (source, sender_name, sender_id, preview, timestamp, urgency_score, priority_tier, contact_id, category)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(item.source, item.sender_name || null, item.sender_id || null, item.preview || null, ts, scoring.score, scoring.tier, scoring.contact_id, scoring.category);
                return `Inbox item added: "${params.preview?.slice(0, 50)}"`;
            }

            default:
                return `Unknown PA command: ${command}`;
        }
    } catch (e) {
        return `Command error (${command}): ${e.message}`;
    }
}

/**
 * Parse and execute all commands found in a PA response.
 * @param {string} responseText
 * @returns {Promise<string[]>} array of result messages
 */
async function executeCommandsFromResponse(responseText) {
    const commands = parseCommands(responseText);
    if (!commands.length) return [];
    const results = await Promise.all(commands.map(({ command, params }) => executeCommand(command, params)));
    return results;
}

module.exports = { parseCommands, executeCommand, executeCommandsFromResponse };
