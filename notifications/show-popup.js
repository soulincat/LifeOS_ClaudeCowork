#!/usr/bin/env node

/**
 * Show HTML popup reminder
 * Opens a browser window with the reminder popup
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function showPopup(type = 'weekly') {
    const popupPath = path.join(__dirname, 'popup.html');
    const port = process.env.PORT || 3000;
    
    if (!fs.existsSync(popupPath)) {
        console.error('Popup HTML not found at:', popupPath);
        return;
    }
    
    const url = `file://${popupPath}?type=${type}&port=${port}`;
    
    try {
        // Open in a new browser window
        execSync(`open -a "Google Chrome" "${url}"`, { stdio: 'ignore' });
    } catch (error) {
        try {
            // Fallback to default browser
            execSync(`open "${url}"`, { stdio: 'ignore' });
        } catch (err) {
            console.error('Could not open popup:', err.message);
        }
    }
}

// Get reminder type from command line or default to weekly
const type = process.argv[2] || 'weekly';
showPopup(type);
