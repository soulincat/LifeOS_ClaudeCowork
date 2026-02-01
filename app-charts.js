// Chart Management
let healthChart = null;
let financeChart = null;
let projectionChart = null;

// Projection data: 12 months base (original working data). For 24-month view we extend on the fly.
const projectionData = {
    months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    realistic: {
        followers: [16, 20, 25, 32, 40, 50, 62, 74, 85, 90, 95, 100],
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

// Return array of length n from data (extend with last value if data is shorter than n)
function getProjectionSeries(arr, n) {
    if (!arr || !Array.isArray(arr)) return Array.from({ length: n }, () => 0);
    const len = arr.length;
    if (len >= n) return arr.slice(0, n);
    const last = len > 0 ? arr[len - 1] : 0;
    return arr.concat(Array.from({ length: n - len }, () => last));
}

// Update projection cards DOM from projectionData for selected case and timeframe
function updateProjectionCards(caseType, numMonths) {
    const data = projectionData[caseType] || projectionData.realistic;
    const n = Math.min(numMonths, 24);
    const fmtK = (v) => (v >= 1000 ? (v / 1000).toFixed(1) + 'K' : String(v));
    const fmtDollar = (v) => (v >= 1000 ? '$' + (v / 1000).toFixed(1) + 'K' : '$' + v);

    const followersArr = getProjectionSeries(data.followers, n);
    const channelCard = document.querySelector('.projection-cards-grid .projection-card[data-project-type="channel"]');
    if (channelCard) {
        const now = followersArr[0] != null ? followersArr[0] : 0;
        const target = followersArr[n - 1] != null ? followersArr[n - 1] : 0;
        const nowEl = channelCard.querySelector('.projection-metric-now');
        const targetEl = channelCard.querySelector('.projection-metric-target');
        const growthEl = channelCard.querySelector('.projection-growth');
        const fmtChannelK = (v) => (v >= 1000 ? (v / 1000).toFixed(1) + 'K' : String(v) + 'K');
        if (nowEl) nowEl.textContent = fmtChannelK(now);
        if (targetEl) targetEl.textContent = fmtChannelK(target);
        if (growthEl) growthEl.textContent = now ? '+' + Math.round(((target - now) / now) * 100) + '%' : '—';
        const mini = channelCard.querySelector('.projection-mini-chart polyline');
        if (mini) {
            const max = Math.max(...followersArr, 1);
            const pts = followersArr.map((v, i) => [(i / (n - 1 || 1)) * 100, 30 - (v / max) * 28].join(',')).join(' ');
            mini.setAttribute('points', pts);
        }
    }

    const saasMrrArr = getProjectionSeries(data.saasMrr, n);
    const saasCard = document.querySelector('.projection-cards-grid .projection-card[data-project-type="saas"]');
    if (saasCard) {
        const now = saasMrrArr[0] != null ? saasMrrArr[0] : 0;
        const target = saasMrrArr[n - 1] != null ? saasMrrArr[n - 1] : 0;
        const nowEl = saasCard.querySelector('.projection-metric-now');
        const targetEl = saasCard.querySelector('.projection-metric-target');
        const growthEl = saasCard.querySelector('.projection-growth');
        if (nowEl) nowEl.textContent = fmtDollar(now);
        if (targetEl) targetEl.textContent = fmtDollar(target);
        if (growthEl) growthEl.textContent = now ? '+' + Math.round(((target - now) / now) * 100) + '%' : (data.saasBasic && data.saasAgency ? '$49/$199' : '—');
        const mini = saasCard.querySelector('.projection-mini-chart polyline');
        if (mini) {
            const max = Math.max(...saasMrrArr, 1);
            const pts = saasMrrArr.map((v, i) => [(i / (n - 1 || 1)) * 100, 30 - (v / max) * 28].join(',')).join(' ');
            mini.setAttribute('points', pts);
        }
    }

    const freelanceArr = getProjectionSeries(data.freelance, n);
    const freelanceCard = document.querySelector('.projection-cards-grid .projection-card[data-project-type="freelance"]');
    if (freelanceCard) {
        const now = freelanceArr[0] != null ? freelanceArr[0] : 0;
        const target = freelanceArr[n - 1] != null ? freelanceArr[n - 1] : 0;
        const nowEl = freelanceCard.querySelector('.projection-metric-now');
        const targetEl = freelanceCard.querySelector('.projection-metric-target');
        const growthEl = freelanceCard.querySelector('.projection-growth');
        if (nowEl) nowEl.textContent = fmtDollar(now);
        if (targetEl) targetEl.textContent = fmtDollar(target);
        if (growthEl) growthEl.textContent = now ? '+' + Math.round(((target - now) / now) * 100) + '%' : '—';
        const mini = freelanceCard.querySelector('.projection-mini-chart polyline');
        if (mini) {
            const max = Math.max(...freelanceArr, 1);
            const pts = freelanceArr.map((v, i) => [(i / (n - 1 || 1)) * 100, 30 - (v / max) * 28].join(',')).join(' ');
            mini.setAttribute('points', pts);
        }
    }

    const totalCard = document.querySelector('.projection-cards-grid .projection-card[data-project-type="total"]');
    if (totalCard) {
        const now = (saasMrrArr[0] || 0) + (freelanceArr[0] || 0);
        const target = (saasMrrArr[n - 1] || 0) + (freelanceArr[n - 1] || 0);
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
            const totalArr = Array.from({ length: n }, (_, i) => (saasMrrArr[i] || 0) + (freelanceArr[i] || 0));
            const max = Math.max(...totalArr, 1);
            const pts = totalArr.map((v, i) => [(i / (n - 1 || 1)) * 100, 30 - (v / max) * 28].join(',')).join(' ');
            mini.setAttribute('points', pts);
        }
    }
}

// Update projection table body from projectionData
function updateProjectionTable(caseType, numMonths) {
    const data = projectionData[caseType] || projectionData.realistic;
    const tbody = document.querySelector('#projectionTable tbody');
    if (!tbody) return;
    const n = Math.min(numMonths, 24);
    const followersArr = getProjectionSeries(data.followers, n);
    const saasBasicArr = getProjectionSeries(data.saasBasic, n);
    const saasAgencyArr = getProjectionSeries(data.saasAgency, n);
    const saasMrrArr = getProjectionSeries(data.saasMrr, n);
    const freelanceArr = getProjectionSeries(data.freelance, n);
    const rows = [];
    for (let i = 0; i < n; i++) {
        const followers = followersArr[i] != null ? followersArr[i] : 0;
        const saasBasic = saasBasicArr[i] != null ? saasBasicArr[i] : 0;
        const saasAgency = saasAgencyArr[i] != null ? saasAgencyArr[i] : 0;
        const saasMrr = saasMrrArr[i] != null ? saasMrrArr[i] : 0;
        const freelance = freelanceArr[i] != null ? freelanceArr[i] : 0;
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
    const n = Math.min(numMonths, 24);
    const months = Array.from({ length: n }, (_, i) => i + 1);
    const saasSlice = getProjectionSeries(data.saasMrr, n);
    const freelanceSlice = getProjectionSeries(data.freelance, n);
    const followersSlice = getProjectionSeries(data.followers, n);
    const saasBasicSlice = getProjectionSeries(data.saasBasic, n);
    const saasAgencySlice = getProjectionSeries(data.saasAgency, n);
    
    // Calculate total revenue for each month
    const totalRevenue = months.map((_, i) => (saasSlice[i] || 0) + (freelanceSlice[i] || 0));
    
    // "Got a job" comparison: 3 months search (0), then €4000/mo after tax, 40h/week — separate red line
    const showGotAJob = document.getElementById('projectionShowGotAJob')?.checked === true;
    const jobScenarioMonths = 3; // search period from now
    const jobSalaryAfterTax = 4000; // EUR/month
    const gotAJobData = months.map((_, i) => (i + 1) <= jobScenarioMonths ? 0 : jobSalaryAfterTax);
    
    const datasets = [
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
    ];
    if (showGotAJob) {
        datasets.push({
            label: 'Got a job (€4k/mo)',
            data: gotAJobData,
            type: 'line',
            borderColor: '#dc2626',
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [6, 4],
            tension: 0.2,
            yAxisID: 'y',
            pointRadius: 4,
            pointBackgroundColor: '#dc2626',
            order: 0
        });
    }
    
    projectionChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: months.map(m => `M${m}`),
            datasets
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
                            if (label.includes('Got a job')) {
                                return `${label}: €${value.toLocaleString()}`;
                            }
                            if (label.includes('MRR') || label === 'Freelance') {
                                return `${label}: $${value.toLocaleString()}`;
                            }
                            if (label.includes('Followers')) {
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

// Runway = asset ÷ monthly burn. Uses calculator burn (€/month → USD) when available; else falls back to avg expense from finance history.
async function updateProjectionsRunway() {
    const runwayEl = document.getElementById('spRunway');
    if (!runwayEl) return;
    try {
        const cashEl = document.getElementById('spCash');
        let asset = 0;
        if (cashEl) {
            const raw = (cashEl.textContent || '').replace(/\s/g, '').replace(/,/g, '');
            if (raw && raw !== '—') {
                const hasK = /k/i.test(raw);
                const num = parseFloat(raw.replace(/[$,Kk]/g, ''), 10);
                if (!isNaN(num)) asset = hasK ? num * 1000 : num;
            }
        }
        const burnInput = document.getElementById('projectionCalcBurn');
        const burnEur = burnInput ? Math.max(0, parseFloat(burnInput.value) || 0) : 0;
        if (burnEur > 0) {
            const burnUsdPerMonth = burnEur * eurToUsd;
            const monthsRunway = Math.floor(asset / burnUsdPerMonth);
            runwayEl.textContent = monthsRunway + ' months';
            return;
        }
        const res = await fetch('/api/finance/history?months=12');
        const history = await res.json();
        if (!Array.isArray(history) || history.length === 0) {
            runwayEl.textContent = asset > 0 ? '—' : '—';
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
            runwayEl.textContent = asset > 0 ? '∞' : '—';
            return;
        }
        const monthsRunway = Math.floor(asset / avgExpense);
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
        // Only overwrite starting position when API has values (don't wipe DOM with '—')
        if (plan.starting_position && typeof plan.starting_position === 'object') {
            const sp = plan.starting_position;
            const setIf = (id, val) => { if (val != null && val !== '') { const el = document.getElementById(id); if (el) el.textContent = val; } };
            if (sp.cash != null) setIf('spCash', sp.cash >= 1000 ? '$' + (sp.cash / 1000) + 'K' : '$' + sp.cash);
            if (sp.net_worth != null) setIf('spNetWorth', sp.net_worth >= 1000 ? '$' + (sp.net_worth / 1000) + 'K' : '$' + sp.net_worth);
            if (sp.followers != null) setIf('spFollowers', sp.followers >= 1000 ? (sp.followers / 1000) + 'K' : String(sp.followers));
            if (sp.hours_per_week != null && sp.hours_per_week !== '') setIf('spHours', sp.hours_per_week);
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
                // Keep 24-month view: extend 12-month API data to 24 (repeat last value)
                ['followers', 'saasMrr', 'freelance'].forEach(key => {
                    const a = projectionData[caseType][key];
                    if (a && a.length === 12) {
                        const last = a[11];
                        projectionData[caseType][key] = a.concat(Array(12).fill(last));
                    }
                });
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

// Net Asset Impact Calculator: projected position = start + passive yield + net from business − (monthly burn × period). Runway = asset ÷ burn. Passive yield % from Finance API.
const eurToUsd = 1.05;

async function updateProjectionCalculator() {
    const caseType = document.getElementById('projectionCase')?.value || 'realistic';
    const numMonths = getProjectionTimeframeMonths();
    const taxRateInput = document.getElementById('projectionCalcTaxRate');
    const taxRatePct = taxRateInput ? Math.max(0, Math.min(100, parseFloat(taxRateInput.value) || 0)) : 7;
    const taxRate = taxRatePct / 100;
    const businessExpInput = document.getElementById('projectionCalcBusinessExp');
    const businessExpMonthly = businessExpInput ? Math.max(0, parseFloat(businessExpInput.value) || 0) : 0;
    const burnInput = document.getElementById('projectionCalcBurn');
    const burnEurPerMonth = burnInput ? Math.max(0, parseFloat(burnInput.value) || 0) : 2500;
    const burnUsdPerMonth = burnEurPerMonth * eurToUsd;
    const burnPeriodUsd = burnUsdPerMonth * Math.min(numMonths, 24);

    let passiveYieldAmountPer12 = 0;
    try {
        const financeRes = await fetch('/api/finance');
        if (financeRes.ok) {
            const finance = await financeRes.json();
            passiveYieldAmountPer12 = Math.max(0, Number(finance.constants?.passive_yield) || 0);
        }
    } catch (e) {
        console.warn('Finance fetch for passive yield:', e);
    }

    const data = projectionData[caseType] || projectionData.realistic;
    const n = Math.min(numMonths, 24);
    const saasMrrArr = getProjectionSeries(data.saasMrr, n);
    const freelanceArr = getProjectionSeries(data.freelance, n);
    const monthlyRevenue = Array.from({ length: n }, (_, i) => (saasMrrArr[i] || 0) + (freelanceArr[i] || 0));
    const totalGross = monthlyRevenue.reduce((a, b) => a + b, 0);
    const businessExpPeriod = businessExpMonthly * n;
    const taxableBase = Math.max(0, totalGross - businessExpPeriod);
    const estimatedTax = taxableBase * taxRate;
    const netFromBusiness = taxableBase - estimatedTax;

    let startNetWorth = 0;
    const spEl = document.getElementById('spNetWorth');
    if (spEl && spEl.textContent && spEl.textContent !== '—') {
        const text = spEl.textContent.trim();
        const hasK = /k/i.test(text);
        const raw = text.replace(/[$,Kk\s]/g, '').trim();
        if (raw) {
            const num = parseFloat(raw);
            if (!isNaN(num)) startNetWorth = hasK ? num * 1000 : num;
        }
    }
    const passiveYieldGain = passiveYieldAmountPer12 * (n / 12);
    const projectedNetPosition = startNetWorth + passiveYieldGain + netFromBusiness - burnPeriodUsd;

    const fmt = (v) => (v >= 1000 ? '$' + (v / 1000).toFixed(1) + 'K' : '$' + Math.round(v));
    const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    const scenarioLabels = { realistic: 'Realistic', best: 'Best Case', worst: 'Worst Case' };

    const predictedDate = new Date();
    predictedDate.setMonth(predictedDate.getMonth() + numMonths);
    const predictedDateStr = predictedDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

    set('projectionCalcPeriod', numMonths + ' months');
    set('projectionCalcPredictedDate', predictedDateStr);
    set('projectionCalcScenario', scenarioLabels[caseType] || caseType);
    set('projectionCalcStartNet', startNetWorth ? fmt(startNetWorth) : '—');
    set('projectionCalcGross', fmt(totalGross));
    set('projectionCalcBusinessExpPeriod', fmt(businessExpPeriod));
    set('projectionCalcTaxable', fmt(taxableBase));
    set('projectionCalcTax', fmt(estimatedTax));
    set('projectionCalcNetAfterTax', fmt(netFromBusiness));
    set('projectionCalcPassiveYieldPeriod', passiveYieldAmountPer12 > 0 ? fmt(passiveYieldGain) + ' (' + fmt(passiveYieldAmountPer12) + '/year from finance × ' + n + ' mo)' : fmt(0) + ' (from finance)');
    set('projectionCalcBurnPeriod', fmt(burnPeriodUsd) + ' (' + (burnEurPerMonth >= 1000 ? (burnEurPerMonth / 1000).toFixed(1) + 'K' : burnEurPerMonth) + ' €/mo × ' + n + ' mo)');
    set('projectionCalcFinalNet', fmt(projectedNetPosition));

    const showGetAJob = document.getElementById('projectionCalcShowGetAJob')?.checked === true;
    const getAJobSummary = document.getElementById('projectionCalcGetAJobSummary');
    if (getAJobSummary) getAJobSummary.style.display = showGetAJob ? 'block' : 'none';
    if (showGetAJob) {
        const jobSearchMonths = 3;
        const jobSalaryAfterTaxEur = 4000;
        const jobMonths = Math.max(0, n - jobSearchMonths);
        const getAJobPeriodNetEur = jobSalaryAfterTaxEur * jobMonths;
        const getAJobProjectedUsd = startNetWorth + passiveYieldGain + getAJobPeriodNetEur * eurToUsd - burnPeriodUsd;
        const fmtEur = (v) => (v >= 1000 ? (v / 1000).toFixed(1) + 'K' : Math.round(v)) + ' €';
        set('projectionCalcGetAJobPeriodNet', fmtEur(getAJobPeriodNetEur));
        set('projectionCalcGetAJobFinalNet', fmt(getAJobProjectedUsd));
        const diff = getAJobProjectedUsd - projectedNetPosition;
        const diffRow = document.getElementById('projectionCalcCompareDiffRow');
        if (diffRow) diffRow.style.display = 'flex';
        if (Math.abs(diff) < 100) set('projectionCalcCompareDiff', 'About even');
        else if (diff > 0) set('projectionCalcCompareDiff', 'Get a job: ' + fmt(diff) + ' more');
        else set('projectionCalcCompareDiff', 'Business path: ' + fmt(-diff) + ' more');
    } else {
        const diffRow = document.getElementById('projectionCalcCompareDiffRow');
        if (diffRow) diffRow.style.display = 'none';
    }

    const tbody = document.getElementById('projectionCalcMonthBody');
    if (tbody) {
        let cum = 0;
        const rows = monthlyRevenue.map((rev, i) => {
            cum += rev;
            const taxableCum = Math.max(0, cum - businessExpMonthly * (i + 1));
            const taxToDate = taxableCum * taxRate;
            const netToDate = taxableCum - taxToDate;
            return '<tr><td>' + (i + 1) + '</td><td>' + fmt(rev) + '</td><td>' + fmt(cum) + '</td><td>' + fmt(taxToDate) + '</td><td>' + fmt(netToDate) + '</td></tr>';
        });
        tbody.innerHTML = rows.join('');
    }

    updateProjectionsRunway();
}

// Refresh all projection UI (cards, table, chart, calculator) for current case and timeframe
async function refreshProjectionUI() {
    const caseType = document.getElementById('projectionCase')?.value || 'realistic';
    const numMonths = getProjectionTimeframeMonths();
    updateProjectionCards(caseType, numMonths);
    updateProjectionTable(caseType, numMonths);
    updateProjectionChartTitle(numMonths);
    loadProjectionChart(caseType, numMonths);
    await updateProjectionCalculator();
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
    const gotAJobCheck = document.getElementById('projectionShowGotAJob');
    if (gotAJobCheck && !gotAJobCheck._projectionsBound) {
        gotAJobCheck._projectionsBound = true;
        gotAJobCheck.addEventListener('change', () => refreshProjectionUI());
    }
    const taxRateInput = document.getElementById('projectionCalcTaxRate');
    if (taxRateInput && !taxRateInput._projectionsBound) {
        taxRateInput._projectionsBound = true;
        taxRateInput.addEventListener('input', () => updateProjectionCalculator());
        taxRateInput.addEventListener('change', () => updateProjectionCalculator());
    }
    const getAJobCheck = document.getElementById('projectionCalcShowGetAJob');
    if (getAJobCheck && !getAJobCheck._projectionsBound) {
        getAJobCheck._projectionsBound = true;
        getAJobCheck.addEventListener('change', () => updateProjectionCalculator());
    }
    const burnEl = document.getElementById('projectionCalcBurn');
    if (burnEl && !burnEl._projectionsBound) {
        burnEl._projectionsBound = true;
        burnEl.addEventListener('input', () => updateProjectionCalculator());
        burnEl.addEventListener('change', () => updateProjectionCalculator());
    }
    const businessExpEl = document.getElementById('projectionCalcBusinessExp');
    if (businessExpEl && !businessExpEl._projectionsBound) {
        businessExpEl._projectionsBound = true;
        businessExpEl.addEventListener('input', () => updateProjectionCalculator());
        businessExpEl.addEventListener('change', () => updateProjectionCalculator());
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
