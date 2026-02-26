/* ================================================================
   Life OS Dashboard — Tab Switching & Core Navigation
   ================================================================
   Main tab controller: showPanel, More sub-sections, strategy tab,
   PA chat & briefing, startup wiring.

   Depends on: utils.js, api.js
   Extracted to separate files:
     goals-ui.js, wishlist-ui.js, inbox-ui.js
   ================================================================ */

(function() {
    let currentTab = 'home';
    let currentMoreSection = 'goals'; // default sub-section inside More

    // More tab sub-sections — maps section key to panel id and loader
    const moreSections = {
        goals:     { panel: 'panel-goals',     loader: () => { if (typeof loadGoals === 'function') loadGoals(); } },
        strategy:  { panel: 'panel-strategy',  loader: () => { loadStrategy(); } },
        scenarios: { panel: 'panel-scenarios',  loader: () => { if (typeof initProjectionTab === 'function') initProjectionTab(); } },
        wishlist:  { panel: 'panel-wishlist',   loader: () => { if (typeof loadWishlist === 'function') loadWishlist(); } },
        setup:     { panel: 'panel-setup',      loader: () => { if (typeof loadSetup === 'function') loadSetup(); } }
    };

    function showMoreSection(section) {
        currentMoreSection = section;
        Object.values(moreSections).forEach(s => {
            const el = document.getElementById(s.panel);
            if (el) el.style.display = 'none';
        });
        const active = moreSections[section];
        if (active) {
            const el = document.getElementById(active.panel);
            if (el) el.style.display = 'block';
            active.loader();
        }
        document.querySelectorAll('.more-sub-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.section === section);
        });
    }

    function showPanel(tab) {
        currentTab = tab;
        document.querySelectorAll('.main-panel').forEach(el => { el.style.display = 'none'; });
        document.querySelectorAll('.tab-bar-tab').forEach(el => { el.classList.remove('active'); });

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
        if (tab === 'inbox' && typeof initInboxTab === 'function') initInboxTab();
        if (tab === 'more') showMoreSection(currentMoreSection);
        if (isProjectTab) {
            const projectId = tab.replace('project-', '');
            if (typeof openProjectDetail === 'function') openProjectDetail(parseInt(projectId, 10), true);
        }
    }

    // ── Strategy tab ──────────────────────────────────────────────────────

    async function loadStrategy() {
        try {
            const res = await fetch('/api/strategy');
            if (!res.ok) throw new Error('API ' + res.status);
            const data = await res.json();
            renderFlywheel(data.projects || []);
            renderGoalsProjects(data.goals || [], data.projects || []);
            renderTimeline(data.projects || []);
        } catch (e) {
            console.warn('Strategy load failed', e);
            const el = document.getElementById('strategyFlywheel');
            if (el) el.innerHTML = '<p style="color:var(--text-dim);font-size:12px;">Could not load strategy data.</p>';
        }
    }

    function renderFlywheel(projects) {
        const el = document.getElementById('strategyFlywheel');
        if (!el) return;
        if (!projects.length) { el.innerHTML = '<p style="color:var(--text-dim);font-size:12px;">No active projects.</p>'; return; }
        const nodes = projects.map(p => {
            const health = (p.health_status || 'green').toLowerCase();
            return '<div class="flywheel-node health-' + health + '">' +
                '<div>' + (p.short_name || p.name) + '</div>' +
                '<div class="flywheel-node-progress">' + (p.progress_pct || 0) + '% \u00B7 ' + (p.current_phase || 'no phase') + '</div>' +
                '</div>';
        });
        const deps = [];
        projects.forEach(p => {
            let depIds = [];
            try { depIds = JSON.parse(p.depends_on_project_ids || '[]'); } catch (e) {}
            depIds.forEach(did => {
                const upstream = projects.find(x => x.id === did);
                if (upstream) deps.push((upstream.short_name || upstream.name) + ' \u2192 ' + (p.short_name || p.name));
            });
        });
        const depsHtml = deps.length
            ? '<div style="margin-top:12px;font-size:11px;color:var(--text-dim);">Dependencies: ' + deps.join(' \u00B7 ') + '</div>'
            : '';
        el.innerHTML = '<div class="flywheel-graph">' + nodes.join('') + '</div>' + depsHtml;
    }

    function renderGoalsProjects(goals, projects) {
        const el = document.getElementById('strategyGoals');
        if (!el) return;
        if (!goals.length) { el.innerHTML = '<p style="color:var(--text-dim);font-size:12px;">No goals found.</p>'; return; }
        const projMap = {};
        projects.forEach(p => { projMap[p.id] = p.short_name || p.name; });
        const rows = goals.map(g => {
            const projLabel = g.project_id && projMap[g.project_id]
                ? '<span class="strategy-goal-project">' + projMap[g.project_id] + '</span>'
                : '<span class="strategy-goal-project" data-goal-id="' + g.id + '" style="opacity:0.5;cursor:pointer;" title="Click to link a project">link project</span>';
            return '<div class="strategy-goal-row">' +
                '<span style="flex:1;">' + (g.title || '') + '</span>' +
                '<span style="font-size:11px;color:var(--text-dim);">' + (g.period_label || '') + '</span>' +
                projLabel +
                '</div>';
        });
        el.innerHTML = '<div class="strategy-goals-list">' + rows.join('') + '</div>';
        el.querySelectorAll('.strategy-goal-project[data-goal-id]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const goalId = btn.dataset.goalId;
                const pid = prompt('Enter project ID to link (or leave empty to unlink):');
                if (pid === null) return;
                await fetch('/api/strategy/goal/' + goalId, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ project_id: pid ? parseInt(pid) : null })
                });
                loadStrategy();
            });
        });
    }

    function renderTimeline(projects) {
        const el = document.getElementById('strategyTimeline');
        if (!el) return;
        const withDates = projects.filter(p => p.timeline_start || p.timeline_end);
        if (!withDates.length) { el.innerHTML = '<p style="color:var(--text-dim);font-size:12px;">No project timelines set.</p>'; return; }
        const now = new Date();
        let minDate = new Date(now); minDate.setMonth(minDate.getMonth() - 1);
        let maxDate = new Date(now); maxDate.setMonth(maxDate.getMonth() + 12);
        withDates.forEach(p => {
            if (p.timeline_start) { const d = new Date(p.timeline_start); if (d < minDate) minDate = d; }
            if (p.timeline_end) { const d = new Date(p.timeline_end); if (d > maxDate) maxDate = d; }
        });
        const totalMs = maxDate - minDate || 1;
        const rows = withDates.map(p => {
            const start = p.timeline_start ? new Date(p.timeline_start) : now;
            const end = p.timeline_end ? new Date(p.timeline_end) : maxDate;
            const left = Math.max(0, ((start - minDate) / totalMs) * 100);
            const width = Math.max(5, ((end - start) / totalMs) * 100);
            const phase = (p.current_phase || 'default').toLowerCase();
            const phaseClass = phase.includes('build') ? 'phase-build' : phase.includes('launch') ? 'phase-launch' : phase.includes('grow') ? 'phase-grow' : 'phase-default';
            return '<div class="strategy-timeline-row">' +
                '<div class="strategy-timeline-label">' + (p.short_name || p.name) + '</div>' +
                '<div class="strategy-timeline-bar-wrap">' +
                '<div class="strategy-timeline-bar ' + phaseClass + '" style="left:' + left + '%;width:' + width + '%;">' + (p.current_phase || '') + '</div>' +
                '</div></div>';
        });
        el.innerHTML = '<div class="strategy-timeline-grid">' + rows.join('') + '</div>';
    }

    // ── Monthly report reminder (disabled stub) ───────────────────────────

    async function checkMonthlyReportReminder() {
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

    // ── Tab click handlers ────────────────────────────────────────────────

    document.getElementById('tabBar')?.addEventListener('click', function(e) {
        const tab = e.target.closest('.tab-bar-tab')?.dataset.tab;
        if (tab) showPanel(tab);
    });

    document.getElementById('moreSubTabs')?.addEventListener('click', function(e) {
        const section = e.target.closest('.more-sub-tab')?.dataset.section;
        if (section) showMoreSection(section);
    });

    window.showPanel = showPanel;

    // ── PA Modal ──────────────────────────────────────────────────────────

    function showPAModal(title, text) {
        const modal = document.getElementById('paBriefModal');
        if (!modal) { console.warn('PA modal element not found'); return; }
        const titleEl = document.getElementById('paBriefModalTitle');
        const bodyEl = document.getElementById('paBriefModalBody');
        if (!bodyEl) { console.warn('PA modal body not found'); return; }
        if (titleEl) titleEl.textContent = title;
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

    // ── PA Tab ────────────────────────────────────────────────────────────

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
        html = html.replace(/COMMAND:\s*\w+<br>(\{[\s\S]*?\})?(<br>)?/g, '');
        div.innerHTML = `<div class="pa-message-bubble">${html}</div>`;
        if (commandResults && commandResults.length) {
            const note = document.createElement('div');
            note.className = 'pa-command-results';
            note.textContent = '\u2713 ' + commandResults.join(' \u2022 ');
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
        thinking.innerHTML = '<div class="pa-message-bubble">Thinking\u2026</div>';
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
                        <button class="inbox-dismiss pa-draft-discard" data-id="${d.id}" title="Discard">\u2715</button>
                    </div>
                    <div class="pa-draft-body">${(d.body || '').slice(0, 200)}${d.body && d.body.length > 200 ? '\u2026' : ''}</div>
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
        document.getElementById('paBriefModalClose')?.addEventListener('click', closePAModal);
        document.getElementById('paBriefModal')?.addEventListener('click', e => {
            if (e.target === e.currentTarget) closePAModal();
        });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') closePAModal();
        });

        document.getElementById('paBriefBtn')?.addEventListener('click', async () => {
            const btn = document.getElementById('paBriefBtn');
            btn.textContent = '\u2026';
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
            btn.textContent = '\u2026';
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

    // ── Startup ───────────────────────────────────────────────────────────

    initPATab();
})();
