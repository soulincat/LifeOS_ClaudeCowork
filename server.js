const express = require('express');
const path = require('path');
require('dotenv').config();

// Initialize database
require('./db/database');

// Seed initial data if database is empty
const db = require('./db/database');
const todoCount = db.prepare('SELECT COUNT(*) as count FROM todos').get();
if (todoCount.count === 0) {
    console.log('Database is empty, seeding initial data...');
    require('./db/seed')();
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// API Routes
app.use('/api/health', require('./routes/health'));
app.use('/api/finance', require('./routes/finance'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/social', require('./routes/social'));
app.use('/api/todos', require('./routes/todos'));
app.use('/api/upcoming', require('./routes/upcoming'));
app.use('/api/sync', require('./routes/sync'));

// Agent conversations - Save to database
app.post('/api/agent', async (req, res) => {
    const db = require('./db/database');
    const { message } = req.body;
    
    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }

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
                    message: message,
                    role: 'user',
                    content: message
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
                stmt.run(message, coworkResponseText, 'cowork');
                
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

            const response = await anthropic.messages.create({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 1024,
                messages: [{
                    role: 'user',
                    content: message
                }],
                system: `You are a helpful assistant integrated into a Life OS dashboard. 
                Help the user with their tasks, thoughts, and ideas. Be concise and actionable.`
            });

            console.log('✅ Using Claude API');
            const agentResponse = response.content[0].text;
            
            // Save conversation to database
            const stmt = db.prepare(`
                INSERT INTO agent_conversations (message, response, source)
                VALUES (?, ?, ?)
            `);
            stmt.run(message, agentResponse, 'api');
            
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

app.listen(PORT, () => {
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
