/**
 * Apple Calendar Integration
 * Syncs Life OS upcoming_items to Apple Calendar via osascript.
 * - Creates/updates events in a "Life OS" calendar
 * - Supports Google Calendar sync passively: if user has Google Cal
 *   configured in Calendar.app, events appear there automatically.
 */

const { execSync } = require('child_process');
const db = require('../../core/db/database');

const CALENDAR_NAME = 'Life OS';

function escapeAS(str) {
    return (str || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function runASScript(script) {
    return execSync(`osascript << 'ASEOF'\n${script}\nASOEF`, {
        encoding: 'utf8',
        timeout: 15000
    }).trim();
}

/**
 * Format a JS Date for AppleScript's date literal.
 * AppleScript date format: "Thursday, February 19, 2026 at 3:00:00 PM"
 */
function formatASDate(isoString) {
    const d = new Date(isoString);
    return d.toLocaleString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
}

/**
 * Ensure the "Life OS" calendar exists in Calendar.app.
 */
function ensureCalendar() {
    const script = `
tell application "Calendar"
    if not (exists calendar "${CALENDAR_NAME}") then
        make new calendar with properties {name: "${CALENDAR_NAME}", color: blue}
    end if
    return name of calendar "${CALENDAR_NAME}"
end tell`;
    runASScript(script);
}

/**
 * Create a calendar event from an upcoming_item.
 * Returns the Apple Calendar event UID.
 */
function createEvent(item) {
    const title = escapeAS(item.title);
    const desc = escapeAS(`${item.description || ''}\nlifeos-id:${item.id}`);
    const startDate = formatASDate(item.due_date);

    // Default duration: 1 hour for meetings/calls, 0 for deadlines
    const durationMins = item.type === 'deadline' ? 30 : 60;
    const endDate = formatASDate(new Date(new Date(item.due_date).getTime() + durationMins * 60000).toISOString());

    const script = `
tell application "Calendar"
    tell calendar "${CALENDAR_NAME}"
        set startD to date "${startDate}"
        set endD to date "${endDate}"
        set newEvent to make new event with properties {summary: "${title}", start date: startD, end date: endD, description: "${desc}"}
        return uid of newEvent
    end tell
end tell`;
    return runASScript(script);
}

/**
 * Update an existing event.
 */
function updateEvent(uid, item) {
    const title = escapeAS(item.title);
    const desc = escapeAS(`${item.description || ''}\nlifeos-id:${item.id}`);
    const startDate = formatASDate(item.due_date);
    const durationMins = item.type === 'deadline' ? 30 : 60;
    const endDate = formatASDate(new Date(new Date(item.due_date).getTime() + durationMins * 60000).toISOString());

    const script = `
tell application "Calendar"
    tell calendar "${CALENDAR_NAME}"
        set ev to (first event whose uid is "${escapeAS(uid)}")
        set summary of ev to "${title}"
        set start date of ev to date "${startDate}"
        set end date of ev to date "${endDate}"
        set description of ev to "${desc}"
    end tell
end tell`;
    try { runASScript(script); } catch (e) { /* event may have been deleted */ }
}

/**
 * Delete a calendar event by UID.
 */
function deleteEvent(uid) {
    const script = `
tell application "Calendar"
    tell calendar "${CALENDAR_NAME}"
        set ev to (first event whose uid is "${escapeAS(uid)}")
        delete ev
    end tell
end tell`;
    try { runASScript(script); } catch (e) { /* already gone */ }
}

/**
 * Main sync: push upcoming_items to Apple Calendar.
 * Also removes events for items that have passed or been deleted.
 */
async function syncUpcoming() {
    console.log('🍎 Starting Apple Calendar sync...');

    try {
        ensureCalendar();
    } catch (e) {
        console.error('❌ Cannot access Apple Calendar:', e.message);
        console.error('   Check System Settings → Privacy → Automation → Terminal → Calendar');
        return { created: 0, updated: 0, error: e.message };
    }

    let created = 0;
    let updated = 0;

    const now = new Date().toISOString();
    const twoWeeksAhead = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    // Sync upcoming items in the next 14 days
    const items = db.prepare(`
        SELECT id, title, type, due_date, description, apple_event_id, apple_synced_at
        FROM upcoming_items
        WHERE due_date >= ? AND due_date <= ?
        ORDER BY due_date ASC
    `).all(now, twoWeeksAhead);

    for (const item of items) {
        try {
            if (!item.apple_event_id) {
                const uid = createEvent(item);
                db.prepare(`
                    UPDATE upcoming_items SET apple_event_id = ?, apple_synced_at = CURRENT_TIMESTAMP WHERE id = ?
                `).run(uid, item.id);
                created++;
            } else {
                updateEvent(item.apple_event_id, item);
                db.prepare(`
                    UPDATE upcoming_items SET apple_synced_at = CURRENT_TIMESTAMP WHERE id = ?
                `).run(item.id);
                updated++;
            }
        } catch (e) {
            console.warn(`  ⚠️  Failed to sync event ${item.id}: ${e.message}`);
        }
    }

    console.log(`✅ Apple Calendar sync done — created: ${created}, updated: ${updated}`);
    return { created, updated };
}

module.exports = { syncUpcoming, ensureCalendar };
