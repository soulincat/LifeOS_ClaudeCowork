const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { computeUrgencyScore } = require('../db/derived-state');

/**
 * GET /api/messages
 * Fetch triage queue — pending and approved, urgency-sorted, newest first.
 * Query params:
 *   source=gmail|outlook|whatsapp  (filter by source)
 *   status=pending|approved|sent|dismissed (filter by status, default: pending,approved)
 *   limit=N (default 50)
 */
router.get('/', (req, res) => {
    try {
        const { source, status, limit = 50 } = req.query;
        const statuses = status ? [status] : ['pending', 'approved'];
        const placeholders = statuses.map(() => '?').join(',');

        let query = `
            SELECT * FROM messages
            WHERE status IN (${placeholders})
        `;
        const params = [...statuses];

        if (source) {
            query += ' AND source = ?';
            params.push(source);
        }

        query += ' ORDER BY urgency_score DESC, received_at DESC LIMIT ?';
        params.push(Number(limit));

        const messages = db.prepare(query).all(...params);
        res.json(messages);
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

/**
 * GET /api/messages/grouped
 * Returns one row per sender, with the latest message preview and total count.
 * Used by the inbox for a "per person" view.
 * Query params: source=whatsapp|gmail|... (default: all pending)
 */
router.get('/grouped', (req, res) => {
    try {
        const { source } = req.query;
        const params = [];
        let sourceFilter = '';
        if (source) {
            sourceFilter = ' AND source = ?';
            params.push(source);
        }
        const rows = db.prepare(`
            SELECT
                source,
                sender_address,
                sender_name,
                MAX(urgency_score) AS urgency_score,
                MAX(received_at)   AS latest_received_at,
                COUNT(*)           AS msg_count,
                (SELECT preview FROM messages m2
                 WHERE m2.sender_address = m.sender_address
                   AND m2.source = m.source
                   AND m2.status IN ('pending','approved')
                 ORDER BY m2.received_at DESC LIMIT 1) AS latest_preview,
                (SELECT id FROM messages m2
                 WHERE m2.sender_address = m.sender_address
                   AND m2.source = m.source
                   AND m2.status IN ('pending','approved')
                 ORDER BY m2.received_at DESC LIMIT 1) AS representative_id
            FROM messages m
            WHERE status IN ('pending','approved')${sourceFilter}
            GROUP BY source, sender_address
            ORDER BY urgency_score DESC, latest_received_at DESC
        `).all(...params);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching grouped messages:', error);
        res.status(500).json({ error: 'Failed to fetch grouped messages' });
    }
});

/**
 * GET /api/messages/tiered
 * Returns messages grouped by sender, pre-sectioned into { urgent, medium, ignored }.
 * Each row = one sender with latest message, msg_count, and representative_id.
 * Query params: source, project_id
 */
router.get('/tiered', (req, res) => {
    try {
        const { source, project_id } = req.query;
        let baseWhere = "m.status IN ('pending','approved')";
        const params = [];

        if (source) { baseWhere += ' AND m.source = ?'; params.push(source); }
        if (project_id) { baseWhere += ' AND m.project_id = ?'; params.push(Number(project_id)); }

        // Helper: grouped query for a specific tier filter
        function queryTier(tierWhere, limit) {
            return db.prepare(`
                SELECT
                    m.source,
                    m.sender_address,
                    m.sender_name,
                    MAX(m.urgency_score) AS urgency_score,
                    MAX(m.priority_tier) AS priority_tier,
                    MAX(m.received_at)   AS received_at,
                    COUNT(*)             AS msg_count,
                    MAX(m.project_id)    AS project_id,
                    MAX(m.contact_id)    AS contact_id,
                    MAX(m.category)      AS category,
                    (SELECT m2.preview FROM messages m2
                     WHERE m2.sender_address = m.sender_address AND m2.source = m.source
                       AND m2.status IN ('pending','approved')
                     ORDER BY m2.received_at DESC LIMIT 1) AS preview,
                    (SELECT m2.subject FROM messages m2
                     WHERE m2.sender_address = m.sender_address AND m2.source = m.source
                       AND m2.status IN ('pending','approved')
                     ORDER BY m2.received_at DESC LIMIT 1) AS subject,
                    (SELECT m2.ai_summary FROM messages m2
                     WHERE m2.sender_address = m.sender_address AND m2.source = m.source
                       AND m2.status IN ('pending','approved')
                     ORDER BY m2.received_at DESC LIMIT 1) AS ai_summary,
                    (SELECT m2.ai_suggested_reply FROM messages m2
                     WHERE m2.sender_address = m.sender_address AND m2.source = m.source
                       AND m2.status IN ('pending','approved')
                     ORDER BY m2.received_at DESC LIMIT 1) AS ai_suggested_reply,
                    (SELECT m2.id FROM messages m2
                     WHERE m2.sender_address = m.sender_address AND m2.source = m.source
                       AND m2.status IN ('pending','approved')
                     ORDER BY m2.received_at DESC LIMIT 1) AS id,
                    p.name AS project_name,
                    c.name AS contact_name,
                    c.label AS contact_label
                FROM messages m
                LEFT JOIN projects p ON m.project_id = p.id
                LEFT JOIN contacts c ON m.contact_id = c.id
                WHERE ${baseWhere} AND ${tierWhere}
                GROUP BY m.source, m.sender_address
                ORDER BY MAX(m.urgency_score) DESC, MAX(m.received_at) DESC
                LIMIT ${limit}
            `).all(...params);
        }

        const urgent  = queryTier("m.priority_tier = 'urgent'", 50);
        const medium  = queryTier("(m.priority_tier = 'medium' OR m.priority_tier IS NULL)", 50);
        const ignored = queryTier("m.priority_tier = 'ignored'", 20);

        res.json({ urgent, medium, ignored });
    } catch (error) {
        console.error('Error fetching tiered messages:', error);
        res.status(500).json({ error: 'Failed to fetch tiered messages' });
    }
});

/**
 * DELETE /api/messages/by-sender
 * Dismiss all messages from a sender_address + source combo.
 * Body: { source, sender_address }
 */
router.delete('/by-sender', (req, res) => {
    try {
        const { source, sender_address } = req.body;
        if (!source || !sender_address) return res.status(400).json({ error: 'source and sender_address required' });
        db.prepare("UPDATE messages SET status='dismissed' WHERE source=? AND sender_address=? AND status IN ('pending','approved')")
          .run(source, sender_address);
        res.json({ success: true });
    } catch (error) {
        console.error('Error dismissing by sender:', error);
        res.status(500).json({ error: 'Failed to dismiss' });
    }
});

/**
 * GET /api/messages/counts
 * Returns pending count per source for the sidebar badge.
 */
router.get('/counts', (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT source, COUNT(*) as count
            FROM messages
            WHERE status = 'pending'
            GROUP BY source
        `).all();

        // For WA, badge = conversation count (distinct senders), not raw messages
        const waConvos = db.prepare(`
            SELECT COUNT(DISTINCT sender_address) as count
            FROM messages WHERE source='whatsapp' AND status='pending'
        `).get();

        const counts = { gmail: 0, outlook: 0, whatsapp: 0, total: 0 };
        for (const row of rows) {
            counts[row.source] = row.count;
            counts.total += row.count;
        }
        // Override WA with conversation count so badge reflects grouped view
        const waDiff = counts.whatsapp - (waConvos?.count || 0);
        counts.whatsapp = waConvos?.count || 0;
        counts.total = Math.max(0, counts.total - waDiff);
        res.json(counts);
    } catch (error) {
        console.error('Error fetching message counts:', error);
        res.status(500).json({ error: 'Failed to fetch counts' });
    }
});

/**
 * POST /api/messages/ingest
 * Called by the LifeOS MCP server (via Claude) to write triage results.
 * Body: { source, external_id, sender_name, sender_address, subject,
 *         preview, received_at, urgency_score, ai_summary, ai_suggested_reply }
 */
router.post('/ingest', (req, res) => {
    try {
        const {
            source,
            external_id,
            sender_name,
            sender_address,
            subject,
            preview,
            received_at,
            urgency_score,
            ai_summary,
            ai_suggested_reply
        } = req.body;

        if (!source || !received_at) {
            return res.status(400).json({ error: 'source and received_at are required' });
        }

        // Run scoring engine to auto-categorize
        const scoring = computeUrgencyScore({
            sender_id: sender_address,
            sender_address,
            preview,
            full_content: preview,
            subject,
            source,
            timestamp: received_at,
            is_unread: true
        });

        // Blocked contacts → skip insert entirely
        if (scoring.blocked) {
            return res.json({ success: true, skipped: true, reason: 'blocked_sender' });
        }

        // Use higher of AI-provided urgency vs computed score (AI may have more context)
        const finalScore = Math.max(urgency_score || 3, scoring.score > 0 ? Math.round(scoring.score / 20) : 3);

        const stmt = db.prepare(`
            INSERT INTO messages
                (source, external_id, sender_name, sender_address, subject,
                 preview, received_at, urgency_score, ai_summary, ai_suggested_reply,
                 project_id, contact_id, category, priority_tier)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(source, external_id) DO UPDATE SET
                urgency_score = excluded.urgency_score,
                ai_summary = excluded.ai_summary,
                ai_suggested_reply = excluded.ai_suggested_reply,
                project_id = COALESCE(excluded.project_id, messages.project_id),
                contact_id = COALESCE(excluded.contact_id, messages.contact_id),
                category = COALESCE(excluded.category, messages.category),
                priority_tier = excluded.priority_tier
        `);

        const result = stmt.run(
            source,
            external_id || null,
            sender_name || null,
            sender_address || null,
            subject || null,
            preview ? preview.slice(0, 200) : null,
            received_at,
            finalScore,
            ai_summary || null,
            ai_suggested_reply || null,
            scoring.project_id,
            scoring.contact_id,
            scoring.category,
            scoring.tier
        );

        const action = result.changes > 0 ? 'ingested' : 'duplicate skipped';
        res.json({ success: true, id: result.lastInsertRowid, action, priority_tier: scoring.tier });
    } catch (error) {
        console.error('Error ingesting message:', error);
        res.status(500).json({ error: 'Failed to ingest message' });
    }
});

/**
 * PATCH /api/messages/:id
 * Update a message — edit suggested reply text, change status, project, category, etc.
 * Body: { ai_suggested_reply?, status?, project_id?, category?, priority_tier? }
 */
router.patch('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { ai_suggested_reply, status, project_id, category, priority_tier } = req.body;

        const msg = db.prepare('SELECT id FROM messages WHERE id = ?').get(id);
        if (!msg) return res.status(404).json({ error: 'Message not found' });

        if (ai_suggested_reply !== undefined) {
            db.prepare('UPDATE messages SET ai_suggested_reply = ? WHERE id = ?')
              .run(ai_suggested_reply, id);
        }
        if (status !== undefined) {
            db.prepare('UPDATE messages SET status = ? WHERE id = ?')
              .run(status, id);
        }
        if (project_id !== undefined) {
            db.prepare('UPDATE messages SET project_id = ? WHERE id = ?')
              .run(project_id || null, id);
        }
        if (category !== undefined) {
            db.prepare('UPDATE messages SET category = ? WHERE id = ?')
              .run(category || null, id);
        }
        if (priority_tier !== undefined) {
            db.prepare('UPDATE messages SET priority_tier = ? WHERE id = ?')
              .run(priority_tier, id);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating message:', error);
        res.status(500).json({ error: 'Failed to update message' });
    }
});

/**
 * POST /api/messages/:id/send
 * Approve and send a reply. Writes to send queue then calls the
 * appropriate send integration based on message source.
 * Body: { reply_text }
 */
router.post('/:id/send', async (req, res) => {
    try {
        const { id } = req.params;
        const { reply_text } = req.body;

        if (!reply_text || !reply_text.trim()) {
            return res.status(400).json({ error: 'reply_text is required' });
        }

        const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
        if (!msg) return res.status(404).json({ error: 'Message not found' });

        // Write to send queue
        const queueResult = db.prepare(`
            INSERT INTO message_send_queue (message_id, reply_text)
            VALUES (?, ?)
        `).run(id, reply_text.trim());

        const queueId = queueResult.lastInsertRowid;

        // Mark as approved optimistically
        db.prepare("UPDATE messages SET status = 'approved' WHERE id = ?").run(id);

        // Attempt to send via the right integration
        let sendError = null;
        try {
            if (msg.source === 'gmail') {
                const gmailSend = require('../../integrations/gmail');
                await gmailSend.sendReply(msg, reply_text.trim());
            } else if (msg.source === 'outlook') {
                const outlookSend = require('../../integrations/outlook');
                await outlookSend.sendReply(msg, reply_text.trim());
            } else if (msg.source === 'whatsapp') {
                const waSend = require('../../integrations/whatsapp');
                await waSend.sendReply(msg, reply_text.trim());
            }
        } catch (err) {
            sendError = err.message;
            console.error(`Send failed for message ${id} (${msg.source}):`, err.message);
        }

        if (sendError) {
            // Mark as failed in queue
            db.prepare(`
                UPDATE message_send_queue
                SET send_status = 'failed', error_text = ?, sent_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(sendError, queueId);
            // Revert message status so user can retry
            db.prepare("UPDATE messages SET status = 'pending' WHERE id = ?").run(id);
            return res.status(502).json({ error: 'Send failed: ' + sendError });
        }

        // Mark as sent
        db.prepare(`
            UPDATE message_send_queue
            SET send_status = 'sent', sent_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(queueId);
        db.prepare("UPDATE messages SET status = 'sent' WHERE id = ?").run(id);

        res.json({ success: true });
    } catch (error) {
        console.error('Error in send flow:', error);
        res.status(500).json({ error: 'Failed to send reply' });
    }
});

/**
 * DELETE /api/messages/:id
 * Dismiss a message (marks as dismissed, doesn't delete).
 */
router.delete('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const result = db.prepare("UPDATE messages SET status = 'dismissed' WHERE id = ?").run(id);
        if (result.changes === 0) return res.status(404).json({ error: 'Message not found' });
        res.json({ success: true });
    } catch (error) {
        console.error('Error dismissing message:', error);
        res.status(500).json({ error: 'Failed to dismiss message' });
    }
});

/**
 * POST /api/messages/sync
 * Sync WhatsApp messages directly from the bridge DB.
 * Optional query param: ?hours=N (default 24)
 */
router.post('/sync', async (req, res) => {
    const hours = parseInt(req.query.hours) || 24;
    try {
        const { syncWhatsApp } = require('../../integrations/whatsapp/sync');
        const result = syncWhatsApp({ hours });
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Sync error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/messages/sync-mail
 * Sync unread emails from Apple Mail.app into the inbox.
 * Optional body: { mailboxes: ['iCloud/INBOX', 'Gmail/INBOX'] }
 */
router.post('/sync-mail', (req, res) => {
    try {
        const { mailboxes } = req.body || {};
        const { syncMail } = require('../../integrations/apple/mail');
        const result = syncMail({ mailboxes });
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Mail sync error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/messages/mailboxes
 * List available Mail.app mailboxes for setup configuration.
 */
router.get('/mailboxes', (req, res) => {
    try {
        const { listMailboxes } = require('../../integrations/apple/mail');
        res.json(listMailboxes());
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
