/**
 * Gmail Send Integration
 * Sends replies via Gmail API using OAuth credentials.
 *
 * Setup:
 *  1. Create a Google Cloud project at console.cloud.google.com
 *  2. Enable Gmail API
 *  3. Create OAuth 2.0 credentials (Desktop app) → download as credentials.json
 *  4. Set GMAIL_CREDENTIALS_PATH and GMAIL_TOKEN_PATH in .env
 *  5. On first run, open the URL printed to console and complete OAuth flow
 */

const fs = require('fs');
const path = require('path');

const CREDENTIALS_PATH = process.env.GMAIL_CREDENTIALS_PATH || path.join(process.env.HOME, '.config', 'lifeos', 'gmail-credentials.json');
const TOKEN_PATH = process.env.GMAIL_TOKEN_PATH || path.join(process.env.HOME, '.config', 'lifeos', 'gmail-token.json');

function getGmailClient() {
    if (!fs.existsSync(CREDENTIALS_PATH)) {
        throw new Error(
            `Gmail credentials not found at ${CREDENTIALS_PATH}.\n` +
            `Download OAuth credentials from Google Cloud Console and save there.`
        );
    }
    if (!fs.existsSync(TOKEN_PATH)) {
        throw new Error(
            `Gmail token not found at ${TOKEN_PATH}.\n` +
            `Run the Gmail MCP server once to complete OAuth flow and generate the token.`
        );
    }

    const { google } = require('googleapis');
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));

    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    oAuth2Client.setCredentials(token);

    return google.gmail({ version: 'v1', auth: oAuth2Client });
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
    // If we have a thread ID, reply in-thread
    if (message.external_id) {
        // external_id for gmail is the message ID; thread_id would be separate
        // For now send as new message in thread if threadId known
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

module.exports = { sendReply, sendNew };
