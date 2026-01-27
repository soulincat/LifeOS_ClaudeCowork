// AI Notepad submission
document.querySelector('.ai-notepad-btn').addEventListener('click', async function() {
    const textarea = document.querySelector('.ai-notepad-input');
    const text = textarea.value.trim();
    
    if (!text) return;
    
    // Visual feedback
    this.textContent = 'Processing...';
    this.disabled = true;
    
    // In production, this would call Claude API
    // For now, simulate processing
    setTimeout(() => {
        textarea.value = '';
        this.textContent = 'Sent ✓';
        setTimeout(() => {
            this.textContent = 'Send to AI';
            this.disabled = false;
        }, 1500);
    }, 1000);
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
