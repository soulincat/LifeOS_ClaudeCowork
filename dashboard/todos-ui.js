/* ================================================================
   Life OS Dashboard — Todos UI
   ================================================================
   Sidebar todo list: load, render, drag-drop reorder, collapse,
   checkbox toggling, due-date tags.

   Depends on: utils.js, api.js
   Exposes: loadTodos (via window)
   ================================================================ */

// Due date tag helper — returns colored label for todo/task due dates
function todoDueTag(dueDate) {
    if (!dueDate) return '';
    const today = new Date(); today.setHours(0,0,0,0);
    const due = new Date(dueDate + 'T00:00:00'); due.setHours(0,0,0,0);
    const diff = Math.round((due - today) / 86400000);
    let cls = 'todo-due'; let label;
    if (diff < 0) { cls += ' todo-due-overdue'; label = Math.abs(diff) + 'd overdue'; }
    else if (diff === 0) { cls += ' todo-due-today'; label = 'today'; }
    else if (diff === 1) { cls += ' todo-due-soon'; label = 'tomorrow'; }
    else if (diff <= 3) { cls += ' todo-due-soon'; label = diff + 'd'; }
    else { label = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
    return '<span class="' + cls + '" data-due="' + dueDate + '" title="Due: ' + dueDate + '">' + label + '</span>';
}

// ── Todo list state ─────────────────────────────────────────────────────────
let showAllCompleted = false;

async function loadTodos() {
    try {
        const url = showAllCompleted ? '/api/todos?showAll=true' : '/api/todos';
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('API ' + response.status);
        }
        const todos = await response.json();

        const todoList = document.querySelector('.todo-list');
        if (!todoList) return;

        // Separate undone and done todos
        const undoneTodos = todos.filter(t => !t.completed);
        const doneTodos = todos.filter(t => t.completed);

        // Build HTML: undone first, then done
        let html = '';

        // Undone todos (draggable; drag handle so checkbox still works)
        const dragHandleSvg = '<span class="todo-drag-handle" draggable="true" title="Drag to reorder"><svg width="10" height="10" viewBox="0 0 10 10"><circle cx="2" cy="2" r=".8" fill="currentColor"/><circle cx="5" cy="2" r=".8" fill="currentColor"/><circle cx="8" cy="2" r=".8" fill="currentColor"/><circle cx="2" cy="5" r=".8" fill="currentColor"/><circle cx="5" cy="5" r=".8" fill="currentColor"/><circle cx="8" cy="5" r=".8" fill="currentColor"/></svg></span>';
        undoneTodos.forEach(todo => {
            html += `
                <label class="todo-item todo-item-undone" data-id="${todo.id}">
                    ${dragHandleSvg}
                    <input type="checkbox" class="todo-checkbox" data-id="${todo.id}">
                    <span class="todo-text">${(todo.text || '').replace(/</g, '&lt;')}</span>
                    ${todoDueTag(todo.due_date)}
                </label>
            `;
        });

        // Add expandable done section if there are done todos
        if (doneTodos.length > 0) {
            html += '<div class="todo-separator"></div>';
            html += `
                <div class="todo-done-header">
                    <button class="todo-expand-btn" id="expandDoneBtn" title="Show completed tasks">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>
                    <span class="todo-done-label">Done today (${doneTodos.length})</span>
                </div>
                <div class="todo-done-list" id="todoDoneList" style="display: none;">
            `;

            doneTodos.forEach(todo => {
                const archivedClass = todo.archived ? 'todo-item-archived' : '';
                html += `
                    <label class="todo-item todo-item-done ${archivedClass}" data-id="${todo.id}">
                        <input type="checkbox" class="todo-checkbox" data-id="${todo.id}" checked>
                        <span class="todo-text">${(todo.text || '').replace(/</g, '&lt;')}</span>
                        ${todo.archived ? '<span class="todo-archived-badge">archived</span>' : ''}
                    </label>
                `;
            });

            html += '</div>';
        }

        todoList.innerHTML = html;

        updateTodoCount();
        initTodoDragDrop(todoList);
        initTodoCollapse(undoneTodos.length, doneTodos.length);

        // Initialize expand button
        const expandBtn = document.getElementById('expandDoneBtn');
        if (expandBtn) {
            expandBtn.addEventListener('click', () => {
                const doneList = document.getElementById('todoDoneList');
                if (doneList) {
                    const isHidden = doneList.style.display === 'none';
                    doneList.style.display = isHidden ? 'block' : 'none';
                    expandBtn.classList.toggle('expanded', isHidden);
                }
            });
        }

        // Add event listeners for checkboxes
        document.querySelectorAll('.todo-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', async function() {
                const id = this.dataset.id;
                const completed = this.checked;

                try {
                    const response = await fetch(`/api/todos/${id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ completed })
                    });

                    if (response.ok) {
                        // Reload todos to get updated order
                        await loadTodos();
                    }
                } catch (error) {
                    console.error('Error updating todo:', error);
                    // Revert checkbox on error
                    this.checked = !completed;
                }
            });
        });
    } catch (error) {
        console.error('Error loading todos:', error);
        const todoList = document.querySelector('.todo-list');
        if (todoList && typeof showToast === 'function') {
            showToast('Couldn\'t load todos. Use http://localhost:3001 and start the server (npm start).', 'error');
        }
    }
}

// ── Drag and drop reordering ────────────────────────────────────────────────
function initTodoDragDrop(todoList) {
    if (!todoList) return;
    const handle = (e) => e.target.closest('.todo-drag-handle');
    todoList.addEventListener('dragstart', function(e) {
        const h = handle(e);
        if (!h) return;
        const item = h.closest('.todo-item');
        if (!item || !item.dataset.id) return;
        e.dataTransfer.setData('text/plain', item.dataset.id);
        e.dataTransfer.effectAllowed = 'move';
        item.classList.add('todo-dragging');
    });
    todoList.addEventListener('dragend', function(e) {
        const item = e.target.closest('.todo-item');
        if (item) item.classList.remove('todo-dragging');
    });
    todoList.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    });
    todoList.addEventListener('drop', async function(e) {
        e.preventDefault();
        const draggedId = e.dataTransfer.getData('text/plain');
        if (!draggedId) return;
        const targetItem = e.target.closest('.todo-item');
        if (!targetItem || targetItem.dataset.id === draggedId) return;
        const items = Array.from(todoList.querySelectorAll('.todo-item[data-id]'));
        const ids = items.map(el => el.dataset.id);
        const fromIdx = ids.indexOf(draggedId);
        const toIdx = ids.indexOf(targetItem.dataset.id);
        if (fromIdx === -1 || toIdx === -1) return;
        ids.splice(fromIdx, 1);
        ids.splice(toIdx, 0, draggedId);
        const moved = items[fromIdx];
        const toEl = items[toIdx];
        if (moved && toEl && moved !== toEl) {
            if (fromIdx < toIdx) toEl.parentNode.insertBefore(moved, toEl.nextSibling);
            else toEl.parentNode.insertBefore(moved, toEl);
        }
        try {
            const r = await fetch('/api/todos/reorder', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids })
            });
            if (!r.ok) await loadTodos();
        } catch (err) {
            await loadTodos();
        }
    });
}

// ── Collapse / Show more ────────────────────────────────────────────────────
const TODO_COLLAPSE_THRESHOLD = 5;
let todoListCollapsed = true;

function initTodoCollapse(undoneCount, doneCount) {
    const wrapper = document.getElementById('todoListWrapper');
    const btn = document.getElementById('todoCollapseBtn');
    const section = document.getElementById('todoSection');
    if (!wrapper || !btn || !section) return;
    const totalItems = undoneCount + doneCount;
    if (totalItems <= TODO_COLLAPSE_THRESHOLD) {
        btn.style.display = 'none';
        section.classList.remove('todo-section-collapsed');
        wrapper.style.maxHeight = '';
    } else {
        btn.style.display = 'block';
        section.classList.toggle('todo-section-collapsed', todoListCollapsed);
        wrapper.style.maxHeight = todoListCollapsed ? '14rem' : 'none';
        btn.textContent = todoListCollapsed ? `Show more (${totalItems} items)` : 'Show less';
        btn.onclick = function() {
            todoListCollapsed = !todoListCollapsed;
            section.classList.toggle('todo-section-collapsed', todoListCollapsed);
            wrapper.style.maxHeight = todoListCollapsed ? '14rem' : 'none';
            btn.textContent = todoListCollapsed ? `Show more (${totalItems} items)` : 'Show less';
        };
    }
}

// ── Count display ───────────────────────────────────────────────────────────
function updateTodoCount() {
    const checkboxes = document.querySelectorAll('.todo-checkbox');
    const checked = document.querySelectorAll('.todo-checkbox:checked').length;
    const undone = checkboxes.length - checked;
    const countEl = document.getElementById('todoCount');
    if (countEl) {
        // Show undone count / total count (excluding archived)
        countEl.textContent = `${undone}/${checkboxes.length}`;
    }
}

// ── Init: load todos when DOM is ready ──────────────────────────────────────
function initTodos() {
    const todoList = document.querySelector('.todo-list');
    if (todoList) loadTodos();
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTodos);
} else {
    initTodos();
}

// Make loadTodos available globally for refresh
window.loadTodos = loadTodos;

// Fallback: load data again when window is fully loaded (in case first run failed)
window.addEventListener('load', function() {
    if (typeof window.loadTodos === 'function') window.loadTodos();
    if (typeof window.loadSocialsData === 'function') window.loadSocialsData();
    if (typeof window.refreshGitHubGraph === 'function') window.refreshGitHubGraph();
});
