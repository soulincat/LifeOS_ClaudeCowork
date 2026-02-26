/* ================================================================
   Life OS Dashboard — Inbox UI
   ================================================================
   Tiered message inbox: urgent / medium / ignored sections,
   contact actions, conversation history, privacy mode, sync.

   Depends on: utils.js (escHtml), api.js
   Exposes: initInboxTab, loadInboxCounts (via window)
   ================================================================ */

let inboxActiveSource = '';
let inboxActiveContext = '';
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
    return source === 'gmail' ? '\u2709' : source === 'outlook' ? '\uD83D\uDCE7' : source === 'whatsapp' ? '\uD83D\uDCAC' : '\uD83D\uDCE9';
}

function inboxEsc(s) { return typeof escHtml === 'function' ? escHtml(s) : (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }

const ACTION_TAG_CONFIG = {
    reply_needed: { label: 'Reply needed', cls: 'action-reply' },
    approval:     { label: 'Approval',     cls: 'action-approval' },
    payment:      { label: 'Payment',      cls: 'action-payment' },
    deadline:     { label: 'Deadline',      cls: 'action-deadline' },
    meeting:      { label: 'Meeting',       cls: 'action-meeting' },
    question:     { label: 'Question',      cls: 'action-question' },
    fyi:          { label: 'FYI',           cls: 'action-fyi' },
};

// ── Rendering ────────────────────────────────────────────────────────────────

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

    const atCfg = ACTION_TAG_CONFIG[msg.action_tag] || ACTION_TAG_CONFIG.fyi;
    const actionBadge = `<span class="inbox-action-tag ${atCfg.cls}">${atCfg.label}</span>`;

    const typeIcon = msg.contact_type === 'business' ? '<span class="inbox-type-icon" title="Work">\uD83D\uDCBC</span>'
        : msg.contact_type === 'personal' ? '<span class="inbox-type-icon" title="Personal">\uD83C\uDFE0</span>' : '';

    const categoryBadge = msg.category ? `<span class="inbox-category-badge">${inboxEsc(msg.category)}</span>` : '';
    const projectBadge = msg.project_name ? `<span class="inbox-project-badge">${inboxEsc(msg.project_name)}</span>` : '';

    const fullName = msg.sender_name || msg.sender_address || 'Unknown';
    const senderDisplay = privacy
        ? fullName.split(/[\s@]+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
        : inboxEsc(fullName);

    const labelIcon = msg.contact_label === 'vip' ? '<span class="inbox-contact-label vip" title="VIP">\u2B50</span>'
        : msg.contact_label === 'blocked' ? '<span class="inbox-contact-label blocked" title="Blocked">\uD83D\uDEAB</span>'
        : msg.contact_label === 'ignored' ? '<span class="inbox-contact-label ignored" title="Ignored">\uD83D\uDC7B</span>'
        : '';

    const subjectHtml = msg.subject
        ? `<div class="inbox-subject">${privacy ? '<span style="color:var(--text-dim)">\u2014</span>' : inboxEsc(msg.subject)}</div>`
        : '';
    const summaryHtml = (msg.ai_summary || msg.preview)
        ? `<div class="inbox-summary">${privacy ? '' : inboxEsc(msg.ai_summary || msg.preview)}</div>`
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
                <button class="inbox-action-btn" data-action="save-contact" data-address="${inboxEsc(msg.sender_address || '')}" data-name="${inboxEsc(msg.sender_name || '')}" data-id="${msg.id}" data-contact-id="${msg.contact_id || ''}" title="Save contact">\uD83D\uDC64</button>
                <button class="inbox-action-btn" data-action="block" data-address="${inboxEsc(msg.sender_address || '')}" title="Block sender">\uD83D\uDEAB</button>
                <button class="inbox-action-btn" data-action="ignore" data-address="${inboxEsc(msg.sender_address || '')}" data-name="${inboxEsc(msg.sender_name || '')}" title="Ignore sender">\uD83D\uDC7B</button>
                <button class="inbox-action-btn" data-action="vip" data-address="${inboxEsc(msg.sender_address || '')}" data-name="${inboxEsc(msg.sender_name || '')}" title="Mark VIP">\u2B50</button>
                <button class="inbox-action-btn" data-action="assign-project" data-id="${msg.id}" title="Assign to project">\uD83D\uDCC1</button>
                <button class="inbox-dismiss" title="Dismiss" data-id="${msg.id}">\u2715</button>
            </div>
        </div>
        ${subjectHtml}
        ${summaryHtml}
        <div class="inbox-reply-section">
            <textarea class="inbox-reply-input" placeholder="Reply\u2026" rows="2">${msg.ai_suggested_reply || ''}</textarea>
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

// ── Data loading ─────────────────────────────────────────────────────────────

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

        const tabBadge = document.getElementById('inboxTabBadge');
        if (tabBadge) { tabBadge.textContent = counts.total > 0 ? counts.total : ''; tabBadge.style.display = counts.total > 0 ? 'inline' : 'none'; }

        const container = document.getElementById('inboxContextTabs');
        if (!container) return;

        const allBadge = document.getElementById('inboxBadgeAll');
        if (allBadge) { allBadge.textContent = counts.total > 0 ? counts.total : ''; allBadge.style.display = counts.total > 0 ? 'inline' : 'none'; }

        container.querySelectorAll('.inbox-source-tab[data-context]:not([data-context=""])').forEach(el => el.remove());

        const contexts = counts.contexts || [];
        for (const ctx of contexts) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'inbox-source-tab';
            const ctxValue = ctx.project_id ? String(ctx.project_id) : (ctx.context_name === 'Personal' ? 'personal' : 'work');
            btn.dataset.context = ctxValue;
            if (ctxValue === inboxActiveContext) btn.classList.add('active');
            btn.innerHTML = inboxEsc(ctx.context_name) + (ctx.count > 0 ? ' <span class="inbox-badge" style="display:inline">' + ctx.count + '</span>' : '');
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

// ── Contact & message actions ────────────────────────────────────────────────

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
    const existingForm = card.querySelector('.inbox-contact-form');
    if (existingForm) { existingForm.remove(); return; }

    const address = btn.dataset.address;
    const name = btn.dataset.name || address;
    const contactId = btn.dataset.contactId;

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

    let projects = [];
    try { projects = await fetch('/api/projects').then(r => r.json()); } catch (e) { /* */ }
    const activeProjects = (Array.isArray(projects) ? projects : []).filter(p => p.status === 'active');

    const form = document.createElement('div');
    form.className = 'inbox-contact-form';
    form.innerHTML = `
        <div class="contact-form-row">
            <input type="text" class="contact-form-name todo-input" placeholder="Name" value="${inboxEsc(existing?.name || name)}">
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
                ${activeProjects.map(p => `<option value="${p.id}" ${existing?.project_id == p.id ? 'selected' : ''}>${inboxEsc(p.name)}</option>`).join('')}
            </select>
        </div>
        <div class="contact-form-row contact-form-actions">
            <button class="btn-save btn-small contact-form-save" data-address="${inboxEsc(address)}" data-contact-id="${existing?.id || ''}">Save</button>
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
    const existing = btn.closest('.inbox-card')?.querySelector('.inbox-project-picker');
    if (existing) { existing.remove(); return; }
    const picker = document.createElement('select');
    picker.className = 'inbox-project-picker todo-input';
    picker.style.cssText = 'font-size:11px;width:140px;position:absolute;right:0;top:20px;z-index:10;';
    picker.innerHTML = '<option value="">\u2014 Choose project \u2014</option>';
    try {
        const projects = await fetch('/api/projects').then(r => r.json());
        (Array.isArray(projects) ? projects : []).filter(p => p.status === 'active').forEach(p => {
            picker.innerHTML += `<option value="${p.id}">${inboxEsc(p.name)}</option>`;
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

// ── Event handler setup ──────────────────────────────────────────────────────

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
        this.textContent = 'Syncing\u2026'; this.disabled = true;
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
        const saveBtn = e.target.closest('.inbox-action-btn[data-action="save-contact"]');
        if (saveBtn) {
            inboxSaveContact(saveBtn);
            return;
        }
        const submitBtn = e.target.closest('.contact-form-save');
        if (submitBtn) {
            const form = submitBtn.closest('.inbox-contact-form');
            if (form) await submitContactForm(form);
            return;
        }
        const cancelBtn = e.target.closest('.contact-form-cancel');
        if (cancelBtn) {
            cancelBtn.closest('.inbox-contact-form')?.remove();
            return;
        }
        const blockBtn = e.target.closest('.inbox-action-btn[data-action="block"]');
        if (blockBtn) {
            inboxBlockSender(blockBtn.dataset.address, '');
            return;
        }
        const vipBtn = e.target.closest('.inbox-action-btn[data-action="vip"]');
        if (vipBtn) {
            inboxMarkVip(vipBtn.dataset.address, vipBtn.dataset.name);
            return;
        }
        const ignoreBtn = e.target.closest('.inbox-action-btn[data-action="ignore"]');
        if (ignoreBtn) {
            inboxIgnoreSender(ignoreBtn.dataset.address, ignoreBtn.dataset.name);
            return;
        }
        const assignBtn = e.target.closest('.inbox-action-btn[data-action="assign-project"]');
        if (assignBtn) {
            inboxAssignProject(assignBtn.dataset.id, assignBtn);
            return;
        }
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
                updateSectionCounts();
            } catch (e) { /* */ }
            return;
        }
        const sendBtn = e.target.closest('.inbox-send-btn');
        if (sendBtn) {
            const id = sendBtn.dataset.id;
            const card = sendBtn.closest('.inbox-card');
            const replyText = card?.querySelector('.inbox-reply-input')?.value?.trim();
            if (!replyText) return;
            sendBtn.textContent = 'Sending\u2026'; sendBtn.disabled = true;
            try {
                const res = await fetch(`/api/messages/${id}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reply_text: replyText }) });
                if (res.ok) { card.classList.add('inbox-card-sent'); setTimeout(() => { card.remove(); loadInboxCounts(); updateSectionCounts(); }, 800); }
                else { sendBtn.textContent = 'Failed'; sendBtn.disabled = false; }
            } catch (e) { sendBtn.textContent = 'Error'; sendBtn.disabled = false; }
            return;
        }

        // Click on card header -> expand/collapse conversation history
        const cardHeader = e.target.closest('.inbox-card-header');
        if (cardHeader && !e.target.closest('.inbox-quick-actions') && !e.target.closest('button') && !e.target.closest('textarea')) {
            const card = cardHeader.closest('.inbox-card');
            if (!card) return;
            const source = card.dataset.source;
            const sender = card.dataset.senderAddress || card.dataset.sender;
            const msgCount = parseInt(card.querySelector('.inbox-msg-count')?.textContent) || 1;

            const existing = card.querySelector('.inbox-convo-history');
            if (existing) {
                existing.remove();
                return;
            }

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
                        `<span class="inbox-convo-text">${inboxEsc((m.subject && m.subject !== m.preview) ? m.subject + ' \u2014 ' : '')}${inboxEsc((m.preview || m.ai_summary || '').slice(0, 120))}</span>`;
                    convoDiv.appendChild(row);
                });
                const subjectEl = card.querySelector('.inbox-subject') || card.querySelector('.inbox-summary');
                if (subjectEl) card.insertBefore(convoDiv, subjectEl);
                else card.appendChild(convoDiv);
            } catch (err) { /* silent */ }
        }
    });
}

// ── Polling & init ───────────────────────────────────────────────────────────

// Poll inbox counts every 60s; first call happens via initInboxTab when tab opens
setInterval(() => loadInboxCounts(), 60000);

// Expose globally
window.initInboxTab = initInboxTab;
window.loadInboxCounts = loadInboxCounts;
