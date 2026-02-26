/* ================================================================
   Life OS Dashboard — Goals UI
   ================================================================
   Yearly → quarterly → monthly goal hierarchy with inline editing,
   nos/uncertainties/contingency plans, aspect-based grouping.

   Depends on: utils.js (MONTH_NAMES)
   Exposes: loadGoals (via window)
   ================================================================ */

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
        const yearlyDisplay = yearly ? (yearly.title + (yearly.description ? ' \u2014 ' + yearly.description : '')) : '\u2014';
        const quarterlyDisplay = quarterly ? quarterly.title : '\u2014';
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
                    return '<div class="goals-structure-aspect" data-aspect="' + a + '" data-empty="1"' + dataPeriod + '>' + sectorLabel + '<span class="goals-structure-aspect-add">\u2014</span></div>';
                }
                const goalsHtml = goalsInAspect.map(g => '<span class="goals-structure-goal-title" data-goal-id="' + g.id + '">' + esc(g.title) + '</span>').join(' <span class="goals-structure-sep">\u00B7</span> ');
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
                const displayText = primaryText ? (primaryText + (secondaryText ? ' \u2014 ' + secondaryText : '')) : (isNew ? '' : '');
                const deleteBtn = (deleteUrl && id) ? '<button type="button" class="goals-inline-delete" data-id="' + id + '" title="Delete">\u00D7</button>' : '';
                const dragHandle = (type === 'maybe' && id) ? '<span class="goals-drag-handle" draggable="true" title="Drag to reorder">\u22EE\u22EE</span>' : '';
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
                    const parts = text.includes(' \u2014 ') ? text.split(' \u2014 ', 2) : [text, ''];
                    const primaryVal = parts[0].trim();
                    const secondaryVal = parts[1] || '';
                    this.classList.add('editing');
                    let inputsHtml = '<input class="goals-inline-input" type="text" placeholder="' + (primary === 'title' ? 'e.g. New product line' : 'No: \u2026') + '" value="' + (primaryVal || '').replace(/"/g, '&quot;') + '">';
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
                const planText = (plan.plan_text != null ? plan.plan_text : plan.planText || '').toString().trim() || '\u2014';
                const eventTrigger = (plan.event_trigger != null ? plan.event_trigger : plan.eventTrigger || '').toString().trim() || '\u2014';
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
                        const planText = (planTextD && planTextD.textContent !== '\u2014') ? planTextD.textContent : '';
                        const trigger = (triggerD && triggerD.textContent !== '\u2014') ? triggerD.textContent : '';
                        this.classList.add('editing');
                        planTextD.style.display = 'none';
                        triggerD.style.display = 'none';
                        const inp1 = document.createElement('input');
                        inp1.className = 'goals-contingency-input';
                        inp1.placeholder = 'Plan ' + planKey.toUpperCase();
                        inp1.value = planText;
                        const inp2 = document.createElement('input');
                        inp2.className = 'goals-contingency-input';
                        inp2.placeholder = 'IF \u2026';
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
                            planTextD.textContent = p || '\u2014';
                            triggerD.textContent = t || '\u2014';
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

// ── Goal add form handlers ───────────────────────────────────────────────────

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

// Expose globally
window.loadGoals = loadGoals;
