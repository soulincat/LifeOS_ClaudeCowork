/**
 * Telegram Routes
 * POST /api/telegram/briefing  — generate + send daily briefing
 * POST /api/telegram/test      — send a test ping
 * POST /api/telegram/todos     — send today's todos
 * POST /api/telegram/alert     — send a custom alert
 */

const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { buildPAContext } = require('../integrations/pa-context');
const telegram = require('../integrations/telegram');

const PA_BRIEF_PROMPT = `Generate a concise daily briefing for Telegram. Cover:
1. **Today's priorities** — top 3 action items from todos + upcoming
2. **Urgent / overdue** — anything past due
3. **Focus areas** — based on goals
4. **Quick wins** — small tasks to knock out first

Keep it punchy and actionable. Use short bullet points. No filler.`;

async function callClaude(prompt) {
    const Anthropic = require('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const context = (() => { try { return buildPAContext(); } catch (e) { return ''; } })();
    const response = await anthropic.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929',
        max_tokens: 1024,
        system: `You are an executive PA. Today is ${new Date().toISOString().slice(0, 10)}.\n\nCONTEXT:\n${context}`,
        messages: [{ role: 'user', content: prompt }],
    });
    return response.content[0].text;
}

/**
 * POST /api/telegram/briefing
 * Generate a daily AI briefing and send it to Telegram.
 * Body: { type: 'daily' | 'todo' | 'digest' }
 */
router.post('/briefing', async (req, res) => {
    const { type = 'daily' } = req.body || {};
    if (!process.env.TELEGRAM_BOT_TOKEN) {
        return res.status(400).json({ error: 'TELEGRAM_BOT_TOKEN not configured in .env' });
    }
    try {
        const text = await callClaude(PA_BRIEF_PROMPT);
        const chunks = await telegram.sendBriefing('Daily Briefing', text);
        res.json({ success: true, chunks, preview: text.slice(0, 200) });
    } catch (err) {
        console.error('Telegram briefing error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/telegram/todos
 * Send today's pending todos as a Telegram message.
 */
router.post('/todos', async (req, res) => {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
        return res.status(400).json({ error: 'TELEGRAM_BOT_TOKEN not configured in .env' });
    }
    try {
        const today = new Date().toISOString().slice(0, 10);
        const todos = db.prepare(`
            SELECT text, due_date FROM todos
            WHERE completed = 0 AND (archived IS NULL OR archived = 0)
            ORDER BY due_date ASC NULLS LAST LIMIT 20
        `).all();
        const overdue = todos.filter(t => t.due_date && t.due_date < today);
        const dueToday = todos.filter(t => t.due_date === today);
        const upcoming = todos.filter(t => !t.due_date || t.due_date > today);

        let msg = '<b>📋 Todos</b>\n\n';
        if (overdue.length) {
            msg += '<b>⚠️ Overdue</b>\n' + overdue.map(t => `• ${t.text} <i>(${t.due_date})</i>`).join('\n') + '\n\n';
        }
        if (dueToday.length) {
            msg += '<b>Today</b>\n' + dueToday.map(t => `• ${t.text}`).join('\n') + '\n\n';
        }
        if (upcoming.length) {
            msg += '<b>Upcoming</b>\n' + upcoming.slice(0, 8).map(t => {
                const due = t.due_date ? ` <i>(${t.due_date})</i>` : '';
                return `• ${t.text}${due}`;
            }).join('\n');
        }
        if (!todos.length) msg += 'No pending todos ✅';

        await telegram.sendMessage(msg.trim(), { parse_mode: 'HTML' });
        res.json({ success: true, sent: todos.length });
    } catch (err) {
        console.error('Telegram todos error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/telegram/alert
 * Send a custom alert message.
 * Body: { title: string, message: string }
 */
router.post('/alert', async (req, res) => {
    const { title = 'Alert', message } = req.body || {};
    if (!message) return res.status(400).json({ error: 'message required' });
    if (!process.env.TELEGRAM_BOT_TOKEN) {
        return res.status(400).json({ error: 'TELEGRAM_BOT_TOKEN not configured in .env' });
    }
    try {
        await telegram.sendAlert(title, message);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/telegram/test
 * Send a test ping to confirm bot + chat ID are working.
 */
router.post('/test', async (req, res) => {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
        return res.status(400).json({ error: 'TELEGRAM_BOT_TOKEN not configured in .env' });
    }
    try {
        await telegram.testConnection();
        res.json({ success: true, message: 'Ping sent to Telegram.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/telegram/bot/start — start the interactive command bot (long-polling)
 * POST /api/telegram/bot/stop  — stop polling
 */
let bot = null;
router.post('/bot/start', (req, res) => {
    if (!process.env.TELEGRAM_BOT_TOKEN) return res.status(400).json({ error: 'TELEGRAM_BOT_TOKEN not set' });
    if (bot) return res.json({ status: 'already running' });
    bot = require('../integrations/telegram-bot');
    bot.registerCommands().catch(console.error);
    bot.poll();
    res.json({ status: 'started' });
});
router.post('/bot/stop', (req, res) => {
    if (bot) { bot.stop(); bot = null; }
    res.json({ status: 'stopped' });
});

module.exports = router;

// Auto-start bot if token is configured (runs when server loads this route file)
if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    const autoBot = require('../integrations/telegram-bot');
    autoBot.registerCommands().catch(console.error);
    autoBot.poll();
    console.log('✅ Telegram bot started (auto)');
}
