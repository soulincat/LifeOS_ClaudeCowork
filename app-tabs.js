(function() {
    let currentTab = 'dashboard';

    function showPanel(tab) {
        currentTab = tab;
        document.querySelectorAll('.main-panel').forEach(el => { el.style.display = 'none'; });
        document.querySelectorAll('.tab-bar-tab').forEach(el => { el.classList.remove('active'); });
        const panel = document.getElementById('panel-' + tab);
        const tabBtn = document.querySelector('.tab-bar-tab[data-tab="' + tab + '"]');
        if (panel) panel.style.display = 'block';
        if (tabBtn) tabBtn.classList.add('active');
        if (tab === 'wishlist') loadWishlist();
        if (tab === 'goals') loadGoals();
        if (tab === 'scenarios' && typeof initProjectionTab === 'function') initProjectionTab();
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
            const [goalsRes, nosUncertaintiesRes] = await Promise.all([
                fetch('/api/goals?withDetail=1'),
                fetch('/api/goals/nos-and-uncertainties')
            ]);
            const goals = await goalsRes.json();
            const { nos, uncertainties } = await nosUncertaintiesRes.json();
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

    window.showPanel = showPanel;
    window.loadWishlist = loadWishlist;
    window.loadGoals = loadGoals;
})();
