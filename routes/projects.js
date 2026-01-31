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
        let projects = db.prepare('SELECT * FROM projects ORDER BY last_updated DESC').all();
        
        // If no projects in DB, insert defaults so we always return rows with ids (needed for project modal)
        if (projects.length === 0) {
            const insert = db.prepare('INSERT OR IGNORE INTO projects (name, github_repo, last_updated, metrics) VALUES (?, ?, ?, ?)');
            const defaults = [
                ['Soulin Social', null, '2025-01-24', JSON.stringify({ users: 2400, mrr: 8200 })],
                ['KINS', null, '2025-01-25', JSON.stringify({ subscribers: 8900, mrr: 3500 })],
                ['Cathy K', null, '2025-01-26', JSON.stringify({ api_calls: 1200, mrr: 2800 })],
                ['Soulful Academy', null, '2025-01-22', JSON.stringify({ reach: 18300, revenue: 1900 })]
            ];
            defaults.forEach(row => insert.run(...row));
            projects = db.prepare('SELECT * FROM projects ORDER BY last_updated DESC').all();
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
 * GET /api/projects/with-experiments
 * Projects with their experiments (scenarios where project_id = project.id)
 */
router.get('/with-experiments', (req, res) => {
    try {
        const projects = db.prepare('SELECT * FROM projects ORDER BY name').all();
        const scenarios = db.prepare('SELECT * FROM scenarios ORDER BY project_id, key').all();
        const byProject = {};
        projects.forEach(p => {
            const out = { ...p };
            if (typeof out.metrics === 'string') try { out.metrics = JSON.parse(out.metrics); } catch (_) {}
            out.experiments = [];
            byProject[p.id] = out;
        });
        scenarios.forEach(s => {
            if (s.project_id != null && byProject[s.project_id]) {
                byProject[s.project_id].experiments.push(s);
            }
        });
        res.json(projects.map(p => byProject[p.id] || p));
    } catch (error) {
        console.error('Error fetching projects with experiments:', error);
        res.status(500).json({ error: 'Failed to fetch' });
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

/**
 * GET /api/projects/:id
 * Get one project by id
 */
router.get('/:id', (req, res) => {
    try {
        const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
        if (!row) return res.status(404).json({ error: 'Project not found' });
        const out = { ...row };
        if (typeof out.metrics === 'string') try { out.metrics = JSON.parse(out.metrics); } catch (_) {}
        res.json(out);
    } catch (error) {
        console.error('Error fetching project:', error);
        res.status(500).json({ error: 'Failed to fetch project' });
    }
});

/**
 * PATCH /api/projects/:id
 * Update a project (revenue projections, planning fields, optional fields)
 */
router.patch('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const body = req.body;
        const allowed = ['name', 'description', 'github_repo', 'metrics', 'revenue_worst', 'revenue_base', 'revenue_lucky',
            'hours_per_week', 'budget_to_invest', 'months_to_results', 'business_model', 'ai_assumptions', 'ai_analysis'];
        const numericFields = ['revenue_worst', 'revenue_base', 'revenue_lucky', 'hours_per_week', 'budget_to_invest', 'months_to_results'];
        const updates = [];
        const values = [];
        allowed.forEach(f => {
            if (body[f] !== undefined) {
                updates.push(f + ' = ?');
                if (f === 'metrics') {
                    values.push(typeof body[f] === 'object' ? JSON.stringify(body[f]) : body[f]);
                } else if (numericFields.includes(f)) {
                    values.push(body[f] == null ? null : Number(body[f]));
                } else {
                    values.push(body[f]);
                }
            }
        });
        if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);
        db.prepare('UPDATE projects SET ' + updates.join(', ') + ' WHERE id = ?').run(...values);
        const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
        if (!row) return res.status(404).json({ error: 'Project not found' });
        const out = { ...row };
        if (typeof out.metrics === 'string') try { out.metrics = JSON.parse(out.metrics); } catch (_) {}
        res.json(out);
    } catch (error) {
        console.error('Error updating project:', error);
        res.status(500).json({ error: 'Failed to update project' });
    }
});

/**
 * POST /api/projects/:id/analyze
 * AI analyzes project and provides detailed business plan with realistic projections
 */
router.post('/:id/analyze', async (req, res) => {
    try {
        const { id } = req.params;
        const { project_name, description, hours_per_week, months_to_results, business_model } = req.body;
        
        const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
        if (!project) return res.status(404).json({ error: 'Project not found' });
        
        if (!description || description.length < 20) {
            return res.status(400).json({ error: 'Please provide a detailed project description' });
        }
        
        if (!process.env.ANTHROPIC_API_KEY) {
            return res.status(503).json({ 
                error: 'AI analysis requires ANTHROPIC_API_KEY in .env file. Add your API key to enable this feature.' 
            });
        }
        
        const Anthropic = require('@anthropic-ai/sdk');
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        
        const prompt = `You are an experienced business advisor helping a SOLO FOUNDER plan their project. Analyze this project and provide realistic, data-driven projections.

PROJECT: ${project_name || project.name}
DESCRIPTION: ${description}
BUSINESS MODEL: ${business_model}
TIME AVAILABLE: ${hours_per_week} hours per week (solo founder, no team)
TIMELINE: ${months_to_results} months

Analyze this specific project and provide:

1. PRICING STRATEGY: Based on the described product/service and target market, what should they charge? Consider competitors, value delivered, and what the market will bear.

2. CUSTOMER ACQUISITION: Given ${hours_per_week} hrs/week as a solo founder, how many customers can they realistically acquire in ${months_to_results} months? Consider:
   - Time needed for product development vs marketing
   - Typical conversion rates for ${business_model} (SaaS: 1-3% free-to-paid, Consulting: 10-20% lead-to-client)
   - One person's capacity for sales/marketing while also doing the work

3. BUDGET REQUIREMENTS: What minimum budget do they need for:
   - Tools/infrastructure (hosting, software, etc.)
   - Marketing (ads, content, outreach)
   - Other essentials
   Be specific to this type of project.

4. PROBABILITY OF SUCCESS: Given the specifics, what's a realistic probability this generates meaningful revenue in ${months_to_results} months? Be honest - most side projects fail or take longer than expected.

5. REVENUE PROJECTIONS: Calculate monthly revenue for worst/realistic/best cases:
   - Worst: Things don't go well but not total failure
   - Realistic: Normal execution with typical challenges
   - Best: Things go better than expected (but still realistic, not fantasy)

Reply with ONLY valid JSON:
{
  "suggested_price": "string like '$29/mo' or '$150/hr'",
  "target_customers": "string like '15-25 customers' or '2-3 clients'",
  "budget_needed": "string like '$200-500' with breakdown",
  "probability": "string like '35%' with brief reason",
  "revenue_worst": number (monthly $),
  "revenue_base": number (monthly $),
  "revenue_best": number (monthly $),
  "reasoning": "HTML string with <p> tags explaining your analysis, be specific to THIS project, include the math (price × customers = revenue), explain WHY these numbers make sense for this specific situation"
}`;

        const response = await anthropic.messages.create({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 2048,
            messages: [{ role: 'user', content: prompt }]
        });
        
        const text = (response.content[0]?.text || '').trim();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return res.status(500).json({ error: 'Could not parse AI response' });
        }
        
        const parsed = JSON.parse(jsonMatch[0]);
        return res.json({
            suggested_price: parsed.suggested_price || '—',
            target_customers: parsed.target_customers || '—',
            budget_needed: parsed.budget_needed || '—',
            probability: parsed.probability || '—',
            revenue_worst: Math.round(Number(parsed.revenue_worst) || 0),
            revenue_base: Math.round(Number(parsed.revenue_base) || 0),
            revenue_best: Math.round(Number(parsed.revenue_best) || 0),
            reasoning: parsed.reasoning || ''
        });
    } catch (error) {
        console.error('Error analyzing project:', error);
        res.status(500).json({ error: 'Failed to analyze project: ' + (error.message || 'Unknown error') });
    }
});

module.exports = router;
