/**
 * OAuth Routes
 * Whoop and Gmail OAuth connect/callback flows.
 * Extracted from server.js for cleaner separation.
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

// ── Whoop OAuth ──────────────────────────────────────────────────────────────

router.get('/health/whoop/connect', (req, res) => {
    const clientId = process.env.WHOOP_CLIENT_ID;
    const redirectUri = process.env.WHOOP_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/health/whoop/callback`;
    if (!clientId) {
        return res.status(500).send('WHOOP OAuth not configured. Set WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET in .env');
    }
    const url = new URL('https://api.prod.whoop.com/oauth/oauth2/auth');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', 'read:recovery read:cycles read:sleep read:profile read:body_measurement offline');
    url.searchParams.set('state', Math.random().toString(36).slice(2));
    res.redirect(302, url.toString());
});

// ── Gmail OAuth ──────────────────────────────────────────────────────────────

router.get('/gmail/connect', (req, res) => {
    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        return res.status(500).send('Gmail OAuth not configured. Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env');
    }
    const { google } = require('googleapis');
    const redirectUri = `${req.protocol}://${req.get('host')}/api/gmail/callback`;
    const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const url = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: [
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.send',
            'https://www.googleapis.com/auth/gmail.modify',
        ],
    });
    res.redirect(302, url);
});

router.get('/gmail/callback', async (req, res) => {
    const { code, error } = req.query;
    if (error) return res.redirect('/?gmail_error=' + encodeURIComponent(error));
    if (!code) return res.redirect('/?gmail_error=no_code');

    try {
        const { google } = require('googleapis');
        const clientId = process.env.GMAIL_CLIENT_ID;
        const clientSecret = process.env.GMAIL_CLIENT_SECRET;
        const redirectUri = `${req.protocol}://${req.get('host')}/api/gmail/callback`;
        const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

        const { tokens } = await oAuth2Client.getToken(code);

        const tokenDir = path.join(process.env.HOME, '.config', 'lifeos');
        if (!fs.existsSync(tokenDir)) fs.mkdirSync(tokenDir, { recursive: true });
        const tokenPath = path.join(tokenDir, 'gmail-token.json');
        fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
        console.log('Gmail OAuth tokens saved to', tokenPath);

        res.redirect('/?gmail_connected=1');
    } catch (err) {
        console.error('Gmail OAuth callback error:', err.message);
        res.redirect('/?gmail_error=' + encodeURIComponent(err.message));
    }
});

router.get('/gmail/status', (req, res) => {
    const tokenPath = path.join(process.env.HOME, '.config', 'lifeos', 'gmail-token.json');
    const connected = fs.existsSync(tokenPath);
    res.json({ connected, tokenPath: connected ? tokenPath : null });
});

module.exports = router;
