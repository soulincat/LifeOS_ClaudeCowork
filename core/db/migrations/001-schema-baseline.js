/**
 * Migration 001: Schema Baseline
 * This is a baseline migration that marks the current schema as established.
 * It doesn't create tables (those are created in database.js init),
 * but it ensures the migration tracking system starts cleanly.
 */

module.exports = {
    id: '001-schema-baseline',
    name: 'Establish baseline schema and migration tracking',

    up: (db) => {
        // Baseline doesn't need to do anything — tables are created in database.js init
        // This migration just marks that the baseline exists
        console.log('  Schema baseline established. All tables created in database.js init.');
    },

    down: (db) => {
        // Rollback not supported for baseline
        throw new Error('Cannot rollback baseline migration');
    }
};
