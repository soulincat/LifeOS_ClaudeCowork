const express = require('express');
const path = require('path');
require('dotenv').config();

// Initialize database
require('./db/database');

const db = require('./db/database');

// Log which DB file we're using (so you can confirm it's your local file)
console.log('Using database:', db.path);

// Seed ONLY when DB is truly empty (never overwrite your todos or finance)
const todoCount = db.prepare('SELECT COUNT(*) as count FROM todos').get();
const financeCount = db.prepare('SELECT COUNT(*) as count FROM finance_entries').get();
if (todoCount.count === 0 && financeCount.count === 0) {
    console.log('Database is empty, seeding initial data...');
    require('./db/seed')();
} else if (todoCount.count === 0 && financeCount.count > 0) {
    console.log('Todos empty but finance data present — skipping seed (your data is safe).');
}

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware (allow large JSON for wishlist image data URLs)
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// API Routes
app.use('/api/health', require('./routes/health'));
app.use('/api/finance', require('./routes/finance'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/social', require('./routes/social'));
app.use('/api/todos', require('./routes/todos'));
app.use('/api/upcoming', require('./routes/upcoming'));
app.use('/api/sync', require('./routes/sync'));
app.use('/api/wishlist', require('./routes/wishlist'));
app.use('/api/goals', require('./routes/goals'));
app.use('/api/projections', require('./routes/projections'));
app.use('/api/setup', require('./routes/setup'));

// Agent: build context from last N conversations (suggestion 6 - agent memory)
function getAgentContext(db, limit = 5) {
    const rows = db.prepare(`
        SELECT message, response FROM agent_conversations
        ORDER BY id DESC LIMIT ?
    `).all(limit);
    if (rows.length === 0) return '';
    const lines = rows.reverse().map(r => `User: ${r.message}\nAssistant: ${(r.response || '').slice(0, 200)}`).join('\n---\n');
    return 'Recent conversation (for context):\n' + lines + '\n---\n';
}

// Agent: execute a simple command and return result (wishlist, goals, scenarios)
async function executeAgentCommand(command, params, db) {
    const baseUrl = 'http://localhost:' + (process.env.PORT || 3000);
    try {
        if (command === 'list_wishlist') {
            const res = await fetch(baseUrl + '/api/wishlist');
            const data = await res.json();
            return JSON.stringify(data.length ? data.map(i => ({ name: i.name, price_usd: i.price_usd, priority: i.priority })) : []);
        }
        if (command === 'add_wishlist_item') {
            const res = await fetch(baseUrl + '/api/wishlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params)
            });
            const data = await res.json();
            return res.ok ? 'Added: ' + (data.name || 'item') : (data.error || 'Failed');
        }
        if (command === 'list_goals') {
            const res = await fetch(baseUrl + '/api/goals');
            const data = await res.json();
            return JSON.stringify(data.length ? data.map(g => ({ title: g.title, period_label: g.period_label, aspect: g.aspect })) : []);
        }
        if (command === 'add_goal') {
            const res = await fetch(baseUrl + '/api/goals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params)
            });
            const data = await res.json();
            return res.ok ? 'Added goal: ' + (data.title || '') : (data.error || 'Failed');
        }
        if (command === 'list_scenarios') {
            return '[]';
        }
        if (command === 'get_scenario_comparison') {
            return '[]';
        }
        if (command === 'get_current_focus') {
            return JSON.stringify({ scenario: null, lastMonthlyReport: null });
        }
    } catch (e) {
        return 'Error: ' + e.message;
    }
    return 'Unknown command';
}

// Agent conversations - Save to database
app.post('/api/agent', async (req, res) => {
    const db = require('./db/database');
    const { message, command, params } = req.body;
    const userMessage = typeof message === 'string' ? message : (req.body.content || '');
    
    if (!userMessage && !command) {
        return res.status(400).json({ error: 'Message is required' });
    }

    // If front-end sent a structured command (e.g. from parsed agent response), execute it
    if (command && typeof executeAgentCommand === 'function') {
        try {
            const result = await executeAgentCommand(command, params || {}, db);
            return res.json({ response: result, source: 'command', usage: null });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }

    const agentContext = getAgentContext(db, 5);

    // Option 1: Try Claude Cowork local endpoint first
    const coworkEndpoint = process.env.CLAUDE_COWORK_ENDPOINT || 'http://localhost:8700';
    const coworkPaths = [
        '/api/chat',
        '/api/messages',
        '/chat',
        '/messages',
        '/mcp',
        '/api/v1/chat',
        '/api/v1/messages'
    ];

    console.log(`🔍 Attempting to connect to Claude Cowork at ${coworkEndpoint}...`);
    
    for (const path of coworkPaths) {
        try {
            const coworkUrl = `${coworkEndpoint}${path}`;
            console.log(`   Trying: ${coworkUrl}`);
            
            const coworkResponse = await fetch(coworkUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: userMessage,
                    role: 'user',
                    content: userMessage,
                    context: agentContext
                }),
                signal: AbortSignal.timeout(3000) // 3 second timeout
            });

            if (coworkResponse.ok) {
                const coworkData = await coworkResponse.json();
                console.log(`✅ Connected to Claude Cowork via ${path}`);
                const coworkResponseText = coworkData.response || coworkData.text || coworkData.content || coworkData.message || 'Response received';
                
                // Save conversation to database
                const stmt = db.prepare(`
                    INSERT INTO agent_conversations (message, response, source)
                    VALUES (?, ?, ?)
                `);
                stmt.run(userMessage, coworkResponseText, 'cowork');
                
                return res.json({
                    response: coworkResponseText,
                    source: 'cowork',
                    usage: coworkData.usage || null
                });
            } else {
                console.log(`   ❌ ${path} returned status ${coworkResponse.status}`);
            }
        } catch (error) {
            // Try next endpoint
            if (error.name !== 'AbortError') {
                console.log(`   ⚠️  ${path}: ${error.message}`);
            }
            continue;
        }
    }
    
    console.log('⚠️  Claude Cowork not available, trying Claude API fallback...');

    // Option 2: Fall back to Claude API
    if (process.env.ANTHROPIC_API_KEY) {
        try {
            const Anthropic = require('@anthropic-ai/sdk');
            const anthropic = new Anthropic({
                apiKey: process.env.ANTHROPIC_API_KEY,
            });

            const systemWithContext = `You are a helpful assistant integrated into a Life OS dashboard.
Help the user with their tasks, thoughts, and ideas. Be concise and actionable.
The user can manage: Wishlist (things to buy, with name, image URL, price USD, priority), Goals (life goals with yearly/quarterly/monthly, aspects: health, wealth, relationships, work, art; each goal has "No" section with why/lessons learned and "Uncertainties" section), and Scenarios A/B/C (business path experiments linked to goals, with premise, hypothesis, worst/base/lucky revenue).
${agentContext}
When the user asks to add a wishlist item, create a goal, or list goals/wishlist/scenarios, describe what you would add and suggest they use the Wishlist or Goals tab, or use the exact format: COMMAND: command_name and then JSON params on the next line, so the app can execute it.`;
            const response = await anthropic.messages.create({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 1024,
                messages: [{
                    role: 'user',
                    content: userMessage
                }],
                system: systemWithContext
            });

            console.log('✅ Using Claude API');
            const agentResponse = response.content[0].text;
            
            // Save conversation to database
            const stmt = db.prepare(`
                INSERT INTO agent_conversations (message, response, source)
                VALUES (?, ?, ?)
            `);
            stmt.run(userMessage, agentResponse, 'api');
            
            return res.json({ 
                response: agentResponse,
                source: 'api',
                usage: response.usage
            });
        } catch (error) {
            console.error('Claude API error:', error);
            return res.status(500).json({ error: 'Failed to get response from Claude API' });
        }
    }
    
    // Fallback: No connection available
    res.json({ 
        response: 'Neither Claude Cowork nor Claude API is available. Check your configuration.',
        source: 'none',
        usage: null
    });
});

// Serve index.html for all routes (SPA support)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
    console.log(`Life OS Dashboard running at http://localhost:${PORT}`);
    console.log(`Open this URL in your browser to view the dashboard.`);
    
    const coworkEndpoint = process.env.CLAUDE_COWORK_ENDPOINT || 'http://localhost:8700';
    console.log(`\n🤖 Claude Integration:`);
    console.log(`   - Trying Claude Cowork at: ${coworkEndpoint}`);
    if (process.env.ANTHROPIC_API_KEY) {
        console.log(`   - Claude API fallback: Configured`);
    } else {
        console.log(`   - Claude API fallback: Not configured`);
        console.log(`     (Optional: Add ANTHROPIC_API_KEY to .env for fallback)`);
    }
});
