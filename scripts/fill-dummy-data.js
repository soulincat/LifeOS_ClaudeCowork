#!/usr/bin/env node
/**
 * DEV/SCREENSHOT ONLY — OVERWRITES DATA.
 * Fill dashboard with dummy numbers for screenshot.
 * - Social media followers (total ~20.6K)
 * - Finance metrics (revenue, profit, expenses, etc.)
 * Do NOT run on a database with real numbers you want to keep.
 */
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'lifeos.db');
const db = new Database(dbPath);

const today = new Date().toISOString().slice(0, 10);

console.log('Filling dummy data for screenshot...\n');

// 1) Social Media: Set to ~20.6K total
const socialMetrics = [
    { platform: 'email', metric_type: 'subscribers', value: 3200 },
    { platform: 'linkedin', metric_type: 'followers', value: 11000 },
    { platform: 'twitter', metric_type: 'followers', value: 850 },
    { platform: 'instagram', metric_type: 'followers', value: 1200 },
    { platform: 'threads', metric_type: 'followers', value: 450 },
    { platform: 'substack', metric_type: 'subscribers', value: 280 },
    { platform: 'youtube', metric_type: 'subscribers', value: 420 },
    { platform: 'brunch', metric_type: 'followers', value: 3200 }
];
// Total: 3200 + 11000 + 850 + 1200 + 450 + 280 + 420 + 3200 = 20,600 ≈ 20.6K

const socialStmt = db.prepare(`
    INSERT INTO social_metrics (platform, metric_type, value, date)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(platform, metric_type, date) DO UPDATE SET value = excluded.value
`);

socialMetrics.forEach(m => {
    socialStmt.run(m.platform, m.metric_type, m.value, today);
    console.log(`✓ ${m.platform}: ${m.value.toLocaleString()}`);
});

// 2) Finance: Set monthly revenue, profit, expenses, spending
const financeEntries = [
    { type: 'revenue', amount: 12500, account_type: 'business', source: 'manual' },
    { type: 'expense', amount: 3200, account_type: 'business', source: 'manual' },
    { type: 'spending', amount: 1800, account_type: 'personal', source: 'manual' }
];

const financeStmt = db.prepare(`
    INSERT INTO finance_entries (date, type, amount, account_type, source)
    VALUES (?, ?, ?, ?, ?)
`);

financeEntries.forEach(e => {
    financeStmt.run(today, e.type, e.amount, e.account_type, e.source);
    console.log(`✓ Finance ${e.type}: $${e.amount.toLocaleString()}`);
});

// Calculate profit: revenue - expense = 12500 - 3200 = 9300
const profit = 12500 - 3200;
console.log(`✓ Finance profit: $${profit.toLocaleString()}`);

// 3) Update finance constants (investment, asset, total_net)
const constantsStmt = db.prepare(`
    INSERT INTO finance_entries (date, type, amount, account_type, source)
    VALUES (?, ?, ?, ?, ?)
`);

// Ensure investment and asset exist
const hasInvestment = db.prepare("SELECT 1 FROM finance_entries WHERE type = 'investment' LIMIT 1").get();
const hasAsset = db.prepare("SELECT 1 FROM finance_entries WHERE type = 'asset' LIMIT 1").get();

if (!hasInvestment) {
    constantsStmt.run(today, 'investment', 45000, 'personal', 'manual');
    console.log(`✓ Finance investment: $45,000`);
}
if (!hasAsset) {
    constantsStmt.run(today, 'asset', 233000, 'personal', 'manual');
    console.log(`✓ Finance asset: $233,000`);
}

// 4) Update projects with good numbers
const projects = [
    { name: 'Cathy K', metrics: { current: { followers: 20600, subscribers: 20600 }, last_month: { followers: 18500, subscribers: 18500 } } },
    { name: 'Soulin Social', metrics: { current: { paid_members: 2850, mrr: 11200 }, last_month: { paid_members: 2650, mrr: 9800 } } },
    { name: 'KINS', metrics: { current: { sales: 4200, subscribers: 10200 }, last_month: { sales: 3800, subscribers: 9500 } } },
    { name: 'Soulful Academy', metrics: { current: { revenue: 3200, reach: 19500 }, last_month: { revenue: 2900, reach: 18300 } } }
];

projects.forEach(p => {
    const project = db.prepare('SELECT id, metrics FROM projects WHERE name = ?').get(p.name);
    if (project) {
        const m = typeof project.metrics === 'string' ? JSON.parse(project.metrics) : (project.metrics || {});
        m.current = { ...m.current, ...p.metrics.current };
        m.last_month = { ...m.last_month, ...p.metrics.last_month };
        db.prepare('UPDATE projects SET metrics = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(m), new Date().toISOString(), project.id);
        console.log(`✓ ${p.name}: updated metrics`);
    }
});

db.close();
console.log('\n✅ Done! Refresh the dashboard to see the dummy numbers.');
