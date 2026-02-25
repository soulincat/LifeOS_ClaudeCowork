/**
 * System API Routes
 * Handles versioning, updates, and system health.
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const db = require('../db/database');
const migrations = require('../db/migrations');

const DB_PATH = db.path;
const DB_DIR = path.dirname(DB_PATH);
const ROOT_DIR = path.join(__dirname, '..', '..');
const CHANGELOG_PATH = path.join(ROOT_DIR, 'CHANGELOG.md');

/**
 * Get version from package.json
 */
function getCurrentVersion() {
    try {
        const pkg = require('../../package.json');
        return pkg.version || '0.0.0';
    } catch (e) {
        return '0.0.0';
    }
}

/**
 * Get latest version from git
 */
function getLatestVersion() {
    try {
        // Try to get latest tag
        const tag = execSync('git describe --tags --abbrev=0 2>/dev/null || echo ""', {
            cwd: ROOT_DIR,
            encoding: 'utf8'
        }).trim();

        if (tag) return tag.replace(/^v/, '');

        // Fall back to current commit hash (short)
        const hash = execSync('git rev-parse --short HEAD 2>/dev/null || echo "unknown"', {
            cwd: ROOT_DIR,
            encoding: 'utf8'
        }).trim();

        return hash;
    } catch (e) {
        return getCurrentVersion();
    }
}

/**
 * Check git status for uncommitted changes
 */
function getGitStatus() {
    try {
        const status = execSync('git status --porcelain 2>/dev/null || echo ""', {
            cwd: ROOT_DIR,
            encoding: 'utf8'
        }).trim();

        if (!status) return 'clean';
        if (status.includes('??')) return 'untracked';
        return 'has_changes';
    } catch (e) {
        return 'unknown';
    }
}

/**
 * Parse CHANGELOG.md for version history
 */
function parseChangelog() {
    try {
        if (!fs.existsSync(CHANGELOG_PATH)) return [];

        const content = fs.readFileSync(CHANGELOG_PATH, 'utf8');
        const lines = content.split('\n');
        const entries = [];
        let current = null;

        for (const line of lines) {
            // Match "## [0.2.0] - 2026-02-24"
            const match = line.match(/##\s+\[([^\]]+)\]\s+-\s+(\d{4}-\d{2}-\d{2})/);
            if (match) {
                if (current) entries.push(current);
                current = {
                    version: match[1],
                    date: match[2],
                    changes: []
                };
            } else if (current && line.startsWith('- ')) {
                current.changes.push(line.slice(2));
            }
        }

        if (current) entries.push(current);
        return entries.slice(0, 10); // Last 10 versions
    } catch (e) {
        return [];
    }
}

/**
 * GET /api/system/update-status
 * Check for available updates
 */
router.get('/update-status', (req, res) => {
    try {
        const currentVersion = getCurrentVersion();
        const latestVersion = getLatestVersion();
        const gitStatus = getGitStatus();
        const changelog = parseChangelog();

        // Simple semver compare
        const updateAvailable = latestVersion !== currentVersion &&
            latestVersion !== 'unknown' &&
            !latestVersion.includes('.g'); // exclude git hashes

        res.json({
            current_version: currentVersion,
            latest_version: latestVersion,
            update_available: updateAvailable,
            git_status: gitStatus,
            changelog: changelog,
            migration_status: migrations.getMigrationStatus()
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to check update status: ' + error.message });
    }
});

/**
 * POST /api/system/update
 * Pull latest code, run migrations, restart
 */
router.post('/update', (req, res) => {
    try {
        const currentVersion = getCurrentVersion();
        const gitStatus = getGitStatus();

        // Safety checks
        if (gitStatus !== 'clean') {
            return res.status(400).json({
                success: false,
                error: 'Cannot update with uncommitted changes. Please commit or discard changes first.',
                git_status: gitStatus
            });
        }

        // Backup database
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(DB_DIR, `lifeos.db.backup-${timestamp}`);
        fs.copyFileSync(DB_PATH, backupPath);
        console.log(`✅ Database backed up to ${backupPath}`);

        // Git pull
        try {
            const output = execSync('git pull origin main 2>&1', {
                cwd: ROOT_DIR,
                encoding: 'utf8'
            });
            console.log('Git pull output:', output);
        } catch (e) {
            // Restore backup if pull fails
            fs.copyFileSync(backupPath, DB_PATH);
            throw new Error('Git pull failed: ' + e.message);
        }

        const newVersion = getCurrentVersion();
        const changelog = parseChangelog();
        const newChanges = changelog[0] ? changelog[0].changes : [];

        console.log(`✅ Updated from ${currentVersion} to ${newVersion}`);

        res.json({
            success: true,
            old_version: currentVersion,
            new_version: newVersion,
            message: `Updated to ${newVersion}. Server will restart in 3 seconds.`,
            changes: newChanges.slice(0, 5),
            backup_path: backupPath
        });

        // Restart server after 1 second (let response send)
        setTimeout(() => {
            console.log('Gracefully shutting down for update...');
            process.exit(0); // systemd/Docker will restart
        }, 1000);

    } catch (error) {
        console.error('Update error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/system/rollback
 * Restore from latest backup
 */
router.post('/rollback', (req, res) => {
    try {
        // Find latest backup
        const files = fs.readdirSync(DB_DIR);
        const backups = files
            .filter(f => f.startsWith('lifeos.db.backup-'))
            .sort()
            .reverse();

        if (backups.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No backups found'
            });
        }

        const latestBackup = backups[0];
        const backupPath = path.join(DB_DIR, latestBackup);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const preRollbackBackup = path.join(DB_DIR, `lifeos.db.backup-pre-rollback-${timestamp}`);

        // Backup current DB before restoring
        fs.copyFileSync(DB_PATH, preRollbackBackup);

        // Restore from backup
        fs.copyFileSync(backupPath, DB_PATH);

        console.log(`✅ Rolled back from ${latestBackup}`);
        console.log(`   Current DB backed up to ${preRollbackBackup}`);

        res.json({
            success: true,
            message: `Restored from backup ${latestBackup}. Server will restart in 3 seconds.`,
            backup_restored: latestBackup,
            pre_rollback_backup: preRollbackBackup
        });

        // Restart server
        setTimeout(() => {
            console.log('Gracefully shutting down for rollback...');
            process.exit(0);
        }, 1000);

    } catch (error) {
        console.error('Rollback error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/system/health
 * Basic system health check
 */
router.get('/health', (req, res) => {
    try {
        const version = getCurrentVersion();
        const uptime = process.uptime();
        const memUsage = process.memoryUsage();

        res.json({
            status: 'ok',
            version,
            uptime_seconds: Math.floor(uptime),
            memory_mb: Math.round(memUsage.heapUsed / 1024 / 1024)
        });
    } catch (error) {
        res.status(500).json({ status: 'error', error: error.message });
    }
});

module.exports = router;
