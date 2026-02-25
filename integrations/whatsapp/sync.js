/**
 * WhatsApp Sync — reads directly from the whatsapp-bridge messages.db
 * and ingests recent unread messages into the LifeOS inbox triage queue.
 *
 * Group logic:
 *   - @mention of user → urgent (must reply)
 *   - VIP group / urgent keywords → medium
 *   - Everything else → ignored (visible but tucked away)
 *
 * DM logic:
 *   - Unanswered chats only (skips already-replied)
 *   - Emoji-only last messages → skip (conversation is done)
 *   - Scoring engine handles VIP/project/urgency
 */

const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const db = require('../../core/db/database');
const { computeUrgencyScore, lookupContact, detectActionTag } = require('../../core/db/derived-state');

const WA_DB_PATH = path.join(
    os.homedir(),
    'code/whatsapp-mcp/whatsapp-bridge/store/messages.db'
);

const WA_SETTINGS_DB_PATH = path.join(
    os.homedir(),
    'code/whatsapp-mcp/whatsapp-bridge/store/whatsapp.db'
);

const WA_API = 'http://localhost:8080/api';

// --- User identity (for @mention detection) ----------------------------------

function loadMyIdentifiers() {
    // Load user's JID and LID from bridge settings DB
    const ids = new Set();
    try {
        const settingsDb = new Database(WA_SETTINGS_DB_PATH, { readonly: true, fileMustExist: true });
        try {
            const device = settingsDb.prepare('SELECT jid FROM whatsmeow_device LIMIT 1').get();
            if (device?.jid) {
                // jid is like "4917675496972:3@s.whatsapp.net"
                const phone = device.jid.replace(/:.*/, '');
                ids.add(phone);
            }
            // Also check LID map for the user's LID
            try {
                const lids = settingsDb.prepare('SELECT lid FROM whatsmeow_lid_map').all();
                for (const r of lids) {
                    if (r.lid) ids.add(r.lid.replace(/@.*/, ''));
                }
            } catch (e) { /* lid table may not exist */ }
        } finally {
            settingsDb.close();
        }
    } catch (e) { /* settings DB unavailable */ }

    // Fallback: check sent messages for our sender ID
    try {
        const waDb = new Database(WA_DB_PATH, { readonly: true, fileMustExist: true });
        try {
            const senders = waDb.prepare('SELECT DISTINCT sender FROM messages WHERE is_from_me=1 LIMIT 5').all();
            for (const s of senders) {
                if (s.sender) ids.add(s.sender.replace(/@.*/, ''));
            }
        } finally {
            waDb.close();
        }
    } catch (e) { /* */ }

    return ids;
}

let _myIds = null;
function getMyIds() {
    if (!_myIds) _myIds = loadMyIdentifiers();
    return _myIds;
}

/**
 * Check if message content @mentions the user.
 */
function mentionsMe(content) {
    if (!content || !content.includes('@')) return false;
    const myIds = getMyIds();
    for (const id of myIds) {
        if (content.includes('@' + id)) return true;
    }
    return false;
}

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

const EMOJI_ONLY_RE = /^[\p{Emoji}\p{Emoji_Component}\s]+$/u;

function scoreUrgency(content = '', isGroup = false) {
    if (!content) return 2;
    const c = content.trim();
    if (EMOJI_ONLY_RE.test(c)) return 1;
    if (LOW_URGENCY_PATTERNS.some(p => p.test(c))) return 1;
    if (HIGH_URGENCY_PATTERNS.some(p => p.test(c))) return 4;
    if (isGroup) return c.length < 10 ? 1 : 2;
    if (c.includes('?')) return 3;
    if (c.length < 20) return 2;
    return 3;
}

function makeSubject(content = '', chatName = '') {
    const first = content.replace(/\n/g, ' ').slice(0, 60);
    return chatName ? `[${chatName}] ${first}` : first;
}

// --- Main sync function -----------------------------------------------------

function syncWhatsApp({ hours = 24 } = {}) {
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
        console.warn('WhatsApp settings DB unavailable, skipping archived filter:', e.message);
    }

    try {
        const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

        // Build set of chats that still need a response
        const unansweredChats = new Set();
        const chatStatus = waDb.prepare(`
            SELECT chat_jid,
                MAX(CASE WHEN is_from_me=0 THEN timestamp END) as last_recv,
                MAX(CASE WHEN is_from_me=1 THEN timestamp END) as last_sent,
                (SELECT content FROM messages m2
                 WHERE m2.chat_jid = messages.chat_jid AND m2.is_from_me=0
                 ORDER BY m2.timestamp DESC LIMIT 1) as last_recv_content
            FROM messages GROUP BY chat_jid
        `).all();

        for (const c of chatStatus) {
            if (!c.last_recv) continue;
            if (c.last_sent && c.last_sent >= c.last_recv) continue;
            if (c.last_recv_content && EMOJI_ONLY_RE.test(c.last_recv_content.trim())) continue;
            unansweredChats.add(c.chat_jid);
        }

        // Fetch recent inbound messages
        const rows = waDb.prepare(`
            SELECT
                m.id, m.chat_jid, m.sender, m.content, m.timestamp, m.media_type,
                c.name AS chat_name
            FROM messages m
            LEFT JOIN chats c ON c.jid = m.chat_jid
            WHERE m.is_from_me = 0
              AND m.timestamp >= ?
              AND (m.content IS NOT NULL AND m.content != '')
            ORDER BY m.timestamp DESC
        `).all(cutoff);

        // Auto-dismiss pending items from chats the user has since replied to
        const answeredJids = [...chatStatus]
            .filter(c => c.last_recv && c.last_sent && c.last_sent >= c.last_recv)
            .map(c => c.chat_jid);
        if (answeredJids.length) {
            const ph = answeredJids.map(() => '?').join(',');
            db.prepare(`UPDATE messages SET status='dismissed' WHERE source='whatsapp' AND status='pending' AND sender_address IN (${ph})`).run(...answeredJids);
        }

        // Also dismiss emoji-only conversations
        const emojiChats = [...chatStatus]
            .filter(c => c.last_recv_content && EMOJI_ONLY_RE.test(c.last_recv_content.trim()) && !(c.last_sent && c.last_sent >= c.last_recv))
            .map(c => c.chat_jid);
        if (emojiChats.length) {
            const ph = emojiChats.map(() => '?').join(',');
            db.prepare(`UPDATE messages SET status='dismissed' WHERE source='whatsapp' AND status='pending' AND sender_address IN (${ph})`).run(...emojiChats);
        }

        let synced = 0;
        let skipped = 0;
        const chatSyncCount = {};

        for (const row of rows) {
            if (excludedJids.has(row.chat_jid)) { skipped++; continue; }
            if (!unansweredChats.has(row.chat_jid)) { skipped++; continue; }

            const existing = db.prepare(
                "SELECT id FROM messages WHERE source = 'whatsapp' AND external_id = ?"
            ).get(row.id);
            if (existing) { skipped++; continue; }

            const isGroup = row.chat_jid?.endsWith('@g.us');
            const cleanJid = (j) => j ? j.replace(/@s\.whatsapp\.net|@lid|@g\.us/g, '') : '';
            const chatNum = cleanJid(row.chat_jid);
            const senderDisplay = isGroup
                ? (row.chat_name || chatNum)
                : (row.chat_name && row.chat_name !== chatNum ? row.chat_name : chatNum);

            const senderAddr = isGroup ? row.chat_jid : (row.sender || row.chat_jid);
            const contact = lookupContact(senderAddr) || lookupContact(row.chat_jid);
            if (contact && contact.label === 'blocked') { skipped++; continue; }

            const urgency = scoreUrgency(row.content, isGroup);

            // Skip pure low-urgency noise from groups (emoji, ack, short)
            if (urgency <= 1 && isGroup) { skipped++; continue; }

            // Cap group chats at 10 messages per sync
            if (isGroup) {
                chatSyncCount[row.chat_jid] = (chatSyncCount[row.chat_jid] || 0) + 1;
                if (chatSyncCount[row.chat_jid] > 10) { skipped++; continue; }
            }

            const receivedAt = new Date(row.timestamp).toISOString();
            const subject = makeSubject(row.content, isGroup ? row.chat_name : null);

            // ── Tiering logic ──
            // Groups: @mention → urgent, VIP/keywords → medium, else → ignored
            // DMs: scoring engine decides
            const tagged = isGroup && mentionsMe(row.content);
            let priorityTier;
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
                    is_unread: true,
                });

                if (isGroup) {
                    if (tagged) {
                        priorityTier = 'urgent';
                    } else if (scoring.score >= 40) {
                        priorityTier = scoring.tier;
                    } else {
                        priorityTier = 'ignored';
                    }
                } else {
                    priorityTier = scoring.tier || 'medium';
                }

                if (scoring.contact_id) contactId = scoring.contact_id;
                if (scoring.project_id) projectId = scoring.project_id;
                if (scoring.category) category = scoring.category;
            } catch (e) {
                priorityTier = tagged ? 'urgent' : (isGroup ? 'ignored' : 'medium');
            }

            // Override urgency score for @mentions
            const finalUrgency = tagged ? 5 : urgency;
            const actionTag = tagged ? 'reply_needed' : detectActionTag(row.content, subject);

            db.prepare(`
                INSERT INTO messages
                    (source, external_id, sender_name, sender_address, subject,
                     preview, received_at, urgency_score, ai_summary, ai_suggested_reply,
                     priority_tier, contact_id, project_id, category, action_tag)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(source, external_id) DO NOTHING
            `).run(
                'whatsapp',
                row.id,
                senderDisplay,
                row.chat_jid,
                subject,
                row.content.slice(0, 200),
                receivedAt,
                finalUrgency,
                null,
                null,
                priorityTier,
                contactId,
                projectId,
                category,
                actionTag
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
