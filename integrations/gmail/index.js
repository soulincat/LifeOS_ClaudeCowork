/**
 * Gmail Integration
 * OAuth-based send & read via Gmail API.
 *
 * Credentials: ~/.config/lifeos/gmail-credentials.json  (OAuth client config)
 * Tokens:      ~/.config/lifeos/gmail-token.json         (access + refresh tokens)
 *
 * OAuth flow handled by server.js routes:
 *   GET /api/gmail/connect   → redirect to Google consent
 *   GET /api/gmail/callback  → exchange code, save tokens
 */

const fs = require('fs');
const path = require('path');

const CREDENTIALS_PATH = process.env.GMAIL_CREDENTIALS_PATH || path.join(process.env.HOME, '.config', 'lifeos', 'gmail-credentials.json');
const TOKEN_PATH = process.env.GMAIL_TOKEN_PATH || path.join(process.env.HOME, '.config', 'lifeos', 'gmail-token.json');

let _cachedClient = null;

/**
 * Get an authenticated Gmail API client.
 * Reuses a cached client. Writes refreshed tokens back to disk.
 */
function getGmailClient() {
    if (_cachedClient) return _cachedClient;

    if (!fs.existsSync(TOKEN_PATH)) {
        throw new Error(
            `Gmail not connected. Visit /api/gmail/connect to authorize.`
        );
    }

    const { google } = require('googleapis');

    // Build OAuth2 client from env vars or credentials file
    let clientId = process.env.GMAIL_CLIENT_ID;
    let clientSecret = process.env.GMAIL_CLIENT_SECRET;
    let redirectUri = 'http://localhost:' + (process.env.PORT || 3001) + '/api/gmail/callback';

    if ((!clientId || !clientSecret) && fs.existsSync(CREDENTIALS_PATH)) {
        const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
        const creds = credentials.installed || credentials.web;
        clientId = creds.client_id;
        clientSecret = creds.client_secret;
        redirectUri = (creds.redirect_uris && creds.redirect_uris[0]) || redirectUri;
    }

    if (!clientId || !clientSecret) {
        throw new Error('Gmail OAuth not configured. Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env');
    }

    const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    oAuth2Client.setCredentials(token);

    // Auto-save refreshed tokens
    oAuth2Client.on('tokens', (newTokens) => {
        const merged = { ...token, ...newTokens };
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2));
        console.log('🔄 Gmail tokens refreshed and saved');
    });

    _cachedClient = google.gmail({ version: 'v1', auth: oAuth2Client });
    return _cachedClient;
}

/** Reset cached client (e.g. after re-auth). */
function resetClient() {
    _cachedClient = null;
}

/**
 * Build a RFC 2822 email string encoded as base64url.
 */
function buildEmailRaw({ to, subject, body, threadId, inReplyTo, references }) {
    const lines = [
        `To: ${to}`,
        `Subject: ${subject.startsWith('Re:') ? subject : 'Re: ' + subject}`,
        'Content-Type: text/plain; charset=utf-8',
        'MIME-Version: 1.0',
    ];
    if (inReplyTo) lines.push(`In-Reply-To: ${inReplyTo}`);
    if (references) lines.push(`References: ${references}`);
    lines.push('', body);

    const raw = Buffer.from(lines.join('\r\n')).toString('base64url');
    return raw;
}

/**
 * sendReply(message, replyText)
 * message: the DB row from messages table (needs sender_address, subject, external_id)
 * replyText: the text to send
 */
async function sendReply(message, replyText) {
    const gmail = getGmailClient();

    const raw = buildEmailRaw({
        to: message.sender_address,
        subject: message.subject || '(no subject)',
        body: replyText,
        inReplyTo: message.external_id,
        references: message.external_id,
    });

    const sendParams = { userId: 'me', requestBody: { raw } };
    if (message.external_id) {
        sendParams.requestBody.threadId = message.external_id;
    }

    await gmail.users.messages.send(sendParams);
    console.log(`✅ Gmail reply sent to ${message.sender_address}`);
}

/**
 * sendNew({ to, subject, body })
 * Send a fresh email (not a reply to an existing thread).
 */
async function sendNew({ to, subject, body }) {
    const gmail = getGmailClient();

    const lines = [
        `To: ${to}`,
        `Subject: ${subject}`,
        'Content-Type: text/plain; charset=utf-8',
        'MIME-Version: 1.0',
        '',
        body,
    ];

    const raw = Buffer.from(lines.join('\r\n')).toString('base64url');
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    console.log(`✅ Gmail sent to ${to}`);
}

// ── Connector Registry interface ──

let _syncInterval = null;

/** Check if Gmail is connected (token file exists). */
async function checkStatus() {
    const connected = fs.existsSync(TOKEN_PATH);
    return { connected };
}

/** Start background sync — polls Gmail every 5 minutes. */
async function startBackground() {
    if (_syncInterval) return;

    if (!fs.existsSync(TOKEN_PATH)) {
        console.log('Gmail: skipping background sync (not connected yet)');
        return;
    }

    const { syncGmail } = require('./sync');

    // Initial sync on startup (delayed 10s to let server fully boot)
    setTimeout(async () => {
        try {
            const result = await syncGmail({ maxResults: 30, hoursBack: 24 });
            console.log(`📧 Gmail initial sync: ${result.synced} new, ${result.skipped} skipped`);
        } catch (e) {
            console.warn('Gmail initial sync failed:', e.message);
        }
    }, 10000);

    // Repeat every 5 minutes
    _syncInterval = setInterval(async () => {
        try {
            const result = await syncGmail({ maxResults: 20, hoursBack: 1 });
            if (result.synced > 0) {
                console.log(`📧 Gmail sync: ${result.synced} new emails`);
            }
        } catch (e) {
            console.warn('Gmail background sync error:', e.message);
        }
    }, 5 * 60 * 1000);
}

module.exports = { getGmailClient, resetClient, sendReply, sendNew, checkStatus, startBackground };
