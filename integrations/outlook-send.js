/**
 * Outlook / Microsoft 365 Send Integration
 * Sends replies via Microsoft Graph API using app credentials + delegated auth.
 *
 * Setup:
 *  1. Go to portal.azure.com → Azure Active Directory → App registrations → New registration
 *  2. Add redirect URI: http://localhost:3001/auth/outlook/callback
 *  3. Under API permissions: add Microsoft Graph → Delegated → Mail.Read, Mail.Send
 *  4. Request admin consent (your IT admin may need to approve)
 *  5. Create a client secret under Certificates & secrets
 *  6. Set AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID in .env
 *  7. Set OUTLOOK_USER_EMAIL in .env (the mailbox to send from, e.g. you@company.com)
 *
 * Token management: this uses client credentials flow for simplicity.
 * For personal mailbox access you may need delegated auth (see comments below).
 */

let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
    if (cachedToken && Date.now() < tokenExpiry - 60000) return cachedToken;

    const { AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID } = process.env;
    if (!AZURE_CLIENT_ID || !AZURE_CLIENT_SECRET || !AZURE_TENANT_ID) {
        throw new Error(
            'Missing Azure credentials. Set AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, ' +
            'and AZURE_TENANT_ID in your .env file.'
        );
    }

    const tokenUrl = `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: AZURE_CLIENT_ID,
        client_secret: AZURE_CLIENT_SECRET,
        scope: 'https://graph.microsoft.com/.default',
    });

    const resp = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });

    if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Failed to get Outlook token: ${err}`);
    }

    const data = await resp.json();
    cachedToken = data.access_token;
    tokenExpiry = Date.now() + data.expires_in * 1000;
    return cachedToken;
}

/**
 * sendReply(message, replyText)
 * message: DB row from messages table (needs sender_address, subject, external_id)
 * replyText: the reply body text
 */
async function sendReply(message, replyText) {
    const token = await getAccessToken();
    const userEmail = process.env.OUTLOOK_USER_EMAIL;

    if (!userEmail) {
        throw new Error('OUTLOOK_USER_EMAIL not set in .env');
    }

    // If we have the original message ID, use the reply endpoint to preserve thread
    if (message.external_id) {
        const replyUrl = `https://graph.microsoft.com/v1.0/users/${userEmail}/messages/${message.external_id}/reply`;
        const resp = await fetch(replyUrl, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: {
                    body: { contentType: 'Text', content: replyText },
                },
                comment: replyText,
            }),
        });

        if (!resp.ok) {
            const err = await resp.text();
            throw new Error(`Graph API reply failed: ${err}`);
        }
    } else {
        // Fallback: send new message
        const sendUrl = `https://graph.microsoft.com/v1.0/users/${userEmail}/sendMail`;
        const resp = await fetch(sendUrl, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: {
                    subject: message.subject ? 'Re: ' + message.subject : '(reply)',
                    body: { contentType: 'Text', content: replyText },
                    toRecipients: [{ emailAddress: { address: message.sender_address } }],
                },
                saveToSentItems: true,
            }),
        });

        if (!resp.ok) {
            const err = await resp.text();
            throw new Error(`Graph API sendMail failed: ${err}`);
        }
    }

    console.log(`✅ Outlook reply sent to ${message.sender_address}`);
}

module.exports = { sendReply };
