// Chart Management
let healthChart = null;
let financeChart = null;

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

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initChartToggles();
    });
} else {
    initChartToggles();
}
