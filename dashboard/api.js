/* ================================================================
   Life OS Dashboard — Centralized API Client
   ================================================================
   Single point for all server communication. Handles errors,
   JSON parsing, and provides a consistent interface.

   Usage:
     const data = await API.get('/api/todos');
     await API.post('/api/todos', { text: 'Buy milk' });
     await API.patch('/api/todos/5', { completed: true });
     await API.del('/api/todos/5');
   ================================================================ */

const API = {
    /** GET request — returns parsed JSON */
    async get(path) {
        const res = await fetch(path);
        if (!res.ok) {
            console.warn(`API GET ${path} failed: ${res.status}`);
            throw new Error(`GET ${path}: ${res.status}`);
        }
        return res.json();
    },

    /** POST request — sends JSON body, returns parsed JSON */
    async post(path, body) {
        const res = await fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            console.warn(`API POST ${path} failed: ${res.status}`);
            throw new Error(`POST ${path}: ${res.status}`);
        }
        return res.json();
    },

    /** PATCH request — sends JSON body, returns parsed JSON */
    async patch(path, body) {
        const res = await fetch(path, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            console.warn(`API PATCH ${path} failed: ${res.status}`);
            throw new Error(`PATCH ${path}: ${res.status}`);
        }
        return res.json();
    },

    /** PUT request — sends JSON body, returns parsed JSON */
    async put(path, body) {
        const res = await fetch(path, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            console.warn(`API PUT ${path} failed: ${res.status}`);
            throw new Error(`PUT ${path}: ${res.status}`);
        }
        return res.json();
    },

    /** DELETE request — returns parsed JSON */
    async del(path) {
        const res = await fetch(path, { method: 'DELETE' });
        if (!res.ok) {
            console.warn(`API DELETE ${path} failed: ${res.status}`);
            throw new Error(`DELETE ${path}: ${res.status}`);
        }
        return res.json();
    }
};
