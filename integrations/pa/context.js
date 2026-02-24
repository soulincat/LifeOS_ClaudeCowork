/**
 * PA Context Builder
 * Assembles a live snapshot of all relevant life OS data for the PA system prompt.
 * Queries SQLite directly (no HTTP) for speed and reliability.
 */

const db = require('../db/database');

/**
 * Build the full PA context string injected into the system prompt.
 * @returns {string}
 */
function buildPAContext() {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const todayFull = now.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const dayOfWeek = now.toLocaleDateString('en-GB', { weekday: 'long' });

    const sections = [];

    // ── Date & time ──────────────────────────────────────────────────────────
    sections.push(`DATE: ${todayFull}, ${timeStr} (${dayOfWeek})`);

    // ── Health / energy (Whoop) ──────────────────────────────────────────────
    try {
        const health = db.prepare(`
            SELECT recovery, sleep_hours, hrv, strain
            FROM health_daily_data
            ORDER BY date DESC LIMIT 1
        `).get();
        if (health) {
            const energy = health.recovery >= 70 ? 'High energy day' : health.recovery >= 50 ? 'Moderate energy' : 'Low energy — suggest lighter schedule';
            sections.push(`WHOOP: Recovery ${health.recovery}%, Sleep ${health.sleep_hours}h, HRV ${health.hrv}${health.strain ? `, Strain ${health.strain}` : ''} → ${energy}`);
        }
    } catch (e) {
        // Fall back to legacy health_metrics
        try {
            const health = db.prepare('SELECT recovery, sleep_hours, hrv FROM health_metrics ORDER BY date DESC LIMIT 1').get();
            if (health) {
                const energy = health.recovery >= 70 ? 'High energy day' : health.recovery >= 50 ? 'Moderate energy' : 'Low energy';
                sections.push(`WHOOP: Recovery ${health.recovery}%, Sleep ${health.sleep_hours}h, HRV ${health.hrv} → ${energy}`);
            }
        } catch (e2) { /* */ }
    }

    // ── Focus task ───────────────────────────────────────────────────────────
    try {
        const { scoreFocusCard } = require('../db/derived-state');
        let recovery = 70;
        try {
            const h = db.prepare('SELECT recovery FROM health_daily_data ORDER BY date DESC LIMIT 1').get();
            if (h && h.recovery) recovery = h.recovery;
        } catch (e) { /* */ }
        const focus = scoreFocusCard(recovery);
        if (focus && focus.text) {
            const proj = focus.project_name ? ` (${focus.project_name})` : '';
            const meta = focus.meta ? ` | ${focus.meta}` : '';
            sections.push(`FOCUS_TASK: ${focus.text}${proj}${meta}`);
        }
    } catch (e) { /* */ }

    // ── Projects (with health, progress, phase, next action, blockers) ───────
    try {
        const projects = db.prepare(`
            SELECT id, name, health_status, progress_pct, current_phase, next_action, priority_rank
            FROM projects WHERE status = 'active'
            ORDER BY priority_rank ASC
        `).all();
        if (projects.length) {
            const lines = projects.map(p => {
                const blockers = db.prepare(`
                    SELECT text FROM project_tasks
                    WHERE project_id = ? AND is_blocker = 1 AND status IN ('open', 'blocked')
                `).all(p.id);
                const blockerStr = blockers.length ? ` | BLOCKERS: ${blockers.map(b => b.text).join('; ')}` : '';
                return `  P${p.priority_rank}: ${p.name} | ${p.health_status.toUpperCase()} | ${p.progress_pct}% | Phase: ${p.current_phase || '—'} | Next: ${p.next_action || '—'}${blockerStr}`;
            });
            sections.push(`PROJECTS:\n${lines.join('\n')}`);
        }
    } catch (e) { /* */ }

    // ── Inbox urgent (top 5) ─────────────────────────────────────────────────
    try {
        const items = db.prepare(`
            SELECT source, sender_name, sender_id, preview, urgency_score
            FROM inbox_items WHERE is_dismissed = 0 AND is_unread = 1
            ORDER BY urgency_score DESC LIMIT 5
        `).all();
        if (items.length) {
            const lines = items.map(i => {
                const from = i.sender_name || i.sender_id || 'Unknown';
                return `  [${i.urgency_score}] (${i.source}) ${from}: ${(i.preview || '').slice(0, 80)}`;
            });
            sections.push(`INBOX_URGENT:\n${lines.join('\n')}`);
        }
    } catch (e) {
        // Fall back to messages table
        try {
            const msgs = db.prepare(`
                SELECT source, sender_name, sender_address, preview, urgency_score
                FROM messages WHERE status = 'pending'
                ORDER BY urgency_score DESC, received_at DESC LIMIT 5
            `).all();
            if (msgs.length) {
                const lines = msgs.map(m => {
                    const from = m.sender_name || m.sender_address || 'Unknown';
                    return `  [${m.urgency_score}] (${m.source}) ${from}: ${(m.preview || '').slice(0, 80)}`;
                });
                sections.push(`INBOX_URGENT:\n${lines.join('\n')}`);
            }
        } catch (e2) { /* */ }
    }

    // ── Calendar today ───────────────────────────────────────────────────────
    try {
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const upcoming = db.prepare(`
            SELECT id, title, type, due_date, description FROM upcoming_items
            WHERE due_date >= ? AND due_date < ?
            ORDER BY due_date ASC
        `).all(today, tomorrow + 'T23:59:59');
        if (upcoming.length) {
            const lines = upcoming.map(u => {
                const dt = new Date(u.due_date);
                const t = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                const desc = u.description ? ` — ${u.description.slice(0, 60)}` : '';
                return `  ${t}: ${u.title} (${u.type})${desc}`;
            });
            sections.push(`CALENDAR_TODAY:\n${lines.join('\n')}`);
        } else {
            sections.push('CALENDAR_TODAY: No events');
        }
    } catch (e) { /* */ }

    // ── Decision triggers approaching ────────────────────────────────────────
    try {
        const cutoff = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const triggers = db.prepare(`
            SELECT dt.title, dt.check_date, dt.metric_type, dt.threshold, dt.operator, p.name as project_name
            FROM decision_triggers dt
            LEFT JOIN projects p ON p.id = dt.project_id
            WHERE dt.status = 'pending' AND dt.surface_on_dashboard = 1 AND dt.check_date <= ?
            ORDER BY dt.check_date ASC
        `).all(cutoff);
        if (triggers.length) {
            const lines = triggers.map(t => `  ${t.check_date}: ${t.title}${t.project_name ? ` (${t.project_name})` : ''} — ${t.metric_type} ${t.operator} ${t.threshold}`);
            sections.push(`DECISION_TRIGGERS_APPROACHING:\n${lines.join('\n')}`);
        }
    } catch (e) { /* */ }

    // ── Revenue ──────────────────────────────────────────────────────────────
    try {
        const startOfMonth = `${today.slice(0, 7)}-01`;
        const finRows = db.prepare(`
            SELECT type, amount FROM finance_entries
            WHERE date >= ? AND date <= ?
            AND type IN ('revenue', 'profit', 'spending', 'expense')
            AND source NOT LIKE '%_month_end'
            ORDER BY type, date DESC, id DESC
        `).all(startOfMonth, today);
        const fin = {};
        finRows.forEach(r => { if (!fin[r.type]) fin[r.type] = r.amount; });

        const constants = db.prepare(`
            SELECT type, amount FROM finance_entries
            WHERE type IN ('investment', 'asset', 'total_net', 'passive_yield')
            ORDER BY date DESC
        `).all();
        const con = {};
        constants.forEach(r => { if (!con[r.type]) con[r.type] = r.amount; });

        const parts = [];
        if (fin.revenue != null) parts.push(`Revenue $${fin.revenue.toLocaleString()}`);
        if (fin.spending != null) parts.push(`Spending $${fin.spending.toLocaleString()}`);
        if (con.total_net != null) parts.push(`Net worth $${con.total_net.toLocaleString()}`);
        if (con.passive_yield != null) parts.push(`Passive yield $${con.passive_yield.toLocaleString()}/mo`);
        if (parts.length) sections.push(`REVENUE:\n  ${parts.join(' | ')}`);
    } catch (e) { /* */ }

    // ── Todos ────────────────────────────────────────────────────────────────
    try {
        const todos = db.prepare(`
            SELECT id, text, due_date FROM todos
            WHERE completed = 0 AND (archived IS NULL OR archived = 0)
            ORDER BY due_date ASC NULLS LAST, created_at ASC
            LIMIT 15
        `).all();
        if (todos.length) {
            const overdue = todos.filter(t => t.due_date && t.due_date < today);
            const dueToday = todos.filter(t => t.due_date === today);
            const rest = todos.filter(t => !t.due_date || t.due_date > today);
            const lines = [];
            overdue.forEach(t => lines.push(`  [OVERDUE ${t.due_date}] ${t.text}`));
            dueToday.forEach(t => lines.push(`  [TODAY] ${t.text}`));
            rest.slice(0, 8).forEach(t => lines.push(`  [${t.due_date || 'no date'}] ${t.text}`));
            sections.push(`TODOS (${todos.length}):\n${lines.join('\n')}`);
        }
    } catch (e) { /* */ }

    // ── Top goals ────────────────────────────────────────────────────────────
    try {
        const goals = db.prepare(`
            SELECT title, period_type, period_label, aspect, COALESCE(priority, 3) as priority
            FROM goals
            WHERE parent_id IS NULL AND status = 'in_progress'
            ORDER BY COALESCE(priority, 3) ASC, period_label DESC
            LIMIT 5
        `).all();
        if (goals.length) {
            const lines = goals.map(g => `  [${g.period_label} / ${g.aspect}] ${g.title}`);
            sections.push(`TOP GOALS:\n${lines.join('\n')}`);
        }
    } catch (e) { /* */ }

    // ── Recent WhatsApp chats + LID resolution (for reliable sending) ─────────
    try {
        const homedir = require('os').homedir();
        const path = require('path');
        const fs = require('fs');
        const Database = require('better-sqlite3');

        const waBridgeDbPath = process.env.WHATSAPP_BRIDGE_DB_PATH
            || path.join(homedir, 'code/whatsapp-mcp/whatsapp-bridge/store/messages.db');
        const waDeviceDbPath = process.env.WHATSAPP_DEVICE_DB_PATH
            || path.join(homedir, 'code/whatsapp-mcp/whatsapp-bridge/store/whatsapp.db');

        // Build LID map: phone → LID
        const lidMap = {};
        if (fs.existsSync(waDeviceDbPath)) {
            const devDb = new Database(waDeviceDbPath, { readonly: true, fileMustExist: true });
            devDb.prepare('SELECT lid, pn FROM whatsmeow_lid_map').all().forEach(r => { lidMap[r.pn] = r.lid; });
            devDb.close();
        }

        if (fs.existsSync(waBridgeDbPath)) {
            const waDb = new Database(waBridgeDbPath, { readonly: true, fileMustExist: true });
            const waChats = waDb.prepare(`
                SELECT jid, name FROM chats
                WHERE jid LIKE '%@s.whatsapp.net'
                  AND name IS NOT NULL AND name != '' AND length(name) > 2
                  AND name != replace(jid, '@s.whatsapp.net', '')
                ORDER BY last_message_time DESC
                LIMIT 60
            `).all();
            waDb.close();
            if (waChats.length) {
                const lines = waChats.map(c => {
                    const phone = c.jid.split('@')[0];
                    const lid = lidMap[phone];
                    const useJid = lid ? `${lid}@lid` : c.jid;
                    return `  ${c.name} | wa_jid:${useJid}`;
                });
                sections.push(`RECENT_WHATSAPP_CHATS (use wa_jid as recipient for send_whatsapp — LID preferred):\n${lines.join('\n')}`);
            }
        }
    } catch (e) { /* WA DB not available */ }

    // ── Contacts book ────────────────────────────────────────────────────────
    try {
        const contacts = db.prepare(`
            SELECT c.name, c.email, c.phone, c.whatsapp_jid, c.label, c.type, c.relationship, c.notes, p.name AS project_name
            FROM contacts c
            LEFT JOIN projects p ON c.project_id = p.id
            ORDER BY c.label = 'vip' DESC, c.name ASC
        `).all();
        if (contacts.length) {
            const lines = contacts.map(c => {
                const tags = [c.label === 'vip' ? '⭐ VIP' : null, c.type, c.relationship, c.project_name ? `project:${c.project_name}` : null].filter(Boolean).join(' | ');
                const reach = [c.email ? `email:${c.email}` : null, c.whatsapp_jid ? `wa:${c.whatsapp_jid}` : null].filter(Boolean).join(' ');
                const note = c.notes ? ` — ${c.notes}` : '';
                return `  ${c.name} [${tags}] ${reach}${note}`;
            });
            sections.push(`CONTACTS:\n${lines.join('\n')}`);
        }
    } catch (e) { /* */ }

    // ── PA running notes ─────────────────────────────────────────────────────
    try {
        const notes = db.prepare('SELECT key, value FROM pa_context ORDER BY updated_at DESC LIMIT 10').all();
        if (notes.length) {
            const lines = notes.map(n => `  ${n.key}: ${n.value}`);
            sections.push(`PA NOTES:\n${lines.join('\n')}`);
        }
    } catch (e) { /* */ }

    // ── Recent PA conversations (last 3 for session continuity) ──────────────
    try {
        const convos = db.prepare(`
            SELECT message, response FROM agent_conversations
            WHERE source = 'pa'
            ORDER BY id DESC LIMIT 3
        `).all();
        if (convos.length) {
            const lines = convos.reverse().map(c =>
                `  User: ${c.message.slice(0, 120)}\n  PA: ${(c.response || '').slice(0, 200)}`
            );
            sections.push(`RECENT PA CONVERSATIONS:\n${lines.join('\n---\n')}`);
        }
    } catch (e) { /* */ }

    return sections.join('\n\n');
}

module.exports = { buildPAContext };
