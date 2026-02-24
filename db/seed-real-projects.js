/**
 * REAL PROJECT SEED DATA — Feb 2026
 * Source: SOULIN_BUSINESS_LANDSCAPE_FINAL.html, hotel-restructuring-dashboard.html, SOULIN_TOOL_AUDIT.html
 *
 * ⚠️  CLARIFICATION NEEDED items are marked with: // ⚠️ CLARIFY:
 * ⚠️  DISCREPANCY items are marked with:            // ⚠️ DISCREPANCY:
 * ⚠️  ESTIMATED items are marked with:              // ⚠️ ESTIMATE:
 *
 * All data can be modified later. This is the starting point based on documents shared.
 * Run: node db/seed-real-projects.js
 */

const db = require('./database');

function seedRealProjects() {
    console.log('Seeding REAL project data from business documents...');

    // Disable FK checks during seed — INSERT OR REPLACE triggers DELETE+INSERT
    // which cascades and fails if child rows exist. Re-enable at the end.
    db.pragma('foreign_keys = OFF');

    // ════════════════════════════════════════════════════════════════
    // 1. PROJECTS
    // ════════════════════════════════════════════════════════════════

    const projectStmt = db.prepare(`
        INSERT OR REPLACE INTO projects (
            name, github_repo, last_updated, metrics,
            revenue_worst, revenue_base, revenue_lucky,
            hours_per_week, budget_to_invest, months_to_results,
            business_model, ai_assumptions, status, next_action,
            health_status, progress_pct, current_phase, phase_list,
            priority_rank, timeline_start, timeline_end,
            blocks_project_ids, depends_on_project_ids
        ) VALUES (
            @name, @github_repo, @last_updated, @metrics,
            @revenue_worst, @revenue_base, @revenue_lucky,
            @hours_per_week, @budget_to_invest, @months_to_results,
            @business_model, @ai_assumptions, @status, @next_action,
            @health_status, @progress_pct, @current_phase, @phase_list,
            @priority_rank, @timeline_start, @timeline_end,
            @blocks_project_ids, @depends_on_project_ids
        )
    `);

    const projects = [
        {
            name: 'KINS Hotel',
            github_repo: null,
            last_updated: '2026-02-23',
            metrics: JSON.stringify({
                current: {
                    units_total: 8,
                    units_sold: 0,         // ⚠️ CLARIFY: how many units sold so far? Doc says target 7 sold / 1 retained
                    unit_price_usd: 180000,
                    build_cost_usd: 1173000,
                    dev_fee_usd: 82000,
                    products: {
                        '7day_reset': { price_low: 3500, price_high: 5000 },
                        '14day_deep': { price_low: 7000, price_high: 10000 },
                        'biannual_membership': { price_low: 12000, price_high: 18000 }
                    }
                }
            }),
            revenue_worst: 0,           // Pre-revenue — developer pre-sales stage
            revenue_base: 0,
            revenue_lucky: 180000,      // First unit sale
            hours_per_week: 10,         // ⚠️ ESTIMATE: how many hrs/wk on KINS right now?
            budget_to_invest: 1260000,  // 7 × $180K from unit sales
            months_to_results: 18,      // Month 6-18 pre-sales per timeline
            business_model: 'Developer pre-sales → clinical wellness retreat. Sell 7 units @ $180K to fund $1.17M build + 7% dev fee. Revenue from guest stays + memberships post-build.',
            ai_assumptions: 'AI sales agents handle outreach. Content builds investor trust pipeline.',
            status: 'active',
            next_action: 'Build investor pipeline via content trust + begin pre-sale conversations',
            health_status: 'green',     // Will be computed by derived-state
            progress_pct: 0,            // Will be computed from milestones
            current_phase: 'pipeline_building',
            phase_list: JSON.stringify([
                'pipeline_building',     // Mo 1-6: content builds trust, AI agents warm leads
                'presale_active',        // Mo 6-12: serious investor conversations, LOIs
                'construction',          // Mo 12-18: units sold, build begins
                'pre_opening',           // Mo 18-24: fit-out, hiring, clinical setup
                'operational'            // Mo 24+: guests arriving
            ]),
            priority_rank: 1,
            timeline_start: '2026-02-01',   // ⚠️ ESTIMATE: when did KINS work actually start?
            timeline_end: '2027-08-01',     // ~18 months for pre-sales phase
            blocks_project_ids: null,
            depends_on_project_ids: JSON.stringify([3, 4]) // Depends on blog (trust) + book (credibility)
        },
        {
            name: 'Soulin Social',
            github_repo: null, // ⚠️ CLARIFY: is there a GitHub repo? Tool audit shows Flask/Python + Supabase
            last_updated: '2026-02-23',
            metrics: JSON.stringify({
                current: {
                    paid_users: 0,       // ⚠️ CLARIFY: any paid users yet?
                    free_users: 0,
                    content_gen_readiness: 0.9,     // 90% per tool audit
                    social_publish_readiness: 0.05, // 5% — CRITICAL BLOCKER: all APIs stubbed
                    bilingual_readiness: 0.3,       // 30% per tool audit
                    substack_webhook: 0             // 0% — not built yet
                }
            }),
            revenue_worst: 450,      // Mo 3: ~15 users × $29
            revenue_base: 1500,      // Mo 3: ~50 users × $29
            revenue_lucky: 4000,     // Mo 6: ~80 users × $29-49 mix
            hours_per_week: 15,      // ⚠️ ESTIMATE: primary dev project
            budget_to_invest: 500,   // ⚠️ ESTIMATE: Supabase + Vercel costs
            months_to_results: 3,    // Week 4-6 first SaaS signups per timeline
            business_model: 'SaaS — AI content generation + scheduling. $29/mo (scheduling + personalization) + $49/mo (power user, launch later). Content subs get basic free via webhook.',
            ai_assumptions: 'Claude AI powers content generation. Self-marketing loop: every post = live demo.',
            status: 'active',
            next_action: 'Fix social API stubs — CRITICAL BLOCKER. Cannot publish to any platform.',
            health_status: 'red',    // BLOCKER: social APIs are stubs returning fake success
            progress_pct: 0,
            current_phase: 'fix_critical',
            phase_list: JSON.stringify([
                'fix_critical',          // Fix social API stubs, get publishing working
                'soft_launch_korean',    // Korean $29 tier with real publishing
                'english_launch',        // English market + webhook auto-provisioning
                'growth',                // Scale to 80-200 users
                'mature'                 // $49 tier, optimization
            ]),
            priority_rank: 2,
            timeline_start: '2026-02-01',
            timeline_end: '2026-12-01',     // Month 12 mature per timeline
            blocks_project_ids: JSON.stringify([3]),  // Blog depends on Soulin Social for distribution
            depends_on_project_ids: null
        },
        {
            name: 'blog.soulin.co',
            github_repo: null,
            last_updated: '2026-02-23',
            metrics: JSON.stringify({
                current: {
                    korean_list_size: 3000,       // Existing nomadcats.co Beehiiv list
                    english_subscribers: 0,
                    paid_subscribers: 0,
                    monthly_revenue: 0,
                    platform: 'Substack',          // ⚠️ CLARIFY: migration from Beehiiv done yet?
                    domain_pointed: false           // ⚠️ CLARIFY: is blog.soulin.co pointed to Substack?
                }
            }),
            revenue_worst: 270,      // Mo 1: 30 × $9
            revenue_base: 540,       // Mo 1: 60 × $9
            revenue_lucky: 810,      // Mo 1: 90 × $9
            hours_per_week: 8,       // ⚠️ ESTIMATE: content writing time
            budget_to_invest: 0,     // Substack is free to publish
            months_to_results: 1,    // Korean paid wall opens Week 3-4
            business_model: 'Content subscription — bilingual Substack. $8-10/mo paywall. Korean + English in one publication with sections. Paid subs auto-get basic Soulin Social.',
            ai_assumptions: 'Soulin Social generates + distributes. AI adapts Korean → English.',
            status: 'active',
            next_action: 'Rebrand nomadcats Beehiiv → Substack migration, clean archives, point blog.soulin.co',
            health_status: 'green',
            progress_pct: 0,
            current_phase: 'setup',
            phase_list: JSON.stringify([
                'setup',                 // Week -1: rebrand, migrate, clean up
                'korean_warmup',         // Week 1-3: "I'm back" + value content
                'korean_monetize',       // Week 3-4: paid wall + SaaS mention
                'english_build',         // Week 1-5: populate, X presence, free base
                'english_monetize',      // Week 5-8: English paid wall
                'growth'                 // Month 3+: both languages scaling
            ]),
            priority_rank: 3,
            timeline_start: '2026-02-01',
            timeline_end: '2026-08-01',
            blocks_project_ids: null,
            depends_on_project_ids: JSON.stringify([2]) // Needs Soulin Social for distribution
        },
        {
            name: 'Book — Nevertheless',
            github_repo: null,
            last_updated: '2026-02-23',
            metrics: JSON.stringify({
                current: {
                    language: 'Korean',
                    publisher: null,         // ⚠️ CLARIFY: which publisher? Doc says "Korean Publishing Contract — Near Completion"
                    completion_pct: null,     // ⚠️ CLARIFY: how much is written?
                    family_therapy_series: 'English preview on blog.soulin.co'
                }
            }),
            revenue_worst: 0,
            revenue_base: 0,        // Not a revenue play — credibility
            revenue_lucky: 5000,    // ⚠️ ESTIMATE: modest royalties
            hours_per_week: 5,      // ⚠️ ESTIMATE
            budget_to_invest: 0,
            months_to_results: 6,   // Month 6-9 book launch per timeline
            business_model: 'Credibility multiplier — NOT revenue. Published author → press → KINS investor trust → Korean viral moment. Family Therapy = English preview on blog.',
            ai_assumptions: null,
            status: 'active',
            next_action: 'Continue writing + publisher negotiations',  // ⚠️ CLARIFY: actual next step
            health_status: 'green',
            progress_pct: 0,
            current_phase: 'writing',
            phase_list: JSON.stringify([
                'writing',               // Complete manuscript
                'publisher_final',       // Finalize publishing contract
                'production',            // Editing, design, print
                'launch_prep',           // PR, press, event planning
                'launch',                // Korean book publishes — credibility explosion
                'post_launch'            // Leverage: press, speaking, KINS trust
            ]),
            priority_rank: 4,
            timeline_start: '2026-02-01',   // ⚠️ ESTIMATE
            timeline_end: '2026-11-01',     // Month 6-9 launch
            blocks_project_ids: null,
            depends_on_project_ids: null
        }
    ];

    const insertedProjectIds = {};
    projects.forEach(p => {
        projectStmt.run(p);
        const row = db.prepare('SELECT id FROM projects WHERE name = ?').get(p.name);
        insertedProjectIds[p.name] = row.id;
    });

    const P_KINS = insertedProjectIds['KINS Hotel'];
    const P_SOULIN = insertedProjectIds['Soulin Social'];
    const P_BLOG = insertedProjectIds['blog.soulin.co'];
    const P_BOOK = insertedProjectIds['Book — Nevertheless'];

    console.log('  ✅ Projects inserted:', insertedProjectIds);

    // ════════════════════════════════════════════════════════════════
    // 2. PROJECT MILESTONES (weights must sum to ~100 per project)
    // ════════════════════════════════════════════════════════════════

    const milestoneStmt = db.prepare(`
        INSERT INTO project_milestones (project_id, name, weight, status, target_date, phase)
        VALUES (@project_id, @name, @weight, @status, @target_date, @phase)
    `);

    const milestones = [
        // ── KINS Hotel (P1) — weights sum to 100 ──
        { project_id: P_KINS, name: 'KINS content series live on blog (6+ posts)', weight: 10, status: 'pending', target_date: '2026-04-01', phase: 'pipeline_building' },
        { project_id: P_KINS, name: 'AI sales agent operational', weight: 10, status: 'pending', target_date: '2026-05-01', phase: 'pipeline_building' },
        // ⚠️ CLARIFY: is the AI sales agent built? Tool audit says "Discord Bot + AI Sales Agent: Never started"
        { project_id: P_KINS, name: '5+ serious investor conversations', weight: 15, status: 'pending', target_date: '2026-08-01', phase: 'presale_active' },
        { project_id: P_KINS, name: 'First LOI signed', weight: 15, status: 'pending', target_date: '2026-09-01', phase: 'presale_active' },
        { project_id: P_KINS, name: '4+ units sold (pre-sale)', weight: 20, status: 'pending', target_date: '2026-12-01', phase: 'presale_active' },
        { project_id: P_KINS, name: '7 units sold — construction funded', weight: 15, status: 'pending', target_date: '2027-02-01', phase: 'construction' },
        { project_id: P_KINS, name: 'Construction complete', weight: 10, status: 'pending', target_date: '2027-08-01', phase: 'construction' },
        { project_id: P_KINS, name: 'First guest arrival', weight: 5, status: 'pending', target_date: '2027-10-01', phase: 'operational' },

        // ── Soulin Social (P2) — weights sum to 100 ──
        { project_id: P_SOULIN, name: 'Social API publishing WORKING (not stubs)', weight: 25, status: 'pending', target_date: '2026-03-15', phase: 'fix_critical' },
        // ⚠️ CRITICAL: This is THE blocker. All social APIs return fake success per tool audit.
        { project_id: P_SOULIN, name: 'Bilingual content generation reliable', weight: 10, status: 'pending', target_date: '2026-03-30', phase: 'fix_critical' },
        { project_id: P_SOULIN, name: 'Substack webhook → Supabase → magic link working', weight: 10, status: 'pending', target_date: '2026-04-01', phase: 'soft_launch_korean' },
        { project_id: P_SOULIN, name: 'Korean $29 tier: 10+ paying users', weight: 15, status: 'pending', target_date: '2026-04-15', phase: 'soft_launch_korean' },
        { project_id: P_SOULIN, name: 'English market live + auto-provisioning', weight: 10, status: 'pending', target_date: '2026-05-15', phase: 'english_launch' },
        { project_id: P_SOULIN, name: '50+ total paying users', weight: 15, status: 'pending', target_date: '2026-08-01', phase: 'growth' },
        { project_id: P_SOULIN, name: '100+ users, $49 tier added', weight: 10, status: 'pending', target_date: '2026-10-01', phase: 'mature' },
        { project_id: P_SOULIN, name: '200+ users, $3-8K/mo MRR', weight: 5, status: 'pending', target_date: '2026-12-01', phase: 'mature' },

        // ── blog.soulin.co (P3) — weights sum to 100 ──
        { project_id: P_BLOG, name: 'Beehiiv → Substack migration complete, blog.soulin.co live', weight: 15, status: 'pending', target_date: '2026-03-01', phase: 'setup' },
        { project_id: P_BLOG, name: '8-12 English adapted posts populated', weight: 10, status: 'pending', target_date: '2026-03-07', phase: 'setup' },
        { project_id: P_BLOG, name: '"I\'m back" Korean email sent, >15% open rate', weight: 15, status: 'pending', target_date: '2026-03-14', phase: 'korean_warmup' },
        { project_id: P_BLOG, name: 'Korean paid wall open, 30+ paid subs', weight: 15, status: 'pending', target_date: '2026-04-01', phase: 'korean_monetize' },
        { project_id: P_BLOG, name: '200-500 X/Twitter followers (English)', weight: 10, status: 'pending', target_date: '2026-04-15', phase: 'english_build' },
        { project_id: P_BLOG, name: '100+ English free subs, paid wall opens', weight: 15, status: 'pending', target_date: '2026-05-01', phase: 'english_monetize' },
        { project_id: P_BLOG, name: 'Combined $1-3K/mo content revenue', weight: 10, status: 'pending', target_date: '2026-06-01', phase: 'growth' },
        { project_id: P_BLOG, name: 'Combined $2.7-6K/mo content revenue (Mo 12)', weight: 10, status: 'pending', target_date: '2027-02-01', phase: 'growth' },

        // ── Book — Nevertheless (P4) — weights sum to 100 ──
        { project_id: P_BOOK, name: 'Manuscript complete', weight: 25, status: 'pending', target_date: '2026-04-01', phase: 'writing' },
        // ⚠️ CLARIFY: is the manuscript done? Doc says "near completion"
        { project_id: P_BOOK, name: 'Publishing contract signed', weight: 15, status: 'pending', target_date: '2026-05-01', phase: 'publisher_final' },
        // ⚠️ CLARIFY: doc says "Korean Publishing Contract — Near Completion" — how near?
        { project_id: P_BOOK, name: 'Family Therapy series launched on blog (English preview)', weight: 10, status: 'pending', target_date: '2026-05-15', phase: 'production' },
        { project_id: P_BOOK, name: 'Book in production (editing + design)', weight: 15, status: 'pending', target_date: '2026-07-01', phase: 'production' },
        { project_id: P_BOOK, name: 'PR + press strategy ready', weight: 10, status: 'pending', target_date: '2026-08-01', phase: 'launch_prep' },
        { project_id: P_BOOK, name: 'Book published — credibility explosion', weight: 20, status: 'pending', target_date: '2026-09-01', phase: 'launch' },
        { project_id: P_BOOK, name: 'Post-launch press/speaking engagements', weight: 5, status: 'pending', target_date: '2026-11-01', phase: 'post_launch' },
    ];

    // Clear existing milestones for these projects
    db.prepare('DELETE FROM project_milestones WHERE project_id IN (?, ?, ?, ?)').run(P_KINS, P_SOULIN, P_BLOG, P_BOOK);
    milestones.forEach(m => milestoneStmt.run(m));
    console.log(`  ✅ ${milestones.length} milestones inserted`);

    // ════════════════════════════════════════════════════════════════
    // 3. PROJECT TASKS (operational day-to-day items)
    // ════════════════════════════════════════════════════════════════

    const taskStmt = db.prepare(`
        INSERT INTO project_tasks (
            project_id, text, status, type, milestone_weight,
            is_blocker, blocks_task_ids, project_phase,
            energy_required, due_date, contributes_to_project_ids,
            priority_within_project, created_via
        ) VALUES (
            @project_id, @text, @status, @type, @milestone_weight,
            @is_blocker, @blocks_task_ids, @project_phase,
            @energy_required, @due_date, @contributes_to_project_ids,
            @priority_within_project, @created_via
        )
    `);

    const tasks = [
        // ── SOULIN SOCIAL — fix_critical phase ──
        {
            project_id: P_SOULIN, text: 'Replace ALL social API stub functions with real API integrations (Twitter, LinkedIn, Instagram, Threads)',
            status: 'open', type: 'deep_work', milestone_weight: null,
            is_blocker: 1, blocks_task_ids: null, project_phase: 'fix_critical',
            energy_required: 'high', due_date: '2026-03-15',
            contributes_to_project_ids: JSON.stringify([P_BLOG]),
            priority_within_project: 1, created_via: 'seed'
            // ⚠️ CRITICAL: Tool audit says "Social Media Publishing: 5% — Every platform integration is a stub"
        },
        {
            project_id: P_SOULIN, text: 'Fix bilingual content generation (currently 30% — Korean→English adaptation unreliable)',
            status: 'open', type: 'deep_work', milestone_weight: null,
            is_blocker: 0, blocks_task_ids: null, project_phase: 'fix_critical',
            energy_required: 'high', due_date: '2026-03-30',
            contributes_to_project_ids: JSON.stringify([P_BLOG]),
            priority_within_project: 2, created_via: 'seed'
        },
        {
            project_id: P_SOULIN, text: 'Build Substack webhook → Supabase → magic link auto-provisioning pipeline',
            status: 'open', type: 'deep_work', milestone_weight: null,
            is_blocker: 1, blocks_task_ids: null, project_phase: 'soft_launch_korean',
            energy_required: 'high', due_date: '2026-04-01',
            contributes_to_project_ids: JSON.stringify([P_BLOG]),
            priority_within_project: 3, created_via: 'seed'
            // ⚠️ Tool audit: "Substack Integration: 0% — Webhook endpoint doesn't exist"
        },
        {
            project_id: P_SOULIN, text: 'Set up Stripe payment integration for $29 tier',
            status: 'open', type: 'deliverable', milestone_weight: null,
            is_blocker: 0, blocks_task_ids: null, project_phase: 'soft_launch_korean',
            energy_required: 'medium', due_date: '2026-03-30',
            contributes_to_project_ids: null,
            priority_within_project: 4, created_via: 'seed'
            // ⚠️ Tool audit: "Stripe configured but needs real API keys"
        },
        {
            project_id: P_SOULIN, text: 'Complete Whoop API integration (credentials needed)',
            status: 'open', type: 'deliverable', milestone_weight: null,
            is_blocker: 0, blocks_task_ids: null, project_phase: 'soft_launch_korean',
            energy_required: 'medium', due_date: '2026-04-15',
            contributes_to_project_ids: JSON.stringify([P_KINS]),
            priority_within_project: 5, created_via: 'seed'
            // ⚠️ Tool audit: "Whoop configured but needs real credentials"
        },
        {
            project_id: P_SOULIN, text: 'Deploy soulin.co Framer homepage with SaaS landing + pricing page',
            status: 'open', type: 'deliverable', milestone_weight: null,
            is_blocker: 0, blocks_task_ids: null, project_phase: 'soft_launch_korean',
            energy_required: 'medium', due_date: '2026-03-20',
            contributes_to_project_ids: null,
            priority_within_project: 6, created_via: 'seed'
            // ⚠️ CLARIFY: is soulin.co homepage built? Doc says Framer + Supabase Auth
        },

        // ── BLOG.SOULIN.CO — setup phase ──
        {
            project_id: P_BLOG, text: 'Migrate nomadcats.co Beehiiv → Substack. Clean up archives, organize sections (Korean/English)',
            status: 'open', type: 'deliverable', milestone_weight: null,
            is_blocker: 1, blocks_task_ids: null, project_phase: 'setup',
            energy_required: 'medium', due_date: '2026-03-01',
            contributes_to_project_ids: null,
            priority_within_project: 1, created_via: 'seed'
        },
        {
            project_id: P_BLOG, text: 'Point blog.soulin.co domain to Substack',
            status: 'open', type: 'admin', milestone_weight: null,
            is_blocker: 1, blocks_task_ids: null, project_phase: 'setup',
            energy_required: 'low', due_date: '2026-03-01',
            contributes_to_project_ids: null,
            priority_within_project: 2, created_via: 'seed'
        },
        {
            project_id: P_BLOG, text: 'Add paywall infrastructure on Substack',
            status: 'open', type: 'admin', milestone_weight: null,
            is_blocker: 0, blocks_task_ids: null, project_phase: 'setup',
            energy_required: 'low', due_date: '2026-03-05',
            contributes_to_project_ids: null,
            priority_within_project: 3, created_via: 'seed'
        },
        {
            project_id: P_BLOG, text: 'AI-adapt 8-12 best Korean archive posts → English section',
            status: 'open', type: 'deep_work', milestone_weight: null,
            is_blocker: 0, blocks_task_ids: null, project_phase: 'setup',
            energy_required: 'high', due_date: '2026-03-07',
            contributes_to_project_ids: null,
            priority_within_project: 4, created_via: 'seed'
            // ⚠️ Note: "Review emotional content yourself — don't publish raw AI for Family Therapy-type posts"
        },
        {
            project_id: P_BLOG, text: 'Write + send "I\'m back" Korean email to 3,000 list (personal, vulnerable, YOUR voice not AI)',
            status: 'open', type: 'deep_work', milestone_weight: null,
            is_blocker: 0, blocks_task_ids: null, project_phase: 'korean_warmup',
            energy_required: 'high', due_date: '2026-03-14',
            contributes_to_project_ids: null,
            priority_within_project: 5, created_via: 'seed'
        },
        {
            project_id: P_BLOG, text: 'Send 2-3 best Korean archive content pieces (no asks, no paywalls, no SaaS mentions)',
            status: 'open', type: 'deliverable', milestone_weight: null,
            is_blocker: 0, blocks_task_ids: null, project_phase: 'korean_warmup',
            energy_required: 'medium', due_date: '2026-03-21',
            contributes_to_project_ids: null,
            priority_within_project: 6, created_via: 'seed'
        },
        {
            project_id: P_BLOG, text: 'Create X/Twitter account for English presence, start 2-3 tweets/day via Soulin Social',
            status: 'open', type: 'deliverable', milestone_weight: null,
            is_blocker: 0, blocks_task_ids: null, project_phase: 'english_build',
            energy_required: 'medium', due_date: '2026-03-14',
            contributes_to_project_ids: JSON.stringify([P_SOULIN]),
            priority_within_project: 7, created_via: 'seed'
        },
        {
            project_id: P_BLOG, text: 'Open Korean paid wall ($8-10/mo) + introduce SaaS naturally',
            status: 'open', type: 'deliverable', milestone_weight: null,
            is_blocker: 0, blocks_task_ids: null, project_phase: 'korean_monetize',
            energy_required: 'medium', due_date: '2026-04-01',
            contributes_to_project_ids: JSON.stringify([P_SOULIN]),
            priority_within_project: 8, created_via: 'seed'
        },
        {
            project_id: P_BLOG, text: 'Launch Family Therapy paid section (English) when 100+ free subs',
            status: 'open', type: 'deep_work', milestone_weight: null,
            is_blocker: 0, blocks_task_ids: null, project_phase: 'english_monetize',
            energy_required: 'high', due_date: '2026-05-01',
            contributes_to_project_ids: JSON.stringify([P_BOOK]),
            priority_within_project: 9, created_via: 'seed'
        },

        // ── KINS HOTEL — pipeline_building phase ──
        {
            project_id: P_KINS, text: 'Create KINS content series on blog.soulin.co (healing journey + hotel is real)',
            status: 'open', type: 'deep_work', milestone_weight: null,
            is_blocker: 0, blocks_task_ids: null, project_phase: 'pipeline_building',
            energy_required: 'high', due_date: '2026-04-01',
            contributes_to_project_ids: JSON.stringify([P_BLOG]),
            priority_within_project: 1, created_via: 'seed'
        },
        {
            project_id: P_KINS, text: 'Build/deploy AI sales agent for investor outreach',
            status: 'open', type: 'deep_work', milestone_weight: null,
            is_blocker: 0, blocks_task_ids: null, project_phase: 'pipeline_building',
            energy_required: 'high', due_date: '2026-05-01',
            contributes_to_project_ids: null,
            priority_within_project: 2, created_via: 'seed'
            // ⚠️ Tool audit: "Discord Bot + AI Sales Agent: Never started (0%)"
        },
        {
            project_id: P_KINS, text: 'Finalize unit pricing deck + investor documentation (7 sold / 1 retained model)',
            status: 'open', type: 'deliverable', milestone_weight: null,
            is_blocker: 0, blocks_task_ids: null, project_phase: 'pipeline_building',
            energy_required: 'medium', due_date: '2026-04-15',
            contributes_to_project_ids: null,
            priority_within_project: 3, created_via: 'seed'
        },
        {
            project_id: P_KINS, text: 'Verify legal structure: KINS LLC (US) + PT PMA GABBIJIP (ID) — real property, NOT security',
            status: 'open', type: 'admin', milestone_weight: null,
            is_blocker: 1, blocks_task_ids: null, project_phase: 'pipeline_building',
            energy_required: 'medium', due_date: '2026-04-01',
            contributes_to_project_ids: null,
            priority_within_project: 4, created_via: 'seed'
            // ⚠️ CLARIFY: is the legal structure verified with a lawyer?
        },
        {
            project_id: P_KINS, text: 'Set up Trudiagnostics partnership for epigenetic testing supply',
            status: 'open', type: 'communication', milestone_weight: null,
            is_blocker: 0, blocks_task_ids: null, project_phase: 'pipeline_building',
            energy_required: 'medium', due_date: '2026-06-01',
            contributes_to_project_ids: null,
            priority_within_project: 5, created_via: 'seed'
        },

        // ── BOOK — writing phase ──
        {
            project_id: P_BOOK, text: 'Complete "Nevertheless" manuscript',
            status: 'open', type: 'deep_work', milestone_weight: null,
            is_blocker: 1, blocks_task_ids: null, project_phase: 'writing',
            energy_required: 'high', due_date: '2026-04-01',
            contributes_to_project_ids: null,
            priority_within_project: 1, created_via: 'seed'
            // ⚠️ CLARIFY: how much is actually written? "Near completion"
        },
        {
            project_id: P_BOOK, text: 'Finalize Korean publisher contract',
            status: 'open', type: 'communication', milestone_weight: null,
            is_blocker: 0, blocks_task_ids: null, project_phase: 'publisher_final',
            energy_required: 'medium', due_date: '2026-05-01',
            contributes_to_project_ids: null,
            priority_within_project: 2, created_via: 'seed'
        },
        {
            project_id: P_BOOK, text: 'Begin Family Therapy series on blog (English preview of book themes)',
            status: 'open', type: 'deep_work', milestone_weight: null,
            is_blocker: 0, blocks_task_ids: null, project_phase: 'production',
            energy_required: 'high', due_date: '2026-05-15',
            contributes_to_project_ids: JSON.stringify([P_BLOG, P_KINS]),
            priority_within_project: 3, created_via: 'seed'
        },
    ];

    // Clear existing tasks for these projects
    db.prepare('DELETE FROM project_tasks WHERE project_id IN (?, ?, ?, ?)').run(P_KINS, P_SOULIN, P_BLOG, P_BOOK);
    tasks.forEach(t => taskStmt.run(t));
    console.log(`  ✅ ${tasks.length} tasks inserted`);

    // ════════════════════════════════════════════════════════════════
    // 4. PROJECT DEPENDENCIES
    // ════════════════════════════════════════════════════════════════

    const depStmt = db.prepare(`
        INSERT INTO project_dependencies (upstream_project_id, downstream_project_id, dependency_description, is_hard_block)
        VALUES (@upstream_project_id, @downstream_project_id, @dependency_description, @is_hard_block)
    `);

    // Clear existing
    db.prepare('DELETE FROM project_dependencies WHERE upstream_project_id IN (?, ?, ?, ?) OR downstream_project_id IN (?, ?, ?, ?)')
        .run(P_KINS, P_SOULIN, P_BLOG, P_BOOK, P_KINS, P_SOULIN, P_BLOG, P_BOOK);

    const dependencies = [
        {
            upstream_project_id: P_SOULIN,
            downstream_project_id: P_BLOG,
            dependency_description: 'Soulin Social powers all content distribution for blog. Without working social APIs, blog growth is manual only.',
            is_hard_block: 0 // Blog can still function manually, but growth is crippled
        },
        {
            upstream_project_id: P_SOULIN,
            downstream_project_id: P_KINS,
            dependency_description: 'Soulin Social distributes KINS content to build investor pipeline. Without it, pipeline building is manual.',
            is_hard_block: 0
        },
        {
            upstream_project_id: P_BLOG,
            downstream_project_id: P_KINS,
            dependency_description: 'Blog content builds trust that converts readers → investors. 6+ months of content needed before serious pre-sales.',
            is_hard_block: 0
        },
        {
            upstream_project_id: P_BOOK,
            downstream_project_id: P_KINS,
            dependency_description: 'Book launch = credibility explosion that multiplies KINS investor trust. Published author >> anonymous person selling $180K units.',
            is_hard_block: 0
        },
        {
            upstream_project_id: P_BLOG,
            downstream_project_id: P_SOULIN,
            dependency_description: 'Blog paid subscribers auto-provision basic Soulin Social via webhook. Blog is the SaaS funnel entry point.',
            is_hard_block: 0
        },
    ];

    dependencies.forEach(d => depStmt.run(d));
    console.log(`  ✅ ${dependencies.length} dependencies inserted`);

    // ════════════════════════════════════════════════════════════════
    // 5. DECISION TRIGGERS (from business landscape doc Section 09)
    // ════════════════════════════════════════════════════════════════

    const triggerStmt = db.prepare(`
        INSERT INTO decision_triggers (
            project_id, title, check_date, metric_type, metric_source,
            threshold, operator, pass_text, fail_text,
            status, surface_on_dashboard
        ) VALUES (
            @project_id, @title, @check_date, @metric_type, @metric_source,
            @threshold, @operator, @pass_text, @fail_text,
            @status, @surface_on_dashboard
        )
    `);

    // Clear existing
    db.prepare('DELETE FROM decision_triggers WHERE project_id IN (?, ?, ?, ?)').run(P_KINS, P_SOULIN, P_BLOG, P_BOOK);

    const triggers = [
        {
            project_id: P_BLOG,
            title: 'Korean list alive or dead?',
            check_date: '2026-03-21',      // Week 2 after "I'm back" email
            metric_type: 'email_open_rate',
            metric_source: 'substack',       // ⚠️ CLARIFY: or Beehiiv if not migrated yet?
            threshold: 15,
            operator: 'greater_than',
            pass_text: '>15% open rate → proceed with monetization',
            fail_text: '<10% → send 2-3 more value emails before asks. Expect 3-6mo warm-up.',
            status: 'pending',
            surface_on_dashboard: 1
        },
        {
            project_id: P_SOULIN,
            title: 'Will Korean creators pay $29?',
            check_date: '2026-04-30',      // Week 4-6 after SaaS launch
            metric_type: 'paying_users_korean',
            metric_source: 'supabase',
            threshold: 10,
            operator: 'greater_than',
            pass_text: '10+ Korean users → market exists. Scale demos.',
            fail_text: '<5 users → try $19. Or reframe value prop. Talk to rejecters.',
            status: 'pending',
            surface_on_dashboard: 1
        },
        {
            project_id: P_BLOG,
            title: 'AI-adapted English content good enough?',
            check_date: '2026-05-15',      // Month 2-3
            metric_type: 'email_open_rate_english',
            metric_source: 'substack',
            threshold: 40,
            operator: 'greater_than',
            pass_text: '>40% open rates → adaptation works.',
            fail_text: '<25% → AI losing the soul. Write emotional content in English yourself.',
            status: 'pending',
            surface_on_dashboard: 1
        },
        {
            project_id: P_SOULIN,
            title: 'Self-marketing loop working?',
            check_date: '2026-05-31',      // Month 3
            metric_type: 'signup_to_follower_correlation',
            metric_source: 'manual',        // ⚠️ No automated way to measure this yet
            threshold: 1,                   // Boolean: 1 = yes correlates
            operator: 'greater_than',
            pass_text: 'Signups correlate with follower growth → loop works.',
            fail_text: 'Growth but no conversions → make product role more visible. Add CTAs.',
            status: 'pending',
            surface_on_dashboard: 1
        },
        {
            project_id: P_KINS,
            title: 'Real investor conversations happening?',
            check_date: '2026-08-31',      // Month 6
            metric_type: 'investor_conversations',
            metric_source: 'manual',
            threshold: 5,
            operator: 'greater_than',
            pass_text: '5+ serious conversations → content trust working.',
            fail_text: '<3 → content not reaching investors. Add direct networking.',
            status: 'pending',
            surface_on_dashboard: 1
        },
        {
            project_id: null,               // Cross-project: overall health
            title: 'Combined recurring >$3K/mo?',
            check_date: '2026-08-31',      // Month 6
            metric_type: 'combined_mrr',
            metric_source: 'stripe',        // ⚠️ ESTIMATE: or manual tracking
            threshold: 3000,
            operator: 'greater_than',
            pass_text: '>$3K → model works. Optimize.',
            fail_text: '<$2K → hard pivot. Pick SaaS OR content. Don\'t split.',
            status: 'pending',
            surface_on_dashboard: 1
        },
    ];

    triggers.forEach(t => triggerStmt.run(t));
    console.log(`  ✅ ${triggers.length} decision triggers inserted`);

    // ════════════════════════════════════════════════════════════════
    // 6. VIP SENDERS (for inbox urgency scoring)
    // ════════════════════════════════════════════════════════════════

    const vipStmt = db.prepare(`
        INSERT OR IGNORE INTO vip_senders (sender_id, name, relationship)
        VALUES (@sender_id, @name, @relationship)
    `);

    const vipSenders = [
        // ⚠️ CLARIFY: need real sender IDs / phone numbers / email addresses
        { sender_id: 'kins_investor_1', name: 'KINS Investor Lead', relationship: 'investor' },
        { sender_id: 'publisher_kr', name: 'Korean Publisher', relationship: 'book_publisher' },
        { sender_id: 'trudiag_contact', name: 'Trudiagnostics Contact', relationship: 'clinical_partner' },
        { sender_id: 'bali_architect', name: 'Bali Architect/Builder', relationship: 'construction' },
        { sender_id: 'lawyer_us', name: 'US Lawyer (KINS LLC)', relationship: 'legal' },
        { sender_id: 'lawyer_id', name: 'Indonesia Lawyer (PT PMA)', relationship: 'legal' },
        // ⚠️ CLARIFY: who are the actual VIP contacts? Add real emails/phone numbers
    ];

    vipSenders.forEach(v => vipStmt.run(v));
    console.log(`  ✅ ${vipSenders.length} VIP senders inserted`);

    // ════════════════════════════════════════════════════════════════
    // 7. SOCIAL METRICS (current state from tool audit)
    // ════════════════════════════════════════════════════════════════

    const socialStmt = db.prepare(`
        INSERT OR REPLACE INTO social_metrics (platform, metric_type, value, date, sync_source)
        VALUES (@platform, @metric_type, @value, @date, @sync_source)
    `);

    const socialBaseline = [
        { platform: 'linkedin', metric_type: 'followers', value: 10000, date: '2026-02-23', sync_source: 'manual' },
        // ⚠️ CLARIFY: is 10K LinkedIn still accurate? From business landscape "10K Korean"
        { platform: 'email', metric_type: 'subscribers', value: 3000, date: '2026-02-23', sync_source: 'manual' },
        // Korean list from nomadcats.co Beehiiv
        { platform: 'youtube', metric_type: 'subscribers', value: 300, date: '2026-02-23', sync_source: 'manual' },
        { platform: 'brunch', metric_type: 'followers', value: 2700, date: '2026-02-23', sync_source: 'manual' },
        { platform: 'twitter', metric_type: 'followers', value: 0, date: '2026-02-23', sync_source: 'manual' },
        // English X/Twitter not started yet
        { platform: 'instagram', metric_type: 'followers', value: 0, date: '2026-02-23', sync_source: 'manual' },
        { platform: 'substack', metric_type: 'subscribers', value: 0, date: '2026-02-23', sync_source: 'manual' },
        // Migration not done yet
    ];

    socialBaseline.forEach(s => socialStmt.run(s));
    console.log(`  ✅ ${socialBaseline.length} social metrics baseline inserted`);

    // Re-enable FK checks now that seed data is consistent
    db.pragma('foreign_keys = ON');

    // ════════════════════════════════════════════════════════════════
    // 8. RUN DERIVED STATE FOR ALL PROJECTS
    // ════════════════════════════════════════════════════════════════

    try {
        const { rederiveProject } = require('./derived-state');
        [P_KINS, P_SOULIN, P_BLOG, P_BOOK].forEach(id => rederiveProject(id));
        console.log('  ✅ Derived state computed for all projects');
    } catch (e) {
        console.log('  ⚠️  Could not run derived state (might need DB connection):', e.message);
    }

    console.log('\n✅ REAL project seed complete!\n');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  ITEMS NEEDING YOUR INPUT (search for ⚠️ in this file):     ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log('║  CLARIFY:                                                   ║');
    console.log('║  • KINS: How many units sold so far?                        ║');
    console.log('║  • KINS: When did KINS work actually start?                 ║');
    console.log('║  • KINS: Is legal structure verified with a lawyer?          ║');
    console.log('║  • KINS: Hours/week currently spent on KINS?                ║');
    console.log('║  • Soulin Social: Is there a GitHub repo?                   ║');
    console.log('║  • Soulin Social: Any paid users yet?                       ║');
    console.log('║  • Soulin Social: Is soulin.co Framer homepage built?       ║');
    console.log('║  • Blog: Is Beehiiv → Substack migration done?              ║');
    console.log('║  • Blog: Is blog.soulin.co domain pointed?                  ║');
    console.log('║  • Book: Which Korean publisher?                            ║');
    console.log('║  • Book: How much is actually written?                      ║');
    console.log('║  • Book: What is the actual next step?                      ║');
    console.log('║  • VIP Senders: Need real email/phone for urgency scoring   ║');
    console.log('║  • Social: Is 10K LinkedIn still accurate?                  ║');
    console.log('║                                                             ║');
    console.log('║  DISCREPANCIES:                                             ║');
    console.log('║  • Old seed had "Soulin Agency" project — not in new docs   ║');
    console.log('║  • Old seed had "Cathy K" project — now split into Blog +   ║');
    console.log('║    Book as separate entities                                ║');
    console.log('║  • Old seed metrics (paid_members: 2400, mrr: 8200) don\'t  ║');
    console.log('║    match reality — Soulin Social has 0 paid users per audit ║');
    console.log('║  • Tool audit: AI Sales Agent "never started" but business  ║');
    console.log('║    plan assumes it for KINS pipeline                        ║');
    console.log('║  • Tool audit: Social APIs are ALL stubs — but business     ║');
    console.log('║    plan assumes Soulin Social "powers everything"           ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
}

// Run seed if called directly
if (require.main === module) {
    seedRealProjects();
    process.exit(0);
}

module.exports = seedRealProjects;
