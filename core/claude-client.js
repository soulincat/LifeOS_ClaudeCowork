/**
 * Shared Claude API Client (BYOK — Bring Your Own Key)
 *
 * Resolution order:
 * 1. DB setup_sections key 'pa_config' → anthropic_api_key
 * 2. process.env.ANTHROPIC_API_KEY from .env
 * 3. Claude Cowork endpoint (localhost:8700, for Pro subscribers)
 * 4. Return "PA unavailable" message
 *
 * Used by: core/api/pa.js, integrations/telegram/bot.js
 */

const db = require('./db/database');

function getApiKey() {
    // 1. DB-stored key (set via onboarding or settings)
    try {
        const row = db.prepare("SELECT payload FROM setup_sections WHERE section_key = 'pa_config'").get();
        if (row && row.payload) {
            const cfg = JSON.parse(row.payload);
            if (cfg.anthropic_api_key) return cfg.anthropic_api_key;
        }
    } catch (e) { /* DB not ready */ }

    // 2. .env key
    if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_api_key_here') {
        return process.env.ANTHROPIC_API_KEY;
    }

    return null;
}

function getModel() {
    return process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';
}

/**
 * Call Claude — prefers BYOK key, falls back to Cowork endpoint.
 * @param {string} systemPrompt
 * @param {string} userMessage
 * @param {Array} conversationHistory
 * @returns {{ text: string, source: string, usage?: object }}
 */
async function callClaude(systemPrompt, userMessage, conversationHistory = []) {
    const coworkEndpoint = process.env.CLAUDE_COWORK_ENDPOINT || 'http://localhost:8700';

    // 1. Try Cowork first (Claude Pro / subscription — no per-token cost)
    try {
        const res = await fetch(`${coworkEndpoint}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: userMessage, system: systemPrompt }),
            signal: AbortSignal.timeout(15000)
        });
        if (res.ok) {
            const data = await res.json();
            const text = data.response || data.text || data.content || data.message || '';
            if (text) return { text, source: 'cowork' };
        }
    } catch (e) { /* Cowork not running — fall through */ }

    // 2. Use API key (BYOK or .env)
    const apiKey = getApiKey();
    if (!apiKey) {
        return {
            text: 'PA unavailable: add your Claude API key in Settings → PA, or start the Claude Cowork server.',
            source: 'none'
        };
    }

    const Anthropic = require('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey });

    const messages = [
        ...conversationHistory,
        { role: 'user', content: userMessage }
    ];

    const response = await anthropic.messages.create({
        model: getModel(),
        max_tokens: 2048,
        system: systemPrompt,
        messages
    });

    return { text: response.content[0].text, source: 'api', usage: response.usage };
}

/**
 * Test if an API key is valid by making a minimal call.
 * @param {string} apiKey
 * @returns {{ valid: boolean, error?: string }}
 */
async function testApiKey(apiKey) {
    try {
        const Anthropic = require('@anthropic-ai/sdk');
        const anthropic = new Anthropic({ apiKey });
        await anthropic.messages.create({
            model: getModel(),
            max_tokens: 10,
            messages: [{ role: 'user', content: 'Hi' }]
        });
        return { valid: true };
    } catch (e) {
        return { valid: false, error: e.message };
    }
}

module.exports = { callClaude, getApiKey, getModel, testApiKey };
