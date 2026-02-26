/* ================================================================
   Life OS Dashboard — Contacts UI
   ================================================================
   Contact list management: load, render, add/edit form, search,
   filter, label actions (VIP/block), WhatsApp sync.

   Depends on: utils.js, api.js
   Exposes: loadContacts (via window.__loadContacts)
   ================================================================ */

let contactsData = [];

async function loadContacts() {
    const q     = document.getElementById('contactSearch')?.value.trim() || '';
    const label = document.getElementById('contactFilterLabel')?.value || '';
    const type  = document.getElementById('contactFilterType')?.value  || '';

    let url = '/api/contacts?';
    if (q)     url += `q=${encodeURIComponent(q)}&`;
    if (label) url += `label=${encodeURIComponent(label)}&`;
    if (type)  url += `type=${encodeURIComponent(type)}&`;

    try {
        const data = await fetch(url).then(r => r.json());
        contactsData = Array.isArray(data) ? data : [];
        renderContacts(contactsData);
    } catch (e) {
        renderContacts([]);
    }
}

function renderContacts(contacts) {
    const list = document.getElementById('contactsList');
    if (!list) return;
    if (!contacts.length) {
        list.innerHTML = '<div class="contacts-empty">No contacts found.</div>';
        return;
    }
    list.innerHTML = contacts.map(c => {
        const initials = (c.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        const isVip     = c.label === 'vip';
        const isBlocked = c.label === 'blocked';
        const isIgnored = c.label === 'ignored';
        const labelIcon = isVip ? '⭐' : isBlocked ? '🚫' : isIgnored ? '👻' : '';
        const cardClass = `contact-card${isVip ? ' is-vip' : ''}${isBlocked ? ' is-blocked' : ''}${isIgnored ? ' is-ignored' : ''}`;
        const relLabel = c.relationship ? c.relationship.replace(/_/g, ' ') : '';
        const tags = [
            c.type ? `<span class="contact-tag">${c.type}</span>` : '',
            relLabel ? `<span class="contact-tag">${escHtml(relLabel)}</span>` : '',
            c.project_name ? `<span class="contact-tag project">${escHtml(c.project_name)}</span>` : '',
        ].join('');
        const reach = [
            c.email ? `<span>✉ <a href="mailto:${escHtml(c.email)}">${escHtml(c.email)}</a></span>` : '',
            c.phone ? `<span>📱 ${escHtml(c.phone)}</span>` : '',
            c.whatsapp_jid ? `<span>💬 ${escHtml(c.whatsapp_jid)}</span>` : '',
        ].filter(Boolean).join('');
        return `
        <div class="${cardClass}" data-id="${c.id}">
            <div class="contact-avatar ${c.type || 'personal'}">${initials}</div>
            <div class="contact-body">
                <div class="contact-name">
                    ${labelIcon ? `<span class="contact-label-icon">${labelIcon}</span>` : ''}
                    ${escHtml(c.name)}
                </div>
                ${tags ? `<div class="contact-tags">${tags}</div>` : ''}
                ${reach ? `<div class="contact-reach">${reach}</div>` : ''}
                ${c.notes ? `<div class="contact-notes">${escHtml(c.notes)}</div>` : ''}
            </div>
            <div class="contact-actions">
                ${!isVip && !isBlocked ? `<button class="contact-btn" data-action="promote" data-id="${c.id}" title="Mark VIP">⭐</button>` : ''}
                ${!isBlocked ? `<button class="contact-btn" data-action="block" data-id="${c.id}" title="Block">🚫</button>` : ''}
                ${isBlocked ? `<button class="contact-btn" data-action="demote" data-id="${c.id}" title="Unblock">Unblock</button>` : ''}
                <button class="contact-btn" data-action="edit" data-id="${c.id}">Edit</button>
                <button class="contact-btn danger" data-action="delete" data-id="${c.id}">×</button>
            </div>
        </div>`;
    }).join('');

    // Wire action buttons
    list.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = btn.dataset.id;
            if (btn.dataset.action === 'edit') {
                const c = contactsData.find(x => String(x.id) === String(id));
                if (c) openContactForm(c);
            } else if (btn.dataset.action === 'delete') {
                if (!confirm(`Delete ${contactsData.find(x=>String(x.id)===String(id))?.name}?`)) return;
                await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
                loadContacts();
            } else if (btn.dataset.action === 'promote') {
                await fetch(`/api/contacts/${id}/promote`, { method: 'POST' });
                loadContacts();
            } else if (btn.dataset.action === 'block') {
                if (!confirm(`Block ${contactsData.find(x=>String(x.id)===String(id))?.name}? Their messages will be hidden.`)) return;
                await fetch(`/api/contacts/${id}/block`, { method: 'POST' });
                loadContacts();
            } else if (btn.dataset.action === 'demote') {
                await fetch(`/api/contacts/${id}/demote`, { method: 'POST' });
                loadContacts();
            }
        });
    });
}

// ── Contact form (add / edit) ───────────────────────────────────────────────
function openContactForm(contact = null) {
    const wrap = document.getElementById('contactFormWrap');
    if (!wrap) return;
    wrap.style.display = 'block';
    document.getElementById('contactFormTitle').textContent = contact ? 'Edit Contact' : 'New Contact';
    document.getElementById('contactFormId').value  = contact?.id || '';
    document.getElementById('cfName').value         = contact?.name || '';
    document.getElementById('cfEmail').value        = contact?.email || '';
    document.getElementById('cfPhone').value        = contact?.phone || '';
    document.getElementById('cfJid').value          = contact?.whatsapp_jid || '';
    document.getElementById('cfLabel').value        = contact?.label || 'regular';
    document.getElementById('cfType').value         = contact?.type || 'personal';
    document.getElementById('cfRelationship').value = contact?.relationship || '';
    document.getElementById('cfNotes').value        = contact?.notes || '';

    // Populate project dropdown
    fetch('/api/projects').then(r => r.json()).then(projects => {
        const sel = document.getElementById('cfProject');
        sel.innerHTML = '<option value="">None</option>';
        (Array.isArray(projects) ? projects : []).forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            if (contact?.project_id == p.id) opt.selected = true;
            sel.appendChild(opt);
        });
    }).catch(() => {});

    // Auto-fill JID from phone on blur
    document.getElementById('cfPhone').oninput = function() {
        const jid = document.getElementById('cfJid');
        if (!jid.value || jid.value.endsWith('@s.whatsapp.net')) {
            const num = this.value.replace(/[\s\-\+\(\)]/g, '');
            jid.value = num ? num + '@s.whatsapp.net' : '';
        }
    };

    wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeContactForm() {
    const wrap = document.getElementById('contactFormWrap');
    if (wrap) wrap.style.display = 'none';
}

async function saveContact() {
    const id   = document.getElementById('contactFormId').value;
    const body = {
        name:         document.getElementById('cfName').value.trim(),
        email:        document.getElementById('cfEmail').value.trim() || null,
        phone:        document.getElementById('cfPhone').value.trim() || null,
        whatsapp_jid: document.getElementById('cfJid').value.trim()  || null,
        label:        document.getElementById('cfLabel').value,
        type:         document.getElementById('cfType').value,
        project_id:   document.getElementById('cfProject').value || null,
        relationship: document.getElementById('cfRelationship').value.trim() || null,
        notes:        document.getElementById('cfNotes').value.trim() || null,
    };
    if (!body.name) { alert('Name is required'); return; }

    const url    = id ? `/api/contacts/${id}` : '/api/contacts';
    const method = id ? 'PATCH' : 'POST';
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    closeContactForm();
    loadContacts();
}

// ── WhatsApp contact sync ───────────────────────────────────────────────────
async function syncWhatsAppContacts() {
    const btn = document.getElementById('syncWaContactsBtn');
    if (btn) { btn.textContent = '⏳ Syncing…'; btn.disabled = true; }
    try {
        const r = await fetch('/api/contacts/sync-whatsapp', { method: 'POST' });
        const d = await r.json();
        if (d.error) throw new Error(d.error);
        if (btn) btn.textContent = `✅ +${d.added} added`;
        setTimeout(() => { if (btn) { btn.textContent = '💬 Sync WA'; btn.disabled = false; } }, 3000);
        loadContacts();
    } catch (e) {
        if (btn) { btn.textContent = '❌ Failed'; btn.disabled = false; }
        console.warn('WA sync failed:', e.message);
        setTimeout(() => { if (btn) { btn.textContent = '💬 Sync WA'; } }, 3000);
    }
}

// ── Event handler wiring ────────────────────────────────────────────────────
function setupContactHandlers() {
    document.getElementById('addContactBtn')?.addEventListener('click', () => openContactForm());
    document.getElementById('contactFormCancel')?.addEventListener('click', closeContactForm);
    document.getElementById('contactFormSave')?.addEventListener('click', saveContact);
    document.getElementById('syncWaContactsBtn')?.addEventListener('click', syncWhatsAppContacts);

    let searchTimer;
    document.getElementById('contactSearch')?.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(loadContacts, 300);
    });
    document.getElementById('contactFilterLabel')?.addEventListener('change', loadContacts);
    document.getElementById('contactFilterType')?.addEventListener('change', loadContacts);
}

// Init contacts when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    setupContactHandlers();
});

// Expose for tab switching (called by app-tabs.js)
window.__loadContacts = loadContacts;
