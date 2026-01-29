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
        
        // Update project cards if needed
        projects.forEach((project, index) => {
            const card = document.querySelectorAll('.project-card')[index];
            if (card && project.last_updated) {
                const updatedEl = card.querySelector('.project-card-updated');
                if (updatedEl) {
                    const date = new Date(project.last_updated);
                    updatedEl.textContent = `Updated: ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
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

// Project card clicks
document.querySelectorAll('.project-card').forEach(card => {
    card.addEventListener('click', function() {
        const name = this.querySelector('.project-card-name').textContent;
        console.log('Opening project:', name);
    });
});

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
                    <span class="todo-done-label">Completed (${doneTodos.length})</span>
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
