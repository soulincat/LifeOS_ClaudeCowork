/**
 * Apple Reminders Integration
 * Syncs the Life OS todos table to Apple Reminders via osascript (AppleScript).
 * - Incomplete todos → created/updated in Apple Reminders
 * - Todos completed in Apple Reminders → marked complete in Life OS
 * - Uses "Life OS" list in Reminders (created automatically if missing)
 */

const { execSync } = require('child_process');
const db = require('../../core/db/database');

const REMINDERS_LIST = 'Life OS';
const TASK_TAG_PREFIX = 'lifeos-task:';

/**
 * Escape a string for safe embedding in an AppleScript string literal.
 */
function escapeAS(str) {
    return (str || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Run an AppleScript and return stdout. Throws on error.
 */
function runAS(script) {
    return execSync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, {
        encoding: 'utf8',
        timeout: 10000
    }).trim();
}

/**
 * Run a multi-line AppleScript via a heredoc (safer for complex scripts).
 */
function runASScript(script) {
    const escaped = script.replace(/'/g, "'\"'\"'");
    return execSync(`osascript << 'ASEOF'\n${script}\nASOEF`, {
        encoding: 'utf8',
        timeout: 15000
    }).trim();
}

/**
 * Ensure the "Life OS" list exists in Reminders.
 */
function ensureList() {
    const script = `
tell application "Reminders"
    if not (exists list "${REMINDERS_LIST}") then
        make new list with properties {name: "${REMINDERS_LIST}"}
    end if
    return name of list "${REMINDERS_LIST}"
end tell`;
    runASScript(script);
}

/**
 * Create a reminder from a todo object. Returns the new reminder's ID.
 */
function createReminder(todo) {
    const name = escapeAS(todo.text);
    const dueDateLine = todo.due_date
        ? `set due date of newReminder to date "${new Date(todo.due_date + 'T09:00:00').toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })}"`
        : '';

    const script = `
tell application "Reminders"
    tell list "${REMINDERS_LIST}"
        set newReminder to make new reminder with properties {name: "${name}", body: "lifeos-id:${todo.id}"}
        ${dueDateLine}
        return id of newReminder
    end tell
end tell`;
    return runASScript(script);
}

/**
 * Update an existing reminder's name and due date.
 */
function updateReminder(appleId, todo) {
    const name = escapeAS(todo.text);
    const dueDateLine = todo.due_date
        ? `set due date of r to date "${new Date(todo.due_date + 'T09:00:00').toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })}"`
        : 'set due date of r to missing value';

    const script = `
tell application "Reminders"
    tell list "${REMINDERS_LIST}"
        set r to reminder id "${escapeAS(appleId)}"
        set name of r to "${name}"
        ${dueDateLine}
    end tell
end tell`;
    try { runASScript(script); } catch (e) { /* reminder may have been deleted */ }
}

/**
 * Get all reminders from the Life OS list with their completion status.
 * Returns array of {id, name, completed, body}
 */
function getAllReminders() {
    const script = `
tell application "Reminders"
    if not (exists list "${REMINDERS_LIST}") then return ""
    set output to ""
    repeat with r in reminders of list "${REMINDERS_LIST}"
        set rId to id of r
        set rName to name of r
        set rDone to completed of r
        set rBody to body of r
        set output to output & rId & "|" & rName & "|" & rDone & "|" & rBody & "\\n"
    end repeat
    return output
end tell`;
    try {
        const raw = runASScript(script);
        return raw.split('\n').filter(Boolean).map(line => {
            const parts = line.split('|');
            return {
                id: parts[0] || '',
                name: parts[1] || '',
                completed: parts[2] === 'true',
                body: parts[3] || ''
            };
        });
    } catch (e) {
        console.error('Error reading reminders:', e.message);
        return [];
    }
}

/**
 * Main sync function.
 * 1. Push incomplete Life OS todos → Apple Reminders
 * 2. Pull completions from Apple Reminders → Life OS
 */
async function syncTodos() {
    console.log('🍎 Starting Apple Reminders sync...');

    try {
        ensureList();
    } catch (e) {
        console.error('❌ Cannot access Apple Reminders:', e.message);
        console.error('   Make sure Reminders app is accessible (check System Settings → Privacy → Automation)');
        return { pushed: 0, completed: 0, error: e.message };
    }

    let pushed = 0;
    let completed = 0;

    // ── Push: Life OS todos → Apple Reminders ───────────────────────────────
    const incompleteTodos = db.prepare(`
        SELECT id, text, due_date, apple_reminder_id, apple_synced_at
        FROM todos
        WHERE completed = 0 AND (archived IS NULL OR archived = 0)
    `).all();

    for (const todo of incompleteTodos) {
        try {
            if (!todo.apple_reminder_id) {
                // New todo — create in Reminders
                const newId = createReminder(todo);
                db.prepare(`
                    UPDATE todos SET apple_reminder_id = ?, apple_synced_at = CURRENT_TIMESTAMP WHERE id = ?
                `).run(newId, todo.id);
                pushed++;
            } else {
                // Existing — update if text changed since last sync
                updateReminder(todo.apple_reminder_id, todo);
            }
        } catch (e) {
            console.warn(`  ⚠️  Failed to sync todo ${todo.id}: ${e.message}`);
        }
    }

    // ── Pull: completions from Apple Reminders → Life OS ────────────────────
    const appleReminders = getAllReminders();
    for (const ar of appleReminders) {
        if (!ar.completed) continue;
        // Match by body tag "lifeos-id:N"
        const match = ar.body.match(/lifeos-id:(\d+)/);
        if (!match) continue;
        const todoId = parseInt(match[1]);
        const todo = db.prepare('SELECT id, completed FROM todos WHERE id = ?').get(todoId);
        if (todo && !todo.completed) {
            db.prepare(`
                UPDATE todos SET completed = 1, completed_at = CURRENT_TIMESTAMP WHERE id = ?
            `).run(todoId);
            completed++;
            console.log(`  ✅ Marked complete from Reminders: todo ${todoId}`);
        }
    }

    // ── Push: project tasks → per-project Reminders lists ────────────────
    let tasksPushed = 0;
    let tasksCompleted = 0;
    try {
        const projects = db.prepare("SELECT id, short_name, name FROM projects WHERE status = 'active'").all();
        for (const proj of projects) {
            const listName = proj.short_name || proj.name;
            try { ensureNamedList(listName); } catch (e) { continue; }

            const tasks = db.prepare(`
                SELECT id, text, due_date, apple_reminder_id
                FROM project_tasks
                WHERE project_id = ? AND status = 'open' AND due_date IS NOT NULL
            `).all(proj.id);

            for (const task of tasks) {
                try {
                    if (!task.apple_reminder_id) {
                        const newId = createReminderInList(listName, task, TASK_TAG_PREFIX);
                        db.prepare('UPDATE project_tasks SET apple_reminder_id = ?, apple_synced_at = CURRENT_TIMESTAMP WHERE id = ?')
                            .run(newId, task.id);
                        tasksPushed++;
                    } else {
                        updateReminderInList(listName, task.apple_reminder_id, task);
                    }
                } catch (e) {
                    console.warn(`  ⚠️  Failed to sync task ${task.id}: ${e.message}`);
                }
            }

            // Pull completions back
            const reminders = getRemindersFromList(listName);
            for (const ar of reminders) {
                if (!ar.completed) continue;
                const match = ar.body.match(/lifeos-task:(\d+)/);
                if (!match) continue;
                const taskId = parseInt(match[1]);
                const t = db.prepare("SELECT id, status FROM project_tasks WHERE id = ?").get(taskId);
                if (t && t.status !== 'done') {
                    db.prepare("UPDATE project_tasks SET status = 'done', completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(taskId);
                    tasksCompleted++;
                    console.log(`  ✅ Marked complete from Reminders: task ${taskId}`);
                }
            }
        }
    } catch (e) {
        console.warn('Project tasks sync error:', e.message);
    }

    console.log(`✅ Apple Reminders sync done — todos pushed: ${pushed}, completed: ${completed}, tasks pushed: ${tasksPushed}, tasks completed: ${tasksCompleted}`);
    return { pushed, completed, tasksPushed, tasksCompleted };
}

/**
 * Ensure a named list exists in Reminders.
 */
function ensureNamedList(listName) {
    const safe = escapeAS(listName);
    const script = `
tell application "Reminders"
    if not (exists list "${safe}") then
        make new list with properties {name: "${safe}"}
    end if
    return name of list "${safe}"
end tell`;
    runASScript(script);
}

/**
 * Create a reminder in a specific list. Returns the new reminder's ID.
 */
function createReminderInList(listName, task, tagPrefix) {
    const name = escapeAS(task.text);
    const safe = escapeAS(listName);
    const dueDateLine = task.due_date
        ? `set due date of newReminder to date "${new Date(task.due_date + 'T09:00:00').toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })}"`
        : '';
    const script = `
tell application "Reminders"
    tell list "${safe}"
        set newReminder to make new reminder with properties {name: "${name}", body: "${tagPrefix}${task.id}"}
        ${dueDateLine}
        return id of newReminder
    end tell
end tell`;
    return runASScript(script);
}

/**
 * Update a reminder's name and due date in a specific list.
 */
function updateReminderInList(listName, appleId, task) {
    const name = escapeAS(task.text);
    const safe = escapeAS(listName);
    const dueDateLine = task.due_date
        ? `set due date of r to date "${new Date(task.due_date + 'T09:00:00').toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })}"`
        : 'set due date of r to missing value';
    const script = `
tell application "Reminders"
    tell list "${safe}"
        set r to reminder id "${escapeAS(appleId)}"
        set name of r to "${name}"
        ${dueDateLine}
    end tell
end tell`;
    try { runASScript(script); } catch (e) { /* reminder may have been deleted */ }
}

/**
 * Get all reminders from a named list with completion status.
 */
function getRemindersFromList(listName) {
    const safe = escapeAS(listName);
    const script = `
tell application "Reminders"
    if not (exists list "${safe}") then return ""
    set output to ""
    repeat with r in reminders of list "${safe}"
        set rId to id of r
        set rName to name of r
        set rDone to completed of r
        set rBody to body of r
        set output to output & rId & "|" & rName & "|" & rDone & "|" & rBody & "\\\\n"
    end repeat
    return output
end tell`;
    try {
        const raw = runASScript(script);
        return raw.split('\n').filter(Boolean).map(line => {
            const parts = line.split('|');
            return { id: parts[0] || '', name: parts[1] || '', completed: parts[2] === 'true', body: parts[3] || '' };
        });
    } catch (e) { return []; }
}

module.exports = { syncTodos, ensureList };
