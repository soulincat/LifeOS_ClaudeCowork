#!/usr/bin/env node
/**
 * Set LinkedIn to 10K and project data per user request
 */
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'lifeos.db');
const db = new Database(dbPath);

const today = new Date().toISOString().slice(0, 10);

// LinkedIn = 10K
const rows = db.prepare("SELECT id FROM social_metrics WHERE LOWER(platform) = 'linkedin' AND date = ?").all(today);
if (rows.length > 0) {
  db.prepare('UPDATE social_metrics SET value = 10000 WHERE LOWER(platform) = ? AND date = ?').run('linkedin', today);
  console.log('✓ LinkedIn set to 10K');
} else {
  db.prepare('INSERT INTO social_metrics (platform, metric_type, value, date) VALUES (?, ?, ?, ?)').run('linkedin', 'followers', 10000, today);
  console.log('✓ LinkedIn inserted 10K');
}

// Projects: Cathy K 16.6K/16.6K, Soulin Social 0/0, KINS $350K 4K, Soulin Agency $1K/$0
const projects = [
  { name: 'Cathy K', metrics: { current: { followers: 16600, subscribers: 16600 }, last_month: { followers: 16600, subscribers: 16600 } } },
  { name: 'Soulin Social', metrics: { current: { paid_members: 0, mrr: 0 }, last_month: { paid_members: 0, mrr: 0 } } },
  { name: 'KINS', metrics: { current: { sales: 350000, subscribers: 4000 }, last_month: { sales: 350000, subscribers: 4000 } } },
  { name: 'Soulful Academy', metrics: { current: { revenue: 1000, reach: 0 }, last_month: { revenue: 0, reach: 0 } } }
];

projects.forEach(pr => {
  const row = db.prepare('SELECT id FROM projects WHERE name = ?').get(pr.name);
  if (row) {
    const existing = db.prepare('SELECT metrics FROM projects WHERE id = ?').get(row.id);
    const m = typeof existing.metrics === 'string' ? JSON.parse(existing.metrics) : (existing.metrics || {});
    m.current = { ...m.current, ...pr.metrics.current };
    m.last_month = { ...m.last_month, ...pr.metrics.last_month };
    db.prepare('UPDATE projects SET metrics = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(m), new Date().toISOString(), row.id);
    console.log('✓', pr.name);
  }
});

db.close();
console.log('Done.');
