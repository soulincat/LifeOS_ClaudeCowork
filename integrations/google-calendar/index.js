/**
 * Google Calendar Integration
 * Uses the same OAuth credentials as Gmail (googleapis).
 * Reads events from Google Calendar and upserts into upcoming_items.
 *
 * Requires calendar.readonly scope — user must re-auth via /api/gmail/connect
 * if their token doesn't include it yet.
 */

const fs = require('fs');
const path = require('path');
const db = require('../../core/db/database');

const TOKEN_PATH = process.env.GMAIL_TOKEN_PATH || path.join(process.env.HOME, '.config', 'lifeos', 'gmail-token.json');
const CREDENTIALS_PATH = process.env.GMAIL_CREDENTIALS_PATH || path.join(process.env.HOME, '.config', 'lifeos', 'gmail-credentials.json');

function hasCalendarScope() {
    try {
        if (!fs.existsSync(TOKEN_PATH)) return false;
        const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
        return (token.scope || '').includes('calendar');
    } catch (e) { return false; }
}

function getCalendarClient() {
    if (!fs.existsSync(TOKEN_PATH)) {
        throw new Error('Gmail/Calendar not connected. Visit /api/gmail/connect');
    }

    const { google } = require('googleapis');

    let clientId = process.env.GMAIL_CLIENT_ID;
    let clientSecret = process.env.GMAIL_CLIENT_SECRET;
    let redirectUri = 'http://localhost:' + (process.env.PORT || 3001) + '/api/gmail/callback';

    if ((!clientId || !clientSecret) && fs.existsSync(CREDENTIALS_PATH)) {
        const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
        const creds = credentials.installed || credentials.web;
        clientId = creds.client_id;
        clientSecret = creds.client_secret;
        redirectUri = (creds.redirect_uris && creds.redirect_uris[0]) || redirectUri;
    }

    if (!clientId || !clientSecret) {
        throw new Error('Gmail OAuth not configured');
    }

    const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    oAuth2Client.setCredentials(token);

    oAuth2Client.on('tokens', (newTokens) => {
        const merged = { ...token, ...newTokens };
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2));
    });

    return google.calendar({ version: 'v3', auth: oAuth2Client });
}

/**
 * Sync events from Google Calendar into upcoming_items.
 * @param {Object} opts
 * @param {number} opts.daysAhead - How many days ahead to look (default 14)
 * @param {string[]} opts.calendarIds - Calendar IDs to sync (default: ['primary'])
 */
async function syncGoogleCalendar({ daysAhead = 14, calendarIds } = {}) {
    if (!hasCalendarScope()) {
        return { synced: 0, skipped: 0, error: 'No calendar scope. Re-auth via /api/gmail/connect' };
    }

    const calendar = getCalendarClient();
    const ids = calendarIds || ['primary'];
    const timeMin = new Date().toISOString();
    const timeMax = new Date(Date.now() + daysAhead * 86400000).toISOString();

    const findExisting = db.prepare('SELECT id FROM upcoming_items WHERE apple_event_id = ?');
    const insertStmt = db.prepare(`
        INSERT INTO upcoming_items (title, type, due_date, description, apple_event_id, apple_synced_at)
        VALUES (?, 'calendar', ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    const updateStmt = db.prepare(`
        UPDATE upcoming_items SET title=?, due_date=?, description=?, apple_synced_at=CURRENT_TIMESTAMP
        WHERE apple_event_id=?
    `);

    // Clean stale calendar events
    db.prepare("DELETE FROM upcoming_items WHERE type = 'calendar' AND due_date < datetime('now', '-1 hour')").run();

    let synced = 0, skipped = 0;

    for (const calId of ids) {
        try {
            const res = await calendar.events.list({
                calendarId: calId,
                timeMin,
                timeMax,
                singleEvents: true,
                orderBy: 'startTime',
                maxResults: 50,
            });

            const events = res.data.items || [];
            for (const evt of events) {
                try {
                    const uid = 'gcal:' + evt.id;
                    const title = evt.summary || '(No title)';
                    const start = evt.start.dateTime || evt.start.date;
                    const due = new Date(start).toISOString();
                    const calName = calId === 'primary' ? 'Google Calendar' : calId;
                    const desc = [calName, evt.description || ''].filter(Boolean).join(' — ').slice(0, 200) || null;

                    const existing = findExisting.get(uid);
                    if (existing) {
                        updateStmt.run(title, due, desc, uid);
                    } else {
                        insertStmt.run(title, due, desc, uid);
                    }
                    synced++;
                } catch (e) { skipped++; }
            }
        } catch (e) {
            console.warn(`Google Calendar sync error for ${calId}:`, e.message);
            skipped++;
        }
    }

    return { synced, skipped };
}

/**
 * List available Google Calendar calendar IDs.
 */
async function listCalendars() {
    if (!hasCalendarScope()) return [];
    const calendar = getCalendarClient();
    const res = await calendar.calendarList.list();
    return (res.data.items || []).map(c => ({
        id: c.id,
        name: c.summary,
        primary: c.primary || false,
    }));
}

module.exports = { syncGoogleCalendar, listCalendars, hasCalendarScope };
