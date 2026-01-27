// Health Alert Logic
function updateHealthAlert() {
    const recoveryEl = document.querySelector('.info-row .info-value.accent');
    const sleepEl = Array.from(document.querySelectorAll('.info-row')).find(row => 
        row.querySelector('.info-label').textContent === 'Sleep'
    );
    const cycleEl = Array.from(document.querySelectorAll('.info-row')).find(row => 
        row.querySelector('.info-label').textContent === 'Cycle'
    );
    
    const alertEl = document.getElementById('healthAlert');
    
    if (!recoveryEl || !sleepEl || !cycleEl || !alertEl) return;
    
    const recovery = parseInt(recoveryEl.textContent);
    const sleepText = sleepEl.querySelector('.info-value').textContent;
    const cycleText = cycleEl.querySelector('.info-value').textContent;
    
    // Parse sleep hours (e.g., "7h 24m" -> 7)
    const sleepMatch = sleepText.match(/(\d+)h/);
    const sleepHours = sleepMatch ? parseInt(sleepMatch[1]) : 0;
    
    // Check conditions
    const lowRecovery = recovery < 70;
    const lowSleep = sleepHours < 7;
    const isLutealOrPreMenstrual = cycleText.toLowerCase().includes('luteal') || 
                                   cycleText.toLowerCase().includes('pre-menstrual') ||
                                   cycleText.toLowerCase().includes('before menstruation');
    
    if (lowRecovery && lowSleep && isLutealOrPreMenstrual) {
        alertEl.textContent = 'Low energy and emotional sensitivity alert, be mindful today';
        alertEl.style.display = 'block';
    } else if (lowRecovery && lowSleep) {
        alertEl.textContent = 'Low recovery and sleep detected, prioritize rest today';
        alertEl.style.display = 'block';
    } else if (lowRecovery) {
        alertEl.textContent = 'Low recovery detected, take it easy today';
        alertEl.style.display = 'block';
    } else if (lowSleep) {
        alertEl.textContent = 'Insufficient sleep detected, be mindful of energy levels';
        alertEl.style.display = 'block';
    } else {
        alertEl.style.display = 'none';
    }
}

// Initialize health alert on page load
updateHealthAlert();

// AI Notepad submission - Connect to Claude
document.querySelector('.ai-notepad-btn').addEventListener('click', async function() {
    const textarea = document.querySelector('.ai-notepad-input');
    const text = textarea.value.trim();
    
    if (!text) return;
    
    const button = this;
    const originalText = button.textContent;
    
    // Visual feedback
    button.textContent = 'Processing...';
    button.disabled = true;
    
    try {
        // Send to Claude API via backend
        const response = await fetch('/api/agent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message: text })
        });
        
        const data = await response.json();
        
        if (response.ok && data.response) {
            // Success - clear input and show confirmation
            textarea.value = '';
            button.textContent = 'Sent ✓';
            
            // Optional: Display response somewhere or log it
            console.log('Claude response:', data.response);
            
            setTimeout(() => {
                button.textContent = originalText;
                button.disabled = false;
            }, 1500);
        } else {
            throw new Error(data.error || 'Failed to get response');
        }
    } catch (error) {
        console.error('Error sending to Claude:', error);
        button.textContent = 'Error';
        setTimeout(() => {
            button.textContent = originalText;
            button.disabled = false;
        }, 2000);
    }
});

// Project card clicks
document.querySelectorAll('.project-card').forEach(card => {
    card.addEventListener('click', function() {
        const name = this.querySelector('.project-card-name').textContent;
        console.log('Opening project:', name);
    });
});

// Email clicks
document.querySelectorAll('.email-item').forEach(email => {
    email.addEventListener('click', function() {
        const subject = this.querySelector('.email-subject').textContent;
        console.log('Opening email:', subject);
    });
});

// TODO: Replace dummy posts with API fetch when ready
// async function loadScheduledPosts() {
//     // Fetch from https://soulin-social-bot.vercel.app/api/posts
//     // Display centerPost title for next 2 scheduled posts
// }
