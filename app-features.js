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

// Refresh Button
function initRefreshButton() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (!refreshBtn) {
        console.warn('Refresh button not found');
        return;
    }
    
    refreshBtn.addEventListener('click', async () => {
        refreshBtn.classList.add('loading');
        refreshBtn.disabled = true;
        
        try {
            console.log('🔄 Manual refresh triggered');
            if (typeof refreshGitHubGraph === 'function') {
                refreshGitHubGraph();
            }
            if (typeof loadDashboardData === 'function') {
                await loadDashboardData();
                showToast('Data refreshed successfully', 'success');
            } else {
                console.error('loadDashboardData function not found!');
                showToast('Error: Dashboard function not loaded', 'error');
            }
        } catch (error) {
            console.error('Refresh error:', error);
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

// Initialize all features when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initDarkMode();
        initRefreshButton();
        initAddTodo();
        initInlineTodoEdit();
        initAddUpcoming();
        initAddFinance();
    });
} else {
    // DOM already loaded
    initDarkMode();
    initRefreshButton();
    initAddTodo();
    initInlineTodoEdit();
    initAddUpcoming();
    initAddFinance();
}
