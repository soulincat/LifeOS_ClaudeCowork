const express = require('express');
const router = express.Router();
const db = require('../db/database');

/**
 * GET /api/todos
 * Get todos: undone first, then all completed from today
 * Query param: showAll=true to show all completed tasks (including archived/older)
 */
router.get('/', (req, res) => {
    try {
        const showAll = req.query.showAll === 'true';
        const today = new Date().toISOString().split('T')[0];
        
        // Get all undone todos (order by sort_order then created_at)
        const undoneStmt = db.prepare(`
            SELECT * FROM todos 
            WHERE completed = 0 AND archived = 0
            ORDER BY sort_order ASC, created_at DESC
        `);
        const undoneTodos = undoneStmt.all();
        
        // Get completed todos
        let doneTodos;
        if (showAll) {
            const doneStmt = db.prepare(`
                SELECT * FROM todos 
                WHERE completed = 1
                ORDER BY sort_order ASC, completed_at DESC
            `);
            doneTodos = doneStmt.all();
        } else {
            const doneStmt = db.prepare(`
                SELECT * FROM todos 
                WHERE completed = 1 AND archived = 0
                AND DATE(completed_at) = ?
                ORDER BY sort_order ASC, completed_at DESC
            `);
            doneTodos = doneStmt.all(today);
        }
        
        // Combine: undone first, then done
        const todos = [...undoneTodos, ...doneTodos];
        
        res.json(todos);
    } catch (error) {
        console.error('Error fetching todos:', error);
        res.status(500).json({ error: 'Failed to fetch todos' });
    }
});

/**
 * POST /api/todos
 * Create a new todo
 */
router.post('/', (req, res) => {
    try {
        const { text, due_date } = req.body;
        const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM todos WHERE completed = 0 AND archived = 0').get();
        const sortOrder = maxOrder ? maxOrder.next_order : 0;

        const stmt = db.prepare(`
            INSERT INTO todos (text, due_date, sort_order)
            VALUES (?, ?, ?)
        `);

        const result = stmt.run(text, due_date || null, sortOrder);
        res.json({ id: result.lastInsertRowid, success: true });
    } catch (error) {
        console.error('Error creating todo:', error);
        res.status(500).json({ error: 'Failed to create todo' });
    }
});

/**
 * PUT /api/todos/reorder
 * Reorder todos by id list (ids in desired order).
 */
router.put('/reorder', (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ids array required' });
        }
        const updateStmt = db.prepare('UPDATE todos SET sort_order = ? WHERE id = ?');
        ids.forEach((id, index) => {
            updateStmt.run(index, id);
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Error reordering todos:', error);
        res.status(500).json({ error: 'Failed to reorder todos' });
    }
});

/**
 * PATCH /api/todos/:id
 * Update a todo (toggle completed, update text, etc.)
 */
router.patch('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { completed, text } = req.body;
        
        if (completed !== undefined) {
            const now = new Date().toISOString().split('T')[0];
            
            if (completed) {
                // Mark as completed and set completed_at
                const updateStmt = db.prepare(`
                    UPDATE todos 
                    SET completed = 1, completed_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `);
                updateStmt.run(id);
                
                // Track daily completion
                const completionStmt = db.prepare(`
                    INSERT INTO daily_completions (todo_id, completed_date)
                    VALUES (?, ?)
                `);
                completionStmt.run(id, now);
                
                // Archive completed tasks from previous days (keep today's visible)
                const archiveStmt = db.prepare(`
                    UPDATE todos 
                    SET archived = 1
                    WHERE completed = 1 
                    AND archived = 0 
                    AND DATE(completed_at) < ?
                `);
                archiveStmt.run(now);
            } else {
                // Uncomplete: remove from archived if it was archived
                const uncompleteStmt = db.prepare(`
                    UPDATE todos 
                    SET completed = 0, completed_at = NULL, archived = 0
                    WHERE id = ?
                `);
                uncompleteStmt.run(id);
            }
        }
        
        if (text !== undefined) {
            const stmt = db.prepare('UPDATE todos SET text = ? WHERE id = ?');
            stmt.run(text, id);
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating todo:', error);
        res.status(500).json({ error: 'Failed to update todo' });
    }
});

/**
 * DELETE /api/todos/:id
 * Delete a todo
 */
router.delete('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const stmt = db.prepare('DELETE FROM todos WHERE id = ?');
        stmt.run(id);
        
        // Also delete related completion records
        const deleteCompletionsStmt = db.prepare('DELETE FROM daily_completions WHERE todo_id = ?');
        deleteCompletionsStmt.run(id);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting todo:', error);
        res.status(500).json({ error: 'Failed to delete todo' });
    }
});

/**
 * GET /api/todos/stats
 * Get daily completion stats
 */
router.get('/stats', (req, res) => {
    try {
        const { date } = req.query;
        const targetDate = date || new Date().toISOString().split('T')[0];
        
        const stmt = db.prepare(`
            SELECT COUNT(*) as count 
            FROM daily_completions 
            WHERE completed_date = ?
        `);
        const result = stmt.get(targetDate);
        
        res.json({ date: targetDate, completed_count: result.count });
    } catch (error) {
        console.error('Error fetching todo stats:', error);
        res.status(500).json({ error: 'Failed to fetch todo stats' });
    }
});

module.exports = router;
