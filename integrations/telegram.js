/**
 * Telegram Bot Integration
 * Sends daily AI briefings, urgent alerts, and todo reminders to your Telegram bot.
 *
 * Setup:
 *   1. Add to .env:
 *      TELEGRAM_BOT_TOKEN=your_bot_token   (from @BotFather)
 *      TELEGRAM_CHAT_ID=your_chat_id       (from @userinfobot or the bot's first message)
 *   2. POST /api/telegram/send-briefing  — manual trigger
 *   3. Or run: node scripts/run-telegram-briefing.js
 *      Set up as daily LaunchAgent via: bash scripts/setup-telegram-cron.sh
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * Send a message to the configured Telegram chat.
 * Uses MarkdownV2 formatting.
 * @param {string} text  — plain text or Markdown
 * @param {object} opts  — optional overrides { parse_mode, chat_id }
 */
async function sendMessage(text, opts = {}) {
    if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN not set in .env');
    if (!CHAT_ID && !opts.chat_id) throw new Error('TELEGRAM_CHAT_ID not set in .env');

    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const body = {
        chat_id: opts.chat_id || CHAT_ID,
        text,
        parse_mode: opts.parse_mode || 'HTML',
        disable_web_page_preview: true,
    };

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(`Telegram error: ${data.description}`);
    return data;
}

/**
 * Format and send the AI briefing to Telegram.
 * Splits long messages into chunks (Telegram max 4096 chars per message).
 * @param {string} title    — e.g. "Daily Briefing"
 * @param {string} content  — markdown/plain text from Claude
 */
async function sendBriefing(title, content) {
    const header = `<b>🤖 ${escapeHtml(title)}</b>\n<i>${new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</i>\n\n`;

    // Convert basic markdown to Telegram HTML
    const body = toTelegramHtml(content);
    const full = header + body;

    // Split into chunks of 4000 chars at paragraph boundaries
    const chunks = splitMessage(full, 4000);
    for (const chunk of chunks) {
        await sendMessage(chunk, { parse_mode: 'HTML' });
        if (chunks.length > 1) await sleep(500); // small delay between chunks
    }
    return chunks.length;
}

/**
 * Send an urgent alert (e.g. high-urgency inbox message).
 */
async function sendAlert(title, body) {
    const text = `<b>⚠️ ${escapeHtml(title)}</b>\n\n${escapeHtml(body)}`;
    return sendMessage(text, { parse_mode: 'HTML' });
}

/**
 * Send a todo reminder.
 * @param {Array} todos — array of { text, due_date } objects
 */
async function sendTodoReminder(todos) {
    if (!todos || todos.length === 0) return;
    const lines = todos.map(t => {
        const due = t.due_date ? ` <i>(${t.due_date})</i>` : '';
        return `• ${escapeHtml(t.text)}${due}`;
    }).join('\n');
    const text = `<b>📋 Today's Todos</b>\n\n${lines}`;
    return sendMessage(text, { parse_mode: 'HTML' });
}

/**
 * Test the connection — sends a simple ping message.
 */
async function testConnection() {
    return sendMessage('✅ LifeOS Telegram connected.', { parse_mode: 'HTML' });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Convert Claude's markdown to Telegram-compatible HTML.
 * Handles: **bold**, *italic*, ## headings, - lists, --- dividers.
 */
function toTelegramHtml(text) {
    if (!text) return '';
    return text
        // Escape HTML special chars first
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        // Headings → bold
        .replace(/^#{1,3} (.+)$/gm, '<b>$1</b>')
        // Bold
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        // Italic
        .replace(/\*(.+?)\*/g, '<i>$1</i>')
        // Horizontal rule → blank line
        .replace(/^---+$/gm, '\n──────────\n')
        // Bullet lists
        .replace(/^[-*] (.+)$/gm, '• $1')
        // Numbered lists — keep as-is
        .trim();
}

function splitMessage(text, maxLen) {
    if (text.length <= maxLen) return [text];
    const chunks = [];
    let remaining = text;
    while (remaining.length > maxLen) {
        // Try to split at a paragraph break
        let cutAt = remaining.lastIndexOf('\n\n', maxLen);
        if (cutAt < maxLen / 2) cutAt = remaining.lastIndexOf('\n', maxLen);
        if (cutAt < 0) cutAt = maxLen;
        chunks.push(remaining.slice(0, cutAt));
        remaining = remaining.slice(cutAt).trimStart();
    }
    if (remaining.length > 0) chunks.push(remaining);
    return chunks;
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

module.exports = { sendMessage, sendBriefing, sendAlert, sendTodoReminder, testConnection };
