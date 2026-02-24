#!/usr/bin/env node

/**
 * Interactive Finance Data Input Script
 * Helps you manually input initial finance data
 */

const readline = require('readline');
const db = require('../core/db/database');

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

async function inputFinanceEntry() {
    console.log('\n📊 Finance Entry Form\n');
    console.log('Enter finance data (press Enter to skip, type "done" to finish)\n');

    // Finance Type
    console.log('Finance Types:');
    console.log('  1. Revenue (business income)');
    console.log('  2. Profit (revenue - expenses)');
    console.log('  3. Expense (business costs)');
    console.log('  4. Spending (personal spending)');
    console.log('  5. Investment (investments/assets)');
    console.log('  6. Asset (total assets)');
    console.log('  7. Total Net (net worth)');
    
    const typeChoice = await question('\nSelect type (1-7): ');
    const typeMap = {
        '1': 'revenue',
        '2': 'profit',
        '3': 'expense',
        '4': 'spending',
        '5': 'investment',
        '6': 'asset',
        '7': 'total_net'
    };
    
    const type = typeMap[typeChoice];
    if (!type) {
        console.log('Invalid choice. Please try again.');
        return false;
    }

    // Amount
    const amountStr = await question('Amount ($): ');
    const amount = parseFloat(amountStr.replace(/[^0-9.-]/g, ''));
    if (isNaN(amount) || amount <= 0) {
        console.log('Invalid amount. Please try again.');
        return false;
    }

    // Account Type
    console.log('\nAccount Types:');
    console.log('  1. Business');
    console.log('  2. Personal');
    const accountChoice = await question('Select account type (1-2): ');
    const accountType = accountChoice === '1' ? 'business' : 'personal';

    // Date
    const dateStr = await question('Date (YYYY-MM-DD, or press Enter for today): ');
    let date;
    if (dateStr.trim() === '') {
        date = new Date().toISOString().split('T')[0];
    } else {
        date = dateStr.trim();
        // Validate date format
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            console.log('Invalid date format. Using today\'s date.');
            date = new Date().toISOString().split('T')[0];
        }
    }

    // Source
    const source = await question('Source (stripe/wise/manual, default: manual): ') || 'manual';

    // Confirm
    console.log('\n📝 Entry Summary:');
    console.log(`  Type: ${type}`);
    console.log(`  Amount: ${formatCurrency(amount)}`);
    console.log(`  Account: ${accountType}`);
    console.log(`  Date: ${date}`);
    console.log(`  Source: ${source}`);
    
    const confirm = await question('\nSave this entry? (y/n): ');
    if (confirm.toLowerCase() !== 'y') {
        console.log('Entry cancelled.');
        return false;
    }

    // Save to database
    try {
        const stmt = db.prepare(`
            INSERT INTO finance_entries (date, type, amount, account_type, source)
            VALUES (?, ?, ?, ?, ?)
        `);
        stmt.run(date, type, amount, accountType, source);
        console.log(`✅ Saved: ${type} - ${formatCurrency(amount)} on ${date}`);
        return true;
    } catch (error) {
        console.error('❌ Error saving entry:', error.message);
        return false;
    }
}

async function inputMultipleEntries() {
    console.log('💰 Finance Data Input Tool\n');
    console.log('This tool helps you input initial finance data manually.');
    console.log('You can add multiple entries. Type "done" at any prompt to finish.\n');

    let continueInput = true;
    let entryCount = 0;

    while (continueInput) {
        const result = await inputFinanceEntry();
        if (result) {
            entryCount++;
        }

        const more = await question('\nAdd another entry? (y/n): ');
        if (more.toLowerCase() !== 'y') {
            continueInput = false;
        }
    }

    console.log(`\n✅ Finished! Added ${entryCount} finance entries.`);
    
    // Show summary
    const stmt = db.prepare(`
        SELECT type, SUM(amount) as total, COUNT(*) as count
        FROM finance_entries
        GROUP BY type
        ORDER BY type
    `);
    const summary = stmt.all();
    
    if (summary.length > 0) {
        console.log('\n📊 Finance Summary:');
        summary.forEach(row => {
            console.log(`  ${row.type}: ${formatCurrency(row.total)} (${row.count} entries)`);
        });
    }

    rl.close();
}

// Run if called directly
if (require.main === module) {
    inputMultipleEntries().catch(error => {
        console.error('Error:', error);
        rl.close();
        process.exit(1);
    });
}

module.exports = { inputFinanceEntry };
