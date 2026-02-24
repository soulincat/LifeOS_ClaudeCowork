#!/usr/bin/env node
/**
 * Monthly report reminder - run via cron (e.g. 0 9 1 * * = 9am on 1st of month).
 * Checks if current month has a monthly report; if not, logs a reminder.
 * Optionally set REMINDER_URL to POST to (e.g. your app's notification endpoint).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db/database');

const currentMonth = new Date().toISOString().slice(0, 7);

const rows = db.prepare(`
  SELECT id, period_label FROM monthly_reports
  WHERE period_label LIKE ?
`).all(currentMonth + '%');

if (rows.length === 0) {
  console.log(`[Life OS] Monthly report due for ${currentMonth}. Add one in the Scenarios tab.`);
  const url = process.env.REMINDER_URL;
  if (url) {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'monthly_report_due', period: currentMonth })
    }).catch(() => {});
  }
} else {
  console.log(`[Life OS] Monthly report for ${currentMonth} already logged.`);
}
