// Shared utility — must be top-level so all module-scope functions can use it
function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Widget config: controls which optional sections render ──────────────────
let _widgetConfig = null;
async function getWidgetConfig() {
    if (_widgetConfig) return _widgetConfig;
    try {
        const res = await fetch('/api/config/user');
        const user = await res.json();
        _widgetConfig = user.dashboard_widgets || {};
    } catch (e) { _widgetConfig = {}; }
    return _widgetConfig;
}
function isWidgetEnabled(name) {
    if (!_widgetConfig) return true; // default show until config loads
    return _widgetConfig[name] !== false; // default true unless explicitly disabled
}

// On load: fetch config and hide optional tabs/sections
(async function applyWidgetConfig() {
    await getWidgetConfig();
    // Hide optional tabs / sub-tabs
    if (!isWidgetEnabled('projections')) {
        const sub = document.querySelector('.more-sub-tab[data-section="scenarios"]');
        if (sub) sub.style.display = 'none';
    }
    if (!isWidgetEnabled('social')) {
        const tab = document.querySelector('.tab-bar-tab[data-tab="socials"]');
        if (tab) tab.style.display = 'none';
    }
    if (!isWidgetEnabled('wishlist')) {
        const sub = document.querySelector('.more-sub-tab[data-section="wishlist"]');
        if (sub) sub.style.display = 'none';
    }
})();

// ── Update check: fetch version status and show banner if update available ──
(async function checkForUpdates() {
    try {
        const res = await fetch('/api/system/update-status');
        const data = await res.json();

        if (data.update_available && data.latest_version) {
            const banner = document.getElementById('updateBanner');
            const versionText = document.getElementById('updateVersionText');
            const updateBtn = document.getElementById('updateBtn');
            const dismissBtn = document.getElementById('dismissUpdateBtn');

            if (banner && versionText && sessionStorage.getItem('update_dismissed') !== '1') {
                versionText.textContent = `v${data.latest_version}`;
                document.body.classList.add('update-banner-visible');

                updateBtn.addEventListener('click', performUpdate);
                dismissBtn.addEventListener('click', () => {
                    document.body.classList.remove('update-banner-visible');
                    sessionStorage.setItem('update_dismissed', '1');
                });
            }
        }
    } catch (e) {
        console.warn('Update check failed:', e);
    }
})();

async function performUpdate() {
    const banner = document.getElementById('updateBanner');
    const content = document.querySelector('.update-banner-content');
    const progress = document.getElementById('updateProgress');

    // Show progress
    if (content) content.style.display = 'none';
    if (progress) progress.style.display = 'block';

    try {
        const res = await fetch('/api/system/update', { method: 'POST' });
        const data = await res.json();

        if (data.success) {
            if (progress) progress.innerHTML = '<span>✅ Update applied. Restarting...</span>';
            // Page will reload when server restarts
            setTimeout(() => location.reload(), 3000);
        } else {
            if (progress) progress.innerHTML = `<span>❌ Update failed: ${data.error}</span>`;
            setTimeout(() => {
                if (content) content.style.display = 'flex';
                if (progress) progress.style.display = 'none';
            }, 2000);
        }
    } catch (e) {
        if (progress) progress.innerHTML = `<span>❌ Error: ${e.message}</span>`;
        setTimeout(() => {
            if (content) content.style.display = 'flex';
            if (progress) progress.style.display = 'none';
        }, 2000);
    }
}

// Health display: set values and WHOOP-style colors (green / yellow / red)
function updateHealthDisplay(health) {
    const recoveryEl = document.getElementById('healthRecoveryValue');
    const sleepEl = document.getElementById('healthSleepValue');
    const hrvEl = document.getElementById('healthHrvValue');
    const strainEl = document.getElementById('healthStrainValue');
    const cycleEl = document.getElementById('healthCycleValue');
    const monthlyEl = document.getElementById('healthMonthlyPhase');

    if (recoveryEl) {
        const v = health.recovery != null ? Number(health.recovery) : null;
        recoveryEl.textContent = v != null ? v + '%' : '—';
        recoveryEl.className = 'info-value health-recovery';
        if (v != null) {
            if (v >= 67) recoveryEl.classList.add('health-recovery-green');
            else if (v >= 34) recoveryEl.classList.add('health-recovery-yellow');
            else recoveryEl.classList.add('health-recovery-red');
        }
    }
    if (sleepEl) {
        const v = health.sleep_performance_pct != null ? Number(health.sleep_performance_pct) : null;
        sleepEl.textContent = v != null ? v + '%' : '—';
        sleepEl.className = 'info-value health-sleep';
        if (v != null) {
            if (v >= 85) sleepEl.classList.add('health-sleep-green');
            else if (v >= 67) sleepEl.classList.add('health-sleep-yellow');
            else sleepEl.classList.add('health-sleep-red');
        }
    }
    if (hrvEl) hrvEl.textContent = (health.hrv != null ? health.hrv + 'ms' : '—');
    if (strainEl) {
        strainEl.textContent = (health.strain != null ? Number(health.strain).toFixed(1) : '—');
        strainEl.className = 'info-value health-strain';
        strainEl.classList.remove('health-strain-green', 'health-strain-yellow', 'health-strain-red');
        if (health.strain != null && health.recovery != null) {
            const strain = Number(health.strain);
            const recovery = Number(health.recovery);
            let strainClass = 'health-strain-yellow';
            if (recovery >= 67) {
                if (strain >= 8 && strain <= 16) strainClass = 'health-strain-green';
                else if (strain > 18) strainClass = 'health-strain-red';
                else if (strain > 16) strainClass = 'health-strain-yellow';
                else if (strain < 6) strainClass = 'health-strain-yellow';
            } else if (recovery >= 34) {
                if (strain >= 5 && strain <= 12) strainClass = 'health-strain-green';
                else if (strain > 15) strainClass = 'health-strain-red';
                else strainClass = 'health-strain-yellow';
            } else {
                if (strain >= 0 && strain <= 8) strainClass = 'health-strain-green';
                else if (strain > 12) strainClass = 'health-strain-red';
                else strainClass = 'health-strain-yellow';
            }
            strainEl.classList.add(strainClass);
        }
    }
    if (cycleEl) {
        const rawPhase = health.cycle_phase || '';
        const phaseLabels = { follicular: 'Follicular - feel OK', ovulatory: 'Ovulatory - horny', luteal: 'Luteal - feel OK', pms: 'PMS - depression', period: 'Period' };
        let displayPhase = rawPhase;
        if (rawPhase && !rawPhase.includes(' - ')) {
            const key = rawPhase.toLowerCase().replace(/\s+/g, '');
            displayPhase = phaseLabels[key] || (phaseLabels[rawPhase.toLowerCase()] || rawPhase);
        }
        cycleEl.textContent = displayPhase || '—';
        cycleEl.className = 'info-value health-cycle-value';
        cycleEl.classList.remove('health-cycle-green', 'health-cycle-yellow', 'health-cycle-red');
        const phase = (displayPhase || '').toLowerCase();
        if (phase.includes('follicular') || phase.includes('luteal')) cycleEl.classList.add('health-cycle-green');
        else if (phase.includes('ovulatory')) cycleEl.classList.add('health-cycle-yellow');
        else if (phase.includes('pms')) cycleEl.classList.add('health-cycle-red');
    }
    if (monthlyEl) monthlyEl.textContent = health.monthly_phase || '—';
    const healthSyncedBadge = document.getElementById('healthSyncedBadge');
    if (healthSyncedBadge) {
        if (health.sync_source === 'whoop') {
            healthSyncedBadge.textContent = 'Synced from Whoop';
            healthSyncedBadge.style.display = 'block';
        } else {
            healthSyncedBadge.style.display = 'none';
        }
    }
}

// Health Alert Logic
function updateHealthAlert() {
    const recoveryEl = document.getElementById('healthRecoveryValue');
    const sleepEl = document.getElementById('healthSleepValue');
    const cycleEl = document.getElementById('healthCycleValue');
    const alertEl = document.getElementById('healthAlert');
    
    if (!recoveryEl || !sleepEl || !alertEl) return;
    
    const recovery = parseInt(recoveryEl.textContent, 10) || 0;
    const sleepText = sleepEl.textContent;
    const cycleText = cycleEl ? cycleEl.textContent : '';
    // Parse sleep: now shown as % (e.g. "85%") or legacy "7h 24m"
    const sleepPctMatch = sleepText.match(/(\d+)%/);
    const sleepHoursMatch = sleepText.match(/(\d+)h/);
    const sleepHours = sleepPctMatch ? null : (sleepHoursMatch ? parseInt(sleepHoursMatch[1], 10) : 0);
    const sleepPct = sleepPctMatch ? parseInt(sleepPctMatch[1], 10) : null;
    
    // Check conditions (sleep: low % or legacy low hours)
    const lowRecovery = recovery < 70;
    const lowSleep = (sleepPct != null && sleepPct < 67) || (sleepHours != null && sleepHours < 7);
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

// Load dashboard data (each section independent so one failure doesn't block the rest)
async function loadSocialsData() {
    let socialFollowersTotal = 0;

    // Hide entire dashboard social section if social widget is disabled
    await getWidgetConfig();
    if (!isWidgetEnabled('social')) {
        const socialFill = document.querySelector('#panel-socials .dashboard-social-fill');
        if (socialFill) socialFill.style.display = 'none';
    }

    // WHOOP OAuth callback feedback
    const params = new URLSearchParams(window.location.search);
    if (params.has('whoop_connected')) {
        if (typeof showToast === 'function') showToast('WHOOP connected. Sync will pull your recovery, sleep & HRV.', 'success');
        window.history.replaceState({}, '', window.location.pathname || '/');
    }
    if (params.has('whoop_error')) {
        const msg = params.get('whoop_error') || 'Connection failed';
        if (typeof showToast === 'function') showToast('WHOOP: ' + msg, 'error');
        window.history.replaceState({}, '', window.location.pathname || '/');
    }

    // --- Health ---
    try {
        const healthResponse = await fetch('/api/health');
        const health = await healthResponse.json();
        updateHealthDisplay(health);
        updateHealthAlert();

        // WHOOP connection status and Sync button
        try {
            const whoopStatusRes = await fetch('/api/health/whoop/status');
            const whoopStatusData = await whoopStatusRes.json();
            const whoopBtn = document.getElementById('whoopConnectLink');
            const whoopSyncBtn = document.getElementById('whoopSyncBtn');
            const whoopStatusEl = document.getElementById('whoopStatus');
            if (whoopBtn && whoopStatusEl) {
                if (whoopStatusData.connected) {
                    whoopBtn.style.display = 'none';
                    whoopStatusEl.textContent = 'WHOOP connected';
                    if (whoopSyncBtn) {
                        whoopSyncBtn.style.display = '';
                        whoopSyncBtn.onclick = async function() {
                            whoopSyncBtn.disabled = true;
                            whoopStatusEl.textContent = 'Syncing…';
                            try {
                                const r = await fetch('/api/health/whoop/sync?days=14', { method: 'POST' });
                                const data = await r.json();
                                if (data.needsReconnect) {
                                    whoopStatusEl.textContent = 'Token expired';
                                    whoopBtn.style.display = '';
                                    whoopBtn.textContent = 'Reconnect WHOOP';
                                    whoopSyncBtn.style.display = 'none';
                                } else if (data.success) {
                                    whoopStatusEl.textContent = data.synced > 0 ? `WHOOP (${data.synced} new)` : 'WHOOP connected';
                                    // Always re-fetch health from DB after sync
                                    const freshHealth = await fetch('/api/health');
                                    const health = await freshHealth.json();
                                    updateHealthDisplay(health);
                                    updateHealthAlert();
                                } else {
                                    whoopStatusEl.textContent = data.error || 'Sync failed';
                                }
                            } catch (e) {
                                whoopStatusEl.textContent = 'Sync failed';
                            }
                            whoopSyncBtn.disabled = false;
                        };
                    }
                    // Auto-sync once when connected and page loads (pulls last 14 days)
                    const r = await fetch('/api/health/whoop/sync?days=14', { method: 'POST' });
                    const syncData = await r.json();
                    if (syncData.needsReconnect) {
                        whoopStatusEl.textContent = 'Token expired';
                        whoopBtn.style.display = '';
                        whoopBtn.textContent = 'Reconnect WHOOP';
                        if (whoopSyncBtn) whoopSyncBtn.style.display = 'none';
                    } else if (syncData.success) {
                        const label = syncData.synced > 0 ? `WHOOP (${syncData.synced} new)` : 'WHOOP connected';
                        whoopStatusEl.textContent = label;
                        // Always re-fetch from DB after sync so display is up to date
                        const freshHealth = await fetch('/api/health');
                        const health = await freshHealth.json();
                        updateHealthDisplay(health);
                        updateHealthAlert();
                    }
                } else {
                    whoopBtn.style.display = '';
                    whoopStatusEl.textContent = 'Not connected';
                    if (whoopSyncBtn) whoopSyncBtn.style.display = 'none';
                }
            }
        } catch (e) { /* ignore */ }
    } catch (e) { console.warn('Health load failed', e); }

    // --- Finance ---
    let finance = {};
    try {
        const financeResponse = await fetch('/api/finance');
            if (financeResponse.ok) {
                finance = await financeResponse.json();
        } else {
            console.warn('Finance API:', financeResponse.status);
        }
    } catch (e) {
        console.warn('Finance fetch failed:', e);
    }
    try {
        // Update finance display
        const financeSection = document.getElementById('financeSection');
        const financeRows = financeSection ? financeSection.querySelectorAll('.info-row') : [];
        
        if (financeSection && financeRows.length > 0) {
        // Format currency helper
        const formatCurrency = (amount) => {
            if (amount === null || amount === undefined) return '$0';
            const numAmount = Number(amount);
            if (isNaN(numAmount)) return '$0';
            if (numAmount >= 1000) {
                return `$${(numAmount / 1000).toFixed(1)}k`;
            } else if (numAmount >= 0) {
                return `$${numAmount.toFixed(0)}`;
            } else {
                return `-$${Math.abs(numAmount).toFixed(0)}`;
            }
        };
        
        financeRows.forEach((row, index) => {
            const labelEl = row.querySelector('.info-label');
            const valueEl = row.querySelector('.info-value');
            
            if (!valueEl || !labelEl) {
                console.log(`Row ${index}: Missing elements`);
                return;
            }
            
            const label = labelEl.textContent?.trim();
            
            let newValue = null;
            let shouldAddAccent = false;
            
            if (label === 'Revenue') {
                newValue = finance.monthly?.revenue;
                shouldAddAccent = true;
            } else if (label === 'Profit') {
                newValue = finance.monthly?.profit;
                shouldAddAccent = true;
            } else if (label === 'Expense') {
                newValue = finance.monthly?.expense;
            } else if (label === 'Spending') {
                newValue = finance.monthly?.spending;
            } else if (label === 'Investment') {
                newValue = finance.constants?.investment;
                shouldAddAccent = true;
            } else if (label === 'Passive Yield') {
                const passiveYieldAmount = finance.constants?.passive_yield;
                const investment = finance.constants?.investment || 0;
                if (passiveYieldAmount == null && investment === 0) return; // leave "—"
                const amount = Number(passiveYieldAmount) || 0;
                let percentage = finance.constants?.passive_yield_percentage ?? 0;
                if (investment > 0 && amount > 0) percentage = (amount / investment) * 100;
                valueEl.textContent = `${formatCurrency(amount)} (${percentage.toFixed(1)}%)`;
                return;
            } else if (label === 'Asset') {
                newValue = finance.constants?.asset;
                shouldAddAccent = true;
            } else if (label === 'Total Net') {
                newValue = finance.constants?.total_net;
                shouldAddAccent = true;
            }
            
            // Only update when we have a value; if API returns nothing, keep existing display so it doesn't revert to $0
            if (newValue !== null && newValue !== undefined && !isNaN(Number(newValue))) {
                const formatted = formatCurrency(newValue);
                valueEl.textContent = formatted;
            }
            // else: leave valueEl.textContent as is (don't overwrite with $0)
            
            // Update accent class
            if (shouldAddAccent) {
                valueEl.classList.add('accent');
            } else {
                valueEl.classList.remove('accent');
            }
        });
        
        // Explicitly ensure Total Net is displayed (use API value or compute from investment + asset)
        const totalNetEl = document.getElementById('totalNetValue');
        if (totalNetEl) {
            let totalNet = finance.constants?.total_net;
            if (totalNet == null || isNaN(Number(totalNet))) {
                const inv = Number(finance.constants?.investment) || 0;
                const ast = Number(finance.constants?.asset) || 0;
                totalNet = inv + ast;
            } else {
                totalNet = Number(totalNet);
            }
            totalNetEl.textContent = formatCurrency(totalNet);
            totalNetEl.classList.add('accent');
        }
        }
        
        console.log('✅ Finance display updated');
        console.log('Final finance values:', {
            revenue: finance.monthly?.revenue,
            profit: finance.monthly?.profit,
            expense: finance.monthly?.expense,
            spending: finance.monthly?.spending,
            total_net: finance.constants?.total_net
        });
        
        // Update finance month
        const financeMonthEl = document.getElementById('financeMonth');
        if (financeMonthEl) {
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                              'July', 'August', 'September', 'October', 'November', 'December'];
            financeMonthEl.textContent = monthNames[new Date().getMonth()];
        }
        // Synced sources badge (Stripe/Wise — read-only)
        const syncedBadge = document.getElementById('financeSyncedBadge');
        if (syncedBadge && Array.isArray(finance.synced_sources) && finance.synced_sources.length > 0) {
            const labels = finance.synced_sources.map(s => s === 'stripe' ? 'Stripe' : s === 'wise' ? 'Wise' : s);
            syncedBadge.textContent = 'Synced from ' + labels.join(' • ') + ' (read-only)';
            syncedBadge.style.display = 'block';
        } else if (syncedBadge) {
            syncedBadge.style.display = 'none';
        }
    } catch (e) { console.warn('Finance display failed', e); }

    // --- Scheduled posts ---
    try {
        const postsResponse = await fetch('/api/social/scheduled-posts?limit=3');
        const posts = await postsResponse.json();
        
        const scheduledPostsContainer = document.getElementById('scheduledPostsContainer');
        if (scheduledPostsContainer && posts.length > 0) {
            scheduledPostsContainer.innerHTML = posts.map(post => `
                <div class="social-post">
                    ${post.center_post}
                    <div class="social-post-meta">${Array.isArray(post.platforms) ? post.platforms.join(' + ') : post.platforms} • ${post.date_display}</div>
                </div>
            `).join('');
        }
    } catch (e) { console.warn('Scheduled posts failed', e); }

    // --- Social followers: one API → fill each platform card, total = sum ---
    try {
        const metricsRes = await fetch('/api/social/metrics');
        const list = await metricsRes.json();
        if (Array.isArray(list)) {
            const fmt = (v) => (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(v));
            let total = 0;
            list.forEach((m) => {
                const v = Number(m.value) || 0;
                total += v;
                const platform = (m.platform || '').toLowerCase();
                const el = document.querySelector('#panel-socials .social-platform-metric[data-platform="' + platform + '"]');
                if (el) el.textContent = fmt(v);
            });
            socialFollowersTotal = total;
            const totalEl = document.getElementById('socialFollowersValue');
            if (totalEl) totalEl.textContent = fmt(total);
        }
    } catch (e) { console.warn('Social metrics failed', e); }
    // Fallback so channel-type project card can still show total if social API failed
    if (socialFollowersTotal === 0) {
        const totalEl = document.getElementById('socialFollowersValue');
        if (totalEl && totalEl.textContent) {
            const t = String(totalEl.textContent).replace(/\s/g, '').toLowerCase();
            const n = parseFloat(t);
            if (!isNaN(n)) socialFollowersTotal = t.includes('k') ? Math.round(n * 1000) : Math.round(n);
        }
        if (socialFollowersTotal === 0) socialFollowersTotal = 20600;
    }

    // --- Social overview: Posts, Impressions, Clicks ---
    try {
        const overviewRes = await fetch('/api/social/overview');
        const overview = await overviewRes.json();
        if (overview) {
            const fmt = (v) => (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(v));
            const socialMetrics = document.querySelectorAll('#panel-socials .social-metric');
            if (socialMetrics.length >= 4) {
                if (overview.posts != null) socialMetrics[1].querySelector('.social-metric-value').textContent = overview.posts.toString();
                if (overview.impressions != null) socialMetrics[2].querySelector('.social-metric-value').textContent = fmt(overview.impressions);
                if (overview.clicks != null) socialMetrics[3].querySelector('.social-metric-value').textContent = fmt(overview.clicks);
            }
        }
    } catch (e) { console.warn('Social overview failed', e); }

    // --- Project cards (dashboard): same structure as Projections, data from /api/projects ---
    try {
            const projectsResponse = await fetch('/api/projects');
            const data = await projectsResponse.json();
            const projects = Array.isArray(data) ? data : [];

            // Same card structure as Projections tab: now → target, label, mini-chart, footer (effort + growth)
            const gridEl = document.getElementById('dashboardProjectsGrid');
            if (!gridEl) {
                console.warn('Dashboard projects grid not found');
                return;
            }
            if (projects.length === 0) {
                console.warn('No projects returned from API');
            }

            // Generate project cards dynamically from DB data (no hardcoded project names)
            gridEl.innerHTML = '';
            projects.forEach((project) => {
                let metrics = project.metrics || {};
                if (typeof metrics === 'string') {
                    try {
                        metrics = JSON.parse(metrics);
                    } catch (e) {
                        console.warn('Failed to parse metrics for', project.name, e);
                        metrics = {};
                    }
                }
                const current = metrics.current != null ? metrics.current : metrics;
                const lastMonth = metrics.last_month != null ? metrics.last_month : null;
                const typeLabel = (project.business_model || 'PROJECT').toUpperCase();
                const kpiKey = project.display_kpi_key;
                const kpiLabel = project.display_kpi_label;
                const primaryKey = kpiKey || pickPrimaryMetricKey(current, lastMonth, typeLabel.toLowerCase());
                const getVal = (obj) => {
                    if (!obj || !primaryKey) return null;
                    if (primaryKey === 'paid_members') return obj.paid_members != null ? obj.paid_members : obj.paid_member;
                    return obj[primaryKey];
                };
                let lastVal = getVal(lastMonth);
                let thisVal = getVal(current);
                // For channel-type projects, show total social followers if available
                if (typeLabel === 'CHANNEL' && (primaryKey === 'subscribers' || primaryKey === 'followers') && socialFollowersTotal > 0) {
                    thisVal = socialFollowersTotal;
                }

                let growthPct = null;
                if (lastVal != null && thisVal != null && typeof lastVal === 'number' && typeof thisVal === 'number') {
                    growthPct = lastVal !== 0 ? Math.round(((thisVal - lastVal) / lastVal) * 100) : (thisVal !== 0 ? 100 : 0);
                }
                const growthText = growthPct != null ? (growthPct > 0 ? '+' + growthPct + '%' : growthPct + '%') : '—';
                const growthClass = growthPct != null && growthPct < 0 ? ' negative' : '';
                const status = (project.status || 'active').toLowerCase();
                const statusBadgeHtml = status !== 'active' ? '<span class="project-card-status-badge project-card-status-' + status + '">' + status + '</span>' : '';
                const currentText = thisVal != null ? formatMetricValue(primaryKey, thisVal) : '—';
                const lastText = lastVal != null ? formatMetricValue(primaryKey, lastVal) : '—';
                const y0 = lastVal != null && thisVal != null ? (lastVal <= thisVal ? 28 : 8) : 18;
                const y1 = lastVal != null && thisVal != null ? (lastVal <= thisVal ? 8 : 28) : 18;
                const updatedText = project.last_updated ? 'Updated: ' + new Date(project.last_updated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Updated: —';

                const card = document.createElement('div');
                card.className = 'projection-card project-card';
                card.setAttribute('data-project-type', typeLabel.toLowerCase());
                if (project.id != null) card.setAttribute('data-project-id', project.id);
                card.title = 'Click for revenue projections';
                card.innerHTML = '<div class="projection-card-type">' + escHtml(typeLabel) + '</div>'
                    + '<div class="projection-card-name">' + escHtml(project.name) + '</div>'
                    + '<div class="projection-card-metrics"><div class="projection-metric projection-metric-dashboard">'
                    + '<span class="projection-metric-current' + (thisVal != null ? ' has-value' : '') + '">' + currentText + '</span>'
                    + '<span class="projection-metric-last">' + lastText + '</span>'
                    + '</div><div class="projection-metric-label">' + escHtml(kpiLabel || primaryKey || '—') + '</div></div>'
                    + '<div class="projection-mini-chart"><svg viewBox="0 0 100 30" preserveAspectRatio="none">'
                    + '<polyline points="0,' + y0 + ' 100,' + y1 + '" fill="none" stroke="currentColor" stroke-width="2"/></svg></div>'
                    + '<div class="projection-card-footer">' + statusBadgeHtml
                    + '<span class="projection-effort projection-card-updated">' + updatedText + '</span>'
                    + '<span class="projection-growth' + growthClass + '">' + growthText + '</span></div>';
                gridEl.appendChild(card);
            });
    } catch (err) {
        console.warn('Dashboard project cards failed', err);
    }

    // --- Upcoming ---
    try {
            const upcomingResponse = await fetch('/api/upcoming');
            const upcoming = await upcomingResponse.json();
            
            const upcomingContainer = document.getElementById('upcomingContainer');
            if (upcomingContainer && upcoming.length > 0) {
                upcomingContainer.innerHTML = upcoming.slice(0, 3).map(item => {
                    const dueDate = new Date(item.due_date);
                    const now = new Date();
                    const diffDays = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
                    
                    let dateDisplay = '';
                    if (diffDays === 0) {
                        dateDisplay = `Today ${dueDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
                    } else if (diffDays === 1) {
                        dateDisplay = `Tomorrow ${dueDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
                    } else {
                        dateDisplay = `${dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} • ${diffDays} days`;
                    }
                    
                    return `
                        <div class="email-item">
                            <div class="email-subject">${item.title}</div>
                            <div class="email-from">${dateDisplay}${item.description ? ` • ${item.description}` : ''}</div>
                        </div>
                    `;
                }).join('');
            }
    } catch (e) {
        console.warn('Upcoming failed', e);
    }
}

// Expose for refresh button (before any code that might throw)
window.loadSocialsData = loadSocialsData;

function formatNumber(num) {
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'k';
    }
    return num.toString();
}

function timeAgo(date) {
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    const days = Math.floor(hrs / 24);
    return days + 'd ago';
}

function pickPrimaryMetricKey(current, lastMonth, projectType) {
    const obj = current || lastMonth || {};
    const keys = Object.keys(obj).filter(k => k !== 'current' && k !== 'last_month' && obj[k] != null);
    if (!keys.length) return null;
    if (projectType === 'channel') {
        if (keys.includes('subscribers')) return 'subscribers';
        if (keys.includes('followers')) return 'followers';
        if (keys.includes('api_calls')) return 'api_calls';
    }
    if (projectType === 'business') {
        if (keys.includes('sales')) return 'sales';
        if (keys.includes('subscribers')) return 'subscribers';
        if (keys.includes('mrr')) return 'mrr';
    }
    if (projectType === 'saas') {
        if (keys.includes('paid_members')) return 'paid_members';
        if (keys.includes('paid_member')) return 'paid_member';
        if (keys.includes('mrr')) return 'mrr';
        if (keys.includes('users')) return 'users';
    }
    if (projectType === 'freelance') {
        if (keys.includes('revenue')) return 'revenue';
        if (keys.includes('reach')) return 'reach';
    }
    if (keys.includes('sales')) return 'sales';
    if (keys.includes('paid_members')) return 'paid_members';
    if (keys.includes('paid_member')) return 'paid_member';
    if (keys.includes('mrr')) return 'mrr';
    if (keys.includes('subscribers')) return 'subscribers';
    if (keys.includes('followers')) return 'followers';
    if (keys.includes('users')) return 'users';
    if (keys.includes('revenue')) return 'revenue';
    return keys[0] || null;
}

function formatMetricLabel(key, projectType) {
    if (projectType === 'channel' && key === 'followers') return 'Subscribers';
    const labels = { mrr: 'MRR', users: 'Users', revenue: 'Revenue', subscribers: 'Subscribers', reach: 'Reach', api_calls: 'API Calls', followers: 'Followers', sales: 'Sales', paid_members: 'Paid member', paid_member: 'Paid member' };
    return labels[key] || (key && key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ')) || '—';
}

function formatMetricValue(key, value) {
    if (typeof value !== 'number') return String(value);
    if (key === 'mrr' || key === 'revenue' || key === 'sales') return '$' + (value >= 1000 ? (value / 1000).toFixed(1) + 'k' : value.toFixed(0));
    if (key === 'followers' || key === 'reach' || key === 'api_calls' || key === 'subscribers') return (value >= 1000 ? (value / 1000).toFixed(1) : value) + 'K';
    if (key === 'paid_members' || key === 'paid_member') return value >= 1000 ? (value / 1000).toFixed(1) + 'k' : value.toString();
    if (value >= 1000) return (value / 1000).toFixed(1) + 'k';
    return value.toString();
}

// Initialize health alert on page load
updateHealthAlert();

// Connect WHOOP button: full-page navigation to OAuth (works even before status loads)
document.getElementById('whoopConnectLink')?.addEventListener('click', function() {
    var base = window.location.origin || 'http://localhost:3001';
    if (base === 'null' || !base) base = 'http://localhost:3001';
    window.location.href = base + '/api/health/whoop/connect';
});

// Refresh GitHub contribution graph with daily cache-busting (reads username from config)
async function refreshGitHubGraph() {
    const graphImg = document.getElementById('githubContributionGraph');
    if (!graphImg) return;

    try {
        const userConfig = await fetch('/api/config/user').then(r => r.json());
        const username = userConfig.github_username;
        if (!username) {
            graphImg.style.display = 'none';
            return;
        }
        graphImg.style.display = '';
        graphImg.src = `https://ghchart.rshah.org/203EAE/${username}?t=${Date.now()}`;
    } catch (e) {
        console.warn('GitHub graph: config fetch failed', e);
    }
}

// Social numbers are set in HTML and not overwritten by JS (so they stay correct).
function updateSocialNumbers() { /* no-op: keep HTML values */ }

// ═══════════════════════════════════════════════════════════════════
// DYNAMIC PROJECT TABS — one tab per project in the tab bar
// ═══════════════════════════════════════════════════════════════════
function renderProjectTabs(projects) {
    const slot = document.getElementById('projectTabsSlot');
    if (!slot) return;
    // Clear previous project tabs
    slot.innerHTML = '';
    if (!Array.isArray(projects) || projects.length === 0) return;
    // Sort by priority_rank
    const sorted = [...projects].sort((a, b) => (a.priority_rank || 99) - (b.priority_rank || 99));
    sorted.forEach(project => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tab-bar-tab tab-bar-tab-project';
        btn.dataset.tab = 'project-' + project.id;
        btn.textContent = project.short_name || project.name || 'Project';
        btn.title = project.name || 'Project';
        slot.appendChild(btn);
    });
}

// ═══════════════════════════════════════════════════════════════════
// HOME PANEL — unified overview data loader
// ═══════════════════════════════════════════════════════════════════
let homeInitialised = false;

async function loadHomeData() {
    const base = location.origin;
    const fmt = (v) => (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(v));

    // ── Pulse Strip: date ──
    const now = new Date();
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const dateEl = document.getElementById('pulseDate');
    const dayEl = document.getElementById('pulseDay');
    if (dateEl) dateEl.textContent = months[now.getMonth()] + ' ' + now.getDate();
    if (dayEl) dayEl.textContent = days[now.getDay()];

    // ── Greeting ──
    const hour = now.getHours();
    const greetingEl = document.getElementById('dashGreeting');
    const subEl = document.getElementById('dashGreetingSub');
    if (greetingEl) {
        if (hour < 12) greetingEl.textContent = 'Good morning.';
        else if (hour < 17) greetingEl.textContent = 'Good afternoon.';
        else greetingEl.textContent = 'Good evening.';
    }

    // ── Background Whoop sync (fire-and-forget — keeps recovery data fresh) ──
    fetch(base + '/api/health/whoop/sync?days=2', { method: 'POST' }).catch(() => {});

    // ── Pulse Strip: recovery, unread, meetings, blocker (single API call) ──
    try {
        const pulseRes = await fetch(base + '/api/home/pulse');
        const pulse = await pulseRes.json();
        const recoveryEl = document.getElementById('pulseRecoveryText');
        const recoveryChip = document.getElementById('pulseRecovery');
        if (pulse.recovery != null && recoveryEl) {
            recoveryEl.textContent = 'Recovery ' + pulse.recovery + '%';
            if (recoveryChip) recoveryChip.className = 'pulse-chip ' + (pulse.recovery >= 66 ? 'pulse-chip-good' : pulse.recovery >= 33 ? 'pulse-chip-warn' : 'pulse-chip-warn');
        }
        const unreadEl = document.getElementById('pulseUnreadText');
        const unreadChip = document.getElementById('pulseUnread');
        if (unreadEl) unreadEl.textContent = (pulse.unread || 0) + ' unread';
        if (unreadChip) unreadChip.className = 'pulse-chip ' + (pulse.unread > 0 ? 'pulse-chip-warn' : 'pulse-chip-neutral');
        const dashCount = document.getElementById('dashInboxCount');
        if (dashCount) dashCount.textContent = pulse.unread > 0 ? pulse.unread : '';
        const meetEl = document.getElementById('pulseMeetingsText');
        const meetChip = document.getElementById('pulseMeetings');
        if (pulse.meetings > 0) {
            if (meetEl) meetEl.textContent = pulse.meetings + ' meeting' + (pulse.meetings > 1 ? 's' : '');
            if (meetChip) meetChip.style.display = '';
        } else if (meetChip) { meetChip.style.display = 'none'; }
        const blockerEl = document.getElementById('pulseBlockerText');
        const blockerChip = document.getElementById('pulseBlocker');
        if (pulse.blocker) {
            if (blockerEl) blockerEl.textContent = pulse.blocker;
            if (blockerChip) blockerChip.style.display = '';
        } else if (blockerChip) { blockerChip.style.display = 'none'; }
    } catch (e) { /* pulse endpoint not available, fall back silently */ }

    // ── Sidebar: Important Messages (high urgency from inbox) ──
    try {
        const imRes = await fetch(base + '/api/messages/tiered?');
        const { urgent, medium } = await imRes.json();
        const important = [...(urgent || []), ...(medium || [])].slice(0, 5);
        const listEl = document.getElementById('sidebarEmailsList');
        const countEl = document.getElementById('sidebarEmailsCount');
        if (countEl) countEl.textContent = important.length > 0 ? '(' + important.length + ')' : '';
        if (listEl) {
            if (important.length === 0) {
                listEl.innerHTML = '<div class="email-item" style="color:var(--text-dim);font-size:12px;">No important messages</div>';
            } else {
                const escH = (s) => s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
                listEl.innerHTML = important.map(m => {
                    const date = m.received_at ? new Date(m.received_at) : null;
                    const ago = date ? timeAgo(date) : '';
                    const icon = m.source === 'whatsapp' ? '\ud83d\udcac' : '\u2709';
                    const urgCls = (m.urgency_score || 3) >= 4 ? ' email-urgent' : '';
                    const text = escH(m.subject || m.preview || m.ai_summary || '').slice(0, 60);
                    return '<div class="email-item">' +
                        '<div class="email-subject' + urgCls + '">' + text + '</div>' +
                        '<div class="email-from">' + icon + ' ' + escH(m.sender_name || m.sender_address || 'Unknown') + (ago ? ' \u2022 ' + ago : '') + '</div>' +
                        '</div>';
                }).join('');
            }
        }
    } catch (e) { console.warn('Sidebar emails failed', e); }

    // ── Sidebar: Trigger calendar sync for upcoming events ──
    fetch(base + '/api/upcoming/sync-calendar', { method: 'POST' }).catch(() => {});

    // ── Focus Card (scored task from derived state engine) ──
    try {
        const focusRes = await fetch(base + '/api/home/focus');
        const focus = await focusRes.json();
        const focusCard = document.getElementById('focusCard');
        if (focus && !focus.empty && focusCard) {
            focusCard.style.display = '';
            document.getElementById('focusTitle').textContent = focus.text || '';
            document.getElementById('focusDesc').textContent = focus.description || '';
            const meta = document.getElementById('focusMeta');
            const tags = [];
            if (focus.project_name) tags.push(focus.project_name);
            if (focus.override === 'calendar') tags.push('Calendar');
            if (focus.meta) tags.push(focus.meta);
            meta.innerHTML = tags.map(t => '<span class="focus-tag">' + t + '</span>').join('');
            if (subEl) subEl.textContent = focus.project_name ? 'Top task from ' + focus.project_name : 'Your next action';
        } else if (focusCard) {
            focusCard.style.display = 'none';
            if (subEl) subEl.textContent = 'No open tasks. Add milestones and tasks to your projects.';
        }
    } catch (e) { console.warn('Home: focus failed', e); }

    // ── Inbox: counts + feed ──
    try {
        const msgRes = await fetch(base + '/api/messages/grouped-by-context');
        const inboxGroups = await msgRes.json();
        // Store globally for tab filtering
        window._homeInboxGroups = inboxGroups;
        // Update tab counts
        const allCount = inboxGroups.reduce((s, g) => s + g.senders.length, 0);
        const workCount = inboxGroups.filter(g => g.type === 'business' || g.project_id).reduce((s, g) => s + g.senders.length, 0);
        const personalCount = inboxGroups.filter(g => g.type === 'personal' && !g.project_id).reduce((s, g) => s + g.senders.length, 0);
        const tabAll = document.getElementById('dashTabAll');
        const tabWork = document.getElementById('dashTabWork');
        const tabPersonal = document.getElementById('dashTabPersonal');
        if (tabAll) tabAll.textContent = allCount > 0 ? allCount : '';
        if (tabWork) tabWork.textContent = workCount > 0 ? workCount : '';
        if (tabPersonal) tabPersonal.textContent = personalCount > 0 ? personalCount : '';
        renderHomeInbox(inboxGroups, 'all');
    } catch (e) { renderHomeInbox([], 'all'); }

    // ── Project Cards (collapsed by default, expand on click) ──
    // Hide entire section if projects widget is disabled
    const projectSec = document.getElementById('dashProjectSection');
    if (projectSec && !isWidgetEnabled('projects')) {
        projectSec.style.display = 'none';
    }
    if (!isWidgetEnabled('projects')) { /* skip project loading */ } else try {
        const projRes = await fetch(base + '/api/home/projects-expanded');
        const projects = (await projRes.json()) || [];
        const grid = document.getElementById('dashProjectCards');
        const countEl = document.getElementById('dashProjectCount');
        if (countEl) countEl.textContent = projects.length > 0 ? projects.length : '';
        if (grid) {
            grid.innerHTML = '';
            projects.forEach(project => {
                const name = project.name || 'Project';
                const health = project.health_status || 'green';
                const healthClass = 'dash-project-health-' + health;
                const healthLabel = health.charAt(0).toUpperCase() + health.slice(1);
                const pct = project.progress_pct || 0;
                const phase = project.current_phase || '';
                const nextAction = project.next_action || '';
                const rank = project.priority_rank || 4;
                const blockerCount = (project.blockers || []).length;

                // Task list (hidden in collapsed state)
                let tasksHtml = '';
                if (project.tasks && project.tasks.length > 0) {
                    const taskItems = project.tasks.map(t => {
                        const done = t.status === 'done';
                        const blocker = t.is_blocker && !done;
                        const cls = (done ? ' dash-task-done' : '') + (blocker ? ' dash-task-blocker' : '');
                        return '<div class="dash-task-item' + cls + '">' +
                            '<span class="dash-task-check">' + (done ? '\u2713' : '\u25cb') + '</span>' +
                            '<span class="dash-task-text">' + t.text + '</span>' +
                            (t.due_date ? '<span class="dash-task-due">' + t.due_date + '</span>' : '') +
                        '</div>';
                    }).join('');
                    tasksHtml = '<div class="dash-project-tasks">' + taskItems;
                    if (project.more_tasks > 0) tasksHtml += '<div class="dash-task-more">and ' + project.more_tasks + ' more...</div>';
                    tasksHtml += '</div>';
                }

                // Horizon milestone
                let horizonHtml = '';
                if (project.horizon_milestone) {
                    horizonHtml = '<div class="dash-project-horizon">Next milestone: ' + project.horizon_milestone.name + ' <span class="dash-horizon-date">' + (project.horizon_milestone.target_date || project.horizon_milestone.phase) + '</span></div>';
                }

                // Blockers + dependency warnings
                let alertsHtml = '';
                if ((project.blockers && project.blockers.length > 0) || (project.dependency_warnings && project.dependency_warnings.length > 0)) {
                    alertsHtml = '<div class="dash-project-alerts">';
                    if (project.blockers) alertsHtml += project.blockers.map(b => '<div class="dash-project-blocker-item">\u26a0 ' + b + '</div>').join('');
                    if (project.dependency_warnings) alertsHtml += project.dependency_warnings.map(d => '<div class="dash-project-dep-warn">\u26d4 ' + d.upstream_name + ': ' + (d.dependency_description || 'blocked') + '</div>').join('');
                    alertsHtml += '</div>';
                }

                // Collapsed summary line
                const summaryParts = [];
                if (phase) summaryParts.push(phase.replace(/_/g, ' '));
                if (blockerCount > 0) summaryParts.push(blockerCount + ' blocker' + (blockerCount > 1 ? 's' : ''));
                if (nextAction) summaryParts.push(nextAction.length > 60 ? nextAction.slice(0, 57) + '...' : nextAction);
                const summaryText = summaryParts.join(' \u00b7 ');

                const card = document.createElement('div');
                card.className = 'dash-project-card dash-project-collapsed' + (health === 'red' ? ' dash-project-card-red' : health === 'yellow' ? ' dash-project-card-yellow' : '');
                card.dataset.projectId = project.id;
                card.innerHTML =
                    '<div class="dash-project-card-header">' +
                        '<span class="dash-project-card-toggle">\u25b6</span>' +
                        '<span class="dash-project-card-name">P' + rank + ': ' + name + '</span>' +
                        '<div class="dash-project-card-header-right">' +
                            '<div class="dash-project-progress-mini"><div class="dash-project-progress-fill" style="width:' + pct + '%"></div></div>' +
                            '<span class="dash-project-card-pct">' + pct + '%</span>' +
                            '<span class="dash-project-card-health ' + healthClass + '">' + healthLabel + '</span>' +
                            '<button class="dash-project-detail-btn" title="Open detail view">→</button>' +
                        '</div>' +
                    '</div>' +
                    '<div class="dash-project-summary">' + summaryText + '</div>' +
                    '<div class="dash-project-detail">' +
                        '<div class="dash-project-progress-wrap">' +
                            '<div class="dash-project-progress-bar"><div class="dash-project-progress-fill" style="width:' + pct + '%"></div></div>' +
                            '<span class="dash-project-progress-text">' + pct + '%' + (phase ? ' \u2022 ' + phase.replace(/_/g, ' ') : '') + '</span>' +
                        '</div>' +
                        (nextAction ? '<div class="dash-project-next-action">Next: ' + nextAction + '</div>' : '') +
                        tasksHtml + horizonHtml + alertsHtml +
                    '</div>';

                // Toggle expand/collapse on header click (but not if detail btn clicked)
                card.querySelector('.dash-project-card-header').addEventListener('click', (e) => {
                    if (e.target.closest('.dash-project-detail-btn')) return;
                    card.classList.toggle('dash-project-collapsed');
                    card.classList.toggle('dash-project-expanded');
                });

                // Detail button → switch to project's own tab
                const detailBtn = card.querySelector('.dash-project-detail-btn');
                if (detailBtn) {
                    detailBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (typeof window.showPanel === 'function') {
                            window.showPanel('project-' + project.id);
                        } else {
                            openProjectDetail(project.id);
                        }
                    });
                }

                grid.appendChild(card);
            });
        }
        // Render dynamic project tabs in the tab bar
        renderProjectTabs(projects);
    } catch (e) { console.warn('Home: projects-expanded failed', e); }

    // Generate project-specific PA quick chips from active projects
    try {
        const chipsContainer = document.getElementById('dashPaChips');
        const revenueChip = chipsContainer?.querySelector('[data-prompt*="revenue summary"]');
        // Remove any previously generated project chips
        chipsContainer?.querySelectorAll('.dash-pa-chip[data-dynamic]').forEach(c => c.remove());
        const projRes2 = await fetch(base + '/api/projects');
        const allProjects = await projRes2.json();
        const activeProjects = (Array.isArray(allProjects) ? allProjects : []).filter(p => p.status === 'active').slice(0, 3);
        activeProjects.forEach(p => {
            const chip = document.createElement('button');
            chip.className = 'dash-pa-chip';
            chip.setAttribute('data-dynamic', '1');
            chip.setAttribute('data-prompt', 'How is ' + p.name + ' progressing? What\'s the next critical step?');
            chip.textContent = p.name + ' status';
            if (revenueChip) chipsContainer.insertBefore(chip, revenueChip);
            else chipsContainer?.appendChild(chip);
        });
    } catch (e) { /* chips are non-critical */ }

    // Wire up event handlers once
    if (!homeInitialised) {
        homeInitialised = true;
        setupHomeHandlers();
    }
}

function renderHomeInbox(groups, filter) {
    const feed = document.getElementById('dashInboxFeed');
    const body = document.getElementById('dashInboxBody');
    const viewAll = document.getElementById('dashInboxViewAll');
    if (!feed) return;

    const sourceIcon = (s) => s === 'gmail' ? '\u2709' : s === 'outlook' ? '\ud83d\udce7' : s === 'whatsapp' ? '\ud83d\udcac' : '\ud83d\udce9';
    const ACTION_LABELS = { reply_needed: 'Reply', approval: 'Approve', payment: 'Payment', deadline: 'Deadline', meeting: 'Meeting', question: 'Question', fyi: 'FYI' };
    const escH = (s) => s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : '';

    // Filter groups based on tab
    let filtered = groups;
    if (filter === 'work') filtered = groups.filter(g => g.type === 'business' || g.project_id);
    else if (filter === 'personal') filtered = groups.filter(g => g.type === 'personal' && !g.project_id);

    // Flatten to check if empty
    const totalSenders = filtered.reduce((s, g) => s + g.senders.length, 0);
    if (body) body.style.display = '';
    if (!totalSenders) {
        if (viewAll) viewAll.style.display = 'none';
        feed.innerHTML = '<div style="color:var(--text-dim);padding:18px 0;text-align:center;font-size:13px;">No ' + (filter === 'all' ? '' : filter + ' ') + 'messages</div>';
        return;
    }
    if (viewAll) viewAll.style.display = '';
    feed.innerHTML = '';

    let count = 0;
    for (const group of filtered) {
        if (count >= 6) break;

        // Group header (project name or Personal/Work)
        const header = document.createElement('div');
        header.className = 'dash-inbox-group-header';
        header.textContent = group.name;
        feed.appendChild(header);

        for (const msg of group.senders) {
            if (count >= 6) break;
            const date = msg.latest_received_at || msg.received_at;
            const timeStr = date ? new Date(date).toLocaleString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
            const urgency = msg.urgency_score || 3;
            const actionLabel = ACTION_LABELS[msg.action_tag] || '';
            const actionClass = msg.action_tag ? ' action-' + msg.action_tag : '';

            const el = document.createElement('div');
            el.className = 'dash-inbox-item';
            el.dataset.source = msg.source;
            el.dataset.senderAddress = msg.sender_address || '';
            el.innerHTML =
                '<div class="dash-inbox-item-icon">' + sourceIcon(msg.source) + '</div>' +
                '<div class="dash-inbox-item-body">' +
                    '<div class="dash-inbox-item-top">' +
                        '<span class="dash-inbox-item-sender">' + escH(msg.sender_name || msg.sender_address || 'Unknown') + '</span>' +
                        (msg.msg_count > 1 ? '<span class="dash-inbox-item-count">' + msg.msg_count + '</span>' : '') +
                        (actionLabel ? '<span class="dash-inbox-action-badge' + actionClass + '">' + actionLabel + '</span>' : '') +
                        '<span class="dash-inbox-item-urgency dash-inbox-item-urgency-' + urgency + '">' + ({1:'FYI',2:'Low',3:'Med',4:'High',5:'Critical'})[urgency] + '</span>' +
                        '<span class="dash-inbox-item-time">' + timeStr + '</span>' +
                    '</div>' +
                    '<div class="dash-inbox-item-preview">' + escH(msg.latest_preview || '') + '</div>' +
                '</div>' +
                '<button class="dash-inbox-action-open" title="Open in inbox">Open</button>';
            feed.appendChild(el);
            count++;
        }
    }
}

function setupHomeHandlers() {
    // Inbox tabs (All / Work / Personal)
    document.getElementById('dashInboxTabs')?.addEventListener('click', function(e) {
        const tab = e.target.closest('.dash-inbox-tab');
        if (!tab) return;
        this.querySelectorAll('.dash-inbox-tab').forEach(b => b.classList.remove('active'));
        tab.classList.add('active');
        const filter = tab.dataset.filter;
        // Use cached groups if available, otherwise re-fetch
        if (window._homeInboxGroups) {
            renderHomeInbox(window._homeInboxGroups, filter);
        } else {
            fetch('/api/messages/grouped-by-context')
                .then(r => r.json())
                .then(groups => { window._homeInboxGroups = groups; renderHomeInbox(groups, filter); })
                .catch(() => renderHomeInbox([], filter));
        }
    });

    // "View all" link → switch to inbox tab
    document.getElementById('dashInboxViewAll')?.addEventListener('click', function() {
        if (typeof showPanel === 'function') showPanel('inbox');
    });

    // Home inbox: click card to expand conversation, click "Open" to go to inbox
    document.getElementById('dashInboxFeed')?.addEventListener('click', async function(e) {
        // "Open" button → navigate to inbox tab
        const openBtn = e.target.closest('.dash-inbox-action-open');
        if (openBtn) {
            e.stopPropagation();
            const item = openBtn.closest('.dash-inbox-item');
            if (item) {
                window._inboxScrollTo = {
                    source: item.dataset.source,
                    sender: item.dataset.senderAddress
                };
            }
            if (typeof showPanel === 'function') showPanel('inbox');
            return;
        }

        // Click card → toggle conversation expansion
        const item = e.target.closest('.dash-inbox-item');
        if (!item) return;
        const existing = item.nextElementSibling;
        if (existing && existing.classList.contains('dash-inbox-convo')) {
            existing.remove();
            return;
        }
        const source = item.dataset.source;
        const sender = item.dataset.senderAddress;
        if (!source || !sender) return;

        try {
            const params = new URLSearchParams({ source, sender_address: sender, limit: '8' });
            const res = await fetch('/api/messages/by-sender?' + params);
            const messages = await res.json();
            if (messages.length <= 1) return;

            const convo = document.createElement('div');
            convo.className = 'dash-inbox-convo';
            messages.slice(1).forEach(m => {
                const row = document.createElement('div');
                row.className = 'dash-inbox-convo-msg';
                const time = m.received_at ? new Date(m.received_at).toLocaleString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
                const text = m.preview || m.ai_summary || m.subject || '';
                row.innerHTML = '<span class="dash-inbox-convo-time">' + time + '</span>' +
                    '<span class="dash-inbox-convo-text">' + (text.length > 120 ? text.slice(0, 120) + '...' : text) + '</span>';
                convo.appendChild(row);
            });
            item.after(convo);
        } catch (err) { /* silent */ }
    });

    // Quick suggestion chips — click to fill + send
    document.getElementById('dashPaChips')?.addEventListener('click', function(e) {
        const chip = e.target.closest('.dash-pa-chip');
        if (!chip) return;
        const prompt = chip.dataset.prompt;
        if (prompt && typeof sendHomePAMessage === 'function') {
            sendHomePAMessage(prompt);
        }
    });

    // PA Chat bar
    const paInput = document.getElementById('dashPaInput');
    const paSend = document.getElementById('dashPaSend');
    const paResponse = document.getElementById('dashPaResponse');
    const paResponseText = document.getElementById('dashPaResponseText');
    const paClose = document.getElementById('dashPaClose');

    if (paInput) {
        paInput.addEventListener('input', function() {
            paSend.disabled = !this.value.trim();
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 80) + 'px';
        });
        paInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (this.value.trim()) sendHomePAMessage(this.value.trim());
            }
        });
    }
    if (paSend) paSend.addEventListener('click', function() {
        if (paInput && paInput.value.trim()) sendHomePAMessage(paInput.value.trim());
    });
    if (paClose) paClose.addEventListener('click', function() {
        if (paResponse) paResponse.classList.remove('active');
    });

    function escHtml(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    async function sendHomePAMessage(message) {
        if (!paInput || !paResponse || !paResponseText) return;
        paInput.value = '';
        paInput.style.height = 'auto';
        paSend.disabled = true;
        paResponse.classList.add('active');
        paResponseText.innerHTML = '<span class="pa-thinking">Thinking…</span>';
        try {
            const res = await fetch('/api/pa/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message })
            });
            const data = await res.json();
            const text = data.response || data.error || 'No response';

            // Strip COMMAND blocks from raw text BEFORE escaping
            // Claude sometimes wraps them in ``` code fences — remove those too
            let displayText = text
                .replace(/```[^\n]*\nCOMMAND:[\s\S]*?```/g, '')  // ``` fenced COMMAND blocks
                .replace(/^COMMAND:\s*\w+\s*\n\{[\s\S]*?\}/gm, '')  // bare COMMAND: ... {json}
                .replace(/^COMMAND:\s*\w+[^\n]*$/gm, '')            // any remaining COMMAND: lines
                .replace(/```\s*\n?\s*```/g, '')                     // leftover empty fences
                .replace(/\n{3,}/g, '\n\n')                          // collapse extra blank lines
                .trim();

            // Markdown-ish formatting
            let html = escHtml(displayText)
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\n/g, '<br>');

            paResponseText.innerHTML = html;

            // Render confirmation cards for pending send actions
            const pendingActions = data.pendingActions || [];
            if (pendingActions.length) {
                const wrap = document.createElement('div');
                wrap.className = 'pa-confirm-wrap';
                pendingActions.forEach((action, idx) => {
                    const p = action.params;
                    const card = document.createElement('div');
                    card.className = 'pa-confirm-card';

                    if (action.command === 'send_whatsapp') {
                        const toName   = p.recipient_name || p.recipient;
                        const labelBadge = p._label === 'vip' ? ' <span class="contact-tag" style="vertical-align:middle;font-size:10px;">⭐ VIP</span>' : '';
                        const typeBadge  = p._type ? ` <span class="contact-tag" style="vertical-align:middle;font-size:10px;">${escHtml(p._type)}</span>` : '';
                        card.innerHTML = `
                            <div class="pa-confirm-header">
                                <span class="pa-confirm-icon">💬</span>
                                WhatsApp → <strong>${escHtml(toName)}</strong>${labelBadge}${typeBadge}
                                <span style="font-size:10px;color:var(--text-dim);margin-left:6px;">${escHtml(p.recipient)}</span>
                            </div>
                            <div class="pa-confirm-body">${escHtml(p.message)}</div>
                            <div class="pa-confirm-actions">
                                <button class="pa-confirm-yes">Send</button>
                                <button class="pa-confirm-cancel">Cancel</button>
                            </div>`;
                    } else if (action.command === 'send_email') {
                        const toName   = p.recipient_name || p.to;
                        const labelBadge = p._label === 'vip' ? ' <span class="contact-tag" style="vertical-align:middle;font-size:10px;">⭐ VIP</span>' : '';
                        const preview = (p.body || '').slice(0, 200) + ((p.body || '').length > 200 ? '…' : '');
                        card.innerHTML = `
                            <div class="pa-confirm-header">
                                <span class="pa-confirm-icon">✉️</span>
                                Email → <strong>${escHtml(toName)}</strong>${labelBadge}
                                ${toName !== p.to ? `<span style="font-size:10px;color:var(--text-dim);margin-left:6px;">${escHtml(p.to)}</span>` : ''}
                            </div>
                            <div class="pa-confirm-subject" style="font-size:11px;color:var(--text-dim);margin:4px 0;">Subject: ${escHtml(p.subject || '')}</div>
                            <div class="pa-confirm-body">${escHtml(preview)}</div>
                            <div class="pa-confirm-actions">
                                <button class="pa-confirm-yes">Send</button>
                                <button class="pa-confirm-cancel">Cancel</button>
                            </div>`;
                    }

                    card.querySelector('.pa-confirm-yes')?.addEventListener('click', async function() {
                        this.disabled = true;
                        this.textContent = 'Sending…';
                        const payload = action.command === 'send_whatsapp'
                            ? { type: 'whatsapp', recipient: p.recipient, message: p.message }
                            : { type: 'email', recipient: p.to, subject: p.subject, message: p.body };
                        try {
                            const r = await fetch('/api/pa/send', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload)
                            });
                            const d = await r.json();
                            card.innerHTML = d.success
                                ? '<div class="pa-confirm-sent">✅ Sent</div>'
                                : `<div class="pa-confirm-error">❌ ${escHtml(d.error || 'Send failed')}</div>`;
                        } catch (e) {
                            card.innerHTML = `<div class="pa-confirm-error">❌ ${escHtml(e.message)}</div>`;
                        }
                    });

                    card.querySelector('.pa-confirm-cancel')?.addEventListener('click', function() {
                        card.innerHTML = '<div class="pa-confirm-cancelled">Cancelled</div>';
                    });

                    wrap.appendChild(card);
                });
                paResponseText.appendChild(wrap);
            }
        } catch (e) {
            paResponseText.textContent = 'Failed to reach PA. Is the server running?';
        }
    }
}

window.loadHomeData = loadHomeData;

// Load all dashboard data on page load
// Wait a bit to ensure all elements are rendered
setTimeout(() => {
    console.log('Initializing dashboard...');
    refreshGitHubGraph();
    updateSocialNumbers();
    // Load home panel (default) + dashboard data in parallel
    loadHomeData();
    loadSocialsData();
}, 100);

// Make loadSocialsData available globally for refresh
window.loadSocialsData = loadSocialsData;
window.refreshGitHubGraph = refreshGitHubGraph;

// Refresh GitHub graph daily (at midnight) and on page load
function scheduleGitHubRefresh() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0); // Midnight
    
    const msUntilMidnight = tomorrow.getTime() - now.getTime();
    
    // Refresh at midnight
    setTimeout(() => {
        refreshGitHubGraph();
        // Then refresh every 24 hours
        setInterval(refreshGitHubGraph, 24 * 60 * 60 * 1000);
    }, msUntilMidnight);
}

scheduleGitHubRefresh();

// Refresh data every 5 minutes
setInterval(() => { loadSocialsData(); loadHomeData(); }, 5 * 60 * 1000);

// Socials panel: click project card → open project detail
document.getElementById('panel-socials')?.addEventListener('click', function(e) {
    const card = e.target.closest('.project-card');
    if (!card) return;
    e.preventDefault();
    let projectId = card.getAttribute('data-project-id');
    if (!projectId) {
        const nameEl = card.querySelector('.projection-card-name') || card.querySelector('.project-card-name');
        const name = nameEl ? nameEl.textContent.trim() : '';
        if (name) {
            fetch('/api/projects').then(r => r.json()).then(projects => {
                const list = Array.isArray(projects) ? projects : [];
                const p = list.find(pr => pr && (pr.name || '').trim() === name);
                if (p && p.id != null) {
                    card.setAttribute('data-project-id', String(p.id));
                    if (typeof window.showPanel === 'function') window.showPanel('project-' + p.id);
                }
            }).catch(() => { if (typeof showToast === 'function') showToast('Could not load project', 'error'); });
            return;
        }
    }
    if (projectId) {
        if (typeof window.showPanel === 'function') window.showPanel('project-' + projectId);
    }
});

// Email clicks
document.querySelectorAll('.email-item').forEach(email => {
    email.addEventListener('click', function() {
        const subject = this.querySelector('.email-subject').textContent;
        console.log('Opening email:', subject);
    });
});

// Todo List functionality
let showAllCompleted = false;

function todoDueTag(dueDate) {
    if (!dueDate) return '';
    const today = new Date(); today.setHours(0,0,0,0);
    const due = new Date(dueDate + 'T00:00:00'); due.setHours(0,0,0,0);
    const diff = Math.round((due - today) / 86400000);
    let cls = 'todo-due';
    let label;
    if (diff < 0) { cls += ' todo-due-overdue'; label = Math.abs(diff) + 'd overdue'; }
    else if (diff === 0) { cls += ' todo-due-today'; label = 'today'; }
    else if (diff === 1) { cls += ' todo-due-soon'; label = 'tomorrow'; }
    else if (diff <= 3) { cls += ' todo-due-soon'; label = diff + 'd'; }
    else { label = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
    return '<span class="' + cls + '" data-due="' + dueDate + '" title="Due: ' + dueDate + '">' + label + '</span>';
}

async function loadTodos() {
    try {
        const url = showAllCompleted ? '/api/todos?showAll=true' : '/api/todos';
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('API ' + response.status);
        }
        const todos = await response.json();
        
        const todoList = document.querySelector('.todo-list');
        if (!todoList) return;
        
        // Separate undone and done todos
        const undoneTodos = todos.filter(t => !t.completed);
        const doneTodos = todos.filter(t => t.completed);
        
        // Build HTML: undone first, then done
        let html = '';
        
        // Undone todos (draggable; drag handle so checkbox still works)
        const dragHandleSvg = '<span class="todo-drag-handle" draggable="true" title="Drag to reorder"><svg width="10" height="10" viewBox="0 0 10 10"><circle cx="2" cy="2" r=".8" fill="currentColor"/><circle cx="5" cy="2" r=".8" fill="currentColor"/><circle cx="8" cy="2" r=".8" fill="currentColor"/><circle cx="2" cy="5" r=".8" fill="currentColor"/><circle cx="5" cy="5" r=".8" fill="currentColor"/><circle cx="8" cy="5" r=".8" fill="currentColor"/></svg></span>';
        undoneTodos.forEach(todo => {
            html += `
                <label class="todo-item todo-item-undone" data-id="${todo.id}">
                    ${dragHandleSvg}
                    <input type="checkbox" class="todo-checkbox" data-id="${todo.id}">
                    <span class="todo-text">${(todo.text || '').replace(/</g, '&lt;')}</span>
                    ${todoDueTag(todo.due_date)}
                </label>
            `;
        });
        
        // Add expandable done section if there are done todos
        if (doneTodos.length > 0) {
            html += '<div class="todo-separator"></div>';
            html += `
                <div class="todo-done-header">
                    <button class="todo-expand-btn" id="expandDoneBtn" title="Show completed tasks">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>
                    <span class="todo-done-label">Done today (${doneTodos.length})</span>
                </div>
                <div class="todo-done-list" id="todoDoneList" style="display: none;">
            `;
            
            doneTodos.forEach(todo => {
                const archivedClass = todo.archived ? 'todo-item-archived' : '';
                html += `
                    <label class="todo-item todo-item-done ${archivedClass}" data-id="${todo.id}">
                        <input type="checkbox" class="todo-checkbox" data-id="${todo.id}" checked>
                        <span class="todo-text">${(todo.text || '').replace(/</g, '&lt;')}</span>
                        ${todo.archived ? '<span class="todo-archived-badge">archived</span>' : ''}
                    </label>
                `;
            });
            
            html += '</div>';
        }
        
        todoList.innerHTML = html;
        
        updateTodoCount();
        initTodoDragDrop(todoList);
        initTodoCollapse(undoneTodos.length, doneTodos.length);
        
        // Initialize expand button
        const expandBtn = document.getElementById('expandDoneBtn');
        if (expandBtn) {
            expandBtn.addEventListener('click', () => {
                const doneList = document.getElementById('todoDoneList');
                if (doneList) {
                    const isHidden = doneList.style.display === 'none';
                    doneList.style.display = isHidden ? 'block' : 'none';
                    expandBtn.classList.toggle('expanded', isHidden);
                }
            });
        }
        
        // Add event listeners for checkboxes
        document.querySelectorAll('.todo-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', async function() {
                const id = this.dataset.id;
                const completed = this.checked;
                
                try {
                    const response = await fetch(`/api/todos/${id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ completed })
                    });
                    
                    if (response.ok) {
                        // Reload todos to get updated order
                        await loadTodos();
                    }
                } catch (error) {
                    console.error('Error updating todo:', error);
                    // Revert checkbox on error
                    this.checked = !completed;
                }
            });
        });
    } catch (error) {
        console.error('Error loading todos:', error);
        const todoList = document.querySelector('.todo-list');
        if (todoList && typeof showToast === 'function') {
            showToast('Couldn\'t load todos. Use http://localhost:3001 and start the server (npm start).', 'error');
        }
    }
}

function initTodoDragDrop(todoList) {
    if (!todoList) return;
    const handle = (e) => e.target.closest('.todo-drag-handle');
    todoList.addEventListener('dragstart', function(e) {
        const h = handle(e);
        if (!h) return;
        const item = h.closest('.todo-item');
        if (!item || !item.dataset.id) return;
        e.dataTransfer.setData('text/plain', item.dataset.id);
        e.dataTransfer.effectAllowed = 'move';
        item.classList.add('todo-dragging');
    });
    todoList.addEventListener('dragend', function(e) {
        const item = e.target.closest('.todo-item');
        if (item) item.classList.remove('todo-dragging');
    });
    todoList.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    });
    todoList.addEventListener('drop', async function(e) {
        e.preventDefault();
        const draggedId = e.dataTransfer.getData('text/plain');
        if (!draggedId) return;
        const targetItem = e.target.closest('.todo-item');
        if (!targetItem || targetItem.dataset.id === draggedId) return;
        const items = Array.from(todoList.querySelectorAll('.todo-item[data-id]'));
        const ids = items.map(el => el.dataset.id);
        const fromIdx = ids.indexOf(draggedId);
        const toIdx = ids.indexOf(targetItem.dataset.id);
        if (fromIdx === -1 || toIdx === -1) return;
        ids.splice(fromIdx, 1);
        ids.splice(toIdx, 0, draggedId);
        const moved = items[fromIdx];
        const toEl = items[toIdx];
        if (moved && toEl && moved !== toEl) {
            if (fromIdx < toIdx) toEl.parentNode.insertBefore(moved, toEl.nextSibling);
            else toEl.parentNode.insertBefore(moved, toEl);
        }
        try {
            const r = await fetch('/api/todos/reorder', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids })
            });
            if (!r.ok) await loadTodos();
        } catch (err) {
            await loadTodos();
        }
    });
}

const TODO_COLLAPSE_THRESHOLD = 5;
let todoListCollapsed = true;

function initTodoCollapse(undoneCount, doneCount) {
    const wrapper = document.getElementById('todoListWrapper');
    const btn = document.getElementById('todoCollapseBtn');
    const section = document.getElementById('todoSection');
    if (!wrapper || !btn || !section) return;
    const totalItems = undoneCount + doneCount;
    if (totalItems <= TODO_COLLAPSE_THRESHOLD) {
        btn.style.display = 'none';
        section.classList.remove('todo-section-collapsed');
        wrapper.style.maxHeight = '';
    } else {
        btn.style.display = 'block';
        section.classList.toggle('todo-section-collapsed', todoListCollapsed);
        wrapper.style.maxHeight = todoListCollapsed ? '14rem' : 'none';
        btn.textContent = todoListCollapsed ? `Show more (${totalItems} items)` : 'Show less';
        btn.onclick = function() {
            todoListCollapsed = !todoListCollapsed;
            section.classList.toggle('todo-section-collapsed', todoListCollapsed);
            wrapper.style.maxHeight = todoListCollapsed ? '14rem' : 'none';
            btn.textContent = todoListCollapsed ? `Show more (${totalItems} items)` : 'Show less';
        };
    }
}

function updateTodoCount() {
    const checkboxes = document.querySelectorAll('.todo-checkbox');
    const checked = document.querySelectorAll('.todo-checkbox:checked').length;
    const undone = checkboxes.length - checked;
    const countEl = document.getElementById('todoCount');
    if (countEl) {
        // Show undone count / total count (excluding archived)
        countEl.textContent = `${undone}/${checkboxes.length}`;
    }
}

// Load todos when DOM is ready and on page load (so API data always replaces static HTML)
function initTodos() {
    const todoList = document.querySelector('.todo-list');
    if (todoList) loadTodos();
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTodos);
} else {
    initTodos();
}

// Make loadTodos available globally for refresh
window.loadTodos = loadTodos;

// Fallback: load data again when window is fully loaded (in case first run failed)
window.addEventListener('load', function() {
    if (typeof window.loadTodos === 'function') window.loadTodos();
    if (typeof window.loadSocialsData === 'function') window.loadSocialsData();
    if (typeof window.refreshGitHubGraph === 'function') window.refreshGitHubGraph();
});

// TODO: Replace dummy posts with API fetch when ready
// async function loadScheduledPosts() {
//     // Fetch from https://soulin-social-bot.vercel.app/api/posts
//     // Display centerPost title for next 2 scheduled posts
// }

// ─────────────────────────────────────────────────────────────────────────────
// CONTACTS
// ─────────────────────────────────────────────────────────────────────────────
let contactsData = [];

async function loadContacts() {
    const q     = document.getElementById('contactSearch')?.value.trim() || '';
    const label = document.getElementById('contactFilterLabel')?.value || '';
    const type  = document.getElementById('contactFilterType')?.value  || '';

    let url = '/api/contacts?';
    if (q)     url += `q=${encodeURIComponent(q)}&`;
    if (label) url += `label=${encodeURIComponent(label)}&`;
    if (type)  url += `type=${encodeURIComponent(type)}&`;

    try {
        const data = await fetch(url).then(r => r.json());
        contactsData = Array.isArray(data) ? data : [];
        renderContacts(contactsData);
    } catch (e) {
        renderContacts([]);
    }
}

function renderContacts(contacts) {
    const list = document.getElementById('contactsList');
    if (!list) return;
    if (!contacts.length) {
        list.innerHTML = '<div class="contacts-empty">No contacts found.</div>';
        return;
    }
    list.innerHTML = contacts.map(c => {
        const initials = (c.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        const isVip     = c.label === 'vip';
        const isBlocked = c.label === 'blocked';
        const isIgnored = c.label === 'ignored';
        const labelIcon = isVip ? '⭐' : isBlocked ? '🚫' : isIgnored ? '👻' : '';
        const cardClass = `contact-card${isVip ? ' is-vip' : ''}${isBlocked ? ' is-blocked' : ''}${isIgnored ? ' is-ignored' : ''}`;
        const relLabel = c.relationship ? c.relationship.replace(/_/g, ' ') : '';
        const tags = [
            c.type ? `<span class="contact-tag">${c.type}</span>` : '',
            relLabel ? `<span class="contact-tag">${escHtml(relLabel)}</span>` : '',
            c.project_name ? `<span class="contact-tag project">${escHtml(c.project_name)}</span>` : '',
        ].join('');
        const reach = [
            c.email ? `<span>✉ <a href="mailto:${escHtml(c.email)}">${escHtml(c.email)}</a></span>` : '',
            c.phone ? `<span>📱 ${escHtml(c.phone)}</span>` : '',
            c.whatsapp_jid ? `<span>💬 ${escHtml(c.whatsapp_jid)}</span>` : '',
        ].filter(Boolean).join('');
        return `
        <div class="${cardClass}" data-id="${c.id}">
            <div class="contact-avatar ${c.type || 'personal'}">${initials}</div>
            <div class="contact-body">
                <div class="contact-name">
                    ${labelIcon ? `<span class="contact-label-icon">${labelIcon}</span>` : ''}
                    ${escHtml(c.name)}
                </div>
                ${tags ? `<div class="contact-tags">${tags}</div>` : ''}
                ${reach ? `<div class="contact-reach">${reach}</div>` : ''}
                ${c.notes ? `<div class="contact-notes">${escHtml(c.notes)}</div>` : ''}
            </div>
            <div class="contact-actions">
                ${!isVip && !isBlocked ? `<button class="contact-btn" data-action="promote" data-id="${c.id}" title="Mark VIP">⭐</button>` : ''}
                ${!isBlocked ? `<button class="contact-btn" data-action="block" data-id="${c.id}" title="Block">🚫</button>` : ''}
                ${isBlocked ? `<button class="contact-btn" data-action="demote" data-id="${c.id}" title="Unblock">Unblock</button>` : ''}
                <button class="contact-btn" data-action="edit" data-id="${c.id}">Edit</button>
                <button class="contact-btn danger" data-action="delete" data-id="${c.id}">×</button>
            </div>
        </div>`;
    }).join('');

    // Wire action buttons
    list.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = btn.dataset.id;
            if (btn.dataset.action === 'edit') {
                const c = contactsData.find(x => String(x.id) === String(id));
                if (c) openContactForm(c);
            } else if (btn.dataset.action === 'delete') {
                if (!confirm(`Delete ${contactsData.find(x=>String(x.id)===String(id))?.name}?`)) return;
                await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
                loadContacts();
            } else if (btn.dataset.action === 'promote') {
                await fetch(`/api/contacts/${id}/promote`, { method: 'POST' });
                loadContacts();
            } else if (btn.dataset.action === 'block') {
                if (!confirm(`Block ${contactsData.find(x=>String(x.id)===String(id))?.name}? Their messages will be hidden.`)) return;
                await fetch(`/api/contacts/${id}/block`, { method: 'POST' });
                loadContacts();
            } else if (btn.dataset.action === 'demote') {
                await fetch(`/api/contacts/${id}/demote`, { method: 'POST' });
                loadContacts();
            }
        });
    });
}

function openContactForm(contact = null) {
    const wrap = document.getElementById('contactFormWrap');
    if (!wrap) return;
    wrap.style.display = 'block';
    document.getElementById('contactFormTitle').textContent = contact ? 'Edit Contact' : 'New Contact';
    document.getElementById('contactFormId').value  = contact?.id || '';
    document.getElementById('cfName').value         = contact?.name || '';
    document.getElementById('cfEmail').value        = contact?.email || '';
    document.getElementById('cfPhone').value        = contact?.phone || '';
    document.getElementById('cfJid').value          = contact?.whatsapp_jid || '';
    document.getElementById('cfLabel').value        = contact?.label || 'regular';
    document.getElementById('cfType').value         = contact?.type || 'personal';
    document.getElementById('cfRelationship').value = contact?.relationship || '';
    document.getElementById('cfNotes').value        = contact?.notes || '';

    // Populate project dropdown
    fetch('/api/projects').then(r => r.json()).then(projects => {
        const sel = document.getElementById('cfProject');
        sel.innerHTML = '<option value="">None</option>';
        (Array.isArray(projects) ? projects : []).forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            if (contact?.project_id == p.id) opt.selected = true;
            sel.appendChild(opt);
        });
    }).catch(() => {});

    // Auto-fill JID from phone on blur
    document.getElementById('cfPhone').oninput = function() {
        const jid = document.getElementById('cfJid');
        if (!jid.value || jid.value.endsWith('@s.whatsapp.net')) {
            const num = this.value.replace(/[\s\-\+\(\)]/g, '');
            jid.value = num ? num + '@s.whatsapp.net' : '';
        }
    };

    wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeContactForm() {
    const wrap = document.getElementById('contactFormWrap');
    if (wrap) wrap.style.display = 'none';
}

async function saveContact() {
    const id   = document.getElementById('contactFormId').value;
    const body = {
        name:         document.getElementById('cfName').value.trim(),
        email:        document.getElementById('cfEmail').value.trim() || null,
        phone:        document.getElementById('cfPhone').value.trim() || null,
        whatsapp_jid: document.getElementById('cfJid').value.trim()  || null,
        label:        document.getElementById('cfLabel').value,
        type:         document.getElementById('cfType').value,
        project_id:   document.getElementById('cfProject').value || null,
        relationship: document.getElementById('cfRelationship').value.trim() || null,
        notes:        document.getElementById('cfNotes').value.trim() || null,
    };
    if (!body.name) { alert('Name is required'); return; }

    const url    = id ? `/api/contacts/${id}` : '/api/contacts';
    const method = id ? 'PATCH' : 'POST';
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    closeContactForm();
    loadContacts();
}

async function syncWhatsAppContacts() {
    const btn = document.getElementById('syncWaContactsBtn');
    if (btn) { btn.textContent = '⏳ Syncing…'; btn.disabled = true; }
    try {
        const r = await fetch('/api/contacts/sync-whatsapp', { method: 'POST' });
        const d = await r.json();
        if (d.error) throw new Error(d.error);
        if (btn) btn.textContent = `✅ +${d.added} added`;
        setTimeout(() => { if (btn) { btn.textContent = '💬 Sync WA'; btn.disabled = false; } }, 3000);
        loadContacts();
    } catch (e) {
        if (btn) { btn.textContent = '❌ Failed'; btn.disabled = false; }
        console.warn('WA sync failed:', e.message);
        setTimeout(() => { if (btn) { btn.textContent = '💬 Sync WA'; } }, 3000);
    }
}

function setupContactHandlers() {
    document.getElementById('addContactBtn')?.addEventListener('click', () => openContactForm());
    document.getElementById('contactFormCancel')?.addEventListener('click', closeContactForm);
    document.getElementById('contactFormSave')?.addEventListener('click', saveContact);
    document.getElementById('syncWaContactsBtn')?.addEventListener('click', syncWhatsAppContacts);

    let searchTimer;
    document.getElementById('contactSearch')?.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(loadContacts, 300);
    });
    document.getElementById('contactFilterLabel')?.addEventListener('change', loadContacts);
    document.getElementById('contactFilterType')?.addEventListener('change', loadContacts);
}

// Init contacts when tab is switched to
document.addEventListener('DOMContentLoaded', () => {
    setupContactHandlers();
});
window.__loadContacts = loadContacts; // called by app-tabs.js on tab switch

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT DETAIL PANEL
// ─────────────────────────────────────────────────────────────────────────────
let pdCurrentProject = null;       // full detail payload
let pdTaskFilter = 'open';         // current task filter
let pdDetailHandlersReady = false; // set up once, reuse across projects

/** Open the project detail panel for a given project ID.
 *  skipShowPanel: true when called from showPanel() itself (avoids recursion) */
function openProjectDetail(projectId, skipShowPanel) {
    if (!skipShowPanel && typeof window.showPanel === 'function') {
        // Navigate to the project's own tab (which triggers showPanel → openProjectDetail with skip)
        window.showPanel('project-' + projectId);
        return;
    }
    loadProjectDetail(projectId);
}

async function loadProjectDetail(projectId) {
    try {
        const data = await fetch('/api/projects/' + projectId + '/detail').then(r => r.json());
        if (data.error) { console.warn('Project detail error:', data.error); return; }
        pdCurrentProject = data;
        pdTaskFilter = 'open';
        renderProjectDetail(data);
        setupProjectDetailHandlers(); // one-time setup; uses pdCurrentProject at call time
    } catch (e) {
        console.warn('loadProjectDetail failed:', e);
    }
}

function renderProjectDetail(data) {
    const { project, tasks, milestones, dependencies } = data;
    if (!project) return;

    // ── Header ──
    const nameEl = document.getElementById('pdProjectName');
    const badgeEl = document.getElementById('pdHealthBadge');
    const pctEl = document.getElementById('pdProgressPct');
    const ringFill = document.getElementById('pdRingFill');

    if (nameEl) nameEl.textContent = 'P' + (project.priority_rank || '?') + ': ' + project.name;
    if (badgeEl) {
        const h = project.health_status || 'green';
        badgeEl.textContent = h.charAt(0).toUpperCase() + h.slice(1);
        badgeEl.className = 'pd-health-badge pd-health-' + h;
    }
    const pct = project.progress_pct || 0;
    if (pctEl) pctEl.textContent = pct + '%';
    if (ringFill) {
        // SVG circle circumference for r=15.9: ~99.9 ≈ 100
        ringFill.setAttribute('stroke-dasharray', pct + ' ' + (100 - pct));
    }

    // ── Next action ──
    const nextWrap = document.getElementById('pdNextActionWrap');
    const nextText = document.getElementById('pdNextText');
    const nextInput = document.getElementById('pdNextInput');
    if (nextText) nextText.textContent = project.next_action || '';
    if (nextInput) nextInput.value = project.next_action || '';
    if (nextWrap) nextWrap.classList.remove('editing');

    // ── Phase stepper ──
    const phasesWrap = document.getElementById('pdPhasesWrap');
    const stepper = document.getElementById('pdPhasesStepper');
    const phaseList = Array.isArray(project.phase_list) ? project.phase_list : [];
    if (stepper && phaseList.length > 0) {
        phasesWrap.style.display = 'block';
        const currentPhase = project.current_phase || phaseList[0];
        const currentIdx = phaseList.indexOf(currentPhase);
        stepper.innerHTML = phaseList.map((ph, i) => {
            const isDone    = i < currentIdx;
            const isCurrent = i === currentIdx;
            const cls = isDone ? 'done' : isCurrent ? 'current' : '';
            const connClass = i < currentIdx ? 'done' : '';
            const connector = i < phaseList.length - 1
                ? '<div class="pd-phase-connector ' + connClass + '"></div>'
                : '';
            const num = isDone ? '✓' : (i + 1);
            return '<div class="pd-phase-step ' + cls + '">' +
                '<div class="pd-phase-dot-wrap">' +
                    '<div class="pd-phase-dot">' + num + '</div>' +
                    '<div class="pd-phase-label">' + escHtml(ph.replace(/_/g,' ')) + '</div>' +
                '</div>' +
                connector +
            '</div>';
        }).join('');
    } else if (phasesWrap) {
        phasesWrap.style.display = 'none';
    }

    // ── Milestones ──
    renderMilestones(milestones, phaseList);

    // ── Tasks ──
    renderTasks(tasks, phaseList, pdTaskFilter);

    // ── Dependencies ──
    renderDependencies(dependencies);

    // ── Keywords ──
    renderProjectKeywords(project.id);

    // ── Stats strip ──
    renderStats(project);
}

function renderMilestones(milestones, phaseList) {
    const list = document.getElementById('pdMilestoneList');
    const sub  = document.getElementById('pdMilestoneProgress');
    const bar  = document.getElementById('pdMilestoneBarFill');

    // Populate phase select in add form
    const phSel = document.getElementById('pdMilestonePhase');
    if (phSel && phaseList.length > 0) {
        phSel.innerHTML = '<option value="">No phase</option>' +
            phaseList.map(p => '<option value="' + escHtml(p) + '">' + escHtml(p.replace(/_/g,' ')) + '</option>').join('');
    }

    if (!list) return;
    if (!milestones || !milestones.length) {
        list.innerHTML = '<div class="pd-empty">No milestones yet — click + Add</div>';
        if (sub) sub.textContent = '';
        if (bar) bar.style.width = '0%';
        return;
    }

    const totalWeight    = milestones.reduce((s, m) => s + (m.weight || 0), 0);
    const completeWeight = milestones.filter(m => m.status === 'complete' || m.status === 'done')
                                     .reduce((s, m) => s + (m.weight || 0), 0);
    const pct = totalWeight > 0 ? Math.round(completeWeight / totalWeight * 100) : 0;
    if (sub) sub.textContent = pct + '% · ' + milestones.filter(m => m.status === 'complete' || m.status === 'done').length + '/' + milestones.length + ' done';
    if (bar) bar.style.width = pct + '%';

    list.innerHTML = milestones.map(m => {
        const done = m.status === 'complete' || m.status === 'done';
        const meta = [
            m.weight ? '<span class="pd-milestone-weight">' + m.weight + 'pt</span>' : '',
            m.phase  ? '<span class="pd-milestone-phase-tag">' + escHtml(m.phase.replace(/_/g,' ')) + '</span>' : '',
            m.target_date ? '<span>' + m.target_date + '</span>' : '',
        ].filter(Boolean).join('');
        return '<div class="pd-milestone-item' + (done ? ' done' : '') + '" data-mid="' + m.id + '">' +
            '<div class="pd-milestone-cb" data-action="toggle-milestone" data-id="' + m.id + '" data-done="' + (done ? '1' : '0') + '"></div>' +
            '<div class="pd-milestone-body">' +
                '<div class="pd-milestone-name">' + escHtml(m.name) + '</div>' +
                (meta ? '<div class="pd-milestone-meta">' + meta + '</div>' : '') +
            '</div>' +
        '</div>';
    }).join('');
}

function renderTasks(tasks, phaseList, filter) {
    const list = document.getElementById('pdTaskList');

    // Populate phase select in add form
    const phSel = document.getElementById('pdTaskPhase');
    if (phSel && phaseList.length > 0) {
        phSel.innerHTML = '<option value="">Current phase</option>' +
            phaseList.map(p => '<option value="' + escHtml(p) + '">' + escHtml(p.replace(/_/g,' ')) + '</option>').join('');
    }

    if (!list) return;

    let filtered = tasks || [];
    if (filter === 'open')     filtered = filtered.filter(t => t.status !== 'done' && t.status !== 'cancelled');
    if (filter === 'blockers') filtered = filtered.filter(t => t.is_blocker && t.status !== 'done');
    if (filter === 'done')     filtered = filtered.filter(t => t.status === 'done');

    if (!filtered.length) {
        list.innerHTML = '<div class="pd-empty">' +
            (filter === 'done' ? 'No completed tasks yet.' : filter === 'blockers' ? 'No open blockers 🎉' : 'No open tasks.') +
        '</div>';
        return;
    }

    const energyEmoji = { high: '🔥', low: '🌱', medium: '⚡' };
    list.innerHTML = filtered.map(t => {
        const done    = t.status === 'done';
        const blocker = t.is_blocker && !done;
        const tags = [
            blocker                            ? '<span class="pd-task-tag pd-tag-blocker">🚫 blocker</span>'                               : '',
            t.energy_required && !done         ? '<span class="pd-task-tag pd-tag-energy-' + t.energy_required + '">' + (energyEmoji[t.energy_required]||'') + ' ' + t.energy_required + '</span>' : '',
            t.due_date && !done                ? '<span class="pd-task-tag pd-tag-due" data-due="' + t.due_date + '" data-task-id="' + t.id + '">due ' + t.due_date + '</span>' : '',
            t.project_phase && !done           ? '<span class="pd-task-tag pd-tag-phase">' + escHtml(t.project_phase.replace(/_/g,' ')) + '</span>' : '',
        ].filter(Boolean).join('');
        return '<div class="pd-task-item' + (done ? ' done' : '') + (blocker ? ' is-blocker' : '') + '" data-tid="' + t.id + '">' +
            '<div class="pd-task-cb" data-action="toggle-task" data-id="' + t.id + '" data-done="' + (done ? '1' : '0') + '"></div>' +
            '<div class="pd-task-body">' +
                '<div class="pd-task-text">' + escHtml(t.text) + '</div>' +
                (tags ? '<div class="pd-task-meta">' + tags + '</div>' : '') +
            '</div>' +
        '</div>';
    }).join('');
}

function renderDependencies(dependencies) {
    const section = document.getElementById('pdDepsSection');
    const upList  = document.getElementById('pdUpstreamList');
    const downList = document.getElementById('pdDownstreamList');

    const upstream   = (dependencies && dependencies.upstream)   || [];
    const downstream = (dependencies && dependencies.downstream) || [];

    if (!upstream.length && !downstream.length) {
        if (section) section.style.display = 'none';
        return;
    }
    if (section) section.style.display = 'grid';

    function depHtml(deps) {
        if (!deps.length) return '<div class="pd-deps-empty">None</div>';
        return deps.map(d => {
            const h = d.health_status || 'green';
            return '<div class="pd-dep-item' + (d.is_hard_block ? ' hard-block' : '') + '">' +
                '<span class="pd-dep-name">' + escHtml(d.name) + '</span>' +
                '<span class="pd-dep-health ' + h + '">' + h.toUpperCase() + '</span>' +
                (d.dependency_description ? '<span class="pd-dep-desc">' + escHtml(d.dependency_description) + '</span>' : '') +
            '</div>';
        }).join('');
    }

    if (upList)   upList.innerHTML   = depHtml(upstream);
    if (downList) downList.innerHTML = depHtml(downstream);
}

async function renderProjectKeywords(projectId) {
    const list = document.getElementById('pdKeywordList');
    if (!list) return;
    try {
        const keywords = await fetch('/api/project-keywords/' + projectId).then(r => r.json());
        if (!keywords.length) {
            list.innerHTML = '<div class="pd-empty">No keywords — messages won\'t auto-assign to this project</div>';
            return;
        }
        list.innerHTML = keywords.map(kw =>
            `<div class="pd-keyword-chip">
                <span class="pd-keyword-text">${escHtml(kw.keyword)}</span>
                <span class="pd-keyword-cat">${escHtml(kw.category)}</span>
                <span class="pd-keyword-boost">+${kw.boost}</span>
                <button class="pd-keyword-del" data-kw-id="${kw.id}" title="Remove">✕</button>
            </div>`
        ).join('');
    } catch (e) {
        list.innerHTML = '<div class="pd-empty">Failed to load keywords</div>';
    }
}

function renderStats(project) {
    const strip = document.getElementById('pdStatsStrip');
    if (!strip) return;

    const stats = [];
    if (project.timeline_start || project.timeline_end) {
        const start = project.timeline_start ? project.timeline_start.slice(0, 7) : '?';
        const end   = project.timeline_end   ? project.timeline_end.slice(0, 7)   : '?';
        stats.push({ label: 'Timeline', value: start + ' → ' + end });
    }
    if (project.hours_per_week) {
        stats.push({ label: 'hrs/week', value: project.hours_per_week + 'h' });
    }
    if (project.revenue_base) {
        stats.push({ label: 'Base rev', value: '$' + Number(project.revenue_base).toLocaleString(), cls: 'revenue' });
    }
    if (project.revenue_worst) {
        stats.push({ label: 'Worst', value: '$' + Number(project.revenue_worst).toLocaleString() });
    }
    if (project.revenue_lucky) {
        stats.push({ label: 'Lucky', value: '$' + Number(project.revenue_lucky).toLocaleString(), cls: 'revenue' });
    }
    if (project.budget_to_invest) {
        stats.push({ label: 'Budget', value: '$' + Number(project.budget_to_invest).toLocaleString() });
    }

    if (!stats.length) { strip.style.display = 'none'; return; }
    strip.style.display = 'flex';
    strip.innerHTML = stats.map(s =>
        '<div class="pd-stat">' +
            '<span class="pd-stat-label">' + s.label + '</span>' +
            '<span class="pd-stat-value' + (s.cls ? ' ' + s.cls : '') + '">' + s.value + '</span>' +
        '</div>'
    ).join('');
}

// ── Inline next-action editing ──
// (next-action edit handlers inlined in setupProjectDetailHandlers)

// ── Milestone toggle ──
async function toggleMilestone(milestoneId, currentlyDone) {
    const newStatus = currentlyDone ? 'pending' : 'complete';
    await fetch('/api/project-tasks/milestone/' + milestoneId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
    });
    if (pdCurrentProject) await loadProjectDetail(pdCurrentProject.project.id);
}

// ── Task toggle ──
async function toggleTask(taskId, currentlyDone) {
    const newStatus = currentlyDone ? 'open' : 'done';
    await fetch('/api/project-tasks/task/' + taskId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
    });
    if (pdCurrentProject) await loadProjectDetail(pdCurrentProject.project.id);
}

/**
 * One-time handler setup — uses pdCurrentProject at call time so it's
 * always correct even when switching between projects.
 */
function setupProjectDetailHandlers() {
    if (pdDetailHandlersReady) return;
    pdDetailHandlersReady = true;

    // ── Back button ──
    document.getElementById('pdBackBtn')?.addEventListener('click', () => {
        if (typeof window.showPanel === 'function') window.showPanel('home');
    });

    // ── Next action: click wrap to edit ──
    document.getElementById('pdNextActionWrap')?.addEventListener('click', function() {
        if (this.classList.contains('editing')) return;
        this.classList.add('editing');
        const input = document.getElementById('pdNextInput');
        if (input) { input.focus(); input.select(); }
    });
    document.getElementById('pdNextInput')?.addEventListener('blur', async function() {
        const wrap = document.getElementById('pdNextActionWrap');
        if (wrap) wrap.classList.remove('editing');
        const val = this.value.trim();
        const textEl = document.getElementById('pdNextText');
        if (textEl) textEl.textContent = val;
        if (pdCurrentProject) {
            await fetch('/api/projects/' + pdCurrentProject.project.id, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ next_action: val })
            });
        }
    });
    document.getElementById('pdNextInput')?.addEventListener('keydown', function(e) {
        if (e.key === 'Enter')  this.blur();
        if (e.key === 'Escape') {
            this.value = document.getElementById('pdNextText')?.textContent || '';
            this.blur();
        }
    });

    // ── Task filters ──
    document.getElementById('pdTaskFilters')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.pd-filter');
        if (!btn) return;
        document.querySelectorAll('#pdTaskFilters .pd-filter').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        pdTaskFilter = btn.dataset.filter;
        if (pdCurrentProject) {
            const phases = Array.isArray(pdCurrentProject.project.phase_list)
                ? pdCurrentProject.project.phase_list : [];
            renderTasks(pdCurrentProject.tasks, phases, pdTaskFilter);
        }
    });

    // ── Milestone checkbox toggle (delegated on container) ──
    document.getElementById('pdMilestoneList')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="toggle-milestone"]');
        if (btn) toggleMilestone(btn.dataset.id, btn.dataset.done === '1');
    });

    // ── Task checkbox toggle (delegated on container) ──
    document.getElementById('pdTaskList')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="toggle-task"]');
        if (btn) toggleTask(btn.dataset.id, btn.dataset.done === '1');

        // Click due date tag → inline date picker
        const dueTag = e.target.closest('.pd-tag-due');
        if (dueTag && dueTag.dataset.taskId) {
            e.preventDefault();
            e.stopPropagation();
            const taskId = dueTag.dataset.taskId;
            const picker = document.createElement('input');
            picker.type = 'date';
            picker.className = 'todo-date-input';
            picker.value = dueTag.dataset.due || '';
            dueTag.replaceWith(picker);
            picker.focus();
            picker.showPicker?.();
            const finish = async () => {
                const newDate = picker.value || null;
                try {
                    await fetch('/api/project-tasks/task/' + taskId, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ due_date: newDate })
                    });
                    if (pdCurrentProject) loadProjectDetail(pdCurrentProject.project.id);
                } catch (err) {
                    if (typeof showToast === 'function') showToast('Failed to update due date', 'error');
                }
            };
            picker.addEventListener('change', finish, { once: true });
            picker.addEventListener('blur', () => {
                setTimeout(() => { if (pdCurrentProject) loadProjectDetail(pdCurrentProject.project.id); }, 100);
            }, { once: true });
        }
    });

    // ── Add milestone form ──
    document.getElementById('pdAddMilestoneBtn')?.addEventListener('click', () => {
        const form = document.getElementById('pdAddMilestoneForm');
        if (!form) return;
        const isHidden = form.style.display === 'none' || !form.style.display;
        form.style.display = isHidden ? 'flex' : 'none';
        if (isHidden) document.getElementById('pdMilestoneName')?.focus();
    });
    document.getElementById('pdMilestoneCancel')?.addEventListener('click', () => {
        document.getElementById('pdAddMilestoneForm').style.display = 'none';
    });
    document.getElementById('pdMilestoneSave')?.addEventListener('click', async () => {
        if (!pdCurrentProject) return;
        const name   = document.getElementById('pdMilestoneName')?.value.trim();
        const weight = parseInt(document.getElementById('pdMilestoneWeight')?.value || '10', 10);
        const date   = document.getElementById('pdMilestoneDate')?.value || null;
        const phase  = document.getElementById('pdMilestonePhase')?.value || null;
        if (!name) return;
        await fetch('/api/project-tasks/' + pdCurrentProject.project.id + '/milestones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, weight, target_date: date, phase })
        });
        document.getElementById('pdMilestoneName').value = '';
        document.getElementById('pdAddMilestoneForm').style.display = 'none';
        loadProjectDetail(pdCurrentProject.project.id);
    });

    // ── Add task form ──
    document.getElementById('pdAddTaskBtn')?.addEventListener('click', () => {
        const form = document.getElementById('pdAddTaskForm');
        if (!form) return;
        const isHidden = form.style.display === 'none' || !form.style.display;
        form.style.display = isHidden ? 'flex' : 'none';
        if (isHidden) document.getElementById('pdTaskText')?.focus();
    });
    document.getElementById('pdTaskCancel')?.addEventListener('click', () => {
        document.getElementById('pdAddTaskForm').style.display = 'none';
    });
    document.getElementById('pdTaskSave')?.addEventListener('click', async () => {
        if (!pdCurrentProject) return;
        const text      = document.getElementById('pdTaskText')?.value.trim();
        const phase     = document.getElementById('pdTaskPhase')?.value || pdCurrentProject.project.current_phase || null;
        const energy    = document.getElementById('pdTaskEnergy')?.value || 'medium';
        const due       = document.getElementById('pdTaskDue')?.value || null;
        const isBlocker = document.getElementById('pdTaskIsBlocker')?.checked ? 1 : 0;
        if (!text) return;
        await fetch('/api/project-tasks/' + pdCurrentProject.project.id, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, project_phase: phase, energy_required: energy, due_date: due, is_blocker: isBlocker })
        });
        document.getElementById('pdTaskText').value = '';
        document.getElementById('pdAddTaskForm').style.display = 'none';
        loadProjectDetail(pdCurrentProject.project.id);
    });

    // ── Add keyword form ──
    document.getElementById('pdAddKeywordBtn')?.addEventListener('click', () => {
        const form = document.getElementById('pdAddKeywordForm');
        if (!form) return;
        const isHidden = form.style.display === 'none' || !form.style.display;
        form.style.display = isHidden ? 'flex' : 'none';
        if (isHidden) document.getElementById('pdKeywordText')?.focus();
    });
    document.getElementById('pdKeywordCancel')?.addEventListener('click', () => {
        document.getElementById('pdAddKeywordForm').style.display = 'none';
    });
    document.getElementById('pdKeywordSave')?.addEventListener('click', async () => {
        if (!pdCurrentProject) return;
        const keyword  = document.getElementById('pdKeywordText')?.value.trim();
        const category = document.getElementById('pdKeywordCategory')?.value || 'general';
        const boost    = parseInt(document.getElementById('pdKeywordBoost')?.value || '20', 10);
        if (!keyword) return;
        await fetch('/api/project-keywords/' + pdCurrentProject.project.id, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keyword, category, boost })
        });
        document.getElementById('pdKeywordText').value = '';
        document.getElementById('pdAddKeywordForm').style.display = 'none';
        renderProjectKeywords(pdCurrentProject.project.id);
    });

    // ── Delete keyword (delegated) ──
    document.getElementById('pdKeywordList')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('.pd-keyword-del');
        if (!btn) return;
        await fetch('/api/project-keywords/' + btn.dataset.kwId, { method: 'DELETE' });
        renderProjectKeywords(pdCurrentProject.project.id);
    });
}

// Expose globally
window.openProjectDetail = openProjectDetail;
window.loadProjectDetail = loadProjectDetail;
