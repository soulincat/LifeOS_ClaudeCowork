/**
 * Apple Calendar Read Integration
 * Reads events from specified Calendar.app calendars and upserts them
 * into upcoming_items (type='calendar', keyed by apple_event_id).
 */

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const db = require('../db/database');

function getCalendarNames() {
    try {
        const row = db.prepare("SELECT payload FROM setup_sections WHERE section_key = 'integrations'").get();
        if (row) {
            const p = JSON.parse(row.payload);
            if (Array.isArray(p.calendar_names) && p.calendar_names.length) return p.calendar_names;
        }
    } catch (e) { /* fall through */ }
    return ['집']; // default
}

function syncCalendarEvents({ daysAhead = 14, calendarNames } = {}) {
    const names = calendarNames || getCalendarNames();
    if (!names.length) return { synced: 0, skipped: 0 };

    // Build AppleScript calendar list e.g. {"집", "직장"}
    const namesList = names.map(n => `"${n.replace(/"/g, '\\"')}"`).join(', ');

    const script = `
tell application "Calendar"
    set nowDate to current date
    set futureDate to nowDate + (${daysAhead} * days)
    set resultStr to ""
    set calNames to {${namesList}}
    repeat with calName in calNames
        try
            set c to calendar calName
            set evts to (every event of c whose start date >= nowDate and start date <= futureDate)
            repeat with e in evts
                try
                    set eId to uid of e
                    set eTitle to summary of e
                    set eStart to (start date of e) as string
                    set eEnd to (end date of e) as string
                    set eAllDay to allday event of e
                    set eDesc to ""
                    try
                        set eDesc to description of e
                        if eDesc is missing value then set eDesc to ""
                    end try
                    set eRecord to eId & "|||" & eTitle & "|||" & eStart & "|||" & eEnd & "|||" & (eAllDay as string) & "|||" & eDesc & "|||" & calName
                    if resultStr is "" then
                        set resultStr to eRecord
                    else
                        set resultStr to resultStr & "\\n" & eRecord
                    end if
                end try
            end repeat
        end try
    end repeat
    return resultStr
end tell`;

    let raw;
    const tmpFile = path.join(os.tmpdir(), `lifeos-cal-${Date.now()}.applescript`);
    try {
        fs.writeFileSync(tmpFile, script, 'utf8');
        raw = execSync(`osascript "${tmpFile}"`, { encoding: 'utf8', timeout: 30000 }).trim();
    } catch (e) {
        return { synced: 0, skipped: 0, error: `Calendar read failed: ${e.message}` };
    } finally {
        try { fs.unlinkSync(tmpFile); } catch (_) {}
    }

    if (!raw) return { synced: 0, skipped: 0 };

    // Records separated by newlines (dates contain ", " so can't use comma-split)
    const items = raw.split('\n').filter(Boolean);
    let synced = 0, skipped = 0;

    const findExisting = db.prepare('SELECT id FROM upcoming_items WHERE apple_event_id = ?');
    const insertStmt = db.prepare(`
        INSERT INTO upcoming_items (title, type, due_date, description, apple_event_id, apple_synced_at)
        VALUES (?, 'calendar', ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    const updateStmt = db.prepare(`
        UPDATE upcoming_items SET title=?, due_date=?, description=?, apple_synced_at=CURRENT_TIMESTAMP
        WHERE apple_event_id=?
    `);

    // Remove stale calendar events that are no longer in the future
    db.prepare(`
        DELETE FROM upcoming_items
        WHERE type = 'calendar' AND due_date < datetime('now', '-1 hour')
    `).run();

    for (const item of items) {
        const parts = item.split('|||');
        if (parts.length < 4) { skipped++; continue; }
        const [uid, title, startStr, , , desc, calName] = parts;
        if (!uid || !title || !startStr) { skipped++; continue; }

        try {
            // AppleScript dates: "Tuesday, 3 March 2026 at 00:00:00" — not directly parseable by JS
            const cleaned = startStr.replace(/^[A-Za-z]+,\s*/, '').replace(' at ', ' ');
            const due = new Date(cleaned);
            if (isNaN(due.getTime())) { skipped++; continue; }
            const description = [calName, desc].filter(Boolean).join(' — ') || null;
            const uidTrimmed = uid.trim();
            const existing = findExisting.get(uidTrimmed);
            if (existing) {
                updateStmt.run(title.trim(), due.toISOString(), description, uidTrimmed);
            } else {
                insertStmt.run(title.trim(), due.toISOString(), description, uidTrimmed);
            }
            synced++;
        } catch (e) { skipped++; }
    }

    return { synced, skipped };
}

module.exports = { syncCalendarEvents, getCalendarNames };
