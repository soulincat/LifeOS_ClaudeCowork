const db = require('./database');

/**
 * Seed initial data for development/testing
 */
function seedDatabase() {
    console.log('Seeding database with initial data...');

    // Seed todos
    const todoStmt = db.prepare(`
        INSERT OR IGNORE INTO todos (text, completed)
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

    // Seed projects
    const projectStmt = db.prepare(`
        INSERT OR IGNORE INTO projects (name, github_repo, last_updated, metrics)
        VALUES (?, ?, ?, ?)
    `);
    
    const projects = [
        { name: 'Client Portal Rebuild', github_repo: null, last_updated: '2025-01-24', metrics: JSON.stringify({ users: 2400, mrr: 8200 }) },
        { name: 'Newsletter System', github_repo: null, last_updated: '2025-01-25', metrics: JSON.stringify({ subscribers: 8900, mrr: 3500 }) },
        { name: 'API Integration', github_repo: null, last_updated: '2025-01-26', metrics: JSON.stringify({ api_calls: 1200, mrr: 2800 }) },
        { name: 'Content Strategy', github_repo: null, last_updated: '2025-01-22', metrics: JSON.stringify({ reach: 18300, revenue: 1900 }) }
    ];
    
    projects.forEach(project => {
        projectStmt.run(project.name, project.github_repo, project.last_updated, project.metrics);
    });

    // Seed social metrics (latest)
    const socialStmt = db.prepare(`
        INSERT OR IGNORE INTO social_metrics (platform, metric_type, value, date)
        VALUES (?, ?, ?, date('now'))
    `);
    
    const socialMetrics = [
        { platform: 'email', metric_type: 'subscribers', value: 1200 },
        { platform: 'linkedin', metric_type: 'followers', value: 8500 },
        { platform: 'twitter', metric_type: 'followers', value: 12300 },
        { platform: 'instagram', metric_type: 'followers', value: 4100 },
        { platform: 'threads', metric_type: 'followers', value: 2800 },
        { platform: 'substack', metric_type: 'subscribers', value: 890 },
        { platform: 'youtube', metric_type: 'subscribers', value: 3200 }
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

    // Seed finance (current month)
    const financeStmt = db.prepare(`
        INSERT OR IGNORE INTO finance_entries (date, type, amount, account_type, source)
        VALUES (?, ?, ?, ?, ?)
    `);
    
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    
    const financeEntries = [
        { date: `${currentMonth}-01`, type: 'revenue', amount: 18200, account_type: 'business', source: 'manual' },
        { date: `${currentMonth}-01`, type: 'profit', amount: 13400, account_type: 'business', source: 'manual' },
        { date: `${currentMonth}-15`, type: 'expense', amount: 4800, account_type: 'business', source: 'manual' },
        { date: `${currentMonth}-20`, type: 'spending', amount: 3200, account_type: 'personal', source: 'manual' },
        { date: `${currentMonth}-01`, type: 'investment', amount: 45500, account_type: 'personal', source: 'manual' },
        { date: `${currentMonth}-01`, type: 'asset', amount: 120300, account_type: 'personal', source: 'manual' },
        { date: `${currentMonth}-01`, type: 'total_net', amount: 165800, account_type: 'personal', source: 'manual' }
    ];
    
    financeEntries.forEach(entry => {
        financeStmt.run(entry.date, entry.type, entry.amount, entry.account_type, entry.source);
    });

    console.log('✅ Database seeded successfully');
}

// Run seed if called directly
if (require.main === module) {
    seedDatabase();
    process.exit(0);
}

module.exports = seedDatabase;
