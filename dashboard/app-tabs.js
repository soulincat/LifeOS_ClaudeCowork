(function() {
    let currentTab = 'home';
    let currentMoreSection = 'goals'; // default sub-section inside More

    // More tab sub-sections — maps section key to panel id and loader
    const moreSections = {
        goals:     { panel: 'panel-goals',     loader: () => { if (typeof loadGoals === 'function') loadGoals(); } },
        scenarios: { panel: 'panel-scenarios',  loader: () => { if (typeof initProjectionTab === 'function') initProjectionTab(); } },
        wishlist:  { panel: 'panel-wishlist',   loader: () => { loadWishlist(); } },
        setup:     { panel: 'panel-setup',      loader: () => { if (typeof loadSetup === 'function') loadSetup(); } }
    };

    function showMoreSection(section) {
        currentMoreSection = section;
        // Hide all more sub-panels
        Object.values(moreSections).forEach(s => {
            const el = document.getElementById(s.panel);
            if (el) el.style.display = 'none';
        });
        // Show the active one
        const active = moreSections[section];
        if (active) {
            const el = document.getElementById(active.panel);
            if (el) el.style.display = 'block';
            active.loader();
        }
        // Update sub-tab buttons
        document.querySelectorAll('.more-sub-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.section === section);
        });
    }

    function showPanel(tab) {
        currentTab = tab;
        document.querySelectorAll('.main-panel').forEach(el => { el.style.display = 'none'; });
        document.querySelectorAll('.tab-bar-tab').forEach(el => { el.classList.remove('active'); });

        // Handle dynamic project tabs: project-{id} → show project-detail panel
        const isProjectTab = tab.startsWith('project-') && tab !== 'project-detail';
        const panelId = isProjectTab ? 'project-detail' : tab;
        const panel = document.getElementById('panel-' + panelId);
        const tabBtn = document.querySelector('.tab-bar-tab[data-tab="' + tab + '"]');
        const flexPanels = ['home', 'socials'];
        if (panel) panel.style.display = flexPanels.includes(tab) ? 'flex' : 'block';
        if (tabBtn) tabBtn.classList.add('active');
        // Show PA chat bar on all tabs
        const paWrap = document.getElementById('dashPaWrap');
        if (paWrap) paWrap.style.display = 'block';
        if (tab === 'home' && typeof loadHomeData === 'function') loadHomeData();
        if (tab === 'socials' && typeof loadSocialsData === 'function') loadSocialsData();
        if (tab === 'inbox') initInboxTab();
        if (tab === 'more') showMoreSection(currentMoreSection);
        if (isProjectTab) {
            const projectId = tab.replace('project-', '');
            if (typeof openProjectDetail === 'function') openProjectDetail(parseInt(projectId, 10), true);
        }
    }

    async function loadWishlist() {
        const gallery = document.getElementById('wishlistGallery');
        if (!gallery) return;
        try {
            const res = await fetch('/api/wishlist');
            const items = await res.json();
            const wishlistPlaceholder = `
                <div class="wishlist-gallery-item wishlist-placeholder-item">
                    <div class="wishlist-placeholder">📷</div>
                    <span class="wishlist-priority">P1</span>
                    <div class="wishlist-overlay"><div class="wishlist-name">Standing desk</div><div class="wishlist-price">$400 USD</div></div>
                </div>
                <div class="wishlist-gallery-item wishlist-placeholder-item">
                    <div class="wishlist-placeholder">📷</div>
                    <span class="wishlist-priority">P2</span>
                    <div class="wishlist-overlay"><div class="wishlist-name">Monitor arm</div><div class="wishlist-price">$120 USD</div></div>
                </div>
            `;
            
            function renderWishlistItem(item) {
                const hasCondition = item.condition_type && item.condition_type !== 'none';
                const conditionMet = item.condition_met === true;
                const hasSavings = item.price_usd && item.saved_amount > 0;
                const savingsProgress = item.savings_progress || 0;
                const conditionClass = conditionMet ? 'wishlist-condition-met' : '';
                
                let conditionBadge = '';
                if (hasCondition) {
                    if (conditionMet) {
                        conditionBadge = '<span class="wishlist-condition-badge condition-met">Ready to buy!</span>';
                    } else {
                        const conditionText = item.purchase_condition || 
                            (item.condition_type === 'savings_threshold' ? `Net $${formatWishlistNumber(item.condition_value)}` :
                             item.condition_type === 'investment_threshold' ? `Invest $${formatWishlistNumber(item.condition_value)}` :
                             item.condition_type === 'asset_threshold' ? `Asset $${formatWishlistNumber(item.condition_value)}` :
                             item.condition_type === 'fully_saved' ? 'Save full amount' : '');
                        conditionBadge = `<span class="wishlist-condition-badge">${conditionText}</span>`;
                    }
                }
                
                let progressBar = '';
                if (hasSavings || item.price_usd) {
                    const saved = item.saved_amount || 0;
                    const price = item.price_usd || 0;
                    progressBar = `
                        <div class="wishlist-progress">
                            <div class="wishlist-progress-bar" style="width: ${savingsProgress}%"></div>
                            <span class="wishlist-progress-text">$${formatWishlistNumber(saved)} / $${formatWishlistNumber(price)}</span>
                        </div>
                    `;
                }
                
                return `
                    <div class="wishlist-gallery-item ${conditionClass}" data-id="${item.id}">
                        ${item.image_url
                            ? `<img class="wishlist-img" src="${item.image_url}" alt="${item.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
                             <div class="wishlist-placeholder" style="display:none;">📷</div>`
                            : '<div class="wishlist-placeholder">📷</div>'}
                        <span class="wishlist-priority">P${item.priority || 3}</span>
                        ${conditionBadge}
                        <button type="button" class="wishlist-delete-btn" title="Remove" data-id="${item.id}">×</button>
                        <div class="wishlist-overlay">
                            <div class="wishlist-name">${item.name}</div>
                            <div class="wishlist-price">${item.price_usd != null ? '$' + Number(item.price_usd).toFixed(0) : '—'} USD</div>
                            ${progressBar}
                        </div>
                    </div>
                `;
            }
            
            function formatWishlistNumber(num) {
                if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
                if (num >= 1000) return (num / 1000).toFixed(num >= 10000 ? 0 : 1) + 'k';
                return num.toFixed(0);
            }
            
            gallery.innerHTML = items.length === 0
                ? '<p class="empty-state">No wishlist items yet. Add one with + or click an example below.</p>' + wishlistPlaceholder
                : items.map(renderWishlistItem).join('');
            gallery.querySelectorAll('.wishlist-gallery-item[data-id]').forEach(itemEl => {
                itemEl.classList.add('wishlist-item-clickable');
                itemEl.addEventListener('click', function(e) {
                    if (e.target.closest('.wishlist-delete-btn') || e.target.closest('.wishlist-progress')) return;
                    if (this.classList.contains('wishlist-editing')) return;
                    const id = this.dataset.id;
                    const item = items.find(i => String(i.id) === String(id));
                    if (!item) return;
                    this.classList.add('wishlist-editing');
                    const overlay = this.querySelector('.wishlist-overlay');
                    if (!overlay) return;
                    const name = (item.name || '').replace(/"/g, '&quot;');
                    const price = item.price_usd != null ? item.price_usd : '';
                    const saved = item.saved_amount != null ? item.saved_amount : '';
                    const pri = item.priority != null ? item.priority : 3;
                    overlay.innerHTML = '<div class="wishlist-edit-form">' +
                        '<input type="text" class="wishlist-edit-input" value="' + name + '" placeholder="Name">' +
                        '<input type="number" class="wishlist-edit-input" value="' + (price !== '' ? price : '') + '" placeholder="Price $" step="0.01">' +
                        '<input type="number" class="wishlist-edit-input" value="' + (saved !== '' ? saved : '') + '" placeholder="Saved $" step="0.01">' +
                        '<select class="wishlist-edit-input wishlist-edit-priority"><option value="1"' + (pri === 1 ? ' selected' : '') + '>P1</option><option value="2"' + (pri === 2 ? ' selected' : '') + '>P2</option><option value="3"' + (pri === 3 ? ' selected' : '') + '>P3</option><option value="4"' + (pri === 4 ? ' selected' : '') + '>P4</option><option value="5"' + (pri === 5 ? ' selected' : '') + '>P5</option></select>' +
                        '<div class="wishlist-edit-actions"><button type="button" class="btn-save btn-small wishlist-edit-save">Save</button> <button type="button" class="btn-cancel btn-small wishlist-edit-cancel">Cancel</button></div></div>';
                    const inpName = overlay.querySelector('.wishlist-edit-input');
                    const inpPrice = overlay.querySelectorAll('.wishlist-edit-input')[1];
                    const inpSaved = overlay.querySelectorAll('.wishlist-edit-input')[2];
                    const selPri = overlay.querySelector('.wishlist-edit-priority');
                    const saveBtn = overlay.querySelector('.wishlist-edit-save');
                    const cancelBtn = overlay.querySelector('.wishlist-edit-cancel');
                    function done() { itemEl.classList.remove('wishlist-editing'); loadWishlist(); }
                    function save() {
                        const nameVal = inpName && inpName.value ? inpName.value.trim() : '';
                        if (!nameVal) { if (typeof showToast === 'function') showToast('Name required', 'error'); return; }
                        const priceVal = inpPrice && inpPrice.value ? parseFloat(inpPrice.value) : null;
                        const savedVal = inpSaved && inpSaved.value ? parseFloat(inpSaved.value) : 0;
                        const priVal = selPri ? parseInt(selPri.value, 10) : 3;
                        fetch('/api/wishlist/' + id, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: nameVal, price_usd: priceVal, saved_amount: savedVal, priority: priVal })
                        }).then(r => { if (r.ok) { done(); if (typeof showToast === 'function') showToast('Saved', 'success'); } else done(); }).catch(() => done());
                    }
                    if (saveBtn) saveBtn.addEventListener('click', save);
                    if (cancelBtn) cancelBtn.addEventListener('click', done);
                    if (inpName) { inpName.focus(); inpName.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') done(); }); }
                });
            });
            gallery.querySelectorAll('.wishlist-delete-btn').forEach(btn => {
                btn.addEventListener('click', async function(e) {
                    e.stopPropagation();
                    const id = this.dataset.id;
                    if (typeof confirm !== 'undefined' && !confirm('Remove this item from your wishlist?')) return;
                    try {
                        const del = await fetch('/api/wishlist/' + id, { method: 'DELETE' });
                        if (del.ok) { loadWishlist(); if (typeof showToast === 'function') showToast('Removed from wishlist', 'success'); }
                        else if (typeof showToast === 'function') showToast('Failed to remove', 'error');
                    } catch (err) {
                        if (typeof showToast === 'function') showToast('Failed to remove', 'error');
                    }
                });
            });
            
            // Click on progress bar to update saved amount
            gallery.querySelectorAll('.wishlist-progress').forEach(progressEl => {
                progressEl.style.cursor = 'pointer';
                progressEl.addEventListener('click', async function(e) {
                    e.stopPropagation();
                    const itemEl = this.closest('.wishlist-gallery-item');
                    const id = itemEl?.dataset.id;
                    if (!id) return;
                    
                    const currentItem = items.find(i => String(i.id) === String(id));
                    const currentSaved = currentItem?.saved_amount || 0;
                    const price = currentItem?.price_usd || 0;
                    
                    const newAmount = prompt(`Update saved amount for "${currentItem?.name}":\n(Current: $${currentSaved}, Price: $${price})`, currentSaved);
                    if (newAmount === null) return;
                    
                    const parsedAmount = parseFloat(newAmount);
                    if (isNaN(parsedAmount) || parsedAmount < 0) {
                        if (typeof showToast === 'function') showToast('Invalid amount', 'error');
                        return;
                    }
                    
                    try {
                        const res = await fetch('/api/wishlist/' + id, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ saved_amount: parsedAmount })
                        });
                        if (res.ok) {
                            loadWishlist();
                            if (typeof showToast === 'function') showToast('Savings updated', 'success');
                        } else {
                            if (typeof showToast === 'function') showToast('Failed to update', 'error');
                        }
                    } catch (err) {
                        if (typeof showToast === 'function') showToast('Failed to update', 'error');
                    }
                });
            });
        } catch (e) {
            gallery.innerHTML = '<p class="empty-state">Could not load wishlist.</p>';
        }
        const goalSelect = document.getElementById('wishlistGoalInput');
        if (goalSelect && goalSelect.options.length <= 1) {
            const gRes = await fetch('/api/goals');
            const goals = await gRes.json();
            goals.forEach(g => {
                const opt = document.createElement('option');
                opt.value = g.id;
                opt.textContent = g.title + ' (' + g.period_label + ')';
                goalSelect.appendChild(opt);
            });
        }
    }

    const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    /** Normalize monthly period_label to YYYY-MM so "February", "Feb", "February 2025", "2025-02" all match. */
    function normalizeMonthlyPeriodLabel(periodLabel, currentYear) {
        if (!periodLabel || typeof periodLabel !== 'string') return null;
        const s = periodLabel.trim();
        if (/^\d{4}-\d{2}$/.test(s)) return s;
        const yearMatch = s.match(/(\d{4})/);
        const y = yearMatch ? yearMatch[1] : String(currentYear);
        const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
        const short = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
        const lower = s.toLowerCase();
        for (let i = 0; i < 12; i++) {
            if (lower.startsWith(months[i]) || lower === short[i] || lower.startsWith(short[i] + ' ')) {
                return y + '-' + String(i + 1).padStart(2, '0');
            }
        }
        return null;
    }

    function currentPeriodLabels() {
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();
        const date = now.getDate();
        const q = Math.floor(m / 3) + 1;
        const monthStr = String(m + 1).padStart(2, '0');
        const startOfYear = new Date(y, 0, 1);
        const passed = (now - startOfYear) / (365.25 * 24 * 60 * 60 * 1000) * 100;
        const lastDayOfMonth = new Date(y, m + 1, 0).getDate();
        const nextY = m === 11 ? y + 1 : y;
        const nextM = m === 11 ? 0 : m + 1;
        const nextMonthStr = String(nextM + 1).padStart(2, '0');
        const shortMonths = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const dayOrdinal = date + (date >= 11 && date <= 13 ? 'th' : (date % 10 === 1 ? 'st' : date % 10 === 2 ? 'nd' : date % 10 === 3 ? 'rd' : 'th'));
        return {
            year: String(y),
            quarter: y + '-Q' + q,
            month: y + '-' + monthStr,
            monthName: MONTH_NAMES[m] + ' ' + y,
            shortMonth: shortMonths[m],
            day: date,
            dayOrdinal,
            nextMonth: nextY + '-' + nextMonthStr,
            nextMonthName: MONTH_NAMES[nextM] + ' ' + nextY,
            dateStr: now.toISOString().slice(0, 10),
            passedPct: Math.round(passed),
            isLastDaysOfMonth: date >= lastDayOfMonth - 2,
            isFirstDaysOfMonth: date <= 5
        };
    }

    async function loadGoals() {
        const hierarchyEl = document.getElementById('goalsHierarchy');
        const nosListEl = document.getElementById('goalsNosList');
        const maybeListEl = document.getElementById('goalsMaybeList');
        const parentSelect = document.getElementById('goalParentInput');
        if (!hierarchyEl) return;
        try {
            const [goalsRes, nosUncertaintiesRes, contingencyRes] = await Promise.all([
                fetch('/api/goals?withDetail=1'),
                fetch('/api/goals/nos-and-uncertainties'),
                fetch('/api/goals/contingency-plans')
            ]);
            const goals = await goalsRes.json();
            const { nos, uncertainties } = await nosUncertaintiesRes.json();
            const contingencyPlans = contingencyRes.ok ? await contingencyRes.json() : [];
            const periods = currentPeriodLabels();

            if (parentSelect && goals.length) {
                parentSelect.innerHTML = '<option value="">No parent (yearly)</option>' + goals.map(g => '<option value="' + g.id + '">' + g.title + ' (' + g.period_label + ')</option>').join('');
            }

            const yearly = goals.find(g => g.period_type === 'yearly' && g.period_label === periods.year);
            const quarterly = goals.find(g => g.period_type === 'quarterly' && g.period_label === periods.quarter);
            const currentYear = new Date().getFullYear();
            const monthlyAll = goals.filter(g => {
                if (g.period_type !== 'monthly') return false;
                if (g.period_label === periods.month) return true;
                const normalized = normalizeMonthlyPeriodLabel(g.period_label, currentYear);
                return normalized === periods.month;
            });
            const nextMonthGoals = goals.filter(g => {
                if (g.period_type !== 'monthly') return false;
                if (g.period_label === periods.nextMonth) return true;
                const normalized = normalizeMonthlyPeriodLabel(g.period_label, currentYear);
                return normalized === periods.nextMonth;
            });
            const byAspect = {};
            (monthlyAll || []).forEach(g => {
                const a = g.aspect || 'general';
                if (!byAspect[a]) byAspect[a] = [];
                byAspect[a].push(g);
            });
            const aspectOrder = ['general', 'health', 'wealth', 'relationships', 'work', 'art'];
            /* Top priority this month: exclude art so it never shows as top priority */
            const monthlyNonArt = (monthlyAll || []).filter(g => (g.aspect || 'general') !== 'art');
            const sortedByPriority = [...monthlyNonArt].sort((a, b) => (a.priority ?? 3) - (b.priority ?? 3));
            const topPriorityMonthly = sortedByPriority.length ? sortedByPriority[0] : null;

            function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
            const yearlyDisplay = yearly ? (yearly.title + (yearly.description ? ' — ' + yearly.description : '')) : '—';
            const quarterlyDisplay = quarterly ? quarterly.title : '—';
            const topPriorityHtml = topPriorityMonthly
                ? '<div class="goals-structure-priority-box">' +
                  '<div class="goals-structure-tier-label">Top priority this month</div>' +
                  '<div class="goals-structure-value goals-structure-priority-value goals-structure-goal-title" data-goal-id="' + topPriorityMonthly.id + '">' + esc(topPriorityMonthly.title) + '</div></div>'
                : '';

            function buildMonthlyRows(byAspectMap, periodLabel, isNextMonth) {
                const dataPeriod = isNextMonth ? ' data-period-label-override="' + periodLabel + '"' : '';
                return aspectOrder.map(a => {
                    /* Skip P1 in list (shown as Top priority this month); arrange rest by priority */
                    const allInAspect = (byAspectMap[a] || []).slice();
                    const goalsInAspect = allInAspect.filter(g => (g.priority ?? 3) !== 1).sort((x, y) => (x.priority ?? 3) - (y.priority ?? 3));
                    const sectorLabel = '<span class="goals-structure-aspect-name">' + a + '</span> ';
                    if (goalsInAspect.length === 0) {
                        return '<div class="goals-structure-aspect" data-aspect="' + a + '" data-empty="1"' + dataPeriod + '>' + sectorLabel + '<span class="goals-structure-aspect-add">—</span></div>';
                    }
                    const goalsHtml = goalsInAspect.map(g => '<span class="goals-structure-goal-title" data-goal-id="' + g.id + '">' + esc(g.title) + '</span>').join(' <span class="goals-structure-sep">·</span> ');
                    return '<div class="goals-structure-aspect" data-aspect="' + a + '"' + dataPeriod + '>' + sectorLabel + goalsHtml + '</div>';
                }).join('');
            }
            const monthlyRows = buildMonthlyRows(byAspect, periods.month, false);

            hierarchyEl.innerHTML =
                '<div class="goals-structure-date">' +
                '<div class="goals-date-year">' + periods.year + '</div>' +
                '<div class="goals-date-subrow">' +
                '<span class="goals-date-monthday">' + periods.shortMonth + ' ' + periods.dayOrdinal + '</span>' +
                '<span class="goals-date-pct">' + periods.passedPct + '%</span>' +
                '</div>' +
                '</div>' +
                '<div class="goals-structure-tier">' +
                '<div class="goals-structure-tier-label">Yearly goal</div>' +
                '<div class="goals-structure-value goals-structure-editable" data-goal-id="' + (yearly ? yearly.id : '') + '" data-period="yearly" data-period-label="' + periods.year + '">' + esc(yearlyDisplay) + '</div>' +
                '</div>' +
                '<div class="goals-structure-tier">' +
                '<div class="goals-structure-tier-label">Quarterly goal</div>' +
                '<div class="goals-structure-value goals-structure-editable" data-goal-id="' + (quarterly ? quarterly.id : '') + '" data-period="quarterly" data-period-label="' + periods.quarter + '">' + esc(quarterlyDisplay) + '</div>' +
                '</div>' +
                topPriorityHtml +
                '<div class="goals-structure-monthly-box">' +
                '<div class="goals-structure-tier-label">Monthly goals</div>' +
                '<div class="goals-structure-monthly">' + monthlyRows + '</div>' +
                '</div>';

            hierarchyEl.querySelectorAll('.goals-structure-editable, .goals-structure-goal-title, .goals-structure-priority-value, .goals-structure-aspect-add, .goals-structure-aspect[data-empty="1"]').forEach(el => {
                el.setAttribute('tabindex', '0');
                el.style.cursor = 'pointer';
            });
            hierarchyEl._goalsData = { goals, periods };
            if (!hierarchyEl._goalsClickBound) {
                hierarchyEl._goalsClickBound = true;
                hierarchyEl.addEventListener('click', function(e) {
                    const target = e.target;
                    const data = hierarchyEl._goalsData || {};
                    const editable = target.closest('.goals-structure-editable');
                    const goalTitle = target.closest('.goals-structure-goal-title');
                    const aspectAdd = target.closest('.goals-structure-aspect-add');
                    const aspectRowEmpty = target.closest('.goals-structure-aspect[data-empty="1"]');
                    if (editable && !editable.classList.contains('editing')) {
                        e.preventDefault();
                        startEditGoalBlock(editable, data.goals || [], data.periods || currentPeriodLabels());
                    } else if (goalTitle && !goalTitle.classList.contains('editing')) {
                        e.preventDefault();
                        startEditMonthlyGoal(goalTitle, data.goals || []);
                    } else if (aspectAdd && !aspectAdd.classList.contains('editing')) {
                        e.preventDefault();
                        const aspect = aspectAdd.dataset.aspect || aspectAdd.closest('.goals-structure-aspect')?.getAttribute('data-aspect');
                        const periodOverride = aspectAdd.closest('[data-period-label-override]')?.getAttribute('data-period-label-override');
                        startAddMonthlyGoal(aspectAdd, data.goals || [], data.periods || currentPeriodLabels(), aspect, periodOverride);
                    } else if (aspectRowEmpty && !aspectRowEmpty.querySelector('.editing')) {
                        e.preventDefault();
                        const aspect = aspectRowEmpty.getAttribute('data-aspect');
                        const periodOverride = aspectRowEmpty.closest('[data-period-label-override]')?.getAttribute('data-period-label-override');
                        startAddMonthlyGoalInRow(aspectRowEmpty, aspect, data.goals || [], data.periods || currentPeriodLabels(), periodOverride);
                    }
                });
                hierarchyEl.addEventListener('keydown', function(e) {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    const target = e.target;
                    const data = hierarchyEl._goalsData || {};
                    const periods = data.periods || currentPeriodLabels();
                    if (target.classList.contains('goals-structure-editable') && !target.classList.contains('editing')) {
                        e.preventDefault();
                        startEditGoalBlock(target, data.goals || [], periods);
                    } else if (target.classList.contains('goals-structure-goal-title') && !target.classList.contains('editing')) {
                        e.preventDefault();
                        startEditMonthlyGoal(target, data.goals || []);
                    } else if (target.classList.contains('goals-structure-aspect-add')) {
                        e.preventDefault();
                        const aspect = target.dataset.aspect || target.closest('.goals-structure-aspect')?.getAttribute('data-aspect');
                        const periodOverride = target.closest('[data-period-label-override]')?.getAttribute('data-period-label-override');
                        startAddMonthlyGoal(target, data.goals || [], periods, aspect, periodOverride);
                    } else if (target.closest('.goals-structure-aspect[data-empty="1"]')) {
                        e.preventDefault();
                        const row = target.closest('.goals-structure-aspect[data-empty="1"]');
                        const periodOverride = row.closest('[data-period-label-override]')?.getAttribute('data-period-label-override');
                        startAddMonthlyGoalInRow(row, row.getAttribute('data-aspect'), data.goals || [], periods, periodOverride);
                    }
                });
            }

            function renderInlineList(listEl, items, type, primaryKey, secondaryKey, createUrl, updateUrl, deleteUrl) {
                if (!listEl) return;
                const hasSecondary = secondaryKey != null && secondaryKey !== '';
                const rowTemplate = { id: null, [primaryKey]: '', _new: true };
                if (hasSecondary) rowTemplate[secondaryKey] = '';
                const rows = items.concat([rowTemplate]);
                listEl.innerHTML = rows.map((item, i) => {
                    const id = item.id;
                    const isNew = item._new;
                    const primaryText = (item[primaryKey] || '').trim();
                    const secondaryText = hasSecondary && item[secondaryKey] ? (item[secondaryKey] || '').trim() : '';
                    const displayText = primaryText ? (primaryText + (secondaryText ? ' — ' + secondaryText : '')) : (isNew ? '' : '');
                    const deleteBtn = (deleteUrl && id) ? '<button type="button" class="goals-inline-delete" data-id="' + id + '" title="Delete">×</button>' : '';
                    const dragHandle = (type === 'maybe' && id) ? '<span class="goals-drag-handle" draggable="true" title="Drag to reorder">⋮⋮</span>' : '';
                    return '<div class="goals-inline-row" data-id="' + (id || '') + '" data-type="' + type + '" data-primary="' + (primaryKey) + '" data-secondary="' + (secondaryKey || '') + '" data-new="' + (isNew ? '1' : '0') + '" tabindex="0">' +
                        dragHandle +
                        '<span class="goals-inline-display">' + (displayText || '').replace(/</g, '&lt;') + '</span>' + deleteBtn +
                        '</div>';
                }).join('');
                listEl.querySelectorAll('.goals-inline-delete').forEach(btn => {
                    btn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        e.preventDefault();
                        const id = this.dataset.id;
                        if (!id || !deleteUrl) return;
                        if (typeof confirm !== 'undefined' && !confirm('Delete this?')) return;
                        fetch(deleteUrl.replace(':id', id), { method: 'DELETE' })
                            .then(r => { if (r.ok) { loadGoals(); if (typeof showToast === 'function') showToast('Deleted', 'success'); } })
                            .catch(() => loadGoals());
                    });
                });
                if (listEl.classList.contains('goals-maybe-draggable')) {
                    let draggedRow = null;
                    listEl.querySelectorAll('.goals-drag-handle').forEach(handle => {
                        handle.addEventListener('dragstart', function(e) {
                            const row = this.closest('.goals-inline-row');
                            if (!row || row.dataset.new === '1') return;
                            draggedRow = row;
                            e.dataTransfer.setData('text/plain', row.dataset.id || '');
                            e.dataTransfer.effectAllowed = 'move';
                            row.classList.add('goals-dragging');
                        });
                        handle.addEventListener('dragend', function() {
                            if (draggedRow) draggedRow.classList.remove('goals-dragging');
                            draggedRow = null;
                        });
                    });
                    listEl.querySelectorAll('.goals-inline-row').forEach(row => {
                        row.addEventListener('dragover', function(e) {
                            if (!draggedRow || row === draggedRow || row.dataset.new === '1') return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                        });
                        row.addEventListener('drop', function(e) {
                            if (!draggedRow || row === draggedRow || row.dataset.new === '1') return;
                            e.preventDefault();
                            const next = row.nextElementSibling;
                            const parent = row.parentNode;
                            parent.insertBefore(draggedRow, row);
                            const ids = [];
                            parent.querySelectorAll('.goals-inline-row[data-id]').forEach(r => { if (r.dataset.id) ids.push(r.dataset.id); });
                            fetch('/api/goals/uncertainties/reorder', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ ids })
                            }).then(res => { if (res.ok) { if (typeof showToast === 'function') showToast('Order saved', 'success'); } else loadGoals(); }).catch(() => loadGoals());
                        });
                    });
                }
                listEl.querySelectorAll('.goals-inline-row').forEach(row => {
                    row.addEventListener('click', function(e) {
                        if (e.target.closest('.goals-inline-delete')) return;
                        if (this.classList.contains('editing')) return;
                        const id = this.dataset.id;
                        const type = this.dataset.type;
                        const primary = this.dataset.primary;
                        const secondary = this.dataset.secondary;
                        const isNew = this.dataset.new === '1';
                        const displayEl = this.querySelector('.goals-inline-display');
                        const text = (displayEl && displayEl.textContent) || '';
                        const parts = text.includes(' — ') ? text.split(' — ', 2) : [text, ''];
                        const primaryVal = parts[0].trim();
                        const secondaryVal = parts[1] || '';
                        this.classList.add('editing');
                        let inputsHtml = '<input class="goals-inline-input" type="text" placeholder="' + (primary === 'title' ? 'e.g. New product line' : 'No: …') + '" value="' + (primaryVal || '').replace(/"/g, '&quot;') + '">';
                        if (hasSecondary) inputsHtml += '<input class="goals-inline-input goals-inline-input-secondary" type="text" placeholder="why / lesson" value="' + (secondaryVal || '').replace(/"/g, '&quot;') + '">';
                        this.innerHTML = inputsHtml;
                        const inp1 = this.querySelector('.goals-inline-input');
                        const inp2 = hasSecondary ? this.querySelector('.goals-inline-input-secondary') : null;
                        inp1.focus();
                        const self = this;
                        function save() {
                            const p = (inp1 && inp1.value) ? inp1.value.trim() : '';
                            const s = (inp2 && inp2.value) ? inp2.value.trim() : '';
                            if (!p && !isNew) { self.classList.remove('editing'); loadGoals(); return; }
                            self.classList.remove('editing');
                            if (isNew && p) {
                                fetch(createUrl, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(primary === 'title' ? { title: p, notes: hasSecondary ? s : null, goal_id: null } : { title: p, why: s, goal_id: null })
                                }).then(r => r.json()).then(() => { loadGoals(); if (typeof showToast === 'function') showToast('Added', 'success'); }).catch(() => { loadGoals(); });
                            } else if (!isNew && id) {
                                const body = primary === 'title' ? { title: p, notes: hasSecondary ? s : null } : { title: p, why: s };
                                fetch(updateUrl.replace(':id', id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
                                    .then(() => { loadGoals(); if (typeof showToast === 'function') showToast('Saved', 'success'); }).catch(() => loadGoals());
                            } else {
                                loadGoals();
                            }
                        }
                        inp1.addEventListener('keydown', function(e) {
                            if (e.key === 'Enter') { e.preventDefault(); save(); }
                            if (e.key === 'Escape') { self.classList.remove('editing'); loadGoals(); }
                        });
                        if (inp2) {
                            inp2.addEventListener('keydown', function(e) {
                                if (e.key === 'Enter') { e.preventDefault(); save(); }
                                if (e.key === 'Escape') { self.classList.remove('editing'); loadGoals(); }
                            });
                        }
                    });
                });
            }

            function startEditGoalBlock(el, goalsList, periods) {
                const goalId = el.dataset.goalId;
                const period = el.dataset.period;
                const periodLabel = el.dataset.periodLabel;
                const goal = goalsList.find(g => String(g.id) === String(goalId));
                const isNew = !goalId || !goal;
                const title = goal ? goal.title : '';
                const desc = goal ? (goal.description || '') : '';
                el.classList.add('editing');
                el.innerHTML = '<input class="goals-inline-input" type="text" placeholder="Title" value="' + esc(title) + '" data-field="title">' +
                    '<input class="goals-inline-input goals-inline-input-secondary" type="text" placeholder="Description (optional)" value="' + esc(desc) + '" data-field="description">';
                const inp1 = el.querySelector('[data-field="title"]');
                const inp2 = el.querySelector('[data-field="description"]');
                inp1.focus();
                function save() {
                    const titleVal = (inp1 && inp1.value) ? inp1.value.trim() : '';
                    const descVal = (inp2 && inp2.value) ? inp2.value.trim() : '';
                    el.classList.remove('editing');
                    if (isNew && titleVal) {
                        fetch('/api/goals', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ title: titleVal, description: descVal || undefined, period_type: period, period_label: periodLabel, aspect: 'general', priority: 3 })
                        }).then(r => r.json()).then(() => { loadGoals(); if (typeof showToast === 'function') showToast('Added', 'success'); }).catch(() => loadGoals());
                    } else if (!isNew && goalId) {
                        fetch('/api/goals/' + goalId, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ title: titleVal || goal.title, description: descVal })
                        }).then(() => { loadGoals(); if (typeof showToast === 'function') showToast('Saved', 'success'); }).catch(() => loadGoals());
                    } else { loadGoals(); }
                }
                inp1.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') { el.classList.remove('editing'); loadGoals(); } });
                inp2.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') { el.classList.remove('editing'); loadGoals(); } });
            }

            function startEditMonthlyGoal(el, goalsList) {
                const goalId = el.dataset.goalId;
                const goal = goalsList.find(g => String(g.id) === String(goalId));
                if (!goal) return;
                const title = goal.title || '';
                const priority = goal.priority != null ? goal.priority : 3;
                el.classList.add('editing');
                el.innerHTML = '<input class="goals-inline-input goals-inline-input-inline" type="text" value="' + esc(title) + '" placeholder="Goal title">' +
                    '<select class="goals-inline-input goals-inline-priority-select" title="Priority (1 = top priority this month)">' +
                    [1,2,3,4,5].map(p => '<option value="' + p + '"' + (priority === p ? ' selected' : '') + '>P' + p + (p === 1 ? ' (top)' : '') + '</option>').join('') +
                    '</select>';
                const inp = el.querySelector('input');
                const sel = el.querySelector('select');
                inp.focus();
                function save() {
                    const titleVal = (inp && inp.value) ? inp.value.trim() : '';
                    const priorityVal = sel ? parseInt(sel.value, 10) : 3;
                    el.classList.remove('editing');
                    if (titleVal && goalId) {
                        fetch('/api/goals/' + goalId, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ title: titleVal, priority: priorityVal })
                        }).then(() => { loadGoals(); if (typeof showToast === 'function') showToast('Saved', 'success'); }).catch(() => loadGoals());
                    } else { loadGoals(); }
                }
                inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') { el.classList.remove('editing'); loadGoals(); } });
                if (sel) sel.addEventListener('change', save);
            }

            function startAddMonthlyGoal(el, goalsList, periods, aspectOverride, periodLabelOverride) {
                const aspect = aspectOverride != null ? aspectOverride : el.dataset.aspect;
                if (!aspect) return;
                const periodLabel = periodLabelOverride != null ? periodLabelOverride : periods.month;
                el.classList.add('editing');
                el.innerHTML = '<input class="goals-inline-input goals-inline-input-inline" type="text" placeholder="Goal title">' +
                    '<select class="goals-inline-input goals-inline-priority-select" title="Priority (1 = top priority this month)">' +
                    [1,2,3,4,5].map(p => '<option value="' + p + '"' + (p === 3 ? ' selected' : '') + '>P' + p + (p === 1 ? ' (top)' : '') + '</option>').join('') +
                    '</select>';
                const inp = el.querySelector('input');
                const sel = el.querySelector('select');
                inp.focus();
                function save() {
                    const titleVal = (inp && inp.value) ? inp.value.trim() : '';
                    const priorityVal = sel ? parseInt(sel.value, 10) : 3;
                    el.classList.remove('editing');
                    if (titleVal) {
                        fetch('/api/goals', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ title: titleVal, period_type: 'monthly', period_label: periodLabel, aspect, priority: priorityVal })
                        }).then(r => r.json()).then(() => { loadGoals(); if (typeof showToast === 'function') showToast('Added', 'success'); }).catch(() => loadGoals());
                    } else { loadGoals(); }
                }
                function cancel() { el.classList.remove('editing'); loadGoals(); }
                inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') cancel(); });
                if (sel) sel.addEventListener('change', () => { if (inp && inp.value.trim()) save(); });
            }

            function startAddMonthlyGoalInRow(row, aspect, goalsList, periods, periodLabelOverride) {
                const periodLabel = periodLabelOverride != null ? periodLabelOverride : periods.month;
                row.removeAttribute('data-empty');
                row.innerHTML = '<span class="goals-structure-aspect-name">' + aspect + '</span> <span class="goals-structure-add-inline editing">' +
                    '<input class="goals-inline-input goals-inline-input-inline" type="text" placeholder="Goal title">' +
                    '<select class="goals-inline-input goals-inline-priority-select" title="Priority (1 = top)">' +
                    [1,2,3,4,5].map(p => '<option value="' + p + '"' + (p === 3 ? ' selected' : '') + '>P' + p + '</option>').join('') +
                    '</select></span>';
                const inp = row.querySelector('input');
                const sel = row.querySelector('select');
                inp.focus();
                function save() {
                    const titleVal = (inp && inp.value) ? inp.value.trim() : '';
                    const priorityVal = sel ? parseInt(sel.value, 10) : 3;
                    if (titleVal) {
                        fetch('/api/goals', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ title: titleVal, period_type: 'monthly', period_label: periodLabel, aspect, priority: priorityVal })
                        }).then(r => r.json()).then(() => { loadGoals(); if (typeof showToast === 'function') showToast('Added', 'success'); }).catch(() => loadGoals());
                    } else { loadGoals(); }
                }
                inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') loadGoals(); });
            }

            renderInlineList(maybeListEl, uncertainties || [], 'maybe', 'title', null, '/api/goals/uncertainties', '/api/goals/uncertainties/:id', '/api/goals/uncertainties/:id');
            renderInlineList(nosListEl, nos || [], 'no', 'title', 'why', '/api/goals/nos', '/api/goals/nos/:id', '/api/goals/nos/:id');

            // Contingency plans A, B, C: render and inline edit
            const contingencyEl = document.getElementById('goalsContingencyPlans');
            if (contingencyEl && Array.isArray(contingencyPlans)) {
                ['a', 'b', 'c'].forEach(planKey => {
                    const row = contingencyEl.querySelector('.goals-contingency-row[data-plan-key="' + planKey + '"]');
                    if (!row) return;
                    const plan = contingencyPlans.find(p => (p.plan_key || '').toLowerCase() === planKey) || {};
                    const planText = (plan.plan_text != null ? plan.plan_text : plan.planText || '').toString().trim() || '—';
                    const eventTrigger = (plan.event_trigger != null ? plan.event_trigger : plan.eventTrigger || '').toString().trim() || '—';
                    const planTextEl = row.querySelector('.goals-contingency-display[data-field="plan_text"]');
                    const triggerEl = row.querySelector('.goals-contingency-display[data-field="event_trigger"]');
                    if (planTextEl) {
                        planTextEl.textContent = planText;
                        planTextEl.style.display = '';
                    }
                    if (triggerEl) {
                        triggerEl.textContent = eventTrigger;
                        triggerEl.style.display = '';
                    }
                    row.classList.remove('editing');
                    row.querySelectorAll('.goals-contingency-input').forEach(inp => inp.remove());
                    const label = row.querySelector('.goals-contingency-label');
                    const triggerLabel = row.querySelector('.goals-contingency-trigger-label');
                    if (!row._contingencyBound) {
                        row._contingencyBound = true;
                        row.setAttribute('tabindex', '0');
                        row.style.cursor = 'pointer';
                        row.addEventListener('click', function(e) {
                            if (this.classList.contains('editing')) return;
                            const planKey = this.dataset.planKey;
                            const planTextD = this.querySelector('.goals-contingency-display[data-field="plan_text"]');
                            const triggerD = this.querySelector('.goals-contingency-display[data-field="event_trigger"]');
                            const planText = (planTextD && planTextD.textContent !== '—') ? planTextD.textContent : '';
                            const trigger = (triggerD && triggerD.textContent !== '—') ? triggerD.textContent : '';
                            this.classList.add('editing');
                            planTextD.style.display = 'none';
                            triggerD.style.display = 'none';
                            const inp1 = document.createElement('input');
                            inp1.className = 'goals-contingency-input';
                            inp1.placeholder = 'Plan ' + planKey.toUpperCase();
                            inp1.value = planText;
                            const inp2 = document.createElement('input');
                            inp2.className = 'goals-contingency-input';
                            inp2.placeholder = 'IF …';
                            inp2.value = trigger;
                            planTextD.after(inp1);
                            triggerLabel.after(inp2);
                            inp1.focus();
                            function save() {
                                const p = (inp1.value || '').trim();
                                const t = (inp2.value || '').trim();
                                row.classList.remove('editing');
                                inp1.remove();
                                inp2.remove();
                                planTextD.style.display = '';
                                triggerD.style.display = '';
                                planTextD.textContent = p || '—';
                                triggerD.textContent = t || '—';
                                fetch('/api/goals/contingency-plans/' + planKey, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ plan_text: p, event_trigger: t })
                                }).then(() => { loadGoals(); if (typeof showToast === 'function') showToast('Saved', 'success'); }).catch(() => loadGoals());
                            }
                            function onBlur() {
                                setTimeout(function() {
                                    var active = document.activeElement;
                                    if (active === inp1 || active === inp2 || row.contains(active)) return;
                                    save();
                                }, 0);
                            }
                            inp1.addEventListener('blur', onBlur);
                            inp2.addEventListener('blur', onBlur);
                            inp1.addEventListener('keydown', function(ev) { if (ev.key === 'Enter') { ev.preventDefault(); inp2.focus(); } if (ev.key === 'Escape') { row.classList.remove('editing'); loadGoals(); } });
                            inp2.addEventListener('keydown', function(ev) { if (ev.key === 'Enter') { ev.preventDefault(); save(); } if (ev.key === 'Escape') { row.classList.remove('editing'); loadGoals(); } });
                        });
                    }
                });
            }
        } catch (e) {
            hierarchyEl.innerHTML = '<p class="empty-state">Could not load goals.</p>';
            if (nosListEl) nosListEl.innerHTML = '';
            if (maybeListEl) maybeListEl.innerHTML = '';
        }
    }

    document.getElementById('addWishlistBtn')?.addEventListener('click', function() {
        const form = document.getElementById('wishlistAddForm');
        form.style.display = form.style.display === 'none' ? 'flex' : 'none';
    });
    document.getElementById('cancelWishlistBtn')?.addEventListener('click', function() {
        document.getElementById('wishlistAddForm').style.display = 'none';
        document.getElementById('wishlistImageInput').value = '';
        const prev = document.getElementById('wishlistImagePreview');
        if (prev) { prev.innerHTML = ''; prev.style.display = 'none'; }
    });

    function setWishlistImageFromFile(file, callback) {
        if (!file || !file.type.startsWith('image/')) {
            if (typeof showToast === 'function') showToast('Please choose an image file', 'error');
            return;
        }
        const reader = new FileReader();
        reader.onload = function() {
            const dataUrl = reader.result;
            const urlInput = document.getElementById('wishlistImageInput');
            const preview = document.getElementById('wishlistImagePreview');
            if (urlInput) urlInput.value = dataUrl;
            if (preview) {
                preview.innerHTML = '<img src="' + dataUrl + '" alt="Preview">';
                preview.style.display = 'block';
            }
            if (callback) callback();
        };
        reader.readAsDataURL(file);
    }

    document.getElementById('wishlistImageFileInput')?.addEventListener('change', function() {
        const file = this.files && this.files[0];
        if (file) setWishlistImageFromFile(file);
        this.value = '';
    });

    (function setupWishlistDropZone() {
        const gallery = document.getElementById('wishlistGallery');
        const addForm = document.getElementById('wishlistAddForm');
        const nameInput = document.getElementById('wishlistNameInput');
        if (!gallery) return;
        function handleDragOver(e) {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'copy';
            gallery.classList.add('wishlist-gallery-drop-active');
        }
        function handleDragLeave(e) {
            e.preventDefault();
            e.stopPropagation();
            if (!gallery.contains(e.relatedTarget)) gallery.classList.remove('wishlist-gallery-drop-active');
        }
        function handleDrop(e) {
            e.preventDefault();
            e.stopPropagation();
            gallery.classList.remove('wishlist-gallery-drop-active');
            const file = e.dataTransfer.files && e.dataTransfer.files[0];
            if (!file || !file.type.startsWith('image/')) {
                if (typeof showToast === 'function') showToast('Drop an image to add to wishlist', 'info');
                return;
            }
            setWishlistImageFromFile(file, function() {
                if (addForm) addForm.style.display = 'flex';
                if (nameInput) { nameInput.focus(); nameInput.placeholder = 'Name this item'; }
                if (typeof showToast === 'function') showToast('Image added — enter name and save', 'info');
            });
        }
        gallery.addEventListener('dragover', handleDragOver);
        gallery.addEventListener('dragenter', handleDragOver);
        gallery.addEventListener('dragleave', handleDragLeave);
        gallery.addEventListener('drop', handleDrop);
    })();
    // Show/hide condition value input based on condition type
    document.getElementById('wishlistConditionTypeInput')?.addEventListener('change', function() {
        const conditionValueInput = document.getElementById('wishlistConditionValueInput');
        if (this.value === 'savings_threshold' || this.value === 'investment_threshold' || this.value === 'asset_threshold') {
            conditionValueInput.style.display = 'block';
            conditionValueInput.placeholder = this.value === 'savings_threshold' ? 'Total Net threshold (e.g. 350000)' :
                                              this.value === 'investment_threshold' ? 'Investment threshold (e.g. 100000)' :
                                              'Asset threshold (e.g. 200000)';
        } else {
            conditionValueInput.style.display = 'none';
        }
    });
    document.getElementById('saveWishlistBtn')?.addEventListener('click', async function() {
        const name = document.getElementById('wishlistNameInput').value.trim();
        const image_url = document.getElementById('wishlistImageInput').value.trim() || null;
        const price_usd = document.getElementById('wishlistPriceInput').value ? parseFloat(document.getElementById('wishlistPriceInput').value) : null;
        const saved_amount = document.getElementById('wishlistSavedInput').value ? parseFloat(document.getElementById('wishlistSavedInput').value) : 0;
        const priority = parseInt(document.getElementById('wishlistPriorityInput').value, 10) || 3;
        const condition_type = document.getElementById('wishlistConditionTypeInput').value || 'none';
        const condition_value = document.getElementById('wishlistConditionValueInput').value ? parseFloat(document.getElementById('wishlistConditionValueInput').value) : null;
        const purchase_condition = document.getElementById('wishlistConditionTextInput').value.trim() || null;
        const goal_id = document.getElementById('wishlistGoalInput').value || null;
        if (!name) {
            if (typeof showToast === 'function') showToast('Enter item name', 'error');
            return;
        }
        try {
            const res = await fetch('/api/wishlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, image_url, price_usd, saved_amount, priority, condition_type, condition_value, purchase_condition, goal_id })
            });
            const data = await res.json().catch(() => ({}));
            if (res.status === 413) {
                if (typeof showToast === 'function') showToast('Image too large — try a smaller photo or use a URL instead', 'error');
                return;
            }
            if (res.ok) {
                document.getElementById('wishlistAddForm').style.display = 'none';
                document.getElementById('wishlistNameInput').value = '';
                document.getElementById('wishlistImageInput').value = '';
                const prev = document.getElementById('wishlistImagePreview');
                if (prev) { prev.innerHTML = ''; prev.style.display = 'none'; }
                document.getElementById('wishlistPriceInput').value = '';
                document.getElementById('wishlistSavedInput').value = '';
                document.getElementById('wishlistConditionTypeInput').value = 'none';
                document.getElementById('wishlistConditionValueInput').value = '';
                document.getElementById('wishlistConditionValueInput').style.display = 'none';
                document.getElementById('wishlistConditionTextInput').value = '';
                loadWishlist();
                if (typeof showToast === 'function') showToast('Added to wishlist', 'success');
            } else {
                const msg = data.error || 'Failed to add wishlist item';
                if (typeof showToast === 'function') showToast(msg, 'error');
            }
        } catch (e) {
            const msg = e.message || 'Failed to add wishlist item';
            if (typeof showToast === 'function') showToast(msg, 'error');
        }
    });

    document.getElementById('addGoalBtn')?.addEventListener('click', function() {
        const form = document.getElementById('goalAddForm');
        form.style.display = form.style.display === 'none' ? 'flex' : 'none';
    });
    document.getElementById('cancelGoalBtn')?.addEventListener('click', function() {
        document.getElementById('goalAddForm').style.display = 'none';
    });
    document.getElementById('saveGoalBtn')?.addEventListener('click', async function() {
        const title = document.getElementById('goalTitleInput').value.trim();
        const period_type = document.getElementById('goalPeriodTypeInput').value;
        const period_label = document.getElementById('goalPeriodLabelInput').value.trim() || new Date().getFullYear().toString();
        const aspect = document.getElementById('goalAspectInput').value;
        const parent_id = document.getElementById('goalParentInput')?.value || null;
        const priority = document.getElementById('goalPriorityInput')?.value;
        if (!title) {
            if (typeof showToast === 'function') showToast('Enter goal title', 'error');
            return;
        }
        try {
            const res = await fetch('/api/goals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, period_type, period_label, aspect, parent_id: parent_id || undefined, priority: priority ? parseInt(priority, 10) : undefined })
            });
            if (res.ok) {
                document.getElementById('goalAddForm').style.display = 'none';
                document.getElementById('goalTitleInput').value = '';
                loadGoals();
                if (typeof showToast === 'function') showToast('Goal added', 'success');
            } else throw new Error('Failed');
        } catch (e) {
            if (typeof showToast === 'function') showToast('Failed to add goal', 'error');
        }
    });

    async function checkMonthlyReportReminder() {
        // Projections tab; monthly report reminder disabled
        const key = 'lifeos_monthly_reminder_' + new Date().toISOString().slice(0, 7);
        if (sessionStorage.getItem(key)) return;
        try {
            // No scenarios API; skip reminder
        } catch (e) {}
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            checkMonthlyReportReminder();
        });
    } else {
        checkMonthlyReportReminder();
    }

    document.getElementById('tabBar')?.addEventListener('click', function(e) {
        const tab = e.target.closest('.tab-bar-tab')?.dataset.tab;
        if (tab) showPanel(tab);
    });

    // More tab sub-navigation
    document.getElementById('moreSubTabs')?.addEventListener('click', function(e) {
        const section = e.target.closest('.more-sub-tab')?.dataset.section;
        if (section) showMoreSection(section);
    });

    window.showPanel = showPanel;
    window.loadWishlist = loadWishlist;
    window.loadGoals = loadGoals;

    // ── PA Modal (defined at module scope so always accessible) ─────────────
    function showPAModal(title, text) {
        const modal = document.getElementById('paBriefModal');
        if (!modal) { console.warn('PA modal element not found'); return; }
        const titleEl = document.getElementById('paBriefModalTitle');
        const bodyEl = document.getElementById('paBriefModalBody');
        if (!bodyEl) { console.warn('PA modal body not found'); return; }
        if (titleEl) titleEl.textContent = title;
        // Convert markdown-ish syntax to HTML
        const html = text
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/^### (.+)$/gm, '<h3>$1</h3>')
            .replace(/^## (.+)$/gm, '<h2>$1</h2>')
            .replace(/^# (.+)$/gm, '<h1>$1</h1>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--border);margin:10px 0">')
            .replace(/\n/g, '<br>');
        bodyEl.innerHTML = html;
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    function closePAModal() {
        const modal = document.getElementById('paBriefModal');
        if (modal) modal.style.display = 'none';
        document.body.style.overflow = '';
    }

    // ── PA Tab ──────────────────────────────────────────────────────────────
    let paInitialised = false;

    function initPATab() {
        loadPADrafts();
        if (!paInitialised) {
            paInitialised = true;
            setupPAHandlers();
        }
    }

    function addPAMessage(role, text, commandResults) {
        const wrap = document.getElementById('paChatMessages');
        if (!wrap) return;
        const div = document.createElement('div');
        div.className = 'pa-message pa-message-' + role;
        let html = text
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');
        // Strip raw COMMAND blocks from display
        html = html.replace(/COMMAND:\s*\w+<br>(\{[\s\S]*?\})?(<br>)?/g, '');
        div.innerHTML = `<div class="pa-message-bubble">${html}</div>`;
        if (commandResults && commandResults.length) {
            const note = document.createElement('div');
            note.className = 'pa-command-results';
            note.textContent = '✓ ' + commandResults.join(' • ');
            div.appendChild(note);
        }
        wrap.appendChild(div);
        wrap.scrollTop = wrap.scrollHeight;
    }

    async function sendPAMessage(message) {
        if (!message.trim()) return;
        addPAMessage('user', message);
        const input = document.getElementById('paChatInput');
        if (input) input.value = '';

        const thinking = document.createElement('div');
        thinking.className = 'pa-message pa-message-assistant pa-thinking';
        thinking.innerHTML = '<div class="pa-message-bubble">Thinking…</div>';
        const wrap = document.getElementById('paChatMessages');
        if (wrap) { wrap.appendChild(thinking); wrap.scrollTop = wrap.scrollHeight; }

        try {
            const res = await fetch('/api/pa/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message })
            });
            const data = await res.json();
            thinking.remove();
            addPAMessage('assistant', data.response || data.error || 'No response', data.commandResults);
            loadPADrafts();
        } catch (e) {
            thinking.remove();
            addPAMessage('assistant', 'Error reaching PA. Is the server running?');
        }
    }

    async function loadPADrafts() {
        try {
            const res = await fetch('/api/pa/drafts');
            const drafts = await res.json();
            const section = document.getElementById('paDraftsSection');
            const list = document.getElementById('paDraftsList');
            if (!section || !list) return;
            if (!drafts.length) { section.style.display = 'none'; return; }
            section.style.display = 'block';
            list.innerHTML = drafts.filter(d => d.status === 'draft').map(d => `
                <div class="pa-draft-card" data-id="${d.id}">
                    <div class="pa-draft-header">
                        <span class="pa-draft-to">${d.to_email || 'No recipient'}</span>
                        <span class="pa-draft-subject">${d.subject || '(no subject)'}</span>
                        <button class="inbox-dismiss pa-draft-discard" data-id="${d.id}" title="Discard">✕</button>
                    </div>
                    <div class="pa-draft-body">${(d.body || '').slice(0, 200)}${d.body && d.body.length > 200 ? '…' : ''}</div>
                </div>
            `).join('');
        } catch (e) { /* */ }
    }

    function setupPAHandlers() {
        document.getElementById('paChatSend')?.addEventListener('click', () => {
            const input = document.getElementById('paChatInput');
            sendPAMessage(input?.value || '');
        });
        document.getElementById('paChatInput')?.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const input = document.getElementById('paChatInput');
                sendPAMessage(input?.value || '');
            }
        });
        // ── PA Modal wiring ──────────────────────────────────────────────
        document.getElementById('paBriefModalClose')?.addEventListener('click', closePAModal);
        document.getElementById('paBriefModal')?.addEventListener('click', e => {
            if (e.target === e.currentTarget) closePAModal();
        });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') closePAModal();
        });

        document.getElementById('paBriefBtn')?.addEventListener('click', async () => {
            const btn = document.getElementById('paBriefBtn');
            btn.textContent = '…';
            btn.disabled = true;
            try {
                const res = await fetch('/api/pa/brief', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'daily' }) });
                const data = await res.json();
                showPAModal('Daily Briefing', data.briefing || data.error || 'No briefing generated.');
            } catch (e) { showPAModal('Error', 'Failed to generate briefing.'); }
            btn.textContent = 'Brief me'; btn.disabled = false;
        });
        document.getElementById('paPrioritizeBtn')?.addEventListener('click', async () => {
            const btn = document.getElementById('paPrioritizeBtn');
            btn.textContent = '…';
            btn.disabled = true;
            try {
                const res = await fetch('/api/pa/prioritize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
                const data = await res.json();
                showPAModal('Priorities', data.priorities || data.error || 'No response.');
            } catch (e) { showPAModal('Error', 'Failed to prioritise.'); }
            btn.textContent = 'Prioritise'; btn.disabled = false;
        });
        document.getElementById('paDraftsList')?.addEventListener('click', async e => {
            const btn = e.target.closest('.pa-draft-discard');
            if (btn) {
                await fetch(`/api/pa/drafts/${btn.dataset.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'discarded' }) });
                loadPADrafts();
            }
        });
    }

    // ── Inbox Tab (Tiered: Urgent / Medium / Ignored) ───────────────────────
    let inboxActiveSource = '';
    let inboxInitialised = false;

    function initInboxTab() {
        loadInboxCounts();
        loadInbox();
        if (!inboxInitialised) {
            inboxInitialised = true;
            setupInboxHandlers();
        }
    }

    function urgencyLabel(score) {
        return ({ 1: 'FYI', 2: 'Low', 3: 'Medium', 4: 'High', 5: 'Critical' })[score] || 'Medium';
    }

    function sourceIcon(source) {
        return source === 'gmail' ? '✉' : source === 'outlook' ? '📧' : source === 'whatsapp' ? '💬' : '📩';
    }

    function esc(s) { return typeof escHtml === 'function' ? escHtml(s) : (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }

    const ACTION_TAG_CONFIG = {
        reply_needed: { label: 'Reply needed', cls: 'action-reply' },
        approval:     { label: 'Approval',     cls: 'action-approval' },
        payment:      { label: 'Payment',      cls: 'action-payment' },
        deadline:     { label: 'Deadline',      cls: 'action-deadline' },
        meeting:      { label: 'Meeting',       cls: 'action-meeting' },
        question:     { label: 'Question',      cls: 'action-question' },
        fyi:          { label: 'FYI',           cls: 'action-fyi' },
    };

    function renderInboxCard(msg) {
        const card = document.createElement('div');
        const tier = msg.priority_tier || 'medium';
        card.className = `inbox-card inbox-tier-${tier}`;
        card.dataset.id = msg.id;
        card.dataset.sender = msg.sender_address || '';
        card.dataset.senderAddress = msg.sender_address || '';
        card.dataset.source = msg.source || '';
        const privacy = document.getElementById('inboxPrivacyMode')?.checked;
        const date = msg.received_at ? new Date(msg.received_at).toLocaleString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

        // Action tag badge (always visible)
        const atCfg = ACTION_TAG_CONFIG[msg.action_tag] || ACTION_TAG_CONFIG.fyi;
        const actionBadge = `<span class="inbox-action-tag ${atCfg.cls}">${atCfg.label}</span>`;

        // Contact type icon (always visible)
        const typeIcon = msg.contact_type === 'business' ? '<span class="inbox-type-icon" title="Work">💼</span>'
            : msg.contact_type === 'personal' ? '<span class="inbox-type-icon" title="Personal">🏠</span>' : '';

        const categoryBadge = msg.category ? `<span class="inbox-category-badge">${esc(msg.category)}</span>` : '';
        const projectBadge = msg.project_name ? `<span class="inbox-project-badge">${esc(msg.project_name)}</span>` : '';

        // Privacy mode: initials + type icon, hide content but keep action context
        const fullName = msg.sender_name || msg.sender_address || 'Unknown';
        const senderDisplay = privacy
            ? fullName.split(/[\s@]+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
            : esc(fullName);

        const labelIcon = msg.contact_label === 'vip' ? '<span class="inbox-contact-label vip" title="VIP">⭐</span>'
            : msg.contact_label === 'blocked' ? '<span class="inbox-contact-label blocked" title="Blocked">🚫</span>'
            : msg.contact_label === 'ignored' ? '<span class="inbox-contact-label ignored" title="Ignored">👻</span>'
            : '';

        // Privacy: hide subject + preview text, keep everything else
        const subjectHtml = msg.subject
            ? `<div class="inbox-subject">${privacy ? '<span style="color:var(--text-dim)">—</span>' : esc(msg.subject)}</div>`
            : '';
        const summaryHtml = (msg.ai_summary || msg.preview)
            ? `<div class="inbox-summary">${privacy ? '' : esc(msg.ai_summary || msg.preview)}</div>`
            : '';

        card.innerHTML = `
            <div class="inbox-card-header">
                <span class="inbox-source-icon" title="${msg.source}">${sourceIcon(msg.source)}</span>
                ${typeIcon}${labelIcon}<span class="inbox-sender">${senderDisplay}</span>
                ${msg.msg_count > 1 ? `<span class="inbox-msg-count">${msg.msg_count}</span>` : ''}
                ${actionBadge}${categoryBadge}${projectBadge}
                <span class="inbox-urgency inbox-urgency-${msg.urgency_score}">${urgencyLabel(msg.urgency_score)}</span>
                <span class="inbox-date">${date}</span>
                <div class="inbox-quick-actions">
                    <button class="inbox-action-btn" data-action="save-contact" data-address="${esc(msg.sender_address || '')}" data-name="${esc(msg.sender_name || '')}" data-id="${msg.id}" data-contact-id="${msg.contact_id || ''}" title="Save contact">👤</button>
                    <button class="inbox-action-btn" data-action="block" data-address="${esc(msg.sender_address || '')}" title="Block sender">🚫</button>
                    <button class="inbox-action-btn" data-action="ignore" data-address="${esc(msg.sender_address || '')}" data-name="${esc(msg.sender_name || '')}" title="Ignore sender">👻</button>
                    <button class="inbox-action-btn" data-action="vip" data-address="${esc(msg.sender_address || '')}" data-name="${esc(msg.sender_name || '')}" title="Mark VIP">⭐</button>
                    <button class="inbox-action-btn" data-action="assign-project" data-id="${msg.id}" title="Assign to project">📁</button>
                    <button class="inbox-dismiss" title="Dismiss" data-id="${msg.id}">✕</button>
                </div>
            </div>
            ${subjectHtml}
            ${summaryHtml}
            <div class="inbox-reply-section">
                <textarea class="inbox-reply-input" placeholder="Reply…" rows="2">${msg.ai_suggested_reply || ''}</textarea>
                <div class="inbox-reply-actions">
                    <button class="btn-save btn-small inbox-send-btn" data-id="${msg.id}">Send</button>
                </div>
            </div>`;
        return card;
    }

    function updateSectionCounts() {
        ['Urgent', 'Medium', 'Ignored'].forEach(tier => {
            const container = document.getElementById('inboxList' + tier);
            const countEl = document.getElementById('inboxCount' + tier);
            if (!container || !countEl) return;
            const cards = container.querySelectorAll('.inbox-card');
            countEl.textContent = cards.length;
            if (!cards.length && !container.querySelector('.inbox-empty')) {
                container.innerHTML = '<div class="inbox-empty" style="padding:8px 12px;font-size:12px;color:var(--text-dim);">None</div>';
            }
        });
    }

    function renderInboxSection(containerId, msgs, countId) {
        const container = document.getElementById(containerId);
        const countEl = document.getElementById(countId);
        if (!container) return;
        container.innerHTML = '';
        if (countEl) countEl.textContent = msgs.length;
        if (!msgs.length) {
            container.innerHTML = '<div class="inbox-empty" style="padding:8px 12px;font-size:12px;color:var(--text-dim);">None</div>';
            return;
        }
        msgs.forEach(msg => container.appendChild(renderInboxCard(msg)));
    }

    let inboxActiveContext = ''; // '' = all, 'personal', 'work', or project_id string

    async function loadInbox() {
        try {
            const source = inboxActiveSource;
            let url = '/api/messages/tiered?';
            if (source) url += `source=${source}&`;
            if (inboxActiveContext) url += `context=${inboxActiveContext}&`;
            const res = await fetch(url);
            const { urgent, medium, ignored } = await res.json();
            renderInboxSection('inboxListUrgent', urgent, 'inboxCountUrgent');
            renderInboxSection('inboxListMedium', medium, 'inboxCountMedium');
            renderInboxSection('inboxListIgnored', ignored, 'inboxCountIgnored');

            // Scroll to specific sender if navigated from home tab
            if (window._inboxScrollTo) {
                const target = window._inboxScrollTo;
                delete window._inboxScrollTo;
                setTimeout(() => {
                    const cards = document.querySelectorAll('.inbox-card');
                    for (const card of cards) {
                        if (card.dataset.senderAddress === target.sender && card.dataset.source === target.source) {
                            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            card.classList.add('inbox-card-highlighted');
                            setTimeout(() => card.classList.remove('inbox-card-highlighted'), 3000);
                            break;
                        }
                    }
                }, 200);
            }
        } catch (e) {
            const el = document.getElementById('inboxListUrgent');
            if (el) el.innerHTML = '<div class="inbox-empty">Failed to load messages.</div>';
        }
    }

    async function loadInboxCounts() {
        try {
            const res = await fetch('/api/messages/counts');
            const counts = await res.json();

            // Update top-level tab badge
            const tabBadge = document.getElementById('inboxTabBadge');
            if (tabBadge) { tabBadge.textContent = counts.total > 0 ? counts.total : ''; tabBadge.style.display = counts.total > 0 ? 'inline' : 'none'; }

            // Build dynamic context tabs
            const container = document.getElementById('inboxContextTabs');
            if (!container) return;

            // Update All badge
            const allBadge = document.getElementById('inboxBadgeAll');
            if (allBadge) { allBadge.textContent = counts.total > 0 ? counts.total : ''; allBadge.style.display = counts.total > 0 ? 'inline' : 'none'; }

            // Remove old dynamic tabs (keep the "All" button)
            container.querySelectorAll('.inbox-source-tab[data-context]:not([data-context=""])').forEach(el => el.remove());

            // Add context tabs from API
            const contexts = counts.contexts || [];
            for (const ctx of contexts) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'inbox-source-tab';
                const ctxValue = ctx.project_id ? String(ctx.project_id) : (ctx.context_name === 'Personal' ? 'personal' : 'work');
                btn.dataset.context = ctxValue;
                if (ctxValue === inboxActiveContext) btn.classList.add('active');
                btn.innerHTML = esc(ctx.context_name) + (ctx.count > 0 ? ' <span class="inbox-badge" style="display:inline">' + ctx.count + '</span>' : '');
                btn.addEventListener('click', function() {
                    container.querySelectorAll('.inbox-source-tab').forEach(b => b.classList.remove('active'));
                    this.classList.add('active');
                    inboxActiveContext = this.dataset.context;
                    inboxActiveSource = '';
                    loadInbox();
                });
                container.appendChild(btn);
            }
        } catch (e) { /* */ }
    }

    async function inboxBlockSender(address, name) {
        if (!address) return;
        try {
            let contact = await fetch('/api/contacts/lookup', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sender_address: address })
            }).then(r => r.json());
            if (contact && contact.id) {
                await fetch(`/api/contacts/${contact.id}/block`, { method: 'POST' });
            } else {
                await fetch('/api/contacts', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: name || address, phone: address, label: 'blocked' })
                });
            }
            loadInbox();
            loadInboxCounts();
        } catch (e) { /* */ }
    }

    async function inboxMarkVip(address, name) {
        if (!address) return;
        try {
            let contact = await fetch('/api/contacts/lookup', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sender_address: address })
            }).then(r => r.json());
            if (contact && contact.id) {
                await fetch(`/api/contacts/${contact.id}/promote`, { method: 'POST' });
            } else {
                await fetch('/api/contacts', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: name || address, phone: address, label: 'vip' })
                });
            }
            loadInbox();
        } catch (e) { /* */ }
    }

    async function inboxIgnoreSender(address, name) {
        if (!address) return;
        try {
            let contact = await fetch('/api/contacts/lookup', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sender_address: address })
            }).then(r => r.json());
            if (contact && contact.id) {
                await fetch(`/api/contacts/${contact.id}/ignore`, { method: 'POST' });
            } else {
                await fetch('/api/contacts', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: name || address, phone: address, label: 'ignored' })
                });
            }
            loadInbox();
            loadInboxCounts();
        } catch (e) { /* */ }
    }

    async function inboxSaveContact(btn) {
        const card = btn.closest('.inbox-card');
        if (!card) return;
        // Toggle: remove existing form if open
        const existingForm = card.querySelector('.inbox-contact-form');
        if (existingForm) { existingForm.remove(); return; }

        const address = btn.dataset.address;
        const name = btn.dataset.name || address;
        const contactId = btn.dataset.contactId;

        // Try to load existing contact data
        let existing = null;
        try {
            if (contactId) {
                existing = await fetch(`/api/contacts/${contactId}`).then(r => r.json());
            } else {
                existing = await fetch('/api/contacts/lookup', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sender_address: address })
                }).then(r => r.json());
            }
        } catch (e) { /* no existing contact */ }

        // Load active projects for dropdown
        let projects = [];
        try { projects = await fetch('/api/projects').then(r => r.json()); } catch (e) { /* */ }
        const activeProjects = (Array.isArray(projects) ? projects : []).filter(p => p.status === 'active');

        const form = document.createElement('div');
        form.className = 'inbox-contact-form';
        form.innerHTML = `
            <div class="contact-form-row">
                <input type="text" class="contact-form-name todo-input" placeholder="Name" value="${esc(existing?.name || name)}">
                <select class="contact-form-type todo-input">
                    <option value="personal" ${(!existing?.type || existing?.type === 'personal') ? 'selected' : ''}>🏠 Personal</option>
                    <option value="business" ${existing?.type === 'business' ? 'selected' : ''}>💼 Work</option>
                </select>
            </div>
            <div class="contact-form-row">
                <select class="contact-form-relationship todo-input">
                    <option value="">Relationship…</option>
                    <option value="lover" ${existing?.relationship === 'lover' ? 'selected' : ''}>Lover</option>
                    <option value="bestie" ${existing?.relationship === 'bestie' ? 'selected' : ''}>Bestie</option>
                    <option value="key_partner" ${existing?.relationship === 'key_partner' ? 'selected' : ''}>Key Partner</option>
                    <option value="client" ${existing?.relationship === 'client' ? 'selected' : ''}>Client</option>
                    <option value="investor" ${existing?.relationship === 'investor' ? 'selected' : ''}>Investor</option>
                    <option value="co_founder" ${existing?.relationship === 'co_founder' ? 'selected' : ''}>Co-founder</option>
                    <option value="vendor" ${existing?.relationship === 'vendor' ? 'selected' : ''}>Vendor</option>
                    <option value="acquaintance" ${existing?.relationship === 'acquaintance' ? 'selected' : ''}>Acquaintance</option>
                </select>
                <select class="contact-form-project todo-input">
                    <option value="">Project…</option>
                    ${activeProjects.map(p => `<option value="${p.id}" ${existing?.project_id == p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
                </select>
            </div>
            <div class="contact-form-row contact-form-actions">
                <button class="btn-save btn-small contact-form-save" data-address="${esc(address)}" data-contact-id="${existing?.id || ''}">Save</button>
                <button class="btn-small contact-form-cancel">Cancel</button>
            </div>
        `;
        card.appendChild(form);
    }

    async function submitContactForm(form) {
        const address = form.querySelector('.contact-form-save').dataset.address;
        const contactId = form.querySelector('.contact-form-save').dataset.contactId;
        const name = form.querySelector('.contact-form-name').value.trim();
        const type = form.querySelector('.contact-form-type').value;
        const relationship = form.querySelector('.contact-form-relationship').value || null;
        const projectId = form.querySelector('.contact-form-project').value || null;

        if (!name) return;

        try {
            if (contactId) {
                await fetch(`/api/contacts/${contactId}`, {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, type, relationship, project_id: projectId ? Number(projectId) : null })
                });
            } else {
                await fetch('/api/contacts', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, phone: address, type, relationship, project_id: projectId ? Number(projectId) : null })
                });
            }
            form.remove();
            loadInbox();
        } catch (e) { /* */ }
    }

    async function inboxAssignProject(msgId, btn) {
        // Show a small inline project picker
        const existing = btn.closest('.inbox-card')?.querySelector('.inbox-project-picker');
        if (existing) { existing.remove(); return; }
        const picker = document.createElement('select');
        picker.className = 'inbox-project-picker todo-input';
        picker.style.cssText = 'font-size:11px;width:140px;position:absolute;right:0;top:20px;z-index:10;';
        picker.innerHTML = '<option value="">— Choose project —</option>';
        try {
            const projects = await fetch('/api/projects').then(r => r.json());
            (Array.isArray(projects) ? projects : []).filter(p => p.status === 'active').forEach(p => {
                picker.innerHTML += `<option value="${p.id}">${esc(p.name)}</option>`;
            });
        } catch (e) { return; }
        btn.parentElement.style.position = 'relative';
        btn.parentElement.appendChild(picker);
        picker.focus();
        picker.addEventListener('change', async function() {
            const projectId = this.value;
            if (!projectId) { this.remove(); return; }
            try {
                await fetch(`/api/messages/${msgId}`, {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ project_id: Number(projectId) })
                });
                this.remove();
                loadInbox();
            } catch (e) { this.remove(); }
        });
        picker.addEventListener('blur', function() { setTimeout(() => this.remove(), 200); });
    }

    function setupInboxHandlers() {
        // "All" tab click
        const allTab = document.querySelector('.inbox-source-tab[data-context=""]');
        if (allTab) {
            allTab.addEventListener('click', function() {
                document.querySelectorAll('.inbox-source-tab').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                inboxActiveContext = '';
                inboxActiveSource = '';
                loadInbox();
            });
        }

        // Privacy toggle
        document.getElementById('inboxPrivacyMode')?.addEventListener('change', () => loadInbox());

        // Sync button
        document.getElementById('inboxSyncBtn')?.addEventListener('click', async function() {
            this.textContent = 'Syncing…'; this.disabled = true;
            try { await fetch('/api/messages/sync', { method: 'POST' }); setTimeout(() => { loadInbox(); loadInboxCounts(); }, 2000); } catch (e) { /* */ }
            setTimeout(() => { this.textContent = 'Sync'; this.disabled = false; }, 3000);
        });

        // Contacts overlay toggle
        document.getElementById('inboxContactsBtn')?.addEventListener('click', function() {
            const overlay = document.getElementById('contactsOverlay');
            if (overlay) {
                overlay.style.display = 'flex';
                if (typeof window.__loadContacts === 'function') window.__loadContacts();
            }
        });
        document.getElementById('contactsCloseBtn')?.addEventListener('click', function() {
            const overlay = document.getElementById('contactsOverlay');
            if (overlay) overlay.style.display = 'none';
        });
        document.getElementById('contactsOverlay')?.addEventListener('click', function(e) {
            if (e.target === this) this.style.display = 'none';
        });

        // Section collapse/expand
        document.querySelectorAll('.inbox-section-header').forEach(header => {
            header.addEventListener('click', function() {
                const body = this.nextElementSibling;
                const toggle = this.querySelector('.inbox-section-toggle');
                if (body.style.display === 'none') {
                    body.style.display = '';
                    toggle.innerHTML = '&#9660;';
                    this.classList.remove('collapsed');
                } else {
                    body.style.display = 'none';
                    toggle.innerHTML = '&#9654;';
                    this.classList.add('collapsed');
                }
            });
        });

        // Delegated click handlers on inbox sections
        document.getElementById('panel-inbox')?.addEventListener('click', async function(e) {
            // Quick action: save contact
            const saveBtn = e.target.closest('.inbox-action-btn[data-action="save-contact"]');
            if (saveBtn) {
                inboxSaveContact(saveBtn);
                return;
            }
            // Save contact form submit
            const submitBtn = e.target.closest('.contact-form-save');
            if (submitBtn) {
                const form = submitBtn.closest('.inbox-contact-form');
                if (form) await submitContactForm(form);
                return;
            }
            // Save contact form cancel
            const cancelBtn = e.target.closest('.contact-form-cancel');
            if (cancelBtn) {
                cancelBtn.closest('.inbox-contact-form')?.remove();
                return;
            }
            // Quick action: block sender
            const blockBtn = e.target.closest('.inbox-action-btn[data-action="block"]');
            if (blockBtn) {
                inboxBlockSender(blockBtn.dataset.address, '');
                return;
            }
            // Quick action: mark VIP
            const vipBtn = e.target.closest('.inbox-action-btn[data-action="vip"]');
            if (vipBtn) {
                inboxMarkVip(vipBtn.dataset.address, vipBtn.dataset.name);
                return;
            }
            // Quick action: ignore sender
            const ignoreBtn = e.target.closest('.inbox-action-btn[data-action="ignore"]');
            if (ignoreBtn) {
                inboxIgnoreSender(ignoreBtn.dataset.address, ignoreBtn.dataset.name);
                return;
            }
            // Quick action: assign to project
            const assignBtn = e.target.closest('.inbox-action-btn[data-action="assign-project"]');
            if (assignBtn) {
                inboxAssignProject(assignBtn.dataset.id, assignBtn);
                return;
            }
            // Dismiss sender (all messages from this sender)
            const dismissBtn = e.target.closest('.inbox-dismiss');
            if (dismissBtn) {
                const card = dismissBtn.closest('.inbox-card');
                const address = card?.dataset.sender;
                const source = card?.dataset.source;
                try {
                    if (address && source) {
                        await fetch('/api/messages/by-sender', {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ source, sender_address: address })
                        });
                    } else {
                        await fetch(`/api/messages/${dismissBtn.dataset.id}`, { method: 'DELETE' });
                    }
                    card?.remove();
                    loadInboxCounts();
                    // Update section counts after removal
                    updateSectionCounts();
                } catch (e) { /* */ }
                return;
            }
            // Send reply
            const sendBtn = e.target.closest('.inbox-send-btn');
            if (sendBtn) {
                const id = sendBtn.dataset.id;
                const card = sendBtn.closest('.inbox-card');
                const replyText = card?.querySelector('.inbox-reply-input')?.value?.trim();
                if (!replyText) return;
                sendBtn.textContent = 'Sending…'; sendBtn.disabled = true;
                try {
                    const res = await fetch(`/api/messages/${id}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reply_text: replyText }) });
                    if (res.ok) { card.classList.add('inbox-card-sent'); setTimeout(() => { card.remove(); loadInboxCounts(); updateSectionCounts(); }, 800); }
                    else { sendBtn.textContent = 'Failed'; sendBtn.disabled = false; }
                } catch (e) { sendBtn.textContent = 'Error'; sendBtn.disabled = false; }
                return;
            }

            // Click on card header → expand/collapse conversation history
            const cardHeader = e.target.closest('.inbox-card-header');
            if (cardHeader && !e.target.closest('.inbox-quick-actions') && !e.target.closest('button') && !e.target.closest('textarea')) {
                const card = cardHeader.closest('.inbox-card');
                if (!card) return;
                const source = card.dataset.source;
                const sender = card.dataset.senderAddress || card.dataset.sender;
                const msgCount = parseInt(card.querySelector('.inbox-msg-count')?.textContent) || 1;

                // Toggle existing conversation
                const existing = card.querySelector('.inbox-convo-history');
                if (existing) {
                    existing.remove();
                    return;
                }

                // Only fetch if there are multiple messages
                if (msgCount <= 1) return;

                try {
                    const params = new URLSearchParams({ source, sender_address: sender, limit: '10' });
                    const res = await fetch('/api/messages/by-sender?' + params);
                    const messages = await res.json();
                    if (messages.length <= 1) return;

                    const convoDiv = document.createElement('div');
                    convoDiv.className = 'inbox-convo-history';
                    messages.slice(1).forEach(m => {
                        const time = m.received_at ? new Date(m.received_at).toLocaleString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
                        const actionTag = m.action_tag || 'fyi';
                        const atCfg2 = ACTION_TAG_CONFIG[actionTag] || ACTION_TAG_CONFIG.fyi;
                        const row = document.createElement('div');
                        row.className = 'inbox-convo-msg';
                        row.innerHTML =
                            `<span class="inbox-convo-time">${time}</span>` +
                            `<span class="inbox-action-tag ${atCfg2.cls}" style="font-size:9px;padding:1px 4px;">${atCfg2.label}</span>` +
                            `<span class="inbox-convo-text">${esc((m.subject && m.subject !== m.preview) ? m.subject + ' — ' : '')}${esc((m.preview || m.ai_summary || '').slice(0, 120))}</span>`;
                        convoDiv.appendChild(row);
                    });
                    // Insert after the header, before subject/summary
                    const subjectEl = card.querySelector('.inbox-subject') || card.querySelector('.inbox-summary');
                    if (subjectEl) card.insertBefore(convoDiv, subjectEl);
                    else card.appendChild(convoDiv);
                } catch (err) { /* silent */ }
            }
        });
    }

    // Refresh inbox badge every 60s
    setInterval(() => loadInboxCounts(), 60000);
    loadInboxCounts();

    // PA lives in sidebar — init immediately on page load
    initPATab();
})();
