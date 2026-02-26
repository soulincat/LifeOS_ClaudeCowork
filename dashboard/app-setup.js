(function() {
    // ── Personal section data ─────────────────────────────────────────────
    let setupData = {
        tax_residency: null,
        tax_residency_history: [],
        companies: [],
        reporting_periods: [],
        health_insurance: null,
        cycle_config: null
    };

    // ── Settings nav switching ────────────────────────────────────────────
    const sectionLoaded = {};
    document.querySelectorAll('.settings-nav-item').forEach(btn => {
        btn.addEventListener('click', function() {
            const section = this.dataset.settings;
            document.querySelectorAll('.settings-nav-item').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
            this.classList.add('active');
            const sectionEl = document.getElementById('settings' + section.split('-').map((s, i) => i === 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s.charAt(0).toUpperCase() + s.slice(1)).join(''));
            if (sectionEl) sectionEl.classList.add('active');
            // Lazy-load section data
            if (!sectionLoaded[section]) {
                sectionLoaded[section] = true;
                if (section === 'integrations') loadIntegrationsSection();
                else if (section === 'appearance') loadAppearanceSection();
                else if (section === 'priorities') loadPrioritiesSection();
                else if (section === 'inbox-rules') loadInboxRulesSection();
                else if (section === 'projects') loadProjectsSection();
            }
        });
    });

    // ── Helper: escHtml ────────────────────────────────────────────────────
    function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

    // ══════════════════════════════════════════════════════════════════════
    // SECTION 1: INTEGRATIONS
    // ══════════════════════════════════════════════════════════════════════
    const CONNECTOR_META = {
        claude_pa:       { label: 'Claude (PA)',     required: true,  desc: 'Powers the personal assistant' },
        apple_calendar:  { label: 'Apple Calendar',  required: false, desc: 'Sync events from Calendar.app' },
        apple_reminders: { label: 'Apple Reminders', required: false, desc: 'Bi-directional todo sync' },
        apple_mail:      { label: 'Apple Mail',      required: false, desc: 'Read email from Mail.app' },
        gmail:           { label: 'Gmail',           required: false, desc: 'Read & reply via Gmail API' },
        outlook:         { label: 'Outlook',         required: false, desc: 'Send replies via Microsoft Graph' },
        whatsapp:        { label: 'WhatsApp',        required: false, desc: 'Message bridge via local server' },
        telegram:        { label: 'Telegram',        required: false, desc: 'Daily briefings & alerts' },
        whoop:           { label: 'WHOOP',           required: false, desc: 'Recovery, sleep, HRV, strain' },
        stripe:          { label: 'Stripe',          required: false, desc: 'Revenue tracking' },
        wise:            { label: 'Wise',            required: false, desc: 'Spending tracking' },
        github:          { label: 'GitHub',          required: false, desc: 'Contribution graph' },
        soulinsocial:    { label: 'Soulin Social',   required: false, desc: 'Social media metrics' },
    };

    async function loadIntegrationsSection() {
        // Load connector status
        try {
            const res = await fetch('/api/setup/connectors');
            if (res.ok) {
                const connectors = await res.json();
                renderConnectorCards(connectors);
            }
        } catch (e) { /* ignore */ }

        // Load Claude API key
        try {
            const res = await fetch('/api/setup/pa_config');
            if (res.ok) {
                const { payload } = await res.json();
                const key = payload?.claude_api_key || '';
                const el = document.getElementById('settingsClaudeKey');
                if (el && key) el.value = key;
            }
        } catch (e) { /* ignore */ }

        // Load other integration keys
        await loadIntegrations();
    }

    function renderConnectorCards(connectors) {
        const container = document.getElementById('settingsConnectorCards');
        if (!container) return;
        // Build status map from API
        const statusMap = {};
        if (Array.isArray(connectors)) {
            connectors.forEach(c => { statusMap[c.name] = c.connected; });
        } else if (typeof connectors === 'object') {
            Object.entries(connectors).forEach(([name, status]) => {
                statusMap[name] = status?.connected || false;
            });
        }
        const required = [];
        const optional = [];
        Object.entries(CONNECTOR_META).forEach(([name, meta]) => {
            const connected = statusMap[name] || false;
            const card = '<div class="connector-card">' +
                '<div class="connector-status ' + (meta.required && !connected ? 'required' : connected ? 'connected' : 'disconnected') + '"></div>' +
                '<div style="flex:1;"><div class="connector-name">' + esc(meta.label) + '</div><div class="connector-desc">' + esc(meta.desc) + '</div></div>' +
                (meta.required ? '<span class="connector-tag required">Required</span>' : '') +
                (connected ? '<span class="connector-tag" style="background:rgba(34,197,94,0.1);color:var(--secondary);">Connected</span>' : '') +
                '</div>';
            if (meta.required) required.push(card);
            else optional.push(card);
        });
        container.innerHTML = (required.length ? '<div class="settings-subtitle" style="margin-top:0;">REQUIRED</div>' + required.join('') : '') +
            '<div class="settings-subtitle">OPTIONAL</div>' + optional.join('');
    }

    // Test Claude key
    document.getElementById('settingsTestClaudeKey')?.addEventListener('click', async function() {
        const key = document.getElementById('settingsClaudeKey')?.value?.trim();
        if (!key) return;
        this.textContent = 'Testing...';
        try {
            const r = await fetch('/api/setup/test-pa', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: key })
            });
            const d = await r.json();
            this.textContent = d.success ? 'OK ✓' : 'Failed';
        } catch (e) { this.textContent = 'Error'; }
        setTimeout(() => { this.textContent = 'Test'; }, 2000);
    });

    // Reminders sync
    document.getElementById('settingsRemindersSyncBtn')?.addEventListener('click', async function() {
        const statusEl = document.getElementById('settingsRemindersSyncStatus');
        if (statusEl) statusEl.textContent = 'Syncing...';
        try {
            const r = await fetch('/api/sync/reminders', { method: 'POST' });
            const d = await r.json();
            if (statusEl) statusEl.textContent = d.error ? 'Error' : 'Done ✓';
        } catch (e) {
            if (statusEl) statusEl.textContent = 'Failed';
        }
        setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
    });

    // ══════════════════════════════════════════════════════════════════════
    // SECTION 2: APPEARANCE
    // ══════════════════════════════════════════════════════════════════════
    const TAB_TOGGLES = [
        { key: 'socials', label: 'Socials', desc: 'Social media analytics dashboard' },
        { key: 'goals', label: 'Goals', desc: 'Goal tracking and contingency plans' },
        { key: 'projections', label: 'Projections', desc: 'Financial projection scenarios' },
        { key: 'wishlist', label: 'Wishlist', desc: 'Saved items with priorities' },
    ];
    const WIDGET_TOGGLES = [
        { key: 'finance', label: 'Finance', desc: 'Monthly revenue, spending, net worth' },
        { key: 'health', label: 'Health', desc: 'WHOOP recovery, sleep, HRV, cycle' },
        { key: 'code_activity', label: 'Code Activity', desc: 'GitHub contribution graph' },
        { key: 'upcoming_events', label: 'Upcoming Events', desc: 'Calendar events within 48 hours' },
        { key: 'project_tasks', label: 'Project Tasks', desc: 'In-progress and pending tasks' },
        { key: 'urgent_inbox', label: 'Urgent Inbox', desc: 'Unread messages scored urgent' },
    ];

    let _appearanceConfig = null;

    async function loadAppearanceSection() {
        try {
            const res = await fetch('/api/config/user');
            const user = await res.json();
            const raw = user.dashboard_widgets || {};
            _appearanceConfig = normalizeWidgetConfig(raw);
        } catch (e) { _appearanceConfig = normalizeWidgetConfig({}); }
        renderToggles('settingsTabToggles', TAB_TOGGLES, _appearanceConfig.tabs);
        renderToggles('settingsWidgetToggles', WIDGET_TOGGLES, _appearanceConfig.right_panel);
    }

    function normalizeWidgetConfig(raw) {
        if (raw && raw.tabs && raw.right_panel) return raw;
        return {
            tabs: {
                socials: raw.social !== false,
                goals: true,
                projections: raw.projections !== false,
                wishlist: raw.wishlist !== false,
            },
            right_panel: {
                finance: raw.finance !== false,
                health: raw.health !== false,
                code_activity: raw.github_graph !== false,
                upcoming_events: false,
                project_tasks: false,
                urgent_inbox: false,
            }
        };
    }

    function renderToggles(containerId, items, config) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = items.map(item => {
            const on = config[item.key] !== false;
            return '<div class="settings-toggle-row">' +
                '<div><div class="toggle-label">' + esc(item.label) + '</div><div class="toggle-desc">' + esc(item.desc) + '</div></div>' +
                '<div class="settings-toggle' + (on ? ' on' : '') + '" data-key="' + item.key + '"></div>' +
                '</div>';
        }).join('');
        container.querySelectorAll('.settings-toggle').forEach(toggle => {
            toggle.addEventListener('click', function() {
                this.classList.toggle('on');
            });
        });
    }

    document.getElementById('settingsAppearanceSave')?.addEventListener('click', async function() {
        if (!_appearanceConfig) return;
        // Read toggle states
        document.querySelectorAll('#settingsTabToggles .settings-toggle').forEach(t => {
            _appearanceConfig.tabs[t.dataset.key] = t.classList.contains('on');
        });
        document.querySelectorAll('#settingsWidgetToggles .settings-toggle').forEach(t => {
            _appearanceConfig.right_panel[t.dataset.key] = t.classList.contains('on');
        });
        try {
            const userRes = await fetch('/api/config/user');
            const user = await userRes.json();
            user.dashboard_widgets = _appearanceConfig;
            const saveRes = await fetch('/api/config/user', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(user)
            });
            if (saveRes.ok) {
                if (typeof showToast === 'function') showToast('Appearance saved — reload to apply', 'success');
                // Apply immediately
                if (typeof applyWidgetConfig === 'function') applyWidgetConfig(_appearanceConfig);
            }
        } catch (e) {
            if (typeof showToast === 'function') showToast('Failed to save', 'error');
        }
    });

    // ══════════════════════════════════════════════════════════════════════
    // SECTION 3: PRIORITIES
    // ══════════════════════════════════════════════════════════════════════
    const LIFE_AREAS = ['Business', 'Freelance', 'Health', 'Finance', 'Relationships', 'Learning', 'Creative', 'Social Media', 'Travel', 'Spirituality', 'Family'];
    const RELATIONSHIPS = ['partner', 'family', 'bestie', 'client', 'business_partner', 'mentor', 'other'];
    const PA_STYLES = ['direct', 'warm', 'professional'];
    let _prioritiesData = null;

    async function loadPrioritiesSection() {
        try {
            const res = await fetch('/api/setup/priorities');
            if (res.ok) _prioritiesData = await res.json();
            else _prioritiesData = { life_areas: [], vip_people: [], urgency_keywords: [], pa_style: 'direct' };
        } catch (e) { _prioritiesData = { life_areas: [], vip_people: [], urgency_keywords: [], pa_style: 'direct' }; }
        renderPriorities();
    }

    function renderPriorities() {
        if (!_prioritiesData) return;
        // Life areas
        const areasEl = document.getElementById('settingsLifeAreas');
        if (areasEl) {
            const selected = _prioritiesData.life_areas || [];
            areasEl.innerHTML = LIFE_AREAS.map(a =>
                '<button type="button" class="settings-chip' + (selected.includes(a) ? ' selected' : '') + '" data-area="' + esc(a) + '">' + esc(a) + '</button>'
            ).join('');
            areasEl.querySelectorAll('.settings-chip').forEach(chip => {
                chip.addEventListener('click', () => chip.classList.toggle('selected'));
            });
        }
        // VIP people
        renderVipList();
        // Urgency keywords
        const kwEl = document.getElementById('settingsUrgencyKeywords');
        if (kwEl) {
            const kw = _prioritiesData.urgency_keywords || [];
            kwEl.value = Array.isArray(kw) ? kw.join(', ') : kw;
        }
        // PA style
        const styleEl = document.getElementById('settingsPaStyle');
        if (styleEl) {
            styleEl.innerHTML = PA_STYLES.map(s =>
                '<button type="button" class="settings-radio-option' + (s === (_prioritiesData.pa_style || 'direct') ? ' selected' : '') + '" data-style="' + s + '">' + s.charAt(0).toUpperCase() + s.slice(1) + '</button>'
            ).join('');
            styleEl.querySelectorAll('.settings-radio-option').forEach(opt => {
                opt.addEventListener('click', function() {
                    styleEl.querySelectorAll('.settings-radio-option').forEach(o => o.classList.remove('selected'));
                    this.classList.add('selected');
                });
            });
        }
    }

    function renderVipList() {
        const container = document.getElementById('settingsVipList');
        if (!container) return;
        const people = _prioritiesData.vip_people || [];
        container.innerHTML = people.map((p, i) =>
            '<div class="settings-vip-row" data-index="' + i + '">' +
            '<input type="text" class="todo-input" value="' + esc(p.name || '') + '" placeholder="Name" data-field="name">' +
            '<select class="todo-input" data-field="relationship">' +
            RELATIONSHIPS.map(r => '<option value="' + r + '"' + (r === (p.relationship || 'other') ? ' selected' : '') + '>' + r.replace('_', ' ') + '</option>').join('') +
            '</select>' +
            '<button type="button" class="setup-remove-btn" title="Remove">×</button>' +
            '</div>'
        ).join('');
        container.querySelectorAll('.setup-remove-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const row = this.closest('.settings-vip-row');
                const idx = parseInt(row.dataset.index, 10);
                _prioritiesData.vip_people.splice(idx, 1);
                renderVipList();
            });
        });
    }

    document.getElementById('settingsAddVip')?.addEventListener('click', function() {
        if (!_prioritiesData) return;
        if (!_prioritiesData.vip_people) _prioritiesData.vip_people = [];
        _prioritiesData.vip_people.push({ name: '', relationship: 'other' });
        renderVipList();
    });

    document.getElementById('settingsPrioritiesSave')?.addEventListener('click', async function() {
        if (!_prioritiesData) return;
        // Collect life areas
        _prioritiesData.life_areas = [...document.querySelectorAll('#settingsLifeAreas .settings-chip.selected')].map(c => c.dataset.area);
        // Collect VIP people from DOM
        _prioritiesData.vip_people = [...document.querySelectorAll('.settings-vip-row')].map(row => ({
            name: row.querySelector('[data-field="name"]')?.value?.trim() || '',
            relationship: row.querySelector('[data-field="relationship"]')?.value || 'other'
        })).filter(p => p.name);
        // Urgency keywords
        const kwRaw = document.getElementById('settingsUrgencyKeywords')?.value || '';
        _prioritiesData.urgency_keywords = kwRaw.split(',').map(s => s.trim()).filter(Boolean);
        // PA style
        const selectedStyle = document.querySelector('#settingsPaStyle .settings-radio-option.selected');
        _prioritiesData.pa_style = selectedStyle?.dataset.style || 'direct';

        try {
            const res = await fetch('/api/setup/priorities', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(_prioritiesData)
            });
            if (res.ok) {
                if (typeof showToast === 'function') showToast('Priorities saved', 'success');
            }
        } catch (e) {
            if (typeof showToast === 'function') showToast('Failed to save', 'error');
        }
    });

    // ══════════════════════════════════════════════════════════════════════
    // SECTION 4: INBOX RULES
    // ══════════════════════════════════════════════════════════════════════
    async function loadInboxRulesSection() {
        // Show urgency keywords from priorities
        try {
            const res = await fetch('/api/setup/priorities');
            if (res.ok) {
                const data = await res.json();
                const kw = data.urgency_keywords || [];
                const kwEl = document.getElementById('settingsKeywordsDisplay');
                if (kwEl) {
                    kwEl.innerHTML = (Array.isArray(kw) ? kw : []).map(k =>
                        '<span class="settings-chip selected" style="cursor:default;">' + esc(k) + '</span>'
                    ).join('') || '<span class="settings-dim">No keywords set</span>';
                }
            }
        } catch (e) { /* ignore */ }

        // Edit keywords button
        document.getElementById('settingsEditKeywords')?.addEventListener('click', function() {
            const prioritiesBtn = document.querySelector('.settings-nav-item[data-settings="priorities"]');
            if (prioritiesBtn) prioritiesBtn.click();
        });

        // Contact summary
        try {
            const res = await fetch('/api/contacts/summary');
            if (res.ok) {
                const counts = await res.json();
                const summaryEl = document.getElementById('settingsContactSummary');
                if (summaryEl) {
                    const labelMap = {};
                    counts.forEach(c => { labelMap[c.label] = c.count; });
                    const parts = [];
                    if (labelMap.vip) parts.push('VIP: ' + labelMap.vip);
                    if (labelMap.regular) parts.push('Regular: ' + labelMap.regular);
                    if (labelMap.ignored) parts.push('Ignored: ' + labelMap.ignored);
                    if (labelMap.blocked) parts.push('Blocked: ' + labelMap.blocked);
                    summaryEl.innerHTML = parts.length ? '<span style="font-size:13px;">' + parts.join(' &middot; ') + '</span>' : '<span class="settings-dim">No contacts</span>';
                }
            }
        } catch (e) { /* ignore */ }
    }

    // ══════════════════════════════════════════════════════════════════════
    // SECTION 5: PROJECTS
    // ══════════════════════════════════════════════════════════════════════
    async function loadProjectsSection() {
        const container = document.getElementById('settingsProjectList');
        if (!container) return;
        try {
            const res = await fetch('/api/home/projects-expanded');
            if (!res.ok) throw new Error('API error');
            const projects = await res.json();
            container.innerHTML = projects.map(p => {
                const healthClass = 'health-' + (p.health_status || 'green').toLowerCase();
                return '<div class="settings-project-row">' +
                    '<span class="settings-project-name" data-pid="' + p.id + '">' + esc(p.name) + '</span>' +
                    '<span class="health-dot ' + healthClass + '" style="width:8px;height:8px;border-radius:50;display:inline-block;"></span>' +
                    '<span class="settings-project-progress">' + (p.progress_pct || 0) + '%</span>' +
                    '<select class="settings-project-rank" data-project-id="' + p.id + '">' +
                    [1, 2, 3, 4].map(r => '<option value="' + r + '"' + (r === p.priority_rank ? ' selected' : '') + '>P' + r + '</option>').join('') +
                    '</select>' +
                    '</div>';
            }).join('') || '<p class="settings-dim">No active projects</p>';
            // Click project name → navigate
            container.querySelectorAll('.settings-project-name').forEach(el => {
                el.addEventListener('click', function() {
                    const pid = this.dataset.pid;
                    if (typeof window.showPanel === 'function') window.showPanel('project-' + pid);
                });
            });
            // Priority rank change
            container.querySelectorAll('.settings-project-rank').forEach(sel => {
                sel.addEventListener('change', async function() {
                    const pid = this.dataset.projectId;
                    try {
                        await fetch('/api/projects/' + pid, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ priority_rank: parseInt(this.value, 10) })
                        });
                        if (typeof showToast === 'function') showToast('Priority updated', 'success');
                    } catch (e) { /* ignore */ }
                });
            });
        } catch (e) {
            container.innerHTML = '<p class="settings-dim">Failed to load projects</p>';
        }
    }

    // Open Strategy view
    document.getElementById('settingsOpenStrategy')?.addEventListener('click', function() {
        if (typeof window.showPanel === 'function') window.showPanel('more');
        setTimeout(() => {
            const stratBtn = document.querySelector('.more-sub-tab[data-section="strategy"]');
            if (stratBtn) stratBtn.click();
        }, 100);
    });

    // ══════════════════════════════════════════════════════════════════════
    // SECTION 6: PERSONAL (existing setup logic, mostly unchanged)
    // ══════════════════════════════════════════════════════════════════════
    async function loadSetup() {
        try {
            const [setupRes, cycleRes] = await Promise.all([
                fetch('/api/setup'),
                fetch('/api/health/cycle-config')
            ]);
            const data = await setupRes.json();
            if (!setupRes.ok) throw new Error(data.error || 'Failed to load');
            setupData.tax_residency = data.tax_residency;
            setupData.tax_residency_history = Array.isArray(data.tax_residency_history) ? data.tax_residency_history : [];
            setupData.companies = Array.isArray(data.companies) ? data.companies : [];
            setupData.reporting_periods = Array.isArray(data.reporting_periods) ? data.reporting_periods : [];
            setupData.health_insurance = data.health_insurance && typeof data.health_insurance === 'object' ? data.health_insurance : null;
            if (cycleRes.ok) {
                const cycleData = await cycleRes.json();
                setupData.cycle_config = cycleData && typeof cycleData === 'object' ? cycleData : null;
            } else {
                setupData.cycle_config = null;
            }
            renderSetup();
        } catch (e) {
            console.warn('Load setup:', e);
            renderSetup();
        }
    }

    function renderSetup() {
        const tr = setupData.tax_residency || {};
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val != null ? val : ''; };
        set('setupTaxCountry', tr.country || '');
        set('setupTaxEffectiveFrom', tr.effective_from || '');
        set('setupTaxNotes', tr.notes || '');
        const historyList = document.getElementById('setupTaxHistoryList');
        if (historyList) {
            historyList.innerHTML = setupData.tax_residency_history.map((h, i) =>
                '<li class="setup-history-item">' +
                '<span class="setup-history-country">' + (h.country || '\u2014') + '</span> ' +
                '<span class="setup-history-dates">' + (h.effective_from || '') + (h.effective_to ? ' \u2192 ' + h.effective_to : '') + '</span>' +
                (h.notes ? ' <span class="setup-history-notes">' + h.notes + '</span>' : '') +
                ' <button type="button" class="setup-remove-btn" data-section="tax_residency_history" data-index="' + i + '" title="Remove">\u00d7</button>' +
                '</li>'
            ).join('');
        }
        renderEntityList('setupCompaniesList', setupData.companies, ['name', 'jurisdiction', 'reporting_period', 'due_date'], 'companies', { name: 'Company name', jurisdiction: 'Jurisdiction', reporting_period: 'Reporting period', due_date: 'Due date' });
        renderEntityList('setupReportingList', setupData.reporting_periods, ['name', 'period', 'due_date'], 'reporting_periods', { name: 'What', period: 'Period', due_date: 'Due date' });
        const hi = setupData.health_insurance || {};
        set('setupHealthInsurer', hi.insurer || '');
        set('setupHealthYear', hi.year || '');
        set('setupHealthCheckupBenefits', hi.checkup_benefits || '');
        set('setupHealthRenewalDate', hi.renewal_date || '');
        set('setupHealthNotes', hi.notes || '');
        const cc = setupData.cycle_config || {};
        set('setupCycleLastPeriodStart', cc.last_period_start || '');
        set('setupCyclePeriodLength', cc.period_length_days != null ? cc.period_length_days : '');
        set('setupCycleLength', cc.cycle_length_days != null ? cc.cycle_length_days : '');
        set('setupCycleFollicular', cc.follicular_days != null ? cc.follicular_days : '');
        set('setupCycleOvulatory', cc.ovulatory_days != null ? cc.ovulatory_days : '');
        set('setupCyclePms', cc.pms_days != null ? cc.pms_days : '');
    }

    function renderEntityList(containerId, items, keys, sectionKey, labels) {
        const container = document.getElementById(containerId);
        if (!container) return;
        if (!items.length) {
            container.innerHTML = '<p class="setup-empty">None yet. Add one below.</p>';
            bindEntityList(containerId, sectionKey, keys, labels);
            return;
        }
        container.innerHTML = items.map((item, i) => {
            const cells = keys.map(k => {
                const val = item[k] != null ? String(item[k]) : '';
                const label = labels[k] || k;
                const type = k === 'due_date' ? 'date' : 'text';
                return '<input type="' + type + '" class="setup-entity-input" data-key="' + k + '" data-index="' + i + '" value="' + val.replace(/"/g, '&quot;') + '" placeholder="' + label + '">';
            }).join('');
            return '<div class="setup-entity-row" data-index="' + i + '">' + cells + ' <button type="button" class="setup-remove-btn" data-section="' + sectionKey + '" data-index="' + i + '" title="Remove">\u00d7</button></div>';
        }).join('');
        bindEntityList(containerId, sectionKey, keys, labels);
    }

    function bindEntityList(containerId, sectionKey) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.querySelectorAll('.setup-entity-input').forEach(inp => {
            inp.removeEventListener('change', inp._saveHandler);
            inp._saveHandler = function() {
                const row = inp.closest('.setup-entity-row');
                const idx = row ? parseInt(row.dataset.index, 10) : parseInt(inp.dataset.index, 10);
                const arr = sectionKey === 'companies' ? setupData.companies : setupData.reporting_periods;
                if (arr[idx] == null) return;
                const key = inp.dataset.key;
                if (key) arr[idx][key] = inp.value.trim() || null;
                saveSetupSection(sectionKey, arr);
            };
            inp.addEventListener('change', inp._saveHandler);
            inp.addEventListener('blur', inp._saveHandler);
        });
        container.querySelectorAll('.setup-remove-btn').forEach(btn => {
            btn.onclick = function() {
                const section = this.dataset.section;
                const index = parseInt(this.dataset.index, 10);
                if (section === 'tax_residency_history') {
                    setupData.tax_residency_history.splice(index, 1);
                    saveSetupSection('tax_residency_history', setupData.tax_residency_history).then(() => renderSetup());
                } else {
                    const arr = section === 'companies' ? setupData.companies : setupData.reporting_periods;
                    arr.splice(index, 1);
                    saveSetupSection(section, arr).then(() => renderSetup());
                }
            };
        });
    }

    async function saveSetupSection(sectionKey, payload) {
        try {
            const res = await fetch('/api/setup/' + sectionKey, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ payload })
            });
            if (!res.ok) throw new Error('Save failed');
            if (typeof showToast === 'function') showToast('Saved', 'success');
        } catch (e) {
            if (typeof showToast === 'function') showToast('Failed to save', 'error');
        }
    }

    function syncEntitiesFromDOM() {
        document.querySelectorAll('#setupCompaniesList .setup-entity-row').forEach((row, i) => {
            if (!setupData.companies[i]) setupData.companies[i] = {};
            row.querySelectorAll('.setup-entity-input').forEach(inp => {
                const key = inp.dataset.key;
                if (key) setupData.companies[i][key] = inp.value.trim() || null;
            });
        });
        document.querySelectorAll('#setupReportingList .setup-entity-row').forEach((row, i) => {
            if (!setupData.reporting_periods[i]) setupData.reporting_periods[i] = {};
            row.querySelectorAll('.setup-entity-input').forEach(inp => {
                const key = inp.dataset.key;
                if (key) setupData.reporting_periods[i][key] = inp.value.trim() || null;
            });
        });
        setupData.health_insurance = {
            insurer: document.getElementById('setupHealthInsurer')?.value?.trim() || null,
            year: document.getElementById('setupHealthYear')?.value?.trim() || null,
            checkup_benefits: document.getElementById('setupHealthCheckupBenefits')?.value?.trim() || null,
            renewal_date: document.getElementById('setupHealthRenewalDate')?.value || null,
            notes: document.getElementById('setupHealthNotes')?.value?.trim() || null
        };
        const lastPeriod = document.getElementById('setupCycleLastPeriodStart')?.value?.trim();
        setupData.cycle_config = lastPeriod ? {
            last_period_start: lastPeriod,
            period_length_days: parseInt(document.getElementById('setupCyclePeriodLength')?.value, 10) || 4,
            cycle_length_days: parseInt(document.getElementById('setupCycleLength')?.value, 10) || 31,
            follicular_days: parseInt(document.getElementById('setupCycleFollicular')?.value, 10) || 14,
            ovulatory_days: parseInt(document.getElementById('setupCycleOvulatory')?.value, 10) || 2,
            pms_days: parseInt(document.getElementById('setupCyclePms')?.value, 10) || 3
        } : null;
    }

    async function saveAllSetup() {
        syncEntitiesFromDOM();
        const tr = {
            country: document.getElementById('setupTaxCountry')?.value?.trim() || null,
            effective_from: document.getElementById('setupTaxEffectiveFrom')?.value || null,
            notes: document.getElementById('setupTaxNotes')?.value?.trim() || null
        };
        try {
            const res = await fetch('/api/setup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tax_residency: tr,
                    tax_residency_history: setupData.tax_residency_history,
                    companies: setupData.companies,
                    reporting_periods: setupData.reporting_periods,
                    health_insurance: setupData.health_insurance
                })
            });
            if (!res.ok) throw new Error('Save failed');
            setupData.tax_residency = tr;
            if (setupData.cycle_config && setupData.cycle_config.last_period_start) {
                await fetch('/api/health/cycle-config', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(setupData.cycle_config)
                });
            }
            if (typeof showToast === 'function') showToast('Personal settings saved', 'success');
        } catch (e) {
            if (typeof showToast === 'function') showToast('Failed to save', 'error');
        }
    }

    document.getElementById('setupSaveBtn')?.addEventListener('click', saveAllSetup);
    document.getElementById('setupTaxAddHistory')?.addEventListener('click', function() {
        const country = document.getElementById('setupTaxCountry')?.value?.trim() || prompt('Country / jurisdiction:');
        if (!country) return;
        const effectiveFrom = prompt('Effective from (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
        if (!effectiveFrom) return;
        const effectiveTo = prompt('Effective to (YYYY-MM-DD) or leave blank:', '');
        const notes = prompt('Notes (optional):', '');
        setupData.tax_residency_history.push({ country, effective_from: effectiveFrom, effective_to: effectiveTo || null, notes: notes || null });
        saveSetupSection('tax_residency_history', setupData.tax_residency_history).then(() => renderSetup());
    });
    document.getElementById('setupAddCompany')?.addEventListener('click', function() {
        setupData.companies.push({ name: '', jurisdiction: '', reporting_period: '', due_date: '' });
        saveSetupSection('companies', setupData.companies).then(() => renderSetup());
    });
    document.getElementById('setupAddReporting')?.addEventListener('click', function() {
        setupData.reporting_periods.push({ name: '', period: '', due_date: '' });
        saveSetupSection('reporting_periods', setupData.reporting_periods).then(() => renderSetup());
    });

    // ── Integrations (API keys + sync) ────────────────────────────────────
    async function loadIntegrations() {
        try {
            const res = await fetch('/api/setup/integrations');
            if (!res.ok) return;
            const { payload } = await res.json();
            const p = payload || {};
            const set = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.value = val; };
            set('setupStripeKey', p.stripe_key || '');
            set('setupWiseToken', p.wise_token || '');
            set('setupWiseProfileId', p.wise_profile_id || '');
            set('setupCalendarNames', Array.isArray(p.calendar_names) ? p.calendar_names.join(', ') : (p.calendar_names || ''));
            const selectedInboxes = Array.isArray(p.mail_inboxes) ? p.mail_inboxes : [];
            await renderMailboxes(selectedInboxes);
        } catch (e) { /* ignore */ }
    }

    async function renderMailboxes(selected = []) {
        const container = document.getElementById('setupMailboxList');
        if (!container) return;
        container.innerHTML = '<span class="settings-dim">Loading...</span>';
        try {
            const res = await fetch('/api/messages/mailboxes');
            const boxes = await res.json();
            if (!boxes.length) { container.innerHTML = '<span class="settings-dim">No mailboxes found</span>'; return; }
            container.innerHTML = boxes.map(b => {
                const checked = selected.includes(b) ? 'checked' : '';
                return '<label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;border:1px solid var(--border);border-radius:4px;padding:3px 8px;">' +
                    '<input type="checkbox" class="setup-mailbox-cb" value="' + esc(b) + '" ' + checked + '> ' + esc(b) +
                    '</label>';
            }).join('');
        } catch (e) {
            container.innerHTML = '<span class="settings-dim">Mail.app not accessible</span>';
        }
    }

    document.getElementById('setupIntegrationsSaveBtn')?.addEventListener('click', async function() {
        const g = id => document.getElementById(id)?.value?.trim() || '';
        const calRaw = g('setupCalendarNames');
        const calNames = calRaw ? calRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
        const selectedMailboxes = [...document.querySelectorAll('.setup-mailbox-cb:checked')].map(cb => cb.value);
        const payload = {};
        const stripeKey = g('setupStripeKey'); if (stripeKey) payload.stripe_key = stripeKey;
        const wiseToken = g('setupWiseToken'); if (wiseToken) payload.wise_token = wiseToken;
        const wiseProfileId = g('setupWiseProfileId'); if (wiseProfileId) payload.wise_profile_id = wiseProfileId;
        payload.calendar_names = calNames;
        payload.mail_inboxes = selectedMailboxes;

        // Save Claude key if present
        const claudeKey = g('settingsClaudeKey');
        if (claudeKey) {
            try {
                await fetch('/api/setup/pa_config', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ payload: { claude_api_key: claudeKey } })
                });
            } catch (e) { /* ignore */ }
        }

        const statusEl = document.getElementById('setupIntegrationsSaveStatus');
        try {
            const res = await fetch('/api/setup/integrations', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                if (statusEl) { statusEl.textContent = 'Saved \u2713'; setTimeout(() => { statusEl.textContent = ''; }, 2000); }
                await fetch('/api/setup/apply-integrations', { method: 'POST' });
            }
        } catch (e) {
            if (statusEl) statusEl.textContent = 'Failed';
        }
    });

    document.getElementById('setupCalendarSyncBtn')?.addEventListener('click', async function() {
        const statusEl = document.getElementById('setupCalendarSyncStatus');
        if (statusEl) statusEl.textContent = 'Syncing...';
        try {
            const r = await fetch('/api/upcoming/sync-calendar', { method: 'POST' });
            const d = await r.json();
            if (statusEl) statusEl.textContent = d.error ? 'Error' : d.synced + ' events';
        } catch (e) { if (statusEl) statusEl.textContent = 'Failed'; }
        setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
    });

    document.getElementById('setupMailSyncBtn')?.addEventListener('click', async function() {
        const statusEl = document.getElementById('setupMailSyncStatus');
        if (statusEl) statusEl.textContent = 'Syncing...';
        try {
            const r = await fetch('/api/messages/sync-mail', { method: 'POST' });
            const d = await r.json();
            if (statusEl) statusEl.textContent = d.error ? 'Error' : d.synced + ' emails';
        } catch (e) { if (statusEl) statusEl.textContent = 'Failed'; }
        setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
    });

    // ── Expose loadSetup globally ─────────────────────────────────────────
    window.loadSetup = async function() {
        await loadSetup();
        // Auto-load integrations section (it's the default active section)
        if (!sectionLoaded['integrations']) {
            sectionLoaded['integrations'] = true;
            await loadIntegrationsSection();
        }
    };
})();
