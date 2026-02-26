const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'lifeos.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    try { fs.mkdirSync(dbDir, { recursive: true }); } catch (e) { /* ignore */ }
}
const db = new Database(dbPath);

// Backup existing DB on startup (so you can restore if something wipes it)
try {
    if (fs.existsSync(dbPath)) {
        const stat = fs.statSync(dbPath);
        if (stat.size > 1000) {
            fs.copyFileSync(dbPath, dbPath + '.backup');
            const backupsDir = path.join(__dirname, 'backups');
            if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
            fs.copyFileSync(dbPath, path.join(backupsDir, 'lifeos.db.latest.backup'));
        }
    }
} catch (e) { /* ignore */ }

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables from schema.sql (source of truth for table definitions)
const schemaPath = path.join(__dirname, 'schema.sql');
if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schema);
} else {
    console.error('schema.sql not found at', schemaPath);
    process.exit(1);
}

// Column additions and data migrations are handled by migration files
// in core/db/migrations/ — run via migrations.runMigrations() in server.js

db.path = dbPath;
module.exports = db;
