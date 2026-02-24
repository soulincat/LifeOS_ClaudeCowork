/**
 * Apple Mail Read Integration
 * Reads unread emails from specified Mail.app mailboxes and ingests them
 * into the LifeOS messages inbox (source='apple-mail').
 *
 * Setup: Add Gmail / Outlook accounts to Mail.app via System Settings → Internet Accounts.
 * Then configure inboxes in Setup → Integrations (e.g. "iCloud/INBOX,Gmail/INBOX").
 */

const { execSync } = require('child_process');
const db = require('../db/database');

function getMailboxes() {
    try {
        const row = db.prepare("SELECT payload FROM setup_sections WHERE section_key = 'integrations'").get();
        if (row) {
            const p = JSON.parse(row.payload);
            if (Array.isArray(p.mail_inboxes) && p.mail_inboxes.length) return p.mail_inboxes;
        }
    } catch (e) { /* fall through */ }
    return ['iCloud/INBOX']; // default
}

function listMailboxes() {
    const script = `
tell application "Mail"
    set allBoxes to {}
    repeat with a in accounts
        repeat with mb in every mailbox of a
            set allBoxes to allBoxes & {name of a & "/" & name of mb}
        end repeat
    end repeat
    return allBoxes
end tell`;
    try {
        const raw = execSync(`osascript << 'ASEOF'\n${script}\nASOEF`, { encoding: 'utf8', timeout: 10000 }).trim();
        return raw ? raw.split(', ') : [];
    } catch (e) {
        return [];
    }
}

const HIGH_URGENCY_PATTERNS = [
    /urgent|asap|immediately|emergency|critical/i,
    /deadline|due today|by end of day|eod/i,
    /invoice|payment|overdue|outstanding/i,
    /contract|agreement|sign|approve/i,
];

function scoreEmailUrgency(subject = '', sender = '') {
    const text = (subject + ' ' + sender).trim();
    if (!text) return 2;
    if (/unsubscribe|newsletter|no.reply|noreply|donotreply/i.test(text)) return 1;
    if (HIGH_URGENCY_PATTERNS.some(p => p.test(text))) return 4;
    if (/\?/.test(subject)) return 3;
    return 3; // emails default medium-high — they land in inbox intentionally
}

function syncMail({ mailboxes } = {}) {
    const boxes = mailboxes || getMailboxes();
    if (!boxes.length) return { synced: 0, skipped: 0 };

    let synced = 0, skipped = 0;

    for (const boxPath of boxes) {
        const [accountName, ...mbParts] = boxPath.split('/');
        const mbName = mbParts.join('/');

        const script = `
tell application "Mail"
    set results to {}
    try
        set acct to account "${accountName.replace(/"/g, '\\"')}"
        set mb to mailbox "${mbName.replace(/"/g, '\\"')}" of acct
        set msgs to (every message of mb whose read status is false)
        repeat with m in msgs
            try
                set mId to message id of m
                set mSubject to subject of m
                set mSender to sender of m
                set mDate to (date received of m) as string
                set mPreview to content of m
                if length of mPreview > 300 then set mPreview to (text 1 thru 300 of mPreview)
                set results to results & {mId & "|||" & mSubject & "|||" & mSender & "|||" & mDate & "|||" & mPreview}
            end try
        end repeat
    end try
    return results
end tell`;

        let raw;
        try {
            raw = execSync(`osascript << 'ASEOF'\n${script}\nASOEF`, { encoding: 'utf8', timeout: 30000 }).trim();
        } catch (e) {
            console.warn(`Mail sync failed for ${boxPath}:`, e.message);
            continue;
        }

        if (!raw) continue;

        const items = raw.split(', ');
        for (const item of items) {
            const parts = item.split('|||');
            if (parts.length < 4) { skipped++; continue; }
            const [msgId, subject, sender, dateStr, preview = ''] = parts;
            if (!msgId) { skipped++; continue; }

            const existing = db.prepare(
                "SELECT id FROM messages WHERE source='apple-mail' AND external_id=?"
            ).get(msgId.trim());
            if (existing) { skipped++; continue; }

            const receivedAt = new Date(dateStr).toISOString();
            const urgency = scoreEmailUrgency(subject, sender);
            // Skip newsletters/no-reply
            if (urgency === 1) { skipped++; continue; }

            // Extract display name from "Name <email>" format
            const nameMatch = sender.match(/^(.+?)\s*</);
            const senderName = nameMatch ? nameMatch[1].trim() : sender.trim();
            const emailMatch = sender.match(/<(.+?)>/);
            const senderAddress = emailMatch ? emailMatch[1].trim() : sender.trim();

            db.prepare(`
                INSERT INTO messages
                    (source, external_id, sender_name, sender_address, subject,
                     preview, received_at, urgency_score, ai_summary, ai_suggested_reply)
                VALUES ('apple-mail', ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
                ON CONFLICT(source, external_id) DO NOTHING
            `).run(
                msgId.trim(),
                senderName,
                senderAddress,
                subject?.slice(0, 200) || '(no subject)',
                preview?.slice(0, 200) || null,
                receivedAt,
                urgency
            );
            synced++;
        }
    }

    return { synced, skipped };
}

module.exports = { syncMail, listMailboxes, getMailboxes };
