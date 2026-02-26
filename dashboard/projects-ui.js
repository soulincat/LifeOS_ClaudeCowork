/* ================================================================
   Life OS Dashboard — Project Detail UI
   ================================================================
   Full project detail panel: header, phase stepper, milestones,
   tasks, dependencies, keywords, stats, inline editing.

   Depends on: utils.js, api.js
   Exposes: openProjectDetail, loadProjectDetail (via window)
   ================================================================ */

let pdCurrentProject = null;       // full detail payload
let pdTaskFilter = 'open';         // current task filter
let pdDetailHandlersReady = false; // set up once, reuse across projects

/** Open the project detail panel for a given project ID.
 *  skipShowPanel: true when called from showPanel() itself (avoids recursion) */
function openProjectDetail(projectId, skipShowPanel) {
    if (!skipShowPanel && typeof window.showPanel === 'function') {
        window.showPanel('project-' + projectId);
        return;
    }
    loadProjectDetail(projectId);
}

async function loadProjectDetail(projectId) {
    try {
        const data = await API.get('/api/projects/' + projectId + '/detail');
        if (data.error) { console.warn('Project detail error:', data.error); return; }
        pdCurrentProject = data;
        pdTaskFilter = 'open';
        renderProjectDetail(data);
        setupProjectDetailHandlers();
    } catch (e) {
        console.warn('loadProjectDetail failed:', e);
    }
}

function renderProjectDetail(data) {
    const { project, tasks, milestones, dependencies } = data;
    if (!project) return;

    // ── Header ──
    const nameEl = document.getElementById('pdProjectName');
    const badgeEl = document.getElementById('pdHealthBadge');
    const pctEl = document.getElementById('pdProgressPct');
    const ringFill = document.getElementById('pdRingFill');

    if (nameEl) nameEl.textContent = 'P' + (project.priority_rank || '?') + ': ' + project.name;
    if (badgeEl) {
        const h = project.health_status || 'green';
        badgeEl.textContent = h.charAt(0).toUpperCase() + h.slice(1);
        badgeEl.className = 'pd-health-badge pd-health-' + h;
    }
    const pct = project.progress_pct || 0;
    if (pctEl) pctEl.textContent = pct + '%';
    if (ringFill) {
        ringFill.setAttribute('stroke-dasharray', pct + ' ' + (100 - pct));
    }

    // ── Next action ──
    const nextWrap = document.getElementById('pdNextActionWrap');
    const nextText = document.getElementById('pdNextText');
    const nextInput = document.getElementById('pdNextInput');
    if (nextText) nextText.textContent = project.next_action || '';
    if (nextInput) nextInput.value = project.next_action || '';
    if (nextWrap) nextWrap.classList.remove('editing');

    // ── Phase stepper ──
    const phasesWrap = document.getElementById('pdPhasesWrap');
    const stepper = document.getElementById('pdPhasesStepper');
    const phaseList = Array.isArray(project.phase_list) ? project.phase_list : [];
    if (stepper && phaseList.length > 0) {
        phasesWrap.style.display = 'block';
        const currentPhase = project.current_phase || phaseList[0];
        const currentIdx = phaseList.indexOf(currentPhase);
        stepper.innerHTML = phaseList.map((ph, i) => {
            const isDone    = i < currentIdx;
            const isCurrent = i === currentIdx;
            const cls = isDone ? 'done' : isCurrent ? 'current' : '';
            const connClass = i < currentIdx ? 'done' : '';
            const connector = i < phaseList.length - 1
                ? '<div class="pd-phase-connector ' + connClass + '"></div>'
                : '';
            const num = isDone ? '\u2713' : (i + 1);
            return '<div class="pd-phase-step ' + cls + '">' +
                '<div class="pd-phase-dot-wrap">' +
                    '<div class="pd-phase-dot">' + num + '</div>' +
                    '<div class="pd-phase-label">' + escHtml(ph.replace(/_/g,' ')) + '</div>' +
                '</div>' +
                connector +
            '</div>';
        }).join('');
    } else if (phasesWrap) {
        phasesWrap.style.display = 'none';
    }

    renderMilestones(milestones, phaseList);
    renderTasks(tasks, phaseList, pdTaskFilter);
    renderDependencies(dependencies);
    renderProjectKeywords(project.id);
    renderStats(project);
}

// ── Milestones ──────────────────────────────────────────────────────────────

function renderMilestones(milestones, phaseList) {
    const list = document.getElementById('pdMilestoneList');
    const sub  = document.getElementById('pdMilestoneProgress');
    const bar  = document.getElementById('pdMilestoneBarFill');

    const phSel = document.getElementById('pdMilestonePhase');
    if (phSel && phaseList.length > 0) {
        phSel.innerHTML = '<option value="">No phase</option>' +
            phaseList.map(p => '<option value="' + escHtml(p) + '">' + escHtml(p.replace(/_/g,' ')) + '</option>').join('');
    }

    if (!list) return;
    if (!milestones || !milestones.length) {
        list.innerHTML = '<div class="pd-empty">No milestones yet \u2014 click + Add</div>';
        if (sub) sub.textContent = '';
        if (bar) bar.style.width = '0%';
        return;
    }

    const totalWeight    = milestones.reduce((s, m) => s + (m.weight || 0), 0);
    const completeWeight = milestones.filter(m => m.status === 'complete' || m.status === 'done')
                                     .reduce((s, m) => s + (m.weight || 0), 0);
    const pct = totalWeight > 0 ? Math.round(completeWeight / totalWeight * 100) : 0;
    if (sub) sub.textContent = pct + '% \u00B7 ' + milestones.filter(m => m.status === 'complete' || m.status === 'done').length + '/' + milestones.length + ' done';
    if (bar) bar.style.width = pct + '%';

    list.innerHTML = milestones.map(m => {
        const done = m.status === 'complete' || m.status === 'done';
        const meta = [
            m.weight ? '<span class="pd-milestone-weight">' + m.weight + 'pt</span>' : '',
            m.phase  ? '<span class="pd-milestone-phase-tag">' + escHtml(m.phase.replace(/_/g,' ')) + '</span>' : '',
            m.target_date ? '<span>' + m.target_date + '</span>' : '',
        ].filter(Boolean).join('');
        return '<div class="pd-milestone-item' + (done ? ' done' : '') + '" data-mid="' + m.id + '">' +
            '<div class="pd-milestone-cb" data-action="toggle-milestone" data-id="' + m.id + '" data-done="' + (done ? '1' : '0') + '"></div>' +
            '<div class="pd-milestone-body">' +
                '<div class="pd-milestone-name">' + escHtml(m.name) + '</div>' +
                (meta ? '<div class="pd-milestone-meta">' + meta + '</div>' : '') +
            '</div>' +
        '</div>';
    }).join('');
}

// ── Tasks ────────────────────────────────────────────────────────────────────

function renderTasks(tasks, phaseList, filter) {
    const list = document.getElementById('pdTaskList');

    const phSel = document.getElementById('pdTaskPhase');
    if (phSel && phaseList.length > 0) {
        phSel.innerHTML = '<option value="">Current phase</option>' +
            phaseList.map(p => '<option value="' + escHtml(p) + '">' + escHtml(p.replace(/_/g,' ')) + '</option>').join('');
    }

    if (!list) return;

    let filtered = tasks || [];
    if (filter === 'open')     filtered = filtered.filter(t => t.status !== 'done' && t.status !== 'cancelled');
    if (filter === 'blockers') filtered = filtered.filter(t => t.is_blocker && t.status !== 'done');
    if (filter === 'done')     filtered = filtered.filter(t => t.status === 'done');

    if (!filtered.length) {
        list.innerHTML = '<div class="pd-empty">' +
            (filter === 'done' ? 'No completed tasks yet.' : filter === 'blockers' ? 'No open blockers' : 'No open tasks.') +
        '</div>';
        return;
    }

    const energyEmoji = { high: '\uD83D\uDD25', low: '\uD83C\uDF31', medium: '\u26A1' };
    list.innerHTML = filtered.map(t => {
        const done    = t.status === 'done';
        const blocker = t.is_blocker && !done;
        const tags = [
            blocker                            ? '<span class="pd-task-tag pd-tag-blocker">\uD83D\uDEAB blocker</span>'                               : '',
            t.energy_required && !done         ? '<span class="pd-task-tag pd-tag-energy-' + t.energy_required + '">' + (energyEmoji[t.energy_required]||'') + ' ' + t.energy_required + '</span>' : '',
            t.due_date && !done                ? '<span class="pd-task-tag pd-tag-due" data-due="' + t.due_date + '" data-task-id="' + t.id + '">due ' + t.due_date + '</span>' : '',
            t.project_phase && !done           ? '<span class="pd-task-tag pd-tag-phase">' + escHtml(t.project_phase.replace(/_/g,' ')) + '</span>' : '',
        ].filter(Boolean).join('');
        return '<div class="pd-task-item' + (done ? ' done' : '') + (blocker ? ' is-blocker' : '') + '" data-tid="' + t.id + '">' +
            '<div class="pd-task-cb" data-action="toggle-task" data-id="' + t.id + '" data-done="' + (done ? '1' : '0') + '"></div>' +
            '<div class="pd-task-body">' +
                '<div class="pd-task-text">' + escHtml(t.text) + '</div>' +
                (tags ? '<div class="pd-task-meta">' + tags + '</div>' : '') +
            '</div>' +
        '</div>';
    }).join('');
}

// ── Dependencies ─────────────────────────────────────────────────────────────

function renderDependencies(dependencies) {
    const section = document.getElementById('pdDepsSection');
    const upList  = document.getElementById('pdUpstreamList');
    const downList = document.getElementById('pdDownstreamList');

    const upstream   = (dependencies && dependencies.upstream)   || [];
    const downstream = (dependencies && dependencies.downstream) || [];

    if (!upstream.length && !downstream.length) {
        if (section) section.style.display = 'none';
        return;
    }
    if (section) section.style.display = 'grid';

    function depHtml(deps) {
        if (!deps.length) return '<div class="pd-deps-empty">None</div>';
        return deps.map(d => {
            const h = d.health_status || 'green';
            return '<div class="pd-dep-item' + (d.is_hard_block ? ' hard-block' : '') + '">' +
                '<span class="pd-dep-name">' + escHtml(d.name) + '</span>' +
                '<span class="pd-dep-health ' + h + '">' + h.toUpperCase() + '</span>' +
                (d.dependency_description ? '<span class="pd-dep-desc">' + escHtml(d.dependency_description) + '</span>' : '') +
            '</div>';
        }).join('');
    }

    if (upList)   upList.innerHTML   = depHtml(upstream);
    if (downList) downList.innerHTML = depHtml(downstream);
}

// ── Keywords ─────────────────────────────────────────────────────────────────

async function renderProjectKeywords(projectId) {
    const list = document.getElementById('pdKeywordList');
    if (!list) return;
    try {
        const keywords = await API.get('/api/project-keywords/' + projectId);
        if (!keywords.length) {
            list.innerHTML = '<div class="pd-empty">No keywords \u2014 messages won\'t auto-assign to this project</div>';
            return;
        }
        list.innerHTML = keywords.map(kw =>
            '<div class="pd-keyword-chip">' +
                '<span class="pd-keyword-text">' + escHtml(kw.keyword) + '</span>' +
                '<span class="pd-keyword-cat">' + escHtml(kw.category) + '</span>' +
                '<span class="pd-keyword-boost">+' + kw.boost + '</span>' +
                '<button class="pd-keyword-del" data-kw-id="' + kw.id + '" title="Remove">\u2715</button>' +
            '</div>'
        ).join('');
    } catch (e) {
        list.innerHTML = '<div class="pd-empty">Failed to load keywords</div>';
    }
}

// ── Stats strip ──────────────────────────────────────────────────────────────

function renderStats(project) {
    const strip = document.getElementById('pdStatsStrip');
    if (!strip) return;

    const stats = [];
    if (project.timeline_start || project.timeline_end) {
        const start = project.timeline_start ? project.timeline_start.slice(0, 7) : '?';
        const end   = project.timeline_end   ? project.timeline_end.slice(0, 7)   : '?';
        stats.push({ label: 'Timeline', value: start + ' \u2192 ' + end });
    }
    if (project.hours_per_week) {
        stats.push({ label: 'hrs/week', value: project.hours_per_week + 'h' });
    }
    if (project.revenue_base) {
        stats.push({ label: 'Base rev', value: '$' + Number(project.revenue_base).toLocaleString(), cls: 'revenue' });
    }
    if (project.revenue_worst) {
        stats.push({ label: 'Worst', value: '$' + Number(project.revenue_worst).toLocaleString() });
    }
    if (project.revenue_lucky) {
        stats.push({ label: 'Lucky', value: '$' + Number(project.revenue_lucky).toLocaleString(), cls: 'revenue' });
    }
    if (project.budget_to_invest) {
        stats.push({ label: 'Budget', value: '$' + Number(project.budget_to_invest).toLocaleString() });
    }

    if (!stats.length) { strip.style.display = 'none'; return; }
    strip.style.display = 'flex';
    strip.innerHTML = stats.map(s =>
        '<div class="pd-stat">' +
            '<span class="pd-stat-label">' + s.label + '</span>' +
            '<span class="pd-stat-value' + (s.cls ? ' ' + s.cls : '') + '">' + s.value + '</span>' +
        '</div>'
    ).join('');
}

// ── Toggle helpers ───────────────────────────────────────────────────────────

async function toggleMilestone(milestoneId, currentlyDone) {
    const newStatus = currentlyDone ? 'pending' : 'complete';
    await API.patch('/api/project-tasks/milestone/' + milestoneId, { status: newStatus });
    if (pdCurrentProject) await loadProjectDetail(pdCurrentProject.project.id);
}

async function toggleTask(taskId, currentlyDone) {
    const newStatus = currentlyDone ? 'open' : 'done';
    await API.patch('/api/project-tasks/task/' + taskId, { status: newStatus });
    if (pdCurrentProject) await loadProjectDetail(pdCurrentProject.project.id);
}

// ── Event handler setup (one-time) ───────────────────────────────────────────

function setupProjectDetailHandlers() {
    if (pdDetailHandlersReady) return;
    pdDetailHandlersReady = true;

    // Back button
    document.getElementById('pdBackBtn')?.addEventListener('click', () => {
        if (typeof window.showPanel === 'function') window.showPanel('home');
    });

    // Next action: click to edit
    document.getElementById('pdNextActionWrap')?.addEventListener('click', function() {
        if (this.classList.contains('editing')) return;
        this.classList.add('editing');
        const input = document.getElementById('pdNextInput');
        if (input) { input.focus(); input.select(); }
    });
    document.getElementById('pdNextInput')?.addEventListener('blur', async function() {
        const wrap = document.getElementById('pdNextActionWrap');
        if (wrap) wrap.classList.remove('editing');
        const val = this.value.trim();
        const textEl = document.getElementById('pdNextText');
        if (textEl) textEl.textContent = val;
        if (pdCurrentProject) {
            await API.patch('/api/projects/' + pdCurrentProject.project.id, { next_action: val });
        }
    });
    document.getElementById('pdNextInput')?.addEventListener('keydown', function(e) {
        if (e.key === 'Enter')  this.blur();
        if (e.key === 'Escape') {
            this.value = document.getElementById('pdNextText')?.textContent || '';
            this.blur();
        }
    });

    // Task filters
    document.getElementById('pdTaskFilters')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.pd-filter');
        if (!btn) return;
        document.querySelectorAll('#pdTaskFilters .pd-filter').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        pdTaskFilter = btn.dataset.filter;
        if (pdCurrentProject) {
            const phases = Array.isArray(pdCurrentProject.project.phase_list)
                ? pdCurrentProject.project.phase_list : [];
            renderTasks(pdCurrentProject.tasks, phases, pdTaskFilter);
        }
    });

    // Milestone checkbox toggle (delegated)
    document.getElementById('pdMilestoneList')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="toggle-milestone"]');
        if (btn) toggleMilestone(btn.dataset.id, btn.dataset.done === '1');
    });

    // Task checkbox toggle (delegated)
    document.getElementById('pdTaskList')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="toggle-task"]');
        if (btn) toggleTask(btn.dataset.id, btn.dataset.done === '1');

        // Click due date tag -> inline date picker
        const dueTag = e.target.closest('.pd-tag-due');
        if (dueTag && dueTag.dataset.taskId) {
            e.stopPropagation();
            const input = document.createElement('input');
            input.type = 'date';
            input.className = 'todo-date-input';
            input.value = dueTag.dataset.due || '';
            input.style.position = 'absolute';
            input.style.zIndex = '100';
            dueTag.style.position = 'relative';
            dueTag.replaceWith(input);
            input.focus();
            const finish = async () => {
                const newDate = input.value || null;
                await API.patch('/api/project-tasks/' + pdCurrentProject.project.id + '/tasks/' + dueTag.dataset.taskId, { due_date: newDate });
                openProjectDetail(pdCurrentProject.project.id, true);
            };
            input.addEventListener('change', finish);
            input.addEventListener('blur', () => { if (!input._changed) openProjectDetail(pdCurrentProject.project.id, true); });
            input.addEventListener('change', () => { input._changed = true; });
        }
    });

    // Add milestone form
    document.getElementById('pdAddMilestoneBtn')?.addEventListener('click', () => {
        const form = document.getElementById('pdAddMilestoneForm');
        if (!form) return;
        const isHidden = form.style.display === 'none' || !form.style.display;
        form.style.display = isHidden ? 'flex' : 'none';
        if (isHidden) document.getElementById('pdMilestoneName')?.focus();
    });
    document.getElementById('pdMilestoneCancel')?.addEventListener('click', () => {
        document.getElementById('pdAddMilestoneForm').style.display = 'none';
    });
    document.getElementById('pdMilestoneSave')?.addEventListener('click', async () => {
        if (!pdCurrentProject) return;
        const name   = document.getElementById('pdMilestoneName')?.value.trim();
        const weight = parseInt(document.getElementById('pdMilestoneWeight')?.value || '10', 10);
        const date   = document.getElementById('pdMilestoneDate')?.value || null;
        const phase  = document.getElementById('pdMilestonePhase')?.value || null;
        if (!name) return;
        await API.post('/api/project-tasks/' + pdCurrentProject.project.id + '/milestones', { name, weight, target_date: date, phase });
        document.getElementById('pdMilestoneName').value = '';
        document.getElementById('pdAddMilestoneForm').style.display = 'none';
        loadProjectDetail(pdCurrentProject.project.id);
    });

    // Add task form
    document.getElementById('pdAddTaskBtn')?.addEventListener('click', () => {
        const form = document.getElementById('pdAddTaskForm');
        if (!form) return;
        const isHidden = form.style.display === 'none' || !form.style.display;
        form.style.display = isHidden ? 'flex' : 'none';
        if (isHidden) document.getElementById('pdTaskText')?.focus();
    });
    document.getElementById('pdTaskCancel')?.addEventListener('click', () => {
        document.getElementById('pdAddTaskForm').style.display = 'none';
    });
    document.getElementById('pdTaskSave')?.addEventListener('click', async () => {
        if (!pdCurrentProject) return;
        const text      = document.getElementById('pdTaskText')?.value.trim();
        const phase     = document.getElementById('pdTaskPhase')?.value || pdCurrentProject.project.current_phase || null;
        const energy    = document.getElementById('pdTaskEnergy')?.value || 'medium';
        const due       = document.getElementById('pdTaskDue')?.value || null;
        const isBlocker = document.getElementById('pdTaskIsBlocker')?.checked ? 1 : 0;
        if (!text) return;
        await API.post('/api/project-tasks/' + pdCurrentProject.project.id, { text, project_phase: phase, energy_required: energy, due_date: due, is_blocker: isBlocker });
        document.getElementById('pdTaskText').value = '';
        document.getElementById('pdAddTaskForm').style.display = 'none';
        loadProjectDetail(pdCurrentProject.project.id);
    });

    // Add keyword form
    document.getElementById('pdAddKeywordBtn')?.addEventListener('click', () => {
        const form = document.getElementById('pdAddKeywordForm');
        if (!form) return;
        const isHidden = form.style.display === 'none' || !form.style.display;
        form.style.display = isHidden ? 'flex' : 'none';
        if (isHidden) document.getElementById('pdKeywordText')?.focus();
    });
    document.getElementById('pdKeywordCancel')?.addEventListener('click', () => {
        document.getElementById('pdAddKeywordForm').style.display = 'none';
    });
    document.getElementById('pdKeywordSave')?.addEventListener('click', async () => {
        if (!pdCurrentProject) return;
        const keyword  = document.getElementById('pdKeywordText')?.value.trim();
        const category = document.getElementById('pdKeywordCategory')?.value || 'general';
        const boost    = parseInt(document.getElementById('pdKeywordBoost')?.value || '20', 10);
        if (!keyword) return;
        await API.post('/api/project-keywords/' + pdCurrentProject.project.id, { keyword, category, boost });
        document.getElementById('pdKeywordText').value = '';
        document.getElementById('pdAddKeywordForm').style.display = 'none';
        renderProjectKeywords(pdCurrentProject.project.id);
    });

    // Delete keyword (delegated)
    document.getElementById('pdKeywordList')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('.pd-keyword-del');
        if (!btn) return;
        await API.del('/api/project-keywords/' + btn.dataset.kwId);
        renderProjectKeywords(pdCurrentProject.project.id);
    });
}

// Expose globally
window.openProjectDetail = openProjectDetail;
window.loadProjectDetail = loadProjectDetail;
