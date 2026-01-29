#!/usr/bin/env node

/**
 * Life OS Reminder Notifications
 * Shows alerts for:
 * - Monday morning / weekly: "See the updates"
 * - End of month: "Input financial data manually"
 */

const { exec } = require('child_process');
const path = require('path');

function showNotification(title, message, sound = 'default') {
    const script = `
        display notification "${message}" with title "${title}" sound name "${sound}"
    `;
    
    exec(`osascript -e '${script}'`, (error) => {
        if (error) {
            console.error('Error showing notification:', error);
        }
    });
}

function checkReminders() {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const dayOfMonth = now.getDate();
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const hour = now.getHours();
    
    let reminderShown = false;
    
    // Monday morning reminder (between 8 AM and 10 AM)
    if (dayOfWeek === 1 && hour >= 8 && hour < 10) { // Monday morning
        showNotification(
            'Life OS Weekly Update',
            'Check your dashboard for updates and review your week!',
            'Glass'
        );
        
        // Also show popup
        try {
            require('./show-popup')('weekly');
        } catch (error) {
            console.error('Could not show popup:', error.message);
        }
        
        reminderShown = true;
    }
    
    // End of month reminder (last 3 days of month, between 9 AM and 11 AM)
    if (dayOfMonth >= lastDayOfMonth - 2 && hour >= 9 && hour < 11) {
        showNotification(
            'Life OS Monthly Finance',
            'Time to input your financial data manually for this month!',
            'Basso'
        );
        
        // Also show popup
        try {
            require('./show-popup')('monthly');
        } catch (error) {
            console.error('Could not show popup:', error.message);
        }
        
        reminderShown = true;
    }
    
    return reminderShown;
}

// Run check
const shouldOpenDashboard = checkReminders();

// Open dashboard if reminder was shown
if (shouldOpenDashboard) {
    const { execSync } = require('child_process');
    const port = process.env.PORT || 3000;
    const url = `http://localhost:${port}`;

    try {
        execSync(`open "${url}"`, { stdio: 'ignore' });
    } catch (error) {
        console.error('Could not open browser:', error.message);
    }
}
