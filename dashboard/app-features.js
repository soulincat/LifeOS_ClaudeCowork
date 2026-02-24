// Toast Notification System
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
    
    toast.innerHTML = `
        <span class="toast-message">${icon} ${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideInRight 0.3s ease-out reverse';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ---- Self-contained data loader (does NOT depend on app.js) ----
function updateTodoCountLocal() {
    const list = document.querySelector('.todo-list');
    if (!list) return;
    const checkboxes = list.querySelectorAll('.todo-checkbox');
    const checked = list.querySelectorAll('.todo-checkbox:checked').length;
    const undone = checkboxes.length - checked;
    const countEl = document.getElementById('todoCount');
    if (countEl) countEl.textContent = undone + '/' + checkboxes.length;
}

async function loadAllData() {
    const base = location.origin;
    const formatCurrency = (amount) => {
        if (amount == null || isNaN(Number(amount))) return '$0';
        const n = Number(amount);
        if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'k';
        return '$' + (n >= 0 ? n.toFixed(0) : '-' + Math.abs(n).toFixed(0));
    };

    // Todos
    try {
        const r = await fetch(base + '/api/todos');
        if (r.ok) {
            const todos = await r.json();
            const todoList = document.querySelector('.todo-list');
            if (todoList) {
                const undone = todos.filter(t => !t.completed);
                const done = todos.filter(t => t.completed);
                let html = '';
                undone.forEach(t => {
                    html += '<label class="todo-item"><input type="checkbox" class="todo-checkbox" data-id="' + t.id + '"><span class="todo-text">' + (t.text || '').replace(/</g, '&lt;') + '</span></label>';
                });
                if (done.length > 0) {
                    html += '<div class="todo-separator"></div><div class="todo-done-header"><button class="todo-expand-btn" id="expandDoneBtn" title="Show completed tasks"><svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button><span class="todo-done-label">Done today (' + done.length + ')</span></div><div class="todo-done-list" id="todoDoneList" style="display:none;">';
                    done.forEach(t => {
                        html += '<label class="todo-item todo-item-done"><input type="checkbox" class="todo-checkbox" data-id="' + t.id + '" checked><span class="todo-text">' + (t.text || '').replace(/</g, '&lt;') + '</span></label>';
                    });
                    html += '</div>';
                }
                todoList.innerHTML = html;
                updateTodoCountLocal();
                const expandBtn = document.getElementById('expandDoneBtn');
                if (expandBtn) expandBtn.addEventListener('click', function() {
                    const dl = document.getElementById('todoDoneList');
                    if (dl) dl.style.display = dl.style.display === 'none' ? 'block' : 'none';
                });
            }
        }
    } catch (e) { console.warn('Todos load failed', e); }

    // Finance
    try {
        const r = await fetch(base + '/api/finance');
        if (r.ok) {
            const finance = await r.json();
            const section = document.getElementById('financeSection');
            const rows = section ? section.querySelectorAll('.info-row') : [];
            rows.forEach(row => {
                const labelEl = row.querySelector('.info-label');
                const valueEl = row.querySelector('.info-value');
                if (!labelEl || !valueEl) return;
                const label = labelEl.textContent.trim();
                let val = null;
                if (label === 'Revenue') val = finance.monthly?.revenue;
                else if (label === 'Profit') val = finance.monthly?.profit;
                else if (label === 'Expense') val = finance.monthly?.expense;
                else if (label === 'Spending') val = finance.monthly?.spending;
                else if (label === 'Investment') val = finance.constants?.investment;
                else if (label === 'Passive Yield') {
                    const amt = Number(finance.constants?.passive_yield) || 0;
                    const inv = Number(finance.constants?.investment) || 0;
                    const pct = inv > 0 && amt > 0 ? (amt / inv * 100) : (finance.constants?.passive_yield_percentage ?? 0);
                    valueEl.textContent = formatCurrency(amt) + ' (' + pct.toFixed(1) + '%)';
                    return;
                } else if (label === 'Asset') val = finance.constants?.asset;
                else if (label === 'Total Net') val = finance.constants?.total_net;
                if (val != null && !isNaN(Number(val))) valueEl.textContent = formatCurrency(val);
            });
            const totalEl = document.getElementById('totalNetValue');
            if (totalEl) {
                let tn = finance.constants?.total_net;
                if (tn == null || isNaN(Number(tn))) tn = (Number(finance.constants?.investment) || 0) + (Number(finance.constants?.asset) || 0);
                totalEl.textContent = formatCurrency(tn);
            }
            const monthEl = document.getElementById('financeMonth');
            if (monthEl) monthEl.textContent = ['January','February','March','April','May','June','July','August','September','October','November','December'][new Date().getMonth()];
        }
    } catch (e) { console.warn('Finance load failed', e); }

    // Health
    try {
        const r = await fetch(base + '/api/health');
        if (r.ok) {
            const health = await r.json();
            const section = document.getElementById('healthSection');
            const rows = section ? section.querySelectorAll('.info-row') : [];
            rows.forEach(row => {
                const label = row.querySelector('.info-label')?.textContent;
                const valueEl = row.querySelector('.info-value');
                if (!valueEl) return;
                if (label === 'Recovery') valueEl.textContent = (health.recovery ?? '') + '%';
                else if (label === 'Sleep') valueEl.textContent = (health.sleep_hours ?? 0) + 'h ' + (health.sleep_minutes ?? 0) + 'm';
                else if (label === 'HRV') valueEl.textContent = (health.hrv ?? '') + 'ms';
                else if (label === 'Cycle') {
                    const raw = health.cycle_phase || '';
                    const phaseLabels = { follicular: 'Follicular - feel OK', ovulatory: 'Ovulatory - horny', luteal: 'Luteal - feel OK', pms: 'PMS - depression', period: 'Period' };
                    const display = raw && !raw.includes(' - ') ? (phaseLabels[raw.toLowerCase().replace(/\s+/g, '')] || phaseLabels[raw.toLowerCase()] || raw) : raw;
                    valueEl.textContent = display || '—';
                }
            });
            const phaseEl = document.getElementById('healthMonthlyPhase');
            if (phaseEl && health.monthly_phase) phaseEl.textContent = health.monthly_phase;
        }
    } catch (e) { console.warn('Health load failed', e); }

    // GitHub contribution graph
    const graphImg = document.getElementById('githubContributionGraph');
    if (graphImg) graphImg.src = 'https://ghchart.rshah.org/203EAE/soulincat?t=' + Date.now();

    // Top priority this month (sidebar)
    try {
        const goalsRes = await fetch(base + '/api/goals');
        if (goalsRes.ok) {
            const goals = await goalsRes.json();
            const now = new Date();
            const currentMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
            const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
            const monthly = (goals || []).filter(g => {
                if (g.period_type !== 'monthly') return false;
                const label = (g.period_label || '').trim();
                if (label === currentMonth) return true;
                if (label.includes(currentMonth)) return true;
                if (label.includes(monthNames[now.getMonth()]) && label.includes(String(now.getFullYear()))) return true;
                return false;
            });
            const nonArt = monthly.filter(g => (g.aspect || 'general') !== 'art');
            const byPriority = nonArt.slice().sort((a, b) => (a.priority ?? 3) - (b.priority ?? 3));
            const top = byPriority[0];
            const el = document.getElementById('sidebarTopPriorityTitle');
            if (el) el.textContent = top ? top.title : '—';
        }
    } catch (e) { console.warn('Sidebar top priority load failed', e); }
}

// Dark Mode Toggle
function initDarkMode() {
    const themeToggle = document.getElementById('themeToggle');
    const body = document.body;
    
    const sunIcon = themeToggle.querySelector('.icon-sun');
    const moonIcon = themeToggle.querySelector('.icon-moon');
    
    // Load saved theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    body.className = `${savedTheme}-theme`;
    
    // Set initial icon state - show what you'll switch TO
    // Light mode: show moon (to switch to dark)
    // Dark mode: show sun (to switch to light)
    if (savedTheme === 'dark') {
        sunIcon.style.display = 'block';  // Show sun to switch to light
        moonIcon.style.display = 'none';
    } else {
        sunIcon.style.display = 'none';
        moonIcon.style.display = 'block';  // Show moon to switch to dark
    }
    
    themeToggle.addEventListener('click', () => {
        const isDark = body.classList.contains('dark-theme');
        body.className = isDark ? 'light-theme' : 'dark-theme';
        
        // Toggle icons - show what you'll switch TO
        if (isDark) {
            // Currently dark, switching to light - show sun
            sunIcon.style.display = 'block';
            moonIcon.style.display = 'none';
        } else {
            // Currently light, switching to dark - show moon
            sunIcon.style.display = 'none';
            moonIcon.style.display = 'block';
        }
        
        localStorage.setItem('theme', isDark ? 'light' : 'dark');
    });
}

// Refresh Button — uses loadAllData() so it never depends on app.js
function initRefreshButton() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (!refreshBtn) return;
    
    refreshBtn.addEventListener('click', async () => {
        refreshBtn.classList.add('loading');
        refreshBtn.disabled = true;
        try {
            await loadAllData();
            showToast('Data refreshed successfully', 'success');
        } catch (e) {
            console.error('Refresh error:', e);
            showToast('Failed to refresh data', 'error');
        } finally {
            setTimeout(() => {
                refreshBtn.classList.remove('loading');
                refreshBtn.disabled = false;
            }, 500);
        }
    });
}

// Add Todo Functionality
function initAddTodo() {
    const addBtn = document.getElementById('addTodoBtn');
    const form = document.getElementById('todoAddForm');
    const input = document.getElementById('todoInput');
    const saveBtn = document.getElementById('saveTodoBtn');
    const cancelBtn = document.getElementById('cancelTodoBtn');
    
    if (!addBtn || !form) return;
    
    addBtn.addEventListener('click', () => {
        form.style.display = form.style.display === 'none' ? 'flex' : 'none';
        if (form.style.display === 'flex') {
            input.focus();
        }
    });
    
    cancelBtn?.addEventListener('click', () => {
        form.style.display = 'none';
        input.value = '';
    });
    
    const saveTodo = async () => {
        const text = input.value.trim();
        if (!text) {
            showToast('Please enter a todo', 'error');
            return;
        }
        
        try {
            const response = await fetch('/api/todos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            });
            
            if (response.ok) {
                form.style.display = 'none';
                input.value = '';
                await loadTodos();
                showToast('Todo added', 'success');
            } else {
                throw new Error('Failed to add todo');
            }
        } catch (error) {
            showToast('Failed to add todo', 'error');
        }
    };
    
    saveBtn?.addEventListener('click', saveTodo);
    input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveTodo();
        if (e.key === 'Escape') {
            form.style.display = 'none';
            input.value = '';
        }
    });
}

// Inline Todo Editing
function initInlineTodoEdit() {
    document.addEventListener('click', async (e) => {
        const todoText = e.target.closest('.todo-text');
        if (!todoText || todoText.closest('.todo-add-form')) return;
        
        const checkbox = todoText.previousElementSibling;
        if (checkbox?.type === 'checkbox' && checkbox.checked) return;
        
        const todoItem = todoText.closest('.todo-item');
        const todoId = todoItem?.querySelector('.todo-checkbox')?.dataset.id;
        if (!todoId) return;
        
        const originalText = todoText.textContent;
        todoText.contentEditable = 'true';
        todoText.focus();
        
        const finishEdit = async () => {
            todoText.contentEditable = 'false';
            const newText = todoText.textContent.trim();
            
            if (!newText) {
                todoText.textContent = originalText;
                showToast('Todo cannot be empty', 'error');
                return;
            }
            
            if (newText !== originalText) {
                try {
                    const response = await fetch(`/api/todos/${todoId}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: newText })
                    });
                    
                    if (response.ok) {
                        showToast('Todo updated', 'success');
                    } else {
                        throw new Error('Failed to update');
                    }
                } catch (error) {
                    todoText.textContent = originalText;
                    showToast('Failed to update todo', 'error');
                }
            }
        };
        
        todoText.addEventListener('blur', finishEdit, { once: true });
        todoText.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                finishEdit();
            }
            if (e.key === 'Escape') {
                todoText.textContent = originalText;
                todoText.contentEditable = 'false';
            }
        }, { once: true });
    });
}

// Add Upcoming Item Functionality
function initAddUpcoming() {
    const addBtn = document.getElementById('addUpcomingBtn');
    const form = document.getElementById('upcomingAddForm');
    const titleInput = document.getElementById('upcomingTitleInput');
    const typeInput = document.getElementById('upcomingTypeInput');
    const dateInput = document.getElementById('upcomingDateInput');
    const descInput = document.getElementById('upcomingDescInput');
    const saveBtn = document.getElementById('saveUpcomingBtn');
    const cancelBtn = document.getElementById('cancelUpcomingBtn');
    
    if (!addBtn || !form) return;
    
    // Set default date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    dateInput.value = tomorrow.toISOString().slice(0, 16);
    
    addBtn.addEventListener('click', () => {
        form.style.display = form.style.display === 'none' ? 'flex' : 'none';
        if (form.style.display === 'flex') {
            titleInput.focus();
        }
    });
    
    cancelBtn?.addEventListener('click', () => {
        form.style.display = 'none';
        titleInput.value = '';
        descInput.value = '';
    });
    
    const saveUpcoming = async () => {
        const title = titleInput.value.trim();
        const type = typeInput.value;
        const dueDate = dateInput.value;
        const description = descInput.value.trim();
        
        if (!title || !dueDate) {
            showToast('Please fill required fields', 'error');
            return;
        }
        
        try {
            const response = await fetch('/api/upcoming', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, type, due_date: dueDate, description })
            });
            
            if (response.ok) {
                form.style.display = 'none';
                titleInput.value = '';
                descInput.value = '';
                await loadDashboardData();
                showToast('Upcoming item added', 'success');
            } else {
                throw new Error('Failed to add item');
            }
        } catch (error) {
            showToast('Failed to add upcoming item', 'error');
        }
    };
    
    saveBtn?.addEventListener('click', saveUpcoming);
}

// Add Finance Entry Functionality
function initAddFinance() {
    const addBtn = document.getElementById('addFinanceBtn');
    const form = document.getElementById('financeAddForm');
    const typeInput = document.getElementById('financeTypeInput');
    const amountInput = document.getElementById('financeAmountInput');
    const currencyInput = document.getElementById('financeCurrencyInput');
    const accountInput = document.getElementById('financeAccountInput');
    const dateInput = document.getElementById('financeDateInput');
    const saveBtn = document.getElementById('saveFinanceBtn');
    const cancelBtn = document.getElementById('cancelFinanceBtn');
    
    if (!addBtn || !form) return;
    
    // Set default date to today
    dateInput.value = new Date().toISOString().split('T')[0];
    
    // Show/hide currency selector based on type
    typeInput.addEventListener('change', () => {
        const type = typeInput.value;
        if (type === 'spending') {
            currencyInput.style.display = 'block';
            currencyInput.value = 'EUR';
            amountInput.placeholder = 'Amount in EUR';
        } else {
            currencyInput.style.display = 'none';
            currencyInput.value = 'USD';
            amountInput.placeholder = 'Amount';
        }
    });
    
    addBtn.addEventListener('click', () => {
        form.style.display = form.style.display === 'none' ? 'flex' : 'none';
        if (form.style.display === 'flex') {
            amountInput.focus();
            // Trigger change to set currency for spending
            typeInput.dispatchEvent(new Event('change'));
        }
    });
    
    cancelBtn?.addEventListener('click', () => {
        form.style.display = 'none';
        amountInput.value = '';
        currencyInput.style.display = 'none';
    });
    
    const saveFinance = async () => {
        const type = typeInput.value;
        let amount = parseFloat(amountInput.value);
        const currency = currencyInput.value || 'USD';
        const accountType = accountInput.value;
        const date = dateInput.value;
        
        if (!amount || amount <= 0) {
            showToast('Please enter a valid amount', 'error');
            return;
        }
        
        // Convert EUR to USD if needed (approximate rate: 1 EUR = 1.08 USD)
        // TODO: Use real-time exchange rate API if needed
        if (currency === 'EUR' && type === 'spending') {
            const eurToUsdRate = 1.08; // Approximate rate
            amount = amount * eurToUsdRate;
            console.log(`Converted EUR to USD: ${amountInput.value} EUR = $${amount.toFixed(2)} USD`);
        }
        
        try {
            const response = await fetch('/api/finance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    type, 
                    amount, 
                    account_type: accountType, 
                    date, 
                    source: 'manual',
                    currency: currency === 'EUR' ? 'EUR' : 'USD'
                })
            });
            
            if (response.ok) {
                form.style.display = 'none';
                amountInput.value = '';
                currencyInput.style.display = 'none';
                await loadDashboardData();
                showToast('Finance entry added', 'success');
            } else {
                throw new Error('Failed to add entry');
            }
        } catch (error) {
            showToast('Failed to add finance entry', 'error');
        }
    };
    
    saveBtn?.addEventListener('click', saveFinance);
}

// Loading State Helper
function setLoading(element, isLoading) {
    if (isLoading) {
        element.classList.add('loading');
        element.disabled = true;
    } else {
        element.classList.remove('loading');
        element.disabled = false;
    }
}

// Single delegated listener for todo checkbox (so it works after loadAllData replaces HTML)
document.body.addEventListener('change', async function(ev) {
    if (!ev.target.matches('.todo-list .todo-checkbox') || !ev.target.dataset.id) return;
    const cb = ev.target;
    try {
        const res = await fetch(location.origin + '/api/todos/' + cb.dataset.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: cb.checked }) });
        if (res.ok) loadAllData();
    } catch (e) { console.warn(e); }
});

// Initialize all features when DOM is ready; load data so it works even if app.js fails
function init() {
    initDarkMode();
    initRefreshButton();
    initAddTodo();
    initInlineTodoEdit();
    initAddUpcoming();
    initAddFinance();
    // Load todos, finance, health, GitHub graph (self-contained, no app.js dependency)
    setTimeout(function() { loadAllData(); }, 100);
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
// Fallback: load data again when window fully loaded
window.addEventListener('load', function() { loadAllData(); });
