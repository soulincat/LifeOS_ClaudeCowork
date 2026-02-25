#!/usr/bin/env node
/**
 * run-telegram-briefing.js
 * Generates a daily AI briefing from LifeOS data and sends it to Telegram.
 * Can be run standalone (cron / LaunchAgent) without the HTTP server.
 *
 * Usage:
 *   node scripts/run-telegram-briefing.js              # daily briefing (default)
 *   node scripts/run-telegram-briefing.js todos        # just todos
 *   node scripts/run-telegram-briefing.js inbox        # urgent inbox messages
 *   node scripts/run-telegram-briefing.js all          # briefing + todos + inbox
 *
 * Or trigger via the running server:
 *   curl -s -X POST http://localhost:3001/api/telegram/briefing
 */

require('dotenv').config({ override: true });

const path = require('path');
const db = require(path.join(__dirname, '../core/db/database'));
const telegram = require(path.join(__dirname, '../integrations/telegram'));
const { buildPAContext, ensureFreshContext } = require(path.join(__dirname, '../integrations/pa/context'));

const MODE = process.argv[2] || 'daily';
const today = new Date().toISOString().slice(0, 10);

async function callClaude(prompt) {
    const Anthropic = require('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    // Sync stale data sources before building context
    try { await ensureFreshContext(); } catch (e) { /* non-blocking */ }
    const context = (() => { try { return buildPAContext(); } catch (e) { return '(context unavailable)'; } })();
    const response = await anthropic.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929',
        max_tokens: 1200,
        system: `You are an executive PA. Today is ${today}. Be direct and concise.\n\nCONTEXT:\n${context}`,
        messages: [{ role: 'user', content: prompt }],
    });
    return response.content[0].text;
}

async function sendDailyBriefing() {
    console.log('[telegram] Generating daily briefing…');
    const text = await callClaude(
        `Generate my daily briefing. Cover: (1) today\'s priorities from todos/upcoming, (2) anything urgent or overdue, (3) top 3 focus areas for the day. Keep it punchy and actionable — short bullets, no filler.`
    );
    await telegram.sendBriefing('Daily Briefing', text);
    console.log('[telegram] Daily briefing sent.');
}

async function sendTodos() {
    console.log('[telegram] Sending todos…');
    const todos = db.prepare(`
        SELECT text, due_date FROM todos
        WHERE completed = 0 AND (archived IS NULL OR archived = 0)
        ORDER BY due_date ASC NULLS LAST LIMIT 20
    `).all();
    await telegram.sendTodoReminder(todos);
    console.log(`[telegram] Sent ${todos.length} todos.`);
}

async function sendInboxAlerts() {
    console.log('[telegram] Checking inbox for urgent messages…');
    let urgent = [];
    try {
        urgent = db.prepare(`
            SELECT source, sender_name, subject, ai_summary, urgency_score
            FROM messages
            WHERE status = 'pending' AND urgency_score >= 4
            ORDER BY urgency_score DESC, received_at DESC
            LIMIT 5
        `).all();
    } catch (e) { /* messages table may not exist yet */ }

    if (urgent.length === 0) {
        console.log('[telegram] No urgent messages.');
        return;
    }

    let msg = '<b>📬 Urgent Messages</b>\n\n';
    for (const m of urgent) {
        const icon = m.urgency_score >= 5 ? '🔴' : '🟠';
        msg += `${icon} <b>${m.sender_name || 'Unknown'}</b>`;
        if (m.subject) msg += ` — ${m.subject}`;
        msg += `\n${m.ai_summary || ''}\n\n`;
    }
    await telegram.sendMessage(msg.trim(), { parse_mode: 'HTML' });
    console.log(`[telegram] Sent ${urgent.length} urgent alerts.`);
}

async function main() {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
        console.error('❌ TELEGRAM_BOT_TOKEN not set in .env');
        process.exit(1);
    }
    if (!process.env.TELEGRAM_CHAT_ID) {
        console.error('❌ TELEGRAM_CHAT_ID not set in .env');
        process.exit(1);
    }

    try {
        if (MODE === 'todos') {
            await sendTodos();
        } else if (MODE === 'inbox') {
            await sendInboxAlerts();
        } else if (MODE === 'all') {
            await sendDailyBriefing();
            await sendTodos();
            await sendInboxAlerts();
        } else {
            // default: daily briefing
            await sendDailyBriefing();
        }
        console.log('[telegram] Done.');
        process.exit(0);
    } catch (err) {
        console.error('[telegram] Error:', err.message);
        process.exit(1);
    }
}

main();
