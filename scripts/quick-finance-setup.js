#!/usr/bin/env node

/**
 * Quick Finance Setup
 * Pre-filled form for common finance entries
 */

const readline = require('readline');
const db = require('../db/database');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount);
}

async function quickSetup() {
    console.log('💰 Quick Finance Setup\n');
    console.log('This will help you set up common finance entries for the current month.\n');

    const now = new Date();
    const currentMonth = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const today = now.toISOString().split('T')[0];
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

    console.log(`Setting up finance for: ${currentMonth}`);
    console.log(`Period: ${monthStart} to ${today} (month-to-date)\n`);

    // Monthly entries (business) - month-to-date totals
    console.log('📈 Business Finance (Month-to-Date):');
    console.log('   Enter totals from 1st of month to today');
    const revenue = await question('Revenue ($, from Stripe or manual): ');
    const expense = await question('Expenses ($, from Stripe or manual): ');
    const profit = revenue && expense ? parseFloat(revenue) - parseFloat(expense) : null;

    // Monthly spending (personal) - month-to-date
    console.log('\n💸 Personal Spending (Month-to-Date):');
    console.log('   Enter total spending from 1st of month to today');
    const spending = await question('Spending ($, from Wise or manual): ');

    // Constant entries (personal) - monthly snapshots
    console.log('\n💼 Personal Finance (Monthly Snapshots):');
    const investment = await question('Total Investments ($): ');
    const asset = await question('Total Assets ($): ');
    const totalNet = await question('Total Net Worth ($): ');

    console.log('\n📝 Summary:');
    if (revenue) console.log(`  Revenue (month-to-date): ${formatCurrency(parseFloat(revenue))}`);
    if (expense) console.log(`  Expenses (month-to-date): ${formatCurrency(parseFloat(expense))}`);
    if (profit !== null) console.log(`  Profit (month-to-date): ${formatCurrency(profit)}`);
    if (spending) console.log(`  Spending (month-to-date): ${formatCurrency(parseFloat(spending))}`);
    if (investment) console.log(`  Investments (snapshot): ${formatCurrency(parseFloat(investment))}`);
    if (asset) console.log(`  Assets (snapshot): ${formatCurrency(parseFloat(asset))}`);
    if (totalNet) console.log(`  Net Worth (snapshot): ${formatCurrency(parseFloat(totalNet))}`);

    const confirm = await question('\nSave all entries? (y/n): ');
    if (confirm.toLowerCase() !== 'y') {
        console.log('Setup cancelled.');
        rl.close();
        return;
    }

    const stmt = db.prepare(`
        INSERT INTO finance_entries (date, type, amount, account_type, source)
        VALUES (?, ?, ?, ?, ?)
    `);

    let count = 0;

    // Monthly totals (use today's date for month-to-date entries)
    if (revenue) {
        stmt.run(today, 'revenue', parseFloat(revenue), 'business', 'manual');
        count++;
    }
    if (expense) {
        stmt.run(today, 'expense', parseFloat(expense), 'business', 'manual');
        count++;
    }
    if (profit !== null) {
        stmt.run(today, 'profit', profit, 'business', 'manual');
        count++;
    }
    if (spending) {
        stmt.run(today, 'spending', parseFloat(spending), 'personal', 'manual');
        count++;
    }
    
    // Monthly snapshots (use today's date)
    if (investment) {
        stmt.run(today, 'investment', parseFloat(investment), 'personal', 'manual');
        count++;
    }
    if (asset) {
        stmt.run(today, 'asset', parseFloat(asset), 'personal', 'manual');
        count++;
    }
    if (totalNet) {
        stmt.run(today, 'total_net', parseFloat(totalNet), 'personal', 'manual');
        count++;
    }

    console.log(`\n✅ Saved ${count} finance entries!`);
    console.log(`\nYou can view them in the dashboard at http://localhost:3000`);
    console.log(`Or add more entries with: npm run input-finance`);

    rl.close();
}

if (require.main === module) {
    quickSetup().catch(error => {
        console.error('Error:', error);
        rl.close();
        process.exit(1);
    });
}

module.exports = { quickSetup };
