const db = require('../../core/db/database');

/**
 * GitHub API Integration
 * Fetches project commit dates and contribution data
 * On-demand: Updates when manually triggered
 */
class GitHubIntegration {
    constructor() {
        this.apiToken = process.env.GITHUB_TOKEN;
        this.baseUrl = 'https://api.github.com';
        // Read username from config (fallback to env)
        try {
            const config = require('../../core/config');
            this.username = config.getUser().github_username || process.env.GITHUB_USERNAME || '';
        } catch (e) {
            this.username = process.env.GITHUB_USERNAME || '';
        }
    }

    /**
     * Fetch last commit date for a repository
     */
    async getLastCommitDate(repo) {
        if (!this.apiToken) {
            console.log('⚠️  GITHUB_TOKEN not configured');
            return null;
        }

        try {
            const repoPath = repo.includes('/') ? repo : `${this.username}/${repo}`;
            const response = await fetch(`${this.baseUrl}/repos/${repoPath}/commits?per_page=1`, {
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.status}`);
            }

            const commits = await response.json();
            if (commits.length === 0) {
                return null;
            }

            const lastCommitDate = commits[0].commit.author.date;
            return new Date(lastCommitDate).toISOString().split('T')[0];
        } catch (error) {
            console.error(`Error fetching commit date for ${repo}:`, error);
            return null;
        }
    }

    /**
     * Update project last_updated date
     */
    async updateProjectLastUpdated(projectName, githubRepo) {
        if (!githubRepo) {
            return;
        }

        const lastUpdated = await this.getLastCommitDate(githubRepo);
        if (!lastUpdated) {
            return;
        }

        const stmt = db.prepare(`
            UPDATE projects 
            SET last_updated = ?, updated_at = CURRENT_TIMESTAMP
            WHERE name = ?
        `);

        stmt.run(lastUpdated, projectName);
        console.log(`✅ Updated ${projectName} last commit: ${lastUpdated}`);
    }

    /**
     * Refresh all projects' last updated dates
     */
    async refreshAllProjects() {
        const stmt = db.prepare('SELECT name, github_repo FROM projects WHERE github_repo IS NOT NULL');
        const projects = stmt.all();

        for (const project of projects) {
            await this.updateProjectLastUpdated(project.name, project.github_repo);
        }
    }

    /**
     * Get contribution graph URL
     */
    getContributionGraphUrl() {
        return `https://ghchart.rshah.org/203EAE/${this.username}`;
    }
}

module.exports = new GitHubIntegration();
