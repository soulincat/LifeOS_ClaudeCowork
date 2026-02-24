/**
 * Send a desktop notification (macOS).
 * 1. Tries terminal-notifier if installed (brew install terminal-notifier) - works from cron.
 * 2. Falls back to osascript - works when run from Terminal; often fails from cron (no GUI session).
 * Set NOTIFY_DEBUG=1 to log errors.
 */
const { execSync } = require('child_process');

function notify(title = 'Life OS', message) {
    if (!message) return;
    const debug = process.env.NOTIFY_DEBUG === '1' || process.env.NOTIFY_DEBUG === 'true';

    // terminal-notifier: works from cron and shows in Notification Center
    try {
        execSync(
            ['terminal-notifier', '-title', title, '-message', message],
            { stdio: debug ? 'inherit' : 'ignore', timeout: 5000 }
        );
        return;
    } catch (_) {
        // Not installed, try osascript
    }

    // osascript: works when run from your Terminal session
    try {
        const safe = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
        const script = `display notification "${safe(message)}" with title "${safe(title)}"`;
        execSync('osascript', ['-e', script], { stdio: debug ? 'inherit' : 'ignore', timeout: 5000 });
    } catch (e) {
        if (debug) {
            console.error('[notify]', e.message);
        }
    }
}

module.exports = { notify };
