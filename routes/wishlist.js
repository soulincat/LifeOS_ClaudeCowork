const express = require('express');
const router = express.Router();
const db = require('../db/database');

// Helper to get current finance constants (for condition checking)
function getFinanceConstants() {
    try {
        const now = new Date();
        const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        
        const constantStmt = db.prepare(`
            SELECT type, amount
            FROM finance_entries
            WHERE type IN ('investment', 'asset', 'total_net')
            ORDER BY date DESC
        `);
        
        const constantsRaw = constantStmt.all();
        const constants = {};
        constantsRaw.forEach(item => {
            if (!constants[item.type]) {
                constants[item.type] = Number(item.amount);
            }
        });
        
        return constants;
    } catch (e) {
        return {};
    }
}

// Check if purchase condition is met
function checkConditionMet(item, financeConstants) {
    if (!item.condition_type || item.condition_type === 'none') {
        return null; // No condition set
    }
    
    if (item.condition_type === 'savings_threshold') {
        const currentSavings = financeConstants.total_net || 0;
        return currentSavings >= (item.condition_value || 0);
    }
    
    if (item.condition_type === 'investment_threshold') {
        const currentInvestment = financeConstants.investment || 0;
        return currentInvestment >= (item.condition_value || 0);
    }
    
    if (item.condition_type === 'asset_threshold') {
        const currentAsset = financeConstants.asset || 0;
        return currentAsset >= (item.condition_value || 0);
    }
    
    if (item.condition_type === 'fully_saved') {
        return (item.saved_amount || 0) >= (item.price_usd || 0);
    }
    
    return null;
}

router.get('/', (req, res) => {
    try {
        const stmt = db.prepare(`
            SELECT w.*, g.title as goal_title
            FROM wishlist_items w
            LEFT JOIN goals g ON w.goal_id = g.id
            ORDER BY w.priority ASC, w.sort_order ASC, w.created_at DESC
        `);
        const items = stmt.all();
        
        // Get finance constants for condition checking
        const financeConstants = getFinanceConstants();
        
        // Add condition_met and savings_progress to each item
        const enrichedItems = items.map(item => ({
            ...item,
            saved_amount: item.saved_amount || 0,
            savings_progress: item.price_usd ? Math.min(100, Math.round(((item.saved_amount || 0) / item.price_usd) * 100)) : 0,
            condition_met: checkConditionMet(item, financeConstants),
            current_savings: financeConstants.total_net || 0
        }));
        
        res.json(enrichedItems);
    } catch (error) {
        console.error('Error fetching wishlist:', error);
        res.status(500).json({ error: 'Failed to fetch wishlist' });
    }
});

router.post('/', (req, res) => {
    try {
        const { name, image_url, price_usd, priority, sort_order, goal_id, saved_amount, purchase_condition, condition_type, condition_value } = req.body;
        const stmt = db.prepare(`
            INSERT INTO wishlist_items (name, image_url, price_usd, priority, sort_order, goal_id, saved_amount, purchase_condition, condition_type, condition_value)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const result = stmt.run(
            name || '',
            image_url || null,
            price_usd != null ? Number(price_usd) : null,
            priority != null ? Number(priority) : 3,
            sort_order != null ? Number(sort_order) : 0,
            goal_id || null,
            saved_amount != null ? Number(saved_amount) : 0,
            purchase_condition || null,
            condition_type || 'none',
            condition_value != null ? Number(condition_value) : null
        );
        const row = db.prepare('SELECT * FROM wishlist_items WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json(row);
    } catch (error) {
        console.error('Error adding wishlist item:', error);
        const message = error && error.message ? error.message : 'Failed to add wishlist item';
        res.status(500).json({ error: message });
    }
});

router.patch('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { name, image_url, price_usd, priority, sort_order, goal_id, saved_amount, purchase_condition, condition_type, condition_value } = req.body;
        const updates = [];
        const values = [];
        if (name !== undefined) { updates.push('name = ?'); values.push(name); }
        if (image_url !== undefined) { updates.push('image_url = ?'); values.push(image_url); }
        if (price_usd !== undefined) { updates.push('price_usd = ?'); values.push(Number(price_usd)); }
        if (priority !== undefined) { updates.push('priority = ?'); values.push(Number(priority)); }
        if (sort_order !== undefined) { updates.push('sort_order = ?'); values.push(Number(sort_order)); }
        if (goal_id !== undefined) { updates.push('goal_id = ?'); values.push(goal_id || null); }
        if (saved_amount !== undefined) { updates.push('saved_amount = ?'); values.push(Number(saved_amount)); }
        if (purchase_condition !== undefined) { updates.push('purchase_condition = ?'); values.push(purchase_condition || null); }
        if (condition_type !== undefined) { updates.push('condition_type = ?'); values.push(condition_type || 'none'); }
        if (condition_value !== undefined) { updates.push('condition_value = ?'); values.push(condition_value != null ? Number(condition_value) : null); }
        if (updates.length === 0) {
            const row = db.prepare('SELECT * FROM wishlist_items WHERE id = ?').get(id);
            return res.json(row);
        }
        values.push(id);
        db.prepare(`UPDATE wishlist_items SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        const row = db.prepare('SELECT * FROM wishlist_items WHERE id = ?').get(id);
        res.json(row);
    } catch (error) {
        console.error('Error updating wishlist item:', error);
        res.status(500).json({ error: 'Failed to update wishlist item' });
    }
});

router.delete('/:id', (req, res) => {
    try {
        const { id } = req.params;
        db.prepare('DELETE FROM wishlist_items WHERE id = ?').run(id);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting wishlist item:', error);
        res.status(500).json({ error: 'Failed to delete wishlist item' });
    }
});

module.exports = router;
