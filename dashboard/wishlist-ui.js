/* ================================================================
   Life OS Dashboard — Wishlist UI
   ================================================================
   Pinterest-style wishlist gallery: load, render, inline edit,
   savings progress, condition badges, drag-drop image upload.

   Depends on: utils.js
   Exposes: loadWishlist (via window)
   ================================================================ */

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

// ── Wishlist event handlers ──────────────────────────────────────────────────

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

// Expose globally
window.loadWishlist = loadWishlist;
