// Health Alert Logic
function updateHealthAlert() {
    const recoveryEl = document.querySelector('.info-row .info-value.accent');
    const sleepEl = Array.from(document.querySelectorAll('.info-row')).find(row => 
        row.querySelector('.info-label').textContent === 'Sleep'
    );
    const cycleEl = Array.from(document.querySelectorAll('.info-row')).find(row => 
        row.querySelector('.info-label').textContent === 'Cycle'
    );
    
    const alertEl = document.getElementById('healthAlert');
    
    if (!recoveryEl || !sleepEl || !cycleEl || !alertEl) return;
    
    const recovery = parseInt(recoveryEl.textContent);
    const sleepText = sleepEl.querySelector('.info-value').textContent;
    const cycleText = cycleEl.querySelector('.info-value').textContent;
    
    // Parse sleep hours (e.g., "7h 24m" -> 7)
    const sleepMatch = sleepText.match(/(\d+)h/);
    const sleepHours = sleepMatch ? parseInt(sleepMatch[1]) : 0;
    
    // Check conditions
    const lowRecovery = recovery < 70;
    const lowSleep = sleepHours < 7;
    const isLutealOrPreMenstrual = cycleText.toLowerCase().includes('luteal') || 
                                   cycleText.toLowerCase().includes('pre-menstrual') ||
                                   cycleText.toLowerCase().includes('before menstruation');
    
    if (lowRecovery && lowSleep && isLutealOrPreMenstrual) {
        alertEl.textContent = 'Low energy and emotional sensitivity alert, be mindful today';
        alertEl.style.display = 'block';
    } else if (lowRecovery && lowSleep) {
        alertEl.textContent = 'Low recovery and sleep detected, prioritize rest today';
        alertEl.style.display = 'block';
    } else if (lowRecovery) {
        alertEl.textContent = 'Low recovery detected, take it easy today';
        alertEl.style.display = 'block';
    } else if (lowSleep) {
        alertEl.textContent = 'Insufficient sleep detected, be mindful of energy levels';
        alertEl.style.display = 'block';
    } else {
        alertEl.style.display = 'none';
    }
}

// Load dashboard data (each section independent so one failure doesn't block the rest)
async function loadDashboardData() {
    let socialFollowersTotal = 0; // used by dashboard project cards (e.g. Cathy K = this total)

    // --- Health ---
    try {
        const healthResponse = await fetch('/api/health');
        const health = await healthResponse.json();
        
        // Update health display (only health section; do not touch finance rows)
        const healthSection = document.getElementById('healthSection');
        const healthRows = healthSection ? healthSection.querySelectorAll('.info-row') : [];
        healthRows.forEach(row => {
            const label = row.querySelector('.info-label')?.textContent;
            const valueEl = row.querySelector('.info-value');
            if (!valueEl) return;
            
            if (label === 'Recovery') {
                valueEl.textContent = `${health.recovery}%`;
            } else if (label === 'Sleep') {
                valueEl.textContent = `${health.sleep_hours}h ${health.sleep_minutes}m`;
            } else if (label === 'HRV') {
                valueEl.textContent = `${health.hrv}ms`;
            } else if (label === 'Cycle') {
                valueEl.textContent = health.cycle_phase || 'Luteal Phase (low energy)';
            }
        });
        
        // Update monthly phase in header
        const healthMonthlyPhaseEl = document.getElementById('healthMonthlyPhase');
        if (healthMonthlyPhaseEl && health.monthly_phase) {
            healthMonthlyPhaseEl.textContent = health.monthly_phase;
        }
        
        updateHealthAlert();
    } catch (e) { console.warn('Health load failed', e); }

    // --- Finance ---
    let finance = {};
    try {
        const financeResponse = await fetch('/api/finance');
            if (financeResponse.ok) {
                finance = await financeResponse.json();
        } else {
            console.warn('Finance API:', financeResponse.status);
        }
    } catch (e) {
        console.warn('Finance fetch failed:', e);
    }
    try {
        // Update finance display
        const financeSection = document.getElementById('financeSection');
        const financeRows = financeSection ? financeSection.querySelectorAll('.info-row') : [];
        
        if (financeSection && financeRows.length > 0) {
        // Format currency helper
        const formatCurrency = (amount) => {
            if (amount === null || amount === undefined) return '$0';
            const numAmount = Number(amount);
            if (isNaN(numAmount)) return '$0';
            if (numAmount >= 1000) {
                return `$${(numAmount / 1000).toFixed(1)}k`;
            } else if (numAmount >= 0) {
                return `$${numAmount.toFixed(0)}`;
            } else {
                return `-$${Math.abs(numAmount).toFixed(0)}`;
            }
        };
        
        financeRows.forEach((row, index) => {
            const labelEl = row.querySelector('.info-label');
            const valueEl = row.querySelector('.info-value');
            
            if (!valueEl || !labelEl) {
                console.log(`Row ${index}: Missing elements`);
                return;
            }
            
            const label = labelEl.textContent?.trim();
            
            let newValue = null;
            let shouldAddAccent = false;
            
            if (label === 'Revenue') {
                newValue = finance.monthly?.revenue;
                shouldAddAccent = true;
            } else if (label === 'Profit') {
                newValue = finance.monthly?.profit;
                shouldAddAccent = true;
            } else if (label === 'Expense') {
                newValue = finance.monthly?.expense;
            } else if (label === 'Spending') {
                newValue = finance.monthly?.spending;
            } else if (label === 'Investment') {
                newValue = finance.constants?.investment;
                shouldAddAccent = true;
            } else if (label === 'Passive Yield') {
                const passiveYieldAmount = finance.constants?.passive_yield;
                const investment = finance.constants?.investment || 0;
                if (passiveYieldAmount == null && investment === 0) return; // leave "—"
                const amount = Number(passiveYieldAmount) || 0;
                let percentage = finance.constants?.passive_yield_percentage ?? 0;
                if (investment > 0 && amount > 0) percentage = (amount / investment) * 100;
                valueEl.textContent = `${formatCurrency(amount)} (${percentage.toFixed(1)}%)`;
                return;
            } else if (label === 'Asset') {
                newValue = finance.constants?.asset;
                shouldAddAccent = true;
            } else if (label === 'Total Net') {
                newValue = finance.constants?.total_net;
                shouldAddAccent = true;
            }
            
            // Only update when we have a value; if API returns nothing, keep existing display so it doesn't revert to $0
            if (newValue !== null && newValue !== undefined && !isNaN(Number(newValue))) {
                const formatted = formatCurrency(newValue);
                valueEl.textContent = formatted;
            }
            // else: leave valueEl.textContent as is (don't overwrite with $0)
            
            // Update accent class
            if (shouldAddAccent) {
                valueEl.classList.add('accent');
            } else {
                valueEl.classList.remove('accent');
            }
        });
        
        // Explicitly ensure Total Net is displayed (use API value or compute from investment + asset)
        const totalNetEl = document.getElementById('totalNetValue');
        if (totalNetEl) {
            let totalNet = finance.constants?.total_net;
            if (totalNet == null || isNaN(Number(totalNet))) {
                const inv = Number(finance.constants?.investment) || 0;
                const ast = Number(finance.constants?.asset) || 0;
                totalNet = inv + ast;
            } else {
                totalNet = Number(totalNet);
            }
            totalNetEl.textContent = formatCurrency(totalNet);
            totalNetEl.classList.add('accent');
        }
        }
        
        console.log('✅ Finance display updated');
        console.log('Final finance values:', {
            revenue: finance.monthly?.revenue,
            profit: finance.monthly?.profit,
            expense: finance.monthly?.expense,
            spending: finance.monthly?.spending,
            total_net: finance.constants?.total_net
        });
        
        // Update finance month
        const financeMonthEl = document.getElementById('financeMonth');
        if (financeMonthEl) {
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                              'July', 'August', 'September', 'October', 'November', 'December'];
            financeMonthEl.textContent = monthNames[new Date().getMonth()];
        }
    } catch (e) { console.warn('Finance display failed', e); }

    // --- Scheduled posts ---
    try {
        const postsResponse = await fetch('/api/social/scheduled-posts?limit=3');
        const posts = await postsResponse.json();
        
        const scheduledPostsContainer = document.getElementById('scheduledPostsContainer');
        if (scheduledPostsContainer && posts.length > 0) {
            scheduledPostsContainer.innerHTML = posts.map(post => `
                <div class="social-post">
                    ${post.center_post}
                    <div class="social-post-meta">${Array.isArray(post.platforms) ? post.platforms.join(' + ') : post.platforms} • ${post.date_display}</div>
                </div>
            `).join('');
        }
    } catch (e) { console.warn('Scheduled posts failed', e); }

    // --- Social followers: one API → fill each platform card, total = sum ---
    try {
        const metricsRes = await fetch('/api/social/metrics');
        const list = await metricsRes.json();
        if (Array.isArray(list)) {
            const fmt = (v) => (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(v));
            let total = 0;
            list.forEach((m) => {
                const v = Number(m.value) || 0;
                total += v;
                const platform = (m.platform || '').toLowerCase();
                const el = document.querySelector('#panel-dashboard .social-platform-metric[data-platform="' + platform + '"]');
                if (el) el.textContent = fmt(v);
            });
            socialFollowersTotal = total;
            const totalEl = document.getElementById('socialFollowersValue');
            if (totalEl) totalEl.textContent = fmt(total);
        }
    } catch (e) { console.warn('Social metrics failed', e); }
    // Fallback so Cathy K card can still show total (e.g. 20.6K) if social API failed
    if (socialFollowersTotal === 0) {
        const totalEl = document.getElementById('socialFollowersValue');
        if (totalEl && totalEl.textContent) {
            const t = String(totalEl.textContent).replace(/\s/g, '').toLowerCase();
            const n = parseFloat(t);
            if (!isNaN(n)) socialFollowersTotal = t.includes('k') ? Math.round(n * 1000) : Math.round(n);
        }
        if (socialFollowersTotal === 0) socialFollowersTotal = 20600;
    }

    // --- Social overview: Posts, Impressions, Clicks ---
    try {
        const overviewRes = await fetch('/api/social/overview');
        const overview = await overviewRes.json();
        if (overview) {
            const fmt = (v) => (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(v));
            const socialMetrics = document.querySelectorAll('#panel-dashboard .social-metric');
            if (socialMetrics.length >= 4) {
                if (overview.posts != null) socialMetrics[1].querySelector('.social-metric-value').textContent = overview.posts.toString();
                if (overview.impressions != null) socialMetrics[2].querySelector('.social-metric-value').textContent = fmt(overview.impressions);
                if (overview.clicks != null) socialMetrics[3].querySelector('.social-metric-value').textContent = fmt(overview.clicks);
            }
        }
    } catch (e) { console.warn('Social overview failed', e); }

    // --- Project cards (dashboard): same structure as Projections, data from /api/projects ---
    try {
            const projectsResponse = await fetch('/api/projects');
            const data = await projectsResponse.json();
            const projects = Array.isArray(data) ? data : [];

            // Same card structure as Projections tab: now → target, label, mini-chart, footer (effort + growth)
            const gridEl = document.getElementById('dashboardProjectsGrid');
            if (!gridEl) {
                console.warn('Dashboard projects grid not found');
                return;
            }
            const typeMap = { 'Soulin Social': 'SAAS', 'KINS': 'BUSINESS', 'Cathy K': 'CHANNEL', 'Soulin Agency': 'FREELANCE', 'Soulful Academy': 'FREELANCE' };
            const kpiByProject = { 'Cathy K': { key: 'subscribers', label: 'Subscribers' }, 'KINS': { key: 'sales', label: 'Sales' }, 'Soulin Social': { key: 'paid_members', label: 'Paid member' }, 'Soulin Agency': { key: 'revenue', label: 'Revenue' }, 'Soulful Academy': { key: 'revenue', label: 'Revenue' } };
            const nameAlias = { 'Soulful Academy': 'Soulin Agency' };

            if (projects.length === 0) {
                console.warn('No projects returned from API');
            }

            projects.forEach((project) => {
                const cardName = nameAlias[project.name] || project.name;
                // Use cardName for typeMap lookup (handles Soulful Academy → Soulin Agency)
                const projectType = (typeMap[cardName] || typeMap[project.name] || 'project').toLowerCase();
                const card = gridEl.querySelector('.projection-card[data-project-type="' + projectType + '"]');
                if (!card) {
                    console.warn('Card not found for project:', project.name, 'cardName:', cardName, 'type:', projectType, 'available types:', Array.from(gridEl.querySelectorAll('.projection-card')).map(c => c.getAttribute('data-project-type')));
                    return;
                }

                if (project.id != null) card.setAttribute('data-project-id', project.id);

                let metrics = project.metrics || {};
                if (typeof metrics === 'string') {
                    try {
                        metrics = JSON.parse(metrics);
                    } catch (e) {
                        console.warn('Failed to parse metrics for', project.name, e);
                        metrics = {};
                    }
                }
                const current = metrics.current != null ? metrics.current : metrics;
                const lastMonth = metrics.last_month != null ? metrics.last_month : null;
                const typeLabel = typeMap[cardName] || typeMap[project.name] || 'PROJECT';
                const kpi = kpiByProject[cardName] || kpiByProject[project.name];
                const primaryKey = kpi ? kpi.key : pickPrimaryMetricKey(current, lastMonth, typeLabel.toLowerCase());
                const getVal = (obj) => {
                    if (!obj || !primaryKey) return null;
                    if (primaryKey === 'paid_members') return obj.paid_members != null ? obj.paid_members : obj.paid_member;
                    return obj[primaryKey];
                };
                let lastVal = getVal(lastMonth);
                let thisVal = getVal(current);
                // Cathy K (channel): show total social followers as current on the card (same as top of dashboard)
                if ((project.name === 'Cathy K' || cardName === 'Cathy K') && (primaryKey === 'subscribers' || primaryKey === 'followers') && socialFollowersTotal > 0) {
                    thisVal = socialFollowersTotal;
                }

                const currentEl = card.querySelector('.projection-metric-current');
                const lastEl = card.querySelector('.projection-metric-last');
                const labelEl = card.querySelector('.projection-metric-label');
                const growthEl = card.querySelector('.projection-growth');
                const updatedEl = card.querySelector('.projection-card-updated');

                if (currentEl) {
                    currentEl.textContent = thisVal != null ? formatMetricValue(primaryKey, thisVal) : '—';
                    currentEl.classList.toggle('has-value', thisVal != null);
                }
                if (lastEl) lastEl.textContent = lastVal != null ? formatMetricValue(primaryKey, lastVal) : '—';
                if (labelEl) labelEl.textContent = kpi ? kpi.label : '—';

                let growthPct = null;
                if (lastVal != null && thisVal != null && typeof lastVal === 'number' && typeof thisVal === 'number') {
                    growthPct = lastVal !== 0 ? Math.round(((thisVal - lastVal) / lastVal) * 100) : (thisVal !== 0 ? 100 : 0);
                }
                if (growthEl) {
                    growthEl.textContent = growthPct != null ? (growthPct > 0 ? '+' + growthPct + '%' : growthPct + '%') : '—';
                    growthEl.classList.toggle('negative', growthPct != null && growthPct < 0);
                }

                const mini = card.querySelector('.projection-mini-chart polyline');
                if (mini) {
                    const y0 = lastVal != null && thisVal != null ? (lastVal <= thisVal ? 28 : 8) : 18;
                    const y1 = lastVal != null && thisVal != null ? (lastVal <= thisVal ? 8 : 28) : 18;
                    mini.setAttribute('points', '0,' + y0 + ' 100,' + y1);
                }

                if (updatedEl && project.last_updated) {
                    const date = new Date(project.last_updated);
                    updatedEl.textContent = 'Updated: ' + date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                }
            });
    } catch (err) {
        console.warn('Dashboard project cards failed', err);
    }

    // --- Upcoming ---
    try {
            const upcomingResponse = await fetch('/api/upcoming');
            const upcoming = await upcomingResponse.json();
            
            const upcomingContainer = document.getElementById('upcomingContainer');
            if (upcomingContainer && upcoming.length > 0) {
                upcomingContainer.innerHTML = upcoming.slice(0, 3).map(item => {
                    const dueDate = new Date(item.due_date);
                    const now = new Date();
                    const diffDays = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
                    
                    let dateDisplay = '';
                    if (diffDays === 0) {
                        dateDisplay = `Today ${dueDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
                    } else if (diffDays === 1) {
                        dateDisplay = `Tomorrow ${dueDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
                    } else {
                        dateDisplay = `${dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} • ${diffDays} days`;
                    }
                    
                    return `
                        <div class="email-item">
                            <div class="email-subject">${item.title}</div>
                            <div class="email-from">${dateDisplay}${item.description ? ` • ${item.description}` : ''}</div>
                        </div>
                    `;
                }).join('');
            }
    } catch (e) {
        console.warn('Upcoming failed', e);
    }
}

// Expose for refresh button (before any code that might throw)
window.loadDashboardData = loadDashboardData;

function formatNumber(num) {
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'k';
    }
    return num.toString();
}

function pickPrimaryMetricKey(current, lastMonth, projectType) {
    const obj = current || lastMonth || {};
    const keys = Object.keys(obj).filter(k => k !== 'current' && k !== 'last_month' && obj[k] != null);
    if (!keys.length) return null;
    if (projectType === 'channel') {
        if (keys.includes('subscribers')) return 'subscribers';
        if (keys.includes('followers')) return 'followers';
        if (keys.includes('api_calls')) return 'api_calls';
    }
    if (projectType === 'business') {
        if (keys.includes('sales')) return 'sales';
        if (keys.includes('subscribers')) return 'subscribers';
        if (keys.includes('mrr')) return 'mrr';
    }
    if (projectType === 'saas') {
        if (keys.includes('paid_members')) return 'paid_members';
        if (keys.includes('paid_member')) return 'paid_member';
        if (keys.includes('mrr')) return 'mrr';
        if (keys.includes('users')) return 'users';
    }
    if (projectType === 'freelance') {
        if (keys.includes('revenue')) return 'revenue';
        if (keys.includes('reach')) return 'reach';
    }
    if (keys.includes('sales')) return 'sales';
    if (keys.includes('paid_members')) return 'paid_members';
    if (keys.includes('paid_member')) return 'paid_member';
    if (keys.includes('mrr')) return 'mrr';
    if (keys.includes('subscribers')) return 'subscribers';
    if (keys.includes('followers')) return 'followers';
    if (keys.includes('users')) return 'users';
    if (keys.includes('revenue')) return 'revenue';
    return keys[0] || null;
}

function formatMetricLabel(key, projectType) {
    if (projectType === 'channel' && key === 'followers') return 'Subscribers';
    const labels = { mrr: 'MRR', users: 'Users', revenue: 'Revenue', subscribers: 'Subscribers', reach: 'Reach', api_calls: 'API Calls', followers: 'Followers', sales: 'Sales', paid_members: 'Paid member', paid_member: 'Paid member' };
    return labels[key] || (key && key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ')) || '—';
}

function formatMetricValue(key, value) {
    if (typeof value !== 'number') return String(value);
    if (key === 'mrr' || key === 'revenue' || key === 'sales') return '$' + (value >= 1000 ? (value / 1000).toFixed(1) + 'k' : value.toFixed(0));
    if (key === 'followers' || key === 'reach' || key === 'api_calls' || key === 'subscribers') return (value >= 1000 ? (value / 1000).toFixed(1) : value) + 'K';
    if (key === 'paid_members' || key === 'paid_member') return value >= 1000 ? (value / 1000).toFixed(1) + 'k' : value.toString();
    if (value >= 1000) return (value / 1000).toFixed(1) + 'k';
    return value.toString();
}

// Initialize health alert on page load
updateHealthAlert();

// Refresh GitHub contribution graph with daily cache-busting
function refreshGitHubGraph() {
    const graphImg = document.getElementById('githubContributionGraph');
    if (!graphImg) {
        console.warn('GitHub contribution graph image not found');
        return;
    }
    
    // Add timestamp-based cache-busting parameter for immediate refresh
    const baseUrl = 'https://ghchart.rshah.org/203EAE/soulincat';
    const timestamp = Date.now();
    graphImg.src = `${baseUrl}?t=${timestamp}`;
    
    console.log('🔄 Refreshed GitHub contribution graph with timestamp:', timestamp);
}

// Social numbers are set in HTML and not overwritten by JS (so they stay correct).
function updateSocialNumbers() { /* no-op: keep HTML values */ }

// Load all dashboard data on page load
// Wait a bit to ensure all elements are rendered
setTimeout(() => {
    console.log('Initializing dashboard...');
    refreshGitHubGraph();
    updateSocialNumbers();
    loadDashboardData();
}, 100);

// Make loadDashboardData available globally for refresh
window.loadDashboardData = loadDashboardData;
window.refreshGitHubGraph = refreshGitHubGraph;

// Refresh GitHub graph daily (at midnight) and on page load
function scheduleGitHubRefresh() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0); // Midnight
    
    const msUntilMidnight = tomorrow.getTime() - now.getTime();
    
    // Refresh at midnight
    setTimeout(() => {
        refreshGitHubGraph();
        // Then refresh every 24 hours
        setInterval(refreshGitHubGraph, 24 * 60 * 60 * 1000);
    }, msUntilMidnight);
}

scheduleGitHubRefresh();

// Refresh data every 5 minutes
setInterval(loadDashboardData, 5 * 60 * 1000);

// AI Notepad submission - Connect to Claude
const sendMessage = async function() {
    const textarea = document.querySelector('.ai-notepad-input');
    const button = document.querySelector('.ai-notepad-btn');
    const text = textarea.value.trim();
    
    if (!text) return;
    
    // Visual feedback
    button.disabled = true;
    
    try {
        // Send to Claude API via backend
        const response = await fetch('/api/agent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message: text })
        });
        
        const data = await response.json();
        
        if (response.ok && data.response) {
            // Success - clear input
            textarea.value = '';
            
            // Optional: Display response somewhere or log it
            console.log('Claude response:', data.response);
        } else {
            throw new Error(data.error || 'Failed to get response');
        }
    } catch (error) {
        console.error('Error sending to Claude:', error);
    } finally {
        button.disabled = false;
        textarea.focus();
    }
};

// Button click
document.querySelector('.ai-notepad-btn').addEventListener('click', sendMessage);

// Enter key (but allow Shift+Enter for new line)
document.querySelector('.ai-notepad-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Dashboard project card: open full-screen revenue projections modal
let projectionsChartInstance = null;

function buildProjectionsSeries(projections, monthsTotal, growthPct) {
    const g = growthPct / 100;
    const out = { labels: [], datasets: [] };
    const colors = {
        worst: { A: 'rgba(220, 38, 38, 0.8)', B: 'rgba(234, 88, 12, 0.8)', C: 'rgba(202, 138, 4, 0.8)' },
        base:  { A: 'rgba(32, 62, 174, 0.8)', B: 'rgba(59, 130, 246, 0.8)', C: 'rgba(99, 102, 241, 0.8)' },
        best:  { A: 'rgba(16, 185, 129, 0.8)', B: 'rgba(34, 197, 94, 0.8)', C: 'rgba(52, 211, 153, 0.8)' }
    };
    for (let m = 0; m <= monthsTotal; m++) out.labels.push(m === 0 ? '0' : m + 'mo');

    projections.forEach((sc, idx) => {
        const key = sc.key || ['A', 'B', 'C'][idx] || '?';
        const worst3 = sc.worst_3mo || 0, worst6 = sc.worst_6mo || 0;
        const base3 = sc.baseline_3mo || 0, base6 = sc.baseline_6mo || 0;
        const best3 = sc.best_3mo || 0, best6 = sc.best_6mo || 0;

        function valueAt(month, v3, v6) {
            if (month <= 0) return 0;
            if (month <= 3) return (v3 / 3) * month;
            if (month <= 6) return v3 + ((v6 - v3) / 3) * (month - 3);
            const monthlyRate = (v6 - v3) / 3;
            const rateAfter6 = monthlyRate * (1 + g);
            return v6 + rateAfter6 * (month - 6);
        }

        ['worst', 'base', 'best'].forEach((variant, vi) => {
            const v3 = variant === 'worst' ? worst3 : variant === 'base' ? base3 : best3;
            const v6 = variant === 'worst' ? worst6 : variant === 'base' ? base6 : best6;
            const data = [];
            for (let m = 0; m <= monthsTotal; m++) {
                data.push(Math.round(valueAt(m, v3, v6)));
            }
            out.datasets.push({
                label: key + ' ' + (variant === 'worst' ? 'Worst' : variant === 'base' ? 'Base' : 'Best'),
                data,
                borderColor: colors[variant][key] || colors[variant].A,
                backgroundColor: (colors[variant][key] || colors[variant].A).replace('0.8', '0.1'),
                tension: 0.3,
                fill: false
            });
        });
    });

    return out;
}

function valueAtMonth(month, v3, v6, growthPct) {
    const g = growthPct / 100;
    if (month <= 0) return 0;
    if (month <= 3) return (v3 / 3) * month;
    if (month <= 6) return v3 + ((v6 - v3) / 3) * (month - 3);
    const monthlyRate = (v6 - v3) / 3;
    return v6 + monthlyRate * (1 + g) * (month - 6);
}

function renderProjectionsSummary(projections, monthsTotal, growthPct) {
    const wrap = document.getElementById('projectionsSummaryWrap');
    const tbody = document.getElementById('projectionsSummaryBody');
    const head12 = document.getElementById('projectionsSummary12moHead');
    if (!wrap || !tbody) return;
    if (projections.length === 0) {
        wrap.style.display = 'none';
        return;
    }
    if (head12) head12.textContent = monthsTotal + 'mo base';
    const fmt = (n) => '$' + (Math.round(n)).toLocaleString();
    tbody.innerHTML = projections.map(sc => {
        const budget = sc.budget_cap_usd != null ? '$' + Math.round(sc.budget_cap_usd).toLocaleString() : '—';
        const time = sc.time_available_hrs_per_week != null ? sc.time_available_hrs_per_week + 'h/wk' : '—';
        const budgetTime = budget + ' · ' + time;
        const r3 = sc.worst_3mo != null && sc.baseline_3mo != null && sc.best_3mo != null
            ? fmt(sc.worst_3mo) + ' / ' + fmt(sc.baseline_3mo) + ' / ' + fmt(sc.best_3mo) : '—';
        const r6 = sc.worst_6mo != null && sc.baseline_6mo != null && sc.best_6mo != null
            ? fmt(sc.worst_6mo) + ' / ' + fmt(sc.baseline_6mo) + ' / ' + fmt(sc.best_6mo) : '—';
        const atHorizon = monthsTotal > 0
            ? fmt(valueAtMonth(monthsTotal, sc.baseline_3mo || 0, sc.baseline_6mo || 0, growthPct)) : '—';
        return '<tr><td><strong>' + (sc.key || '') + '</strong> ' + (sc.name || '') + '</td><td>' + budgetTime + '</td><td>' + r3 + '</td><td>' + r6 + '</td><td>' + atHorizon + '</td></tr>';
    }).join('');
    wrap.style.display = 'block';
}

function renderProjectionsChart(projections, monthsTotal, growthPct) {
    const canvas = document.getElementById('projectionsChart');
    if (!canvas || !window.Chart) return;
    if (projectionsChartInstance) {
        projectionsChartInstance.destroy();
        projectionsChartInstance = null;
    }
    const { labels, datasets } = buildProjectionsSeries(projections, monthsTotal, growthPct);
    const ctx = canvas.getContext('2d');
    projectionsChartInstance = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: true, position: 'top' },
                tooltip: { callbacks: { label: (ctx) => ctx.dataset.label + ': $' + ctx.raw.toLocaleString() } }
            },
            scales: {
                x: { title: { display: true, text: 'Month' }, ticks: { maxRotation: 0 } },
                y: { beginAtZero: true, title: { display: true, text: 'Cumulative revenue ($)' } }
            }
        }
    });
}

let currentProjectModalId = null;
let currentProjectModalData = { project: null, analysis: null };

async function openProjectModal(projectId) {
    const modal = document.getElementById('projectModal');
    if (!modal || !projectId) return;
    currentProjectModalId = projectId;
    modal.setAttribute('data-project-id', projectId);
    try {
        const projectRes = await fetch('/api/projects/' + projectId);
        if (!projectRes.ok) {
            if (typeof showToast === 'function') showToast('Could not load project', 'error');
            return;
        }
        const project = await projectRes.json();
        currentProjectModalData = { project, analysis: null };
        
        // Populate form
        document.getElementById('projectModalName').value = project.name || '';
        document.getElementById('pmDescription').value = project.description || '';
        document.getElementById('pmHoursWeek').value = project.hours_per_week || 10;
        document.getElementById('pmMonths').value = project.months_to_results || 6;
        
        const model = project.business_model || 'saas';
        document.querySelectorAll('input[name="pmModel"]').forEach(r => r.checked = r.value === model);
        
        // Dashboard metrics (same fixed KPI per project as cards)
        const kpiByProject = { 'Cathy K': { key: 'subscribers', label: 'Subscribers' }, 'KINS': { key: 'sales', label: 'Sales' }, 'Soulin Social': { key: 'paid_members', label: 'Paid member' }, 'Soulin Agency': { key: 'revenue', label: 'Revenue' } };
        const nameAlias = { 'Soulful Academy': 'Soulin Agency' };
        const cardName = nameAlias[project.name] || project.name;
        const kpi = kpiByProject[cardName] || kpiByProject[project.name];
        const metrics = project.metrics || {};
        const current = metrics.current != null ? metrics.current : metrics;
        const lastMonth = metrics.last_month != null ? metrics.last_month : null;
        const primaryKey = kpi ? kpi.key : pickPrimaryMetricKey(current, lastMonth, (project.name || '').toLowerCase());
        const getVal = (obj) => {
            if (!obj || !primaryKey) return null;
            if (primaryKey === 'paid_members') return obj.paid_members != null ? obj.paid_members : obj.paid_member;
            return obj[primaryKey];
        };
        modal.dataset.primaryMetricKey = primaryKey || '';
        const labelEl = document.getElementById('pmDashboardMetricLabel');
        const labelCopyEl = document.getElementById('pmDashboardMetricLabelCopy');
        const labelText = kpi ? kpi.label : (primaryKey ? formatMetricLabel(primaryKey, (project.name || '').toLowerCase()) : 'Metric');
        if (labelEl) labelEl.textContent = labelText;
        if (labelCopyEl) labelCopyEl.textContent = labelText;
        const lastMonthInput = document.getElementById('pmMetricLastMonth');
        const thisMonthInput = document.getElementById('pmMetricThisMonth');
        if (lastMonthInput) lastMonthInput.value = getVal(lastMonth) != null ? getVal(lastMonth) : '';
        if (thisMonthInput) thisMonthInput.value = getVal(current) != null ? getVal(current) : '';
        
        // Show saved analysis if any
        const numbersSection = document.getElementById('pmNumbersSection');
        if (project.ai_analysis) {
            try {
                const analysis = JSON.parse(project.ai_analysis);
                currentProjectModalData.analysis = analysis;
                displayAnalysis(analysis);
                if (numbersSection) numbersSection.style.display = 'block';
            } catch (e) {
                if (numbersSection) numbersSection.style.display = 'none';
            }
        } else {
            document.getElementById('pmAnalysisResult').innerHTML = `<p class="pm-analysis-placeholder">Describe your project above, then click "Analyze with AI" to get:<br>
                • Suggested pricing based on your market<br>
                • Realistic customer acquisition estimates<br>
                • Required budget breakdown (tools, marketing, etc.)<br>
                • Probability assessment<br>
                • Revenue projections with reasoning</p>`;
            if (numbersSection) numbersSection.style.display = 'none';
        }
        
        modal.style.display = 'flex';
        modal.setAttribute('aria-hidden', 'false');
    } catch (e) {
        console.error('openProjectModal error:', e);
        if (typeof showToast === 'function') showToast('Could not load project', 'error');
    }
}

function displayAnalysis(analysis) {
    // Display reasoning
    document.getElementById('pmAnalysisResult').innerHTML = `<div class="pm-ai-result">${analysis.reasoning || ''}</div>`;
    
    // Display numbers
    document.getElementById('pmSuggestedPrice').textContent = analysis.suggested_price || '—';
    document.getElementById('pmTargetCustomers').textContent = analysis.target_customers || '—';
    document.getElementById('pmBudgetNeeded').textContent = analysis.budget_needed || '—';
    document.getElementById('pmProbability').textContent = analysis.probability || '—';
    
    // Display forecasts
    document.getElementById('pmForecastWorst').textContent = '$' + (analysis.revenue_worst || 0) + '/mo';
    document.getElementById('pmForecastBase').textContent = '$' + (analysis.revenue_base || 0) + '/mo';
    document.getElementById('pmForecastBest').textContent = '$' + (analysis.revenue_best || 0) + '/mo';
    
    // Show numbers section
    document.getElementById('pmNumbersSection').style.display = 'block';
    
    // Render chart
    currentProjectModalData.analysis = analysis;
    renderProjectionsChart();
}

function renderProjectionsChart() {
    const analysis = currentProjectModalData.analysis;
    if (!analysis) return;
    
    const canvas = document.getElementById('projectionsChart');
    if (!canvas) return;
    
    if (projectionsChartInstance) {
        projectionsChartInstance.destroy();
        projectionsChartInstance = null;
    }
    
    const months = parseInt(document.getElementById('pmMonths')?.value, 10) || 6;
    const labels = Array.from({ length: months }, (_, i) => 'M' + (i + 1));
    
    const worst = analysis.revenue_worst || 0;
    const base = analysis.revenue_base || 0;
    const best = analysis.revenue_best || 0;
    
    // Cumulative revenue over months (with ramp-up: first 2 months slower)
    const worstData = labels.map((_, i) => {
        const ramp = i < 2 ? 0.3 + (i * 0.35) : 1;
        return Math.round(worst * ramp * (i + 1));
    });
    const baseData = labels.map((_, i) => {
        const ramp = i < 2 ? 0.3 + (i * 0.35) : 1;
        return Math.round(base * ramp * (i + 1));
    });
    const bestData = labels.map((_, i) => {
        const ramp = i < 2 ? 0.3 + (i * 0.35) : 1;
        return Math.round(best * ramp * (i + 1));
    });
    
    const ctx = canvas.getContext('2d');
    projectionsChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'Worst', data: worstData, borderColor: '#e74c3c', backgroundColor: 'rgba(231,76,60,0.1)', fill: false, tension: 0.3 },
                { label: 'Realistic', data: baseData, borderColor: '#3498db', backgroundColor: 'rgba(52,152,219,0.1)', fill: false, tension: 0.3, borderWidth: 3 },
                { label: 'Best', data: bestData, borderColor: '#27ae60', backgroundColor: 'rgba(39,174,96,0.1)', fill: false, tension: 0.3 }
            ]
        },
        options: {
            responsive: true,
            plugins: { legend: { position: 'bottom' } },
            scales: {
                y: { beginAtZero: true, title: { display: true, text: 'Cumulative Revenue ($)' } }
            }
        }
    });
}

function closeProjectModal() {
    const modal = document.getElementById('projectModal');
    if (!modal) return;
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    currentProjectModalId = null;
    currentProjectModalData = { project: null, analysis: null };
    if (projectionsChartInstance) {
        projectionsChartInstance.destroy();
        projectionsChartInstance = null;
    }
}

document.getElementById('panel-dashboard')?.addEventListener('click', function(e) {
    const card = e.target.closest('.project-card');
    if (!card) return;
    e.preventDefault();
    let projectId = card.getAttribute('data-project-id');
    if (!projectId) {
        const nameEl = card.querySelector('.projection-card-name') || card.querySelector('.project-card-name');
        const name = nameEl ? nameEl.textContent.trim() : '';
        if (name) {
            fetch('/api/projects').then(r => r.json()).then(projects => {
                const list = Array.isArray(projects) ? projects : [];
                const p = list.find(pr => pr && (pr.name || '').trim() === name);
                if (p && p.id != null) {
                    card.setAttribute('data-project-id', String(p.id));
                    openProjectModal(p.id);
                } else {
                    if (typeof showToast === 'function') showToast('Could not load project', 'error');
                }
            }).catch(() => { if (typeof showToast === 'function') showToast('Could not load project', 'error'); });
            return;
        }
    }
    if (projectId) openProjectModal(projectId);
});

document.getElementById('projectModalClose')?.addEventListener('click', closeProjectModal);
document.querySelector('#projectModal .projections-modal-backdrop')?.addEventListener('click', closeProjectModal);
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const modal = document.getElementById('projectModal');
        if (modal && modal.style.display === 'flex') closeProjectModal();
    }
});

document.getElementById('projectModalSave')?.addEventListener('click', async function() {
    const projectId = currentProjectModalId;
    if (!projectId) return;
    const analysis = currentProjectModalData.analysis;
    const project = currentProjectModalData.project;
    const body = {
        name: document.getElementById('projectModalName')?.value?.trim() || undefined,
        description: document.getElementById('pmDescription')?.value?.trim() || null,
        hours_per_week: Number(document.getElementById('pmHoursWeek')?.value) || 10,
        months_to_results: Number(document.getElementById('pmMonths')?.value) || 6,
        business_model: document.querySelector('input[name="pmModel"]:checked')?.value || 'saas',
        revenue_worst: analysis?.revenue_worst || null,
        revenue_base: analysis?.revenue_base || null,
        revenue_lucky: analysis?.revenue_best || null,
        ai_analysis: analysis ? JSON.stringify(analysis) : null
    };
    // Include dashboard metrics so project cards update
    const modal = document.getElementById('projectModal');
    const primaryKey = modal?.dataset?.primaryMetricKey;
    const lastMonthInput = document.getElementById('pmMetricLastMonth');
    const thisMonthInput = document.getElementById('pmMetricThisMonth');
    const lastMonthVal = lastMonthInput?.value !== '' && lastMonthInput?.value != null ? Number(lastMonthInput.value) : undefined;
    const thisMonthVal = thisMonthInput?.value !== '' && thisMonthInput?.value != null ? Number(thisMonthInput.value) : undefined;
    if (primaryKey && (lastMonthVal !== undefined || thisMonthVal !== undefined)) {
        const existing = project?.metrics || {};
        const existingCurrent = existing.current != null ? existing.current : existing;
        const existingLastMonth = existing.last_month != null ? existing.last_month : {};
        body.metrics = {
            current: { ...existingCurrent, ...(thisMonthVal !== undefined && { [primaryKey]: thisMonthVal }) },
            last_month: { ...existingLastMonth, ...(lastMonthVal !== undefined && { [primaryKey]: lastMonthVal }) }
        };
    }
    try {
        const res = await fetch('/api/projects/' + projectId, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (res.ok) {
            if (typeof showToast === 'function') showToast('Plan saved', 'success');
            loadDashboardData();
        } else throw new Error('Failed');
    } catch (err) {
        if (typeof showToast === 'function') showToast('Failed to save', 'error');
    }
});

document.getElementById('pmGenerateProjections')?.addEventListener('click', async function() {
    const projectId = currentProjectModalId;
    if (!projectId) return;
    
    const description = document.getElementById('pmDescription')?.value?.trim();
    if (!description || description.length < 20) {
        if (typeof showToast === 'function') showToast('Please describe your project in more detail', 'error');
        return;
    }
    
    const projectName = document.getElementById('projectModalName')?.value || 'This project';
    const hoursWeek = Number(document.getElementById('pmHoursWeek')?.value) || 10;
    const months = Number(document.getElementById('pmMonths')?.value) || 6;
    const model = document.querySelector('input[name="pmModel"]:checked')?.value || 'saas';
    
    this.disabled = true;
    this.textContent = 'Analyzing...';
    document.getElementById('pmAnalysisResult').innerHTML = '<p class="pm-analysis-loading">Analyzing your project, market, and creating realistic projections...</p>';
    document.getElementById('pmNumbersSection').style.display = 'none';
    
    try {
        const res = await fetch('/api/projects/' + projectId + '/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                project_name: projectName,
                description,
                hours_per_week: hoursWeek, 
                months_to_results: months, 
                business_model: model
            })
        });
        const data = await res.json();
        
        if (data.error) {
            document.getElementById('pmAnalysisResult').innerHTML = '<p class="pm-analysis-error">' + data.error + '</p>';
        } else {
            displayAnalysis(data);
            if (typeof showToast === 'function') showToast('Analysis complete', 'success');
        }
    } catch (err) {
        document.getElementById('pmAnalysisResult').innerHTML = '<p class="pm-analysis-error">Failed to analyze. Check if AI is configured.</p>';
    }
    
    this.disabled = false;
    this.textContent = 'Analyze with AI';
});

document.getElementById('pmMonths')?.addEventListener('change', renderProjectionsChart);

// Email clicks
document.querySelectorAll('.email-item').forEach(email => {
    email.addEventListener('click', function() {
        const subject = this.querySelector('.email-subject').textContent;
        console.log('Opening email:', subject);
    });
});

// Todo List functionality
let showAllCompleted = false;

async function loadTodos() {
    try {
        const url = showAllCompleted ? '/api/todos?showAll=true' : '/api/todos';
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('API ' + response.status);
        }
        const todos = await response.json();
        
        const todoList = document.querySelector('.todo-list');
        if (!todoList) return;
        
        // Separate undone and done todos
        const undoneTodos = todos.filter(t => !t.completed);
        const doneTodos = todos.filter(t => t.completed);
        
        // Build HTML: undone first, then done
        let html = '';
        
        // Undone todos
        undoneTodos.forEach(todo => {
            html += `
                <label class="todo-item">
                    <input type="checkbox" class="todo-checkbox" data-id="${todo.id}">
                    <span class="todo-text">${todo.text}</span>
                </label>
            `;
        });
        
        // Add expandable done section if there are done todos
        if (doneTodos.length > 0) {
            html += '<div class="todo-separator"></div>';
            html += `
                <div class="todo-done-header">
                    <button class="todo-expand-btn" id="expandDoneBtn" title="Show completed tasks">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>
                    <span class="todo-done-label">Done today (${doneTodos.length})</span>
                </div>
                <div class="todo-done-list" id="todoDoneList" style="display: none;">
            `;
            
            doneTodos.forEach(todo => {
                const archivedClass = todo.archived ? 'todo-item-archived' : '';
                html += `
                    <label class="todo-item todo-item-done ${archivedClass}">
                        <input type="checkbox" class="todo-checkbox" data-id="${todo.id}" checked>
                        <span class="todo-text">${todo.text}</span>
                        ${todo.archived ? '<span class="todo-archived-badge">archived</span>' : ''}
                    </label>
                `;
            });
            
            html += '</div>';
        }
        
        todoList.innerHTML = html;
        
        updateTodoCount();
        
        // Initialize expand button
        const expandBtn = document.getElementById('expandDoneBtn');
        if (expandBtn) {
            expandBtn.addEventListener('click', () => {
                const doneList = document.getElementById('todoDoneList');
                if (doneList) {
                    const isHidden = doneList.style.display === 'none';
                    doneList.style.display = isHidden ? 'block' : 'none';
                    expandBtn.classList.toggle('expanded', isHidden);
                }
            });
        }
        
        // Add event listeners for checkboxes
        document.querySelectorAll('.todo-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', async function() {
                const id = this.dataset.id;
                const completed = this.checked;
                
                try {
                    const response = await fetch(`/api/todos/${id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ completed })
                    });
                    
                    if (response.ok) {
                        // Reload todos to get updated order
                        await loadTodos();
                    }
                } catch (error) {
                    console.error('Error updating todo:', error);
                    // Revert checkbox on error
                    this.checked = !completed;
                }
            });
        });
    } catch (error) {
        console.error('Error loading todos:', error);
        const todoList = document.querySelector('.todo-list');
        if (todoList && typeof showToast === 'function') {
            showToast('Couldn\'t load todos. Use http://localhost:3001 and start the server (npm start).', 'error');
        }
    }
}

function updateTodoCount() {
    const checkboxes = document.querySelectorAll('.todo-checkbox');
    const checked = document.querySelectorAll('.todo-checkbox:checked').length;
    const undone = checkboxes.length - checked;
    const countEl = document.getElementById('todoCount');
    if (countEl) {
        // Show undone count / total count (excluding archived)
        countEl.textContent = `${undone}/${checkboxes.length}`;
    }
}

// Load todos when DOM is ready and on page load (so API data always replaces static HTML)
function initTodos() {
    const todoList = document.querySelector('.todo-list');
    if (todoList) loadTodos();
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTodos);
} else {
    initTodos();
}

// Make loadTodos available globally for refresh
window.loadTodos = loadTodos;

// Fallback: load data again when window is fully loaded (in case first run failed)
window.addEventListener('load', function() {
    if (typeof window.loadTodos === 'function') window.loadTodos();
    if (typeof window.loadDashboardData === 'function') window.loadDashboardData();
    if (typeof window.refreshGitHubGraph === 'function') window.refreshGitHubGraph();
});

// TODO: Replace dummy posts with API fetch when ready
// async function loadScheduledPosts() {
//     // Fetch from https://soulin-social-bot.vercel.app/api/posts
//     // Display centerPost title for next 2 scheduled posts
// }
