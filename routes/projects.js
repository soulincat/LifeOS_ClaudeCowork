const express = require('express');
const router = express.Router();
const db = require('../db/database');
const github = require('../integrations/github');

/**
 * GET /api/projects
 * Get all projects with last updated dates
 */
router.get('/', async (req, res) => {
    try {
        const stmt = db.prepare('SELECT * FROM projects ORDER BY last_updated DESC');
        let projects = stmt.all();
        
        // If no projects in DB, return default projects
        if (projects.length === 0) {
            projects = [
                { name: 'Client Portal Rebuild', github_repo: null, last_updated: '2025-01-24', metrics: JSON.stringify({ users: 2400, mrr: 8200 }) },
                { name: 'Newsletter System', github_repo: null, last_updated: '2025-01-25', metrics: JSON.stringify({ subscribers: 8900, mrr: 3500 }) },
                { name: 'API Integration', github_repo: null, last_updated: '2025-01-26', metrics: JSON.stringify({ api_calls: 1200, mrr: 2800 }) },
                { name: 'Content Strategy', github_repo: null, last_updated: '2025-01-22', metrics: JSON.stringify({ reach: 18300, revenue: 1900 }) }
            ];
        }
        
        // Parse metrics JSON
        projects = projects.map(project => ({
            ...project,
            metrics: typeof project.metrics === 'string' ? JSON.parse(project.metrics) : project.metrics
        }));
        
        res.json(projects);
    } catch (error) {
        console.error('Error fetching projects:', error);
        res.status(500).json({ error: 'Failed to fetch projects' });
    }
});

/**
 * POST /api/projects/refresh
 * Refresh all projects' last updated dates from GitHub
 */
router.post('/refresh', async (req, res) => {
    try {
        await github.refreshAllProjects();
        res.json({ success: true, message: 'Projects refreshed' });
    } catch (error) {
        console.error('Error refreshing projects:', error);
        res.status(500).json({ error: 'Failed to refresh projects' });
    }
});

/**
 * POST /api/projects
 * Add or update a project
 */
router.post('/', (req, res) => {
    try {
        const { name, github_repo, metrics } = req.body;
        
        const stmt = db.prepare(`
            INSERT INTO projects (name, github_repo, metrics)
            VALUES (?, ?, ?)
            ON CONFLICT(name) DO UPDATE SET
                github_repo = excluded.github_repo,
                metrics = excluded.metrics,
                updated_at = CURRENT_TIMESTAMP
        `);
        
        const metricsJson = typeof metrics === 'object' ? JSON.stringify(metrics) : metrics;
        stmt.run(name, github_repo, metricsJson);
        
        // If github_repo provided, fetch last commit date
        if (github_repo) {
            github.updateProjectLastUpdated(name, github_repo);
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error adding project:', error);
        res.status(500).json({ error: 'Failed to add project' });
    }
});

module.exports = router;
