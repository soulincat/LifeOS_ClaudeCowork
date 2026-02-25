/**
 * Database Migration System
 * Auto-runs pending migrations on server startup.
 * Tracks which migrations have been applied.
 * Supports rollback via down() functions.
 */

const fs = require('fs');
const path = require('path');
const db = require('./database');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Initialize migrations table if not exists
 */
function initMigrationsTable() {
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS db_migrations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                migration_id TEXT UNIQUE NOT NULL,
                name TEXT,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                rolled_back_at TIMESTAMP
            )
        `);
    } catch (e) {
        console.error('Failed to create db_migrations table:', e.message);
    }
}

/**
 * Get all applied migrations
 */
function getAppliedMigrations() {
    try {
        return db.prepare(`
            SELECT migration_id FROM db_migrations
            WHERE rolled_back_at IS NULL
            ORDER BY applied_at ASC
        `).all().map(row => row.migration_id);
    } catch (e) {
        return [];
    }
}

/**
 * Get all migration files from migrations/ folder
 */
function getMigrationFiles() {
    try {
        if (!fs.existsSync(MIGRATIONS_DIR)) {
            fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
            return [];
        }
        return fs.readdirSync(MIGRATIONS_DIR)
            .filter(f => f.endsWith('.js'))
            .sort();
    } catch (e) {
        console.warn('Migrations folder not found or error reading:', e.message);
        return [];
    }
}

/**
 * Load and validate a migration file
 */
function loadMigration(filename) {
    try {
        const migration = require(path.join(MIGRATIONS_DIR, filename));
        if (!migration.id || !migration.name || !migration.up) {
            throw new Error(`Missing required fields in ${filename}: id, name, up`);
        }
        return migration;
    } catch (e) {
        console.error(`Failed to load migration ${filename}:`, e.message);
        return null;
    }
}

/**
 * Run all pending migrations
 */
function runMigrations() {
    console.log('\n── Running database migrations ──');
    initMigrationsTable();

    const applied = getAppliedMigrations();
    const files = getMigrationFiles();
    let ran = 0;

    for (const file of files) {
        const migration = loadMigration(file);
        if (!migration) continue;

        if (applied.includes(migration.id)) {
            // Already applied
            continue;
        }

        try {
            console.log(`  Running: ${migration.id} — ${migration.name}`);
            migration.up(db);

            // Record in DB
            db.prepare(`
                INSERT INTO db_migrations (migration_id, name, applied_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
            `).run(migration.id, migration.name);

            ran++;
            console.log(`  ✅ ${migration.id}`);
        } catch (e) {
            console.error(`  ❌ Migration failed: ${migration.id}`);
            console.error(`     Error: ${e.message}`);
            throw new Error(`Migration ${migration.id} failed: ${e.message}`);
        }
    }

    if (ran === 0) {
        console.log('  (All migrations already applied)');
    } else {
        console.log(`✅ ${ran} migration(s) applied`);
    }
}

/**
 * Rollback a migration (mostly for manual use)
 */
function rollbackMigration(migrationId) {
    const applied = getAppliedMigrations();
    if (!applied.includes(migrationId)) {
        throw new Error(`Migration ${migrationId} not applied`);
    }

    const files = getMigrationFiles();
    for (const file of files) {
        const migration = loadMigration(file);
        if (!migration || migration.id !== migrationId) continue;

        if (!migration.down) {
            throw new Error(`Migration ${migrationId} does not support rollback`);
        }

        try {
            console.log(`Rolling back: ${migrationId} — ${migration.name}`);
            migration.down(db);

            // Mark as rolled back
            db.prepare(`
                UPDATE db_migrations
                SET rolled_back_at = CURRENT_TIMESTAMP
                WHERE migration_id = ?
            `).run(migrationId);

            console.log(`✅ Rolled back ${migrationId}`);
            return;
        } catch (e) {
            console.error(`Failed to rollback ${migrationId}:`, e.message);
            throw e;
        }
    }

    throw new Error(`Migration file for ${migrationId} not found`);
}

/**
 * Get migration status for API
 */
function getMigrationStatus() {
    const applied = getAppliedMigrations();
    const files = getMigrationFiles();
    const pending = [];

    for (const file of files) {
        const migration = loadMigration(file);
        if (migration && !applied.includes(migration.id)) {
            pending.push({ id: migration.id, name: migration.name });
        }
    }

    return {
        applied_count: applied.length,
        pending_count: pending.length,
        pending: pending
    };
}

module.exports = {
    runMigrations,
    rollbackMigration,
    getMigrationStatus,
    getAppliedMigrations
};
