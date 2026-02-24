/**
 * WhatsApp Send Integration
 * Bridges to the local whatsapp-mcp Go HTTP server (default port 8080).
 *
 * LID resolution:
 *   Newer WhatsApp uses LIDs (linked identifiers) instead of phone JIDs for sending.
 *   Before sending to a @s.whatsapp.net JID, we query the whatsmeow_lid_map table in
 *   the device store DB to resolve the phone → LID and use that instead.
 *   This prevents "no LID found" errors on modern accounts.
 */

const path = require('path');
const fs = require('fs');
const Connector = require('../connector');

const WHATSAPP_MCP_URL = process.env.WHATSAPP_MCP_URL || 'http://localhost:8080';
const WA_DEVICE_DB_PATH = process.env.WHATSAPP_DEVICE_DB_PATH
    || path.join(require('os').homedir(), 'code/whatsapp-mcp/whatsapp-bridge/store/whatsapp.db');

/**
 * Resolve a phone number to a LID JID using the whatsmeow device store.
 * Returns e.g. "57075937857645@lid", or null if no LID is known.
 */
function resolveToLid(phone) {
    try {
        if (!fs.existsSync(WA_DEVICE_DB_PATH)) return null;
        const Database = require('better-sqlite3');
        const db = new Database(WA_DEVICE_DB_PATH, { readonly: true, fileMustExist: true });
        const row = db.prepare('SELECT lid FROM whatsmeow_lid_map WHERE pn = ?').get(phone);
        db.close();
        return row ? `${row.lid}@lid` : null;
    } catch (e) {
        return null;
    }
}

/**
 * Core send via the Go HTTP bridge. Tries LID first for @s.whatsapp.net targets.
 */
async function waSend(jid, message) {
    // For phone-based JIDs, look up the LID and prefer it
    let effectiveJid = jid;
    if (jid.endsWith('@s.whatsapp.net')) {
        const phone = jid.split('@')[0];
        const lid = resolveToLid(phone);
        if (lid) {
            effectiveJid = lid;
            console.log(`ℹ️  LID resolved: ${jid} → ${effectiveJid}`);
        }
    }

    let resp;
    try {
        resp = await fetch(`${WHATSAPP_MCP_URL}/api/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipient: effectiveJid, message }),
            signal: AbortSignal.timeout(10000),
        });
    } catch (e) {
        throw new Error(`WhatsApp bridge not reachable at ${WHATSAPP_MCP_URL} — make sure the Go bridge is running (whatsapp-mcp/whatsapp-bridge/whatsapp-bridge)`);
    }

    if (!resp.ok) {
        const errBody = await resp.text().catch(() => '');
        let errMsg;
        try { errMsg = JSON.parse(errBody).message || errBody; } catch { errMsg = errBody; }
        throw new Error(`WhatsApp send failed: ${errMsg}`);
    }
}

async function sendReply(message, replyText) {
    const jid = message.sender_address;
    if (!jid) throw new Error('WhatsApp message has no JID (sender_address)');
    await waSend(jid, replyText);
    console.log(`✅ WhatsApp reply sent to ${jid}`);
}

/**
 * sendNew(recipient, message)
 * recipient: phone number (e.g. "+49 1522 2481017", "4915222481017")
 *            or a full JID ("4915222481017@s.whatsapp.net" or "57075937857645@lid")
 */
async function sendNew(recipient, message) {
    let jid = recipient.trim();
    if (!jid.includes('@')) {
        const digits = jid.replace(/\D/g, '');
        if (!digits) throw new Error(`Invalid recipient: "${recipient}"`);
        jid = digits + '@s.whatsapp.net';
    }
    await waSend(jid, message);
    console.log(`✅ WhatsApp message sent to ${jid}`);
}

/**
 * WhatsApp Connector — wraps the send functions with Connector interface
 * and handles bridge auto-start in startBackground().
 */
class WhatsAppConnector extends Connector {
    constructor(config) {
        super('whatsapp', config);
    }

    async checkStatus() {
        try {
            const resp = await fetch(`${WHATSAPP_MCP_URL}/api/status`, {
                signal: AbortSignal.timeout(3000),
            });
            if (resp.ok) return { connected: true };
            return { connected: false, error: `Bridge returned ${resp.status}` };
        } catch (e) {
            return { connected: false, error: 'Bridge not reachable' };
        }
    }

    async send(payload) {
        const { recipient, message } = payload;
        if (!recipient || !message) return { success: false, error: 'Missing recipient or message' };
        try {
            await sendNew(recipient, message);
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    async startBackground() {
        const { exec, spawn } = require('child_process');
        const waBridgePath = process.env.WHATSAPP_BRIDGE_PATH
            || path.join(require('os').homedir(), 'code/whatsapp-mcp/whatsapp-bridge/whatsapp-bridge');

        exec('lsof -nP -iTCP:8080 -sTCP:LISTEN', (err, stdout) => {
            if (!stdout || !stdout.includes('LISTEN')) {
                if (fs.existsSync(waBridgePath)) {
                    const bridge = spawn(waBridgePath, [], {
                        detached: true,
                        stdio: 'ignore',
                        cwd: path.dirname(waBridgePath),
                    });
                    bridge.unref();
                    console.log('✅ WhatsApp bridge started (PID will detach)');
                } else {
                    console.log('⚠️  WhatsApp bridge not found at', waBridgePath, '— PA send will be unavailable');
                }
            } else {
                console.log('✅ WhatsApp bridge already running on :8080');
            }
        });
    }

    static getRequiredConfig() {
        return { env: ['WHATSAPP_BRIDGE_PATH'], settings: [] };
    }
}

// Export both the connector instance (for registry) and named functions (for direct use by routes)
const connector = new WhatsAppConnector();
module.exports = connector;
module.exports.sendReply = sendReply;
module.exports.sendNew = sendNew;
module.exports.resolveToLid = resolveToLid;
