/**
 * LifeOS Configuration Loader
 * Reads from config/ files with DB setup_sections fallback.
 * Config files are per-instance (gitignored); DB stores runtime overrides.
 */

const fs = require('fs');
const path = require('path');

// Resolve config directory: config/ at project root
const PROJECT_ROOT = path.resolve(__dirname, '..');
const CONFIG_DIR = path.join(PROJECT_ROOT, 'config');
const EXAMPLE_DIR = path.join(PROJECT_ROOT, 'config.example');

/** Read a JSON config file, return null if missing/invalid */
function readJsonFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) return null;
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        console.warn(`Config: failed to read ${filePath}:`, e.message);
        return null;
    }
}

/** Write a JSON config file */
function writeJsonFile(filePath, data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// ── User Config ──

function getUser() {
    // 1. Try config/user.json
    const fromFile = readJsonFile(path.join(CONFIG_DIR, 'user.json'));
    if (fromFile) return fromFile;

    // 2. Try DB setup_sections
    try {
        const db = require('./db/database');
        const row = db.prepare("SELECT payload FROM setup_sections WHERE section_key = 'user_profile'").get();
        if (row && row.payload) return JSON.parse(row.payload);
    } catch (e) { /* DB not ready yet */ }

    // 3. Defaults
    return {
        name: '',
        github_username: '',
        timezone: 'UTC',
        locale: 'en',
        currency: 'USD',
        dashboard_widgets: {
            health: true, finance: true, social: true,
            github_graph: true, cycle_tracker: false, wishlist: true,
            projects: true, projections: true
        }
    };
}

function saveUser(data) {
    writeJsonFile(path.join(CONFIG_DIR, 'user.json'), data);
    // Also persist to DB for runtime access
    try {
        const db = require('./db/database');
        db.prepare(`
            INSERT INTO setup_sections (section_key, payload, updated_at) VALUES ('user_profile', ?, CURRENT_TIMESTAMP)
            ON CONFLICT(section_key) DO UPDATE SET payload = excluded.payload, updated_at = CURRENT_TIMESTAMP
        `).run(JSON.stringify(data));
    } catch (e) { /* DB not ready */ }
}

// ── Integrations Config ──

function getIntegrations() {
    // 1. Try config/integrations.json
    const fromFile = readJsonFile(path.join(CONFIG_DIR, 'integrations.json'));
    if (fromFile) return fromFile;

    // 2. Try DB setup_sections
    try {
        const db = require('./db/database');
        const row = db.prepare("SELECT payload FROM setup_sections WHERE section_key = 'integrations_config'").get();
        if (row && row.payload) return JSON.parse(row.payload);
    } catch (e) { /* DB not ready */ }

    // 3. Defaults (all disabled)
    return readJsonFile(path.join(EXAMPLE_DIR, 'integrations.example.json')) || {};
}

function saveIntegrations(data) {
    writeJsonFile(path.join(CONFIG_DIR, 'integrations.json'), data);
    try {
        const db = require('./db/database');
        db.prepare(`
            INSERT INTO setup_sections (section_key, payload, updated_at) VALUES ('integrations_config', ?, CURRENT_TIMESTAMP)
            ON CONFLICT(section_key) DO UPDATE SET payload = excluded.payload, updated_at = CURRENT_TIMESTAMP
        `).run(JSON.stringify(data));
    } catch (e) { /* DB not ready */ }
}

function isEnabled(connectorName) {
    const integrations = getIntegrations();
    const cfg = integrations[connectorName];
    return cfg && cfg.enabled === true;
}

// ── Onboarding ──

function isOnboardingComplete() {
    try {
        const db = require('./db/database');
        const row = db.prepare("SELECT 1 FROM setup_sections WHERE section_key = 'onboarding_complete'").get();
        return !!row;
    } catch (e) {
        return false;
    }
}

function markOnboardingComplete() {
    try {
        const db = require('./db/database');
        db.prepare(`
            INSERT INTO setup_sections (section_key, payload, updated_at) VALUES ('onboarding_complete', ?, CURRENT_TIMESTAMP)
            ON CONFLICT(section_key) DO UPDATE SET payload = excluded.payload, updated_at = CURRENT_TIMESTAMP
        `).run(JSON.stringify({ completed_at: new Date().toISOString() }));
    } catch (e) {
        console.error('Config: failed to mark onboarding complete:', e.message);
    }
}

// ── Paths ──

const configDir = CONFIG_DIR;
const projectRoot = PROJECT_ROOT;

module.exports = {
    getUser, saveUser,
    getIntegrations, saveIntegrations, isEnabled,
    isOnboardingComplete, markOnboardingComplete,
    configDir, projectRoot
};
