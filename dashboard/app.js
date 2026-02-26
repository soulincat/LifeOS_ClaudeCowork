// ── Widget config: controls which optional sections render ──────────────────
let _widgetConfig = null;

function normalizeWidgetConfig(raw) {
    if (raw && raw.tabs && raw.right_panel) return raw;
    // Migrate flat format → nested
    return {
        tabs: {
            socials: (raw.social !== false),
            goals: true,
            projections: (raw.projections !== false),
            wishlist: (raw.wishlist !== false),
        },
        right_panel: {
            finance: (raw.finance !== false),
            health: (raw.health !== false),
            code_activity: (raw.github_graph !== false),
            upcoming_events: false,
            project_tasks: false,
            urgent_inbox: false,
        }
    };
}

async function getWidgetConfig() {
    if (_widgetConfig) return _widgetConfig;
    try {
        const res = await fetch('/api/config/user');
        const user = await res.json();
        _widgetConfig = normalizeWidgetConfig(user.dashboard_widgets || {});
    } catch (e) { _widgetConfig = normalizeWidgetConfig({}); }
    return _widgetConfig;
}

function isWidgetEnabled(name) {
    if (!_widgetConfig) return true;
    // Check both tabs and right_panel
    if (_widgetConfig.tabs && _widgetConfig.tabs[name] !== undefined) return _widgetConfig.tabs[name] !== false;
    if (_widgetConfig.right_panel && _widgetConfig.right_panel[name] !== undefined) return _widgetConfig.right_panel[name] !== false;
    // Legacy flat check
    return _widgetConfig[name] !== false;
}

/**
 * Apply widget config — toggles tab/sub-tab visibility and right panel widgets.
 * Can be called with a config object (from Settings save) or without (uses cached).
 */
function applyWidgetConfig(cfg) {
    const c = cfg || _widgetConfig;
    if (!c) return;
    if (cfg) _widgetConfig = cfg; // update cache if explicitly provided

    const tabs = c.tabs || {};
    const rp = c.right_panel || {};

    // ── Tab visibility ──
    const tabMap = {
        socials:     { selector: '.tab-bar-tab[data-tab="socials"]' },
        goals:       { selector: '.more-sub-tab[data-section="goals"]' },
        projections: { selector: '.more-sub-tab[data-section="scenarios"]' },
        wishlist:    { selector: '.more-sub-tab[data-section="wishlist"]' },
    };
    for (const [key, { selector }] of Object.entries(tabMap)) {
        const el = document.querySelector(selector);
        if (el) el.style.display = tabs[key] === false ? 'none' : '';
    }

    // ── Right panel widget visibility ──
    const wpMap = {
        finance:          'financeSection',
        health:           'healthSection',
        code_activity:    'githubCalendarSection',
        upcoming_events:  'upcomingEventsWidget',
        project_tasks:    'projectTasksWidget',
        urgent_inbox:     'urgentInboxWidget',
    };
    for (const [key, elId] of Object.entries(wpMap)) {
        const el = document.getElementById(elId);
        if (!el) {
            // Try class-based lookup for github calendar
            if (key === 'code_activity') {
                const gh = document.querySelector('.github-calendar');
                if (gh) gh.style.display = rp[key] === false ? 'none' : '';
            }
            continue;
        }
        el.style.display = rp[key] === false ? 'none' : '';
    }

    // Load data for newly-enabled right panel widgets
    loadRightPanelWidgets(rp);
}

// Make applyWidgetConfig globally accessible for Settings save
window.applyWidgetConfig = applyWidgetConfig;

/**
 * Load data for enabled right panel widgets.
 */
async function loadRightPanelWidgets(rp) {
    if (!rp) return;

    if (rp.upcoming_events) {
        try {
            const res = await fetch('/api/home/upcoming-widget');
            const items = await res.json();
            const container = document.getElementById('upcomingEventsList');
            if (container) {
                container.innerHTML = items.length ? items.map(item => {
                    const time = item.due_date ? new Date(item.due_date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
                    return '<div class="widget-list-item"><span class="widget-item-time">' + time + '</span><span>' + escHtml(item.title) + '</span></div>';
                }).join('') : '<div class="widget-list-item dim">No upcoming events</div>';
            }
        } catch (e) { /* ignore */ }
    }

    if (rp.project_tasks) {
        try {
            const res = await fetch('/api/home/active-tasks-widget');
            const tasks = await res.json();
            const container = document.getElementById('projectTasksList');
            if (container) {
                container.innerHTML = tasks.length ? tasks.map(t => {
                    const proj = t.project_short_name || t.project_name || '';
                    const due = t.due_date ? t.due_date.slice(5, 10) : '';
                    return '<div class="widget-list-item">' +
                        (proj ? '<span class="widget-item-tag">' + escHtml(proj) + '</span>' : '') +
                        '<span>' + escHtml(t.text) + '</span>' +
                        (due ? '<span class="widget-item-time">' + due + '</span>' : '') +
                        '</div>';
                }).join('') : '<div class="widget-list-item dim">No active tasks</div>';
            }
        } catch (e) { /* ignore */ }
    }

    if (rp.urgent_inbox) {
        try {
            const res = await fetch('/api/home/urgent-widget');
            const items = await res.json();
            const container = document.getElementById('urgentInboxList');
            if (container) {
                container.innerHTML = items.length ? items.map(item => {
                    const sender = item.sender_name || item.sender_address || 'Unknown';
                    const preview = (item.subject || item.preview || '').slice(0, 60);
                    return '<div class="widget-list-item"><span class="widget-item-tag">' + escHtml(sender) + '</span><span>' + escHtml(preview) + '</span></div>';
                }).join('') : '<div class="widget-list-item dim">No urgent items</div>';
            }
        } catch (e) { /* ignore */ }
    }
}

// On load: fetch config and apply
(async function initWidgetConfig() {
    await getWidgetConfig();
    applyWidgetConfig(_widgetConfig);
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

// ── Health display: set values and WHOOP-style colors (green / yellow / red) ──
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

// ── Load socials/dashboard data (each section independent) ──────────────────
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
            financeMonthEl.textContent = currentMonthName();
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

    // --- Project cards (Socials tab grid) ---
    try {
            const projectsResponse = await fetch('/api/projects');
            const data = await projectsResponse.json();
            const projects = Array.isArray(data) ? data : [];

            const gridEl = document.getElementById('dashboardProjectsGrid');
            if (!gridEl) {
                // Grid removed from HTML; skip card rendering
            } else {
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
            }
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

// (exposed globally below in bootstrap section)

// ── Metric helpers ──────────────────────────────────────────────────────────
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

// ── GitHub contribution graph ───────────────────────────────────────────────
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
// EXTRACTED MODULES (loaded as separate <script> files)
// ═══════════════════════════════════════════════════════════════════

// MOVED TO home-ui.js — loadHomeData, renderHomeInbox, setupHomeHandlers
// MOVED TO todos-ui.js — todoDueTag, loadTodos, initTodoDragDrop, initTodoCollapse, updateTodoCount, initTodos
// MOVED TO contacts-ui.js — loadContacts, renderContacts, openContactForm, closeContactForm, saveContact, syncWhatsAppContacts, setupContactHandlers
// MOVED TO projects-ui.js — openProjectDetail, loadProjectDetail, renderProjectDetail, renderMilestones, renderTasks, renderDependencies, renderProjectKeywords, renderStats, toggleMilestone, toggleTask, setupProjectDetailHandlers

// ═══════════════════════════════════════════════════════════════════
// BOOTSTRAP — page load initialization
// ═══════════════════════════════════════════════════════════════════

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

// Make key functions available globally for refresh
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

// ── Event handlers: project card clicks, email clicks ───────────────────────

// Navigate to project detail when clicking project cards
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
                } else {
                    if (typeof showToast === 'function') showToast('Could not load project', 'error');
                }
            }).catch(() => { if (typeof showToast === 'function') showToast('Could not load project', 'error'); });
            return;
        }
    }
    if (projectId && typeof window.showPanel === 'function') window.showPanel('project-' + projectId);
});

// Email clicks
document.querySelectorAll('.email-item').forEach(email => {
    email.addEventListener('click', function() {
        const subject = this.querySelector('.email-subject').textContent;
        console.log('Opening email:', subject);
    });
});
