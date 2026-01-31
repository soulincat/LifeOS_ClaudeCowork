// Chart Management
let healthChart = null;
let financeChart = null;
let projectionChart = null;

// Projection data (hardcoded for now - will come from API later)
const projectionData = {
    months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    realistic: {
        followers: [16, 20, 25, 32, 40, 50, 62, 74, 85, 90, 95, 100], // in K
        saasBasic: [5, 8, 15, 25, 35, 50, 70, 95, 130, 170, 210, 260],
        saasAgency: [1, 2, 3, 5, 7, 10, 15, 20, 25, 35, 45, 60],
        saasMrr: [294, 490, 882, 1470, 2058, 4440, 6415, 8635, 11320, 15295, 19245, 24690],
        freelance: [1000, 1000, 2049, 2236, 2947, 3398, 4090, 4139, 5196, 5396, 6144, 7245]
    },
    best: {
        followers: [18, 24, 32, 42, 55, 70, 88, 105, 120, 130, 140, 150],
        saasBasic: [8, 15, 25, 40, 60, 85, 115, 155, 200, 260, 330, 400],
        saasAgency: [2, 4, 6, 10, 15, 22, 32, 45, 60, 80, 100, 120],
        saasMrr: [490, 980, 1715, 2940, 4410, 7546, 11095, 15680, 21000, 28920, 37170, 47880],
        freelance: [1500, 2000, 3000, 3500, 4500, 5500, 6500, 7000, 8000, 9000, 10000, 11000]
    },
    worst: {
        followers: [15, 17, 19, 22, 26, 30, 35, 40, 45, 48, 50, 52],
        saasBasic: [3, 5, 8, 12, 18, 25, 35, 48, 65, 85, 105, 130],
        saasAgency: [0, 1, 1, 2, 3, 5, 7, 10, 13, 18, 23, 30],
        saasMrr: [147, 294, 441, 686, 1029, 1470, 2107, 2940, 4067, 5607, 7203, 9310],
        freelance: [500, 500, 1000, 1000, 1500, 1500, 2000, 2000, 2500, 3000, 3500, 4000]
    }
};

// Initialize Chart Toggles
function initChartToggles() {
    const healthToggle = document.getElementById('healthChartToggle');
    const financeToggle = document.getElementById('financeChartToggle');
    const healthCanvas = document.getElementById('healthChart');
    const financeCanvas = document.getElementById('financeChart');
    
    healthToggle?.addEventListener('click', async () => {
        if (healthCanvas.style.display === 'none') {
            await loadHealthChart();
            healthCanvas.style.display = 'block';
            healthToggle.textContent = '✕';
        } else {
            healthCanvas.style.display = 'none';
            healthToggle.textContent = '📊';
        }
    });
    
    financeToggle?.addEventListener('click', async () => {
        if (financeCanvas.style.display === 'none') {
            await loadFinanceChart();
            financeCanvas.style.display = 'block';
            financeToggle.textContent = '✕';
        } else {
            financeCanvas.style.display = 'none';
            financeToggle.textContent = '📊';
        }
    });
}

// Load Health Chart
async function loadHealthChart() {
    try {
        const response = await fetch('/api/health/history?days=30');
        const data = await response.json();
        
        const canvas = document.getElementById('healthChart');
        if (!canvas || !window.Chart) return;
        
        const ctx = canvas.getContext('2d');
        
        // Destroy existing chart
        if (healthChart) {
            healthChart.destroy();
        }
        
        const dates = data.map(d => new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        const recovery = data.map(d => d.recovery || 0);
        const sleep = data.map(d => (d.sleep_hours || 0) * 10); // Scale for visibility
        
        healthChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates,
                datasets: [
                    {
                        label: 'Recovery %',
                        data: recovery,
                        borderColor: '#203EAE',
                        backgroundColor: 'rgba(32, 62, 174, 0.1)',
                        tension: 0.4,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Sleep (hours × 10)',
                        data: sleep,
                        borderColor: '#B8C9E5',
                        backgroundColor: 'rgba(184, 201, 229, 0.1)',
                        tension: 0.4,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        labels: {
                            font: { size: 10 },
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: { font: { size: 9 } }
                    },
                    y1: {
                        position: 'right',
                        beginAtZero: true,
                        max: 100,
                        ticks: { font: { size: 9 } }
                    },
                    x: {
                        ticks: { font: { size: 9 }, maxRotation: 45 }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error loading health chart:', error);
        showToast('Failed to load health chart', 'error');
    }
}

// Load Finance Chart
async function loadFinanceChart() {
    try {
        const response = await fetch('/api/finance/history?months=6');
        const data = await response.json();
        
        const canvas = document.getElementById('financeChart');
        if (!canvas || !window.Chart) return;
        
        const ctx = canvas.getContext('2d');
        
        // Destroy existing chart
        if (financeChart) {
            financeChart.destroy();
        }
        
        // Group by month and type
        const monthlyData = {};
        data.forEach(entry => {
            if (!monthlyData[entry.month]) {
                monthlyData[entry.month] = {};
            }
            monthlyData[entry.month][entry.type] = entry.total;
        });
        
        const months = Object.keys(monthlyData).sort();
        const revenue = months.map(m => monthlyData[m].revenue || 0);
        const profit = months.map(m => monthlyData[m].profit || 0);
        const expense = months.map(m => monthlyData[m].expense || 0);
        
        financeChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: months.map(m => {
                    const [year, month] = m.split('-');
                    return new Date(year, month - 1).toLocaleDateString('en-US', { month: 'short' });
                }),
                datasets: [
                    {
                        label: 'Revenue',
                        data: revenue,
                        backgroundColor: 'rgba(32, 62, 174, 0.6)',
                        borderColor: '#203EAE',
                        borderWidth: 1
                    },
                    {
                        label: 'Profit',
                        data: profit,
                        backgroundColor: 'rgba(16, 185, 129, 0.6)',
                        borderColor: '#10b981',
                        borderWidth: 1
                    },
                    {
                        label: 'Expense',
                        data: expense,
                        backgroundColor: 'rgba(220, 38, 38, 0.6)',
                        borderColor: '#dc2626',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        labels: {
                            font: { size: 10 },
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: function(context) {
                                return context.dataset.label + ': $' + context.parsed.y.toLocaleString();
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            font: { size: 9 },
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        }
                    },
                    x: {
                        ticks: { font: { size: 9 } }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error loading finance chart:', error);
        showToast('Failed to load finance chart', 'error');
    }
}

// Get selected timeframe (months) from dropdown
function getProjectionTimeframeMonths() {
    const sel = document.getElementById('projectionTimeframe');
    return sel ? Math.max(1, parseInt(sel.value, 10) || 12) : 12;
}

// Update projection cards DOM from projectionData for selected case and timeframe
function updateProjectionCards(caseType, numMonths) {
    const data = projectionData[caseType] || projectionData.realistic;
    const n = Math.min(numMonths, (data.followers && data.followers.length) || 12);
    const fmtK = (v) => (v >= 1000 ? (v / 1000).toFixed(1) + 'K' : String(v));
    const fmtDollar = (v) => (v >= 1000 ? '$' + (v / 1000).toFixed(1) + 'K' : '$' + v);

    const channelCard = document.querySelector('.projection-cards-grid .projection-card[data-project-type="channel"]');
    if (channelCard && data.followers) {
        const now = data.followers[0] != null ? data.followers[0] : 0;
        const target = data.followers[n - 1] != null ? data.followers[n - 1] : 0;
        const nowEl = channelCard.querySelector('.projection-metric-now');
        const targetEl = channelCard.querySelector('.projection-metric-target');
        const growthEl = channelCard.querySelector('.projection-growth');
        const fmtChannelK = (v) => (v >= 1000 ? (v / 1000).toFixed(1) + 'K' : String(v) + 'K');
        if (nowEl) nowEl.textContent = fmtChannelK(now);
        if (targetEl) targetEl.textContent = fmtChannelK(target);
        if (growthEl) growthEl.textContent = now ? '+' + Math.round(((target - now) / now) * 100) + '%' : '—';
        const mini = channelCard.querySelector('.projection-mini-chart polyline');
        if (mini && data.followers) {
            const arr = data.followers.slice(0, n);
            const max = Math.max(...arr, 1);
            const pts = arr.map((v, i) => [(i / (n - 1 || 1)) * 100, 30 - (v / max) * 28].join(',')).join(' ');
            mini.setAttribute('points', pts);
        }
    }

    const saasCard = document.querySelector('.projection-cards-grid .projection-card[data-project-type="saas"]');
    if (saasCard && data.saasMrr) {
        const now = data.saasMrr[0] != null ? data.saasMrr[0] : 0;
        const target = data.saasMrr[n - 1] != null ? data.saasMrr[n - 1] : 0;
        const nowEl = saasCard.querySelector('.projection-metric-now');
        const targetEl = saasCard.querySelector('.projection-metric-target');
        const growthEl = saasCard.querySelector('.projection-growth');
        if (nowEl) nowEl.textContent = fmtDollar(now);
        if (targetEl) targetEl.textContent = fmtDollar(target);
        if (growthEl) growthEl.textContent = now ? '+' + Math.round(((target - now) / now) * 100) + '%' : (data.saasBasic && data.saasAgency ? '$49/$199' : '—');
        const mini = saasCard.querySelector('.projection-mini-chart polyline');
        if (mini && data.saasMrr) {
            const arr = data.saasMrr.slice(0, n);
            const max = Math.max(...arr, 1);
            const pts = arr.map((v, i) => [(i / (n - 1 || 1)) * 100, 30 - (v / max) * 28].join(',')).join(' ');
            mini.setAttribute('points', pts);
        }
    }

    const freelanceCard = document.querySelector('.projection-cards-grid .projection-card[data-project-type="freelance"]');
    if (freelanceCard && data.freelance) {
        const now = data.freelance[0] != null ? data.freelance[0] : 0;
        const target = data.freelance[n - 1] != null ? data.freelance[n - 1] : 0;
        const nowEl = freelanceCard.querySelector('.projection-metric-now');
        const targetEl = freelanceCard.querySelector('.projection-metric-target');
        const growthEl = freelanceCard.querySelector('.projection-growth');
        if (nowEl) nowEl.textContent = fmtDollar(now);
        if (targetEl) targetEl.textContent = fmtDollar(target);
        if (growthEl) growthEl.textContent = now ? '+' + Math.round(((target - now) / now) * 100) + '%' : '—';
        const mini = freelanceCard.querySelector('.projection-mini-chart polyline');
        if (mini && data.freelance) {
            const arr = data.freelance.slice(0, n);
            const max = Math.max(...arr, 1);
            const pts = arr.map((v, i) => [(i / (n - 1 || 1)) * 100, 30 - (v / max) * 28].join(',')).join(' ');
            mini.setAttribute('points', pts);
        }
    }

    const totalCard = document.querySelector('.projection-cards-grid .projection-card[data-project-type="total"]');
    if (totalCard && data.saasMrr && data.freelance) {
        const now = (data.saasMrr[0] || 0) + (data.freelance[0] || 0);
        const target = (data.saasMrr[n - 1] || 0) + (data.freelance[n - 1] || 0);
        const nowEl = totalCard.querySelector('.projection-metric-now');
        const targetEl = totalCard.querySelector('.projection-metric-target');
        const growthEl = totalCard.querySelector('.projection-growth');
        const labelEl = totalCard.querySelector('.projection-metric-label');
        if (nowEl) nowEl.textContent = fmtDollar(now);
        if (targetEl) targetEl.textContent = fmtDollar(target);
        if (growthEl) growthEl.textContent = now ? '+' + Math.round(((target - now) / now) * 100) + '%' : '—';
        if (labelEl) labelEl.textContent = 'Monthly by Month ' + n;
        const mini = totalCard.querySelector('.projection-mini-chart polyline');
        if (mini) {
            const arr = Array.from({ length: n }, (_, i) => (data.saasMrr[i] || 0) + (data.freelance[i] || 0));
            const max = Math.max(...arr, 1);
            const pts = arr.map((v, i) => [(i / (n - 1 || 1)) * 100, 30 - (v / max) * 28].join(',')).join(' ');
            mini.setAttribute('points', pts);
        }
    }
}

// Update projection table body from projectionData
function updateProjectionTable(caseType, numMonths) {
    const data = projectionData[caseType] || projectionData.realistic;
    const tbody = document.querySelector('#projectionTable tbody');
    if (!tbody) return;
    const n = Math.min(numMonths, (data.followers && data.followers.length) || 12);
    const rows = [];
    for (let i = 0; i < n; i++) {
        const followers = (data.followers && data.followers[i] != null) ? data.followers[i] : 0;
        const saasBasic = (data.saasBasic && data.saasBasic[i] != null) ? data.saasBasic[i] : 0;
        const saasAgency = (data.saasAgency && data.saasAgency[i] != null) ? data.saasAgency[i] : 0;
        const saasMrr = (data.saasMrr && data.saasMrr[i] != null) ? data.saasMrr[i] : 0;
        const freelance = (data.freelance && data.freelance[i] != null) ? data.freelance[i] : 0;
        const total = saasMrr + freelance;
        rows.push(
            '<tr><td>' + (i + 1) + '</td><td>' + (followers >= 1000 ? (followers / 1000) + 'K' : followers) + '</td><td>' + saasBasic + '</td><td>' + saasAgency + '</td><td>$' + saasMrr.toLocaleString() + '</td><td>$' + freelance.toLocaleString() + '</td><td>$' + total.toLocaleString() + '</td></tr>'
        );
    }
    tbody.innerHTML = rows.join('');
}

// Update chart header title with month count
function updateProjectionChartTitle(numMonths) {
    const h3 = document.querySelector('.projection-chart-header h3');
    if (h3) h3.textContent = numMonths + '-Month Projection';
}

// Load Projection Chart (combined: stacked bars + lines)
function loadProjectionChart(caseType = 'realistic', numMonths) {
    if (numMonths == null) numMonths = getProjectionTimeframeMonths();
    const canvas = document.getElementById('projectionChart');
    if (!canvas || !window.Chart) return;
    
    const ctx = canvas.getContext('2d');
    
    // Destroy existing chart
    if (projectionChart) {
        projectionChart.destroy();
    }
    
    const data = projectionData[caseType] || projectionData.realistic;
    const allMonths = projectionData.months;
    const n = Math.min(numMonths, allMonths.length, (data.saasMrr && data.saasMrr.length) || 12);
    const months = allMonths.slice(0, n);
    
    const saasSlice = (data.saasMrr || []).slice(0, n);
    const freelanceSlice = (data.freelance || []).slice(0, n);
    const followersSlice = (data.followers || []).slice(0, n);
    const saasBasicSlice = (data.saasBasic || []).slice(0, n);
    const saasAgencySlice = (data.saasAgency || []).slice(0, n);
    
    // Calculate total revenue for each month
    const totalRevenue = months.map((_, i) => (saasSlice[i] || 0) + (freelanceSlice[i] || 0));
    
    projectionChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: months.map(m => `M${m}`),
            datasets: [
                // Stacked bars for revenue
                {
                    label: 'SaaS MRR',
                    data: saasSlice,
                    backgroundColor: 'rgba(32, 62, 174, 0.7)',
                    borderColor: '#203EAE',
                    borderWidth: 1,
                    stack: 'revenue',
                    yAxisID: 'y',
                    order: 2
                },
                {
                    label: 'Freelance',
                    data: freelanceSlice,
                    backgroundColor: 'rgba(245, 158, 11, 0.7)',
                    borderColor: '#f59e0b',
                    borderWidth: 1,
                    stack: 'revenue',
                    yAxisID: 'y',
                    order: 2
                },
                // Lines for counts
                {
                    label: 'Followers (K)',
                    data: followersSlice,
                    type: 'line',
                    borderColor: '#8b5cf6',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    tension: 0.3,
                    yAxisID: 'y1',
                    pointRadius: 3,
                    pointBackgroundColor: '#8b5cf6',
                    order: 1
                },
                {
                    label: 'SaaS Subs',
                    data: months.map((_, i) => (saasBasicSlice[i] || 0) + (saasAgencySlice[i] || 0)),
                    type: 'line',
                    borderColor: '#10b981',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    tension: 0.3,
                    yAxisID: 'y1',
                    pointRadius: 3,
                    pointBackgroundColor: '#10b981',
                    order: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: false // Using custom legend
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            const label = context.dataset.label || '';
                            const value = context.parsed.y;
                            if (label.includes('MRR') || label === 'Freelance') {
                                return `${label}: $${value.toLocaleString()}`;
                            } else if (label.includes('Followers')) {
                                return `${label}: ${value}K`;
                            }
                            return `${label}: ${value}`;
                        },
                        footer: function(tooltipItems) {
                            let totalRev = 0;
                            tooltipItems.forEach(item => {
                                if (item.dataset.stack === 'revenue') {
                                    totalRev += item.parsed.y;
                                }
                            });
                            return `Total Revenue: $${totalRev.toLocaleString()}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    type: 'linear',
                    position: 'left',
                    beginAtZero: true,
                    stacked: true,
                    title: {
                        display: true,
                        text: 'Revenue ($)',
                        font: { size: 10 }
                    },
                    ticks: {
                        font: { size: 9 },
                        callback: function(value) {
                            if (value >= 1000) {
                                return '$' + (value / 1000).toFixed(0) + 'K';
                            }
                            return '$' + value;
                        }
                    },
                    grid: {
                        color: 'rgba(0,0,0,0.05)'
                    }
                },
                y1: {
                    type: 'linear',
                    position: 'right',
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Followers / Subs',
                        font: { size: 10 }
                    },
                    ticks: {
                        font: { size: 9 }
                    },
                    grid: {
                        display: false
                    }
                },
                x: {
                    stacked: true,
                    ticks: { font: { size: 10 } },
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

// Load projection plan from API (keeps data intact and structural)
// Runway = remaining cash / monthly average expense (months)
async function updateProjectionsRunway() {
    const runwayEl = document.getElementById('spRunway');
    if (!runwayEl) return;
    try {
        const cashEl = document.getElementById('spCash');
        let cash = 0;
        if (cashEl) {
            const raw = (cashEl.textContent || '').replace(/\s/g, '').replace(/,/g, '');
            if (raw && raw !== '—') {
                const hasK = /k/i.test(raw);
                const num = parseFloat(raw.replace(/[$,Kk]/g, ''), 10);
                if (!isNaN(num)) cash = hasK ? num * 1000 : num;
            }
        }
        const res = await fetch('/api/finance/history?months=12');
        const history = await res.json();
        if (!Array.isArray(history) || history.length === 0) {
            runwayEl.textContent = cash > 0 ? '—' : '—';
            return;
        }
        const byMonth = {};
        history.forEach((item) => {
            if (item.type === 'expense' || item.type === 'spending') {
                const m = item.month;
                if (!byMonth[m]) byMonth[m] = 0;
                byMonth[m] += Number(item.total) || 0;
            }
        });
        const months = Object.keys(byMonth);
        const totalExpense = months.reduce((sum, m) => sum + byMonth[m], 0);
        const avgExpense = months.length > 0 ? totalExpense / months.length : 0;
        if (avgExpense <= 0) {
            runwayEl.textContent = cash > 0 ? '∞' : '—';
            return;
        }
        const monthsRunway = Math.floor(cash / avgExpense);
        runwayEl.textContent = monthsRunway + ' months';
    } catch (e) {
        console.warn('Runway calculation:', e);
        runwayEl.textContent = '—';
    }
}

async function loadProjectionsFromAPI() {
    try {
        const res = await fetch('/api/projections');
        const data = await res.json();
        if (!res.ok || !data.plan) return false;
        const { plan, streams, monthValues } = data;
        if (plan.starting_position && typeof plan.starting_position === 'object') {
            const sp = plan.starting_position;
            const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
            set('spCash', sp.cash != null ? '$' + (sp.cash >= 1000 ? (sp.cash / 1000) + 'K' : sp.cash) : '—');
            set('spNetWorth', sp.net_worth != null ? '$' + (sp.net_worth >= 1000 ? (sp.net_worth / 1000) + 'K' : sp.net_worth) : '—');
            set('spFollowers', sp.followers != null ? (sp.followers >= 1000 ? (sp.followers / 1000) + 'K' : sp.followers) : '—');
            set('spHours', sp.hours_per_week || '—');
        }
        if (streams && streams.length > 0 && monthValues && monthValues.length > 0) {
            const byStream = {};
            streams.forEach(s => { byStream[s.id] = s; });
            const byStreamCase = {};
            monthValues.forEach(m => {
                const key = m.stream_id + '_' + m.case_type + '_' + (m.metric_key || 'primary');
                if (!byStreamCase[key]) byStreamCase[key] = [];
                byStreamCase[key][m.month - 1] = Number(m.value);
            });
            const streamKeys = { channel: 'followers', saas: 'saasMrr', freelance: 'freelance', total: 'totalRevenue' };
            ['realistic', 'best', 'worst'].forEach(caseType => {
                const stream = streams.find(s => s.stream_type === 'channel');
                if (stream) {
                    const arr = byStreamCase[stream.id + '_' + caseType + '_primary'];
                    if (arr) projectionData[caseType].followers = arr.map((v, i) => v != null ? v : (projectionData[caseType].followers[i] || 0));
                }
                const saasStream = streams.find(s => s.stream_type === 'saas');
                if (saasStream) {
                    const arr = byStreamCase[saasStream.id + '_' + caseType + '_mrr'];
                    if (arr) projectionData[caseType].saasMrr = arr.map((v, i) => v != null ? v : (projectionData[caseType].saasMrr[i] || 0));
                }
                const freelanceStream = streams.find(s => s.stream_type === 'freelance');
                if (freelanceStream) {
                    const arr = byStreamCase[freelanceStream.id + '_' + caseType + '_primary'];
                    if (arr) projectionData[caseType].freelance = arr.map((v, i) => v != null ? v : (projectionData[caseType].freelance[i] || 0));
                }
            });
        }
        return true;
    } catch (e) {
        console.warn('Load projections from API:', e);
        return false;
    }
}

// Save current projection plan and month values to API (structural save for comparison later)
async function saveProjectionsToAPI() {
    try {
        const plan = {
            name: '12-Month Projection',
            months: 12,
            starting_position: {
                cash: 45000,
                net_worth: 250000,
                followers: 14000,
                hours_per_week: '15-20'
            },
            synergy_notes: null
        };
        const cashEl = document.getElementById('spCash'), netEl = document.getElementById('spNetWorth'), folEl = document.getElementById('spFollowers'), hrEl = document.getElementById('spHours');
        if (cashEl) { const t = cashEl.textContent.replace(/[$,K]/g, '').trim(); if (t && t !== '—') plan.starting_position.cash = t.includes('.') ? parseFloat(t) * 1000 : parseInt(t, 10); }
        if (netEl) { const t = netEl.textContent.replace(/[$,K]/g, '').trim(); if (t && t !== '—') plan.starting_position.net_worth = t.includes('.') ? parseFloat(t) * 1000 : parseInt(t, 10); }
        if (folEl) { const t = folEl.textContent.replace(/[K]/g, '').trim(); if (t && t !== '—') plan.starting_position.followers = t.includes('.') ? parseFloat(t) * 1000 : parseInt(t, 10); }
        if (hrEl && hrEl.textContent !== '—') plan.starting_position.hours_per_week = hrEl.textContent;

        const streams = [
            { key: 'channel', stream_type: 'channel', display_name: 'Cathy K', sort_order: 0, unit: 'count' },
            { key: 'saas', stream_type: 'saas', display_name: 'Soulin Social', sort_order: 1, unit: 'currency' },
            { key: 'freelance', stream_type: 'freelance', display_name: 'Design Services', sort_order: 2, unit: 'currency' },
            { key: 'total', stream_type: 'total', display_name: 'Combined Revenue', sort_order: 3, unit: 'currency' }
        ];
        const monthValues = [];
        const cases = ['realistic', 'best', 'worst'];
        const streamKeys = ['channel', 'saas', 'freelance', 'total'];
        const metricKeys = { channel: 'primary', saas: 'mrr', freelance: 'primary', total: 'primary' };
        const dataKeys = { channel: 'followers', saas: 'saasMrr', freelance: 'freelance', total: null };
        for (const streamKey of streamKeys) {
            const mk = metricKeys[streamKey];
            const dk = dataKeys[streamKey];
            for (const caseType of cases) {
                const arr = dk ? projectionData[caseType][dk] : projectionData[caseType].saasMrr.map((_, i) => projectionData[caseType].saasMrr[i] + projectionData[caseType].freelance[i]);
                for (let month = 1; month <= (arr.length || 12); month++) {
                    monthValues.push({ stream_key: streamKey, month, case_type: caseType, metric_key: mk, value: arr[month - 1] != null ? arr[month - 1] : 0 });
                }
            }
        }
        const res = await fetch('/api/projections', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan, streams, monthValues })
        });
        const out = await res.json();
        if (!res.ok) throw new Error(out.error || 'Save failed');
        if (typeof showToast === 'function') showToast('Projections saved', 'success');
        return true;
    } catch (e) {
        console.error('Save projections:', e);
        if (typeof showToast === 'function') showToast('Failed to save: ' + (e.message || 'Unknown'), 'error');
        return false;
    }
}

// Refresh all projection UI (cards, table, chart) for current case and timeframe
function refreshProjectionUI() {
    const caseType = document.getElementById('projectionCase')?.value || 'realistic';
    const numMonths = getProjectionTimeframeMonths();
    updateProjectionCards(caseType, numMonths);
    updateProjectionTable(caseType, numMonths);
    updateProjectionChartTitle(numMonths);
    loadProjectionChart(caseType, numMonths);
    requestAnimationFrame(() => {
        if (projectionChart) projectionChart.resize();
    });
}

// Initialize projection chart when Projections tab is shown
function initProjectionTab() {
    const caseSelect = document.getElementById('projectionCase');
    const timeframeSelect = document.getElementById('projectionTimeframe');
    const saveBtn = document.getElementById('projectionsSaveBtn');

    if (saveBtn && !saveBtn._projectionsBound) {
        saveBtn._projectionsBound = true;
        saveBtn.addEventListener('click', async () => {
            const ok = await saveProjectionsToAPI();
            if (ok) refreshProjectionUI();
        });
    }

    (async () => {
        await loadProjectionsFromAPI();
        await updateProjectionsRunway();
        requestAnimationFrame(() => refreshProjectionUI());
    })();

    if (caseSelect && !caseSelect._projectionsBound) {
        caseSelect._projectionsBound = true;
        caseSelect.addEventListener('change', () => refreshProjectionUI());
    }
    if (timeframeSelect && !timeframeSelect._projectionsBound) {
        timeframeSelect._projectionsBound = true;
        timeframeSelect.addEventListener('change', () => refreshProjectionUI());
    }
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initChartToggles();
    });
} else {
    initChartToggles();
}
