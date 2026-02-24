#!/usr/bin/env node
/**
 * LifeOS MCP Server
 *
 * Core tools (communications triage):
 *   ingest_message              — write a triaged message + AI summary/reply to LifeOS DB
 *   get_priorities              — return the user's current top goals for context
 *   get_recent_context          — return recent sent messages + completed todos for style matching
 *   get_pending_count           — how many messages are already in the inbox per source
 *
 * Cross-project tools (Soulin Social integration):
 *   get_soulin_project_summary  — per-project followers, posts, engagement from Soulin Social
 *   get_all_projects_overview   — all projects KPIs + LifeOS goals/todos in one view
 *
 * Transport: stdio (standard for local MCP servers).
 * Run directly: node mcp-server/index.js
 * Or via .mcp.json in Claude Code/Desktop.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'lifeos.db');
const db = new Database(DB_PATH);

const SOULIN_BASE = process.env.SOULIN_SOCIAL_URL || 'http://localhost:3000';

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: 'ingest_message',
        description:
            'Save a triaged message with AI summary and suggested reply into the LifeOS inbox. ' +
            'Call this for each message that needs user attention. Duplicates (same source+external_id) ' +
            'will update the urgency/summary/reply rather than creating a new row.',
        inputSchema: {
            type: 'object',
            properties: {
                source: {
                    type: 'string',
                    enum: ['gmail', 'outlook', 'whatsapp'],
                    description: 'Which channel this message came from',
                },
                external_id: {
                    type: 'string',
                    description: 'The original message ID / thread ID from the source system',
                },
                sender_name: { type: 'string', description: 'Display name of the sender' },
                sender_address: {
                    type: 'string',
                    description: 'Email address or phone number of the sender',
                },
                subject: {
                    type: 'string',
                    description: 'Email subject line (omit for WhatsApp)',
                },
                preview: {
                    type: 'string',
                    description: 'First ~200 characters of the message body',
                },
                received_at: {
                    type: 'string',
                    description: 'ISO 8601 timestamp when the message was received',
                },
                urgency_score: {
                    type: 'integer',
                    minimum: 1,
                    maximum: 5,
                    description:
                        '1=FYI only, 2=low, 3=medium, 4=high, 5=critical/reply today',
                },
                ai_summary: {
                    type: 'string',
                    description: '2-sentence summary of what the message is about and what action is needed',
                },
                ai_suggested_reply: {
                    type: 'string',
                    description: 'A draft reply the user can approve and send as-is or edit',
                },
            },
            required: ['source', 'received_at', 'urgency_score'],
        },
    },
    {
        name: 'get_priorities',
        description:
            'Return the user\'s current top goals so you can tailor triage and suggested replies to what matters most right now.',
        inputSchema: {
            type: 'object',
            properties: {
                limit: {
                    type: 'integer',
                    default: 8,
                    description: 'Max number of goals to return',
                },
            },
        },
    },
    {
        name: 'get_recent_context',
        description:
            'Return recently sent messages, completed todos, and finance notes to help match the user\'s communication style and current focus.',
        inputSchema: {
            type: 'object',
            properties: {
                days: {
                    type: 'integer',
                    default: 7,
                    description: 'How many days back to look',
                },
            },
        },
    },
    {
        name: 'get_pending_count',
        description: 'Return the count of messages already in the inbox per source, so you avoid re-ingesting things already there.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'get_soulin_project_summary',
        description:
            'Get a detailed summary for one project from Soulin Social: follower counts, posts posted vs pending, ' +
            'this week\'s engagement, and upcoming scheduled content.',
        inputSchema: {
            type: 'object',
            properties: {
                client_id: {
                    type: 'string',
                    description: 'The project/client ID in Soulin Social (e.g. "kins")',
                },
            },
            required: ['client_id'],
        },
    },
    {
        name: 'get_all_projects_overview',
        description:
            'Get a high-level overview of all projects: per-project KPIs from Soulin Social ' +
            '(followers, posts, engagement) combined with LifeOS goals and pending todos.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
];

// ─── Tool handlers ────────────────────────────────────────────────────────────

function handleIngestMessage(args) {
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
        ai_suggested_reply,
    } = args;

    if (!source || !received_at || urgency_score === undefined) {
        return { error: 'source, received_at, and urgency_score are required' };
    }

    const stmt = db.prepare(`
        INSERT INTO messages
            (source, external_id, sender_name, sender_address, subject,
             preview, received_at, urgency_score, ai_summary, ai_suggested_reply)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source, external_id) DO UPDATE SET
            urgency_score = excluded.urgency_score,
            ai_summary = excluded.ai_summary,
            ai_suggested_reply = excluded.ai_suggested_reply
    `);

    const result = stmt.run(
        source,
        external_id || null,
        sender_name || null,
        sender_address || null,
        subject || null,
        preview ? String(preview).slice(0, 200) : null,
        received_at,
        urgency_score,
        ai_summary || null,
        ai_suggested_reply || null
    );

    const action = result.changes > 0 ? 'ingested' : 'duplicate — no change';
    return { success: true, id: result.lastInsertRowid, action };
}

function handleGetPriorities(args) {
    const limit = args.limit || 8;
    const goals = db.prepare(`
        SELECT title, aspect, period_type, period_label, priority, description
        FROM goals
        ORDER BY priority DESC, created_at DESC
        LIMIT ?
    `).all(limit);

    return { priorities: goals };
}

function handleGetRecentContext(args) {
    const days = args.days || 7;
    const since = new Date(Date.now() - days * 86400 * 1000).toISOString();

    const sentMessages = db.prepare(`
        SELECT sender_name, sender_address, subject, ai_suggested_reply, sent_at
        FROM messages
        JOIN message_send_queue ON messages.id = message_send_queue.message_id
        WHERE messages.status = 'sent' AND message_send_queue.sent_at >= ?
        ORDER BY message_send_queue.sent_at DESC
        LIMIT 10
    `).all(since);

    const completedTodos = db.prepare(`
        SELECT text, completed_at
        FROM todos
        WHERE completed = 1 AND completed_at >= ?
        ORDER BY completed_at DESC
        LIMIT 15
    `).all(since);

    const recentFinance = db.prepare(`
        SELECT type, amount, source, date
        FROM finance_entries
        WHERE date >= ?
        ORDER BY date DESC
        LIMIT 5
    `).all(since.slice(0, 10));

    return {
        sent_messages: sentMessages,
        completed_todos: completedTodos,
        recent_finance: recentFinance,
        context_days: days,
    };
}

function handleGetPendingCount() {
    const rows = db.prepare(`
        SELECT source, COUNT(*) as count
        FROM messages
        WHERE status IN ('pending', 'approved')
        GROUP BY source
    `).all();

    const counts = { gmail: 0, outlook: 0, whatsapp: 0, total: 0 };
    for (const row of rows) {
        if (counts[row.source] !== undefined) counts[row.source] = row.count;
        counts.total += row.count;
    }
    return counts;
}

// ─── Cross-project handlers ──────────────────────────────────────────────────

async function handleGetSoulinProjectSummary(args) {
    const clientId = args.client_id;
    if (!clientId) return { error: 'client_id is required' };

    try {
        const res = await fetch(
            `${SOULIN_BASE}/api/summary/project/${encodeURIComponent(clientId)}`,
            { signal: AbortSignal.timeout(5000) }
        );
        if (!res.ok) throw new Error(`Soulin Social returned HTTP ${res.status}`);
        return await res.json();
    } catch (err) {
        return { status: 'unavailable', error: err.message };
    }
}

async function handleGetAllProjectsOverview() {
    // Fetch Soulin Social projects
    let soulinProjects = [];
    try {
        const res = await fetch(
            `${SOULIN_BASE}/api/summary/projects`,
            { signal: AbortSignal.timeout(5000) }
        );
        if (res.ok) {
            const data = await res.json();
            soulinProjects = data.projects || [];
        }
    } catch {
        // Soulin Social unavailable — continue with LifeOS data only
    }

    // LifeOS goals
    const goals = db.prepare(`
        SELECT title, aspect, period_type, priority
        FROM goals
        ORDER BY priority DESC, created_at DESC
        LIMIT 5
    `).all();

    // LifeOS pending todos
    const todos = db.prepare(`
        SELECT text, created_at
        FROM todos
        WHERE completed = 0
        ORDER BY created_at DESC
        LIMIT 10
    `).all();

    // LifeOS pending messages count
    const msgRows = db.prepare(`
        SELECT source, COUNT(*) as count
        FROM messages
        WHERE status = 'pending'
        GROUP BY source
    `).all();
    const pendingMessages = {};
    let totalPending = 0;
    for (const row of msgRows) {
        pendingMessages[row.source] = row.count;
        totalPending += row.count;
    }

    return {
        soulin_social: {
            status: soulinProjects.length > 0 ? 'connected' : 'unavailable',
            projects: soulinProjects,
        },
        lifeos: {
            top_goals: goals,
            pending_todos: todos,
            pending_messages: { ...pendingMessages, total: totalPending },
        },
    };
}

// ─── Server setup ─────────────────────────────────────────────────────────────

const server = new Server(
    { name: 'lifeos', version: '1.0.0' },
    { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    let result;
    try {
        switch (name) {
            case 'ingest_message':
                result = handleIngestMessage(args || {});
                break;
            case 'get_priorities':
                result = handleGetPriorities(args || {});
                break;
            case 'get_recent_context':
                result = handleGetRecentContext(args || {});
                break;
            case 'get_pending_count':
                result = handleGetPendingCount();
                break;
            case 'get_soulin_project_summary':
                result = await handleGetSoulinProjectSummary(args || {});
                break;
            case 'get_all_projects_overview':
                result = await handleGetAllProjectsOverview();
                break;
            default:
                return {
                    content: [{ type: 'text', text: `Unknown tool: ${name}` }],
                    isError: true,
                };
        }
    } catch (err) {
        return {
            content: [{ type: 'text', text: `Tool error: ${err.message}` }],
            isError: true,
        };
    }

    return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
});

// ─── Start ────────────────────────────────────────────────────────────────────

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // MCP servers must not write to stdout (it's the protocol channel).
    // Log to stderr only.
    process.stderr.write('LifeOS MCP server running (stdio)\n');
}

main().catch((err) => {
    process.stderr.write(`Fatal: ${err.message}\n`);
    process.exit(1);
});
