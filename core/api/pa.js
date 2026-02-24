/**
 * PA (Executive Assistant) Routes
 * Dedicated endpoint for the AI-powered personal assistant with full life OS context.
 */

const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { buildPAContext } = require('../../integrations/pa/context');
const { executeCommandsFromResponse, parseCommands } = require('../../integrations/pa/commands');

const PA_SYSTEM_PROMPT = `You are an Executive PA and Project Manager. Direct, efficient, British English. No waffle.

STYLE:
- Be direct and brief. Act, don't announce.
- When asked to send a message, draft it and issue the COMMAND immediately — don't say "I'll do it once I have the info"
- Briefings and analysis: be thorough. Routine actions: terse.
- When prioritising, be opinionated — give a clear ranked order with brief reasoning.

COMMANDS:
Issue COMMAND blocks to take actions. Write them as plain text — NOT inside code fences or backticks.
Format: COMMAND name on one line, JSON on the next line, nothing else.

COMMAND: add_todo
{"text": "Send invoice to client X", "due_date": "YYYY-MM-DD"}

COMMAND: add_upcoming
{"title": "Call with Sarah", "type": "meeting", "due_date": "2026-02-20T15:00:00", "description": "Contract review"}

COMMAND: reschedule_item
{"id": 123, "due_date": "2026-02-21T10:00:00"}

COMMAND: complete_todo
{"id": 45}

COMMAND: draft_email
{"subject": "Meeting request", "to_email": "sarah@example.com", "body": "Dear Sarah,\n\n...", "context_note": "context"}

COMMAND: schedule_meeting
{"title": "Contract review with Sarah", "due_date": "2026-02-20T15:00:00", "description": "Review draft", "to_email": "sarah@example.com", "draft_subject": "Meeting: Contract review", "draft_body": "Dear Sarah,..."}

COMMAND: add_pa_note
{"key": "sarah_context", "value": "Working on contract renewal, deadline end of Feb"}

COMMAND: add_project_task
{"project_name": "My Project", "text": "Call supplier", "due_date": "2026-02-28", "type": "deliverable", "energy_required": "medium"}

COMMAND: complete_project_task
{"text": "call supplier"}

COMMAND: update_next_action
{"project_name": "My Project", "next_action": "Send signed agreement by Friday"}

COMMAND: update_trigger
{"title": "Korean open rate", "actual_value": 18}

COMMAND: add_inbox_item
{"source": "manual", "sender_name": "Self", "preview": "Check Wise transfer status"}

COMMAND: send_whatsapp
{"recipient": "4917647618740@s.whatsapp.net", "recipient_name": "Arno", "message": "Hey Arno, checking in about tomorrow — still on?"}

COMMAND: send_email
{"to": "john@example.com", "subject": "Re: Invoice", "body": "Hi John,\n\nThanks for getting in touch..."}

SENDING RULES:
- send_whatsapp recipient must be a WhatsApp JID (digits@s.whatsapp.net) or a phone number with country code. Look up the contact's JID from the CONTACTS and RECENT_WHATSAPP_CHATS sections. Always include recipient_name.
- send_whatsapp and send_email show a preview card with a Send button — the user confirms before anything transmits. Issue the COMMAND directly; no need to say "confirm?" yourself.
- All other COMMAND actions execute immediately without asking. Just do it.
- Do NOT wrap COMMAND blocks in code fences (no backticks). Plain text only.

CURRENT LIFE OS CONTEXT:
`;

/**
 * Call Claude — shared BYOK client (DB key → .env key → Cowork endpoint)
 */
const { callClaude } = require('../claude-client');

/**
 * Build system prompt with live context injected.
 */
function buildSystemPrompt() {
    try {
        const context = buildPAContext();
        let prompt = PA_SYSTEM_PROMPT + '\n' + context;

        // Override STYLE section based on user preference
        try {
            const row = db.prepare("SELECT payload FROM setup_sections WHERE section_key = 'user_priorities'").get();
            if (row && row.payload) {
                const pri = JSON.parse(row.payload);
                if (pri.pa_style === 'warm') {
                    prompt = prompt.replace(
                        /STYLE:\n- Be direct and brief\. Act, don't announce\./,
                        "STYLE:\n- Be conversational and encouraging. Use a friendly, supportive tone."
                    );
                } else if (pri.pa_style === 'professional') {
                    prompt = prompt.replace(
                        /STYLE:\n- Be direct and brief\. Act, don't announce\./,
                        "STYLE:\n- Use a structured, formal tone. Be thorough but efficient."
                    );
                }
            }
        } catch (e) { /* default style */ }

        return prompt;
    } catch (e) {
        return PA_SYSTEM_PROMPT + '\n(Context unavailable)';
    }
}

/**
 * POST /api/pa/chat
 * Main PA conversation endpoint.
 */
router.post('/chat', async (req, res) => {
    const { message } = req.body;
    if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'message is required' });
    }

    try {
        const systemPrompt = buildSystemPrompt();
        const { text, source, usage } = await callClaude(systemPrompt, message);

        // Separate send commands (need frontend confirmation) from auto-execute commands
        const allCmds = parseCommands(text);
        let pendingActions = allCmds.filter(c => c.command === 'send_whatsapp' || c.command === 'send_email');

        // Enrich pendingActions with contact info from DB
        pendingActions = pendingActions.map(cmd => {
            try {
                const p = cmd.params || {};
                if (cmd.command === 'send_whatsapp') {
                    // Look up by JID or phone in contacts
                    const recipient = String(p.recipient || '').replace(/[\s\+\(\)\-]/g, '');
                    const contact = db.prepare(`
                        SELECT name, label, type, relationship, project_id FROM contacts
                        WHERE phone = ? OR whatsapp_jid = ? OR whatsapp_jid LIKE ?
                        LIMIT 1
                    `).get(recipient, p.recipient, recipient + '@%');
                    if (contact) {
                        return { ...cmd, params: { ...p, recipient_name: contact.name, _label: contact.label, _type: contact.type } };
                    }
                } else if (cmd.command === 'send_email') {
                    const contact = db.prepare(`
                        SELECT name, label, type, relationship FROM contacts WHERE email = ? LIMIT 1
                    `).get(p.to);
                    if (contact) {
                        return { ...cmd, params: { ...p, recipient_name: contact.name, _label: contact.label, _type: contact.type } };
                    }
                }
            } catch (e) { /* */ }
            return cmd;
        });

        // Execute non-send commands automatically
        let commandResults = [];
        try {
            commandResults = await executeCommandsFromResponse(text);
            // Remove "Unknown PA command" entries for send_* (they're handled by frontend)
            commandResults = commandResults.filter(r => !String(r).startsWith('Unknown PA command: send_'));
        } catch (e) { /* don't fail the response if commands error */ }

        // Save conversation (tagged as 'pa' source for context retrieval)
        db.prepare(`
            INSERT INTO agent_conversations (message, response, source)
            VALUES (?, ?, ?)
        `).run(message, text, 'pa');

        res.json({ response: text, source, usage: usage || null, commandResults, pendingActions });
    } catch (error) {
        console.error('PA chat error:', error);
        res.status(500).json({ error: 'PA chat failed: ' + error.message });
    }
});

/**
 * POST /api/pa/brief
 * Generate an on-demand briefing (daily overview or pre-meeting).
 * Body: { type: 'daily' | 'meeting', meeting_id?: number }
 */
router.post('/brief', async (req, res) => {
    const { type = 'daily', meeting_id } = req.body || {};

    let prompt;
    if (type === 'meeting' && meeting_id) {
        const item = db.prepare('SELECT * FROM upcoming_items WHERE id = ?').get(meeting_id);
        if (!item) return res.status(404).json({ error: 'Meeting not found' });
        prompt = `Generate a concise pre-meeting briefing for: "${item.title}" on ${item.due_date}. Description: ${item.description || 'none'}. Include: key objectives, relevant background from context, suggested talking points, and any preparation needed.`;
    } else {
        prompt = `Generate my daily briefing. Cover: (1) today's priorities based on my todos and upcoming items, (2) anything urgent or overdue, (3) top 3 focus areas for the day given my goals, (4) any quick wins I should knock out first. Be direct and actionable.`;
    }

    try {
        const systemPrompt = buildSystemPrompt();
        const { text, source } = await callClaude(systemPrompt, prompt);
        res.json({ briefing: text, source });
    } catch (error) {
        console.error('PA brief error:', error);
        res.status(500).json({ error: 'Failed to generate briefing' });
    }
});

/**
 * POST /api/pa/draft
 * Draft an email response from raw context text.
 * Body: { context: string, to_email?: string, subject?: string }
 */
router.post('/draft', async (req, res) => {
    const { context, to_email, subject } = req.body || {};
    if (!context) return res.status(400).json({ error: 'context is required' });

    const prompt = `Draft a professional email response. Context: ${context}${to_email ? `. To: ${to_email}` : ''}${subject ? `. Re: ${subject}` : ''}. Write the full email body only (no subject line), in first person, in my voice — direct, professional, and concise. End with an appropriate sign-off.`;

    try {
        const systemPrompt = buildSystemPrompt();
        const { text, source } = await callClaude(systemPrompt, prompt);

        // Auto-save as draft
        const result = db.prepare(`
            INSERT INTO pa_drafts (subject, to_email, body, context_note, status)
            VALUES (?, ?, ?, ?, 'draft')
        `).run(subject || '', to_email || '', text, context.slice(0, 200));

        res.json({ draft: text, draft_id: result.lastInsertRowid, source });
    } catch (error) {
        console.error('PA draft error:', error);
        res.status(500).json({ error: 'Failed to generate draft' });
    }
});

/**
 * POST /api/pa/prioritize
 * Analyse todos + goals and return a prioritised work plan.
 */
router.post('/prioritize', async (req, res) => {
    const prompt = `Review my current todos, upcoming items, and goals. Give me a clear prioritised order for today and this week. For each item, give a one-line reason. Then suggest: (1) what to do first thing, (2) what to schedule as deep work blocks, (3) what to delegate or drop. Be opinionated and direct.`;

    try {
        const systemPrompt = buildSystemPrompt();
        const { text, source } = await callClaude(systemPrompt, prompt);

        // Execute any add_upcoming commands for suggested calendar blocks
        await executeCommandsFromResponse(text).catch(() => {});

        res.json({ priorities: text, source });
    } catch (error) {
        console.error('PA prioritize error:', error);
        res.status(500).json({ error: 'Failed to generate priorities' });
    }
});

/**
 * GET /api/pa/digest
 * Structured daily digest from the database (no Claude call — raw data).
 */
router.get('/digest', (req, res) => {
    try {
        const today = new Date().toISOString().slice(0, 10);
        const sevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        const todos = db.prepare(`
            SELECT id, text, due_date FROM todos
            WHERE completed = 0 AND (archived IS NULL OR archived = 0)
            ORDER BY due_date ASC NULLS LAST LIMIT 20
        `).all();

        const upcoming = db.prepare(`
            SELECT * FROM upcoming_items
            WHERE due_date >= datetime('now') AND due_date <= ?
            ORDER BY due_date ASC LIMIT 15
        `).all(sevenDays);

        const urgentEmails = (() => {
            try {
                return db.prepare(`
                    SELECT id, subject, from_name, from_email, received_at
                    FROM emails WHERE is_read = 0
                    ORDER BY is_urgent DESC, received_at DESC LIMIT 10
                `).all();
            } catch (e) { return []; }
        })();

        const drafts = db.prepare(`
            SELECT * FROM pa_drafts WHERE status = 'draft' ORDER BY created_at DESC LIMIT 5
        `).all();

        const overdue = todos.filter(t => t.due_date && t.due_date < today);
        const dueToday = todos.filter(t => t.due_date === today);

        res.json({
            date: today,
            overdue_todos: overdue,
            due_today: dueToday,
            all_todos: todos,
            upcoming,
            urgent_emails: urgentEmails,
            drafts
        });
    } catch (error) {
        console.error('PA digest error:', error);
        res.status(500).json({ error: 'Failed to get digest' });
    }
});

/**
 * GET /api/pa/drafts
 * List saved email drafts.
 */
router.get('/drafts', (req, res) => {
    try {
        const drafts = db.prepare(`
            SELECT * FROM pa_drafts ORDER BY created_at DESC LIMIT 50
        `).all();
        res.json(drafts);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch drafts' });
    }
});

/**
 * PATCH /api/pa/drafts/:id
 * Update draft status (draft → sent / discarded).
 */
router.patch('/drafts/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { status, subject, to_email, body } = req.body;
        const fields = [];
        const values = [];
        if (status) { fields.push('status = ?'); values.push(status); }
        if (subject !== undefined) { fields.push('subject = ?'); values.push(subject); }
        if (to_email !== undefined) { fields.push('to_email = ?'); values.push(to_email); }
        if (body !== undefined) { fields.push('body = ?'); values.push(body); }
        if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
        values.push(id);
        db.prepare(`UPDATE pa_drafts SET ${fields.join(', ')} WHERE id = ?`).run(...values);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update draft' });
    }
});

/**
 * DELETE /api/pa/drafts/:id
 */
router.delete('/drafts/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM pa_drafts WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete draft' });
    }
});

/**
 * POST /api/pa/send
 * Actually send a WhatsApp message or email after user confirms.
 * Body: { type: 'whatsapp'|'email', recipient, message, subject? }
 */
router.post('/send', async (req, res) => {
    const { type, recipient, message, subject } = req.body || {};
    if (!type || !recipient || !message) {
        return res.status(400).json({ error: 'type, recipient, and message are required' });
    }
    try {
        if (type === 'whatsapp') {
            const waSend = require('../../integrations/whatsapp');
            await waSend.sendNew(recipient, message);
            console.log(`✅ PA sent WhatsApp to ${recipient}`);
        } else if (type === 'email') {
            const gmailSend = require('../../integrations/gmail');
            await gmailSend.sendNew({ to: recipient, subject: subject || '(no subject)', body: message });
            console.log(`✅ PA sent email to ${recipient}`);
        } else {
            return res.status(400).json({ error: 'type must be whatsapp or email' });
        }
        res.json({ success: true });
    } catch (e) {
        console.error('PA send error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
