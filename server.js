const express = require('express');
const path = require('path');
require('dotenv').config({ override: true });

// Initialize database
require('./db/database');

const db = require('./db/database');

// Log which DB file we're using (so you can confirm it's your local file)
console.log('Using database:', db.path);

// Seed only when explicitly enabled (prevents random overwrites; real data from manual input + integrations)
const seedIfEmpty = process.env.LIFEOS_SEED_IF_EMPTY === '1' || process.env.LIFEOS_SEED_IF_EMPTY === 'true';
if (seedIfEmpty) {
    const todoCount = db.prepare('SELECT COUNT(*) as count FROM todos').get();
    const financeCount = db.prepare('SELECT COUNT(*) as count FROM finance_entries').get();
    if (todoCount.count === 0 && financeCount.count === 0) {
        console.log('Database is empty, seeding initial data (LIFEOS_SEED_IF_EMPTY=1)...');
        require('./db/seed')();
    }
}

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware (allow large JSON for wishlist image data URLs)
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// API Routes
// WHOOP OAuth connect route first so it's never caught by static or catch-all
app.get('/api/health/whoop/connect', (req, res) => {
    const clientId = process.env.WHOOP_CLIENT_ID;
    const redirectUri = process.env.WHOOP_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/health/whoop/callback`;
    if (!clientId) {
        return res.status(500).send('WHOOP OAuth not configured. Set WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET in .env');
    }
    const url = new URL('https://api.prod.whoop.com/oauth/oauth2/auth');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', 'read:recovery read:cycles read:sleep read:profile read:body_measurement offline');
    url.searchParams.set('state', Math.random().toString(36).slice(2));
    res.redirect(302, url.toString());
});
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
app.use('/api/pa', require('./routes/pa'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/telegram', require('./routes/telegram'));
app.use('/api/home', require('./routes/home'));
app.use('/api/project-tasks', require('./routes/project-tasks'));
app.use('/api/decision-triggers', require('./routes/decision-triggers'));
app.use('/api/inbox', require('./routes/inbox'));
app.use('/api/contacts', require('./routes/contacts'));

// Explicit root and SPA fallback: serve index.html so the app always loads
app.get('/', (req, res) => {
    res.type('text/html');
    res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('*', (req, res) => {
    res.type('text/html');
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Apply stored integration API keys on startup (Stripe, Wise)
try {
    const db = require('./db/database');
    const row = db.prepare("SELECT payload FROM setup_sections WHERE section_key = 'integrations'").get();
    if (row) {
        const p = JSON.parse(row.payload || '{}');
        if (p.stripe_key && !process.env.STRIPE_SECRET_KEY?.startsWith('sk_')) process.env.STRIPE_SECRET_KEY = p.stripe_key;
        if (p.wise_token && process.env.WISE_API_TOKEN === 'your_wise_token_here') process.env.WISE_API_TOKEN = p.wise_token;
        if (p.wise_profile_id && process.env.WISE_PROFILE_ID === 'your_wise_profile_id_here') process.env.WISE_PROFILE_ID = p.wise_profile_id;
    }
} catch (e) { /* ignore if DB not ready */ }

const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
    console.log(`Life OS Dashboard running at http://localhost:${PORT}`);
    console.log(`Open this URL in your browser to view the dashboard.`);

    // ── Whoop auto-sync: run at startup + every 2h to keep recovery data fresh ──
    const whoopIntegration = require('./integrations/whoop');
    const runWhoopSync = async () => {
        try {
            const result = await whoopIntegration.syncLastDays(3);
            if (result && result.synced > 0) console.log(`✅ Whoop auto-sync: ${result.synced} day(s) updated`);
        } catch (e) {
            if (!e.message?.includes('no token') && !e.message?.includes('needsReconnect')) {
                console.log('⚠️  Whoop auto-sync skipped:', e.message);
            }
        }
    };
    runWhoopSync(); // immediate on boot
    setInterval(runWhoopSync, 2 * 60 * 60 * 1000); // every 2 hours

    // ── WhatsApp bridge auto-start: ensure Go bridge is running for PA sends ──
    const { exec, spawn } = require('child_process');
    const waBridgePath = process.env.WHATSAPP_BRIDGE_PATH || require('path').join(require('os').homedir(), 'code/whatsapp-mcp/whatsapp-bridge/whatsapp-bridge');
    exec('lsof -nP -iTCP:8080 -sTCP:LISTEN', (err, stdout) => {
        if (!stdout || !stdout.includes('LISTEN')) {
            const fs = require('fs');
            if (fs.existsSync(waBridgePath)) {
                const bridge = spawn(waBridgePath, [], {
                    detached: true,
                    stdio: 'ignore',
                    cwd: require('path').dirname(waBridgePath),
                });
                bridge.unref();
                console.log('✅ WhatsApp bridge started (PID will detach)');
            } else {
                console.log('⚠️  WhatsApp bridge not found at', waBridgePath, '— PA send will be unavailable');
            }
        } else {
            console.log('✅ WhatsApp bridge already running on :8080');
        }
    });
});
