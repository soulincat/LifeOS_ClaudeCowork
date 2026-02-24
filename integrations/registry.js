/**
 * Connector Registry
 * Discovers and manages enabled integration connectors.
 * Reads from config to know which connectors are enabled.
 * Lazy-loads connector modules on demand. Never crashes if one fails.
 */

const path = require('path');

class ConnectorRegistry {
    constructor() {
        this.connectors = new Map();
        this.loaded = false;
    }

    /**
     * Load all enabled connectors from config.
     * Call once at server startup.
     */
    loadEnabled() {
        if (this.loaded) return;
        this.loaded = true;

        let integrations;
        try {
            const config = require('../core/config');
            integrations = config.getIntegrations();
        } catch (e) {
            console.warn('Registry: could not load config:', e.message);
            return;
        }

        for (const [name, cfg] of Object.entries(integrations)) {
            if (!cfg || !cfg.enabled) continue;

            try {
                // Try to load the connector module
                const modulePath = this._resolveModulePath(name);
                const ConnectorModule = require(modulePath);

                // If it's a class (has prototype), instantiate it
                if (typeof ConnectorModule === 'function' && ConnectorModule.prototype) {
                    const instance = new ConnectorModule(cfg);
                    // Ensure the name is set
                    if (!instance.name) instance.name = name;
                    this.connectors.set(name, instance);
                } else if (typeof ConnectorModule === 'object') {
                    // Module exports an instance or plain object — wrap it
                    ConnectorModule.name = ConnectorModule.name || name;
                    ConnectorModule.config = cfg;
                    this.connectors.set(name, ConnectorModule);
                }
            } catch (e) {
                console.warn(`Registry: connector "${name}" failed to load:`, e.message);
            }
        }

        console.log(`Registry: ${this.connectors.size} connector(s) loaded: ${Array.from(this.connectors.keys()).join(', ')}`);
    }

    /**
     * Resolve the file path for a connector by name.
     */
    _resolveModulePath(name) {
        // Map config names to directory names
        const pathMap = {
            whoop: './whoop',
            stripe: './stripe',
            wise: './wise',
            github: './github',
            telegram: './telegram',
            gmail: './gmail',
            outlook: './outlook',
            apple_mail: './apple/mail',
            apple_calendar: './apple/calendar',
            apple_reminders: './apple/reminders',
            whatsapp: './whatsapp',
            soulinsocial: './soulinsocial',
        };
        return pathMap[name] || `./${name}`;
    }

    /** Get a loaded connector by name */
    get(name) {
        return this.connectors.get(name);
    }

    /** Check if a connector is loaded and enabled */
    isEnabled(name) {
        return this.connectors.has(name);
    }

    /** List all loaded connectors as [name, instance] pairs */
    list() {
        return Array.from(this.connectors.entries());
    }

    /**
     * Get status of all connectors (for setup/status page).
     * @returns {Array<{ name: string, connected: boolean, error?: string }>}
     */
    async statusAll() {
        const results = [];
        for (const [name, connector] of this.connectors) {
            try {
                if (typeof connector.checkStatus === 'function') {
                    const status = await connector.checkStatus();
                    results.push({ name, ...status });
                } else {
                    results.push({ name, connected: true });
                }
            } catch (e) {
                results.push({ name, connected: false, error: e.message });
            }
        }
        return results;
    }

    /**
     * Start background jobs for all connectors that support it.
     */
    async startBackgroundJobs() {
        for (const [name, connector] of this.connectors) {
            try {
                if (typeof connector.startBackground === 'function') {
                    await connector.startBackground();
                }
            } catch (e) {
                console.warn(`Registry: background start failed for "${name}":`, e.message);
            }
        }
    }
}

// Singleton
module.exports = new ConnectorRegistry();
