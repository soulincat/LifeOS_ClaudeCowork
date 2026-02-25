/**
 * Gmail Sync Module
 * Fetches recent emails from Gmail API and ingests them into the messages table.
 *
 * Filtering strategy (layered, not hardcoded):
 *   1. Gmail query: category:primary (Gmail's own ML classification)
 *   2. List-Unsubscribe header → skip (definitive newsletter signal)
 *   3. Gmail labels: CATEGORY_PROMOTIONS/SOCIAL/UPDATES/FORUMS → skip
 *   4. Automated sender patterns (noreply@, support@, etc.) → skip
 *   5. Contacts system: blocked → skip, ignored → "ignored" tier, VIP → boost
 *   6. Everything else → scoring engine decides tier
 *
 * Over time, users refine via block/ignore/VIP in the inbox UI.
 */

const db = require('../../core/db/database');
const { computeUrgencyScore, detectActionTag } = require('../../core/db/derived-state');
const { getGmailClient } = require('./index');

function parseFrom(from) {
    if (!from) return { name: null, address: null };
    const match = from.match(/^(.+?)\s*<(.+?)>$/);
    if (match) return { name: match[1].replace(/^["']|["']$/g, '').trim(), address: match[2] };
    return { name: null, address: from.trim() };
}

function getHeader(headers, name) {
    const h = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
    return h ? h.value : null;
}

// ── Automated sender detection (lightweight — Gmail labels do the heavy lifting) ──

const AUTOMATED_LOCAL_PARTS = new Set([
    'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'mailer-daemon',
    'notifications', 'notification', 'alerts', 'alert',
    'support', 'help', 'team', 'teams',
    'info', 'news', 'newsletter',
    'marketing', 'promo', 'promotions',
    'updates', 'update', 'billing',
    'feedback', 'survey',
    'admin', 'system', 'automated', 'auto',
    'delivery', 'shipping', 'orders',
    'welcome', 'onboarding',
    'digest', 'weekly', 'daily', 'monthly',
    'accounts', 'account', 'security',
    'notify', 'bounce', 'postmaster',
    'portfolio', 'hello', 'members', 'community',
    'notifikasi', 'pemberitahuan', 'informasi',  // Indonesian
    'benachrichtigung', 'mitteilung',             // German
    'notificacion', 'avisos',                     // Spanish
]);

// Patterns that indicate automated senders (regex on local part)
const AUTOMATED_LOCAL_PATTERNS = [
    /no.?reply|do.?not.?reply|mailer.?daemon/,
    /bot$|^bot/,          // pinbot, chatbot, bot-something
    /^www$|^mail$|^email$/,
];

// Subdomains that indicate transactional/automated mail
const AUTOMATED_SUBDOMAIN_PATTERNS = [
    /^(mail|email|send|notify|legal|bounce|bulk|marketing|campaign)\./,
];

/**
 * Check if sender address looks automated.
 * Intentionally lightweight — Gmail labels + List-Unsubscribe handle most cases.
 */
function isAutomatedAddress(address) {
    if (!address) return false;
    const lower = address.toLowerCase();
    const atIdx = lower.indexOf('@');
    if (atIdx === -1) return false;
    const localPart = lower.slice(0, atIdx);
    const domain = lower.slice(atIdx + 1);

    if (AUTOMATED_LOCAL_PARTS.has(localPart)) return true;
    if (AUTOMATED_LOCAL_PATTERNS.some(p => p.test(localPart))) return true;
    if (AUTOMATED_SUBDOMAIN_PATTERNS.some(p => p.test(domain))) return true;

    return false;
}

/**
 * Sync recent Gmail messages into the messages table.
 */
async function syncGmail({ maxResults = 50, hoursBack = 24 } = {}) {
    const gmail = getGmailClient();

    const afterEpoch = Math.floor((Date.now() - hoursBack * 60 * 60 * 1000) / 1000);
    const query = `category:primary after:${afterEpoch}`;

    // Paginate through message list
    let allMessageIds = [];
    let nextPageToken = null;
    const pageSize = Math.min(maxResults || 500, 500);

    do {
        const listRes = await gmail.users.messages.list({
            userId: 'me',
            q: query,
            maxResults: pageSize,
            ...(nextPageToken ? { pageToken: nextPageToken } : {}),
        });

        const ids = (listRes.data.messages || []).map(m => m.id);
        allMessageIds.push(...ids);
        nextPageToken = listRes.data.nextPageToken;

        if (maxResults > 0 && allMessageIds.length >= maxResults) {
            allMessageIds = allMessageIds.slice(0, maxResults);
            break;
        }
    } while (nextPageToken);

    if (allMessageIds.length === 0) return { synced: 0, skipped: 0, errors: 0, total: 0, filtered: 0 };

    const upsert = db.prepare(`
        INSERT INTO messages
            (source, external_id, sender_name, sender_address, subject,
             preview, received_at, urgency_score, project_id, contact_id,
             category, priority_tier, action_tag)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source, external_id) DO NOTHING
    `);

    let synced = 0;
    let skipped = 0;
    let errors = 0;
    let filtered = 0;

    for (const msgId of allMessageIds) {
        try {
            const existing = db.prepare(
                "SELECT id FROM messages WHERE source = 'gmail' AND external_id = ?"
            ).get(msgId);
            if (existing) { skipped++; continue; }

            const msgRes = await gmail.users.messages.get({
                userId: 'me',
                id: msgId,
                format: 'metadata',
                metadataHeaders: ['From', 'Subject', 'Date', 'Message-ID', 'List-Unsubscribe'],
            });

            const headers = msgRes.data.payload?.headers || [];
            const from = getHeader(headers, 'From');
            const subject = getHeader(headers, 'Subject');
            const date = getHeader(headers, 'Date');
            const snippet = msgRes.data.snippet || '';
            const labelIds = msgRes.data.labelIds || [];
            const listUnsubscribe = getHeader(headers, 'List-Unsubscribe');

            const { name: senderName, address: senderAddress } = parseFrom(from);

            // ── Layer 1: List-Unsubscribe header = definitive newsletter ──
            if (listUnsubscribe) { filtered++; continue; }

            // ── Layer 2: Gmail category labels (even within Primary, double-check) ──
            const nonPersonalLabels = ['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS'];
            if (nonPersonalLabels.some(l => labelIds.includes(l))) { filtered++; continue; }

            // ── Layer 3: Automated sender patterns ──
            if (isAutomatedAddress(senderAddress)) { filtered++; continue; }

            const receivedAt = date ? new Date(date).toISOString() : new Date().toISOString();

            // ── Layer 4: Contacts system (blocked/ignored/VIP) + scoring engine ──
            const scoring = computeUrgencyScore({
                sender_id: senderAddress,
                sender_address: senderAddress,
                preview: snippet,
                full_content: snippet,
                subject,
                source: 'gmail',
                timestamp: receivedAt,
                is_unread: labelIds.includes('UNREAD'),
            });

            if (scoring.blocked) { filtered++; continue; }

            const urgencyScore = Math.max(1, Math.min(5, Math.round(scoring.score / 20)));
            const actionTag = detectActionTag(snippet, subject);

            upsert.run(
                'gmail',
                msgId,
                senderName,
                senderAddress,
                subject,
                snippet ? snippet.slice(0, 200) : null,
                receivedAt,
                urgencyScore,
                scoring.project_id,
                scoring.contact_id,
                scoring.category,
                scoring.tier,
                actionTag,
            );
            synced++;
        } catch (e) {
            console.warn(`Gmail sync: failed to process message ${msgId}:`, e.message);
            errors++;
        }
    }

    return { synced, skipped, errors, total: allMessageIds.length, filtered };
}

module.exports = { syncGmail };
