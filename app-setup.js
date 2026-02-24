(function() {
    let setupData = {
        tax_residency: null,
        tax_residency_history: [],
        companies: [],
        reporting_periods: [],
        health_insurance: null,
        cycle_config: null
    };

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
        const set = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val != null ? val : '';
        };
        set('setupTaxCountry', tr.country || '');
        set('setupTaxEffectiveFrom', tr.effective_from || '');
        set('setupTaxNotes', tr.notes || '');

        const historyList = document.getElementById('setupTaxHistoryList');
        if (historyList) {
            historyList.innerHTML = setupData.tax_residency_history.map((h, i) =>
                '<li class="setup-history-item">' +
                '<span class="setup-history-country">' + (h.country || '—') + '</span> ' +
                '<span class="setup-history-dates">' + (h.effective_from || '') + (h.effective_to ? ' → ' + h.effective_to : '') + '</span>' +
                (h.notes ? ' <span class="setup-history-notes">' + h.notes + '</span>' : '') +
                ' <button type="button" class="setup-remove-btn" data-section="tax_residency_history" data-index="' + i + '" title="Remove">×</button>' +
                '</li>'
            ).join('');
        }

        renderEntityList('setupCompaniesList', setupData.companies, ['name', 'jurisdiction', 'reporting_period', 'due_date'], 'companies', { name: 'Company name', jurisdiction: 'Jurisdiction', reporting_period: 'Reporting period (e.g. Calendar year)', due_date: 'Due date' });
        renderEntityList('setupReportingList', setupData.reporting_periods, ['name', 'period', 'due_date'], 'reporting_periods', { name: 'What (e.g. US personal tax)', period: 'Period (e.g. 2024)', due_date: 'Due date' });

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
            container.querySelectorAll('.setup-entity-row').forEach(r => r.remove());
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
            return '<div class="setup-entity-row" data-index="' + i + '">' + cells + ' <button type="button" class="setup-remove-btn" data-section="' + sectionKey + '" data-index="' + i + '" title="Remove">×</button></div>';
        }).join('');
        bindEntityList(containerId, sectionKey, keys, labels);
    }

    function bindEntityList(containerId, sectionKey, keys, labels) {
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
        const insurer = document.getElementById('setupHealthInsurer');
        const year = document.getElementById('setupHealthYear');
        const checkup = document.getElementById('setupHealthCheckupBenefits');
        const renewal = document.getElementById('setupHealthRenewalDate');
        const notes = document.getElementById('setupHealthNotes');
        setupData.health_insurance = {
            insurer: insurer ? insurer.value.trim() || null : null,
            year: year ? year.value.trim() || null : null,
            checkup_benefits: checkup ? checkup.value.trim() || null : null,
            renewal_date: renewal ? renewal.value || null : null,
            notes: notes ? notes.value.trim() || null : null
        };
        const lastPeriod = document.getElementById('setupCycleLastPeriodStart')?.value?.trim();
        const periodLen = document.getElementById('setupCyclePeriodLength')?.value;
        const cycleLen = document.getElementById('setupCycleLength')?.value;
        const follicular = document.getElementById('setupCycleFollicular')?.value;
        const ovulatory = document.getElementById('setupCycleOvulatory')?.value;
        const pms = document.getElementById('setupCyclePms')?.value;
        setupData.cycle_config = lastPeriod ? {
            last_period_start: lastPeriod,
            period_length_days: periodLen ? parseInt(periodLen, 10) : 4,
            cycle_length_days: cycleLen ? parseInt(cycleLen, 10) : 31,
            follicular_days: follicular ? parseInt(follicular, 10) : 14,
            ovulatory_days: ovulatory ? parseInt(ovulatory, 10) : 2,
            pms_days: pms ? parseInt(pms, 10) : 3
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
                const cr = await fetch('/api/health/cycle-config', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(setupData.cycle_config)
                });
                if (!cr.ok) console.warn('Cycle config save failed');
            }
            if (typeof showToast === 'function') showToast('Setup saved', 'success');
        } catch (e) {
            if (typeof showToast === 'function') showToast('Failed to save setup', 'error');
        }
    }

    document.getElementById('setupSaveBtn')?.addEventListener('click', saveAllSetup);

    document.getElementById('setupTaxAddHistory')?.addEventListener('click', function() {
        const country = document.getElementById('setupTaxCountry')?.value?.trim() || prompt('Country / jurisdiction for this period:');
        if (!country) return;
        const effectiveFrom = prompt('Effective from (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
        if (!effectiveFrom) return;
        const effectiveTo = prompt('Effective to (YYYY-MM-DD) or leave blank if current:', '');
        const notes = prompt('Notes (optional):', '');
        setupData.tax_residency_history.push({
            country,
            effective_from: effectiveFrom,
            effective_to: effectiveTo || null,
            notes: notes || null
        });
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

    // ── Integrations section ────────────────────────────────────────────────

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
            set('setupCalendarNames', Array.isArray(p.calendar_names) ? p.calendar_names.join(', ') : (p.calendar_names || '집'));

            // Load mailboxes
            const selectedInboxes = Array.isArray(p.mail_inboxes) ? p.mail_inboxes : [];
            await renderMailboxes(selectedInboxes);
        } catch (e) { /* ignore */ }
    }

    async function renderMailboxes(selected = []) {
        const container = document.getElementById('setupMailboxList');
        if (!container) return;
        container.innerHTML = '<span style="font-size:11px;color:var(--text-dim)">Loading…</span>';
        try {
            const res = await fetch('/api/messages/mailboxes');
            const boxes = await res.json();
            if (!boxes.length) { container.innerHTML = '<span style="font-size:11px;color:var(--text-dim)">No mailboxes found. Add accounts in System Settings → Internet Accounts.</span>'; return; }
            container.innerHTML = boxes.map(b => {
                const checked = selected.includes(b) ? 'checked' : '';
                return `<label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;background:var(--bg-raised);border:1px solid var(--border);border-radius:4px;padding:3px 8px;">
                    <input type="checkbox" class="setup-mailbox-cb" value="${b}" ${checked}> ${b}
                </label>`;
            }).join('');
        } catch (e) {
            container.innerHTML = '<span style="font-size:11px;color:var(--text-dim)">Mail.app not accessible.</span>';
        }
    }

    document.getElementById('setupIntegrationsSaveBtn')?.addEventListener('click', async function() {
        const g = id => document.getElementById(id)?.value?.trim() || '';
        const calRaw = g('setupCalendarNames');
        const calNames = calRaw ? calRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
        const selectedMailboxes = [...document.querySelectorAll('.setup-mailbox-cb:checked')].map(cb => cb.value);

        const payload = {
            stripe_key: g('setupStripeKey') || undefined,
            wise_token: g('setupWiseToken') || undefined,
            wise_profile_id: g('setupWiseProfileId') || undefined,
            calendar_names: calNames,
            mail_inboxes: selectedMailboxes,
        };
        // Remove undefined keys
        Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

        const statusEl = document.getElementById('setupIntegrationsSaveStatus');
        try {
            const res = await fetch('/api/setup/integrations', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                if (statusEl) { statusEl.textContent = 'Saved ✓'; setTimeout(() => { statusEl.textContent = ''; }, 2000); }
                // Apply API keys to running process
                await fetch('/api/setup/apply-integrations', { method: 'POST' });
            }
        } catch (e) {
            if (statusEl) statusEl.textContent = 'Failed to save';
        }
    });

    document.getElementById('setupCalendarSyncBtn')?.addEventListener('click', async function() {
        const statusEl = document.getElementById('setupCalendarSyncStatus');
        if (statusEl) statusEl.textContent = 'Syncing…';
        try {
            const r = await fetch('/api/upcoming/sync-calendar', { method: 'POST' });
            const d = await r.json();
            if (statusEl) { statusEl.textContent = d.error ? `Error: ${d.error}` : `Done — ${d.synced} events synced`; }
        } catch (e) {
            if (statusEl) statusEl.textContent = 'Failed';
        }
    });

    document.getElementById('setupMailSyncBtn')?.addEventListener('click', async function() {
        const statusEl = document.getElementById('setupMailSyncStatus');
        if (statusEl) statusEl.textContent = 'Syncing…';
        try {
            const r = await fetch('/api/messages/sync-mail', { method: 'POST' });
            const d = await r.json();
            if (statusEl) { statusEl.textContent = d.error ? `Error: ${d.error}` : `Done — ${d.synced} new emails`; }
        } catch (e) {
            if (statusEl) statusEl.textContent = 'Failed';
        }
    });

    const _origLoadSetup = loadSetup;
    window.loadSetup = async function() {
        await _origLoadSetup();
        await loadIntegrations();
    };
})();
