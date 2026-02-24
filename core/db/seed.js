const db = require('./database');

/**
 * Seed initial data for development/testing
 */
function seedDatabase() {
    console.log('Seeding database with initial data...');

    // Seed todos only when table is empty (never overwrite or duplicate your data)
    const existingTodos = db.prepare('SELECT COUNT(*) as count FROM todos').get();
    if (existingTodos.count === 0) {
        const todoStmt = db.prepare(`
            INSERT INTO todos (text, completed)
            VALUES (?, ?)
        `);
        const todos = [
            { text: 'Push API updates', completed: true },
            { text: 'Review client feedback', completed: true },
            { text: 'Update portfolio', completed: true },
            { text: 'Schedule dentist', completed: true },
            { text: 'Write blog post', completed: false },
            { text: 'Team standup prep', completed: false },
            { text: 'Review PRs', completed: false },
            { text: 'Update documentation', completed: false }
        ];
        todos.forEach(todo => {
            todoStmt.run(todo.text, todo.completed ? 1 : 0);
        });
    }

    // Seed demo projects (generic — real projects are created via onboarding wizard)
    const projectStmt = db.prepare(`
        INSERT OR IGNORE INTO projects (name, github_repo, last_updated, metrics, business_model, display_kpi_key, display_kpi_label)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const projects = [
        { name: 'My SaaS', github_repo: null, last_updated: '2025-01-24', metrics: JSON.stringify({ current: { paid_members: 50, mrr: 2500 }, last_month: { paid_members: 40, mrr: 2000 } }), business_model: 'saas', kpi_key: 'paid_members', kpi_label: 'Paid Members' },
        { name: 'Side Project', github_repo: null, last_updated: '2025-01-25', metrics: JSON.stringify({ current: { revenue: 500 }, last_month: { revenue: 350 } }), business_model: 'freelance', kpi_key: 'revenue', kpi_label: 'Revenue' },
    ];

    projects.forEach(project => {
        projectStmt.run(project.name, project.github_repo, project.last_updated, project.metrics, project.business_model, project.kpi_key, project.kpi_label);
    });

    // Seed social metrics (latest)
    const socialStmt = db.prepare(`
        INSERT OR IGNORE INTO social_metrics (platform, metric_type, value, date)
        VALUES (?, ?, ?, date('now'))
    `);
    
    const socialMetrics = [
        { platform: 'email', metric_type: 'subscribers', value: 2600 },
        { platform: 'linkedin', metric_type: 'followers', value: 10000 },
        { platform: 'twitter', metric_type: 'followers', value: 0 },
        { platform: 'instagram', metric_type: 'followers', value: 0 },
        { platform: 'threads', metric_type: 'followers', value: 0 },
        { platform: 'substack', metric_type: 'subscribers', value: 0 },
        { platform: 'youtube', metric_type: 'subscribers', value: 300 },
        { platform: 'brunch', metric_type: 'followers', value: 2700 }
    ];
    
    socialMetrics.forEach(metric => {
        socialStmt.run(metric.platform, metric.metric_type, metric.value);
    });

    // Seed scheduled posts
    const postStmt = db.prepare(`
        INSERT OR IGNORE INTO scheduled_posts (center_post, platforms, scheduled_date, status)
        VALUES (?, ?, ?, ?)
    `);
    
    const now = new Date();
    const today2pm = new Date(now);
    today2pm.setHours(14, 0, 0, 0);
    
    const tomorrow10am = new Date(now);
    tomorrow10am.setDate(tomorrow10am.getDate() + 1);
    tomorrow10am.setHours(10, 0, 0, 0);
    
    const jan29 = new Date('2025-01-29T14:00:00');
    
    const posts = [
        { center_post: 'Building resilient APIs with retry logic and circuit breakers', platforms: JSON.stringify(['Twitter', 'LinkedIn']), scheduled_date: today2pm.toISOString(), status: 'queued' },
        { center_post: 'Behind the scenes: My daily workflow as a solo developer', platforms: JSON.stringify(['LinkedIn']), scheduled_date: tomorrow10am.toISOString(), status: 'queued' },
        { center_post: 'Just shipped a major performance update to the client portal. 40% faster load times 🚀', platforms: JSON.stringify(['Twitter', 'LinkedIn']), scheduled_date: jan29.toISOString(), status: 'queued' }
    ];
    
    posts.forEach(post => {
        postStmt.run(post.center_post, post.platforms, post.scheduled_date, post.status);
    });

    // Seed upcoming items
    const upcomingStmt = db.prepare(`
        INSERT OR IGNORE INTO upcoming_items (title, type, due_date, description)
        VALUES (?, ?, ?, ?)
    `);
    
    const upcoming = [
        { title: 'Q1 Report Deadline', type: 'deadline', due_date: new Date('2025-01-31').toISOString(), description: null },
        { title: 'Client Strategy Call', type: 'call', due_date: new Date(now.getTime() + 24 * 60 * 60 * 1000).setHours(15, 0, 0, 0), description: 'TechCorp' },
        { title: 'Project Kickoff Meeting', type: 'meeting', due_date: new Date('2025-02-03').toISOString(), description: null }
    ];
    
    upcoming.forEach(item => {
        upcomingStmt.run(item.title, item.type, item.due_date, item.description);
    });

    // No finance seeding — finance numbers come only from your input.

    console.log('✅ Database seeded successfully');
}

// Run seed if called directly
if (require.main === module) {
    seedDatabase();
    process.exit(0);
}

module.exports = seedDatabase;
