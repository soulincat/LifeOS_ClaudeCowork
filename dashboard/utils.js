/* ================================================================
   Life OS Dashboard — Shared Utilities
   ================================================================
   Loaded before all other scripts. Provides common helpers used
   across multiple dashboard modules.
   ================================================================ */

// ── HTML escaping ───────────────────────────────────────────────

/** Escape HTML to prevent XSS in dynamic content */
function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Currency & number formatting ────────────────────────────────

/** Format a number as compact currency: $1.2k, $500, -$300 */
function formatCurrency(amount) {
    if (amount == null || isNaN(Number(amount))) return '$0';
    const n = Number(amount);
    if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'k';
    if (n >= 0) return '$' + n.toFixed(0);
    return '-$' + Math.abs(n).toFixed(0);
}

/** Format large numbers with k/M suffixes: 1200 → "1.2k" */
function formatNumber(num) {
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return String(num);
}

// ── Date helpers ────────────────────────────────────────────────

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

/** Get the name of the current month */
function currentMonthName() {
    return MONTH_NAMES[new Date().getMonth()];
}
