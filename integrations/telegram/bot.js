/**
 * Telegram Bot — Interactive command handler (long-polling, no public URL needed)
 *
 * Commands:
 *   /brief        — AI daily briefing
 *   /todos        — today's todos (overdue + due today + upcoming)
 *   /add <text>   — add a todo (optional: "add Pay invoice by 2026-03-01")
 *   /done <text>  — complete a todo by fuzzy text match
 *   /inbox        — urgent pending messages (urgency 4+)
 *   /upcoming     — next 7 upcoming events/meetings
 *   /health       — latest health metrics
 *   /prioritise   — AI priority ranking
 *   /ask <q>      — ask the PA anything (full Claude response)
 *   /help         — command list
 *
 * Run standalone: node integrations/telegram-bot.js
 * Or start from server via POST /api/telegram/bot/start
 */

require('dotenv').config({ override: true });

const path = require('path');
const db = require(path.join(__dirname, '../db/database'));
const { buildPAContext } = require(path.join(__dirname, './pa-context'));
const telegram = require(path.join(__dirname, './telegram'));

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED_CHAT_ID = String(process.env.TELEGRAM_CHAT_ID || '');

let polling = false;
let offset = 0;

// ─── Command handlers ────────────────────────────────────────────────────────

const COMMANDS = {
    '/brief':      cmd_brief,
    '/todos':      cmd_todos,
    '/add':        cmd_add,
    '/done':       cmd_done,
    '/inbox':      cmd_inbox,
    '/upcoming':   cmd_upcoming,
    '/health':     cmd_health,
    '/prioritise': cmd_prioritise,
    '/prioritize': cmd_prioritise,
    '/ask':        cmd_ask,
    '/help':       cmd_help,
    '/start':      cmd_help,
};

async function cmd_help(chatId) {
    const text = `<b>LifeOS PA Bot</b>\n\n` +
        `/brief — daily AI briefing\n` +
        `/todos — todo list\n` +
        `/add &lt;text&gt; — add a todo\n` +
        `/done &lt;text&gt; — complete a todo\n` +
        `/inbox — urgent messages\n` +
        `/upcoming — next events\n` +
        `/health — recovery &amp; sleep\n` +
        `/prioritise — AI priority ranking\n` +
        `/ask &lt;question&gt; — ask your PA anything`;
    await telegram.sendMessage(text, { chat_id: chatId });
}

async function cmd_brief(chatId) {
    await telegram.sendMessage('⏳ Generating briefing…', { chat_id: chatId });
    const text = await callClaude(
        'Generate my daily briefing. Cover: priorities from todos/upcoming, anything urgent/overdue, top 3 focus areas. Short bullets, no filler.'
    );
    await telegram.sendBriefing('Daily Briefing', text);
}

async function cmd_todos(chatId) {
    const today = new Date().toISOString().slice(0, 10);
    const todos = db.prepare(`
        SELECT id, text, due_date FROM todos
        WHERE completed = 0 AND (archived IS NULL OR archived = 0)
        ORDER BY due_date ASC NULLS LAST LIMIT 20
    `).all();

    if (!todos.length) {
        return telegram.sendMessage('✅ No pending todos.', { chat_id: chatId });
    }

    const overdue = todos.filter(t => t.due_date && t.due_date < today);
    const dueToday = todos.filter(t => t.due_date === today);
    const rest = todos.filter(t => !t.due_date || t.due_date > today);

    let msg = '<b>📋 Todos</b>\n\n';
    if (overdue.length) msg += '<b>⚠️ Overdue</b>\n' + overdue.map(t => `• ${esc(t.text)} <i>(${t.due_date})</i>`).join('\n') + '\n\n';
    if (dueToday.length) msg += '<b>Today</b>\n' + dueToday.map(t => `• ${esc(t.text)}`).join('\n') + '\n\n';
    if (rest.length) msg += '<b>Upcoming</b>\n' + rest.slice(0, 8).map(t => {
        const due = t.due_date ? ` <i>(${t.due_date})</i>` : '';
        return `• ${esc(t.text)}${due}`;
    }).join('\n');

    await telegram.sendMessage(msg.trim(), { chat_id: chatId });
}

async function cmd_add(chatId, args) {
    if (!args) return telegram.sendMessage('Usage: /add <todo text> [by YYYY-MM-DD]', { chat_id: chatId });

    // Try to extract date — "by 2026-03-01" or "by tomorrow" etc
    const dateMatch = args.match(/\bby\s+(\d{4}-\d{2}-\d{2})\b/i);
    const due_date = dateMatch ? dateMatch[1] : null;
    const text = args.replace(/\bby\s+\d{4}-\d{2}-\d{2}\b/i, '').trim();

    db.prepare(`INSERT INTO todos (text, due_date, completed) VALUES (?, ?, 0)`).run(text, due_date);
    const msg = due_date
        ? `✅ Added: <b>${esc(text)}</b> <i>(due ${due_date})</i>`
        : `✅ Added: <b>${esc(text)}</b>`;
    await telegram.sendMessage(msg, { chat_id: chatId });
}

async function cmd_done(chatId, args) {
    if (!args) return telegram.sendMessage('Usage: /done <todo text or part of it>', { chat_id: chatId });

    // Fuzzy match — find todo where text contains args (case-insensitive)
    const match = db.prepare(`
        SELECT id, text FROM todos
        WHERE completed = 0 AND LOWER(text) LIKE LOWER(?)
        ORDER BY id DESC LIMIT 1
    `).get(`%${args}%`);

    if (!match) return telegram.sendMessage(`❌ No matching todo for "<b>${esc(args)}</b>"`, { chat_id: chatId });

    db.prepare(`UPDATE todos SET completed = 1, completed_at = datetime('now') WHERE id = ?`).run(match.id);
    await telegram.sendMessage(`✅ Done: <b>${esc(match.text)}</b>`, { chat_id: chatId });
}

async function cmd_inbox(chatId) {
    let messages = [];
    try {
        messages = db.prepare(`
            SELECT source, sender_name, subject, ai_summary, urgency_score
            FROM messages WHERE status = 'pending'
            ORDER BY urgency_score DESC, received_at DESC LIMIT 8
        `).all();
    } catch (e) { /* messages table may not exist yet */ }

    if (!messages.length) return telegram.sendMessage('📭 Inbox is clear.', { chat_id: chatId });

    const urgencyIcon = s => s >= 5 ? '🔴' : s >= 4 ? '🟠' : s >= 3 ? '🟡' : '⚪';
    let msg = '<b>📬 Inbox</b>\n\n';
    for (const m of messages) {
        msg += `${urgencyIcon(m.urgency_score)} <b>${esc(m.sender_name || '?')}</b>`;
        if (m.subject) msg += ` — ${esc(m.subject)}`;
        if (m.ai_summary) msg += `\n<i>${esc(m.ai_summary)}</i>`;
        msg += '\n\n';
    }
    await telegram.sendMessage(msg.trim(), { chat_id: chatId });
}

async function cmd_upcoming(chatId) {
    const items = db.prepare(`
        SELECT title, type, due_date, description FROM upcoming_items
        WHERE due_date >= datetime('now')
        ORDER BY due_date ASC LIMIT 7
    `).all();

    if (!items.length) return telegram.sendMessage('📅 Nothing upcoming.', { chat_id: chatId });

    const icon = t => ({ meeting: '👥', call: '📞', deadline: '⏰', event: '📅' }[t] || '📌');
    let msg = '<b>📅 Upcoming</b>\n\n';
    for (const it of items) {
        const date = it.due_date ? new Date(it.due_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
        msg += `${icon(it.type)} <b>${esc(it.title)}</b>`;
        if (date) msg += ` <i>${date}</i>`;
        if (it.description) msg += `\n${esc(it.description)}`;
        msg += '\n';
    }
    await telegram.sendMessage(msg.trim(), { chat_id: chatId });
}

async function cmd_health(chatId) {
    const h = db.prepare(`SELECT * FROM health_metrics ORDER BY date DESC LIMIT 1`).get();
    if (!h) return telegram.sendMessage('No health data yet.', { chat_id: chatId });

    const recBar = h.recovery ? (h.recovery >= 67 ? '🟢' : h.recovery >= 34 ? '🟡' : '🔴') : '—';
    let msg = `<b>💪 Health — ${h.date}</b>\n\n`;
    msg += `Recovery: ${recBar} <b>${h.recovery ?? '—'}%</b>\n`;
    msg += `Sleep: <b>${h.sleep_hours ?? '—'}h ${h.sleep_minutes ?? 0}m</b>`;
    if (h.sleep_performance_pct) msg += ` (${h.sleep_performance_pct}%)`;
    msg += `\nHRV: <b>${h.hrv ?? '—'}</b>\n`;
    msg += `Strain: <b>${h.strain ?? '—'}</b>\n`;
    if (h.cycle_phase) msg += `Phase: <i>${esc(h.cycle_phase)}</i>`;
    await telegram.sendMessage(msg.trim(), { chat_id: chatId });
}

async function cmd_prioritise(chatId) {
    await telegram.sendMessage('⏳ Analysing priorities…', { chat_id: chatId });
    const text = await callClaude(
        'Review my todos, upcoming, and goals. Give me a clear ranked priority order for today. For each item, one-line reason. Then: (1) what to do first thing, (2) what to schedule as deep work, (3) what to drop or defer. Be direct and opinionated.'
    );
    await telegram.sendBriefing('Priorities', text);
}

async function cmd_ask(chatId, args) {
    if (!args) return telegram.sendMessage('Usage: /ask <your question>', { chat_id: chatId });
    await telegram.sendMessage('⏳ Thinking…', { chat_id: chatId });
    const text = await callClaude(args);
    await telegram.sendBriefing('PA', text);
}

// ─── Claude helper ────────────────────────────────────────────────────────────

async function callClaude(prompt) {
    const Anthropic = require('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const context = (() => { try { return buildPAContext(); } catch (e) { return ''; } })();
    const response = await anthropic.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929',
        max_tokens: 1024,
        system: `You are an executive PA. Today is ${new Date().toISOString().slice(0, 10)}. Be concise.\n\nCONTEXT:\n${context}`,
        messages: [{ role: 'user', content: prompt }],
    });
    return response.content[0].text;
}

// ─── Long-polling loop ────────────────────────────────────────────────────────

async function processUpdate(update) {
    const msg = update.message || update.edited_message;
    if (!msg || !msg.text) return;

    const chatId = String(msg.chat.id);

    // Security: only respond to the authorised chat ID
    if (ALLOWED_CHAT_ID && chatId !== ALLOWED_CHAT_ID) {
        console.log('[tg-bot] Ignored message from unauthorised chat:', chatId);
        return;
    }

    const text = msg.text.trim();
    // Strip @BotName suffix from commands
    const [rawCmd, ...argParts] = text.split(/\s+/);
    const cmd = rawCmd.replace(/@\w+$/, '').toLowerCase();
    const args = argParts.join(' ').trim() || null;

    console.log(`[tg-bot] ${cmd}${args ? ' ' + args : ''}`);

    const handler = COMMANDS[cmd];
    if (handler) {
        try {
            await handler(chatId, args);
        } catch (err) {
            console.error('[tg-bot] Handler error:', err.message);
            await telegram.sendMessage(`❌ Error: ${err.message}`, { chat_id: chatId }).catch(() => {});
        }
    }
    // Ignore unknown commands silently
}

async function poll() {
    if (!TOKEN) { console.error('[tg-bot] TELEGRAM_BOT_TOKEN not set'); return; }
    polling = true;
    console.log('[tg-bot] Polling started. Listening for commands…');

    while (polling) {
        try {
            const url = `https://api.telegram.org/bot${TOKEN}/getUpdates?offset=${offset}&timeout=30&allowed_updates=["message"]`;
            const res = await fetch(url, { signal: AbortSignal.timeout(35000) });
            const data = await res.json();
            if (data.ok && data.result.length) {
                for (const update of data.result) {
                    offset = update.update_id + 1;
                    processUpdate(update).catch(e => console.error('[tg-bot] update error:', e.message));
                }
            }
        } catch (e) {
            if (e.name !== 'AbortError') {
                console.error('[tg-bot] Poll error:', e.message);
                await new Promise(r => setTimeout(r, 5000)); // back off on error
            }
        }
    }
}

function stop() { polling = false; }

// Register bot commands with Telegram (shows autocomplete in app)
async function registerCommands() {
    const commands = [
        { command: 'brief',      description: 'AI daily briefing' },
        { command: 'todos',      description: 'Show todo list' },
        { command: 'add',        description: 'Add a todo — /add <text> [by YYYY-MM-DD]' },
        { command: 'done',       description: 'Complete a todo — /done <text>' },
        { command: 'inbox',      description: 'Urgent inbox messages' },
        { command: 'upcoming',   description: 'Next upcoming events' },
        { command: 'health',     description: 'Health metrics (WHOOP)' },
        { command: 'prioritise', description: 'AI priority ranking' },
        { command: 'ask',        description: 'Ask your PA anything' },
        { command: 'help',       description: 'Command list' },
    ];
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/setMyCommands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commands }),
    });
    const data = await res.json();
    if (data.ok) console.log('[tg-bot] Commands registered.');
    else console.warn('[tg-bot] Failed to register commands:', data.description);
}

// ─── HTML escape helper ───────────────────────────────────────────────────────
function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = { poll, stop, registerCommands };

// Run standalone: node integrations/telegram-bot.js
if (require.main === module) {
    registerCommands().catch(console.error);
    poll();
}
