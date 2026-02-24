/**
 * Base class for all LifeOS integration connectors.
 * Each connector module should export a class that extends this.
 */
class Connector {
    /**
     * @param {string} name - Connector identifier (e.g. 'whoop', 'stripe')
     * @param {object} config - From integrations.json merged with env vars
     */
    constructor(name, config = {}) {
        this.name = name;
        this.config = config;
        this.connected = false;
        this.syncSchedule = null; // 'daily', 'weekly', or null (on-demand only)
    }

    /**
     * Check if this connector has valid credentials and can operate.
     * @returns {{ connected: boolean, error?: string }}
     */
    async checkStatus() {
        return { connected: false, error: 'Not implemented' };
    }

    /**
     * Pull data from the external service into LifeOS DB.
     * @param {object} options - Sync options (e.g. { days: 3 })
     * @returns {{ synced: number, errors: string[] }}
     */
    async sync(options = {}) {
        return { synced: 0, errors: ['Not implemented'] };
    }

    /**
     * Send data to the external service (e.g. send a message, create an event).
     * Not all connectors support this.
     * @param {object} payload
     * @returns {{ success: boolean, error?: string }}
     */
    async send(payload) {
        return { success: false, error: `Send not supported by ${this.name}` };
    }

    /**
     * Start any background jobs (polling, auto-sync intervals, etc.).
     * Called once after the connector is loaded and enabled.
     */
    async startBackground() {
        // Override in subclass if needed
    }

    /**
     * Clean up resources. Called on server shutdown or connector disable.
     */
    async disconnect() {
        this.connected = false;
    }

    /**
     * Return the env vars and config keys this connector needs.
     * Used by setup wizard to know what to ask for.
     */
    static getRequiredConfig() {
        return {
            env: [],      // e.g. ['WHOOP_CLIENT_ID', 'WHOOP_CLIENT_SECRET']
            settings: []  // e.g. ['calendar_names']
        };
    }
}

module.exports = Connector;
