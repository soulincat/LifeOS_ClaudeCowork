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

// Load dashboard data
async function loadDashboardData() {
    try {
        console.log('🔄 Loading dashboard data...');
        console.log('Finance section exists:', !!document.getElementById('financeSection'));
        
        // Load health metrics
        const healthResponse = await fetch('/api/health');
        const health = await healthResponse.json();
        
        // Update health display
        const healthRows = document.querySelectorAll('.info-section .info-row');
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
        
        // Load finance data
        console.log('📊 Fetching finance data...');
        const financeResponse = await fetch('/api/finance');
        if (!financeResponse.ok) {
            console.error('❌ Failed to fetch finance data:', financeResponse.status);
            return;
        }
        const finance = await financeResponse.json();
        console.log('✅ Finance data received:', finance);
        
        // Update finance display
        const financeSection = document.getElementById('financeSection');
        if (!financeSection) {
            console.error('❌ Finance section not found!');
            return;
        }
        
        const financeRows = financeSection.querySelectorAll('.info-row');
        console.log(`📋 Found ${financeRows.length} finance rows`);
        
        if (financeRows.length === 0) {
            console.error('❌ No finance rows found! Check HTML structure.');
            return;
        }
        
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
                // Special handling for passive yield - show amount and percentage
                const passiveYieldAmount = finance.constants?.passive_yield || 2735;
                const investment = finance.constants?.investment || 0;
                
                // Calculate percentage: (passive_yield / investment) * 100
                let percentage = 0;
                if (investment > 0 && passiveYieldAmount > 0) {
                    percentage = (passiveYieldAmount / investment) * 100;
                } else if (finance.constants?.passive_yield_percentage) {
                    // Fallback to API-calculated percentage if available
                    percentage = finance.constants.passive_yield_percentage;
                }
                
                const formattedAmount = formatCurrency(passiveYieldAmount);
                const formattedPercent = percentage.toFixed(1);
                valueEl.textContent = `${formattedAmount} (${formattedPercent}%)`;
                console.log(`Passive Yield: ${passiveYieldAmount} / ${investment} = ${percentage.toFixed(1)}%`);
                // Don't add accent class for passive yield
                return; // Skip normal value update
            } else if (label === 'Asset') {
                newValue = finance.constants?.asset;
                shouldAddAccent = true;
            } else if (label === 'Total Net') {
                newValue = finance.constants?.total_net;
                shouldAddAccent = true;
            }
            
            // Always update the value (including 0)
            if (newValue !== null && newValue !== undefined) {
                const formatted = formatCurrency(newValue);
                const oldValue = valueEl.textContent;
                valueEl.textContent = formatted;
                if (oldValue !== formatted) {
                    console.log(`✅ Updated ${label}: "${oldValue}" → "${formatted}"`);
                }
            } else {
                // If no data, show $0
                const oldValue = valueEl.textContent;
                valueEl.textContent = '$0';
                if (oldValue !== '$0') {
                    console.log(`⚠️  No data for ${label}, showing $0 (was: "${oldValue}")`);
                }
            }
            
            // Update accent class
            if (shouldAddAccent) {
                valueEl.classList.add('accent');
            } else {
                valueEl.classList.remove('accent');
            }
        });
        
        console.log('✅ Finance display updated');
        console.log('Final finance values:', {
            revenue: finance.monthly?.revenue,
            profit: finance.monthly?.profit,
            expense: finance.monthly?.expense,
            spending: finance.monthly?.spending
        });
        
        // Update finance month
        const financeMonthEl = document.getElementById('financeMonth');
        if (financeMonthEl) {
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                              'July', 'August', 'September', 'October', 'November', 'December'];
            financeMonthEl.textContent = monthNames[new Date().getMonth()];
        }
        
        // Load scheduled posts
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
        
        // Load social metrics
        try {
            const socialResponse = await fetch('/api/social/metrics');
            const socialMetrics = await socialResponse.json();
            
            // Platform mapping
            const platformMap = {
                'email': 0,
                'linkedin': 1,
                'twitter': 2,
                'instagram': 3,
                'threads': 4,
                'substack': 5,
                'youtube': 6
            };
            
            // Update social platform cards
            socialMetrics.forEach(metric => {
                const index = platformMap[metric.platform.toLowerCase()];
                if (index !== undefined) {
                    const cards = document.querySelectorAll('.social-platform-card');
                    if (cards[index]) {
                        const metricEl = cards[index].querySelector('.social-platform-metric');
                        if (metricEl) {
                            metricEl.textContent = formatNumber(metric.value);
                        }
                    }
                }
            });
        } catch (error) {
            console.error('Error loading social metrics:', error);
        }
        
        // Load projects
        const projectsResponse = await fetch('/api/projects');
        const projects = await projectsResponse.json();
        
        // Update project cards - match by name, not index
        const cards = document.querySelectorAll('.project-card');
        const tagMap = {
            'Soulin Social': 'main',
            'KINS': 'pending',
            'Cathy K': 'influencer',
            'Soulful Academy': 'client'
        };
        
        projects.forEach((project) => {
            // Find card by matching project name
            const card = Array.from(cards).find(card => {
                const nameEl = card.querySelector('.project-card-name');
                return nameEl && nameEl.textContent.trim() === project.name;
            });
            
            if (card) {
                if (project.id != null) card.setAttribute('data-project-id', project.id);
                // Update last updated date
                if (project.last_updated) {
                    const updatedEl = card.querySelector('.project-card-updated');
                    if (updatedEl) {
                        const date = new Date(project.last_updated);
                        updatedEl.textContent = `Updated: ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
                    }
                }
                // Update tag based on project name
                const tagEl = card.querySelector('.project-card-tag');
                if (tagEl && tagMap[project.name]) {
                    tagEl.textContent = tagMap[project.name];
                }
            }
        });
        
        // Load upcoming items
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
        } catch (error) {
            console.error('Error loading upcoming items:', error);
        }
        
    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }
}

function formatNumber(num) {
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'k';
    }
    return num.toString();
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

// Load all dashboard data on page load
// Wait a bit to ensure all elements are rendered
setTimeout(() => {
    console.log('Initializing dashboard...');
    refreshGitHubGraph();
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
        const nameEl = card.querySelector('.project-card-name');
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

// Load todos on page load
loadTodos();

// Make loadTodos available globally for refresh
window.loadTodos = loadTodos;

// TODO: Replace dummy posts with API fetch when ready
// async function loadScheduledPosts() {
//     // Fetch from https://soulin-social-bot.vercel.app/api/posts
//     // Display centerPost title for next 2 scheduled posts
// }
