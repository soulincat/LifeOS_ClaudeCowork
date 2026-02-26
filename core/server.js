const express = require('express');
const path = require('path');
const fs = require('fs');

// Load .env: prefer config/.env, fall back to root .env (migration compat)
const configEnvPath = path.join(__dirname, '..', 'config', '.env');
const rootEnvPath = path.join(__dirname, '..', '.env');
require('dotenv').config({ path: fs.existsSync(configEnvPath) ? configEnvPath : rootEnvPath, override: true });

// Initialize database + run migrations
const db = require('./db/database');
const migrations = require('./db/migrations');

console.log('Using database:', db.path);

try {
    migrations.runMigrations();
} catch (e) {
    console.error('Migration error:', e.message);
    console.error('Server cannot start with failed migrations.');
    process.exit(1);
}

// Seed only when explicitly enabled
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

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '..', 'dashboard')));

// API Routes — OAuth flows first (before static catch-all)
app.use('/api', require('./api/oauth'));

// Domain routes
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
app.use('/api/strategy', require('./api/strategy'));
app.use('/api/contacts', require('./api/contacts'));
app.use('/api/project-keywords', require('./api/project-keywords'));
app.use('/api/onboarding', require('../onboarding/setup-api'));

// User config endpoint
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

// Global error handler (must be after all routes)
app.use(require('./middleware/error-handler'));

// Apply stored integration API keys on startup (Stripe, Wise)
try {
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

// ── Graceful shutdown ──
const gracefulShutdown = () => {
    console.log('\nGracefully shutting down...');
    server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
    });
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

    // Load enabled integrations and start background jobs
    const registry = require('../integrations/registry');
    registry.loadEnabled();
    registry.startBackgroundJobs();
});
