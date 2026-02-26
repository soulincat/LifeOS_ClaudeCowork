/* ================================================================
   Life OS Dashboard — Home Panel UI
   ================================================================
   Handles the unified home overview: pulse strip, greeting,
   focus card, inbox feed, project cards, and PA chat bar.

   Depends on: utils.js, api.js
   Exposes: loadHomeData (via window)
   ================================================================ */

let homeInitialised = false;

async function loadHomeData() {
    const base = location.origin;

    // ── Pulse Strip: date ──
    const now = new Date();
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const dateEl = document.getElementById('pulseDate');
    const dayEl = document.getElementById('pulseDay');
    if (dateEl) dateEl.textContent = months[now.getMonth()] + ' ' + now.getDate();
    if (dayEl) dayEl.textContent = days[now.getDay()];

    // ── Greeting ──
    const hour = now.getHours();
    const greetingEl = document.getElementById('dashGreeting');
    const subEl = document.getElementById('dashGreetingSub');
    if (greetingEl) {
        if (hour < 12) greetingEl.textContent = 'Good morning.';
        else if (hour < 17) greetingEl.textContent = 'Good afternoon.';
        else greetingEl.textContent = 'Good evening.';
    }

    // ── Background Whoop sync (fire-and-forget) ──
    fetch(base + '/api/health/whoop/sync?days=2', { method: 'POST' }).catch(() => {});

    // ── Pulse Strip: recovery, unread, meetings, blocker ──
    try {
        const pulse = await API.get('/api/home/pulse');
        const recoveryEl = document.getElementById('pulseRecoveryText');
        const recoveryChip = document.getElementById('pulseRecovery');
        if (pulse.recovery != null && recoveryEl) {
            recoveryEl.textContent = 'Recovery ' + pulse.recovery + '%';
            if (recoveryChip) recoveryChip.className = 'pulse-chip ' + (pulse.recovery >= 66 ? 'pulse-chip-good' : pulse.recovery >= 33 ? 'pulse-chip-warn' : 'pulse-chip-warn');
        }
        const unreadEl = document.getElementById('pulseUnreadText');
        const unreadChip = document.getElementById('pulseUnread');
        if (unreadEl) unreadEl.textContent = (pulse.unread || 0) + ' unread';
        if (unreadChip) unreadChip.className = 'pulse-chip ' + (pulse.unread > 0 ? 'pulse-chip-warn' : 'pulse-chip-neutral');
        const dashCount = document.getElementById('dashInboxCount');
        if (dashCount) dashCount.textContent = pulse.unread > 0 ? pulse.unread : '';
        const meetEl = document.getElementById('pulseMeetingsText');
        const meetChip = document.getElementById('pulseMeetings');
        if (pulse.meetings > 0) {
            if (meetEl) meetEl.textContent = pulse.meetings + ' meeting' + (pulse.meetings > 1 ? 's' : '');
            if (meetChip) meetChip.style.display = '';
        } else if (meetChip) { meetChip.style.display = 'none'; }
        const ctxEl = document.getElementById('pulseContextText');
        const ctxChip = document.getElementById('pulseContext');
        if (pulse.context_line) {
            if (ctxEl) ctxEl.textContent = pulse.context_line;
            if (ctxChip) ctxChip.style.display = '';
        } else if (ctxChip) { ctxChip.style.display = 'none'; }
    } catch (e) { /* pulse endpoint not available */ }

    // ── Focus Card ──
    try {
        const focus = await API.get('/api/home/focus');
        const focusCard = document.getElementById('focusCard');
        if (focus && !focus.empty && focusCard) {
            focusCard.style.display = '';
            document.getElementById('focusTitle').textContent = focus.text || '';
            document.getElementById('focusDesc').textContent = focus.description || '';
            const meta = document.getElementById('focusMeta');
            const tags = [];
            if (focus.project_name) tags.push(focus.project_name);
            if (focus.override === 'calendar') tags.push('Calendar');
            if (focus.meta) tags.push(focus.meta);
            meta.innerHTML = tags.map(t => '<span class="focus-tag">' + t + '</span>').join('');
            if (subEl) subEl.textContent = focus.project_name ? 'Top task from ' + focus.project_name : 'Your next action';
        } else if (focusCard) {
            focusCard.style.display = 'none';
            if (subEl) subEl.textContent = 'No open tasks. Add milestones and tasks to your projects.';
        }
    } catch (e) { console.warn('Home: focus failed', e); }

    // ── Inbox: counts + feed ──
    try {
        const inboxGroups = await API.get('/api/messages/grouped-by-context');
        window._homeInboxGroups = inboxGroups;
        const allCount = inboxGroups.reduce((s, g) => s + g.senders.length, 0);
        const workCount = inboxGroups.filter(g => g.type === 'business' || g.project_id).reduce((s, g) => s + g.senders.length, 0);
        const personalCount = inboxGroups.filter(g => g.type === 'personal' && !g.project_id).reduce((s, g) => s + g.senders.length, 0);
        const tabAll = document.getElementById('dashTabAll');
        const tabWork = document.getElementById('dashTabWork');
        const tabPersonal = document.getElementById('dashTabPersonal');
        if (tabAll) tabAll.textContent = allCount > 0 ? allCount : '';
        if (tabWork) tabWork.textContent = workCount > 0 ? workCount : '';
        if (tabPersonal) tabPersonal.textContent = personalCount > 0 ? personalCount : '';
        renderHomeInbox(inboxGroups, 'all');
    } catch (e) { renderHomeInbox([], 'all'); }

    // ── Project Cards ──
    const projectSec = document.getElementById('dashProjectSection');
    if (projectSec && !isWidgetEnabled('projects')) {
        projectSec.style.display = 'none';
    }
    if (!isWidgetEnabled('projects')) { /* skip */ } else try {
        const projects = (await API.get('/api/home/projects-expanded')) || [];
        const grid = document.getElementById('dashProjectCards');
        const countEl = document.getElementById('dashProjectCount');
        if (countEl) countEl.textContent = projects.length > 0 ? projects.length : '';
        if (grid) {
            grid.innerHTML = '';
            projects.forEach(project => {
                const name = project.name || 'Project';
                const health = project.health_status || 'green';
                const healthClass = 'dash-project-health-' + health;
                const healthLabel = health.charAt(0).toUpperCase() + health.slice(1);
                const pct = project.progress_pct || 0;
                const phase = project.current_phase || '';
                const nextAction = project.next_action || '';
                const rank = project.priority_rank || 4;
                const blockerCount = (project.blockers || []).length;

                // Task list
                let tasksHtml = '';
                if (project.tasks && project.tasks.length > 0) {
                    const taskItems = project.tasks.map(t => {
                        const done = t.status === 'done';
                        const blocker = t.is_blocker && !done;
                        const cls = (done ? ' dash-task-done' : '') + (blocker ? ' dash-task-blocker' : '');
                        return '<div class="dash-task-item' + cls + '">' +
                            '<span class="dash-task-check">' + (done ? '\u2713' : '\u25cb') + '</span>' +
                            '<span class="dash-task-text">' + t.text + '</span>' +
                            (t.due_date ? '<span class="dash-task-due">' + t.due_date + '</span>' : '') +
                        '</div>';
                    }).join('');
                    tasksHtml = '<div class="dash-project-tasks">' + taskItems;
                    if (project.more_tasks > 0) tasksHtml += '<div class="dash-task-more">and ' + project.more_tasks + ' more...</div>';
                    tasksHtml += '</div>';
                }

                // Horizon milestone
                let horizonHtml = '';
                if (project.horizon_milestone) {
                    horizonHtml = '<div class="dash-project-horizon">Next milestone: ' + project.horizon_milestone.name + ' <span class="dash-horizon-date">' + (project.horizon_milestone.target_date || project.horizon_milestone.phase) + '</span></div>';
                }

                // Blockers + dependency warnings
                let alertsHtml = '';
                if ((project.blockers && project.blockers.length > 0) || (project.dependency_warnings && project.dependency_warnings.length > 0)) {
                    alertsHtml = '<div class="dash-project-alerts">';
                    if (project.blockers) alertsHtml += project.blockers.map(b => '<div class="dash-project-blocker-item">\u26a0 ' + b + '</div>').join('');
                    if (project.dependency_warnings) alertsHtml += project.dependency_warnings.map(d => '<div class="dash-project-dep-warn">\u26d4 ' + d.upstream_name + ': ' + (d.dependency_description || 'blocked') + '</div>').join('');
                    alertsHtml += '</div>';
                }

                // Collapsed summary
                const summaryParts = [];
                if (phase) summaryParts.push(phase.replace(/_/g, ' '));
                if (blockerCount > 0) summaryParts.push(blockerCount + ' blocker' + (blockerCount > 1 ? 's' : ''));
                if (nextAction) summaryParts.push(nextAction.length > 60 ? nextAction.slice(0, 57) + '...' : nextAction);
                const summaryText = summaryParts.join(' \u00b7 ');

                const card = document.createElement('div');
                card.className = 'dash-project-card dash-project-collapsed' + (health === 'red' ? ' dash-project-card-red' : health === 'yellow' ? ' dash-project-card-yellow' : '');
                card.dataset.projectId = project.id;
                card.innerHTML =
                    '<div class="dash-project-card-header">' +
                        '<span class="dash-project-card-toggle">\u25b6</span>' +
                        '<span class="dash-project-card-name">P' + rank + ': ' + name + '</span>' +
                        '<div class="dash-project-card-header-right">' +
                            '<div class="dash-project-progress-mini"><div class="dash-project-progress-fill" style="width:' + pct + '%"></div></div>' +
                            '<span class="dash-project-card-pct">' + pct + '%</span>' +
                            '<span class="dash-project-card-health ' + healthClass + '">' + healthLabel + '</span>' +
                            '<button class="dash-project-detail-btn" title="Open detail view">\u2192</button>' +
                        '</div>' +
                    '</div>' +
                    '<div class="dash-project-summary">' + summaryText + '</div>' +
                    '<div class="dash-project-detail">' +
                        '<div class="dash-project-progress-wrap">' +
                            '<div class="dash-project-progress-bar"><div class="dash-project-progress-fill" style="width:' + pct + '%"></div></div>' +
                            '<span class="dash-project-progress-text">' + pct + '%' + (phase ? ' \u2022 ' + phase.replace(/_/g, ' ') : '') + '</span>' +
                        '</div>' +
                        (nextAction ? '<div class="dash-project-next-action">Next: ' + nextAction + '</div>' : '') +
                        tasksHtml + horizonHtml + alertsHtml +
                    '</div>';

                card.querySelector('.dash-project-card-header').addEventListener('click', (e) => {
                    if (e.target.closest('.dash-project-detail-btn')) return;
                    card.classList.toggle('dash-project-collapsed');
                    card.classList.toggle('dash-project-expanded');
                });

                const detailBtn = card.querySelector('.dash-project-detail-btn');
                if (detailBtn) {
                    detailBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (typeof window.showPanel === 'function') {
                            window.showPanel('project-' + project.id);
                        } else {
                            openProjectDetail(project.id);
                        }
                    });
                }

                grid.appendChild(card);
            });
        }
        renderProjectTabs(projects);
    } catch (e) { console.warn('Home: projects-expanded failed', e); }

    // ── PA Quick Chips ──
    try {
        const chipsContainer = document.getElementById('dashPaChips');
        const revenueChip = chipsContainer?.querySelector('[data-prompt*="revenue summary"]');
        chipsContainer?.querySelectorAll('.dash-pa-chip[data-dynamic]').forEach(c => c.remove());
        const allProjects = await API.get('/api/projects');
        const activeProjects = (Array.isArray(allProjects) ? allProjects : []).filter(p => p.status === 'active').slice(0, 3);
        activeProjects.forEach(p => {
            const chip = document.createElement('button');
            chip.className = 'dash-pa-chip';
            chip.setAttribute('data-dynamic', '1');
            chip.setAttribute('data-prompt', 'How is ' + p.name + ' progressing? What\'s the next critical step?');
            chip.textContent = (p.short_name || p.name) + ' status';
            if (revenueChip) chipsContainer.insertBefore(chip, revenueChip);
            else chipsContainer?.appendChild(chip);
        });
    } catch (e) { /* chips are non-critical */ }

    // Wire up event handlers once
    if (!homeInitialised) {
        homeInitialised = true;
        setupHomeHandlers();
    }
}

// ── Inbox Feed Renderer ─────────────────────────────────────────

function renderHomeInbox(groups, filter) {
    const feed = document.getElementById('dashInboxFeed');
    const body = document.getElementById('dashInboxBody');
    const viewAll = document.getElementById('dashInboxViewAll');
    if (!feed) return;

    const sourceIcon = (s) => s === 'gmail' ? '\u2709' : s === 'outlook' ? '\ud83d\udce7' : s === 'whatsapp' ? '\ud83d\udcac' : '\ud83d\udce9';
    const ACTION_LABELS = { reply_needed: 'Reply', approval: 'Approve', payment: 'Payment', deadline: 'Deadline', meeting: 'Meeting', question: 'Question', fyi: 'FYI' };

    let filtered = groups;
    if (filter === 'work') filtered = groups.filter(g => g.type === 'business' || g.project_id);
    else if (filter === 'personal') filtered = groups.filter(g => g.type === 'personal' && !g.project_id);

    const totalSenders = filtered.reduce((s, g) => s + g.senders.length, 0);
    if (body) body.style.display = '';
    if (!totalSenders) {
        if (viewAll) viewAll.style.display = 'none';
        feed.innerHTML = '<div style="color:var(--text-dim);padding:18px 0;text-align:center;font-size:13px;">No ' + (filter === 'all' ? '' : filter + ' ') + 'messages</div>';
        return;
    }
    if (viewAll) viewAll.style.display = '';
    feed.innerHTML = '';

    let count = 0;
    for (const group of filtered) {
        if (count >= 6) break;
        const header = document.createElement('div');
        header.className = 'dash-inbox-group-header';
        header.textContent = group.name;
        feed.appendChild(header);

        for (const msg of group.senders) {
            if (count >= 6) break;
            const date = msg.latest_received_at || msg.received_at;
            const timeStr = date ? new Date(date).toLocaleString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
            const urgency = msg.urgency_score || 3;
            const actionLabel = ACTION_LABELS[msg.action_tag] || '';
            const actionClass = msg.action_tag ? ' action-' + msg.action_tag : '';

            const el = document.createElement('div');
            el.className = 'dash-inbox-item';
            el.dataset.source = msg.source;
            el.dataset.senderAddress = msg.sender_address || '';
            el.innerHTML =
                '<div class="dash-inbox-item-icon">' + sourceIcon(msg.source) + '</div>' +
                '<div class="dash-inbox-item-body">' +
                    '<div class="dash-inbox-item-top">' +
                        '<span class="dash-inbox-item-sender">' + escHtml(msg.sender_name || msg.sender_address || 'Unknown') + '</span>' +
                        (msg.msg_count > 1 ? '<span class="dash-inbox-item-count">' + msg.msg_count + '</span>' : '') +
                        (actionLabel ? '<span class="dash-inbox-action-badge' + actionClass + '">' + actionLabel + '</span>' : '') +
                        '<span class="dash-inbox-item-urgency dash-inbox-item-urgency-' + urgency + '">' + ({1:'FYI',2:'Low',3:'Med',4:'High',5:'Critical'})[urgency] + '</span>' +
                        '<span class="dash-inbox-item-time">' + timeStr + '</span>' +
                    '</div>' +
                    '<div class="dash-inbox-item-preview">' + escHtml(msg.latest_preview || '') + '</div>' +
                '</div>' +
                '<button class="dash-inbox-action-open" title="Open in inbox">Open</button>';
            feed.appendChild(el);
            count++;
        }
    }
}

// ── Home Panel Event Handlers ───────────────────────────────────

function setupHomeHandlers() {
    // Inbox tabs
    document.getElementById('dashInboxTabs')?.addEventListener('click', function(e) {
        const tab = e.target.closest('.dash-inbox-tab');
        if (!tab) return;
        this.querySelectorAll('.dash-inbox-tab').forEach(b => b.classList.remove('active'));
        tab.classList.add('active');
        const filter = tab.dataset.filter;
        if (window._homeInboxGroups) {
            renderHomeInbox(window._homeInboxGroups, filter);
        } else {
            fetch('/api/messages/grouped-by-context')
                .then(r => r.json())
                .then(groups => { window._homeInboxGroups = groups; renderHomeInbox(groups, filter); })
                .catch(() => renderHomeInbox([], filter));
        }
    });

    // View all → inbox tab
    document.getElementById('dashInboxViewAll')?.addEventListener('click', function() {
        if (typeof showPanel === 'function') showPanel('inbox');
    });

    // Inbox card click → expand conversation
    document.getElementById('dashInboxFeed')?.addEventListener('click', async function(e) {
        const openBtn = e.target.closest('.dash-inbox-action-open');
        if (openBtn) {
            e.stopPropagation();
            const item = openBtn.closest('.dash-inbox-item');
            if (item) {
                window._inboxScrollTo = { source: item.dataset.source, sender: item.dataset.senderAddress };
            }
            if (typeof showPanel === 'function') showPanel('inbox');
            return;
        }

        const item = e.target.closest('.dash-inbox-item');
        if (!item) return;
        const existing = item.nextElementSibling;
        if (existing && existing.classList.contains('dash-inbox-convo')) { existing.remove(); return; }
        const source = item.dataset.source;
        const sender = item.dataset.senderAddress;
        if (!source || !sender) return;

        try {
            const params = new URLSearchParams({ source, sender_address: sender, limit: '8' });
            const res = await fetch('/api/messages/by-sender?' + params);
            const messages = await res.json();
            if (messages.length <= 1) return;

            const convo = document.createElement('div');
            convo.className = 'dash-inbox-convo';
            messages.slice(1).forEach(m => {
                const row = document.createElement('div');
                row.className = 'dash-inbox-convo-msg';
                const time = m.received_at ? new Date(m.received_at).toLocaleString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
                const text = m.preview || m.ai_summary || m.subject || '';
                row.innerHTML = '<span class="dash-inbox-convo-time">' + time + '</span>' +
                    '<span class="dash-inbox-convo-text">' + (text.length > 120 ? text.slice(0, 120) + '...' : text) + '</span>';
                convo.appendChild(row);
            });
            item.after(convo);
        } catch (err) { /* silent */ }
    });

    // Quick suggestion chips
    document.getElementById('dashPaChips')?.addEventListener('click', function(e) {
        const chip = e.target.closest('.dash-pa-chip');
        if (!chip) return;
        const prompt = chip.dataset.prompt;
        if (prompt && typeof sendHomePAMessage === 'function') sendHomePAMessage(prompt);
    });

    // PA Chat bar
    const paInput = document.getElementById('dashPaInput');
    const paSend = document.getElementById('dashPaSend');
    const paResponse = document.getElementById('dashPaResponse');
    const paResponseText = document.getElementById('dashPaResponseText');
    const paClose = document.getElementById('dashPaClose');

    if (paInput) {
        paInput.addEventListener('input', function() {
            paSend.disabled = !this.value.trim();
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 80) + 'px';
        });
        paInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (this.value.trim()) sendHomePAMessage(this.value.trim());
            }
        });
    }
    if (paSend) paSend.addEventListener('click', function() {
        if (paInput && paInput.value.trim()) sendHomePAMessage(paInput.value.trim());
    });
    if (paClose) paClose.addEventListener('click', function() {
        if (paResponse) paResponse.classList.remove('active');
    });

    async function sendHomePAMessage(message) {
        if (!paInput || !paResponse || !paResponseText) return;
        paInput.value = '';
        paInput.style.height = 'auto';
        paSend.disabled = true;
        paResponse.classList.add('active');
        paResponseText.innerHTML = '<span class="pa-thinking">Thinking\u2026</span>';
        try {
            const data = await API.post('/api/pa/chat', { message });
            const text = data.response || data.error || 'No response';

            let displayText = text
                .replace(/```[^\n]*\nCOMMAND:[\s\S]*?```/g, '')
                .replace(/^COMMAND:\s*\w+\s*\n\{[\s\S]*?\}/gm, '')
                .replace(/^COMMAND:\s*\w+[^\n]*$/gm, '')
                .replace(/```\s*\n?\s*```/g, '')
                .replace(/\n{3,}/g, '\n\n')
                .trim();

            let html = escHtml(displayText)
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\n/g, '<br>');
            paResponseText.innerHTML = html;

            // Render send confirmation cards
            const pendingActions = data.pendingActions || [];
            if (pendingActions.length) {
                const wrap = document.createElement('div');
                wrap.className = 'pa-confirm-wrap';
                pendingActions.forEach((action) => {
                    const p = action.params;
                    const card = document.createElement('div');
                    card.className = 'pa-confirm-card';

                    if (action.command === 'send_whatsapp') {
                        const toName = p.recipient_name || p.recipient;
                        const labelBadge = p._label === 'vip' ? ' <span class="contact-tag" style="vertical-align:middle;font-size:10px;">\u2b50 VIP</span>' : '';
                        const typeBadge = p._type ? ' <span class="contact-tag" style="vertical-align:middle;font-size:10px;">' + escHtml(p._type) + '</span>' : '';
                        card.innerHTML =
                            '<div class="pa-confirm-header"><span class="pa-confirm-icon">\ud83d\udcac</span> WhatsApp \u2192 <strong>' + escHtml(toName) + '</strong>' + labelBadge + typeBadge +
                            '<span style="font-size:10px;color:var(--text-dim);margin-left:6px;">' + escHtml(p.recipient) + '</span></div>' +
                            '<div class="pa-confirm-body">' + escHtml(p.message) + '</div>' +
                            '<div class="pa-confirm-actions"><button class="pa-confirm-yes">Send</button><button class="pa-confirm-cancel">Cancel</button></div>';
                    } else if (action.command === 'send_email') {
                        const toName = p.recipient_name || p.to;
                        const labelBadge = p._label === 'vip' ? ' <span class="contact-tag" style="vertical-align:middle;font-size:10px;">\u2b50 VIP</span>' : '';
                        const preview = (p.body || '').slice(0, 200) + ((p.body || '').length > 200 ? '\u2026' : '');
                        card.innerHTML =
                            '<div class="pa-confirm-header"><span class="pa-confirm-icon">\u2709\ufe0f</span> Email \u2192 <strong>' + escHtml(toName) + '</strong>' + labelBadge +
                            (toName !== p.to ? '<span style="font-size:10px;color:var(--text-dim);margin-left:6px;">' + escHtml(p.to) + '</span>' : '') + '</div>' +
                            '<div class="pa-confirm-subject" style="font-size:11px;color:var(--text-dim);margin:4px 0;">Subject: ' + escHtml(p.subject || '') + '</div>' +
                            '<div class="pa-confirm-body">' + escHtml(preview) + '</div>' +
                            '<div class="pa-confirm-actions"><button class="pa-confirm-yes">Send</button><button class="pa-confirm-cancel">Cancel</button></div>';
                    }

                    card.querySelector('.pa-confirm-yes')?.addEventListener('click', async function() {
                        this.disabled = true;
                        this.textContent = 'Sending\u2026';
                        const payload = action.command === 'send_whatsapp'
                            ? { type: 'whatsapp', recipient: p.recipient, message: p.message }
                            : { type: 'email', recipient: p.to, subject: p.subject, message: p.body };
                        try {
                            const d = await API.post('/api/pa/send', payload);
                            card.innerHTML = d.success
                                ? '<div class="pa-confirm-sent">\u2705 Sent</div>'
                                : '<div class="pa-confirm-error">\u274c ' + escHtml(d.error || 'Send failed') + '</div>';
                        } catch (e) {
                            card.innerHTML = '<div class="pa-confirm-error">\u274c ' + escHtml(e.message) + '</div>';
                        }
                    });

                    card.querySelector('.pa-confirm-cancel')?.addEventListener('click', function() {
                        card.innerHTML = '<div class="pa-confirm-cancelled">Cancelled</div>';
                    });

                    wrap.appendChild(card);
                });
                paResponseText.appendChild(wrap);
            }
        } catch (e) {
            paResponseText.textContent = 'Failed to reach PA. Is the server running?';
        }
    }
}

window.loadHomeData = loadHomeData;
