#!/usr/bin/env node

/**
 * Apple Notification Checker
 * Runs hourly via LaunchAgent.
 *
 * Checks:
 * 1. Upcoming items due in the next 60 minutes → urgent notification
 * 2. Upcoming items due today (not yet notified) → morning briefing notification
 * 3. Overdue todos → reminder notification
 * 4. Syncs todos ↔ Apple Reminders
 * 5. Syncs upcoming_items → Apple Calendar
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { exec, execSync } = require('child_process');
const path = require('path');
const db = require('../core/db/database');

const PORT = process.env.PORT || 3001;

// ── Notification helper ──────────────────────────────────────────────────────

function notify(title, message, sound = 'Glass') {
    const safeTitle = title.replace(/"/g, '\\"').replace(/'/g, "\\'");
    const safeMsg = message.replace(/"/g, '\\"').replace(/'/g, "\\'");
    const script = `display notification "${safeMsg}" with title "${safeTitle}" sound name "${sound}"`;
    exec(`osascript -e '${script}'`, (err) => {
        if (err) console.error('Notification error:', err.message);
    });
}

function openDashboard(tab = 'pa') {
    try {
        execSync(`open "http://localhost:${PORT}#${tab}"`, { stdio: 'ignore' });
    } catch (e) { /* dashboard may not be running */ }
}

// ── Checks ───────────────────────────────────────────────────────────────────

function checkImminent() {
    // Items starting in the next 60 minutes
    const nowMs = Date.now();
    const in60 = new Date(nowMs + 60 * 60 * 1000).toISOString();
    const nowStr = new Date(nowMs).toISOString();

    const items = db.prepare(`
        SELECT id, title, type, due_date, description
        FROM upcoming_items
        WHERE due_date >= ? AND due_date <= ?
        ORDER BY due_date ASC
    `).all(nowStr, in60);

    for (const item of items) {
        const dt = new Date(item.due_date);
        const minutesAway = Math.round((dt - nowMs) / 60000);
        const timeStr = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        const label = minutesAway <= 5 ? 'NOW' : `in ${minutesAway} min`;
        notify(
            `${item.type.charAt(0).toUpperCase() + item.type.slice(1)}: ${item.title}`,
            `${label} (${timeStr})${item.description ? ' — ' + item.description.slice(0, 60) : ''}`,
            'Basso'
        );
        console.log(`🔔 Notified: ${item.title} (${label})`);
    }

    return items.length;
}

function checkOverdue() {
    const today = new Date().toISOString().slice(0, 10);

    const overdue = db.prepare(`
        SELECT id, text, due_date FROM todos
        WHERE completed = 0 AND (archived IS NULL OR archived = 0)
        AND due_date < ?
        LIMIT 5
    `).all(today);

    if (overdue.length > 0) {
        const names = overdue.map(t => t.text).slice(0, 3).join(', ');
        notify(
            `${overdue.length} overdue todo${overdue.length > 1 ? 's' : ''}`,
            names + (overdue.length > 3 ? ` +${overdue.length - 3} more` : ''),
            'Glass'
        );
        console.log(`⚠️  Notified ${overdue.length} overdue todos`);
    }

    return overdue.length;
}

function checkDueToday() {
    const today = new Date().toISOString().slice(0, 10);
    const hour = new Date().getHours();

    // Only show morning digest between 7-9 AM
    if (hour < 7 || hour >= 9) return 0;

    const dueToday = db.prepare(`
        SELECT id, text FROM todos
        WHERE completed = 0 AND (archived IS NULL OR archived = 0)
        AND due_date = ?
        LIMIT 10
    `).all(today);

    const upcomingToday = db.prepare(`
        SELECT id, title, type, due_date FROM upcoming_items
        WHERE date(due_date) = ?
        ORDER BY due_date ASC
    `).all(today);

    if (dueToday.length > 0 || upcomingToday.length > 0) {
        const parts = [];
        if (upcomingToday.length) {
            const names = upcomingToday.map(u => {
                const t = new Date(u.due_date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                return `${t} ${u.title}`;
            }).slice(0, 2).join(', ');
            parts.push(`${upcomingToday.length} event${upcomingToday.length > 1 ? 's' : ''}: ${names}`);
        }
        if (dueToday.length) {
            parts.push(`${dueToday.length} todo${dueToday.length > 1 ? 's' : ''} due`);
        }

        notify('Good morning — today\'s overview', parts.join(' • '), 'Glass');
        openDashboard('pa');
        console.log(`☀️  Morning digest sent: ${parts.join(', ')}`);
        return dueToday.length + upcomingToday.length;
    }

    return 0;
}

// ── Apple Reminders + Calendar sync ─────────────────────────────────────────

async function runAppleSync() {
    try {
        const reminders = require('../integrations/apple/reminders');
        await reminders.syncTodos();
    } catch (e) {
        console.error('Apple Reminders sync failed:', e.message);
    }

    try {
        const calendar = require('../integrations/apple/calendar');
        await calendar.syncUpcoming();
    } catch (e) {
        console.error('Apple Calendar sync failed:', e.message);
    }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log(`[${new Date().toISOString()}] Running Apple notification check...`);

    const imminentCount = checkImminent();
    const dueTodayCount = checkDueToday();
    const overdueCount = checkOverdue();

    // Run Apple sync every hour
    await runAppleSync();

    console.log(`Done — imminent: ${imminentCount}, today: ${dueTodayCount}, overdue: ${overdueCount}`);
}

main().catch(e => console.error('apple-notify error:', e));
