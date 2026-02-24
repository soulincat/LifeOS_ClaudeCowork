/**
 * WhatsApp Sync — reads directly from the whatsapp-bridge messages.db
 * and ingests recent unread messages into the LifeOS inbox triage queue.
 *
 * No claude CLI required — direct SQLite read + simple urgency scoring.
 */

const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const db = require('../../core/db/database');
const { computeUrgencyScore, lookupContact } = require('../../core/db/derived-state');

const WA_DB_PATH = path.join(
    os.homedir(),
    'code/whatsapp-mcp/whatsapp-bridge/store/messages.db'
);

const WA_SETTINGS_DB_PATH = path.join(
    os.homedir(),
    'code/whatsapp-mcp/whatsapp-bridge/store/whatsapp.db'
);

const WA_API = 'http://localhost:8080/api';

// --- Urgency scoring -------------------------------------------------------

const HIGH_URGENCY_PATTERNS = [
    /urgent|asap|immediately|emergency|critical|important/i,
    /deadline|due today|by end of day|eod|tonight/i,
    /can you call|please call|call me/i,
    /invoice|payment|overdue|outstanding/i,
    /contract|agreement|sign|approve/i,
    /need you|need your|waiting for you/i,
];

const LOW_URGENCY_PATTERNS = [
    /^(ok|okay|thanks|thank you|👍|✅|noted|sure|sounds good)/i,
    /^(lol|haha|😂|❤️|🙏)/i,
    /newsletter|unsubscribe|no-reply/i,
];

function scoreUrgency(content = '', isGroup = false) {
    if (!content) return 2;
    const c = content.trim();
    if (LOW_URGENCY_PATTERNS.some(p => p.test(c))) return 1;
    if (HIGH_URGENCY_PATTERNS.some(p => p.test(c))) return 4;
    // In group chats, treat everything below high-urgency as noise (max 2)
    // so only explicit urgent keywords bubble up from busy groups
    if (isGroup) return c.length < 10 ? 1 : 2;
    // DM: question → medium-high, longer messages → medium
    if (c.includes('?')) return 3;
    if (c.length < 20) return 2;
    return 3;
}

function makeSubject(content = '', chatName = '') {
    const first = content.replace(/\n/g, ' ').slice(0, 60);
    return chatName ? `[${chatName}] ${first}` : first;
}

// --- Main sync function -----------------------------------------------------

/**
 * Sync WhatsApp messages received in the last `hours` hours.
 * Returns { synced, skipped } counts.
 */
function syncWhatsApp({ hours = 24 } = {}) {
    // Open the bridge DB read-only
    let waDb;
    try {
        waDb = new Database(WA_DB_PATH, { readonly: true, fileMustExist: true });
    } catch (e) {
        return { synced: 0, skipped: 0, error: `WhatsApp bridge DB not found at ${WA_DB_PATH}` };
    }

    // Load archived + permanently-muted chat JIDs to exclude
    const excludedJids = new Set();
    try {
        const settingsDb = new Database(WA_SETTINGS_DB_PATH, { readonly: true, fileMustExist: true });
        try {
            const excluded = settingsDb.prepare(`
                SELECT chat_jid FROM whatsmeow_chat_settings
                WHERE archived = 1 OR muted_until = -1
            `).all();
            for (const r of excluded) excludedJids.add(r.chat_jid);
        } finally {
            settingsDb.close();
        }
    } catch (e) {
        // Settings DB unavailable — proceed without filtering
        console.warn('WhatsApp settings DB unavailable, skipping archived filter:', e.message);
    }

    try {
        const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

        // Build set of chats that still need a response:
        // last received message is more recent than last sent message (or never replied)
        const unansweredChats = new Set();
        const chatStatus = waDb.prepare(`
            SELECT chat_jid,
                MAX(CASE WHEN is_from_me=0 THEN timestamp END) as last_recv,
                MAX(CASE WHEN is_from_me=1 THEN timestamp END) as last_sent
            FROM messages GROUP BY chat_jid
        `).all();
        for (const c of chatStatus) {
            if (!c.last_recv) continue;
            if (!c.last_sent || c.last_recv > c.last_sent) {
                unansweredChats.add(c.chat_jid);
            }
        }

        // Fetch recent inbound messages with chat names
        const rows = waDb.prepare(`
            SELECT
                m.id,
                m.chat_jid,
                m.sender,
                m.content,
                m.timestamp,
                m.media_type,
                c.name AS chat_name
            FROM messages m
            LEFT JOIN chats c ON c.jid = m.chat_jid
            WHERE m.is_from_me = 0
              AND m.timestamp >= ?
              AND (m.content IS NOT NULL AND m.content != '')
            ORDER BY m.timestamp DESC
        `).all(cutoff);

        // Auto-dismiss any pending inbox items from chats the user has since replied to on mobile
        const answeredJids = [...chatStatus]
            .filter(c => c.last_recv && c.last_sent && c.last_sent >= c.last_recv)
            .map(c => c.chat_jid);
        if (answeredJids.length) {
            const ph = answeredJids.map(() => '?').join(',');
            db.prepare(`UPDATE messages SET status='dismissed' WHERE source='whatsapp' AND status='pending' AND sender_address IN (${ph})`).run(...answeredJids);
        }

        let synced = 0;
        let skipped = 0;
        const chatSyncCount = {}; // per-chat cap: max 10 messages per group per sync

        for (const row of rows) {
            // Skip archived / permanently-muted chats
            if (excludedJids.has(row.chat_jid)) { skipped++; continue; }

            // Skip chats where we've already replied (no pending response needed)
            if (!unansweredChats.has(row.chat_jid)) { skipped++; continue; }

            // Check if already ingested (by external_id)
            const existing = db.prepare(
                "SELECT id FROM messages WHERE source = 'whatsapp' AND external_id = ?"
            ).get(row.id);

            if (existing) { skipped++; continue; }

            // Determine display name
            const isGroup = row.chat_jid && row.chat_jid.endsWith('@g.us');
            const cleanJid = (j) => j ? j.replace(/@s\.whatsapp\.net|@lid|@g\.us/g, '') : '';
            const chatNum = cleanJid(row.chat_jid);
            // Use chat name if it's a real name (not just the number itself)
            const senderDisplay = isGroup
                ? (row.chat_name || chatNum)
                : (row.chat_name && row.chat_name !== chatNum ? row.chat_name : chatNum);

            // Contact lookup — check blocked/ignored status before insertion
            const senderAddr = isGroup ? row.chat_jid : (row.sender || row.chat_jid);
            const contact = lookupContact(senderAddr) || lookupContact(row.chat_jid);
            if (contact && contact.label === 'blocked') { skipped++; continue; }

            const urgency = scoreUrgency(row.content, isGroup);

            // Skip pure ACKs (urgency 1) from groups
            if (urgency === 1 && isGroup) { skipped++; continue; }

            // Cap group chats at 10 messages per sync to prevent inbox flooding
            if (isGroup) {
                chatSyncCount[row.chat_jid] = (chatSyncCount[row.chat_jid] || 0) + 1;
                if (chatSyncCount[row.chat_jid] > 10) { skipped++; continue; }
            }

            const receivedAt = new Date(row.timestamp).toISOString();
            const subject = makeSubject(row.content, isGroup ? row.chat_name : null);

            // Run unified scoring for tier + project assignment
            let priorityTier = 'medium';
            let contactId = contact ? contact.id : null;
            let projectId = null;
            let category = null;
            try {
                const scoring = computeUrgencyScore({
                    sender_id: senderAddr,
                    sender_address: senderAddr,
                    preview: row.content,
                    full_content: row.content,
                    subject,
                    source: 'whatsapp',
                    timestamp: receivedAt,
                    is_unread: true
                });
                priorityTier = scoring.tier || 'medium';
                if (scoring.contact_id) contactId = scoring.contact_id;
                if (scoring.project_id) projectId = scoring.project_id;
                if (scoring.category) category = scoring.category;
            } catch (e) { /* scoring engine unavailable — use defaults */ }

            db.prepare(`
                INSERT INTO messages
                    (source, external_id, sender_name, sender_address, subject,
                     preview, received_at, urgency_score, ai_summary, ai_suggested_reply,
                     priority_tier, contact_id, project_id, category)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(source, external_id) DO NOTHING
            `).run(
                'whatsapp',
                row.id,
                senderDisplay,
                row.chat_jid,
                subject,
                row.content.slice(0, 200),
                receivedAt,
                urgency,
                null,
                null,
                priorityTier,
                contactId,
                projectId,
                category
            );

            synced++;
        }

        return { synced, skipped };
    } finally {
        waDb.close();
    }
}

/**
 * Send a WhatsApp reply via the bridge REST API.
 */
async function sendReply(recipientJid, text) {
    const res = await fetch(`${WA_API}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: recipientJid, message: text })
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`WhatsApp send failed: ${err}`);
    }
    return res.json();
}

module.exports = { syncWhatsApp, sendReply };
