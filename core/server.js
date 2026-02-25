const express = require('express');
const path = require('path');
const fs = require('fs');

// Load .env: prefer config/.env, fall back to root .env (migration compat)
const configEnvPath = path.join(__dirname, '..', 'config', '.env');
const rootEnvPath = path.join(__dirname, '..', '.env');
require('dotenv').config({ path: fs.existsSync(configEnvPath) ? configEnvPath : rootEnvPath, override: true });

// Initialize database
require('./db/database');

const db = require('./db/database');
const migrations = require('./db/migrations');

// Log which DB file we're using (so you can confirm it's your local file)
console.log('Using database:', db.path);

// Run database migrations
try {
    migrations.runMigrations();
} catch (e) {
    console.error('❌ Migration error:', e.message);
    console.error('Server cannot start with failed migrations.');
    process.exit(1);
}

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
app.use(express.static(path.join(__dirname, '..', 'dashboard')));

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
// ── Gmail OAuth connect/callback ──
app.get('/api/gmail/connect', (req, res) => {
    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        return res.status(500).send('Gmail OAuth not configured. Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env');
    }
    const { google } = require('googleapis');
    const redirectUri = `${req.protocol}://${req.get('host')}/api/gmail/callback`;
    const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const url = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: [
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.send',
            'https://www.googleapis.com/auth/gmail.modify',
        ],
    });
    res.redirect(302, url);
});

app.get('/api/gmail/callback', async (req, res) => {
    const { code, error } = req.query;
    if (error) return res.redirect('/?gmail_error=' + encodeURIComponent(error));
    if (!code) return res.redirect('/?gmail_error=no_code');

    try {
        const { google } = require('googleapis');
        const clientId = process.env.GMAIL_CLIENT_ID;
        const clientSecret = process.env.GMAIL_CLIENT_SECRET;
        const redirectUri = `${req.protocol}://${req.get('host')}/api/gmail/callback`;
        const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

        const { tokens } = await oAuth2Client.getToken(code);

        // Save token to file for the Gmail integration to pick up
        const tokenDir = path.join(process.env.HOME, '.config', 'lifeos');
        if (!fs.existsSync(tokenDir)) fs.mkdirSync(tokenDir, { recursive: true });
        const tokenPath = path.join(tokenDir, 'gmail-token.json');
        fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
        console.log('✅ Gmail OAuth tokens saved to', tokenPath);

        res.redirect('/?gmail_connected=1');
    } catch (err) {
        console.error('Gmail OAuth callback error:', err.message);
        res.redirect('/?gmail_error=' + encodeURIComponent(err.message));
    }
});

// Gmail status check
app.get('/api/gmail/status', (req, res) => {
    const tokenPath = path.join(process.env.HOME, '.config', 'lifeos', 'gmail-token.json');
    const connected = fs.existsSync(tokenPath);
    res.json({ connected, tokenPath: connected ? tokenPath : null });
});

app.use('/api/health', require('./api/health'));
app.use('/api/finance', require('./api/finance'));
app.use('/api/projects', require('./api/projects'));
app.use('/api/social', require('./api/social'));
app.use('/api/todos', require('./api/todos'));
app.use('/api/upcoming', require('./api/upcoming'));
app.use('/api/sync', require('./api/sync'));
app.use('/api/wishlist', require('./api/wishlist'));
app.use('/api/goals', require('./api/goals'));
app.use('/api/projections', require('./api/projections'));
app.use('/api/setup', require('./api/setup'));
app.use('/api/pa', require('./api/pa'));
app.use('/api/messages', require('./api/messages'));
app.use('/api/telegram', require('./api/telegram'));
app.use('/api/home', require('./api/home'));
app.use('/api/project-tasks', require('./api/project-tasks'));
app.use('/api/decision-triggers', require('./api/decision-triggers'));
app.use('/api/system', require('./api/system'));
app.use('/api/inbox', require('./api/inbox'));
app.use('/api/contacts', require('./api/contacts'));
app.use('/api/project-keywords', require('./api/project-keywords'));
app.use('/api/onboarding', require('../onboarding/setup-api'));

// User config endpoint (no secrets — read by dashboard for widgets, github username, etc.)
const lifeosConfig = require('./config');
app.get('/api/config/user', (req, res) => {
    res.json(lifeosConfig.getUser());
});
app.put('/api/config/user', (req, res) => {
    try {
        lifeosConfig.saveUser(req.body);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// First-run redirect: show onboarding wizard if setup not complete
app.get('/', (req, res) => {
    res.type('text/html');
    if (!lifeosConfig.isOnboardingComplete()) {
        return res.sendFile(path.join(__dirname, '..', 'onboarding', 'wizard.html'));
    }
    res.sendFile(path.join(__dirname, '..', 'dashboard', 'index.html'));
});
// SPA fallback for all other routes
app.get('*', (req, res) => {
    res.type('text/html');
    res.sendFile(path.join(__dirname, '..', 'dashboard', 'index.html'));
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

// Load Telegram config from DB (set during onboarding)
try {
    const tgRow = db.prepare("SELECT payload FROM setup_sections WHERE section_key = 'telegram_config'").get();
    if (tgRow) {
        const tg = JSON.parse(tgRow.payload || '{}');
        if (tg.bot_token && !process.env.TELEGRAM_BOT_TOKEN) process.env.TELEGRAM_BOT_TOKEN = tg.bot_token;
        if (tg.chat_id && !process.env.TELEGRAM_CHAT_ID) process.env.TELEGRAM_CHAT_ID = tg.chat_id;
    }
} catch (e) { /* ignore if DB not ready */ }

// ── Graceful shutdown for updates/restarts ──
const gracefulShutdown = () => {
    console.log('\nGracefully shutting down...');
    // Close HTTP server
    server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);  // systemd/Docker will restart if needed
    });
    // Force exit after 10 seconds
    setTimeout(() => {
        console.error('Forced shutdown (timeout)');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

const HOST = process.env.HOST || '0.0.0.0';
const server = app.listen(PORT, HOST, () => {
    console.log(`Life OS Dashboard running at http://localhost:${PORT}`);
    console.log(`Open this URL in your browser to view the dashboard.`);

    // ── Load enabled integrations and start background jobs (Whoop sync, WhatsApp bridge, etc.) ──
    const registry = require('../integrations/registry');
    registry.loadEnabled();
    registry.startBackgroundJobs();
});
